/**
 * Contract Integrity & Readiness - Type Definitions
 * Phase 1 Week 1-2: Contract Registry & Resolution Engine
 */

// ======================================================================
// CORE CONTRACT TYPES
// ======================================================================

export type ArtifactSystem = 'github' | 'confluence' | 'notion' | 'grafana' | 'datadog';

export type ArtifactType =
  | 'github_repo_code'
  | 'iac_terraform'
  | 'iac_pulumi'
  | 'openapi'
  | 'postman'
  | 'readme'
  | 'confluence_page'
  | 'notion_page'
  | 'grafana_dashboard'
  | 'datadog_monitor';

export type ArtifactRole = 'primary' | 'secondary' | 'reference';

export interface ArtifactRef {
  system: ArtifactSystem;
  type: ArtifactType;
  locator: {
    repo?: string;
    path?: string;
    ref?: string;
    pageId?: string;
    dashboardUid?: string;
    url?: string;
  };
  role: ArtifactRole;
  required: boolean;
  freshnessSlaHours?: number;
}

export interface Invariant {
  invariantId: string;
  name: string;
  description?: string;
  enabled: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  comparatorType: string; // 'openapi_docs_endpoint_parity' | 'runbook_deploy_matches_ci' | etc.
  config?: Record<string, any>;
}

export interface EnforcementConfig {
  mode: 'pr_gate' | 'async_notify' | 'both';
  blockOnFail: boolean;
  warnOnWarn: boolean;
  requireApprovalOverride: boolean;
}

export interface RoutingConfig {
  method: 'contract' | 'codeowners' | 'service_owner' | 'fallback';
  fallbackChannel?: string;
}

export interface WritebackConfig {
  enabled: boolean;
  autoApproveThreshold?: number;
  requiresApproval: boolean;
  targetArtifacts: ArtifactType[];
}

export interface Contract {
  contractId: string;
  name: string;
  description?: string;
  scope?: {
    service?: string;
    repo?: string;
    tags?: string[];
  };
  surfaces?: string[]; // Optional: which surfaces this contract applies to (api, infra, data_model, etc.)
  artifacts: ArtifactRef[];
  invariants: Invariant[];
  enforcement: EnforcementConfig;
  routing: RoutingConfig;
  writeback?: WritebackConfig;
  workspaceId?: string; // Optional: for database-backed contracts
  enabled?: boolean; // Optional: whether contract is active
  createdAt?: Date;
  updatedAt?: Date;
}

// ======================================================================
// CONTRACT RESOLUTION TYPES
// ======================================================================

export type ResolutionMethod =
  | 'explicit_path'        // Exact file path match (confidence: 1.0)
  | 'explicit_mapping'     // Explicit contract mapping (confidence: 1.0)
  | 'file_pattern'         // File pattern matching (confidence: 0.7-1.0)
  | 'directory_pattern'    // Directory structure matching (confidence: 0.7)
  | 'codeowners'           // CODEOWNERS-based matching (confidence: 0.75)
  | 'service_tag'          // Service tag matching (confidence: 0.6)
  | 'search';              // Full-text search (confidence: 0.5-0.7)

export interface ResolvedContract {
  contractId: string;
  resolutionMethod: ResolutionMethod;
  confidence: number;
  triggeredBy: {
    files?: string[];
    tags?: string[];
    service?: string;
    owners?: string[];     // For CODEOWNERS strategy
  };
}

export interface UnresolvedArtifact {
  file: string;
  reason: 'no_mapping' | 'low_confidence' | 'ambiguous';
  candidates?: Array<{ contractId: string; score: number }>;
}

export type ObligationType = 
  | 'NEEDS_CONTRACT_MAPPING' 
  | 'AMBIGUOUS_RESOLUTION' 
  | 'REQUIRED_ARTIFACT_MISSING';

export interface Obligation {
  type: ObligationType;
  artifact: string;
  suggestedAction: string;
}

export interface ContractResolutionResult {
  resolvedContracts: ResolvedContract[];
  unresolvedArtifacts: UnresolvedArtifact[];
  obligations: Obligation[];
}

