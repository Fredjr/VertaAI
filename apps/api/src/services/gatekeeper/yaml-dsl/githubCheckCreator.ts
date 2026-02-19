/**
 * GitHub Check Creator for YAML-Driven Gatekeeper
 * Migration Plan v5.0 - Sprint 4
 * 
 * Creates GitHub Checks with pack hash and evidence bundle
 */

import type { PackEvaluationResult } from './packEvaluator.js';
import type { PackYAML } from './packValidator.js';
import type { PackResult } from './yamlGatekeeperIntegration.js';
import { getInstallationOctokit } from '../../../lib/github.js';

export interface CheckCreationInput {
  owner: string;
  repo: string;
  headSha: string;
  installationId: number;
  prNumber: number;
  packResult: PackEvaluationResult;  // DEPRECATED: Use packResults instead
  pack: PackYAML;  // DEPRECATED: Use packResults instead
  // PHASE 3 FIX: Multi-pack support
  packResults?: PackResult[];
  globalDecision?: 'pass' | 'warn' | 'block';
}

/**
 * Create GitHub Check with pack evaluation results
 * PHASE 3 FIX: Now supports multi-pack results
 */
export async function createYAMLGatekeeperCheck(input: CheckCreationInput): Promise<void> {
  const octokit = await getInstallationOctokit(input.installationId);

  // PHASE 3 FIX: Support both single-pack and multi-pack modes
  const isMultiPack = input.packResults && input.packResults.length > 0;

  if (isMultiPack) {
    // Multi-pack mode
    const decision = input.globalDecision!;

    // Use first pack's conclusionMapping (all packs should have same routing config)
    const conclusionMapping = input.packResults![0].pack.routing?.github?.conclusionMapping || {
      pass: 'success' as const,
      warn: 'success' as const,
      block: 'failure' as const,
    };

    const conclusion = conclusionMapping[decision];

    // Build check output for multi-pack
    const title = buildMultiPackCheckTitle(decision, input.packResults!);
    const summary = buildMultiPackCheckSummary(decision, input.packResults!);
    const text = buildMultiPackCheckText(input.packResults!);

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

    console.log(`[YAMLGatekeeperCheck] Created multi-pack check with conclusion: ${conclusion} (${input.packResults!.length} packs)`);
  } else {
    // Single-pack mode (backward compatibility)
    const conclusionMapping = input.pack.routing?.github?.conclusionMapping || {
      pass: 'success' as const,
      warn: 'success' as const,
      block: 'failure' as const,
    };

    const conclusion = conclusionMapping[input.packResult.decision];

    const title = buildCheckTitle(input.packResult);
    const summary = buildCheckSummary(input.packResult);
    const text = buildCheckText(input.packResult, input.pack);

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
  const { decision, findings, triggeredRules, packHash, packSource, evaluationTimeMs, engineFingerprint } = result;

  const lines = [
    `**Decision:** ${decision.toUpperCase()}`,
    `**Pack Hash:** \`${packHash.substring(0, 16)}\``,
    `**Pack Source:** ${packSource}`,
    `**Rules Triggered:** ${triggeredRules.length}`,
    `**Findings:** ${findings.length}`,
    `**Evaluation Time:** ${evaluationTimeMs}ms`,
    '',
    // CRITICAL FIX (Gap #1): Include engine fingerprint for audit trail
    `**Engine Version:** \`${engineFingerprint.evaluatorVersion}\``,
    `**Comparators Used:** ${Object.keys(engineFingerprint.comparatorVersions).length}`,
  ];

  return lines.join('\n');
}

function buildCheckText(result: PackEvaluationResult, pack: PackYAML): string {
  const { findings } = result;

  if (findings.length === 0) {
    return 'No policy violations found. All checks passed! 🎉';
  }

  const sections: string[] = [];
  const isObserveMode = pack.metadata.packMode === 'observe';

  // Group findings by decision
  const blockFindings = findings.filter(f => f.decisionOnFail === 'block' && f.comparatorResult.status === 'fail');
  const warnFindings = findings.filter(f => f.decisionOnFail === 'warn' && f.comparatorResult.status === 'fail');
  const unknownFindings = findings.filter(f => f.comparatorResult.status === 'unknown');
  const passFindings = findings.filter(f => f.comparatorResult.status === 'pass');

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

  // In observe mode, show pass findings so users can see what's being monitored
  if (isObserveMode && passFindings.length > 0) {
    sections.push('## ✅ Passing Checks\n');
    for (const finding of passFindings) {
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

// PHASE 3 FIX: Multi-pack check building functions

function buildMultiPackCheckTitle(decision: 'pass' | 'warn' | 'block', packResults: PackResult[]): string {
  if (decision === 'pass') {
    return `✅ All policy checks passed (${packResults.length} pack${packResults.length > 1 ? 's' : ''})`;
  }

  if (decision === 'warn') {
    const totalWarnings = packResults.reduce((sum, pr) =>
      sum + pr.result.findings.filter(f => f.decisionOnFail === 'warn').length, 0
    );
    return `⚠️ ${totalWarnings} warning(s) found across ${packResults.length} pack${packResults.length > 1 ? 's' : ''}`;
  }

  const totalBlocking = packResults.reduce((sum, pr) =>
    sum + pr.result.findings.filter(f => f.decisionOnFail === 'block').length, 0
  );
  return `❌ ${totalBlocking} blocking issue(s) found across ${packResults.length} pack${packResults.length > 1 ? 's' : ''}`;
}

function buildMultiPackCheckSummary(decision: 'pass' | 'warn' | 'block', packResults: PackResult[]): string {
  const totalFindings = packResults.reduce((sum, pr) => sum + pr.result.findings.length, 0);
  const totalRules = packResults.reduce((sum, pr) => sum + pr.result.triggeredRules.length, 0);
  const totalTime = packResults.reduce((sum, pr) => sum + pr.result.evaluationTimeMs, 0);

  const lines = [
    `**Global Decision:** ${decision.toUpperCase()}`,
    `**Packs Evaluated:** ${packResults.length}`,
    `**Total Findings:** ${totalFindings}`,
    `**Total Rules Triggered:** ${totalRules}`,
    `**Total Evaluation Time:** ${totalTime}ms`,
    '',
    '## Pack Results',
  ];

  for (const packResult of packResults) {
    const emoji = packResult.result.decision === 'pass' ? '✅' :
                  packResult.result.decision === 'warn' ? '⚠️' : '❌';
    lines.push(`- ${emoji} **${packResult.pack.metadata.name}** v${packResult.pack.metadata.version} (${packResult.packSource}): ${packResult.result.decision.toUpperCase()}`);
    lines.push(`  - Findings: ${packResult.result.findings.length}, Rules: ${packResult.result.triggeredRules.length}, Time: ${packResult.result.evaluationTimeMs}ms`);
  }

  return lines.join('\n');
}

function buildMultiPackCheckText(packResults: PackResult[]): string {
  const sections: string[] = [];

  // Group findings by pack
  for (const packResult of packResults) {
    const { pack, result } = packResult;

    if (result.findings.length === 0) {
      continue;  // Skip packs with no findings
    }

    sections.push(`# ${pack.metadata.name} v${pack.metadata.version}`);
    sections.push('');

    const isObserveMode = pack.metadata.packMode === 'observe';
    const blockFindings = result.findings.filter(f => f.decisionOnFail === 'block' && f.comparatorResult.status === 'fail');
    const warnFindings = result.findings.filter(f => f.decisionOnFail === 'warn' && f.comparatorResult.status === 'fail');
    const unknownFindings = result.findings.filter(f => f.comparatorResult.status === 'unknown');
    const passFindings = result.findings.filter(f => f.comparatorResult.status === 'pass');

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

    // In observe mode, show pass findings so users can see what's being monitored
    if (isObserveMode && passFindings.length > 0) {
      sections.push('## ✅ Passing Checks\n');
      for (const finding of passFindings) {
        sections.push(formatFinding(finding));
      }
    }

    sections.push('---\n');
  }

  if (sections.length === 0) {
    return 'No policy violations found across all packs. All checks passed! 🎉';
  }

  return sections.join('\n');
}

