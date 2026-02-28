/**
 * IR Adapter - Adapts IR to Legacy NormalizedEvaluationResult Format
 * 
 * This adapter allows the renderer to consume IR while maintaining backward compatibility.
 * 
 * Phase 3 Strategy:
 * 1. Create adapters that convert IR → old format
 * 2. Update renderer to use adapters when IR is present
 * 3. Test for 100% output regression
 * 4. Gradually migrate renderer sections to read directly from IR
 * 5. Remove adapters once all sections migrated
 */

import type {
  RunContext,
  PolicyPlan,
  ObligationResult,
  GovernanceOutputContract,
  ReasonCode,
} from './types.js';

import type {
  NormalizedEvaluationResult,
  NormalizedObligation,
  NormalizedFinding,
  NotEvaluableItem,
  DetectedSurface,
  RepoClassification,
} from '../types.js';

/**
 * Adapt full IR to NormalizedEvaluationResult
 */
export function adaptNormalizedFromIR(ir: NonNullable<NormalizedEvaluationResult['ir']>): Omit<NormalizedEvaluationResult, 'ir'> {
  const { runContext, policyPlan, obligationResults, contract } = ir;

  return {
    surfaces: adaptSurfacesFromIR(runContext),
    obligations: adaptObligationsFromIR(obligationResults, policyPlan),
    findings: adaptFindingsFromIR(obligationResults),
    notEvaluable: adaptNotEvaluableFromIR(obligationResults),
    decision: adaptDecisionFromIR(contract, obligationResults),
    confidence: adaptConfidenceFromIR(runContext, contract),
    nextActions: adaptNextActionsFromIR(contract, obligationResults),
    metadata: adaptMetadataFromIR(policyPlan, runContext),
    repoClassification: adaptRepoClassificationFromIR(runContext),
  };
}

/**
 * Adapt IR decision to legacy format
 */
function adaptDecisionFromIR(
  contract: GovernanceOutputContract | undefined,
  obligationResults: ObligationResult[]
): NormalizedEvaluationResult['decision'] {
  if (!contract) {
    // Fallback if contract not available
    const hasBlockingFailures = obligationResults.some(o => 
      o.status === 'FAIL' && o.decisionOnFail === 'block'
    );
    const hasWarnings = obligationResults.some(o => 
      o.status === 'FAIL' && o.decisionOnFail === 'warn'
    );
    
    const outcome = hasBlockingFailures ? 'block' : hasWarnings ? 'warn' : 'pass';
    
    return {
      outcome,
      reason: `${obligationResults.filter(o => o.status === 'FAIL').length} policy violations detected`,
      contributingFactors: [],
    };
  }

  const outcome = contract.decision.global.toLowerCase() as 'pass' | 'warn' | 'block';
  
  // Build reason from failed obligations
  const failedCount = contract.failedObligations.length;
  const reason = failedCount === 0
    ? 'All policy checks passed'
    : failedCount === 1
    ? `1 policy violation: ${contract.failedObligations[0].reasonCode}`
    : `${failedCount} policy violations detected`;

  // Build contributing factors
  const contributingFactors: NormalizedEvaluationResult['decision']['contributingFactors'] = [];
  
  const blockingCount = obligationResults.filter(o => 
    o.status === 'FAIL' && o.decisionOnFail === 'block'
  ).length;
  
  const warningCount = obligationResults.filter(o => 
    o.status === 'FAIL' && o.decisionOnFail === 'warn'
  ).length;
  
  const notEvaluableCount = obligationResults.filter(o => 
    o.status === 'NOT_EVALUABLE'
  ).length;

  if (blockingCount > 0) {
    contributingFactors.push({
      type: 'blocking_issue',
      count: blockingCount,
      description: `${blockingCount} blocking ${blockingCount === 1 ? 'issue' : 'issues'}`,
    });
  }

  if (warningCount > 0) {
    contributingFactors.push({
      type: 'warning',
      count: warningCount,
      description: `${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}`,
    });
  }

  if (notEvaluableCount > 0) {
    contributingFactors.push({
      type: 'not_evaluable',
      count: notEvaluableCount,
      description: `${notEvaluableCount} checks could not be evaluated`,
    });
  }

  return {
    outcome,
    reason,
    contributingFactors,
  };
}

/**
 * Adapt IR confidence to legacy format
 */
