/**
 * Ultimate Track A Output Renderer (v3.0 - Elite Governance Layer Output)
 *
 * Renders the canonical NormalizedEvaluationResult into "Top-Tier Decision-Grade" format:
 *
 * ELITE UPGRADES (v3.0):
 * - Context-aware "why it matters" (repo-type + obligation-type specific)
 * - Patch previews (copy-pasteable, correct-by-construction templates)
 * - Fixed risk score color coding (0-30 green, 31-60 yellow, 61-100 red)
 * - Deduplicated remediation (consolidated in Findings only)
 * - Concise-first rendering (executive card + collapsible details)
 * - Drift framing (Repo Invariant vs Diff-Derived Expectation)
 * - Contract graph reasoning (artifact relationships + control objectives)
 * - Strict terminology (applicable vs evaluated vs suppressed)
 *
 * STRUCTURE:
 * A) Executive Summary - Tight decision card + confidence
 * B) Policy Activation - Signals + overlays + suppressed obligations
 * C) Change Surface Summary - What changed + what contracts triggered
 * D) Required Contracts & Obligations - Status per surface
 * E) Next Best Actions - Prioritized, actionable steps
 * F) Findings - Ranked by risk with context-aware guidance
 * G) Policy Provenance - Auditability (collapsed)
 * H) Evidence Trace - Transparency (collapsed)
 */

import type { NormalizedEvaluationResult, NormalizedFinding, NotEvaluableItem, NormalizedObligation } from './types.js';

/**
 * ELITE HELPER: Build context-aware "why it matters" based on repo type + obligation type
 */
function buildContextAwareWhyItMatters(
  finding: NormalizedFinding,
  repoType: string,
  obligationDescription: string
): string {
  const desc = obligationDescription.toLowerCase();

  // CODEOWNERS-specific reasoning
  if (desc.includes('codeowners')) {
    if (repoType === 'docs') {
      return 'Without ownership, docs PRs may sit unreviewed or get merged without subject-matter expert approval, leading to outdated/incorrect documentation.';
    } else if (repoType === 'service') {
      return 'Missing CODEOWNERS means production changes may bypass required team review, violating change management controls and increasing incident risk.';
    } else if (repoType === 'library') {
      return 'Library changes without ownership review can introduce breaking changes that cascade to dependent services.';
    } else {
      return 'Missing ownership clarity affects review routing and accountability for changes.';
    }
  }

  // Runbook-specific reasoning
  if (desc.includes('runbook')) {
    if (repoType === 'service') {
      return 'Without a runbook, on-call engineers won\'t know how to respond to incidents, increasing MTTR and potential for cascading failures.';
    } else {
      return 'Missing runbook documentation increases operational risk during incidents.';
    }
  }

  // Service catalog/owner-specific reasoning
  if (desc.includes('service owner') || desc.includes('service catalog')) {
    return 'Without declared ownership, incident routing fails and on-call escalation paths are undefined, violating operational readiness requirements.';
  }

  // Fallback to generic (but still better than current)
  return finding.why || 'This policy violation may impact system reliability, security, or compliance.';
}

/**
 * ELITE HELPER: Build concrete "how to fix" with patch previews
 */
