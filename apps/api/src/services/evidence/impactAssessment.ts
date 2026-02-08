// Impact Assessment Engine
// Computes deterministic impact scores without LLM dependency
// Based on multi-source/multi-target awareness

import { SourceEvidence, TargetEvidence, Assessment } from './types.js';

interface ComputeImpactArgs {
  sourceEvidence: SourceEvidence;
  targetEvidence: TargetEvidence;
  driftCandidate: any;
}

/**
 * Main function to compute impact assessment
 */
export async function computeImpactAssessment(args: ComputeImpactArgs): Promise<Assessment> {
  const { sourceEvidence, targetEvidence, driftCandidate } = args;
  
  // Step 1: Calculate base impact score
  const baseScore = calculateBaseImpactScore(sourceEvidence, targetEvidence);
  
  // Step 2: Apply source-specific multipliers
  const sourceMultiplier = getSourceMultiplier(sourceEvidence.sourceType);
  
  // Step 3: Apply target surface multipliers
  const targetMultiplier = getTargetSurfaceMultiplier(targetEvidence.surface);
  
  // Step 4: Apply drift type multipliers
  const driftMultiplier = getDriftTypeMultiplier(driftCandidate.driftType);
  
  // Step 5: Calculate final impact score
  const impactScore = Math.min(1.0, baseScore * sourceMultiplier * targetMultiplier * driftMultiplier);
  
  // Step 6: Determine impact band
  const impactBand = getImpactBand(impactScore);
  
  // Step 7: Identify fired rules
  const firedRules = identifyFiredRules(sourceEvidence, targetEvidence, driftCandidate, impactScore);
  
  // Step 8: Generate consequence text
  const consequenceText = generateConsequenceText(impactBand, firedRules, sourceEvidence, targetEvidence);
  
  // Step 9: Calculate blast radius
  const blastRadius = calculateBlastRadius(sourceEvidence, targetEvidence, driftCandidate);
  
  // Step 10: Identify risk factors
  const riskFactors = identifyRiskFactors(sourceEvidence, targetEvidence, driftCandidate);
  
  return {
    impactScore,
    impactBand,
    firedRules,
    consequenceText,
    blastRadius,
    riskFactors
  };
}

/**
 * Calculate base impact score from evidence
 */
function calculateBaseImpactScore(sourceEvidence: SourceEvidence, targetEvidence: TargetEvidence): number {
  let score = 0.3; // Base score
  
  // Source evidence factors
  const artifacts = sourceEvidence.artifacts;
  
  if (artifacts.prDiff) {
    // More lines changed = higher impact
    const totalLines = artifacts.prDiff.linesAdded + artifacts.prDiff.linesRemoved;
    score += Math.min(0.3, totalLines / 1000);
    
    // More files changed = higher impact
    score += Math.min(0.2, artifacts.prDiff.filesChanged.length / 20);
  }
  
  if (artifacts.incidentTimeline) {
    // Higher severity = higher impact
    const severityMap: Record<string, number> = {
      'sev1': 0.4,
      'sev2': 0.3,
      'sev3': 0.2,
      'sev4': 0.1
    };
    score += severityMap[artifacts.incidentTimeline.severity] || 0.1;
  }
  
  if (artifacts.slackMessages) {
    // More participants = higher impact
    score += Math.min(0.2, artifacts.slackMessages.participants.length / 10);
  }
  
  if (artifacts.alertData) {
    // Critical alerts = higher impact
    if (artifacts.alertData.alertType.includes('critical')) {
      score += 0.3;
    } else if (artifacts.alertData.alertType.includes('warning')) {
      score += 0.1;
    }
  }
  
  // Target evidence factors
  if (targetEvidence.claims.length > 0) {
    // More claims = higher confidence in impact
    score += Math.min(0.2, targetEvidence.claims.length / 10);
    
    // Higher confidence claims = higher impact
    const avgConfidence = targetEvidence.claims.reduce((sum, claim) => sum + claim.confidence, 0) / targetEvidence.claims.length;
    score += avgConfidence * 0.1;
  }
  
  return Math.min(1.0, score);
}

/**
 * Get source type multiplier
 */
function getSourceMultiplier(sourceType: SourceEvidence['sourceType']): number {
  const multipliers: Record<string, number> = {
    'pagerduty_incident': 1.3,  // Incidents are high impact
    'datadog_alert': 1.2,       // Alerts indicate problems
    'grafana_alert': 1.2,       // Alerts indicate problems
    'github_pr': 1.0,           // Baseline
    'slack_cluster': 0.9,       // Questions might be lower impact
    'github_iac': 1.1,          // Infrastructure changes are important
    'github_codeowners': 0.8    // Ownership changes are lower impact
  };
  
  return multipliers[sourceType] || 1.0;
}

/**
 * Get target surface multiplier
 */
function getTargetSurfaceMultiplier(surface: TargetEvidence['surface']): number {
  const multipliers: Record<string, number> = {
    'runbook': 1.3,        // Operational docs are critical
    'api_contract': 1.2,   // API docs affect integrations
    'service_catalog': 1.1, // Service info is important
    'developer_doc': 1.0,   // Baseline
    'code_doc': 0.9,       // Code comments are lower impact
    'knowledge_base': 0.8   // General knowledge is lower impact
  };
  
  return multipliers[surface] || 1.0;
}

