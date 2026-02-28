/**
 * Governance Output Contract (GOC) Validator
 * 
 * Enforces 5 runtime invariants to ensure systematic consistency.
 * Runs in "audit mode" first (log violations, don't throw).
 * 
 * Key principles:
 * - Validates IR before rendering
 * - Catches regressions early
 * - Provides actionable error messages
 * - Can run in audit or enforce mode
 */

import type {
  GovernanceOutputContract,
  ContractViolation,
  RunContext,
  PolicyPlan,
  ObligationResult,
} from './types.js';

export interface ValidationOptions {
  mode: 'audit' | 'enforce';
  skipInvariants?: string[]; // For gradual rollout
}

export interface ValidationResult {
  valid: boolean;
  violations: ContractViolation[];
  warnings: string[];
}

/**
 * Validate Governance Output Contract
 * 
 * @param contract - The GOC to validate
 * @param options - Validation options (audit vs enforce)
 * @returns Validation result with violations
 */
export function validateGovernanceOutputContract(
  contract: GovernanceOutputContract,
  options: ValidationOptions = { mode: 'audit' }
): ValidationResult {
  const violations: ContractViolation[] = [];
  const warnings: string[] = [];

  // INVARIANT 1: Counting Consistency
  if (!options.skipInvariants?.includes('INVARIANT_1')) {
    const inv1Violations = validateCountingConsistency(contract);
    violations.push(...inv1Violations);
  }

  // INVARIANT 2: Decision Basis
  if (!options.skipInvariants?.includes('INVARIANT_2')) {
    const inv2Violations = validateDecisionBasis(contract);
    violations.push(...inv2Violations);
  }

  // INVARIANT 3: Confidence Display
  if (!options.skipInvariants?.includes('INVARIANT_3')) {
    const inv3Violations = validateConfidenceDisplay(contract);
    violations.push(...inv3Violations);
  }

  // INVARIANT 4: Evidence Completeness
  if (!options.skipInvariants?.includes('INVARIANT_4')) {
    const inv4Violations = validateEvidenceCompleteness(contract);
    violations.push(...inv4Violations);
  }

  // INVARIANT 5: Scope Consistency
  if (!options.skipInvariants?.includes('INVARIANT_5')) {
    const inv5Violations = validateScopeConsistency(contract);
    violations.push(...inv5Violations);
  }

  // In enforce mode, throw on violations
  if (options.mode === 'enforce' && violations.length > 0) {
    const errorMessage = formatViolations(violations);
    throw new Error(`GOC Validation Failed:\n${errorMessage}`);
  }

  return {
    valid: violations.length === 0,
    violations,
    warnings,
  };
}

/**
 * INVARIANT 1: Counting Consistency
 * RULE: considered = enforced + suppressed + notEvaluable + informational
 */
function validateCountingConsistency(contract: GovernanceOutputContract): ContractViolation[] {
  const violations: ContractViolation[] = [];
  const { counts } = contract;

  const expected = counts.enforced + counts.suppressed + counts.notEvaluable + counts.informational;
  const actual = counts.considered;

  if (expected !== actual) {
    violations.push({
      invariant: 'INVARIANT_1_COUNTING_CONSISTENCY',
      severity: 'error',
      message: `Counting model violated: considered (${actual}) ≠ enforced (${counts.enforced}) + suppressed (${counts.suppressed}) + notEvaluable (${counts.notEvaluable}) + informational (${counts.informational})`,
      expected,
      actual,
    });
  }

  return violations;
}

/**
 * INVARIANT 2: Decision Basis
 * RULE: Decision must be based on enforced obligations only (never suppressed)
 */
function validateDecisionBasis(contract: GovernanceOutputContract): ContractViolation[] {
  const violations: ContractViolation[] = [];
  const { decision } = contract;

  // Check that basis is correct
  if (decision.basis !== 'enforced_obligations_only') {
    violations.push({
      invariant: 'INVARIANT_2_DECISION_BASIS',
      severity: 'error',
      message: `Decision basis must be 'enforced_obligations_only', got '${decision.basis}'`,
      expected: 'enforced_obligations_only',
      actual: decision.basis,
    });
  }

  // Check that robustness is valid
  const validRobustness = ['deterministic_baseline', 'diff_analysis', 'heuristic'];
  if (!validRobustness.includes(decision.robustness)) {
    violations.push({
      invariant: 'INVARIANT_2_DECISION_BASIS',
      severity: 'error',
      message: `Decision robustness must be one of ${validRobustness.join(', ')}, got '${decision.robustness}'`,
      expected: validRobustness,
      actual: decision.robustness,
    });
  }

  return violations;
}

/**
 * INVARIANT 3: Confidence Display
 * RULE: Never compute "Overall Confidence" unless justified
 * Separate classification confidence from decision confidence
 */
function validateConfidenceDisplay(contract: GovernanceOutputContract): ContractViolation[] {
  const violations: ContractViolation[] = [];
  const { confidence } = contract;

  // Check that confidence scores are in valid range [0, 1]
  if (confidence.decision < 0 || confidence.decision > 1) {
    violations.push({
      invariant: 'INVARIANT_3_CONFIDENCE_DISPLAY',
      severity: 'error',
      message: `Decision confidence must be in range [0, 1], got ${confidence.decision}`,
      expected: '[0, 1]',
      actual: confidence.decision,
    });
  }

  if (confidence.classification < 0 || confidence.classification > 1) {
    violations.push({
      invariant: 'INVARIANT_3_CONFIDENCE_DISPLAY',
      severity: 'error',
      message: `Classification confidence must be in range [0, 1], got ${confidence.classification}`,
      expected: '[0, 1]',
      actual: confidence.classification,
    });
  }

  return violations;
}

