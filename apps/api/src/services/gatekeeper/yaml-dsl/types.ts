/**
 * YAML DSL Type Definitions
 * Migration Plan v5.0 - Single Source of Truth
 *
 * PHASE 3: Policy Evaluation Graph Architecture
 * Models the flow: Inputs → Surfaces → Obligations → Evidence → Invariants → Decision
 */

import type { Condition } from './conditions/types.js';

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
// Change Surface IDs — semantic surfaces that trigger policy evaluation
// ============================================================================

export enum ChangeSurfaceId {
  OPENAPI_CHANGED = 'openapi_changed',
  GRAPHQL_SCHEMA_CHANGED = 'graphql_schema_changed',
  PROTO_CHANGED = 'proto_changed',
  API_HANDLER_CHANGED = 'api_handler_changed',
  ROUTING_CHANGED = 'routing_changed',
  AUTHZ_POLICY_CHANGED = 'authz_policy_changed',
  DB_SCHEMA_CHANGED = 'db_schema_changed',
  MIGRATION_ADDED_OR_MISSING = 'migration_added_or_missing',
  TERRAFORM_CHANGED = 'terraform_changed',
  K8S_MANIFEST_CHANGED = 'k8s_manifest_changed',
  SLO_THRESHOLD_CHANGED = 'slo_threshold_changed',
  DASHBOARD_CHANGED = 'dashboard_changed',
  ALERT_RULE_CHANGED = 'alert_rule_changed',
  RUNBOOK_CHANGED = 'runbook_changed',
  ONCALL_ROTATION_CHANGED = 'oncall_rotation_changed',
  CODEOWNERS_CHANGED = 'codeowners_changed',
  OWNERSHIP_DOCS_CHANGED = 'ownership_docs_changed',
  EVENT_SCHEMA_CHANGED = 'event_schema_changed',
  ETL_CONTRACT_CHANGED = 'etl_contract_changed',
  AGENT_AUTHORED_SENSITIVE_CHANGE = 'agent_authored_sensitive_change',
  // Infra/security surfaces (Service Overlay Packs)
  IAM_CHANGED = 'iam_changed',
  SECRETS_CHANGED = 'secrets_changed',
  NETWORK_POLICY_CHANGED = 'network_policy_changed',
  INGRESS_CHANGED = 'ingress_changed',
  // DB surfaces (Service Overlay Packs)
  ORM_MODEL_CHANGED = 'orm_model_changed',
  // GAP-I: Service catalog / docs surfaces
  SERVICE_CATALOG_CHANGED = 'service_catalog_changed',
  DOCS_CHANGED = 'docs_changed',
  // Canonical aliases matching the requirements' taxonomy (§1A) — added in Prompt 4 gap analysis.
  // These supplement (not replace) the legacy surface IDs above for backward compatibility.
  /** More-specific alias: route definitions at the gateway layer (Kong, Envoy, nginx, k8s Ingress). */
  GATEWAY_ROUTE_CHANGED = 'gateway_route_changed',
  /** More-specific alias: authentication / authorization policy changes (OPA, RBAC, Istio AuthzPolicy). */
  AUTH_POLICY_CHANGED = 'auth_policy_changed',
  /** Corrected taxonomy name: oncall routing changes (who receives the page), vs ONCALL_ROTATION_CHANGED (schedule). */
  ONCALL_ROUTING_CHANGED = 'oncall_routing_changed',
}

// ============================================================================
// Tier-2 Heuristic Predicate IDs (§1C content-based signals)
// ============================================================================

/**
 * Typed identifiers for content-based heuristic detectors (Tier 2).
 * These are produced by CI/analysis steps and surfaced via PRContext.detectedHeuristics.
 * Use these in `when.predicates.anyOf/allOf` alongside ChangeSurfaceId values.
 */
export enum HeuristicPredicateId {
  // ── API heuristics ──────────────────────────────────────────────────
  ENDPOINT_ADDED                    = 'endpoint_added',
  ENDPOINT_REMOVED                  = 'endpoint_removed',
  ENDPOINT_PATH_CHANGED             = 'endpoint_path_changed',
  REQUEST_SCHEMA_CHANGED            = 'request_schema_changed',
  RESPONSE_SCHEMA_CHANGED           = 'response_schema_changed',
  STATUS_CODES_CHANGED              = 'status_codes_changed',
  BREAKING_CHANGE_DETECTED          = 'breaking_change_detected',
  EXPOSURE_INCREASED                = 'exposure_increased',
  AUTH_REMOVED_OR_WEAKENED          = 'auth_removed_or_weakened',
  NEW_ROUTE_DETECTED                = 'new_route_detected',
  // ── DB heuristics ───────────────────────────────────────────────────
  DESTRUCTIVE_CHANGE_DETECTED       = 'destructive_change_detected',
  RISKY_DB_CHANGE_DETECTED          = 'risky_db_change_detected',
  SENSITIVE_TABLE_TOUCHED           = 'sensitive_table_touched',
  // ── Infra heuristics ────────────────────────────────────────────────
  NEW_PUBLIC_INGRESS_DETECTED       = 'new_public_ingress_detected',
  WILDCARD_PRIVILEGE_DETECTED       = 'wildcard_privilege_detected',
  PLAINTEXT_SECRET_DETECTED         = 'plaintext_secret_detected',
  PROD_ENV_TOUCHED                  = 'prod_env_touched',
  // ── Observability heuristics ─────────────────────────────────────────
  NEW_PAGING_ALERT_ADDED            = 'new_paging_alert_added',
  ROUTING_CHANGED_FOR_PAGING        = 'routing_changed_for_paging',
  MISSING_RUNBOOK_DETECTED          = 'missing_runbook_detected',
  DASHBOARD_ALERT_MISALIGNMENT_DETECTED = 'dashboard_alert_misalignment_detected',
}

