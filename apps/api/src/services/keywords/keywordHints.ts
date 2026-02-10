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

// Fix #2: Coverage-positive keywords - indicate new features/scenarios (coverage drift)
// These should BOOST signal even if documentation keywords are present
const COVERAGE_KEYWORDS = [
  'new feature', 'add support', 'implement', 'introduce', 'enable',
  'new endpoint', 'new api', 'new command', 'new option', 'new flag',
  'new parameter', 'new field', 'new method', 'new function',
  'add endpoint', 'add api', 'add command', 'add option', 'add flag',
] as const;

const NEGATIVE_KEYWORDS = [
  'refactor', 'lint', 'typo', 'formatting', 'whitespace', 'comment', 'documentation',
  'readme', 'test', 'spec', 'fixture', 'mock', 'example', 'sample', 'wip', 'draft',
  'todo', 'fixme', 'cleanup', 'rename', 'move', 'reorganize',
] as const;

const GITHUB_PR_KEYWORDS = {
  positive: [
    ...HIGH_RISK_KEYWORDS,
    ...COVERAGE_KEYWORDS, // Fix #2: Include coverage keywords
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
  
  // Find negative matches (use word boundary matching to avoid false positives
  // like "move" matching inside "remove")
  const negativeMatches: string[] = [];
  for (const keyword of keywordPack.negative) {
    const kw = keyword.toLowerCase();
    // For multi-word keywords, use simple includes
    // For single-word keywords, use word boundary regex
    if (kw.includes(' ')) {
      if (textLower.includes(kw)) {
        negativeMatches.push(keyword);
      }
    } else {
      // Escape special regex chars and use word boundaries
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?:^|[^a-z])${escaped}(?:$|[^a-z])`);
      if (regex.test(textLower)) {
        negativeMatches.push(keyword);
      }
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
 * Check if text contains mostly negative keywords (noise filter).
 * Only filters when negative signals clearly dominate positive ones.
 *
 * Fix #1: Context-aware filtering - don't filter documentation keywords when targeting doc systems
 * Fix #2: Coverage drift exception - never filter if coverage keywords are present
 * Fix #3: Balance strictness across source types
 */
export function isLikelyNoise(
  text: string,
  sourceType: InputSourceType,
  targetDocSystems?: string[]
): boolean {
  const hints = analyzeKeywordHints(text, sourceType);

  // Fix #2: Coverage drift exception - check for coverage keywords
  // If text contains coverage keywords (new feature, add support, etc.), NEVER filter as noise
  // These indicate new features/scenarios that should be documented (coverage drift)
  const textLower = text.toLowerCase();
  const hasCoverageKeywords = COVERAGE_KEYWORDS.some(kw => textLower.includes(kw));

  if (hasCoverageKeywords) {
    console.log(`[KeywordHints] Fix #2 - Coverage keywords detected, bypassing noise filter`);
    return false; // Never filter coverage drift
  }

  // Fix #1: If targeting doc systems, ALLOW documentation keywords
  // Documentation PRs should UPDATE documentation targets, not be filtered!
  if (targetDocSystems && targetDocSystems.length > 0) {
    const isTargetingDocs = targetDocSystems.some(system =>
      ['confluence', 'notion', 'github_readme', 'gitbook', 'backstage'].includes(system)
    );

    if (isTargetingDocs) {
      // Remove documentation-related keywords from negative matches
      const docKeywords = ['documentation', 'readme', 'docs'];
      hints.negativeMatches = hints.negativeMatches.filter(
        kw => !docKeywords.includes(kw)
      );

      // Recalculate net score without doc keywords
      hints.netScore = hints.positiveMatches.length * 0.1 - hints.negativeMatches.length * 0.15;

      console.log(`[KeywordHints] Fix #1 - Targeting docs, removed doc keywords: negativeMatches=${hints.negativeMatches.length}, netScore=${hints.netScore.toFixed(2)}`);
    }
  }

  // Fix #3: Balance strictness across source types
  // GitHub sources: more lenient threshold (-0.5 vs -0.3)
  const threshold = sourceType.startsWith('github_') ? -0.5 : -0.3;

  // Likely noise if:
  // 1. Net score is very negative (negative keywords overwhelm positive)
  // 2. No positive matches but multiple negative matches
  // Note: We do NOT filter based on negative score alone - signals with
  // strong positive matches (e.g., "auth", "secret", "breaking") should
  // never be filtered as noise even if a negative keyword matches.

  return (
    hints.netScore < threshold ||
    (hints.positiveMatches.length === 0 && hints.negativeMatches.length >= 2)
  );
}

