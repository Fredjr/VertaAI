/**
 * Ultimate Track A Output Renderer (v4.0 - Developer-Friendly Output)
 *
 * Renders the canonical NormalizedEvaluationResult into "Developer-First" format:
 *
 * DEVELOPER-FRIENDLY UPGRADES (v4.0):
 * - Concise top-level summary (issue count, quick actions, impact, time to fix)
 * - Scannable issue cards (What/File/Impact/Risk/Fix/Why structure)
 * - Copy-paste fix templates (executable commands for each issue type)
 * - Progressive disclosure (technical details collapsed by default)
 * - Human-friendly language ("Schema drift" not "SCHEMA_MIGRATION_PARITY violation")
 * - Action-oriented format (developers see what to do, not what failed)
 *
 * STRUCTURE (NEW):
 * A) Quick Summary - Issue count, actions, impact, time estimate (always visible)
 * B) Issue Cards - Self-contained cards with What/File/Impact/Risk/Fix/Why (scannable)
 * C) Advanced Details - All technical details collapsed (for auditors/power users)
 *
 * LEGACY STRUCTURE (v3.0 - now in collapsed section):
 * - Executive Summary - Tight decision card + confidence
 * - Policy Activation - Signals + overlays + suppressed obligations
 * - Change Surface Summary - What changed + what contracts triggered
 * - Required Contracts & Obligations - Status per surface
 * - Next Best Actions - Prioritized, actionable steps
 * - Findings - Ranked by risk with context-aware guidance
 * - Policy Provenance - Auditability (collapsed)
 * - Evidence Trace - Transparency (collapsed)
 */

import type { NormalizedEvaluationResult, NormalizedFinding, NotEvaluableItem, NormalizedObligation } from './types.js';
import { adaptNormalizedFromIR } from './ir/irAdapter.js';
import { validateSemantics, type SemanticValidationOptions } from './ir/semanticValidator.js';

/**
 * ============================================================================
 * DEVELOPER-FRIENDLY RENDERING FUNCTIONS (v4.0)
 * ============================================================================
 */

/**
 * Generate copy-paste fix template for a specific issue type
 */
function generateFixTemplate(finding: NormalizedFinding, obligation: NormalizedObligation | undefined): string {
  const desc = obligation?.description.toLowerCase() || finding.what.toLowerCase();
  const lines: string[] = [];

  // CODEOWNERS fix
  if (desc.includes('codeowners')) {
    lines.push('```bash');
    lines.push('# Create CODEOWNERS file');
    lines.push('cat > .github/CODEOWNERS << \'EOF\'');
    lines.push('# Default owners for everything');
    lines.push('* @your-team-name');
    lines.push('');
    lines.push('# Specific paths (customize as needed)');
    lines.push('# /src/api/ @backend-team');
    lines.push('# /prisma/ @database-team');
    lines.push('EOF');
    lines.push('');
    lines.push('git add .github/CODEOWNERS');
    lines.push('git commit -m "Add CODEOWNERS for review routing"');
    lines.push('```');
    return lines.join('\n');
  }

  // Schema migration parity fix
  if (desc.includes('schema') && desc.includes('migration')) {
    const schemaFile = finding.evidence.find(e => e.type === 'file_reference' && e.value.includes('schema'))?.value || 'schema.prisma';
    lines.push('```bash');
    lines.push('# Generate migration for your schema changes');
    lines.push('npx prisma migrate dev --name add_schema_changes');
    lines.push('git add prisma/migrations/');
    lines.push('git commit -m "Add migration for schema changes"');
    lines.push('```');
    return lines.join('\n');
  }

  // Service catalog/owner fix
  if (desc.includes('service owner') || desc.includes('service catalog') || desc.includes('catalog')) {
    lines.push('```bash');
    lines.push('# Create service catalog entry');
    lines.push('cat > catalog-info.yaml << \'EOF\'');
    lines.push('apiVersion: backstage.io/v1alpha1');
    lines.push('kind: Component');
    lines.push('metadata:');
    lines.push('  name: your-service-name');
    lines.push('  description: Your service description');
    lines.push('spec:');
    lines.push('  type: service');
    lines.push('  owner: your-team-name');
    lines.push('  lifecycle: production');
    lines.push('EOF');
    lines.push('');
    lines.push('git add catalog-info.yaml');
    lines.push('git commit -m "Add service catalog entry"');
    lines.push('```');
    return lines.join('\n');
  }

  // Runbook fix
  if (desc.includes('runbook')) {
    lines.push('```bash');
    lines.push('# Create runbook');
    lines.push('cat > RUNBOOK.md << \'EOF\'');
    lines.push('# Service Runbook');
    lines.push('');
    lines.push('## Service Overview');
    lines.push('[Brief description of what this service does]');
    lines.push('');
    lines.push('## Common Issues');
    lines.push('### Issue 1: [Description]');
    lines.push('**Symptoms:** [What you see]');
    lines.push('**Resolution:** [How to fix]');
    lines.push('');
    lines.push('## Escalation');
    lines.push('- Primary: @team-name');
    lines.push('- Secondary: @backup-team');
    lines.push('EOF');
    lines.push('');
    lines.push('git add RUNBOOK.md');
    lines.push('git commit -m "Add service runbook"');
    lines.push('```');
    return lines.join('\n');
  }

  // OpenAPI code parity fix
  if (desc.includes('openapi') && desc.includes('code')) {
    lines.push('```bash');
    lines.push('# Sync OpenAPI spec with code implementation');
    lines.push('# Option 1: Update spec to match code');
    lines.push('# - Review the new endpoints/methods in your code');
    lines.push('# - Add corresponding paths to openapi.yaml');
    lines.push('');
    lines.push('# Option 2: Implement missing endpoints from spec');
    lines.push('# - Review openapi.yaml for documented endpoints');
    lines.push('# - Implement missing routes in your code');
    lines.push('```');
    return lines.join('\n');
  }

  // Test implementation parity fix
  if (desc.includes('test') && desc.includes('implementation')) {
    lines.push('```bash');
    lines.push('# Add tests for new code');
    lines.push('# Create test file matching your implementation');
    lines.push('# Example: src/userService.ts → src/userService.test.ts');
    lines.push('');
    lines.push('# Run tests to verify');
    lines.push('npm test');
    lines.push('```');
    return lines.join('\n');
  }

  // Generic fix template
  lines.push('```bash');
  lines.push('# Review the issue details above');
  lines.push('# Make necessary changes to resolve the violation');
  lines.push('git add <files>');
  lines.push('git commit -m "Fix: <description>"');
  lines.push('```');
  return lines.join('\n');
}

