/**
 * YAML-Driven Gatekeeper Integration
 * Migration Plan v5.0 - Sprint 4
 * 
 * Integrates pack evaluator into existing gatekeeper
 */

import type { PrismaClient } from '@prisma/client';
import { selectApplicablePacks } from './packSelector.js';
import { PackEvaluator, type PackEvaluationResult } from './packEvaluator.js';
import { loadWorkspaceDefaults } from './workspaceDefaultsLoader.js';
import { BudgetedGitHubClient } from './comparators/types.js';
import type { PRContext } from './comparators/types.js';
import type { GatekeeperInput } from '../index.js';
import type { PackYAML } from './packValidator.js';

export interface PackResult {
  pack: PackYAML;
  packHash: string;
  packSource: 'repo' | 'service' | 'workspace';
  result: PackEvaluationResult;
}

export interface YAMLGatekeeperResult {
  decision: 'pass' | 'warn' | 'block';
  packUsed: boolean;
  packHash?: string;  // DEPRECATED: Use packResults instead
  packSource?: 'repo' | 'service' | 'workspace';  // DEPRECATED: Use packResults instead
  findings: any[];
  triggeredRules: string[];
  evaluationTimeMs: number;

  // CRITICAL FIX (Gap #3): Include pack and full result for GitHub Check creation
  pack?: PackYAML;  // DEPRECATED: Use packResults instead
  fullResult?: PackEvaluationResult;  // DEPRECATED: Use packResults instead

  // PHASE 2 FIX: Multi-pack support
  packResults?: PackResult[];

  // A4: EXPLICIT mode conflict details (populated when EXPLICIT packs disagree)
  explicitConflicts?: Array<{ packNames: string[]; decisions: string[] }>;
}

/**
 * Run YAML-driven gatekeeper evaluation
 * PHASE 2 FIX: Now evaluates ALL applicable packs and aggregates decisions
 * Returns null if no pack is configured (fallback to legacy gatekeeper)
 */
