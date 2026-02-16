/**
 * Agent PR Gatekeeper - Main Orchestrator
 * 
 * Coordinates all gatekeeper components:
 * 1. Agent detection
 * 2. Risk domain detection
 * 3. Evidence checking
 * 4. Risk tier calculation
 * 5. GitHub Check creation
 */

import { detectAgentAuthoredPR, type PRContext as AgentPRContext } from './agentDetector.js';
import { checkEvidenceRequirements, type PRContext as EvidencePRContext } from './evidenceChecker.js';
import { calculateRiskTier } from './riskTier.js';
import { createGatekeeperCheck } from './githubCheck.js';
import { detectDomainsFromSource } from '../baseline/patterns.js';
import { analyzeDeltaSync, type DeltaSyncFinding } from './deltaSync.js';
import { computeImpactAssessment } from '../evidence/impactAssessment.js';
import { joinSignals } from '../correlation/signalJoiner.js';
import { getInstallationOctokit } from '../../lib/github.js';
import type { SourceEvidence, TargetEvidence } from '../evidence/types.js';

export interface GatekeeperInput {
  // PR metadata
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  installationId: number;
  workspaceId: string;

  // PR content
  author: string;
  title: string;
  body: string;
  labels: string[];
  baseBranch: string;
  headBranch: string;

  // PR changes
  commits: Array<{ message: string; author: string }>;
  additions: number;
  deletions: number;
  files: Array<{ filename: string; patch?: string; status?: string }>;
}

export interface GatekeeperResult {
  riskTier: 'PASS' | 'INFO' | 'WARN' | 'BLOCK';
  riskScore: number;
  agentDetected: boolean;
  agentConfidence: number;
  domains: string[];
  evidenceSatisfied: boolean;
  missingEvidence: string[];
  checkCreated: boolean;
  deltaSyncFindings: DeltaSyncFinding[];
  impactScore?: number;
  impactBand?: 'low' | 'medium' | 'high' | 'critical';
  correlatedSignals?: number;
}

/**
 * Run the Agent PR Gatekeeper on a PR
 */
