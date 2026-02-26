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

    // Check if ALL packs are in observe mode
    const allObserveMode = input.packResults!.every(pr => pr.pack.metadata.packMode === 'observe');

    // Use first pack's conclusionMapping (all packs should have same routing config)
    const conclusionMapping = input.packResults![0].pack.routing?.github?.conclusionMapping || {
      pass: 'success' as const,
      warn: 'success' as const,
      block: 'failure' as const,
    };

    // In observe mode, always return success (don't block PR) but show true decision in output
    const conclusion = allObserveMode ? 'success' as const : conclusionMapping[decision];

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
    const isObserveMode = input.pack.metadata.packMode === 'observe';

    const conclusionMapping = input.pack.routing?.github?.conclusionMapping || {
      pass: 'success' as const,
      warn: 'success' as const,
      block: 'failure' as const,
    };

    // In observe mode, always return success (don't block PR) but show true decision in output
    const conclusion = isObserveMode ? 'success' as const : conclusionMapping[input.packResult.decision];

    const title = buildCheckTitle(input.packResult, input.pack);
    const summary = buildCheckSummary(input.packResult, input.pack);
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

function buildCheckTitle(result: PackEvaluationResult, pack?: PackYAML): string {
  const { decision, findings } = result;
  const isObserveMode = pack?.metadata.packMode === 'observe';

  if (decision === 'pass') {
    return isObserveMode ? '👁️ Observation complete - no issues detected' : '✅ All policy checks passed';
  }

  if (decision === 'warn') {
    // CRITICAL FIX: Count BOTH comparator-based AND condition-based warnings
    const warnCount = findings.filter(f => {
      if (f.decisionOnFail !== 'warn') return false;

      // Comparator-based finding
      if (f.comparatorResult) {
        return f.comparatorResult.status === 'fail';
      }

      // Condition-based finding
      if (f.conditionResult) {
        return !f.conditionResult.satisfied;
      }

      return false;
    }).length;

    return isObserveMode
      ? `👁️ Would WARN (observe-only) - ${warnCount} warning(s) detected`
      : `⚠️ ${warnCount} warning(s) found`;
  }

  // CRITICAL FIX: Count BOTH comparator-based AND condition-based blocking findings
  const blockCount = findings.filter(f => {
    if (f.decisionOnFail !== 'block') return false;

    // Comparator-based finding
    if (f.comparatorResult) {
      return f.comparatorResult.status === 'fail';
    }

    // Condition-based finding
    if (f.conditionResult) {
      return !f.conditionResult.satisfied;
    }

    return false;
  }).length;

  return isObserveMode
    ? `👁️ Would BLOCK (observe-only) - ${blockCount} blocking issue(s) detected`
    : `❌ ${blockCount} blocking issue(s) found`;
}

