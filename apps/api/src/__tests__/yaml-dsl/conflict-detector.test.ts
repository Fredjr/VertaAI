/**
 * Tests for Conflict Detector Service
 * Phase 3C.2: Conflict Detection UX
 */

import { describe, it, expect } from 'vitest';
import { detectConflicts } from '../../services/gatekeeper/yaml-dsl/conflictDetector.js';
import type { PackYAML } from '../../services/gatekeeper/yaml-dsl/types.js';

describe('Conflict Detector', () => {
  describe('detectConflicts', () => {
    it('should return no conflicts for empty pack list', () => {
      const conflicts = detectConflicts([]);
      expect(conflicts).toEqual([]);
    });

    it('should return no conflicts for single pack', () => {
      const pack: PackYAML = {
        apiVersion: 'verta.ai/v1',
        kind: 'PolicyPack',
        metadata: {
          id: 'test-pack',
          name: 'Test Pack',
          version: '1.0.0',
        },
        scope: {
          type: 'workspace',
        },
        rules: [
          {
            id: 'rule-1',
            name: 'Rule 1',
            trigger: { anyChangedPaths: ['**/*.ts'] },
            obligations: [
              {
                comparatorId: 'file_count',
                params: { maxCount: 10 },
                severity: 'high',
                decisionOnFail: 'block',
                message: 'Too many files',
              },
            ],
          },
        ],
      };

      const conflicts = detectConflicts([pack]);
      expect(conflicts).toEqual([]);
    });
  });

  describe('Merge Strategy Conflicts', () => {
    it('should detect EXPLICIT mode conflict with mixed strategies', () => {
      const pack1: PackYAML = {
        apiVersion: 'verta.ai/v1',
        kind: 'PolicyPack',
        metadata: {
          id: 'pack-1',
          name: 'Pack 1',
          version: '1.0.0',
          scopeMergeStrategy: 'EXPLICIT',
        },
        scope: { type: 'workspace' },
        rules: [],
      };

      const pack2: PackYAML = {
        apiVersion: 'verta.ai/v1',
        kind: 'PolicyPack',
        metadata: {
          id: 'pack-2',
          name: 'Pack 2',
          version: '1.0.0',
          scopeMergeStrategy: 'MOST_RESTRICTIVE',
        },
        scope: { type: 'workspace' },
        rules: [],
      };

      const conflicts = detectConflicts([pack1, pack2]);
      
      expect(conflicts.length).toBeGreaterThan(0);
      const explicitConflict = conflicts.find(c => c.type === 'merge_strategy_conflict' && c.severity === 'error');
      expect(explicitConflict).toBeDefined();
      expect(explicitConflict?.affectedPacks).toContain('Pack 1');
      expect(explicitConflict?.affectedPacks).toContain('Pack 2');
    });

    it('should warn about mixed strategies without EXPLICIT', () => {
      const pack1: PackYAML = {
        apiVersion: 'verta.ai/v1',
        kind: 'PolicyPack',
        metadata: {
          id: 'pack-1',
          name: 'Pack 1',
          version: '1.0.0',
          scopeMergeStrategy: 'MOST_RESTRICTIVE',
        },
        scope: { type: 'workspace' },
        rules: [],
      };

      const pack2: PackYAML = {
        apiVersion: 'verta.ai/v1',
        kind: 'PolicyPack',
        metadata: {
          id: 'pack-2',
          name: 'Pack 2',
          version: '1.0.0',
          scopeMergeStrategy: 'HIGHEST_PRIORITY',
        },
        scope: { type: 'workspace' },
        rules: [],
      };

      const conflicts = detectConflicts([pack1, pack2]);
      
      const warningConflict = conflicts.find(c => c.type === 'merge_strategy_conflict' && c.severity === 'warning');
      expect(warningConflict).toBeDefined();
    });
  });

  describe('Rule Conflicts', () => {
    it('should detect rule conflicts with different decisions', () => {
      const pack1: PackYAML = {
        apiVersion: 'verta.ai/v1',
        kind: 'PolicyPack',
        metadata: {
          id: 'pack-1',
          name: 'Pack 1',
          version: '1.0.0',
        },
        scope: { type: 'workspace' },
        rules: [
          {
            id: 'shared-rule',
            name: 'Shared Rule',
            trigger: { anyChangedPaths: ['**/*.ts'] },
            obligations: [
              {
                comparatorId: 'file_count',
                params: { maxCount: 10 },
                severity: 'high',
                decisionOnFail: 'block',
                message: 'Too many files',
              },
            ],
          },
        ],
      };

      const pack2: PackYAML = {
        apiVersion: 'verta.ai/v1',
        kind: 'PolicyPack',
        metadata: {
          id: 'pack-2',
          name: 'Pack 2',
          version: '1.0.0',
        },
        scope: { type: 'workspace' },
        rules: [
          {
            id: 'shared-rule',
            name: 'Shared Rule',
            trigger: { anyChangedPaths: ['**/*.ts'] },
            obligations: [
              {
                comparatorId: 'file_count',
                params: { maxCount: 10 },
                severity: 'medium',
                decisionOnFail: 'warn',
                message: 'Too many files',
              },
            ],
          },
        ],
      };

      const conflicts = detectConflicts([pack1, pack2]);
      
      const ruleConflict = conflicts.find(c => c.type === 'rule_conflict');
      expect(ruleConflict).toBeDefined();
      expect(ruleConflict?.affectedRules).toContain('shared-rule');
    });
  });

  describe('Priority Conflicts', () => {
    it('should detect priority conflicts', () => {
      const pack1: PackYAML = {
        apiVersion: 'verta.ai/v1',
        kind: 'PolicyPack',
        metadata: {
          id: 'pack-1',
          name: 'Pack 1',
          version: '1.0.0',
          scopePriority: 75,
        },
        scope: { type: 'workspace' },
        rules: [],
      };

      const pack2: PackYAML = {
        apiVersion: 'verta.ai/v1',
        kind: 'PolicyPack',
        metadata: {
          id: 'pack-2',
          name: 'Pack 2',
          version: '1.0.0',
          scopePriority: 75,
        },
        scope: { type: 'workspace' },
        rules: [],
      };

      const conflicts = detectConflicts([pack1, pack2]);
      
      const priorityConflict = conflicts.find(c => c.type === 'priority_conflict');
      expect(priorityConflict).toBeDefined();
      expect(priorityConflict?.affectedPacks).toContain('Pack 1');
      expect(priorityConflict?.affectedPacks).toContain('Pack 2');
    });
  });
});

