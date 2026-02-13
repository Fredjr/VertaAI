/**
 * Materiality Scoring Module (Phase 3)
 * 
 * Computes materiality score to determine if a drift is worth patching.
 * Prevents low-value patches from consuming LLM resources and creating noise.
 * 
 * Materiality is based on:
 * - Impact band (low/medium/high/critical)
 * - Confidence score
 * - Number of typed deltas (more changes = more material)
 * - Risk factors (production impact, security, etc.)
 */

import type { Assessment } from './types.js';
import type { TypedDelta } from '../baseline/types.js';

/**
 * Materiality score result
 */
export interface MaterialityResult {
  score: number; // 0-1 scale
  shouldPatch: boolean; // true if score >= threshold
  threshold: number; // threshold used for decision
  factors: {
    impactBandScore: number;
    confidenceScore: number;
    deltaCountScore: number;
    riskFactorScore: number;
  };
  reason: string; // Human-readable explanation
}

/**
 * Configuration for materiality scoring
 */
export interface MaterialityConfig {
  threshold: number; // Default: 0.3 (skip patches below this)
  weights: {
    impactBand: number; // Default: 0.4
    confidence: number; // Default: 0.3
    deltaCount: number; // Default: 0.2
    riskFactors: number; // Default: 0.1
  };
}

/**
 * Default materiality configuration
 */
export const DEFAULT_MATERIALITY_CONFIG: MaterialityConfig = {
  threshold: 0.3,
  weights: {
    impactBand: 0.4,
    confidence: 0.3,
    deltaCount: 0.2,
    riskFactors: 0.1,
  },
};

/**
 * Compute materiality score for a drift candidate
 * 
 * @param assessment - Impact assessment from evidence bundle
 * @param typedDeltas - Typed deltas from comparison (optional, may come from assessment)
 * @param confidenceScore - Overall drift confidence (0-1)
 * @param config - Materiality configuration (optional, uses defaults)
 * @returns MaterialityResult with score and decision
 */
export function computeMaterialityScore(
  assessment: Assessment,
  typedDeltas: TypedDelta[] | undefined,
  confidenceScore: number,
  config: MaterialityConfig = DEFAULT_MATERIALITY_CONFIG
): MaterialityResult {
  // Use typed deltas from assessment if not provided separately
  const deltas = typedDeltas || assessment.typedDeltas || [];

  // 1. Impact band score (0-1)
  const impactBandScore = getImpactBandScore(assessment.impactBand);

  // 2. Confidence score (already 0-1)
  const confidenceScoreNormalized = Math.max(0, Math.min(1, confidenceScore));

  // 3. Delta count score (0-1, logarithmic scale)
  const deltaCountScore = getDeltaCountScore(deltas.length);

  // 4. Risk factor score (0-1)
  const riskFactorScore = getRiskFactorScore(assessment.riskFactors || []);

  // Weighted sum
  const score =
    impactBandScore * config.weights.impactBand +
    confidenceScoreNormalized * config.weights.confidence +
    deltaCountScore * config.weights.deltaCount +
    riskFactorScore * config.weights.riskFactors;

  // Decision
  const shouldPatch = score >= config.threshold;

  // Reason
  const reason = generateMaterialityReason(
    shouldPatch,
    score,
    config.threshold,
    assessment.impactBand,
    deltas.length,
    assessment.riskFactors || []
  );

  return {
    score,
    shouldPatch,
    threshold: config.threshold,
    factors: {
      impactBandScore,
      confidenceScore: confidenceScoreNormalized,
      deltaCountScore,
      riskFactorScore,
    },
    reason,
  };
}

/**
 * Convert impact band to score (0-1)
 */
function getImpactBandScore(band: Assessment['impactBand']): number {
  const scores: Record<Assessment['impactBand'], number> = {
    low: 0.2,
    medium: 0.5,
    high: 0.8,
    critical: 1.0,
  };
  return scores[band];
}

/**
 * Convert delta count to score (0-1) using logarithmic scale
 * 0 deltas = 0.0
 * 1 delta = 0.3
 * 5 deltas = 0.6
 * 10+ deltas = 1.0
 */
function getDeltaCountScore(count: number): number {
  if (count === 0) return 0.0;
  if (count === 1) return 0.3;
  if (count >= 10) return 1.0;
  
  // Logarithmic scale between 1 and 10
  return 0.3 + (Math.log(count) / Math.log(10)) * 0.7;
}

/**
 * Convert risk factors to score (0-1)
 * High-severity risk factors boost the score
 */
function getRiskFactorScore(riskFactors: string[]): number {
  if (riskFactors.length === 0) return 0.0;

  const highSeverityFactors = [
    'production-impact',
    'security-sensitive',
    'data-loss-risk',
    'breaking-change',
  ];

  const hasHighSeverity = riskFactors.some(factor =>
    highSeverityFactors.some(high => factor.includes(high))
  );

  if (hasHighSeverity) return 1.0;
  if (riskFactors.length >= 3) return 0.7;
  if (riskFactors.length >= 2) return 0.5;
  return 0.3;
}

/**
 * Generate human-readable reason for materiality decision
 */
function generateMaterialityReason(
  shouldPatch: boolean,
  score: number,
  threshold: number,
  impactBand: Assessment['impactBand'],
  deltaCount: number,
  riskFactors: string[]
): string {
  if (shouldPatch) {
    const reasons: string[] = [];

    if (impactBand === 'critical' || impactBand === 'high') {
      reasons.push(`${impactBand} impact`);
    }

    if (deltaCount >= 5) {
      reasons.push(`${deltaCount} changes detected`);
    }

    if (riskFactors.length > 0) {
      reasons.push(`${riskFactors.length} risk factors`);
    }

    const reasonText = reasons.length > 0 ? ` (${reasons.join(', ')})` : '';
    return `Material drift: score ${score.toFixed(2)} >= threshold ${threshold}${reasonText}`;
  } else {
    return `Low-value drift: score ${score.toFixed(2)} < threshold ${threshold} (${impactBand} impact, ${deltaCount} changes)`;
  }
}

