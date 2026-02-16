/**
 * WorkspacePolicyPack Adapter Layer
 * 
 * Provides backward compatibility for existing code that uses ContractPack and DriftPlan.
 * This adapter transforms WorkspacePolicyPack into the legacy formats so existing services
 * continue to work without modification during the migration period.
 * 
 * Architecture:
 * - WorkspacePolicyPack (unified storage) → ContractPack/DriftPlan (legacy interfaces)
 * - Enables gradual migration without breaking existing code
 * - Will be deprecated after full migration to unified model
 */

import { prisma } from '../../lib/db.js';
import type { Contract } from '../contracts/types.js';

// ======================================================================
// TYPES
// ======================================================================

/**
 * Legacy ContractPack interface (for backward compatibility)
 */
export interface LegacyContractPack {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  version: number;
  contracts: Contract[];
  dictionaries?: Record<string, any>;
  extraction?: Record<string, any>;
  safety?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Legacy DriftPlan interface (for backward compatibility)
 */
export interface LegacyDriftPlan {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  status: 'active' | 'archived' | 'draft';
  scopeType: 'workspace' | 'service' | 'repo';
  scopeRef?: string;
  primaryDocId?: string;
  primaryDocSystem?: string;
  docClass?: string;
  inputSources: string[];
  driftTypes: string[];
  allowedOutputs: string[];
  thresholds: any;
  eligibility: any;
  sectionTargets: any;
  impactRules: any;
  writeback: any;
  budgets?: any;
  docTargeting?: any;
  noiseControls?: any;
  sourceCursors?: any;
  version: number;
  versionHash: string;
  parentId?: string;
  templateId?: string;
  templateName?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

// ======================================================================
// ADAPTER FUNCTIONS - CONTRACTPACK
// ======================================================================

/**
 * Get ContractPacks for a workspace (adapted from WorkspacePolicyPack)
 * 
 * This function provides backward compatibility for existing code that expects
 * ContractPack objects. It fetches WorkspacePolicyPack records with trackAEnabled=true
 * and transforms them into the legacy ContractPack format.
 */
export async function getContractPacksAdapter(workspaceId: string): Promise<LegacyContractPack[]> {
  const policyPacks = await prisma.workspacePolicyPack.findMany({
    where: {
      workspaceId,
      trackAEnabled: true,
      status: 'active',
    },
  });

  return policyPacks.map(pack => transformToContractPack(pack));
}

/**
 * Get a single ContractPack by ID (adapted from WorkspacePolicyPack)
 */
export async function getContractPackByIdAdapter(
  workspaceId: string,
  id: string
): Promise<LegacyContractPack | null> {
  const policyPack = await prisma.workspacePolicyPack.findUnique({
    where: {
      workspaceId_id: { workspaceId, id },
    },
  });

  if (!policyPack || !policyPack.trackAEnabled) {
    return null;
  }

  return transformToContractPack(policyPack);
}

/**
 * Transform WorkspacePolicyPack to legacy ContractPack format
 */
function transformToContractPack(pack: any): LegacyContractPack {
  const trackAConfig = pack.trackAConfig as any || {};

  return {
    id: pack.id,
    workspaceId: pack.workspaceId,
    name: pack.name,
    description: pack.description || undefined,
    version: pack.version,
    contracts: trackAConfig.contracts || [],
    dictionaries: trackAConfig.dictionaries,
    extraction: trackAConfig.extraction,
    safety: trackAConfig.safety,
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
  };
}

// ======================================================================
// ADAPTER FUNCTIONS - DRIFTPLAN
// ======================================================================

/**
 * Get DriftPlans for a workspace (adapted from WorkspacePolicyPack)
 * 
 * This function provides backward compatibility for existing code that expects
 * DriftPlan objects. It fetches WorkspacePolicyPack records with trackBEnabled=true
 * and transforms them into the legacy DriftPlan format.
 */
export async function getDriftPlansAdapter(args: {
  workspaceId: string;
  status?: 'active' | 'archived' | 'draft';
  scopeType?: 'workspace' | 'service' | 'repo';
}): Promise<LegacyDriftPlan[]> {
  const { workspaceId, status, scopeType } = args;

  const policyPacks = await prisma.workspacePolicyPack.findMany({
    where: {
      workspaceId,
      trackBEnabled: true,
      ...(status && { status }),
      ...(scopeType && { scopeType }),
    },
    orderBy: { updatedAt: 'desc' },
  });

  return policyPacks.map(pack => transformToDriftPlan(pack));
}

/**
 * Get a single DriftPlan by ID (adapted from WorkspacePolicyPack)
 */
export async function getDriftPlanByIdAdapter(
  workspaceId: string,
  id: string
): Promise<LegacyDriftPlan | null> {
  const policyPack = await prisma.workspacePolicyPack.findUnique({
    where: {
      workspaceId_id: { workspaceId, id },
    },
  });

  if (!policyPack || !policyPack.trackBEnabled) {
    return null;
  }

  return transformToDriftPlan(policyPack);
}

/**
 * Transform WorkspacePolicyPack to legacy DriftPlan format
 */
function transformToDriftPlan(pack: any): LegacyDriftPlan {
  const trackBConfig = pack.trackBConfig as any || {};

  return {
    id: pack.id,
    workspaceId: pack.workspaceId,
    name: pack.name,
    description: pack.description || undefined,
    status: pack.status,
    scopeType: pack.scopeType,
    scopeRef: pack.scopeRef || undefined,
    primaryDocId: trackBConfig.primaryDoc?.id,
    primaryDocSystem: trackBConfig.primaryDoc?.system,
    docClass: trackBConfig.primaryDoc?.class,
    inputSources: trackBConfig.inputSources?.map((s: any) => s.type) || [],
    driftTypes: trackBConfig.driftTypes?.map((d: any) => d.type) || [],
    allowedOutputs: trackBConfig.allowedOutputs || [],
    thresholds: trackBConfig.materiality || {},
    eligibility: trackBConfig.eligibility || {},
    sectionTargets: trackBConfig.sectionTargets || {},
    impactRules: trackBConfig.impactRules || {},
    writeback: trackBConfig.writeback || {},
    budgets: trackBConfig.budgets,
    docTargeting: trackBConfig.docTargeting,
    noiseControls: trackBConfig.noiseControls,
    sourceCursors: trackBConfig.sourceCursors,
    version: pack.version,
    versionHash: pack.versionHash,
    parentId: pack.parentId || undefined,
    templateId: undefined,
    templateName: undefined,
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
    createdBy: pack.createdBy || undefined,
    updatedBy: pack.updatedBy || undefined,
  };
}

// ======================================================================
// ADAPTER FUNCTIONS - DRIFT PLAN RESOLVER
// ======================================================================

/**
 * Resolve drift plan using 5-step fallback hierarchy (adapted for WorkspacePolicyPack)
 *
 * This adapter provides backward compatibility for the resolveDriftPlan function
 * used extensively in transitions.ts and other services.
 *
 * Resolution Steps:
 * 1. Exact match: workspace + scopeType=repo + scopeRef=repoFullName + docClass
 * 2. Repo match: workspace + scopeType=repo + scopeRef=repoFullName (any docClass)
 * 3. Service match: workspace + scopeType=service + scopeRef=serviceId
 * 4. Workspace default: workspace + scopeType=workspace
 * 5. No plan: Return null with coverage flags
 */
export async function resolveDriftPlanAdapter(args: {
  workspaceId: string;
  serviceId?: string;
  repoFullName?: string;
  docClass?: string;
}): Promise<{
  plan: LegacyDriftPlan | null;
  resolutionMethod: 'exact' | 'repo' | 'service' | 'workspace' | 'none';
  coverage: {
    hasWorkspaceDefault: boolean;
    hasServicePlan: boolean;
    hasRepoPlan: boolean;
  };
}> {
  const { workspaceId, serviceId, repoFullName, docClass } = args;

  // Step 1: Exact match (repo + docClass)
  if (repoFullName && docClass) {
    const exactMatch = await prisma.workspacePolicyPack.findFirst({
      where: {
        workspaceId,
        trackBEnabled: true,
        status: 'active',
        scopeType: 'repo',
        scopeRef: repoFullName,
        trackBConfig: {
          path: ['primaryDoc', 'class'],
          equals: docClass,
        },
      },
    });

    if (exactMatch) {
      return {
        plan: transformToDriftPlan(exactMatch),
        resolutionMethod: 'exact',
        coverage: await getCoverage(workspaceId, serviceId, repoFullName),
      };
    }
  }

  // Step 2: Repo match (any docClass)
  if (repoFullName) {
    const repoMatch = await prisma.workspacePolicyPack.findFirst({
      where: {
        workspaceId,
        trackBEnabled: true,
        status: 'active',
        scopeType: 'repo',
        scopeRef: repoFullName,
      },
    });

    if (repoMatch) {
      return {
        plan: transformToDriftPlan(repoMatch),
        resolutionMethod: 'repo',
        coverage: await getCoverage(workspaceId, serviceId, repoFullName),
      };
    }
  }

  // Step 3: Service match
  if (serviceId) {
    const serviceMatch = await prisma.workspacePolicyPack.findFirst({
      where: {
        workspaceId,
        trackBEnabled: true,
        status: 'active',
        scopeType: 'service',
        scopeRef: serviceId,
      },
    });

    if (serviceMatch) {
      return {
        plan: transformToDriftPlan(serviceMatch),
        resolutionMethod: 'service',
        coverage: await getCoverage(workspaceId, serviceId, repoFullName),
      };
    }
  }

  // Step 4: Workspace default
  const workspaceDefault = await prisma.workspacePolicyPack.findFirst({
    where: {
      workspaceId,
      trackBEnabled: true,
      status: 'active',
      scopeType: 'workspace',
    },
  });

  if (workspaceDefault) {
    return {
      plan: transformToDriftPlan(workspaceDefault),
      resolutionMethod: 'workspace',
      coverage: await getCoverage(workspaceId, serviceId, repoFullName),
    };
  }

  // Step 5: No plan found
  return {
    plan: null,
    resolutionMethod: 'none',
    coverage: await getCoverage(workspaceId, serviceId, repoFullName),
  };
}

/**
 * Helper: Get coverage information for debugging
 */
async function getCoverage(
  workspaceId: string,
  serviceId?: string,
  repoFullName?: string
): Promise<{
  hasWorkspaceDefault: boolean;
  hasServicePlan: boolean;
  hasRepoPlan: boolean;
}> {
  const [workspaceDefault, servicePlan, repoPlan] = await Promise.all([
    prisma.workspacePolicyPack.findFirst({
      where: { workspaceId, trackBEnabled: true, status: 'active', scopeType: 'workspace' },
      select: { id: true },
    }),
    serviceId
      ? prisma.workspacePolicyPack.findFirst({
          where: { workspaceId, trackBEnabled: true, status: 'active', scopeType: 'service', scopeRef: serviceId },
          select: { id: true },
        })
      : null,
    repoFullName
      ? prisma.workspacePolicyPack.findFirst({
          where: { workspaceId, trackBEnabled: true, status: 'active', scopeType: 'repo', scopeRef: repoFullName },
          select: { id: true },
        })
      : null,
  ]);

  return {
    hasWorkspaceDefault: !!workspaceDefault,
    hasServicePlan: !!servicePlan,
    hasRepoPlan: !!repoPlan,
  };
}

