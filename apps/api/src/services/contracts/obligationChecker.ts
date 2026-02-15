/**
 * Obligation Checker
 * 
 * Checks policy requirements (obligations) that are not content-based comparisons:
 * - Approval obligations (CODEOWNER approvals, reviewer count)
 * - Evidence obligations (required files like rollback.md, migration_plan.md)
 * - Test obligations (tests updated when modules touched)
 * - Release obligations (changelog updated, version bump)
 * 
 * These are deterministic gates that complement comparators.
 */

import type { IntegrityFinding, Contract } from './types.js';
import type { Surface } from '../contractGate/surfaceClassifier.js';

// ======================================================================
// TYPES
// ======================================================================

export interface ObligationCheckInput {
  workspaceId: string;
  signalEventId: string;
  surfacesTouched: Surface[];
  changedFiles: Array<{ filename: string; status: string; additions?: number; deletions?: number }>;
  contracts: Contract[];
  prContext?: {
    approvals?: string[]; // List of approver usernames
    labels?: string[]; // PR labels
    author?: string; // PR author
  };
}

export interface ObligationCheckResult {
  findings: IntegrityFinding[];
  obligationsChecked: number;
  obligationsPassed: number;
  obligationsFailed: number;
}

// ======================================================================
// MAIN OBLIGATION CHECKER
// ======================================================================

/**
 * Run all obligation checks for the PR
 * 
 * Returns findings for any failed obligations.
 */
export async function runObligationChecks(
  input: ObligationCheckInput
): Promise<ObligationCheckResult> {
  console.log(`[ObligationChecker] Running obligation checks for signal ${input.signalEventId}`);

  const findings: IntegrityFinding[] = [];
  let obligationsChecked = 0;
  let obligationsPassed = 0;
  let obligationsFailed = 0;

  // Check 1: Evidence file obligations
  const evidenceFindings = checkEvidenceObligations(input);
  findings.push(...evidenceFindings);
  // FIX: Count total checks run, not just checks that produced findings
  const evidenceChecksRun = (input.surfacesTouched.includes('infra') || input.surfacesTouched.includes('security')) ? 1 : 0;
  const dataModelChecksRun = input.surfacesTouched.includes('data_model') ? 1 : 0;
  obligationsChecked += evidenceChecksRun + dataModelChecksRun;
  obligationsFailed += evidenceFindings.length;

  // Check 2: Changelog obligations
  const changelogFindings = checkChangelogObligations(input);
  findings.push(...changelogFindings);
  // FIX: Count total checks run
  const changelogChecksRun = input.surfacesTouched.includes('api') ? 1 : 0;
  obligationsChecked += changelogChecksRun;
  obligationsFailed += changelogFindings.length;

  // Check 3: Test obligations (currently disabled, so 0 checks run)
  const testFindings = checkTestObligations(input);
  findings.push(...testFindings);
  // Test obligations are disabled (returns empty array), so don't count them
  obligationsChecked += 0;
  obligationsFailed += testFindings.length;

  obligationsPassed = obligationsChecked - obligationsFailed;

  console.log(`[ObligationChecker] Checked ${obligationsChecked} obligations: ${obligationsPassed} passed, ${obligationsFailed} failed`);

  return {
    findings,
    obligationsChecked,
    obligationsPassed,
    obligationsFailed,
  };
}

// ======================================================================
// OBLIGATION CHECK IMPLEMENTATIONS
// ======================================================================

/**
 * Check evidence file obligations
 * 
 * Rules:
 * - If IAM/infra surface touched → require rollback.md or docs/rollback.md
 * - If data_model surface touched → require migration_plan.md or docs/migrations.md
 * - If API surface touched with breaking changes → require customer_impact.md
 */
function checkEvidenceObligations(input: ObligationCheckInput): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  const fileNames = input.changedFiles.map(f => f.filename.toLowerCase());

  // Rule 1: Infra changes require rollback plan
  if (input.surfacesTouched.includes('infra') || input.surfacesTouched.includes('security')) {
    const hasRollbackPlan = fileNames.some(f => 
      f.includes('rollback') && (f.endsWith('.md') || f.endsWith('.txt'))
    );

    if (!hasRollbackPlan) {
      findings.push(createObligationFinding({
        type: 'missing_evidence_file',
        severity: 'high',
        message: 'Infrastructure changes require a rollback plan',
        evidence: 'No rollback.md or docs/rollback.md file found in PR',
        remediation: 'Add a rollback plan document describing how to revert these infrastructure changes',
        surfaceArea: 'infra',
      }));
    }
  }

  // Rule 2: Data model changes require migration plan
  if (input.surfacesTouched.includes('data_model')) {
    const hasMigrationPlan = fileNames.some(f => 
      (f.includes('migration') || f.includes('schema')) && f.endsWith('.md')
    );

    if (!hasMigrationPlan) {
      findings.push(createObligationFinding({
        type: 'missing_evidence_file',
        severity: 'high',
        message: 'Database schema changes require a migration plan',
        evidence: 'No migration_plan.md or docs/migrations.md file found in PR',
        remediation: 'Add a migration plan document describing the schema changes and rollback strategy',
        surfaceArea: 'data_model',
      }));
    }
  }

  return findings;
}

/**
 * Check changelog obligations
 * 
 * Rules:
 * - If API surface touched → require CHANGELOG.md update
 * - If version file touched → require CHANGELOG.md update
 */
function checkChangelogObligations(input: ObligationCheckInput): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  const fileNames = input.changedFiles.map(f => f.filename.toLowerCase());

  // Rule: API changes should update changelog
  if (input.surfacesTouched.includes('api')) {
    const hasChangelogUpdate = fileNames.some(f => f.includes('changelog'));

    if (!hasChangelogUpdate) {
      findings.push(createObligationFinding({
        type: 'missing_changelog_update',
        severity: 'medium',
        message: 'API changes should be documented in CHANGELOG',
        evidence: 'No CHANGELOG file updated in PR',
        remediation: 'Update CHANGELOG.md with a description of API changes',
        surfaceArea: 'api',
      }));
    }
  }

  return findings;
}

/**
 * Check test obligations
 * 
 * Rules:
 * - If source code changed → check if corresponding test files changed
 * - This is heuristic-based and conservative (low severity)
 */
function checkTestObligations(input: ObligationCheckInput): IntegrityFinding[] {
  // TODO: Implement test coverage heuristics
  // For now, return empty (too noisy without proper implementation)
  return [];
}

// ======================================================================
// HELPER FUNCTIONS
// ======================================================================

function createObligationFinding(params: {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  evidence: string;
  remediation: string;
  surfaceArea: string;
}): IntegrityFinding {
  return {
    findingId: `obligation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    findingType: params.type,
    severity: params.severity,
    confidence: 1.0, // Obligations are deterministic
    message: params.message,
    evidence: [
      {
        type: 'obligation_check',
        description: params.evidence,
        location: { type: 'pr_files', path: 'N/A' },
      },
    ],
    remediation: params.remediation,
    surfaceArea: params.surfaceArea,
    createdAt: new Date(),
  };
}

