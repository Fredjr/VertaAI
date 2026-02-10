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

/**
 * GET /api/monitoring/drift-analytics
 * Returns time-series drift analytics with trend data
 *
 * This endpoint provides historical drift trends and pattern analysis.
 * Used for identifying drift patterns over time and forecasting.
 */
router.get('/drift-analytics', async (req: Request, res: Response) => {
  try {
    const { days = 30 } = req.query;
    const daysNum = parseInt(days as string, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    // Get drift counts over time
    const driftsOverTime = await prisma.driftCandidate.findMany({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        id: true,
        driftType: true,
        confidence: true,
        state: true,
        classificationMethod: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Calculate daily aggregates
    const dailyStats = driftsOverTime.reduce((acc: Record<string, any>, drift) => {
      const date = drift.createdAt.toISOString().split('T')[0];
      if (!date) return acc;

      if (!acc[date]) {
        acc[date] = {
          date,
          total: 0,
          byType: {} as Record<string, number>,
          byMethod: {} as Record<string, number>,
          avgConfidence: 0,
          confidenceSum: 0,
        };
      }
      acc[date].total += 1;
      acc[date].byType[drift.driftType || 'unknown'] = (acc[date].byType[drift.driftType || 'unknown'] || 0) + 1;
      acc[date].byMethod[drift.classificationMethod || 'unknown'] = (acc[date].byMethod[drift.classificationMethod || 'unknown'] || 0) + 1;
      acc[date].confidenceSum += drift.confidence || 0;
      acc[date].avgConfidence = acc[date].confidenceSum / acc[date].total;
      return acc;
    }, {} as Record<string, any>);

    return res.json({
      timestamp: new Date().toISOString(),
      period: {
        days: daysNum,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
      },
      analytics: {
        totalDrifts: driftsOverTime.length,
        dailyStats: Object.values(dailyStats),
        trends: {
          avgDriftsPerDay: driftsOverTime.length / daysNum,
          avgConfidence: driftsOverTime.reduce((sum, d) => sum + (d.confidence || 0), 0) / driftsOverTime.length || 0,
        },
      },
    });
  } catch (error: any) {
    console.error('[Monitoring] Drift analytics fetch failed:', error);
    return res.status(500).json({
      error: 'Failed to fetch drift analytics',
      message: error.message,
    });
  }
});

export default router;