/**
 * Get drift type multiplier
 */
function getDriftTypeMultiplier(driftType: string): number {
  const multipliers: Record<string, number> = {
    'instruction': 1.2,         // Wrong instructions are dangerous
    'process': 1.1,             // Process changes are important
    'ownership': 0.9,           // Ownership is important but not urgent
    'coverage': 0.8,            // Coverage gaps are lower priority
    'environment_tooling': 1.0  // Baseline
  };
  
  return multipliers[driftType] || 1.0;
}

/**
 * Determine impact band from score
 */
function getImpactBand(score: number): Assessment['impactBand'] {
  if (score >= 0.9) return 'critical';
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

/**
 * Identify which rules fired for this assessment
 */
function identifyFiredRules(
  sourceEvidence: SourceEvidence, 
  targetEvidence: TargetEvidence, 
  driftCandidate: any, 
  impactScore: number
): string[] {
  const rules: string[] = [];
  
  // Source-based rules
  if (sourceEvidence.sourceType === 'pagerduty_incident') {
    rules.push('incident_source_boost');
  }
  
  if (sourceEvidence.artifacts.prDiff && sourceEvidence.artifacts.prDiff.filesChanged.length > 10) {
    rules.push('large_pr_penalty');
  }
  
  // Target-based rules
  if (targetEvidence.surface === 'runbook') {
    rules.push('runbook_criticality_boost');
  }
  
  if (targetEvidence.claims.length === 0) {
    rules.push('no_claims_penalty');
  }
  
  // Impact-based rules
  if (impactScore >= 0.9) {
    rules.push('critical_impact_threshold');
  }
  
  return rules;
}

/**
 * Generate human-readable consequence text
 */
function generateConsequenceText(
  impactBand: Assessment['impactBand'], 
  firedRules: string[], 
  sourceEvidence: SourceEvidence, 
  targetEvidence: TargetEvidence
): string {
  const templates: Record<string, string> = {
    'critical': 'Critical documentation drift detected. Immediate action required to prevent operational issues.',
    'high': 'High-impact documentation drift. Should be addressed within 24 hours.',
    'medium': 'Medium-impact documentation drift. Should be addressed within this sprint.',
    'low': 'Low-impact documentation drift. Can be addressed in next planning cycle.'
  };
  
  let consequence = templates[impactBand];
  
  // Add specific context based on source and target
  if (sourceEvidence.sourceType === 'pagerduty_incident') {
    consequence += ' This drift was detected from an incident, indicating real operational impact.';
  }
  
  if (targetEvidence.surface === 'runbook') {
    consequence += ' Runbook accuracy is critical for incident response.';
  }

  return consequence || 'Documentation drift detected.';
}

/**
 * Calculate blast radius
 */
function calculateBlastRadius(
  sourceEvidence: SourceEvidence, 
  targetEvidence: TargetEvidence, 
  driftCandidate: any
): Assessment['blastRadius'] {
  const services: string[] = [];
  const teams: string[] = [];
  const systems: string[] = [];
  
  // Add service from drift candidate
  if (driftCandidate.service) {
    services.push(driftCandidate.service);
  }
  
  // Add services from source evidence
  if (sourceEvidence.artifacts.prDiff) {
    // Infer services from file paths
    const filePaths = sourceEvidence.artifacts.prDiff.filesChanged;
    filePaths.forEach(path => {
      const serviceMatch = path.match(/services\/([^\/]+)/);
      if (serviceMatch && serviceMatch[1]) {
        services.push(serviceMatch[1]);
      }
    });
  }
  
  // Add teams from ownership info
  if (sourceEvidence.artifacts.ownershipChanges) {
    teams.push(...sourceEvidence.artifacts.ownershipChanges.ownersAdded);
    teams.push(...sourceEvidence.artifacts.ownershipChanges.ownersRemoved);
  }
  
  // Add systems based on target surface
  if (targetEvidence.surface === 'api_contract') {
    systems.push('api_gateway', 'service_mesh');
  } else if (targetEvidence.surface === 'runbook') {
    systems.push('monitoring', 'alerting', 'incident_response');
  }
  
  return {
    services: [...new Set(services)],
    teams: [...new Set(teams)],
    systems: [...new Set(systems)]
  };
}

/**
 * Identify risk factors
 */
function identifyRiskFactors(
  sourceEvidence: SourceEvidence, 
  targetEvidence: TargetEvidence, 
  driftCandidate: any
): string[] {
  const risks: string[] = [];
  
  if (sourceEvidence.sourceType === 'pagerduty_incident') {
    risks.push('incident_driven_change');
  }
  
  if (targetEvidence.claims.length === 0) {
    risks.push('no_extractable_claims');
  }
  
  if (targetEvidence.surface === 'runbook') {
    risks.push('operational_documentation');
  }
  
  if (sourceEvidence.artifacts.prDiff && sourceEvidence.artifacts.prDiff.filesChanged.length > 20) {
    risks.push('large_change_set');
  }
  
  return risks;
}
