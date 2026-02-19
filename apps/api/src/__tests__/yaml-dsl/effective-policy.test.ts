/**
 * Effective Policy Service Tests
 * Phase 3B.1: Test effective policy computation
 */

import { describe, it, expect } from 'vitest';
import { computeEffectivePolicy } from '../../services/gatekeeper/yaml-dsl/effectivePolicyService.js';
import type { SelectedPack } from '../../services/gatekeeper/yaml-dsl/packSelector.js';
import type { PackYAML } from '../../services/gatekeeper/yaml-dsl/types.js';

// Helper to create a test pack
function createTestPack(
  id: string,
  name: string,
  priority: number,
  mergeStrategy: 'MOST_RESTRICTIVE' | 'HIGHEST_PRIORITY' | 'EXPLICIT' = 'MOST_RESTRICTIVE',
  rules: any[] = []
): SelectedPack {
  const pack: PackYAML = {
    metadata: {
      id,
      name,
      version: '1.0.0',
      scopePriority: priority,
      scopeMergeStrategy: mergeStrategy,
    },
    scope: {
      type: 'workspace',
    },
    rules,
    evaluation: {
      externalDependencyMode: 'soft_fail',
      unknownArtifactMode: 'soft_fail',
      budgets: {
        totalTimeoutSeconds: 60,
        perComparatorTimeoutSeconds: 15,
        maxApiCalls: 30,
      },
      maxFindings: 50,
      maxEvidenceSnippetsPerFinding: 2,
    },
  };

  return {
    pack,
    packHash: 'test-hash',
    source: 'workspace',
    dbId: id,
    publishedAt: new Date(),
  };
}

describe('Effective Policy Service', () => {
  describe('computeEffectivePolicy', () => {
    it('should compute effective policy for single pack', () => {
      const pack = createTestPack('pack1', 'Test Pack', 50, 'MOST_RESTRICTIVE', [
        {
          id: 'rule1',
          name: 'Test Rule',
          enabled: true,
          trigger: { always: true },
          obligations: [{ severity: 'high', decisionOnFail: 'block', message: 'Test' }],
        },
      ]);

      const result = computeEffectivePolicy([pack], 'owner/repo', 'main');

      expect(result.repository).toBe('owner/repo');
      expect(result.branch).toBe('main');
      expect(result.applicablePacks).toHaveLength(1);
      expect(result.applicablePacks[0].name).toBe('Test Pack');
      expect(result.effectiveRules).toHaveLength(1);
      expect(result.effectiveRules[0].ruleId).toBe('rule1');
      expect(result.conflicts).toHaveLength(0);
    });

    it('should merge rules from multiple packs without conflicts', () => {
      const pack1 = createTestPack('pack1', 'Pack 1', 60, 'MOST_RESTRICTIVE', [
        {
          id: 'rule1',
          name: 'Rule 1',
          enabled: true,
          trigger: { always: true },
          obligations: [{ severity: 'high', decisionOnFail: 'block', message: 'Test 1' }],
        },
      ]);

      const pack2 = createTestPack('pack2', 'Pack 2', 50, 'MOST_RESTRICTIVE', [
        {
          id: 'rule2',
          name: 'Rule 2',
          enabled: true,
          trigger: { always: true },
          obligations: [{ severity: 'medium', decisionOnFail: 'warn', message: 'Test 2' }],
        },
      ]);

      const result = computeEffectivePolicy([pack1, pack2], 'owner/repo', 'main');

      expect(result.applicablePacks).toHaveLength(2);
      expect(result.effectiveRules).toHaveLength(2);
      expect(result.conflicts).toHaveLength(0);
      expect(result.decisionLogic.mergeStrategy).toBe('MOST_RESTRICTIVE');
    });

    it('should detect conflicts when same rule has different obligations', () => {
      const pack1 = createTestPack('pack1', 'Pack 1', 60, 'MOST_RESTRICTIVE', [
        {
          id: 'rule1',
          name: 'Rule 1',
          enabled: true,
          trigger: { always: true },
          obligations: [{ severity: 'high', decisionOnFail: 'block', message: 'Block' }],
        },
      ]);

      const pack2 = createTestPack('pack2', 'Pack 2', 50, 'MOST_RESTRICTIVE', [
        {
          id: 'rule1',
          name: 'Rule 1',
          enabled: true,
          trigger: { always: true },
          obligations: [{ severity: 'medium', decisionOnFail: 'warn', message: 'Warn' }],
        },
      ]);

      const result = computeEffectivePolicy([pack1, pack2], 'owner/repo', 'main');

      expect(result.effectiveRules).toHaveLength(1);
      expect(result.effectiveRules[0].hasConflict).toBe(true);
      expect(result.effectiveRules[0].sources).toHaveLength(2);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].ruleId).toBe('rule1');
    });

    it('should use HIGHEST_PRIORITY strategy correctly', () => {
      const pack1 = createTestPack('pack1', 'High Priority Pack', 80, 'HIGHEST_PRIORITY', [
        {
          id: 'rule1',
          name: 'Rule 1',
          enabled: true,
          trigger: { always: true },
          obligations: [{ severity: 'high', decisionOnFail: 'block', message: 'High priority' }],
        },
      ]);

      const pack2 = createTestPack('pack2', 'Low Priority Pack', 20, 'HIGHEST_PRIORITY', [
        {
          id: 'rule1',
          name: 'Rule 1',
          enabled: true,
          trigger: { always: true },
          obligations: [{ severity: 'low', decisionOnFail: 'pass', message: 'Low priority' }],
        },
      ]);

      const result = computeEffectivePolicy([pack1, pack2], 'owner/repo', 'main');

      expect(result.decisionLogic.mergeStrategy).toBe('HIGHEST_PRIORITY');
      expect(result.effectiveRules[0].conflictResolution?.winningPackId).toBe('pack1');
    });
  });
});

