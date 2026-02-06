/**
 * Keyword Hints System (Phase 1 Quick Win)
 * 
 * Keywords are used as HINTS ONLY for:
 * - Eligibility filtering (noise reduction)
 * - Priority scoring (boost/reduce)
 * - Domain detection (routing)
 * 
 * Keywords are NOT used as final drift verdict.
 * Drift verdict comes from comparison-based detection (EvidencePack vs BaselineAnchors).
 */

// Import keyword constants (duplicated here to avoid cross-package import issues)
const HIGH_RISK_KEYWORDS = [
  'deploy', 'rollback', 'kubectl', 'helm', 'terraform', 'docker', 'k8s', 'kubernetes',
  'migration', 'database', 'schema', 'env', 'secret', 'config', 'auth', 'permission',
  'role', 'iam', 'certificate', 'ssl', 'tls',
] as const;

const NEGATIVE_KEYWORDS = [
  'refactor', 'lint', 'typo', 'formatting', 'whitespace', 'comment', 'documentation',
  'readme', 'test', 'spec', 'fixture', 'mock', 'example', 'sample', 'wip', 'draft',
  'todo', 'fixme', 'cleanup', 'rename', 'move', 'reorganize',
] as const;

const GITHUB_PR_KEYWORDS = {
  positive: [
    ...HIGH_RISK_KEYWORDS,
    'breaking', 'deprecate', 'remove', 'upgrade', 'downgrade', 'hotfix',
    'emergency', 'critical', 'security', 'vulnerability', 'cve',
  ],
  negative: [
    ...NEGATIVE_KEYWORDS,
    'dependabot', 'renovate', 'version bump', 'update dependencies', 'merge branch', 'revert',
  ],
} as const;

const PAGERDUTY_KEYWORDS = {
  positive: [
    'outage', 'incident', 'degraded', 'down', 'timeout', 'error rate', 'latency',
    'memory leak', 'cpu spike', 'disk full', 'connection refused', 'service unavailable',
    '500', '503', '504',
  ],
  negative: [
    'test alert', 'drill', 'false alarm', 'resolved automatically', 'transient',
  ],
} as const;

const SLACK_KEYWORDS = {
  positive: [
    'how do i', 'how to', 'where is', 'what is', 'why is', 'broken', 'not working',
    'failing', 'error', 'issue', 'problem', 'help', 'urgent', 'blocked',
  ],
  negative: [
    'thanks', 'thank you', 'got it', 'resolved', 'fixed', 'nevermind', 'ignore', 'spam',
  ],
} as const;

export type InputSourceType = 'github_pr' | 'pagerduty_incident' | 'slack_cluster';

export interface KeywordHints {
  positiveMatches: string[];   // Keywords that boost priority
  negativeMatches: string[];   // Keywords that reduce priority
  positiveScore: number;       // 0-1, higher = more likely drift
  negativeScore: number;       // 0-1, higher = more likely noise
  netScore: number;            // positiveScore - negativeScore
  recommendation: 'boost' | 'neutral' | 'reduce';
}

/**
 * Analyze text for keyword hints based on source type.
 * Returns hints for priority scoring, NOT drift verdict.
 */
export function analyzeKeywordHints(
  text: string,
  sourceType: InputSourceType
): KeywordHints {
  const textLower = text.toLowerCase();
  
  // Get source-specific keyword packs
  const keywordPack = getKeywordPack(sourceType);
  
  // Find positive matches
  const positiveMatches: string[] = [];
  for (const keyword of keywordPack.positive) {
    if (textLower.includes(keyword.toLowerCase())) {
      positiveMatches.push(keyword);
    }
  }
  
  // Find negative matches
  const negativeMatches: string[] = [];
  for (const keyword of keywordPack.negative) {
    if (textLower.includes(keyword.toLowerCase())) {
      negativeMatches.push(keyword);
    }
  }
  
  // Compute scores (normalized by keyword pack size)
  const positiveScore = Math.min(positiveMatches.length / 3, 1.0); // Cap at 3 matches
  const negativeScore = Math.min(negativeMatches.length / 2, 1.0); // Cap at 2 matches
  const netScore = positiveScore - negativeScore;
  
  // Recommendation based on net score
  let recommendation: 'boost' | 'neutral' | 'reduce';
  if (netScore > 0.3) {
    recommendation = 'boost';
  } else if (netScore < -0.2) {
    recommendation = 'reduce';
  } else {
    recommendation = 'neutral';
  }
  
  return {
    positiveMatches,
    negativeMatches,
    positiveScore,
    negativeScore,
    netScore,
    recommendation,
  };
}

/**
 * Get keyword pack for source type
 */
function getKeywordPack(sourceType: InputSourceType): {
  positive: readonly string[];
  negative: readonly string[];
} {
  switch (sourceType) {
    case 'github_pr':
      return GITHUB_PR_KEYWORDS;
    case 'pagerduty_incident':
      return PAGERDUTY_KEYWORDS;
    case 'slack_cluster':
      return SLACK_KEYWORDS;
    default:
      return { positive: [], negative: [] };
  }
}

/**
 * Apply keyword hints to adjust priority/confidence.
 * This is a HINT, not a final decision.
 */
export function applyKeywordHints(
  baseConfidence: number,
  hints: KeywordHints
): {
  adjustedConfidence: number;
  adjustment: number;
  reason: string;
} {
  let adjustment = 0;
  let reason = '';
  
  if (hints.recommendation === 'boost') {
    adjustment = 0.1;
    reason = `Boosted by positive keywords: ${hints.positiveMatches.slice(0, 3).join(', ')}`;
  } else if (hints.recommendation === 'reduce') {
    adjustment = -0.15;
    reason = `Reduced by negative keywords: ${hints.negativeMatches.slice(0, 3).join(', ')}`;
  } else {
    reason = 'No keyword adjustment';
  }
  
  const adjustedConfidence = Math.max(0, Math.min(1, baseConfidence + adjustment));
  
  return {
    adjustedConfidence,
    adjustment,
    reason,
  };
}

/**
 * Check if text contains mostly negative keywords (noise filter)
 */
export function isLikelyNoise(text: string, sourceType: InputSourceType): boolean {
  const hints = analyzeKeywordHints(text, sourceType);
  
  // Likely noise if:
  // 1. Negative score is high (>= 0.5)
  // 2. Net score is very negative (< -0.3)
  // 3. No positive matches but multiple negative matches
  
  return (
    hints.negativeScore >= 0.5 ||
    hints.netScore < -0.3 ||
    (hints.positiveMatches.length === 0 && hints.negativeMatches.length >= 2)
  );
}