function buildPatchPreview(
  finding: NormalizedFinding,
  obligationDescription: string,
  repoType: string
): { steps: string[]; patch?: string } {
  const desc = obligationDescription.toLowerCase();

  // CODEOWNERS patch preview
  if (desc.includes('codeowners')) {
    const patch = repoType === 'docs'
      ? `# CODEOWNERS - Documentation ownership
# Format: <path-pattern> <owner(s)>

# Default owner for all docs
* @your-docs-team

# Specific sections (optional)
# /api-docs/ @api-team
# /guides/ @developer-experience-team`
      : `# CODEOWNERS - Code ownership
# Format: <path-pattern> <owner(s)>

# Default owner for all code
* @your-team-name

# Specific paths (optional)
# /src/api/ @backend-team
# /src/frontend/ @frontend-team
# *.tf @infrastructure-team`;

    return {
      steps: [
        'Create `CODEOWNERS` file in repository root or `.github/CODEOWNERS`',
        'Add ownership patterns (see suggested patch below)',
        'Replace `@your-team-name` with your actual GitHub team',
        'Commit and push - this check will re-run automatically'
      ],
      patch
    };
  }

  // Runbook patch preview
  if (desc.includes('runbook')) {
    const patch = `# Runbook: [Service Name]

## Service Overview
- **Purpose:** [Brief description]
- **Owner:** @your-team-name
- **Tier:** [tier-1/tier-2/tier-3]

## Common Issues

### Issue: [Common Problem]
**Symptoms:** [What you'll see]
**Diagnosis:** [How to confirm]
**Resolution:** [Step-by-step fix]

## Escalation
- **Primary:** @your-team-name
- **Secondary:** [Escalation path]
- **PagerDuty:** [Link if applicable]`;

    return {
      steps: [
        'Create `RUNBOOK.md` in repository root or `/runbooks/<service>/README.md`',
        'Use the template below and fill in service-specific details',
        'Include: service overview, common issues, escalation paths',
        'Link from README.md for discoverability'
      ],
      patch
    };
  }

  // Service catalog patch preview
  if (desc.includes('service catalog') || desc.includes('service owner')) {
    const patch = `apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: your-service-name
  description: [Brief service description]
spec:
  type: service
  lifecycle: production
  owner: your-team-name
  tier: tier-2  # or tier-1, tier-3`;

    return {
      steps: [
        'Create `catalog-info.yaml` in repository root',
        'Add service metadata (see suggested patch below)',
        'Replace `your-service-name` and `your-team-name` with actual values',
        'Commit and push'
      ],
      patch
    };
  }

  // Fallback to existing howToFix
  return { steps: finding.howToFix };
}

/**
 * ELITE HELPER: Determine if obligation is a repo invariant or diff-derived
 */
function getDriftFraming(obligation: NormalizedObligation): {
  type: 'repo_invariant' | 'diff_derived';
  explanation: string;
} {
  // Check if triggered by "protected_branch_pr" surface (always-on baseline)
  const isBaseline = obligation.triggeredBy.some(surfaceId =>
    surfaceId.includes('protected_branch') || surfaceId.includes('baseline')
  );

  if (isBaseline) {
    return {
      type: 'repo_invariant',
      explanation: 'This is a repository-level invariant (independent of PR diff). It\'s checked on every protected-branch PR.'
    };
  }

  return {
    type: 'diff_derived',
    explanation: 'This check was triggered by specific changes in your PR diff.'
  };
}

/**
 * ELITE HELPER: Get control objective for obligation
 */
function getControlObjective(obligationDescription: string): string {
  const desc = obligationDescription.toLowerCase();

  if (desc.includes('codeowners')) {
    return 'Change Management & Review Routing';
  }
  if (desc.includes('runbook')) {
    return 'Operational Readiness & Incident Response';
  }
  if (desc.includes('service owner') || desc.includes('service catalog')) {
    return 'Service Ownership & Escalation Routing';
  }
  if (desc.includes('check-run') || desc.includes('checkrun')) {
    return 'Policy Transparency & Auditability';
  }

  return 'Governance & Compliance';
}

/**
 * CRITICAL FIX: Split obligations into 3 buckets based on applicability
 * This fixes Regression #1 (inconsistent counts) and Regression #2 (docs repo failing service checks)
 */
function splitObligationsByApplicability(obligations: NormalizedObligation[]): {
  enforced: NormalizedObligation[];      // Applicable obligations (counted in decision)
  suppressed: NormalizedObligation[];    // Not applicable (not counted)
  informational: NormalizedObligation[]; // Low confidence applicability (not counted)
} {
  const enforced: NormalizedObligation[] = [];
  const suppressed: NormalizedObligation[] = [];
  const informational: NormalizedObligation[] = [];

  for (const obligation of obligations) {
    const applicability = obligation.applicability;

    if (!applicability) {
      // No applicability info - assume enforced (baseline obligations)
      enforced.push(obligation);
      continue;
    }

    if (!applicability.applies) {
      // Not applicable - suppress
      suppressed.push(obligation);
      continue;
    }

    // Applicable but low confidence - informational
    if (applicability.confidence < 0.7) {
      informational.push(obligation);
      continue;
    }

    // Applicable with high confidence - enforce
    enforced.push(obligation);
  }

  return { enforced, suppressed, informational };
}

