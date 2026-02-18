/**
 * Pack Evaluator - Condition-Based Obligations Integration Tests
 * Phase 2.3 - Hybrid Comparator/Fact-Based Approach
 */

import { describe, it, expect } from 'vitest';
import { PackEvaluator } from '../packEvaluator.js';
import type { PackYAML } from '../packValidator.js';
import type { PRContext } from '../comparators/types.js';
import { ComparatorId } from '../types.js';

describe('PackEvaluator - Condition-Based Obligations', () => {
  const mockContext: PRContext = {
    workspaceId: 'ws-123',
    owner: 'test-org',
    repo: 'test-repo',
    prNumber: 42,
    headSha: 'def456',
    baseBranch: 'main',
    headBranch: 'feature/test',
    title: 'Test PR',
    body: 'Testing: Complete\nReviewed by: @alice',
    author: 'alice',
    labels: ['feature', 'needs-review'],
    files: [
      { filename: 'src/api/users.ts', status: 'modified', additions: 50, deletions: 10, changes: 60, patch: '' },
      { filename: 'README.md', status: 'modified', additions: 5, deletions: 2, changes: 7, patch: '' },
    ],
    commits: [],
    additions: 55,
    deletions: 12,
    github: {} as any,
    abortController: new AbortController(),
    budgets: {
      maxTotalMs: 30000,
      perComparatorTimeoutMs: 5000,
      maxGitHubApiCalls: 10,
      currentApiCalls: 0,
      startTime: Date.now(),
    },
    installationId: 12345,
    cache: {
      approvals: [
        { user: { login: 'bob' }, state: 'APPROVED' },
        { user: { login: 'charlie' }, state: 'APPROVED' },
      ],
      checkRuns: undefined,
      teamMemberships: new Map(),
    },
  };

  describe('Simple condition-based obligation', () => {
    it('should evaluate pack with simple condition (satisfied)', async () => {
      const pack: PackYAML = {
        apiVersion: 'verta.ai/v1',
        kind: 'PolicyPack',
        metadata: {
          id: 'test-pack-condition',
          name: 'Test Pack with Condition',
          version: '1.0.0',
        },
        scope: {
          type: 'workspace',
        },
        rules: [
          {
            id: 'rule-1',
            name: 'Require 2+ approvals',
            trigger: { always: true },
            obligations: [
              {
                condition: {
                  fact: 'pr.approvals.count',
                  operator: '>=',
                  value: 2,
                },
                decisionOnFail: 'block',
              },
            ],
          },
        ],
      };

      const evaluator = new PackEvaluator();
      const result = await evaluator.evaluate(pack, 'test-hash', 'test-source', mockContext);

      expect(result.decision).toBe('pass');
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].conditionResult).toBeDefined();
      expect(result.findings[0].conditionResult?.satisfied).toBe(true);
    });

    it('should evaluate pack with simple condition (not satisfied)', async () => {
      const pack: PackYAML = {
        apiVersion: 'verta.ai/v1',
        kind: 'PolicyPack',
        metadata: {
          id: 'test-pack-condition-fail',
          name: 'Test Pack with Failing Condition',
          version: '1.0.0',
        },
        scope: {
          type: 'workspace',
        },
        rules: [
          {
            id: 'rule-1',
            name: 'Require 5+ approvals',
            trigger: { always: true },
            obligations: [
              {
                condition: {
                  fact: 'pr.approvals.count',
                  operator: '>=',
                  value: 5,
                },
                decisionOnFail: 'block',
              },
            ],
          },
        ],
      };

      const evaluator = new PackEvaluator();
      const result = await evaluator.evaluate(pack, 'test-hash', 'test-source', mockContext);

      expect(result.decision).toBe('block');
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].conditionResult).toBeDefined();
      expect(result.findings[0].conditionResult?.satisfied).toBe(false);
    });
  });

  describe('Composite condition-based obligation', () => {
    it('should evaluate pack with AND condition', async () => {
      const pack: PackYAML = {
        apiVersion: 'verta.ai/v1',
        kind: 'PolicyPack',
        metadata: {
          id: 'test-pack-and',
          name: 'Test Pack with AND Condition',
          version: '1.0.0',
        },
        scope: {
          type: 'workspace',
        },
        rules: [
          {
            id: 'rule-1',
            name: 'Require approvals AND file changes',
            trigger: { always: true },
            obligations: [
              {
                condition: {
                  operator: 'AND',
                  conditions: [
                    { fact: 'pr.approvals.count', operator: '>=', value: 2 },
                    { fact: 'diff.filesChanged.count', operator: '>', value: 0 },
                  ],
                },
                decisionOnFail: 'block',
              },
            ],
          },
        ],
      };

      const evaluator = new PackEvaluator();
      const result = await evaluator.evaluate(pack, 'test-hash', 'test-source', mockContext);

      expect(result.decision).toBe('pass');
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].conditionResult?.satisfied).toBe(true);
    });
  });

  describe('Multiple condition-based obligations in single rule', () => {
    it('should evaluate pack with multiple condition obligations', async () => {
      const pack: PackYAML = {
        apiVersion: 'verta.ai/v1',
        kind: 'PolicyPack',
        metadata: {
          id: 'test-pack-multi-obligations',
          name: 'Test Pack with Multiple Condition Obligations',
          version: '1.0.0',
        },
        scope: {
          type: 'workspace',
        },
        rules: [
          {
            id: 'rule-1',
            name: 'Multiple condition obligations',
            trigger: { always: true },
            obligations: [
              // First condition obligation
              {
                condition: {
                  fact: 'pr.approvals.count',
                  operator: '>=',
                  value: 2,
                },
                decisionOnFail: 'block',
              },
              // Second condition obligation
              {
                condition: {
                  fact: 'diff.filesChanged.count',
                  operator: '>',
                  value: 0,
                },
                decisionOnFail: 'warn',
              },
            ],
          },
        ],
      };

      const evaluator = new PackEvaluator();
      const result = await evaluator.evaluate(pack, 'test-hash', 'test-source', mockContext);

      expect(result.decision).toBe('pass');
      expect(result.findings).toHaveLength(2);

      // Both findings should be condition-based
      expect(result.findings[0].conditionResult).toBeDefined();
      expect(result.findings[0].conditionResult?.satisfied).toBe(true);

      expect(result.findings[1].conditionResult).toBeDefined();
      expect(result.findings[1].conditionResult?.satisfied).toBe(true);
    });
  });

  describe('Multiple conditions in single obligation', () => {
    it('should evaluate pack with multiple conditions (all satisfied)', async () => {
      const pack: PackYAML = {
        apiVersion: 'verta.ai/v1',
        kind: 'PolicyPack',
        metadata: {
          id: 'test-pack-multi',
          name: 'Test Pack with Multiple Conditions',
          version: '1.0.0',
        },
        scope: {
          type: 'workspace',
        },
        rules: [
          {
            id: 'rule-1',
            name: 'Multiple conditions',
            trigger: { always: true },
            obligations: [
              {
                conditions: [
                  { fact: 'pr.approvals.count', operator: '>=', value: 2 },
                  { fact: 'diff.filesChanged.count', operator: '>', value: 0 },
                ],
                decisionOnFail: 'block',
              },
            ],
          },
        ],
      };

      const evaluator = new PackEvaluator();
      const result = await evaluator.evaluate(pack, 'test-hash', 'test-source', mockContext);

      expect(result.decision).toBe('pass');
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].conditionResult?.satisfied).toBe(true);
    });

    it('should evaluate pack with multiple conditions (one fails)', async () => {
      const pack: PackYAML = {
        apiVersion: 'verta.ai/v1',
        kind: 'PolicyPack',
        metadata: {
          id: 'test-pack-multi-fail',
          name: 'Test Pack with Multiple Conditions (Fail)',
          version: '1.0.0',
        },
        scope: {
          type: 'workspace',
        },
        rules: [
          {
            id: 'rule-1',
            name: 'Multiple conditions',
            trigger: { always: true },
            obligations: [
              {
                conditions: [
                  { fact: 'pr.approvals.count', operator: '>=', value: 2 },
                  { fact: 'diff.filesChanged.count', operator: '>', value: 100 },  // This will fail
                ],
                decisionOnFail: 'block',
              },
            ],
          },
        ],
      };

      const evaluator = new PackEvaluator();
      const result = await evaluator.evaluate(pack, 'test-hash', 'test-source', mockContext);

      expect(result.decision).toBe('block');
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].conditionResult?.satisfied).toBe(false);
    });
  });
});