function adaptConfidenceFromIR(
  runContext: RunContext,
  contract: GovernanceOutputContract | undefined
): NormalizedEvaluationResult['confidence'] {
  const decisionConfidence = contract?.confidence.decision ?? runContext.confidence.decision.confidence;
  const classificationConfidence = contract?.confidence.classification ?? runContext.confidence.classification.confidence;

  // Convert to 0-100 scale
  const score = Math.round(decisionConfidence * 100);
  
  // Determine level
  const level: 'high' | 'medium' | 'low' = 
    decisionConfidence >= 0.8 ? 'high' :
    decisionConfidence >= 0.5 ? 'medium' : 'low';

  return {
    score,
    level,
    degradationReasons: runContext.confidence.decision.degradationReasons,
    applicabilityConfidence: {
      score: Math.round(classificationConfidence * 100),
      level: classificationConfidence >= 0.8 ? 'high' : classificationConfidence >= 0.5 ? 'medium' : 'low',
      reason: runContext.confidence.classification.source,
    },
    evidenceConfidence: {
      score: Math.round(decisionConfidence * 100),
      level,
      reason: runContext.confidence.decision.basis,
    },
  };
}

/**
 * Adapt IR repo classification to legacy format
 */
function adaptRepoClassificationFromIR(runContext: RunContext): RepoClassification {
  const { classification } = runContext.confidence;
  const { signals } = runContext;

  // Infer service tier from signals
  const serviceTier: RepoClassification['serviceTier'] = 
    signals.hasSLO && signals.hasAlerts ? 'tier-1' :
    signals.hasRunbook ? 'tier-2' :
    'tier-3';

  return {
    repoType: classification.repoType as RepoClassification['repoType'],
    serviceTier,
    hasDeployment: signals.buildSystem !== 'unknown',
    metadata: {
      detectedFiles: signals.filesPresent,
      manifestTypes: signals.manifestTypes,
      languages: signals.languages,
      frameworks: signals.frameworks,
    },
    confidenceBreakdown: {
      repoType: {
        confidence: classification.confidence,
        source: classification.source,
        evidence: classification.evidence,
      },
      serviceTier: {
        confidence: signals.hasSLO && signals.hasAlerts ? 0.9 : signals.hasRunbook ? 0.7 : 0.5,
        source: 'inferred' as const,
        evidence: [
          signals.hasSLO ? 'SLO detected' : '',
          signals.hasAlerts ? 'Alerts detected' : '',
          signals.hasRunbook ? 'Runbook detected' : '',
        ].filter(Boolean),
      },
    },
  };
}

/**
 * Adapt IR surfaces to legacy format
 */
function adaptSurfacesFromIR(runContext: RunContext): DetectedSurface[] {
  const { signals } = runContext;
  const surfaces: DetectedSurface[] = [];

  // API Surface
  if (signals.hasOpenAPI || signals.hasGraphQL || signals.hasProto) {
    surfaces.push({
      surfaceId: 'api-surface',
      surfaceType: 'api',
      description: 'API Surface',
      confidence: 1.0, // Deterministic detection
      detectionMethod: 'manifest_analysis',
      files: signals.filesPresent.filter(f =>
        f.includes('openapi') || f.includes('graphql') || f.includes('.proto')
      ),
    });
  }

  // Database Surface
  if (signals.hasMigrations || signals.hasORM) {
    surfaces.push({
      surfaceId: 'db-surface',
      surfaceType: 'database',
      description: 'Database Surface',
      confidence: 1.0,
      detectionMethod: 'manifest_analysis',
      files: signals.filesPresent.filter(f =>
        f.includes('migration') || f.includes('schema')
      ),
    });
  }

  // Infrastructure Surface
  if (signals.buildSystem !== 'unknown') {
    surfaces.push({
      surfaceId: 'infra-surface',
      surfaceType: 'infrastructure',
      description: 'Infrastructure Surface',
      confidence: 1.0,
      detectionMethod: 'manifest_analysis',
      files: signals.filesPresent.filter(f =>
        f.includes('Dockerfile') || f.includes('terraform') || f.includes('k8s')
      ),
    });
  }

  return surfaces;
}

/**
 * Adapt IR obligations to legacy format
 */
function adaptObligationsFromIR(
  obligationResults: ObligationResult[],
  policyPlan: PolicyPlan
): NormalizedObligation[] {
  return obligationResults.map(obligation => ({
    id: obligation.id,
    description: obligation.title,
    kind: 'artifact_present' as const, // Default, could be inferred from reasonCode
    triggeredBy: obligation.scope === 'diff_derived' ? ['api-surface'] : [], // Simplified
    result: {
      status: obligation.status.toLowerCase() as 'pass' | 'fail' | 'not_evaluable',
      message: obligation.reasonHuman,
      code: obligation.reasonCode,
      reasonCode: obligation.reasonCode,
    },
    sourceRule: {
      ruleId: `rule-${obligation.id}`, // Simplified
      ruleName: obligation.controlObjective,
      packId: policyPlan.basePacks[0]?.packId ?? 'unknown',
      packName: policyPlan.basePacks[0]?.packName ?? 'unknown',
    },
    decisionOnFail: obligation.decisionOnFail,
  }));
}

/**
 * Adapt IR findings to legacy format
 */
