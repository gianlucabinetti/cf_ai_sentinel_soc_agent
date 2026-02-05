
import { Env, isAnalyzeRequest, AnalyzeResponse } from "./types";
import { SentinelWorkflow } from "./workflow";

// Export workflow class for Cloudflare Runtime to discover it
export { SentinelWorkflow };

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
        const url = new URL(request.url);

        // --- Global CORS Headers ---
        // These must be present on EVERY response
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        // --- 1. Handle Preflight (OPTIONS) ---
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: corsHeaders
            });
        }

        // --- 2. Health Check ---
        if (request.method === "GET" && url.pathname === "/health") {
            return new Response(JSON.stringify({ status: "healthy" }), {
                headers: { "Content-Type": "application/json", ...corsHeaders },
            });
        }

        // --- 3. Workflow Trigger ---
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

        // --- 404 Default ---
        return new Response("Not Found", { status: 404, headers: corsHeaders });
    },

    /**
     * Scheduled Handler (Cron Trigger)
     * Self-Healing Cleanup: Automatically removes expired IP blocks from Cloudflare Firewall
     */
    async scheduled(
        event: ScheduledEvent,
        env: Env,
        ctx: ExecutionContext
    ): Promise<void> {
        console.log(`[Sentinel Cleanup] Starting self-healing cleanup at ${new Date().toISOString()}`);

        try {
            // List all mitigation metadata keys from KV
            const list = await env.SENTINEL_KV.list({ prefix: "mitigation:" });
            
            let cleanedCount = 0;
            let errorCount = 0;

            for (const key of list.keys) {
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

            console.log(`[Sentinel Cleanup] Completed: ${cleanedCount} rules deleted, ${errorCount} errors, ${list.keys.length} total keys processed`);
        } catch (error) {
            console.error(`[Sentinel Cleanup] Fatal error during cleanup:`, error);
        }
    },
};
