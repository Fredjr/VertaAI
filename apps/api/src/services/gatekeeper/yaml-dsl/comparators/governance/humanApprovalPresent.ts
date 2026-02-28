/**
 * HUMAN_APPROVAL_PRESENT Comparator
 * Migration Plan v5.0 - Sprint 1, Task 1.3
 *
 * Checks if PR has at least one human (non-bot) approval
 * CRITICAL: Respects approval semantics from workspace defaults
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

export const humanApprovalPresentComparator: Comparator = {
  id: ComparatorId.HUMAN_APPROVAL_PRESENT,
  version: '2.0.0', // Phase 4: Bumped to 2.0.0 (structured IR support)

  /**
   * NEW: Structured evaluation (Phase 4)
   * Returns fully structured ObligationResult
   */
  async evaluateStructured(context: PRContext, params: any): Promise<ObligationResult> {
    const { title, controlObjective, decisionOnFail = 'block' } = params;

    // Create obligation builder
    const obligation = createObligation({
      id: 'human-approval-present',
      title: title || 'Human Approval Present',
      controlObjective: controlObjective || 'Ensure at least one human (non-bot) has approved the PR',
      scope: 'diff_derived',
      decisionOnFail: decisionOnFail as 'block' | 'warn' | 'pass',
    });

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

    // At least one human approval - PASS
    if (validApprovals.length > 0) {
      return obligation.pass(
        `Found ${validApprovals.length} human approval(s)`
      );
    }

    // No human approvals - FAIL
    const allBots = approvals.every((review: any) =>
      isBot(review.user.login, approvalConfig.ignoredUsers)
    );

    const reasonCode = allBots ? 'APPROVALS_ALL_BOTS' : 'NO_HUMAN_APPROVAL';
    const reasonHuman = allBots
      ? 'All approvals are from bots'
      : 'No human approval found';

    return obligation.fail({
      reasonCode: reasonCode as any,
      reasonHuman,
      evidence: [{
        location: 'PR approvals',
        found: false,
        value: null,
        context: allBots ? `${approvals.length} bot approval(s) found` : 'No approvals found',
      }],
      evidenceSearch: {
        locationsSearched: ['PR reviews'],
        strategy: 'github_reviews_api',
        confidence: 1.0,
      },
      remediation: {
        minimumToPass: [
          'Request review from a human team member',
          'Wait for at least one human approval',
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
      // Check state
      if (!approvalConfig.countOnlyStates.includes(review.state)) {
        return false;
      }

      // Check if bot (if configured to ignore bots)
      if (approvalConfig.ignoreBots && isBot(review.user.login, approvalConfig.ignoredUsers)) {
        return false;
      }

      return true;
    });

    if (validApprovals.length === 0) {
      const allBots = approvals.every((review: any) => 
        isBot(review.user.login, approvalConfig.ignoredUsers)
      );

      return {
        comparatorId: this.id,
        status: 'fail',
        evidence: [],
        reasonCode: allBots ? FindingCode.APPROVALS_ALL_BOTS : FindingCode.NO_HUMAN_APPROVAL,
        message: allBots 
          ? 'All approvals are from bots' 
          : 'No human approval found',
      };
    }

    return {
      comparatorId: this.id,
      status: 'pass',
      evidence: validApprovals.map((review: any) => ({
        type: 'approval',
        user: review.user.login,
        timestamp: review.submitted_at,
      })),
      reasonCode: FindingCode.PASS,
      message: `Found ${validApprovals.length} human approval(s)`,
    };
  },
};

