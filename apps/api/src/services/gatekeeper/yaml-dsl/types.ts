/**
 * YAML DSL Type Definitions
 * Migration Plan v5.0 - Single Source of Truth
 */

// ============================================================================
// Comparator IDs (Enum-based, versioned)
// ============================================================================

export enum ComparatorId {
  // Artifact comparators
  ARTIFACT_UPDATED = 'ARTIFACT_UPDATED',
  ARTIFACT_PRESENT = 'ARTIFACT_PRESENT',
  ARTIFACT_SECTION_PRESENT = 'ARTIFACT_SECTION_PRESENT',
  
  // Schema validators
  OPENAPI_SCHEMA_VALID = 'OPENAPI_SCHEMA_VALID',
  JSON_PARSE_VALID = 'JSON_PARSE_VALID',
  YAML_PARSE_VALID = 'YAML_PARSE_VALID',
  MARKDOWN_PARSE_VALID = 'MARKDOWN_PARSE_VALID',
  BACKSTAGE_REQUIRED_FIELDS_PRESENT = 'BACKSTAGE_REQUIRED_FIELDS_PRESENT',
  
  // Evidence comparators
  PR_TEMPLATE_FIELD_PRESENT = 'PR_TEMPLATE_FIELD_PRESENT',
  TESTS_TOUCHED_OR_JUSTIFIED = 'TESTS_TOUCHED_OR_JUSTIFIED',
  ARTIFACT_UPDATED_OR_JUSTIFIED = 'ARTIFACT_UPDATED_OR_JUSTIFIED',
  CHECKRUNS_PASSED = 'CHECKRUNS_PASSED',
  
  // Governance comparators
  MIN_APPROVALS = 'MIN_APPROVALS',
  HUMAN_APPROVAL_PRESENT = 'HUMAN_APPROVAL_PRESENT',
  SENSITIVE_PATH_REQUIRES_APPROVAL = 'SENSITIVE_PATH_REQUIRES_APPROVAL',
  APPROVER_IN_ALLOWED_SET = 'APPROVER_IN_ALLOWED_SET',
  
  // Safety comparators
  NO_SECRETS_IN_DIFF = 'NO_SECRETS_IN_DIFF',
  NO_HARDCODED_URLS = 'NO_HARDCODED_URLS',
  NO_COMMENTED_CODE = 'NO_COMMENTED_CODE',
  
  // Actor/Trigger comparators
  ACTOR_IS_AGENT = 'ACTOR_IS_AGENT',
  PR_MARKED_AGENT = 'PR_MARKED_AGENT',
  CHANGED_PATH_MATCHES = 'CHANGED_PATH_MATCHES',
  CHANGED_FILE_EXTENSION_MATCHES = 'CHANGED_FILE_EXTENSION_MATCHES',
}

// ============================================================================
// Pack YAML Schema
// ============================================================================

export interface PackYAML {
  apiVersion: 'verta.ai/v1';
  kind: 'PolicyPack';
  metadata: PackMetadata;
  scope: PackScope;
  artifacts?: ArtifactDefinitions;
  rules: Rule[];
  evaluation?: EvaluationConfig;
  routing?: RoutingConfig;
  spawnTrackB?: SpawnTrackBConfig;
}

export interface PackMetadata {
  id: string;
  name: string;
  version: string;  // Semver
  description?: string;
  tags?: string[];
  packMode?: 'enforce' | 'warn_only' | 'audit_only';
  strictness?: 'strict' | 'lenient';
}

export interface PackScope {
  type: 'workspace' | 'service' | 'repo';
  ref?: string;  // service name or 'owner/repo'
  branches?: {
    include?: string[];  // Glob patterns
    exclude?: string[];
  };
  prEvents?: ('opened' | 'synchronize' | 'reopened')[];
  actorSignals?: string[];  // e.g., ['agent-authored', 'bot']
}

export interface ArtifactDefinitions {
  requiredTypes?: string[];
  definitions?: Record<string, ArtifactDefinition>;
}

export interface ArtifactDefinition {
  type: string;
  path?: string;
  glob?: string;
  required?: boolean;
  validators?: string[];
}

export interface Rule {
  id: string;
  name: string;
  description?: string;
  trigger: Trigger;
  obligations: Obligation[];
  skipIf?: SkipCondition;
}

