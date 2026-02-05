
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
};
