
import { Env, isAnalyzeRequest, AnalyzeResponse, SecurityAssessment, isSecurityAssessment } from "./types";
import { SentinelWorkflow } from "./workflow";
import { SENTINEL_SYSTEM_PROMPT } from "./prompts";
import { SecurityMemory } from "./memory";

// Export workflow class for Cloudflare Runtime to discover it
export { SentinelWorkflow };

/**
 * Inline AI Analysis Helper
 * Runs synchronous threat analysis for IPS mode enforcement
 */
async function analyzeRequestInline(
    payload: string,
    env: Env
): Promise<SecurityAssessment> {
    try {
        // Sanitize payload
        const sanitizedPayload = payload.trim().toLowerCase().replace(/\0/g, "");

        // Run AI inference
        const response = await env.AI.run("@cf/meta/llama-3-8b-instruct" as any, {
            messages: [
                { role: "system", content: SENTINEL_SYSTEM_PROMPT },
                { role: "user", content: sanitizedPayload },
            ],
            temperature: 0.1,
            max_tokens: 512,
        });

        // Parse AI response
        let resultText = "";
        if (typeof response === 'object' && response !== null && 'response' in response) {
            resultText = (response as any).response;
        } else {
            resultText = JSON.stringify(response);
        }

        // Extract JSON from response
        const jsonMatch = resultText.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : resultText.replace(/```json/g, "").replace(/```/g, "").trim();

        let parsed: unknown;
        try {
            parsed = JSON.parse(jsonStr);
        } catch (parseError) {
            console.error("Failed to parse AI response as JSON:", jsonStr);
            throw new Error("Invalid JSON from AI");
        }

        // Validate response
        if (!isSecurityAssessment(parsed)) {
            console.error("AI response does not match SecurityAssessment interface:", parsed);
            throw new Error("AI response validation failed");
        }

        return {
            ...parsed,
            timestamp: new Date().toISOString(),
        } as SecurityAssessment;

    } catch (error) {
        // Fail-safe: Assume high risk on error
        console.error("AI Inference failed:", error);
        return {
            attackType: "System Failure",
            confidence: "Low",
            riskScore: 100,
            explanation: error instanceof Error ? error.message : "AI Inference Service Unavailable",
            impact: "Unable to assess threat level",
            mitigation: "Manual review required",
            action: "block",
            timestamp: new Date().toISOString(),
            executive_summary: "System failure during threat analysis"
        } as SecurityAssessment;
    }
}

