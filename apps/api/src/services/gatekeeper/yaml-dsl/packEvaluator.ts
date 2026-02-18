/**
 * Pack Evaluation Engine
 * Migration Plan v5.0 - Sprint 2
 * 
 * Evaluates pack rules against PR context
 */

import { minimatch } from 'minimatch';
import { comparatorRegistry } from './comparators/registry.js';
import type { PackYAML } from './packValidator.js';
import type { PRContext, ComparatorResult, FindingCode } from './comparators/types.js';
import { ComparatorId } from './types.js';

export interface Finding {
  ruleId: string;
  ruleName: string;
  obligationIndex: number;
  comparatorResult: ComparatorResult;
  decisionOnFail: 'pass' | 'warn' | 'block';
  decisionOnUnknown?: 'pass' | 'warn' | 'block';
}

/**
 * CRITICAL: Engine fingerprint for determinism over time (Gap #1 - Second Audit)
 * Ensures same pack + same PR = same decision even if comparator code changes
 */
export interface EngineFingerprint {
  evaluatorVersion: string;  // Git SHA or semantic version of evaluator code
  comparatorVersions: Record<string, string>;  // Version of each comparator used
  timestamp: string;  // ISO timestamp of evaluation
}

export interface PackEvaluationResult {
  decision: 'pass' | 'warn' | 'block';
  findings: Finding[];
  triggeredRules: string[];
  packHash: string;
  packSource: string;
  evaluationTimeMs: number;
  budgetExhausted: boolean;

  // CRITICAL FIX (Gap #1): Engine fingerprint for reproducibility
  engineFingerprint: EngineFingerprint;
}

export class PackEvaluator {
  async evaluate(
    pack: PackYAML,
    packHash: string,
    packSource: string,
    context: PRContext
  ): Promise<PackEvaluationResult> {
    const startTime = Date.now();
    const findings: Finding[] = [];
    const triggeredRules: string[] = [];

    // CRITICAL FIX (Gap #1): Track which comparators are used for fingerprint
    const usedComparators = new Set<ComparatorId>();

    // Initialize budgets
    const budgets = pack.evaluation?.budgets || {
      maxTotalMs: 30000,
      perComparatorTimeoutMs: 5000,
      maxGitHubApiCalls: 50,
    };

    context.budgets = {
      maxTotalMs: budgets.maxTotalMs || 30000,
      perComparatorTimeoutMs: budgets.perComparatorTimeoutMs || 5000,
      maxGitHubApiCalls: budgets.maxGitHubApiCalls || 50,
      currentApiCalls: 0,
      startTime: Date.now(),
    };

    // Initialize cache
    context.cache = {
      approvals: undefined,
      checkRuns: undefined,
      teamMemberships: new Map(),
    };

    // Evaluate each rule
    for (const rule of pack.rules) {
      // Check if rule should be skipped
      if (rule.skipIf && shouldSkipRule(rule.skipIf, context)) {
        continue;
      }

      // CRITICAL FIX (Gap #5): Apply excludePaths BEFORE trigger evaluation
      // This prevents rules from triggering on files they should ignore
      let effectiveContext = context;
      if (rule.excludePaths && rule.excludePaths.length > 0) {
        effectiveContext = filterExcludedFiles(context, rule.excludePaths);
      }

      // Evaluate trigger (using filtered context)
      if (!evaluateTrigger(rule.trigger, effectiveContext)) {
        continue;
      }

      triggeredRules.push(rule.id);

      // Evaluate obligations (using same filtered context)
      for (let i = 0; i < rule.obligations.length; i++) {
        const obligation = rule.obligations[i];

        // CRITICAL FIX (Gap #1): Track comparator usage for fingerprint
        usedComparators.add(obligation.comparatorId);

        try {
          // CRITICAL FIX (Gap #5): Use filtered context for obligations too
          const result = await comparatorRegistry.evaluate(
            obligation.comparatorId,
            effectiveContext,
            obligation.params || {}
          );

          findings.push({
            ruleId: rule.id,
            ruleName: rule.name,
            obligationIndex: i,
            comparatorResult: result,
            decisionOnFail: obligation.decisionOnFail,
            decisionOnUnknown: obligation.decisionOnUnknown || 'warn',
          });
        } catch (error: any) {
          console.error(`[PackEvaluator] Error evaluating obligation:`, error);
          findings.push({
            ruleId: rule.id,
            ruleName: rule.name,
            obligationIndex: i,
            comparatorResult: {
              comparatorId: obligation.comparatorId,
              status: 'unknown',
              evidence: [],
              reasonCode: 'UNKNOWN_ERROR' as FindingCode,
              message: error.message,
            },
            decisionOnFail: obligation.decisionOnFail,
            decisionOnUnknown: obligation.decisionOnUnknown || 'warn',
          });
        }

        // Check budget
        const elapsed = Date.now() - startTime;
        if (elapsed > context.budgets.maxTotalMs) {
          console.warn(`[PackEvaluator] Budget exhausted after ${elapsed}ms`);
          break;
        }
      }
    }

    // Compute decision
    const decision = computeDecision(findings);
    const evaluationTimeMs = Date.now() - startTime;
    const budgetExhausted = evaluationTimeMs > context.budgets.maxTotalMs;

    // CRITICAL FIX (Gap #1): Build engine fingerprint for determinism over time
    const engineFingerprint = buildEngineFingerprint(usedComparators);

    return {
      decision,
      findings,
      triggeredRules,
      packHash,
      packSource,
      evaluationTimeMs,
      budgetExhausted,
      engineFingerprint,
    };
  }
}

