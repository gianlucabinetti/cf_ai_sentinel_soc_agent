

import { Env, WorkflowParams, SecurityAssessment, isSecurityAssessment } from "./types";
import { SENTINEL_SYSTEM_PROMPT } from "./prompts";
import { SecurityMemory } from "./memory";

/**
 * Workflow Types
 * 
 * These types are defined manually because @cloudflare/workers-types doesn't export
 * WorkflowEntrypoint yet. This maintains strict type safety while using Cloudflare Workflows.
 */

export interface WorkflowEvent<Params = unknown> {
    payload: Params;
    timestamp: number;
}

export interface WorkflowStep {
    do<T>(name: string, callback: () => Promise<T>): Promise<T>;
    sleep(name: string, duration: number | Date): Promise<void>;
}

export abstract class WorkflowEntrypoint<E = unknown, P = unknown> {
    env: E;

    constructor(env: E) {
        this.env = env;
    }

    abstract run(event: WorkflowEvent<P>, step: WorkflowStep): Promise<unknown>;
}

/**
 * SentinelWorkflow
 * 
 * Architecture Note: Why Cloudflare Workflows for SOC Automation?
 * 1. **Durability**: Security analysis can be slow (e.g. large LLM inference). Workflows resist immediate timeouts.
 * 2. **Retries**: If the AI service blips, the workflow automatically retries just that step without losing state.
 * 3. **Observability**: Each step (Sanitization, Inference, Logging) is tracked independently.
 * 4. **Isolation**: Flaky external dependencies (logs, AI) don't crash the entire request processing pipeline.
 */
export class SentinelWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
    async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
        const { payload, cacheKey } = event.payload;

        // --- Step 1: Sanitization & Normalization ---
        // Deterministic step to ensure consistent analysis inputs.
        // Important for deduplication: " DROP TABLE " and "drop table" should result in the same analysis.
        const sanitizedPayload = await step.do("sanitize-payload", async () => {
            // Basic normalization: trim, lowercase, remove null bytes (common WAF bypass technique)
            // In a real SOC, this might also strip HTML tags or normalize Unicode.
            return payload.trim().toLowerCase().replace(/\0/g, "");
        });

        // --- Step 2: AI-Based Security Risk Inference ---
        // This step encapsulates the non-deterministic AI call.
        // By keeping it separate, we can retry JUST this part on 5xx errors from the AI API.
        const assessment = await step.do("ai-risk-inference", async () => {
            try {
                const response = await this.env.AI.run("@cf/meta/llama-3-8b-instruct" as any, {
                    messages: [
                        { role: "system", content: SENTINEL_SYSTEM_PROMPT },
                        { role: "user", content: sanitizedPayload },
                    ],
                    temperature: 0.1, // Low temp for identifying concrete threats (e.g. SQLi signatures)
                    max_tokens: 512,
                });

                // Defensive parsing of LLM output
                let resultText = "";
                if (typeof response === 'object' && response !== null && 'response' in response) {
                    resultText = (response as any).response;
                } else {
                    resultText = JSON.stringify(response);
                }

                // Force extract JSON object (Llama 8B sometimes adds chatty headers/footers)
                const jsonMatch = resultText.match(/\{[\s\S]*\}/);
                const jsonStr = jsonMatch ? jsonMatch[0] : resultText.replace(/```json/g, "").replace(/```/g, "").trim();

                let parsed: unknown;
                try {
                    parsed = JSON.parse(jsonStr);
                } catch (parseError) {
                    console.error("Failed to parse AI response as JSON:", jsonStr);
                    throw new Error("Invalid JSON from AI");
                }

                // Validate using type guard - REJECT if it doesn't match the interface
                if (!isSecurityAssessment(parsed)) {
                    console.error("AI response does not match SecurityAssessment interface:", parsed);
                    throw new Error("AI response validation failed");
                }

                // Add timestamp and return the validated assessment
                return {
                    ...parsed,
                    timestamp: new Date().toISOString(),
                } as SecurityAssessment;

            } catch (error) {
                // Fail-safe default: If AI is down or returns invalid data, assume HIGH RISK
                console.error("AI Inference failed:", error);
                return {
                    attackType: "System Failure",
                    confidence: "Low",
                    riskScore: 100,
                    explanation: error instanceof Error ? error.message : "AI Inference Service Unavailable",
                    impact: "Unable to assess threat level",
                    mitigation: "Manual review required",
                    action: "block", // Fail Closed
                    timestamp: new Date().toISOString()
                } as SecurityAssessment;
            }
        });

        // --- Step 3: Logging & Caching ---
        // Side-effects should be isolated so they don't block the return of the main result
        // or cause the workflow to fail after the expensive analysis is done.
        await step.do("log-and-cache", async () => {
            // Optimization: Don't cache system failures. We want to retry those.
            if (assessment.attackType !== "System Failure") {
                const memory = new SecurityMemory(this.env);
                await memory.storeAssessment(cacheKey, assessment);
                console.log(`[Sentinel] Cached ${cacheKey}`);
            } else {
                console.log(`[Sentinel] Skipped caching for System Failure: ${cacheKey}`);
            }

            // In production, you would also emit to extensive logging here (e.g. R2, Axiom, Datadog)
            console.log(`[Sentinel] Analyzed ${cacheKey} -> ${assessment.action} (${assessment.attackType})`);
        });

        return assessment;
    }
}
