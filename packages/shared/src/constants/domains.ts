// Impacted domains for drift detection
export const IMPACTED_DOMAINS = [
  'deployment',
  'rollback',
  'config',
  'auth',
  'monitoring',
  'database',
  'api',
  'infrastructure',
  'security',
  'onboarding',
] as const;

export type ImpactedDomain = typeof IMPACTED_DOMAINS[number];

// ============================================================================
// KEYWORD PACKS - Used as HINTS ONLY, not as final drift verdict
// ============================================================================

// High-risk keywords that indicate operational changes (POSITIVE signals)
export const HIGH_RISK_KEYWORDS = [
  'deploy',
  'rollback',
  'kubectl',
  'helm',
  'terraform',
  'docker',
  'k8s',
  'kubernetes',
  'migration',
  'database',
  'schema',
  'env',
  'secret',
  'config',
  'auth',
  'permission',
  'role',
  'iam',
  'certificate',
  'ssl',
  'tls',
] as const;

export type HighRiskKeyword = typeof HIGH_RISK_KEYWORDS[number];

// Negative keywords - indicate low-value changes (NOISE reduction)
// These are hints to REDUCE priority, not to reject outright
export const NEGATIVE_KEYWORDS = [
  'refactor',
  'lint',
  'typo',
  'formatting',
  'whitespace',
  'comment',
  'documentation',
  'readme',
  'test',
  'spec',
  'fixture',
  'mock',
  'example',
  'sample',
  'wip',
  'draft',
  'todo',
  'fixme',
  'cleanup',
  'rename',
  'move',
  'reorganize',
] as const;

export type NegativeKeyword = typeof NEGATIVE_KEYWORDS[number];

// ============================================================================
// SOURCE-SPECIFIC KEYWORD PACKS
// Different sources have different signal patterns
// ============================================================================

export const GITHUB_PR_KEYWORDS = {
  positive: [
    ...HIGH_RISK_KEYWORDS,
    'breaking',
    'deprecate',
    'remove',
    'upgrade',
    'downgrade',
    'hotfix',
    'emergency',
    'critical',
    'security',
    'vulnerability',
    'cve',
  ],
  negative: [
    ...NEGATIVE_KEYWORDS,
    'dependabot',
    'renovate',
    'version bump',
    'update dependencies',
    'merge branch',
    'revert',
  ],
} as const;

export const PAGERDUTY_KEYWORDS = {
  positive: [
    'outage',
    'incident',
    'degraded',
    'down',
    'timeout',
    'error rate',
    'latency',
    'memory leak',
    'cpu spike',
    'disk full',
    'connection refused',
    'service unavailable',
    '500',
    '503',
    '504',
  ],
  negative: [
    'test alert',
    'drill',
    'false alarm',
    'resolved automatically',
    'transient',
  ],
} as const;

export const SLACK_KEYWORDS = {
  positive: [
    'how do i',
    'how to',
    'where is',
    'what is',
    'why is',
    'broken',
    'not working',
    'failing',
    'error',
    'issue',
    'problem',
    'help',
    'urgent',
    'blocked',
  ],
  negative: [
    'thanks',
    'thank you',
    'got it',
    'resolved',
    'fixed',
    'nevermind',
    'ignore',
    'spam',
  ],
} as const;

