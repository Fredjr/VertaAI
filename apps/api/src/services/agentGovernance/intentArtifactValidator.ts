/**
 * Intent Artifact Validator
 * Zod schemas for runtime validation of intent artifacts
 */

import { z } from 'zod';

// ======================================================================
// ENUMS
// ======================================================================

export const AuthorTypeSchema = z.enum(['HUMAN', 'AGENT', 'UNKNOWN']);

export const CapabilityTypeSchema = z.enum([
  'db_read',
  'db_write',
  'db_admin',
  's3_read',
  's3_write',
  's3_delete',
  'api_endpoint',
  'iam_modify',
  'infra_create',
  'infra_modify',
  'infra_delete',
  'secret_read',
  'secret_write',
  'network_public',
  'network_private',
  'cost_increase',
  'schema_modify',
  'deployment_modify',
]);

// ======================================================================
// AGENT IDENTITY
// ======================================================================

export const AgentIdentitySchema = z.object({
  id: z.string().min(1).describe('Agent ID (e.g., cursor, copilot)'),
  version: z.string().min(1).describe('Agent version (e.g., v1.2.3)'),
  platform: z.string().optional().describe('Platform (e.g., vscode, jetbrains)'),
});

// ======================================================================
// CAPABILITY
// ======================================================================

export const CapabilitySchema = z.object({
  type: CapabilityTypeSchema,
  resource: z.string().min(1).describe('Resource identifier'),
  scope: z.string().optional().describe('Scope of capability'),
  justification: z.string().optional().describe('Justification for capability'),
});

// ======================================================================
// CONSTRAINTS
// ======================================================================

export const ConstraintsSchema = z.object({
  read_only: z.boolean().optional(),
  no_new_infra: z.boolean().optional(),
  least_privilege: z.boolean().optional(),
  max_cost_increase: z.string().optional(),
  no_schema_changes: z.boolean().optional(),
  no_public_endpoints: z.boolean().optional(),
  require_tests: z.boolean().optional(),
  require_docs: z.boolean().optional(),
});

// ======================================================================
// EXPECTED SIDE EFFECTS
// ======================================================================

export const ExpectedSideEffectsSchema = z.object({
  creates_table: z.boolean().optional(),
  modifies_schema: z.boolean().optional(),
  changes_permissions: z.boolean().optional(),
  adds_dependencies: z.array(z.string()).optional(),
  creates_infra: z.array(z.string()).optional(),
  modifies_api: z.array(z.string()).optional(),
  increases_cost: z.string().optional(),
});

// ======================================================================
// RISK ACKNOWLEDGEMENT
// ======================================================================

export const RiskAcknowledgementSchema = z.object({
  type: z.string().min(1).describe('Risk type'),
  justification: z.string().min(1).describe('Justification for accepting risk'),
  approved_by: z.string().min(1).describe('Approver identifier'),
  approved_at: z.string().optional().describe('ISO timestamp'),
  approval_tier: z.enum(['tier-1', 'tier-2', 'tier-3']).optional(),
});

// ======================================================================
// EXTERNAL LINKS
// ======================================================================

export const ExternalLinksSchema = z.object({
  ticket: z.string().optional(),
  design_doc: z.string().url().optional(),
  prd: z.string().url().optional(),
  runbook: z.string().url().optional(),
  slack_thread: z.string().url().optional(),
});

// ======================================================================
// SIGNATURE INFO
// ======================================================================

export const SignatureInfoSchema = z.object({
  signed_by: z.string().min(1),
  signed_at: z.string().min(1).describe('ISO timestamp'),
  approval_tier: z.enum(['tier-1', 'tier-2', 'tier-3']),
  approval_method: z.enum(['manual', 'automated', 'policy-based']),
  signature_hash: z.string().optional().describe('SHA-256 hash'),
});

// ======================================================================
// INTENT ARTIFACT (PARTIAL - FOR INGESTION)
// ======================================================================

export const IntentArtifactInputSchema = z.object({
  author: z.string().min(1),
  authorType: AuthorTypeSchema,
  agentIdentity: z.string().optional().describe('JSON string of AgentIdentity'),
  
  requestedCapabilities: z.array(CapabilitySchema).min(1),
  constraints: ConstraintsSchema.default({}),
  affectedServices: z.array(z.string()).default([]),
  expectedSideEffects: ExpectedSideEffectsSchema.default({}),
  riskAcknowledgements: z.array(RiskAcknowledgementSchema).default([]),
  
  links: ExternalLinksSchema.optional(),
  signature: SignatureInfoSchema.optional(),
});

// ======================================================================
// VALIDATION FUNCTIONS
// ======================================================================

export function validateIntentArtifact(data: unknown) {
  return IntentArtifactInputSchema.safeParse(data);
}

export function validateCapability(data: unknown) {
  return CapabilitySchema.safeParse(data);
}

export function validateConstraints(data: unknown) {
  return ConstraintsSchema.safeParse(data);
}

// ======================================================================
// TYPE EXPORTS
// ======================================================================

export type ValidatedIntentArtifact = z.infer<typeof IntentArtifactInputSchema>;
export type ValidatedCapability = z.infer<typeof CapabilitySchema>;
export type ValidatedConstraints = z.infer<typeof ConstraintsSchema>;