// ============================================================================
// Invariant Type IDs — canonical invariants library (§2A-2E)
// ============================================================================

/**
 * Canonical identifiers for the invariant types available in `checks.invariants[].type`.
 * The invariantCatalog.ts maps each ID to Starter/Standard/Strict decision defaults.
 */
export enum InvariantTypeId {
  // ── API invariants (§2A) ─────────────────────────────────────────────
  /** OpenAPI/GraphQL/Proto spec must match deployed handler signatures. */
  API_SPEC_IMPL_PARITY              = 'api_spec_impl_parity',
  /** API spec security schemes must match gateway route config. */
  API_SPEC_GATEWAY_PARITY           = 'api_spec_gateway_parity',
  /** No breaking changes on protected branches without explicit waiver. */
  API_BACKWARD_COMPATIBILITY        = 'api_backward_compatibility',
  /** Auth policy files must match spec securitySchemes. */
  API_AUTH_PARITY                   = 'api_auth_parity',
  /** API version header/path must be incremented on breaking changes. */
  API_VERSION_PARITY                = 'api_version_parity',
  /** Error response shapes must match documented error contract. */
  API_ERROR_CONTRACT_INVARIANTS     = 'api_error_contract_invariants',
  /** Deprecated endpoints must carry sunset date and migration guidance. */
  API_DEPRECATION_POLICY            = 'api_deprecation_policy',
  /** Public endpoints must have rate-limit contract documented. */
  API_RATELIMIT_CONTRACT_PRESENT    = 'api_ratelimit_contract_present',
  /** PII/sensitive fields must be classified and governed. */
  API_SENSITIVE_FIELD_POLICY        = 'api_sensitive_field_policy',

  // ── DB invariants (§2B) ──────────────────────────────────────────────
  /** Every schema change must have a matching migration file. */
  DB_SCHEMA_MIGRATION_PARITY        = 'db_schema_migration_parity',
  /** Migrations must be idempotent, ordered, and not modified retroactively. */
  DB_MIGRATION_HYGIENE              = 'db_migration_hygiene',
  /** DROP/TRUNCATE/destructive ALTER without explicit approval. */
  DB_RISKY_OPS_DETECTED             = 'db_risky_ops_detected',
  /** Risky migrations must include a rollback plan. */
  DB_ROLLBACK_READINESS             = 'db_rollback_readiness',
  /** Indexes and FK constraints must not degrade query patterns. */
  DB_INDEX_FK_INVARIANTS            = 'db_index_fk_invariants',
  /** Sensitive tables (PII, payments) must have data-classification label. */
  DB_SENSITIVE_TABLE_POLICY         = 'db_sensitive_table_policy',
  /** Large table migrations must use online-safe strategies (pt-osc, gh-ost). */
  DB_ONLINE_MIGRATION_POLICY        = 'db_online_migration_policy',

  // ── Infra invariants (§2C) ────────────────────────────────────────────
  /** terraform plan output must be attached to the PR. */
  TERRAFORM_PLAN_EVIDENCE_PRESENT   = 'terraform_plan_evidence_present',
  /** New public exposure (ingress, LB) flagged and approved. */
  INFRA_EXPOSURE_CHANGE_DETECTED    = 'infra_exposure_change_detected',
  /** Wildcard IAM grants blocked on protected branches. */
  IAM_WILDCARD_DETECTION            = 'iam_wildcard_detection',
  /** Plaintext secrets in config/env files blocked. */
  PLAINTEXT_SECRET_DETECTION        = 'plaintext_secret_detection',
  /** Network policies must not violate org egress/ingress guardrails. */
  NETWORK_POLICY_GUARDRAILS         = 'network_policy_guardrails',
  /** Production env must match staging configuration (variable parity). */
  ENV_PARITY_CHECK                  = 'env_parity_check',
  /** Org-mandated tags and approved module sources required. */
  INFRA_REQUIRED_TAGS_AND_MODULES   = 'infra_required_tags_and_modules',

  // ── Observability invariants (§2D) ────────────────────────────────────
  /** Every paging (severity: page) alert must have a runbook link. */
  ALERT_HAS_RUNBOOK_REFERENCE       = 'alert_has_runbook_reference',
  /** Alert routing targets must match service CODEOWNERS/ownership. */
  ALERT_ROUTING_OWNER_PARITY        = 'alert_routing_owner_parity',
  /** Each dashboard panel must have a corresponding alert rule. */
  DASHBOARD_ALERT_PARITY            = 'dashboard_alert_parity',
  /** SLO burn-rate alerts must cover every SLO definition. */
  SLO_ALERT_ALIGNMENT               = 'slo_alert_alignment',
  /** API endpoint changes must have corresponding alert coverage. */
  API_COVERAGE_EXPECTATION          = 'api_coverage_expectation',
  /** Runbooks must contain minimum required sections (triage, escalation). */
  RUNBOOK_MINIMUM_REQUIREMENTS      = 'runbook_minimum_requirements',

  // ── Cross-cutting parity invariants (§2E) ─────────────────────────────
  /** CODEOWNERS entries must have matching ownership docs. */
  CODEOWNERS_DOCS_PARITY            = 'codeowners_docs_parity',
  /** Service catalog entry must designate a human owner. */
  SERVICE_OWNER_PRESENT             = 'service_owner_present',
  /** Each alert must reference a runbook; each runbook must reference an alert. */
  ALERT_RUNBOOK_PARITY              = 'alert_runbook_parity',
  /** Metrics + logs + traces must all be present for a service (observability triangle). */
  OBSERVABILITY_TRIANGLE_CONSISTENCY = 'observability_triangle_consistency',
  /** CODEOWNERS team must be mapped to an active oncall rotation. */
  OWNERSHIP_ONCALL_PARITY           = 'ownership_oncall_parity',
  /** CHECKRUN_POSTED must fire on every evaluated PR, even with partial evidence. */
  CHECKRUN_POSTING_POLICY           = 'checkrun_posting_policy',
  /** Time-bound waivers must be approved and within their expiry window. */
  WAIVER_POLICY_COMPLIANCE          = 'waiver_policy_compliance',
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
  // GAP-G: Pack-level optional sections
  config?: PackConfig;
  dataSources?: DataSources;
  enforcement?: EnforcementConfig;
  exceptions?: ExceptionsConfig;
}

