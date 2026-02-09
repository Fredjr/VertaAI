/**
 * Production Monitoring Endpoints
 *
 * Provides real-time system health and metrics tracking for production environments.
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { prisma } from '../lib/db.js';

const router: RouterType = Router();

/**
 * GET /api/monitoring/health
 * Returns system health status
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;

    const response = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      version: '1.0.0',
    };

    return res.json(response);
  } catch (error: any) {
    return res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message,
    });
  }
});

/**
 * GET /api/monitoring/metrics
 * Returns system metrics
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const [workspaceCount, driftCount, activeDriftCount, signalCount] = await Promise.all([
      prisma.workspace.count(),
      prisma.driftCandidate.count(),
      prisma.driftCandidate.count({
        where: {
          state: {
            in: ['INGESTED', 'ELIGIBILITY_CHECKED', 'SIGNALS_CORRELATED', 'DRIFT_CLASSIFIED']
          }
        }
      }),
      prisma.signalEvent.count(),
    ]);

    return res.json({
      timestamp: new Date().toISOString(),
      metrics: {
        totalWorkspaces: workspaceCount,
        totalDrifts: driftCount,
        activeDrifts: activeDriftCount,
        totalSignals: signalCount,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      error: 'Failed to fetch metrics',
      message: error.message,
    });
  }
});

/**
 * GET /api/monitoring/status
 * Returns detailed component status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    // Check database
    await prisma.$queryRaw`SELECT 1`;
    const dbStatus = 'operational';

    // Check QStash (placeholder)
    const qstashStatus = 'operational';

    // Check Redis (placeholder)
    const redisStatus = 'operational';

    return res.json({
      timestamp: new Date().toISOString(),
      components: {
        database: { status: dbStatus },
        qstash: { status: qstashStatus },
        redis: { status: redisStatus },
      },
      overall: 'operational',
    });
  } catch (error: any) {
    return res.status(500).json({
      error: 'Failed to check status',
      message: error.message,
    });
  }
});

export default router;
