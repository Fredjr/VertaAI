// Coverage Snapshot Manager
// Phase 3: Week 6 - Create and retrieve coverage snapshots
// Stores daily snapshots for trend analysis and alerting

import { prisma } from '../../lib/db.js';
import {
  CoverageSnapshot,
  CreateSnapshotArgs,
  GetSnapshotsArgs,
  CoverageObligationConfig,
  ObligationsStatusMap,
  CoverageTrend,
  CoverageAlert,
} from './types.js';
import { calculateCoverageMetrics } from './calculator.js';

/**
 * Create a new coverage snapshot
 */
export async function createCoverageSnapshot(
  args: CreateSnapshotArgs
): Promise<CoverageSnapshot> {
  const { workspaceId, metrics, obligations } = args;
  
  // Calculate obligations status
  const obligationsStatus = calculateObligationsStatus(metrics, obligations);
  
  // Calculate average source health
  const sourceHealthScores = Object.values(metrics.sourceHealth).map(
    (s) => s.healthScore
  );
  const avgSourceHealth =
    sourceHealthScores.length > 0
      ? sourceHealthScores.reduce((a, b) => a + b, 0) / sourceHealthScores.length
      : 0;
  
  const snapshot = await prisma.coverageSnapshot.create({
    data: {
      workspaceId,
      snapshotAt: new Date(),
      
      // Mapping coverage
      totalServices: metrics.mappingCoverage.totalServices,
      servicesMapped: metrics.mappingCoverage.servicesMapped,
      totalRepos: metrics.mappingCoverage.totalRepos,
      reposMapped: metrics.mappingCoverage.reposMapped,
      mappingCoveragePercent: metrics.mappingCoverage.coveragePercent,
      
      // Processing coverage
      totalSignals: metrics.processingCoverage.totalSignals,
      signalsProcessed: metrics.processingCoverage.signalsProcessed,
      signalsIgnored: metrics.processingCoverage.signalsIgnored,
      processingCoveragePercent: metrics.processingCoverage.coveragePercent,
      
      // Source health
      sourceHealth: metrics.sourceHealth as any,
      
      // Drift type distribution
      driftTypeDistribution: metrics.driftTypeDistribution as any,
      
      // Obligations status
      obligationsStatus: obligationsStatus as any,
    },
  });
  
  return snapshot as any;
}

/**
 * Get coverage snapshots for a workspace
 */
export async function getCoverageSnapshots(
  args: GetSnapshotsArgs
): Promise<CoverageSnapshot[]> {
  const { workspaceId, startDate, endDate, limit = 30 } = args;
  
  const snapshots = await prisma.coverageSnapshot.findMany({
    where: {
      workspaceId,
      ...(startDate && endDate
        ? {
            snapshotAt: {
              gte: startDate,
              lte: endDate,
            },
          }
        : {}),
    },
    orderBy: {
      snapshotAt: 'desc',
    },
    take: limit,
  });
  
  return snapshots as any;
}

/**
 * Get latest coverage snapshot for a workspace
 */
export async function getLatestSnapshot(
  workspaceId: string
): Promise<CoverageSnapshot | null> {
  const snapshot = await prisma.coverageSnapshot.findFirst({
    where: { workspaceId },
    orderBy: { snapshotAt: 'desc' },
  });
  
  return snapshot as any;
}

/**
 * Calculate coverage trends over time
 */
export async function getCoverageTrends(
  workspaceId: string,
  days: number = 30
): Promise<CoverageTrend[]> {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const snapshots = await prisma.coverageSnapshot.findMany({
    where: {
      workspaceId,
      snapshotAt: { gte: startDate },
    },
    orderBy: { snapshotAt: 'asc' },
  });
  
  return snapshots.map((s: any) => {
    const sourceHealthScores = Object.values(s.sourceHealth as any).map(
      (sh: any) => sh.healthScore
    );
    const avgSourceHealth =
      sourceHealthScores.length > 0
        ? sourceHealthScores.reduce((a: number, b: number) => a + b, 0) /
          sourceHealthScores.length
        : 0;

    return {
      date: s.snapshotAt,
      mappingCoverage: s.mappingCoveragePercent,
      processingCoverage: s.processingCoveragePercent,
      avgSourceHealth,
    };
  });
}

/**
 * Get active coverage alerts
 */
export async function getCoverageAlerts(
  workspaceId: string
): Promise<CoverageAlert[]> {
  const latest = await getLatestSnapshot(workspaceId);
  if (!latest) return [];
  
  const alerts: CoverageAlert[] = [];
  const obligations = latest.obligationsStatus as any;
  
  for (const [key, obligation] of Object.entries(obligations)) {
    const o = obligation as any;
    if (!o.met) {
      alerts.push({
        type: key as any,
        severity: o.severity,
        message: `${key} is below threshold: ${(o.actual * 100).toFixed(1)}% (expected: ${(o.threshold * 100).toFixed(1)}%)`,
        threshold: o.threshold,
        actual: o.actual,
        timestamp: latest.snapshotAt,
      });
    }
  }
  
  return alerts;
}

/**
 * Calculate obligations status based on metrics and thresholds
 */
function calculateObligationsStatus(
  metrics: any,
  obligations: CoverageObligationConfig
): ObligationsStatusMap {
  const status: ObligationsStatusMap = {};

  // Mapping coverage obligation
  const mappingCoverage = metrics.mappingCoverage.coveragePercent / 100;
  status.mapping_coverage = {
    threshold: obligations.mappingCoverageMin,
    actual: mappingCoverage,
    met: mappingCoverage >= obligations.mappingCoverageMin,
    severity: mappingCoverage < obligations.mappingCoverageMin * 0.8 ? 'critical' : 'warning',
  };

  // Processing coverage obligation
  const processingCoverage = metrics.processingCoverage.coveragePercent / 100;
  status.processing_coverage = {
    threshold: obligations.processingCoverageMin,
    actual: processingCoverage,
    met: processingCoverage >= obligations.processingCoverageMin,
    severity: processingCoverage < obligations.processingCoverageMin * 0.8 ? 'critical' : 'warning',
  };

  // Source health obligation
  const sourceHealthScores = Object.values(metrics.sourceHealth).map(
    (s: any) => s.healthScore
  );
  const avgSourceHealth =
    sourceHealthScores.length > 0
      ? sourceHealthScores.reduce((a, b) => a + b, 0) / sourceHealthScores.length
      : 0;

  status.source_health = {
    threshold: obligations.sourceHealthMin / 100,
    actual: avgSourceHealth / 100,
    met: avgSourceHealth >= obligations.sourceHealthMin,
    severity: avgSourceHealth < obligations.sourceHealthMin * 0.8 ? 'critical' : 'warning',
  };

  return status;
}

