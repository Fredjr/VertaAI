/**
 * Gap #9: Cluster-First Drift Triage - Interaction Handlers
 * 
 * Handles bulk actions on drift clusters (approve all, reject all, etc.)
 */

import { prisma } from '../../lib/db.js';
import { DriftState } from '../../types/state-machine.js';
import { enqueueJob } from '../queue/qstash.js';

/**
 * Handle "Approve All" action on cluster
 * Approves all drifts in the cluster and enqueues writeback jobs
 */
export async function handleClusterApproveAll(
  workspaceId: string,
  clusterId: string,
  slackUserId: string
): Promise<{ success: boolean; approvedCount: number; error?: string }> {
  console.log(`[ClusterInteractions] Approving all drifts in cluster ${clusterId}`);

  try {
    // Get cluster with all drifts
    const cluster = await prisma.driftCluster.findUnique({
      where: { workspaceId_id: { workspaceId, id: clusterId } },
      include: {
        drifts: {
          include: {
            patchProposals: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!cluster) {
      return { success: false, approvedCount: 0, error: 'Cluster not found' };
    }

    let approvedCount = 0;

    // Approve each drift in the cluster
    for (const drift of cluster.drifts) {
      // Update drift state to APPROVED
      await prisma.driftCandidate.update({
        where: { workspaceId_id: { workspaceId, id: drift.id } },
        data: {
          state: DriftState.APPROVED,
          stateUpdatedAt: new Date(),
        },
      });

      // Create approval record
      const patchProposal = drift.patchProposals[0];
      if (patchProposal) {
        await prisma.approval.create({
          data: {
            workspaceId,
            patchId: patchProposal.id,
            action: 'approve',
            actorSlackId: slackUserId,
          },
        });
      }

      // Enqueue QStash job to continue state machine (APPROVED -> WRITEBACK_VALIDATED -> ...)
      await enqueueJob({
        workspaceId,
        driftId: drift.id,
      });

      approvedCount++;
    }

    // Update cluster status
    await prisma.driftCluster.update({
      where: { workspaceId_id: { workspaceId, id: clusterId } },
      data: {
        bulkActionStatus: 'approved',
        bulkActionAt: new Date(),
        bulkActionBy: slackUserId,
        status: 'closed',
        closedAt: new Date(),
      },
    });

    console.log(`[ClusterInteractions] Approved ${approvedCount} drifts in cluster ${clusterId}`);
    return { success: true, approvedCount };
  } catch (error: any) {
    console.error(`[ClusterInteractions] Error approving cluster: ${error.message}`);
    return { success: false, approvedCount: 0, error: error.message };
  }
}

/**
 * Handle "Reject All" action on cluster
 * Rejects all drifts in the cluster
 */
export async function handleClusterRejectAll(
  workspaceId: string,
  clusterId: string,
  slackUserId: string,
  reason?: string
): Promise<{ success: boolean; rejectedCount: number; error?: string }> {
  console.log(`[ClusterInteractions] Rejecting all drifts in cluster ${clusterId}`);

  try {
    // Get cluster with all drifts
    const cluster = await prisma.driftCluster.findUnique({
      where: { workspaceId_id: { workspaceId, id: clusterId } },
      include: {
        drifts: {
          include: {
            patchProposals: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!cluster) {
      return { success: false, rejectedCount: 0, error: 'Cluster not found' };
    }

    let rejectedCount = 0;

    // Reject each drift in the cluster
    for (const drift of cluster.drifts) {
      // Update drift state to REJECTED
      await prisma.driftCandidate.update({
        where: { workspaceId_id: { workspaceId, id: drift.id } },
        data: {
          state: DriftState.REJECTED,
          stateUpdatedAt: new Date(),
        },
      });

      // Create approval record (rejection)
      const patchProposal = drift.patchProposals[0];
      if (patchProposal) {
        await prisma.approval.create({
          data: {
            workspaceId,
            patchId: patchProposal.id,
            action: 'reject',
            actorSlackId: slackUserId,
            // Note: reason field doesn't exist in Approval model
          },
        });
      }

      rejectedCount++;
    }

    // Update cluster status
    await prisma.driftCluster.update({
      where: { workspaceId_id: { workspaceId, id: clusterId } },
      data: {
        bulkActionStatus: 'rejected',
        bulkActionAt: new Date(),
        bulkActionBy: slackUserId,
        status: 'closed',
        closedAt: new Date(),
      },
    });

    console.log(`[ClusterInteractions] Rejected ${rejectedCount} drifts in cluster ${clusterId}`);
    return { success: true, rejectedCount };
  } catch (error: any) {
    console.error(`[ClusterInteractions] Error rejecting cluster: ${error.message}`);
    return { success: false, rejectedCount: 0, error: error.message };
  }
}

/**
 * Handle "Snooze All" action on cluster
 * Snoozes all drifts in the cluster for 48 hours
 */
export async function handleClusterSnoozeAll(
  workspaceId: string,
  clusterId: string,
  slackUserId: string
): Promise<{ success: boolean; snoozedCount: number; error?: string }> {
  console.log(`[ClusterInteractions] Snoozing all drifts in cluster ${clusterId}`);

  try {
    // Get cluster with all drifts
    const cluster = await prisma.driftCluster.findUnique({
      where: { workspaceId_id: { workspaceId, id: clusterId } },
      include: {
        drifts: {
          include: {
            patchProposals: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!cluster) {
      return { success: false, snoozedCount: 0, error: 'Cluster not found' };
    }

    let snoozedCount = 0;

    // Snooze each drift in the cluster
    for (const drift of cluster.drifts) {
      // Update drift state to SNOOZED
      await prisma.driftCandidate.update({
        where: { workspaceId_id: { workspaceId, id: drift.id } },
        data: {
          state: DriftState.SNOOZED,
          stateUpdatedAt: new Date(),
        },
      });

      // Create approval record (snooze)
      const patchProposal = drift.patchProposals[0];
      if (patchProposal) {
        await prisma.approval.create({
          data: {
            workspaceId,
            patchId: patchProposal.id,
            action: 'snooze',
            actorSlackId: slackUserId,
          },
        });
      }

      snoozedCount++;
    }

    // Update cluster status
    await prisma.driftCluster.update({
      where: { workspaceId_id: { workspaceId, id: clusterId } },
      data: {
        bulkActionStatus: 'snoozed',
        bulkActionAt: new Date(),
        bulkActionBy: slackUserId,
        status: 'closed',
        closedAt: new Date(),
      },
    });

    console.log(`[ClusterInteractions] Snoozed ${snoozedCount} drifts in cluster ${clusterId}`);
    return { success: true, snoozedCount };
  } catch (error: any) {
    console.error(`[ClusterInteractions] Error snoozing cluster: ${error.message}`);
    return { success: false, snoozedCount: 0, error: error.message };
  }
}

/**
 * Handle "Review Individually" action on cluster
 * Sends individual Slack messages for each drift in the cluster
 */
export async function handleClusterReviewIndividually(
  workspaceId: string,
  clusterId: string
): Promise<{ success: boolean; sentCount: number; error?: string }> {
  console.log(`[ClusterInteractions] Sending individual notifications for cluster ${clusterId}`);

  try {
    // Get cluster with all drifts
    const cluster = await prisma.driftCluster.findUnique({
      where: { workspaceId_id: { workspaceId, id: clusterId } },
      include: {
        drifts: true,
      },
    });

    if (!cluster) {
      return { success: false, sentCount: 0, error: 'Cluster not found' };
    }

    let sentCount = 0;

    // Enqueue individual notification jobs for each drift
    for (const drift of cluster.drifts) {
      // Reset drift to PATCH_VALIDATED state to trigger individual notification
      await prisma.driftCandidate.update({
        where: { workspaceId_id: { workspaceId, id: drift.id } },
        data: {
          state: DriftState.PATCH_VALIDATED,
          stateUpdatedAt: new Date(),
          clusterId: null, // Remove from cluster
        },
      });

      // Enqueue job to send individual notification
      await enqueueJob({
        workspaceId,
        driftId: drift.id,
      });

      sentCount++;
    }

    // Update cluster status
    await prisma.driftCluster.update({
      where: { workspaceId_id: { workspaceId, id: clusterId } },
      data: {
        bulkActionStatus: 'review_individually',
        bulkActionAt: new Date(),
        status: 'closed',
        closedAt: new Date(),
      },
    });

    console.log(`[ClusterInteractions] Sent ${sentCount} individual notifications for cluster ${clusterId}`);
    return { success: true, sentCount };
  } catch (error: any) {
    console.error(`[ClusterInteractions] Error sending individual notifications: ${error.message}`);
    return { success: false, sentCount: 0, error: error.message };
  }
}

