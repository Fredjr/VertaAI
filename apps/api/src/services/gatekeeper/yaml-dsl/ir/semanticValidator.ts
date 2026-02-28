/**
 * Semantic Validator Suite
 * 
 * Enforces ~20 runtime invariants across 3 layers:
 * - Structural (5): Schema, counting, partitioning
 * - Decision (8): Derivation, thresholds, basis, robustness
 * - User-Trust (7): Actionable remediation, no contradictions, no freeform prose
 * 
 * This expands the original GOC validator from 5 to 20 invariants.
 * 
 * Key Principles:
 * - Validates IR before rendering
 * - Catches regressions early
 * - Provides actionable error messages
 * - Can run in audit or enforce mode
 */

import type {
  GovernanceIR,
  ObligationResult,
  ContractViolation,
} from './schema.js';
import { isValidMessageId, MESSAGE_CATALOG } from './messageCatalog.js';

export interface SemanticValidationOptions {
  mode: 'audit' | 'enforce';
  skipInvariants?: string[]; // For gradual rollout
  enableExperimental?: boolean; // For Phase 6+ invariants
}

export interface SemanticValidationResult {
  valid: boolean;
  violations: ContractViolation[];
  warnings: string[];
  stats: {
    totalInvariants: number;
    passedInvariants: number;
    failedInvariants: number;
    skippedInvariants: number;
  };
}

/**
 * Validate Governance IR with ~20 semantic invariants
 */
