/**
 * Agent Governance Type Definitions
 * Phase 0: Foundation for Spec–Build–Run Triangle Verification
 * 
 * These types support the Intent Artifact and Agent Action Trace models
 * for governing agent-authored code changes.
 */

// ======================================================================
// AUTHOR TYPES
// ======================================================================

export type AuthorType = 'HUMAN' | 'AGENT' | 'UNKNOWN';

export interface AgentIdentity {
  id: string; // e.g., "cursor", "copilot", "replit-agent"
  version: string; // e.g., "v1.2.3"
  platform?: string; // e.g., "vscode", "jetbrains", "web"
}

// ======================================================================
// CAPABILITY LATTICE
// ======================================================================

export type CapabilityType =
  | 'db_read'
  | 'db_write'
  | 'db_admin'
  | 's3_read'
  | 's3_write'
  | 's3_delete'
  | 'api_endpoint'
  | 'iam_modify'
  | 'infra_create'
  | 'infra_modify'
  | 'infra_delete'
  | 'secret_read'
  | 'secret_write'
  | 'network_public'
  | 'network_private'
  | 'cost_increase'
  | 'schema_modify'
  | 'deployment_modify';

export interface Capability {
  type: CapabilityType;
  resource: string; // e.g., "users_table", "uploads_bucket", "POST:/api/users"
  scope?: string; // e.g., "read-only", "admin", "least-privilege"
  justification?: string;
}

// ======================================================================
// CONSTRAINTS
// ======================================================================

export interface Constraints {
  read_only?: boolean;
  no_new_infra?: boolean;
  least_privilege?: boolean;
  max_cost_increase?: string; // e.g., "$100/month"
  no_schema_changes?: boolean;
  no_public_endpoints?: boolean;
  require_tests?: boolean;
  require_docs?: boolean;
}

// ======================================================================
// EXPECTED SIDE EFFECTS
// ======================================================================

export interface ExpectedSideEffects {
  creates_table?: boolean;
  modifies_schema?: boolean;
  changes_permissions?: boolean;
  adds_dependencies?: string[]; // e.g., ["prisma@5.0", "aws-sdk@3.0"]
  creates_infra?: string[]; // e.g., ["s3_bucket", "lambda_function"]
  modifies_api?: string[]; // e.g., ["POST:/api/users", "DELETE:/api/posts"]
  increases_cost?: string; // e.g., "$50/month"
}

// ======================================================================
// RISK ACKNOWLEDGEMENTS
// ======================================================================

export interface RiskAcknowledgement {
  type: string; // e.g., "schema_change", "privilege_expansion", "cost_increase"
  justification: string;
  approved_by: string; // e.g., "@tech-lead", "security-team"
  approved_at?: string; // ISO timestamp
  approval_tier?: 'tier-1' | 'tier-2' | 'tier-3';
}

// ======================================================================
// LINKS TO EXTERNAL ARTIFACTS
// ======================================================================

export interface ExternalLinks {
  ticket?: string; // e.g., "JIRA-1234", "LINEAR-567"
  design_doc?: string; // URL
  prd?: string; // URL
  runbook?: string; // URL
  slack_thread?: string; // URL
}

// ======================================================================
// SIGNATURE/APPROVAL
// ======================================================================

export interface SignatureInfo {
  signed_by: string; // e.g., "@tech-lead", "security-team"
  signed_at: string; // ISO timestamp
  approval_tier: 'tier-1' | 'tier-2' | 'tier-3';
  approval_method: 'manual' | 'automated' | 'policy-based';
  signature_hash?: string; // SHA-256 hash for audit trail
}

// ======================================================================
// INTENT ARTIFACT
// ======================================================================

export interface IntentArtifact {
  id: string;
  workspaceId: string;
  prNumber: number;
  repoFullName: string;
  
  // Author metadata
  author: string;
  authorType: AuthorType;
  agentIdentity?: string; // JSON string of AgentIdentity
  
  // Structured claims
  requestedCapabilities: Capability[];
  constraints: Constraints;
  affectedServices: string[];
  expectedSideEffects: ExpectedSideEffects;
  riskAcknowledgements: RiskAcknowledgement[];
  
  // Links
  links?: ExternalLinks;
  
  // Signature
  signature?: SignatureInfo;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

// ======================================================================
// AGENT ACTION TRACE
// ======================================================================

export type ToolCallStatus = 'success' | 'error' | 'timeout' | 'cancelled';

export interface ToolCall {
  tool: string; // e.g., "file_edit", "terminal_command", "api_call"
  args: Record<string, unknown>; // Tool-specific arguments
  result?: unknown; // Tool-specific result
  status: ToolCallStatus;
  timestamp: string; // ISO timestamp
  duration_ms?: number;
  error?: string;
}

export type FileChangeType = 'created' | 'modified' | 'deleted' | 'renamed';

export interface FileChange {
  path: string;
  changeType: FileChangeType;
  linesAdded: number;
  linesDeleted: number;
  hunks?: number; // Number of change hunks
  language?: string; // Programming language
  complexity_delta?: number; // Change in cyclomatic complexity
}

export type ExternalActionType =
  | 'api_call'
  | 'db_query'
  | 'shell_command'
  | 'package_install'
  | 'git_operation'
  | 'cloud_api_call';

export interface ExternalAction {
  type: ExternalActionType;
  target: string; // e.g., "https://api.github.com", "postgres://...", "npm install"
  method?: string; // e.g., "GET", "POST", "SELECT", "INSERT"
  timestamp: string; // ISO timestamp
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface RuntimeEffect {
  type: string; // e.g., "permission_change", "resource_created", "cost_increase"
  description: string;
  observed_at: string; // ISO timestamp
  severity: 'low' | 'medium' | 'high' | 'critical';
  evidence?: Record<string, unknown>;
}

export interface AgentActionTrace {
  id: string;
  workspaceId: string;
  prNumber: number;
  repoFullName: string;

  // Agent identity
  agentId: string;
  agentVersion: string;

  // Action traces
  toolCalls: ToolCall[];
  filesModified: FileChange[];
  externalActions: ExternalAction[];
  runtimeEffects: RuntimeEffect[];

  // Metadata
  createdAt: Date;
}

// ======================================================================
// INTENT ARTIFACT INGESTION
// ======================================================================

export type IntentArtifactSource =
  | 'pr_template'
  | 'agent_summary'
  | 'ticket_metadata'
  | 'manual'
  | 'workspace_defaults';

export interface IntentArtifactIngestion {
  source: IntentArtifactSource;
  artifact: Partial<IntentArtifact>;
  validation: {
    schema_valid: boolean;
    capabilities_parseable: boolean;
    constraints_enforceable: boolean;
    errors?: string[];
  };
  auto_populated_fields?: string[]; // Fields that were auto-filled
}

// ======================================================================
// CAPABILITY LATTICE COMPARISON
// ======================================================================

export interface CapabilityViolation {
  type: 'PRIVILEGE_EXPANSION' | 'CONSTRAINT_VIOLATION' | 'UNDECLARED_CAPABILITY';
  declared?: Capability;
  observed: Capability;
  severity: 'low' | 'medium' | 'high' | 'critical';
  requires_approval: boolean;
  evidence?: string[];
}

export interface CapabilityComparisonResult {
  invariant: 'observed ⊆ declared';
  satisfied: boolean;
  violations: CapabilityViolation[];
  confidence: number; // 0-1
  evidence: {
    declared_capabilities: Capability[];
    observed_capabilities: Capability[];
    code_delta_analysis?: Record<string, unknown>;
    iam_changes?: Record<string, unknown>;
  };
}


