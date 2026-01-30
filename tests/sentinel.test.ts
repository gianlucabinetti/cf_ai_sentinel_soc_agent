/**
 * Sentinel Smoke Tests
 * 
 * These tests verify core functionality that doesn't require Cloudflare infrastructure:
 * - Type guards and validation logic
 * - Deterministic hashing behavior
 * - Request/response type safety
 * 
 * WHAT IS TESTED:
 *  Input validation (type guards)
 *  SHA-256 hash determinism (same input → same hash)
 *  Workflow ID generation consistency
 *  SecurityAssessment type guard edge cases
 * 
 * WHAT IS NOT TESTED:
 *  Workers AI inference (requires Cloudflare runtime + API key)
 *  KV operations (requires KV namespace binding)
 *  Workflow execution (requires Cloudflare Workflows runtime)
 *  End-to-end API integration (requires deployed Worker)
 * 
 * These tests run locally without Cloudflare credentials and focus on
 * deterministic, pure functions that ensure type safety and correctness.
 */

import { describe, it, expect } from 'vitest';
import { isAnalyzeRequest, isSecurityAssessment, type SecurityAssessment } from '../src/types';

// --- Type Guard Tests ---

describe('Type Guards', () => {
  describe('isAnalyzeRequest', () => {
    it('should accept valid request with payload string', () => {
      const valid = { payload: 'SELECT * FROM users' };
      expect(isAnalyzeRequest(valid)).toBe(true);
    });

    it('should accept request with optional fields', () => {
      const valid = {
        payload: 'test',
        source: 'web',
        metadata: { ip: '127.0.0.1' }
      };
      expect(isAnalyzeRequest(valid)).toBe(true);
    });

    it('should reject null', () => {
      expect(isAnalyzeRequest(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(isAnalyzeRequest(undefined)).toBe(false);
    });

    it('should reject non-object primitives', () => {
      expect(isAnalyzeRequest('string')).toBe(false);
      expect(isAnalyzeRequest(123)).toBe(false);
      expect(isAnalyzeRequest(true)).toBe(false);
    });

    it('should reject object without payload field', () => {
      const invalid = { data: 'test' };
      expect(isAnalyzeRequest(invalid)).toBe(false);
    });

    it('should reject object with non-string payload', () => {
      expect(isAnalyzeRequest({ payload: 123 })).toBe(false);
      expect(isAnalyzeRequest({ payload: null })).toBe(false);
      expect(isAnalyzeRequest({ payload: {} })).toBe(false);
      expect(isAnalyzeRequest({ payload: [] })).toBe(false);
    });

    it('should accept empty string payload (edge case)', () => {
      // Empty strings are technically valid, though the API may reject them
      expect(isAnalyzeRequest({ payload: '' })).toBe(true);
    });
  });

  describe('isSecurityAssessment', () => {
    const validAssessment: SecurityAssessment = {
      attackType: 'SQL Injection',
      confidence: 'High',
      explanation: 'Detected OR 1=1 pattern',
      impact: 'Database compromise',
      mitigation: 'Use parameterized queries',
      riskScore: 95,
      action: 'block',
      timestamp: '2024-01-01T00:00:00Z'
    };

    it('should accept valid SecurityAssessment', () => {
      expect(isSecurityAssessment(validAssessment)).toBe(true);
    });

    it('should accept all valid confidence levels', () => {
      expect(isSecurityAssessment({ ...validAssessment, confidence: 'High' })).toBe(true);
      expect(isSecurityAssessment({ ...validAssessment, confidence: 'Medium' })).toBe(true);
      expect(isSecurityAssessment({ ...validAssessment, confidence: 'Low' })).toBe(true);
    });

    it('should accept all valid actions', () => {
      expect(isSecurityAssessment({ ...validAssessment, action: 'allow' })).toBe(true);
      expect(isSecurityAssessment({ ...validAssessment, action: 'block' })).toBe(true);
      expect(isSecurityAssessment({ ...validAssessment, action: 'flag' })).toBe(true);
    });

    it('should reject null and undefined', () => {
      expect(isSecurityAssessment(null)).toBe(false);
      expect(isSecurityAssessment(undefined)).toBe(false);
    });

    it('should reject non-object primitives', () => {
      expect(isSecurityAssessment('string')).toBe(false);
      expect(isSecurityAssessment(123)).toBe(false);
      expect(isSecurityAssessment(true)).toBe(false);
    });

    it('should reject object with missing required fields', () => {
      const { attackType, ...missing } = validAssessment;
      expect(isSecurityAssessment(missing)).toBe(false);
    });

    it('should reject invalid confidence values', () => {
      expect(isSecurityAssessment({ ...validAssessment, confidence: 'VeryHigh' })).toBe(false);
      expect(isSecurityAssessment({ ...validAssessment, confidence: 'low' })).toBe(false); // case-sensitive
      expect(isSecurityAssessment({ ...validAssessment, confidence: '' })).toBe(false);
    });

    it('should reject invalid action values', () => {
      expect(isSecurityAssessment({ ...validAssessment, action: 'deny' })).toBe(false);
      expect(isSecurityAssessment({ ...validAssessment, action: 'BLOCK' })).toBe(false); // case-sensitive
      expect(isSecurityAssessment({ ...validAssessment, action: '' })).toBe(false);
    });

    it('should reject non-number riskScore', () => {
      expect(isSecurityAssessment({ ...validAssessment, riskScore: '95' })).toBe(false);
      expect(isSecurityAssessment({ ...validAssessment, riskScore: null })).toBe(false);
    });

    it('should reject non-string text fields', () => {
      expect(isSecurityAssessment({ ...validAssessment, attackType: 123 })).toBe(false);
      expect(isSecurityAssessment({ ...validAssessment, explanation: null })).toBe(false);
      expect(isSecurityAssessment({ ...validAssessment, impact: {} })).toBe(false);
    });

    it('should accept extra fields (forward compatibility)', () => {
      const withExtra = {
        ...validAssessment,
        customField: 'extra data',
        metadata: { foo: 'bar' }
      };
      expect(isSecurityAssessment(withExtra)).toBe(true);
    });
  });
});

// --- Deterministic Hashing Tests ---

describe('SHA-256 Hashing (Determinism)', () => {
  /**
   * These tests verify that the hashing logic used in src/index.ts
   * produces consistent, deterministic results.
   * 
   * This is critical for:
   * - Workflow idempotency (same payload → same workflow ID)
   * - KV cache deduplication (same payload → same cache key)
   */

  async function generateHash(payload: string): Promise<string> {
    // Replicate the exact hashing logic from src/index.ts
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  it('should produce consistent hash for same input', async () => {
    const payload = 'SELECT * FROM users WHERE id=1';
    const hash1 = await generateHash(payload);
    const hash2 = await generateHash(payload);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
  });

  it('should produce different hashes for different inputs', async () => {
    const payload1 = 'SELECT * FROM users';
    const payload2 = 'SELECT * FROM admins';

    const hash1 = await generateHash(payload1);
    const hash2 = await generateHash(payload2);

    expect(hash1).not.toBe(hash2);
  });

  it('should be case-sensitive', async () => {
    const hash1 = await generateHash('SELECT');
    const hash2 = await generateHash('select');

    expect(hash1).not.toBe(hash2);
  });

  it('should be whitespace-sensitive', async () => {
    const hash1 = await generateHash('SELECT * FROM users');
    const hash2 = await generateHash('SELECT  *  FROM  users'); // extra spaces

    expect(hash1).not.toBe(hash2);
  });

  it('should handle empty string', async () => {
    const hash = await generateHash('');

    expect(hash).toHaveLength(64);
    // Known SHA-256 hash of empty string
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('should handle unicode characters', async () => {
    const payload = '日本語テスト';
    const hash1 = await generateHash(payload);
    const hash2 = await generateHash(payload);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('should handle special characters', async () => {
    const payload = `<script>alert('XSS')</script>`;
    const hash = await generateHash(payload);

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/); // Valid hex string
  });

  it('should produce valid workflow IDs', async () => {
    const payload = 'test payload';
    const hash = await generateHash(payload);
    const workflowId = `scan-${hash}`;

    expect(workflowId).toMatch(/^scan-[a-f0-9]{64}$/);
    expect(workflowId.length).toBe(69); // 'scan-' (5) + 64 hex chars
  });
});

// --- Workflow ID Generation Tests ---

describe('Workflow ID Generation', () => {
  /**
   * Verifies that workflow IDs are generated consistently
   * for idempotency guarantees.
   */

  async function generateWorkflowId(payload: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const cacheKey = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return `scan-${cacheKey}`;
  }

  it('should generate identical IDs for identical payloads', async () => {
    const payload = 'SELECT * FROM users WHERE id=1 OR 1=1';
    const id1 = await generateWorkflowId(payload);
    const id2 = await generateWorkflowId(payload);

    expect(id1).toBe(id2);
  });

  it('should generate different IDs for different payloads', async () => {
    const id1 = await generateWorkflowId('payload1');
    const id2 = await generateWorkflowId('payload2');

    expect(id1).not.toBe(id2);
  });

  it('should always start with "scan-" prefix', async () => {
    const id = await generateWorkflowId('test');
    expect(id).toMatch(/^scan-/);
  });

  it('should produce valid Cloudflare Workflow instance IDs', async () => {
    // Workflow IDs must be valid identifiers (alphanumeric + hyphens)
    const id = await generateWorkflowId('test payload');
    expect(id).toMatch(/^[a-z0-9-]+$/);
  });
});

// --- Edge Cases and Boundary Conditions ---

describe('Edge Cases', () => {
  it('should handle very long payloads', async () => {
    const longPayload = 'A'.repeat(10000);
    const encoder = new TextEncoder();
    const data = encoder.encode(longPayload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    expect(hash).toHaveLength(64); // Hash length is constant regardless of input size
  });

  it('should handle payloads with null bytes', async () => {
    const payload = 'test\x00payload';
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    expect(hash).toHaveLength(64);
  });

  it('should validate SecurityAssessment with boundary riskScore values', () => {
    const assessment: SecurityAssessment = {
      attackType: 'Test',
      confidence: 'High',
      explanation: 'Test',
      impact: 'Test',
      mitigation: 'Test',
      riskScore: 0,
      action: 'allow',
      timestamp: '2024-01-01T00:00:00Z'
    };

    expect(isSecurityAssessment({ ...assessment, riskScore: 0 })).toBe(true);
    expect(isSecurityAssessment({ ...assessment, riskScore: 100 })).toBe(true);
    expect(isSecurityAssessment({ ...assessment, riskScore: -1 })).toBe(true); // Type guard doesn't validate range
    expect(isSecurityAssessment({ ...assessment, riskScore: 999 })).toBe(true); // Type guard doesn't validate range
  });
});

// --- Type Safety Verification ---

describe('Type Safety', () => {
  /**
   * These tests verify that TypeScript types are correctly enforced
   * and that type guards prevent runtime type errors.
   */

  it('should narrow type after isAnalyzeRequest check', () => {
    const body: unknown = { payload: 'test' };

    if (isAnalyzeRequest(body)) {
      // TypeScript should now know body.payload is a string
      const payload: string = body.payload;
      expect(typeof payload).toBe('string');
    }
  });

  it('should narrow type after isSecurityAssessment check', () => {
    const obj: unknown = {
      attackType: 'Test',
      confidence: 'High',
      explanation: 'Test',
      impact: 'Test',
      mitigation: 'Test',
      riskScore: 50,
      action: 'block',
      timestamp: '2024-01-01T00:00:00Z'
    };

    if (isSecurityAssessment(obj)) {
      // TypeScript should now know obj is SecurityAssessment
      const action: 'allow' | 'block' | 'flag' = obj.action;
      expect(['allow', 'block', 'flag']).toContain(action);
    }
  });
});
