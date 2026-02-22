/**
 * Invariant Catalog
 *
 * Maps each InvariantTypeId to its default decision policy per maturity tier
 * (Starter / Standard / Strict). These defaults apply when a rule's
 * `checks.invariants[].decision` block is absent.
 *
 * Decision shape:
 *   - string shorthand: applies to all branches
 *   - object: branch-specific (protectedBranches / featureBranches)
 *
 * Guiding principles from §3A:
 *   Starter  – High signal, low friction; mostly WARN; block obvious footguns only.
 *   Standard – "Production safe"; block on contract breakage + missing required artifacts.
 *   Strict   – "Regulated / high-criticality"; block on most parity failures + require approvals.
 */

import { InvariantTypeId } from './types.js';

export type TierDecision =
  | 'pass' | 'warn' | 'block'
  | { protectedBranches: 'pass' | 'warn' | 'block'; featureBranches: 'pass' | 'warn' | 'block' };

export interface InvariantTierDefaults {
  starter:  TierDecision;
  standard: TierDecision;
  strict:   TierDecision;
}

export const INVARIANT_CATALOG: Record<InvariantTypeId, InvariantTierDefaults> = {

  // ── API invariants (§2A) ─────────────────────────────────────────────────
  [InvariantTypeId.API_SPEC_IMPL_PARITY]: {
    starter:  'warn',
    standard: { protectedBranches: 'block', featureBranches: 'warn' },
    strict:   'block',
  },
  [InvariantTypeId.API_SPEC_GATEWAY_PARITY]: {
    starter:  'warn',
    standard: { protectedBranches: 'block', featureBranches: 'warn' },
    strict:   'block',
  },
  [InvariantTypeId.API_BACKWARD_COMPATIBILITY]: {
    starter:  'warn',
    standard: 'block',
    strict:   'block',
  },
  [InvariantTypeId.API_AUTH_PARITY]: {
    starter:  'warn',
    standard: { protectedBranches: 'block', featureBranches: 'warn' },
    strict:   'block',
  },
  [InvariantTypeId.API_VERSION_PARITY]: {
    starter:  'warn',
    standard: 'warn',
    strict:   { protectedBranches: 'block', featureBranches: 'warn' },
  },
  [InvariantTypeId.API_ERROR_CONTRACT_INVARIANTS]: {
    starter:  'warn',
    standard: 'warn',
    strict:   { protectedBranches: 'block', featureBranches: 'warn' },
  },
  [InvariantTypeId.API_DEPRECATION_POLICY]: {
    starter:  'warn',
    standard: 'warn',
    strict:   'warn',
  },
  [InvariantTypeId.API_RATELIMIT_CONTRACT_PRESENT]: {
    starter:  'warn',
    standard: 'warn',
    strict:   { protectedBranches: 'block', featureBranches: 'warn' },
  },
  [InvariantTypeId.API_SENSITIVE_FIELD_POLICY]: {
    starter:  'warn',
    standard: { protectedBranches: 'block', featureBranches: 'warn' },
    strict:   'block',
  },

  // ── DB invariants (§2B) ──────────────────────────────────────────────────
  [InvariantTypeId.DB_SCHEMA_MIGRATION_PARITY]: {
    starter:  'warn',
    standard: 'block',
    strict:   'block',
  },
  [InvariantTypeId.DB_MIGRATION_HYGIENE]: {
    starter:  'warn',
    standard: 'warn',
    strict:   { protectedBranches: 'block', featureBranches: 'warn' },
  },
  [InvariantTypeId.DB_RISKY_OPS_DETECTED]: {
    starter:  'warn',
    standard: { protectedBranches: 'block', featureBranches: 'warn' },
    strict:   'block',
  },
  [InvariantTypeId.DB_ROLLBACK_READINESS]: {
    starter:  'warn',
    standard: 'warn',
    strict:   { protectedBranches: 'block', featureBranches: 'warn' },
  },
  [InvariantTypeId.DB_INDEX_FK_INVARIANTS]: {
    starter:  'warn',
    standard: 'warn',
    strict:   'warn',
  },
  [InvariantTypeId.DB_SENSITIVE_TABLE_POLICY]: {
    starter:  'warn',
    standard: { protectedBranches: 'block', featureBranches: 'warn' },
    strict:   'block',
  },
  [InvariantTypeId.DB_ONLINE_MIGRATION_POLICY]: {
    starter:  'warn',
    standard: 'warn',
    strict:   { protectedBranches: 'block', featureBranches: 'warn' },
  },

  // ── Infra invariants (§2C) ────────────────────────────────────────────────
  [InvariantTypeId.TERRAFORM_PLAN_EVIDENCE_PRESENT]: {
    starter:  'warn',
    standard: { protectedBranches: 'block', featureBranches: 'warn' },
    strict:   'block',
  },
  [InvariantTypeId.INFRA_EXPOSURE_CHANGE_DETECTED]: {
    starter:  'warn',
    standard: { protectedBranches: 'block', featureBranches: 'warn' },
    strict:   'block',
  },
  [InvariantTypeId.IAM_WILDCARD_DETECTION]: {
    starter:  'warn',
    standard: 'block',
    strict:   'block',
  },
  // Plaintext secrets: obvious footgun — block at ALL tiers per §3A
  [InvariantTypeId.PLAINTEXT_SECRET_DETECTION]: {
    starter:  'block',
    standard: 'block',
    strict:   'block',
  },
  [InvariantTypeId.NETWORK_POLICY_GUARDRAILS]: {
    starter:  'warn',
    standard: { protectedBranches: 'block', featureBranches: 'warn' },
    strict:   'block',
  },
  [InvariantTypeId.ENV_PARITY_CHECK]: {
    starter:  'warn',
    standard: 'warn',
    strict:   { protectedBranches: 'block', featureBranches: 'warn' },
  },
  [InvariantTypeId.INFRA_REQUIRED_TAGS_AND_MODULES]: {
    starter:  'warn',
    standard: 'warn',
    strict:   { protectedBranches: 'block', featureBranches: 'warn' },
  },

  // ── Observability invariants (§2D) ────────────────────────────────────────
  [InvariantTypeId.ALERT_HAS_RUNBOOK_REFERENCE]: {
    starter:  'warn',
    standard: { protectedBranches: 'block', featureBranches: 'warn' },
    strict:   'block',
  },
  [InvariantTypeId.ALERT_ROUTING_OWNER_PARITY]: {
    starter:  'warn',
    standard: 'warn',
    strict:   { protectedBranches: 'block', featureBranches: 'warn' },
  },
  [InvariantTypeId.DASHBOARD_ALERT_PARITY]: {
    starter:  'warn',
    standard: 'warn',
    strict:   { protectedBranches: 'block', featureBranches: 'warn' },
  },
  [InvariantTypeId.SLO_ALERT_ALIGNMENT]: {
    starter:  'warn',
    standard: { protectedBranches: 'block', featureBranches: 'warn' },
    strict:   'block',
  },
  [InvariantTypeId.API_COVERAGE_EXPECTATION]: {
    starter:  'warn',
    standard: 'warn',
    strict:   'warn',
  },
  [InvariantTypeId.RUNBOOK_MINIMUM_REQUIREMENTS]: {
    starter:  'warn',
    standard: 'warn',
    strict:   { protectedBranches: 'block', featureBranches: 'warn' },
  },

  // ── Cross-cutting parity invariants (§2E) ────────────────────────────────
  [InvariantTypeId.CODEOWNERS_DOCS_PARITY]: {
    starter:  'warn',
    standard: 'warn',
    strict:   { protectedBranches: 'block', featureBranches: 'warn' },
  },
  [InvariantTypeId.SERVICE_OWNER_PRESENT]: {
    starter:  'warn',
    standard: { protectedBranches: 'block', featureBranches: 'warn' },
    strict:   'block',
  },
  [InvariantTypeId.ALERT_RUNBOOK_PARITY]: {
    starter:  'warn',
    standard: 'warn',
    strict:   { protectedBranches: 'block', featureBranches: 'warn' },
  },
  [InvariantTypeId.OBSERVABILITY_TRIANGLE_CONSISTENCY]: {
    starter:  'warn',
    standard: 'warn',
    strict:   'warn',
  },
  [InvariantTypeId.OWNERSHIP_ONCALL_PARITY]: {
    starter:  'warn',
    standard: 'warn',
    strict:   { protectedBranches: 'block', featureBranches: 'warn' },
  },
  // CHECKRUN_POSTED must always fire — degrade gracefully, never hard-block
  [InvariantTypeId.CHECKRUN_POSTING_POLICY]: {
    starter:  'warn',
    standard: 'warn',
    strict:   'warn',
  },
  [InvariantTypeId.WAIVER_POLICY_COMPLIANCE]: {
    starter:  'warn',
    standard: { protectedBranches: 'block', featureBranches: 'warn' },
    strict:   'block',
  },
};