export async function runYAMLGatekeeper(
  prisma: PrismaClient,
  input: GatekeeperInput,
  octokit: any,
  prAction?: 'opened' | 'synchronize' | 'labeled' | 'closed'
): Promise<YAMLGatekeeperResult | null> {
  const startTime = Date.now();

  // Step 1: PHASE 2 FIX - Select ALL applicable packs (filtered by prEvents)
  // CRITICAL FIX: Use baseBranch (target branch) for pack selection, not headBranch (source branch)
  // Policy packs should match against the branch being merged INTO (e.g., main), not the feature branch
  const selectedPacks = await selectApplicablePacks(
    prisma,
    input.workspaceId,
    input.owner,
    input.repo,
    input.baseBranch, // Use base branch (target) instead of head branch (source)
    prAction
  );

  if (selectedPacks.length === 0) {
    console.log(`[YAMLGatekeeper] No packs configured for ${input.owner}/${input.repo}, using legacy gatekeeper`);
    return null;
  }

  console.log(`[YAMLGatekeeper] Found ${selectedPacks.length} applicable pack(s):`);
  for (const pack of selectedPacks) {
    console.log(`  - ${pack.pack.metadata.name} v${pack.pack.metadata.version} (${pack.source})`);
  }

  // Step 2: Load workspace defaults
  const defaults = await loadWorkspaceDefaults(prisma, input.workspaceId);

  // A2-FIX: Resolve base SHA from GitHub once before the pack loop.
  // `baseSha: ''` was a hardcoded placeholder that broke diff-aware comparators.
  // We call pulls.get() with raw octokit (no budget deduction) since this is
  // infrastructure bookkeeping, not a user-triggered comparator call.
  let baseSha = '';
  try {
    const prData = await octokit.rest.pulls.get({
      owner: input.owner,
      repo: input.repo,
      pull_number: input.prNumber,
    });
    baseSha = prData.data.base.sha;
    console.log(`[YAMLGatekeeper] Resolved baseSha=${baseSha} for PR #${input.prNumber}`);
  } catch (error: any) {
    console.warn(`[YAMLGatekeeper] Failed to resolve baseSha for PR #${input.prNumber}: ${error.message}`);
    // Leave baseSha as '' — comparators that need it will report unknown/skip
  }

  // Step 3: PHASE 2 FIX - Evaluate ALL packs
  const packResults: PackResult[] = [];
  const evaluator = new PackEvaluator();

  for (const selectedPack of selectedPacks) {
    // Build PR context for this pack
    const abortController = new AbortController();
    const budgets = {
      maxTotalMs: selectedPack.pack.evaluation?.budgets?.maxTotalMs || 30000,
      perComparatorTimeoutMs: selectedPack.pack.evaluation?.budgets?.perComparatorTimeoutMs || 5000,
      maxGitHubApiCalls: selectedPack.pack.evaluation?.budgets?.maxGitHubApiCalls || 100, // Increased from 50 to 100
      currentApiCalls: 0,
      startTime: Date.now(),
    };

    const budgetedGitHub = new BudgetedGitHubClient(octokit, budgets, abortController.signal);

    // CRITICAL FIX (Gap #1): Expose only safe API methods to comparators
    const context: PRContext = {
      owner: input.owner,
      repo: input.repo,
      prNumber: input.prNumber,
      headSha: input.headSha,
      baseSha,  // A2-FIX: resolved from GitHub pulls.get above
      author: input.author,
      title: input.title,
      body: input.body,
      labels: input.labels,
      baseBranch: input.baseBranch,
      headBranch: input.headBranch,
      commits: input.commits,
      additions: input.additions,
      deletions: input.deletions,
      files: input.files,
      github: {
        rest: {
          pulls: {
            get: budgetedGitHub.rest.pulls.get.bind(budgetedGitHub.rest.pulls),
            listReviews: budgetedGitHub.rest.pulls.listReviews.bind(budgetedGitHub.rest.pulls),
            listFiles: budgetedGitHub.rest.pulls.listFiles.bind(budgetedGitHub.rest.pulls),
          },
          repos: {
            getContent: budgetedGitHub.rest.repos.getContent.bind(budgetedGitHub.rest.repos),
          },
          checks: {
            listForRef: budgetedGitHub.rest.checks.listForRef.bind(budgetedGitHub.rest.checks),
          },
        },
      },
      abortController,
      workspaceId: input.workspaceId,
      installationId: input.installationId,
      prAction,  // P0-A: carry action through so comparators can tag isFinalSnapshot
      defaults,
      budgets,
      cache: {
        approvals: undefined,
        checkRuns: undefined,
        teamMemberships: new Map(),
      },
    };

    // Evaluate this pack
    const result = await evaluator.evaluate(
      selectedPack.pack,
      selectedPack.packHash,
      selectedPack.source,
      context
    );

    console.log(`[YAMLGatekeeper] Pack "${selectedPack.pack.metadata.name}": ${result.decision} (${result.findings.length} findings)`);

    packResults.push({
      pack: selectedPack.pack,
      packHash: selectedPack.packHash,
      packSource: selectedPack.source,
      result,
    });
  }

  // Step 4: PHASE 2 FIX - Compute global decision from all pack results
  const globalDecision = computeGlobalDecision(packResults);

  console.log(`[YAMLGatekeeper] Global decision: ${globalDecision} (from ${packResults.length} pack(s))`);

  // Aggregate findings and triggered rules
  const allFindings = packResults.flatMap(pr => pr.result.findings);
  const allTriggeredRules = packResults.flatMap(pr => pr.result.triggeredRules);

  // A4-FIX: Detect EXPLICIT-mode conflicts and inject blocking synthetic findings.
  // Previously conflicts were silently swallowed by falling back to MOST_RESTRICTIVE.
  // Now they surface as block-severity findings so the user sees WHY the check failed.
  const explicitConflicts = detectExplicitConflicts(packResults);
  if (explicitConflicts.length > 0) {
    for (const conflict of explicitConflicts) {
      allFindings.push({
        ruleId: 'explicit-mode-conflict',
        ruleName: 'EXPLICIT Merge Strategy Conflict',
        obligationIndex: -1,
        comparatorResult: {
          status: 'fail' as const,
          comparatorId: 'EXPLICIT_CONFLICT' as any,  // synthetic — not a real registered comparator
          reasonCode: 'EXPLICIT_MERGE_CONFLICT',
          message: `Packs [${conflict.packNames.join(', ')}] returned conflicting decisions: ` +
            `[${conflict.decisions.join(', ')}]. All packs must agree in EXPLICIT mode. ` +
            `Resolve the conflict by aligning pack rules or changing the merge strategy.`,
          evidence: [],
        },
        decisionOnFail: 'block',
        evaluationStatus: 'evaluated',
      });
      allTriggeredRules.push('explicit-mode-conflict');
    }
    console.error(`[YAMLGatekeeper] ${explicitConflicts.length} EXPLICIT-mode conflict(s) injected as blocking findings`);
  }

  return {
    decision: explicitConflicts.length > 0 ? 'block' : globalDecision,
    packUsed: true,
    // Backward compatibility: use first pack's data
    packHash: packResults[0].packHash,
    packSource: packResults[0].packSource,
    pack: packResults[0].pack,
    fullResult: packResults[0].result,
    // New multi-pack fields
    packResults,
    findings: allFindings,
    triggeredRules: allTriggeredRules,
    evaluationTimeMs: Date.now() - startTime,
    explicitConflicts: explicitConflicts.length > 0 ? explicitConflicts : undefined,
  };
}

