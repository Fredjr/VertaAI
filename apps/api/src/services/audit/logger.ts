// Audit Logger Service
// Phase 4 Week 8: Immutable audit logging for compliance and debugging

import { prisma } from '../../lib/db.js';
import {
  AuditLogEntry,
  AuditQueryOptions,
  AuditQueryResult,
  AuditCategory,
  AuditSeverity,
} from './types.js';

/**
 * Create an immutable audit trail entry
 * This is the primary function for logging all auditable events
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    // Set defaults
    const category: AuditCategory = entry.category || 'system';
    const severity: AuditSeverity = entry.severity || 'info';

    // Create audit trail entry (immutable - no updates allowed)
    await prisma.auditTrail.create({
      data: {
        workspaceId: entry.workspaceId,
        timestamp: entry.timestamp || new Date(),
        
        // Event classification
        eventType: entry.eventType,
        category,
        severity,
        
        // Entity
        entityType: entry.entityType,
        entityId: entry.entityId,
        
        // Actor
        actorType: entry.actorType,
        actorId: entry.actorId,
        
        // State transition (optional)
        fromState: entry.fromState,
        toState: entry.toState,
        
        // Changes and metadata
        changes: entry.changes || {},
        metadata: entry.metadata || {},
        
        // Evidence bundle tracking (optional)
        evidenceBundleHash: entry.evidenceBundleHash,
        impactBand: entry.impactBand,
        
        // Plan version tracking (optional)
        planId: entry.planId,
        planVersionHash: entry.planVersionHash,
        
        // Compliance flags (optional)
        requiresRetention: entry.requiresRetention || false,
        retentionUntil: entry.retentionUntil,
        complianceTag: entry.complianceTag,
      },
    });
    
    // Log to console for debugging (structured logging)
    console.log(`[AuditLog] ${category}/${severity}: ${entry.eventType} - ${entry.entityType}:${entry.entityId} by ${entry.actorType}:${entry.actorId}`);
  } catch (error: any) {
    // CRITICAL: Audit logging failures should not break the main flow
    // Log error but don't throw - graceful degradation
    console.error(`[AuditLog] CRITICAL: Failed to create audit log:`, error);
  }
}

/**
 * Log a state transition
 * Convenience function for the most common audit event
 */
export async function logStateTransition(
  workspaceId: string,
  driftId: string,
  fromState: string,
  toState: string,
  actorType: 'system' | 'user' | 'agent',
  actorId: string,
  metadata?: Record<string, any>
): Promise<void> {
  await createAuditLog({
    workspaceId,
    eventType: 'state_transition',
    category: 'system',
    severity: 'info',
    entityType: 'drift_candidate',
    entityId: driftId,
    actorType,
    actorId,
    fromState,
    toState,
    metadata,
  });
}

/**
 * Log evidence bundle creation
 */
export async function logEvidenceCreated(
  workspaceId: string,
  driftId: string,
  evidenceHash: string,
  impactBand: string,
  metadata?: Record<string, any>
): Promise<void> {
  await createAuditLog({
    workspaceId,
    eventType: 'evidence_created',
    category: 'system',
    severity: 'info',
    entityType: 'evidence_bundle',
    entityId: driftId,
    actorType: 'system',
    actorId: 'evidence-builder',
    evidenceBundleHash: evidenceHash,
    impactBand,
    metadata,
  });
}

/**
 * Log plan version change
 */
export async function logPlanVersionChanged(
  workspaceId: string,
  planId: string,
  oldVersionHash: string,
  newVersionHash: string,
  actorType: 'system' | 'user',
  actorId: string,
  changes?: Record<string, any>
): Promise<void> {
  await createAuditLog({
    workspaceId,
    eventType: 'plan_version_changed',
    category: 'system',
    severity: 'info',
    entityType: 'drift_plan',
    entityId: planId,
    actorType,
    actorId,
    planId,
    planVersionHash: newVersionHash,
    changes: {
      oldVersionHash,
      newVersionHash,
      ...changes,
    },
  });
}

/**
 * Log human action (approval, rejection, edit request, snooze)
 */
export async function logHumanAction(
  workspaceId: string,
  driftId: string,
  action: 'approval' | 'rejection' | 'edit_requested' | 'snoozed',
  userId: string,
  metadata?: Record<string, any>
): Promise<void> {
  await createAuditLog({
    workspaceId,
    eventType: action,
    category: 'user',
    severity: 'info',
    entityType: 'drift_candidate',
    entityId: driftId,
    actorType: 'user',
    actorId: userId,
    metadata,
    requiresRetention: true, // Human actions require compliance retention
    complianceTag: 'SOC2',
  });
}

/**
 * Query audit logs with filtering and pagination
 */
export async function queryAuditLogs(options: AuditQueryOptions): Promise<AuditQueryResult> {
  const {
    workspaceId,
    entityType,
    entityId,
    eventType,
    category,
    severity,
    actorId,
    startTime,
    endTime,
    limit = 100,
    offset = 0,
    sortBy = 'timestamp',
    sortOrder = 'desc',
  } = options;

  // Build where clause
  const where: any = {
    workspaceId,
  };

  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (eventType) where.eventType = eventType;
  if (category) where.category = category;
  if (severity) where.severity = severity;
  if (actorId) where.actorId = actorId;

  if (startTime || endTime) {
    where.timestamp = {};
    if (startTime) where.timestamp.gte = startTime;
    if (endTime) where.timestamp.lte = endTime;
  }

  // Execute query with pagination
  const [logs, total] = await Promise.all([
    prisma.auditTrail.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      take: limit,
      skip: offset,
    }),
    prisma.auditTrail.count({ where }),
  ]);

  return {
    logs: logs as any[],
    total,
    hasMore: offset + logs.length < total,
  };
}

/**
 * Get audit trail for a specific entity
 */
export async function getEntityAuditTrail(
  workspaceId: string,
  entityType: string,
  entityId: string
): Promise<AuditLogEntry[]> {
  const logs = await prisma.auditTrail.findMany({
    where: {
      workspaceId,
      entityType,
      entityId,
    },
    orderBy: { timestamp: 'asc' },
  });

  return logs as any[];
}

/**
 * Get state transition history for a drift candidate
 */
export async function getDriftStateHistory(
  workspaceId: string,
  driftId: string
): Promise<AuditLogEntry[]> {
  const logs = await prisma.auditTrail.findMany({
    where: {
      workspaceId,
      entityType: 'drift_candidate',
      entityId: driftId,
      eventType: 'state_transition',
    },
    orderBy: { timestamp: 'asc' },
  });

  return logs as any[];
}

/**
 * Get compliance-relevant logs (logs with retention requirements)
 */
export async function getComplianceLogs(
  workspaceId: string,
  startDate: Date,
  endDate: Date,
  complianceTag?: string
): Promise<AuditLogEntry[]> {
  const where: any = {
    workspaceId,
    requiresRetention: true,
    timestamp: {
      gte: startDate,
      lte: endDate,
    },
  };

  if (complianceTag) {
    where.complianceTag = complianceTag;
  }

  const logs = await prisma.auditTrail.findMany({
    where,
    orderBy: { timestamp: 'asc' },
  });

  return logs as any[];
}