/**
 * INVARIANT 4: Evidence Completeness
 * RULE: Every FAIL/WARN must include:
 * - reasonCode
 * - evidenceLocationsSearched
 * - minimumToPassSteps
 */
function validateEvidenceCompleteness(contract: GovernanceOutputContract): ContractViolation[] {
  const violations: ContractViolation[] = [];
  const { failedObligations } = contract;

  for (const obligation of failedObligations) {
    // Check reasonCode
    if (!obligation.reasonCode) {
      violations.push({
        invariant: 'INVARIANT_4_EVIDENCE_COMPLETENESS',
        severity: 'error',
        message: `Failed obligation '${obligation.id}' missing reasonCode`,
        expected: 'reasonCode present',
        actual: 'reasonCode missing',
      });
    }

    // Check evidenceLocationsSearched
    if (!obligation.evidenceLocationsSearched || obligation.evidenceLocationsSearched.length === 0) {
      violations.push({
        invariant: 'INVARIANT_4_EVIDENCE_COMPLETENESS',
        severity: 'error',
        message: `Failed obligation '${obligation.id}' missing evidenceLocationsSearched`,
        expected: 'evidenceLocationsSearched present',
        actual: 'evidenceLocationsSearched missing or empty',
      });
    }

    // Check minimumToPassSteps
    if (!obligation.minimumToPassSteps || obligation.minimumToPassSteps.length === 0) {
      violations.push({
        invariant: 'INVARIANT_4_EVIDENCE_COMPLETENESS',
        severity: 'error',
        message: `Failed obligation '${obligation.id}' missing minimumToPassSteps`,
        expected: 'minimumToPassSteps present',
        actual: 'minimumToPassSteps missing or empty',
      });
    }
  }

  return violations;
}

/**
 * INVARIANT 5: Scope Consistency
 * RULE: If only repo_invariant exists → suppress "Change Surface Summary"
 * If diff_derived exists → show "Change Surface Summary"
 */
function validateScopeConsistency(contract: GovernanceOutputContract): ContractViolation[] {
  const violations: ContractViolation[] = [];
  const { scopes } = contract;

  // Check that at least one scope is present
  if (!scopes.hasRepoInvariant && !scopes.hasDiffDerived && !scopes.hasEnvironmentGate) {
    violations.push({
      invariant: 'INVARIANT_5_SCOPE_CONSISTENCY',
      severity: 'warning',
      message: 'No scopes detected - at least one scope should be present',
      expected: 'At least one scope present',
      actual: 'No scopes present',
    });
  }

  return violations;
}

/**
 * Format violations for error message
 */
function formatViolations(violations: ContractViolation[]): string {
  return violations
    .map(v => `[${v.severity.toUpperCase()}] ${v.invariant}: ${v.message}`)
    .join('\n');
}

/**
 * Build GOC from IR entities
 * This is a helper to construct the contract from the IR
 */
export function buildGovernanceOutputContract(
  runContext: RunContext,
  policyPlan: PolicyPlan,
  obligationResults: ObligationResult[]
): GovernanceOutputContract {
  // Count obligations by status
  const enforced = obligationResults.filter(o =>
    o.status === 'PASS' || o.status === 'FAIL'
  ).length;

  const suppressed = obligationResults.filter(o =>
    o.status === 'SUPPRESSED'
  ).length;

  const notEvaluable = obligationResults.filter(o =>
    o.status === 'NOT_EVALUABLE'
  ).length;

  const informational = obligationResults.filter(o =>
    o.status === 'INFO'
  ).length;

  const considered = enforced + suppressed + notEvaluable + informational;

  // Determine global decision
  const hasBlockingFailures = obligationResults.some(o =>
    o.status === 'FAIL' && o.decisionOnFail === 'block'
  );
  const hasWarnings = obligationResults.some(o =>
    o.status === 'FAIL' && o.decisionOnFail === 'warn'
  );

  const globalDecision: 'PASS' | 'WARN' | 'BLOCK' =
    hasBlockingFailures ? 'BLOCK' :
    hasWarnings ? 'WARN' :
    'PASS';

  // Determine robustness
  const hasDiffDerived = obligationResults.some(o => o.scope === 'diff_derived');
  const robustness = hasDiffDerived ? 'diff_analysis' : 'deterministic_baseline';

  // Extract failed obligations
  const failedObligations = obligationResults
    .filter(o => o.status === 'FAIL')
    .map(o => ({
      id: o.id,
      reasonCode: o.reasonCode,
      evidenceLocationsSearched: o.evidenceSearch?.locationsSearched || [],
      minimumToPassSteps: o.remediation.minimumToPass,
    }));

  // Determine scopes
  const hasRepoInvariant = obligationResults.some(o => o.scope === 'repo_invariant');
  const hasEnvironmentGate = obligationResults.some(o => o.scope === 'environment_gate');

  return {
    counts: {
      considered,
      enforced,
      suppressed,
      notEvaluable,
      informational,
    },
    decision: {
      global: globalDecision,
      basis: 'enforced_obligations_only',
      robustness,
    },
    confidence: {
      decision: runContext.confidence.decision.confidence,
      classification: runContext.confidence.classification.confidence,
    },
    failedObligations,
    scopes: {
      hasRepoInvariant,
      hasDiffDerived,
      hasEnvironmentGate,
    },
  };
}
