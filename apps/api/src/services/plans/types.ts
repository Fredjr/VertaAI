// DriftPlan Type Definitions
// Phase 3: Control-Plane Architecture

export interface DriftPlanConfig {
  // Input sources allowed for this plan
  inputSources: string[]; // ['github_pr', 'pagerduty_incident', 'slack_cluster', ...]
  
  // Drift types allowed for this plan
  driftTypes: string[]; // ['instruction', 'process', 'ownership', 'coverage', 'environment_tooling']
  
  // Allowed output targets
  allowedOutputs: string[]; // ['confluence', 'notion', 'github_readme', ...]
  
  // Thresholds for drift detection
  thresholds: {
    minConfidence?: number; // Minimum confidence score (0-1)
    minImpactScore?: number; // Minimum impact score (0-1)
    minDriftScore?: number; // Minimum drift score (0-1)
  };
  
  // Eligibility rules
  eligibility: {
    requiresIncident?: boolean; // Requires PagerDuty incident
    minSeverity?: string; // Minimum severity level ('sev1', 'sev2', 'sev3', 'sev4')
    requiresApproval?: boolean; // Requires human approval before writeback
  };
  
  // Section targets for different drift types
  sectionTargets: {
    instruction?: string; // Target section for instruction drift
    process?: string; // Target section for process drift
    ownership?: string; // Target section for ownership drift
    coverage?: string; // Target section for coverage drift
    environment_tooling?: string; // Target section for environment/tooling drift
  };
  
  // Custom impact rules
  impactRules: {
    baseImpact?: number; // Base impact score (0-1)
    multipliers?: Array<{
      name: string;
      factor: number;
      condition: string; // Condition expression
    }>;
  };
  
  // Writeback configuration
  writeback: {
    enabled: boolean;
    requiresApproval: boolean;
    autoMerge?: boolean;
    reviewers?: string[]; // List of required reviewers
  };
}

export interface DriftPlan {
  workspaceId: string;
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'archived' | 'draft';
  
  // Scope
  scopeType: 'workspace' | 'service' | 'repo';
  scopeRef?: string; // service ID or repo full name
  
  // Primary doc
  primaryDocId?: string;
  primaryDocSystem?: string;
  docClass?: string;
  
  // Configuration
  inputSources: string[];
  driftTypes: string[];
  allowedOutputs: string[];
  thresholds: any;
  eligibility: any;
  sectionTargets: any;
  impactRules: any;
  writeback: any;
  
  // Versioning
  version: number;
  versionHash: string;
  parentId?: string;
  
  // Template
  templateId?: string;
  templateName?: string;
  
  // Audit
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  category: 'microservice' | 'api_gateway' | 'database' | 'infrastructure' | 'security' | 'custom';
  config: DriftPlanConfig;
}

export interface PlanResolutionResult {
  plan: DriftPlan | null;
  coverageFlags: {
    hasPlan: boolean;
    planScope: 'workspace' | 'service' | 'repo' | 'none';
    resolutionMethod: 'exact_match' | 'repo_match' | 'service_match' | 'workspace_default' | 'none';
  };
}

export interface CreatePlanArgs {
  workspaceId: string;
  name: string;
  description?: string;
  scopeType: 'workspace' | 'service' | 'repo';
  scopeRef?: string;
  primaryDocId?: string;
  primaryDocSystem?: string;
  docClass?: string;
  config: DriftPlanConfig;
  templateId?: string;
  createdBy?: string;
}

export interface ResolvePlanArgs {
  workspaceId: string;
  serviceId?: string;
  repoFullName?: string;
  docClass?: string;
}

// ============================================================================
// Gap #6 Part 2: Control-Plane Field Types
// ============================================================================

export interface DocTargetingConfig {
  strategy: 'primary_first' | 'all_parallel';
  maxDocsPerDrift: number;
  priorityOrder?: string[]; // ['confluence', 'notion', 'github_readme', ...]
}

export const DEFAULT_DOC_TARGETING: DocTargetingConfig = {
  strategy: 'primary_first',
  maxDocsPerDrift: 3,
  priorityOrder: ['confluence', 'notion', 'github_readme'],
};

