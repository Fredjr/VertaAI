/**
 * Gap #9: Cluster-First Drift Triage - Aggregation Logic
 * 
 * Core clustering functions to group similar drifts and reduce notification fatigue.
 * 
 * SAFETY: This module is OPT-IN only. When clustering is disabled, the existing
 * individual notification flow is used (zero regression risk).
 */

import { prisma } from '../../lib/db.js';
import type { ClusterKey, ClusterConfig, ClusterMetrics, DriftClusterData } from './types.js';

/**
 * Default cluster configuration
 */
const DEFAULT_CONFIG: ClusterConfig = {
  enabled: false, // OPT-IN: Disabled by default for safety
  minClusterSize: 2,
  maxClusterSize: 20,
  timeWindowMinutes: 60,
  notifyOnCount: 2,
  notifyOnExpiry: true,
};

/**
 * Extract cluster key from drift candidate
 * Cluster key = {service}_{driftType}_{fingerprintPattern}
 */
export function extractClusterKey(drift: any): ClusterKey {
  const service = drift.service || 'unknown';
  const driftType = drift.driftType || 'unknown';
  
  // Extract high-level pattern from fingerprint
  // fingerprintBroad is already a high-level pattern (e.g., 'kubectl-command', 'deployment-steps')
  const fingerprintPattern = drift.fingerprintBroad || 'generic';
  
  return {
    service,
    driftType,
    fingerprintPattern,
  };
}

/**
 * Find or create a cluster for the given drift
 * Returns existing pending cluster or creates a new one
 */
export async function findOrCreateCluster(
  workspaceId: string,
  clusterKey: ClusterKey,
  config: ClusterConfig = DEFAULT_CONFIG
): Promise<DriftClusterData> {
  // Try to find existing pending cluster
  const existingCluster = await prisma.driftCluster.findFirst({
    where: {
      workspaceId,
      service: clusterKey.service,
      driftType: clusterKey.driftType,
      fingerprintPattern: clusterKey.fingerprintPattern,
      status: 'pending',
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existingCluster) {
    console.log(`[Clustering] Found existing cluster: ${existingCluster.id}, driftCount=${existingCluster.driftCount}`);
    return existingCluster as DriftClusterData;
  }

  // Create new cluster
  const newCluster = await prisma.driftCluster.create({
    data: {
      workspaceId,
      service: clusterKey.service,
      driftType: clusterKey.driftType,
      fingerprintPattern: clusterKey.fingerprintPattern,
      status: 'pending',
      driftCount: 0,
      driftIds: [],
    },
  });

  console.log(`[Clustering] Created new cluster: ${newCluster.id}`);
  return newCluster as DriftClusterData;
}

/**
 * Add drift to cluster
 * Updates cluster metadata and drift candidate
 */
export async function addDriftToCluster(
  workspaceId: string,
  driftId: string,
  clusterId: string
): Promise<void> {
  // Update cluster: increment count, add drift ID
  const cluster = await prisma.driftCluster.findUnique({
    where: { workspaceId_id: { workspaceId, id: clusterId } },
  });

  if (!cluster) {
    throw new Error(`Cluster not found: ${clusterId}`);
  }

  const updatedDriftIds = [...cluster.driftIds, driftId];
  const updatedCount = cluster.driftCount + 1;

  await prisma.driftCluster.update({
    where: { workspaceId_id: { workspaceId, id: clusterId } },
    data: {
      driftCount: updatedCount,
      driftIds: updatedDriftIds,
    },
  });

  // Update drift candidate: set clusterId
  await prisma.driftCandidate.update({
    where: { workspaceId_id: { workspaceId, id: driftId } },
    data: { clusterId },
  });

  console.log(`[Clustering] Added drift ${driftId} to cluster ${clusterId}, new count=${updatedCount}`);
}

/**
 * Check if cluster should be notified
 * Returns true if cluster meets notification criteria
 */
export function shouldNotifyCluster(
  cluster: DriftClusterData,
  config: ClusterConfig = DEFAULT_CONFIG
): { shouldNotify: boolean; reason: string } {
  // Check if cluster has reached minimum size
  if (cluster.driftCount >= config.notifyOnCount) {
    return {
      shouldNotify: true,
      reason: `count_threshold (${cluster.driftCount} >= ${config.notifyOnCount})`,
    };
  }

  // Check if cluster has expired (time window)
  if (config.notifyOnExpiry) {
    const now = new Date();
    const createdAt = new Date(cluster.createdAt);
    const ageMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);

    if (ageMinutes >= config.timeWindowMinutes) {
      return {
        shouldNotify: true,
        reason: `time_expiry (${ageMinutes.toFixed(0)}min >= ${config.timeWindowMinutes}min)`,
      };
    }
  }

  return {
    shouldNotify: false,
    reason: `waiting (count=${cluster.driftCount}/${config.notifyOnCount}, age=${Math.floor((Date.now() - cluster.createdAt.getTime()) / 60000)}min/${config.timeWindowMinutes}min)`,
  };
}

/**
 * Close cluster and mark as notified
 * Called after cluster notification is sent
 */
export async function closeCluster(
  workspaceId: string,
  clusterId: string,
  slackChannel: string,
  slackMessageTs: string
): Promise<void> {
  await prisma.driftCluster.update({
    where: { workspaceId_id: { workspaceId, id: clusterId } },
    data: {
      status: 'notified',
      notifiedAt: new Date(),
      closedAt: new Date(),
      slackChannel,
      slackMessageTs,
    },
  });

  console.log(`[Clustering] Closed cluster ${clusterId}, notified to ${slackChannel}`);
}

