/**
 * Contract Policies API Routes
 * Week 5-6 Task 1: ContractPolicy CRUD Operations
 *
 * Provides CRUD operations for ContractPolicies (enforcement policies)
 *
 * SECURITY NOTE:
 * - All endpoints validate workspace existence
 * - TODO: Add user authentication and workspace access control before production
 * - Current implementation is suitable for single-tenant or trusted environments
 *
 * ADMIN-ONLY:
 * - Contract policies are configuration, not end-user data
 * - Should be managed by platform engineers/SREs only
 */

import { Router, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/db.js';

const router: ExpressRouter = Router();

/**
 * GET /api/workspaces/:workspaceId/contract-policies
 * List all contract policies for a workspace
 */
router.get('/workspaces/:workspaceId/contract-policies', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { active } = req.query;

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

    const contractPolicies = await prisma.contractPolicy.findMany({
      where: {
        workspaceId,
        ...(active !== undefined && { active: active === 'true' }),
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: contractPolicies,
    });
  } catch (error) {
    console.error('[ContractPolicies] List failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list contract policies',
    });
  }
});

/**
 * GET /api/workspaces/:workspaceId/contract-policies/:id
 * Get a specific contract policy
 */
router.get('/workspaces/:workspaceId/contract-policies/:id', async (req, res) => {
  try {
    const { workspaceId, id } = req.params;

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

    const contractPolicy = await prisma.contractPolicy.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id,
        },
      },
    });

    if (!contractPolicy) {
      return res.status(404).json({
        success: false,
        error: 'Contract policy not found',
      });
    }

    res.json({
      success: true,
      data: contractPolicy,
    });
  } catch (error) {
    console.error('[ContractPolicies] Get failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get contract policy',
    });
  }
});

/**
 * POST /api/workspaces/:workspaceId/contract-policies
 * Create a new contract policy
 */
router.post('/workspaces/:workspaceId/contract-policies', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const {
      name,
      description,
      mode,
      criticalThreshold,
      highThreshold,
      mediumThreshold,
      gracefulDegradation,
      appliesTo,
      active,
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
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: name',
      });
    }

    const contractPolicy = await prisma.contractPolicy.create({
      data: {
        workspaceId,
        name,
        description,
        ...(mode && { mode }),
        ...(criticalThreshold !== undefined && { criticalThreshold }),
        ...(highThreshold !== undefined && { highThreshold }),
        ...(mediumThreshold !== undefined && { mediumThreshold }),
        ...(gracefulDegradation && { gracefulDegradation: gracefulDegradation as any }),
        ...(appliesTo && { appliesTo: appliesTo as any }),
        ...(active !== undefined && { active }),
      },
    });

    res.status(201).json({
      success: true,
      data: contractPolicy,
    });
  } catch (error) {
    console.error('[ContractPolicies] Create failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create contract policy',
    });
  }
});

/**
 * PUT /api/workspaces/:workspaceId/contract-policies/:id
 * Update an existing contract policy
 */
router.put('/workspaces/:workspaceId/contract-policies/:id', async (req, res) => {
  try {
    const { workspaceId, id } = req.params;
    const {
      name,
      description,
      mode,
      criticalThreshold,
      highThreshold,
      mediumThreshold,
      gracefulDegradation,
      appliesTo,
      active,
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

    const contractPolicy = await prisma.contractPolicy.update({
      where: {
        workspaceId_id: {
          workspaceId,
          id,
        },
      },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(mode && { mode }),
        ...(criticalThreshold !== undefined && { criticalThreshold }),
        ...(highThreshold !== undefined && { highThreshold }),
        ...(mediumThreshold !== undefined && { mediumThreshold }),
        ...(gracefulDegradation && { gracefulDegradation: gracefulDegradation as any }),
        ...(appliesTo && { appliesTo: appliesTo as any }),
        ...(active !== undefined && { active }),
      },
    });

    res.json({
      success: true,
      data: contractPolicy,
    });
  } catch (error) {
    console.error('[ContractPolicies] Update failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update contract policy',
    });
  }
});

/**
 * DELETE /api/workspaces/:workspaceId/contract-policies/:id
 * Delete a contract policy
 */
router.delete('/workspaces/:workspaceId/contract-policies/:id', async (req, res) => {
  try {
    const { workspaceId, id } = req.params;

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

    await prisma.contractPolicy.delete({
      where: {
        workspaceId_id: {
          workspaceId,
          id,
        },
      },
    });

    res.json({
      success: true,
      message: 'Contract policy deleted successfully',
    });
  } catch (error) {
    console.error('[ContractPolicies] Delete failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete contract policy',
    });
  }
});

export default router;

