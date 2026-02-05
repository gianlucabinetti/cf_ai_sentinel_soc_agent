
import { Ai, KVNamespace, Workflow } from "@cloudflare/workers-types";

// --- Environment Bindings ---
export interface Env {
    AI: Ai;
    SENTINEL_KV: KVNamespace;
    SENTINEL_WORKFLOW: Workflow;
    ENVIRONMENT: 'production' | 'staging' | 'dev';
    API_KEY: string;
    SOC_WEBHOOK_URL?: string; // Optional: SOC platform webhook endpoint
    SOC_API_KEY?: string; // Optional: Authentication key for SOC webhook
    CLOUDFLARE_API_TOKEN?: string; // Optional: Cloudflare API token for auto-mitigation
    CLOUDFLARE_ZONE_ID?: string; // Optional: Cloudflare Zone ID for IP blocking
}

// --- API Request/Response ---
export interface AnalyzeRequest {
    payload: string;
    source?: string;
    metadata?: Record<string, unknown>;
}

export interface AnalyzeResponse {
    status: 'workflow_triggered' | 'workflow_deduplicated' | 'error';
    id?: string;
    cacheKey?: string;
    message?: string;
}

// --- Workflow ---
export interface WorkflowParams {
    payload: string;
    cacheKey: string;
    timestamp: string;
    sourceIP?: string; // Optional: Source IP address for auto-mitigation
}

// --- Domain Models ---
export interface SecurityAssessment {
    attackType: string;
    confidence: 'High' | 'Medium' | 'Low';
    explanation: string;
    impact: string;
    mitigation: string;
    riskScore: number;
    action: 'allow' | 'block' | 'flag';
    timestamp: string;
}

// Type guard for SecurityAssessment validation
export function isSecurityAssessment(obj: unknown): obj is SecurityAssessment {
    if (typeof obj !== 'object' || obj === null) return false;

    const candidate = obj as Record<string, unknown>;

    return (
        typeof candidate.attackType === 'string' &&
        (candidate.confidence === 'High' || candidate.confidence === 'Medium' || candidate.confidence === 'Low') &&
        typeof candidate.explanation === 'string' &&
        typeof candidate.impact === 'string' &&
        typeof candidate.mitigation === 'string' &&
        typeof candidate.riskScore === 'number' &&
        (candidate.action === 'allow' || candidate.action === 'block' || candidate.action === 'flag')
    );
}

// --- Type Guards ---
// standard strict type guard to avoid 'as any'
export function isAnalyzeRequest(body: unknown): body is AnalyzeRequest {
    if (typeof body !== 'object' || body === null) return false;
    const valid = 'payload' in body && typeof (body as AnalyzeRequest).payload === 'string';
    return valid;
}