// PHASE 1.2: Pack status enum
export enum PackStatus {
  DRAFT = 'DRAFT',
  IN_REVIEW = 'IN_REVIEW',
  ACTIVE = 'ACTIVE',
  DEPRECATED = 'DEPRECATED',
  ARCHIVED = 'ARCHIVED'
}

// PHASE 1.2: Pack owner interface
export interface PackOwner {
  team?: string;
  user?: string;
}

// PHASE 1.3: Merge strategy enum
export type MergeStrategy = 'MOST_RESTRICTIVE' | 'HIGHEST_PRIORITY' | 'EXPLICIT';

// PHASE 1.4: Pack-level defaults interface
export interface PackDefaults {
  // Timeout defaults
  timeouts?: {
    comparatorTimeout?: number;      // Default timeout per comparator (ms)
    totalEvaluationTimeout?: number; // Default total evaluation timeout (ms)
  };

  // Severity defaults
  severity?: {
    defaultLevel?: 'low' | 'medium' | 'high' | 'critical';
    escalationThreshold?: number;
  };

  // Approval defaults
  approvals?: {
    minCount?: number;
    requiredTeams?: string[];
    requiredUsers?: string[];
  };

  // Obligation defaults
  obligations?: {
    defaultDecisionOnFail?: 'block' | 'warn' | 'pass';
    defaultDecisionOnUnknown?: 'pass' | 'warn' | 'block'; // Evidence health: what to do when fact value is unavailable
    defaultSeverity?: 'low' | 'medium' | 'high' | 'critical';
  };

  // Trigger defaults
  triggers?: {
    defaultPrEvents?: ('opened' | 'synchronize' | 'reopened' | 'labeled' | 'closed')[];
  };
}

export interface PackMetadata {
  id: string;
  name: string;
  version: string;  // Semver
  description?: string;
  tags?: string[];
  // PHASE 1 FIX: Align enum values with spec
  packMode?: 'observe' | 'warn' | 'enforce';  // observe=monitor-only, warn=allow+warn, enforce=block
  strictness?: 'permissive' | 'balanced' | 'strict';
  // Pack archetype — drives baseline/overlay composition
  packType?: 'GLOBAL_BASELINE' | 'SERVICE_OVERLAY';
  // PHASE 1 FIX: Add missing fields from spec
  owner?: string;
  defaultsRef?: string;

  // PHASE 1.2: Enhanced metadata fields
  status?: PackStatus;
  owners?: PackOwner[];
  labels?: Record<string, string>;
  audit?: {
    createdBy?: string;
    createdAt?: string;
    updatedAt?: string;
    updatedBy?: string;
  };
  notes?: string;

  // PHASE 1.3: Scope precedence
  scopePriority?: number;        // 0-100, higher = higher priority (default: 50)
  scopeMergeStrategy?: MergeStrategy;  // How to merge with other packs (default: MOST_RESTRICTIVE)

  // PHASE 1.4: Pack-level defaults
  defaults?: PackDefaults;       // Default values inherited by all rules in this pack
}

export interface PackScope {
  type: 'workspace' | 'service' | 'repo';
  ref?: string;  // service name or 'owner/repo'
  branches?: {
    include?: string[];  // Glob patterns
    exclude?: string[];
  };
  // PHASE 1 FIX: Add repos configuration from spec
  repos?: {
    include?: string[];
    exclude?: string[];
  };
  // PHASE 1 FIX: Add labeled event support
  prEvents?: ('opened' | 'synchronize' | 'reopened' | 'labeled' | 'closed')[];
  // PHASE 1 FIX: Change actorSignals to object structure per spec
  actorSignals?: {
    detectAgentAuthorship?: boolean;
    agentPatterns?: string[];
    botUsers?: string[];
  };
  // GAP-H: Service allowlist and path glob filters
  services?: {
    allowlist?: string[];   // e.g. ["${SERVICE_ID}"] — restrict pack to specific services
    denylist?: string[];    // e.g. ["legacy-*"] — exclude specific services
  };
  paths?: {
    includeGlobs?: string[];  // e.g. ["**/*"] — used for changeSurface detection + artifacts
    excludeGlobs?: string[];  // e.g. ["**/vendor/**"] — prevents noise from vendor dirs
  };
}

export interface ArtifactDefinitions {
  requiredTypes?: string[];
  definitions?: Record<string, ArtifactDefinition>;
}

export interface ArtifactDefinition {
  // PHASE 1 FIX: Rename 'type' to 'kind' per spec
  kind: 'openapi' | 'readme' | 'runbook' | 'backstage' | 'dashboard' | 'terraform' | 'custom';
  path?: string;
  // PHASE 1 FIX: Rename 'glob' to 'matchAny' per spec
  matchAny?: string[];
  required?: boolean;
  validators?: string[];
}

// GAP-4: New rule vocabulary from requirements
// WhenBlock — declarative predicate-based trigger (alternative to path-glob triggers)
export interface WhenBlock {
  predicates?: {
    anyOf?: string[];   // Any of these abstract predicate strings match → rule fires
    allOf?: string[];   // All of these abstract predicate strings must match
  };
  // GAP-A: changeSurfaces — expanded to path globs at evaluation time (different from predicates)
  changeSurfaces?: {
    anyOf?: string[];   // Any of these ChangeSurfaceId strings match → rule fires
    allOf?: string[];   // All of these ChangeSurfaceId strings must match
  };
}

