/**
 * PR_TEMPLATE_FIELD_PRESENT Comparator
 * Migration Plan v5.0 - Sprint 1, Task 1.3
 *
 * Checks if required PR template field is present in PR body
 *
 * Phase 4: Migrated to structured IR output
 * - evaluateStructured(): Returns ObligationResult (NEW)
 * - evaluate(): Returns ComparatorResult (LEGACY, kept for backward compatibility)
 */

import type { Comparator, ComparatorResult, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import type { ObligationResult } from '../../ir/types.js';
import {
  createObligation,
  calculateGovernanceRisk,
} from '../../ir/obligationDSL.js';

export const prTemplateFieldPresentComparator: Comparator = {
  id: ComparatorId.PR_TEMPLATE_FIELD_PRESENT,
  version: '2.0.0', // Phase 4: Bumped to 2.0.0 (structured IR support)

  /**
   * NEW: Structured evaluation (Phase 4)
   * Returns fully structured ObligationResult
   */
  async evaluateStructured(context: PRContext, params: any): Promise<ObligationResult> {
    const { fieldName, title, controlObjective, decisionOnFail = 'block' } = params;

    // Create obligation builder
    const obligation = createObligation({
      id: `pr-template-field-${fieldName}`,
      title: title || `PR Template Field '${fieldName}' Present`,
      controlObjective: controlObjective || `Ensure PR template field '${fieldName}' is filled out`,
      scope: 'diff_derived',
      decisionOnFail: decisionOnFail as 'block' | 'warn' | 'pass',
    });

    // Get field patterns from workspace defaults
    const fieldConfig = context.defaults?.prTemplate?.requiredFields?.[fieldName];
    if (!fieldConfig) {
      return obligation.notEvaluable(
        `No PR template configuration found for field: ${fieldName}`,
        'policy_misconfig'
      );
    }

    // Check if any pattern matches
    for (const pattern of fieldConfig.matchAny) {
      try {
        const regex = new RegExp(pattern, 'i');
        const match = context.body.match(regex);
        if (match) {
          return obligation.pass(
            `PR template field '${fieldName}' found`
          );
        }
      } catch (error) {
        console.error(`[PR_TEMPLATE_FIELD_PRESENT] Invalid regex pattern: ${pattern}`, error);
      }
    }

    // Field not found - FAIL
    return obligation.fail({
      reasonCode: 'PR_FIELD_MISSING',
      reasonHuman: `PR template field '${fieldName}' not found. Expected patterns: ${fieldConfig.matchAny.join(', ')}`,
      evidence: [{
        location: 'PR body',
        found: false,
        value: null,
        context: `Expected to match one of: ${fieldConfig.matchAny.join(', ')}`,
      }],
      evidenceSearch: {
        locationsSearched: ['PR body'],
        strategy: 'regex_pattern_matching',
        confidence: 1.0,
      },
      remediation: {
        minimumToPass: [
          `Add '${fieldName}' field to PR description`,
          `Field must match one of these patterns: ${fieldConfig.matchAny.join(', ')}`,
        ],
        patch: null,
        links: [],
        owner: params.owner || 'pr-author',
      },
      risk: calculateGovernanceRisk({
        isBlocking: decisionOnFail === 'block',
        affectsProduction: false,
        requiresAudit: true,
      }),
    });
  },

  /**
   * LEGACY: Unstructured evaluation (backward compatibility)
   * Kept for existing integrations
   */
  async evaluate(context: PRContext, params: any): Promise<ComparatorResult> {
    const { fieldName } = params;

    // Get field patterns from workspace defaults
    const fieldConfig = context.defaults?.prTemplate?.requiredFields?.[fieldName];
    if (!fieldConfig) {
      return {
        comparatorId: this.id,
        status: 'unknown',
        evidence: [],
        reasonCode: FindingCode.NOT_EVALUABLE,
        message: `No PR template configuration found for field: ${fieldName}`,
      };
    }

    // Check if any pattern matches
    for (const pattern of fieldConfig.matchAny) {
      try {
        const regex = new RegExp(pattern, 'i');
        const match = context.body.match(regex);
        if (match) {
          return {
            comparatorId: this.id,
            status: 'pass',
            evidence: [{
              type: 'snippet',
              file: 'PR body',
              lineStart: 0,
              lineEnd: 0,
              content: match[0].substring(0, 200), // First 200 chars
            }],
            reasonCode: FindingCode.PASS,
            message: `PR template field '${fieldName}' found`,
          };
        }
      } catch (error) {
        console.error(`[PR_TEMPLATE_FIELD_PRESENT] Invalid regex pattern: ${pattern}`, error);
      }
    }

    return {
      comparatorId: this.id,
      status: 'fail',
      evidence: [],
      reasonCode: FindingCode.PR_FIELD_MISSING,
      message: `PR template field '${fieldName}' not found. Expected patterns: ${fieldConfig.matchAny.join(', ')}`,
    };
  },
};

