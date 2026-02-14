// Artifact Snapshot TTL Cleanup Service
// Phase 1 Week 3-4: Clean up expired artifact snapshots

import { prisma } from '../../lib/db.js';

/**
 * Cleanup statistics
 */
export interface CleanupStats {
  workspaceId: string;
  totalSnapshots: number;
  expiredSnapshots: number;
  deletedSnapshots: number;
  cleanupTimeMs: number;
  cutoffDate: Date;
}

/**
 * Clean up expired artifact snapshots for a workspace
 * 
 * Deletes snapshots where: createdAt + ttlDays < NOW()
 * 
 * @param workspaceId - Workspace to clean up
 * @returns Cleanup statistics
 */
export async function cleanupExpiredSnapshots(workspaceId: string): Promise<CleanupStats> {
  const startTime = Date.now();
  
  console.log(`[SnapshotCleanup] Starting cleanup for workspace ${workspaceId}`);

  // Count total snapshots before cleanup
  const totalSnapshots = await prisma.artifactSnapshot.count({
    where: { workspaceId },
  });

  // Find expired snapshots
  // A snapshot is expired if: createdAt + (ttlDays * 1 day) < NOW()
  const now = new Date();
  
  const expiredSnapshots = await prisma.$queryRaw<Array<{ id: string; createdAt: Date; ttlDays: number }>>`
    SELECT id, created_at as "createdAt", ttl_days as "ttlDays"
    FROM artifact_snapshots
    WHERE workspace_id = ${workspaceId}
      AND created_at + (ttl_days || ' days')::interval < ${now}
  `;

  console.log(`[SnapshotCleanup] Found ${expiredSnapshots.length} expired snapshots`);

  if (expiredSnapshots.length === 0) {
    const cleanupTimeMs = Date.now() - startTime;
    return {
      workspaceId,
      totalSnapshots,
      expiredSnapshots: 0,
      deletedSnapshots: 0,
      cleanupTimeMs,
      cutoffDate: now,
    };
  }

  // Delete expired snapshots
  const expiredIds = expiredSnapshots.map(s => s.id);
  
  const deleteResult = await prisma.artifactSnapshot.deleteMany({
    where: {
      workspaceId,
      id: {
        in: expiredIds,
      },
    },
  });

  const cleanupTimeMs = Date.now() - startTime;

  console.log(
    `[SnapshotCleanup] Deleted ${deleteResult.count} expired snapshots for workspace ${workspaceId} (${cleanupTimeMs}ms)`
  );

  // Calculate the oldest cutoff date (earliest expiration)
  const cutoffDate = expiredSnapshots.reduce((earliest, snapshot) => {
    const expiresAt = new Date(snapshot.createdAt);
    expiresAt.setDate(expiresAt.getDate() + snapshot.ttlDays);
    return expiresAt < earliest ? expiresAt : earliest;
  }, now);

  return {
    workspaceId,
    totalSnapshots,
    expiredSnapshots: expiredSnapshots.length,
    deletedSnapshots: deleteResult.count,
    cleanupTimeMs,
    cutoffDate,
  };
}

/**
 * Clean up expired snapshots for all workspaces
 * 
 * @returns Array of cleanup statistics per workspace
 */
export async function cleanupAllWorkspaces(): Promise<CleanupStats[]> {
  console.log('[SnapshotCleanup] Starting cleanup for all workspaces');

  // Get all unique workspace IDs that have artifact snapshots
  const workspaces = await prisma.artifactSnapshot.findMany({
    select: {
      workspaceId: true,
    },
    distinct: ['workspaceId'],
  });

  const results: CleanupStats[] = [];

  for (const { workspaceId } of workspaces) {
    try {
      const stats = await cleanupExpiredSnapshots(workspaceId);
      results.push(stats);
    } catch (error) {
      console.error(`[SnapshotCleanup] Error cleaning workspace ${workspaceId}:`, error);
      // Continue with other workspaces
    }
  }

  const totalDeleted = results.reduce((sum, r) => sum + r.deletedSnapshots, 0);
  console.log(`[SnapshotCleanup] Cleanup complete: ${totalDeleted} snapshots deleted across ${results.length} workspaces`);

  return results;
}

/**
 * Get snapshot retention statistics for a workspace
 */
export async function getSnapshotRetentionStats(workspaceId: string): Promise<{
  totalSnapshots: number;
  expiredSnapshots: number;
  snapshotsByTTL: Record<number, number>;
  oldestSnapshot: Date | null;
  newestSnapshot: Date | null;
}> {
  const now = new Date();

  // Get all snapshots for the workspace
  const snapshots = await prisma.artifactSnapshot.findMany({
    where: { workspaceId },
    select: {
      id: true,
      createdAt: true,
      ttlDays: true,
    },
  });

  if (snapshots.length === 0) {
    return {
      totalSnapshots: 0,
      expiredSnapshots: 0,
      snapshotsByTTL: {},
      oldestSnapshot: null,
      newestSnapshot: null,
    };
  }

  // Calculate expired snapshots
  const expiredCount = snapshots.filter(s => {
    const expiresAt = new Date(s.createdAt);
    expiresAt.setDate(expiresAt.getDate() + s.ttlDays);
    return expiresAt < now;
  }).length;

  // Group by TTL
  const snapshotsByTTL: Record<number, number> = {};
  snapshots.forEach(s => {
    snapshotsByTTL[s.ttlDays] = (snapshotsByTTL[s.ttlDays] || 0) + 1;
  });

  // Find oldest and newest
  const dates = snapshots.map(s => s.createdAt);
  const oldestSnapshot = new Date(Math.min(...dates.map(d => d.getTime())));
  const newestSnapshot = new Date(Math.max(...dates.map(d => d.getTime())));

  return {
    totalSnapshots: snapshots.length,
    expiredSnapshots: expiredCount,
    snapshotsByTTL,
    oldestSnapshot,
    newestSnapshot,
  };
}

