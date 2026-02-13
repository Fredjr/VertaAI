/**
 * Temporal Drift Accumulation Service (Phase 5)
 * 
 * Tracks cumulative drift per document over time windows.
 * Bundles multiple small drifts into comprehensive updates when thresholds are reached.
 */

import { prisma } from '../../lib/db.js';
import type { TypedDelta } from '../baseline/types.js';

// Configuration constants
export const ACCUMULATION_WINDOW_DAYS = 7; // Default accumulation window
export const BUNDLING_THRESHOLD_COUNT = 5; // Bundle after N drifts
export const BUNDLING_THRESHOLD_MATERIALITY = 1.5; // Bundle when total materiality >= threshold

export interface DriftHistoryRecord {
  id: string;
  docSystem: string;
  docId: string;
  docTitle: string;
  windowStart: Date;
  windowEnd: Date;
  driftCount: number;
  skippedDriftCount: number;
  totalMateriality: number;
  averageMateriality: number;
  driftTypeBreakdown: Array<{ driftType: string; count: number }>;
  accumulatedDriftIds: string[];
  status: 'accumulating' | 'bundled' | 'expired';
  bundledAt?: Date;
  bundledDriftId?: string;
  bundleTrigger?: 'threshold_reached' | 'manual' | 'window_expired';
}

export interface AccumulationConfig {
  windowDurationDays?: number;
  bundlingThresholdCount?: number;
  bundlingThresholdMateriality?: number;
}

/**
 * Get or create an active drift history window for a document
 */
export async function getOrCreateDriftHistory(
  workspaceId: string,
  docSystem: string,
  docId: string,
  docTitle: string,
  config: AccumulationConfig = {}
): Promise<DriftHistoryRecord> {
  const windowDurationDays = config.windowDurationDays ?? ACCUMULATION_WINDOW_DAYS;
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDurationDays * 24 * 60 * 60 * 1000);

  // Try to find an active window for this document
  const existing = await prisma.driftHistory.findFirst({
    where: {
      workspaceId,
      docSystem,
      docId,
      status: 'accumulating',
      windowStart: { gte: windowStart },
    },
    orderBy: { windowStart: 'desc' },
  });

  if (existing) {
    return existing as unknown as DriftHistoryRecord;
  }

  // Create a new accumulation window
  const newHistory = await prisma.driftHistory.create({
    data: {
      workspaceId,
      docSystem,
      docId,
      docTitle,
      windowStart: now,
      windowEnd: new Date(now.getTime() + windowDurationDays * 24 * 60 * 60 * 1000),
      status: 'accumulating',
      driftTypeBreakdown: [],
      accumulatedDriftIds: [],
    },
  });

  return newHistory as unknown as DriftHistoryRecord;
}

/**
 * Record a drift in the accumulation window
 */
export async function recordDrift(
  workspaceId: string,
  historyId: string,
  driftId: string,
  driftType: string,
  materialityScore: number,
  wasSkipped: boolean
): Promise<DriftHistoryRecord> {
  const history = await prisma.driftHistory.findUnique({
    where: {
      workspaceId_id: { workspaceId, id: historyId },
    },
  });

  if (!history) {
    throw new Error(`DriftHistory ${historyId} not found`);
  }

  // Update drift type breakdown
  const breakdown = (history.driftTypeBreakdown as Array<{ driftType: string; count: number }>) || [];
  const existingType = breakdown.find((b) => b.driftType === driftType);
  if (existingType) {
    existingType.count += 1;
  } else {
    breakdown.push({ driftType, count: 1 });
  }

  // Update metrics
  const newDriftCount = history.driftCount + (wasSkipped ? 0 : 1);
  const newSkippedCount = history.skippedDriftCount + (wasSkipped ? 1 : 0);
  const newTotalMateriality = history.totalMateriality + materialityScore;
  const newAverageMateriality = newTotalMateriality / (newDriftCount + newSkippedCount);

  // Add drift ID to accumulated list
  const accumulatedIds = [...history.accumulatedDriftIds, driftId];

  const updated = await prisma.driftHistory.update({
    where: {
      workspaceId_id: { workspaceId, id: historyId },
    },
    data: {
      driftCount: newDriftCount,
      skippedDriftCount: newSkippedCount,
      totalMateriality: newTotalMateriality,
      averageMateriality: newAverageMateriality,
      driftTypeBreakdown: breakdown,
      accumulatedDriftIds: accumulatedIds,
    },
  });

  return updated as unknown as DriftHistoryRecord;
}

/**
 * Check if bundling threshold has been reached
 */
