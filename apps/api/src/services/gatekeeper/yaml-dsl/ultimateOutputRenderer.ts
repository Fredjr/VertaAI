/**
 * Ultimate Track A Output Renderer
 * 
 * Renders the canonical NormalizedEvaluationResult into the "Ultimate Track A" format:
 * 
 * A) Executive Summary - Global decision + why + merge recommendation + confidence
 * B) Change Surface Summary - THE DIFFERENTIATOR (detected surfaces with evidence)
 * C) Required Contracts & Obligations - For each surface, what's required and status
 * D) Findings - Ranked by risk with "why it matters" + "how to fix"
 * E) Not-Evaluable Section - Separate, with impact on confidence
 * F) Next Best Actions - Agentic, prioritized steps
 */

import type { NormalizedEvaluationResult, NormalizedFinding, NotEvaluableItem } from './types.js';

/**
 * Render normalized evaluation result as GitHub Check summary (markdown)
 */
export function renderUltimateOutput(normalized: NormalizedEvaluationResult): string {
  const sections: string[] = [];

  // A) Executive Summary
  sections.push(renderExecutiveSummary(normalized));

  // B) Change Surface Summary (THE DIFFERENTIATOR)
  sections.push(renderChangeSurfaceSummary(normalized));

  // C) Required Contracts & Obligations
  sections.push(renderRequiredContracts(normalized));

  // F) Next Best Actions (moved up for visibility)
  sections.push(renderNextActions(normalized));

  // D) Findings (ranked by risk)
  if (normalized.findings.length > 0) {
    sections.push(renderFindings(normalized));
  }

  // E) Not-Evaluable Section (separate)
  if (normalized.notEvaluable.length > 0) {
    sections.push(renderNotEvaluable(normalized));
  }

  // Policy Provenance (CRITICAL - prevents regression)
  sections.push(renderPolicyProvenance(normalized));

  // Evidence Trace (CRITICAL - shows where we looked)
  sections.push(renderEvidenceTrace(normalized));

  // Metadata (collapsed)
  sections.push(renderMetadata(normalized));

  return sections.join('\n\n---\n\n');
}

/**
 * A) Executive Summary
 */
