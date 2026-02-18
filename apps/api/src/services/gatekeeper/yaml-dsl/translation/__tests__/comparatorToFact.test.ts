/**
 * Comparator to Fact Translation Tests
 * Phase 2.3 - Hybrid Comparator/Fact-Based Approach
 */

import { describe, it, expect } from 'vitest';
import {
  translateComparatorToConditions,
  getTranslatableComparators,
  isTranslatable,
} from '../comparatorToFact.js';
import { ComparatorId } from '../../types.js';

describe('Comparator to Fact Translation', () => {
  describe('MIN_APPROVALS', () => {
    it('should translate to pr.approvals.count >= minCount', () => {
      const result = translateComparatorToConditions(
        ComparatorId.MIN_APPROVALS,
        { minCount: 2 }
      );

      expect(result.success).toBe(true);
      expect(result.conditions).toHaveLength(1);
      expect(result.conditions![0]).toEqual({
        fact: 'pr.approvals.count',
        operator: '>=',
        value: 2,
      });
    });

    it('should fail for invalid minCount', () => {
      const result = translateComparatorToConditions(
        ComparatorId.MIN_APPROVALS,
        { minCount: 0 }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid minCount');
    });
  });

  describe('HUMAN_APPROVAL_PRESENT', () => {
    it('should translate to pr.approvals.count > 0', () => {
      const result = translateComparatorToConditions(
        ComparatorId.HUMAN_APPROVAL_PRESENT,
        {}
      );

      expect(result.success).toBe(true);
      expect(result.conditions).toHaveLength(1);
      expect(result.conditions![0]).toEqual({
        fact: 'pr.approvals.count',
        operator: '>',
        value: 0,
      });
    });
  });

  describe('CHANGED_PATH_MATCHES', () => {
    it('should translate to diff.filesChanged.paths matches pattern', () => {
      const result = translateComparatorToConditions(
        ComparatorId.CHANGED_PATH_MATCHES,
        { pattern: 'src/**/*.ts' }
      );

      expect(result.success).toBe(true);
      expect(result.conditions).toHaveLength(1);
      expect(result.conditions![0]).toEqual({
        fact: 'diff.filesChanged.paths',
        operator: 'matches',
        value: 'src/**/*.ts',
      });
    });

    it('should fail for missing pattern', () => {
      const result = translateComparatorToConditions(
        ComparatorId.CHANGED_PATH_MATCHES,
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing pattern');
    });
  });

  describe('PR_TEMPLATE_FIELD_PRESENT', () => {
    it('should translate to pr.body matches field pattern', () => {
      const result = translateComparatorToConditions(
        ComparatorId.PR_TEMPLATE_FIELD_PRESENT,
        { fieldName: 'Testing' }
      );

      expect(result.success).toBe(true);
      expect(result.conditions).toHaveLength(1);
      expect(result.conditions![0].fact).toBe('pr.body');
      expect(result.conditions![0].operator).toBe('matches');
      expect(result.conditions![0].value).toContain('Testing');
    });

    it('should fail for missing fieldName', () => {
      const result = translateComparatorToConditions(
        ComparatorId.PR_TEMPLATE_FIELD_PRESENT,
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing fieldName');
    });
  });

  describe('ACTOR_IS_AGENT', () => {
    it('should translate to actor.user matches bot pattern', () => {
      const result = translateComparatorToConditions(
        ComparatorId.ACTOR_IS_AGENT,
        {}
      );

      expect(result.success).toBe(true);
      expect(result.conditions).toHaveLength(1);
      expect(result.conditions![0]).toEqual({
        fact: 'actor.user',
        operator: 'matches',
        value: '\\[bot\\]$|^dependabot|^renovate|^github-actions',
      });
    });
  });

  describe('Non-translatable comparators', () => {
    it('should fail for ARTIFACT_PRESENT', () => {
      const result = translateComparatorToConditions(
        ComparatorId.ARTIFACT_PRESENT,
        { artifactId: 'openapi' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('artifact resolution');
    });

    it('should fail for CHECKRUNS_PASSED', () => {
      const result = translateComparatorToConditions(
        ComparatorId.CHECKRUNS_PASSED,
        { requiredChecks: ['ci'] }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('GitHub API');
    });

    it('should fail for NO_SECRETS_IN_DIFF', () => {
      const result = translateComparatorToConditions(
        ComparatorId.NO_SECRETS_IN_DIFF,
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('secret scanning');
    });
  });

  describe('Utility functions', () => {
    it('should return list of translatable comparators', () => {
      const translatable = getTranslatableComparators();
      
      expect(translatable).toContain(ComparatorId.MIN_APPROVALS);
      expect(translatable).toContain(ComparatorId.HUMAN_APPROVAL_PRESENT);
      expect(translatable).toContain(ComparatorId.CHANGED_PATH_MATCHES);
      expect(translatable).toContain(ComparatorId.PR_TEMPLATE_FIELD_PRESENT);
      expect(translatable).toContain(ComparatorId.ACTOR_IS_AGENT);
      expect(translatable).not.toContain(ComparatorId.ARTIFACT_PRESENT);
    });

    it('should check if comparator is translatable', () => {
      expect(isTranslatable(ComparatorId.MIN_APPROVALS)).toBe(true);
      expect(isTranslatable(ComparatorId.ARTIFACT_PRESENT)).toBe(false);
      expect(isTranslatable(ComparatorId.CHECKRUNS_PASSED)).toBe(false);
    });
  });
});

