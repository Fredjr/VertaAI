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
}

/**
 * Run YAML-driven gatekeeper evaluation
 * PHASE 2 FIX: Now evaluates ALL applicable packs and aggregates decisions
 * Returns null if no pack is configured (fallback to legacy gatekeeper)
 */
export async function runYAMLGatekeeper(
  prisma: PrismaClient,
  input: GatekeeperInput,
  octokit: any
): Promise<YAMLGatekeeperResult | null> {
  const startTime = Date.now();

  // Step 1: PHASE 2 FIX - Select ALL applicable packs
  const selectedPacks = await selectApplicablePacks(
    prisma,
    input.workspaceId,
    input.owner,
    input.repo,
    input.headBranch
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

  // Step 3: PHASE 2 FIX - Evaluate ALL packs
  const packResults: PackResult[] = [];
  const evaluator = new PackEvaluator();

  for (const selectedPack of selectedPacks) {
    // Build PR context for this pack
    const abortController = new AbortController();
    const budgets = {
      maxTotalMs: selectedPack.pack.evaluation?.budgets?.maxTotalMs || 30000,
      perComparatorTimeoutMs: selectedPack.pack.evaluation?.budgets?.perComparatorTimeoutMs || 5000,
      maxGitHubApiCalls: selectedPack.pack.evaluation?.budgets?.maxGitHubApiCalls || 50,
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
      baseSha: '',
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

  return {
    decision: globalDecision,
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
  };
}

/**
 * PHASE 2 FIX: Compute global decision from multiple pack results
 * Decision algorithm: any BLOCK → BLOCK, else any WARN → WARN, else PASS
 */
function computeGlobalDecision(packResults: PackResult[]): 'pass' | 'warn' | 'block' {
  // Check for any BLOCK decisions
  for (const packResult of packResults) {
    if (packResult.result.decision === 'block') {
      return 'block';
    }
  }

  // Check for any WARN decisions
  for (const packResult of packResults) {
    if (packResult.result.decision === 'warn') {
      return 'warn';
    }
  }

  // All packs passed
  return 'pass';
}

