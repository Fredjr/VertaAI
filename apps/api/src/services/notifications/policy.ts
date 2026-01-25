/**
 * Notification Routing Policy
 * 
 * Determines how and when to notify users about drift candidates.
 * Uses confidence-based routing with workspace-specific thresholds.
 * 
 * @see IMPLEMENTATION_PLAN.md Section 3.5
 */

import { prisma } from '../../lib/db.js';

export type NotificationChannel = 'dm' | 'team_channel' | 'digest' | 'none';

export interface NotificationDecision {
  shouldNotify: boolean;
  channel: NotificationChannel;
  reason: string;
  target?: string; // Slack channel/user ID
  priority: 'P0' | 'P1' | 'P2';
  delayMinutes?: number; // For batching low-priority notifications
}

export interface NotificationInput {
  workspaceId: string;
  driftId: string;
  confidence: number;
  riskLevel?: 'low' | 'medium' | 'high';
  ownerSlackId: string | null;
  ownerChannel?: string | null;
}

/**
 * Determine how to notify about a drift candidate.
 * Uses workspace thresholds and rate limiting.
 */
export async function determineNotificationRoute(
  input: NotificationInput
): Promise<NotificationDecision> {
  // Load workspace notification thresholds
  const workspace = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
  });

  if (!workspace) {
    return {
      shouldNotify: false,
      channel: 'none',
      reason: 'Workspace not found',
      priority: 'P2',
    };
  }

  const highThreshold = workspace.highConfidenceThreshold || 0.70;
  const mediumThreshold = workspace.mediumConfidenceThreshold || 0.55;

  // Check rate limits (10 notifications per hour per workspace)
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentNotifications = await prisma.patchProposal.count({
    where: {
      workspaceId: input.workspaceId,
      lastNotifiedAt: { gte: hourAgo },
    },
  });

  if (recentNotifications >= 10) {
    return {
      shouldNotify: false,
      channel: 'digest',
      reason: 'Rate limit: 10 notifications/hour exceeded',
      priority: 'P2',
      delayMinutes: 60,
    };
  }

  // P0: High confidence (≥70%) → DM to owner immediately
  if (input.confidence >= highThreshold) {
    return {
      shouldNotify: true,
      channel: input.ownerSlackId ? 'dm' : 'team_channel',
      target: input.ownerSlackId || workspace.defaultOwnerRef || undefined,
      reason: `High confidence (${(input.confidence * 100).toFixed(0)}%) → immediate notification`,
      priority: 'P0',
    };
  }

  // P1: Medium confidence (55-69%) → Team channel
  if (input.confidence >= mediumThreshold) {
    return {
      shouldNotify: true,
      channel: 'team_channel',
      target: input.ownerChannel || workspace.defaultOwnerRef || undefined,
      reason: `Medium confidence (${(input.confidence * 100).toFixed(0)}%) → team channel`,
      priority: 'P1',
    };
  }

  // P2: Low confidence (<55%) → Batch for weekly digest
  return {
    shouldNotify: false,
    channel: 'digest',
    reason: `Low confidence (${(input.confidence * 100).toFixed(0)}%) → weekly digest`,
    priority: 'P2',
    delayMinutes: 7 * 24 * 60, // 1 week
  };
}

/**
 * Check if a drift should bypass normal routing (e.g., high risk).
 */
export function shouldEscalate(
  riskLevel: 'low' | 'medium' | 'high' | undefined,
  impactedDomains: string[]
): boolean {
  // Always escalate high-risk drifts
  if (riskLevel === 'high') return true;

  // Escalate if deployment or rollback domain is affected
  const criticalDomains = ['deployment', 'rollback', 'auth'];
  return impactedDomains.some(d => criticalDomains.includes(d));
}

/**
 * Get the appropriate Slack channel for a notification.
 */
export async function getNotificationTarget(
  workspaceId: string,
  service: string | null,
  ownerSlackId: string | null
): Promise<{ type: 'dm' | 'channel'; target: string } | null> {
  if (ownerSlackId) {
    return { type: 'dm', target: ownerSlackId };
  }

  // Try to find owner mapping for the service
  if (service) {
    const mapping = await prisma.ownerMapping.findFirst({
      where: { workspaceId, service },
      orderBy: { createdAt: 'desc' },
    });

    if (mapping) {
      return {
        type: mapping.ownerType === 'slack_user' ? 'dm' : 'channel',
        target: mapping.ownerRef,
      };
    }
  }

  // Fall back to workspace default
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { defaultOwnerType: true, defaultOwnerRef: true },
  });

  if (workspace?.defaultOwnerRef) {
    return {
      type: workspace.defaultOwnerType === 'slack_user' ? 'dm' : 'channel',
      target: workspace.defaultOwnerRef,
    };
  }

  return null;
}

