// Coverage API Routes
// Phase 3: Week 6 - REST endpoints for coverage monitoring
// Provides access to coverage snapshots, trends, and alerts

import { Router, type IRouter } from 'express';
import {
  calculateCoverageMetrics,
  createCoverageSnapshot,
  getCoverageSnapshots,
  getLatestSnapshot,
  getCoverageTrends,
  getCoverageAlerts,
  runDailyCoverageSnapshot,
} from '../services/coverage/index.js';

const router: IRouter = Router();

/**
 * GET /coverage/current
 * Get current coverage metrics (real-time calculation)
 */
router.get('/current', async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }
    
    const metrics = await calculateCoverageMetrics({ workspaceId });
    
    res.json(metrics);
  } catch (error: any) {
    console.error('[Coverage API] Error getting current metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /coverage/snapshots
 * Get historical coverage snapshots
 */
router.get('/snapshots', async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 30;
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : undefined;
    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : undefined;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }
    
    const snapshots = await getCoverageSnapshots({
      workspaceId,
      startDate,
      endDate,
      limit,
    });
    
    res.json(snapshots);
  } catch (error: any) {
    console.error('[Coverage API] Error getting snapshots:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /coverage/latest
 * Get latest coverage snapshot
 */
router.get('/latest', async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }
    
    const snapshot = await getLatestSnapshot(workspaceId);
    
    if (!snapshot) {
      return res.status(404).json({ error: 'No snapshots found' });
    }
    
    res.json(snapshot);
  } catch (error: any) {
    console.error('[Coverage API] Error getting latest snapshot:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /coverage/trends
 * Get coverage trends over time
 */
router.get('/trends', async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    const days = req.query.days ? parseInt(req.query.days as string) : 30;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }
    
    const trends = await getCoverageTrends(workspaceId, days);
    
    res.json(trends);
  } catch (error: any) {
    console.error('[Coverage API] Error getting trends:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /coverage/alerts
 * Get active coverage alerts
 */
router.get('/alerts', async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }
    
    const alerts = await getCoverageAlerts(workspaceId);
    
    res.json(alerts);
  } catch (error: any) {
    console.error('[Coverage API] Error getting alerts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /coverage/snapshot
 * Manually trigger a coverage snapshot
 */
router.post('/snapshot', async (req, res) => {
  try {
    const { workspaceId } = req.body;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }
    
    const snapshot = await runDailyCoverageSnapshot(workspaceId);
    
    res.json(snapshot);
  } catch (error: any) {
    console.error('[Coverage API] Error creating snapshot:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

