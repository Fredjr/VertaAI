/**
 * Doc Targeting by Drift Type and Source Type
 *
 * Maps drift types to preferred output targets (doc systems) with priority order.
 * Also enforces source-output compatibility constraints.
 * This is the #2 critical component - ensures patches go to the right documentation.
 *
 * @see Point 2 in Multi-Source Enrichment Plan
 */

import type { DocSystem, DriftType, InputSourceType } from '../services/docs/adapters/types.js';

// ============================================================================
// Types
// ============================================================================

export interface DocTargetConfig {
  primary: DocSystem[];    // First choice targets (try in order)
  secondary: DocSystem[];  // Fallback targets if primary not available
  exclude: DocSystem[];    // Never target these for this drift type
}

// ============================================================================
// Drift Type → Output Target Mapping
// ============================================================================

/**
 * Maps each drift type to preferred doc systems
 * 
 * Design principles:
 * - instruction drift → developer docs (README, Swagger, Code Comments)
 * - process drift → functional docs (Confluence, Notion, GitBook runbooks)
 * - ownership drift → operational + functional (Backstage catalog, team docs)
 * - coverage drift → functional docs (FAQ, knowledge base)
 * - environment_tooling drift → developer + functional (README, infra docs)
 */
export const DRIFT_TYPE_TO_DOC_TARGETS: Record<DriftType, DocTargetConfig> = {
  instruction: {
    primary: ['github_readme', 'github_swagger', 'github_code_comments'],
    secondary: ['confluence', 'notion', 'gitbook'],
    exclude: ['backstage'],  // Backstage is for service catalog, not instructions
  },
  
  process: {
    primary: ['confluence', 'notion', 'gitbook'],
    secondary: ['github_readme'],
    exclude: ['github_swagger', 'github_code_comments', 'backstage'],
  },
  
  ownership: {
    primary: ['backstage', 'confluence', 'notion'],
    secondary: ['github_readme'],
    exclude: ['github_swagger', 'github_code_comments'],
  },
  
  coverage: {
    primary: ['confluence', 'notion', 'gitbook'],
    secondary: ['github_readme'],
    exclude: ['github_swagger', 'github_code_comments', 'backstage'],
  },
  
  environment_tooling: {
    primary: ['github_readme', 'confluence', 'notion'],
    secondary: ['gitbook'],
    exclude: ['github_swagger', 'github_code_comments', 'backstage'],
  },
};

// ============================================================================
// Section Targeting by Output (Point 4)
// ============================================================================

export interface SectionPattern {
  heading: string;         // Heading text or regex pattern
  priority: number;        // Lower = higher priority
  driftTypes: DriftType[]; // Which drift types target this section
}

/**
 * Section patterns per doc system
 * Defines which sections to target for each drift type in each doc system
 */
export const DOC_SYSTEM_SECTION_PATTERNS: Record<DocSystem, SectionPattern[]> = {
  github_readme: [
    { heading: 'Installation', priority: 1, driftTypes: ['instruction', 'environment_tooling'] },
    { heading: 'Getting Started', priority: 2, driftTypes: ['instruction'] },
    { heading: 'Configuration', priority: 3, driftTypes: ['instruction', 'environment_tooling'] },
    { heading: 'Usage', priority: 4, driftTypes: ['instruction'] },
    { heading: 'API', priority: 5, driftTypes: ['instruction'] },
    { heading: 'Deployment', priority: 6, driftTypes: ['environment_tooling'] },
    { heading: 'Contributing', priority: 7, driftTypes: ['process'] },
    { heading: 'Team', priority: 8, driftTypes: ['ownership'] },
    { heading: 'Maintainers', priority: 9, driftTypes: ['ownership'] },
    { heading: 'FAQ', priority: 10, driftTypes: ['coverage'] },
  ],
  
  confluence: [
    { heading: 'Runbook', priority: 1, driftTypes: ['process'] },
    { heading: 'Incident Response', priority: 2, driftTypes: ['process'] },
    { heading: 'Deployment Guide', priority: 3, driftTypes: ['process', 'environment_tooling'] },
    { heading: 'Configuration', priority: 4, driftTypes: ['instruction', 'environment_tooling'] },
    { heading: 'Team', priority: 5, driftTypes: ['ownership'] },
    { heading: 'On-Call', priority: 6, driftTypes: ['ownership', 'process'] },
    { heading: 'FAQ', priority: 7, driftTypes: ['coverage'] },
    { heading: 'Troubleshooting', priority: 8, driftTypes: ['coverage', 'process'] },
  ],
  
  notion: [
    { heading: 'Runbook', priority: 1, driftTypes: ['process'] },
    { heading: 'Incident Response', priority: 2, driftTypes: ['process'] },
    { heading: 'Deployment', priority: 3, driftTypes: ['process', 'environment_tooling'] },
    { heading: 'Team', priority: 4, driftTypes: ['ownership'] },
    { heading: 'FAQ', priority: 5, driftTypes: ['coverage'] },
  ],
  
  github_swagger: [
    { heading: 'paths', priority: 1, driftTypes: ['instruction'] },
    { heading: 'components', priority: 2, driftTypes: ['instruction'] },
    { heading: 'info.description', priority: 3, driftTypes: ['instruction'] },
  ],
  
  backstage: [
    { heading: 'spec.owner', priority: 1, driftTypes: ['ownership'] },
    { heading: 'metadata.description', priority: 2, driftTypes: ['instruction'] },
    { heading: 'spec.lifecycle', priority: 3, driftTypes: ['environment_tooling'] },
  ],
  
  github_code_comments: [
    { heading: '@param', priority: 1, driftTypes: ['instruction'] },
    { heading: '@returns', priority: 2, driftTypes: ['instruction'] },
    { heading: '@description', priority: 3, driftTypes: ['instruction'] },
  ],
  
  gitbook: [
    { heading: 'Runbook', priority: 1, driftTypes: ['process'] },
    { heading: 'Guide', priority: 2, driftTypes: ['instruction', 'process'] },
    { heading: 'Configuration', priority: 3, driftTypes: ['instruction', 'environment_tooling'] },
    { heading: 'Team', priority: 4, driftTypes: ['ownership'] },
    { heading: 'FAQ', priority: 5, driftTypes: ['coverage'] },
  ],
};

