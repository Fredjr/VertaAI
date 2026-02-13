/**
 * Tests for Temporal Drift Accumulation Service (Phase 5)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '../../lib/db.js';
import {
  getOrCreateDriftHistory,
  recordDrift,
  checkBundlingThreshold,
  bundleDrifts,
  ACCUMULATION_WINDOW_DAYS,
  BUNDLING_THRESHOLD_COUNT,
  BUNDLING_THRESHOLD_MATERIALITY,
} from '../../services/temporal/accumulation.js';

// Mock Prisma
vi.mock('../../lib/db.js', () => ({
  prisma: {
    driftHistory: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    driftCandidate: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe('Temporal Drift Accumulation', () => {
  const workspaceId = 'test-workspace';
  const docSystem = 'confluence';
  const docId = 'doc-123';
  const docTitle = 'Test Documentation';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOrCreateDriftHistory', () => {
    it('should return existing active drift history if found', async () => {
      const existingHistory = {
        id: 'history-1',
        workspaceId,
        docSystem,
        docId,
        docTitle,
        windowStart: new Date('2026-02-10'),
        windowEnd: new Date('2026-02-17'),
        driftCount: 2,
        skippedDriftCount: 1,
        totalMateriality: 0.8,
        averageMateriality: 0.27,
        driftTypeBreakdown: [{ driftType: 'instruction', count: 3 }],
        accumulatedDriftIds: ['drift-1', 'drift-2', 'drift-3'],
        status: 'accumulating',
      };

      (prisma.driftHistory.findFirst as any).mockResolvedValue(existingHistory);

      const result = await getOrCreateDriftHistory(workspaceId, docSystem, docId, docTitle);

      expect(result).toEqual(existingHistory);
      expect(prisma.driftHistory.findFirst).toHaveBeenCalledWith({
        where: {
          workspaceId,
          docSystem,
          docId,
          status: 'accumulating',
          windowStart: { gte: expect.any(Date) },
        },
        orderBy: { windowStart: 'desc' },
      });
    });

    it('should create new drift history if no active window exists', async () => {
      (prisma.driftHistory.findFirst as any).mockResolvedValue(null);

      const newHistory = {
        id: 'history-new',
        workspaceId,
        docSystem,
        docId,
        docTitle,
        windowStart: new Date(),
        windowEnd: new Date(Date.now() + ACCUMULATION_WINDOW_DAYS * 24 * 60 * 60 * 1000),
        driftCount: 0,
        skippedDriftCount: 0,
        totalMateriality: 0,
        averageMateriality: 0,
        driftTypeBreakdown: [],
        accumulatedDriftIds: [],
        status: 'accumulating',
      };

      (prisma.driftHistory.create as any).mockResolvedValue(newHistory);

      const result = await getOrCreateDriftHistory(workspaceId, docSystem, docId, docTitle);

      expect(result).toEqual(newHistory);
      expect(prisma.driftHistory.create).toHaveBeenCalledWith({
        data: {
          workspaceId,
          docSystem,
          docId,
          docTitle,
          windowStart: expect.any(Date),
          windowEnd: expect.any(Date),
          status: 'accumulating',
          driftTypeBreakdown: [],
          accumulatedDriftIds: [],
        },
      });
    });

    it('should respect custom window duration', async () => {
      (prisma.driftHistory.findFirst as any).mockResolvedValue(null);
      (prisma.driftHistory.create as any).mockResolvedValue({
        id: 'history-custom',
        windowStart: new Date(),
        windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      });

      await getOrCreateDriftHistory(workspaceId, docSystem, docId, docTitle, {
        windowDurationDays: 14,
      });

      expect(prisma.driftHistory.create).toHaveBeenCalled();
    });
  });

  describe('recordDrift', () => {
    it('should record a non-skipped drift and update metrics', async () => {
      const existingHistory = {
        id: 'history-1',
        workspaceId,
        driftCount: 2,
        skippedDriftCount: 1,
        totalMateriality: 0.8,
        averageMateriality: 0.27,
        driftTypeBreakdown: [{ driftType: 'instruction', count: 2 }],
        accumulatedDriftIds: ['drift-1', 'drift-2'],
      };

      (prisma.driftHistory.findUnique as any).mockResolvedValue(existingHistory);

      const updatedHistory = {
        ...existingHistory,
        driftCount: 3,
        totalMateriality: 1.2,
        averageMateriality: 0.3,
        driftTypeBreakdown: [{ driftType: 'instruction', count: 3 }],
        accumulatedDriftIds: ['drift-1', 'drift-2', 'drift-3'],
      };

      (prisma.driftHistory.update as any).mockResolvedValue(updatedHistory);

      const result = await recordDrift(workspaceId, 'history-1', 'drift-3', 'instruction', 0.4, false);

      expect(result.driftCount).toBe(3);
      expect(result.totalMateriality).toBe(1.2);
      expect(result.accumulatedDriftIds).toContain('drift-3');
    });

    it('should record a skipped drift without incrementing driftCount', async () => {
      const existingHistory = {
        id: 'history-1',
        workspaceId,
        driftCount: 2,
        skippedDriftCount: 1,
        totalMateriality: 0.8,
        averageMateriality: 0.27,
        driftTypeBreakdown: [{ driftType: 'instruction', count: 2 }],
        accumulatedDriftIds: ['drift-1', 'drift-2'],
      };

      (prisma.driftHistory.findUnique as any).mockResolvedValue(existingHistory);

      const updatedHistory = {
        ...existingHistory,
        driftCount: 2, // Should NOT increment
        skippedDriftCount: 2, // Should increment
        totalMateriality: 1.0,
        averageMateriality: 0.25,
        accumulatedDriftIds: ['drift-1', 'drift-2', 'drift-3'],
      };

      (prisma.driftHistory.update as any).mockResolvedValue(updatedHistory);

      const result = await recordDrift(workspaceId, 'history-1', 'drift-3', 'instruction', 0.2, true);

      expect(result.driftCount).toBe(2); // Not incremented
      expect(result.skippedDriftCount).toBe(2); // Incremented
    });
  });

  describe('checkBundlingThreshold', () => {
    it('should return true when drift count threshold is reached', async () => {
      const history = {
        id: 'history-1',
        workspaceId,
        status: 'accumulating',
        driftCount: 3,
        skippedDriftCount: 2,
        totalMateriality: 1.0,
        windowEnd: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      };

      (prisma.driftHistory.findUnique as any).mockResolvedValue(history);

      const result = await checkBundlingThreshold(workspaceId, 'history-1');

      expect(result.shouldBundle).toBe(true);
      expect(result.trigger).toBe('threshold_reached');
    });

    it('should return true when materiality threshold is reached', async () => {
      const history = {
        id: 'history-1',
        workspaceId,
        status: 'accumulating',
        driftCount: 2,
        skippedDriftCount: 1,
        totalMateriality: 1.6, // Above default threshold of 1.5
        windowEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      (prisma.driftHistory.findUnique as any).mockResolvedValue(history);

      const result = await checkBundlingThreshold(workspaceId, 'history-1');

      expect(result.shouldBundle).toBe(true);
      expect(result.trigger).toBe('threshold_reached');
    });

    it('should return false when no thresholds are met', async () => {
      const history = {
        id: 'history-1',
        workspaceId,
        status: 'accumulating',
        driftCount: 2,
        skippedDriftCount: 1,
        totalMateriality: 0.8,
        windowEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      (prisma.driftHistory.findUnique as any).mockResolvedValue(history);

      const result = await checkBundlingThreshold(workspaceId, 'history-1');

      expect(result.shouldBundle).toBe(false);
    });
  });

  describe('bundleDrifts', () => {
    it('should create bundled drift candidate and mark history as bundled', async () => {
      const history = {
        id: 'history-1',
        workspaceId,
        status: 'accumulating',
        accumulatedDriftIds: ['drift-1', 'drift-2', 'drift-3'],
        averageMateriality: 0.35,
        driftTypeBreakdown: [{ driftType: 'instruction', count: 3 }],
      };

      const drifts = [
        {
          id: 'drift-1',
          workspaceId,
          signalEventId: 'signal-1',
          sourceType: 'github_pr',
          service: 'api-service',
          repo: 'org/repo',
          driftType: 'instruction',
          driftDomains: ['deployment'],
          evidenceSummary: 'Changed kubectl command',
          baselineFindings: [{ typedDeltas: [{ artifactType: 'command', action: 'changed' }] }],
          signalEvent: {},
        },
        {
          id: 'drift-2',
          workspaceId,
          signalEventId: 'signal-2',
          sourceType: 'github_pr',
          service: 'api-service',
          repo: 'org/repo',
          driftType: 'instruction',
          driftDomains: ['deployment'],
          evidenceSummary: 'Updated config key',
          baselineFindings: [{ typedDeltas: [{ artifactType: 'configKey', action: 'changed' }] }],
          signalEvent: {},
        },
        {
          id: 'drift-3',
          workspaceId,
          signalEventId: 'signal-3',
          sourceType: 'github_pr',
          service: 'api-service',
          repo: 'org/repo',
          driftType: 'instruction',
          driftDomains: ['deployment'],
          evidenceSummary: 'Added new tool',
          baselineFindings: [{ typedDeltas: [{ artifactType: 'tool', action: 'added' }] }],
          signalEvent: {},
        },
      ];

      (prisma.driftHistory.findUnique as any).mockResolvedValue(history);
      (prisma.driftCandidate.findMany as any).mockResolvedValue(drifts);
      (prisma.driftCandidate.create as any).mockResolvedValue({
        id: 'bundled-drift-1',
        workspaceId,
      });
      (prisma.driftHistory.update as any).mockResolvedValue({
        ...history,
        status: 'bundled',
        bundledDriftId: 'bundled-drift-1',
      });

      const bundledDriftId = await bundleDrifts(workspaceId, 'history-1', 'threshold_reached');

      expect(bundledDriftId).toBe('bundled-drift-1');
      expect(prisma.driftCandidate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId,
          state: 'BASELINE_CHECKED',
          evidenceSummary: expect.stringContaining('Bundled drift from 3 accumulated changes'),
          comparisonResult: expect.objectContaining({
            bundled: true,
            bundledFrom: ['drift-1', 'drift-2', 'drift-3'],
            bundleTrigger: 'threshold_reached',
            totalDrifts: 3,
          }),
        }),
      });
      expect(prisma.driftHistory.update).toHaveBeenCalledWith({
        where: { workspaceId_id: { workspaceId, id: 'history-1' } },
        data: {
          status: 'bundled',
          bundledAt: expect.any(Date),
          bundledDriftId: 'bundled-drift-1',
          bundleTrigger: 'threshold_reached',
        },
      });
    });
  });
});
