/**
 * Runtime Observation Ingestion Service
 * 
 * Ingests runtime capability observations from various sources:
 * - AWS CloudTrail events
 * - GCP Audit logs
 * - Database query logs
 * - Cost Explorer data
 * 
 * ARCHITECTURE:
 * - Input: Cloud event (CloudTrail, GCP Audit, DB log)
 * - Processing: Map event → capability type + target
 * - Output: RuntimeCapabilityObservation record in database
 * - Deduplication: By source_event_id
 * 
 * USAGE:
 * ```typescript
 * await ingestCloudTrailEvent(workspaceId, service, cloudTrailEvent);
 * await ingestGCPAuditLog(workspaceId, service, gcpAuditLog);
 * await ingestDatabaseQuery(workspaceId, service, queryLog);
 * ```
 */

import { prisma } from '../../lib/db.js';
import { mapCloudTrailEvent, mapGCPAuditLog, mapDatabaseQuery } from './capabilityMapper.js';
import type { CloudTrailEvent, GCPAuditLogEntry, DatabaseQueryLog } from '../../types/runtimeObservation.js';

/**
 * Ingest AWS CloudTrail event
 */
export async function ingestCloudTrailEvent(
  workspaceId: string,
  service: string,
  event: CloudTrailEvent
): Promise<string | null> {
  const mapping = mapCloudTrailEvent(event);
  
  if (!mapping) {
    console.log(`[RuntimeObservation] Skipping unmapped CloudTrail event: ${event.eventName}`);
    return null;
  }
  
  // Check for duplicate (idempotency)
  const existing = await prisma.runtimeCapabilityObservation.findFirst({
    where: {
      workspaceId,
      sourceEventId: event.eventID,
    },
  });
  
  if (existing) {
    console.log(`[RuntimeObservation] Skipping duplicate CloudTrail event: ${event.eventID}`);
    return existing.id;
  }
  
  // Create observation
  const observation = await prisma.runtimeCapabilityObservation.create({
    data: {
      workspaceId,
      service,
      capabilityType: mapping.capabilityType,
      capabilityTarget: mapping.capabilityTarget,
      observedAt: new Date(event.eventTime),
      source: 'aws_cloudtrail',
      sourceEventId: event.eventID,
      metadata: mapping.metadata,
    },
  });
  
  console.log(`[RuntimeObservation] Ingested CloudTrail event: ${event.eventID} → ${mapping.capabilityType}`);
  return observation.id;
}

/**
 * Ingest GCP Audit Log entry
 */
export async function ingestGCPAuditLog(
  workspaceId: string,
  service: string,
  entry: GCPAuditLogEntry
): Promise<string | null> {
  const mapping = mapGCPAuditLog(entry);
  
  if (!mapping) {
    console.log(`[RuntimeObservation] Skipping unmapped GCP Audit log: ${entry.protoPayload.methodName}`);
    return null;
  }
  
  // Generate event ID from log name + timestamp
  const eventId = `${entry.logName}:${entry.timestamp}`;
  
  // Check for duplicate
  const existing = await prisma.runtimeCapabilityObservation.findFirst({
    where: {
      workspaceId,
      sourceEventId: eventId,
    },
  });
  
  if (existing) {
    console.log(`[RuntimeObservation] Skipping duplicate GCP Audit log: ${eventId}`);
    return existing.id;
  }
  
  // Create observation
  const observation = await prisma.runtimeCapabilityObservation.create({
    data: {
      workspaceId,
      service,
      capabilityType: mapping.capabilityType,
      capabilityTarget: mapping.capabilityTarget,
      observedAt: new Date(entry.timestamp),
      source: 'gcp_audit_log',
      sourceEventId: eventId,
      metadata: mapping.metadata,
    },
  });
  
  console.log(`[RuntimeObservation] Ingested GCP Audit log: ${eventId} → ${mapping.capabilityType}`);
  return observation.id;
}

/**
 * Ingest database query log
 */
export async function ingestDatabaseQuery(
  workspaceId: string,
  service: string,
  log: DatabaseQueryLog
): Promise<string | null> {
  const mapping = mapDatabaseQuery(log);
  
  if (!mapping) {
    console.log(`[RuntimeObservation] Skipping unmapped DB query: ${log.operation}`);
    return null;
  }
  
  // Create observation (no deduplication for DB queries - they're frequent)
  const observation = await prisma.runtimeCapabilityObservation.create({
    data: {
      workspaceId,
      service,
      capabilityType: mapping.capabilityType,
      capabilityTarget: mapping.capabilityTarget,
      observedAt: log.timestamp,
      source: 'database_query_log',
      sourceEventId: undefined, // No event ID for DB queries
      metadata: mapping.metadata,
    },
  });
  
  return observation.id;
}

