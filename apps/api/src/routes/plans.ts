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
 * POST /api/plans
 * Create a new drift plan
 */
router.post('/', async (req: Request, res: Response) => {
  try {
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
    } = req.body;

    // Validate required fields
    if (!workspaceId || !name || !scopeType || !config) {
      return res.status(400).json({ error: 'Missing required fields: workspaceId, name, scopeType, config' });
    }

    // Validate workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) {
      return res.status(404).json({ error: `Workspace not found: ${workspaceId}` });
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

    res.status(201).json({ plan });
  } catch (error: any) {
    console.error('[Plans API] Error creating plan:', error);
    res.status(500).json({ error: 'Failed to create plan', message: error.message });
  }
});

/**
 * GET /api/plans/:workspaceId
 * List all plans for a workspace
 */
router.get('/:workspaceId', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID is required' });
    }

    const { status, scopeType } = req.query;

    const plans = await listDriftPlans({
      workspaceId,
      status: status as any,
      scopeType: scopeType as any,
    });

    res.json({ plans });
  } catch (error: any) {
    console.error('[Plans API] Error listing plans:', error);
    res.status(500).json({ error: 'Failed to list plans', message: error.message });
  }
});

/**
 * GET /api/plans/:workspaceId/:planId
 * Get a specific plan by ID
 */
router.get('/:workspaceId/:planId', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId;
    const planId = req.params.planId;

    if (!workspaceId || !planId) {
      return res.status(400).json({ error: 'Workspace ID and Plan ID are required' });
    }

    const plan = await getDriftPlan({ workspaceId, planId });

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    res.json({ plan });
  } catch (error: any) {
    console.error('[Plans API] Error fetching plan:', error);
    res.status(500).json({ error: 'Failed to fetch plan', message: error.message });
  }
});

/**
 * PUT /api/plans/:workspaceId/:planId
 * Update a drift plan
 */
router.put('/:workspaceId/:planId', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId;
    const planId = req.params.planId;

    if (!workspaceId || !planId) {
      return res.status(400).json({ error: 'Workspace ID and Plan ID are required' });
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

    res.json({ plan });
  } catch (error: any) {
    console.error('[Plans API] Error updating plan:', error);
    res.status(500).json({ error: 'Failed to update plan', message: error.message });
  }
});

/**
 * DELETE /api/plans/:workspaceId/:planId
 * Delete (archive) a drift plan
 */
router.delete('/:workspaceId/:planId', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId;
    const planId = req.params.planId;

    if (!workspaceId || !planId) {
      return res.status(400).json({ error: 'Workspace ID and Plan ID are required' });
    }

    const { updatedBy } = req.body;

    await deleteDriftPlan({ workspaceId, planId, updatedBy });

    res.json({ success: true, message: 'Plan archived successfully' });
  } catch (error: any) {
    console.error('[Plans API] Error deleting plan:', error);
    res.status(500).json({ error: 'Failed to delete plan', message: error.message });
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

