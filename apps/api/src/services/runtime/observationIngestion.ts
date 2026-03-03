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
import { mapCloudTrailEvent, mapGCPAuditLog, mapDatabaseQuery, mapCostExplorerEvent } from './capabilityMapper.js';
import type { CloudTrailEvent, GCPAuditLogEntry, DatabaseQueryLog } from '../../types/runtimeObservation.js';
import type { CostExplorerEvent } from './capabilityMapper.js';

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
  
  // R5-FIX: Prefer insertId for deduplication — it is the globally unique log entry
  // identifier guaranteed by GCP. The previous `${logName}:${timestamp}` composite
  // was not unique when two events share the same millisecond timestamp.
  const eventId = entry.insertId || `${entry.logName}:${entry.timestamp}`;
  
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
 * Ingest database query log.
 * R6-FIX: Use time-bucket deduplication to avoid creating millions of records
 * for high-frequency DB operations (e.g., SELECT running thousands of times per minute).
 * Bucket granularity: 1 hour. Within each bucket, one observation per
 * (workspaceId, service, capabilityType, capabilityTarget) tuple is sufficient.
 */
export async function ingestDatabaseQuery(
  workspaceId: string,
  service: string,
  log: DatabaseQueryLog,
): Promise<string | null> {
  const mapping = mapDatabaseQuery(log);

  if (!mapping) {
    console.log(`[RuntimeObservation] Skipping unmapped DB query: ${log.operation}`);
    return null;
  }

  // Time-bucket key: truncate timestamp to the current hour (YYYY-MM-DDTHH:00:00.000Z)
  const bucketTs = new Date(log.timestamp);
  bucketTs.setMinutes(0, 0, 0);
  const bucketKey = `db:${workspaceId}:${service}:${mapping.capabilityType}:${mapping.capabilityTarget}:${bucketTs.toISOString()}`;

  // Check for an existing observation in the same time bucket
  const bucketStart = bucketTs;
  const bucketEnd = new Date(bucketTs.getTime() + 60 * 60 * 1000);

  const existing = await prisma.runtimeCapabilityObservation.findFirst({
    where: {
      workspaceId,
      service,
      capabilityType: mapping.capabilityType,
      capabilityTarget: mapping.capabilityTarget,
      source: 'database_query_log',
      observedAt: { gte: bucketStart, lt: bucketEnd },
    },
    select: { id: true },
  });

  if (existing) {
    // Already have an observation for this type/target in this hour bucket — skip
    return existing.id;
  }

  const observation = await prisma.runtimeCapabilityObservation.create({
    data: {
      workspaceId,
      service,
      capabilityType: mapping.capabilityType,
      capabilityTarget: mapping.capabilityTarget,
      observedAt: log.timestamp,
      source: 'database_query_log',
      sourceEventId: bucketKey, // Use bucket key for idempotency
      metadata: mapping.metadata,
    },
  });

  return observation.id;
}

/**
 * Ingest AWS Cost Explorer / Budget Alert event as a cost_increase observation.
 * Deduplicated by eventId.
 */
export async function ingestCostExplorerEvent(
  workspaceId: string,
  service: string,
  event: CostExplorerEvent
): Promise<string | null> {
  const mapping = mapCostExplorerEvent(event);

  if (!mapping) {
    console.log(`[RuntimeObservation] Skipping unmapped Cost Explorer event: ${event.eventId}`);
    return null;
  }

  // Check for duplicate
  const existing = await prisma.runtimeCapabilityObservation.findFirst({
    where: {
      workspaceId,
      sourceEventId: event.eventId,
    },
  });

  if (existing) {
    console.log(`[RuntimeObservation] Skipping duplicate Cost Explorer event: ${event.eventId}`);
    return existing.id;
  }

  const observation = await prisma.runtimeCapabilityObservation.create({
    data: {
      workspaceId,
      service,
      capabilityType: mapping.capabilityType,
      capabilityTarget: mapping.capabilityTarget,
      observedAt: new Date(event.timestamp),
      source: 'cost_explorer',
      sourceEventId: event.eventId,
      metadata: mapping.metadata,
    },
  });

  console.log(`[RuntimeObservation] Ingested Cost Explorer event: ${event.eventId} → cost_increase`);
  return observation.id;
}