/**
 * Render a single issue card in developer-friendly format
 */
function renderDeveloperFriendlyIssueCard(
  finding: NormalizedFinding,
  normalized: NormalizedEvaluationResult,
  index: number
): string {
  const lines: string[] = [];
  const obligation = normalized.obligations.find(o => o.id === finding.obligationId);
  const repoType = normalized.metadata?.repoClassification?.repoType || 'unknown';

  // Card header with severity emoji - P1 FIX: Use numeric severity (0-100)
  const severityScore = finding.severity || 50;
  const severityEmoji = severityScore >= 70 ? '🔴' :
                        severityScore >= 40 ? '🟡' : '🔵';

  lines.push(`### ${severityEmoji} Issue ${index + 1}: ${getHumanFriendlyTitle(finding, obligation)}`);
  lines.push('');

  // What (plain English)
  lines.push(`**What:** ${getHumanFriendlyDescription(finding, obligation)}`);
  lines.push('');

  // File/Location - P0 FIX: Parse evidence objects properly
  const fileEvidence = finding.evidence.find(e => e.type === 'file_reference' || e.type === 'file');
  if (fileEvidence) {
    let filePath = 'unknown file';
    if (typeof fileEvidence.value === 'string') {
      filePath = fileEvidence.value;
    } else if (typeof fileEvidence.value === 'object' && fileEvidence.value !== null) {
      // Extract path from evidence object
      filePath = (fileEvidence.value as any).path || (fileEvidence.value as any).file || 'unknown file';
    }
    lines.push(`**File:** \`${filePath}\``);
  } else if (finding.evidence.length > 0) {
    // P0 FIX: Parse first evidence item properly
    let displayValue = 'unknown location';
    if (typeof finding.evidence[0].value === 'string') {
      displayValue = finding.evidence[0].value;
    } else if (typeof finding.evidence[0].value === 'object' && finding.evidence[0].value !== null) {
      const evObj = finding.evidence[0].value as any;
      displayValue = evObj.path || evObj.file || evObj.snippet || 'unknown location';
    }
    lines.push(`**Location:** \`${displayValue}\``);
  }
  lines.push('');

  // Impact (business/operational consequence)
  const impact = getBusinessImpact(finding, obligation, repoType);
  lines.push(`**Impact:** ${impact}`);
  lines.push('');

  // Risk (severity in human terms)
  const riskLevel = finding.riskScore
    ? finding.riskScore.score >= 61 ? 'High' :
      finding.riskScore.score >= 31 ? 'Medium' : 'Low'
    : finding.severity === 'critical' || finding.severity === 'high' ? 'High' :
      finding.severity === 'medium' ? 'Medium' : 'Low';
  lines.push(`**Risk:** ${riskLevel} - ${getRiskExplanation(finding, obligation)}`);
  lines.push('');

  // Fix this (copy-paste solution)
  lines.push(`**Fix this:**`);
  lines.push('');
  lines.push(generateFixTemplate(finding, obligation));
  lines.push('');

  // Why this matters (context)
  const why = obligation
    ? buildContextAwareWhyItMatters(finding, repoType, obligation.description)
    : finding.why || 'This issue may impact system reliability, security, or compliance.';
  lines.push(`**Why this matters:** ${why}`);
  lines.push('');

  // Technical details (collapsed)
  lines.push('<details>');
  lines.push('<summary>🔍 Technical details</summary>');
  lines.push('');
  lines.push(`- **Check:** ${obligation?.sourceRule.ruleName || finding.what}`);
  if (finding.result.code) {
    lines.push(`- **Code:** ${finding.result.code}`);
  }
  if (finding.riskScore) {
    lines.push(`- **Risk Score:** ${finding.riskScore.score}/100`);
  }
  if (obligation) {
    lines.push(`- **Rule ID:** ${obligation.sourceRule.ruleId}`);
  }
  lines.push(`- **Evidence:** ${finding.evidence.length} item(s)`);
  lines.push('');
  lines.push('</details>');
  lines.push('');

  return lines.join('\n');
}

/**
 * Get human-friendly title for an issue
 */
function getHumanFriendlyTitle(finding: NormalizedFinding, obligation: NormalizedObligation | undefined): string {
  const desc = obligation?.description.toLowerCase() || finding.what.toLowerCase();

  if (desc.includes('codeowners')) return 'Missing CODEOWNERS File';
  if (desc.includes('schema') && desc.includes('migration')) return 'Schema Drift Detected';
  if (desc.includes('service owner') || desc.includes('service catalog')) return 'Service Owner Not Declared';
  if (desc.includes('runbook')) return 'Missing Runbook';
  if (desc.includes('openapi') && desc.includes('code')) return 'API Spec Doesn\'t Match Code';
  if (desc.includes('test') && desc.includes('implementation')) return 'Missing Tests for New Code';
  if (desc.includes('secret')) return 'Potential Secrets in Code';

  // Fallback to finding.what
  return finding.what;
}

/**
 * Get human-friendly description
 */
