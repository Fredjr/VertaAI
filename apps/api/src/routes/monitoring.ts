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

// GET /api/monitoring/drift-trends - Get drift trends over time
router.get('/drift-trends', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || '7d'; // 7d, 30d, 90d

    const daysMap: Record<string, number> = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
    };

    const days = daysMap[period] || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const drifts = await prisma.driftCandidate.findMany({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        driftType: true,
        state: true,
        confidence: true,
        classificationMethod: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Calculate trend metrics
    const totalDrifts = drifts.length;
    const avgDriftsPerDay = totalDrifts / days;
    const completedDrifts = drifts.filter(d => d.state === 'COMPLETED').length;
    const failedDrifts = drifts.filter(d => d.state === 'FAILED').length;
    const successRate = totalDrifts > 0 ? (completedDrifts / totalDrifts) * 100 : 0;

    return res.json({
      timestamp: new Date().toISOString(),
      period,
      days,
      trends: {
        totalDrifts,
        avgDriftsPerDay: parseFloat(avgDriftsPerDay.toFixed(2)),
        completedDrifts,
        failedDrifts,
        successRate: parseFloat(successRate.toFixed(2)),
      },
      drifts,
    });
  } catch (error: any) {
    console.error('[Monitoring] Drift trends fetch failed:', error);
    return res.status(500).json({
      error: 'Failed to fetch drift trends',
      message: error.message,
    });
  }
});

/**
 * GET /api/monitoring/drift-health
 * Returns drift pipeline health metrics
 */
router.get('/drift-health', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    // Get drift state distribution
    const stateDistribution = await prisma.driftCandidate.groupBy({
      by: ['state'],
      where: { workspaceId },
      _count: { state: true },
    });

    // Get error distribution
    const errorDistribution = await prisma.driftCandidate.groupBy({
      by: ['lastErrorCode'],
      where: {
        workspaceId,
        lastErrorCode: { not: null },
      },
      _count: { lastErrorCode: true },
    });

    // Get recent failures
    const recentFailures = await prisma.driftCandidate.findMany({
      where: {
        workspaceId,
        state: 'FAILED',
      },
      orderBy: { stateUpdatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        state: true,
        lastErrorCode: true,
        lastErrorMessage: true,
        stateUpdatedAt: true,
        driftType: true,
        confidence: true,
      },
    });

    // Calculate health score (0-100)
    const totalDrifts = stateDistribution.reduce((sum, s) => sum + s._count.state, 0);
    const failedDrifts = stateDistribution.find(s => s.state === 'FAILED')?._count.state || 0;
    const completedDrifts = stateDistribution.find(s => s.state === 'COMPLETED')?._count.state || 0;

    const healthScore = totalDrifts > 0
      ? Math.round(((completedDrifts / totalDrifts) * 100))
      : 100;

    return res.json({
      healthScore,
      totalDrifts,
      completedDrifts,
      failedDrifts,
      stateDistribution: stateDistribution.map(s => ({
        state: s.state,
        count: s._count.state,
      })),
      errorDistribution: errorDistribution.map(e => ({
        errorCode: e.lastErrorCode,
        count: e._count.lastErrorCode,
      })),
      recentFailures,
    });
  } catch (error: any) {
    console.error('[Monitoring] Drift health fetch failed:', error);
    return res.status(500).json({
      error: 'Failed to fetch drift health',
      message: error.message,
    });
  }
});

/**
 * GET /api/monitoring/drift-coverage
 * Returns drift coverage metrics by drift type
 */
router.get('/drift-coverage', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    // Get drift type distribution
    const driftTypeDistribution = await prisma.driftCandidate.groupBy({
      by: ['driftType'],
      where: {
        workspaceId,
        state: 'COMPLETED',
      },
      _count: { driftType: true },
    });

    // Get source type distribution
    const sourceTypeDistribution = await prisma.driftCandidate.groupBy({
      by: ['sourceType'],
      where: {
        workspaceId,
        state: 'COMPLETED',
      },
      _count: { sourceType: true },
    });

    // Get classification method distribution
    const classificationMethodDistribution = await prisma.driftCandidate.groupBy({
      by: ['classificationMethod'],
      where: {
        workspaceId,
        state: 'COMPLETED',
      },
      _count: { classificationMethod: true },
    });

    // Calculate coverage percentage
    const totalCompleted = driftTypeDistribution.reduce((sum, d) => sum + d._count.driftType, 0);
    const deterministicCount = classificationMethodDistribution.find(c => c.classificationMethod === 'deterministic')?._count.classificationMethod || 0;
    const coveragePercentage = totalCompleted > 0
      ? Math.round((deterministicCount / totalCompleted) * 100)
      : 0;

    return res.json({
      coveragePercentage,
      totalCompleted,
      deterministicCount,
      llmCount: totalCompleted - deterministicCount,
      driftTypeDistribution: driftTypeDistribution.map(d => ({
        driftType: d.driftType,
        count: d._count.driftType,
      })),
      sourceTypeDistribution: sourceTypeDistribution.map(s => ({
        sourceType: s.sourceType,
        count: s._count.sourceType,
      })),
      classificationMethodDistribution: classificationMethodDistribution.map(c => ({
        method: c.classificationMethod,
        count: c._count.classificationMethod,
      })),
    });
  } catch (error: any) {
    console.error('[Monitoring] Drift coverage fetch failed:', error);
    return res.status(500).json({
      error: 'Failed to fetch drift coverage',
      message: error.message,
    });
  }
});