// ============================================================================
// Source → Output Compatibility Matrix (CRITICAL)
// ============================================================================

/**
 * Defines which input sources can target which output systems.
 * This is a hard constraint - violations are rejected.
 *
 * Design principles:
 * - IaC changes → README only (infrastructure docs live in code)
 * - PagerDuty incidents → Runbooks only (operational docs)
 * - Slack questions → FAQ sections (knowledge base)
 * - GitHub PR → Any developer/functional docs
 * - CODEOWNERS → Backstage + team docs only
 */
export const SOURCE_OUTPUT_COMPATIBILITY: Record<InputSourceType, DocSystem[]> = {
  github_pr: [
    'github_readme',
    'github_swagger',
    'github_code_comments',
    'confluence',
    'notion',
    'gitbook',
    'backstage',  // Can update service descriptions
  ],

  pagerduty_incident: [
    'confluence',   // Runbooks
    'notion',       // Runbooks
    'gitbook',      // Runbooks
    'backstage',    // Service catalog (on-call info)
  ],

  slack_cluster: [
    'confluence',   // FAQ sections
    'notion',       // FAQ sections
    'gitbook',      // FAQ sections
    'github_readme', // FAQ in README
  ],

  datadog_alert: [
    'confluence',   // Observability runbooks
    'notion',       // Observability runbooks
    'gitbook',      // Observability runbooks
  ],

  github_iac: [
    'github_readme',  // Infrastructure docs in README
    'confluence',     // Deployment guides
    'notion',         // Deployment guides
  ],

  github_codeowners: [
    'backstage',      // Service catalog ownership
    'github_readme',  // Team section in README
    'confluence',     // Team pages
    'notion',         // Team pages
  ],

  grafana_alert: [
    'confluence',   // Observability runbooks
    'notion',       // Observability runbooks
    'gitbook',      // Observability runbooks
  ],
};

/**
 * Combined routing decision: source + drift type → output targets
 *
 * This is the CRITICAL routing function that determines where patches go.
 * It combines:
 * 1. Source-output compatibility (hard constraint)
 * 2. Drift type preferences (soft preference)
 */
export function getTargetDocSystemsForSourceAndDrift(
  sourceType: InputSourceType,
  driftType: DriftType
): DocSystem[] {
  // Step 1: Get allowed outputs for this source (hard constraint)
  const allowedOutputs = SOURCE_OUTPUT_COMPATIBILITY[sourceType] || [];

  // Step 2: Get preferred outputs for this drift type
  const driftConfig = DRIFT_TYPE_TO_DOC_TARGETS[driftType];
  const preferredOutputs = [...driftConfig.primary, ...driftConfig.secondary];

  // Step 3: Intersect - only outputs that satisfy BOTH constraints
  const validOutputs = preferredOutputs.filter(output =>
    allowedOutputs.includes(output) && !driftConfig.exclude.includes(output)
  );

  // Step 4: If no valid outputs, fall back to allowed outputs
  if (validOutputs.length === 0) {
    return allowedOutputs.filter(output => !driftConfig.exclude.includes(output));
  }

  return validOutputs;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get target doc systems for a drift type (in priority order)
 * @deprecated Use getTargetDocSystemsForSourceAndDrift instead
 */
export function getTargetDocSystems(driftType: DriftType): DocSystem[] {
  const config = DRIFT_TYPE_TO_DOC_TARGETS[driftType];
  return [...config.primary, ...config.secondary];
}

/**
 * Check if a doc system is excluded for a drift type
 */
export function isDocSystemExcluded(driftType: DriftType, docSystem: DocSystem): boolean {
  const config = DRIFT_TYPE_TO_DOC_TARGETS[driftType];
  return config.exclude.includes(docSystem);
}

/**
 * Check if a source can target a specific output (hard constraint)
 */
export function isSourceOutputCompatible(sourceType: InputSourceType, docSystem: DocSystem): boolean {
  const allowedOutputs = SOURCE_OUTPUT_COMPATIBILITY[sourceType] || [];
  return allowedOutputs.includes(docSystem);
}

/**
 * Get section patterns for a doc system and drift type
 */
export function getSectionPatterns(docSystem: DocSystem, driftType: DriftType): SectionPattern[] {
  const patterns = DOC_SYSTEM_SECTION_PATTERNS[docSystem] || [];
  return patterns
    .filter(p => p.driftTypes.includes(driftType))
    .sort((a, b) => a.priority - b.priority);
}

