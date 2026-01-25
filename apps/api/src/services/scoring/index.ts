/**
 * Drift Scoring Service
 * 
 * Implements the drift scoring model per spec Section 5.6:
 * - Evidence strength: additive scoring (0-0.95)
 * - Impact score: domain-based severity (0-1)
 * - Drift score: confidence × impact_score
 * 
 * @see VERTAAI_MVP_SPEC.md Section 5.6
 */

import type { ImpactedDomain } from '@vertaai/shared';

// ============================================================================
// Signal Types for Evidence Strength Calculation
// ============================================================================

export type EvidenceSignalType =
  | 'pr_explicit_change'    // Rename/remove/deprecate in PR (+0.50)
  | 'pr_path_match'         // deploy/, config/, infra/ paths (+0.20)
  | 'incident_repeat'       // Same incident class recurring (+0.25)
  | 'slack_repetition'      // ≥3 similar questions (+0.20)
  | 'owner_mismatch';       // PagerDuty/CODEOWNERS mismatch (+0.60)

export interface EvidenceSignal {
  type: EvidenceSignalType;
  confidence?: number;
  description?: string;
}

// Score contributions per signal type (spec Section 5.6)
const EVIDENCE_SIGNAL_SCORES: Record<EvidenceSignalType, number> = {
  pr_explicit_change: 0.50,  // Strongest signal: explicit code change
  pr_path_match: 0.20,       // Deploy/config/infra paths are relevant
  incident_repeat: 0.25,     // Recurring incidents indicate doc gaps
  slack_repetition: 0.20,    // Repeated questions indicate missing info
  owner_mismatch: 0.60,      // Authoritative ownership mismatch is critical
};

// ============================================================================
// Impact Scores by Domain (spec Section 5.6)
// ============================================================================

const DOMAIN_IMPACT_SCORES: Record<ImpactedDomain, number> = {
  rollback: 0.9,           // Critical path, high blast radius
  auth: 0.9,               // Security-sensitive
  data_migrations: 0.9,    // Data integrity risk
  deployment: 0.8,         // Core operational path
  infra: 0.8,              // Platform stability
  config: 0.8,             // Runtime behavior
  api: 0.6,                // External contracts
  observability: 0.6,      // Debugging capability
  onboarding: 0.6,         // Developer experience
  ownership_routing: 0.5,  // Escalation accuracy
};

// Risky domains require higher confidence to notify (spec Section 5.6)
export const RISKY_DOMAINS: ImpactedDomain[] = ['rollback', 'auth', 'data_migrations'];

// ============================================================================
// Evidence Strength Calculation
// ============================================================================

/**
 * Calculate evidence strength from signals.
 * Uses additive scoring clamped to 0.95 max.
 * 
 * @param signals - Array of evidence signals detected
 * @returns Evidence strength score (0.0 - 0.95)
 * 
 * @example
 * const score = calculateEvidenceStrength([
 *   { type: 'pr_explicit_change' },  // +0.50
 *   { type: 'pr_path_match' }        // +0.20
 * ]);
 * // Returns 0.70
 */
export function calculateEvidenceStrength(signals: EvidenceSignal[]): number {
  let score = 0;

  // Deduplicate signal types and add their scores
  const seenTypes = new Set<EvidenceSignalType>();
  
  for (const signal of signals) {
    if (!seenTypes.has(signal.type)) {
      seenTypes.add(signal.type);
      score += EVIDENCE_SIGNAL_SCORES[signal.type];
    }
  }

  // Clamp to 0.95 max (never 100% certain per spec)
  return Math.min(score, 0.95);
}

// ============================================================================
// Impact Score Calculation
// ============================================================================

/**
 * Calculate impact score based on affected domains.
 * Takes the maximum impact from all domains.
 * 
 * @param domains - Array of impacted domains
 * @returns Impact score (0.0 - 1.0)
 * 
 * @example
 * const score = calculateImpactScore(['deployment', 'auth']);
 * // Returns 0.9 (auth has highest score)
 */
export function calculateImpactScore(domains: string[]): number {
  if (domains.length === 0) {
    return 0.5; // Default moderate impact if no domains specified
  }

  let maxScore = 0;
  
  for (const domain of domains) {
    const score = DOMAIN_IMPACT_SCORES[domain as ImpactedDomain];
    if (score !== undefined && score > maxScore) {
      maxScore = score;
    }
  }

  // Fallback if no valid domains found
  return maxScore || 0.5;
}

// ============================================================================
// Drift Score Calculation
// ============================================================================

/**
 * Calculate combined drift score.
 * drift_score = confidence × impact_score
 * 
 * @param confidence - Evidence strength or model confidence (0-1)
 * @param impactScore - Domain impact score (0-1)
 * @returns Combined drift score (0-1)
 */
export function calculateDriftScore(confidence: number, impactScore: number): number {
  const clampedConfidence = Math.min(Math.max(confidence, 0), 0.95);
  const clampedImpact = Math.min(Math.max(impactScore, 0), 1);
  return clampedConfidence * clampedImpact;
}

/**
 * Determine if notification should happen immediately.
 * Risky domains require higher drift score threshold.
 * 
 * @param driftScore - Combined drift score
 * @param domains - Affected domains
 * @returns true if should notify immediately
 */
export function shouldNotifyImmediately(driftScore: number, domains: string[]): boolean {
  const isRisky = domains.some(d => RISKY_DOMAINS.includes(d as ImpactedDomain));
  
  if (isRisky) {
    return driftScore >= 0.70;  // Higher threshold for risky domains
  }
  return driftScore >= 0.60;    // Standard threshold
}

