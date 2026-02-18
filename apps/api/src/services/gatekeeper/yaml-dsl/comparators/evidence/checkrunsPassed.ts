/**
 * CHECKRUNS_PASSED Comparator
 * Migration Plan v5.0 - Sprint 1, Task 1.3
 * 
 * Checks if required CI check runs have passed
 */

import type { Comparator, ComparatorResult, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';

export const checkrunsPassedComparator: Comparator = {
  id: ComparatorId.CHECKRUNS_PASSED,
  version: '1.0.0',

  async evaluate(context: PRContext, params: any): Promise<ComparatorResult> {
    const { requiredChecks } = params;

    if (!requiredChecks || requiredChecks.length === 0) {
      return {
        comparatorId: this.id,
        status: 'unknown',
        evidence: [],
        reasonCode: FindingCode.NOT_EVALUABLE,
        message: 'No required checks specified',
      };
    }

    // Fetch check runs from cache or API
    let checkRuns = context.cache.checkRuns;
    if (!checkRuns) {
      const response = await context.github.rest.checks.listForRef({
        owner: context.owner,
        repo: context.repo,
        ref: context.headSha,
      });
      checkRuns = response.data.check_runs;
      context.cache.checkRuns = checkRuns;
    }

    const failedChecks: string[] = [];
    const missingChecks: string[] = [];
    const passedChecks: string[] = [];

    for (const requiredCheck of requiredChecks) {
      const checkRun = checkRuns.find((cr: any) => cr.name === requiredCheck);
      
      if (!checkRun) {
        missingChecks.push(requiredCheck);
      } else if (checkRun.conclusion === 'success') {
        passedChecks.push(requiredCheck);
      } else {
        failedChecks.push(requiredCheck);
      }
    }

    if (missingChecks.length > 0) {
      return {
        comparatorId: this.id,
        status: 'fail',
        evidence: missingChecks.map(name => ({
          type: 'checkrun',
          name,
          conclusion: 'missing',
          url: '',
        })),
        reasonCode: FindingCode.CHECKRUNS_REQUIRED_MISSING,
        message: `Required checks not found: ${missingChecks.join(', ')}`,
      };
    }

    if (failedChecks.length > 0) {
      return {
        comparatorId: this.id,
        status: 'fail',
        evidence: failedChecks.map(name => {
          const checkRun = checkRuns.find((cr: any) => cr.name === name);
          return {
            type: 'checkrun',
            name,
            conclusion: checkRun?.conclusion || 'unknown',
            url: checkRun?.html_url || '',
          };
        }),
        reasonCode: FindingCode.CHECKRUNS_FAILED,
        message: `Required checks failed: ${failedChecks.join(', ')}`,
      };
    }

    return {
      comparatorId: this.id,
      status: 'pass',
      evidence: passedChecks.map(name => {
        const checkRun = checkRuns.find((cr: any) => cr.name === name);
        return {
          type: 'checkrun',
          name,
          conclusion: 'success',
          url: checkRun?.html_url || '',
        };
      }),
      reasonCode: FindingCode.PASS,
      message: `All required checks passed: ${passedChecks.join(', ')}`,
    };
  },
};

