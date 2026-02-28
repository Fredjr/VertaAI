/**
 * Governance IR v1.0 - Runtime Schema Validation
 * 
 * This module defines Zod schemas for runtime validation of the Governance IR.
 * These schemas enforce strict typing and prevent invalid IR from reaching the renderer.
 * 
 * Key Principles:
 * - All IR must be validated before rendering
 * - Enums are strict (no string literals)
 * - Version is mandatory (enables future migrations)
 * - Validation errors are actionable
 * 
 * Migration Strategy:
 * - Phase 5.1: Create schemas (this file)
 * - Phase 5.2: Add runtime validation to renderer
 * - Phase 5.3: Deprecate TypeScript-only types
 * - Phase 5.4: Remove TypeScript types (use Zod inference)
 */

import { z } from 'zod';

// ============================================================================
// VERSION
// ============================================================================

/**
 * IR Version Schema
 * MUST be "1.0" for this version of the schema
 */
export const irVersionSchema = z.literal('1.0');

// ============================================================================
// ENUMS (Strict Runtime Validation)
// ============================================================================

/**
 * Obligation Status
 * Replaces string literal union with strict enum
 */
export const obligationStatusSchema = z.enum([
  'PASS',
  'FAIL',
  'SUPPRESSED',
  'NOT_EVALUABLE',
  'INFO',
]);

/**
 * Obligation Scope
 * Replaces string literal union with strict enum
 */
export const obligationScopeSchema = z.enum([
  'repo_invariant',
  'diff_derived',
  'environment_gate',
]);

/**
 * Decision on Fail
 * Replaces string literal union with strict enum
 */
export const decisionOnFailSchema = z.enum([
  'block',
  'warn',
  'pass',
]);

/**
 * Reason Code
 * Strict enum for all possible failure reasons
 */
export const reasonCodeSchema = z.enum([
  // Success
  'PASS',
  
  // File-based
  'FILE_MISSING',
  'FILE_INVALID',
  'FILE_OUTDATED',
  
  // Content-based
  'CONTENT_MISSING',
  'CONTENT_INVALID',
  'CONTENT_INCOMPLETE',
  
  // Parity-based
  'PARITY_VIOLATION',
  'BREAKING_CHANGE',
  
  // Approval-based
  'APPROVAL_MISSING',
  'APPROVAL_INSUFFICIENT',
  
  // Check-based
  'CHECK_FAILED',
  'CHECK_MISSING',
  
  // Artifact-based
  'ARTIFACT_MISSING',
  'ARTIFACT_OUTDATED',
  
  // Suppression
  'SUPPRESSED_BY_OVERLAY',
  
  // Not evaluable
  'NOT_EVALUABLE',
  
  // Unknown
  'UNKNOWN',
]);

/**
 * Evidence Type
 * Strict enum for all evidence types
 * PHASE 6: Added cross-artifact evidence types
 */
export const evidenceTypeSchema = z.enum([
  // Basic evidence types
  'file',
  'content',
  'checkrun',
  'approval',
  'artifact',
  'api_call',
  // PHASE 6: Cross-artifact evidence types
  'dashboard_alert_reference',
  'openapi_code_reference',
  'schema_migration_reference',
  'slo_alert_reference',
  'runbook_alert_reference',
]);

/**
 * Evidence Search Strategy
 */
export const evidenceSearchStrategySchema = z.enum([
  'file_presence',
  'content_parsing',
  'api_query',
  'heuristic',
  'not_applicable',
]);

/**
 * Confidence Level
 */
export const confidenceLevelSchema = z.enum([
  'HIGH',
  'MEDIUM',
  'LOW',
]);

/**
 * Confidence Basis
 */
export const confidenceBasisSchema = z.enum([
  'explicit_manifest',
  'inferred_signals',
  'default_assumption',
  'deterministic_baseline',
  'diff_analysis',
  'heuristic',
  'file_present',
  'content_parsed',
  'api_verified',
  'inferred',
  'deterministic',
  'threshold_based',
  'llm_assisted',
]);

// ============================================================================
// EVIDENCE SCHEMAS
// ============================================================================

/**
 * Cross-Artifact Reference Schema (PHASE 6)
 * Enables cross-artifact invariant checks
 */