/**
 * A4-FIX: Detect EXPLICIT-mode conflicts across enforcing packs.
 * Returns conflicts (packNames + decisions) when enforcing packs disagree
 * AND the active merge strategy is EXPLICIT. Empty array = no conflict.
 */
function detectExplicitConflicts(
  packResults: PackResult[]
): Array<{ packNames: string[]; decisions: string[] }> {
  // Only applies when at least one pack uses EXPLICIT strategy
  const explicitPacks = packResults.filter(
    pr => pr.pack.metadata.packMode !== 'observe' &&
          pr.pack.metadata.scopeMergeStrategy === 'EXPLICIT'
  );
  if (explicitPacks.length === 0) return [];

  const decisions = new Set(explicitPacks.map(pr => pr.result.decision));
  if (decisions.size <= 1) return []; // All agree — no conflict

  return [{
    packNames: explicitPacks.map(pr => pr.pack.metadata.name),
    decisions: Array.from(decisions),
  }];
}

/**
 * PHASE 3A.1: Compute global decision from multiple pack results
 * Now supports all 3 merge strategies: MOST_RESTRICTIVE, HIGHEST_PRIORITY, EXPLICIT
 */
function computeGlobalDecision(packResults: PackResult[]): 'pass' | 'warn' | 'block' {
  if (packResults.length === 0) {
    return 'pass';
  }

  // Get merge strategy from packs (should be consistent)
  const mergeStrategies = new Set(
    packResults.map(pr => pr.pack.metadata.scopeMergeStrategy || 'MOST_RESTRICTIVE')
  );

  // Validate merge strategy consistency
  if (mergeStrategies.size > 1) {
    // If any pack uses EXPLICIT, require all to use same strategy
    if (mergeStrategies.has('EXPLICIT')) {
      console.error(
        `[YAMLGatekeeper] Conflicting merge strategies detected. ` +
        `When using EXPLICIT mode, all packs must use the same strategy. ` +
        `Found: ${Array.from(mergeStrategies).join(', ')}`
      );
      // Fallback to MOST_RESTRICTIVE for safety
      return computeMostRestrictive(packResults);
    }
    // Otherwise, use MOST_RESTRICTIVE as fallback
    console.warn(
      `[YAMLGatekeeper] Multiple merge strategies detected, using MOST_RESTRICTIVE as fallback`
    );
  }

  // A3-FIX: Determine strategy from the majority of packs (not just packResults[0]).
  // If all packs agree, use that strategy. If mixed (excluding EXPLICIT conflicts already
  // handled above), pick the most conservative one: MOST_RESTRICTIVE > HIGHEST_PRIORITY.
  const strategyCounts = new Map<string, number>();
  for (const pr of packResults) {
    const s = pr.pack.metadata.scopeMergeStrategy || 'MOST_RESTRICTIVE';
    strategyCounts.set(s, (strategyCounts.get(s) ?? 0) + 1);
  }
  // Deterministic: MOST_RESTRICTIVE wins ties, then HIGHEST_PRIORITY
  let strategy = 'MOST_RESTRICTIVE';
  let maxCount = 0;
  for (const [s, count] of strategyCounts) {
    if (count > maxCount || (count === maxCount && s === 'MOST_RESTRICTIVE')) {
      maxCount = count;
      strategy = s;
    }
  }

  switch (strategy) {
    case 'MOST_RESTRICTIVE':
      return computeMostRestrictive(packResults);

    case 'HIGHEST_PRIORITY':
      return computeHighestPriority(packResults);

    case 'EXPLICIT':
      return computeExplicit(packResults);

    default:
      console.warn(`[YAMLGatekeeper] Unknown merge strategy: ${strategy}, using MOST_RESTRICTIVE`);
      return computeMostRestrictive(packResults);
  }
}

