// DriftPlan Resolution Algorithm
// Phase 3: Control-Plane Architecture
// 5-step fallback hierarchy for plan resolution

import { prisma } from '../../lib/db.js';
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
 */
export async function resolveDriftPlan(args: ResolvePlanArgs): Promise<PlanResolutionResult> {
  const { workspaceId, serviceId, repoFullName, docClass } = args;

  // Step 1: Try exact match (repo + docClass)
  if (repoFullName && docClass) {
    const plan = await prisma.driftPlan.findFirst({
      where: {
        workspaceId,
        scopeType: 'repo',
        scopeRef: repoFullName,
        docClass,
        status: 'active',
      },
      orderBy: {
        updatedAt: 'desc', // Get most recently updated plan
      },
    });

    if (plan) {
      return {
        plan: plan as any,
        coverageFlags: {
          hasPlan: true,
          planScope: 'repo',
          resolutionMethod: 'exact_match',
        },
      };
    }
  }

  // Step 2: Try repo-level match (any docClass)
  if (repoFullName) {
    const plan = await prisma.driftPlan.findFirst({
      where: {
        workspaceId,
        scopeType: 'repo',
        scopeRef: repoFullName,
        status: 'active',
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (plan) {
      return {
        plan: plan as any,
        coverageFlags: {
          hasPlan: true,
          planScope: 'repo',
          resolutionMethod: 'repo_match',
        },
      };
    }
  }

  // Step 3: Try service-level match
  if (serviceId) {
    const plan = await prisma.driftPlan.findFirst({
      where: {
        workspaceId,
        scopeType: 'service',
        scopeRef: serviceId,
        status: 'active',
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (plan) {
      return {
        plan: plan as any,
        coverageFlags: {
          hasPlan: true,
          planScope: 'service',
          resolutionMethod: 'service_match',
        },
      };
    }
  }

  // Step 4: Fallback to workspace default
  const defaultPlan = await prisma.driftPlan.findFirst({
    where: {
      workspaceId,
      scopeType: 'workspace',
      status: 'active',
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  if (defaultPlan) {
    return {
      plan: defaultPlan as any,
      coverageFlags: {
        hasPlan: true,
        planScope: 'workspace',
        resolutionMethod: 'workspace_default',
      },
    };
  }

  // Step 5: No plan found
  return {
    plan: null,
    coverageFlags: {
      hasPlan: false,
      planScope: 'none',
      resolutionMethod: 'none',
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
    
    if (actualIndex > minIndex) {
      return {
        eligible: false,
        reason: `Severity '${severity}' below minimum '${eligibility.minSeverity}'`,
      };
    }
  }

  return { eligible: true };
}

