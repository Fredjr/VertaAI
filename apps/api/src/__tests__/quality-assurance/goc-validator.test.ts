/**
 * GOC (Governance Output Contract) Validator Tests
 * 
 * Tests the 5 runtime invariants to ensure systematic consistency.
 */

import { describe, it, expect } from 'vitest';
import { validateGovernanceOutputContract, buildGovernanceOutputContract } from '../../services/gatekeeper/yaml-dsl/ir/contractValidator.js';
import type { GovernanceOutputContract, RunContext, PolicyPlan, ObligationResult } from '../../services/gatekeeper/yaml-dsl/ir/types.js';
import { ReasonCode } from '../../services/gatekeeper/yaml-dsl/ir/types.js';

describe('GOC Validator: INVARIANT 1 - Counting Consistency', () => {
  it('should pass when counting model is correct', () => {
    const contract: GovernanceOutputContract = {
      counts: {
        considered: 10,
        enforced: 6,
        suppressed: 2,
        notEvaluable: 1,
        informational: 1,
      },
      decision: {
        global: 'PASS',
        basis: 'enforced_obligations_only',
        robustness: 'deterministic_baseline',
      },
      confidence: {
        decision: 0.95,
        classification: 0.9,
      },
      failedObligations: [],
      scopes: {
        hasRepoInvariant: true,
        hasDiffDerived: false,
        hasEnvironmentGate: false,
      },
    };

    const result = validateGovernanceOutputContract(contract, { mode: 'audit' });
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should fail when counting model is violated', () => {
    const contract: GovernanceOutputContract = {
      counts: {
        considered: 10, // Wrong! Should be 9
        enforced: 6,
        suppressed: 2,
        notEvaluable: 1,
        informational: 0,
      },
      decision: {
        global: 'PASS',
        basis: 'enforced_obligations_only',
        robustness: 'deterministic_baseline',
      },
      confidence: {
        decision: 0.95,
        classification: 0.9,
      },
      failedObligations: [],
      scopes: {
        hasRepoInvariant: true,
        hasDiffDerived: false,
        hasEnvironmentGate: false,
      },
    };

    const result = validateGovernanceOutputContract(contract, { mode: 'audit' });
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].invariant).toBe('INVARIANT_1_COUNTING_CONSISTENCY');
  });
});

describe('GOC Validator: INVARIANT 2 - Decision Basis', () => {
  it('should pass when decision basis is correct', () => {
    const contract: GovernanceOutputContract = {
      counts: {
        considered: 5,
        enforced: 5,
        suppressed: 0,
        notEvaluable: 0,
        informational: 0,
      },
      decision: {
        global: 'PASS',
        basis: 'enforced_obligations_only',
        robustness: 'deterministic_baseline',
      },
      confidence: {
        decision: 0.95,
        classification: 0.9,
      },
      failedObligations: [],
      scopes: {
        hasRepoInvariant: true,
        hasDiffDerived: false,
        hasEnvironmentGate: false,
      },
    };

    const result = validateGovernanceOutputContract(contract, { mode: 'audit' });
    expect(result.valid).toBe(true);
  });

  it('should fail when decision basis is incorrect', () => {
    const contract: GovernanceOutputContract = {
      counts: {
        considered: 5,
        enforced: 5,
        suppressed: 0,
        notEvaluable: 0,
        informational: 0,
      },
      decision: {
        global: 'PASS',
        basis: 'all_obligations' as any, // Wrong!
        robustness: 'deterministic_baseline',
      },
      confidence: {
        decision: 0.95,
        classification: 0.9,
      },
      failedObligations: [],
      scopes: {
        hasRepoInvariant: true,
        hasDiffDerived: false,
        hasEnvironmentGate: false,
      },
    };

    const result = validateGovernanceOutputContract(contract, { mode: 'audit' });
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.invariant === 'INVARIANT_2_DECISION_BASIS')).toBe(true);
  });
});

describe('GOC Validator: INVARIANT 3 - Confidence Display', () => {
  it('should pass when confidence scores are in valid range', () => {
    const contract: GovernanceOutputContract = {
      counts: {
        considered: 5,
        enforced: 5,
        suppressed: 0,
        notEvaluable: 0,
        informational: 0,
      },
      decision: {
        global: 'PASS',
        basis: 'enforced_obligations_only',
        robustness: 'deterministic_baseline',
      },
      confidence: {
        decision: 0.95,
        classification: 0.9,
      },
      failedObligations: [],
      scopes: {
        hasRepoInvariant: true,
        hasDiffDerived: false,
        hasEnvironmentGate: false,
      },
    };

    const result = validateGovernanceOutputContract(contract, { mode: 'audit' });
    expect(result.valid).toBe(true);
  });

  it('should fail when confidence scores are out of range', () => {
    const contract: GovernanceOutputContract = {
      counts: {
        considered: 5,
        enforced: 5,
        suppressed: 0,
        notEvaluable: 0,
        informational: 0,
      },
      decision: {
        global: 'PASS',
        basis: 'enforced_obligations_only',
        robustness: 'deterministic_baseline',
      },
      confidence: {
        decision: 1.5, // Out of range!
        classification: 0.9,
      },
      failedObligations: [],
      scopes: {
        hasRepoInvariant: true,
        hasDiffDerived: false,
        hasEnvironmentGate: false,
      },
    };

    const result = validateGovernanceOutputContract(contract, { mode: 'audit' });
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.invariant === 'INVARIANT_3_CONFIDENCE_DISPLAY')).toBe(true);
  });
});

