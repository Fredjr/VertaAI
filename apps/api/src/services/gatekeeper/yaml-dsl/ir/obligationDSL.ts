/**
 * Obligation DSL - Fluent API for Creating Structured Obligations
 * 
 * Phase 4: Enable comparators to produce structured IR directly
 * 
 * Usage:
 * ```typescript
 * return createObligation({
 *   id: 'artifact-present-openapi',
 *   title: 'OpenAPI Specification Present',
 *   controlObjective: 'Ensure API contracts are documented',
 *   scope: 'repo_invariant',
 *   decisionOnFail: 'block'
 * })
 * .fail({
 *   reasonCode: 'ARTIFACT_MISSING',
 *   reasonHuman: 'OpenAPI specification not found',
 *   evidence: [...],
 *   remediation: {...},
 *   risk: {...}
 * });
 * ```
 */

import type {
  ObligationResult,
  EvidenceItem,
  Remediation,
  RiskScore,
  ReasonCode,
  ObligationScope,
  ObligationStatus,
} from './types.js';

// ============================================================================
// Builder Interface
// ============================================================================

export interface ObligationParams {
  id: string;
  title: string;
  controlObjective: string;
  scope: ObligationScope;
  decisionOnFail: 'block' | 'warn' | 'pass';
}

export interface FailParams {
  reasonCode: ReasonCode;
  reasonHuman: string;
  evidence: EvidenceItem[];
  remediation: Remediation;
  risk: RiskScore;
  evidenceSearch?: ObligationResult['evidenceSearch'];
  confidence?: ObligationResult['confidence'];
}

// ============================================================================
// Obligation Builder
// ============================================================================

export class ObligationBuilder {
  private base: ObligationParams;

  constructor(params: ObligationParams) {
    this.base = params;
  }

  /**
   * Mark obligation as PASS
   */
  pass(reason: string = 'All checks passed'): ObligationResult {
    return {
      ...this.base,
      status: 'PASS',
      reasonCode: 'PASS',
      reasonHuman: reason,
      evidence: [],
      evidenceSearch: {
        locationsSearched: [],
        strategy: 'not_applicable',
        confidence: 1.0,
      },
      remediation: {
        minimumToPass: [],
        patch: null,
        links: [],
        owner: null,
      },
      risk: {
        total: 0,
        breakdown: {
          blastRadius: 0,
          criticality: 0,
          immediacy: 0,
          dependency: 0,
        },
        reasons: {
          blastRadius: null,
          criticality: null,
          immediacy: null,
          dependency: null,
        },
      },
      confidence: {
        applicability: 1.0,
        evidence: 1.0,
        overall: 1.0,
      },
    };
  }

  /**
   * Mark obligation as FAIL with structured details
   */
  fail(params: FailParams): ObligationResult {
    return {
      ...this.base,
      status: 'FAIL',
      reasonCode: params.reasonCode,
      reasonHuman: params.reasonHuman,
      evidence: params.evidence,
      evidenceSearch: params.evidenceSearch || {
        locationsSearched: params.evidence.map(e => e.location),
        strategy: 'file_presence',
        confidence: 1.0,
      },
      remediation: params.remediation,
      risk: params.risk,
      confidence: params.confidence || {
        applicability: 1.0,
        evidence: 1.0,
        overall: 1.0,
      },
    };
  }

  /**
   * Mark obligation as NOT_EVALUABLE (policy quality issue)
   */
  notEvaluable(reason: string, category: 'policy_misconfig' | 'missing_external_evidence' | 'integration_error' = 'policy_misconfig'): ObligationResult {
    return {
      ...this.base,
      status: 'NOT_EVALUABLE',
      reasonCode: 'NOT_EVALUABLE',
      reasonHuman: reason,
      evidence: [],
      evidenceSearch: {
        locationsSearched: [],
        strategy: 'not_applicable',
        confidence: 0.0,
      },
      remediation: {
        minimumToPass: [`Fix policy configuration: ${reason}`],
        patch: null,
        links: [],
        owner: 'platform-team',
      },
      risk: {
        total: 0,
        breakdown: {
          blastRadius: 0,
          criticality: 0,
          immediacy: 0,
          dependency: 0,
        },
        reasons: {
          blastRadius: null,
          criticality: null,
          immediacy: null,
          dependency: null,
        },
      },
      confidence: {
        applicability: 0.0,
        evidence: 0.0,
        overall: 0.0,
      },
    };
  }

  /**
   * Mark obligation as SUPPRESSED (overlay suppression)
   */
  suppressed(reason: string): ObligationResult {
    return {
      ...this.base,
      status: 'SUPPRESSED',
      reasonCode: 'SUPPRESSED_BY_OVERLAY',
      reasonHuman: reason,
      evidence: [],
      evidenceSearch: {
        locationsSearched: [],
        strategy: 'not_applicable',
        confidence: 1.0,
      },
      remediation: {
        minimumToPass: [],
        patch: null,
        links: [],
        owner: null,
      },
      risk: {
        total: 0,
        breakdown: {
          blastRadius: 0,
          criticality: 0,
          immediacy: 0,
          dependency: 0,
        },
        reasons: {
          blastRadius: null,
          criticality: null,
          immediacy: null,
          dependency: null,
        },
      },
      confidence: {
        applicability: 1.0,
        evidence: 1.0,
        overall: 1.0,
      },
    };
  }