export interface SourceCursor {
  lastProcessedAt: string; // ISO 8601 timestamp
  lastPrNumber?: number; // For GitHub PR
  lastIncidentId?: string; // For PagerDuty
  lastClusterId?: string; // For Slack
  lastAlertId?: string; // For Datadog/Grafana
  lastCommitSha?: string; // For IaC/CODEOWNERS
}

export type SourceCursors = {
  [sourceType: string]: SourceCursor;
};

export interface BudgetConfig {
  maxDriftsPerDay: number;
  maxDriftsPerWeek: number;
  maxSlackNotificationsPerHour: number;
}

export const DEFAULT_BUDGETS: BudgetConfig = {
  maxDriftsPerDay: 50,
  maxDriftsPerWeek: 200,
  maxSlackNotificationsPerHour: 5,
};

export interface NoiseControlsConfig {
  ignorePatterns: string[]; // ['WIP:', 'draft:', '[skip-drift]', ...]
  ignorePaths: string[]; // ['test/**', 'node_modules/**', '.github/**', ...]
  ignoreAuthors: string[]; // ['bot', 'dependabot', 'renovate', ...]
}

export const DEFAULT_NOISE_CONTROLS: NoiseControlsConfig = {
  ignorePatterns: ['WIP:', 'draft:', '[skip-drift]', '[no-drift]'],
  ignorePaths: ['test/**', 'node_modules/**', '.github/**', 'dist/**'],
  ignoreAuthors: ['bot', 'dependabot', 'renovate'],
};

export interface ThresholdConfig {
  autoApprove: number; // e.g., 0.98
  slackNotify: number; // e.g., 0.40
  digestOnly: number; // e.g., 0.30
  ignore: number; // e.g., 0.20
}

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  autoApprove: 0.98,
  slackNotify: 0.40,
  digestOnly: 0.30,
  ignore: 0.20,
};

// ============================================================================
// Helper Functions
// ============================================================================

export function parseDocTargeting(json: any): DocTargetingConfig {
  if (!json || typeof json !== 'object') {
    return DEFAULT_DOC_TARGETING;
  }
  return {
    strategy: json.strategy || DEFAULT_DOC_TARGETING.strategy,
    maxDocsPerDrift: json.maxDocsPerDrift || DEFAULT_DOC_TARGETING.maxDocsPerDrift,
    priorityOrder: json.priorityOrder || DEFAULT_DOC_TARGETING.priorityOrder,
  };
}

export function parseSourceCursors(json: any): SourceCursors {
  if (!json || typeof json !== 'object') {
    return {};
  }
  return json as SourceCursors;
}

export function parseBudgets(json: any): BudgetConfig {
  if (!json || typeof json !== 'object') {
    return DEFAULT_BUDGETS;
  }
  return {
    maxDriftsPerDay: json.maxDriftsPerDay || DEFAULT_BUDGETS.maxDriftsPerDay,
    maxDriftsPerWeek: json.maxDriftsPerWeek || DEFAULT_BUDGETS.maxDriftsPerWeek,
    maxSlackNotificationsPerHour: json.maxSlackNotificationsPerHour || DEFAULT_BUDGETS.maxSlackNotificationsPerHour,
  };
}

export function parseNoiseControls(json: any): NoiseControlsConfig {
  if (!json || typeof json !== 'object') {
    return DEFAULT_NOISE_CONTROLS;
  }
  return {
    ignorePatterns: json.ignorePatterns || DEFAULT_NOISE_CONTROLS.ignorePatterns,
    ignorePaths: json.ignorePaths || DEFAULT_NOISE_CONTROLS.ignorePaths,
    ignoreAuthors: json.ignoreAuthors || DEFAULT_NOISE_CONTROLS.ignoreAuthors,
  };
}

export function parseThresholds(json: any): ThresholdConfig {
  if (!json || typeof json !== 'object') {
    return DEFAULT_THRESHOLDS;
  }
  return {
    autoApprove: json.autoApprove ?? DEFAULT_THRESHOLDS.autoApprove,
    slackNotify: json.slackNotify ?? DEFAULT_THRESHOLDS.slackNotify,
    digestOnly: json.digestOnly ?? DEFAULT_THRESHOLDS.digestOnly,
    ignore: json.ignore ?? DEFAULT_THRESHOLDS.ignore,
  };
}