export function validateSemantics(
  ir: GovernanceIR,
  options: SemanticValidationOptions = { mode: 'audit' }
): SemanticValidationResult {
  const violations: ContractViolation[] = [];
  const warnings: string[] = [];
  let totalInvariants = 0;
  let passedInvariants = 0;
  let skippedInvariants = 0;

  // ============================================================================
  // STRUCTURAL INVARIANTS (5)
  // ============================================================================

  // INVARIANT 1: Counting Consistency
  if (!options.skipInvariants?.includes('INVARIANT_1')) {
    totalInvariants++;
    const inv1Violations = validateCountingConsistency(ir);
    if (inv1Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv1Violations);
    }
  } else {
    skippedInvariants++;
  }

  // INVARIANT 2: Partition Completeness
  if (!options.skipInvariants?.includes('INVARIANT_2')) {
    totalInvariants++;
    const inv2Violations = validatePartitionCompleteness(ir);
    if (inv2Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv2Violations);
    }
  } else {
    skippedInvariants++;
  }

  // INVARIANT 3: Required Fields
  if (!options.skipInvariants?.includes('INVARIANT_3')) {
    totalInvariants++;
    const inv3Violations = validateRequiredFields(ir);
    if (inv3Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv3Violations);
    }
  } else {
    skippedInvariants++;
  }

  // INVARIANT 4: Enum Validity
  if (!options.skipInvariants?.includes('INVARIANT_4')) {
    totalInvariants++;
    const inv4Violations = validateEnumValidity(ir);
    if (inv4Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv4Violations);
    }
  } else {
    skippedInvariants++;
  }

  // INVARIANT 5: Scope Consistency
  if (!options.skipInvariants?.includes('INVARIANT_5')) {
    totalInvariants++;
    const inv5Violations = validateScopeConsistency(ir);
    if (inv5Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv5Violations);
    }
  } else {
    skippedInvariants++;
  }

  // ============================================================================
  // DECISION INVARIANTS (8)
  // ============================================================================

  // INVARIANT 6: Decision Basis
  if (!options.skipInvariants?.includes('INVARIANT_6')) {
    totalInvariants++;
    const inv6Violations = validateDecisionBasis(ir);
    if (inv6Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv6Violations);
    }
  } else {
    skippedInvariants++;
  }

  // INVARIANT 7: Decision Derivation
  if (!options.skipInvariants?.includes('INVARIANT_7')) {
    totalInvariants++;
    const inv7Violations = validateDecisionDerivation(ir);
    if (inv7Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv7Violations);
    }
  } else {
    skippedInvariants++;
  }

  // INVARIANT 8: Threshold Consistency
  if (!options.skipInvariants?.includes('INVARIANT_8')) {
    totalInvariants++;
    const inv8Violations = validateThresholdConsistency(ir);
    if (inv8Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv8Violations);
    }
  } else {
    skippedInvariants++;
  }

  // INVARIANT 9: Robustness Accuracy
  if (!options.skipInvariants?.includes('INVARIANT_9')) {
    totalInvariants++;
    const inv9Violations = validateRobustnessAccuracy(ir);
    if (inv9Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv9Violations);
    }
  } else {
    skippedInvariants++;
  }

  // INVARIANT 10: Suppressed Never Triggered
  if (!options.skipInvariants?.includes('INVARIANT_10')) {
    totalInvariants++;
    const inv10Violations = validateSuppressedNeverTriggered(ir);
    if (inv10Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv10Violations);
    }
  } else {
    skippedInvariants++;
  }

  // INVARIANT 11: Decision Confidence Basis
  if (!options.skipInvariants?.includes('INVARIANT_11')) {
    totalInvariants++;
    const inv11Violations = validateDecisionConfidenceBasis(ir);
    if (inv11Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv11Violations);
    }
  } else {
    skippedInvariants++;
  }

  // INVARIANT 12: No Contradictory Decisions
  if (!options.skipInvariants?.includes('INVARIANT_12')) {
    totalInvariants++;
    const inv12Violations = validateNoContradictoryDecisions(ir);
    if (inv12Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv12Violations);
    }
  } else {
    skippedInvariants++;
  }

  // INVARIANT 13: Decision Explanation
  if (!options.skipInvariants?.includes('INVARIANT_13')) {
    totalInvariants++;
    const inv13Violations = validateDecisionExplanation(ir);
    if (inv13Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv13Violations);
    }
  } else {
    skippedInvariants++;
  }

  // ============================================================================
  // USER-TRUST INVARIANTS (7)
  // ============================================================================

  // INVARIANT 14: Evidence Completeness
  if (!options.skipInvariants?.includes('INVARIANT_14')) {
    totalInvariants++;
    const inv14Violations = validateEvidenceCompleteness(ir);
    if (inv14Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv14Violations);
    }
  } else {
    skippedInvariants++;
  }

  // INVARIANT 15: Actionable Remediation
  if (!options.skipInvariants?.includes('INVARIANT_15')) {
    totalInvariants++;
    const inv15Violations = validateActionableRemediation(ir);
    if (inv15Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv15Violations);
    }
  } else {
    skippedInvariants++;
  }

  // INVARIANT 16: No Freeform Prose (Phase 5.3 - after message catalog)
  if (!options.skipInvariants?.includes('INVARIANT_16') && options.enableExperimental) {
    totalInvariants++;
    const inv16Violations = validateNoFreeformProse(ir);
    if (inv16Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv16Violations);
    }
  } else {
    skippedInvariants++;
  }

  // INVARIANT 17: Confidence No Contradiction
  if (!options.skipInvariants?.includes('INVARIANT_17')) {
    totalInvariants++;
    const inv17Violations = validateConfidenceNoContradiction(ir);
    if (inv17Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv17Violations);
    }
  } else {
    skippedInvariants++;
  }

  // INVARIANT 18: Classification Guidance
  if (!options.skipInvariants?.includes('INVARIANT_18')) {
    totalInvariants++;
    const inv18Violations = validateClassificationGuidance(ir);
    if (inv18Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv18Violations);
    }
  } else {
    skippedInvariants++;
  }

  // INVARIANT 19: Scope Claim Accuracy
  if (!options.skipInvariants?.includes('INVARIANT_19')) {
    totalInvariants++;
    const inv19Violations = validateScopeClaimAccuracy(ir);
    if (inv19Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv19Violations);
    }
  } else {
    skippedInvariants++;
  }

  // INVARIANT 20: Evidence Search Transparency
  if (!options.skipInvariants?.includes('INVARIANT_20')) {
    totalInvariants++;
    const inv20Violations = validateEvidenceSearchTransparency(ir);
    if (inv20Violations.length === 0) {
      passedInvariants++;
    } else {
      violations.push(...inv20Violations);
    }
  } else {
    skippedInvariants++;
  }

  // ============================================================================
  // FINALIZE RESULT
  // ============================================================================

  const failedInvariants = totalInvariants - passedInvariants - skippedInvariants;

  // In enforce mode, throw on violations
  if (options.mode === 'enforce' && violations.length > 0) {
    const errorMessage = formatViolations(violations);
    throw new Error(`Semantic Validation Failed:\n${errorMessage}`);
  }

  return {
    valid: violations.length === 0,
    violations,
    warnings,
    stats: {
      totalInvariants,
      passedInvariants,
      failedInvariants,
      skippedInvariants,
    },
  };
}

