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
// PHASE 2.1: Import fact resolution
import { resolveAllFacts } from './facts/resolver.js';
import { factCatalog } from './facts/catalog.js';
// PHASE 2.3: Import condition evaluation
import { evaluateCondition, evaluateConditions } from './conditions/evaluator.js';
import type { Condition, ConditionEvaluationResult } from './conditions/types.js';
// GAP-1 FIX: ChangeSurface → path-glob expansion
import { resolveChangeSurfaceGlobs } from './changeSurfaceCatalog.js';

export interface Finding {
  ruleId: string;
  ruleName: string;
  obligationIndex: number;
  // PHASE 2.3: Support both comparator and condition results
  comparatorResult?: ComparatorResult;
  conditionResult?: ConditionEvaluationResult;
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
  factCatalogVersion?: string;  // PHASE 2.1: Version of fact catalog used
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

    // Initialize cache if not already present
    if (!context.cache) {
      context.cache = {
        approvals: undefined,
        checkRuns: undefined,
        teamMemberships: new Map(),
      };
    }

    // ENHANCED: Initialize fact metadata storage for enhanced output context
    (context as any)._factMetadata = {};

    // PHASE 2.1: Resolve all facts upfront and attach to context
    // This allows comparators to access fact values without re-resolving
    try {
      const factResolution = resolveAllFacts(context);
      context.facts = factResolution.facts;
      context.factCatalogVersion = factResolution.catalogVersion;
    } catch (error: any) {
      console.warn(`[PackEvaluator] Failed to resolve facts:`, error.message);
      // Continue evaluation even if fact resolution fails
      context.facts = {};
      context.factCatalogVersion = factCatalog.getVersion();
    }

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

      // GAP-4: Evaluate trigger — handle both `trigger` (path-glob) and rule-level `when` (predicates)
      // If neither is defined, the rule always fires (e.g., approval-only rules).
      const ruleAny = rule as any;
      const hasTrigger = !!rule.trigger;
      const hasWhen = !!ruleAny.when;
      if (hasTrigger && !evaluateTrigger(rule.trigger, effectiveContext)) {
        continue;
      }
      if (!hasTrigger && hasWhen) {
        // Evaluate rule-level `when.predicates` and/or `when.changeSurfaces` using
        // the same expansion logic. Pass the entire `when` block so evaluateTrigger
        // can handle both sub-fields (GAP-4 + GAP-A).
        if (!evaluateTrigger({ when: ruleAny.when }, effectiveContext)) {
          continue;
        }
      }
      // If neither trigger nor when is defined → rule always fires

      triggeredRules.push(rule.id);

      // GAP-4: obligations are now optional (rules may use approvals/decision instead)
      if (!rule.obligations || rule.obligations.length === 0) {
        // Approval-only / decision-only rules: register as triggered with a synthetic PASS finding
        // The approvals/decision blocks will be evaluated by the approval routing layer (future work).
        findings.push({
          ruleId: rule.id,
          ruleName: rule.name,
          obligationIndex: -1,
          comparatorResult: { status: 'unknown', findingCode: 'APPROVAL_GATE' as FindingCode, evidence: [], meta: { approvalRule: true } },
          decisionOnFail: (ruleAny.decision?.onViolation) || 'warn',
          decisionOnUnknown: (ruleAny.decision?.onMissingExternalEvidence) || 'warn',
        });
        continue;
      }

