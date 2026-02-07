import { Env, SecurityAssessment } from "../types";
import { BaseAgent } from "./BaseAgent";

export interface SQLiMetadata {
    normalizedPayload: string;
    heuristicScore: number;
    flags: string[];
}

export class SQLiAgent extends BaseAgent {
    public name = "SQLiAgent";
    private readonly THRESHOLD = 50;

    constructor(env: Env) {
        super(env);
    }

    /**
     * Main analysis method.
     * Orchestrates the 3-layer detection logic.
     */
    async analyze(payload: string): Promise<SecurityAssessment> {
        // Layer 1: Normalization
        const normalized = this.normalize(payload);

        // Layer 2: Heuristic Engine
        const { score, flags } = this.heuristicAnalysis(normalized);

        // If score is low, return early (Benchmark < 10ms)
        if (score <= this.THRESHOLD) {
            return {
                attackType: "SQLi",
                confidence: "Low",
                riskScore: score, // Use heuristic score directly for low risk
                explanation: "Heuristic analysis indicates low probability of SQL injection.",
                impact: "None",
                mitigation: "None",
                action: "allow",
                executive_summary: "Payload classified as benign by heuristic analysis.",
                timestamp: new Date().toISOString(),
            };
        }

        // Layer 3: AI Verification (The Judge)
        // Only called if Heuristic Score > 50
        return await this.aiVerification(normalized, score, flags);
    }

    /**
     * Layer 1: Normalization (The Cleaner)
     * Handles URL decoding, hex/unicode conversion, and comment stripping.
     */
    normalize(payload: string): string {
        let normalized = payload;

        // 1. Recursive URL Decoding
        let previous = "";
        while (normalized !== previous) {
            previous = normalized;
            try {
                normalized = decodeURIComponent(normalized);
            } catch (e) {
                // Malformed URI sequence, stop decoding
                break;
            }
        }

        // 2. Lowercase for case-insensitive matching
        normalized = normalized.toLowerCase();

        // 3. Normalize Whitespace (replace multiple spaces/tabs/newlines with single space)
        normalized = normalized.replace(/\s+/g, " ");

        // 4. Remove SQL Comments
        // -- comments
        normalized = normalized.replace(/--.*$/gm, "");
        // /* */ comments (including multi-line)
        normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, "");
        // # comments (MySQL style)
        normalized = normalized.replace(/#.*$/gm, "");

        // 5. Remove Null Bytes
        normalized = normalized.replace(/\0/g, "");

        // 6. Re-normalize whitespace after removals (to handle "SELECT \0 *" -> "SELECT  *")
        normalized = normalized.replace(/\s+/g, " ");

        // 7. Common Obfuscation Normalization (Optional but good for "Deep Scan")
        return normalized.trim();
    }

