/**
 * Fact Resolver Tests
 * Phase 2.1 - Hybrid Comparator/Fact-Based Approach
 */

import { describe, it, expect } from 'vitest';
import { 
  resolveFact, 
  resolveFacts, 
  getFactValue, 
  canResolveFact,
  validateFactIds,
  getFactIdsByCategory,
  searchFacts,
  getFactMetadata
} from '../resolver.js';
import type { PRContext } from '../../comparators/types.js';

// Mock PR context for testing
const mockContext: PRContext = {
  owner: 'acme',
  repo: 'api-service',
  prNumber: 123,
  headSha: 'abc123',
  baseBranch: 'main',
  headBranch: 'feature/new-api',
  title: 'Add new API endpoint',
  body: 'This PR adds a new API endpoint',
  author: 'alice',
  labels: ['api', 'breaking-change'],
  files: [
    { filename: 'src/api.ts', additions: 50, deletions: 10, status: 'modified', changes: 60 },
    { filename: 'openapi.yaml', additions: 20, deletions: 5, status: 'modified', changes: 25 },
  ],
  commits: [],
  additions: 70,
  deletions: 15,
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
    approvals: [
      { user: 'bob', teams: ['@acme/api-team'] },
      { user: 'charlie', teams: ['@acme/security'] },
    ],
    checkRuns: undefined,
    teamMemberships: new Map(),
  },
} as any;

describe('FactResolver', () => {
  describe('resolveFact', () => {
    it('should resolve universal facts', () => {
      const result = resolveFact('scope.workspace', mockContext);
      expect(result.factId).toBe('scope.workspace');
      expect(result.value).toBe('test-workspace');
      expect(result.error).toBeUndefined();
    });

    it('should resolve PR metadata facts', () => {
      const result = resolveFact('pr.approvals.count', mockContext);
      expect(result.factId).toBe('pr.approvals.count');
      expect(result.value).toBe(2);
      expect(result.error).toBeUndefined();
    });

    it('should resolve diff facts', () => {
      const result = resolveFact('diff.filesChanged.count', mockContext);
      expect(result.factId).toBe('diff.filesChanged.count');
      expect(result.value).toBe(2);
      expect(result.error).toBeUndefined();
    });

    it('should return error for non-existent fact', () => {
      const result = resolveFact('non.existent.fact', mockContext);
      expect(result.error).toContain('not found in catalog');
      expect(result.value).toBeUndefined();
    });
  });

  describe('resolveFacts', () => {
    it('should resolve multiple facts', () => {
      const result = resolveFacts(
        ['scope.workspace', 'pr.approvals.count', 'diff.filesChanged.count'],
        mockContext
      );

      expect(result.facts['scope.workspace']).toBe('test-workspace');
      expect(result.facts['pr.approvals.count']).toBe(2);
      expect(result.facts['diff.filesChanged.count']).toBe(2);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    it('should handle mix of valid and invalid facts', () => {
      const result = resolveFacts(
        ['scope.workspace', 'non.existent.fact', 'pr.approvals.count'],
        mockContext
      );

      expect(result.facts['scope.workspace']).toBe('test-workspace');
      expect(result.facts['pr.approvals.count']).toBe(2);
      expect(result.errors['non.existent.fact']).toBeDefined();
    });
  });

  describe('getFactValue', () => {
    it('should get fact value with type safety', () => {
      const workspace = getFactValue<string>('scope.workspace', mockContext);
      expect(workspace).toBe('test-workspace');

      const approvalCount = getFactValue<number>('pr.approvals.count', mockContext);
      expect(approvalCount).toBe(2);

      const labels = getFactValue<string[]>('pr.labels', mockContext);
      expect(labels).toEqual(['api', 'breaking-change']);
    });

    it('should return undefined for non-existent fact', () => {
      const value = getFactValue('non.existent.fact', mockContext);
      expect(value).toBeUndefined();
    });
  });

  describe('canResolveFact', () => {
    it('should return true for existing facts', () => {
      expect(canResolveFact('scope.workspace')).toBe(true);
      expect(canResolveFact('pr.approvals.count')).toBe(true);
    });

    it('should return false for non-existent facts', () => {
      expect(canResolveFact('non.existent.fact')).toBe(false);
    });
  });

  describe('validateFactIds', () => {
    it('should validate all valid fact IDs', () => {
      const result = validateFactIds(['scope.workspace', 'pr.approvals.count']);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid fact IDs', () => {
      const result = validateFactIds(['scope.workspace', 'invalid.fact', 'another.invalid']);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('getFactIdsByCategory', () => {
    it('should get fact IDs by category', () => {
      const universalFacts = getFactIdsByCategory('universal');
      expect(universalFacts).toContain('scope.workspace');
      expect(universalFacts).toContain('actor.user');

      const prFacts = getFactIdsByCategory('pr');
      expect(prFacts).toContain('pr.approvals.count');
      expect(prFacts).toContain('pr.labels');
    });
  });

  describe('searchFacts', () => {
    it('should search facts by keyword', () => {
      const approvalFacts = searchFacts('approval');
      expect(approvalFacts).toContain('pr.approvals.count');
      expect(approvalFacts).toContain('pr.approvals.users');

      const fileFacts = searchFacts('file');
      expect(fileFacts).toContain('diff.filesChanged.count');
    });
  });

  describe('getFactMetadata', () => {
    it('should get fact metadata', () => {
      const metadata = getFactMetadata('pr.approvals.count');
      expect(metadata).toMatchObject({
        id: 'pr.approvals.count',
        name: 'Approval Count',
        category: 'pr',
        valueType: 'number',
        version: 'v1.0.0',
      });
    });

    it('should return null for non-existent fact', () => {
      const metadata = getFactMetadata('non.existent.fact');
      expect(metadata).toBeNull();
    });
  });
});