export const crossArtifactReferenceSchema = z.object({
  // Source artifact
  source: z.object({
    type: z.enum(['dashboard', 'openapi', 'schema', 'slo', 'runbook', 'code']),
    id: z.string(),
    location: z.string(),
  }),

  // Target artifact
  target: z.object({
    type: z.enum(['alert', 'code', 'migration', 'schema']),
    id: z.string(),
    location: z.string().optional(),
    found: z.boolean(),
  }),

  // Relationship
  relationship: z.enum(['references', 'implements', 'matches', 'requires']),

  // Validation
  valid: z.boolean(),
  validationDetails: z.string().optional(),
});

/**
 * Evidence Item Schema
 * PHASE 6: Added optional cross-artifact reference
 */
export const evidenceItemSchema = z.object({
  type: evidenceTypeSchema,
  location: z.string(),
  found: z.boolean(),
  details: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  crossArtifactRef: crossArtifactReferenceSchema.optional(), // PHASE 6
});

/**
 * Evidence Search Schema
 */
export const evidenceSearchSchema = z.object({
  locationsSearched: z.array(z.string()),
  strategy: evidenceSearchStrategySchema,
  confidence: z.number().min(0).max(1),
});

// ============================================================================
// REMEDIATION SCHEMAS
// ============================================================================

/**
 * Remediation Schema
 */
export const remediationSchema = z.object({
  minimumToPass: z.array(z.string()),
  patch: z.string().nullable(),
  links: z.array(z.object({
    title: z.string(),
    url: z.string(),
  })),
  owner: z.union([
    z.string(),
    z.object({
      team: z.string().optional(),
      individuals: z.array(z.string()).optional(),
      codeownersPath: z.string().optional(),
    }),
  ]).nullable(),
});

// ============================================================================
// RISK SCHEMAS
// ============================================================================

/**
 * Risk Breakdown Schema
 */
export const riskBreakdownSchema = z.object({
  blastRadius: z.number().min(0).max(10),
  criticality: z.number().min(0).max(10),
  immediacy: z.number().min(0).max(10),
  dependency: z.number().min(0).max(10),
});

/**
 * Risk Reasons Schema
 */
export const riskReasonsSchema = z.object({
  blastRadius: z.string().nullable(),
  criticality: z.string().nullable(),
  immediacy: z.string().nullable(),
  dependency: z.string().nullable(),
});

/**
 * Risk Score Schema
 */
export const riskScoreSchema = z.object({
  total: z.number().min(0).max(10),
  breakdown: riskBreakdownSchema,
  reasons: riskReasonsSchema,
});

// ============================================================================
// CONFIDENCE SCHEMAS
// ============================================================================

/**
 * Confidence Component Schema
 * Used for classification, applicability, evidence, decision
 */
export const confidenceComponentSchema = z.object({
  score: z.number().min(0).max(1),
  level: confidenceLevelSchema,
  basis: confidenceBasisSchema,
  degradationReasons: z.array(z.string()).optional(),
  contributingFactors: z.array(z.string()).optional(),
});

/**
 * Confidence Breakdown Schema (Legacy - to be deprecated)
 * Phase 5: Keep for backward compatibility
 * Phase 6: Replace with vector model
 */
export const confidenceBreakdownLegacySchema = z.object({
  applicability: z.number().min(0).max(1),
  evidence: z.number().min(0).max(1),
  overall: z.number().min(0).max(1),
});

/**
 * Confidence Vector Schema (NEW - Phase 6)
 * This is the target model for confidence
 */
export const confidenceVectorSchema = z.object({
  classification: confidenceComponentSchema,
  applicability: confidenceComponentSchema,
  evidence: confidenceComponentSchema,
  decision: confidenceComponentSchema,
});

// ============================================================================
// OBLIGATION RESULT SCHEMA
// ============================================================================

/**
 * Obligation Result Schema
 * Core unit of governance output
 */
export const obligationResultSchema = z.object({
  // Identity
  id: z.string().regex(
    /^[a-z0-9_-]+:[a-z0-9_-]+:[a-z0-9_]+$/,
    'Obligation ID must match pattern: packId:ruleId:scope'
  ),
  title: z.string().min(1),
  controlObjective: z.string().min(1),

  // Status
  status: obligationStatusSchema,
  scope: obligationScopeSchema,
  decisionOnFail: decisionOnFailSchema,

  // Reason
  reasonCode: reasonCodeSchema,
  reasonHuman: z.string(),

  // Evidence
  evidence: z.array(evidenceItemSchema),
  evidenceSearch: evidenceSearchSchema,

  // Remediation
  remediation: remediationSchema,

  // Risk
  risk: riskScoreSchema,

  // Confidence (legacy for now)
  confidence: confidenceBreakdownLegacySchema,
});