// ApprovalsBlock — structured approval routing at rule level
export interface ApprovalRequirement {
  type: string;        // e.g. 'owner_ack', 'security_approval', 'platform_approval', 'two_person_review'
  resolver: string;    // e.g. 'serviceOwner', 'securityTeam', 'platformTeam'
  minCount?: number;   // Minimum number of approvals required (default: 1)
  // GAP-E: Conditional approval — only required when predicate is true
  when?: { predicate: string };
}

export interface ApprovalsBlock {
  required: ApprovalRequirement[];
}

// DecisionBlock — deterministic outcome mapping at rule level
// (alternative to per-obligation decisionOnFail / decisionOnUnknown)
export type BranchDecision = 'pass' | 'warn' | 'block';
export interface DecisionBlock {
  // GAP-D: onViolation can be a simple string or branch-specific object
  onViolation: BranchDecision | {
    protectedBranches: BranchDecision;
    featureBranches: BranchDecision;
  };
  onMissingExternalEvidence: BranchDecision;
}

export interface Rule {
  id: string;
  name: string;
  description?: string;
  // PHASE 1 FIX: Add enabled field from spec
  enabled?: boolean;
  // GAP-4: trigger is now optional when `when` or `approvals`/`decision` is present
  trigger?: Trigger;
  // GAP-4: New vocabulary — declarative predicate-based trigger
  when?: WhenBlock;
  // GAP-4: Rule-level approval routing (drives approval-gate obligations)
  approvals?: ApprovalsBlock;
  // GAP-4: Rule-level decision policy (overrides per-obligation decisionOnFail)
  decision?: DecisionBlock;
  obligations?: Obligation[];
  skipIf?: SkipCondition;
  excludePaths?: string[];
  // GAP-B: Typed evidence requirements (CI + local artifacts)
  requires?: RequiresBlock;
  // GAP-C: Invariant/parity checks
  checks?: ChecksBlock;
  // GAP-F: Side-effect actions triggered when rule fires
  actions?: Action[];
}

// Alias for backward compatibility
export type PackRule = Rule;

export interface Trigger {
  anyChangedPaths?: string[];  // Glob patterns
  allChangedPaths?: string[];
  anyFileExtensions?: string[];
  allOf?: Trigger[];
  anyOf?: Trigger[];
  // PHASE 1 FIX: Add always and anyChangedPathsRef from spec
  always?: boolean;
  anyChangedPathsRef?: string;  // Reference to workspace defaults paths
  // ChangeSurface model: semantic trigger that expands to path globs at evaluation time
  changeSurface?: ChangeSurfaceId | ChangeSurfaceId[];
}

export interface Obligation {
  // PHASE 1 FIX: Support both 'comparator' (spec) and 'comparatorId' (legacy)
  comparator?: ComparatorId;
  comparatorId?: ComparatorId;
  params?: Record<string, any>;
  decisionOnFail: 'pass' | 'warn' | 'block';
  decisionOnUnknown?: 'pass' | 'warn' | 'block';
  message?: string;
  // PHASE 1 FIX: Add severity field from spec
  severity?: 'low' | 'medium' | 'high' | 'critical';
  // GAP 2 FIX: Fact-based condition guard (used in YAML templates)
  condition?: Condition;
}

export interface SkipCondition {
  allChangedPaths?: string[];
  labels?: string[];
  prBodyContains?: string[];
}

// GAP-B: RequiresBlock — typed evidence inventory
export interface RequiresBlock {
  /** CI checks that must have passed (e.g. 'terraform_plan_passed', 'tests_passed') */
  ciEvidence?: {
    anyOf?: string[];   // Any of these CI evidence types must be present
    allOf?: string[];   // All of these CI evidence types must be present
  };
  /** Local file artifacts that must be present in the PR (path globs) */
  localArtifacts?: {
    anyOf?: string[];   // Any matching file must be present
    allOf?: string[];   // All must be present
  };
}

// GAP-C / GAP-2: ChecksBlock — invariant / parity validation
export interface InvariantCheck {
  id: string;
  description?: string;
  /** Typed invariant class from the canonical library — see InvariantTypeId. Falls back to plain string for custom checks. */
  type?: InvariantTypeId | string;
  sources?: string[];      // Globs or ids of "source" side of the parity check
  targets?: string[];      // Globs or ids of "target" side
  allowMissing?: boolean;  // If true, degrade to WARN instead of BLOCK when artifact absent
  /** Per-tier decision override. When absent, invariantCatalog.ts defaults apply. */
  decision?: {
    starter?: 'pass' | 'warn' | 'block';
    standard?: 'pass' | 'warn' | 'block' | { protectedBranches: 'pass'|'warn'|'block'; featureBranches: 'pass'|'warn'|'block' };
    strict?:   'pass' | 'warn' | 'block' | { protectedBranches: 'pass'|'warn'|'block'; featureBranches: 'pass'|'warn'|'block' };
  };
}

export interface ChecksBlock {
  invariants?: InvariantCheck[];
}

// GAP-F: Action — side effect triggered when rule fires
export interface Action {
  type: string;            // e.g. 'enqueue_drift_remediation', 'post_comment', 'create_ticket'
  target?: string;         // e.g. 'observability', 'platform-jira'
  params?: Record<string, any>;
}

// GAP-P: Typed config sub-interfaces for each overlay pack
// These drive UI schema introspection and form auto-generation (4C mappings).

