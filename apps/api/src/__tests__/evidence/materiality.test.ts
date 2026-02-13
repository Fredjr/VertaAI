/**
 * Phase 3 Tests - Materiality Scoring
 * 
 * Tests the materiality gate that determines if a drift is worth patching
 */

import { describe, test, expect } from 'vitest';
import { computeMaterialityScore, DEFAULT_MATERIALITY_CONFIG } from '../../services/evidence/materiality.js';
import type { Assessment } from '../../services/evidence/types.js';
import type { TypedDelta } from '../../services/baseline/types.js';

describe('Phase 3 - Materiality Scoring', () => {
  const createMockAssessment = (
    impactBand: Assessment['impactBand'],
    riskFactors: string[] = []
  ): Assessment => ({
    impactScore: 0.5,
    impactBand,
    firedRules: ['rule1'],
    consequenceText: 'Test consequence',
    blastRadius: {
      services: ['service1'],
      teams: ['team1'],
      systems: ['system1'],
    },
    riskFactors,
  });

  const createMockDeltas = (count: number): TypedDelta[] => {
    return Array.from({ length: count }, (_, i) => ({
      artifactType: 'command' as const,
      action: 'changed' as const,
      sourceValue: `command-${i}`,
      docValue: `old-command-${i}`,
      confidence: 0.8,
    }));
  };

  describe('Impact Band Scoring', () => {
    test('critical impact should score high', () => {
      const assessment = createMockAssessment('critical');
      const result = computeMaterialityScore(assessment, [], 0.8);

      expect(result.factors.impactBandScore).toBe(1.0);
      expect(result.shouldPatch).toBe(true);
    });

    test('high impact should score high', () => {
      const assessment = createMockAssessment('high');
      const result = computeMaterialityScore(assessment, [], 0.8);

      expect(result.factors.impactBandScore).toBe(0.8);
      expect(result.shouldPatch).toBe(true);
    });

    test('medium impact should score medium', () => {
      const assessment = createMockAssessment('medium');
      const result = computeMaterialityScore(assessment, [], 0.5);

      expect(result.factors.impactBandScore).toBe(0.5);
    });

    test('low impact should score low', () => {
      const assessment = createMockAssessment('low');
      const result = computeMaterialityScore(assessment, [], 0.3);

      expect(result.factors.impactBandScore).toBe(0.2);
    });
  });

  describe('Delta Count Scoring', () => {
    test('zero deltas should score 0', () => {
      const assessment = createMockAssessment('medium');
      const result = computeMaterialityScore(assessment, [], 0.5);

      expect(result.factors.deltaCountScore).toBe(0.0);
    });

    test('one delta should score 0.3', () => {
      const assessment = createMockAssessment('medium');
      const deltas = createMockDeltas(1);
      const result = computeMaterialityScore(assessment, deltas, 0.5);

      expect(result.factors.deltaCountScore).toBe(0.3);
    });

    test('ten deltas should score 1.0', () => {
      const assessment = createMockAssessment('medium');
      const deltas = createMockDeltas(10);
      const result = computeMaterialityScore(assessment, deltas, 0.5);

      expect(result.factors.deltaCountScore).toBe(1.0);
    });

    test('five deltas should score between 0.3 and 1.0', () => {
      const assessment = createMockAssessment('medium');
      const deltas = createMockDeltas(5);
      const result = computeMaterialityScore(assessment, deltas, 0.5);

      expect(result.factors.deltaCountScore).toBeGreaterThan(0.3);
      expect(result.factors.deltaCountScore).toBeLessThan(1.0);
    });
  });

  describe('Risk Factor Scoring', () => {
    test('no risk factors should score 0', () => {
      const assessment = createMockAssessment('medium', []);
      const result = computeMaterialityScore(assessment, [], 0.5);

      expect(result.factors.riskFactorScore).toBe(0.0);
    });

    test('production-impact risk factor should score 1.0', () => {
      const assessment = createMockAssessment('medium', ['production-impact']);
      const result = computeMaterialityScore(assessment, [], 0.5);

      expect(result.factors.riskFactorScore).toBe(1.0);
    });

    test('security-sensitive risk factor should score 1.0', () => {
      const assessment = createMockAssessment('medium', ['security-sensitive']);
      const result = computeMaterialityScore(assessment, [], 0.5);

      expect(result.factors.riskFactorScore).toBe(1.0);
    });

    test('multiple non-critical risk factors should score 0.7', () => {
      const assessment = createMockAssessment('medium', ['factor1', 'factor2', 'factor3']);
      const result = computeMaterialityScore(assessment, [], 0.5);

      expect(result.factors.riskFactorScore).toBe(0.7);
    });
  });

  describe('Overall Materiality Decision', () => {
    test('low impact + low confidence + no deltas should be skipped', () => {
      const assessment = createMockAssessment('low', []);
      const result = computeMaterialityScore(assessment, [], 0.2);

      expect(result.shouldPatch).toBe(false);
      expect(result.score).toBeLessThan(0.3);
      expect(result.reason).toContain('Low-value drift');
    });

    test('critical impact should always patch', () => {
      const assessment = createMockAssessment('critical', []);
      const result = computeMaterialityScore(assessment, [], 0.5);

      expect(result.shouldPatch).toBe(true);
      expect(result.reason).toContain('Material drift');
    });

    test('high impact + many deltas should patch', () => {
      const assessment = createMockAssessment('high', []);
      const deltas = createMockDeltas(10);
      const result = computeMaterialityScore(assessment, deltas, 0.8);

      expect(result.shouldPatch).toBe(true);
      expect(result.score).toBeGreaterThan(0.7);
    });
  });
});