function buildCheckSummary(result: PackEvaluationResult, pack?: PackYAML): string {
  const { decision, findings, triggeredRules, packHash, packSource, evaluationTimeMs, engineFingerprint } = result;
  const isObserveMode = pack?.metadata.packMode === 'observe';

  const lines = [
    isObserveMode ? `**Enforcement Mode:** OBSERVE-ONLY (not enforcing)` : `**Enforcement Mode:** ENFORCING`,
    `**Policy Decision:** ${decision.toUpperCase()}${isObserveMode && decision !== 'pass' ? ' (would have applied if enforcing)' : ''}`,
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

  console.log(`[GitHubCheckCreator] Pack mode: ${pack.metadata.packMode}, isObserveMode: ${isObserveMode}`);
  console.log(`[GitHubCheckCreator] Total findings: ${findings.length}`);
  findings.forEach((f, i) => {
    console.log(`[GitHubCheckCreator] Finding ${i}: status=${f.comparatorResult?.status}, ruleName=${f.ruleName}`);
  });

  // Group findings by decision
  const blockFindings = findings.filter(f => f.decisionOnFail === 'block' && f.comparatorResult?.status === 'fail');
  const warnFindings = findings.filter(f => f.decisionOnFail === 'warn' && f.comparatorResult?.status === 'fail');
  const unknownFindings = findings.filter(f => f.comparatorResult?.status === 'unknown');
  // Pass findings include:
  // 1. Comparator returned 'pass'
  // 2. Comparator returned 'fail' but decisionOnFail is 'pass' (observe mode)
  const passFindings = findings.filter(f =>
    f.comparatorResult?.status === 'pass' ||
    (f.comparatorResult?.status === 'fail' && f.decisionOnFail === 'pass')
  );

  console.log(`[GitHubCheckCreator] Grouped findings: block=${blockFindings.length}, warn=${warnFindings.length}, unknown=${unknownFindings.length}, pass=${passFindings.length}`);

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
  const { ruleName, comparatorResult, conditionResult } = finding;

  // Handle both comparator-based and condition-based findings
  let message: string;
  let reasonCode: string;
  let evidence: any[] = [];

  if (comparatorResult) {
    message = comparatorResult.message;
    reasonCode = comparatorResult.reasonCode;
    evidence = comparatorResult.evidence || [];
  } else if (conditionResult) {
    // Format condition result with enhanced context
    if (conditionResult.error) {
      message = `Condition evaluation error: ${conditionResult.error}`;
      reasonCode = 'CONDITION_ERROR';
    } else if (!conditionResult.satisfied) {
      const cond = conditionResult.condition;
      if ('fact' in cond) {
        // Simple condition - enhanced formatting with metadata
        message = `Condition not satisfied: ${cond.fact} ${cond.operator} ${JSON.stringify(cond.value)}`;

        // Add actual value if available
        if (conditionResult.actualValue !== undefined) {
          message += `\nActual Value: ${JSON.stringify(conditionResult.actualValue)}`;
          message += `\nExpected Value: ${JSON.stringify(cond.value)}`;
        }

        // ENHANCED: Add metadata for gate facts (cross-gate dependencies)
        if (cond.fact.startsWith('gate.') && (conditionResult as any).metadata) {
          const metadata = (conditionResult as any).metadata;
          message += `\n\n📊 Previous Check Details:`;
          message += `\n  • Check Name: ${metadata.checkName}`;
          message += `\n  • Check ID: ${metadata.checkId}`;
          message += `\n  • Completed At: ${new Date(metadata.completedAt).toLocaleString()}`;
          message += `\n  • GitHub Conclusion: ${metadata.conclusion}`;
          message += `\n  • Findings: ${metadata.findings}`;
        }
      } else {
        // Composite condition
        message = `Composite condition not satisfied`;
      }
      reasonCode = 'CONDITION_NOT_SATISFIED';
    } else {
      message = 'Condition satisfied';
      reasonCode = 'CONDITION_SATISFIED';
    }
  } else {
    message = 'Unknown finding type';
    reasonCode = 'UNKNOWN';
  }

  const lines = [
    `### ${ruleName}`,
    `**Reason:** ${message}`,
    `**Code:** \`${reasonCode}\``,
  ];

  // FIX D: Add remediation guidance for NOT_EVALUABLE findings
  if (reasonCode === 'NOT_EVALUABLE') {
    lines.push(`**Coverage:** ⚠️ Coverage gap - unable to evaluate this check`);

    // Extract field name from message if it's a PR template field check
    const fieldMatch = message.match(/field[:\s]+['"]?([^'"]+)['"]?/i);
    if (fieldMatch) {
      const fieldName = fieldMatch[1];
      lines.push(`**Missing Config:** \`workspace.defaults.prTemplate.requiredFields['${fieldName}']\``);
      lines.push(`**Action Required:** Configure PR template field mapping in workspace settings`);
      lines.push(`**How to Fix:** Add the following to your workspace defaults:`);
      lines.push(`\`\`\`yaml`);
      lines.push(`prTemplate:`);
      lines.push(`  requiredFields:`);
      lines.push(`    "${fieldName}":`);
      lines.push(`      matchAny:`);
      lines.push(`        - "## ${fieldName}\\\\s*\\\\n[\\\\s\\\\S]+"`);
      lines.push(`\`\`\``);
    } else {
      lines.push(`**Action Required:** Review and configure missing workspace defaults or external dependencies`);
    }
  }

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
  const allObserveMode = packResults.every(pr => pr.pack.metadata.packMode === 'observe');

  if (decision === 'pass') {
    return allObserveMode
      ? `👁️ Observation complete - no issues detected (${packResults.length} pack${packResults.length > 1 ? 's' : ''})`
      : `✅ All policy checks passed (${packResults.length} pack${packResults.length > 1 ? 's' : ''})`;
  }

  if (decision === 'warn') {
    // CRITICAL FIX: Count BOTH comparator-based AND condition-based warnings
    const totalWarnings = packResults.reduce((sum, pr) =>
      sum + pr.result.findings.filter(f => {
        if (f.decisionOnFail !== 'warn') return false;

        // Comparator-based finding
        if (f.comparatorResult) {
          return f.comparatorResult.status === 'fail';
        }

        // Condition-based finding
        if (f.conditionResult) {
          return !f.conditionResult.satisfied;
        }

        return false;
      }).length, 0
    );

    return allObserveMode
      ? `👁️ Would WARN (observe-only) - ${totalWarnings} warning(s) detected across ${packResults.length} pack${packResults.length > 1 ? 's' : ''}`
      : `⚠️ ${totalWarnings} warning(s) found across ${packResults.length} pack${packResults.length > 1 ? 's' : ''}`;
  }

  // CRITICAL FIX: Count BOTH comparator-based AND condition-based blocking findings
  const totalBlocking = packResults.reduce((sum, pr) =>
    sum + pr.result.findings.filter(f => {
      if (f.decisionOnFail !== 'block') return false;

      // Comparator-based finding
      if (f.comparatorResult) {
        return f.comparatorResult.status === 'fail';
      }

      // Condition-based finding
      if (f.conditionResult) {
        return !f.conditionResult.satisfied;
      }

      return false;
    }).length, 0
  );

  return allObserveMode
    ? `👁️ Would BLOCK (observe-only) - ${totalBlocking} blocking issue(s) detected across ${packResults.length} pack${packResults.length > 1 ? 's' : ''}`
    : `❌ ${totalBlocking} blocking issue(s) found across ${packResults.length} pack${packResults.length > 1 ? 's' : ''}`;
}

function buildMultiPackCheckSummary(decision: 'pass' | 'warn' | 'block', packResults: PackResult[]): string {
  // FIX B: Count blocks, warnings, and passes separately (not just total findings)
  const allFindings = packResults.flatMap(pr => pr.result.findings);

  const blockCount = allFindings.filter(f => {
    if (f.decisionOnFail !== 'block') return false;
    if (f.comparatorResult) return f.comparatorResult.status === 'fail';
    if (f.conditionResult) return !f.conditionResult.satisfied;
    return false;
  }).length;

  const warnCount = allFindings.filter(f => {
    if (f.decisionOnFail !== 'warn') return false;
    if (f.comparatorResult) return f.comparatorResult.status === 'fail';
    if (f.conditionResult) return !f.conditionResult.satisfied;
    return false;
  }).length;

  const passCount = allFindings.filter(f => {
    if (f.comparatorResult) {
      return f.comparatorResult.status === 'pass' ||
             (f.comparatorResult.status === 'fail' && f.decisionOnFail === 'pass');
    }
    if (f.conditionResult) {
      return f.conditionResult.satisfied || f.decisionOnFail === 'pass';
    }
    return false;
  }).length;

  // FIX A: Coverage reporting
  const totalCoverage = packResults.reduce((sum, pr) => ({
    evaluable: sum.evaluable + pr.result.coverage.evaluable,
    total: sum.total + pr.result.coverage.total,
    notEvaluable: sum.notEvaluable + pr.result.coverage.notEvaluable,
  }), { evaluable: 0, total: 0, notEvaluable: 0 });

  const totalRules = packResults.reduce((sum, pr) => sum + pr.result.triggeredRules.length, 0);
  const totalTime = packResults.reduce((sum, pr) => sum + pr.result.evaluationTimeMs, 0);

  // FIX C: Distinguish observe-only vs enforcing mode clearly
  const allObserveMode = packResults.every(pr => pr.pack.metadata.packMode === 'observe');
  const hasEnforcingPacks = packResults.some(pr => pr.pack.metadata.packMode === 'enforce');

  // QUICK WIN #2: Compute confidence score
  const confidenceScore = computeConfidenceScore(totalCoverage);

  // QUICK WIN #4: Extract actionable items
  const actionItems = extractActionItems(allFindings);

  const lines = [
    // QUICK WIN #1: Merge Impact Line
    decision === 'block'
      ? `🚫 **Merge allowed?** NO (blocking issues must be resolved)`
      : decision === 'warn'
        ? `⚠️ **Merge allowed?** YES (with warnings - review recommended)`
        : `✅ **Merge allowed?** YES (all checks passed)`,
    '',
    allObserveMode
      ? `**Enforcement Mode:** OBSERVE-ONLY (monitoring only, not blocking PRs)`
      : hasEnforcingPacks
        ? `**Enforcement Mode:** ENFORCING (${packResults.filter(pr => pr.pack.metadata.packMode === 'enforce').length} enforcing pack(s))`
        : `**Enforcement Mode:** ENFORCING`,
    allObserveMode && decision !== 'pass'
      ? `**Global Decision:** ${decision.toUpperCase()} (would have applied if enforcing)`
      : `**Global Decision:** ${decision.toUpperCase()}`,
    '',
    // FIX B: Show Blocks/Warnings/Pass counts clearly
    `**Blocks:** ${blockCount} | **Warnings:** ${warnCount} | **Pass:** ${passCount}`,
    // QUICK WIN #2: Coverage/Confidence
    `**Coverage:** ${totalCoverage.evaluable}/${totalCoverage.total} evaluable${totalCoverage.notEvaluable > 0 ? ` (${totalCoverage.notEvaluable} not evaluable)` : ''}`,
    `**Confidence:** ${confidenceScore.label} (${confidenceScore.percentage}% of checks evaluated successfully)`,
    `**Packs:** ${packResults.length} (${packResults.filter(pr => pr.result.decision === 'block').length} block, ${packResults.filter(pr => pr.result.decision === 'warn').length} warn, ${packResults.filter(pr => pr.result.decision === 'pass').length} pass)`,
    `**Total Rules Triggered:** ${totalRules}`,
    `**Total Evaluation Time:** ${totalTime}ms`,
  ];

  // QUICK WIN #4: Action List
  if (actionItems.length > 0) {
    lines.push('');
    lines.push('## 🎯 Actions Required');
    actionItems.forEach((action, idx) => {
      lines.push(`${idx + 1}. ${action}`);
    });
  }

  lines.push('');
  lines.push('## Pack Results');

  for (const packResult of packResults) {
    const isObserve = packResult.pack.metadata.packMode === 'observe';
    const emoji = packResult.result.decision === 'pass' ? '✅' :
                  packResult.result.decision === 'warn' ? '⚠️' : '❌';

    // FIX C: Show "Would BLOCK/WARN" for observe-mode packs
    const decisionLabel = isObserve && packResult.result.decision !== 'pass'
      ? `Would ${packResult.result.decision.toUpperCase()} (observe-only)`
      : packResult.result.decision.toUpperCase();

    lines.push(`- ${emoji} **${packResult.pack.metadata.name}** v${packResult.pack.metadata.version} (${packResult.packSource}): ${decisionLabel}`);
    lines.push(`  - Checks: ${packResult.result.findings.length}, Coverage: ${packResult.result.coverage.evaluable}/${packResult.result.coverage.total}, Time: ${packResult.result.evaluationTimeMs}ms`);
  }

  return lines.join('\n');
}

/**
 * QUICK WIN #2: Compute confidence score based on coverage
 */
function computeConfidenceScore(coverage: { evaluable: number; total: number; notEvaluable: number }): {
  label: 'High' | 'Medium' | 'Low';
  percentage: number;
} {
  if (coverage.total === 0) {
    return { label: 'High', percentage: 100 };
  }

  const percentage = Math.round((coverage.evaluable / coverage.total) * 100);

  if (percentage >= 90) {
    return { label: 'High', percentage };
  } else if (percentage >= 70) {
    return { label: 'Medium', percentage };
  } else {
    return { label: 'Low', percentage };
  }
}

/**
 * QUICK WIN #4: Extract actionable items from findings
 */
function extractActionItems(findings: any[]): string[] {
  const actions: string[] = [];
  const seenActions = new Set<string>();

  for (const finding of findings) {
    // Skip passing findings
    if (finding.comparatorResult?.status === 'pass') continue;
    if (finding.conditionResult?.satisfied) continue;

    const reasonCode = finding.comparatorResult?.reasonCode || 'UNKNOWN';

    // Generate action based on reason code
    let action: string | null = null;

    switch (reasonCode) {
      case 'ARTIFACT_MISSING':
        const artifactMatch = finding.comparatorResult?.message?.match(/Expected one of: (.+)/);
        if (artifactMatch) {
          action = `Add required artifact: ${artifactMatch[1].split(',')[0].trim()}`;
        } else {
          action = `Add required artifact as specified in the rule`;
        }
        break;

      case 'NOT_EVALUABLE':
        const fieldMatch = finding.comparatorResult?.message?.match(/field[:\s]+['"]?([^'"]+)['"]?/i);
        if (fieldMatch) {
          action = `Configure PR template field mapping for '${fieldMatch[1]}' in workspace settings`;
        } else {
          action = `Review and configure missing workspace defaults or external dependencies`;
        }
        break;

      case 'APPROVAL_MISSING':
        action = `Add required approval from authorized reviewer`;
        break;

      case 'CHECKRUN_FAILED':
        action = `Ensure required CI checks pass before merging`;
        break;

      case 'CONDITION_NOT_SATISFIED':
        action = `Review condition: ${finding.ruleName}`;
        break;

      default:
        // Generic action for other failures
        if (finding.decisionOnFail === 'block' || finding.decisionOnFail === 'warn') {
          action = `Resolve: ${finding.ruleName}`;
        }
    }

    if (action && !seenActions.has(action)) {
      actions.push(action);
      seenActions.add(action);
    }
  }

  return actions.slice(0, 5); // Limit to top 5 actions
}

function buildMultiPackCheckText(packResults: PackResult[]): string {
  const sections: string[] = [];

  // QUICK WIN #3: Add trigger evidence at the top
  const triggerEvidence = extractTriggerEvidence(packResults);
  if (triggerEvidence.length > 0) {
    sections.push('## 🔍 Why This Evaluation Triggered');
    sections.push('');
    triggerEvidence.forEach(evidence => {
      sections.push(`- ${evidence}`);
    });
    sections.push('');
    sections.push('---');
    sections.push('');
  }

  // Group findings by pack
  for (const packResult of packResults) {
    const { pack, result } = packResult;

    if (result.findings.length === 0) {
      continue;  // Skip packs with no findings
    }

    sections.push(`# ${pack.metadata.name} v${pack.metadata.version}`);
    sections.push('');

    const isObserveMode = pack.metadata.packMode === 'observe';

    // FIX: Handle both comparator-based and condition-based findings
    // Condition-based findings don't have comparatorResult, they have conditionResult
    const blockFindings = result.findings.filter(f => {
      if (f.decisionOnFail !== 'block') return false;
      if (f.comparatorResult) return f.comparatorResult.status === 'fail';
      if (f.conditionResult) return !f.conditionResult.satisfied;
      return false;
    });

    const warnFindings = result.findings.filter(f => {
      if (f.decisionOnFail !== 'warn') return false;
      if (f.comparatorResult) return f.comparatorResult.status === 'fail';
      if (f.conditionResult) return !f.conditionResult.satisfied;
      return false;
    });

    const unknownFindings = result.findings.filter(f => {
      if (f.comparatorResult) return f.comparatorResult.status === 'unknown';
      if (f.conditionResult) return false; // Conditions are never unknown
      return false;
    });

    // Pass findings include:
    // 1. Comparator returned 'pass'
    // 2. Comparator returned 'fail' but decisionOnFail is 'pass' (observe mode)
    // 3. Condition satisfied
    const passFindings = result.findings.filter(f => {
      if (f.comparatorResult) {
        return f.comparatorResult.status === 'pass' ||
               (f.comparatorResult.status === 'fail' && f.decisionOnFail === 'pass');
      }
      if (f.conditionResult) {
        return f.conditionResult.satisfied || f.decisionOnFail === 'pass';
      }
      return false;
    });

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

/**
 * QUICK WIN #3: Extract trigger evidence from pack results
 */
function extractTriggerEvidence(packResults: PackResult[]): string[] {
  const evidence: string[] = [];
  const seenEvidence = new Set<string>();

  for (const packResult of packResults) {
    const { pack, result } = packResult;

    // Check if pack has trigger conditions
    for (const rule of pack.rules) {
      // Check if rule was triggered
      if (!result.triggeredRules.includes(rule.id)) continue;

      // Extract trigger evidence from rule
      if (rule.trigger?.always) {
        const ev = `Rule "${rule.name}" triggers on every PR to protected branches`;
        if (!seenEvidence.has(ev)) {
          evidence.push(ev);
          seenEvidence.add(ev);
        }
      }

      if (rule.when?.changeSurfaces) {
        const surfaces = rule.when.changeSurfaces.anyOf || rule.when.changeSurfaces.allOf || [];
        const ev = `Rule "${rule.name}" triggered by change surfaces: ${surfaces.join(', ')}`;
        if (!seenEvidence.has(ev)) {
          evidence.push(ev);
          seenEvidence.add(ev);
        }
      }

      if (rule.when?.predicates) {
        const predicates = rule.when.predicates.anyOf || rule.when.predicates.allOf || [];
        const ev = `Rule "${rule.name}" triggered by predicates: ${predicates.join(', ')}`;
        if (!seenEvidence.has(ev)) {
          evidence.push(ev);
          seenEvidence.add(ev);
        }
      }

      if (rule.when?.conditions) {
        const ev = `Rule "${rule.name}" triggered by custom conditions`;
        if (!seenEvidence.has(ev)) {
          evidence.push(ev);
          seenEvidence.add(ev);
        }
      }
    }
  }

  // Add generic evidence if no specific triggers found
  if (evidence.length === 0) {
    evidence.push(`${packResults.length} policy pack(s) evaluated for this PR`);
  }

  return evidence.slice(0, 5); // Limit to top 5 pieces of evidence
}