/** Config for the API Service Overlay — spec.config.api.* */
export interface ApiConfig {
  /** Contract type: drives which invariants run */
  contractType?: 'openapi' | 'graphql' | 'proto';
  /** Glob patterns for spec files (artifact detection + parity checks) */
  specGlobs?: string[];
  /** Glob patterns for gateway route definitions (enables gateway parity rule) */
  gatewayRouteGlobs?: string[];
  /** Breaking-change enforcement — per branch category */
  breakingChangePolicy?: {
    protectedBranches?: 'block' | 'warn' | 'pass';
    featureBranches?: 'block' | 'warn' | 'pass';
  };
  /** Toggle: require changelog_updated artifact on breaking changes */
  requireChangelogOnBreaking?: boolean;
  /** Toggle: require owner-ack approval on breaking changes */
  requireOwnerAckOnBreaking?: boolean;
}

/** Config for the DB Service Overlay — spec.config.db.* */
export interface DbConfig {
  /** DB framework — selects detectors and migration file pattern defaults */
  framework?: 'flyway' | 'liquibase' | 'alembic' | 'golang-migrate' | 'prisma';
  /** Glob patterns for ORM model / schema definition files */
  schemaGlobs?: string[];
  /** Glob patterns for migration files */
  migrationGlobs?: string[];
  /** Risky DDL operation policy */
  riskyOps?: {
    /** DDL operation strings that are blocked on protected branches */
    blockOnProtectedBranches?: string[];
  };
  /** Rollback note requirements */
  rollback?: {
    /** Require rollback notes when any risky operation is present */
    requiredOnRiskyOps?: boolean;
  };
}

/** Config for the Infra Service Overlay — spec.config.infra.* */
export interface InfraConfig {
  /** Terraform plan evidence gate */
  terraform?: {
    /** If true, CI must post a terraform plan before merge; missing evidence → degrade to warn */
    requirePlanEvidence?: boolean;
  };
  /** Public ingress / exposure controls */
  exposure?: {
    /** Block PRs introducing new public ingress on protected branches */
    blockNewPublicIngressOnProtectedBranches?: boolean;
  };
  /** IAM least-privilege enforcement */
  iam?: {
    /** Block wildcard/admin IAM grants on protected branches */
    blockWildcardAdminOnProtectedBranches?: boolean;
  };
  /** Secrets hygiene */
  secrets?: {
    /** Block PRs that introduce plaintext secrets */
    blockPlaintextSecrets?: boolean;
  };
}

/** Config for the Observability Service Overlay — spec.config.obs.* */
export interface ObsConfig {
  /** Observability provider — drives which evidence APIs are queried */
  provider?: 'datadog' | 'grafana' | 'newrelic' | 'prometheus';
  /** Paging alerts must reference a runbook */
  pagingAlertsRequireRunbook?: boolean;
  /** Alert routing must reference the oncall owner from CODEOWNERS */
  alertMustHaveOwnerRouting?: boolean;
  /** Dashboard ↔ Alert parity invariant settings */
  dashboardAlertParity?: {
    enabled?: boolean;
    /** Service-defined signal tags considered "critical" (default: ["p0"]) */
    criticalSignalTags?: string[];
  };
  /** SLO ↔ Alert alignment invariant */
  sloAlignment?: {
    enabled?: boolean;
  };
}

// GAP-G: Pack-level config — open schema with typed overlay sub-keys
export interface PackConfig {
  /** API overlay config (spec.config.api.*) */
  api?: ApiConfig;
  /** DB overlay config (spec.config.db.*) */
  db?: DbConfig;
  /** Infra overlay config (spec.config.infra.*) */
  infra?: InfraConfig;
  /** Observability overlay config (spec.config.obs.*) */
  obs?: ObsConfig;
  /** Arbitrary service-specific config keys (open schema) */
  [key: string]: any;
}

export interface DataSources {
  serviceCatalog?: { provider?: string; url?: string };
  github?: { org?: string };
  observability?: { provider?: string; url?: string };
  [key: string]: any;
}

export interface EnforcementConfig {
  checkrun?: {
    name?: string;
    alwaysPost?: boolean;  // Post CHECKRUN even with partial evidence
  };
  premerge?: boolean;
  postmerge?: boolean;
}

export interface ExceptionRule {
  id: string;
  ruleIds?: string[];      // Which rules this waiver covers
  expiresAt?: string;      // ISO 8601 date
  approvedBy?: string;
  reason?: string;
}

export interface ExceptionsConfig {
  waivers?: ExceptionRule[];
  requireApproval?: boolean;
  approvers?: string[];
}

export interface EvaluationConfig {
  // PHASE 1 FIX: Align enum values with spec (soft_fail/hard_fail)
  externalDependencyMode?: 'soft_fail' | 'hard_fail';
  budgets?: {
    maxTotalMs?: number;
    perComparatorTimeoutMs?: number;
    maxGitHubApiCalls?: number;
  };
  unknownArtifactMode?: 'warn' | 'block' | 'pass';
  // PHASE 2 FIX: Add maxFindings and maxEvidenceSnippetsPerFinding from spec
  maxFindings?: number;
  maxEvidenceSnippetsPerFinding?: number;
}

export interface RoutingConfig {
  github?: {
    checkRunName?: string;
    conclusionMapping?: {
      pass: 'success' | 'neutral';
      warn: 'success' | 'neutral' | 'action_required';
      block: 'failure' | 'action_required';
    };
    // PHASE 2 FIX: Add postSummaryComment and annotateFiles from spec
    postSummaryComment?: boolean;
    annotateFiles?: boolean;
  };
}

export interface SpawnTrackBConfig {
  enabled: boolean;
  when?: Array<{ onDecision: 'pass' | 'warn' | 'block' }>;
  createRemediationCase?: boolean;
  remediationDefaults?: {
    priority?: 'low' | 'medium' | 'high' | 'critical';
    // PHASE 2 FIX: Add targetSystems and approvalChannelRef from spec
    targetSystems?: string[];
    approvalChannelRef?: string;
  };
  grouping?: {
    strategy: 'by-drift-type-and-service' | 'by-rule' | 'by-finding-code';
    maxPerPR: number;
  };
}

