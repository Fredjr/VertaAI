/**
 * Pack Evaluation Engine
 * Migration Plan v5.0 - Sprint 2
 *
 * Evaluates pack rules against PR context
 *
 * PHASE 3: Policy Evaluation Graph Architecture
 * Builds evaluation graph: Inputs → Surfaces → Obligations → Evidence → Invariants → Decision
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
// TRACK A TASK 2: Import auto-invoked comparators
import { runAutoInvokedComparators } from './autoInvokedComparators.js';
// GAP-1 FIX: ChangeSurface → path-glob expansion
import { resolveChangeSurfaceGlobs, CHANGE_SURFACE_GLOBS } from './changeSurfaceCatalog.js';
// PHASE 3: Import Policy Evaluation Graph types
import type {
  PackEvaluationGraph,
  PolicyEvaluationGraph,
  DetectedSurface,
  EvaluatedObligation,
  EvidenceItem,
  EvaluatedInvariant
} from './types.js';
import { ChangeSurfaceId } from './types.js';

export interface Finding {
  ruleId: string;
  ruleName: string;
  obligationIndex: number;
  // PHASE 2.3: Support both comparator and condition results
  comparatorResult?: ComparatorResult;
  conditionResult?: ConditionEvaluationResult;
  decisionOnFail: 'pass' | 'warn' | 'block';
  decisionOnUnknown?: 'pass' | 'warn' | 'block';
  // FIX A: Two-orthogonal-outcome model
  evaluationStatus: 'evaluated' | 'not_evaluable';
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

  // FIX A: Coverage reporting (two-orthogonal-outcome model)
  coverage: {
    evaluable: number;
    total: number;
    notEvaluable: number;
  };

  // PHASE 3: Policy Evaluation Graph (optional, built incrementally)
  evaluationGraph?: PackEvaluationGraph;
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

    // TRACK A TASK 2: Run auto-invoked comparators on every PR
    // These run BEFORE rule evaluation to detect drift and safety issues
    console.log('[PackEvaluator] Running auto-invoked comparators (cross-artifact + safety)...');
    const autoInvokedFindings = await runAutoInvokedComparators(context, usedComparators);
    findings.push(...autoInvokedFindings);
    console.log(`[PackEvaluator] Auto-invoked comparators found ${autoInvokedFindings.length} findings`);

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

      // NEW: Handle rules with requires/checks/decision blocks (baseline pack pattern)
      if (!rule.obligations || rule.obligations.length === 0) {
        // Check if rule uses new pattern with requires/checks/decision
        const hasRequires = !!(ruleAny.requires);
        const hasChecks = !!(ruleAny.checks);
        const hasDecision = !!(ruleAny.decision);

        if (hasRequires || hasChecks) {
          // Evaluate new pattern rules
          const newPatternFindings = await evaluateNewPatternRule(rule, effectiveContext, ruleAny);
          findings.push(...newPatternFindings);
          continue;
        }

        // Approval-only / decision-only rules: register as triggered with a synthetic PASS finding
        // The approvals/decision blocks will be evaluated by the approval routing layer (future work).
        findings.push({
          ruleId: rule.id,
          ruleName: rule.name,
          obligationIndex: -1,
          comparatorResult: { status: 'unknown', findingCode: 'APPROVAL_GATE' as FindingCode, evidence: [], meta: { approvalRule: true } },
          decisionOnFail: (ruleAny.decision?.onViolation) || 'warn',
          decisionOnUnknown: (ruleAny.decision?.onMissingExternalEvidence) || 'warn',
          evaluationStatus: 'not_evaluable',
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

            // FIX A: Determine evaluation status from comparator result
            const evaluationStatus: 'evaluated' | 'not_evaluable' =
              result.status === 'unknown' ? 'not_evaluable' : 'evaluated';

            findings.push({
              ruleId: rule.id,
              ruleName: rule.name,
              obligationIndex: i,
              comparatorResult: result,
              // PHASE 2.4: Include auto-condition result for hybrid visibility
              conditionResult: autoConditionResult,
              decisionOnFail: obligation.decisionOnFail,
              decisionOnUnknown: obligation.decisionOnUnknown || 'warn',
              evaluationStatus,
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

            // FIX A: Conditions with errors are not_evaluable, otherwise evaluated
            const evaluationStatus: 'evaluated' | 'not_evaluable' =
              hasError ? 'not_evaluable' : 'evaluated';

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
              evaluationStatus,
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
              evaluationStatus: 'not_evaluable',
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
              evaluationStatus: 'not_evaluable',
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

    // FIX A: Compute coverage (two-orthogonal-outcome model)
    const coverage = computeCoverage(findings);

    // PHASE 3: Build Policy Evaluation Graph
    const evaluationGraph = buildPackEvaluationGraph(
      pack,
      packHash,
      findings,
      triggeredRules,
      context,
      decision,
      evaluationTimeMs,
      engineFingerprint,
      coverage
    );

    return {
      decision,
      findings,
      triggeredRules,
      packHash,
      packSource,
      evaluationTimeMs,
      budgetExhausted,
      engineFingerprint,
      coverage,
      evaluationGraph,
    };
  }
}

/**
 * Evaluate rules with new pattern (requires/checks/decision blocks)
 * This handles baseline pack rules that use requires.localArtifacts, checks.invariants, etc.
 */
