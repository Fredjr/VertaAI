/**
 * Impact Rules Matrix
 * 
 * Defines impact scoring rules for different source type + target surface combinations.
 * Each rule specifies base impact, multipliers, and conditions for firing.
 */

import type { ImpactInputs, GitHubPRInputs, PagerDutyInputs, SlackInputs, AlertInputs, IaCInputs, CodeownersInputs } from './impactInputs.js';
import type { TargetSurface } from './types.js';

/**
 * Impact rule definition
 */
export interface ImpactRule {
  id: string;
  name: string;
  sourceType: ImpactInputs['sourceType'];
  targetSurface: TargetSurface;
  baseImpact: number; // 0-1 scale
  multipliers: ImpactMultiplier[];
  conditions: RuleCondition[];
}

/**
 * Impact multiplier based on specific conditions
 */
export interface ImpactMultiplier {
  name: string;
  factor: number; // Multiplier (e.g., 1.5 = +50%, 0.8 = -20%)
  condition: (inputs: ImpactInputs) => boolean;
}

/**
 * Condition for rule firing
 */
export interface RuleCondition {
  name: string;
  check: (inputs: ImpactInputs) => boolean;
}

/**
 * Impact rules matrix for all source+target combinations
 */
export const IMPACT_RULES: ImpactRule[] = [
  // GitHub PR + Runbook = High impact for instruction drift
  {
    id: 'github_pr_runbook_instruction',
    name: 'GitHub PR changes affecting runbook instructions',
    sourceType: 'github_pr',
    targetSurface: 'runbook',
    baseImpact: 0.7, // High base impact
    multipliers: [
      {
        name: 'deployment_related',
        factor: 1.3,
        condition: (inputs) => {
          const pr = inputs.sourceSpecific as GitHubPRInputs;
          return pr.deploymentRelated;
        }
      },
      {
        name: 'large_change',
        factor: 1.2,
        condition: (inputs) => {
          const pr = inputs.sourceSpecific as GitHubPRInputs;
          return pr.linesChanged > 200;
        }
      },
      {
        name: 'critical_files',
        factor: 1.4,
        condition: (inputs) => {
          const pr = inputs.sourceSpecific as GitHubPRInputs;
          return pr.criticalFiles.length > 0;
        }
      }
    ],
    conditions: [
      {
        name: 'has_pr_diff',
        check: (inputs) => inputs.sourceType === 'github_pr'
      }
    ]
  },

  // PagerDuty Incident + Runbook = Critical impact
  {
    id: 'pagerduty_runbook_critical',
    name: 'PagerDuty incident indicating runbook is outdated',
    sourceType: 'pagerduty_incident',
    targetSurface: 'runbook',
    baseImpact: 0.85, // Critical base impact
    multipliers: [
      {
        name: 'high_severity',
        factor: 1.2,
        condition: (inputs) => {
          const pd = inputs.sourceSpecific as PagerDutyInputs;
          return pd.incidentSeverity === 'critical' || pd.incidentSeverity === 'high';
        }
      },
      {
        name: 'recurring_incident',
        factor: 1.5,
        condition: (inputs) => {
          const pd = inputs.sourceSpecific as PagerDutyInputs;
          return pd.isRecurring;
        }
      },
      {
        name: 'many_responders',
        factor: 1.3,
        condition: (inputs) => {
          const pd = inputs.sourceSpecific as PagerDutyInputs;
          return pd.responderCount >= 3;
        }
      }
    ],
    conditions: [
      {
        name: 'is_pagerduty',
        check: (inputs) => inputs.sourceType === 'pagerduty_incident'
      }
    ]
  },

  // GitHub PR + API Contract = High impact for API changes
  {
    id: 'github_pr_api_contract',
    name: 'GitHub PR changes affecting API contract',
    sourceType: 'github_pr',
    targetSurface: 'api_contract',
    baseImpact: 0.75,
    multipliers: [
      {
        name: 'api_contract_changed',
        factor: 1.5,
        condition: (inputs) => {
          const pr = inputs.sourceSpecific as GitHubPRInputs;
          return pr.apiContractChanged;
        }
      },
      {
        name: 'auth_related',
        factor: 1.4,
        condition: (inputs) => {
          const pr = inputs.sourceSpecific as GitHubPRInputs;
          return pr.authRelated;
        }
      }
    ],
    conditions: [
      {
        name: 'has_pr_diff',
        check: (inputs) => inputs.sourceType === 'github_pr'
      }
    ]
  },

  // Slack Cluster + Runbook = Medium-High impact for confusion
  {
    id: 'slack_runbook_confusion',
    name: 'Slack cluster indicating runbook confusion',
    sourceType: 'slack_cluster',
    targetSurface: 'runbook',
    baseImpact: 0.6,
    multipliers: [
      {
        name: 'high_confusion',
        factor: 1.4,
        condition: (inputs) => {
          const slack = inputs.sourceSpecific as SlackInputs;
          return slack.confusionSignals >= 3;
        }
      },
      {
        name: 'urgency_signals',
        factor: 1.3,
        condition: (inputs) => {
          const slack = inputs.sourceSpecific as SlackInputs;
          return slack.urgencySignals >= 2;
        }
      },
      {
        name: 'many_participants',
        factor: 1.2,
        condition: (inputs) => {
          const slack = inputs.sourceSpecific as SlackInputs;
          return slack.participantCount >= 5;
        }
      }
    ],
    conditions: []
  },

  // Add more rules for other combinations...
];

/**
 * Compute impact score using rules matrix
 */
export function computeImpactFromRules(inputs: ImpactInputs): {
  impactScore: number;
  firedRules: string[];
  appliedMultipliers: string[];
} {
  const firedRules: string[] = [];
  const appliedMultipliers: string[] = [];
  let totalImpact = 0;
  let ruleCount = 0;

  // Find matching rules
  const matchingRules = IMPACT_RULES.filter(rule =>
    rule.sourceType === inputs.sourceType &&
    rule.targetSurface === inputs.targetSurface &&
    rule.conditions.every(cond => cond.check(inputs))
  );

  for (const rule of matchingRules) {
    let ruleImpact = rule.baseImpact;
    
    // Apply multipliers
    for (const multiplier of rule.multipliers) {
      if (multiplier.condition(inputs)) {
        ruleImpact *= multiplier.factor;
        appliedMultipliers.push(`${rule.id}:${multiplier.name}`);
      }
    }
    
    // Cap at 1.0
    ruleImpact = Math.min(ruleImpact, 1.0);
    
    totalImpact += ruleImpact;
    ruleCount++;
    firedRules.push(rule.id);
  }

  // Average impact across all fired rules, or use base severity if no rules fired
  const finalImpact = ruleCount > 0 
    ? totalImpact / ruleCount 
    : severityToImpact(inputs.severity);

  return {
    impactScore: Math.min(finalImpact, 1.0),
    firedRules,
    appliedMultipliers
  };
}

/**
 * Convert severity to impact score
 */
function severityToImpact(severity: 'low' | 'medium' | 'high' | 'critical'): number {
  switch (severity) {
    case 'low': return 0.25;
    case 'medium': return 0.5;
    case 'high': return 0.75;
    case 'critical': return 0.9;
  }
}

