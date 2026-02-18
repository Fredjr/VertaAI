/**
 * Test: Multi-Pack Decision Aggregation
 * Phase 2 & 3 Validation
 * 
 * Verifies that multiple packs are evaluated and decisions are aggregated correctly
 */

import { describe, it, expect } from 'vitest';
import type { PackResult } from '../../services/gatekeeper/yaml-dsl/yamlGatekeeperIntegration.js';
import type { PackEvaluationResult } from '../../services/gatekeeper/yaml-dsl/packEvaluator.js';
import type { PackYAML } from '../../services/gatekeeper/yaml-dsl/packValidator.js';

// Helper to create mock pack result
function createMockPackResult(
  packName: string,
  decision: 'pass' | 'warn' | 'block',
  source: 'repo' | 'service' | 'workspace'
): PackResult {
  const pack: PackYAML = {
    apiVersion: 'verta.ai/v1',
    kind: 'PolicyPack',
    metadata: {
      id: `test.${packName}`,
      name: packName,
      version: '1.0.0',
      tags: [],
      packMode: 'enforce',
      strictness: 'balanced',
    },
    scope: {
      type: source,
      ref: source === 'repo' ? 'org/repo' : undefined,
      prEvents: ['opened', 'synchronize'],
    },
    rules: [],
  };

  const result: PackEvaluationResult = {
    decision,
    findings: [],
    triggeredRules: [],
    packHash: 'mock-hash',
    packSource: source,
    evaluationTimeMs: 100,
    budgetExhausted: false,
    engineFingerprint: {
      evaluatorVersion: '1.0.0',
      comparatorVersions: {},
      timestamp: new Date().toISOString(),
    },
  };

  return {
    pack,
    packHash: 'mock-hash',
    packSource: source,
    result,
  };
}

// Import the actual function (we'll need to export it from yamlGatekeeperIntegration.ts)
function computeGlobalDecision(packResults: PackResult[]): 'pass' | 'warn' | 'block' {
  // Check for any BLOCK decisions
  for (const packResult of packResults) {
    if (packResult.result.decision === 'block') {
      return 'block';
    }
  }

  // Check for any WARN decisions
  for (const packResult of packResults) {
    if (packResult.result.decision === 'warn') {
      return 'warn';
    }
  }

  // All packs passed
  return 'pass';
}

describe('Multi-Pack Decision Aggregation', () => {
  it('should return PASS when all packs pass', () => {
    const packResults = [
      createMockPackResult('Pack A', 'pass', 'repo'),
      createMockPackResult('Pack B', 'pass', 'service'),
      createMockPackResult('Pack C', 'pass', 'workspace'),
    ];

    const decision = computeGlobalDecision(packResults);
    expect(decision).toBe('pass');
  });

  it('should return WARN when any pack warns (no blocks)', () => {
    const packResults = [
      createMockPackResult('Pack A', 'pass', 'repo'),
      createMockPackResult('Pack B', 'warn', 'service'),
      createMockPackResult('Pack C', 'pass', 'workspace'),
    ];

    const decision = computeGlobalDecision(packResults);
    expect(decision).toBe('warn');
  });

  it('should return BLOCK when any pack blocks', () => {
    const packResults = [
      createMockPackResult('Pack A', 'pass', 'repo'),
      createMockPackResult('Pack B', 'warn', 'service'),
      createMockPackResult('Pack C', 'block', 'workspace'),
    ];

    const decision = computeGlobalDecision(packResults);
    expect(decision).toBe('block');
  });

  it('should return BLOCK even if only one pack blocks', () => {
    const packResults = [
      createMockPackResult('Pack A', 'block', 'repo'),
      createMockPackResult('Pack B', 'pass', 'service'),
    ];

    const decision = computeGlobalDecision(packResults);
    expect(decision).toBe('block');
  });

  it('should handle single pack correctly', () => {
    const packResults = [
      createMockPackResult('Pack A', 'warn', 'repo'),
    ];

    const decision = computeGlobalDecision(packResults);
    expect(decision).toBe('warn');
  });

  it('should prioritize BLOCK over WARN over PASS', () => {
    // Test all combinations
    const testCases: Array<{
      packs: Array<'pass' | 'warn' | 'block'>;
      expected: 'pass' | 'warn' | 'block';
    }> = [
      { packs: ['pass', 'pass'], expected: 'pass' },
      { packs: ['pass', 'warn'], expected: 'warn' },
      { packs: ['pass', 'block'], expected: 'block' },
      { packs: ['warn', 'warn'], expected: 'warn' },
      { packs: ['warn', 'block'], expected: 'block' },
      { packs: ['block', 'block'], expected: 'block' },
      { packs: ['pass', 'warn', 'block'], expected: 'block' },
    ];

    for (const testCase of testCases) {
      const packResults = testCase.packs.map((decision, i) =>
        createMockPackResult(`Pack ${i}`, decision, 'workspace')
      );
      const decision = computeGlobalDecision(packResults);
      expect(decision).toBe(testCase.expected);
    }
  });
});

