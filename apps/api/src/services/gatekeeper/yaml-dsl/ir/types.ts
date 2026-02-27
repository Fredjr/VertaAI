/**
 * Governance IR (Intermediate Representation) Types
 * 
 * This module defines the canonical IR that every policy pack evaluation must produce.
 * These types are ADDITIVE - they extend the existing evaluation model without replacing it.
 * 
 * Core Principle: Packs produce data (IR), never formatting. Rendering is deterministic
 * and adaptive based on IR.
 */

/**
 * RunContext: Complete context of a single evaluation run
 * Captures repo, PR, detected signals, and confidence breakdown
 */
export interface RunContext {
  // Repository identifiers
  repo: {
    owner: string;
    name: string;
    fullName: string; // "owner/repo"
  };
  
  // PR/Branch context
  pr: {
    number: number;
    title: string;
    branch: string;
    baseBranch: string;
    headSha: string;
    baseSha?: string;
    author: string;
    isDraft: boolean;
  };
  
  // Workspace context
  workspace: {
    id: string;
    installationId: number;
  };
  
  // Detected signals (classification/applicability)
  signals: DetectedSignals;
  
  // Confidence breakdown (classification vs decision)
  confidence: ConfidenceBreakdown;
  
  // Timestamp
  evaluatedAt: string; // ISO 8601
}

/**
 * DetectedSignals: All signals detected in the PR/repo
 * Used for pack activation, overlay selection, and confidence scoring
 */
export interface DetectedSignals {
  // File-based signals
  filesPresent: string[]; // e.g., ["package.json", "openapi.yaml"]
  manifestTypes: string[]; // e.g., ["npm", "openapi"]
  
  // Language/framework signals
  languages: { language: string; percentage: number }[];
  frameworks: string[]; // e.g., ["express", "react"]
  
  // Service catalog signals
  serviceCatalog?: {
    name: string;
    tier: 'tier-1' | 'tier-2' | 'tier-3';
    owner: string;
    source: 'catalog-info.yaml' | 'service.yaml' | 'inferred';
  };
  
  // Operational signals
  hasRunbook: boolean;
  hasSLO: boolean;
  hasAlerts: boolean;
  
  // Build system signals
  buildSystem?: 'npm' | 'maven' | 'gradle' | 'cargo' | 'go' | 'unknown';
  
  // API signals
  hasOpenAPI: boolean;
  hasGraphQL: boolean;
  hasProto: boolean;
  
  // Database signals
  hasMigrations: boolean;
  hasORM: boolean;
}

/**
 * ConfidenceBreakdown: Separates classification confidence from decision confidence
 * This is critical for the "two-orthogonal-outcome model"
 */
export interface ConfidenceBreakdown {
  // Classification confidence (repo type)
  classification: {
    repoType: 'service' | 'library' | 'docs' | 'monorepo' | 'unknown';
    confidence: number; // 0-1
    source: 'explicit' | 'inferred';
    evidence: string[]; // e.g., ["Found service catalog", "Has API endpoints"]
  };
  
  // Tier confidence (service tier)
  tier?: {
    tier: 'tier-1' | 'tier-2' | 'tier-3' | 'unknown';
    confidence: number; // 0-1
    source: 'catalog' | 'slo' | 'inferred';
    evidence: string[];
  };
  
  // Decision confidence (evidence quality)
  decision: {
    confidence: number; // 0-1
    basis: 'deterministic_baseline' | 'diff_analysis' | 'heuristic';
    degradationReasons: string[]; // e.g., ["Missing artifact registry"]
  };
}

/**
 * PolicyPlan: Records which packs/overlays were selected and why
 * This is the "activation ledger" that makes governance transparent
 */
export interface PolicyPlan {
  // Base pack(s)
  basePacks: PackActivation[];
  
  // Overlays (activated or suppressed)
  overlays: OverlayActivation[];
  
  // Obligations partitioned by status
  obligations: {
    enforced: string[]; // obligation IDs
    suppressed: string[]; // obligation IDs
    informational: string[]; // obligation IDs
    notEvaluable: string[]; // obligation IDs
  };
  
  // Activation ledger (source of truth)
  activationLedger: ActivationRecord[];
  
  // Merge strategy used
  mergeStrategy: 'MOST_RESTRICTIVE' | 'HIGHEST_PRIORITY' | 'EXPLICIT';
}

export interface PackActivation {
  packId: string;
  packName: string;
  version: string;
  packType: 'BASELINE' | 'SERVICE_OVERLAY' | 'CUSTOM';
  scopeType: 'workspace' | 'service' | 'repo';
  scopeRef?: string;
  priority: number;
  reason: string; // "Base governance pack for all repos"
}

export interface OverlayActivation {
  overlayId: string;
  overlayName: string;
  status: 'activated' | 'suppressed';
  reason: string; // "Detected OpenAPI schema" | "Not a service repo"
  howToActivate?: string; // For suppressed overlays
  signals: string[]; // Signals that triggered/suppressed this overlay
}

export interface ActivationRecord {
  packOrOverlayId: string;
  packOrOverlayName: string;
  status: 'activated' | 'suppressed';
  reason: string;
  timestamp: string; // ISO 8601
}

/**
 * ObligationResult: Result of evaluating a single obligation
 * This is the canonical format for all obligation evaluations
 */
