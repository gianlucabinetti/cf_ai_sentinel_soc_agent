// API Response Types

export interface SecurityAssessment {
    attackType: string;
    confidence: 'High' | 'Medium' | 'Low';
    explanation: string;
    impact: string;
    mitigation: string;
    riskScore: number;
    action: 'allow' | 'block' | 'flag';
    timestamp: string;
    executive_summary: string;
}

export interface AnalyzeResponse {
    status: 'analyzed' | 'cached' | 'error';
    id: string;
    cacheKey: string;
    assessment: SecurityAssessment;
}

export interface MitigationRecord {
    sourceIP: string;
    ruleId: string;
    attackType: string;
    riskScore: number;
    createdAt: string;
    expiresAt: string;
    timeRemaining: string;
}

export interface MitigationsResponse {
    success: boolean;
    count: number;
    mitigations: MitigationRecord[];
}

export interface AnalyzeRequest {
    payload: string;
}

// Telemetry Types

export type SystemStatus = 'online' | 'offline' | 'checking';

export interface TelemetryData {
    systemStatus: SystemStatus;
    latency: number;
    activeRules: number;
    totalBlocks: number;
}

export interface ThreatStreamEntry {
    timestamp: string;
    sourceIP: string;
    attackVector: string;
    riskScore: number;
    action: 'BLOCKED' | 'ALLOWED' | 'FLAGGED';
}
