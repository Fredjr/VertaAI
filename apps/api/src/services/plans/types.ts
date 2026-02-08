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