export interface ObligationResult {
  // Identity
  id: string;
  title: string;
  controlObjective: string; // "Ensure API changes are documented"

  // Scope
  scope: 'repo_invariant' | 'diff_derived' | 'environment_gate';

  // Decision
  decisionOnFail: 'block' | 'warn' | 'pass';
  status: 'PASS' | 'FAIL' | 'SUPPRESSED' | 'NOT_EVALUABLE' | 'INFO';

  // Reason (structured)
  reasonCode: ReasonCode;
  reasonHuman: string; // Human-readable

  // Evidence (typed)
  evidence: EvidenceItem[];
  evidenceSearch?: {
    locationsSearched: string[];
    patternsUsed: string[];
    closestMatches?: string[];
  };

  // Remediation (structured)
  remediation: {
    minimumToPass: string[]; // Step-by-step
    patch?: string; // Copy-pasteable
    links?: string[]; // Documentation
    owner?: { team: string; contact: string };
  };

  // Risk (structured breakdown)
  risk: RiskScore;

  // Confidence (per obligation)
  confidence: {
    applicability: number; // 0-1 (should this run?)
    evidence: number; // 0-1 (did we find what we looked for?)
    overall: number; // 0-1 (combined)
  };
}

/**
 * ReasonCode: Enumerated reason codes for obligation failures
 * This enables structured analysis and grouping
 */
export enum ReasonCode {
  // File-based
  FILE_MISSING = 'FILE_MISSING',
  FILE_INVALID = 'FILE_INVALID',
  FILE_OUTDATED = 'FILE_OUTDATED',

  // Content-based
  CONTENT_MISSING = 'CONTENT_MISSING',
  CONTENT_INVALID = 'CONTENT_INVALID',
  CONTENT_INCOMPLETE = 'CONTENT_INCOMPLETE',

  // Parity-based
  PARITY_VIOLATION = 'PARITY_VIOLATION',
  BREAKING_CHANGE = 'BREAKING_CHANGE',

  // Approval-based
  APPROVAL_MISSING = 'APPROVAL_MISSING',
  APPROVAL_INSUFFICIENT = 'APPROVAL_INSUFFICIENT',

  // Check-based
  CHECK_FAILED = 'CHECK_FAILED',
  CHECK_MISSING = 'CHECK_MISSING',

  // Artifact-based
  ARTIFACT_MISSING = 'ARTIFACT_MISSING',
  ARTIFACT_OUTDATED = 'ARTIFACT_OUTDATED',

  // Unknown
  UNKNOWN = 'UNKNOWN',
}

/**
 * EvidenceItem: Typed evidence for obligation evaluation
 */
export interface EvidenceItem {
  type: 'file' | 'content' | 'checkrun' | 'approval' | 'artifact' | 'api_call';
  location: string; // File path, URL, or identifier
  found: boolean;
  details?: string;
  metadata?: Record<string, any>;
}

/**
 * RiskScore: Structured risk breakdown
 * Total = blastRadius + criticality + immediacy + dependency (max 100)
 */
export interface RiskScore {
  total: number; // 0-100
  breakdown: {
    blastRadius: number; // 0-30 (how many people/systems affected)
    criticality: number; // 0-30 (how important is this)
    immediacy: number; // 0-20 (how urgent is this)
    dependency: number; // 0-20 (does this block other work)
  };
  reasons: {
    blastRadius: string;
    criticality: string;
    immediacy: string;
    dependency: string;
  };
}

/**
 * GovernanceOutputContract (GOC): Strict schema for rendered output
 * This contract is validated before every render to catch regressions
 */
export interface GovernanceOutputContract {
  // INVARIANT 1: Counting Consistency
  counts: {
    considered: number;
    enforced: number;
    suppressed: number;
    notEvaluable: number;
    informational: number;
  };
  // RULE: considered = enforced + suppressed + notEvaluable + informational

  // INVARIANT 2: Decision Basis
  decision: {
    global: 'PASS' | 'WARN' | 'BLOCK';
    basis: 'enforced_obligations_only'; // Never includes suppressed
    robustness: 'deterministic_baseline' | 'diff_analysis' | 'heuristic';
  };

  // INVARIANT 3: Confidence Display
  confidence: {
    decision: number; // 0-1 (evidence quality)
    classification: number; // 0-1 (repo type certainty)
    // RULE: Never compute "Overall Confidence" unless justified
  };

  // INVARIANT 4: Evidence Completeness
  // RULE: Every FAIL/WARN must include:
  failedObligations: Array<{
    id: string;
    reasonCode: ReasonCode;
    evidenceLocationsSearched: string[];
    minimumToPassSteps: string[];
  }>;

  // INVARIANT 5: Scope Consistency
  // RULE: If only repo_invariant exists → suppress "Change Surface Summary"
  scopes: {
    hasRepoInvariant: boolean;
    hasDiffDerived: boolean;
    hasEnvironmentGate: boolean;
  };
}

/**
 * ContractViolation: Describes a GOC violation
 */
export interface ContractViolation {
  invariant: string; // e.g., "INVARIANT_1_COUNTING_CONSISTENCY"
  severity: 'error' | 'warning';
  message: string;
  expected: any;
  actual: any;
}