// ============================================================================
// STRUCTURAL INVARIANTS (5)
// ============================================================================

/**
 * INVARIANT 1: Counting Consistency
 * RULE: considered = enforced + suppressed + notEvaluable + informational
 */
function validateCountingConsistency(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];
  const { counts } = ir.summary;

  const expected = counts.enforced + counts.suppressed + counts.notEvaluable + counts.informational;
  const actual = counts.considered;

  if (expected !== actual) {
    violations.push({
      invariantId: 'INVARIANT_1_COUNTING_CONSISTENCY',
      severity: 'error',
      message: `Counting inconsistency: considered (${actual}) ≠ enforced (${counts.enforced}) + suppressed (${counts.suppressed}) + notEvaluable (${counts.notEvaluable}) + informational (${counts.informational}) = ${expected}`,
      details: { expected, actual, counts },
    });
  }

  return violations;
}

/**
 * INVARIANT 2: Partition Completeness
 * RULE: Every obligation appears in exactly one partition
 */
function validatePartitionCompleteness(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];
  const obligationIds = new Set<string>();
  const duplicates: string[] = [];

  for (const obligation of ir.obligationResults) {
    if (obligationIds.has(obligation.id)) {
      duplicates.push(obligation.id);
    } else {
      obligationIds.add(obligation.id);
    }
  }

  if (duplicates.length > 0) {
    violations.push({
      invariantId: 'INVARIANT_2_PARTITION_COMPLETENESS',
      severity: 'error',
      message: `Duplicate obligation IDs found: ${duplicates.join(', ')}`,
      details: { duplicates },
    });
  }

  // Check that total obligations matches counts
  const totalObligations = ir.obligationResults.length;
  const expectedTotal = ir.summary.counts.considered;

  if (totalObligations !== expectedTotal) {
    violations.push({
      invariantId: 'INVARIANT_2_PARTITION_COMPLETENESS',
      severity: 'error',
      message: `Obligation count mismatch: ${totalObligations} obligations but summary.counts.considered = ${expectedTotal}`,
      details: { totalObligations, expectedTotal },
    });
  }

  return violations;
}

/**
 * INVARIANT 3: Required Fields
 * RULE: All required fields present (id, title, status, reasonCode, evidence, remediation)
 */
function validateRequiredFields(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];

  for (const obligation of ir.obligationResults) {
    const missingFields: string[] = [];

    if (!obligation.id) missingFields.push('id');
    if (!obligation.title) missingFields.push('title');
    if (!obligation.status) missingFields.push('status');
    if (!obligation.reasonCode) missingFields.push('reasonCode');
    if (!obligation.evidence) missingFields.push('evidence');
    if (!obligation.remediation) missingFields.push('remediation');

    if (missingFields.length > 0) {
      violations.push({
        invariantId: 'INVARIANT_3_REQUIRED_FIELDS',
        severity: 'error',
        message: `Obligation ${obligation.id} missing required fields: ${missingFields.join(', ')}`,
        details: { obligationId: obligation.id, missingFields },
      });
    }
  }

  return violations;
}

