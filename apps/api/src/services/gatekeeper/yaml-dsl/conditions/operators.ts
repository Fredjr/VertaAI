/**
 * Condition Operators
 * Phase 2.2 - Hybrid Comparator/Fact-Based Approach
 * 
 * Implementation of comparison operators for fact-based conditions
 */

import type { ComparisonOperator } from './types.js';

/**
 * Evaluate a comparison operator
 */
export function evaluateOperator(
  operator: ComparisonOperator,
  actualValue: any,
  expectedValue: any
): boolean {
  switch (operator) {
    case '==':
      return equals(actualValue, expectedValue);
    
    case '!=':
      return !equals(actualValue, expectedValue);
    
    case '>':
      return greaterThan(actualValue, expectedValue);
    
    case '>=':
      return greaterThanOrEqual(actualValue, expectedValue);
    
    case '<':
      return lessThan(actualValue, expectedValue);
    
    case '<=':
      return lessThanOrEqual(actualValue, expectedValue);
    
    case 'in':
      return inArray(actualValue, expectedValue);
    
    case 'contains':
      return contains(actualValue, expectedValue);
    
    case 'containsAll':
      return containsAll(actualValue, expectedValue);
    
    case 'matches':
      return matches(actualValue, expectedValue);
    
    case 'startsWith':
      return startsWith(actualValue, expectedValue);
    
    case 'endsWith':
      return endsWith(actualValue, expectedValue);
    
    default:
      throw new Error(`Unknown operator: ${operator}`);
  }
}

/**
 * Equality comparison with type coercion
 */
function equals(actual: any, expected: any): boolean {
  // Handle null/undefined
  if (actual == null && expected == null) return true;
  if (actual == null || expected == null) return false;
  
  // Handle arrays
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) return false;
    return actual.every((val, idx) => equals(val, expected[idx]));
  }
  
  // Handle objects
  if (typeof actual === 'object' && typeof expected === 'object') {
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (!equals(actualKeys, expectedKeys)) return false;
    return actualKeys.every(key => equals(actual[key], expected[key]));
  }
  
  // Primitive comparison
  return actual === expected;
}

/**
 * Greater than comparison (numbers only)
 */
function greaterThan(actual: any, expected: any): boolean {
  const actualNum = toNumber(actual);
  const expectedNum = toNumber(expected);
  if (actualNum == null || expectedNum == null) return false;
  return actualNum > expectedNum;
}

/**
 * Greater than or equal comparison (numbers only)
 */
function greaterThanOrEqual(actual: any, expected: any): boolean {
  const actualNum = toNumber(actual);
  const expectedNum = toNumber(expected);
  if (actualNum == null || expectedNum == null) return false;
  return actualNum >= expectedNum;
}

/**
 * Less than comparison (numbers only)
 */
function lessThan(actual: any, expected: any): boolean {
  const actualNum = toNumber(actual);
  const expectedNum = toNumber(expected);
  if (actualNum == null || expectedNum == null) return false;
  return actualNum < expectedNum;
}

/**
 * Less than or equal comparison (numbers only)
 */
function lessThanOrEqual(actual: any, expected: any): boolean {
  const actualNum = toNumber(actual);
  const expectedNum = toNumber(expected);
  if (actualNum == null || expectedNum == null) return false;
  return actualNum <= expectedNum;
}

/**
 * Check if value is in array
 */
function inArray(actual: any, expected: any): boolean {
  if (!Array.isArray(expected)) return false;
  return expected.some(val => equals(actual, val));
}

/**
 * Check if array contains value
 */
function contains(actual: any, expected: any): boolean {
  if (!Array.isArray(actual)) return false;
  return actual.some(val => equals(val, expected));
}

/**
 * Check if array contains all values
 */
function containsAll(actual: any, expected: any): boolean {
  if (!Array.isArray(actual)) return false;
  if (!Array.isArray(expected)) return false;
  return expected.every(expectedVal => 
    actual.some(actualVal => equals(actualVal, expectedVal))
  );
}

/**
 * Check if string matches regex pattern
 */
function matches(actual: any, expected: any): boolean {
  if (typeof actual !== 'string') return false;
  if (typeof expected !== 'string') return false;
  
  try {
    const regex = new RegExp(expected);
    return regex.test(actual);
  } catch (error) {
    return false;
  }
}

/**
 * Check if string starts with prefix
 */
function startsWith(actual: any, expected: any): boolean {
  if (typeof actual !== 'string') return false;
  if (typeof expected !== 'string') return false;
  return actual.startsWith(expected);
}

/**
 * Check if string ends with suffix
 */
function endsWith(actual: any, expected: any): boolean {
  if (typeof actual !== 'string') return false;
  if (typeof expected !== 'string') return false;
  return actual.endsWith(expected);
}

/**
 * Convert value to number (with null for invalid values)
 */
function toNumber(value: any): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  }
  return null;
}