/**
 * Render normalized evaluation result as GitHub Check summary (markdown)
 */
export function renderUltimateOutput(normalized: NormalizedEvaluationResult): string {
  try {
    const sections: string[] = [];

    // A) Executive Summary
    sections.push(renderExecutiveSummary(normalized));

    // B) Policy Activation (CRITICAL - shows signals → overlays → obligations)
    sections.push(renderPolicyActivation(normalized));

    // C) Change Surface Summary (shows what changed in THIS PR)
    sections.push(renderChangeSurfaceSummary(normalized));

    // D) Required Contracts & Obligations
    sections.push(renderRequiredContracts(normalized));

    // F) Next Best Actions (moved up for visibility)
    sections.push(renderNextActions(normalized));

    // D) Findings (ranked by risk)
    if (normalized.findings && normalized.findings.length > 0) {
      sections.push(renderFindings(normalized));
    }

    // E) Not-Evaluable Section (separate)
    if (normalized.notEvaluable && normalized.notEvaluable.length > 0) {
      sections.push(renderNotEvaluable(normalized));
    }

    // Policy Provenance (CRITICAL - prevents regression)
    sections.push(renderPolicyProvenance(normalized));

    // Evidence Trace (CRITICAL - shows where we looked)
    sections.push(renderEvidenceTrace(normalized));

    // Metadata (collapsed)
    sections.push(renderMetadata(normalized));

    return sections.join('\n\n---\n\n');
  } catch (error) {
    console.error('CRITICAL ERROR in renderUltimateOutput:', error);
    // Return minimal fallback output to prevent complete failure
    return `# ⚠️ Policy Evaluation Error\n\nAn error occurred while rendering the policy output.\n\n**Error:** ${error instanceof Error ? error.message : String(error)}\n\nPlease contact the platform team if this persists.`;
  }
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

  // CRITICAL FIX: Minimum to PASS (decision-grade clarity with actionable templates)
  const failedFindings = normalized.findings.filter(f =>
    f.result.status === 'fail' && f.decision !== 'pass'
  );

  if (failedFindings.length > 0) {
    lines.push(`**Minimum to PASS:** ${failedFindings.length} action(s) required`);
    lines.push('');

    // CRITICAL FIX: Include exact file path templates for each action
    const topActions = failedFindings.slice(0, 3);
    topActions.forEach(finding => {
      const action = finding.what.toLowerCase();
      lines.push(`- **${finding.what}**`);

      // Add specific file path guidance
      if (action.includes('codeowners')) {
        lines.push(`  - Create: \`CODEOWNERS\` or \`.github/CODEOWNERS\``);
        lines.push(`  - Format: \`* @your-team\` or \`* @username\``);
      } else if (action.includes('runbook')) {
        lines.push(`  - Create: \`RUNBOOK.md\` or \`/runbooks/<service>/README.md\``);
        lines.push(`  - Include: service overview, common issues, escalation paths`);
      } else if (action.includes('service catalog') || action.includes('service owner')) {
        lines.push(`  - Create: \`catalog-info.yaml\` with \`spec.owner: team-name\``);
        lines.push(`  - Or add to existing service catalog file`);
      } else if (action.includes('slo')) {
        lines.push(`  - Create: \`slo.yaml\` with availability/latency targets`);
      } else {
        lines.push(`  - See rule documentation for specific guidance`);
      }
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

  // SURGICAL UPGRADE #2: Decision Robustness Statement
  // Explain what's certain vs uncertain when confidence is LOW
  if (confidence.level === 'low' && decision.outcome !== 'pass') {
    lines.push('');
    lines.push('**Decision Robustness:**');

    // Check if this decision is based on baseline obligations (always deterministic)
    const { enforced } = splitObligationsByApplicability(normalized.obligations);
    const baselineFailures = enforced.filter(o =>
      o.result.status === 'fail' &&
      !o.sourceRule.ruleId.includes('tier') &&
      !o.sourceRule.ruleId.includes('service-specific')
    );

    if (baselineFailures.length > 0) {
      lines.push(`Even with low applicability confidence, this ${decision.outcome.toUpperCase()} is based on ${baselineFailures.length} always-on baseline obligation(s) and is deterministic.`);
      lines.push('The uncertainty is only about service overlays (runbook/tier/service owner), not these baseline failures.');
    } else {
      lines.push(`This ${decision.outcome.toUpperCase()} is based on service/tier-specific obligations. Low confidence means the decision may change if repo classification is corrected.`);
    }
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
 * B) Policy Activation Summary (CRITICAL - shows signals → overlays → obligations)
 */
function renderPolicyActivation(normalized: NormalizedEvaluationResult): string {
  const lines: string[] = [];

  lines.push('# 🎯 Policy Activation');
  lines.push('');
  lines.push('*This section shows which signals were detected and which policy overlays were activated.*');
  lines.push('');

  // CRITICAL FIX: Show detected signals (files that triggered classification/overlays)
  if (normalized.repoClassification) {
    const { repoType, serviceTier, metadata, confidenceBreakdown } = normalized.repoClassification;

    lines.push('## Detected Signals');
    lines.push('');

    // SURGICAL UPGRADE #1: Show actual signals from classification evidence
    // Use the evidence from repoClassifier instead of inferring from metadata
    const signals: string[] = [];
    const absenceSignals: string[] = [];

    // Show file-based presence signals (with defensive checks)
    if (metadata) {
      if (metadata.hasDockerfile) signals.push('`Dockerfile`');
      if (metadata.hasSLO) signals.push('`slo.yaml`');
      if (metadata.hasServiceCatalog) signals.push('`catalog-info.yaml` or `service.yaml`');
      if (metadata.hasRunbook) signals.push('`RUNBOOK.md` or `/runbooks/`');
      if (metadata.hasK8s) signals.push('K8s manifests');
      if (metadata.hasTerraform) signals.push('Terraform files');
      if (metadata.hasMonorepoMarkers) signals.push('Monorepo markers (pnpm-workspace.yaml, lerna.json, etc.)');

      // Show absence signals (these are signals too!)
      if (!metadata.hasDockerfile && !metadata.hasK8s) absenceSignals.push('no_dockerfile');
      if (!metadata.hasServiceCatalog) absenceSignals.push('no_catalog_manifest');
      if (!metadata.hasSLO) absenceSignals.push('no_tier_signal');
    }

    // CRITICAL FIX: For docs repos or when no file signals, show the classification evidence
    if (signals.length === 0 && confidenceBreakdown?.repoTypeEvidence && Array.isArray(confidenceBreakdown.repoTypeEvidence)) {
      // Use the actual evidence from classification (e.g., "Only markdown/text files detected")
      confidenceBreakdown.repoTypeEvidence.forEach(evidence => {
        signals.push(evidence);
      });
    }

    // Show what we detected
    if (signals.length > 0) {
      lines.push(`**Signals:** ${signals.join(', ')}`);
    }
    if (absenceSignals.length > 0) {
      lines.push(`**Absence signals:** ${absenceSignals.join(', ')}`);
    }

    // Fallback: if still no signals (shouldn't happen), show classification source
    if (signals.length === 0 && absenceSignals.length === 0) {
      lines.push(`**Classification:** Based on ${confidenceBreakdown?.repoTypeSource || 'heuristics'}`);
    }

    // Show classification result from signals
    lines.push('');
    lines.push(`**Classification result:** ${repoType} repo${serviceTier !== 'unknown' ? ` (${serviceTier})` : ''}`);
    lines.push('');

    // CRITICAL FIX: Show activated overlays
    lines.push('## Activated Policy Overlays');
    lines.push('');
    lines.push(`- **Base pack:** ${normalized.metadata.packName} (always-on)`);

    if (repoType === 'service' && serviceTier !== 'unknown') {
      const tierConfidence = confidenceBreakdown?.tierConfidence || 0;
      const tierSource = confidenceBreakdown?.tierSource || 'unknown';
      const confidenceLabel = tierConfidence >= 0.9 ? 'HIGH' : tierConfidence >= 0.6 ? 'MEDIUM' : 'LOW';
      const sourceLabel = tierSource === 'explicit' ? 'explicit from catalog' :
                          tierSource === 'inferred' ? 'inferred from heuristics' : 'unknown';

      lines.push(`- **${serviceTier.toUpperCase()} overlay:** Activated (confidence: ${confidenceLabel}, source: ${sourceLabel})`);

      if (tierSource === 'inferred' && confidenceBreakdown?.tierEvidence) {
        lines.push(`  - Heuristic: ${confidenceBreakdown.tierEvidence.join(', ')}`);
      }
    }

    lines.push('');

    // CRITICAL FIX: Split obligations by applicability (fixes Regression #1 and #2)
    const { enforced, suppressed, informational } = splitObligationsByApplicability(normalized.obligations);

    // Show obligation sources (baseline vs overlay) - ONLY ENFORCED
    lines.push('## Triggered Obligations by Source');
    lines.push('');

    const baselineEnforced = enforced.filter(o =>
      !o.sourceRule.ruleId.includes('tier') && !o.sourceRule.ruleId.includes('service-specific')
    );
    const tierEnforced = enforced.filter(o =>
      o.sourceRule.ruleId.includes('tier')
    );
    const serviceEnforced = enforced.filter(o =>
      o.sourceRule.ruleId.includes('service-specific') || o.sourceRule.ruleId.includes('service-owner')
    );

    if (baselineEnforced.length > 0) {
      lines.push(`- **Baseline:** ${baselineEnforced.length} obligation(s) (apply to all repos)`);
    }
    if (serviceEnforced.length > 0) {
      lines.push(`- **Service overlay:** ${serviceEnforced.length} obligation(s) (apply to service repos)`);
    }
    if (tierEnforced.length > 0) {
      lines.push(`- **${serviceTier.toUpperCase()} overlay:** ${tierEnforced.length} obligation(s) (tier-specific requirements)`);
    }

    // CRITICAL FIX: Show suppressed obligations (not counted in decision)
    if (suppressed.length > 0) {
      lines.push('');
      lines.push(`- **Suppressed:** ${suppressed.length} obligation(s) (not applicable to this repo type)`);

      // SURGICAL UPGRADE #3: Clean table-like format instead of log-like
      // Group by rule ID for cleaner presentation
      const suppressedByRule = suppressed.reduce((acc, o) => {
        const ruleId = o.sourceRule.ruleId;
        if (!acc[ruleId]) {
          acc[ruleId] = {
            ruleName: o.sourceRule.ruleName,
            reason: o.applicability?.reason || 'Not applicable',
            count: 0
          };
        }
        acc[ruleId].count++;
        return acc;
      }, {} as Record<string, { ruleName: string; reason: string; count: number }>);

      // Show as clean list
      lines.push('');
      Object.entries(suppressedByRule).forEach(([ruleId, info]) => {
        lines.push(`  - **${info.ruleName}** (${info.reason})`);
      });

      // GAP #2 FIX: Add "what would happen if..." actionable guidance
      lines.push('');
      lines.push('  **To activate suppressed obligations:**');
      if (repoType === 'docs' && suppressed.some(o => o.sourceRule.ruleName.toLowerCase().includes('service'))) {
        lines.push(`  - If this repo is actually a service: add \`catalog-info.yaml\` with \`spec.type: service\``);
        lines.push(`  - This will enable service ownership + tier policies`);
      }
      if (serviceTier === 'unknown' && suppressed.some(o => o.sourceRule.ruleName.toLowerCase().includes('tier'))) {
        lines.push(`  - To declare service tier: add \`catalog-info.yaml\` with \`spec.tier: tier-1\` (or tier-2, tier-3)`);
        lines.push(`  - Or add tier markers: \`slo.yaml\` (tier-1), \`RUNBOOK.md\` (tier-2)`);
      }
    }

    lines.push('');

    // CRITICAL FIX: Show applicability uncertainty
    if (confidenceBreakdown) {
      const applicabilityScore = Math.min(
        confidenceBreakdown.repoTypeConfidence * 100,
        confidenceBreakdown.tierConfidence * 100
      );

      if (applicabilityScore < 90) {
        lines.push('## ⚠️ Applicability Uncertainty');
        lines.push('');
        lines.push(`Classification confidence is ${Math.round(applicabilityScore)}% (not HIGH). This means:`);
        lines.push('');

        if (confidenceBreakdown.repoTypeSource === 'inferred') {
          lines.push(`- Repository type (${repoType}) is **inferred**, not explicit`);
          lines.push(`  - To increase confidence: Add \`catalog-info.yaml\` with \`spec.type: service\``);
        }

        if (confidenceBreakdown.tierSource === 'inferred') {
          lines.push(`- Service tier (${serviceTier}) is **inferred**, not explicit`);
          lines.push(`  - To increase confidence: Add \`tier: 1\` annotation to service catalog`);
          if (confidenceBreakdown.tierEvidence && Array.isArray(confidenceBreakdown.tierEvidence) && confidenceBreakdown.tierEvidence.length > 0) {
            lines.push(`  - Current heuristic: ${confidenceBreakdown.tierEvidence.join(', ')}`);
          }
        }

        lines.push('');
      }
    }
  } else {
    // Fallback: No repo classification available
    lines.push('## Policy Activation');
    lines.push('');
    lines.push('Repository classification not available. All baseline obligations are enforced.');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * C) Change Surface Summary (shows what changed in THIS PR)
 */
function renderChangeSurfaceSummary(normalized: NormalizedEvaluationResult): string {
  const lines: string[] = [];

  lines.push('# 📝 Change Surface Summary');
  lines.push('');
  lines.push('*This section shows what changed in your PR and which specific files triggered obligations.*');
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

    // CRITICAL FIX: Show which ENFORCED obligations this surface triggered (not suppressed)
    const { enforced } = splitObligationsByApplicability(normalized.obligations);
    const triggeredObligations = enforced.filter(obl =>
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

  // CRITICAL FIX: Only show enforced obligations (not suppressed ones)
  const { enforced } = splitObligationsByApplicability(normalized.obligations);

  // Group enforced obligations by surface
  const obligationsBySurface = new Map<string, typeof enforced>();

  for (const obligation of enforced) {
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
    critical.forEach(finding => lines.push(renderFinding(finding, normalized)));
  }

  if (high.length > 0) {
    lines.push('## ❌ High Priority');
    lines.push('');
    high.forEach(finding => lines.push(renderFinding(finding, normalized)));
  }

  if (medium.length > 0) {
    lines.push('## ⚠️ Warnings');
    lines.push('');
    medium.forEach(finding => lines.push(renderFinding(finding, normalized)));
  }

  if (low.length > 0) {
    lines.push('<details>');
    lines.push('<summary>ℹ️ Low Priority Issues</summary>');
    lines.push('');
    low.forEach(finding => lines.push(renderFinding(finding, normalized)));
    lines.push('</details>');
  }

  return lines.join('\n');
}

/**
 * Render a single finding with all details (ELITE v3.0)
 * Now accepts normalized result for context-aware rendering
 */
function renderFinding(finding: NormalizedFinding, normalized: NormalizedEvaluationResult): string {
  const lines: string[] = [];

  lines.push(`### ${finding.what}`);
  lines.push('');

  // Get context for elite rendering
  const relatedObligation = normalized.obligations.find(o => o.id === finding.obligationId);
  const repoType = normalized.metadata?.repoClassification?.repoType || 'unknown';

  // PRIORITY 3: Fixed risk score color coding (0-30 green, 31-60 yellow, 61-100 red)
  if (finding.riskScore) {
    const riskColor = finding.riskScore.score >= 61 ? '🔴' :
                      finding.riskScore.score >= 31 ? '🟡' : '🟢';
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

  // ELITE: Show control objective
  if (relatedObligation) {
    const controlObjective = getControlObjective(relatedObligation.description);
    lines.push(`**Control Objective:** ${controlObjective}`);
    lines.push('');
  }

  // ELITE: Show drift framing (repo invariant vs diff-derived)
  if (relatedObligation) {
    const driftFraming = getDriftFraming(relatedObligation);
    const framingIcon = driftFraming.type === 'repo_invariant' ? '🔒' : '📝';
    lines.push(`${framingIcon} **Check Type:** ${driftFraming.type === 'repo_invariant' ? 'Repo Invariant' : 'Diff-Derived'}`);
    lines.push(`- ${driftFraming.explanation}`);
    lines.push('');
  }

  // PRIORITY 1: Context-aware "why it matters"
  const contextAwareWhy = relatedObligation
    ? buildContextAwareWhyItMatters(finding, repoType, relatedObligation.description)
    : finding.why;
  lines.push(`**Why it matters:** ${contextAwareWhy}`);
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

  // PRIORITY 2: Concrete "how to fix" with patch preview
  const patchPreview = relatedObligation
    ? buildPatchPreview(finding, relatedObligation.description, repoType)
    : { steps: finding.howToFix };

  lines.push('**How to fix:**');
  patchPreview.steps.forEach((step, idx) => {
    lines.push(`${idx + 1}. ${step}`);
  });
  lines.push('');

  // PRIORITY 2: Show patch preview if available
  if (patchPreview.patch) {
    lines.push('<details>');
    lines.push('<summary><b>📋 Suggested Patch (click to expand)</b></summary>');
    lines.push('');
    lines.push('```');
    lines.push(patchPreview.patch);
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

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
 * Render Policy Provenance (ELITE v3.0 - Collapsed by default for concise-first rendering)
 * Shows which packs, rules, and codes were evaluated
 */
function renderPolicyProvenance(normalized: NormalizedEvaluationResult): string {
  const lines: string[] = [];

  // ELITE: Wrap in <details> for concise-first rendering
  lines.push('<details>');
  lines.push('<summary><b>📋 Policy Provenance</b> (click to expand)</summary>');
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

  // Triggered rules with their decisions (ONLY ENFORCED OBLIGATIONS)
  lines.push('## Triggered Rules');
  lines.push('');

  // CRITICAL FIX: Only show enforced obligations (not suppressed)
  const { enforced } = splitObligationsByApplicability(normalized.obligations);

  // Group enforced obligations by rule
  const ruleMap = new Map<string, typeof enforced>();
  for (const obligation of enforced) {
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

  // ELITE: Close details tag
  lines.push('</details>');

  return lines.join('\n');
}

/**
 * Render Evidence Trace (ELITE v3.0 - Collapsed by default for concise-first rendering)
 * Shows "where did we look" - prevents "opaque scoring" regression
 */
function renderEvidenceTrace(normalized: NormalizedEvaluationResult): string {
  const lines: string[] = [];

  // ELITE: Wrap in <details> for concise-first rendering
  lines.push('<details>');
  lines.push('<summary><b>🔍 Evidence Trace</b> (click to expand)</summary>');
  lines.push('');

  lines.push('# 🔍 Evidence Trace');
  lines.push('');
  lines.push('*This section shows where we looked for evidence and what we found, ensuring transparency and debuggability.*');
  lines.push('');

  // CRITICAL FIX: Only show enforced obligations (not suppressed)
  const { enforced } = splitObligationsByApplicability(normalized.obligations);

  // Group evidence by enforced obligation
  for (const obligation of enforced) {
    // Only show evidence for failed or not-evaluable obligations
    if (obligation.result.status === 'pass') continue;

    lines.push(`## ${obligation.description}`);
    lines.push('');
    lines.push(`**Rule:** \`${obligation.sourceRule.ruleId}\` - ${obligation.sourceRule.ruleName}`);
    lines.push(`**Status:** ${obligation.result.status.toUpperCase()}`);
    lines.push(`**Code:** \`${obligation.result.reasonCode}\``);
    lines.push('');

    // GAP #3 FIX: Show compact evidence search (where we looked, what we found)
    const finding = normalized.findings.find(f => f.obligationId === obligation.id);
    const evidenceSearch = finding?.evidenceSearch;

    if (evidenceSearch && evidenceSearch.searchedPaths && evidenceSearch.searchedPaths.length > 0) {
      const matchedCount = evidenceSearch.matchedPaths?.length || 0;
      const searchedCount = evidenceSearch.searchedPaths.length;

      // GAP #3 FIX: Compact format "Searched paths: X, Y, Z (0 found)"
      lines.push(`**Searched paths:** ${evidenceSearch.searchedPaths.map(p => `\`${p}\``).join(', ')} **(${matchedCount} found)**`);
      lines.push('');

      // Show matched paths (if any)
      if (evidenceSearch.matchedPaths && evidenceSearch.matchedPaths.length > 0) {
        lines.push(`**Matched:** ${evidenceSearch.matchedPaths.map(p => `\`${p}\``).join(', ')}`);
        lines.push('');
      }

      // Show closest matches (near-misses)
      if (evidenceSearch.closestMatches && evidenceSearch.closestMatches.length > 0) {
        lines.push(`**Closest matches:** ${evidenceSearch.closestMatches.join(', ')}`);
        lines.push('');
      }
    } else if (obligation.result.message) {
      // Fallback: Extract expected paths from message
      const expectedMatch = obligation.result.message.match(/Expected one of: (.+)/);
      if (expectedMatch) {
        const expectedPaths = expectedMatch[1].split(',').map(p => p.trim());
        lines.push(`**Searched paths:** ${expectedPaths.map(p => `\`${p}\``).join(', ')} **(0 found)**`);
        lines.push('');
      }
    } else if (obligation.evidence.length > 0) {
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

    // PRIORITY 4: Removed duplicate "how to fix" - now only in Findings section
    // Link to findings instead
    if (obligation.result.status === 'fail') {
      const relatedFinding = normalized.findings.find(f => f.obligationId === obligation.id);
      if (relatedFinding) {
        lines.push('*See "Findings" section above for remediation steps.*');
        lines.push('');
      }
    }

    if (obligation.evaluationStatus === 'not_evaluable' && obligation.notEvaluableReason) {
      lines.push('**Why not evaluable:**');
      lines.push('');
      lines.push(`- **Category:** ${obligation.notEvaluableReason.category}`);
      lines.push(`- **Remediation:** ${obligation.notEvaluableReason.remediation}`);
      lines.push('');
    }
  }

  // CRITICAL FIX: Check enforced obligations only
  const { enforced: enforcedForCheck } = splitObligationsByApplicability(normalized.obligations);
  if (enforcedForCheck.filter(o => o.result.status !== 'pass').length === 0) {
    lines.push('*All obligations passed - no evidence trace needed.*');
  }

  // ELITE: Close details tag
  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}

/**
 * Render metadata (collapsed)
 */
function renderMetadata(normalized: NormalizedEvaluationResult): string {
  const lines: string[] = [];

  // CRITICAL FIX: Show enforced vs suppressed counts
  const { enforced, suppressed, informational } = splitObligationsByApplicability(normalized.obligations);

  lines.push('<details>');
  lines.push('<summary>📊 Evaluation Metadata</summary>');
  lines.push('');
  lines.push(`- **Pack:** ${normalized.metadata.packName} v${normalized.metadata.packVersion}`);
  lines.push(`- **Pack ID:** \`${normalized.metadata.packId}\``);
  lines.push(`- **Evaluation Time:** ${normalized.metadata.evaluationTimeMs}ms`);
  lines.push(`- **Timestamp:** ${normalized.metadata.timestamp}`);
  lines.push(`- **Surfaces Detected:** ${normalized.surfaces.length}`);
  lines.push(`- **Obligations Checked:** ${enforced.length} enforced (${suppressed.length} suppressed, ${informational.length} informational)`);
  lines.push(`- **Findings:** ${normalized.findings.length}`);
  lines.push(`- **Not Evaluable:** ${normalized.notEvaluable.length}`);
  lines.push('</details>');

  return lines.join('\n');
}
