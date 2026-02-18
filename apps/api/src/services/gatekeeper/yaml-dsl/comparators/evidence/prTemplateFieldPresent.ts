/**
 * PR_TEMPLATE_FIELD_PRESENT Comparator
 * Migration Plan v5.0 - Sprint 1, Task 1.3
 * 
 * Checks if required PR template field is present in PR body
 */

import type { Comparator, ComparatorResult, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';

export const prTemplateFieldPresentComparator: Comparator = {
  id: ComparatorId.PR_TEMPLATE_FIELD_PRESENT,
  version: '1.0.0',

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

