// Coverage Calculation Engine
// Phase 3: Week 6 - Calculate mapping and processing coverage metrics
// Analyzes signal events, drift candidates, and doc mappings to compute coverage

import { prisma } from '../../lib/db.js';
import {
  CoverageCalculationArgs,
  CoverageMetrics,
  SourceHealthMap,
  SourceHealthMetrics,
} from './types.js';

/**
 * Calculate comprehensive coverage metrics for a workspace
 */
export async function calculateCoverageMetrics(
  args: CoverageCalculationArgs
): Promise<CoverageMetrics> {
  const { workspaceId, startDate, endDate } = args;
  
  // Default to last 24 hours if not specified
  const start = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000);
  const end = endDate || new Date();
  
  // Calculate mapping coverage
  const mappingCoverage = await calculateMappingCoverage(workspaceId);
  
  // Calculate processing coverage
  const processingCoverage = await calculateProcessingCoverage(
    workspaceId,
    start,
    end
  );
  
  // Calculate source health
  const sourceHealth = await calculateSourceHealth(workspaceId, start, end);
  
  // Calculate drift type distribution
  const driftTypeDistribution = await calculateDriftTypeDistribution(
    workspaceId,
    start,
    end
  );
  
  return {
    mappingCoverage,
    processingCoverage,
    sourceHealth,
    driftTypeDistribution,
  };
}

/**
 * Calculate mapping coverage (services/repos with doc mappings)
 */
async function calculateMappingCoverage(workspaceId: string) {
  // Get all unique services and repos from signal events
  const signalStats = await prisma.signalEvent.groupBy({
    by: ['service', 'repo'],
    where: {
      workspaceId,
      OR: [
        { service: { not: null } },
        { repo: { not: null } },
      ],
    },
  });
  
  const uniqueServices = new Set(
    signalStats.filter((s: any) => s.service).map((s: any) => s.service!)
  );
  const uniqueRepos = new Set(
    signalStats.filter((s: any) => s.repo).map((s: any) => s.repo!)
  );
  
  // Get doc mappings
  const mappings = await prisma.docMappingV2.findMany({
    where: { workspaceId },
    select: { service: true, repo: true },
  });
  
  const mappedServices = new Set(
    mappings.filter((m: any) => m.service).map((m: any) => m.service!)
  );
  const mappedRepos = new Set(
    mappings.filter((m: any) => m.repo).map((m: any) => m.repo!)
  );
  
  const totalServices = uniqueServices.size;
  const servicesMapped = Array.from(uniqueServices).filter((s) =>
    mappedServices.has(s)
  ).length;
  
  const totalRepos = uniqueRepos.size;
  const reposMapped = Array.from(uniqueRepos).filter((r) =>
    mappedRepos.has(r)
  ).length;
  
  const coveragePercent =
    totalServices + totalRepos > 0
      ? ((servicesMapped + reposMapped) / (totalServices + totalRepos)) * 100
      : 0;
  
  return {
    totalServices,
    servicesMapped,
    totalRepos,
    reposMapped,
    coveragePercent,
  };
}

/**
 * Calculate processing coverage (signals that created drift candidates)
 */
async function calculateProcessingCoverage(
  workspaceId: string,
  startDate: Date,
  endDate: Date
) {
  // Count total signals in period
  const totalSignals = await prisma.signalEvent.count({
    where: {
      workspaceId,
      occurredAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });
  
  // Count signals that created drift candidates
  const signalsProcessed = await prisma.driftCandidate.count({
    where: {
      workspaceId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });
  
  const signalsIgnored = totalSignals - signalsProcessed;
  const coveragePercent =
    totalSignals > 0 ? (signalsProcessed / totalSignals) * 100 : 0;
  
  return {
    totalSignals,
    signalsProcessed,
    signalsIgnored,
    coveragePercent,
  };
}

/**
 * Calculate source health metrics (per signal source)
 */
async function calculateSourceHealth(
  workspaceId: string,
  startDate: Date,
  endDate: Date
): Promise<SourceHealthMap> {
  // Get signal counts by source type
  const signalsBySource = await prisma.signalEvent.groupBy({
    by: ['sourceType'],
    where: {
      workspaceId,
      occurredAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    _count: true,
  });

  // Get drift candidate counts by source type
  const driftsBySource = await prisma.driftCandidate.groupBy({
    by: ['sourceType'],
    where: {
      workspaceId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    _count: true,
  });

  const driftCountMap = new Map(
    driftsBySource.map((d: any) => [d.sourceType, d._count])
  );

  const sourceHealth: SourceHealthMap = {};

  for (const signal of signalsBySource) {
    const total = signal._count as number;
    const processed = (driftCountMap.get(signal.sourceType) as number) || 0;
    const ignored = total - processed;
    const healthScore = total > 0 ? (processed / total) * 100 : 0;

    let health: SourceHealthMetrics['health'];
    if (healthScore >= 80) health = 'excellent';
    else if (healthScore >= 60) health = 'good';
    else if (healthScore >= 40) health = 'fair';
    else health = 'poor';

    sourceHealth[signal.sourceType] = {
      total,
      processed,
      ignored,
      health,
      healthScore,
    };
  }

  return sourceHealth;
}

/**
 * Calculate drift type distribution
 */
async function calculateDriftTypeDistribution(
  workspaceId: string,
  startDate: Date,
  endDate: Date
): Promise<Record<string, number>> {
  const driftsByType = await prisma.driftCandidate.groupBy({
    by: ['driftType'],
    where: {
      workspaceId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    _count: true,
  });

  const distribution: Record<string, number> = {};
  for (const drift of driftsByType) {
    if (drift.driftType) {
      distribution[drift.driftType] = drift._count as number;
    }
  }

  return distribution;
}

