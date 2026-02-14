// Artifact Fetching Telemetry
// Phase 1 Week 3-4: Metrics and logging for artifact fetching

import type { ArtifactSnapshot, ArtifactSystem } from './types.js';

/**
 * Artifact fetching metrics
 */
export interface ArtifactFetchMetrics {
  workspaceId: string;
  signalEventId: string;
  contractId: string;
  totalArtifacts: number;
  successfulFetches: number;
  failedFetches: number;
  cacheHits: number;
  cacheMisses: number;
  fetchTimeMs: number;
  totalSizeBytes: number;
  fetchesBySystem: Record<ArtifactSystem, number>;
  fetchTimeBySystem: Record<ArtifactSystem, number>;
  snapshotIds: string[];
}

/**
 * Calculate artifact fetching metrics
 */
export function calculateArtifactMetrics(
  workspaceId: string,
  signalEventId: string,
  contractId: string,
  snapshots: Array<ArtifactSnapshot | null>,
  cacheHits: number,
  fetchTimeMs: number
): ArtifactFetchMetrics {
  const validSnapshots = snapshots.filter((s): s is ArtifactSnapshot => s !== null);
  
  const totalSizeBytes = validSnapshots.reduce((sum, s) => sum + s.sizeBytes, 0);
  
  // Count fetches by system
  const fetchesBySystem: Record<string, number> = {};
  validSnapshots.forEach(s => {
    const system = s.artifactRef.system;
    fetchesBySystem[system] = (fetchesBySystem[system] || 0) + 1;
  });

  // For now, we don't have per-system timing, so we'll distribute evenly
  const fetchTimeBySystem: Record<string, number> = {};
  Object.keys(fetchesBySystem).forEach(system => {
    const count = fetchesBySystem[system];
    if (count !== undefined) {
      fetchTimeBySystem[system] = Math.floor(fetchTimeMs / validSnapshots.length) * count;
    }
  });

  return {
    workspaceId,
    signalEventId,
    contractId,
    totalArtifacts: snapshots.length,
    successfulFetches: validSnapshots.length,
    failedFetches: snapshots.length - validSnapshots.length,
    cacheHits,
    cacheMisses: validSnapshots.length - cacheHits,
    fetchTimeMs,
    totalSizeBytes,
    fetchesBySystem: fetchesBySystem as Record<ArtifactSystem, number>,
    fetchTimeBySystem: fetchTimeBySystem as Record<ArtifactSystem, number>,
    snapshotIds: validSnapshots.map(s => s.id),
  };
}

/**
 * Log artifact fetching metrics (structured JSON)
 */
export function logArtifactMetrics(metrics: ArtifactFetchMetrics): void {
  console.log('[ArtifactTelemetry] Metrics:', JSON.stringify(metrics, null, 2));
}

/**
 * Log artifact fetching details (verbose)
 */
export function logArtifactDetails(
  snapshots: Array<ArtifactSnapshot | null>,
  verbose: boolean = false
): void {
  if (!verbose) {
    return;
  }

  console.log('[ArtifactTelemetry] Snapshot Details:');
  
  snapshots.forEach((snapshot, index) => {
    if (!snapshot) {
      console.log(`  ${index + 1}. ❌ FAILED`);
      return;
    }

    const ageMs = Date.now() - snapshot.createdAt.getTime();
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    const expiresInDays = snapshot.ttlDays - ageDays;
    
    console.log(`  ${index + 1}. ✅ ${snapshot.artifactType}`);
    console.log(`     System: ${snapshot.artifactRef.system}`);
    console.log(`     Version: ${snapshot.version.type} = ${snapshot.version.value}`);
    console.log(`     Size: ${snapshot.sizeBytes} bytes`);
    console.log(`     Age: ${ageDays} days (expires in ${expiresInDays} days)`);
    console.log(`     Snapshot ID: ${snapshot.id}`);
  });
}

/**
 * Calculate cache hit rate
 */
export function calculateCacheHitRate(cacheHits: number, totalFetches: number): string {
  if (totalFetches === 0) {
    return '0.0%';
  }
  return `${((cacheHits / totalFetches) * 100).toFixed(1)}%`;
}

/**
 * Calculate average fetch time per artifact
 */
export function calculateAvgFetchTime(totalTimeMs: number, totalArtifacts: number): number {
  if (totalArtifacts === 0) {
    return 0;
  }
  return Math.floor(totalTimeMs / totalArtifacts);
}

/**
 * Format size in human-readable format
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

/**
 * Log summary statistics
 */
export function logSummaryStats(metrics: ArtifactFetchMetrics): void {
  const cacheHitRate = calculateCacheHitRate(metrics.cacheHits, metrics.totalArtifacts);
  const avgFetchTime = calculateAvgFetchTime(metrics.fetchTimeMs, metrics.successfulFetches);
  const formattedSize = formatSize(metrics.totalSizeBytes);

  console.log('[ArtifactTelemetry] Summary:');
  console.log(`  Total artifacts: ${metrics.totalArtifacts}`);
  console.log(`  Successful: ${metrics.successfulFetches}`);
  console.log(`  Failed: ${metrics.failedFetches}`);
  console.log(`  Cache hit rate: ${cacheHitRate}`);
  console.log(`  Total fetch time: ${metrics.fetchTimeMs}ms`);
  console.log(`  Avg fetch time: ${avgFetchTime}ms per artifact`);
  console.log(`  Total size: ${formattedSize}`);
  console.log(`  Fetches by system:`, metrics.fetchesBySystem);
}