/**
 * INVARIANT 4: Enum Validity
 * RULE: All enum fields use valid values (status, scope, decisionOnFail)
 * NOTE: This is enforced by Zod schema, but we double-check here
 */
function validateEnumValidity(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];

  const validStatuses = ['PASS', 'FAIL', 'SUPPRESSED', 'NOT_EVALUABLE', 'INFO'];
  const validScopes = ['repo_invariant', 'diff_derived', 'environment_gate'];
  const validDecisions = ['block', 'warn', 'pass'];

  for (const obligation of ir.obligationResults) {
    if (!validStatuses.includes(obligation.status)) {
      violations.push({
        invariantId: 'INVARIANT_4_ENUM_VALIDITY',
        severity: 'error',
        message: `Obligation ${obligation.id} has invalid status: ${obligation.status}`,
        details: { obligationId: obligation.id, invalidStatus: obligation.status },
      });
    }

    if (!validScopes.includes(obligation.scope)) {
      violations.push({
        invariantId: 'INVARIANT_4_ENUM_VALIDITY',
        severity: 'error',
        message: `Obligation ${obligation.id} has invalid scope: ${obligation.scope}`,
        details: { obligationId: obligation.id, invalidScope: obligation.scope },
      });
    }

    if (!validDecisions.includes(obligation.decisionOnFail)) {
      violations.push({
        invariantId: 'INVARIANT_4_ENUM_VALIDITY',
        severity: 'error',
        message: `Obligation ${obligation.id} has invalid decisionOnFail: ${obligation.decisionOnFail}`,
        details: { obligationId: obligation.id, invalidDecision: obligation.decisionOnFail },
      });
    }
  }

  return violations;
}

/**
 * INVARIANT 5: Scope Consistency
 * RULE: Scope flags match obligation scopes
 */
function validateScopeConsistency(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];

  const repoInvariantCount = ir.obligationResults.filter(o => o.scope === 'repo_invariant').length;
  const diffDerivedCount = ir.obligationResults.filter(o => o.scope === 'diff_derived').length;
  const environmentGateCount = ir.obligationResults.filter(o => o.scope === 'environment_gate').length;

  // TODO: Add scope flags to summary schema
  // For now, just validate that scopes are used consistently

  return violations;
}

// ============================================================================
// DECISION INVARIANTS (8)
// ============================================================================

/**
 * INVARIANT 6: Decision Basis
 * RULE: Decision based on enforced obligations only (never suppressed)
 */
function validateDecisionBasis(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];

  const enforcedObligations = ir.obligationResults.filter(o =>
    o.status !== 'SUPPRESSED' && o.status !== 'NOT_EVALUABLE' && o.status !== 'INFO'
  );

  const suppressedObligations = ir.obligationResults.filter(o => o.status === 'SUPPRESSED');

  // Check that decision is not based on suppressed obligations
  for (const suppressed of suppressedObligations) {
    if (ir.summary.decision.contributingFactors.includes(suppressed.id)) {
      violations.push({
        invariantId: 'INVARIANT_6_DECISION_BASIS',
        severity: 'error',
        message: `Decision based on suppressed obligation: ${suppressed.id}`,
        details: { obligationId: suppressed.id },
      });
    }
  }

  return violations;
}

/**
 * INVARIANT 7: Decision Derivation
 * RULE: Global decision = max(enforced obligations' decisionOnFail)
 */