/**
 * MOST_RESTRICTIVE: Any BLOCK → BLOCK, else any WARN → WARN, else PASS
 * FIX C: Exclude observe-mode packs from global decision aggregation
 */
function computeMostRestrictive(packResults: PackResult[]): 'pass' | 'warn' | 'block' {
  // Filter out observe-mode packs - they don't contribute to global decision
  const enforcingPacks = packResults.filter(pr => pr.pack.metadata.packMode !== 'observe');

  // If no enforcing packs, return PASS (all packs are observe-only)
  if (enforcingPacks.length === 0) {
    return 'pass';
  }

  // Check for any BLOCK decisions from enforcing packs
  for (const packResult of enforcingPacks) {
    if (packResult.result.decision === 'block') {
      return 'block';
    }
  }

  // Check for any WARN decisions from enforcing packs
  for (const packResult of enforcingPacks) {
    if (packResult.result.decision === 'warn') {
      return 'warn';
    }
  }

  // All enforcing packs passed
  return 'pass';
}

/**
 * HIGHEST_PRIORITY: Use decision from highest priority pack only
 * FIX C: Exclude observe-mode packs from global decision aggregation
 */
function computeHighestPriority(packResults: PackResult[]): 'pass' | 'warn' | 'block' {
  // Filter out observe-mode packs
  const enforcingPacks = packResults.filter(pr => pr.pack.metadata.packMode !== 'observe');

  // If no enforcing packs, return PASS
  if (enforcingPacks.length === 0) {
    return 'pass';
  }

  // Sort by priority (highest first)
  const sorted = [...enforcingPacks].sort((a, b) => {
    const priorityA = a.pack.metadata.scopePriority || 50;
    const priorityB = b.pack.metadata.scopePriority || 50;
    return priorityB - priorityA;
  });

  // Return decision from highest priority pack
  return sorted[0].result.decision;
}

/**
 * EXPLICIT: Require all packs to agree, throw error on conflict
 * FIX C: Exclude observe-mode packs from global decision aggregation
 */
function computeExplicit(packResults: PackResult[]): 'pass' | 'warn' | 'block' {
  // Filter out observe-mode packs
  const enforcingPacks = packResults.filter(pr => pr.pack.metadata.packMode !== 'observe');

  // If no enforcing packs, return PASS
  if (enforcingPacks.length === 0) {
    return 'pass';
  }

  // Check for conflicts (different decisions from different enforcing packs)
  const decisions = new Set(enforcingPacks.map(pr => pr.result.decision));

  if (decisions.size > 1) {
    // Conflict detected - log error and use MOST_RESTRICTIVE as fallback
    const packNames = enforcingPacks.map(pr => pr.pack.metadata.name).join(', ');
    const decisionList = Array.from(decisions).join(', ');

    console.error(
      `[YAMLGatekeeper] EXPLICIT conflict resolution required. ` +
      `Multiple packs returned different decisions: ${decisionList}. ` +
      `Packs: ${packNames}. ` +
      `Using MOST_RESTRICTIVE as fallback for safety.`
    );

    // Fallback to MOST_RESTRICTIVE for safety
    return computeMostRestrictive(packResults);
  }

  // All enforcing packs agree - return the decision
  return enforcingPacks[0].result.decision;
}

