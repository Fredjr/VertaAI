// Evidence Bundle Retention Policy Service
// Phase 4 Week 8 Days 39-40: Implement retention policies for evidence bundles

import { prisma } from '../../lib/db.js';
import { Prisma } from '@prisma/client';

/**
 * Retention policy configuration
 */
export interface RetentionPolicy {
  workspaceId: string;
  evidenceBundleRetentionDays: number; // How long to keep evidence bundles
  auditLogRetentionDays: number; // How long to keep audit logs
  complianceLogRetentionDays: number; // How long to keep compliance-tagged logs
  enableAutoCleanup: boolean; // Whether to automatically delete expired data
}

/**
 * Default retention policies by compliance framework
 */
export const DEFAULT_RETENTION_POLICIES: Record<string, Partial<RetentionPolicy>> = {
  SOX: {
    evidenceBundleRetentionDays: 2555, // 7 years (SOX requirement)
    auditLogRetentionDays: 2555,
    complianceLogRetentionDays: 2555,
    enableAutoCleanup: false, // Manual review required for SOX
  },
  SOC2: {
    evidenceBundleRetentionDays: 365, // 1 year minimum
    auditLogRetentionDays: 365,
    complianceLogRetentionDays: 730, // 2 years for compliance logs
    enableAutoCleanup: true,
  },
  ISO27001: {
    evidenceBundleRetentionDays: 365, // 1 year minimum
    auditLogRetentionDays: 365,
    complianceLogRetentionDays: 730,
    enableAutoCleanup: true,
  },
  GDPR: {
    evidenceBundleRetentionDays: 90, // Minimize data retention (GDPR principle)
    auditLogRetentionDays: 365, // 1 year for security logs
    complianceLogRetentionDays: 1095, // 3 years for compliance
    enableAutoCleanup: true,
  },
  DEFAULT: {
    evidenceBundleRetentionDays: 90, // 90 days default
    auditLogRetentionDays: 365, // 1 year default
    complianceLogRetentionDays: 730, // 2 years default
    enableAutoCleanup: true,
  },
};

/**
 * Get retention policy for a workspace
 */
export async function getRetentionPolicy(workspaceId: string): Promise<RetentionPolicy> {
  // For now, return default policy
  // In production, this would be stored in the database per workspace
  return {
    workspaceId,
    ...DEFAULT_RETENTION_POLICIES.DEFAULT,
  } as RetentionPolicy;
}

/**
 * Apply retention policy to evidence bundles
 * Deletes evidence bundles that are past their retention period
 */
export async function applyEvidenceBundleRetention(workspaceId: string): Promise<number> {
  const policy = await getRetentionPolicy(workspaceId);
  
  if (!policy.enableAutoCleanup) {
    console.log(`[Retention] Auto-cleanup disabled for workspace ${workspaceId}`);
    return 0;
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - policy.evidenceBundleRetentionDays);

  // Find drift candidates with evidence bundles older than retention period
  const expiredDrifts = await prisma.driftCandidate.findMany({
    where: {
      workspaceId,
      createdAt: {
        lt: cutoffDate,
      },
      evidenceBundle: {
        not: Prisma.JsonNull,
      },
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

  if (expiredDrifts.length === 0) {
    console.log(`[Retention] No expired evidence bundles found for workspace ${workspaceId}`);
    return 0;
  }

  // Clear evidence bundles (set to null) instead of deleting the drift candidate
  const result = await prisma.driftCandidate.updateMany({
    where: {
      workspaceId,
      id: {
        in: expiredDrifts.map((d: { id: string }) => d.id),
      },
    },
    data: {
      evidenceBundle: Prisma.JsonNull,
    },
  });

  console.log(
    `[Retention] Cleared ${result.count} evidence bundles for workspace ${workspaceId} (older than ${policy.evidenceBundleRetentionDays} days)`
  );

  // Log retention policy application to audit trail
  const { createAuditLog } = await import('./logger.js');
  await createAuditLog({
    workspaceId,
    eventType: 'retention_policy_applied',
    category: 'compliance',
    severity: 'info',
    entityType: 'evidence_bundle',
    entityId: 'bulk',
    actorType: 'system',
    actorId: 'retention-policy',
    metadata: {
      deletedCount: result.count,
      retentionDays: policy.evidenceBundleRetentionDays,
      cutoffDate: cutoffDate.toISOString(),
    },
    requiresRetention: true,
    complianceTag: 'RETENTION_POLICY',
  });

  return result.count;
}

/**
 * Get evidence bundle retention statistics
 */
export async function getEvidenceBundleRetentionStats(workspaceId: string): Promise<{
  totalEvidenceBundles: number;
  expiredEvidenceBundles: number;
  retentionPolicy: RetentionPolicy;
  nextCleanupDate: Date;
}> {
  const policy = await getRetentionPolicy(workspaceId);
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - policy.evidenceBundleRetentionDays);

  const [total, expired] = await Promise.all([
    prisma.driftCandidate.count({
      where: {
        workspaceId,
        evidenceBundle: {
          not: Prisma.JsonNull,
        },
      },
    }),
    prisma.driftCandidate.count({
      where: {
        workspaceId,
        createdAt: {
          lt: cutoffDate,
        },
        evidenceBundle: {
          not: Prisma.JsonNull,
        },
      },
    }),
  ]);

  // Next cleanup is tomorrow at midnight
  const nextCleanup = new Date();
  nextCleanup.setDate(nextCleanup.getDate() + 1);
  nextCleanup.setHours(0, 0, 0, 0);

  return {
    totalEvidenceBundles: total,
    expiredEvidenceBundles: expired,
    retentionPolicy: policy,
    nextCleanupDate: nextCleanup,
  };
}

