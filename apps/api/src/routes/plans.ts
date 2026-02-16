// DriftPlan API Routes
// Phase 3: Control-Plane Architecture

import express, { Request, Response, Router } from 'express';
import { prisma } from '../lib/db.js';
import {
  createDriftPlan,
  getDriftPlan,
  listDriftPlans,
  updateDriftPlan,
  deleteDriftPlan,
  resolveDriftPlan,
  getAllTemplates,
  getTemplateById,
} from '../services/plans/index.js';

const router: Router = express.Router();

/**
 * GET /api/plans/templates
 * Get all plan templates
 */
router.get('/templates', async (_req: Request, res: Response) => {
  try {
    const templates = getAllTemplates();
    res.json({ templates });
  } catch (error: any) {
    console.error('[Plans API] Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates', message: error.message });
  }
});

/**
 * GET /api/plans/templates/:templateId
 * Get a specific template by ID
 */
router.get('/templates/:templateId', async (req: Request, res: Response) => {
  try {
    const templateId = req.params.templateId;
    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }

    const template = getTemplateById(templateId);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ template });
  } catch (error: any) {
    console.error('[Plans API] Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template', message: error.message });
  }
});

/**
 * GET /api/workspaces/:workspaceId/drift-plans
 * List all drift plans for a workspace
 */
router.get('/workspaces/:workspaceId/drift-plans', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;

    if (!workspaceId) {
      return res.status(400).json({
        success: false,
        error: 'Workspace ID is required',
      });
    }

    // Validate workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    const { status, scopeType } = req.query;

    const plans = await listDriftPlans({
      workspaceId,
      status: status as any,
      scopeType: scopeType as any,
    });

    res.json({
      success: true,
      data: plans,
    });
  } catch (error: any) {
    console.error('[Plans API] Error listing plans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list plans',
      message: error.message,
    });
  }
});

/**
 * GET /api/workspaces/:workspaceId/drift-plans/:planId
 * Get a specific drift plan by ID
 */
router.get('/workspaces/:workspaceId/drift-plans/:planId', async (req: Request, res: Response) => {
  try {
    const { workspaceId, planId } = req.params;

    if (!workspaceId || !planId) {
      return res.status(400).json({
        success: false,
        error: 'Workspace ID and Plan ID are required',
      });
    }

    const plan = await getDriftPlan({ workspaceId, planId });

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'Plan not found',
      });
    }

    res.json({
      success: true,
      data: plan,
    });
  } catch (error: any) {
    console.error('[Plans API] Error fetching plan:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch plan',
      message: error.message,
    });
  }
});

/**
 * POST /api/workspaces/:workspaceId/drift-plans
 * Create a new drift plan
 */
router.post('/workspaces/:workspaceId/drift-plans', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;

    if (!workspaceId) {
      return res.status(400).json({
        success: false,
        error: 'Workspace ID is required',
      });
    }

    const {
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
    } = req.body;

    // Validate workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    // Validate required fields
    if (!name || !scopeType || !config) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, scopeType, config',
      });
    }

    // Validate config structure
    if (!config.inputSources || !Array.isArray(config.inputSources)) {
      return res.status(400).json({
        success: false,
        error: 'config.inputSources must be an array',
      });
    }

    if (!config.driftTypes || !Array.isArray(config.driftTypes)) {
      return res.status(400).json({
        success: false,
        error: 'config.driftTypes must be an array',
      });
    }

    if (!config.allowedOutputs || !Array.isArray(config.allowedOutputs)) {
      return res.status(400).json({
        success: false,
        error: 'config.allowedOutputs must be an array',
      });
    }

    const plan = await createDriftPlan({
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
    });

    res.status(201).json({
      success: true,
      data: plan,
    });
  } catch (error: any) {
    console.error('[Plans API] Error creating plan:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create plan',
      message: error.message,
    });
  }
});

/**
 * PUT /api/workspaces/:workspaceId/drift-plans/:planId
 * Update a drift plan
 */
router.put('/workspaces/:workspaceId/drift-plans/:planId', async (req: Request, res: Response) => {
  try {
    const { workspaceId, planId } = req.params;

    if (!workspaceId || !planId) {
      return res.status(400).json({
        success: false,
        error: 'Workspace ID and Plan ID are required',
      });
    }

    const { name, description, config, status, updatedBy } = req.body;

    const plan = await updateDriftPlan({
      workspaceId,
      planId,
      name,
      description,
      config,
      status,
      updatedBy,
    });

    res.json({
      success: true,
      data: plan,
    });
  } catch (error: any) {
    console.error('[Plans API] Error updating plan:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update plan',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/workspaces/:workspaceId/drift-plans/:planId
 * Delete (archive) a drift plan
 */
router.delete('/workspaces/:workspaceId/drift-plans/:planId', async (req: Request, res: Response) => {
  try {
    const { workspaceId, planId } = req.params;

    if (!workspaceId || !planId) {
      return res.status(400).json({
        success: false,
        error: 'Workspace ID and Plan ID are required',
      });
    }

    const { updatedBy } = req.body;

    await deleteDriftPlan({ workspaceId, planId, updatedBy });

    res.json({
      success: true,
      message: 'Plan archived successfully',
    });
  } catch (error: any) {
    console.error('[Plans API] Error deleting plan:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete plan',
      message: error.message,
    });
  }
});

/**
 * POST /api/plans/resolve
 * Resolve a drift plan using 5-step algorithm
 */
router.post('/resolve', async (req: Request, res: Response) => {
  try {
    const { workspaceId, serviceId, repoFullName, docClass } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Missing required field: workspaceId' });
    }

    const result = await resolveDriftPlan({
      workspaceId,
      serviceId,
      repoFullName,
      docClass,
    });

    res.json(result);
  } catch (error: any) {
    console.error('[Plans API] Error resolving plan:', error);
    res.status(500).json({ error: 'Failed to resolve plan', message: error.message });
  }
});

export default router;

