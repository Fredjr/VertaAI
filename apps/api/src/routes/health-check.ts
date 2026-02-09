/**
 * Health Check API Routes
 * 
 * Provides endpoints for monitoring system health and status.
 * This is a new endpoint added to test drift detection.
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { prisma } from '../lib/db.js';

const router: RouterType = Router();

/**
 * GET /api/health
 * Basic health check endpoint
 * 
 * Returns system status and database connectivity.
 * 
 * **NEW PARAMETER**: includeMetrics (boolean)
 * - When true, includes additional system metrics
 * - Default: false
 * 
 * Example:
 * GET /api/health?includeMetrics=true
 * 
 * Response:
 * {
 *   "status": "healthy",
 *   "timestamp": "2026-02-08T19:00:00Z",
 *   "database": "connected",
 *   "metrics": {
 *     "totalWorkspaces": 5,
 *     "totalDrifts": 120,
 *     "activeDrifts": 15
 *   }
 * }
 */
router.get('/health', async (req: Request, res: Response) => {
  const includeMetrics = req.query.includeMetrics === 'true';
  
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;
    
    const response: any = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
    };
    
    // NEW: Include metrics if requested
    if (includeMetrics) {
      const [workspaceCount, driftCount, activeDriftCount] = await Promise.all([
        prisma.workspace.count(),
        prisma.driftCandidate.count(),
        prisma.driftCandidate.count({
          where: {
            state: {
              in: ['INGESTED', 'ELIGIBILITY_CHECKED', 'SIGNALS_CORRELATED', 'DRIFT_CLASSIFIED']
            }
          }
        }),
      ]);
      
      response.metrics = {
        totalWorkspaces: workspaceCount,
        totalDrifts: driftCount,
        activeDrifts: activeDriftCount,
      };
    }
    
    return res.json(response);
  } catch (error: any) {
    console.error('[HealthCheck] Database connection failed:', error);
    return res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message,
    });
  }
});

/**
 * GET /api/health/detailed
 * Detailed health check with component status
 * 
 * Returns status of all system components:
 * - Database
 * - QStash (job queue)
 * - Redis (cache)
 * - External integrations
 */
router.get('/health/detailed', async (req: Request, res: Response) => {
  const checks: any = {
    timestamp: new Date().toISOString(),
    overall: 'healthy',
    components: {},
  };
  
  // Check database
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.components.database = { status: 'healthy', latency: 0 };
  } catch (error: any) {
    checks.components.database = { status: 'unhealthy', error: error.message };
    checks.overall = 'degraded';
  }
  
  // Check QStash (optional - requires API call)
  checks.components.qstash = { status: 'unknown', message: 'Not implemented' };
  
  // Check Redis (optional - requires API call)
  checks.components.redis = { status: 'unknown', message: 'Not implemented' };
  
  return res.json(checks);
});

export default router;

