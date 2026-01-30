
import type { KVNamespace } from "@cloudflare/workers-types";
import { Env, SecurityAssessment } from "./types";

/**
 * SecurityMemory
 * 
 * Why Cloudflare KV for SOC Caching?
 * 
 * 1. **Global Edge Distribution**: KV replicates data to 300+ edge locations.
 *    When the same attack payload hits multiple regions, we get instant cache hits.
 * 
 * 2. **Deduplication at Scale**: Attackers often use automated tools that send
 *    identical payloads thousands of times. KV prevents re-analyzing the same
 *    SQLi string on every request.
 * 
 * 3. **Cost Efficiency**: AI inference is expensive (~$0.01 per 1M tokens).
 *    Caching reduces costs by 90%+ for repeat attacks.
 * 
 * 4. **Low Latency**: KV reads are <1ms at the edge. Much faster than re-running
 *    a 500ms LLM inference call.
 * 
 * 5. **TTL for Temporal Context**: Security intelligence degrades over time.
 *    A payload flagged as "high risk" today might be benign after a patch.
 *    72-hour TTL aligns with typical SOC triage windows.
 */
export class SecurityMemory {
    private kv: KVNamespace;

    // TTL Constants
    private static readonly ASSESSMENT_TTL_SECONDS = 60 * 60 * 24 * 3; // 3 days
    private static readonly KEY_PREFIX = "assessment:";

    constructor(env: Env) {
        this.kv = env.SENTINEL_KV;
    }

    /**
     * Store a security assessment in KV.
     * 
     * Design Decision: We store ONLY the assessment metadata, not the raw payload.
     * Rationale:
     * - Raw payloads may contain PII or actual exploits
     * - We don't want our cache to become an attack database
     * - The hash is sufficient for deduplication
     */
    async storeAssessment(
        cacheKey: string,
        assessment: SecurityAssessment
    ): Promise<void> {
        try {
            const key = `${SecurityMemory.KEY_PREFIX}${cacheKey}`;

            // Store as typed JSON with metadata for fast filtering
            await this.kv.put(key, JSON.stringify(assessment), {
                expirationTtl: SecurityMemory.ASSESSMENT_TTL_SECONDS,
                metadata: {
                    attackType: assessment.attackType,
                    action: assessment.action,
                    riskScore: assessment.riskScore,
                    cachedAt: new Date().toISOString(),
                },
            });
        } catch (error) {
            // Non-blocking: If caching fails, we still return the assessment
            // This ensures the workflow doesn't fail just because KV is temporarily down
            console.error(`[SecurityMemory] Failed to store assessment for ${cacheKey}:`, error);
        }
    }

    /**
     * Retrieve a cached assessment if available.
     * 
     * This enables the API layer to implement a read-through cache pattern:
     * 1. Check KV for cached result
     * 2. If hit: return immediately (sub-millisecond response)
     * 3. If miss: trigger workflow and cache the result
     */
    async getAssessment(cacheKey: string): Promise<SecurityAssessment | null> {
        try {
            const key = `${SecurityMemory.KEY_PREFIX}${cacheKey}`;

            // Type-safe KV get with JSON parsing
            const cached = await this.kv.get<SecurityAssessment>(key, "json");

            if (cached) {
                console.log(`[SecurityMemory] Cache HIT for ${cacheKey}`);
            }

            return cached;
        } catch (error) {
            console.error(`[SecurityMemory] Failed to read assessment for ${cacheKey}:`, error);
            return null; // Fail gracefully - treat as cache miss
        }
    }

    /**
     * Delete a cached assessment.
     * Useful for manual overrides or when security rules change.
     */
    async invalidateAssessment(cacheKey: string): Promise<void> {
        try {
            const key = `${SecurityMemory.KEY_PREFIX}${cacheKey}`;
            await this.kv.delete(key);
            console.log(`[SecurityMemory] Invalidated cache for ${cacheKey}`);
        } catch (error) {
            console.error(`[SecurityMemory] Failed to invalidate ${cacheKey}:`, error);
        }
    }
}