export interface Trigger {
  anyChangedPaths?: string[];  // Glob patterns
  allChangedPaths?: string[];
  anyFileExtensions?: string[];
  allOf?: Trigger[];
  anyOf?: Trigger[];
}

export interface Obligation {
  comparatorId: ComparatorId;
  params?: Record<string, any>;
  decisionOnFail: 'pass' | 'warn' | 'block';
  decisionOnUnknown?: 'pass' | 'warn' | 'block';
  message?: string;
}

export interface SkipCondition {
  allChangedPaths?: string[];
  labels?: string[];
  prBodyContains?: string[];
}

export interface EvaluationConfig {
  externalDependencyMode?: 'fail_open' | 'fail_closed';
  budgets?: {
    maxTotalMs?: number;
    perComparatorTimeoutMs?: number;
    maxGitHubApiCalls?: number;
  };
  unknownArtifactMode?: 'warn' | 'block' | 'pass';
}

export interface RoutingConfig {
  github?: {
    checkRunName?: string;
    conclusionMapping?: {
      pass: 'success' | 'neutral';
      warn: 'success' | 'neutral' | 'action_required';
      block: 'failure' | 'action_required';
    };
  };
}

export interface SpawnTrackBConfig {
  enabled: boolean;
  when?: Array<{ onDecision: 'pass' | 'warn' | 'block' }>;
  createRemediationCase?: boolean;
  remediationDefaults?: {
    priority?: 'low' | 'medium' | 'high' | 'critical';
  };
  grouping?: {
    strategy: 'by-drift-type-and-service' | 'by-rule' | 'by-finding-code';
    maxPerPR: number;
  };
}

// ============================================================================
// Finding Codes (structured error codes)
// ============================================================================

export enum FindingCode {
  // Artifact codes
  ARTIFACT_MISSING = 'ARTIFACT_MISSING',
  ARTIFACT_NOT_UPDATED = 'ARTIFACT_NOT_UPDATED',
  ARTIFACT_INVALID_SCHEMA = 'ARTIFACT_INVALID_SCHEMA',
  ARTIFACT_SERVICE_NOT_FOUND = 'ARTIFACT_SERVICE_NOT_FOUND',
  ARTIFACT_NO_REGISTRY = 'ARTIFACT_NO_REGISTRY',

  // Evidence codes
  PR_TEMPLATE_FIELD_MISSING = 'PR_TEMPLATE_FIELD_MISSING',
  CHECKRUNS_FAILED = 'CHECKRUNS_FAILED',
  CHECKRUNS_PENDING = 'CHECKRUNS_PENDING',

  // Governance codes
  INSUFFICIENT_APPROVALS = 'INSUFFICIENT_APPROVALS',
  NO_HUMAN_APPROVAL = 'NO_HUMAN_APPROVAL',
  SENSITIVE_PATH_NO_APPROVAL = 'SENSITIVE_PATH_NO_APPROVAL',
  APPROVER_NOT_ALLOWED = 'APPROVER_NOT_ALLOWED',

  // Safety codes
  SECRETS_DETECTED = 'SECRETS_DETECTED',
  HARDCODED_URLS_DETECTED = 'HARDCODED_URLS_DETECTED',
  COMMENTED_CODE_DETECTED = 'COMMENTED_CODE_DETECTED',

  // Actor/Trigger codes
  ACTOR_IS_AGENT = 'ACTOR_IS_AGENT',
  PR_MARKED_AS_AGENT = 'PR_MARKED_AS_AGENT',
  PATH_MATCHED = 'PATH_MATCHED',
  FILE_EXTENSION_MATCHED = 'FILE_EXTENSION_MATCHED',

  // Schema codes
  OPENAPI_INVALID = 'OPENAPI_INVALID',
  JSON_INVALID = 'JSON_INVALID',
  YAML_INVALID = 'YAML_INVALID',
  MARKDOWN_INVALID = 'MARKDOWN_INVALID',
  BACKSTAGE_MISSING_FIELDS = 'BACKSTAGE_MISSING_FIELDS',

  // Generic codes
  PASS = 'PASS',
  WARN = 'WARN',
  BLOCK = 'BLOCK',
}
