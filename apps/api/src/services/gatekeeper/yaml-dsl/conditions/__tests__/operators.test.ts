/**
 * Operator Tests
 * Phase 2.2 - Hybrid Comparator/Fact-Based Approach
 */

import { describe, it, expect } from 'vitest';
import { evaluateOperator } from '../operators.js';

describe('Condition Operators', () => {
  describe('Equality (==)', () => {
    it('should compare primitives', () => {
      expect(evaluateOperator('==', 5, 5)).toBe(true);
      expect(evaluateOperator('==', 5, 10)).toBe(false);
      expect(evaluateOperator('==', 'hello', 'hello')).toBe(true);
      expect(evaluateOperator('==', 'hello', 'world')).toBe(false);
      expect(evaluateOperator('==', true, true)).toBe(true);
      expect(evaluateOperator('==', true, false)).toBe(false);
    });

    it('should compare arrays', () => {
      expect(evaluateOperator('==', [1, 2, 3], [1, 2, 3])).toBe(true);
      expect(evaluateOperator('==', [1, 2, 3], [1, 2, 4])).toBe(false);
      expect(evaluateOperator('==', [1, 2], [1, 2, 3])).toBe(false);
    });

    it('should compare objects', () => {
      expect(evaluateOperator('==', { a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
      expect(evaluateOperator('==', { a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
      expect(evaluateOperator('==', { a: 1 }, { a: 1, b: 2 })).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(evaluateOperator('==', null, null)).toBe(true);
      expect(evaluateOperator('==', undefined, undefined)).toBe(true);
      expect(evaluateOperator('==', null, undefined)).toBe(true);
      expect(evaluateOperator('==', null, 5)).toBe(false);
    });
  });

  describe('Inequality (!=)', () => {
    it('should negate equality', () => {
      expect(evaluateOperator('!=', 5, 5)).toBe(false);
      expect(evaluateOperator('!=', 5, 10)).toBe(true);
      expect(evaluateOperator('!=', 'hello', 'world')).toBe(true);
    });
  });

  describe('Greater than (>)', () => {
    it('should compare numbers', () => {
      expect(evaluateOperator('>', 10, 5)).toBe(true);
      expect(evaluateOperator('>', 5, 10)).toBe(false);
      expect(evaluateOperator('>', 5, 5)).toBe(false);
    });

    it('should handle string numbers', () => {
      expect(evaluateOperator('>', '10', '5')).toBe(true);
      expect(evaluateOperator('>', 10, '5')).toBe(true);
    });

    it('should return false for non-numbers', () => {
      expect(evaluateOperator('>', 'hello', 'world')).toBe(false);
      expect(evaluateOperator('>', null, 5)).toBe(false);
    });
  });

  describe('Greater than or equal (>=)', () => {
    it('should compare numbers', () => {
      expect(evaluateOperator('>=', 10, 5)).toBe(true);
      expect(evaluateOperator('>=', 5, 5)).toBe(true);
      expect(evaluateOperator('>=', 5, 10)).toBe(false);
    });
  });

  describe('Less than (<)', () => {
    it('should compare numbers', () => {
      expect(evaluateOperator('<', 5, 10)).toBe(true);
      expect(evaluateOperator('<', 10, 5)).toBe(false);
      expect(evaluateOperator('<', 5, 5)).toBe(false);
    });
  });

  describe('Less than or equal (<=)', () => {
    it('should compare numbers', () => {
      expect(evaluateOperator('<=', 5, 10)).toBe(true);
      expect(evaluateOperator('<=', 5, 5)).toBe(true);
      expect(evaluateOperator('<=', 10, 5)).toBe(false);
    });
  });

  describe('In array (in)', () => {
    it('should check if value is in array', () => {
      expect(evaluateOperator('in', 'apple', ['apple', 'banana', 'cherry'])).toBe(true);
      expect(evaluateOperator('in', 'grape', ['apple', 'banana', 'cherry'])).toBe(false);
      expect(evaluateOperator('in', 2, [1, 2, 3])).toBe(true);
    });

    it('should return false for non-array', () => {
      expect(evaluateOperator('in', 'apple', 'not an array')).toBe(false);
    });
  });

  describe('Contains (contains)', () => {
    it('should check if array contains value', () => {
      expect(evaluateOperator('contains', ['apple', 'banana', 'cherry'], 'apple')).toBe(true);
      expect(evaluateOperator('contains', ['apple', 'banana', 'cherry'], 'grape')).toBe(false);
      expect(evaluateOperator('contains', [1, 2, 3], 2)).toBe(true);
    });

    it('should return false for non-array', () => {
      expect(evaluateOperator('contains', 'not an array', 'apple')).toBe(false);
    });
  });

  describe('Contains all (containsAll)', () => {
    it('should check if array contains all values', () => {
      expect(evaluateOperator('containsAll', ['apple', 'banana', 'cherry'], ['apple', 'banana'])).toBe(true);
      expect(evaluateOperator('containsAll', ['apple', 'banana', 'cherry'], ['apple', 'grape'])).toBe(false);
      expect(evaluateOperator('containsAll', [1, 2, 3, 4], [2, 4])).toBe(true);
    });

    it('should return false for non-arrays', () => {
      expect(evaluateOperator('containsAll', 'not an array', ['apple'])).toBe(false);
      expect(evaluateOperator('containsAll', ['apple'], 'not an array')).toBe(false);
    });
  });

  describe('Matches regex (matches)', () => {
    it('should match regex patterns', () => {
      expect(evaluateOperator('matches', 'hello world', '^hello')).toBe(true);
      expect(evaluateOperator('matches', 'hello world', 'world$')).toBe(true);
      expect(evaluateOperator('matches', 'hello world', '^goodbye')).toBe(false);
      expect(evaluateOperator('matches', 'test123', '\\d+')).toBe(true);
    });

    it('should return false for non-strings', () => {
      expect(evaluateOperator('matches', 123, '\\d+')).toBe(false);
      expect(evaluateOperator('matches', 'hello', 123 as any)).toBe(false);
    });

    it('should return false for invalid regex', () => {
      expect(evaluateOperator('matches', 'hello', '[invalid')).toBe(false);
    });
  });

  describe('Starts with (startsWith)', () => {
    it('should check string prefix', () => {
      expect(evaluateOperator('startsWith', 'hello world', 'hello')).toBe(true);
      expect(evaluateOperator('startsWith', 'hello world', 'world')).toBe(false);
    });

    it('should return false for non-strings', () => {
      expect(evaluateOperator('startsWith', 123, 'hello')).toBe(false);
    });
  });

  describe('Ends with (endsWith)', () => {
    it('should check string suffix', () => {
      expect(evaluateOperator('endsWith', 'hello world', 'world')).toBe(true);
      expect(evaluateOperator('endsWith', 'hello world', 'hello')).toBe(false);
    });

    it('should return false for non-strings', () => {
      expect(evaluateOperator('endsWith', 123, 'world')).toBe(false);
    });
  });
});