/**
 * CRITICAL FIX (Gap #1): Build engine fingerprint for reproducibility
 * Ensures same pack + same PR = same decision even if comparator code changes
 */
function buildEngineFingerprint(usedComparators: Set<ComparatorId>): EngineFingerprint {
  const comparatorVersions: Record<string, string> = {};

  for (const comparatorId of usedComparators) {
    const version = comparatorRegistry.getVersion(comparatorId);
    if (version) {
      comparatorVersions[comparatorId] = version;
    }
  }

  return {
    evaluatorVersion: process.env.GIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
    comparatorVersions,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check if rule should be skipped
 */
function shouldSkipRule(skipIf: any, context: PRContext): boolean {
  // Check labels
  if (skipIf.labels && skipIf.labels.length > 0) {
    const hasLabel = skipIf.labels.some((label: string) => context.labels.includes(label));
    if (hasLabel) return true;
  }

  // Check PR body contains
  if (skipIf.prBodyContains && skipIf.prBodyContains.length > 0) {
    const hasMatch = skipIf.prBodyContains.some((text: string) => context.body.includes(text));
    if (hasMatch) return true;
  }

  return false;
}

/**
 * CRITICAL FIX (Gap #4): Evaluate trigger conditions with composable semantics
 *
 * Trigger evaluation follows this order:
 * 1. Evaluate ALL required conditions (allChangedPaths) - must ALL pass
 * 2. Evaluate ANY conditions (anyChangedPaths, anyFileExtensions) - at least ONE must pass
 *
 * This prevents early returns from breaking allOf/anyOf composition
 */
function evaluateTrigger(trigger: any, context: PRContext): boolean {
  // Step 1: Evaluate ALL required conditions (AND preconditions)
  // If any allChangedPaths is defined, ALL patterns must match at least one file
  if (trigger.allChangedPaths && trigger.allChangedPaths.length > 0) {
    const allMatch = trigger.allChangedPaths.every((pattern: string) =>
      context.files.some(file => minimatch(file.filename, pattern, { dot: true }))
    );
    if (!allMatch) {
      // Precondition failed - rule doesn't trigger
      return false;
    }
  }

  // Step 2: Evaluate ANY conditions (OR semantics)
  // Collect all OR conditions
  const anyConditions: boolean[] = [];

  // anyChangedPaths (OR semantics)
  if (trigger.anyChangedPaths && trigger.anyChangedPaths.length > 0) {
    const matches = context.files.some(file =>
      trigger.anyChangedPaths.some((pattern: string) =>
        minimatch(file.filename, pattern, { dot: true })
      )
    );
    anyConditions.push(matches);
  }

  // anyFileExtensions (OR semantics)
  if (trigger.anyFileExtensions && trigger.anyFileExtensions.length > 0) {
    const matches = context.files.some(file =>
      trigger.anyFileExtensions.some((ext: string) => file.filename.endsWith(ext))
    );
    anyConditions.push(matches);
  }

  // Step 3: Final decision
  // If no ANY conditions defined, trigger passes (all preconditions passed)
  // If ANY conditions defined, at least one must be true
  return anyConditions.length > 0 ? anyConditions.some(c => c) : true;
}

/**
 * Compute final decision from findings
 * CRITICAL: BLOCK > WARN > PASS
 */
function computeDecision(findings: Finding[]): 'pass' | 'warn' | 'block' {
  let hasWarn = false;

  for (const finding of findings) {
    const { comparatorResult, decisionOnFail, decisionOnUnknown } = finding;

    let decision: 'pass' | 'warn' | 'block' = 'pass';

    if (comparatorResult.status === 'fail') {
      decision = decisionOnFail;
    } else if (comparatorResult.status === 'unknown') {
      decision = decisionOnUnknown || 'warn';
    }

    if (decision === 'block') {
      return 'block';  // Immediate block
    }
    if (decision === 'warn') {
      hasWarn = true;
    }
  }

  return hasWarn ? 'warn' : 'pass';
}

/**
 * CRITICAL FIX (Gap #5): Filter excluded files from context
 * Prevents rules from triggering on files they should ignore
 */
function filterExcludedFiles(context: PRContext, excludePaths: string[]): PRContext {
  return {
    ...context,
    files: context.files.filter(file =>
      !excludePaths.some(glob => minimatch(file.filename, glob, { dot: true }))
    ),
  };
}

