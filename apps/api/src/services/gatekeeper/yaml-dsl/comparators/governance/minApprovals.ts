/**
 * MIN_APPROVALS Comparator
 * Migration Plan v5.0 - Sprint 1, Task 1.3
 *
 * Checks if PR has minimum number of approvals
 * CRITICAL: Respects approval semantics from workspace defaults
 *
 * Phase 4: Migrated to structured IR output
 * - evaluateStructured(): Returns ObligationResult (NEW)
 * - evaluate(): Returns ComparatorResult (LEGACY, kept for backward compatibility)
 */

import type { Comparator, ComparatorResult, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import { formatMessage } from '../../ir/messageCatalog.js';
import type { ObligationResult } from '../../ir/types.js';
import {
  createObligation,
  calculateGovernanceRisk,
} from '../../ir/obligationDSL.js';

const BOT_PATTERNS = [
  /\[bot\]$/,
  /^dependabot/,
  /^renovate/,
  /^github-actions/,
];

function isBot(username: string, ignoredUsers: string[]): boolean {
  if (ignoredUsers.includes(username)) return true;
  return BOT_PATTERNS.some(pattern => pattern.test(username));
}

export const minApprovalsComparator: Comparator = {
  id: ComparatorId.MIN_APPROVALS,
  version: '2.0.0', // Phase 4: Bumped to 2.0.0 (structured IR support)

  /**
   * NEW: Structured evaluation (Phase 4)
   * Returns fully structured ObligationResult
   */
  async evaluateStructured(context: PRContext, params: any): Promise<ObligationResult> {
    const { minCount, title, controlObjective, decisionOnFail = 'block' } = params;

    // Create obligation builder
    const obligation = createObligation({
      id: 'min-approvals',
      title: title || `Minimum ${minCount} Approval(s)`,
      controlObjective: controlObjective || `Ensure PR has at least ${minCount} approval(s) before merge`,
      scope: 'diff_derived',
      decisionOnFail: decisionOnFail as 'block' | 'warn' | 'pass',
    });

    if (!minCount || minCount < 1) {
      return obligation.notEvaluableWithMessage(
        'not_evaluable.policy_misconfig',
        { detail: 'Invalid minCount parameter' },
        'policy_misconfig'
      );
    }

    // Get approval semantics from workspace defaults
    const approvalConfig = context.defaults?.approvals || {
      countOnlyStates: ['APPROVED'],
      ignoreBots: true,
      ignoredUsers: [],
    };

    // Fetch approvals from cache or API
    let approvals = context.cache.approvals;
    if (!approvals) {
      const response = await context.github.rest.pulls.listReviews({
        owner: context.owner,
        repo: context.repo,
        pull_number: context.prNumber,
      });
      approvals = response.data;
      context.cache.approvals = approvals;
    }

    // Filter approvals based on semantics
    const validApprovals = approvals.filter((review: any) => {
      if (!approvalConfig.countOnlyStates.includes(review.state)) {
        return false;
      }
      if (approvalConfig.ignoreBots && isBot(review.user.login, approvalConfig.ignoredUsers)) {
        return false;
      }
      return true;
    });

    // Minimum approvals met - PASS
    if (validApprovals.length >= minCount) {
      return obligation.passWithMessage(
        'pass.governance.min_approvals_met',
        {
          count: validApprovals.length.toString(),
          minCount: minCount.toString(),
        }
      );
    }

    // Insufficient approvals - FAIL
    return obligation.failWithMessage({
      reasonCode: 'INSUFFICIENT_APPROVALS',
      messageId: 'fail.governance.insufficient_approvals',
      messageParams: {
        count: validApprovals.length.toString(),
        minCount: minCount.toString(),
      },
      evidence: validApprovals.map((review: any) => ({
        location: `Approval by ${review.user.login}`,
        found: true,
        value: review.state,
        context: review.submitted_at,
      })),
      evidenceSearch: {
        locationsSearched: ['PR reviews'],
        strategy: 'github_reviews_api',
        confidence: 1.0,
      },
      remediation: {
        minimumToPass: [
          `Request ${minCount - validApprovals.length} more approval(s)`,
          'Wait for reviewers to approve',
        ],
        patch: null,
        links: [],
        owner: params.owner || 'pr-author',
      },
      risk: calculateGovernanceRisk({
        isBlocking: decisionOnFail === 'block',
        affectsProduction: true,
        requiresAudit: true,
      }),
    });
  },

  /**
   * LEGACY: Unstructured evaluation (backward compatibility)
   * Kept for existing integrations
   */
  async evaluate(context: PRContext, params: any): Promise<ComparatorResult> {
    const { minCount } = params;

    if (!minCount || minCount < 1) {
      return {
        comparatorId: this.id,
        status: 'unknown',
        evidence: [],
        reasonCode: FindingCode.NOT_EVALUABLE,
        message: 'Invalid minCount parameter',
      };
    }

    // Get approval semantics from workspace defaults
    const approvalConfig = context.defaults?.approvals || {
      countOnlyStates: ['APPROVED'],
      ignoreBots: true,
      ignoredUsers: [],
    };

    // Fetch approvals from cache or API
    let approvals = context.cache.approvals;
    if (!approvals) {
      const response = await context.github.rest.pulls.listReviews({
        owner: context.owner,
        repo: context.repo,
        pull_number: context.prNumber,
      });
      approvals = response.data;
      context.cache.approvals = approvals;
    }

    // Filter approvals based on semantics
    const validApprovals = approvals.filter((review: any) => {
      if (!approvalConfig.countOnlyStates.includes(review.state)) {
        return false;
      }
      if (approvalConfig.ignoreBots && isBot(review.user.login, approvalConfig.ignoredUsers)) {
        return false;
      }
      return true;
    });

    if (validApprovals.length >= minCount) {
      return {
        comparatorId: this.id,
        status: 'pass',
        evidence: validApprovals.slice(0, minCount).map((review: any) => ({
          type: 'approval',
          user: review.user.login,
          timestamp: review.submitted_at,
        })),
        reasonCode: FindingCode.PASS,
        message: `Found ${validApprovals.length} approval(s), required ${minCount}`,
      };
    }

    return {
      comparatorId: this.id,
      status: 'fail',
      evidence: validApprovals.map((review: any) => ({
        type: 'approval',
        user: review.user.login,
        timestamp: review.submitted_at,
      })),
      reasonCode: FindingCode.INSUFFICIENT_APPROVALS,
      message: `Found ${validApprovals.length} approval(s), required ${minCount}`,
    };
  },
};

