/**
 * Condition Evaluator Tests
 * Phase 2.2 - Hybrid Comparator/Fact-Based Approach
 */

import { describe, it, expect } from 'vitest';
import { evaluateCondition, evaluateConditions } from '../evaluator.js';
import type { Condition, ConditionContext } from '../types.js';

// Mock context for testing
const mockContext: ConditionContext = {
  facts: {
    'pr.approvals.count': 3,
    'pr.labels': ['security', 'breaking-change'],
    'pr.title': 'Add new API endpoint',
    'pr.isDraft': false,
    'diff.filesChanged.count': 5,
    'scope.workspace': 'acme-corp',
    'scope.repository': 'acme/api-service',
  },
  factCatalogVersion: 'v1.0.0',
};

describe('Condition Evaluator', () => {
  describe('Simple Conditions', () => {
    it('should evaluate equality condition', () => {
      const condition: Condition = {
        fact: 'pr.approvals.count',
        operator: '==',
        value: 3,
      };

      const result = evaluateCondition(condition, mockContext);
      expect(result.satisfied).toBe(true);
      expect(result.actualValue).toBe(3);
      expect(result.expectedValue).toBe(3);
      expect(result.operator).toBe('==');
      expect(result.error).toBeUndefined();
    });

    it('should evaluate inequality condition', () => {
      const condition: Condition = {
        fact: 'pr.approvals.count',
        operator: '!=',
        value: 5,
      };

      const result = evaluateCondition(condition, mockContext);
      expect(result.satisfied).toBe(true);
    });

    it('should evaluate greater than condition', () => {
      const condition: Condition = {
        fact: 'pr.approvals.count',
        operator: '>',
        value: 2,
      };

      const result = evaluateCondition(condition, mockContext);
      expect(result.satisfied).toBe(true);
    });

    it('should evaluate less than condition', () => {
      const condition: Condition = {
        fact: 'diff.filesChanged.count',
        operator: '<',
        value: 10,
      };

      const result = evaluateCondition(condition, mockContext);
      expect(result.satisfied).toBe(true);
    });

    it('should evaluate contains condition', () => {
      const condition: Condition = {
        fact: 'pr.labels',
        operator: 'contains',
        value: 'security',
      };

      const result = evaluateCondition(condition, mockContext);
      expect(result.satisfied).toBe(true);
    });

    it('should evaluate containsAll condition', () => {
      const condition: Condition = {
        fact: 'pr.labels',
        operator: 'containsAll',
        value: ['security', 'breaking-change'],
      };

      const result = evaluateCondition(condition, mockContext);
      expect(result.satisfied).toBe(true);
    });

    it('should evaluate startsWith condition', () => {
      const condition: Condition = {
        fact: 'pr.title',
        operator: 'startsWith',
        value: 'Add',
      };

      const result = evaluateCondition(condition, mockContext);
      expect(result.satisfied).toBe(true);
    });

    it('should evaluate matches condition', () => {
      const condition: Condition = {
        fact: 'pr.title',
        operator: 'matches',
        value: '^Add.*endpoint$',
      };

      const result = evaluateCondition(condition, mockContext);
      expect(result.satisfied).toBe(true);
    });

    it('should return error for non-existent fact', () => {
      const condition: Condition = {
        fact: 'non.existent.fact',
        operator: '==',
        value: 5,
      };

      const result = evaluateCondition(condition, mockContext);
      expect(result.satisfied).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('Composite Conditions - AND', () => {
    it('should evaluate AND with all true', () => {
      const condition: Condition = {
        operator: 'AND',
        conditions: [
          { fact: 'pr.approvals.count', operator: '>=', value: 2 },
          { fact: 'pr.isDraft', operator: '==', value: false },
        ],
      };

      const result = evaluateCondition(condition, mockContext);
      expect(result.satisfied).toBe(true);
      expect(result.childResults).toHaveLength(2);
      expect(result.childResults![0].satisfied).toBe(true);
      expect(result.childResults![1].satisfied).toBe(true);
    });

    it('should evaluate AND with one false', () => {
      const condition: Condition = {
        operator: 'AND',
        conditions: [
          { fact: 'pr.approvals.count', operator: '>=', value: 2 },
          { fact: 'pr.isDraft', operator: '==', value: true },
        ],
      };

      const result = evaluateCondition(condition, mockContext);
      expect(result.satisfied).toBe(false);
    });
  });

  describe('Composite Conditions - OR', () => {
    it('should evaluate OR with one true', () => {
      const condition: Condition = {
        operator: 'OR',
        conditions: [
          { fact: 'pr.approvals.count', operator: '>=', value: 10 },
          { fact: 'pr.labels', operator: 'contains', value: 'security' },
        ],
      };

      const result = evaluateCondition(condition, mockContext);
      expect(result.satisfied).toBe(true);
    });

    it('should evaluate OR with all false', () => {
      const condition: Condition = {
        operator: 'OR',
        conditions: [
          { fact: 'pr.approvals.count', operator: '>=', value: 10 },
          { fact: 'pr.isDraft', operator: '==', value: true },
        ],
      };

      const result = evaluateCondition(condition, mockContext);
      expect(result.satisfied).toBe(false);
    });
  });

  describe('Composite Conditions - NOT', () => {
    it('should evaluate NOT with true child', () => {
      const condition: Condition = {
        operator: 'NOT',
        conditions: [
          { fact: 'pr.isDraft', operator: '==', value: true },
        ],
      };

      const result = evaluateCondition(condition, mockContext);
      expect(result.satisfied).toBe(true);
    });

    it('should evaluate NOT with false child', () => {
      const condition: Condition = {
        operator: 'NOT',
        conditions: [
          { fact: 'pr.isDraft', operator: '==', value: false },
        ],
      };

      const result = evaluateCondition(condition, mockContext);
      expect(result.satisfied).toBe(false);
    });

    it('should return error for NOT with multiple children', () => {
      const condition: Condition = {
        operator: 'NOT',
        conditions: [
          { fact: 'pr.isDraft', operator: '==', value: false },
          { fact: 'pr.approvals.count', operator: '>=', value: 2 },
        ],
      };

      const result = evaluateCondition(condition, mockContext);
      expect(result.satisfied).toBe(false);
      expect(result.error).toContain('exactly one child');
    });
  });

  describe('Nested Conditions', () => {
    it('should evaluate nested AND/OR conditions', () => {
      const condition: Condition = {
        operator: 'AND',
        conditions: [
          {
            operator: 'OR',
            conditions: [
              { fact: 'pr.labels', operator: 'contains', value: 'security' },
              { fact: 'pr.labels', operator: 'contains', value: 'critical' },
            ],
          },
          { fact: 'pr.approvals.count', operator: '>=', value: 2 },
        ],
      };

      const result = evaluateCondition(condition, mockContext);
      expect(result.satisfied).toBe(true);
      expect(result.childResults).toHaveLength(2);
      expect(result.childResults![0].satisfied).toBe(true);
      expect(result.childResults![1].satisfied).toBe(true);
    });

    it('should evaluate complex nested conditions', () => {
      const condition: Condition = {
        operator: 'OR',
        conditions: [
          {
            operator: 'AND',
            conditions: [
              { fact: 'pr.labels', operator: 'contains', value: 'hotfix' },
              { fact: 'pr.approvals.count', operator: '>=', value: 1 },
            ],
          },
          {
            operator: 'AND',
            conditions: [
              { fact: 'pr.labels', operator: 'contains', value: 'security' },
              { fact: 'pr.approvals.count', operator: '>=', value: 2 },
            ],
          },
        ],
      };

      const result = evaluateCondition(condition, mockContext);
      expect(result.satisfied).toBe(true); // Second AND branch is true
    });
  });

  describe('evaluateConditions', () => {
    it('should evaluate multiple conditions', () => {
      const conditions: Condition[] = [
        { fact: 'pr.approvals.count', operator: '>=', value: 2 },
        { fact: 'pr.isDraft', operator: '==', value: false },
        { fact: 'pr.labels', operator: 'contains', value: 'security' },
      ];

      const results = evaluateConditions(conditions, mockContext);
      expect(results).toHaveLength(3);
      expect(results[0].satisfied).toBe(true);
      expect(results[1].satisfied).toBe(true);
      expect(results[2].satisfied).toBe(true);
    });
  });
});