/**
 * GET /api/monitoring/threshold-effectiveness
 * Returns threshold effectiveness metrics (Phase 2: Threshold Tuning)
 *
 * Tracks how drifts are distributed across routing thresholds:
 * - Auto-approved (should be <5%)
 * - Sent to Slack (should be 60-80%)
 * - Digest only (should be 10-20%)
 * - Ignored (should be 5-15%)
 */
router.get('/threshold-effectiveness', async (req: Request, res: Response) => {
  try {
    const { workspaceId, sourceType, daysBack = 30 } = req.query;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - Number(daysBack));

    // Build filter
    const where: any = {
      createdAt: { gte: cutoffDate },
    };
    if (workspaceId) where.workspaceId = workspaceId;
    if (sourceType) where.sourceType = sourceType;

    // Get all drifts with their routing decisions
    const drifts = await prisma.driftCandidate.findMany({
      where,
      select: {
        id: true,
        workspaceId: true,
        sourceType: true,
        confidence: true,
        state: true,
        createdAt: true,
      },
    });

    // Categorize by routing decision
    const total = drifts.length;
    let autoApproved = 0;
    let slackNotified = 0;
    let digestOnly = 0;
    let ignored = 0;

    for (const drift of drifts) {
      // Check if drift reached SLACK_SENT state
      if (drift.state === 'SLACK_SENT' || drift.state === 'AWAITING_HUMAN' ||
          drift.state === 'APPROVED' || drift.state === 'WRITTEN_BACK' ||
          drift.state === 'COMPLETED') {
        slackNotified++;
      }
      // Check if drift was auto-approved (went straight to WRITTEN_BACK without SLACK_SENT)
      else if (drift.state === 'WRITTEN_BACK' || drift.state === 'COMPLETED') {
        autoApproved++;
      }
      // Check if drift was ignored (stuck in early states)
      else if (drift.state === 'INGESTED' || drift.state === 'ELIGIBILITY_CHECKED') {
        ignored++;
      }
      // Everything else is digest
      else {
        digestOnly++;
      }
    }

    // Calculate percentages
    const percentages = {
      autoApproved: total > 0 ? (autoApproved / total) * 100 : 0,
      slackNotified: total > 0 ? (slackNotified / total) * 100 : 0,
      digestOnly: total > 0 ? (digestOnly / total) * 100 : 0,
      ignored: total > 0 ? (ignored / total) * 100 : 0,
    };

    // Health assessment
    const health = {
      autoApproveRate: percentages.autoApproved < 5 ? 'healthy' : 'warning',
      slackNotifyRate: percentages.slackNotified >= 60 && percentages.slackNotified <= 80 ? 'healthy' : 'warning',
      digestRate: percentages.digestOnly >= 10 && percentages.digestOnly <= 20 ? 'healthy' : 'warning',
      ignoreRate: percentages.ignored >= 5 && percentages.ignored <= 15 ? 'healthy' : 'warning',
    };

    const overallHealth = Object.values(health).every(h => h === 'healthy') ? 'healthy' : 'needs_tuning';

    return res.json({
      period: {
        daysBack: Number(daysBack),
        startDate: cutoffDate.toISOString(),
        endDate: new Date().toISOString(),
      },
      filters: {
        workspaceId: workspaceId || 'all',
        sourceType: sourceType || 'all',
      },
      metrics: {
        total,
        autoApproved,
        slackNotified,
        digestOnly,
        ignored,
      },
      percentages,
      health,
      overallHealth,
      recommendations: overallHealth === 'needs_tuning' ? [
        percentages.autoApproved >= 5 && 'Consider raising autoApprove threshold - too many auto-approvals',
        percentages.slackNotified < 60 && 'Consider lowering slackNotify threshold - too few Slack notifications',
        percentages.slackNotified > 80 && 'Consider raising slackNotify threshold - too many Slack notifications',
        percentages.ignored > 15 && 'Consider lowering ignore threshold - too many drifts being ignored',
      ].filter(Boolean) : [],
    });
  } catch (error: any) {
    console.error('[Monitoring] Threshold effectiveness fetch failed:', error);
    return res.status(500).json({
      error: 'Failed to fetch threshold effectiveness',
      message: error.message,
    });
  }
});

export default router;
