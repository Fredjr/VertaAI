/**
 * CHECKRUNS_PASSED Comparator
 * Migration Plan v5.0 - Sprint 1, Task 1.3
 *
 * Checks if required CI check runs have passed
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

export const checkrunsPassedComparator: Comparator = {
  id: ComparatorId.CHECKRUNS_PASSED,
  version: '2.0.0', // Phase 4: Bumped to 2.0.0 (structured IR support)

  /**
   * NEW: Structured evaluation (Phase 4)
   * Returns fully structured ObligationResult
   */
  async evaluateStructured(context: PRContext, params: any): Promise<ObligationResult> {
    const { requiredChecks, title, controlObjective, decisionOnFail = 'block' } = params;

    // Create obligation builder
    const obligation = createObligation({
      id: 'checkruns-passed',
      title: title || 'Required CI Checks Passed',
      controlObjective: controlObjective || 'Ensure all required CI checks have passed before merge',
      scope: 'diff_derived',
      decisionOnFail: decisionOnFail as 'block' | 'warn' | 'pass',
    });

    if (!requiredChecks || requiredChecks.length === 0) {
      return obligation.notEvaluableWithMessage(
        'not_evaluable.policy_misconfig',
        { detail: 'No required checks specified' },
        'policy_misconfig'
      );
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

    // CRITICAL FIX (Gap #5): Exclude VertaAI checks from required checks to avoid recursion
    const externalCheckRuns = checkRuns.filter((check: any) =>
      !check.name?.startsWith('VertaAI') &&
      !check.app?.slug?.includes('vertaai')
    );

    const failedChecks: string[] = [];
    const missingChecks: string[] = [];
    const passedChecks: string[] = [];
    const skippedChecks: string[] = [];

    for (const requiredCheck of requiredChecks) {
      // Skip if this is a VertaAI check (self-reference)
      if (requiredCheck.includes('VertaAI') || requiredCheck.includes('vertaai')) {
        console.warn(`[CheckRunsComparator] Skipping self-referential check: ${requiredCheck}`);
        skippedChecks.push(requiredCheck);
        continue;
      }

      const checkRun = externalCheckRuns.find((cr: any) => cr.name === requiredCheck);

      if (!checkRun) {
        missingChecks.push(requiredCheck);
      } else if (checkRun.conclusion === 'success') {
        passedChecks.push(requiredCheck);
      } else {
        failedChecks.push(requiredCheck);
      }
    }

    // All checks passed - PASS
    if (missingChecks.length === 0 && failedChecks.length === 0) {
      return obligation.passWithMessage(
        'pass.evidence.checkruns_passed',
        { checkNames: passedChecks.join(', ') }
      );
    }

    // Some checks missing or failed - FAIL
    const reasonCode = missingChecks.length > 0 ? 'CHECKRUNS_REQUIRED_MISSING' : 'CHECKRUNS_FAILED';
    const messageId = missingChecks.length > 0
      ? 'fail.evidence.checkruns_missing'
      : 'fail.evidence.checkruns_failed';
    const messageParams = missingChecks.length > 0
      ? { checkNames: missingChecks.join(', ') }
      : { checkNames: failedChecks.join(', ') };

    return obligation.failWithMessage({
      reasonCode: reasonCode as any,
      messageId,
      messageParams,
      evidence: [
        ...missingChecks.map(name => ({
          location: `Check: ${name}`,
          found: false,
          value: null,
          context: 'Check run not found',
        })),
        ...failedChecks.map(name => {
          const checkRun = checkRuns.find((cr: any) => cr.name === name);
          return {
            location: `Check: ${name}`,
            found: true,
            value: checkRun?.conclusion || 'unknown',
            context: checkRun?.html_url || '',
          };
        }),
      ],
      evidenceSearch: {
        locationsSearched: requiredChecks,
        strategy: 'github_check_runs_api',
        confidence: 1.0,
      },
      remediation: {
        minimumToPass: [
          ...missingChecks.map(name => `Wait for check '${name}' to start`),
          ...failedChecks.map(name => `Fix failing check '${name}'`),
        ],
        patch: null,
        links: failedChecks.map(name => {
          const checkRun = checkRuns.find((cr: any) => cr.name === name);
          return checkRun?.html_url || '';
        }).filter(Boolean),
        owner: params.owner || 'pr-author',
      },
      risk: calculateGovernanceRisk({
        isBlocking: decisionOnFail === 'block',
        affectsProduction: true,
        requiresAudit: false,
      }),
    });
  },

  /**
   * LEGACY: Unstructured evaluation (backward compatibility)
   * Kept for existing integrations
   */
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

    // CRITICAL FIX (Gap #5): Exclude VertaAI checks from required checks to avoid recursion
    // Filter out VertaAI's own checks to prevent self-referential failures
    const externalCheckRuns = checkRuns.filter((check: any) =>
      !check.name?.startsWith('VertaAI') &&
      !check.app?.slug?.includes('vertaai')
    );

    const failedChecks: string[] = [];
    const missingChecks: string[] = [];
    const passedChecks: string[] = [];
    const skippedChecks: string[] = [];

    for (const requiredCheck of requiredChecks) {
      // Skip if this is a VertaAI check (self-reference)
      if (requiredCheck.includes('VertaAI') || requiredCheck.includes('vertaai')) {
        console.warn(`[CheckRunsComparator] Skipping self-referential check: ${requiredCheck}`);
        skippedChecks.push(requiredCheck);
        continue;
      }

      const checkRun = externalCheckRuns.find((cr: any) => cr.name === requiredCheck);

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

