/**
 * GitHub Check API Integration for Contract Gate
 * 
 * Creates GitHub Check runs for Contract Integrity Gate
 * Displays contract violations, surfaces touched, and findings
 */

import { getInstallationOctokit } from '../../lib/github.js';
import type { IntegrityFinding } from '../contracts/types.js';

export interface ContractCheckInput {
  owner: string;
  repo: string;
  headSha: string;
  installationId: number;

  // Contract validation results
  band: 'pass' | 'warn' | 'fail';
  findings: IntegrityFinding[];
  contractsChecked: number;
  duration: number;

  // Context
  signalEventId: string;
  workspaceId: string;

  // Metadata
  surfacesTouched?: string[];
  criticalCount?: number;
  highCount?: number;
  mediumCount?: number;
  lowCount?: number;
  policyMode?: string; // Policy enforcement mode
  timeoutOccurred?: boolean; // Flag to indicate validation timeout
}

/**
 * Create a GitHub Check run for contract validation
 */
export async function createContractValidationCheck(input: ContractCheckInput): Promise<void> {
  const octokit = await getInstallationOctokit(input.installationId);

  const conclusion = bandToConclusion(input.band);
  const title = formatTitle(input.band, input.findings.length);
  const summary = formatSummary(input);
  const text = formatDetails(input);
  const annotations = formatAnnotations(input.findings);

  await octokit.rest.checks.create({
    owner: input.owner,
    repo: input.repo,
    name: 'VertaAI Contract Integrity Gate',
    head_sha: input.headSha,
    status: 'completed',
    conclusion,
    output: {
      title,
      summary,
      text,
      annotations: annotations.length > 0 ? annotations : undefined,
    },
  });

  console.log(`[ContractGate] Created GitHub Check for ${input.owner}/${input.repo}#${input.headSha.substring(0, 7)} - ${input.band}`);
}

/**
 * Map band to GitHub Check conclusion
 */
function bandToConclusion(band: 'pass' | 'warn' | 'fail'): 'success' | 'failure' | 'neutral' {
  switch (band) {
    case 'pass':
      return 'success';
    case 'warn':
      return 'neutral';
    case 'fail':
      return 'failure';
    default:
      return 'neutral';
  }
}

/**
 * Format policy mode for display
 */
function formatPolicyMode(mode: string): string {
  switch (mode) {
    case 'warn_only':
      return '⚠️ Warn Only (never blocks)';
    case 'block_high_critical':
      return '🛑 Block on High/Critical';
    case 'block_all_critical':
      return '🛑 Block on Critical';
    default:
      return mode;
  }
}

/**
 * Format check title
 */
function formatTitle(band: 'pass' | 'warn' | 'fail', findingsCount: number): string {
  switch (band) {
    case 'pass':
      return '✅ Contract Validation Passed';
    case 'warn':
      return `⚠️ ${findingsCount} Contract Violation${findingsCount === 1 ? '' : 's'} Found`;
    case 'fail':
      return `🛑 ${findingsCount} Critical Contract Violation${findingsCount === 1 ? '' : 's'}`;
    default:
      return 'Contract Validation Complete';
  }
}

/**
 * Format check summary
 */
function formatSummary(input: ContractCheckInput): string {
  const lines: string[] = [];

  // Handle timeout case
  if (input.timeoutOccurred) {
    lines.push(`**Status:** WARN (Timeout)`);
    lines.push(`**Duration:** ${input.duration}ms (exceeded 25s limit)`);
    lines.push('');
    lines.push('⚠️ **Contract validation timed out**');
    lines.push('');
    lines.push('The validation process exceeded the 25-second time limit. This may indicate:');
    lines.push('- Too many contracts to check');
    lines.push('- Slow artifact fetching (GitHub API, Confluence, etc.)');
    lines.push('- Complex comparator logic');
    lines.push('');
    lines.push('**Action Required:** Review contract pack configuration and artifact sources.');
    return lines.join('\n');
  }

  lines.push(`**Status:** ${input.band.toUpperCase()}`);
  lines.push(`**Contracts Checked:** ${input.contractsChecked}`);
  lines.push(`**Duration:** ${input.duration}ms`);

  // Display policy mode if present
  if (input.policyMode) {
    const modeDisplay = formatPolicyMode(input.policyMode);
    lines.push(`**Policy Mode:** ${modeDisplay}`);
  }

  if (input.surfacesTouched && input.surfacesTouched.length > 0) {
    lines.push(`**Surfaces Touched:** ${input.surfacesTouched.join(', ')}`);
  }

  if (input.findings.length > 0) {
    const critical = input.criticalCount || 0;
    const high = input.highCount || 0;
    const medium = input.mediumCount || 0;
    const low = input.lowCount || 0;

    const parts: string[] = [];
    if (critical > 0) parts.push(`${critical} critical`);
    if (high > 0) parts.push(`${high} high`);
    if (medium > 0) parts.push(`${medium} medium`);
    if (low > 0) parts.push(`${low} low`);

    lines.push(`**Findings:** ${parts.join(', ')}`);
  }

  lines.push('');

  if (input.band === 'pass') {
    lines.push('✅ All contract obligations satisfied');
  } else if (input.band === 'warn') {
    lines.push('⚠️ Some contract violations detected - manual review recommended');
  } else {
    lines.push('🛑 Critical contract violations detected - action required');
  }

  return lines.join('\n');
}

