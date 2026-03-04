/**
 * WorkspaceService Criticality Registry Routes
 *
 * CRUD for the service criticality registry:
 *   GET    /api/runtime/services/:workspaceId          — list all services
 *   POST   /api/runtime/services/:workspaceId          — upsert a service entry
 *   PUT    /api/runtime/services/:workspaceId/:name    — update tier/floor
 *   DELETE /api/runtime/services/:workspaceId/:name    — remove entry
 *
 * The materialityFloor field controls the minimum alert tier for any drift
 * detected on this service. Petty drifts on tier1 services are silently
 * elevated to operational before alert routing.
 */

import { Router } from 'express';
import { prisma } from '../../lib/db.js';

const router = Router();

// GET /api/runtime/services/:workspaceId
router.get('/:workspaceId', async (req, res) => {
  const { workspaceId } = req.params;
  try {
    const services = await prisma.workspaceService.findMany({
      where: { workspaceId },
      orderBy: [{ tier: 'asc' }, { serviceName: 'asc' }],
    });
    res.json({ success: true, services });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/runtime/services/:workspaceId — upsert (create or update)
// Body: { serviceName, tier?, materialityFloor?, owningTeam?, notes? }
router.post('/:workspaceId', async (req, res) => {
  const { workspaceId } = req.params;
  const { serviceName, tier, materialityFloor, owningTeam, notes } = req.body;

  if (!serviceName || typeof serviceName !== 'string') {
    res.status(400).json({ success: false, error: 'serviceName is required' });
    return;
  }

  const VALID_TIERS = ['tier1', 'tier2', 'tier3', 'internal'];
  const VALID_FLOORS = ['petty', 'operational', 'critical'];

  if (tier && !VALID_TIERS.includes(tier)) {
    res.status(400).json({ success: false, error: `tier must be one of: ${VALID_TIERS.join(', ')}` });
    return;
  }
  if (materialityFloor && !VALID_FLOORS.includes(materialityFloor)) {
    res.status(400).json({ success: false, error: `materialityFloor must be one of: ${VALID_FLOORS.join(', ')}` });
    return;
  }

  try {
    const service = await prisma.workspaceService.upsert({
      where: { workspaceId_serviceName: { workspaceId, serviceName } },
      create: {
        workspaceId,
        serviceName,
        tier: tier ?? 'tier2',
        materialityFloor: materialityFloor ?? 'petty',
        owningTeam: owningTeam ?? null,
        notes: notes ?? null,
      },
      update: {
        ...(tier ? { tier } : {}),
        ...(materialityFloor ? { materialityFloor } : {}),
        ...(owningTeam !== undefined ? { owningTeam } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
    });
    res.json({ success: true, service });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/runtime/services/:workspaceId/:serviceName
// Partial update — only provided fields are changed
router.put('/:workspaceId/:serviceName', async (req, res) => {
  const { workspaceId, serviceName } = req.params;
  const { tier, materialityFloor, owningTeam, notes } = req.body;

  try {
    const service = await prisma.workspaceService.update({
      where: { workspaceId_serviceName: { workspaceId, serviceName } },
      data: {
        ...(tier ? { tier } : {}),
        ...(materialityFloor ? { materialityFloor } : {}),
        ...(owningTeam !== undefined ? { owningTeam } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
    });
    res.json({ success: true, service });
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ success: false, error: `Service '${serviceName}' not found in workspace` });
    } else {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// DELETE /api/runtime/services/:workspaceId/:serviceName
router.delete('/:workspaceId/:serviceName', async (req, res) => {
  const { workspaceId, serviceName } = req.params;
  try {
    await prisma.workspaceService.delete({
      where: { workspaceId_serviceName: { workspaceId, serviceName } },
    });
    res.json({ success: true });
  } catch (err: any) {
    if (err.code === 'P2025') {
      res.status(404).json({ success: false, error: `Service '${serviceName}' not found` });
    } else {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

export default router;
