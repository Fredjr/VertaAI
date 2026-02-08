// DriftPlan Templates
// Phase 3: Control-Plane Architecture
// Built-in templates for common patterns

import { PlanTemplate } from './types.js';

export const PLAN_TEMPLATES: PlanTemplate[] = [
  // 1. Microservice Template
  {
    id: 'microservice',
    name: 'Microservice Runbook',
    description: 'Standard template for microservice runbooks with deployment, rollback, and incident response procedures',
    category: 'microservice',
    config: {
      inputSources: ['github_pr', 'pagerduty_incident', 'slack_cluster'],
      driftTypes: ['instruction', 'process', 'ownership'],
      allowedOutputs: ['confluence', 'notion', 'github_readme'],
      thresholds: {
        minConfidence: 0.6,
        minImpactScore: 0.5,
        minDriftScore: 0.5,
      },
      eligibility: {
        requiresIncident: false,
        minSeverity: 'sev3',
        requiresApproval: false,
      },
      sectionTargets: {
        instruction: 'Deployment Steps',
        process: 'Runbook',
        ownership: 'Team & Ownership',
      },
      impactRules: {
        baseImpact: 0.7,
        multipliers: [
          { name: 'deployment_related', factor: 1.3, condition: 'pr.deploymentRelated === true' },
          { name: 'high_severity', factor: 1.2, condition: 'incident.severity === "sev1" || incident.severity === "sev2"' },
        ],
      },
      writeback: {
        enabled: true,
        requiresApproval: false,
        autoMerge: false,
      },
    },
  },

  // 2. API Gateway Template
  {
    id: 'api_gateway',
    name: 'API Gateway Documentation',
    description: 'Template for API gateway documentation with endpoint definitions, authentication, and rate limiting',
    category: 'api_gateway',
    config: {
      inputSources: ['github_pr', 'github_swagger'],
      driftTypes: ['instruction', 'coverage'],
      allowedOutputs: ['confluence', 'github_swagger', 'backstage'],
      thresholds: {
        minConfidence: 0.7,
        minImpactScore: 0.6,
        minDriftScore: 0.6,
      },
      eligibility: {
        requiresIncident: false,
        requiresApproval: true, // API changes require approval
      },
      sectionTargets: {
        instruction: 'API Endpoints',
        coverage: 'API Reference',
      },
      impactRules: {
        baseImpact: 0.75,
        multipliers: [
          { name: 'api_contract_changed', factor: 1.5, condition: 'pr.apiContractChanged === true' },
          { name: 'auth_related', factor: 1.4, condition: 'pr.authRelated === true' },
        ],
      },
      writeback: {
        enabled: true,
        requiresApproval: true,
        autoMerge: false,
        reviewers: ['api-team'],
      },
    },
  },

  // 3. Database Template
  {
    id: 'database',
    name: 'Database Operations',
    description: 'Template for database operations documentation with migration procedures, backup/restore, and troubleshooting',
    category: 'database',
    config: {
      inputSources: ['github_pr', 'pagerduty_incident', 'github_iac'],
      driftTypes: ['instruction', 'process'],
      allowedOutputs: ['confluence', 'notion'],
      thresholds: {
        minConfidence: 0.7,
        minImpactScore: 0.7,
        minDriftScore: 0.6,
      },
      eligibility: {
        requiresIncident: false,
        minSeverity: 'sev2',
        requiresApproval: true, // Database changes require approval
      },
      sectionTargets: {
        instruction: 'Migration Procedures',
        process: 'Database Operations',
      },
      impactRules: {
        baseImpact: 0.8,
        multipliers: [
          { name: 'production_impact', factor: 1.5, condition: 'iac.productionImpact === true' },
          { name: 'critical_resources', factor: 1.3, condition: 'iac.criticalResources.length > 0' },
        ],
      },
      writeback: {
        enabled: true,
        requiresApproval: true,
        autoMerge: false,
        reviewers: ['database-team', 'sre-team'],
      },
    },
  },

  // 4. Infrastructure Template
  {
    id: 'infrastructure',
    name: 'Infrastructure Documentation',
    description: 'Template for infrastructure documentation with provisioning, scaling, and disaster recovery procedures',
    category: 'infrastructure',
    config: {
      inputSources: ['github_iac', 'pagerduty_incident', 'datadog_alert', 'grafana_alert'],
      driftTypes: ['instruction', 'process', 'environment_tooling'],
      allowedOutputs: ['confluence', 'notion', 'github_readme'],
      thresholds: {
        minConfidence: 0.6,
        minImpactScore: 0.6,
        minDriftScore: 0.5,
      },
      eligibility: {
        requiresIncident: false,
        minSeverity: 'sev3',
        requiresApproval: true,
      },
      sectionTargets: {
        instruction: 'Infrastructure Setup',
        process: 'Operations Runbook',
        environment_tooling: 'Tools & Configuration',
      },
      impactRules: {
        baseImpact: 0.75,
        multipliers: [
          { name: 'production_impact', factor: 1.4, condition: 'iac.productionImpact === true' },
          { name: 'high_severity_alert', factor: 1.3, condition: 'alert.severity === "critical"' },
        ],
      },
      writeback: {
        enabled: true,
        requiresApproval: true,
        autoMerge: false,
        reviewers: ['sre-team', 'platform-team'],
      },
    },
  },

  // 5. Security Template
  {
    id: 'security',
    name: 'Security Documentation',
    description: 'Template for security documentation with authentication, authorization, incident response, and compliance procedures',
    category: 'security',
    config: {
      inputSources: ['github_pr', 'pagerduty_incident', 'github_codeowners'],
      driftTypes: ['instruction', 'process', 'ownership'],
      allowedOutputs: ['confluence', 'notion'],
      thresholds: {
        minConfidence: 0.8,
        minImpactScore: 0.8,
        minDriftScore: 0.7,
      },
      eligibility: {
        requiresIncident: false,
        minSeverity: 'sev2',
        requiresApproval: true, // Security changes always require approval
      },
      sectionTargets: {
        instruction: 'Security Procedures',
        process: 'Incident Response',
        ownership: 'Security Team & Escalation',
      },
      impactRules: {
        baseImpact: 0.9,
        multipliers: [
          { name: 'auth_related', factor: 1.5, condition: 'pr.authRelated === true' },
          { name: 'critical_paths', factor: 1.4, condition: 'codeowners.criticalPaths.length > 0' },
          { name: 'high_severity', factor: 1.3, condition: 'incident.severity === "sev1"' },
        ],
      },
      writeback: {
        enabled: true,
        requiresApproval: true,
        autoMerge: false,
        reviewers: ['security-team', 'compliance-team'],
      },
    },
  },
];

/**
 * Get a template by ID
 */
export function getTemplateById(templateId: string): PlanTemplate | undefined {
  return PLAN_TEMPLATES.find(t => t.id === templateId);
}

/**
 * Get all templates
 */
export function getAllTemplates(): PlanTemplate[] {
  return PLAN_TEMPLATES;
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: PlanTemplate['category']): PlanTemplate[] {
  return PLAN_TEMPLATES.filter(t => t.category === category);
}