export default {
    /**
     * Sentinel API Entrypoint
     * Handles incoming HTTP requests and triggers workflows.
     */
    async fetch(
        request: Request,
        env: Env,
        ctx: ExecutionContext
    ): Promise<Response> {
        // --- Handle Preflight (OPTIONS) at the very top ---
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                }
            });
        }

        const url = new URL(request.url);

        // --- Global CORS Headers ---
        // These must be present on EVERY response
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        // --- TRUE IPS MODE: Global Middleware Handler ---
        // Runs BEFORE specific API routes to analyze and block malicious requests
        // Excluded paths: /v1/analyze, /v1/mitigations, /health, / (root)
        const excludedPaths = ["/v1/analyze", "/v1/mitigations", "/health", "/"];
        const isExcluded = excludedPaths.includes(url.pathname);

        if (!isExcluded) {
            try {
                // Extract source IP
                const sourceIP = request.headers.get("CF-Connecting-IP") || 
                                request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
                                request.headers.get("X-Real-IP") ||
                                "unknown";

                // Extract payload from request
                let extractedPayload = "";

                // 1. Extract from body (POST/PUT/PATCH)
                if (["POST", "PUT", "PATCH"].includes(request.method)) {
                    try {
                        const clonedRequest = request.clone();
                        const contentType = request.headers.get("Content-Type") || "";
                        
                        if (contentType.includes("application/json")) {
                            const body = await clonedRequest.json();
                            extractedPayload += JSON.stringify(body) + " ";
                        } else if (contentType.includes("application/x-www-form-urlencoded")) {
                            const body = await clonedRequest.text();
                            extractedPayload += body + " ";
                        } else {
                            const body = await clonedRequest.text();
                            extractedPayload += body + " ";
                        }
                    } catch (e) {
                        // Body parsing failed, continue with other extractions
                    }
                }

                // 2. Extract from query parameters
                url.searchParams.forEach((value, key) => {
                    extractedPayload += `${key}=${value} `;
                });

                // 3. Extract from headers (User-Agent, Referer, Cookie)
                const suspiciousHeaders = ["User-Agent", "Referer", "Cookie", "X-Forwarded-For"];
                suspiciousHeaders.forEach(header => {
                    const value = request.headers.get(header);
                    if (value) {
                        extractedPayload += `${header}:${value} `;
                    }
                });

                // 4. Extract from path
                extractedPayload += `path:${url.pathname} `;

                // Skip analysis if no payload extracted
                if (extractedPayload.trim().length === 0) {
                    extractedPayload = `GET ${url.pathname}`;
                }

                // Generate cache key
                const encoder = new TextEncoder();
                const data = encoder.encode(extractedPayload + "-v2-salt");
                const hashBuffer = await crypto.subtle.digest("SHA-256", data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const cacheKey = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

                // Check cache first
                const memory = new SecurityMemory(env);
                let assessment = await memory.getAssessment(cacheKey);

                // If not cached, run AI analysis
                if (!assessment) {
                    assessment = await analyzeRequestInline(extractedPayload, env);
                    
                    // Cache the result (skip caching system failures)
                    if (assessment.attackType !== "System Failure") {
                        await memory.storeAssessment(cacheKey, assessment);
                    }
                }

                // ENFORCEMENT: Block if riskScore > 90
                if (assessment.riskScore > 90) {
                    console.log(`[IPS] BLOCKED ${sourceIP} - ${assessment.attackType} (Risk: ${assessment.riskScore})`);

                    // Write IP to KV with mitigation metadata
                    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
                    const ruleMetadata = {
                        ruleId: "ips-blocked",
                        sourceIP,
                        attackType: assessment.attackType,
                        riskScore: assessment.riskScore,
                        createdAt: new Date().toISOString(),
                        expiresAt,
                    };

                    await env.SENTINEL_KV.put(
                        `mitigation:${sourceIP}`,
                        JSON.stringify(ruleMetadata),
                        { expirationTtl: 60 * 60 }
                    );

                    // Return 403 Forbidden
                    return new Response(JSON.stringify({
                        error: "Forbidden",
                        message: "Request blocked by Sentinel AI IPS",
                        assessment: {
                            attackType: assessment.attackType,
                            riskScore: assessment.riskScore,
                            confidence: assessment.confidence,
                            explanation: assessment.explanation,
                        }
                    }), {
                        status: 403,
                        headers: { "Content-Type": "application/json", ...corsHeaders }
                    });
                }

                // PASS-THROUGH: Low risk, allow request
                console.log(`[IPS] ALLOWED ${sourceIP} - ${assessment.attackType} (Risk: ${assessment.riskScore})`);
                return new Response("Welcome to the Protected Origin", {
                    status: 200,
                    headers: { "Content-Type": "text/plain", ...corsHeaders }
                });

            } catch (error) {
                console.error("[IPS] Middleware error:", error);
                // On error, fail open (allow request) to avoid blocking legitimate traffic
                return new Response("Welcome to the Protected Origin", {
                    status: 200,
                    headers: { "Content-Type": "text/plain", ...corsHeaders }
                });
            }
        }

        // --- 2. Health Check ---
        if (request.method === "GET" && url.pathname === "/health") {
            return new Response(JSON.stringify({ status: "healthy" }), {
                headers: { "Content-Type": "application/json", ...corsHeaders },
            });
        }

        // --- 3. List Active Mitigations ---
        if (request.method === "GET" && url.pathname === "/v1/mitigations") {
            try {
                const mitigations: Array<{
                    sourceIP: string;
                    ruleId: string;
                    attackType: string;
                    riskScore: number;
                    createdAt: string;
                    expiresAt: string;
                    timeRemaining: string;
                }> = [];

                // List all mitigation metadata keys from KV
                let cursor: string | undefined = undefined;
                let listComplete = false;
                
                do {
                    const listResult: Awaited<ReturnType<typeof env.SENTINEL_KV.list>> = await env.SENTINEL_KV.list({
                        prefix: "mitigation:",
                        limit: 100, // Limit for UI display
                        cursor: cursor
                    });
                    
                    listComplete = listResult.list_complete;

                    for (const key of listResult.keys) {
                        const metadataStr = await env.SENTINEL_KV.get(key.name);
                        if (!metadataStr) continue;

                        try {
                            const metadata = JSON.parse(metadataStr) as {
                                ruleId: string;
                                sourceIP: string;
                                attackType: string;
                                riskScore: number;
                                createdAt: string;
                                expiresAt: string;
                            };

                            // Calculate time remaining
                            const expiresAt = new Date(metadata.expiresAt);
                            const now = new Date();
                            const minutesRemaining = Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / 1000 / 60));
                            
                            const timeRemaining = minutesRemaining > 60
                                ? `${Math.floor(minutesRemaining / 60)}h ${minutesRemaining % 60}m`
                                : `${minutesRemaining}m`;

                            mitigations.push({
                                sourceIP: metadata.sourceIP,
                                ruleId: metadata.ruleId,
                                attackType: metadata.attackType,
                                riskScore: metadata.riskScore,
                                createdAt: metadata.createdAt,
                                expiresAt: metadata.expiresAt,
                                timeRemaining
                            });
                        } catch (parseError) {
                            console.error(`Failed to parse mitigation metadata for ${key.name}:`, parseError);
                        }
                    }

                    cursor = listComplete ? undefined : (listResult as any).cursor;
                } while (!listComplete);

                // Sort by risk score (highest first)
                mitigations.sort((a, b) => b.riskScore - a.riskScore);

                return new Response(JSON.stringify({
                    success: true,
                    count: mitigations.length,
                    mitigations
                }), {
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                    status: 200
                });
            } catch (error) {
                console.error("Mitigations API Error:", error);
                const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
                return new Response(JSON.stringify({ error: errorMessage }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", ...corsHeaders }
                });
            }
        }

        // --- 4. Workflow Trigger ---
        if (request.method === "POST" && url.pathname === "/v1/analyze") {
            try {
                // Strict JSON parsing
                let body: unknown;
                try {
                    body = await request.json();
                } catch {
                    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
                }

                if (!isAnalyzeRequest(body)) {
                    return new Response("Invalid payload: 'payload' string is required.", { status: 400, headers: corsHeaders });
                }

                const { payload } = body;

                // Generate Cache Key (SHA-256)
                // CACHE BUSTER: Added "v2" salt to invalidate old "System Failure" entries
                const encoder = new TextEncoder();
                const data = encoder.encode(payload + "-v2-salt");
                const hashBuffer = await crypto.subtle.digest("SHA-256", data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const cacheKey = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");


                // Idempotency: Use cacheKey as Workflow Instance ID
                const workflowId = `scan-${cacheKey}`;

                // Check cache first (read-through pattern)
                const { SecurityMemory } = await import("./memory");
                const memory = new SecurityMemory(env);
                const cached = await memory.getAssessment(cacheKey);

                if (cached) {
                    // Cache hit - return immediately
                    return new Response(JSON.stringify({
                        status: "cached",
                        id: workflowId,
                        cacheKey,
                        assessment: cached
                    }), {
                        headers: {
                            "Content-Type": "application/json",
                            ...corsHeaders
                        },
                        status: 200,
                    });
                }

                // Extract source IP from request headers
                // Cloudflare provides the real client IP in CF-Connecting-IP header
                const sourceIP = request.headers.get("CF-Connecting-IP") || 
                                request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
                                request.headers.get("X-Real-IP") ||
                                undefined;

                // Cache miss - run workflow logic directly
                // Note: Without Workflows binding, we run synchronously
                const workflow = new SentinelWorkflow(env);
                const assessment = await workflow.run(
                    {
                        payload: { 
                            payload, 
                            cacheKey, 
                            timestamp: new Date().toISOString(),
                            sourceIP 
                        },
                        timestamp: Date.now()
                    },
                    {
                        do: async <T>(name: string, callback: () => Promise<T>): Promise<T> => {
                            console.log(`[Workflow Step] ${name}`);
                            return await callback();
                        },
                        sleep: async (name: string, duration: number | Date): Promise<void> => {
                            // No-op for now
                        }
                    }
                );

                const responseBody = {
                    status: "analyzed",
                    id: workflowId,
                    cacheKey,
                    assessment
                };

                return new Response(JSON.stringify(responseBody), {
                    headers: {
                        "Content-Type": "application/json",
                        ...corsHeaders
                    },
                    status: 200,
                });

            } catch (error) {
                console.error("API Error:", error);
                const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
                return new Response(JSON.stringify({ error: errorMessage }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", ...corsHeaders }
                });
            }
        }

        // --- 5. Root Path - API Status ---
        if (request.method === "GET" && url.pathname === "/") {
            return new Response("Sentinel API is Online", {
                status: 200,
                headers: { "Content-Type": "text/plain", ...corsHeaders }
            });
        }

        // --- 404 Default ---
        return new Response("Not Found", { status: 404, headers: corsHeaders });
    },

    /**
     * Scheduled Handler (Cron Trigger)
     * Self-Healing Cleanup: Automatically removes expired IP blocks from Cloudflare Firewall
     * 
     * Architecture: Uses cursor-based pagination to support infinite scaling.
     * KV list() returns max 1,000 keys per request. For large deployments with 10,000+ blocked IPs,
     * we must paginate through all keys using the cursor returned by each batch.
     */
    async scheduled(
        event: ScheduledEvent,
        env: Env,
        ctx: ExecutionContext
    ): Promise<void> {
        console.log(`[Sentinel Cleanup] Starting self-healing cleanup at ${new Date().toISOString()}`);

        try {
            let cleanedCount = 0;
            let errorCount = 0;
            let totalKeysScanned = 0;
            let batchNumber = 0;
            let cursor: string | undefined = undefined;
            let listComplete = false;

            // Cursor-based pagination loop
            // KV list() returns up to 1,000 keys per call + a cursor for the next batch
            do {
                batchNumber++;
                
                // List mitigation metadata keys with pagination
                // limit: 1000 (max allowed by Cloudflare KV)
                const listResult: Awaited<ReturnType<typeof env.SENTINEL_KV.list>> = await env.SENTINEL_KV.list({ 
                    prefix: "mitigation:",
                    limit: 1000,
                    cursor: cursor
                });

                const batchSize = listResult.keys.length;
                totalKeysScanned += batchSize;
                listComplete = listResult.list_complete;

                console.log(`[Sentinel Cleanup] Batch ${batchNumber}: Processing ${batchSize} keys (cursor: ${cursor || 'initial'})`);

                // Process each key in the current batch
                for (const key of listResult.keys) {
                    try {
                        // Get mitigation metadata
                        const metadataStr = await env.SENTINEL_KV.get(key.name);
                        if (!metadataStr) {
                            console.log(`[Sentinel Cleanup] No metadata found for ${key.name}, skipping`);
                            continue;
                        }

                        const metadata = JSON.parse(metadataStr) as {
                            ruleId: string;
                            sourceIP: string;
                            expiresAt: string;
                        };

                        // Check if rule has expired
                        const expiresAt = new Date(metadata.expiresAt);
                        const now = new Date();

                        if (now >= expiresAt) {
                            // Rule has expired - delete from Cloudflare Firewall
                            if (env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ZONE_ID) {
                                const deleteUrl = `https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/firewall/access_rules/rules/${metadata.ruleId}`;
                                
                                const response = await fetch(deleteUrl, {
                                    method: "DELETE",
                                    headers: {
                                        "Authorization": `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
                                        "Content-Type": "application/json",
                                    },
                                });

                                if (response.ok) {
                                    console.log(`[Sentinel Cleanup] Deleted expired rule ${metadata.ruleId} for IP ${metadata.sourceIP}`);
                                    cleanedCount++;
                                } else {
                                    const errorText = await response.text();
                                    console.error(`[Sentinel Cleanup] Failed to delete rule ${metadata.ruleId}: ${response.status} ${errorText}`);
                                    errorCount++;
                                }
                            } else {
                                console.log(`[Sentinel Cleanup] Cloudflare API not configured, skipping rule deletion for ${metadata.sourceIP}`);
                            }

                            // Delete metadata from KV (cleanup even if API call failed)
                            await env.SENTINEL_KV.delete(key.name);
                        } else {
                            const timeRemaining = Math.round((expiresAt.getTime() - now.getTime()) / 1000 / 60);
                            console.log(`[Sentinel Cleanup] Rule ${metadata.ruleId} for IP ${metadata.sourceIP} expires in ${timeRemaining} minutes`);
                        }
                    } catch (error) {
                        console.error(`[Sentinel Cleanup] Error processing ${key.name}:`, error);
                        errorCount++;
                    }
                }

                // Update cursor for next iteration (only exists if list_complete is false)
                cursor = listComplete ? undefined : (listResult as any).cursor;

                console.log(`[Sentinel Cleanup] Batch ${batchNumber} complete: ${batchSize} keys processed, list_complete: ${listComplete}`);

            } while (!listComplete); // Continue while there are more pages

            // Final summary log showing total across all paginated batches
            console.log(`[Sentinel Cleanup]  Cleanup complete: ${cleanedCount} rules deleted, ${errorCount} errors, ${totalKeysScanned} total keys scanned across ${batchNumber} batches`);
        } catch (error) {
            console.error(`[Sentinel Cleanup] Fatal error during cleanup:`, error);
        }
    },
};
