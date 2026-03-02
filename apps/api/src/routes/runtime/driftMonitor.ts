/**
 * Runtime Drift Monitor Endpoint (Track B)
 * 
 * Scheduled job endpoint for runtime drift detection.
 * This should be called by a cron job or QStash scheduler.
 * 
 * POST /api/runtime/drift-monitor
 * 
 * Expected to run every 1 hour.
 */

import { Router, Request, Response } from 'express';
import { runRuntimeDriftMonitor } from '../../services/runtime/runtimeDriftMonitor.js';

const router = Router();

/**
 * POST /api/runtime/drift-monitor
 * Run runtime drift monitoring for all workspaces
 * 
 * This endpoint should be called by a scheduled job (cron, QStash, etc.)
 * 
 * Authentication: Requires API key or internal service token
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    console.log('[RuntimeDriftMonitor] Starting scheduled drift monitoring...');
    
    // TODO: Add authentication check (API key or internal service token)
    // const apiKey = req.headers['x-api-key'];
    // if (apiKey !== process.env.INTERNAL_API_KEY) {
    //   return res.status(401).json({ error: 'Unauthorized' });
    // }
    
    const results = await runRuntimeDriftMonitor();
    
    // Aggregate statistics
    const stats = {
      workspacesProcessed: new Set(results.map(r => r.workspaceId)).size,
      servicesProcessed: results.length,
      totalDrifts: results.reduce((sum, r) => sum + r.driftsDetected, 0),
      criticalDrifts: results.filter(r => r.severity === 'critical').length,
      highDrifts: results.filter(r => r.severity === 'high').length,
      driftPlansCreated: results.filter(r => r.driftPlanCreated).length,
      pagerdutyAlertsSent: results.filter(r => r.pagerdutyAlertSent).length,
    };
    
    console.log('[RuntimeDriftMonitor] Completed:', stats);
    
    res.status(200).json({
      success: true,
      message: 'Runtime drift monitoring completed',
      stats,
      results,
    });
  } catch (error: any) {
    console.error('[RuntimeDriftMonitor] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/runtime/drift-monitor/status
 * Get status of last drift monitoring run
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    // TODO: Implement status tracking (store last run time, results in DB)
    res.status(200).json({
      success: true,
      message: 'Status endpoint not yet implemented',
      // lastRun: null,
      // nextRun: null,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;