// ============================================================================
// DETECTED SIGNALS SCHEMA
// ============================================================================

/**
 * Detected Signals Schema
 */
export const detectedSignalsSchema = z.object({
  repoType: z.string().optional(),
  serviceTier: z.string().optional(),
  frameworks: z.array(z.string()),
  languages: z.array(z.string()),
  infrastructurePatterns: z.array(z.string()),
});

// ============================================================================
// RUN CONTEXT SCHEMA
// ============================================================================

/**
 * Run Context Schema
 * PHASE 6: Added stable fingerprints and policy revision
 */
export const runContextSchema = z.object({
  repo: z.object({
    owner: z.string(),
    name: z.string(),
    fullName: z.string(),
  }),
  pr: z.object({
    number: z.number(),
    title: z.string(),
    branch: z.string(),
    baseBranch: z.string(),
    headSha: z.string(),
    baseSha: z.string().optional(),
    author: z.string(),
    isDraft: z.boolean(),
  }),
  workspace: z.object({
    id: z.string(),
    installationId: z.number(),
  }),
  signals: detectedSignalsSchema,
  confidence: confidenceBreakdownLegacySchema, // TODO: Migrate to vector model
  evaluatedAt: z.string().datetime(),

  // PHASE 6: Stable fingerprints for reproducibility
  evaluationFingerprint: z.string().optional(), // "sha256:abc123..."
  policyRevision: z.string().optional(), // "git:abc123" or "bundle:v1.2.3"
});

// ============================================================================
// POLICY PLAN SCHEMA
// ============================================================================

/**
 * Policy Activation Entry Schema
 */
export const policyActivationEntrySchema = z.object({
  packId: z.string(),
  packName: z.string(),
  ruleId: z.string(),
  ruleName: z.string(),
  activationReason: z.enum([
    'explicit_match',
    'inferred_applicability',
    'default_baseline',
  ]),
  confidence: z.number().min(0).max(1),
});

/**
 * Policy Suppression Entry Schema
 */
export const policySuppressionEntrySchema = z.object({
  packId: z.string(),
  ruleId: z.string(),
  suppressionReason: z.string(),
  suppressedBy: z.enum(['overlay', 'exception', 'policy_config']),
});

/**
 * Policy Plan Schema
 */
export const policyPlanSchema = z.object({
  activatedPolicies: z.array(policyActivationEntrySchema),
  suppressedPolicies: z.array(policySuppressionEntrySchema),
  totalConsidered: z.number(),
  totalActivated: z.number(),
  totalSuppressed: z.number(),
});

// ============================================================================
// SUMMARY SCHEMA
// ============================================================================

/**
 * Summary Counts Schema
 */
export const summaryCountsSchema = z.object({
  considered: z.number().min(0),
  enforced: z.number().min(0),
  suppressed: z.number().min(0),
  notEvaluable: z.number().min(0),
  informational: z.number().min(0),
});

/**
 * Summary Decision Schema
 */
export const summaryDecisionSchema = z.object({
  outcome: z.enum(['pass', 'warn', 'block']),
  basis: z.string(),
  contributingFactors: z.array(z.string()),
});

/**
 * Summary Schema
 */
export const summarySchema = z.object({
  counts: summaryCountsSchema,
  decision: summaryDecisionSchema,
  confidence: confidenceBreakdownLegacySchema, // TODO: Migrate to vector model
});

// ============================================================================
// CONTRACT VIOLATION SCHEMA
// ============================================================================

/**
 * Contract Violation Schema
 */
export const contractViolationSchema = z.object({
  invariantId: z.string(),
  severity: z.enum(['error', 'warning']),
  message: z.string(),
  details: z.record(z.any()).optional(),
});

// ============================================================================
// GOVERNANCE OUTPUT CONTRACT SCHEMA
// ============================================================================

/**
 * Governance Output Contract Schema
 */
export const governanceOutputContractSchema = z.object({
  counts: summaryCountsSchema,
  decision: summaryDecisionSchema,
  confidence: confidenceBreakdownLegacySchema,
  obligations: z.array(obligationResultSchema),
  violations: z.array(contractViolationSchema),
});

