/**
 * HUMAN_APPROVAL_PRESENT Comparator
 * Migration Plan v5.0 - Sprint 1, Task 1.3
 * 
 * Checks if PR has at least one human (non-bot) approval
 * CRITICAL: Respects approval semantics from workspace defaults
 */

import type { Comparator, ComparatorResult, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';

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
  version: '1.0.0',

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

