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

export interface GatekeeperInput {
  // PR metadata
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  installationId: number;
  
  // PR content
  author: string;
  title: string;
  body: string;
  labels: string[];
  
  // PR changes
  commits: Array<{ message: string; author: string }>;
  additions: number;
  deletions: number;
  files: Array<{ filename: string; patch?: string }>;
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
}

/**
 * Run the Agent PR Gatekeeper on a PR
 */
export async function runGatekeeper(input: GatekeeperInput): Promise<GatekeeperResult> {
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
  
  // Step 4: Calculate risk tier
  const riskTierResult = calculateRiskTier({
    isAgentAuthored: agentDetection.isAgentAuthored,
    agentConfidence: agentDetection.confidence,
    domains,
    evidenceSatisfied: evidenceCheck.satisfied,
    missingEvidence: evidenceCheck.missing,
    // Note: impactScore and correlatedIncidents can be added later
  });
  
  console.log(`[Gatekeeper] Risk tier: ${riskTierResult.tier} (score: ${(riskTierResult.score * 100).toFixed(0)}%)`);
  console.log(`[Gatekeeper] Recommendation: ${riskTierResult.recommendation}`);
  
  // Step 5: Create GitHub Check
  try {
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
    });
    
    console.log(`[Gatekeeper] GitHub Check created successfully`);
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
  };
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

