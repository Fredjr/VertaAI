/**
 * Eligibility Rules by Source
 * 
 * Source-specific rules for filtering signals before drift processing.
 * This is the #1 noise control knob - prevents irrelevant signals from
 * consuming LLM resources and generating spam.
 * 
 * @see Point 1 in Multi-Source Enrichment Plan
 */

import type { InputSourceType } from '../services/docs/adapters/types.js';

// ============================================================================
// Types
// ============================================================================

export interface GitHubPREligibilityRules {
  includePaths: string[];       // Only process PRs touching these paths
  excludePaths: string[];       // Skip PRs touching these paths
  minChangedLines: number;      // Minimum lines changed
  maxChangedLines: number;      // Maximum lines (too large = noisy)
  requireLabels: string[];      // Must have ALL these labels
  excludeLabels: string[];      // Skip if has ANY of these labels
  excludeAuthors: string[];     // Skip these bot authors
  requireMerged: boolean;       // Only process merged PRs
}

export interface PagerDutyEligibilityRules {
  minSeverity: 'P1' | 'P2' | 'P3' | 'P4' | 'any';  // Minimum priority
  requireResolved: boolean;     // Only process resolved incidents
  minDurationMinutes: number;   // Filter short/noise incidents
  excludeServices: string[];    // Service name patterns to exclude
  requirePostmortem: boolean;   // Require notes/postmortem
  excludeTags: string[];        // Exclude incidents with these tags
}

export interface SlackClusterEligibilityRules {
  minClusterSize: number;       // Minimum questions in cluster
  minUniqueAskers: number;      // Minimum unique people asking
  maxAgeHours: number;          // Only recent questions
  includeChannels: string[];    // Only these channels (empty = all)
  excludeChannels: string[];    // Skip these channels
}

export interface DatadogAlertEligibilityRules {
  minSeverity: 'critical' | 'warning' | 'info' | 'any';
  requireRecovery: boolean;     // Only alerts that recovered
  excludeMonitorTags: string[]; // Skip test/synthetic monitors
  minOccurrences: number;       // Recurring alerts only
  excludeMonitorNames: string[];// Name patterns to exclude
}

export interface IaCEligibilityRules {
  includePaths: string[];       // terraform/, pulumi/, infra/
  excludePaths: string[];       // Skip test infra
  requireApproval: boolean;     // PR must be approved
  minChangedResources: number;  // Minimum resources changed
  excludeResourceTypes: string[];// Skip certain resource types
}

export type EligibilityRules =
  | { sourceType: 'github_pr'; rules: GitHubPREligibilityRules }
  | { sourceType: 'pagerduty_incident'; rules: PagerDutyEligibilityRules }
  | { sourceType: 'slack_cluster'; rules: SlackClusterEligibilityRules }
  | { sourceType: 'datadog_alert'; rules: DatadogAlertEligibilityRules }
  | { sourceType: 'github_iac'; rules: IaCEligibilityRules };

// ============================================================================
// Default Rules (Global - can be overridden per workspace)
// ============================================================================