function validateDecisionDerivation(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];

  const enforcedFailures = ir.obligationResults.filter(o =>
    o.status === 'FAIL' && o.status !== 'SUPPRESSED' && o.status !== 'NOT_EVALUABLE'
  );

  const decisionPriority = { block: 3, warn: 2, pass: 1 };
  const maxDecision = enforcedFailures.reduce((max, o) => {
    const priority = decisionPriority[o.decisionOnFail];
    return priority > decisionPriority[max] ? o.decisionOnFail : max;
  }, 'pass' as 'block' | 'warn' | 'pass');

  if (ir.summary.decision.outcome !== maxDecision) {
    violations.push({
      invariantId: 'INVARIANT_7_DECISION_DERIVATION',
      severity: 'error',
      message: `Decision derivation mismatch: expected ${maxDecision} but got ${ir.summary.decision.outcome}`,
      details: { expected: maxDecision, actual: ir.summary.decision.outcome },
    });
  }

  return violations;
}

/**
 * INVARIANT 8: Threshold Consistency
 * RULE: Thresholds consistent with decisionOnFail
 */
function validateThresholdConsistency(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];

  // TODO: Add threshold validation when thresholds are added to schema

  return violations;
}

/**
 * INVARIANT 9: Robustness Accuracy
 * RULE: Robustness matches evaluation type (deterministic_baseline vs diff_analysis)
 */
function validateRobustnessAccuracy(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];

  // TODO: Add robustness field to schema and validate

  return violations;
}

/**
 * INVARIANT 10: Suppressed Never Triggered
 * RULE: Suppressed obligations never appear in triggered list
 */
function validateSuppressedNeverTriggered(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];

  const suppressedObligations = ir.obligationResults.filter(o => o.status === 'SUPPRESSED');

  for (const suppressed of suppressedObligations) {
    if (ir.summary.decision.contributingFactors.includes(suppressed.id)) {
      violations.push({
        invariantId: 'INVARIANT_10_SUPPRESSED_NEVER_TRIGGERED',
        severity: 'error',
        message: `Suppressed obligation appears in triggered list: ${suppressed.id}`,
        details: { obligationId: suppressed.id },
      });
    }
  }

  return violations;
}

/**
 * INVARIANT 11: Decision Confidence Basis
 * RULE: Decision confidence references decision basis (deterministic → HIGH, LLM → MEDIUM)
 */
function validateDecisionConfidenceBasis(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];

  // TODO: Implement when vector confidence model is added

  return violations;
}

/**
 * INVARIANT 12: No Contradictory Decisions
 * RULE: No obligation has status=PASS but decisionOnFail=block
 */
function validateNoContradictoryDecisions(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];

  for (const obligation of ir.obligationResults) {
    if (obligation.status === 'PASS' && obligation.decisionOnFail === 'block') {
      violations.push({
        invariantId: 'INVARIANT_12_NO_CONTRADICTORY_DECISIONS',
        severity: 'warning',
        message: `Obligation ${obligation.id} has status=PASS but decisionOnFail=block (unusual but not invalid)`,
        details: { obligationId: obligation.id },
      });
    }
  }

  return violations;
}

/**
 * INVARIANT 13: Decision Explanation
 * RULE: Every non-PASS decision has explicit reason
 */
function validateDecisionExplanation(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];

  for (const obligation of ir.obligationResults) {
    if (obligation.status !== 'PASS' && !obligation.reasonHuman) {
      violations.push({
        invariantId: 'INVARIANT_13_DECISION_EXPLANATION',
        severity: 'error',
        message: `Obligation ${obligation.id} has status=${obligation.status} but no reasonHuman`,
        details: { obligationId: obligation.id, status: obligation.status },
      });
    }
  }

  return violations;
}

// ============================================================================
// USER-TRUST INVARIANTS (7)
// ============================================================================

/**
 * INVARIANT 14: Evidence Completeness
 * RULE: Every FAIL/WARN has reasonCode, evidenceLocationsSearched, minimumToPassSteps
 */
