/**
 * Comparator to Fact Translation
 * Phase 2.3 - Hybrid Comparator/Fact-Based Approach
 * 
 * Translates comparator-based obligations to fact-based conditions
 * for backward compatibility and migration support
 */

import { ComparatorId } from '../types.js';
import type { Condition } from '../conditions/types.js';

/**
 * Translation result
 */
export interface TranslationResult {
  success: boolean;
  conditions?: Condition[];
  error?: string;
}

/**
 * Translate a comparator to fact-based conditions
 * 
 * This enables:
 * 1. Backward compatibility - old comparators can be expressed as conditions
 * 2. Migration path - users can see how comparators map to conditions
 * 3. Hybrid evaluation - evaluate both comparators and conditions
 */
export function translateComparatorToConditions(
  comparatorId: ComparatorId,
  params: any
): TranslationResult {
  switch (comparatorId) {
    case ComparatorId.MIN_APPROVALS:
      return translateMinApprovals(params);
    
    case ComparatorId.HUMAN_APPROVAL_PRESENT:
      return translateHumanApprovalPresent(params);
    
    case ComparatorId.CHANGED_PATH_MATCHES:
      return translateChangedPathMatches(params);
    
    case ComparatorId.ARTIFACT_PRESENT:
      return translateArtifactPresent(params);
    
    case ComparatorId.ARTIFACT_UPDATED:
      return translateArtifactUpdated(params);
    
    case ComparatorId.CHECKRUNS_PASSED:
      return translateCheckrunsPassed(params);
    
    case ComparatorId.PR_TEMPLATE_FIELD_PRESENT:
      return translatePrTemplateFieldPresent(params);
    
    case ComparatorId.NO_SECRETS_IN_DIFF:
      return translateNoSecretsInDiff(params);
    
    case ComparatorId.ACTOR_IS_AGENT:
      return translateActorIsAgent(params);
    
    default:
      return {
        success: false,
        error: `No translation available for comparator: ${comparatorId}`,
      };
  }
}

/**
 * MIN_APPROVALS → pr.approvals.count >= minCount
 */
function translateMinApprovals(params: any): TranslationResult {
  const { minCount } = params;
  
  if (!minCount || minCount < 1) {
    return {
      success: false,
      error: 'Invalid minCount parameter',
    };
  }

  return {
    success: true,
    conditions: [
      {
        fact: 'pr.approvals.count',
        operator: '>=',
        value: minCount,
      },
    ],
  };
}

/**
 * HUMAN_APPROVAL_PRESENT → pr.approvals.count > 0
 * (Note: This is simplified - actual implementation filters bots)
 */
function translateHumanApprovalPresent(params: any): TranslationResult {
  return {
    success: true,
    conditions: [
      {
        fact: 'pr.approvals.count',
        operator: '>',
        value: 0,
      },
    ],
  };
}

/**
 * CHANGED_PATH_MATCHES → diff.filesChanged.paths contains pattern
 * (Note: This is simplified - actual implementation uses glob matching)
 */
function translateChangedPathMatches(params: any): TranslationResult {
  const { pattern } = params;
  
  if (!pattern) {
    return {
      success: false,
      error: 'Missing pattern parameter',
    };
  }

  // For simple patterns, we can use contains
  // For complex glob patterns, this is a best-effort translation
  return {
    success: true,
    conditions: [
      {
        fact: 'diff.filesChanged.paths',
        operator: 'matches',
        value: pattern,
      },
    ],
  };
}

/**
 * ARTIFACT_PRESENT → Not directly translatable to facts
 * (Requires artifact resolution which is not a simple fact)
 */
function translateArtifactPresent(params: any): TranslationResult {
  return {
    success: false,
    error: 'ARTIFACT_PRESENT requires artifact resolution and cannot be translated to simple facts',
  };
}

/**
 * ARTIFACT_UPDATED → Not directly translatable to facts
 */
function translateArtifactUpdated(params: any): TranslationResult {
  return {
    success: false,
    error: 'ARTIFACT_UPDATED requires artifact resolution and cannot be translated to simple facts',
  };
}

/**
 * CHECKRUNS_PASSED → Not directly translatable to facts
 * (Requires GitHub API calls to check run status)
 */
function translateCheckrunsPassed(params: any): TranslationResult {
  return {
    success: false,
    error: 'CHECKRUNS_PASSED requires GitHub API calls and cannot be translated to simple facts',
  };
}

/**
 * PR_TEMPLATE_FIELD_PRESENT → pr.body matches pattern
 */
function translatePrTemplateFieldPresent(params: any): TranslationResult {
  const { fieldName } = params;

  if (!fieldName) {
    return {
      success: false,
      error: 'Missing fieldName parameter',
    };
  }

  // Look for field in PR body (simplified - actual implementation is more complex)
  return {
    success: true,
    conditions: [
      {
        fact: 'pr.body',
        operator: 'matches',
        value: `${fieldName}:.*\\S`,  // Field name followed by non-empty content
      },
    ],
  };
}

/**
 * NO_SECRETS_IN_DIFF → Not directly translatable to facts
 * (Requires secret scanning which is not a simple fact)
 */
function translateNoSecretsInDiff(params: any): TranslationResult {
  return {
    success: false,
    error: 'NO_SECRETS_IN_DIFF requires secret scanning and cannot be translated to simple facts',
  };
}

/**
 * ACTOR_IS_AGENT → actor.user matches bot pattern
 */
function translateActorIsAgent(params: any): TranslationResult {
  return {
    success: true,
    conditions: [
      {
        fact: 'actor.user',
        operator: 'matches',
        value: '\\[bot\\]$|^dependabot|^renovate|^github-actions',
      },
    ],
  };
}

/**
 * Get all translatable comparators
 */
export function getTranslatableComparators(): ComparatorId[] {
  return [
    ComparatorId.MIN_APPROVALS,
    ComparatorId.HUMAN_APPROVAL_PRESENT,
    ComparatorId.CHANGED_PATH_MATCHES,
    ComparatorId.PR_TEMPLATE_FIELD_PRESENT,
    ComparatorId.ACTOR_IS_AGENT,
  ];
}

/**
 * Check if a comparator can be translated to conditions
 */
export function isTranslatable(comparatorId: ComparatorId): boolean {
  return getTranslatableComparators().includes(comparatorId);
}

