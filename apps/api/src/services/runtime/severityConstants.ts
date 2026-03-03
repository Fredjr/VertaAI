/**
 * Shared Severity Constants — Runtime Capability Governance
 *
 * Single source of truth for the 18-type capability-to-severity mapping,
 * observation recency decay, and source-reliability confidence scoring.
 *
 * LATTICE (18 types):
 *   Critical: iam_modify, secret_write, db_admin, infra_delete, deployment_modify
 *   High:     s3_delete, s3_write, schema_modify, network_public, infra_create, infra_modify, secret_read
 *   Medium:   all other undeclared usage (privilege expansion is never low)
 *   Low:      unused_declaration only
 *
 * INTELLIGENCE:
 *   - Source confidence: structured audit logs (0.95) > inferred signals (0.75)
 *   - Recency decay: weight 1.0 within 24 h, decays to 0.3 beyond 5 days
 *   - effectiveSeverity = applyDecayAndConfidence(baseSeverity, recencyWeight, confidence)
 */

import type { CapabilityType } from '../../types/agentGovernance.js';

/**
 * Capability types whose undeclared usage requires immediate security review.
 */
export const CRITICAL_CAPABILITIES: CapabilityType[] = [
  'iam_modify',
  'secret_write',
  'db_admin',
  'infra_delete',
  'deployment_modify',
];

/**
 * Capability types whose undeclared usage is sensitive and should be escalated.
 */
export const HIGH_CAPABILITIES: CapabilityType[] = [
  's3_delete',
  's3_write',
  'schema_modify',
  'network_public',
  'infra_create',
  'infra_modify',
  'secret_read',
];

/**
 * Calculate severity for a single undeclared capability type.
 * Any undeclared usage is minimum medium — privilege expansion is never low.
 */
export function calculateCapabilitySeverity(
  capabilityType: CapabilityType,
): 'low' | 'medium' | 'high' | 'critical' {
  if (CRITICAL_CAPABILITIES.includes(capabilityType)) return 'critical';
  if (HIGH_CAPABILITIES.includes(capabilityType)) return 'high';
  return 'medium';
}

/**
 * Calculate aggregate severity across a set of drift items.
 * Low is reserved exclusively for clusters with zero undeclared usage
 * (i.e., only over-scoped declarations).
 *
 * @param drifts - Array of CapabilityDrift objects (must have driftType and capabilityType fields)
 */
export function calculateDriftSeverity(
  drifts: Array<{ driftType: string; capabilityType: string }>,
): 'critical' | 'high' | 'medium' | 'low' {
  const undeclaredUsage = drifts.filter(d => d.driftType === 'undeclared_usage');
  if (undeclaredUsage.length === 0) return 'low';
  if (undeclaredUsage.some(d => CRITICAL_CAPABILITIES.includes(d.capabilityType as CapabilityType))) {
    return 'critical';
  }
  if (undeclaredUsage.some(d => HIGH_CAPABILITIES.includes(d.capabilityType as CapabilityType))) {
    return 'high';
  }
  return 'medium';
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE CONFIDENCE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reliability confidence per observation source [0.0–1.0].
 *
 * Rationale:
 * - Structured audit APIs (CloudTrail, GCP Audit) are deterministic → 0.95
 * - Azure Activity Log is similarly authoritative → 0.90
 * - APM traces (Datadog) correlate well but infer capability from spans → 0.85
 * - Cost Explorer signals cost spikes but not the specific operation → 0.80
 * - Raw DB query logs require regex parsing — prone to false positives → 0.75
 * - Manual inputs are operator-asserted — highly variable → 0.50
 */
export const SOURCE_CONFIDENCE: Record<string, number> = {
  aws_cloudtrail: 0.95,
  gcp_audit_log: 0.95,
  azure_activity_log: 0.90,
  datadog_apm: 0.85,
  cost_explorer: 0.80,
  database_query_log: 0.75,
  manual: 0.50,
};

/**
 * Compute the recency weight for an observation based on how old `lastSeen` is.
 * Returns 1.0 for fresh observations, decaying to 0.3 for stale ones.
 *
 * Buckets:
 *  ≤24 h  → 1.0  (active, high concern)
 *  ≤72 h  → 0.7  (recent, moderate concern)
 *  ≤120 h → 0.5  (aging, lower concern)
 *  >120 h → 0.3  (stale — may have already been remediated)
 */
export function computeRecencyWeight(lastSeen: Date): number {
  const ageHours = (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60);
  if (ageHours <= 24) return 1.0;
  if (ageHours <= 72) return 0.7;
  if (ageHours <= 120) return 0.5;
  return 0.3;
}

/**
 * Compute the effective confidence for a capability across multiple sources.
 * Uses the MAXIMUM across sources: if any high-confidence source saw it, trust it.
 */
export function computeSourceConfidence(sources: string[]): number {
  if (sources.length === 0) return 0.5;
  return Math.max(...sources.map(s => SOURCE_CONFIDENCE[s] ?? 0.5));
}

/**
 * Apply decay and confidence adjustments to a base severity.
 *
 * Adjustment rules:
 * - combinedFactor (recencyWeight × confidence) < 0.30 → downgrade by 2 steps
 * - combinedFactor < 0.55 → downgrade by 1 step
 * - Otherwise: keep base severity
 *
 * Hard floor: undeclared_usage is never below 'medium' (privilege expansion
 * is always a security concern regardless of observation age).
 */
export function applyDecayAndConfidence(
  baseSeverity: 'low' | 'medium' | 'high' | 'critical',
  recencyWeight: number,
  confidence: number,
): 'low' | 'medium' | 'high' | 'critical' {
  const SEVERITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  const SEVERITY_ARRAY = ['low', 'medium', 'high', 'critical'] as const;

  const base = SEVERITY_RANK[baseSeverity];
  const combinedFactor = recencyWeight * confidence;

  let adjusted = base;
  if (combinedFactor < 0.30 && base >= 2) {
    adjusted = base - 2; // critical → medium, high → low (but floor applies below)
  } else if (combinedFactor < 0.55 && base >= 2) {
    adjusted = base - 1; // critical → high, high → medium
  }

  // Hard floor at 'medium' for undeclared_usage (privilege expansion is never low-severity)
  const floored = Math.max(adjusted, SEVERITY_RANK['medium']);
  return SEVERITY_ARRAY[floored];
}

// ─────────────────────────────────────────────────────────────────────────────
// SEVERITY RATIONALE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Human-readable explanation of why a severity was assigned.
 * Used in DriftCluster.clusterSummary for operator clarity.
 */
export function buildSeverityRationale(
  undeclaredUsage: Array<{ capabilityType: string }>,
  severity: string,
): string {
  if (undeclaredUsage.length === 0) {
    return 'No undeclared capabilities; only over-scoped declarations.';
  }
  const criticalCaps = undeclaredUsage.filter(d =>
    CRITICAL_CAPABILITIES.includes(d.capabilityType as CapabilityType),
  );
  const highCaps = undeclaredUsage.filter(d =>
    HIGH_CAPABILITIES.includes(d.capabilityType as CapabilityType),
  );
  if (criticalCaps.length > 0) {
    return `Critical: undeclared ${criticalCaps.map(d => d.capabilityType).join(', ')} detected — requires immediate security review.`;
  }
  if (highCaps.length > 0) {
    return `High: undeclared ${highCaps.map(d => d.capabilityType).join(', ')} — sensitive capability used without spec declaration.`;
  }
  return `Medium: ${undeclaredUsage.length} capability(ies) used at runtime without intent declaration — privilege expansion detected.`;
}
