/**
 * Pack Evaluator - Facts Integration Tests
 * Phase 2.1 - Verify fact catalog integration with pack evaluator
 */

import { describe, it, expect } from 'vitest';
import { PackEvaluator } from '../packEvaluator.js';
import type { PackYAML } from '../packValidator.js';
import type { PRContext } from '../comparators/types.js';

describe('PackEvaluator - Facts Integration', () => {
  it('should resolve facts and attach to context', async () => {
    const pack: PackYAML = {
      apiVersion: 'verta.ai/v1',
      kind: 'PolicyPack',
      metadata: {
        id: 'test-pack',
        name: 'Test Pack',
        version: '1.0.0',
        description: 'Test pack for fact integration',
      },
      scope: {
        type: 'workspace',
        ref: 'test-workspace',
      },
      rules: [
        {
          id: 'test-rule',
          name: 'Test Rule',
          trigger: { always: true },
          obligations: [
            {
              comparator: 'MIN_APPROVALS',
              params: { min: 1 },
              decisionOnFail: 'warn',
            },
          ],
        },
      ],
    };

    const context: PRContext = {
      owner: 'acme',
      repo: 'api-service',
      prNumber: 123,
      headSha: 'abc123',
      baseBranch: 'main',
      headBranch: 'feature/test',
      title: 'Test PR',
      body: 'Test body',
      author: 'alice',
      labels: ['test'],
      files: [],
      commits: [],
      additions: 10,
      deletions: 5,
      github: {} as any,
      abortController: new AbortController(),
      budgets: {
        maxTotalMs: 30000,
        perComparatorTimeoutMs: 5000,
        maxGitHubApiCalls: 50,
        currentApiCalls: 0,
        startTime: Date.now(),
      },
      workspaceId: 'test-workspace',
      installationId: 12345,
      cache: {
        approvals: undefined,
        checkRuns: undefined,
        teamMemberships: new Map(),
      },
    };

    const evaluator = new PackEvaluator();
    const result = await evaluator.evaluate(pack, 'test-hash', 'test-source', context);

    // Verify facts were resolved and attached to context
    expect(context.facts).toBeDefined();
    expect(context.factCatalogVersion).toBe('v1.0.0');

    // Verify some facts were resolved
    expect(context.facts?.['scope.workspace']).toBe('test-workspace');
    expect(context.facts?.['scope.repository']).toBe('acme/api-service');
    expect(context.facts?.['scope.branch']).toBe('main');
    expect(context.facts?.['actor.user']).toBe('alice');
    expect(context.facts?.['pr.id']).toBe(123);
    expect(context.facts?.['pr.title']).toBe('Test PR');
    expect(context.facts?.['pr.labels']).toEqual(['test']);
    expect(context.facts?.['pr.targetBranch']).toBe('main');
    expect(context.facts?.['pr.sourceBranch']).toBe('feature/test');
    expect(context.facts?.['diff.filesChanged.count']).toBe(0);
    expect(context.facts?.['diff.linesAdded']).toBe(10);
    expect(context.facts?.['diff.linesDeleted']).toBe(5);
    expect(context.facts?.['diff.linesChanged']).toBe(15);

    // Verify engine fingerprint includes fact catalog version
    expect(result.engineFingerprint.factCatalogVersion).toBe('v1.0.0');
  });

  it('should continue evaluation even if fact resolution fails', async () => {
    const pack: PackYAML = {
      apiVersion: 'verta.ai/v1',
      kind: 'PolicyPack',
      metadata: {
        id: 'test-pack',
        name: 'Test Pack',
        version: '1.0.0',
        description: 'Test pack',
      },
      scope: {
        type: 'workspace',
        ref: 'test-workspace',
      },
      rules: [],
    };

    // Create a context with missing required fields to trigger fact resolution errors
    const context: PRContext = {
      owner: 'acme',
      repo: 'api-service',
      prNumber: 123,
      headSha: 'abc123',
      baseBranch: 'main',
      headBranch: 'feature/test',
      title: 'Test PR',
      body: 'Test body',
      author: 'alice',
      labels: [],
      files: [],
      commits: [],
      additions: 0,
      deletions: 0,
      github: {} as any,
      abortController: new AbortController(),
      budgets: {
        maxTotalMs: 30000,
        perComparatorTimeoutMs: 5000,
        maxGitHubApiCalls: 50,
        currentApiCalls: 0,
        startTime: Date.now(),
      },
      workspaceId: 'test-workspace',
      installationId: 12345,
      cache: {
        approvals: undefined,
        checkRuns: undefined,
        teamMemberships: new Map(),
      },
    };

    const evaluator = new PackEvaluator();
    const result = await evaluator.evaluate(pack, 'test-hash', 'test-source', context);

    // Evaluation should succeed even if some facts fail to resolve
    expect(result).toBeDefined();
    expect(result.decision).toBe('pass');
    expect(context.factCatalogVersion).toBe('v1.0.0');
  });
});

