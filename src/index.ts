
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
            console.log(`[Sentinel Cleanup] ✅ Cleanup complete: ${cleanedCount} rules deleted, ${errorCount} errors, ${totalKeysScanned} total keys scanned across ${batchNumber} batches`);
        } catch (error) {
            console.error(`[Sentinel Cleanup] Fatal error during cleanup:`, error);
        }
    },
};
