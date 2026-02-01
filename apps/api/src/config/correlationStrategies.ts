/**
 * Correlation Strategies by Source
 * 
 * Point 9: Source-aware correlation logic for joining signals from multiple sources
 * Different sources correlate in different ways
 * 
 * @see Point 9 in Multi-Source Enrichment Plan
 */

import type { InputSourceType } from '../services/docs/adapters/types.js';

// ============================================================================
// Types
// ============================================================================

export type CorrelationStrategy =
  | 'service_time_window'    // Match by service + time window (PagerDuty + GitHub)
  | 'keyword_similarity'     // Match by keyword overlap (Slack + GitHub)
  | 'service_exact'          // Exact service match (Datadog + PagerDuty)
  | 'repo_path_match'        // Match by repo + file path (GitHub PR + IaC)
  | 'owner_match'            // Match by owner/team (CODEOWNERS + PagerDuty)
  | 'none';                  // No correlation

export interface CorrelationConfig {
  strategy: CorrelationStrategy;
  timeWindowHours: number;        // Time window for correlation
  minSimilarityScore: number;     // Minimum similarity score (0-1)
  boostFactor: number;            // Confidence boost when correlated
  compatibleSources: InputSourceType[];  // Which sources can correlate
}

// ============================================================================
// Correlation Strategies per Source Type
// ============================================================================

/**
 * Correlation configuration per source type
 * Defines how each source correlates with other sources
 */
export const SOURCE_CORRELATION_STRATEGIES: Record<InputSourceType, CorrelationConfig> = {
  github_pr: {
    strategy: 'service_time_window',
    timeWindowHours: 72,  // 3 days before/after PR
    minSimilarityScore: 0.6,
    boostFactor: 0.15,
    compatibleSources: ['pagerduty_incident', 'slack_cluster', 'datadog_alert', 'github_iac'],
  },
  
  pagerduty_incident: {
    strategy: 'service_time_window',
    timeWindowHours: 168,  // 1 week before/after incident
    minSimilarityScore: 0.5,
    boostFactor: 0.20,
    compatibleSources: ['github_pr', 'datadog_alert', 'slack_cluster'],
  },
  
  slack_cluster: {
    strategy: 'keyword_similarity',
    timeWindowHours: 336,  // 2 weeks (questions accumulate slowly)
    minSimilarityScore: 0.7,
    boostFactor: 0.15,
    compatibleSources: ['github_pr', 'pagerduty_incident', 'datadog_alert'],
  },
  
  datadog_alert: {
    strategy: 'service_exact',
    timeWindowHours: 48,  // 2 days (alerts are timely)
    minSimilarityScore: 0.8,
    boostFactor: 0.20,
    compatibleSources: ['pagerduty_incident', 'github_pr'],
  },
  
  github_iac: {
    strategy: 'repo_path_match',
    timeWindowHours: 168,  // 1 week
    minSimilarityScore: 0.6,
    boostFactor: 0.15,
    compatibleSources: ['github_pr', 'datadog_alert'],
  },
  
  github_codeowners: {
    strategy: 'owner_match',
    timeWindowHours: 720,  // 30 days (ownership changes are infrequent)
    minSimilarityScore: 0.9,
    boostFactor: 0.10,
    compatibleSources: ['pagerduty_incident', 'github_pr'],
  },
};

// ============================================================================
// Correlation Matching Functions
// ============================================================================

/**
 * Check if two signals can correlate based on their source types
 */
export function canCorrelate(sourceType1: InputSourceType, sourceType2: InputSourceType): boolean {
  const config = SOURCE_CORRELATION_STRATEGIES[sourceType1];
  return config.compatibleSources.includes(sourceType2);
}

/**
 * Get correlation strategy for a source type
 */
export function getCorrelationStrategy(sourceType: InputSourceType): CorrelationConfig {
  return SOURCE_CORRELATION_STRATEGIES[sourceType];
}

/**
 * Calculate time-based correlation score
 */
export function calculateTimeCorrelation(
  timestamp1: Date,
  timestamp2: Date,
  timeWindowHours: number
): number {
  const diffHours = Math.abs(timestamp1.getTime() - timestamp2.getTime()) / (1000 * 60 * 60);
  
  if (diffHours > timeWindowHours) {
    return 0;  // Outside time window
  }
  
  // Linear decay: 1.0 at 0 hours, 0.0 at timeWindowHours
  return 1.0 - (diffHours / timeWindowHours);
}

/**
 * Calculate keyword similarity score (Jaccard similarity)
 */
export function calculateKeywordSimilarity(keywords1: string[], keywords2: string[]): number {
  if (keywords1.length === 0 || keywords2.length === 0) {
    return 0;
  }
  
  const set1 = new Set(keywords1.map(k => k.toLowerCase()));
  const set2 = new Set(keywords2.map(k => k.toLowerCase()));
  
  const intersection = new Set([...set1].filter(k => set2.has(k)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

/**
 * Calculate service match score
 */
export function calculateServiceMatch(service1?: string, service2?: string): number {
  if (!service1 || !service2) {
    return 0;
  }
  
  const s1 = service1.toLowerCase().trim();
  const s2 = service2.toLowerCase().trim();
  
  // Exact match
  if (s1 === s2) {
    return 1.0;
  }
  
  // Partial match (one contains the other)
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.8;
  }
  
  // Fuzzy match (similar words)
  const words1 = s1.split(/[-_\s]+/);
  const words2 = s2.split(/[-_\s]+/);
  const commonWords = words1.filter(w => words2.includes(w));
  
  if (commonWords.length > 0) {
    return 0.6;
  }
  
  return 0;
}

/**
 * Calculate overall correlation score between two signals
 */
export function calculateCorrelationScore(
  signal1: {
    sourceType: InputSourceType;
    occurredAt: Date;
    service?: string;
    keywords?: string[];
  },
  signal2: {
    sourceType: InputSourceType;
    occurredAt: Date;
    service?: string;
    keywords?: string[];
  }
): { score: number; reason: string } {
  // Check if sources can correlate
  if (!canCorrelate(signal1.sourceType, signal2.sourceType)) {
    return { score: 0, reason: 'Incompatible source types' };
  }
  
  const config = getCorrelationStrategy(signal1.sourceType);
  
  // Calculate component scores based on strategy
  let score = 0;
  let reason = '';
  
  // Time correlation (always check)
  const timeScore = calculateTimeCorrelation(signal1.occurredAt, signal2.occurredAt, config.timeWindowHours);
  if (timeScore === 0) {
    return { score: 0, reason: 'Outside time window' };
  }
  
  // Strategy-specific scoring
  if (config.strategy === 'service_time_window' || config.strategy === 'service_exact') {
    const serviceScore = calculateServiceMatch(signal1.service, signal2.service);
    score = (timeScore * 0.4) + (serviceScore * 0.6);
    reason = `Service match (${serviceScore.toFixed(2)}) + time (${timeScore.toFixed(2)})`;
  } 
  else if (config.strategy === 'keyword_similarity') {
    const keywordScore = calculateKeywordSimilarity(signal1.keywords || [], signal2.keywords || []);
    score = (timeScore * 0.3) + (keywordScore * 0.7);
    reason = `Keyword similarity (${keywordScore.toFixed(2)}) + time (${timeScore.toFixed(2)})`;
  }
  else {
    score = timeScore;
    reason = `Time correlation (${timeScore.toFixed(2)})`;
  }
  
  return { score, reason };
}

