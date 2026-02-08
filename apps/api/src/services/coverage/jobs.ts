// Coverage Snapshot Jobs
// Phase 3: Week 6 - Scheduled jobs for daily coverage snapshots
// Uses QStash for reliable scheduling

import { prisma } from '../../lib/db.js';
import { calculateCoverageMetrics } from './calculator.js';
import { createCoverageSnapshot } from './manager.js';
import { CoverageObligationConfig } from './types.js';

/**
 * Daily coverage snapshot job
 * Runs once per day for each workspace to capture coverage metrics
 */
export async function runDailyCoverageSnapshot(workspaceId: string) {
  console.log(`[Coverage] Running daily snapshot for workspace ${workspaceId}`);
  
  try {
    // Calculate metrics for the last 24 hours
    const metrics = await calculateCoverageMetrics({
      workspaceId,
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endDate: new Date(),
    });
    
    // Get workspace-specific obligations or use defaults
    const obligations: CoverageObligationConfig = {
      mappingCoverageMin: 0.8, // 80% of services/repos should have doc mappings
      processingCoverageMin: 0.7, // 70% of signals should create drift candidates
      sourceHealthMin: 70, // Average source health score should be 70+
    };
    
    // Create snapshot
    const snapshot = await createCoverageSnapshot({
      workspaceId,
      metrics,
      obligations,
    });
    
    console.log(
      `[Coverage] Snapshot created: ${snapshot.id} (mapping: ${snapshot.mappingCoveragePercent.toFixed(1)}%, processing: ${snapshot.processingCoveragePercent.toFixed(1)}%)`
    );
    
    // Check for alerts
    const obligationsStatus = snapshot.obligationsStatus as any;
    const unmetObligations = Object.entries(obligationsStatus).filter(
      ([_, o]: any) => !o.met
    );
    
    if (unmetObligations.length > 0) {
      console.warn(
        `[Coverage] ${unmetObligations.length} obligations not met for workspace ${workspaceId}`
      );
      for (const [key, obligation] of unmetObligations) {
        const o = obligation as any;
        console.warn(
          `  - ${key}: ${(o.actual * 100).toFixed(1)}% (expected: ${(o.threshold * 100).toFixed(1)}%) [${o.severity}]`
        );
      }
    }
    
    return snapshot;
  } catch (error) {
    console.error(
      `[Coverage] Error running daily snapshot for workspace ${workspaceId}:`,
      error
    );
    throw error;
  }
}

/**
 * Run daily snapshots for all active workspaces
 * This is the main job that should be scheduled with QStash
 */
export async function runDailyCoverageSnapshotsForAllWorkspaces() {
  console.log('[Coverage] Running daily snapshots for all workspaces');
  
  try {
    // Get all active workspaces
    const workspaces = await prisma.workspace.findMany({
      select: { id: true, name: true },
    });
    
    console.log(`[Coverage] Found ${workspaces.length} workspaces`);
    
    const results = [];
    for (const workspace of workspaces) {
      try {
        const snapshot = await runDailyCoverageSnapshot(workspace.id);
        results.push({ workspaceId: workspace.id, success: true, snapshot });
      } catch (error) {
        console.error(
          `[Coverage] Failed to create snapshot for workspace ${workspace.id}:`,
          error
        );
        results.push({ workspaceId: workspace.id, success: false, error });
      }
    }
    
    const successCount = results.filter((r) => r.success).length;
    console.log(
      `[Coverage] Completed daily snapshots: ${successCount}/${workspaces.length} successful`
    );
    
    return results;
  } catch (error) {
    console.error('[Coverage] Error running daily snapshots:', error);
    throw error;
  }
}

/**
 * Schedule daily coverage snapshot job with QStash
 * This should be called once during app initialization
 */
export async function scheduleDailyCoverageSnapshots() {
  // QStash scheduling will be implemented in a separate PR
  // For now, this is a placeholder
  console.log('[Coverage] Daily snapshot scheduling not yet implemented');
  console.log('[Coverage] To run manually, call runDailyCoverageSnapshotsForAllWorkspaces()');
}