    /**
     * Layer 2: Heuristic Engine (The Filter)
     * Scores the payload based on regex patterns and keywords.
     */
    heuristicAnalysis(payload: string): { score: number; flags: string[] } {
        let score = 0;
        const flags: string[] = [];

        // Pattern Definitions
        const patterns = [
            // Tautologies (High Confidence) - e.g. "1=1", "'a'='a'"
            { regex: /['"]\s*(=|LIKE)\s*['"]|(\d+)\s*=\s*\2/i, score: 60, name: "Tautology" },

            // Union-Based (High Confidence)
            { regex: /\bUNION\s+(ALL\s+)?SELECT\b/i, score: 70, name: "Union Payload" },

            // System Variables / Fingerprinting (Medium Confidence)
            { regex: /@@(version|hostname|datadir)|user\(\)|database\(\)|system_user\(\)/i, score: 50, name: "System Variable" },

            // Error-Based / Logic Testing (Medium Confidence)
            { regex: /\b(OR|AND)\s+['"]?(\d+|true|false)['"]?\s*=\s*['"]?(\2|true|false)['"]?/i, score: 45, name: "Logic Replacement" },

            // Time-Based Blind (High Confidence)
            { regex: /\b(SLEEP|BENCHMARK|WAITFOR\s+DELAY)\s*\(?/i, score: 80, name: "Time-Based Injection" },

            // Stacked Queries (Medium Confidence)
            { regex: /;\s*(DROP|INSERT|UPDATE|DELETE|ALTER|GRANT|REVOKE)\b/i, score: 60, name: "Stacked Query" },

            // Comment Indicators (Low Confidence alone, but additive)
            { regex: /--|\/\*|#/, score: 10, name: "SQL Comment Char" }
        ];

        // Apply Patterns
        for (const pattern of patterns) {
            if (pattern.regex.test(payload)) {
                score += pattern.score;
                flags.push(pattern.name);
            }
        }

        // Keywords check (Contextual)
        const keywords = ["select", "from", "where", "insert", "update", "delete", "drop", "table", "information_schema"];
        let keywordCount = 0;
        for (const word of keywords) {
            if (payload.includes(word)) {
                keywordCount++;
            }
        }

        // Multiplier for multiple keywords (e.g. "SELECT * FROM" is riskier than just "SELECT")
        if (keywordCount >= 2) {
            score += 20;
            flags.push("Multiple SQL Keywords");
        }

        // Cap score at 100
        score = Math.min(score, 100);

        return { score, flags };
    }

    /**
     * Layer 3: AI Verification (The Judge)
     * Calls Llama 3.3-70b to confirm malicious intent.
     */
    private async aiVerification(
        normalizedPayload: string,
        heuristicScore: number,
        flags: string[]
    ): Promise<SecurityAssessment> {
        try {
            const systemPrompt = `You are a specialized SQL Injection Security Analyst.
            Your task is to analyze the provided NORMALIZED payload and decide if it is a malicious SQL injection attempt.
            
            Context:
            - Heuristic Score: ${heuristicScore}
            - Flags Triggered: ${flags.join(", ")}
            
            Input:
            "${normalizedPayload}"
            
            Instructions:
            1. Analyze strictly for SQL Injection intent.
            2. Ignore XSS, RCE, or other attack types unless they facilitate SQLi.
            3. Reduce false positives (e.g. "Select a valid option" is NOT SQLi).
            4. Respond strictly with the JSON schema provided.
            
            Response Schema (JSON ONLY):
            {
                "attackType": "SQLi",
                "confidence": "High" | "Medium" | "Low",
                "riskScore": number (0-100),
                "explanation": "Brief reasoning",
                "impact": "Data Exfiltration" | "Auth Bypass" | "None",
                "mitigation": "Prepared Statements" | "Input Validation" | "None",
                "action": "block" | "allow" | "flag",
                "executive_summary": "One line summary"
            }`;

            const response = await this.env.AI.run("@cf/meta/llama-3-8b-instruct" as any, {
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: normalizedPayload }
                ],
                temperature: 0.1,
                max_tokens: 512
            });

            // Parse response (Reusing logic from workflow.ts/index.ts for robust parsing)
            let resultText = "";
            if (typeof response === 'object' && response !== null && 'response' in response) {
                resultText = (response as any).response;
            } else {
                resultText = JSON.stringify(response);
            }

            const jsonMatch = resultText.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : resultText.replace(/```json/g, "").replace(/```/g, "").trim();

            const assessment = JSON.parse(jsonStr) as SecurityAssessment;

            // Enforce minimum risk score if AI confirms attack but gives low score
            if (assessment.action === 'block' && assessment.riskScore < 70) {
                assessment.riskScore = 75;
            }

            return {
                ...assessment,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error("SQLi Agent AI Verification Failed:", error);
            // Fallback: If AI fails but Heuristics were high, trust Heuristics
            return {
                attackType: "SQLi (Heuristic Fallback)",
                confidence: "Medium",
                riskScore: heuristicScore,
                explanation: `AI Verification failed. Heuristic analysis detected: ${flags.join(", ")}`,
                impact: "Potential SQL Injection",
                mitigation: "Manual Review",
                action: heuristicScore > 80 ? "block" : "flag",
                executive_summary: "Heuristic analysis detected suspicious SQL patterns when AI verification failed.",
                timestamp: new Date().toISOString()
            };
        }
    }
}
