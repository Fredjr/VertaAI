/**
 * Feature Flags Configuration
 * 
 * Enables gradual rollout of multi-source architecture features.
 * Flags can be overridden via environment variables (FF_<FLAG_NAME>=true)
 * 
 * @see MULTI_SOURCE_IMPLEMENTATION_PLAN.md Section 12.1
 */

// Feature flag definitions with defaults
// FIX F8: Starter mode - only GitHub PR → Confluence enabled by default
// This focuses new users on one tight loop to prove value before expanding
export const FEATURE_FLAGS = {
  // Phase 1: Enhance Current Sources (STARTER MODE - SELECTIVE)
  ENABLE_README_ADAPTER: false,         // FIX F8: Disabled in starter mode
  ENABLE_CODEOWNERS_DETECTION: true,    // Keep - useful for ownership drift
  ENABLE_DOC_CATEGORIES: true,          // Keep - core feature
  ENABLE_NOTION_WRITEBACK: false,       // FIX F8: Disabled in starter mode (Confluence only)
  ENABLE_ADAPTER_REGISTRY: true,        // Keep - core infrastructure

  // Phase 2: API Documentation (DISABLED IN STARTER MODE)
  ENABLE_SWAGGER_ADAPTER: false,        // FIX F8: Disabled in starter mode
  ENABLE_BACKSTAGE_ADAPTER: false,      // FIX F8: Disabled in starter mode
  ENABLE_API_DRIFT_DETECTION: false,    // FIX F8: Disabled in starter mode

  // Phase 3: Incident-Based Signals (DISABLED IN STARTER MODE)
  ENABLE_PAGERDUTY_WEBHOOK: false,      // FIX F8: Disabled in starter mode
  ENABLE_PROCESS_DRIFT: true,           // Keep - core drift type
  ENABLE_ONCALL_OWNERSHIP: false,       // FIX F8: Disabled in starter mode

  // Phase 4: Knowledge Gap Detection (DISABLED IN STARTER MODE)
  ENABLE_SLACK_CLUSTERING: false,       // FIX F8: Disabled in starter mode
  ENABLE_COVERAGE_DRIFT: false,         // FIX F8: Disabled in starter mode
  ENABLE_SCHEDULED_ANALYSIS: false,     // FIX F8: Disabled in starter mode

  // Phase 5: Complete Multi-Source Architecture (DISABLED IN STARTER MODE)
  ENABLE_DATADOG_WEBHOOK: false,        // FIX F8: Disabled in starter mode
  ENABLE_IAC_PARSER: false,             // FIX F8: Disabled in starter mode
  ENABLE_CODE_COMMENTS_ADAPTER: false,  // FIX F8: Disabled in starter mode
  ENABLE_GITBOOK_ADAPTER: false,        // FIX F8: Disabled in starter mode
  ENABLE_WORKFLOW_SETTINGS: true,       // Keep - allows users to customize

  // Cross-cutting features
  ENABLE_MULTI_DOC_WRITEBACK: false,    // Disabled - single doc focus

  // Evidence & drift intelligence features (Phases 1-5)
  ENABLE_TYPED_DELTAS: false,           // Phase 1: Structured deltas from comparison
  ENABLE_EVIDENCE_TO_LLM: false,        // Phase 2: Evidence-grounded LLM prompts
  ENABLE_MATERIALITY_GATE: false,       // Phase 3: Materiality-based routing
  ENABLE_CONTEXT_EXPANSION: false,      // Phase 4: Bounded context expansion
  ENABLE_TEMPORAL_ACCUMULATION: false,  // Phase 5: Temporal drift accumulation
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/**
 * Mapping from user-friendly workspace toggles to technical feature flags
 * This allows the UI to expose product-language settings while keeping
 * implementation details hidden.
 */
const UX_TOGGLE_TO_FLAGS: Record<string, FeatureFlag[]> = {
  evidenceGroundedPatching: ['ENABLE_TYPED_DELTAS', 'ENABLE_EVIDENCE_TO_LLM'],
  skipLowValuePatches: ['ENABLE_MATERIALITY_GATE'],
  expandedContextMode: ['ENABLE_CONTEXT_EXPANSION'],
  trackCumulativeDrift: ['ENABLE_TEMPORAL_ACCUMULATION'],
};

/**
 * In-memory cache for workspace preferences to avoid repeated DB queries
 * Cache is invalidated after 60 seconds
 */
interface WorkspacePrefsCache {
  prefs: any;
  timestamp: number;
}
const workspacePrefsCache = new Map<string, WorkspacePrefsCache>();
const CACHE_TTL_MS = 60000; // 60 seconds

/**
 * Get workspace preferences from cache or database
 * This is a synchronous function that uses cached data to avoid blocking
 */
function getCachedWorkspacePrefs(workspaceId: string): any | null {
  const cached = workspacePrefsCache.get(workspaceId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.prefs;
  }
  return null;
}

/**
 * Preload workspace preferences into cache (call this from async contexts)
 * This should be called when workspace data is already being fetched
 */
export function cacheWorkspacePrefs(workspaceId: string, prefs: any): void {
  workspacePrefsCache.set(workspaceId, {
    prefs,
    timestamp: Date.now(),
  });
}

/**
 * Clear workspace preferences cache (useful for testing)
 */
export function clearWorkspacePrefsCache(workspaceId?: string): void {
  if (workspaceId) {
    workspacePrefsCache.delete(workspaceId);
  } else {
    workspacePrefsCache.clear();
  }
}

/**
 * Check if a feature flag is enabled
 *
 * Priority:
 * 1. Environment variable override (FF_<FLAG_NAME>=true|false)
 * 2. Workspace-specific override (from workflowPreferences JSON field)
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

  // 2. Check workspace-specific override via UX toggles
  if (workspaceId) {
    const prefs = getCachedWorkspacePrefs(workspaceId);
    if (prefs) {
      // Check if any UX toggle enables this flag
      for (const [toggleName, flags] of Object.entries(UX_TOGGLE_TO_FLAGS)) {
        if (flags.includes(flag) && prefs[toggleName] === true) {
          return true;
        }
      }
    }
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

