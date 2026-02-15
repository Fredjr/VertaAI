/**
 * Zod Schema for contractpacks.yaml
 * 
 * Defines the structure and validation rules for YAML-based contract configuration.
 * Supports org-level, repo-level, and pack-level configuration with inheritance.
 */

import { z } from 'zod';

// ======================================================================
// ENUMS
// ======================================================================

export const SurfaceTypeSchema = z.enum([
  'api',
  'infra',
  'docs',
  'data_model',
  'observability',
  'security',
]);

export const SeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const RolloutModeSchema = z.enum(['disabled', 'warn', 'block']);

export const ArtifactTypeSchema = z.enum([
  'openapi_spec',
  'terraform_plan',
  'github_readme',
  'confluence_page',
  'notion_page',
  'markdown',
  'github_repo',
  'git_tree',
  'github_pr',
  'git_diff',
]);

// ======================================================================
// INVARIANT SCHEMA
// ======================================================================

export const InvariantSchema = z.object({
  invariantId: z.string().optional(), // Auto-generated if not provided
  comparatorType: z.string(), // e.g., "docs.required_sections", "openapi.validate"
  description: z.string().optional(),
  config: z.record(z.any()).optional(), // Comparator-specific config
  severity: SeveritySchema.optional().default('medium'),
});

export type InvariantConfig = z.infer<typeof InvariantSchema>;

// ======================================================================
// CONTRACT SCHEMA
// ======================================================================

export const ContractSchema = z.object({
  contractId: z.string().optional(), // Auto-generated if not provided
  name: z.string(),
  description: z.string().optional(),
  surfaces: z.array(SurfaceTypeSchema), // Which surfaces this contract applies to
  artifactLocations: z.array(z.object({
    artifactType: ArtifactTypeSchema,
    location: z.string(), // e.g., "docs/openapi.yaml", "terraform/main.tf"
  })),
  invariants: z.array(InvariantSchema),
});

export type ContractConfig = z.infer<typeof ContractSchema>;

// ======================================================================
// CONTRACT PACK SCHEMA
// ======================================================================

export const ContractPackSchema = z.object({
  packId: z.string().optional(), // Auto-generated if not provided
  name: z.string(),
  description: z.string().optional(),
  surfaces: z.array(SurfaceTypeSchema), // Which surfaces this pack applies to
  contracts: z.array(ContractSchema),
  rolloutMode: RolloutModeSchema.optional().default('warn'),
  enabled: z.boolean().optional().default(true),
});

export type ContractPackConfig = z.infer<typeof ContractPackSchema>;

// ======================================================================
// REPO CONFIG SCHEMA
// ======================================================================

export const RepoConfigSchema = z.object({
  repo: z.string(), // e.g., "Fredjr/VertaAI"
  packs: z.array(ContractPackSchema),
  rolloutMode: RolloutModeSchema.optional(), // Override org-level rollout mode
  enabled: z.boolean().optional().default(true),
});

export type RepoConfig = z.infer<typeof RepoConfigSchema>;

// ======================================================================
// ORG CONFIG SCHEMA
// ======================================================================

export const OrgConfigSchema = z.object({
  org: z.string(), // e.g., "Fredjr"
  rolloutMode: RolloutModeSchema.optional().default('warn'),
  enabled: z.boolean().optional().default(true),
  repos: z.array(RepoConfigSchema).optional(),
});

export type OrgConfig = z.infer<typeof OrgConfigSchema>;

// ======================================================================
// ROOT CONFIG SCHEMA
// ======================================================================

export const ContractPacksConfigSchema = z.object({
  version: z.string().default('1.0'),
  orgs: z.array(OrgConfigSchema),
  severityOverrides: z.record(SeveritySchema).optional(), // Global severity overrides
});

export type ContractPacksConfig = z.infer<typeof ContractPacksConfigSchema>;

// ======================================================================
// VALIDATION HELPERS
// ======================================================================

export function validateContractPacksConfig(data: unknown): ContractPacksConfig {
  return ContractPacksConfigSchema.parse(data);
}

export function validateContractPack(data: unknown): ContractPackConfig {
  return ContractPackSchema.parse(data);
}

export function validateContract(data: unknown): ContractConfig {
  return ContractSchema.parse(data);
}

export function validateInvariant(data: unknown): InvariantConfig {
  return InvariantSchema.parse(data);
}

// ======================================================================
// TYPE EXPORTS
// ======================================================================

export type SurfaceType = z.infer<typeof SurfaceTypeSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type RolloutMode = z.infer<typeof RolloutModeSchema>;
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

