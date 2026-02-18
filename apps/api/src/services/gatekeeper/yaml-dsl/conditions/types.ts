/**
 * Condition Types
 * Phase 2.2 - Hybrid Comparator/Fact-Based Approach
 * 
 * Type definitions for fact-based conditions
 */

/**
 * Comparison operators for fact-based conditions
 */
export type ComparisonOperator =
  | '=='      // Equal
  | '!='      // Not equal
  | '>'       // Greater than
  | '>='      // Greater than or equal
  | '<'       // Less than
  | '<='      // Less than or equal
  | 'in'      // Value in array
  | 'contains'     // Array contains value
  | 'containsAll'  // Array contains all values
  | 'matches'      // String matches regex
  | 'startsWith'   // String starts with
  | 'endsWith';    // String ends with

/**
 * Logical operators for composing conditions
 */
export type LogicalOperator = 'AND' | 'OR' | 'NOT';

/**
 * Simple condition comparing a fact to a value
 */
export interface SimpleCondition {
  fact: string;                    // Fact ID (e.g., "pr.approvals.count")
  operator: ComparisonOperator;    // Comparison operator
  value: any;                      // Value to compare against
}

/**
 * Composite condition using logical operators
 */
export interface CompositeCondition {
  operator: LogicalOperator;       // Logical operator (AND/OR/NOT)
  conditions: Condition[];         // Child conditions
}

/**
 * Condition can be simple or composite
 */
export type Condition = SimpleCondition | CompositeCondition;

/**
 * Type guard for simple condition
 */
export function isSimpleCondition(condition: Condition): condition is SimpleCondition {
  return 'fact' in condition && 'operator' in condition && 'value' in condition;
}

/**
 * Type guard for composite condition
 */
export function isCompositeCondition(condition: Condition): condition is CompositeCondition {
  return 'operator' in condition && 'conditions' in condition;
}

/**
 * Result of evaluating a condition
 */
export interface ConditionEvaluationResult {
  satisfied: boolean;              // Whether condition was satisfied
  condition: Condition;            // The condition that was evaluated
  actualValue?: any;               // Actual value of the fact (for simple conditions)
  expectedValue?: any;             // Expected value (for simple conditions)
  operator?: ComparisonOperator;   // Operator used (for simple conditions)
  childResults?: ConditionEvaluationResult[];  // Results of child conditions (for composite)
  error?: string;                  // Error message if evaluation failed
}

/**
 * Condition evaluation context
 */
export interface ConditionContext {
  facts: Record<string, any>;      // Resolved facts
  factCatalogVersion: string;      // Version of fact catalog used
}

