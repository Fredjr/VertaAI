/**
 * YAML-Driven Gatekeeper Integration
 * Migration Plan v5.0 - Sprint 4
 * 
 * Integrates pack evaluator into existing gatekeeper
 */

import type { PrismaClient } from '@prisma/client';
import { selectApplicablePack } from './packSelector.js';
import { PackEvaluator, type PackEvaluationResult } from './packEvaluator.js';
import { loadWorkspaceDefaults } from './workspaceDefaultsLoader.js';
import { BudgetedGitHubClient } from './comparators/types.js';
import type { PRContext } from './comparators/types.js';
import type { GatekeeperInput } from '../index.js';
import type { PackYAML } from './packValidator.js';

export interface YAMLGatekeeperResult {
  decision: 'pass' | 'warn' | 'block';
  packUsed: boolean;
  packHash?: string;
  packSource?: 'repo' | 'service' | 'workspace';
  findings: any[];
  triggeredRules: string[];
  evaluationTimeMs: number;

  // CRITICAL FIX (Gap #3): Include pack and full result for GitHub Check creation
  pack?: PackYAML;
  fullResult?: PackEvaluationResult;
}

/**
 * Run YAML-driven gatekeeper evaluation
 * Returns null if no pack is configured (fallback to legacy gatekeeper)
 */
export async function runYAMLGatekeeper(
  prisma: PrismaClient,
  input: GatekeeperInput,
  octokit: any
): Promise<YAMLGatekeeperResult | null> {
  const startTime = Date.now();

  // Step 1: Select applicable pack
  const selectedPack = await selectApplicablePack(
    prisma,
    input.workspaceId,
    input.owner,
    input.repo,
    input.headBranch
  );

  if (!selectedPack) {
    console.log(`[YAMLGatekeeper] No pack configured for ${input.owner}/${input.repo}, using legacy gatekeeper`);
    return null;
  }

  console.log(`[YAMLGatekeeper] Using pack: ${selectedPack.pack.metadata.name} v${selectedPack.pack.metadata.version} (${selectedPack.source})`);

  // Step 2: Load workspace defaults
  const defaults = await loadWorkspaceDefaults(prisma, input.workspaceId);

  // Step 3: Build PR context
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
  // This prevents comparators from bypassing budgets/cancellation
  const context: PRContext = {
    owner: input.owner,
    repo: input.repo,
    prNumber: input.prNumber,
    headSha: input.headSha,
    baseSha: '', // TODO: Get from input
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

  // Step 4: Evaluate pack
  const evaluator = new PackEvaluator();
  const result = await evaluator.evaluate(
    selectedPack.pack,
    selectedPack.packHash,
    selectedPack.source,
    context
  );

  console.log(`[YAMLGatekeeper] Decision: ${result.decision} (${result.findings.length} findings, ${result.triggeredRules.length} rules triggered)`);

  return {
    decision: result.decision,
    packUsed: true,
    packHash: selectedPack.packHash,
    packSource: selectedPack.source,
    findings: result.findings,
    triggeredRules: result.triggeredRules,
    evaluationTimeMs: Date.now() - startTime,

    // CRITICAL FIX (Gap #3): Include pack and full result for GitHub Check creation
    pack: selectedPack.pack,
    fullResult: result,
  };
}

