/**
 * Risk Tier Calculator
 * 
 * Calculates risk tier for PRs based on multiple factors:
 * - Agent authorship confidence
 * - Risk domains touched
 * - Missing evidence
 * - Impact score
 * - Correlated incidents
 */

export type RiskTier = 'PASS' | 'INFO' | 'WARN' | 'BLOCK';

export interface RiskTierResult {
  tier: RiskTier;
  score: number;
  factors: RiskFactor[];
  recommendation: string;
}

export interface RiskFactor {
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  weight: number;
}

export interface RiskTierInput {
  isAgentAuthored: boolean;
  agentConfidence: number;
  domains: string[];
  evidenceSatisfied: boolean;
  missingEvidence: string[];
  impactScore?: number;
  correlatedIncidents?: number;
}

/**
 * High-risk domains that require extra scrutiny
 */
const HIGH_RISK_DOMAINS = ['auth', 'deployment', 'database', 'security', 'infra'];

/**
 * Calculate risk tier for a PR
 */
export function calculateRiskTier(input: RiskTierInput): RiskTierResult {
  const factors: RiskFactor[] = [];
  let score = 0;
  
  // Factor 1: Agent-authored (if detected)
  if (input.isAgentAuthored) {
    const weight = input.agentConfidence * 0.30;
    factors.push({
      category: 'Agent-authored PR',
      severity: input.agentConfidence > 0.8 ? 'high' : 'medium',
      description: `Detected as agent-authored (${(input.agentConfidence * 100).toFixed(0)}% confidence)`,
      weight,
    });
    score += weight;
  }
  
  // Factor 2: Risk domains
  const touchedHighRisk = input.domains.filter(d => HIGH_RISK_DOMAINS.includes(d));
  
  if (touchedHighRisk.length > 0) {
    const weight = Math.min(touchedHighRisk.length * 0.25, 0.50); // Cap at 0.50
    factors.push({
      category: 'High-risk domains',
      severity: touchedHighRisk.length > 2 ? 'critical' : 'high',
      description: `Touches ${touchedHighRisk.join(', ')}`,
      weight,
    });
    score += weight;
  }
  
  // Factor 3: Missing evidence
  if (!input.evidenceSatisfied && input.missingEvidence.length > 0) {
    const weight = Math.min(input.missingEvidence.length * 0.15, 0.45); // Cap at 0.45
    factors.push({
      category: 'Missing evidence',
      severity: input.missingEvidence.length > 2 ? 'high' : 'medium',
      description: `Missing: ${input.missingEvidence.join(', ')}`,
      weight,
    });
    score += weight;
  }
  
  // Factor 4: Impact score (if provided)
  if (input.impactScore !== undefined && input.impactScore > 0.7) {
    const weight = input.impactScore * 0.20;
    factors.push({
      category: 'High impact',
      severity: input.impactScore > 0.9 ? 'critical' : 'high',
      description: `Impact score: ${(input.impactScore * 100).toFixed(0)}%`,
      weight,
    });
    score += weight;
  }
  
  // Factor 5: Correlated incidents (if provided)
  if (input.correlatedIncidents !== undefined && input.correlatedIncidents > 0) {
    const weight = Math.min(input.correlatedIncidents * 0.10, 0.30); // Cap at 0.30
    factors.push({
      category: 'Recent incidents',
      severity: input.correlatedIncidents > 2 ? 'high' : 'medium',
      description: `${input.correlatedIncidents} related incident(s) in past 7 days`,
      weight,
    });
    score += weight;
  }
  
  // Determine tier based on score
  let tier: RiskTier;
  let recommendation: string;
  
  if (score >= 0.80) {
    tier = 'BLOCK';
    recommendation = 'Block merge - requires manual review and evidence';
  } else if (score >= 0.60) {
    tier = 'WARN';
    recommendation = 'Warning - recommend manual review before merge';
  } else if (score >= 0.30) {
    tier = 'INFO';
    recommendation = 'Informational - proceed with caution';
  } else {
    tier = 'PASS';
    recommendation = 'Pass - low risk detected';
  }
  
  return { tier, score, factors, recommendation };
}

/**
 * Map risk tier to GitHub Check conclusion
 */
export function riskTierToCheckConclusion(tier: RiskTier): 'success' | 'failure' | 'neutral' | 'action_required' {
  switch (tier) {
    case 'PASS':
      return 'success';
    case 'INFO':
      return 'neutral';
    case 'WARN':
      return 'neutral'; // Don't block, but show warning
    case 'BLOCK':
      return 'action_required'; // Requires action before merge
    default:
      return 'neutral';
  }
}

/**
 * Format risk factors for display
 */
export function formatRiskFactors(factors: RiskFactor[]): string {
  if (factors.length === 0) {
    return 'No significant risk factors detected.';
  }
  
  return factors
    .map(f => `- **${f.category}** (${f.severity}): ${f.description}`)
    .join('\n');
}