function getHumanFriendlyDescription(finding: NormalizedFinding, obligation: NormalizedObligation | undefined): string {
  const desc = obligation?.description.toLowerCase() || finding.what.toLowerCase();

  if (desc.includes('codeowners')) {
    return 'No CODEOWNERS file found in repository - PRs won\'t auto-request reviews from the right team';
  }
  if (desc.includes('schema') && desc.includes('migration')) {
    // P0 FIX: Extract file path from evidence object properly
    const schemaEvidence = finding.evidence.find(e => {
      if (typeof e.value === 'string') return e.value.includes('schema');
      if (typeof e.value === 'object' && e.value !== null) {
        return (e.value as any).path?.includes('schema') || (e.value as any).snippet?.includes('schema');
      }
      return false;
    });

    let schemaFile = 'schema file';
    if (schemaEvidence) {
      if (typeof schemaEvidence.value === 'string') {
        schemaFile = schemaEvidence.value;
      } else if (typeof schemaEvidence.value === 'object' && schemaEvidence.value !== null) {
        schemaFile = (schemaEvidence.value as any).path || 'schema file';
      }
    }

    return `Database schema changed (${schemaFile}) but no migration file was added`;
  }
  if (desc.includes('service owner') || desc.includes('service catalog')) {
    return 'No service catalog entry found - incident routing won\'t know who to page';
  }
  if (desc.includes('runbook')) {
    return 'No runbook documentation found - on-call engineers won\'t know how to respond to incidents';
  }
  if (desc.includes('openapi') && desc.includes('code')) {
    return 'OpenAPI specification doesn\'t match the actual code implementation';
  }
  if (desc.includes('test') && desc.includes('implementation')) {
    return 'New code added without corresponding tests';
  }

  return finding.result.reason || finding.what;
}

/**
 * Get business impact explanation
 */
function getBusinessImpact(finding: NormalizedFinding, obligation: NormalizedObligation | undefined, repoType: string): string {
  const desc = obligation?.description.toLowerCase() || finding.what.toLowerCase();

  if (desc.includes('codeowners')) {
    return 'Reviews may not reach the right team, increasing risk of changes merging without proper approval';
  }
  if (desc.includes('schema') && desc.includes('migration')) {
    return 'Production deployments will fail when schema doesn\'t match migrations, potentially causing downtime';
  }
  if (desc.includes('service owner') || desc.includes('service catalog')) {
    return 'Incident routing will fail, delaying response during outages';
  }
  if (desc.includes('runbook')) {
    return 'Increased MTTR during incidents, potential for cascading failures';
  }
  if (desc.includes('openapi') && desc.includes('code')) {
    return 'API consumers will experience integration failures, documentation will be incorrect';
  }
  if (desc.includes('test') && desc.includes('implementation')) {
    return 'Increased risk of bugs reaching production, harder to maintain code quality';
  }

  return 'May impact system reliability, security, or compliance';
}

/**
 * Get risk explanation in human terms - P1/P2 FIX: Add PR-specific context from evidence
 */
function getRiskExplanation(finding: NormalizedFinding, obligation: NormalizedObligation | undefined): string {
  const desc = obligation?.description.toLowerCase() || finding.what.toLowerCase();

  // Extract file context from evidence
  let fileContext = '';
  const fileEvidence = finding.evidence.find(e => e.type === 'file_reference' || e.type === 'file');
  if (fileEvidence) {
    if (typeof fileEvidence.value === 'string') {
      fileContext = fileEvidence.value;
    } else if (typeof fileEvidence.value === 'object' && fileEvidence.value !== null) {
      fileContext = (fileEvidence.value as any).path || '';
    }
  }

  if (desc.includes('schema') && desc.includes('migration')) {
    return fileContext
      ? `Schema changes in ${fileContext} will fail deployment without migration`
      : 'Could cause downtime during deployment';
  }
  if (desc.includes('codeowners')) {
    const evidenceCount = finding.evidence.length;
    return evidenceCount > 0
      ? `This PR modifies ${evidenceCount} file(s) without ownership routing`
      : 'Changes may merge without proper review';
  }
  if (desc.includes('service owner') || desc.includes('service catalog')) {
    return fileContext
      ? `New service code in ${fileContext} added without on-call contact`
      : 'Delays during incidents';
  }
  if (desc.includes('runbook')) {
    return 'Longer incident resolution time';
  }
  if (desc.includes('secret')) {
    return 'Security vulnerability - credentials may be exposed';
  }

  return 'May impact operations or compliance';
}

/**
 * ============================================================================
 * LEGACY HELPER FUNCTIONS (v3.0 - still used in collapsed sections)
 * ============================================================================
 */

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

  // OpenAPI schema validation reasoning
  if (desc.includes('openapi') && (desc.includes('schema') || desc.includes('valid'))) {
    if (repoType === 'service') {
      return 'Invalid OpenAPI schema breaks API documentation generation, client SDK generation, and contract testing, preventing consumers from reliably integrating with your service.';
    } else {
      return 'Invalid OpenAPI schema prevents automated validation, documentation generation, and integration testing, reducing API quality and consumer confidence.';
    }
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

  // OpenAPI schema validation patch preview
  if (desc.includes('openapi') && (desc.includes('schema') || desc.includes('valid'))) {
    const patch = `openapi: 3.0.0
info:
  title: Your API
  version: 1.0.0
  description: Brief description of your API
paths:
  /health:
    get:
      summary: Health check endpoint
      responses:
        '200':
          description: Service is healthy
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: ok`;

    return {
      steps: [
        'Fix invalid OpenAPI schema in your spec file (e.g., `openapi.yaml` or `openapi.json`)',
        'Ensure the schema has required fields: `openapi`, `info`, `paths`',
        'Validate using: `npx @redocly/cli lint openapi.yaml`',
        'Common issues: missing version field, invalid $ref, missing required fields',
        'Use the minimal valid schema below as a starting point if needed'
      ],
      patch
    };
  }

  // Fallback to existing howToFix
  return { steps: finding.howToFix };
}

/**
 * ELITE HELPER: Determine if obligation is a repo invariant or diff-derived
 * FIX #2: Correctly identify baseline obligations (repo invariants)
 */