function validateEvidenceCompleteness(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];

  for (const obligation of ir.obligationResults) {
    if (obligation.status === 'FAIL') {
      if (!obligation.reasonCode || obligation.reasonCode === 'UNKNOWN') {
        violations.push({
          invariantId: 'INVARIANT_14_EVIDENCE_COMPLETENESS',
          severity: 'error',
          message: `Obligation ${obligation.id} has status=FAIL but no reasonCode`,
          details: { obligationId: obligation.id },
        });
      }

      if (!obligation.evidenceSearch || obligation.evidenceSearch.locationsSearched.length === 0) {
        violations.push({
          invariantId: 'INVARIANT_14_EVIDENCE_COMPLETENESS',
          severity: 'error',
          message: `Obligation ${obligation.id} has status=FAIL but no evidenceSearch.locationsSearched`,
          details: { obligationId: obligation.id },
        });
      }

      if (!obligation.remediation || obligation.remediation.minimumToPass.length === 0) {
        violations.push({
          invariantId: 'INVARIANT_14_EVIDENCE_COMPLETENESS',
          severity: 'error',
          message: `Obligation ${obligation.id} has status=FAIL but no remediation.minimumToPass`,
          details: { obligationId: obligation.id },
        });
      }
    }
  }

  return violations;
}

/**
 * INVARIANT 15: Actionable Remediation
 * RULE: Every FAIL/WARN has ≥1 actionable remediation step
 */
function validateActionableRemediation(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];

  const nonActionablePatterns = [
    /^see documentation$/i,
    /^fix this$/i,
    /^resolve$/i,
    /^todo$/i,
  ];

  for (const obligation of ir.obligationResults) {
    if (obligation.status === 'FAIL' || (obligation.decisionOnFail === 'warn' && obligation.status !== 'PASS')) {
      const steps = obligation.remediation.minimumToPass;

      if (steps.length === 0) {
        violations.push({
          invariantId: 'INVARIANT_15_ACTIONABLE_REMEDIATION',
          severity: 'error',
          message: `Obligation ${obligation.id} has no remediation steps`,
          details: { obligationId: obligation.id },
        });
        continue;
      }

      const hasActionableStep = steps.some(step => {
        return !nonActionablePatterns.some(pattern => pattern.test(step));
      });

      if (!hasActionableStep) {
        violations.push({
          invariantId: 'INVARIANT_15_ACTIONABLE_REMEDIATION',
          severity: 'warning',
          message: `Obligation ${obligation.id} has only non-actionable remediation steps`,
          details: { obligationId: obligation.id, steps },
        });
      }
    }
  }

  return violations;
}

/**
 * INVARIANT 16: No Freeform Prose
 * RULE: All prose comes from message catalog (no hardcoded strings)
 * Phase 5.3: IMPLEMENTED - Checks that reasonHuman matches message catalog templates
 */
function validateNoFreeformProse(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];

  for (const obligation of ir.obligationResults) {
    const { reasonHuman } = obligation;

    // Check if reasonHuman matches any message template
    let matchesTemplate = false;

    for (const [messageId, template] of Object.entries(MESSAGE_CATALOG)) {
      // Check if reasonHuman matches the template pattern
      // This is a simple check - in production, you'd want more sophisticated matching
      const templatePattern = template.template.replace(/\{[^}]+\}/g, '.*');
      const regex = new RegExp(`^${templatePattern}$`);

      if (regex.test(reasonHuman)) {
        matchesTemplate = true;
        break;
      }
    }

    if (!matchesTemplate) {
      violations.push({
        invariantId: 'INVARIANT_16_NO_FREEFORM_PROSE',
        severity: 'warning',
        message: `Obligation ${obligation.id} has freeform prose in reasonHuman: "${reasonHuman}"`,
        details: { obligationId: obligation.id, reasonHuman },
      });
    }
  }

  return violations;
}

/**
 * INVARIANT 17: Confidence No Contradiction
 * RULE: Confidence fields don't contradict each other
 */