export async function runGatekeeper(input: GatekeeperInput): Promise<GatekeeperResult> {
  const analysisStartTime = new Date();
  console.log(`[Gatekeeper] Running gatekeeper for ${input.owner}/${input.repo}#${input.prNumber}`);

  // Step 1: Detect if PR is agent-authored
  const agentDetection = detectAgentAuthoredPR({
    author: input.author,
    commits: input.commits,
    additions: input.additions,
    deletions: input.deletions,
    files: input.files,
  });
  
  console.log(`[Gatekeeper] Agent detection: ${agentDetection.isAgentAuthored} (${(agentDetection.confidence * 100).toFixed(0)}% confidence)`);
  if (agentDetection.signals.length > 0) {
    console.log(`[Gatekeeper] Agent signals:`, agentDetection.signals.map(s => `${s.type}:${s.matched}`).join(', '));
  }
  
  // Step 2: Detect risk domains
  const evidenceText = `${input.title} ${input.body}`;
  const domains = detectDomainsFromSource(evidenceText, 'github_pr');
  
  console.log(`[Gatekeeper] Detected domains: ${domains.join(', ') || 'none'}`);
  
  // Step 3: Check evidence requirements
  const evidenceCheck = checkEvidenceRequirements({
    body: input.body,
    files: input.files,
    labels: input.labels,
    domains,
  });
  
  console.log(`[Gatekeeper] Evidence satisfied: ${evidenceCheck.satisfied}`);
  if (evidenceCheck.missing.length > 0) {
    console.log(`[Gatekeeper] Missing evidence:`, evidenceCheck.missing.join(', '));
  }

  // Step 4: Run delta sync analysis
  console.log(`[Gatekeeper] Running delta sync analysis...`);
  let deltaSyncResult;
  try {
    const octokit = await getInstallationOctokit(input.installationId);
    deltaSyncResult = await analyzeDeltaSync({
      files: input.files,
      octokit,
      owner: input.owner,
      repo: input.repo,
      baseBranch: input.baseBranch,
      headBranch: input.headBranch,
    });
    console.log(`[Gatekeeper] Delta sync: ${deltaSyncResult.summary}`);
  } catch (error) {
    console.error(`[Gatekeeper] Delta sync failed:`, error);
    deltaSyncResult = { findings: [], hasHighSignalFindings: false, summary: 'Delta sync analysis failed' };
  }

  // Step 5: Compute impact assessment
  console.log(`[Gatekeeper] Computing impact assessment...`);
  let impactScore = 0;
  let impactBand: 'low' | 'medium' | 'high' | 'critical' = 'low';
  try {
    // Build source evidence from PR
    const sourceEvidence: SourceEvidence = {
      sourceType: 'github_pr',
      sourceId: `${input.owner}/${input.repo}#${input.prNumber}`,
      timestamp: new Date().toISOString(),
      artifacts: {
        prDiff: {
          filesChanged: input.files.map(f => f.filename),
          linesAdded: input.additions,
          linesRemoved: input.deletions,
          excerpt: `${input.title}\n\n${input.body}`,
          maxChars: 5000,
          lineBounded: false,
        }
      }
    };

    // Build minimal target evidence (we don't have a specific doc target yet)
    const targetEvidence: TargetEvidence = {
      docSystem: 'github_readme',
      docId: 'gatekeeper-check',
      docTitle: 'Gatekeeper Check',
      surface: 'runbook', // Default to runbook for high-risk domains
      claims: [],
    };

    // Compute impact
    const assessment = await computeImpactAssessment({
      sourceEvidence,
      targetEvidence,
      driftCandidate: {
        driftType: domains.includes('deployment') || domains.includes('infra') ? 'instruction' : 'process',
        service: null,
      },
    });

    impactScore = assessment.impactScore;
    impactBand = assessment.impactBand;
    console.log(`[Gatekeeper] Impact: ${impactBand} (score: ${(impactScore * 100).toFixed(0)}%)`);
  } catch (error) {
    console.error(`[Gatekeeper] Impact assessment failed:`, error);
  }

  // Step 6: Correlate with other signals
  console.log(`[Gatekeeper] Correlating signals...`);
  let correlatedSignalsCount = 0;
  try {
    // Create a signal ID for this PR
    const signalId = `github_pr_${input.owner}_${input.repo}_${input.prNumber}`;

    // Try to infer service from file paths
    const inferredService = inferServiceFromFiles(input.files.map(f => f.filename));

    if (inferredService) {
      const joinResult = await joinSignals(
        input.workspaceId,
        signalId,
        inferredService,
        168 // 7 days
      );

      correlatedSignalsCount = joinResult.correlatedSignals.length;
      console.log(`[Gatekeeper] Found ${correlatedSignalsCount} correlated signals`);
      if (joinResult.joinReason) {
        console.log(`[Gatekeeper] Correlation reason: ${joinResult.joinReason}`);
      }
    }
  } catch (error) {
    console.error(`[Gatekeeper] Signal correlation failed:`, error);
  }

  // Step 7: Calculate risk tier with all factors
  const riskTierResult = calculateRiskTier({
    isAgentAuthored: agentDetection.isAgentAuthored,
    agentConfidence: agentDetection.confidence,
    domains,
    evidenceSatisfied: evidenceCheck.satisfied,
    missingEvidence: evidenceCheck.missing,
    impactScore,
    correlatedIncidents: correlatedSignalsCount,
  });

  console.log(`[Gatekeeper] Risk tier: ${riskTierResult.tier} (score: ${(riskTierResult.score * 100).toFixed(0)}%)`);
  console.log(`[Gatekeeper] Recommendation: ${riskTierResult.recommendation}`);
  
  // Step 8: Create GitHub Check with all findings
  try {
    const analysisDuration = Date.now() - analysisStartTime.getTime();

    await createGatekeeperCheck({
      owner: input.owner,
      repo: input.repo,
      headSha: input.headSha,
      installationId: input.installationId,
      riskTier: riskTierResult.tier,
      riskScore: riskTierResult.score,
      riskFactors: riskTierResult.factors,
      recommendation: riskTierResult.recommendation,
      missingEvidence: evidenceCheck.missing,
      optionalEvidence: evidenceCheck.optional,
      agentDetected: agentDetection.isAgentAuthored,
      agentConfidence: agentDetection.confidence,
      deltaSyncFindings: deltaSyncResult.findings,
      impactBand,
      correlatedSignalsCount,
      domains, // NEW: Pass all detected domains
      analysisStartTime, // NEW: Pass analysis start time
      analysisDuration, // NEW: Pass analysis duration
    });

    console.log(`[Gatekeeper] GitHub Check created successfully (${analysisDuration}ms)`);
  } catch (error) {
    console.error(`[Gatekeeper] Failed to create GitHub Check:`, error);
    throw error;
  }

  return {
    riskTier: riskTierResult.tier,
    riskScore: riskTierResult.score,
    agentDetected: agentDetection.isAgentAuthored,
    agentConfidence: agentDetection.confidence,
    domains,
    evidenceSatisfied: evidenceCheck.satisfied,
    missingEvidence: evidenceCheck.missing,
    checkCreated: true,
    deltaSyncFindings: deltaSyncResult.findings,
    impactScore,
    impactBand,
    correlatedSignals: correlatedSignalsCount,
  };
}

/**
 * Infer service name from file paths
 */
function inferServiceFromFiles(filePaths: string[]): string | null {
  // Try to extract service from common patterns
  for (const path of filePaths) {
    // Pattern: services/api/... -> api
    const serviceMatch = path.match(/services?\/([^/]+)/);
    if (serviceMatch && serviceMatch[1]) {
      return serviceMatch[1];
    }

    // Pattern: apps/api/... -> api
    const appMatch = path.match(/apps\/([^/]+)/);
    if (appMatch && appMatch[1]) {
      return appMatch[1];
    }
  }

  return null;
}

/**
 * Check if gatekeeper should run for this PR
 * 
 * Gatekeeper runs for:
 * - All PRs (to check evidence requirements)
 * - Extra scrutiny for agent-authored PRs
 */
export function shouldRunGatekeeper(pr: { author: string; labels: string[] }): boolean {
  // Skip for certain bot accounts that we trust
  const trustedBots = ['dependabot[bot]', 'renovate[bot]'];
  if (trustedBots.includes(pr.author)) {
    return false;
  }
  
  // Skip if PR has "skip-gatekeeper" label
  if (pr.labels.includes('skip-gatekeeper')) {
    return false;
  }
  
  // Run for all other PRs
  return true;
}