async function evaluateNewPatternRule(
  rule: any,
  context: PRContext,
  ruleAny: any
): Promise<Finding[]> {
  const findings: Finding[] = [];

  // Extract decision settings
  const decision = ruleAny.decision;
  const decisionOnFail = extractDecisionOnFail(decision, context);
  const decisionOnUnknown = decision?.onMissingExternalEvidence || 'warn';

  // Evaluate requires.localArtifacts
  if (ruleAny.requires?.localArtifacts) {
    const localArtifacts = ruleAny.requires.localArtifacts;

    // Check anyOf - at least one file must exist
    if (localArtifacts.anyOf && Array.isArray(localArtifacts.anyOf)) {
      const anyMatch = localArtifacts.anyOf.some((pattern: string) =>
        context.files.some(file => minimatch(file.filename, pattern, { dot: true }))
      );

      if (!anyMatch) {
        // No matching files found - violation
        findings.push({
          ruleId: rule.id,
          ruleName: rule.name,
          obligationIndex: -1,
          comparatorResult: {
            comparatorId: 'ARTIFACT_REQUIRED' as any,
            status: 'fail',
            reasonCode: 'ARTIFACT_MISSING',
            evidence: [],
            message: `Required artifact not found. Expected one of: ${localArtifacts.anyOf.join(', ')}`,
          },
          decisionOnFail,
          decisionOnUnknown,
          evaluationStatus: 'evaluated',
        });
      } else {
        // Found matching file - pass
        const matchedFiles = context.files
          .filter(file => localArtifacts.anyOf.some((pattern: string) => minimatch(file.filename, pattern, { dot: true })))
          .map(f => f.filename);

        findings.push({
          ruleId: rule.id,
          ruleName: rule.name,
          obligationIndex: -1,
          comparatorResult: {
            comparatorId: 'ARTIFACT_REQUIRED' as any,
            status: 'pass',
            reasonCode: 'PASS',
            evidence: matchedFiles.map(f => ({ type: 'file', value: f })),
            message: `Required artifact found: ${matchedFiles.join(', ')}`,
          },
          decisionOnFail,
          decisionOnUnknown,
          evaluationStatus: 'evaluated',
        });
      }
    }

    // Check allOf - all files must exist
    if (localArtifacts.allOf && Array.isArray(localArtifacts.allOf)) {
      const missingPatterns: string[] = [];
      const foundPatterns: string[] = [];

      for (const pattern of localArtifacts.allOf) {
        const hasMatch = context.files.some(file => minimatch(file.filename, pattern, { dot: true }));
        if (hasMatch) {
          foundPatterns.push(pattern);
        } else {
          missingPatterns.push(pattern);
        }
      }

      if (missingPatterns.length > 0) {
        // Some required files missing - violation
        findings.push({
          ruleId: rule.id,
          ruleName: rule.name,
          obligationIndex: -1,
          comparatorResult: {
            comparatorId: 'ARTIFACT_REQUIRED' as any,
            status: 'fail',
            reasonCode: 'ARTIFACT_MISSING',
            evidence: [],
            message: `Missing required artifacts: ${missingPatterns.join(', ')}`,
          },
          decisionOnFail,
          decisionOnUnknown,
          evaluationStatus: 'evaluated',
        });
      } else {
        // All required files found - pass
        findings.push({
          ruleId: rule.id,
          ruleName: rule.name,
          obligationIndex: -1,
          comparatorResult: {
            comparatorId: 'ARTIFACT_REQUIRED' as any,
            status: 'pass',
            reasonCode: 'PASS',
            evidence: foundPatterns.map(p => ({ type: 'file', value: p })),
            message: `All required artifacts found: ${foundPatterns.join(', ')}`,
          },
          decisionOnFail,
          decisionOnUnknown,
          evaluationStatus: 'evaluated',
        });
      }
    }
  }

  // Evaluate requires.ciEvidence (future work - would need to query GitHub API for check runs)
  if (ruleAny.requires?.ciEvidence) {
    // For now, mark as not_evaluable since we don't have CI evidence in context
    findings.push({
      ruleId: rule.id,
      ruleName: rule.name,
      obligationIndex: -1,
      comparatorResult: {
        comparatorId: 'CI_EVIDENCE_REQUIRED' as any,
        status: 'unknown',
        reasonCode: 'MISSING_EXTERNAL_EVIDENCE',
        evidence: [],
        message: 'CI evidence evaluation not yet implemented',
      },
      decisionOnFail,
      decisionOnUnknown,
      evaluationStatus: 'not_evaluable',
    });
  }

  // Evaluate checks.invariants (future work - would need invariant comparators)
  if (ruleAny.checks?.invariants) {
    // For now, mark as not_evaluable since invariant evaluation is not yet implemented
    findings.push({
      ruleId: rule.id,
      ruleName: rule.name,
      obligationIndex: -1,
      comparatorResult: {
        comparatorId: 'INVARIANT_CHECK' as any,
        status: 'unknown',
        reasonCode: 'MISSING_EXTERNAL_EVIDENCE',
        evidence: [],
        message: 'Invariant checks not yet implemented',
      },
      decisionOnFail,
      decisionOnUnknown,
      evaluationStatus: 'not_evaluable',
    });
  }

  return findings;
}

