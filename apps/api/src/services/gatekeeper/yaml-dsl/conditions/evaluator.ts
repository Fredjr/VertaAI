/**
 * Condition Evaluator
 * Phase 2.2 - Hybrid Comparator/Fact-Based Approach
 * 
 * Evaluates fact-based conditions with operators and logical composition
 */

import type {
  Condition,
  SimpleCondition,
  CompositeCondition,
  ConditionEvaluationResult,
  ConditionContext,
} from './types.js';
import { isSimpleCondition, isCompositeCondition } from './types.js';
import { evaluateOperator } from './operators.js';

/**
 * Evaluate a condition against a context
 */
export function evaluateCondition(
  condition: Condition,
  context: ConditionContext
): ConditionEvaluationResult {
  if (isSimpleCondition(condition)) {
    return evaluateSimpleCondition(condition, context);
  } else if (isCompositeCondition(condition)) {
    return evaluateCompositeCondition(condition, context);
  } else {
    return {
      satisfied: false,
      condition,
      error: 'Invalid condition type',
    };
  }
}

/**
 * Evaluate a simple condition (fact + operator + value)
 */
function evaluateSimpleCondition(
  condition: SimpleCondition,
  context: ConditionContext
): ConditionEvaluationResult {
  const { fact, operator, value: expectedValue } = condition;

  // Get actual value from facts
  const actualValue = context.facts[fact];

  // Check if fact exists
  if (actualValue === undefined) {
    return {
      satisfied: false,
      condition,
      actualValue: undefined,
      expectedValue,
      operator,
      error: `Fact '${fact}' not found in context`,
    };
  }

  // Evaluate operator
  try {
    const satisfied = evaluateOperator(operator, actualValue, expectedValue);
    return {
      satisfied,
      condition,
      actualValue,
      expectedValue,
      operator,
    };
  } catch (error: any) {
    return {
      satisfied: false,
      condition,
      actualValue,
      expectedValue,
      operator,
      error: `Error evaluating operator '${operator}': ${error.message}`,
    };
  }
}

/**
 * Evaluate a composite condition (AND/OR/NOT)
 */
function evaluateCompositeCondition(
  condition: CompositeCondition,
  context: ConditionContext
): ConditionEvaluationResult {
  const { operator, conditions } = condition;

  // Validate conditions array
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return {
      satisfied: false,
      condition,
      error: `Composite condition must have at least one child condition`,
    };
  }

  // Evaluate child conditions
  const childResults = conditions.map(child => evaluateCondition(child, context));

  // Apply logical operator
  let satisfied: boolean;
  switch (operator) {
    case 'AND':
      satisfied = childResults.every(result => result.satisfied);
      break;
    
    case 'OR':
      satisfied = childResults.some(result => result.satisfied);
      break;
    
    case 'NOT':
      // NOT should have exactly one child
      if (conditions.length !== 1) {
        return {
          satisfied: false,
          condition,
          childResults,
          error: `NOT operator must have exactly one child condition (found ${conditions.length})`,
        };
      }
      satisfied = !childResults[0].satisfied;
      break;
    
    default:
      return {
        satisfied: false,
        condition,
        childResults,
        error: `Unknown logical operator: ${operator}`,
      };
  }

  return {
    satisfied,
    condition,
    childResults,
  };
}

/**
 * Evaluate multiple conditions (convenience function)
 */
export function evaluateConditions(
  conditions: Condition[],
  context: ConditionContext
): ConditionEvaluationResult[] {
  return conditions.map(condition => evaluateCondition(condition, context));
}

