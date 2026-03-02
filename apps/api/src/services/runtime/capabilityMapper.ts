/**
 * Capability Mapper
 * 
 * Maps cloud events (AWS CloudTrail, GCP Audit, DB logs) to capability types.
 * This is the core translation layer for runtime capability observation.
 * 
 * ARCHITECTURE:
 * - Input: Cloud event (CloudTrail, GCP Audit, DB query log)
 * - Output: CapabilityType + target
 * - Mapping: Event name → Capability type (deterministic)
 * 
 * EXAMPLES:
 * - AWS CloudTrail "PutObject" → file_system_access (s3://bucket/key)
 * - GCP Audit "storage.objects.create" → file_system_access (gs://bucket/key)
 * - DB query "INSERT INTO users" → db_write (users_table)
 * - AWS CloudTrail "CreateTable" → infra_create (dynamodb:table/users)
 */

import type { CapabilityType } from '../../types/agentGovernance.js';
import type { CloudTrailEvent, GCPAuditLogEntry, DatabaseQueryLog } from '../../types/runtimeObservation.js';

/**
 * Capability mapping result
 */
export interface CapabilityMapping {
  capabilityType: CapabilityType;
  capabilityTarget: string;
  confidence: number; // 0.0 - 1.0
  metadata: Record<string, any>;
}

/**
 * AWS CloudTrail event name → Capability type mapping
 */
const CLOUDTRAIL_CAPABILITY_MAP: Record<string, CapabilityType> = {
  // S3 operations
  'PutObject': 'file_system_access',
  'GetObject': 'file_system_access',
  'DeleteObject': 'file_system_access',
  'CreateBucket': 'infra_create',
  'DeleteBucket': 'infra_delete',
  
  // DynamoDB operations
  'CreateTable': 'infra_create',
  'DeleteTable': 'infra_delete',
  'UpdateTable': 'infra_modify',
  'PutItem': 'db_write',
  'GetItem': 'db_read',
  'DeleteItem': 'db_write',
  'Query': 'db_read',
  'Scan': 'db_read',
  
  // RDS operations
  'CreateDBInstance': 'infra_create',
  'DeleteDBInstance': 'infra_delete',
  'ModifyDBInstance': 'infra_modify',
  
  // IAM operations
  'CreateRole': 'permission_grant',
  'DeleteRole': 'permission_revoke',
  'AttachRolePolicy': 'permission_grant',
  'DetachRolePolicy': 'permission_revoke',
  'PutUserPolicy': 'permission_grant',
  'DeleteUserPolicy': 'permission_revoke',
  
  // Secrets Manager
  'GetSecretValue': 'secret_read',
  'PutSecretValue': 'secret_write',
  'CreateSecret': 'secret_write',
  'DeleteSecret': 'secret_write',
  
  // Lambda
  'CreateFunction': 'infra_create',
  'DeleteFunction': 'infra_delete',
  'UpdateFunctionCode': 'code_modify',
  'Invoke': 'external_api_call',
};

/**
 * GCP Audit Log method name → Capability type mapping
 */
const GCP_CAPABILITY_MAP: Record<string, CapabilityType> = {
  // Cloud Storage
  'storage.objects.create': 'file_system_access',
  'storage.objects.get': 'file_system_access',
  'storage.objects.delete': 'file_system_access',
  'storage.buckets.create': 'infra_create',
  'storage.buckets.delete': 'infra_delete',
  
  // Cloud SQL
  'cloudsql.instances.create': 'infra_create',
  'cloudsql.instances.delete': 'infra_delete',
  'cloudsql.instances.update': 'infra_modify',
  
  // IAM
  'iam.roles.create': 'permission_grant',
  'iam.roles.delete': 'permission_revoke',
  'iam.serviceAccounts.create': 'permission_grant',
  'iam.serviceAccounts.delete': 'permission_revoke',
  
  // Secret Manager
  'secretmanager.secrets.create': 'secret_write',
  'secretmanager.secrets.delete': 'secret_write',
  'secretmanager.versions.access': 'secret_read',
  
  // Compute Engine
  'compute.instances.insert': 'infra_create',
  'compute.instances.delete': 'infra_delete',
  'compute.instances.update': 'infra_modify',
};

/**
 * Database operation → Capability type mapping
 */
const DB_OPERATION_MAP: Record<string, CapabilityType> = {
  'SELECT': 'db_read',
  'INSERT': 'db_write',
  'UPDATE': 'db_write',
  'DELETE': 'db_write',
  'CREATE': 'db_admin',
  'ALTER': 'db_admin',
  'DROP': 'db_admin',
  'GRANT': 'permission_grant',
  'REVOKE': 'permission_revoke',
};

/**
 * Map AWS CloudTrail event to capability
 */
export function mapCloudTrailEvent(event: CloudTrailEvent): CapabilityMapping | null {
  const capabilityType = CLOUDTRAIL_CAPABILITY_MAP[event.eventName];
  
  if (!capabilityType) {
    return null; // Unknown event type
  }
  
  // Extract target from resources
  const target = event.resources?.[0]?.ARN || event.eventSource;
  
  return {
    capabilityType,
    capabilityTarget: target,
    confidence: 1.0, // CloudTrail events are deterministic
    metadata: {
      eventName: event.eventName,
      eventSource: event.eventSource,
      eventID: event.eventID,
      userArn: event.userIdentity.arn,
    },
  };
}

/**
 * Map GCP Audit Log entry to capability
 */
export function mapGCPAuditLog(entry: GCPAuditLogEntry): CapabilityMapping | null {
  const capabilityType = GCP_CAPABILITY_MAP[entry.protoPayload.methodName];
  
  if (!capabilityType) {
    return null; // Unknown method
  }
  
  // Extract target from resource
  const target = `${entry.resource.type}/${entry.resource.labels.resource_id || 'unknown'}`;
  
  return {
    capabilityType,
    capabilityTarget: target,
    confidence: 1.0, // GCP Audit logs are deterministic
    metadata: {
      methodName: entry.protoPayload.methodName,
      serviceName: entry.protoPayload.serviceName,
      principalEmail: entry.protoPayload.authenticationInfo.principalEmail,
    },
  };
}

/**
 * Map database query log to capability
 */
export function mapDatabaseQuery(log: DatabaseQueryLog): CapabilityMapping | null {
  const capabilityType = DB_OPERATION_MAP[log.operation];
  
  if (!capabilityType) {
    return null; // Unknown operation
  }
  
  const target = `${log.database}.${log.table}`;
  
  return {
    capabilityType,
    capabilityTarget: target,
    confidence: 1.0, // Database logs are deterministic
    metadata: {
      operation: log.operation,
      database: log.database,
      table: log.table,
      user: log.user,
      duration: log.duration,
    },
  };
}