export const DEFAULT_ELIGIBILITY_RULES: Record<InputSourceType, unknown> = {
  github_pr: {
    includePaths: ['**/*'],  // All paths by default
    excludePaths: [
      'node_modules/**', 'dist/**', '.git/**', 'coverage/**',
      '*.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    ],
    minChangedLines: 3,
    maxChangedLines: 2000,
    requireLabels: [],
    excludeLabels: ['wip', 'draft', 'do-not-merge', 'skip-drift'],
    excludeAuthors: ['dependabot[bot]', 'renovate[bot]', 'github-actions[bot]'],
    requireMerged: true,
  } as GitHubPREligibilityRules,

  pagerduty_incident: {
    minSeverity: 'P2',  // FIX F6: Stricter - only P1/P2 incidents (was P3)
    requireResolved: true,
    minDurationMinutes: 15,  // FIX F6: Stricter - filter short noise (was 5)
    excludeServices: ['test-', 'staging-', 'dev-', 'sandbox-'],
    requirePostmortem: false,
    excludeTags: ['test', 'drill', 'synthetic'],
  } as PagerDutyEligibilityRules,

  slack_cluster: {
    minClusterSize: 5,  // FIX F6: Stricter - need more questions (was 3)
    minUniqueAskers: 3,  // FIX F6: Stricter - need more people (was 2)
    maxAgeHours: 168,  // 1 week
    includeChannels: [],  // Empty = all channels
    excludeChannels: ['#random', '#social', '#off-topic', '#watercooler'],
  } as SlackClusterEligibilityRules,

  datadog_alert: {
    minSeverity: 'critical',  // FIX F6: Stricter - only critical alerts (was warning)
    requireRecovery: true,
    excludeMonitorTags: ['test', 'synthetic', 'canary'],
    minOccurrences: 3,  // FIX F6: Stricter - need recurring pattern (was 2)
    excludeMonitorNames: ['[TEST]', '[STAGING]', '[DEV]'],
  } as DatadogAlertEligibilityRules,

  github_iac: {
    includePaths: [
      'terraform/**', 'pulumi/**', 'infra/**', 'infrastructure/**',
      '*.tf', '*.tfvars', 'Pulumi.yaml', 'Pulumi.*.yaml',
    ],
    excludePaths: ['**/test/**', '**/examples/**', '**/sandbox/**'],
    requireApproval: false,
    minChangedResources: 1,
    excludeResourceTypes: ['random_*', 'null_resource', 'local_*'],
  } as IaCEligibilityRules,

  github_codeowners: {
    // CODEOWNERS changes are always eligible
  },
};

// ============================================================================
// Eligibility Check Functions
// ============================================================================

/**
 * Check if a GitHub PR passes eligibility rules
 */
export function checkGitHubPREligibility(
  signal: {
    changedFiles?: Array<{ filename: string }>;
    totalChanges?: number;
    labels?: string[];
    author?: string;
    merged?: boolean;
  },
  rules: GitHubPREligibilityRules
): { eligible: boolean; reason?: string } {
  // Check merged status
  if (rules.requireMerged && !signal.merged) {
    return { eligible: false, reason: 'PR not merged' };
  }

  // Check author exclusions
  if (rules.excludeAuthors.some(a => signal.author?.includes(a))) {
    return { eligible: false, reason: `Author ${signal.author} is excluded` };
  }

  // Check labels
  if (rules.excludeLabels.some(l => signal.labels?.includes(l))) {
    return { eligible: false, reason: 'PR has excluded label' };
  }

  if (rules.requireLabels.length > 0 &&
      !rules.requireLabels.every(l => signal.labels?.includes(l))) {
    return { eligible: false, reason: 'PR missing required labels' };
  }

  // Check changed lines
  const totalChanges = signal.totalChanges ?? 0;
  if (totalChanges < rules.minChangedLines) {
    return { eligible: false, reason: `Only ${totalChanges} lines changed (min: ${rules.minChangedLines})` };
  }
  if (totalChanges > rules.maxChangedLines) {
    return { eligible: false, reason: `${totalChanges} lines changed exceeds max (${rules.maxChangedLines})` };
  }

  // Check path filters
  const files = signal.changedFiles || [];
  const filenames = files.map(f => f.filename);

  // Check for excluded paths
  for (const filename of filenames) {
    if (matchesPattern(filename, rules.excludePaths)) {
      return { eligible: false, reason: `File ${filename} matches exclude pattern` };
    }
  }

  return { eligible: true };
}

/**
 * Check if a PagerDuty incident passes eligibility rules
 */
export function checkPagerDutyEligibility(
  signal: {
    status?: string;
    severity?: string;
    priority?: string;
    service?: string;
    durationMinutes?: number;
    hasNotes?: boolean;
    tags?: string[];
  },
  rules: PagerDutyEligibilityRules
): { eligible: boolean; reason?: string } {
  // Check resolved status
  if (rules.requireResolved && signal.status !== 'resolved') {
    return { eligible: false, reason: 'Incident not resolved' };
  }

  // Check severity
  const severityOrder = ['P1', 'P2', 'P3', 'P4'];
  const minIndex = severityOrder.indexOf(rules.minSeverity);
  const signalPriority = signal.priority || signal.severity || 'P4';
  const signalIndex = severityOrder.findIndex(s => signalPriority.toUpperCase().includes(s));

  if (rules.minSeverity !== 'any' && signalIndex > minIndex) {
    return { eligible: false, reason: `Priority ${signalPriority} below minimum ${rules.minSeverity}` };
  }

  // Check duration
  if (signal.durationMinutes && signal.durationMinutes < rules.minDurationMinutes) {
    return { eligible: false, reason: `Duration ${signal.durationMinutes}m below minimum ${rules.minDurationMinutes}m` };
  }

  // Check service exclusions
  if (signal.service && rules.excludeServices.some(p => signal.service!.includes(p))) {
    return { eligible: false, reason: `Service ${signal.service} matches exclude pattern` };
  }

  // Check postmortem requirement
  if (rules.requirePostmortem && !signal.hasNotes) {
    return { eligible: false, reason: 'Incident has no notes/postmortem' };
  }

  // Check tag exclusions
  if (signal.tags && rules.excludeTags.some(t => signal.tags!.includes(t))) {
    return { eligible: false, reason: 'Incident has excluded tag' };
  }

  return { eligible: true };
}

/**
 * Check if a Slack cluster passes eligibility rules
 */
export function checkSlackClusterEligibility(
  signal: {
    clusterSize?: number;
    uniqueAskers?: number;
    oldestQuestionHoursAgo?: number;
    channel?: string;
  },
  rules: SlackClusterEligibilityRules
): { eligible: boolean; reason?: string } {
  // Check cluster size
  if ((signal.clusterSize ?? 0) < rules.minClusterSize) {
    return { eligible: false, reason: `Cluster size ${signal.clusterSize} below minimum ${rules.minClusterSize}` };
  }

  // Check unique askers
  if ((signal.uniqueAskers ?? 0) < rules.minUniqueAskers) {
    return { eligible: false, reason: `${signal.uniqueAskers} askers below minimum ${rules.minUniqueAskers}` };
  }

  // Check age
  if (signal.oldestQuestionHoursAgo && signal.oldestQuestionHoursAgo > rules.maxAgeHours) {
    return { eligible: false, reason: `Oldest question ${signal.oldestQuestionHoursAgo}h ago exceeds max ${rules.maxAgeHours}h` };
  }

  // Check channel filters
  if (signal.channel) {
    if (rules.excludeChannels.some(c => signal.channel!.includes(c))) {
      return { eligible: false, reason: `Channel ${signal.channel} is excluded` };
    }
    if (rules.includeChannels.length > 0 &&
        !rules.includeChannels.some(c => signal.channel!.includes(c))) {
      return { eligible: false, reason: `Channel ${signal.channel} not in include list` };
    }
  }

  return { eligible: true };
}

/**
 * Simple glob-like pattern matching
 */
function matchesPattern(path: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Convert glob to regex
    const regexStr = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexStr}$`);
    if (regex.test(path)) return true;
  }
  return false;
}

/**
 * Get eligibility rules for a workspace (with defaults fallback)
 */
export function getEligibilityRules(
  sourceType: InputSourceType,
  workspaceRules?: Record<string, unknown>
): unknown {
  // Merge workspace rules with defaults
  const defaults = DEFAULT_ELIGIBILITY_RULES[sourceType] || {};
  if (!workspaceRules) return defaults;

  return { ...defaults, ...workspaceRules };
}

