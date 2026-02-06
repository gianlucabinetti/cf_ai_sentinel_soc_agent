

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
            }
        });

        // --- Step 4: SOC Alert Trigger ---
        // Trigger external SOC platform alerts for high-risk threats.
        // This step is isolated to prevent SOC webhook failures from blocking the workflow.
        await step.do("trigger-soc-alert", async () => {
            // Conditional logic: Only alert on block actions or high risk scores
            const shouldAlert = assessment.action === "block" || assessment.riskScore > 80;

            if (!shouldAlert) {
                console.log(`[Sentinel] No SOC alert needed for ${cacheKey} (action: ${assessment.action}, risk: ${assessment.riskScore})`);
                return;
            }

            // Check if SOC webhook is configured
            if (!this.env.SOC_WEBHOOK_URL) {
                console.log(`[Sentinel] SOC_WEBHOOK_URL not configured. Skipping alert for ${cacheKey}`);
                return;
            }

            try {
                // Determine alert severity based on risk score
                let severity: "critical" | "high" | "medium" = "high";
                if (assessment.riskScore >= 90) {
                    severity = "critical";
                } else if (assessment.riskScore >= 70) {
                    severity = "high";
                } else {
                    severity = "medium";
                }

                // Map severity to OCSF severity_id
                // OCSF Severity: 1=Informational, 2=Low, 3=Medium, 4=High, 5=Critical, 6=Fatal
                let severity_id = 4; // Default: High
                if (assessment.riskScore >= 95) {
                    severity_id = 5; // Critical
                } else if (assessment.riskScore >= 90) {
                    severity_id = 4; // High
                } else if (assessment.riskScore >= 70) {
                    severity_id = 3; // Medium
                } else {
                    severity_id = 2; // Low
                }

                // Construct OCSF-compliant Detection Finding payload
                // OCSF Schema: https://schema.ocsf.io/1.0.0/classes/detection_finding
                const alertPayload = {
                    // OCSF Core Fields
                    class_uid: 2004, // Detection Finding
                    class_name: "Detection Finding",
                    category_uid: 2, // Findings
                    category_name: "Findings",
                    activity_id: 1, // Create
                    activity_name: "Create",
                    severity_id,
                    severity: severity, // Human-readable: critical, high, medium
                    time: Date.now(),
                    
                    // Finding Information
                    finding_info: {
                        uid: `scan-${cacheKey}`,
                        title: `${assessment.attackType} Detected`,
                        desc: assessment.executive_summary, // Human-readable summary for analysts
                        types: [assessment.attackType],
                        created_time: new Date(assessment.timestamp).getTime(),
                        modified_time: Date.now(),
                    },
                    
                    // Detection Metadata
                    metadata: {
                        product: {
                            name: "Sentinel AI",
                            vendor_name: "Sentinel AI",
                            version: "1.0.0",
                        },
                        version: "1.0.0",
                    },
                    
                    // Observables (Attack Details)
                    observables: [
                        {
                            name: "attack_type",
                            type: "Other",
                            value: assessment.attackType,
                        },
                        {
                            name: "risk_score",
                            type: "Other",
                            value: assessment.riskScore.toString(),
                        },
                        {
                            name: "confidence",
                            type: "Other",
                            value: assessment.confidence,
                        },
                    ],
                    
                    // Remediation
                    remediation: {
                        desc: assessment.mitigation,
                        kb_articles: [],
                    },
                    
                    // Raw Data (for SIEM correlation)
                    raw_data: JSON.stringify({
                        cacheKey,
                        assessment: {
                            attackType: assessment.attackType,
                            confidence: assessment.confidence,
                            riskScore: assessment.riskScore,
                            action: assessment.action,
                            explanation: assessment.explanation,
                            impact: assessment.impact,
                            mitigation: assessment.mitigation,
                            executive_summary: assessment.executive_summary,
                        },
                        originalTimestamp: assessment.timestamp,
                    }),
                };

                // Prepare request headers
                const headers: Record<string, string> = {
                    "Content-Type": "application/json",
                    "User-Agent": "Sentinel-AI-Agent/1.0",
                };

                // Add authentication if SOC_API_KEY is configured
                if (this.env.SOC_API_KEY) {
                    headers["Authorization"] = `Bearer ${this.env.SOC_API_KEY}`;
                }

                // Send POST request to SOC webhook
                const response = await fetch(this.env.SOC_WEBHOOK_URL, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(alertPayload),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`[Sentinel] SOC webhook failed (${response.status}): ${errorText}`);
                    throw new Error(`SOC webhook returned ${response.status}`);
                }

                console.log(`[Sentinel] SOC alert triggered for ${cacheKey} (severity: ${severity})`);
            } catch (error) {
                // Non-blocking: Log error but don't fail the workflow
                // The assessment has already been cached and will be returned
                console.error(`[Sentinel] Failed to trigger SOC alert for ${cacheKey}:`, error);
                
                // In production, you might want to:
                // 1. Store failed alerts in a dead-letter queue (DLQ)
                // 2. Emit metrics to track webhook failure rates
                // 3. Send fallback notifications (e.g., email, Slack)
            }
        });

        // --- Step 5: Auto-Mitigation (IP Blocking) ---
        // Automatically block source IPs for critical threats using Cloudflare API.
        // This step is isolated to prevent API failures from blocking the workflow.
        await step.do("mitigate-threat", async () => {
            const { sourceIP } = event.payload;

            // Track all high-risk threats (riskScore > 70) in KV
            // Auto-block only critical threats (riskScore >= 95)
            const shouldTrack = assessment.riskScore > 70;
            const shouldBlock = assessment.riskScore >= 95;

            if (!shouldTrack) {
                return;
            }

            // Check if source IP is available
            if (!sourceIP) {
                console.log(`[Sentinel] No source IP provided. Skipping auto-mitigation for ${cacheKey}`);
                return;
            }

            // Calculate expiration time (1 hour from now)
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
            let ruleId: string | undefined = undefined;

            // Only auto-block critical threats (>= 95)
            if (shouldBlock) {
                // Check if Cloudflare API credentials are configured
                if (this.env.CLOUDFLARE_API_TOKEN && this.env.CLOUDFLARE_ZONE_ID) {
                    try {
                        // Construct Cloudflare API request for IP Access Rule
                        const apiUrl = `https://api.cloudflare.com/client/v4/zones/${this.env.CLOUDFLARE_ZONE_ID}/firewall/access_rules/rules`;
                        
                        const rulePayload = {
                            mode: "block",
                            configuration: {
                                target: "ip",
                                value: sourceIP
                            },
                            notes: `Auto-blocked by Sentinel AI | Attack: ${assessment.attackType} | Risk: ${assessment.riskScore} | Cache: ${cacheKey} | Expires: ${expiresAt}`,
                        };

                        // Send POST request to Cloudflare API
                        const response = await fetch(apiUrl, {
                            method: "POST",
                            headers: {
                                "Authorization": `Bearer ${this.env.CLOUDFLARE_API_TOKEN}`,
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify(rulePayload),
                        });

                        // Handle rate limiting (429) - let workflow retry with backoff
                        if (response.status === 429) {
                            const retryAfter = response.headers.get("Retry-After");
                            console.warn(`[Sentinel] Cloudflare API rate limit hit. Retry-After: ${retryAfter}s`);
                            throw new Error(`Rate limited by Cloudflare API (429). Retry after ${retryAfter}s`);
                        }

                        // Handle other errors
                        if (!response.ok) {
                            const errorBody = await response.text();
                            console.error(`[Sentinel] Cloudflare API error (${response.status}): ${errorBody}`);
                            throw new Error(`Cloudflare API returned ${response.status}: ${errorBody}`);
                        }

                        const result = await response.json();
                        ruleId = (result as any).result?.id;

                        console.log(`[Sentinel] Auto-mitigation: Blocked IP ${sourceIP} (Rule ID: ${ruleId}, Expires: ${expiresAt})`);

                    } catch (error) {
                        // Non-blocking: Log error but continue to store metadata
                        console.error(`[Sentinel] Failed to auto-block ${sourceIP}:`, error);

                        // If this is a rate limit error, re-throw to trigger workflow retry
                        if (error instanceof Error && error.message.includes("429")) {
                            throw error; // Workflow will retry with exponential backoff
                        }
                    }
                }
            }

            // Store mitigation metadata in KV for all high-risk threats (> 70)
            // This enables the UI to display all tracked threats, not just blocked ones
            try {
                const ruleMetadata = {
                    ruleId: ruleId || "tracked-only", // "tracked-only" for non-blocked threats
                    sourceIP,
                    attackType: assessment.attackType,
                    riskScore: assessment.riskScore,
                    createdAt: new Date().toISOString(),
                    expiresAt,
                };

                await this.env.SENTINEL_KV.put(
                    `mitigation:${sourceIP}`,
                    JSON.stringify(ruleMetadata),
                    { expirationTtl: 60 * 60 } // 1 hour TTL
                );

            } catch (error) {
                // Non-blocking: Log error but don't fail the workflow
                console.error(`[Sentinel] Failed to store mitigation metadata for ${sourceIP}:`, error);
                
                // In production, you might want to:
                // 1. Send fallback notification to SOC team
                // 2. Emit metrics for mitigation failure rate
                // 3. Store failed mitigation attempts for manual review
            }
        });

        return assessment;
    }
}