// ======================================================================
// ARTIFACT SNAPSHOT TYPES
// ======================================================================

export interface ArtifactVersion {
  type: 'git_sha' | 'page_version' | 'dashboard_version' | 'timestamp';
  value: string;
  capturedAt: string;
}

export interface ArtifactSnapshot {
  workspaceId: string;
  id: string;
  contractId: string;
  artifactType: ArtifactType;
  artifactRef: ArtifactRef;
  version: ArtifactVersion;
  extract: any; // Type-specific structured data
  extractSchema: string;
  triggeredBy: {
    signalEventId?: string;
    prNumber?: number;
    scheduledJobId?: string;
  };
  ttlDays: number;
  compressed: boolean;
  sizeBytes: number;
  createdAt: Date;
}

// ======================================================================
// INTEGRITY FINDING TYPES
// ======================================================================

export type DriftType = 'instruction' | 'process' | 'ownership' | 'coverage' | 'environment_tooling';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type Band = 'pass' | 'warn' | 'fail';
export type RecommendedAction = 'no_action' | 'notify' | 'create_patch_candidate' | 'block_merge';

export interface EvidenceItem {
  kind: string;
  leftValue?: any; // Can be string, object, or null
  rightValue?: any; // Can be string, object, or null
  leftSnippet?: string;
  rightSnippet?: string;
  pointers?: {
    left?: string | null;
    right?: string | null;
  };
}

export interface ComparedArtifacts {
  left: {
    artifact: ArtifactRef;
    snapshotId: string;
  };
  right: {
    artifact: ArtifactRef;
    snapshotId: string;
  };
}

export interface OwnerRouting {
  method: 'contract' | 'codeowners' | 'service_owner' | 'fallback';
  owners: string[];
}

export type FindingSource = 'contract_comparator' | 'obligation_policy' | 'risk_modifier';

export interface IntegrityFinding {
  // Core identity
  workspaceId: string;
  id: string;

  // Source (NEW FIELD - distinguishes finding origin)
  source: FindingSource;

  // Contract context (optional - only for contract_comparator source)
  contractId?: string;
  invariantId?: string;

  // Classification
  driftType: DriftType;
  domains: string[];
  severity: Severity;

  // Evidence
  compared?: ComparedArtifacts; // Optional - only for contract comparators
  evidence: EvidenceItem[];
  confidence: number;
  impact: number;

  // Routing
  band: Band;
  recommendedAction: RecommendedAction;
  ownerRouting: OwnerRouting;

  // Links (NEW FIELDS - for DeltaSync compatibility)
  driftCandidateId?: string;
  affectedFiles: string[];
  suggestedDocs: string[];

  createdAt: Date;
}

// ======================================================================
// COMPARATOR TYPES
// ======================================================================

export interface ComparatorInput {
  invariant: Invariant;
  leftSnapshot: ArtifactSnapshot;
  rightSnapshot: ArtifactSnapshot;
  context: {
    workspaceId: string;
    contractId: string;
    signalEventId: string;
    service?: string;
    repo?: string;
  };
}

export interface ComparatorResult {
  invariantId: string;
  evaluated: boolean;
  skippedReason?: 'not_applicable' | 'artifacts_missing' | 'low_confidence' | 'disabled';
  findings: IntegrityFinding[];
  coverage: {
    artifactsChecked: string[];
    artifactsSkipped: string[];
    completeness: number;
  };
}

// ======================================================================
// FETCH CONTEXT TYPES
// ======================================================================

export interface FetchContext {
  workspaceId: string;
  contractId: string;
  signalEventId: string;
  prNumber?: number;
  baseSha?: string;
  headSha?: string;
}

export interface FetchError {
  code: string;
  message: string;
  retryable: boolean;
}

export type FetchStatus = 'success' | 'not_found' | 'unauthorized' | 'rate_limited' | 'timeout' | 'error';

export interface ArtifactFetchResult {
  artifact: ArtifactRef;
  status: FetchStatus;
  snapshot?: ArtifactSnapshot;
  error?: FetchError;
}