describe('GOC Validator: INVARIANT 4 - Evidence Completeness', () => {
  it('should pass when all failed obligations have complete evidence', () => {
    const contract: GovernanceOutputContract = {
      counts: {
        considered: 5,
        enforced: 5,
        suppressed: 0,
        notEvaluable: 0,
        informational: 0,
      },
      decision: {
        global: 'BLOCK',
        basis: 'enforced_obligations_only',
        robustness: 'deterministic_baseline',
      },
      confidence: {
        decision: 0.95,
        classification: 0.9,
      },
      failedObligations: [
        {
          id: 'obl-1',
          reasonCode: ReasonCode.FILE_MISSING,
          evidenceLocationsSearched: ['openapi.yaml', 'openapi.yml'],
          minimumToPassSteps: ['Create openapi.yaml file'],
        },
      ],
      scopes: {
        hasRepoInvariant: true,
        hasDiffDerived: false,
        hasEnvironmentGate: false,
      },
    };

    const result = validateGovernanceOutputContract(contract, { mode: 'audit' });
    expect(result.valid).toBe(true);
  });

  it('should fail when failed obligations are missing evidence', () => {
    const contract: GovernanceOutputContract = {
      counts: {
        considered: 5,
        enforced: 5,
        suppressed: 0,
        notEvaluable: 0,
        informational: 0,
      },
      decision: {
        global: 'BLOCK',
        basis: 'enforced_obligations_only',
        robustness: 'deterministic_baseline',
      },
      confidence: {
        decision: 0.95,
        classification: 0.9,
      },
      failedObligations: [
        {
          id: 'obl-1',
          reasonCode: ReasonCode.FILE_MISSING,
          evidenceLocationsSearched: [], // Missing!
          minimumToPassSteps: [], // Missing!
        },
      ],
      scopes: {
        hasRepoInvariant: true,
        hasDiffDerived: false,
        hasEnvironmentGate: false,
      },
    };

    const result = validateGovernanceOutputContract(contract, { mode: 'audit' });
    expect(result.valid).toBe(false);
    expect(result.violations.filter(v => v.invariant === 'INVARIANT_4_EVIDENCE_COMPLETENESS').length).toBeGreaterThan(0);
  });
});

describe('GOC Validator: INVARIANT 5 - Scope Consistency', () => {
  it('should pass when at least one scope is present', () => {
    const contract: GovernanceOutputContract = {
      counts: {
        considered: 5,
        enforced: 5,
        suppressed: 0,
        notEvaluable: 0,
        informational: 0,
      },
      decision: {
        global: 'PASS',
        basis: 'enforced_obligations_only',
        robustness: 'deterministic_baseline',
      },
      confidence: {
        decision: 0.95,
        classification: 0.9,
      },
      failedObligations: [],
      scopes: {
        hasRepoInvariant: true,
        hasDiffDerived: false,
        hasEnvironmentGate: false,
      },
    };

    const result = validateGovernanceOutputContract(contract, { mode: 'audit' });
    expect(result.valid).toBe(true);
  });
});

describe('GOC Builder: buildGovernanceOutputContract', () => {
  it('should build a valid contract from IR entities', () => {
    // Create minimal IR entities
    const runContext: RunContext = {
      repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
      pr: { number: 1, title: 'Test PR', branch: 'main', baseBranch: 'main', headSha: 'abc123', author: 'test', isDraft: false },
      workspace: { id: 'ws-1', installationId: 123 },
      signals: {
        filesPresent: [],
        manifestTypes: [],
        languages: [],
        frameworks: [],
        hasRunbook: false,
        hasSLO: false,
        hasAlerts: false,
        buildSystem: 'unknown',
        hasOpenAPI: false,
        hasGraphQL: false,
        hasProto: false,
        hasMigrations: false,
        hasORM: false,
      },
      confidence: {
        classification: { repoType: 'service', confidence: 0.9, source: 'explicit', evidence: [] },
        decision: { confidence: 0.95, basis: 'deterministic_baseline', degradationReasons: [] },
      },
      evaluatedAt: new Date().toISOString(),
    };

    const policyPlan: PolicyPlan = {
      basePacks: [],
      overlays: [],
      obligations: { enforced: [], suppressed: [], informational: [], notEvaluable: [] },
      activationLedger: [],
      mergeStrategy: 'MOST_RESTRICTIVE',
    };

    const obligationResults: ObligationResult[] = [
      {
        id: 'obl-1',
        title: 'Test obligation',
        controlObjective: 'Test',
        scope: 'repo_invariant',
        decisionOnFail: 'block',
        status: 'PASS',
        reasonCode: ReasonCode.PASS,
        reasonHuman: 'Passed',
        evidence: [],
        remediation: { minimumToPass: [] },
        risk: {
          total: 50,
          breakdown: { blastRadius: 15, criticality: 15, immediacy: 10, dependency: 10 },
          reasons: { blastRadius: '', criticality: '', immediacy: '', dependency: '' },
        },
        confidence: { applicability: 1.0, evidence: 1.0, overall: 1.0 },
      },
    ];

    const contract = buildGovernanceOutputContract(runContext, policyPlan, obligationResults);
    const result = validateGovernanceOutputContract(contract, { mode: 'audit' });

    expect(result.valid).toBe(true);
    expect(contract.counts.considered).toBe(1);
    expect(contract.counts.enforced).toBe(1);
    expect(contract.decision.global).toBe('PASS');
  });
});