export async function checkBundlingThreshold(
  workspaceId: string,
  historyId: string,
  config: AccumulationConfig = {}
): Promise<{ shouldBundle: boolean; trigger?: 'threshold_reached' | 'window_expired' }> {
  const thresholdCount = config.bundlingThresholdCount ?? BUNDLING_THRESHOLD_COUNT;
  const thresholdMateriality = config.bundlingThresholdMateriality ?? BUNDLING_THRESHOLD_MATERIALITY;

  const history = await prisma.driftHistory.findUnique({
    where: {
      workspaceId_id: { workspaceId, id: historyId },
    },
  });

  if (!history || history.status !== 'accumulating') {
    return { shouldBundle: false };
  }

  // Check count threshold
  if (history.driftCount + history.skippedDriftCount >= thresholdCount) {
    return { shouldBundle: true, trigger: 'threshold_reached' };
  }

  // Check materiality threshold
  if (history.totalMateriality >= thresholdMateriality) {
    return { shouldBundle: true, trigger: 'threshold_reached' };
  }

  // Check if window has expired
  const now = new Date();
  if (now >= history.windowEnd) {
    // Only bundle if we have at least 2 drifts
    if (history.driftCount + history.skippedDriftCount >= 2) {
      return { shouldBundle: true, trigger: 'window_expired' };
    }
  }

  return { shouldBundle: false };
}

/**
 * Bundle accumulated drifts into a single comprehensive drift candidate
 * Returns the ID of the bundled drift candidate
 */
export async function bundleDrifts(
  workspaceId: string,
  historyId: string,
  trigger: 'threshold_reached' | 'manual' | 'window_expired'
): Promise<string> {
  const history = await prisma.driftHistory.findUnique({
    where: {
      workspaceId_id: { workspaceId, id: historyId },
    },
  });

  if (!history || history.status !== 'accumulating') {
    throw new Error(`DriftHistory ${historyId} is not in accumulating state`);
  }

  if (history.accumulatedDriftIds.length === 0) {
    throw new Error(`DriftHistory ${historyId} has no accumulated drifts to bundle`);
  }

  // Fetch all accumulated drift candidates
  const drifts = await prisma.driftCandidate.findMany({
    where: {
      workspaceId,
      id: { in: history.accumulatedDriftIds },
    },
    include: {
      signalEvent: true,
    },
  });

  if (drifts.length === 0) {
    throw new Error(`No drift candidates found for accumulated IDs`);
  }

  // Create a bundled drift candidate
  // Use the first drift as the base, but aggregate evidence from all drifts
  const firstDrift = drifts[0];
  if (!firstDrift) {
    throw new Error(`No first drift found in accumulated drifts`);
  }

  const allTypedDeltas: TypedDelta[] = [];
  const allEvidenceSummaries: string[] = [];

  for (const drift of drifts) {
    // Extract typed deltas from baselineFindings
    if (drift.baselineFindings && Array.isArray(drift.baselineFindings)) {
      for (const finding of drift.baselineFindings as any[]) {
        if (finding.typedDeltas && Array.isArray(finding.typedDeltas)) {
          allTypedDeltas.push(...finding.typedDeltas);
        }
      }
    }

    // Collect evidence summaries
    if (drift.evidenceSummary) {
      allEvidenceSummaries.push(drift.evidenceSummary);
    }
  }

  // Create bundled drift candidate
  const bundledDrift = await prisma.driftCandidate.create({
    data: {
      workspaceId,
      signalEventId: firstDrift.signalEventId,
      sourceType: firstDrift.sourceType,
      service: firstDrift.service,
      repo: firstDrift.repo,
      driftType: firstDrift.driftType,
      driftDomains: firstDrift.driftDomains,
      evidenceSummary: `Bundled drift from ${drifts.length} accumulated changes:\n\n${allEvidenceSummaries.join('\n\n')}`,
      confidence: history.averageMateriality, // Use average materiality as confidence
      state: 'BASELINE_CHECKED', // Start at BASELINE_CHECKED to skip re-analysis
      stateUpdatedAt: new Date(),
      // Store bundled metadata in comparisonResult JSON field
      comparisonResult: {
        bundled: true,
        bundledFrom: history.accumulatedDriftIds,
        bundleTrigger: trigger,
        bundledAt: new Date().toISOString(),
        totalDrifts: drifts.length,
        driftTypeBreakdown: history.driftTypeBreakdown,
      },
    },
  });

  // Mark history as bundled
  await prisma.driftHistory.update({
    where: {
      workspaceId_id: { workspaceId, id: historyId },
    },
    data: {
      status: 'bundled',
      bundledAt: new Date(),
      bundledDriftId: bundledDrift.id,
      bundleTrigger: trigger,
    },
  });

  console.log(`[Temporal] Bundled ${drifts.length} drifts into ${bundledDrift.id} (trigger: ${trigger})`);

  return bundledDrift.id;
}

