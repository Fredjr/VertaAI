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

// High-risk keywords that indicate operational changes
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