/**
 * Format detailed check output
 */
function formatDetails(input: ContractCheckInput): string {
  const sections: string[] = [];
  
  // Surfaces Touched section
  if (input.surfacesTouched && input.surfacesTouched.length > 0) {
    sections.push('## 📋 Contract Surfaces Touched\n');
    for (const surface of input.surfacesTouched) {
      sections.push(`- ${formatSurfaceName(surface)}`);
    }
    sections.push('');
  }
  
  // Findings section
  if (input.findings.length > 0) {
    sections.push('## 🔍 Contract Violations\n');
    
    // Group findings by severity
    const bySeverity = groupBySeverity(input.findings);
    
    for (const severity of ['critical', 'high', 'medium', 'low'] as const) {
      const findings = bySeverity[severity];
      if (findings.length === 0) continue;
      
      const emoji = getSeverityEmoji(severity);
      sections.push(`### ${emoji} ${severity.toUpperCase()} (${findings.length})\n`);
      
      for (const finding of findings) {
        sections.push(`**${finding.driftType}**`);
        sections.push(`- Confidence: ${(finding.confidence * 100).toFixed(0)}%`);
        sections.push(`- Impact: ${(finding.impact * 100).toFixed(0)}%`);
        sections.push(`- Recommended Action: ${finding.recommendedAction}`);
        sections.push('');
      }
    }
  } else {
    sections.push('## ✅ No Contract Violations\n');
    sections.push('All contract obligations are satisfied.\n');
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

/**
 * Format surface name for display
 */
function formatSurfaceName(surface: string): string {
  const names: Record<string, string> = {
    api: '🔌 API (OpenAPI, GraphQL, REST)',
    infra: '🏗️ Infrastructure (Terraform, Kubernetes)',
    docs: '📚 Documentation (README, CHANGELOG)',
    data_model: '🗄️ Data Model (Prisma, Migrations)',
    observability: '📊 Observability (Grafana, Datadog)',
    security: '🔒 Security (Auth, Permissions)',
  };
  return names[surface] || surface;
}

/**
 * Group findings by severity
 */
function groupBySeverity(findings: IntegrityFinding[]): Record<'critical' | 'high' | 'medium' | 'low', IntegrityFinding[]> {
  return {
    critical: findings.filter(f => f.severity === 'critical'),
    high: findings.filter(f => f.severity === 'high'),
    medium: findings.filter(f => f.severity === 'medium'),
    low: findings.filter(f => f.severity === 'low'),
  };
}

/**
 * Format findings as GitHub Check annotations
 */
function formatAnnotations(findings: IntegrityFinding[]): Array<{
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: 'notice' | 'warning' | 'failure';
  message: string;
  title: string;
}> {
  const annotations: Array<{
    path: string;
    start_line: number;
    end_line: number;
    annotation_level: 'notice' | 'warning' | 'failure';
    message: string;
    title: string;
  }> = [];

  for (const finding of findings) {
    // GitHub Check API limits annotations to 50
    if (annotations.length >= 50) break;

    // Map severity to annotation level
    const annotation_level: 'notice' | 'warning' | 'failure' =
      finding.severity === 'critical' ? 'failure' :
      finding.severity === 'high' ? 'warning' :
      'notice';

    // Get evidence summary
    const evidenceSummary = finding.evidence
      .map(e => `${e.kind}: ${e.leftValue} → ${e.rightValue}`)
      .join('\n');

    // Create annotation for the first compared artifact
    const leftArtifact = finding.compared?.left?.artifact;
    const filePath = leftArtifact?.locator?.path || 'unknown';

    annotations.push({
      path: filePath,
      start_line: 1,
      end_line: 1,
      annotation_level,
      message: `${finding.driftType}\n\nConfidence: ${(finding.confidence * 100).toFixed(0)}%\nImpact: ${(finding.impact * 100).toFixed(0)}%\n\nEvidence:\n${evidenceSummary}\n\nRecommended Action: ${finding.recommendedAction}`,
      title: `Contract Violation: ${finding.driftType}`,
    });
  }

  return annotations;
}

