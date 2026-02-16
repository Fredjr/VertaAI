// DriftPlan Manager
// Phase 3: Control-Plane Architecture
// CRUD operations for drift plans

import { prisma } from '../../lib/db.js';
import { CreatePlanArgs, DriftPlan, DriftPlanConfig } from './types.js';
import { generatePlanHash, generateVersionNumber } from './versioning.js';
import { getTemplateById } from './templates.js';

/**
 * Create a new drift plan
 */
export async function createDriftPlan(args: CreatePlanArgs): Promise<DriftPlan> {
  const {
    workspaceId,
    name,
    description,
    scopeType,
    scopeRef,
    primaryDocId,
    primaryDocSystem,
    docClass,
    config,
    templateId,
    createdBy,
  } = args;

  // Generate version hash for reproducibility
  const versionHash = generatePlanHash({
    name,
    scopeType,
    scopeRef,
    primaryDocId,
    primaryDocSystem,
    docClass,
    config,
  });

  // Get template name if template ID provided
  let templateName: string | undefined;
  if (templateId) {
    const template = getTemplateById(templateId);
    templateName = template?.name;
  }

  // Create plan in database
  const plan = await prisma.driftPlan.create({
    data: {
      workspaceId,
      name,
      description,
      status: 'active',
      scopeType,
      scopeRef,
      primaryDocId,
      primaryDocSystem,
      docClass,
      inputSources: config.inputSources,
      driftTypes: config.driftTypes,
      allowedOutputs: config.allowedOutputs,
      thresholds: config.thresholds as any,
      eligibility: config.eligibility as any,
      sectionTargets: config.sectionTargets as any,
      impactRules: config.impactRules as any,
      writeback: config.writeback as any,
      // Gap #6: Control-Plane Fields
      budgets: config.budgets as any,
      docTargeting: config.docTargeting as any,
      noiseControls: config.noiseControls as any,
      sourceCursors: config.sourceCursors as any,
      version: 1,
      versionHash,
      templateId,
      templateName,
      createdBy,
      updatedBy: createdBy,
    },
  });

  return plan as any;
}

/**
 * Get a drift plan by ID
 * P2 Migration: Now uses WorkspacePolicyPack via adapter layer
 */
export async function getDriftPlan(args: {
  workspaceId: string;
  planId: string;
}): Promise<DriftPlan | null> {
  const { getDriftPlanByIdAdapter } = await import('../policyPacks/adapter.js');
  return getDriftPlanByIdAdapter(args.workspaceId, args.planId) as any;
}

/**
 * List all drift plans for a workspace
 * P2 Migration: Now uses WorkspacePolicyPack via adapter layer
 */
export async function listDriftPlans(args: {
  workspaceId: string;
  status?: 'active' | 'archived' | 'draft';
  scopeType?: 'workspace' | 'service' | 'repo';
}): Promise<DriftPlan[]> {
  const { getDriftPlansAdapter } = await import('../policyPacks/adapter.js');
  return getDriftPlansAdapter(args) as any;
}

/**
 * Update a drift plan (creates new version if content changed)
 */
export async function updateDriftPlan(args: {
  workspaceId: string;
  planId: string;
  name?: string;
  description?: string;
  config?: Partial<DriftPlanConfig>;
  status?: 'active' | 'archived' | 'draft';
  updatedBy?: string;
}): Promise<DriftPlan> {
  const { workspaceId, planId, name, description, config, status, updatedBy } = args;

  // Get current plan
  const currentPlan = await getDriftPlan({ workspaceId, planId });
  if (!currentPlan) {
    throw new Error(`Plan not found: ${planId}`);
  }

  // Merge config if provided
  const newConfig: DriftPlanConfig = config
    ? {
        inputSources: config.inputSources || currentPlan.inputSources,
        driftTypes: config.driftTypes || currentPlan.driftTypes,
        allowedOutputs: config.allowedOutputs || currentPlan.allowedOutputs,
        thresholds: { ...currentPlan.thresholds, ...config.thresholds },
        eligibility: { ...currentPlan.eligibility, ...config.eligibility },
        sectionTargets: { ...currentPlan.sectionTargets, ...config.sectionTargets },
        impactRules: { ...currentPlan.impactRules, ...config.impactRules },
        writeback: { ...currentPlan.writeback, ...config.writeback },
        // Gap #6: Control-Plane Fields
        budgets: { ...currentPlan.budgets, ...config.budgets },
        docTargeting: { ...currentPlan.docTargeting, ...config.docTargeting },
        noiseControls: { ...currentPlan.noiseControls, ...config.noiseControls },
        sourceCursors: { ...currentPlan.sourceCursors, ...config.sourceCursors },
      }
    : {
        inputSources: currentPlan.inputSources,
        driftTypes: currentPlan.driftTypes,
        allowedOutputs: currentPlan.allowedOutputs,
        thresholds: currentPlan.thresholds,
        eligibility: currentPlan.eligibility,
        sectionTargets: currentPlan.sectionTargets,
        impactRules: currentPlan.impactRules,
        writeback: currentPlan.writeback,
        // Gap #6: Control-Plane Fields
        budgets: currentPlan.budgets,
        docTargeting: currentPlan.docTargeting,
        noiseControls: currentPlan.noiseControls,
        sourceCursors: currentPlan.sourceCursors,
      };

  // Generate new hash
  const newHash = generatePlanHash({
    name: name || currentPlan.name,
    scopeType: currentPlan.scopeType,
    scopeRef: currentPlan.scopeRef,
    primaryDocId: currentPlan.primaryDocId,
    primaryDocSystem: currentPlan.primaryDocSystem,
    docClass: currentPlan.docClass,
    config: newConfig,
  });

  // Check if content changed (requires new version)
  const contentChanged = newHash !== currentPlan.versionHash;
  const newVersion = contentChanged ? generateVersionNumber(currentPlan.version) : currentPlan.version;

  // Update plan
  const updatedPlan = await prisma.driftPlan.update({
    where: {
      workspaceId_id: {
        workspaceId,
        id: planId,
      },
    },
    data: {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(status && { status }),
      ...(config && {
        inputSources: newConfig.inputSources,
        driftTypes: newConfig.driftTypes,
        allowedOutputs: newConfig.allowedOutputs,
        thresholds: newConfig.thresholds as any,
        eligibility: newConfig.eligibility as any,
        sectionTargets: newConfig.sectionTargets as any,
        impactRules: newConfig.impactRules as any,
        writeback: newConfig.writeback as any,
        // Gap #6: Control-Plane Fields
        budgets: newConfig.budgets as any,
        docTargeting: newConfig.docTargeting as any,
        noiseControls: newConfig.noiseControls as any,
        sourceCursors: newConfig.sourceCursors as any,
      }),
      version: newVersion,
      versionHash: newHash,
      ...(contentChanged && { parentId: currentPlan.id }),
      updatedBy,
    },
  });

  return updatedPlan as any;
}

/**
 * Delete a drift plan (soft delete by archiving)
 */
export async function deleteDriftPlan(args: {
  workspaceId: string;
  planId: string;
  updatedBy?: string;
}): Promise<void> {
  await prisma.driftPlan.update({
    where: {
      workspaceId_id: {
        workspaceId: args.workspaceId,
        id: args.planId,
      },
    },
    data: {
      status: 'archived',
      updatedBy: args.updatedBy,
    },
  });
}