      // Evaluate obligations (using same filtered context)
      for (let i = 0; i < rule.obligations.length; i++) {
        const obligation = rule.obligations[i];

        // PHASE 2.3: Support both comparator-based and condition-based obligations
        const comparatorId = obligation.comparator || obligation.comparatorId;
        const condition = obligation.condition;
        const conditions = obligation.conditions;
        // PHASE 2.4: Auto-generated condition from comparator (hybrid mode)
        const autoCondition = (obligation as any)._autoCondition;

        // Validate obligation has either comparator or condition
        if (!comparatorId && !condition && !conditions) {
          console.error(`[PackEvaluator] Obligation missing comparator/condition:`, obligation);
          continue;
        }

        try {
          // COMPARATOR-BASED OBLIGATION (with optional auto-condition for hybrid mode)
          if (comparatorId) {
            // CRITICAL FIX (Gap #1): Track comparator usage for fingerprint
            usedComparators.add(comparatorId);

            // CRITICAL FIX (Gap #5): Use filtered context for obligations too
            const result = await comparatorRegistry.evaluate(
              comparatorId,
              effectiveContext,
              obligation.params || {}
            );

            // PHASE 2.4: If auto-condition exists, also evaluate it for comparison
            let autoConditionResult: ConditionEvaluationResult | undefined;
            if (autoCondition) {
              const conditionContext = {
                facts: effectiveContext.facts || {},
                factCatalogVersion: effectiveContext.factCatalogVersion || factCatalog.getVersion(),
              };
              autoConditionResult = evaluateCondition(autoCondition as Condition, conditionContext);
            }

            findings.push({
              ruleId: rule.id,
              ruleName: rule.name,
              obligationIndex: i,
              comparatorResult: result,
              // PHASE 2.4: Include auto-condition result for hybrid visibility
              conditionResult: autoConditionResult,
              decisionOnFail: obligation.decisionOnFail,
              decisionOnUnknown: obligation.decisionOnUnknown || 'warn',
            });
          }
          // CONDITION-BASED OBLIGATION
          else if (condition || conditions) {
            // Build condition context from resolved facts
            const conditionContext = {
              facts: effectiveContext.facts || {},
              factCatalogVersion: effectiveContext.factCatalogVersion || factCatalog.getVersion(),
            };

            // Evaluate single condition or multiple conditions
            const conditionsToEvaluate = condition ? [condition] : (conditions || []);
            const conditionResults = conditionsToEvaluate.map(c =>
              evaluateCondition(c as Condition, conditionContext)
            );

            // Aggregate results: all conditions must be satisfied
            const allSatisfied = conditionResults.every(r => r.satisfied);
            const hasError = conditionResults.some(r => r.error);

            // ENHANCED: Extract metadata from PRContext for gate facts
            let metadata: any = undefined;
            if (conditionsToEvaluate.length === 1 && 'fact' in conditionsToEvaluate[0]) {
              const factId = (conditionsToEvaluate[0] as any).fact;
              if (factId.startsWith('gate.') && (context as any)._factMetadata) {
                metadata = (context as any)._factMetadata[factId];
              }
            }

            findings.push({
              ruleId: rule.id,
              ruleName: rule.name,
              obligationIndex: i,
              conditionResult: {
                satisfied: allSatisfied,
                condition: conditionsToEvaluate.length === 1
                  ? conditionsToEvaluate[0] as Condition
                  : { operator: 'AND', conditions: conditionsToEvaluate } as Condition,
                childResults: conditionResults.length > 1 ? conditionResults : undefined,
                error: hasError ? conditionResults.find(r => r.error)?.error : undefined,
                // ENHANCED: Include metadata for better output context
                ...(metadata ? { metadata } : {}),
              } as any,
              decisionOnFail: obligation.decisionOnFail,
              decisionOnUnknown: obligation.decisionOnUnknown || 'warn',
            });
          }
        } catch (error: any) {
          console.error(`[PackEvaluator] Error evaluating obligation:`, error);

          // Create error finding based on obligation type
          if (comparatorId) {
            findings.push({
              ruleId: rule.id,
              ruleName: rule.name,
              obligationIndex: i,
              comparatorResult: {
                comparatorId,
                status: 'unknown',
                evidence: [],
                reasonCode: 'UNKNOWN_ERROR' as FindingCode,
                message: error.message,
              },
              decisionOnFail: obligation.decisionOnFail,
              decisionOnUnknown: obligation.decisionOnUnknown || 'warn',
            });
          } else {
            findings.push({
              ruleId: rule.id,
              ruleName: rule.name,
              obligationIndex: i,
              conditionResult: {
                satisfied: false,
                condition: (condition || conditions?.[0]) as Condition,
                error: error.message,
              },
              decisionOnFail: obligation.decisionOnFail,
              decisionOnUnknown: obligation.decisionOnUnknown || 'warn',
            });
          }
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
    // PHASE 2.1: Include fact catalog version in fingerprint
    const engineFingerprint = buildEngineFingerprint(usedComparators, context.factCatalogVersion);

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
 * PHASE 2.1: Include fact catalog version for fact-based conditions
 */
function buildEngineFingerprint(
  usedComparators: Set<ComparatorId>,
  factCatalogVersion?: string
): EngineFingerprint {
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
    factCatalogVersion,  // PHASE 2.1: Track fact catalog version
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
 * 1. Check if trigger.always is true (always triggers)
 * 2. Evaluate ALL required conditions (allChangedPaths) - must ALL pass
 * 3. Evaluate ANY conditions (anyChangedPaths, anyFileExtensions, anyChangedPathsRef) - at least ONE must pass
 *
 * This prevents early returns from breaking allOf/anyOf composition
 */
function evaluateTrigger(trigger: any, context: PRContext): boolean {
  // Guard: undefined trigger → always fires (caller decides semantics)
  if (!trigger) return true;

  // PHASE 1 FIX: Support trigger.always
  if (trigger.always === true) {
    return true;
  }

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

  // GAP-1 FIX: changeSurface — expand semantic surface to path globs and match
  // Surfaces may be a single id or an array of ids; union of all globs is OR'd.
  if (trigger.changeSurface) {
    const globs = resolveChangeSurfaceGlobs(trigger.changeSurface);
    if (globs.length > 0) {
      const matches = context.files.some(file =>
        globs.some(pattern => minimatch(file.filename, pattern, { dot: true }))
      );
      anyConditions.push(matches);
    }
    // If globs is empty (e.g., AGENT_AUTHORED_SENSITIVE_CHANGE is actor-only),
    // fall through — the rule will not trigger on file paths alone.
  }

  // GAP-4 / §1C: when.predicates.anyOf / allOf
  // Dual-mode resolution: first try as ChangeSurfaceId (expand to path globs);
  // if no globs found, treat as a HeuristicPredicateId and check detectedHeuristics.
  if (trigger.when?.predicates) {
    const { anyOf, allOf } = trigger.when.predicates;

    // Helper: resolve one predicate string — returns { globs, isHeuristic }
    const resolvePredicate = (id: string): { globs: string[]; isHeuristic: boolean } => {
      const globs = resolveChangeSurfaceGlobs(id as any);
      return globs.length > 0
        ? { globs, isHeuristic: false }
        : { globs: [], isHeuristic: true };
    };

    if (anyOf && anyOf.length > 0) {
      // anyOf: at least one predicate must be satisfied
      const satisfied = anyOf.some((id: string) => {
        const { globs, isHeuristic } = resolvePredicate(id);
        if (isHeuristic) {
          // Tier-2: check detectedHeuristics list; unknown heuristics degrade gracefully
          return (context.detectedHeuristics ?? []).includes(id);
        }
        // Tier-1: file path glob match
        return context.files.some(file =>
          globs.some(pattern => minimatch(file.filename, pattern, { dot: true }))
        );
      });
      anyConditions.push(satisfied);
    }

    if (allOf && allOf.length > 0) {
      // allOf: every predicate must be satisfied
      const allSatisfied = allOf.every((id: string) => {
        const { globs, isHeuristic } = resolvePredicate(id);
        if (isHeuristic) {
          return (context.detectedHeuristics ?? []).includes(id);
        }
        return globs.length === 0 ||
          context.files.some(file =>
            globs.some(pattern => minimatch(file.filename, pattern, { dot: true }))
          );
      });
      if (!allSatisfied) return false;
    }
  }

  // GAP-A FIX: when.changeSurfaces.anyOf / allOf — explicit ChangeSurfaceId-based trigger
  // Distinct from `predicates` — always expands to file path globs via changeSurfaceCatalog.
  if (trigger.when?.changeSurfaces) {
    const { anyOf, allOf } = trigger.when.changeSurfaces;
    if (anyOf && anyOf.length > 0) {
      const globs = resolveChangeSurfaceGlobs(anyOf);
      if (globs.length > 0) {
        const matches = context.files.some(file =>
          globs.some(pattern => minimatch(file.filename, pattern, { dot: true }))
        );
        anyConditions.push(matches);
      }
    }
    if (allOf && allOf.length > 0) {
      const allGlobs = allOf.map((s: string) => resolveChangeSurfaceGlobs(s as any));
      const allMatch = allGlobs.every((globs: string[]) =>
        globs.length === 0 ||
        context.files.some(file =>
          globs.some(pattern => minimatch(file.filename, pattern, { dot: true }))
        )
      );
      if (!allMatch) return false;
    }
  }

  // anyChangedPaths (OR semantics)
  if (trigger.anyChangedPaths && trigger.anyChangedPaths.length > 0) {
    const matches = context.files.some(file =>
      trigger.anyChangedPaths.some((pattern: string) =>
        minimatch(file.filename, pattern, { dot: true })
      )
    );
    anyConditions.push(matches);
  }

  // PHASE 1 FIX: Support anyChangedPathsRef (reference to workspace defaults paths)
  if (trigger.anyChangedPathsRef && context.defaults?.paths) {
    const referencedPaths = context.defaults.paths[trigger.anyChangedPathsRef];
    if (referencedPaths && referencedPaths.length > 0) {
      const matches = context.files.some(file =>
        referencedPaths.some((pattern: string) =>
          minimatch(file.filename, pattern, { dot: true })
        )
      );
      anyConditions.push(matches);
    }
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
 * PHASE 2.3: Support both comparator-based and condition-based findings
 */
function computeDecision(findings: Finding[]): 'pass' | 'warn' | 'block' {
  let hasWarn = false;

  for (const finding of findings) {
    const { comparatorResult, conditionResult, decisionOnFail, decisionOnUnknown } = finding;

    let decision: 'pass' | 'warn' | 'block' = 'pass';

    // COMPARATOR-BASED FINDING
    if (comparatorResult) {
      if (comparatorResult.status === 'fail') {
        decision = decisionOnFail;
      } else if (comparatorResult.status === 'unknown') {
        decision = decisionOnUnknown || 'warn';
      }
    }
    // CONDITION-BASED FINDING
    else if (conditionResult) {
      if (conditionResult.error) {
        // Error in condition evaluation → treat as unknown
        decision = decisionOnUnknown || 'warn';
      } else if (!conditionResult.satisfied) {
        // Condition not satisfied → treat as fail
        decision = decisionOnFail;
      }
      // else: condition satisfied → decision remains 'pass'
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

