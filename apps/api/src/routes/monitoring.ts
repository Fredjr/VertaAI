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

/**
 * GET /api/monitoring/drift-stats
 * Returns drift detection statistics by type and state
 *
 * This endpoint provides insights into drift patterns and processing status.
 * Used for analytics dashboards and trend analysis.
 */
router.get('/drift-stats', async (req: Request, res: Response) => {
  try {
    // Get drift counts by type
    const driftsByType = await prisma.driftCandidate.groupBy({
      by: ['driftType'],
      _count: {
        id: true,
      },
    });

    // Get drift counts by state
    const driftsByState = await prisma.driftCandidate.groupBy({
      by: ['state'],
      _count: {
        id: true,
      },
    });

    // Get drift counts by classification method (Phase 1)
    const driftsByMethod = await prisma.driftCandidate.groupBy({
      by: ['classificationMethod'],
      _count: {
        id: true,
      },
    });

    // Get average confidence by drift type
    const avgConfidenceByType = await prisma.driftCandidate.groupBy({
      by: ['driftType'],
      _avg: {
        confidence: true,
      },
    });

    return res.json({
      timestamp: new Date().toISOString(),
      statistics: {
        byType: driftsByType.map(item => ({
          type: item.driftType,
          count: item._count.id,
          avgConfidence: avgConfidenceByType.find(avg => avg.driftType === item.driftType)?._avg.confidence || 0,
        })),
        byState: driftsByState.map(item => ({
          state: item.state,
          count: item._count.id,
        })),
        byClassificationMethod: driftsByMethod.map(item => ({
          method: item.classificationMethod || 'unknown',
          count: item._count.id,
        })),
      },
    });
  } catch (error: any) {
    console.error('[Monitoring] Drift stats fetch failed:', error);
    return res.status(500).json({
      error: 'Failed to fetch drift statistics',
      message: error.message,
    });
  }
});

export default router;
