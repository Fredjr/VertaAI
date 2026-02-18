/**
 * GitHub Check Creator for YAML-Driven Gatekeeper
 * Migration Plan v5.0 - Sprint 4
 * 
 * Creates GitHub Checks with pack hash and evidence bundle
 */

import type { PackEvaluationResult } from './packEvaluator.js';
import { getInstallationOctokit } from '../../../lib/github.js';

export interface CheckCreationInput {
  owner: string;
  repo: string;
  headSha: string;
  installationId: number;
  prNumber: number;
  packResult: PackEvaluationResult;
}

/**
 * Create GitHub Check with pack evaluation results
 */
export async function createYAMLGatekeeperCheck(input: CheckCreationInput): Promise<void> {
  const octokit = await getInstallationOctokit(input.installationId);

  // Map decision to GitHub Check conclusion
  const conclusionMap = {
    pass: 'success' as const,
    warn: 'neutral' as const,
    block: 'failure' as const,
  };

  const conclusion = conclusionMap[input.packResult.decision];

  // Build check output
  const title = buildCheckTitle(input.packResult);
  const summary = buildCheckSummary(input.packResult);
  const text = buildCheckText(input.packResult);

  // Create check
  await octokit.rest.checks.create({
    owner: input.owner,
    repo: input.repo,
    name: 'VertaAI Policy Pack',
    head_sha: input.headSha,
    status: 'completed',
    conclusion,
    output: {
      title,
      summary,
      text,
    },
  });

  console.log(`[YAMLGatekeeperCheck] Created check with conclusion: ${conclusion}`);
}

function buildCheckTitle(result: PackEvaluationResult): string {
  const { decision, findings } = result;

  if (decision === 'pass') {
    return '✅ All policy checks passed';
  }

  if (decision === 'warn') {
    const warnCount = findings.filter(f => f.decisionOnFail === 'warn').length;
    return `⚠️ ${warnCount} warning(s) found`;
  }

  const blockCount = findings.filter(f => f.decisionOnFail === 'block').length;
  return `❌ ${blockCount} blocking issue(s) found`;
}

function buildCheckSummary(result: PackEvaluationResult): string {
  const { decision, findings, triggeredRules, packHash, packSource, evaluationTimeMs } = result;

  const lines = [
    `**Decision:** ${decision.toUpperCase()}`,
    `**Pack Hash:** \`${packHash.substring(0, 16)}\``,
    `**Pack Source:** ${packSource}`,
    `**Rules Triggered:** ${triggeredRules.length}`,
    `**Findings:** ${findings.length}`,
    `**Evaluation Time:** ${evaluationTimeMs}ms`,
  ];

  return lines.join('\n');
}

function buildCheckText(result: PackEvaluationResult): string {
  const { findings } = result;

  if (findings.length === 0) {
    return 'No policy violations found. All checks passed! 🎉';
  }

  const sections: string[] = [];

  // Group findings by decision
  const blockFindings = findings.filter(f => f.decisionOnFail === 'block' && f.comparatorResult.status === 'fail');
  const warnFindings = findings.filter(f => f.decisionOnFail === 'warn' && f.comparatorResult.status === 'fail');
  const unknownFindings = findings.filter(f => f.comparatorResult.status === 'unknown');

  if (blockFindings.length > 0) {
    sections.push('## ❌ Blocking Issues\n');
    for (const finding of blockFindings) {
      sections.push(formatFinding(finding));
    }
  }

  if (warnFindings.length > 0) {
    sections.push('## ⚠️ Warnings\n');
    for (const finding of warnFindings) {
      sections.push(formatFinding(finding));
    }
  }

  if (unknownFindings.length > 0) {
    sections.push('## ❓ Unable to Evaluate\n');
    for (const finding of unknownFindings) {
      sections.push(formatFinding(finding));
    }
  }

  return sections.join('\n');
}

function formatFinding(finding: any): string {
  const { ruleName, comparatorResult } = finding;
  const { message, evidence, reasonCode } = comparatorResult;

  const lines = [
    `### ${ruleName}`,
    `**Reason:** ${message}`,
    `**Code:** \`${reasonCode}\``,
  ];

  if (evidence && evidence.length > 0) {
    lines.push(`**Evidence:**`);
    for (const ev of evidence.slice(0, 3)) {
      if (ev.type === 'file') {
        lines.push(`- 📄 \`${ev.path}\``);
      } else if (ev.type === 'approval') {
        lines.push(`- ✅ Approved by @${ev.user}`);
      } else if (ev.type === 'checkrun') {
        lines.push(`- 🔍 Check: ${ev.name} (${ev.conclusion})`);
      } else if (ev.type === 'secret_detected') {
        lines.push(`- 🔒 Secret detected at ${ev.location} (hash: ${ev.hash})`);
      }
    }
    if (evidence.length > 3) {
      lines.push(`- ... and ${evidence.length - 3} more`);
    }
  }

  return lines.join('\n') + '\n';
}

