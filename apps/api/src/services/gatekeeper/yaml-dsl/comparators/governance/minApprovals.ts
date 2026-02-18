/**
 * MIN_APPROVALS Comparator
 * Migration Plan v5.0 - Sprint 1, Task 1.3
 * 
 * Checks if PR has minimum number of approvals
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

export const minApprovalsComparator: Comparator = {
  id: ComparatorId.MIN_APPROVALS,
  version: '1.0.0',

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