// ============================================================================
// PolicyPackSet – groups multiple packs into one composable unit (optional)
// ============================================================================

/**
 * A PolicyPackSet bundles multiple PolicyPacks together, defining how they
 * compose (merge strategy, precedence) and ships them as a single activatable
 * unit.  This is the "meta-pack" concept that enables starter packs, org-wide
 * bundles, and import/export of policy posture.
 */
export interface PolicyPackSet {
  apiVersion: 'verta.ai/v1';
  kind: 'PolicyPackSet';
  metadata: {
    setId: string;                         // Unique identifier for this set
    name: string;
    description?: string;
    version: string;                       // Semver
    owner?: string;
    labels?: Record<string, string>;
    audit?: {
      createdBy?: string;
      createdAt?: string;
      updatedAt?: string;
    };
  };
  /** References to constituent PolicyPacks and per-pack overrides */
  composition: {
    packs: Array<{
      packId: string;                      // ID of a PolicyPack
      version?: string;                    // Semver range (e.g., "^1.0.0")
      /** Override this pack's scopePriority within the set */
      priority?: number;
      /** Disable this pack in the set without removing it */
      enabled?: boolean;
    }>;
    /**
     * How to resolve conflicts when multiple packs' rules overlap.
     * Overrides individual pack strategies at the set level.
     */
    mergeStrategy: MergeStrategy;
    /**
     * Tie-break ordering when mergeStrategy = HIGHEST_PRIORITY.
     * 'first-wins' uses the pack list order; 'explicit' requires all
     * conflicts to be manually resolved.
     */
    precedence?: 'first-wins' | 'last-wins' | 'explicit';
  };
  /** Defaults that cascade into every pack in this set (overridable per-pack) */
  sharedDefaults?: PackDefaults;
  /** Governance controls for this set */
  governance?: {
    /** Whether activating this set requires an approval workflow */
    approvalRequired?: boolean;
    /** Users or teams who can approve set activation */
    approvers?: string[];
    /** Whether this set can be exported / published to a registry */
    exportable?: boolean;
    /** Channels this set should be distributed to (e.g., OPA bundle, Terraform Cloud) */
    distributionChannels?: string[];
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

// ============================================================================
// PHASE 3: Policy Evaluation Graph Architecture
// ============================================================================

/**
 * Surface: A detected change surface that triggered policy evaluation
 * Examples: "API changed", "DB schema changed", "Alert routing changed"
 */
export interface DetectedSurface {
  /** Surface ID from ChangeSurfaceId enum */
  surfaceId: string;

  /** Human-readable description */
  description: string;

  /** Files that contributed to this surface detection */
  files: string[];

  /** Confidence level of detection (0-1) */
  confidence: number;

  /** Detection method: 'path-glob' | 'heuristic' | 'explicit' */
  detectionMethod: 'path-glob' | 'heuristic' | 'explicit';

  /** Additional metadata (e.g., specific endpoints changed, tables touched) */
  metadata?: Record<string, any>;
}

/**
 * Obligation: A contract requirement that must be satisfied
 * Examples: "OpenAPI spec must be updated", "Migration must be present"
 */
export interface EvaluatedObligation {
  /** Obligation index in the rule */
  obligationIndex: number;

  /** Type of obligation: 'artifact' | 'approval' | 'invariant' | 'condition' */
  type: 'artifact' | 'approval' | 'invariant' | 'condition';

  /** Human-readable description */
  description: string;

  /** Comparator or condition used to evaluate this obligation */
  evaluator: {
    type: 'comparator' | 'condition';
    id: string;
    params?: Record<string, any>;
  };

  /** Evaluation result */
  result: {
    status: 'pass' | 'fail' | 'unknown' | 'not_evaluable' | 'not_applicable';
    reasonCode: string;
    message: string;
  };

  /** Evidence collected during evaluation */
  evidence: EvidenceItem[];

  /** Decision impact if this obligation fails */
  decisionOnFail: 'pass' | 'warn' | 'block';
  decisionOnUnknown?: 'pass' | 'warn' | 'block';
}

/**
 * Evidence: Concrete artifacts or signals collected during evaluation
 * Examples: "Found OpenAPI spec at /api/openapi.yaml", "Approval from @alice"
 */
export interface EvidenceItem {
  /** Evidence type */
  type: 'file' | 'approval' | 'checkrun' | 'secret_detected' | 'metadata' | 'external';

  /** Primary value (e.g., file path, approver username, check name) */
  value: string;

  /** Additional context */
  context?: {
    path?: string;
    user?: string;
    conclusion?: string;
    hash?: string;
    location?: string;
    [key: string]: any;
  };

  /** Confidence level (0-1) */
  confidence?: number;

  /** Source of evidence: 'local' | 'github_api' | 'external_system' */
  source: 'local' | 'github_api' | 'external_system';
}

/**
 * Invariant: A cross-artifact consistency check
 * Examples: "OpenAPI spec ↔ Implementation parity", "CODEOWNERS ↔ Service catalog parity"
 */
export interface EvaluatedInvariant {
  /** Invariant ID from InvariantTypeId enum */
  invariantId: string;

  /** Human-readable description */
  description: string;

  /** Source artifacts (what we're checking FROM) */
  sources: {
    type: string;
    paths: string[];
    found: boolean;
  }[];

  /** Target artifacts (what we're checking AGAINST) */
  targets: {
    type: string;
    paths: string[];
    found: boolean;
  }[];

  /** Evaluation result */
  result: {
    status: 'pass' | 'fail' | 'unknown' | 'not_evaluable' | 'not_applicable';
    reasonCode: string;
    message: string;
    /** Specific mismatches or inconsistencies found */
    mismatches?: Array<{
      source: string;
      target: string;
      issue: string;
    }>;
  };

  /** Decision impact if this invariant fails */
  decisionOnFail: 'pass' | 'warn' | 'block';
}

/**
 * Policy Evaluation Graph: Complete evaluation flow for a single rule
 * Flow: Inputs → Surfaces → Obligations → Evidence → Invariants → Decision
 */
export interface PolicyEvaluationGraph {
  /** Rule that was evaluated */
  ruleId: string;
  ruleName: string;
  ruleDescription?: string;

  /** Step 1: Inputs (PR context) */
  inputs: {
    prNumber: number;
    author: string;
    baseBranch: string;
    headBranch: string;
    filesChanged: number;
    additions: number;
    deletions: number;
  };

  /** Step 2: Detected Surfaces (why this rule triggered) */
  surfaces: DetectedSurface[];

  /** Step 3: Obligations (what the contract requires) */
  obligations: EvaluatedObligation[];

  /** Step 4: Evidence (what we found) */
  evidence: EvidenceItem[];

  /** Step 5: Invariants (cross-artifact checks) */
  invariants: EvaluatedInvariant[];

  /** Step 6: Decision (final outcome) */
  decision: {
    outcome: 'pass' | 'warn' | 'block';
    reason: string;
    /** Which obligation(s) caused this decision */
    causedBy: Array<{
      obligationIndex: number;
      reasonCode: string;
    }>;
  };

  /** Evaluation metadata */
  metadata: {
    evaluationTimeMs: number;
    evaluationStatus: 'evaluated' | 'not_evaluable';
    confidence: number; // 0-1, based on coverage
  };
}

/**
 * Pack Evaluation Graph: Complete evaluation for all rules in a pack
 */
export interface PackEvaluationGraph {
  /** Pack metadata */
  packId: string;
  packName: string;
  packVersion: string;
  packHash: string;

  /** Global inputs (PR context) */
  inputs: {
    prNumber: number;
    author: string;
    baseBranch: string;
    headBranch: string;
    filesChanged: number;
    additions: number;
    deletions: number;
    labels: string[];
  };

  /** All detected surfaces across all rules */
  allSurfaces: DetectedSurface[];

  /** Evaluation graph for each triggered rule */
  ruleGraphs: PolicyEvaluationGraph[];

  /** Global decision */
  globalDecision: {
    outcome: 'pass' | 'warn' | 'block';
    reason: string;
    /** Which rules contributed to this decision */
    contributingRules: Array<{
      ruleId: string;
      decision: 'pass' | 'warn' | 'block';
    }>;
  };

  /** Coverage and confidence */
  coverage: {
    totalRules: number;
    triggeredRules: number;
    evaluableRules: number;
    notEvaluableRules: number;
    overallConfidence: number; // 0-1
  };

  /** Evaluation metadata */
  metadata: {
    evaluationTimeMs: number;
    engineFingerprint: {
      evaluatorVersion: string;
      comparatorVersions: Record<string, string>;
      timestamp: string;
    };
  };
}

// ============================================================================
// NORMALIZATION LAYER: Canonical Evaluation Model
// ============================================================================

/**
 * Obligation Kind - Typed obligations for consistent rendering
 * Each kind has specific rendering logic and "how to fix" guidance
 */
export enum ObligationKind {
  ARTIFACT_PRESENT = 'artifact_present',
  ARTIFACT_UPDATED = 'artifact_updated',
  APPROVAL_REQUIRED = 'approval_required',
  CHECKRUN_PASSED = 'checkrun_passed',
  PARITY_INVARIANT = 'parity_invariant',
  SECRET_SCAN = 'secret_scan',
  CONDITION_CHECK = 'condition_check',
  CUSTOM = 'custom',
}

/**
 * Normalized Obligation - Canonical representation of a contract requirement
 * Links surface → obligation explicitly (THE KEY DIFFERENTIATOR)
 */
export interface NormalizedObligation {
  /** Unique ID for this obligation instance */
  id: string;

  /** Type of obligation */
  kind: ObligationKind;

  /** Human-readable description */
  description: string;

  /** Which surface(s) triggered this obligation - EXPLICIT CAUSAL LINK */
  triggeredBy: string[]; // ChangeSurfaceId[]

  /** Rule that generated this obligation */
  sourceRule: {
    ruleId: string;
    ruleName: string;
  };

  /** Evaluation result */
  result: {
    status: 'pass' | 'fail' | 'unknown' | 'not_evaluable' | 'not_applicable';
    reasonCode: string;
    message: string;
  };

  /** Evidence supporting this result */
  evidence: EvidenceItem[];

  /** Decision impact */
  decisionOnFail: 'pass' | 'warn' | 'block';
  decisionOnUnknown?: 'pass' | 'warn' | 'block';

  /** Evaluation status */
  evaluationStatus: 'evaluated' | 'not_evaluable';

  /** If not_evaluable, why and how to fix */
  notEvaluableReason?: {
    category: 'policy_misconfig' | 'missing_external_evidence' | 'integration_error';
    message: string;
    remediation: string;
    degradeTo?: 'pass' | 'warn' | 'block';
  };
}

/**
 * Normalized Finding - Canonical representation of a policy violation or success
 * Includes risk, why it matters, how to fix, and who can approve
 */
export interface NormalizedFinding {
  /** Unique ID */
  id: string;

  /** Severity/Risk level */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';

  /** What is wrong (plain English) */
  what: string;

  /** Why it matters (risk explanation) */
  why: string;

  /** Evidence (files, diff lines, links) */
  evidence: EvidenceItem[];

  /** How to fix (exact steps) */
  howToFix: string[];

  /** Who can approve/override (owner) */
  owner?: {
    team?: string;
    individuals?: string[];
    codeownersPath?: string;
  };

  /** Related obligation */
  obligationId: string;

  /** Decision impact */
  decision: 'pass' | 'warn' | 'block';

  /** Risk score (for ranking) */
  riskScore?: RiskScore;

  /** Applicability (does this apply to this repo?) */
  applicability?: ObligationApplicability;

  /** Result from obligation evaluation */
  result: {
    status: 'pass' | 'fail' | 'unknown' | 'not_evaluable' | 'not_applicable';
    code: string;
    message: string;
  };

  /** CRITICAL FIX: Evidence transparency */
  evidenceSearch?: {
    searchedPaths: string[];
    matchedPaths: string[];
    closestMatches?: string[];
  };
}

/**
 * Not-Evaluable Item - Separate tracking for policy quality issues
 * Treats NOT_EVALUABLE as a policy-quality problem, not a developer problem
 */
export interface NotEvaluableItem {
  /** What couldn't be evaluated */
  description: string;

  /** Category of issue */
  category: 'policy_misconfig' | 'missing_external_evidence' | 'integration_error';

  /** Detailed explanation */
  message: string;

  /** Impact on confidence */
  confidenceImpact: 'high' | 'medium' | 'low';

  /** How to remediate */
  remediation: {
    steps: string[];
    configPath?: string;
    documentationUrl?: string;
  };

  /** Decision degradation */
  degradeTo: 'pass' | 'warn' | 'block';

  /** Related rule */
  sourceRule: {
    ruleId: string;
    ruleName: string;
  };
}

/**
 * Normalized Evaluation Result - Canonical model for all evaluations
 * This is the single source of truth for rendering output
 *
 * Structure follows the "Ultimate Track A Output" format:
 * - DetectedSurfaces[] (what changed)
 * - Obligations[] (what contracts that implies)
 * - Findings[] (what we found)
 * - NotEvaluable[] (what we couldn't verify)
 * - Decision (final outcome)
 * - NextActions[] (what to do next)
 */
export interface NormalizedEvaluationResult {
  /** Detected change surfaces */
  surfaces: DetectedSurface[];

  /** Expected obligations (generated from surfaces + rules) */
  obligations: NormalizedObligation[];

  /** Findings (violations or successes) */
  findings: NormalizedFinding[];

  /** Not-evaluable items (policy quality issues) */
  notEvaluable: NotEvaluableItem[];

  /** Final decision */
  decision: {
    outcome: 'pass' | 'warn' | 'block';
    reason: string; // 1-2 sentence summary
    contributingFactors: Array<{
      type: 'blocking_issue' | 'warning' | 'not_evaluable';
      count: number;
      description: string;
    }>;
  };

  /** Confidence score (3-layer model) */
  confidence: {
    score: number; // 0-100 (aggregate = min of applicability + evidence)
    level: 'high' | 'medium' | 'low';
    degradationReasons: string[];
    // CRITICAL FIX: 3-layer breakdown
    applicabilityConfidence?: {
      score: number;
      level: 'high' | 'medium' | 'low';
      reason: string;
    };
    evidenceConfidence: {
      score: number;
      level: 'high' | 'medium' | 'low';
      reason: string;
    };
  };

  /** Next best actions (prioritized) */
  nextActions: Array<{
    priority: number;
    action: string;
    category: 'fix_blocking' | 'fix_warning' | 'configure_policy' | 'request_approval';
    relatedFindingIds?: string[];
  }>;

  /** Metadata */
  metadata: {
    packId: string;
    packName: string;
    packVersion: string;
    evaluationTimeMs: number;
    timestamp: string;
  };

  /** Repository classification (for contextualized guidance) */
  repoClassification?: RepoClassification;
}

/**
 * Repository Classification
 * Deterministic classification of the repository based on file structure
 */
export interface RepoClassification {
  repoType: 'service' | 'library' | 'infra' | 'monorepo' | 'docs' | 'unknown';
  serviceTier: 'tier-1' | 'tier-2' | 'tier-3' | 'unknown';
  hasDeployment: boolean;
  hasDatabase: boolean;
  primaryLanguages: string[];
  confidence: number;
  evidence: string[];
  metadata: {
    hasDockerfile?: boolean;
    hasK8s?: boolean;
    hasTerraform?: boolean;
    hasServiceCatalog?: boolean;
    hasSLO?: boolean;
    hasRunbook?: boolean;
    hasMonorepoMarkers?: boolean;
  };

  /** CRITICAL FIX: Detailed confidence breakdown */
  confidenceBreakdown?: {
    repoTypeConfidence: number;
    repoTypeSource: 'explicit' | 'inferred';
    repoTypeEvidence: string[];

    tierConfidence: number;
    tierSource: 'explicit' | 'inferred' | 'unknown';
    tierEvidence: string[];
  };
}

/**
 * Obligation Applicability
 * Determines if an obligation applies to this specific repository
 */
export interface ObligationApplicability {
  obligationId: string;
  applies: boolean;
  reason: string;
  confidence: number;
  evidence: string[];
  /** Recommended status if not applicable */
  recommendedStatus?: 'not_applicable' | 'not_evaluable';
}

/**
 * Risk Score
 * Deterministic risk scoring for findings
 */
export interface RiskScore {
  score: number; // 0-100
  factors: {
    blastRadius: number;      // 0-30 (how many systems affected)
    criticality: number;      // 0-30 (service tier, compliance)
    immediacy: number;        // 0-20 (blocks merge vs tech debt)
    dependency: number;       // 0-20 (blocks other work)
  };
  reasoning: string;

  /** CRITICAL FIX: Transparent risk drivers */
  drivers?: {
    blastRadiusReason: string;
    criticalityReason: string;
    immediacyReason: string;
    dependencyReason: string;
  };
}