function getDriftFraming(obligation: NormalizedObligation): {
  type: 'repo_invariant' | 'diff_derived';
  explanation: string;
} {
  // Check if triggered by "protected_branch_pr" surface (always-on baseline)
  const isBaseline = obligation.triggeredBy.some(surfaceId =>
    surfaceId.includes('protected_branch') || surfaceId.includes('baseline')
  );

  // FIX #2: Also check if the rule itself is a baseline rule (codeowners, checkrun, etc.)
  const baselineRuleIds = ['codeowners-required', 'checkrun-always', 'baseline'];
  const isBaselineRule = baselineRuleIds.some(id => obligation.sourceRule.ruleId.includes(id));

  if (isBaseline || isBaselineRule) {
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
 * FIX C: Build governance impact statement (makes it feel like governance, not lint)
 * This explains the business/operational impact of the failure
 * FIX: Less domain-specific, broader phrasing
 */
function buildGovernanceImpact(failedObligations: NormalizedObligation[], repoType: string): string | null {
  if (failedObligations.length === 0) return null;

  // Get the primary failure type
  const primaryObligation = failedObligations[0];
  const desc = primaryObligation.description.toLowerCase();

  // CODEOWNERS missing - FIX: broader, less domain-specific
  if (desc.includes('codeowners')) {
    if (repoType === 'docs') {
      return 'Ownership routing contract missing → changes may not reach accountable maintainers; increases risk of stale or unreviewed documentation.';
    } else if (repoType === 'service') {
      return 'Ownership routing contract missing → production changes may bypass required team review, violating change management controls.';
    } else if (repoType === 'library') {
      return 'Ownership routing contract missing → API changes may not reach dependent service owners, risking breaking changes.';
    }
    return 'Ownership routing contract missing → reviews may not reach accountable owners.';
  }

  // Runbook missing
  if (desc.includes('runbook')) {
    return 'Operational readiness contract missing → incident responders lack escalation paths and troubleshooting guidance.';
  }

  // Service catalog missing
  if (desc.includes('service owner') || desc.includes('service catalog')) {
    return 'Service ownership contract missing → cannot route incidents or map dependencies in service graph.';
  }

  // Generic governance gap
  if (failedObligations.length === 1) {
    return `Governance contract gap detected → ${getControlObjective(desc).toLowerCase()} controls not enforceable.`;
  }

  return `${failedObligations.length} governance contracts missing → reduced visibility and control over changes.`;
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
 * V4.0: Render quick summary (top-level, always visible)
 */
function renderQuickSummary(normalized: NormalizedEvaluationResult, enforcedFindings: NormalizedFinding[]): string {
  const lines: string[] = [];
  const issueCount = enforcedFindings.length;
  const decision = normalized.decision;

  // Header with decision
  const decisionEmoji = decision.outcome === 'pass' ? '✅' : decision.outcome === 'warn' ? '⚠️' : '🚫';

  if (issueCount === 0) {
    lines.push(`## ${decisionEmoji} All Checks Passed!`);
    lines.push('');
    lines.push('No issues found. This PR meets all governance requirements.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`## ${decisionEmoji} ${issueCount} Issue${issueCount > 1 ? 's' : ''} Found`);
  lines.push('');

  // Quick action list (top 3 issues) - P1 FIX: Use severity-based emojis
  const maxSeverity = Math.max(...enforcedFindings.map(f => f.severity || 50));
  const actionEmoji = maxSeverity >= 70 ? '🔴' : maxSeverity >= 40 ? '🟡' : '🔵';
  lines.push(`**${actionEmoji} Action Required:**`);
  const topIssues = enforcedFindings.slice(0, 3);
  topIssues.forEach((finding, idx) => {
    const obligation = normalized.obligations.find(o => o.id === finding.obligationId);
    const title = getHumanFriendlyTitle(finding, obligation);
    const shortDesc = getShortDescription(finding, obligation);
    const emoji = (finding.severity || 50) >= 70 ? '🔴' : (finding.severity || 50) >= 40 ? '🟡' : '🔵';
    lines.push(`${idx + 1}. ${emoji} **${title}** - ${shortDesc}`);
  });
  if (issueCount > 3) {
    lines.push(`*...and ${issueCount - 3} more issue${issueCount - 3 > 1 ? 's' : ''}*`);
  }
  lines.push('');

  // Impact summary
  const impact = getOverallImpact(enforcedFindings, normalized);
  lines.push(`**Impact:** ${impact}`);
  lines.push('');

  // Time to fix estimate
  const timeEstimate = estimateTimeToFix(enforcedFindings);
  lines.push(`**Time to fix:** ~${timeEstimate}`);
  lines.push('');

  // Merge recommendation
  if (decision.outcome === 'block') {
    lines.push('🚫 **Do not merge** - Blocking issues must be resolved first');
  } else if (decision.outcome === 'warn') {
    lines.push('⚠️ **Review required** - Fix these issues before merging');
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Get short description for quick summary
 */
function getShortDescription(finding: NormalizedFinding, obligation: NormalizedObligation | undefined): string {
  const desc = obligation?.description.toLowerCase() || finding.what.toLowerCase();

  if (desc.includes('codeowners')) return 'No code ownership defined';
  if (desc.includes('schema') && desc.includes('migration')) return 'Database schema changed without migration';
  if (desc.includes('service owner') || desc.includes('service catalog')) return 'Service catalog entry needed';
  if (desc.includes('runbook')) return 'Missing operational documentation';
  if (desc.includes('openapi') && desc.includes('code')) return 'API spec doesn\'t match code';
  if (desc.includes('test') && desc.includes('implementation')) return 'New code missing tests';
  if (desc.includes('secret')) return 'Potential secrets detected';

  return finding.result.reason || 'Policy violation detected';
}

/**
 * Get overall impact summary
 */
function getOverallImpact(findings: NormalizedFinding[], normalized: NormalizedEvaluationResult): string {
  const impacts: string[] = [];

  findings.forEach(finding => {
    const obligation = normalized.obligations.find(o => o.id === finding.obligationId);
    const desc = obligation?.description.toLowerCase() || finding.what.toLowerCase();

    if (desc.includes('codeowners') && !impacts.includes('review routing')) {
      impacts.push('review routing');
    }
    if (desc.includes('schema') && desc.includes('migration') && !impacts.includes('deployment failures')) {
      impacts.push('deployment failures');
    }
    if (desc.includes('service owner') && !impacts.includes('incident response')) {
      impacts.push('incident response');
    }
    if (desc.includes('runbook') && !impacts.includes('operational readiness')) {
      impacts.push('operational readiness');
    }
    if (desc.includes('secret') && !impacts.includes('security')) {
      impacts.push('security');
    }
  });

  if (impacts.length === 0) {
    return 'May impact system reliability or compliance';
  }

  return impacts.join(', ');
}

/**
 * Estimate time to fix all issues
 */
function estimateTimeToFix(findings: NormalizedFinding[]): string {
  let totalMinutes = 0;

  findings.forEach(finding => {
    const desc = finding.what.toLowerCase();

    // Simple file creation: 5 minutes
    if (desc.includes('codeowners') || desc.includes('catalog')) {
      totalMinutes += 5;
    }
    // Schema migration: 10 minutes
    else if (desc.includes('schema') && desc.includes('migration')) {
      totalMinutes += 10;
    }
    // Runbook: 15 minutes
    else if (desc.includes('runbook')) {
      totalMinutes += 15;
    }
    // Code changes: 20 minutes
    else if (desc.includes('openapi') || desc.includes('test')) {
      totalMinutes += 20;
    }
    // Default: 10 minutes
    else {
      totalMinutes += 10;
    }
  });

  if (totalMinutes < 10) return '5 minutes';
  if (totalMinutes < 20) return '10-15 minutes';
  if (totalMinutes < 40) return '20-30 minutes';
  if (totalMinutes < 60) return '30-45 minutes';
  return '1 hour';
}

/**
 * Render normalized evaluation result as GitHub Check summary (markdown)
 *
 * Phase 4: Developer-Friendly Rendering (v4.0)
 * - Concise summary + issue cards first
 * - All technical details collapsed
 * - Copy-paste fixes for each issue
 * - Human-friendly language
 *
 * Phase 3: IR-Aware Rendering
 * - If IR is present, adapt it to the old format
 * - Ensures backward compatibility
 * - Enables gradual migration to IR-native rendering
 */
export function renderUltimateOutput(normalized: NormalizedEvaluationResult): string {
  try {
    // PHASE 5.5: Validate IR before rendering (if present)
    if (normalized.ir) {
      try {
        const validationOptions: SemanticValidationOptions = {
          mode: 'audit', // Log violations, don't throw
        };

        const validationResult = validateSemantics(normalized.ir, validationOptions);

        if (!validationResult.valid) {
          console.error('[UltimateRenderer] IR validation failed before rendering:', {
            violations: validationResult.violations,
            warnings: validationResult.warnings,
            violationCount: validationResult.violations.length,
          });
          // Log each violation for debugging
          validationResult.violations.forEach((violation, idx) => {
            console.error(`  [${idx + 1}] ${violation.invariant}: ${violation.message}`);
          });
          // TODO: Send to monitoring/telemetry
        } else {
          console.log('[UltimateRenderer] IR validation passed ✓ (all 20 invariants satisfied)');
        }
      } catch (validationError) {
        console.error('[UltimateRenderer] IR validation error:', validationError);
        // Continue rendering even if validation fails
      }
    }

    // PHASE 3: If IR is present, adapt it to the old format
    // This ensures backward compatibility while enabling IR-driven rendering
    const adapted = normalized.ir
      ? { ...adaptNormalizedFromIR(normalized.ir), ir: normalized.ir }
      : normalized;

    // Log IR usage for monitoring
    if (normalized.ir) {
      console.log('[UltimateRenderer] Using IR-adapted format ✓');
    }

    const sections: string[] = [];

    // V4.0: DEVELOPER-FRIENDLY FORMAT
    // Render concise summary + issue cards first, collapse all technical details

    const enforcedFindings = adapted.findings.filter(f => f.decision !== 'pass');
    const issueCount = enforcedFindings.length;

    console.log('[UltimateRenderer] Rendering developer-friendly format (v4.0):', {
      issueCount,
      hasNotEvaluable: (adapted.notEvaluable?.length || 0) > 0
    });

    // A) Quick Summary (always visible)
    sections.push(renderQuickSummary(adapted, enforcedFindings));

    // B) Issue Cards (scannable, action-oriented)
    if (enforcedFindings.length > 0) {
      sections.push('');
      sections.push('## 📋 Issues to Fix');
      sections.push('');

      // Separate auto-invoked from policy pack findings
      const autoInvokedFindings = enforcedFindings.filter(f => {
        const obligation = adapted.obligations.find(o => o.id === f.obligationId);
        return obligation?.sourceRule.ruleId.startsWith('auto-invoked-');
      });

      const policyPackFindings = enforcedFindings.filter(f => {
        const obligation = adapted.obligations.find(o => o.id === f.obligationId);
        return !obligation?.sourceRule.ruleId.startsWith('auto-invoked-');
      });

      // Render auto-invoked findings first (cross-artifact + safety)
      if (autoInvokedFindings.length > 0) {
        sections.push('### 🔍 Cross-Artifact & Safety Checks');
        sections.push('');
        sections.push('*These checks run automatically on every PR to detect drift and safety issues.*');
        sections.push('');
        autoInvokedFindings.forEach((finding, idx) => {
          sections.push(renderDeveloperFriendlyIssueCard(finding, adapted, idx));
          sections.push('');
        });
      }

      // Render policy pack findings
      if (policyPackFindings.length > 0) {
        if (autoInvokedFindings.length > 0) {
          sections.push('');
        }
        sections.push('### 📜 Policy Requirements');
        sections.push('');
        sections.push('*These checks enforce repository governance policies.*');
        sections.push('');
        policyPackFindings.forEach((finding, idx) => {
          sections.push(renderDeveloperFriendlyIssueCard(finding, adapted, autoInvokedFindings.length + idx));
          sections.push('');
        });
      }
    }

    // C) Not-Evaluable Issues (if any) - P0 FIX: Use correct field names
    if (adapted.notEvaluable && adapted.notEvaluable.length > 0) {
      sections.push('');
      sections.push('## ⚠️ Checks That Couldn\'t Run');
      sections.push('');
      sections.push('*These checks couldn\'t be evaluated due to configuration or integration issues.*');
      sections.push('');
      adapted.notEvaluable.forEach((item, idx) => {
        sections.push(`### ${idx + 1}. ${item.description}`);
        sections.push('');
        sections.push(`**Reason:** ${item.message}`);
        sections.push('');
        sections.push(`**Impact:** ${item.confidenceImpact.toUpperCase()} confidence impact`);
        sections.push('');
        if (item.remediation && item.remediation.steps && item.remediation.steps.length > 0) {
          sections.push(`**How to fix:**`);
          item.remediation.steps.forEach((step, stepIdx) => {
            sections.push(`${stepIdx + 1}. ${step}`);
          });
          sections.push('');
        }
        sections.push('');
      });
    }

    // D) Advanced Details (collapsed - all the v3.0 governance output)
    sections.push('');
    sections.push('<details>');
    sections.push('<summary><b>📊 Advanced Details</b> (for auditors and power users)</summary>');
    sections.push('');
    sections.push('');

    // Include all the detailed governance output
    sections.push(renderExecutiveSummary(adapted));
    sections.push('');
    sections.push(renderPolicyActivation(adapted));
    sections.push('');
    sections.push(renderChangeSurfaceSummary(adapted));
    sections.push('');
    sections.push(renderRequiredContracts(adapted));
    sections.push('');
    sections.push(renderNextActions(adapted));
    sections.push('');

    // Legacy findings format (for comparison/audit)
    if (adapted.findings && adapted.findings.length > 0) {
      sections.push(renderFindings(adapted));
      sections.push('');
    }

    // Not-evaluable (detailed version)
    if (adapted.notEvaluable && adapted.notEvaluable.length > 0) {
      sections.push(renderNotEvaluable(adapted));
      sections.push('');
    }

    sections.push(renderPolicyProvenance(adapted));
    sections.push('');
    sections.push(renderEvidenceTrace(adapted));

    // Metadata (collapsed)
    sections.push(renderMetadata(adapted));

    return sections.join('\n');
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

  // FIX 3A: Explicit Governance Impact statement (one-liner at the top)
  const { enforced: enforcedObligations, suppressed: suppressedObligations } = splitObligationsByApplicability(normalized.obligations);
  const failedEnforcedObligations = enforcedObligations.filter(o => o.result.status === 'fail');
  if (failedEnforcedObligations.length > 0 && repoClassification) {
    const governanceImpact = buildGovernanceImpact(failedEnforcedObligations, repoClassification.repoType);
    if (governanceImpact) {
      lines.push(`**Governance Impact:** ${governanceImpact}`);
      lines.push('');
    }
  }

  // FIX 3B: Explicit "Scope of Decision" statement
  const baselineFailures = enforcedObligations.filter(o =>
    o.result.status === 'fail' &&
    !o.sourceRule.ruleId.includes('tier') &&
    !o.sourceRule.ruleId.includes('service-specific')
  );
  if (baselineFailures.length > 0 && suppressedObligations.length > 0) {
    lines.push(`**Scope:** Decision based on baseline repo invariants only; ${suppressedObligations.length} service overlay(s) suppressed due to classification uncertainty.`);
    lines.push('');
  }

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

  // FIX 1B: Conditional "Minimum to PASS" (clarify it's based on current classification)
  const failedFindings = normalized.findings.filter(f =>
    f.result.status === 'fail' && f.decision !== 'pass'
  );

  if (failedFindings.length > 0) {
    // Make it explicit this is conditional on current classification
    const repoTypeLabel = repoClassification?.repoType.toUpperCase() || 'CURRENT CLASSIFICATION';
    lines.push(`**Minimum to PASS (as ${repoTypeLabel}):** ${failedFindings.length} action(s) required`);
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

    // FIX 1B: Show additional requirements if classification changes
    if (suppressedObligations.length > 0) {
      const suppressedFailures = suppressedObligations.filter(o => o.result.status === 'fail');
      if (suppressedFailures.length > 0) {
        lines.push(`**If this repo is actually a SERVICE:** +${suppressedFailures.length} additional action(s) required`);
        suppressedFailures.slice(0, 2).forEach(o => {
          lines.push(`- ${o.description}`);
        });
        if (suppressedFailures.length > 2) {
          lines.push(`- *...and ${suppressedFailures.length - 2} more*`);
        }
        lines.push('');
      }
    }
  }

  // FIX 2: Remove "Overall Confidence" - keep only Decision + Classification
  // "Overall Confidence LOW" reintroduces doubt even when decision is deterministic
  // Note: baselineFailures already declared above at line 561

  // Decision confidence: HIGH if based on baseline invariants, otherwise use overall confidence
  const decisionConfidenceLevel = baselineFailures.length > 0 ? 'high' : confidence.level;
  const decisionConfidenceIcon = decisionConfidenceLevel === 'high' ? '🟢' :
                                  decisionConfidenceLevel === 'medium' ? '🟡' : '🔴';

  lines.push(`**Decision Confidence:** ${decisionConfidenceIcon} **${decisionConfidenceLevel.toUpperCase()}**`);
  if (baselineFailures.length > 0) {
    lines.push(`- Based on ${baselineFailures.length} baseline invariant(s) – deterministic regardless of repo classification`);
  } else {
    lines.push(`- Based on repo-specific obligations – may change if classification is corrected`);
  }
  lines.push('');

  // Classification confidence: Show applicability confidence separately
  if (confidence.applicabilityConfidence) {
    const appIcon = confidence.applicabilityConfidence.level === 'high' ? '🟢' :
                    confidence.applicabilityConfidence.level === 'medium' ? '🟡' : '🔴';
    lines.push(`**Classification Confidence:** ${appIcon} **${confidence.applicabilityConfidence.level.toUpperCase()} (${confidence.applicabilityConfidence.score}%)**`);
    lines.push(`- ${confidence.applicabilityConfidence.reason}`);

    // FIX 6: Show minimal classification evidence (makes decision feel grounded)
    if (repoClassification?.confidenceBreakdown) {
      const breakdown = repoClassification.confidenceBreakdown;
      lines.push('');
      lines.push('**Classification Evidence:**');
      if (breakdown.repoTypeEvidence && breakdown.repoTypeEvidence.length > 0) {
        lines.push(`- Detected: ${breakdown.repoTypeEvidence.slice(0, 3).join(', ')}`);
      }
      if (breakdown.repoTypeSource === 'inferred') {
        lines.push(`- No explicit markers found (Dockerfile, catalog-info.yaml, slo.yaml)`);
      }
    }
    lines.push('');
  }

  // FIX 2: Remove "Overall Confidence" entirely - demote to technical details
  lines.push('<details>');
  lines.push('<summary><b>📊 Technical Confidence Details</b> (click to expand)</summary>');
  lines.push('');

  const evIcon = confidence.evidenceConfidence.level === 'high' ? '🟢' :
                 confidence.evidenceConfidence.level === 'medium' ? '🟡' : '🔴';
  lines.push(`**Evidence Confidence:** ${evIcon} ${confidence.evidenceConfidence.level.toUpperCase()} (${confidence.evidenceConfidence.score}%)`);
  lines.push(`- ${confidence.evidenceConfidence.reason}`);
  lines.push('');

  const confidenceIcon = confidence.level === 'high' ? '🟢' : confidence.level === 'medium' ? '🟡' : '🔴';
  lines.push(`**Aggregate Confidence:** ${confidenceIcon} ${confidence.level.toUpperCase()} (${confidence.score}%)`);
  lines.push(`- Mathematical aggregate of applicability + evidence confidence`);
  lines.push(`- Note: Decision confidence (above) is what matters for governance; this is a technical metric`);

  if (confidence.degradationReasons.length > 0) {
    lines.push('');
    lines.push('**Why aggregate is not HIGH:**');
    confidence.degradationReasons.forEach(reason => {
      lines.push(`- ${reason}`);
    });
  }

  lines.push('');
  lines.push('</details>');
  lines.push('');

  // FIX 4: Collapse decision thresholds (boilerplate for simple cases)
  lines.push('<details>');
  lines.push('<summary><b>⚖️ Decision Thresholds</b> (click to expand)</summary>');
  lines.push('');
  lines.push('- **BLOCK:** Any obligation with `decisionOnFail: block` fails');
  lines.push('- **WARN:** Any obligation with `decisionOnFail: warn` fails (and no blocks)');
  lines.push('- **PASS:** All obligations pass or have `decisionOnFail: pass`');
  lines.push('');
  lines.push('</details>');

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
    // FIX #4: Enterprise naming (not "Pack: Test")
    const frameworkName = normalized.metadata.packName === 'Test' ? 'Repository Baseline Controls' : normalized.metadata.packName;
    lines.push(`- **Governance Framework:** ${frameworkName} (always-on)`);

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
 * C) Checks Evaluated (FIX 3: renamed from "Change Surface" for repo invariants)
 */
function renderChangeSurfaceSummary(normalized: NormalizedEvaluationResult): string {
  const lines: string[] = [];

  // FIX 3: Distinguish repo invariants from diff-derived checks
  const hasRepoInvariants = normalized.obligations.some(o =>
    !o.sourceRule.ruleId.includes('tier') &&
    !o.sourceRule.ruleId.includes('service-specific') &&
    (o.sourceRule.ruleId.includes('codeowners') ||
     o.sourceRule.ruleId.includes('checkrun') ||
     o.sourceRule.ruleId.includes('baseline'))
  );

  if (normalized.surfaces.length === 0 || hasRepoInvariants) {
    lines.push('# 🔍 Checks Evaluated');
    lines.push('');
    lines.push('*This section shows which repository baseline controls were evaluated (not diff-derived).*');
    lines.push('');
    lines.push('**Evaluation Type:** Repository Invariant Checks');
    lines.push('- These checks run on every PR to protected branches, regardless of what changed');
    lines.push('- They verify required governance artifacts exist in the repository');
    return lines.join('\n');
  }

  // Diff-derived checks (original behavior)
  lines.push('# 📝 Change Surface Summary');
  lines.push('');
  lines.push('*This section shows what changed in your PR and which specific files triggered obligations.*');
  lines.push('');

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

  // FIX 3: Update wording for repo invariants
  const hasRepoInvariants = normalized.obligations.some(o =>
    !o.sourceRule.ruleId.includes('tier') &&
    !o.sourceRule.ruleId.includes('service-specific') &&
    (o.sourceRule.ruleId.includes('codeowners') ||
     o.sourceRule.ruleId.includes('checkrun') ||
     o.sourceRule.ruleId.includes('baseline'))
  );

  lines.push('# 📜 Required Contracts & Obligations');
  lines.push('');
  if (hasRepoInvariants) {
    lines.push('*These are the baseline governance contracts required for all repositories.*');
  } else {
    lines.push('*For each change surface, these are the contract requirements and their current status.*');
  }
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

  // TRACK A TASK 2: Separate auto-invoked findings from policy pack findings
  const autoInvokedFindings = normalized.findings.filter(f => {
    const obligation = normalized.obligations.find(o => o.id === f.obligationId);
    return obligation?.sourceRule.ruleId.startsWith('auto-invoked-');
  });

  const policyPackFindings = normalized.findings.filter(f => {
    const obligation = normalized.obligations.find(o => o.id === f.obligationId);
    return !obligation?.sourceRule.ruleId.startsWith('auto-invoked-');
  });

  // Render auto-invoked findings first (cross-artifact + safety checks)
  if (autoInvokedFindings.length > 0) {
    lines.push('## 🔍 Cross-Artifact & Safety Checks');
    lines.push('');
    lines.push('*These checks run automatically on every PR to detect drift and safety issues, independent of policy pack configuration.*');
    lines.push('');

    // Group auto-invoked by severity
    const autoInvokedCritical = autoInvokedFindings.filter(f => f.severity === 'critical');
    const autoInvokedHigh = autoInvokedFindings.filter(f => f.severity === 'high');
    const autoInvokedMedium = autoInvokedFindings.filter(f => f.severity === 'medium');
    const autoInvokedLow = autoInvokedFindings.filter(f => f.severity === 'low');

    if (autoInvokedCritical.length > 0) {
      lines.push('### 🚨 Critical');
      lines.push('');
      autoInvokedCritical.forEach(finding => lines.push(renderFinding(finding, normalized)));
    }

    if (autoInvokedHigh.length > 0) {
      lines.push('### ❌ High Priority');
      lines.push('');
      autoInvokedHigh.forEach(finding => lines.push(renderFinding(finding, normalized)));
    }

    if (autoInvokedMedium.length > 0) {
      lines.push('### ⚠️ Warnings');
      lines.push('');
      autoInvokedMedium.forEach(finding => lines.push(renderFinding(finding, normalized)));
    }

    if (autoInvokedLow.length > 0) {
      lines.push('<details>');
      lines.push('<summary>ℹ️ Low Priority</summary>');
      lines.push('');
      autoInvokedLow.forEach(finding => lines.push(renderFinding(finding, normalized)));
      lines.push('</details>');
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Render policy pack findings
  if (policyPackFindings.length > 0) {
    if (autoInvokedFindings.length > 0) {
      lines.push('## 📋 Policy Pack Findings');
      lines.push('');
    }

    // Group by severity
    const critical = policyPackFindings.filter(f => f.severity === 'critical');
    const high = policyPackFindings.filter(f => f.severity === 'high');
    const medium = policyPackFindings.filter(f => f.severity === 'medium');
    const low = policyPackFindings.filter(f => f.severity === 'low');

    if (critical.length > 0) {
      lines.push('### 🚨 Critical Issues');
      lines.push('');
      critical.forEach(finding => lines.push(renderFinding(finding, normalized)));
    }

    if (high.length > 0) {
      lines.push('### ❌ High Priority');
      lines.push('');
      high.forEach(finding => lines.push(renderFinding(finding, normalized)));
    }

    if (medium.length > 0) {
      lines.push('### ⚠️ Warnings');
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

  // FIX 3D: Risk score with confidence and one-line summary
  if (finding.riskScore) {
    const riskColor = finding.riskScore.score >= 61 ? '🔴' :
                      finding.riskScore.score >= 31 ? '🟡' : '🟢';
    const riskLevel = finding.riskScore.score >= 61 ? 'HIGH' :
                      finding.riskScore.score >= 31 ? 'MODERATE' : 'LOW';

    lines.push(`**Risk:** ${riskColor} ${riskLevel} (${finding.riskScore.score}/100)`);

    // FIX 3D: Add risk confidence and one-line summary
    const isBaselineCheck = relatedObligation && !relatedObligation.sourceRule.ruleId.includes('tier') && !relatedObligation.sourceRule.ruleId.includes('service-specific');
    if (isBaselineCheck) {
      lines.push(`- Risk confidence: High (deterministic baseline check + calibrated to ${repoType} repo)`);
    } else {
      lines.push(`- Risk confidence: Medium (depends on repo classification accuracy)`);
    }

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

  // Evidence - P0 FIX: Parse evidence objects properly (same as v4.0 fix)
  if (finding.evidence.length > 0) {
    lines.push('**Evidence:**');
    finding.evidence.slice(0, 3).forEach(ev => {
      // Extract display value from evidence
      let displayValue = '';
      if (typeof ev.value === 'string') {
        displayValue = ev.value;
      } else if (typeof ev.value === 'object' && ev.value !== null) {
        // Parse evidence object to extract meaningful fields
        const evObj = ev.value as any;
        displayValue = evObj.path || evObj.file || evObj.snippet || JSON.stringify(ev.value);
      } else {
        displayValue = String(ev.value);
      }

      if (ev.type === 'file' || ev.type === 'file_reference') {
        lines.push(`- 📄 \`${displayValue}\``);
      } else if (ev.type === 'approval') {
        lines.push(`- ✅ ${displayValue}`);
      } else if (ev.type === 'checkrun') {
        lines.push(`- 🔍 ${displayValue}`);
      } else {
        lines.push(`- ${displayValue}`);
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

  // FIX #4: Enterprise naming for policy framework
  const frameworkName = normalized.metadata.packName === 'Test' ? 'Repository Baseline Controls' : normalized.metadata.packName;
  lines.push('## Policy Framework');
  lines.push('');
  lines.push(`- **Framework:** ${frameworkName} v${normalized.metadata.packVersion}`);
  lines.push(`- **Framework ID:** \`${normalized.metadata.packId}\``);
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
    // FIX #4: Enterprise naming
    const frameworkName = normalized.metadata.packName === 'Test' ? 'Repository Baseline Controls' : normalized.metadata.packName;
    lines.push(`- **Framework:** ${frameworkName}`);

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
  // FIX #4: Enterprise naming
  const frameworkName = normalized.metadata.packName === 'Test' ? 'Repository Baseline Controls' : normalized.metadata.packName;
  lines.push(`- **Framework:** ${frameworkName} v${normalized.metadata.packVersion}`);
  lines.push(`- **Framework ID:** \`${normalized.metadata.packId}\``);
  lines.push(`- **Evaluation Time:** ${normalized.metadata.evaluationTimeMs}ms`);
  lines.push(`- **Timestamp:** ${normalized.metadata.timestamp}`);

  // FIX 1C: Make surfaces concrete (show names, not just count)
  if (normalized.surfaces.length > 0) {
    const surfaceNames = normalized.surfaces.map(s => s.surfaceType).join(', ');
    lines.push(`- **Surfaces Detected:** ${surfaceNames}`);
  } else {
    lines.push(`- **Surfaces Detected:** repo-baseline (not diff-derived)`);
  }

  // FIX 1A: Consistent obligation counting
  lines.push(`- **Obligations Considered:** ${enforced.length + suppressed.length} total (${enforced.length} enforced, ${suppressed.length} suppressed, ${informational.length} informational)`);
  lines.push(`- **Findings:** ${normalized.findings.length}`);
  lines.push(`- **Not Evaluable:** ${normalized.notEvaluable.length}`);
  lines.push('</details>');

  return lines.join('\n');
}