/**
 * Look up the tier defaults for a given invariant type.
 * Returns undefined for unknown (custom) invariant type IDs.
 */
export function getInvariantDefaults(
  type: InvariantTypeId | string,
  tier: 'starter' | 'standard' | 'strict'
): TierDecision | undefined {
  const entry = INVARIANT_CATALOG[type as InvariantTypeId];
  return entry ? entry[tier] : undefined;
}

/**
 * Return all canonical InvariantTypeIds grouped by domain.
 * Useful for UI preset pickers and template generators.
 */
export const INVARIANT_DOMAINS = {
  api:          Object.values(InvariantTypeId).filter(id => id.startsWith('api_')),
  db:           Object.values(InvariantTypeId).filter(id => id.startsWith('db_')),
  infra:        Object.values(InvariantTypeId).filter(id => id.startsWith('terraform_') || id.startsWith('infra_') || id.startsWith('iam_') || id.startsWith('plaintext_') || id.startsWith('network_') || id.startsWith('env_')),
  observability: Object.values(InvariantTypeId).filter(id => id.startsWith('alert_') || id.startsWith('dashboard_') || id.startsWith('slo_') || id.startsWith('runbook_')),
  crossCutting: Object.values(InvariantTypeId).filter(id => id.startsWith('codeowners_') || id.startsWith('service_') || id.startsWith('observability_') || id.startsWith('ownership_') || id.startsWith('checkrun_') || id.startsWith('waiver_')),
} as const;

