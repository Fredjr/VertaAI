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

export interface Finding {
  ruleId: string;
  ruleName: string;
  obligationIndex: number;
  comparatorResult: ComparatorResult;
  decisionOnFail: 'pass' | 'warn' | 'block';
  decisionOnUnknown?: 'pass' | 'warn' | 'block';
}

export interface PackEvaluationResult {
  decision: 'pass' | 'warn' | 'block';
  findings: Finding[];
  triggeredRules: string[];
  packHash: string;
  packSource: string;
  evaluationTimeMs: number;
  budgetExhausted: boolean;
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

      // Evaluate trigger
      if (!evaluateTrigger(rule.trigger, context)) {
        continue;
      }

      triggeredRules.push(rule.id);

      // Evaluate obligations
      for (let i = 0; i < rule.obligations.length; i++) {
        const obligation = rule.obligations[i];

        try {
          const result = await comparatorRegistry.evaluate(
            obligation.comparatorId,
            context,
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

    return {
      decision,
      findings,
      triggeredRules,
      packHash,
      packSource,
      evaluationTimeMs,
      budgetExhausted,
    };
  }
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
 * Evaluate trigger conditions
 */
function evaluateTrigger(trigger: any, context: PRContext): boolean {
  // anyChangedPaths (OR semantics)
  if (trigger.anyChangedPaths && trigger.anyChangedPaths.length > 0) {
    const matches = context.files.some(file =>
      trigger.anyChangedPaths.some((pattern: string) =>
        minimatch(file.filename, pattern, { dot: true })
      )
    );
    if (matches) return true;
  }

  // allChangedPaths (AND semantics)
  if (trigger.allChangedPaths && trigger.allChangedPaths.length > 0) {
    const allMatch = trigger.allChangedPaths.every((pattern: string) =>
      context.files.some(file => minimatch(file.filename, pattern, { dot: true }))
    );
    if (allMatch) return true;
  }

  // anyFileExtensions
  if (trigger.anyFileExtensions && trigger.anyFileExtensions.length > 0) {
    const matches = context.files.some(file =>
      trigger.anyFileExtensions.some((ext: string) => file.filename.endsWith(ext))
    );
    if (matches) return true;
  }

  return false;
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

