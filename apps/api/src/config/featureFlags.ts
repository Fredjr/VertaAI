/**
 * Feature Flags Configuration
 * 
 * Enables gradual rollout of multi-source architecture features.
 * Flags can be overridden via environment variables (FF_<FLAG_NAME>=true)
 * 
 * @see MULTI_SOURCE_IMPLEMENTATION_PLAN.md Section 12.1
 */

// Feature flag definitions with defaults
// NOTE: Phase 1 features are enabled by default for production rollout
export const FEATURE_FLAGS = {
  // Phase 1: Enhance Current Sources (ENABLED)
  ENABLE_README_ADAPTER: true,          // GitHub README.md as output source
  ENABLE_CODEOWNERS_DETECTION: true,    // Parse CODEOWNERS changes for ownership drift
  ENABLE_DOC_CATEGORIES: true,          // Category-aware doc resolution
  ENABLE_NOTION_WRITEBACK: true,        // Notion writeback (already partial)
  ENABLE_ADAPTER_REGISTRY: true,        // Use unified adapter registry

  // Phase 2: API Documentation (ENABLED)
  ENABLE_SWAGGER_ADAPTER: true,         // Swagger/OpenAPI as output source
  ENABLE_BACKSTAGE_ADAPTER: false,      // Backstage catalog integration (TODO)
  ENABLE_API_DRIFT_DETECTION: true,     // API schema drift detection

  // Phase 3: Incident-Based Signals
  ENABLE_PAGERDUTY_WEBHOOK: false,      // PagerDuty incident ingestion
  ENABLE_PROCESS_DRIFT: false,          // Process drift from incidents
  ENABLE_ONCALL_OWNERSHIP: false,       // On-call based ownership drift

  // Phase 4: Knowledge Gap Detection
  ENABLE_SLACK_CLUSTERING: false,       // Slack message question clustering
  ENABLE_COVERAGE_DRIFT: false,         // Coverage drift from repeated questions
  ENABLE_SCHEDULED_ANALYSIS: false,     // Scheduled jobs for Slack analysis

  // Cross-cutting features
  ENABLE_MULTI_DOC_WRITEBACK: false,    // Write patches to multiple docs
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/**
 * Check if a feature flag is enabled
 * 
 * Priority:
 * 1. Environment variable override (FF_<FLAG_NAME>=true|false)
 * 2. Workspace-specific override (future: stored in Workspace.settings)
 * 3. Default value from FEATURE_FLAGS
 * 
 * @param flag - The feature flag to check
 * @param workspaceId - Optional workspace ID for workspace-specific overrides
 * @returns boolean - Whether the feature is enabled
 */
export function isFeatureEnabled(flag: FeatureFlag, workspaceId?: string): boolean {
  // 1. Check environment variable override
  const envKey = `FF_${flag}`;
  const envValue = process.env[envKey];
  if (envValue !== undefined) {
    return envValue.toLowerCase() === 'true';
  }

  // 2. Future: Check workspace-specific override
  // This would query Workspace.settings for feature overrides
  // For now, skip this check
  if (workspaceId) {
    // TODO: Implement workspace-specific feature flag overrides
    // const workspace = await prisma.workspace.findUnique({ ... });
    // if (workspace?.settings?.featureFlags?.[flag] !== undefined) {
    //   return workspace.settings.featureFlags[flag];
    // }
  }

  // 3. Return default value
  return FEATURE_FLAGS[flag];
}

/**
 * Check multiple feature flags at once
 * 
 * @param flags - Array of feature flags to check
 * @param workspaceId - Optional workspace ID for workspace-specific overrides
 * @returns Record of flag -> enabled status
 */
export function getFeatureFlags(
  flags: FeatureFlag[],
  workspaceId?: string
): Record<FeatureFlag, boolean> {
  const result: Partial<Record<FeatureFlag, boolean>> = {};
  
  for (const flag of flags) {
    result[flag] = isFeatureEnabled(flag, workspaceId);
  }
  
  return result as Record<FeatureFlag, boolean>;
}

/**
 * Get all feature flags and their current status
 * Useful for debugging and admin dashboards
 */
export function getAllFeatureFlags(workspaceId?: string): Record<FeatureFlag, boolean> {
  return getFeatureFlags(Object.keys(FEATURE_FLAGS) as FeatureFlag[], workspaceId);
}

/**
 * Feature flag guard for conditional code execution
 * 
 * @example
 * ```typescript
 * await withFeatureFlag('ENABLE_README_ADAPTER', async () => {
 *   // Code that only runs if feature is enabled
 * });
 * ```
 */
export async function withFeatureFlag<T>(
  flag: FeatureFlag,
  fn: () => Promise<T>,
  workspaceId?: string
): Promise<T | null> {
  if (isFeatureEnabled(flag, workspaceId)) {
    return fn();
  }
  return null;
}

// Export for testing
export const __test__ = {
  FEATURE_FLAGS,
};

