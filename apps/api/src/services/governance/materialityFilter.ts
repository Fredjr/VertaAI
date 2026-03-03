/**
 * Materiality Filter — ATC (Air Traffic Control) Mode
 *
 * Classifies each undeclared runtime capability observation into one of three tiers
 * that determine alert routing and developer interruption level:
 *
 *   critical    — block + alert immediately (PagerDuty page, GitHub failure, Slack)
 *   operational — team review required (Slack alert only, no PD page)
 *   petty       — silent log only (no alerts, no developer interruption)
 *
 * Philosophy: interrupt developers only when it matters.
 * A single database_query_log observation is noise; a repeated IAM write in prod is not.
 *
 * CRITICAL criteria (any match → critical):
 *   - Capability is in the CRITICAL_CAPABILITIES set (iam_modify, secret_write, db_admin, infra_delete, deployment_modify)
 *   - Undeclared usage in production environment (scopeDetails.environment === 'prod')
 *   - High-severity capability observed ≥ 3 times (repeated breach is material)
 *
 * PETTY criteria (any match → petty, subject to not already being critical):
 *   - cost_increase with 'correlated' attribution — insufficient causal signal
 *   - Single observation from low-confidence sources only (database_query_log, manual)
 *
 * OPERATIONAL: everything else (default — warrants team review but not emergency)
 */

import type { CapabilityType } from '../../types/agentGovernance.js';
import { CRITICAL_CAPABILITIES, HIGH_CAPABILITIES } from '../runtime/severityConstants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type MaterialityTier = 'critical' | 'operational' | 'petty';

export interface MaterialityInput {
  capabilityType: string;
  capabilityTarget: string;
  /** Base severity from capability lattice. */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Number of distinct observations for this capability:target pair. */
  observationCount: number;
  /** Observation sources (e.g., ['aws_cloudtrail', 'cost_explorer']). */
  sources: string[];
  /** Whether the cost/resource change is causally linked to code changes. */
  attributionConfidence?: 'causal' | 'correlated';
  /** Parsed resource scope (environment, wildcard flag). */
  scopeDetails?: {
    environment: string | null;
    isWildcard: boolean;
    isExactResource?: boolean;
    resourcePath?: string | null;
  };
}

export interface MaterialityResult {
  tier: MaterialityTier;
  /** Human-readable explanation of the classification decision. */
  reason: string;
  /**
   * If true, suppress PagerDuty page and GitHub failure check-run.
   * Slack alert is also suppressed for petty tier.
   */
  suppressAlerts: boolean;
  /** If true, surface in Slack so a human can decide (operational tier only). */
  requiresHumanDecision: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-confidence observation sources
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sources whose signals should be treated as noise when seen in isolation.
 * These require corroboration from a structured audit log before triggering alerts.
 */
const LOW_CONFIDENCE_SOURCES = new Set<string>(['manual', 'database_query_log']);

// ─────────────────────────────────────────────────────────────────────────────
// Classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify the materiality of a single undeclared capability observation.
 * Call this for each item in undeclaredUsage before emitting alerts.
 */
export function classifyMateriality(input: MaterialityInput): MaterialityResult {
  const { capabilityType, severity, observationCount, sources, attributionConfidence, scopeDetails } = input;

  // ── CRITICAL ──────────────────────────────────────────────────────────────

  // 1. Capability is a known privilege-expansion or destructive type.
  //    Any use of iam_modify, secret_write, db_admin, infra_delete, deployment_modify
  //    without a spec declaration is immediately material — no count threshold needed.
  if (CRITICAL_CAPABILITIES.includes(capabilityType as CapabilityType)) {
    return {
      tier: 'critical',
      reason: `${capabilityType} is a critical privilege-expansion type — requires immediate security review regardless of observation count`,
      suppressAlerts: false,
      requiresHumanDecision: false,
    };
  }

  // 2. Undeclared usage confirmed in a production environment.
  //    Any capability, any count — prod undeclared access is always critical.
  if (scopeDetails?.environment === 'prod') {
    return {
      tier: 'critical',
      reason: `Undeclared ${capabilityType} observed in production environment (scope: ${scopeDetails?.resourcePath ?? input.capabilityTarget}) — elevated to critical`,
      suppressAlerts: false,
      requiresHumanDecision: false,
    };
  }

  // 3. Repeated undeclared high-severity capability usage.
  //    One s3_write might be a blip; three is a pattern.
  if (HIGH_CAPABILITIES.includes(capabilityType as CapabilityType) && observationCount >= 3) {
    return {
      tier: 'critical',
      reason: `${capabilityType} observed ${observationCount}× — repeated undeclared high-severity capability breach crosses materiality threshold`,
      suppressAlerts: false,
      requiresHumanDecision: false,
    };
  }

  // ── PETTY ─────────────────────────────────────────────────────────────────

  // 4. Cost increase with only correlational attribution.
  //    Temporal coincidence is not a reason to page on-call.
  if (capabilityType === 'cost_increase' && attributionConfidence === 'correlated') {
    return {
      tier: 'petty',
      reason: 'Cost increase is temporally correlated with this deployment but no direct code anchor was found — insufficient causal signal to trigger an alert',
      suppressAlerts: true,
      requiresHumanDecision: false,
    };
  }

  // 5. Single observation from exclusively low-confidence sources.
  //    database_query_log and manual inputs are noisy; one sighting is not enough.
  const allLowConfidence = sources.length > 0 && sources.every(s => LOW_CONFIDENCE_SOURCES.has(s));
  if (observationCount === 1 && allLowConfidence) {
    return {
      tier: 'petty',
      reason: `Single observation from low-confidence source(s) [${sources.join(', ')}] — insufficient signal; requires corroboration from a structured audit log`,
      suppressAlerts: true,
      requiresHumanDecision: false,
    };
  }

  // ── OPERATIONAL ───────────────────────────────────────────────────────────

  // Default: new API usage, config drift, non-prod environment, moderate signal.
  // Warrants team review but not an emergency page.
  return {
    tier: 'operational',
    reason: `${capabilityType} is an undeclared operational change — requires team review and spec update before next release`,
    suppressAlerts: false,
    requiresHumanDecision: true,
  };
}

/**
 * Compute the cluster-level materiality tier from all per-item classifications.
 * Uses the worst (most urgent) tier across all items — one critical item makes
 * the whole cluster critical.
 */
export function computeClusterMaterialityTier(items: MaterialityResult[]): MaterialityTier {
  if (items.some(r => r.tier === 'critical')) return 'critical';
  if (items.some(r => r.tier === 'operational')) return 'operational';
  return 'petty';
}