function adaptFindingsFromIR(obligationResults: ObligationResult[]): NormalizedFinding[] {
  return obligationResults
    .filter(o => o.status === 'FAIL')
    .map(obligation => {
      // Determine severity from risk score
      const severity: 'critical' | 'high' | 'medium' | 'low' =
        obligation.risk.total >= 80 ? 'critical' :
        obligation.risk.total >= 60 ? 'high' :
        obligation.risk.total >= 30 ? 'medium' : 'low';

      return {
        obligationId: obligation.id,
        what: obligation.title,
        why: `Risk: ${obligation.risk.total}/100. ${obligation.risk.reasons.criticality || 'Policy violation detected'}`,
        severity,
        decision: obligation.decisionOnFail,
        result: {
          status: 'fail' as const,
          message: obligation.reasonHuman,
          code: obligation.reasonCode,
          reasonCode: obligation.reasonCode,
        },
        evidence: {
          searched: obligation.evidenceSearch?.locationsSearched ?? [],
          found: obligation.evidence.filter(e => e.found).map(e => e.location),
          notFound: obligation.evidence.filter(e => !e.found).map(e => e.location),
        },
        evidenceSearch: {
          locationsSearched: obligation.evidenceSearch?.locationsSearched ?? [],
          locationsFound: obligation.evidence.filter(e => e.found).map(e => e.location),
          locationsNotFound: obligation.evidence.filter(e => !e.found).map(e => e.location),
          searchStrategy: obligation.evidenceSearch?.strategy ?? 'file_presence',
        },
        remediation: {
          minimumToPass: obligation.remediation.minimumToPass,
          patch: obligation.remediation.patch,
          links: obligation.remediation.links,
          owner: obligation.remediation.owner,
        },
        risk: {
          score: obligation.risk.total,
          breakdown: {
            blastRadius: obligation.risk.breakdown.blastRadius,
            criticality: obligation.risk.breakdown.criticality,
            immediacy: obligation.risk.breakdown.immediacy,
            dependency: obligation.risk.breakdown.dependency,
          },
          reasons: {
            blastRadius: obligation.risk.reasons.blastRadius,
            criticality: obligation.risk.reasons.criticality,
            immediacy: obligation.risk.reasons.immediacy,
            dependency: obligation.risk.reasons.dependency,
          },
        },
      };
    });
}

/**
 * Adapt IR not-evaluable items to legacy format
 */
function adaptNotEvaluableFromIR(obligationResults: ObligationResult[]): NotEvaluableItem[] {
  return obligationResults
    .filter(o => o.status === 'NOT_EVALUABLE')
    .map(obligation => ({
      obligationId: obligation.id,
      description: obligation.title,
      reason: obligation.reasonHuman,
      category: 'policy_misconfig' as const, // Simplified
      impact: 'Reduces confidence in evaluation results',
      remediation: obligation.remediation.minimumToPass.join('; '),
    }));
}

/**
 * Adapt IR next actions to legacy format
 */
function adaptNextActionsFromIR(
  contract: GovernanceOutputContract | undefined,
  obligationResults: ObligationResult[]
): NormalizedEvaluationResult['nextActions'] {
  if (!contract || contract.failedObligations.length === 0) {
    return [];
  }

  const actions: NormalizedEvaluationResult['nextActions'] = [];
  let priority = 1;

  // Blocking issues first
  const blockingObligations = obligationResults.filter(o =>
    o.status === 'FAIL' && o.decisionOnFail === 'block'
  );

  for (const obligation of blockingObligations.slice(0, 3)) {
    actions.push({
      priority: priority++,
      action: obligation.remediation.minimumToPass[0] || `Fix ${obligation.title}`,
      category: 'fix_blocking',
      relatedFindingIds: [obligation.id],
    });
  }

  // Warnings next
  const warningObligations = obligationResults.filter(o =>
    o.status === 'FAIL' && o.decisionOnFail === 'warn'
  );

  for (const obligation of warningObligations.slice(0, 2)) {
    actions.push({
      priority: priority++,
      action: obligation.remediation.minimumToPass[0] || `Fix ${obligation.title}`,
      category: 'fix_warning',
      relatedFindingIds: [obligation.id],
    });
  }

  return actions.slice(0, 5); // Limit to top 5
}

/**
 * Adapt IR metadata to legacy format
 */
function adaptMetadataFromIR(
  policyPlan: PolicyPlan,
  runContext: RunContext
): NormalizedEvaluationResult['metadata'] {
  const basePack = policyPlan.basePacks[0];

  return {
    packId: basePack?.packId ?? 'unknown',
    packName: basePack?.packName ?? 'unknown',
    packVersion: basePack?.packVersion ?? '1.0.0',
    evaluationTimeMs: 0, // Not tracked in IR yet
    timestamp: runContext.evaluatedAt,
  };
}