/**
 * Extract decision from decision block, handling branch-specific decisions
 */
function extractDecisionOnFail(decision: any, context: PRContext): 'pass' | 'warn' | 'block' {
  if (!decision?.onViolation) {
    return 'warn';
  }

  const onViolation = decision.onViolation;

  // Simple string decision
  if (typeof onViolation === 'string') {
    return onViolation as 'pass' | 'warn' | 'block';
  }

  // Branch-specific decision
  if (typeof onViolation === 'object' && !Array.isArray(onViolation)) {
    // Determine if this is a protected branch
    const isProtectedBranch = context.baseBranch === 'main' ||
                              context.baseBranch === 'master' ||
                              context.baseBranch.startsWith('release/') ||
                              context.baseBranch.startsWith('hotfix/');

    if (isProtectedBranch && onViolation.protectedBranches) {
      return onViolation.protectedBranches as 'pass' | 'warn' | 'block';
    } else if (!isProtectedBranch && onViolation.featureBranches) {
      return onViolation.featureBranches as 'pass' | 'warn' | 'block';
    }

    // Fallback to protectedBranches if featureBranches not specified
    return (onViolation.protectedBranches || 'warn') as 'pass' | 'warn' | 'block';
  }

  return 'warn';
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
 * FIX A: Compute coverage from findings (two-orthogonal-outcome model)
 * Separates evaluation status from policy decision
 */
function computeCoverage(findings: Finding[]): { evaluable: number; total: number; notEvaluable: number } {
  const total = findings.length;
  const notEvaluable = findings.filter(f => f.evaluationStatus === 'not_evaluable').length;
  const evaluable = total - notEvaluable;

  return { evaluable, total, notEvaluable };
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

// ============================================================================
// PHASE 3: Policy Evaluation Graph Builder Functions
// ============================================================================

/**
 * Build Policy Evaluation Graph from findings for a single rule
 * This provides a structured view of the evaluation flow for better output
 */
function buildPolicyEvaluationGraph(
  rule: any,
  findings: Finding[],
  context: PRContext,
  evaluationTimeMs: number
): PolicyEvaluationGraph {
  // Filter findings for this rule
  const ruleFindings = findings.filter(f => f.ruleId === rule.id);

  // Step 1: Inputs (PR context)
  const inputs = {
    prNumber: context.prNumber,
    author: context.author,
    baseBranch: context.baseBranch,
    headBranch: context.headBranch,
    filesChanged: context.files.length,
    additions: context.additions,
    deletions: context.deletions,
  };

  // Step 2: Detected Surfaces (why this rule triggered)
  const surfaces = extractDetectedSurfaces(rule, context);

  // Step 3: Obligations (what the contract requires)
  const obligations = extractEvaluatedObligations(ruleFindings);

  // Step 4: Evidence (what we found)
  const evidence = extractEvidence(ruleFindings);

  // Step 5: Invariants (cross-artifact checks)
  const invariants = extractEvaluatedInvariants(ruleFindings);

  // Step 6: Decision (final outcome)
  const decision = computeRuleDecision(ruleFindings);

  // Compute confidence based on evaluation status
  const evaluableCount = ruleFindings.filter(f => f.evaluationStatus === 'evaluated').length;
  const confidence = ruleFindings.length > 0 ? evaluableCount / ruleFindings.length : 1.0;

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    ruleDescription: rule.description,
    inputs,
    surfaces,
    obligations,
    evidence,
    invariants,
    decision,
    metadata: {
      evaluationTimeMs,
      evaluationStatus: ruleFindings.some(f => f.evaluationStatus === 'not_evaluable')
        ? 'not_evaluable'
        : 'evaluated',
      confidence,
    },
  };
}

/**
 * Extract detected surfaces from rule trigger conditions
 * ENHANCED: Now uses changeSurfaceCatalog for accurate file matching
 */
function extractDetectedSurfaces(rule: any, context: PRContext): DetectedSurface[] {
  const surfaces: DetectedSurface[] = [];

  // Check if rule has changeSurfaces trigger
  if (rule.when?.changeSurfaces) {
    const surfaceIds = rule.when.changeSurfaces.anyOf || rule.when.changeSurfaces.allOf || [];

    for (const surfaceId of surfaceIds) {
      // Get path globs for this surface from catalog
      const globs = CHANGE_SURFACE_GLOBS[surfaceId as ChangeSurfaceId] || [];

      // Find files that match this surface's globs
      const matchingFiles = context.files
        .filter(f => {
          return globs.some(glob => minimatch(f.filename, glob, { dot: true }));
        })
        .map(f => f.filename);

      // Compute confidence based on match quality
      const confidence = matchingFiles.length > 0 ? 1.0 : 0.5; // Lower confidence if no files matched

      // Generate human-readable description
      const description = generateSurfaceDescription(surfaceId, matchingFiles.length);

      surfaces.push({
        surfaceId,
        description,
        files: matchingFiles.slice(0, 5), // Limit to 5 files for brevity
        confidence,
        detectionMethod: 'path-glob',
        metadata: {
          totalMatchingFiles: matchingFiles.length,
          globs: globs.slice(0, 3), // Include sample globs for transparency
        },
      });
    }
  }

  // Check for heuristic predicates (if available in context)
  if (context.detectedHeuristics && Array.isArray(context.detectedHeuristics)) {
    for (const heuristic of context.detectedHeuristics) {
      surfaces.push({
        surfaceId: heuristic.id || 'unknown_heuristic',
        description: heuristic.description || `Heuristic detected: ${heuristic.id}`,
        files: heuristic.files || [],
        confidence: heuristic.confidence || 0.8,
        detectionMethod: 'heuristic',
        metadata: heuristic.metadata || {},
      });
    }
  }

  // If rule has trigger.always, add a generic surface
  if (rule.trigger?.always) {
    surfaces.push({
      surfaceId: 'always',
      description: 'Rule triggers on every PR to protected branches',
      files: [],
      confidence: 1.0,
      detectionMethod: 'explicit',
    });
  }

  return surfaces;
}

/**
 * Generate human-readable description for a change surface
 */
function generateSurfaceDescription(surfaceId: string, fileCount: number): string {
  const surfaceNames: Record<string, string> = {
    'openapi_changed': 'OpenAPI specification',
    'graphql_schema_changed': 'GraphQL schema',
    'proto_changed': 'Protocol Buffer definitions',
    'api_handler_changed': 'API handler code',
    'routing_changed': 'API routing configuration',
    'authz_policy_changed': 'Authorization policy',
    'db_schema_changed': 'Database schema',
    'migration_added_or_missing': 'Database migration',
    'orm_model_changed': 'ORM model definitions',
    'terraform_changed': 'Terraform infrastructure',
    'k8s_manifest_changed': 'Kubernetes manifests',
    'slo_threshold_changed': 'SLO thresholds',
    'dashboard_changed': 'Monitoring dashboards',
    'alert_rule_changed': 'Alert rules',
    'runbook_changed': 'Runbooks',
    'oncall_rotation_changed': 'On-call rotation',
    'codeowners_changed': 'CODEOWNERS file',
    'ownership_docs_changed': 'Ownership documentation',
    'service_catalog_changed': 'Service catalog',
    'docs_changed': 'Documentation',
  };

  const name = surfaceNames[surfaceId] || surfaceId.replace(/_/g, ' ');

  if (fileCount === 0) {
    return `${name} (no matching files found)`;
  } else if (fileCount === 1) {
    return `${name} changed (1 file)`;
  } else {
    return `${name} changed (${fileCount} files)`;
  }
}

/**
 * Extract evaluated obligations from findings
 */
function extractEvaluatedObligations(findings: Finding[]): EvaluatedObligation[] {
  return findings.map(finding => {
    const { comparatorResult, conditionResult, obligationIndex, decisionOnFail, decisionOnUnknown } = finding;

    // Determine obligation type and evaluator
    let type: 'artifact' | 'approval' | 'invariant' | 'condition' = 'condition';
    let evaluator: { type: 'comparator' | 'condition'; id: string; params?: Record<string, any> };
    let result: { status: 'pass' | 'fail' | 'unknown'; reasonCode: string; message: string; metadata?: any };
    let evidence: EvidenceItem[] = [];

    if (comparatorResult) {
      type = comparatorResult.comparatorId?.includes('ARTIFACT') ? 'artifact' :
             comparatorResult.comparatorId?.includes('APPROVAL') ? 'approval' :
             comparatorResult.comparatorId?.includes('INVARIANT') ? 'invariant' : 'condition';

      evaluator = {
        type: 'comparator',
        id: comparatorResult.comparatorId || 'UNKNOWN',
      };

      // CRITICAL FIX: Preserve metadata from comparator (e.g., evidenceSearch)
      result = {
        status: comparatorResult.status,
        reasonCode: comparatorResult.reasonCode,
        message: comparatorResult.message,
        ...(comparatorResult.metadata ? { metadata: comparatorResult.metadata } : {}),
      };

      // Convert comparator evidence to EvidenceItem format
      evidence = (comparatorResult.evidence || []).map(ev => convertToEvidenceItem(ev));
    } else if (conditionResult) {
      type = 'condition';

      evaluator = {
        type: 'condition',
        id: 'CONDITION_CHECK',
      };

      result = {
        status: conditionResult.error ? 'unknown' : conditionResult.satisfied ? 'pass' : 'fail',
        reasonCode: conditionResult.error ? 'CONDITION_ERROR' :
                    conditionResult.satisfied ? 'PASS' : 'CONDITION_NOT_SATISFIED',
        message: conditionResult.error ||
                 (conditionResult.satisfied ? 'Condition satisfied' : 'Condition not satisfied'),
      };
    } else {
      // Fallback for unknown finding type
      evaluator = { type: 'condition', id: 'UNKNOWN' };
      result = { status: 'unknown', reasonCode: 'UNKNOWN', message: 'Unknown finding type' };
    }

    return {
      obligationIndex,
      type,
      description: finding.ruleName,
      evaluator,
      result,
      evidence,
      decisionOnFail,
      decisionOnUnknown,
    };
  });
}

/**
 * Extract all evidence from findings
 */
function extractEvidence(findings: Finding[]): EvidenceItem[] {
  const allEvidence: EvidenceItem[] = [];

  for (const finding of findings) {
    if (finding.comparatorResult?.evidence) {
      for (const ev of finding.comparatorResult.evidence) {
        allEvidence.push(convertToEvidenceItem(ev));
      }
    }
  }

  return allEvidence;
}

/**
 * Convert comparator evidence to EvidenceItem format
 */
function convertToEvidenceItem(ev: any): EvidenceItem {
  if (ev.type === 'file') {
    return {
      type: 'file',
      value: ev.value || ev.path || '',
      context: { path: ev.path || ev.value },
      source: 'local',
    };
  } else if (ev.type === 'approval') {
    return {
      type: 'approval',
      value: ev.user || '',
      context: { user: ev.user },
      source: 'github_api',
    };
  } else if (ev.type === 'checkrun') {
    return {
      type: 'checkrun',
      value: ev.name || '',
      context: { conclusion: ev.conclusion },
      source: 'github_api',
    };
  } else if (ev.type === 'secret_detected') {
    return {
      type: 'secret_detected',
      value: ev.location || '',
      context: { location: ev.location, hash: ev.hash },
      source: 'local',
    };
  } else {
    return {
      type: 'metadata',
      value: JSON.stringify(ev),
      source: 'local',
    };
  }
}

/**
 * Extract evaluated invariants from findings
 * ENHANCED: Detects invariant-like checks and structures them properly
 */
function extractEvaluatedInvariants(findings: Finding[]): EvaluatedInvariant[] {
  const invariants: EvaluatedInvariant[] = [];

  for (const finding of findings) {
    // Check if this finding represents an invariant check
    const comparatorId = finding.comparatorResult?.comparatorId;

    // Detect invariant-like comparators
    if (comparatorId && isInvariantComparator(comparatorId)) {
      const invariant = buildInvariantFromFinding(finding);
      if (invariant) {
        invariants.push(invariant);
      }
    }
  }

  return invariants;
}

/**
 * Check if a comparator represents an invariant check
 */
function isInvariantComparator(comparatorId: string): boolean {
  // Invariant comparators typically check cross-artifact consistency
  const invariantPatterns = [
    'PARITY',           // e.g., API_SPEC_IMPL_PARITY
    'CONSISTENCY',      // e.g., SCHEMA_CONSISTENCY
    'ALIGNMENT',        // e.g., DOCS_CODE_ALIGNMENT
    'SYNC',             // e.g., CODEOWNERS_CATALOG_SYNC
    'MATCH',            // e.g., SPEC_GATEWAY_MATCH
  ];

  return invariantPatterns.some(pattern => comparatorId.includes(pattern));
}

/**
 * Build an EvaluatedInvariant from a finding
 */
function buildInvariantFromFinding(finding: Finding): EvaluatedInvariant | null {
  const comparatorResult = finding.comparatorResult;
  if (!comparatorResult) return null;

  // Extract source and target artifacts from evidence
  const sources: Array<{ type: string; paths: string[]; found: boolean }> = [];
  const targets: Array<{ type: string; paths: string[]; found: boolean }> = [];

  // Parse evidence to identify sources and targets
  const sourceFiles: string[] = [];
  const targetFiles: string[] = [];

  for (const ev of comparatorResult.evidence || []) {
    if (ev.type === 'file') {
      // Heuristic: files with 'spec', 'schema', 'api' are often sources
      if (ev.value.includes('spec') || ev.value.includes('schema') || ev.value.includes('api')) {
        sourceFiles.push(ev.value);
      } else {
        targetFiles.push(ev.value);
      }
    }
  }

  if (sourceFiles.length > 0) {
    sources.push({
      type: 'specification',
      paths: sourceFiles,
      found: true,
    });
  }

  if (targetFiles.length > 0) {
    targets.push({
      type: 'implementation',
      paths: targetFiles,
      found: true,
    });
  }

  // Extract mismatches from message if available
  const mismatches: Array<{ source: string; target: string; issue: string }> = [];
  if (comparatorResult.status === 'fail' && comparatorResult.message) {
    // Try to parse mismatches from message
    // This is a simple heuristic - can be improved with structured error data
    mismatches.push({
      source: sourceFiles[0] || 'unknown',
      target: targetFiles[0] || 'unknown',
      issue: comparatorResult.message,
    });
  }

  return {
    invariantId: comparatorResult.comparatorId || 'UNKNOWN_INVARIANT',
    description: finding.ruleName,
    sources,
    targets,
    result: {
      status: comparatorResult.status,
      reasonCode: comparatorResult.reasonCode,
      message: comparatorResult.message,
      mismatches: mismatches.length > 0 ? mismatches : undefined,
    },
    decisionOnFail: finding.decisionOnFail,
  };
}

/**
 * Compute decision for a single rule from its findings
 */
function computeRuleDecision(findings: Finding[]): {
  outcome: 'pass' | 'warn' | 'block';
  reason: string;
  causedBy: Array<{ obligationIndex: number; reasonCode: string }>;
} {
  const decision = computeDecision(findings);

  // Find which obligations caused this decision
  const causedBy = findings
    .filter(f => {
      if (f.comparatorResult) {
        if (f.comparatorResult.status === 'fail' && f.decisionOnFail === decision) return true;
        if (f.comparatorResult.status === 'unknown' && f.decisionOnUnknown === decision) return true;
      }
      if (f.conditionResult) {
        if (!f.conditionResult.satisfied && f.decisionOnFail === decision) return true;
        if (f.conditionResult.error && f.decisionOnUnknown === decision) return true;
      }
      return false;
    })
    .map(f => ({
      obligationIndex: f.obligationIndex,
      reasonCode: f.comparatorResult?.reasonCode || f.conditionResult?.error || 'UNKNOWN',
    }));

  // Generate reason message
  let reason = '';
  if (decision === 'block') {
    reason = `${causedBy.length} blocking issue(s) found`;
  } else if (decision === 'warn') {
    reason = `${causedBy.length} warning(s) found`;
  } else {
    reason = 'All checks passed';
  }

  return {
    outcome: decision,
    reason,
    causedBy,
  };
}

/**
 * Build Pack-level Evaluation Graph
 * Aggregates all rule graphs into a single pack-level view
 */
function buildPackEvaluationGraph(
  pack: PackYAML,
  packHash: string,
  findings: Finding[],
  triggeredRules: string[],
  context: PRContext,
  decision: 'pass' | 'warn' | 'block',
  evaluationTimeMs: number,
  engineFingerprint: EngineFingerprint,
  coverage: { evaluable: number; total: number; notEvaluable: number }
): PackEvaluationGraph {
  // Global inputs
  const inputs = {
    prNumber: context.prNumber,
    author: context.author,
    baseBranch: context.baseBranch,
    headBranch: context.headBranch,
    filesChanged: context.files.length,
    additions: context.additions,
    deletions: context.deletions,
    labels: context.labels || [],
  };

  // Build rule graphs for each triggered rule
  const ruleGraphs: PolicyEvaluationGraph[] = [];
  const allSurfaces: DetectedSurface[] = [];

  for (const ruleId of triggeredRules) {
    const rule = pack.rules.find(r => r.id === ruleId);
    if (!rule) continue;

    const ruleGraph = buildPolicyEvaluationGraph(
      rule,
      findings,
      context,
      evaluationTimeMs
    );

    ruleGraphs.push(ruleGraph);

    // Collect all surfaces
    for (const surface of ruleGraph.surfaces) {
      // Deduplicate surfaces by surfaceId
      if (!allSurfaces.find(s => s.surfaceId === surface.surfaceId)) {
        allSurfaces.push(surface);
      }
    }
  }

  // TRACK A TASK 2: Build synthetic rule graphs for auto-invoked comparator findings
  // These are findings with ruleId starting with 'auto-invoked-'
  const autoInvokedFindings = findings.filter(f => f.ruleId.startsWith('auto-invoked-'));
  const autoInvokedRuleGraphs: PolicyEvaluationGraph[] = [];

  if (autoInvokedFindings.length > 0) {
    console.log(`[PackEvaluator] Building ${autoInvokedFindings.length} auto-invoked rule graphs for evaluation graph`);

    // Group auto-invoked findings by ruleId
    const findingsByRuleId = new Map<string, Finding[]>();
    for (const finding of autoInvokedFindings) {
      const existing = findingsByRuleId.get(finding.ruleId) || [];
      existing.push(finding);
      findingsByRuleId.set(finding.ruleId, existing);
    }

    // Create a synthetic rule graph for each auto-invoked comparator
    for (const [ruleId, ruleFindings] of findingsByRuleId.entries()) {
      const syntheticRule = {
        id: ruleId,
        name: ruleFindings[0].ruleName,
        description: `Auto-invoked comparator: ${ruleFindings[0].comparatorResult?.comparatorId || 'UNKNOWN'}`,
        trigger: { always: true }, // Auto-invoked comparators always run
      };

      const ruleGraph = buildPolicyEvaluationGraph(
        syntheticRule,
        ruleFindings,
        context,
        evaluationTimeMs
      );

      autoInvokedRuleGraphs.push(ruleGraph);

      // Collect surfaces from auto-invoked rules too
      for (const surface of ruleGraph.surfaces) {
        if (!allSurfaces.find(s => s.surfaceId === surface.surfaceId)) {
          allSurfaces.push(surface);
        }
      }
    }

    console.log(`[PackEvaluator] Created ${autoInvokedRuleGraphs.length} auto-invoked rule graphs`);
  }

  // Global decision - include auto-invoked rules in contributing rules
  const contributingRules = [
    ...ruleGraphs.map(rg => ({
      ruleId: rg.ruleId,
      decision: rg.decision.outcome,
    })),
    ...autoInvokedRuleGraphs.map(rg => ({
      ruleId: rg.ruleId,
      decision: rg.decision.outcome,
    })),
  ];

  const globalDecision = {
    outcome: decision,
    reason: decision === 'block'
      ? `${contributingRules.filter(r => r.decision === 'block').length} rule(s) blocked`
      : decision === 'warn'
      ? `${contributingRules.filter(r => r.decision === 'warn').length} rule(s) warned`
      : 'All rules passed',
    contributingRules,
  };

  // Compute overall confidence
  const overallConfidence = coverage.total > 0
    ? coverage.evaluable / coverage.total
    : 1.0;

  return {
    packId: pack.metadata.id || 'unknown',
    packName: pack.metadata.name,
    packVersion: pack.metadata.version,
    packHash,
    inputs,
    allSurfaces,
    ruleGraphs,
    autoInvokedRuleGraphs: autoInvokedRuleGraphs.length > 0 ? autoInvokedRuleGraphs : undefined,
    globalDecision,
    coverage: {
      totalRules: pack.rules.length,
      triggeredRules: triggeredRules.length,
      evaluableRules: coverage.evaluable,
      notEvaluableRules: coverage.notEvaluable,
      overallConfidence,
    },
    metadata: {
      evaluationTimeMs,
      engineFingerprint: {
        evaluatorVersion: engineFingerprint.evaluatorVersion,
        comparatorVersions: engineFingerprint.comparatorVersions,
        timestamp: engineFingerprint.timestamp,
      },
    },
  };
}


}

