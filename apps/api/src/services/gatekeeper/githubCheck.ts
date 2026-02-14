/**
 * GitHub Check API Integration
 * 
 * Creates GitHub Check runs for Agent PR Gatekeeper
 * Displays risk tier, factors, and evidence requirements
 */

import { getInstallationOctokit } from '../../lib/github.js';
import type { RiskTier, RiskFactor } from './riskTier.js';

export interface GatekeeperCheckInput {
  owner: string;
  repo: string;
  headSha: string;
  installationId: number;
  riskTier: RiskTier;
  riskScore: number;
  riskFactors: RiskFactor[];
  recommendation: string;
  missingEvidence: string[];
  optionalEvidence: string[];
  agentDetected: boolean;
  agentConfidence?: number;
}

/**
 * Create a GitHub Check run for the gatekeeper
 */
export async function createGatekeeperCheck(input: GatekeeperCheckInput): Promise<void> {
  const octokit = await getInstallationOctokit(input.installationId);
  
  const conclusion = riskTierToConclusion(input.riskTier);
  const title = formatTitle(input.riskTier, input.agentDetected);
  const summary = formatSummary(input);
  const text = formatDetails(input);
  
  await octokit.rest.checks.create({
    owner: input.owner,
    repo: input.repo,
    name: 'VertaAI Agent PR Gatekeeper',
    head_sha: input.headSha,
    status: 'completed',
    conclusion,
    output: {
      title,
      summary,
      text,
    },
  });
  
  console.log(`[Gatekeeper] Created GitHub Check for ${input.owner}/${input.repo}#${input.headSha.substring(0, 7)} - ${input.riskTier}`);
}

/**
 * Map risk tier to GitHub Check conclusion
 */
function riskTierToConclusion(tier: RiskTier): 'success' | 'failure' | 'neutral' | 'action_required' {
  switch (tier) {
    case 'PASS':
      return 'success';
    case 'INFO':
      return 'neutral';
    case 'WARN':
      return 'neutral';
    case 'BLOCK':
      return 'action_required';
    default:
      return 'neutral';
  }
}

/**
 * Format check title
 */
function formatTitle(tier: RiskTier, agentDetected: boolean): string {
  const agentPrefix = agentDetected ? '🤖 Agent PR - ' : '';
  
  switch (tier) {
    case 'PASS':
      return `${agentPrefix}✅ Low Risk - Safe to Merge`;
    case 'INFO':
      return `${agentPrefix}ℹ️ Informational - Proceed with Caution`;
    case 'WARN':
      return `${agentPrefix}⚠️ Warning - Manual Review Recommended`;
    case 'BLOCK':
      return `${agentPrefix}🛑 High Risk - Action Required`;
    default:
      return `${agentPrefix}Unknown Risk Level`;
  }
}

/**
 * Format check summary
 */
function formatSummary(input: GatekeeperCheckInput): string {
  const lines: string[] = [];
  
  lines.push(`**Risk Tier:** ${input.riskTier}`);
  lines.push(`**Risk Score:** ${(input.riskScore * 100).toFixed(0)}%`);
  
  if (input.agentDetected && input.agentConfidence !== undefined) {
    lines.push(`**Agent Detection:** ${(input.agentConfidence * 100).toFixed(0)}% confidence`);
  }
  
  lines.push('');
  lines.push(`**Recommendation:** ${input.recommendation}`);
  
  return lines.join('\n');
}

/**
 * Format detailed check output
 */
function formatDetails(input: GatekeeperCheckInput): string {
  const sections: string[] = [];
  
  // Risk Factors section
  if (input.riskFactors.length > 0) {
    sections.push('## 🎯 Risk Factors\n');
    for (const factor of input.riskFactors) {
      const emoji = getSeverityEmoji(factor.severity);
      sections.push(`${emoji} **${factor.category}** (${factor.severity})`);
      sections.push(`   ${factor.description}`);
      sections.push(`   Weight: ${(factor.weight * 100).toFixed(0)}%\n`);
    }
  } else {
    sections.push('## ✅ No Significant Risk Factors\n');
  }
  
  // Missing Evidence section
  if (input.missingEvidence.length > 0) {
    sections.push('## ❌ Missing Required Evidence\n');
    for (const item of input.missingEvidence) {
      sections.push(`- ${item}`);
    }
    sections.push('');
  }
  
  // Optional Evidence section
  if (input.optionalEvidence.length > 0) {
    sections.push('## 💡 Optional Evidence (Recommended)\n');
    for (const item of input.optionalEvidence) {
      sections.push(`- ${item}`);
    }
    sections.push('');
  }
  
  // Next Steps section
  sections.push('## 📋 Next Steps\n');
  
  if (input.riskTier === 'BLOCK') {
    sections.push('1. Address all missing required evidence');
    sections.push('2. Request manual review from a senior engineer');
    sections.push('3. Consider breaking this PR into smaller changes');
  } else if (input.riskTier === 'WARN') {
    sections.push('1. Review the risk factors above');
    sections.push('2. Consider adding missing evidence');
    sections.push('3. Get approval from a domain expert if touching high-risk areas');
  } else if (input.riskTier === 'INFO') {
    sections.push('1. Review the informational items above');
    sections.push('2. Proceed with merge if you\'re confident in the changes');
  } else {
    sections.push('✅ No action required - safe to merge');
  }
  
  return sections.join('\n');
}

/**
 * Get emoji for severity level
 */
function getSeverityEmoji(severity: 'low' | 'medium' | 'high' | 'critical'): string {
  switch (severity) {
    case 'low':
      return '🟢';
    case 'medium':
      return '🟡';
    case 'high':
      return '🟠';
    case 'critical':
      return '🔴';
    default:
      return '⚪';
  }
}