  /**
   * Mark obligation as INFO (informational only)
   */
  info(message: string): ObligationResult {
    return {
      ...this.base,
      status: 'INFO',
      reasonCode: 'INFO',
      reasonHuman: message,
      evidence: [],
      evidenceSearch: {
        locationsSearched: [],
        strategy: 'not_applicable',
        confidence: 1.0,
      },
      remediation: {
        minimumToPass: [],
        patch: null,
        links: [],
        owner: null,
      },
      risk: {
        total: 0,
        breakdown: {
          blastRadius: 0,
          criticality: 0,
          immediacy: 0,
          dependency: 0,
        },
        reasons: {
          blastRadius: null,
          criticality: null,
          immediacy: null,
          dependency: null,
        },
      },
      confidence: {
        applicability: 1.0,
        evidence: 1.0,
        overall: 1.0,
      },
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new obligation builder
 *
 * @example
 * ```typescript
 * const obligation = createObligation({
 *   id: 'artifact-present-openapi',
 *   title: 'OpenAPI Specification Present',
 *   controlObjective: 'Ensure API contracts are documented',
 *   scope: 'repo_invariant',
 *   decisionOnFail: 'block'
 * }).fail({
 *   reasonCode: 'ARTIFACT_MISSING',
 *   reasonHuman: 'OpenAPI specification not found',
 *   evidence: [...],
 *   remediation: {...},
 *   risk: {...}
 * });
 * ```
 */
export function createObligation(params: ObligationParams): ObligationBuilder {
  return new ObligationBuilder(params);
}

// ============================================================================
// Helper Functions for Common Patterns
// ============================================================================

/**
 * Create evidence item for missing file
 */
export function missingFileEvidence(path: string, context?: string): EvidenceItem {
  return {
    location: path,
    found: false,
    value: null,
    context: context || `File not found: ${path}`,
  };
}

/**
 * Create evidence item for present file
 */
export function presentFileEvidence(path: string, snippet?: string): EvidenceItem {
  return {
    location: path,
    found: true,
    value: snippet || 'File exists',
    context: null,
  };
}

/**
 * Create evidence item for file content mismatch
 */
export function mismatchEvidence(path: string, expected: string, actual: string): EvidenceItem {
  return {
    location: path,
    found: true,
    value: actual,
    context: `Expected: ${expected}, Found: ${actual}`,
  };
}

/**
 * Calculate risk score for artifact-related obligations
 */
export function calculateArtifactRisk(params: {
  isBlocking: boolean;
  affectsAPI: boolean;
  affectsDeployment: boolean;
  hasDownstreamDeps: boolean;
}): RiskScore {
  const { isBlocking, affectsAPI, affectsDeployment, hasDownstreamDeps } = params;

  const blastRadius = affectsAPI ? 30 : affectsDeployment ? 20 : 10;
  const criticality = isBlocking ? 25 : 15;
  const immediacy = affectsDeployment ? 20 : 10;
  const dependency = hasDownstreamDeps ? 10 : 5;

  return {
    total: blastRadius + criticality + immediacy + dependency,
    breakdown: {
      blastRadius,
      criticality,
      immediacy,
      dependency,
    },
    reasons: {
      blastRadius: affectsAPI ? 'API changes affect all consumers' : affectsDeployment ? 'Deployment changes affect production' : 'Limited blast radius',
      criticality: isBlocking ? 'Blocking issue prevents merge' : 'Non-blocking warning',
      immediacy: affectsDeployment ? 'Affects deployment pipeline' : 'No immediate impact',
      dependency: hasDownstreamDeps ? 'Has downstream dependencies' : 'No known dependencies',
    },
  };
}

/**
 * Create remediation for missing artifact
 */
export function missingArtifactRemediation(params: {
  artifactType: string;
  suggestedPath: string;
  docsLink?: string;
  owner?: string;
}): Remediation {
  return {
    minimumToPass: [
      `Add ${params.artifactType} file at ${params.suggestedPath}`,
      `Ensure ${params.artifactType} follows required schema`,
    ],
    patch: null,
    links: params.docsLink ? [params.docsLink] : [],
    owner: params.owner || null,
  };
}

/**
 * Create remediation for outdated artifact
 */
export function outdatedArtifactRemediation(params: {
  artifactType: string;
  path: string;
  requiredChanges: string[];
  docsLink?: string;
  owner?: string;
}): Remediation {
  return {
    minimumToPass: [
      `Update ${params.artifactType} at ${params.path}`,
      ...params.requiredChanges,
    ],
    patch: null,
    links: params.docsLink ? [params.docsLink] : [],
    owner: params.owner || null,
  };
}

