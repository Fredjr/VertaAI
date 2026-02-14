/**
 * Contract Packs API Routes
 * Task 2: Create UI for Managing ContractPacks
 *
 * Provides CRUD operations for ContractPacks
 *
 * SECURITY NOTE:
 * - All endpoints validate workspace existence (prevents access to non-existent workspaces)
 * - TODO: Add user authentication and workspace access control before production
 * - Current implementation is suitable for single-tenant or trusted environments
 * - For multi-tenant production, implement workspace access middleware
 *
 * ADMIN-ONLY:
 * - Contract packs are configuration, not end-user data
 * - Should be managed by platform engineers/SREs only
 * - Consider moving to Settings page in frontend
 */

import { Router, type Router as ExpressRouter } from 'express';
import { prisma } from '../lib/db.js';
import type { Contract } from '../services/contracts/types.js';

const router: ExpressRouter = Router();

/**
 * GET /api/workspaces/:workspaceId/contract-packs
 * List all contract packs for a workspace
 */
router.get('/workspaces/:workspaceId/contract-packs', async (req, res) => {
  try {
    const { workspaceId } = req.params;

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

    const contractPacks = await prisma.contractPack.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: contractPacks,
    });
  } catch (error) {
    console.error('[ContractPacks] List failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list contract packs',
    });
  }
});

/**
 * GET /api/workspaces/:workspaceId/contract-packs/:id
 * Get a specific contract pack
 */
router.get('/workspaces/:workspaceId/contract-packs/:id', async (req, res) => {
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

    const contractPack = await prisma.contractPack.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id,
        },
      },
    });

    if (!contractPack) {
      return res.status(404).json({
        success: false,
        error: 'Contract pack not found',
      });
    }

    res.json({
      success: true,
      data: contractPack,
    });
  } catch (error) {
    console.error('[ContractPacks] Get failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get contract pack',
    });
  }
});

/**
 * POST /api/workspaces/:workspaceId/contract-packs
 * Create a new contract pack
 */
router.post('/workspaces/:workspaceId/contract-packs', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { name, description, contracts, version } = req.body;

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
    if (!name || !contracts) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, contracts',
      });
    }

    // Validate contracts array
    if (!Array.isArray(contracts)) {
      return res.status(400).json({
        success: false,
        error: 'Contracts must be an array',
      });
    }

    const contractPack = await prisma.contractPack.create({
      data: {
        workspaceId,
        name,
        description,
        contracts: contracts as any,
        version: version || 'v1',
      },
    });

    res.status(201).json({
      success: true,
      data: contractPack,
    });
  } catch (error) {
    console.error('[ContractPacks] Create failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create contract pack',
    });
  }
});

/**
 * PUT /api/workspaces/:workspaceId/contract-packs/:id
 * Update an existing contract pack
 */
router.put('/workspaces/:workspaceId/contract-packs/:id', async (req, res) => {
  try {
    const { workspaceId, id } = req.params;
    const { name, description, contracts, version } = req.body;

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

    const contractPack = await prisma.contractPack.update({
      where: {
        workspaceId_id: {
          workspaceId,
          id,
        },
      },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(contracts && { contracts: contracts as any }),
        ...(version && { version }),
      },
    });

    res.json({
      success: true,
      data: contractPack,
    });
  } catch (error) {
    console.error('[ContractPacks] Update failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update contract pack',
    });
  }
});

/**
 * DELETE /api/workspaces/:workspaceId/contract-packs/:id
 * Delete a contract pack
 */
router.delete('/workspaces/:workspaceId/contract-packs/:id', async (req, res) => {
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

    await prisma.contractPack.delete({
      where: {
        workspaceId_id: {
          workspaceId,
          id,
        },
      },
    });

    res.json({
      success: true,
      message: 'Contract pack deleted successfully',
    });
  } catch (error) {
    console.error('[ContractPacks] Delete failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete contract pack',
    });
  }
});

export default router;

