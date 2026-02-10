/**
 * Scoring Weights and Thresholds by Source
 * 
 * Point 5: Source-specific confidence weights for evidence signals
 * Point 8: Source-specific thresholds for routing decisions
 * 
 * @see Points 5 & 8 in Multi-Source Enrichment Plan
 */

import type { InputSourceType } from '../services/docs/adapters/types.js';

// ============================================================================
// Point 5: Source-Specific Confidence Weights
// ============================================================================

/**
 * Evidence signal types with source-specific weights
 * Different sources have different confidence levels for the same evidence type
 */
export interface SourceConfidenceWeights {
  // GitHub PR evidence
  pr_explicit_change?: number;      // Direct code change (e.g., URL updated)
  pr_path_match?: number;           // File path matches doc domain
  pr_description_mention?: number;  // PR description mentions the change
  
  // PagerDuty evidence
  incident_repeat?: number;         // Recurring incident (same service)
  incident_severity?: number;       // High severity incident
  incident_postmortem?: number;     // Has detailed notes/postmortem
  
  // Slack evidence
  slack_repetition?: number;        // Multiple people asking same question
  slack_channel_relevance?: number; // Asked in relevant channel
  
  // Datadog evidence
  alert_frequency?: number;         // Alert fired multiple times
  alert_recovery?: number;          // Alert recovered (not ongoing)
  
  // IaC evidence
  iac_resource_change?: number;     // Infrastructure resource changed
  iac_config_change?: number;       // Configuration value changed
  
  // Cross-source evidence
  owner_mismatch?: number;          // Documented owner != actual responder
  correlation_boost?: number;       // Multiple sources agree
}

/**
 * Default confidence weights per source type
 */
export const SOURCE_CONFIDENCE_WEIGHTS: Record<InputSourceType, SourceConfidenceWeights> = {
  github_pr: {
    pr_explicit_change: 0.70,        // High confidence - direct code change
    pr_path_match: 0.30,             // Medium - path suggests relevance
    pr_description_mention: 0.20,    // Low - just mentioned
    owner_mismatch: 0.60,
    correlation_boost: 0.15,
  },
  
  pagerduty_incident: {
    incident_repeat: 0.50,           // Medium-high - recurring problem
    incident_severity: 0.40,         // Medium - severity indicates importance
    incident_postmortem: 0.60,       // High - detailed analysis available
    owner_mismatch: 0.70,            // Very high - actual responder != docs
    correlation_boost: 0.20,
  },
  
  slack_cluster: {
    slack_repetition: 0.55,          // Medium-high - multiple people asking
    slack_channel_relevance: 0.25,   // Low-medium - channel context
    correlation_boost: 0.15,
  },
  
  datadog_alert: {
    alert_frequency: 0.45,           // Medium - recurring alert
    alert_recovery: 0.30,            // Low-medium - recovered alert
    correlation_boost: 0.20,
  },
  
  github_iac: {
    iac_resource_change: 0.65,       // High - infrastructure changed
    iac_config_change: 0.50,         // Medium-high - config changed
    pr_path_match: 0.25,
    correlation_boost: 0.15,
  },
  
  github_codeowners: {
    owner_mismatch: 0.85,            // Very high - CODEOWNERS is authoritative
    correlation_boost: 0.10,
  },
};

// ============================================================================
// Point 8: Source-Specific Thresholds
// ============================================================================

export interface SourceThresholds {
  autoApprove: number;      // Auto-approve and writeback (no human review)
  slackNotify: number;      // Send to Slack for approval
  digestOnly: number;       // Include in digest, don't notify immediately
  ignore: number;           // Below this, ignore completely
}

/**
 * Confidence thresholds per source type
 * Different sources have different trust levels
 */
export const SOURCE_THRESHOLDS: Record<InputSourceType, SourceThresholds> = {
  github_pr: {
    autoApprove: 0.98,      // FIX: Raised from 0.85 to 0.98 - nearly all drifts should go through Slack first
    slackNotify: 0.40,      // FIX: Lowered from 0.55 to 0.40 - more drifts reach Slack notification
    digestOnly: 0.30,       // Low confidence → digest
    ignore: 0.20,           // Below 20% → ignore
  },
  
  pagerduty_incident: {
    autoApprove: 0.90,      // Higher bar - incidents are noisy
    slackNotify: 0.60,      // Medium-high for Slack
    digestOnly: 0.45,       // Medium for digest
    ignore: 0.35,           // Slightly higher ignore threshold
  },
  
  slack_cluster: {
    autoApprove: 0.95,      // Very high bar - questions can be vague
    slackNotify: 0.65,      // Higher bar for Slack
    digestOnly: 0.50,       // Medium for digest
    ignore: 0.40,           // Higher ignore threshold
  },
  
  datadog_alert: {
    autoApprove: 0.88,      // High bar - alerts can be noisy
    slackNotify: 0.58,      // Medium for Slack
    digestOnly: 0.43,       // Medium-low for digest
    ignore: 0.33,           // Medium ignore threshold
  },
  
  github_iac: {
    autoApprove: 0.82,      // High bar - IaC changes are critical
    slackNotify: 0.52,      // Medium for Slack
    digestOnly: 0.38,       // Low-medium for digest
    ignore: 0.28,           // Lower ignore threshold
  },
  
  github_codeowners: {
    autoApprove: 0.80,      // High confidence in CODEOWNERS
    slackNotify: 0.50,      // Medium for Slack
    digestOnly: 0.35,       // Low for digest
    ignore: 0.25,           // Low ignore threshold
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get confidence weights for a source type
 */
export function getConfidenceWeights(sourceType: InputSourceType): SourceConfidenceWeights {
  return SOURCE_CONFIDENCE_WEIGHTS[sourceType] || SOURCE_CONFIDENCE_WEIGHTS.github_pr;
}

/**
 * Get thresholds for a source type
 */
export function getThresholds(sourceType: InputSourceType): SourceThresholds {
  return SOURCE_THRESHOLDS[sourceType] || SOURCE_THRESHOLDS.github_pr;
}

/**
 * Determine routing action based on confidence and source type
 */
export function getRoutingAction(
  confidence: number,
  sourceType: InputSourceType
): 'auto_approve' | 'slack_notify' | 'digest_only' | 'ignore' {
  const thresholds = getThresholds(sourceType);

  if (confidence >= thresholds.autoApprove) return 'auto_approve';
  if (confidence >= thresholds.slackNotify) return 'slack_notify';
  if (confidence >= thresholds.digestOnly) return 'digest_only';
  return 'ignore';
}

/**
 * Get source-specific confidence weight for evidence quality
 * Point 5: Scoring Model by Source
 */
export function getSourceConfidenceWeight(
  sourceType: InputSourceType,
  evidenceQuality: 'pr_explicit_change' | 'incident_postmortem' | 'pr_inferred_change'
): number {
  const weights = getConfidenceWeights(sourceType);

  // Map evidence quality to weight field
  const weightValue = weights[evidenceQuality as keyof SourceConfidenceWeights];
  return weightValue || 1.0; // Default to 1.0 (no adjustment) if not found
}

/**
 * Get source-specific thresholds for routing
 * Point 8: Thresholds by Source
 */
export function getSourceThreshold(sourceType: InputSourceType): SourceThresholds {
  return getThresholds(sourceType);
}