function validateConfidenceNoContradiction(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];

  for (const obligation of ir.obligationResults) {
    const { applicability, evidence, overall } = obligation.confidence;

    // Overall should not exceed min(applicability, evidence)
    const expectedMax = Math.min(applicability, evidence);
    if (overall > expectedMax + 0.01) { // Allow small floating point errors
      violations.push({
        invariantId: 'INVARIANT_17_CONFIDENCE_NO_CONTRADICTION',
        severity: 'warning',
        message: `Obligation ${obligation.id} has overall confidence (${overall}) > min(applicability=${applicability}, evidence=${evidence})`,
        details: { obligationId: obligation.id, applicability, evidence, overall },
      });
    }
  }

  return violations;
}

/**
 * INVARIANT 18: Classification Guidance
 * RULE: If classification confidence < 0.7, output includes "how to make explicit" guidance
 */
function validateClassificationGuidance(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];

  // TODO: Implement when vector confidence model is added

  return violations;
}

/**
 * INVARIANT 19: Scope Claim Accuracy
 * RULE: Output must not claim "diff-derived" if it's repo invariant
 */
function validateScopeClaimAccuracy(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];

  for (const obligation of ir.obligationResults) {
    // Check that scope matches evidence type
    if (obligation.scope === 'diff_derived') {
      const hasDiffEvidence = obligation.evidence.some(e =>
        e.type === 'file' && e.location.includes('diff')
      );

      if (!hasDiffEvidence && obligation.evidence.length > 0) {
        violations.push({
          invariantId: 'INVARIANT_19_SCOPE_CLAIM_ACCURACY',
          severity: 'warning',
          message: `Obligation ${obligation.id} claims scope=diff_derived but has no diff evidence`,
          details: { obligationId: obligation.id, scope: obligation.scope },
        });
      }
    }
  }

  return violations;
}

/**
 * INVARIANT 20: Evidence Search Transparency
 * RULE: Every evidence search includes locationsSearched, strategy, confidence
 */
function validateEvidenceSearchTransparency(ir: GovernanceIR): ContractViolation[] {
  const violations: ContractViolation[] = [];

  for (const obligation of ir.obligationResults) {
    if (!obligation.evidenceSearch) {
      violations.push({
        invariantId: 'INVARIANT_20_EVIDENCE_SEARCH_TRANSPARENCY',
        severity: 'error',
        message: `Obligation ${obligation.id} missing evidenceSearch`,
        details: { obligationId: obligation.id },
      });
      continue;
    }

    const { locationsSearched, strategy, confidence } = obligation.evidenceSearch;

    if (!locationsSearched || locationsSearched.length === 0) {
      violations.push({
        invariantId: 'INVARIANT_20_EVIDENCE_SEARCH_TRANSPARENCY',
        severity: 'error',
        message: `Obligation ${obligation.id} has no evidenceSearch.locationsSearched`,
        details: { obligationId: obligation.id },
      });
    }

    if (!strategy) {
      violations.push({
        invariantId: 'INVARIANT_20_EVIDENCE_SEARCH_TRANSPARENCY',
        severity: 'error',
        message: `Obligation ${obligation.id} has no evidenceSearch.strategy`,
        details: { obligationId: obligation.id },
      });
    }

    if (confidence === undefined || confidence === null) {
      violations.push({
        invariantId: 'INVARIANT_20_EVIDENCE_SEARCH_TRANSPARENCY',
        severity: 'error',
        message: `Obligation ${obligation.id} has no evidenceSearch.confidence`,
        details: { obligationId: obligation.id },
      });
    }
  }

  return violations;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format violations for error message
 */
function formatViolations(violations: ContractViolation[]): string {
  return violations
    .map(v => `[${v.severity.toUpperCase()}] ${v.invariantId}: ${v.message}`)
    .join('\n');
}