function renderExecutiveSummary(normalized: NormalizedEvaluationResult): string {
  const { decision, confidence, repoClassification } = normalized;
  const lines: string[] = [];

  lines.push('# 📋 Executive Summary');
  lines.push('');

  // CRITICAL FIX: Repository Context with confidence transparency
  if (repoClassification) {
    const tierEmoji = repoClassification.serviceTier === 'tier-1' ? '🔴' :
                      repoClassification.serviceTier === 'tier-2' ? '🟡' :
                      repoClassification.serviceTier === 'tier-3' ? '🟢' : '⚪';
    const typeEmoji = repoClassification.repoType === 'service' ? '⚙️' :
                      repoClassification.repoType === 'library' ? '📚' :
                      repoClassification.repoType === 'infra' ? '🏗️' : '📦';

    // Show repo type with confidence and source
    const breakdown = repoClassification.confidenceBreakdown;
    if (breakdown) {
      const typeConfidenceLabel = breakdown.repoTypeConfidence >= 0.9 ? 'HIGH' :
                                   breakdown.repoTypeConfidence >= 0.7 ? 'MEDIUM' : 'LOW';
      const typeSource = breakdown.repoTypeSource === 'explicit' ?
        `from ${breakdown.repoTypeEvidence[0]}` :
        `inferred from ${breakdown.repoTypeEvidence.join(', ')}`;

      lines.push(`**Repository:** ${typeEmoji} ${repoClassification.repoType.toUpperCase()} (${typeConfidenceLabel}) – ${typeSource}`);

      if (repoClassification.repoType === 'service') {
        const tierConfidenceLabel = breakdown.tierConfidence >= 0.9 ? 'HIGH' :
                                     breakdown.tierConfidence >= 0.7 ? 'MEDIUM' : 'LOW';
        const tierSource = breakdown.tierSource === 'explicit' ?
          `from ${breakdown.tierEvidence[0]}` :
          breakdown.tierSource === 'inferred' ?
          `inferred from ${breakdown.tierEvidence.join(', ')}` :
          'unknown (no tier markers found)';

        lines.push(`**Service Tier:** ${tierEmoji} ${repoClassification.serviceTier.toUpperCase()} (${tierConfidenceLabel}) – ${tierSource}`);
      }
    } else {
      // Fallback to old format
      lines.push(`**Repository:** ${typeEmoji} ${repoClassification.repoType.toUpperCase()}`);
      if (repoClassification.repoType === 'service') {
        lines.push(`**Service Tier:** ${tierEmoji} ${repoClassification.serviceTier.toUpperCase()}`);
      }
    }

    if (repoClassification.primaryLanguages.length > 0) {
      lines.push(`**Languages:** ${repoClassification.primaryLanguages.join(', ')}`);
    }
    lines.push('');
  }

  // Global decision
  const decisionEmoji = decision.outcome === 'pass' ? '✅' : decision.outcome === 'warn' ? '⚠️' : '🚫';
  lines.push(`**Decision:** ${decisionEmoji} **${decision.outcome.toUpperCase()}**`);
  lines.push('');

  // "Why" in 1-2 sentences (now contextualized)
  lines.push(`**Why:** ${decision.reason}`);
  lines.push('');

  // Merge recommendation (contextualized by tier)
  let mergeRec = decision.outcome === 'block'
    ? '🚫 **Do not merge** - Blocking issues must be resolved first'
    : decision.outcome === 'warn'
      ? '⚠️ **Merge with caution** - Review warnings before proceeding'
      : '✅ **Can merge** - All policy checks passed';

  if (repoClassification?.serviceTier === 'tier-1' && decision.outcome !== 'pass') {
    mergeRec += ' ⚠️ *Extra caution required for tier-1 services*';
  }

  lines.push(mergeRec);
  lines.push('');

  // CRITICAL FIX: Minimum to PASS (decision-grade clarity)
  const failedFindings = normalized.findings.filter(f =>
    f.result.status === 'fail' && f.decision !== 'pass'
  );

  if (failedFindings.length > 0) {
    lines.push(`**Minimum to PASS:** ${failedFindings.length} action(s) required`);
    const topActions = failedFindings.slice(0, 3).map(f => f.what);
    topActions.forEach(action => {
      lines.push(`- ${action}`);
    });
    if (failedFindings.length > 3) {
      lines.push(`- *...and ${failedFindings.length - 3} more*`);
    }
    lines.push('');
  }

  // CRITICAL FIX: 3-Layer Confidence Model (mathematically consistent)
  const confidenceIcon = confidence.level === 'high' ? '🟢' : confidence.level === 'medium' ? '🟡' : '🔴';
  lines.push(`**Overall Confidence:** ${confidenceIcon} **${confidence.level.toUpperCase()} (${confidence.score}%)**`);
  lines.push('');

  // Show 3-layer breakdown
  if (confidence.applicabilityConfidence) {
    const appIcon = confidence.applicabilityConfidence.level === 'high' ? '🟢' :
                    confidence.applicabilityConfidence.level === 'medium' ? '🟡' : '🔴';
    lines.push(`- **Applicability Confidence:** ${appIcon} ${confidence.applicabilityConfidence.level.toUpperCase()} (${confidence.applicabilityConfidence.score}%) – ${confidence.applicabilityConfidence.reason}`);
  }

  const evIcon = confidence.evidenceConfidence.level === 'high' ? '🟢' :
                 confidence.evidenceConfidence.level === 'medium' ? '🟡' : '🔴';
  lines.push(`- **Evidence Confidence:** ${evIcon} ${confidence.evidenceConfidence.level.toUpperCase()} (${confidence.evidenceConfidence.score}%) – ${confidence.evidenceConfidence.reason}`);

  lines.push(`- **Decision Confidence:** ${confidenceIcon} ${confidence.level.toUpperCase()} (${confidence.score}%) – aggregate of above`);

  if (confidence.degradationReasons.length > 0) {
    lines.push('');
    lines.push('*Why confidence is not HIGH:*');
    confidence.degradationReasons.forEach(reason => {
      lines.push(`- ${reason}`);
    });
  }

  // Decision thresholds (prevents "opaque scoring" regression)
  lines.push('');
  lines.push('**Decision Thresholds:**');
  lines.push('- BLOCK: Any obligation with `decisionOnFail: block` fails');
  lines.push('- WARN: Any obligation with `decisionOnFail: warn` fails (and no blocks)');
  lines.push('- PASS: All obligations pass or have `decisionOnFail: pass`');

  return lines.join('\n');
}

