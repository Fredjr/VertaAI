// DriftPlan Resolution Algorithm
// Phase 3: Control-Plane Architecture
// 5-step fallback hierarchy for plan resolution

import { prisma } from '../../lib/db.js';
import { resolveDriftPlanAdapter } from '../policyPacks/adapter.js';
import { PlanResolutionResult, ResolvePlanArgs } from './types.js';

/**
 * Resolve drift plan using 5-step fallback hierarchy
 *
 * Resolution Steps:
 * 1. Exact match: workspace + scopeType=repo + scopeRef=repoFullName + docClass
 * 2. Repo match: workspace + scopeType=repo + scopeRef=repoFullName (any docClass)
 * 3. Service match: workspace + scopeType=service + scopeRef=serviceId
 * 4. Workspace default: workspace + scopeType=workspace
 * 5. No plan: Return null with coverage flags
 *
 * P2 Migration: Now uses WorkspacePolicyPack via adapter layer
 */
export async function resolveDriftPlan(args: ResolvePlanArgs): Promise<PlanResolutionResult> {
  const { workspaceId, serviceId, repoFullName, docClass } = args;

  // Use adapter to query WorkspacePolicyPack instead of DriftPlan
  const result = await resolveDriftPlanAdapter({
    workspaceId,
    serviceId,
    repoFullName,
    docClass,
  });

  // Map adapter result to PlanResolutionResult format
  const resolutionMethodMap: Record<string, string> = {
    exact: 'exact_match',
    repo: 'repo_match',
    service: 'service_match',
    workspace: 'workspace_default',
    none: 'none',
  };

  const scopeMap: Record<string, string> = {
    exact: 'repo',
    repo: 'repo',
    service: 'service',
    workspace: 'workspace',
    none: 'none',
  };

  return {
    plan: result.plan as any,
    coverageFlags: {
      hasPlan: result.plan !== null,
      planScope: scopeMap[result.resolutionMethod] as any,
      resolutionMethod: (resolutionMethodMap[result.resolutionMethod] || 'none') as any,
    },
  };
}

/**
 * Check if a drift candidate is eligible for processing based on plan rules
 */
export function checkPlanEligibility(args: {
  plan: any;
  sourceType: string;
  driftType: string;
  confidence?: number;
  impactScore?: number;
  severity?: string;
}): {
  eligible: boolean;
  reason?: string;
} {
  const { plan, sourceType, driftType, confidence, impactScore, severity } = args;

  // Check if source type is allowed
  if (!plan.inputSources.includes(sourceType)) {
    return {
      eligible: false,
      reason: `Source type '${sourceType}' not allowed in plan`,
    };
  }

  // Check if drift type is allowed
  if (!plan.driftTypes.includes(driftType)) {
    return {
      eligible: false,
      reason: `Drift type '${driftType}' not allowed in plan`,
    };
  }

  // Check thresholds
  const thresholds = plan.thresholds || {};
  if (thresholds.minConfidence && confidence && confidence < thresholds.minConfidence) {
    return {
      eligible: false,
      reason: `Confidence ${confidence} below minimum ${thresholds.minConfidence}`,
    };
  }

  if (thresholds.minImpactScore && impactScore && impactScore < thresholds.minImpactScore) {
    return {
      eligible: false,
      reason: `Impact score ${impactScore} below minimum ${thresholds.minImpactScore}`,
    };
  }

  // Check eligibility rules
  const eligibility = plan.eligibility || {};
  if (eligibility.minSeverity && severity) {
    const severityOrder = ['sev4', 'sev3', 'sev2', 'sev1'];
    const minIndex = severityOrder.indexOf(eligibility.minSeverity);
    const actualIndex = severityOrder.indexOf(severity);

    if (actualIndex < minIndex) {
      return {
        eligible: false,
        reason: `Severity '${severity}' below minimum '${eligibility.minSeverity}'`,
      };
    }
  }

  return { eligible: true };
}

/**
 * Resolve thresholds for routing decisions
 *
 * Priority:
 * 1. Plan-specific thresholds (from plan.thresholds JSON)
 * 2. Workspace defaults (highConfidenceThreshold, mediumConfidenceThreshold)
 * 3. Source-specific defaults (from scoringWeights.ts)
 *
 * Gap #6: DriftPlan as True Control-Plane
 */
export async function resolveThresholds(args: {
  workspaceId: string;
  planId?: string | null;
  sourceType: string;
}): Promise<{
  autoApprove: number;
  slackNotify: number;
  digestOnly: number;
  ignore: number;
  source: 'plan' | 'workspace' | 'source_default';
}> {
  const { workspaceId, planId, sourceType } = args;

  // Step 1: Try plan-specific thresholds (using adapter for WorkspacePolicyPack)
  if (planId) {
    const { getDriftPlanByIdAdapter } = await import('../policyPacks/adapter.js');
    const plan = await getDriftPlanByIdAdapter(workspaceId, planId);

    if (plan && plan.thresholds && typeof plan.thresholds === 'object') {
      const thresholds = plan.thresholds as any;
      if (thresholds.autoApprove !== undefined && thresholds.slackNotify !== undefined) {
        return {
          autoApprove: thresholds.autoApprove,
          slackNotify: thresholds.slackNotify,
          digestOnly: thresholds.digestOnly ?? 0.30,
          ignore: thresholds.ignore ?? 0.20,
          source: 'plan',
        };
      }
    }
  }

  // Step 2: Try workspace defaults
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  if (workspace) {
    return {
      autoApprove: workspace.highConfidenceThreshold || 0.98,
      slackNotify: workspace.mediumConfidenceThreshold || 0.40,
      digestOnly: 0.30,
      ignore: 0.20,
      source: 'workspace',
    };
  }

  // Step 3: Fallback to source-specific defaults
  const { getThresholds } = await import('../../config/scoringWeights.js');
  const sourceThresholds = getThresholds(sourceType as any);

  return {
    ...sourceThresholds,
    source: 'source_default',
  };
}