// ============================================================================
// GOVERNANCE IR SCHEMA (Top-Level)
// ============================================================================

/**
 * Governance IR Schema v1.0
 * This is the top-level schema that all IR must conform to
 */
export const governanceIRSchema = z.object({
  // Version (mandatory)
  irVersion: irVersionSchema,

  // Core components
  runContext: runContextSchema,
  policyPlan: policyPlanSchema,
  obligationResults: z.array(obligationResultSchema),

  // Summary
  summary: summarySchema,

  // Contract (validated)
  contract: governanceOutputContractSchema.optional(),
});

// ============================================================================
// TYPE INFERENCE (Use Zod schemas as source of truth)
// ============================================================================

export type IRVersion = z.infer<typeof irVersionSchema>;
export type ObligationStatus = z.infer<typeof obligationStatusSchema>;
export type ObligationScope = z.infer<typeof obligationScopeSchema>;
export type DecisionOnFail = z.infer<typeof decisionOnFailSchema>;
export type ReasonCode = z.infer<typeof reasonCodeSchema>;
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;
export type EvidenceSearchStrategy = z.infer<typeof evidenceSearchStrategySchema>;
export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;
export type ConfidenceBasis = z.infer<typeof confidenceBasisSchema>;

export type EvidenceItem = z.infer<typeof evidenceItemSchema>;
export type EvidenceSearch = z.infer<typeof evidenceSearchSchema>;
export type Remediation = z.infer<typeof remediationSchema>;
export type RiskBreakdown = z.infer<typeof riskBreakdownSchema>;
export type RiskReasons = z.infer<typeof riskReasonsSchema>;
export type RiskScore = z.infer<typeof riskScoreSchema>;
export type ConfidenceComponent = z.infer<typeof confidenceComponentSchema>;
export type ConfidenceBreakdownLegacy = z.infer<typeof confidenceBreakdownLegacySchema>;
export type ConfidenceVector = z.infer<typeof confidenceVectorSchema>;

export type ObligationResult = z.infer<typeof obligationResultSchema>;
export type DetectedSignals = z.infer<typeof detectedSignalsSchema>;
export type RunContext = z.infer<typeof runContextSchema>;
export type PolicyActivationEntry = z.infer<typeof policyActivationEntrySchema>;
export type PolicySuppressionEntry = z.infer<typeof policySuppressionEntrySchema>;
export type PolicyPlan = z.infer<typeof policyPlanSchema>;
export type SummaryCounts = z.infer<typeof summaryCountsSchema>;
export type SummaryDecision = z.infer<typeof summaryDecisionSchema>;
export type Summary = z.infer<typeof summarySchema>;
export type ContractViolation = z.infer<typeof contractViolationSchema>;
export type GovernanceOutputContract = z.infer<typeof governanceOutputContractSchema>;
export type GovernanceIR = z.infer<typeof governanceIRSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate Governance IR
 * Throws ZodError if validation fails
 */
export function validateGovernanceIR(data: unknown): GovernanceIR {
  return governanceIRSchema.parse(data);
}

/**
 * Safe Validate Governance IR
 * Returns success/error result instead of throwing
 */
export function safeValidateGovernanceIR(data: unknown): {
  success: boolean;
  data?: GovernanceIR;
  error?: z.ZodError;
} {
  const result = governanceIRSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error };
  }
}

/**
 * Validate Obligation Result
 */
export function validateObligationResult(data: unknown): ObligationResult {
  return obligationResultSchema.parse(data);
}

/**
 * Validate Obligation ID Format
 * Ensures ID follows pattern: packId:ruleId:scope
 */
export function validateObligationId(id: string): boolean {
  return /^[a-z0-9_-]+:[a-z0-9_-]+:[a-z0-9_]+$/.test(id);
}

/**
 * Parse Obligation ID into components
 */
export function parseObligationId(id: string): {
  packId: string;
  ruleId: string;
  scope: string;
} | null {
  const match = id.match(/^([a-z0-9_-]+):([a-z0-9_-]+):([a-z0-9_]+)$/);
  if (!match) return null;

  return {
    packId: match[1],
    ruleId: match[2],
    scope: match[3],
  };
}

/**
 * Build Obligation ID from components
 */
export function buildObligationId(packId: string, ruleId: string, scope: ObligationScope): string {
  return `${packId}:${ruleId}:${scope}`;
}