/**
 * B) Change Surface Summary (THE DIFFERENTIATOR!)
 */
function renderChangeSurfaceSummary(normalized: NormalizedEvaluationResult): string {
  const lines: string[] = [];

  lines.push('# 🎯 Change Surface Summary');
  lines.push('');
  lines.push('*This section shows what changed in your PR and why it triggered policy evaluation.*');
  lines.push('');

  if (normalized.surfaces.length === 0) {
    lines.push('No specific change surfaces detected. Evaluation triggered by default rules.');
    return lines.join('\n');
  }

  for (const surface of normalized.surfaces) {
    const confidenceIcon = surface.confidence >= 0.9 ? '🟢' : surface.confidence >= 0.7 ? '🟡' : '🔴';

    lines.push(`### ${surface.description}`);
    lines.push('');
    lines.push(`**Confidence:** ${confidenceIcon} ${Math.round(surface.confidence * 100)}%`);
    lines.push(`**Detection Method:** ${surface.detectionMethod}`);

    // CRITICAL FIX: Show which files in THIS PR triggered this surface
    if (surface.files.length > 0) {
      lines.push('');
      lines.push('**Files changed in this PR:**');
      surface.files.slice(0, 5).forEach(file => {
        lines.push(`- \`${file}\``);
      });
      if (surface.files.length > 5) {
        lines.push(`- *...and ${surface.files.length - 5} more*`);
      }
    }

    // CRITICAL FIX: Show which obligations this surface triggered
    const triggeredObligations = normalized.obligations.filter(obl =>
      obl.triggeredBy.includes(surface.surfaceId)
    );

    if (triggeredObligations.length > 0) {
      lines.push('');
      lines.push('**Triggered obligations:**');
      triggeredObligations.slice(0, 3).forEach(obl => {
        const statusIcon = obl.result.status === 'pass' ? '✅' :
                          obl.result.status === 'fail' ? '❌' :
                          obl.result.status === 'warn' ? '⚠️' : '❓';
        lines.push(`- ${statusIcon} ${obl.description}`);
      });
      if (triggeredObligations.length > 3) {
        lines.push(`- *...and ${triggeredObligations.length - 3} more*`);
      }
    }

    if (surface.metadata?.globs && surface.metadata.globs.length > 0) {
      lines.push('');
      lines.push('<details>');
      lines.push('<summary>🔍 Detection patterns used</summary>');
      lines.push('');
      surface.metadata.globs.slice(0, 5).forEach((glob: string) => {
        lines.push(`- \`${glob}\``);
      });
      if (surface.metadata.globs.length > 5) {
        lines.push(`- *...and ${surface.metadata.globs.length - 5} more*`);
      }
      lines.push('');
      lines.push('</details>');
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * C) Required Contracts & Obligations
 */
function renderRequiredContracts(normalized: NormalizedEvaluationResult): string {
  const lines: string[] = [];

  lines.push('# 📜 Required Contracts & Obligations');
  lines.push('');
  lines.push('*For each change surface, these are the contract requirements and their current status.*');
  lines.push('');

  // Group obligations by surface
  const obligationsBySurface = new Map<string, typeof normalized.obligations>();
  
  for (const obligation of normalized.obligations) {
    for (const surfaceId of obligation.triggeredBy) {
      if (!obligationsBySurface.has(surfaceId)) {
        obligationsBySurface.set(surfaceId, []);
      }
      obligationsBySurface.get(surfaceId)!.push(obligation);
    }
  }

  // Render by surface
  for (const surface of normalized.surfaces) {
    const obligations = obligationsBySurface.get(surface.surfaceId) || [];
    if (obligations.length === 0) continue;

    lines.push(`### ${surface.description}`);
    lines.push('');

    for (const obligation of obligations) {
      const statusIcon = obligation.result.status === 'pass' ? '✅' : 
                        obligation.result.status === 'fail' ? '❌' : '❓';
      
      lines.push(`${statusIcon} **${obligation.description}**`);
      lines.push(`   - Status: ${obligation.result.status.toUpperCase()}`);
      lines.push(`   - Impact if failed: ${obligation.decisionOnFail.toUpperCase()}`);
      
      if (obligation.result.status !== 'pass') {
        lines.push(`   - Reason: ${obligation.result.message}`);
      }
      
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * F) Next Best Actions
 */
function renderNextActions(normalized: NormalizedEvaluationResult): string {
  const lines: string[] = [];

  lines.push('# 🎯 Next Best Actions');
  lines.push('');

  if (normalized.nextActions.length === 0) {
    lines.push('No actions required - all checks passed!');
    return lines.join('\n');
  }

  lines.push('*Prioritized steps to resolve policy violations:*');
  lines.push('');

  for (const action of normalized.nextActions) {
    const categoryIcon = action.category === 'fix_blocking' ? '🚨' :
                        action.category === 'fix_warning' ? '⚠️' :
                        action.category === 'configure_policy' ? '⚙️' : '👥';

    lines.push(`${action.priority}. ${categoryIcon} ${action.action}`);
  }

  return lines.join('\n');
}

/**
 * D) Findings (ranked by risk)
 */
function renderFindings(normalized: NormalizedEvaluationResult): string {
  const lines: string[] = [];

  lines.push('# 🔍 Findings (Ranked by Risk)');
  lines.push('');

  // Group by severity
  const critical = normalized.findings.filter(f => f.severity === 'critical');
  const high = normalized.findings.filter(f => f.severity === 'high');
  const medium = normalized.findings.filter(f => f.severity === 'medium');
  const low = normalized.findings.filter(f => f.severity === 'low');

  if (critical.length > 0) {
    lines.push('## 🚨 Critical Issues');
    lines.push('');
    critical.forEach(finding => lines.push(renderFinding(finding)));
  }

  if (high.length > 0) {
    lines.push('## ❌ High Priority');
    lines.push('');
    high.forEach(finding => lines.push(renderFinding(finding)));
  }

  if (medium.length > 0) {
    lines.push('## ⚠️ Warnings');
    lines.push('');
    medium.forEach(finding => lines.push(renderFinding(finding)));
  }

  if (low.length > 0) {
    lines.push('<details>');
    lines.push('<summary>ℹ️ Low Priority Issues</summary>');
    lines.push('');
    low.forEach(finding => lines.push(renderFinding(finding)));
    lines.push('</details>');
  }

  return lines.join('\n');
}

/**
 * Render a single finding with all details
 */
function renderFinding(finding: NormalizedFinding): string {
  const lines: string[] = [];

  lines.push(`### ${finding.what}`);
  lines.push('');

  // CRITICAL FIX: Risk Score with transparent drivers
  if (finding.riskScore) {
    const riskColor = finding.riskScore.score >= 70 ? '🔴' :
                      finding.riskScore.score >= 50 ? '🟡' : '🟢';
    lines.push(`**Risk Score:** ${riskColor} ${finding.riskScore.score}/100`);

    if (finding.riskScore.drivers) {
      lines.push(`- Blast Radius: ${finding.riskScore.factors.blastRadius}/30 (${finding.riskScore.drivers.blastRadiusReason})`);
      lines.push(`- Criticality: ${finding.riskScore.factors.criticality}/30 (${finding.riskScore.drivers.criticalityReason})`);
      lines.push(`- Immediacy: ${finding.riskScore.factors.immediacy}/20 (${finding.riskScore.drivers.immediacyReason})`);
      lines.push(`- Dependency: ${finding.riskScore.factors.dependency}/20 (${finding.riskScore.drivers.dependencyReason})`);
    } else {
      lines.push(`- Blast Radius: ${finding.riskScore.factors.blastRadius}/30`);
      lines.push(`- Criticality: ${finding.riskScore.factors.criticality}/30`);
      lines.push(`- Immediacy: ${finding.riskScore.factors.immediacy}/20`);
      lines.push(`- Dependency: ${finding.riskScore.factors.dependency}/20`);
    }
    lines.push('');
  }

  // PHASE 4: Applicability (NEW - shows if this applies to this repo)
  if (finding.applicability && !finding.applicability.applies) {
    lines.push(`⚠️ **Note:** ${finding.applicability.reason}`);
    lines.push('');
  }

  // Why it matters (now contextualized)
  lines.push(`**Why it matters:** ${finding.why}`);
  lines.push('');

  // Evidence
  if (finding.evidence.length > 0) {
    lines.push('**Evidence:**');
    finding.evidence.slice(0, 3).forEach(ev => {
      if (ev.type === 'file') {
        lines.push(`- 📄 \`${ev.value}\``);
      } else if (ev.type === 'approval') {
        lines.push(`- ✅ ${ev.value}`);
      } else if (ev.type === 'checkrun') {
        lines.push(`- 🔍 ${ev.value}`);
      } else {
        lines.push(`- ${ev.value}`);
      }
    });
    if (finding.evidence.length > 3) {
      lines.push(`- *...and ${finding.evidence.length - 3} more*`);
    }
    lines.push('');
  }

  // CRITICAL FIX: Evidence Transparency (show where we looked, what we found)
  if (finding.evidenceSearch) {
    lines.push('<details>');
    lines.push('<summary>🔍 Evidence Search Details</summary>');
    lines.push('');

    if (finding.evidenceSearch.searchedPaths && finding.evidenceSearch.searchedPaths.length > 0) {
      lines.push('**Where we looked:**');
      finding.evidenceSearch.searchedPaths.forEach(path => {
        lines.push(`- \`${path}\``);
      });
      lines.push('');
    }

    if (finding.evidenceSearch.matchedPaths && finding.evidenceSearch.matchedPaths.length > 0) {
      lines.push('**What we found:**');
      finding.evidenceSearch.matchedPaths.forEach(path => {
        lines.push(`- ✅ \`${path}\``);
      });
      lines.push('');
    }

    if (finding.evidenceSearch.closestMatches && finding.evidenceSearch.closestMatches.length > 0) {
      lines.push('**Closest matches:**');
      finding.evidenceSearch.closestMatches.forEach(match => {
        lines.push(`- 📁 ${match}`);
      });
      lines.push('');
    }

    lines.push('</details>');
    lines.push('');
  }

  // How to fix
  lines.push('**How to fix:**');
  finding.howToFix.forEach((step, idx) => {
    lines.push(`${idx + 1}. ${step}`);
  });
  lines.push('');

  // Owner (if available)
  if (finding.owner) {
    if (finding.owner.team) {
      lines.push(`**Owner:** @${finding.owner.team}`);
    } else if (finding.owner.codeownersPath) {
      lines.push(`**Owner:** See \`${finding.owner.codeownersPath}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * E) Not-Evaluable Section
 */
function renderNotEvaluable(normalized: NormalizedEvaluationResult): string {
  const lines: string[] = [];

  lines.push('# ❓ Not-Evaluable Checks');
  lines.push('');
  lines.push('*These checks could not be evaluated due to configuration or integration issues.*');
  lines.push('');

  // Group by category
  const policyMisconfig = normalized.notEvaluable.filter(item => item.category === 'policy_misconfig');
  const missingEvidence = normalized.notEvaluable.filter(item => item.category === 'missing_external_evidence');
  const integrationErrors = normalized.notEvaluable.filter(item => item.category === 'integration_error');

  if (policyMisconfig.length > 0) {
    lines.push('## ⚙️ Policy Configuration Issues');
    lines.push('');
    lines.push('*These require workspace or policy configuration updates:*');
    lines.push('');
    policyMisconfig.forEach(item => lines.push(renderNotEvaluableItem(item)));
  }

  if (missingEvidence.length > 0) {
    lines.push('## 🔗 Missing External Evidence');
    lines.push('');
    lines.push('*These require external integrations or dependencies:*');
    lines.push('');
    missingEvidence.forEach(item => lines.push(renderNotEvaluableItem(item)));
  }

  if (integrationErrors.length > 0) {
    lines.push('## 🔌 Integration Errors');
    lines.push('');
    lines.push('*These are temporary issues that may resolve on retry:*');
    lines.push('');
    integrationErrors.forEach(item => lines.push(renderNotEvaluableItem(item)));
  }

  return lines.join('\n');
}

/**
 * Render a single not-evaluable item
 */
function renderNotEvaluableItem(item: NotEvaluableItem): string {
  const lines: string[] = [];

  const impactIcon = item.confidenceImpact === 'high' ? '🔴' :
                     item.confidenceImpact === 'medium' ? '🟡' : '🟢';

  lines.push(`### ${item.description}`);
  lines.push('');
  lines.push(`**Issue:** ${item.message}`);
  lines.push(`**Impact:** ${impactIcon} ${item.confidenceImpact.toUpperCase()} confidence impact`);
  lines.push(`**Decision degraded to:** ${item.degradeTo.toUpperCase()}`);
  lines.push('');

  lines.push('**How to fix:**');
  item.remediation.steps.forEach((step, idx) => {
    lines.push(`${idx + 1}. ${step}`);
  });

  if (item.remediation.configPath) {
    lines.push('');
    lines.push(`**Config path:** \`${item.remediation.configPath}\``);
  }

  if (item.remediation.documentationUrl) {
    lines.push('');
    lines.push(`**Documentation:** ${item.remediation.documentationUrl}`);
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Render Policy Provenance (CRITICAL - prevents "advisor output" regression)
 * Shows which packs, rules, and codes were evaluated
 */
function renderPolicyProvenance(normalized: NormalizedEvaluationResult): string {
  const lines: string[] = [];

  lines.push('# 📋 Policy Provenance');
  lines.push('');
  lines.push('*This section shows which policy packs and rules were evaluated, ensuring auditability and reproducibility.*');
  lines.push('');

  // Pack information
  lines.push('## Evaluated Packs');
  lines.push('');
  lines.push(`- **Pack:** ${normalized.metadata.packName} v${normalized.metadata.packVersion}`);
  lines.push(`- **Pack ID:** \`${normalized.metadata.packId}\``);
  lines.push(`- **Evaluation Time:** ${normalized.metadata.evaluationTimeMs}ms`);
  lines.push(`- **Timestamp:** ${normalized.metadata.timestamp}`);
  lines.push('');

  // Triggered rules with their decisions
  lines.push('## Triggered Rules');
  lines.push('');

  // Group obligations by rule
  const ruleMap = new Map<string, typeof normalized.obligations>();
  for (const obligation of normalized.obligations) {
    const ruleKey = `${obligation.sourceRule.ruleId}:${obligation.sourceRule.ruleName}`;
    if (!ruleMap.has(ruleKey)) {
      ruleMap.set(ruleKey, []);
    }
    ruleMap.get(ruleKey)!.push(obligation);
  }

  for (const [ruleKey, obligations] of ruleMap.entries()) {
    const [ruleId, ruleName] = ruleKey.split(':');
    const failedCount = obligations.filter(o => o.result.status === 'fail').length;
    const notEvaluableCount = obligations.filter(o => o.evaluationStatus === 'not_evaluable').length;
    const passedCount = obligations.filter(o => o.result.status === 'pass').length;

    const statusIcon = failedCount > 0 ? '❌' : notEvaluableCount > 0 ? '❓' : '✅';
    const decision = failedCount > 0 ? obligations.find(o => o.result.status === 'fail')?.decisionOnFail.toUpperCase() : 'PASS';

    lines.push(`### ${statusIcon} \`${ruleId}\` - ${ruleName}`);
    lines.push('');
    lines.push(`- **Decision:** ${decision}`);
    lines.push(`- **Obligations:** ${obligations.length} total (${passedCount} passed, ${failedCount} failed, ${notEvaluableCount} not evaluable)`);
    lines.push(`- **Pack:** ${normalized.metadata.packName}`);

    // Show individual obligation results
    if (failedCount > 0 || notEvaluableCount > 0) {
      lines.push('');
      lines.push('**Details:**');
      for (const obligation of obligations) {
        if (obligation.result.status === 'fail' || obligation.evaluationStatus === 'not_evaluable') {
          const icon = obligation.result.status === 'fail' ? '❌' : '❓';
          lines.push(`- ${icon} ${obligation.description}`);
          lines.push(`  - **Status:** ${obligation.result.status.toUpperCase()}`);
          lines.push(`  - **Code:** \`${obligation.result.reasonCode}\``);
          lines.push(`  - **Reason:** ${obligation.result.message}`);
        }
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Render Evidence Trace (CRITICAL - shows "where did we look")
 * Prevents "opaque scoring" regression by showing concrete evidence evaluation
 */
function renderEvidenceTrace(normalized: NormalizedEvaluationResult): string {
  const lines: string[] = [];

  lines.push('# 🔍 Evidence Trace');
  lines.push('');
  lines.push('*This section shows where we looked for evidence and what we found, ensuring transparency and debuggability.*');
  lines.push('');

  // Group evidence by obligation
  for (const obligation of normalized.obligations) {
    // Only show evidence for failed or not-evaluable obligations
    if (obligation.result.status === 'pass') continue;

    lines.push(`## ${obligation.description}`);
    lines.push('');
    lines.push(`**Rule:** \`${obligation.sourceRule.ruleId}\` - ${obligation.sourceRule.ruleName}`);
    lines.push(`**Status:** ${obligation.result.status.toUpperCase()}`);
    lines.push(`**Code:** \`${obligation.result.reasonCode}\``);
    lines.push('');

    if (obligation.evidence.length > 0) {
      lines.push('**Looked for evidence in:**');
      lines.push('');

      for (const evidence of obligation.evidence) {
        const icon = evidence.type === 'file' ? '📄' :
                     evidence.type === 'approval' ? '👤' :
                     evidence.type === 'checkrun' ? '🔍' :
                     evidence.type === 'diff' ? '📝' : '📌';

        lines.push(`- ${icon} **${evidence.type}:** ${evidence.value}`);

        if (evidence.metadata) {
          if (evidence.metadata.path) {
            lines.push(`  - Path: \`${evidence.metadata.path}\``);
          }
          if (evidence.metadata.pattern) {
            lines.push(`  - Pattern: \`${evidence.metadata.pattern}\``);
          }
          if (evidence.metadata.status) {
            lines.push(`  - Status: ${evidence.metadata.status}`);
          }
        }
      }
      lines.push('');
    } else {
      lines.push('**No evidence found** - This is why the obligation failed or could not be evaluated.');
      lines.push('');
    }

    // Show what would make this pass
    if (obligation.result.status === 'fail') {
      lines.push('**To pass this check:**');
      lines.push('');

      // Extract "how to fix" from the finding
      const relatedFinding = normalized.findings.find(f => f.obligationId === obligation.id);
      if (relatedFinding) {
        relatedFinding.howToFix.forEach((step, idx) => {
          lines.push(`${idx + 1}. ${step}`);
        });
      } else {
        lines.push(`1. ${obligation.result.message}`);
      }
      lines.push('');
    }

    if (obligation.evaluationStatus === 'not_evaluable' && obligation.notEvaluableReason) {
      lines.push('**Why not evaluable:**');
      lines.push('');
      lines.push(`- **Category:** ${obligation.notEvaluableReason.category}`);
      lines.push(`- **Remediation:** ${obligation.notEvaluableReason.remediation}`);
      lines.push('');
    }
  }

  if (normalized.obligations.filter(o => o.result.status !== 'pass').length === 0) {
    lines.push('*All obligations passed - no evidence trace needed.*');
  }

  return lines.join('\n');
}

/**
 * Render metadata (collapsed)
 */
function renderMetadata(normalized: NormalizedEvaluationResult): string {
  const lines: string[] = [];

  lines.push('<details>');
  lines.push('<summary>📊 Evaluation Metadata</summary>');
  lines.push('');
  lines.push(`- **Pack:** ${normalized.metadata.packName} v${normalized.metadata.packVersion}`);
  lines.push(`- **Pack ID:** \`${normalized.metadata.packId}\``);
  lines.push(`- **Evaluation Time:** ${normalized.metadata.evaluationTimeMs}ms`);
  lines.push(`- **Timestamp:** ${normalized.metadata.timestamp}`);
  lines.push(`- **Surfaces Detected:** ${normalized.surfaces.length}`);
  lines.push(`- **Obligations Checked:** ${normalized.obligations.length}`);
  lines.push(`- **Findings:** ${normalized.findings.length}`);
  lines.push(`- **Not Evaluable:** ${normalized.notEvaluable.length}`);
  lines.push('</details>');

  return lines.join('\n');
}
