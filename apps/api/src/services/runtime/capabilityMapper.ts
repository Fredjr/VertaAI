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
 * - AWS CloudTrail "PutObject" → s3_write (s3://bucket/key)
 * - AWS CloudTrail "GetObject" → s3_read (s3://bucket/key)
 * - GCP Audit "storage.objects.create" → s3_write (gs://bucket/key)
 * - DB query "INSERT INTO users" → db_write (users_table)
 * - AWS CloudTrail "CreateTable" → infra_create (dynamodb:table/users)
 * - AWS CloudTrail "AttachRolePolicy" → iam_modify
 */

import type { CapabilityType } from '../../types/agentGovernance.js';
import type { CloudTrailEvent, GCPAuditLogEntry, DatabaseQueryLog } from '../../types/runtimeObservation.js';

/**
 * AWS Cost Explorer / Budget Alert event
 * Sent from a Lambda forwarder that listens to SNS Budget Alerts or Cost Anomaly Detection.
 */
export interface CostExplorerEvent {
  eventId: string;           // Unique event ID for deduplication
  timestamp: string;         // ISO-8601 timestamp of the alert
  awsService: string;        // AWS service name e.g. "Amazon S3", "Amazon EC2"
  resourceId?: string;       // Resource ARN or ID if available
  currentSpend: number;      // Current period spend in USD
  forecastedSpend?: number;  // Forecasted spend for the period
  budgetLimit?: number;      // Budget threshold that was crossed
  anomalyScore?: number;     // Anomaly score 0-100 (Cost Anomaly Detection)
  alertType: 'budget_exceeded' | 'anomaly_detected' | 'spike' | 'forecast_exceeded';
  tags?: Record<string, string>; // AWS resource tags for service attribution
}

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
 * All types must be members of the canonical 18-type CapabilityType lattice:
 * db_read, db_write, db_admin, s3_read, s3_write, s3_delete, api_endpoint,
 * iam_modify, infra_create, infra_modify, infra_delete, secret_read, secret_write,
 * network_public, network_private, cost_increase, schema_modify, deployment_modify
 */
const CLOUDTRAIL_CAPABILITY_MAP: Record<string, CapabilityType> = {
  // S3 operations — mapped to granular s3_* types
  'PutObject': 's3_write',
  'GetObject': 's3_read',
  'DeleteObject': 's3_delete',
  'CopyObject': 's3_write',
  'CreateMultipartUpload': 's3_write',
  'CompleteMultipartUpload': 's3_write',
  'CreateBucket': 'infra_create',
  'DeleteBucket': 'infra_delete',

  // DynamoDB operations
  'CreateTable': 'infra_create',
  'DeleteTable': 'infra_delete',
  'UpdateTable': 'infra_modify',
  'PutItem': 'db_write',
  'GetItem': 'db_read',
  'DeleteItem': 'db_write',
  'UpdateItem': 'db_write',
  'Query': 'db_read',
  'Scan': 'db_read',
  'BatchGetItem': 'db_read',
  'BatchWriteItem': 'db_write',

  // RDS operations
  'CreateDBInstance': 'infra_create',
  'DeleteDBInstance': 'infra_delete',
  'ModifyDBInstance': 'infra_modify',
  'CreateDBCluster': 'infra_create',
  'DeleteDBCluster': 'infra_delete',

  // IAM operations — all map to iam_modify (lattice has one IAM type)
  'CreateRole': 'iam_modify',
  'DeleteRole': 'iam_modify',
  'AttachRolePolicy': 'iam_modify',
  'DetachRolePolicy': 'iam_modify',
  'PutUserPolicy': 'iam_modify',
  'DeleteUserPolicy': 'iam_modify',
  'CreatePolicy': 'iam_modify',
  'DeletePolicy': 'iam_modify',
  'PutRolePolicy': 'iam_modify',
  'CreateUser': 'iam_modify',
  'DeleteUser': 'iam_modify',

  // Secrets Manager
  'GetSecretValue': 'secret_read',
  'PutSecretValue': 'secret_write',
  'CreateSecret': 'secret_write',
  'DeleteSecret': 'secret_write',

  // Lambda / deployment
  'CreateFunction': 'infra_create',
  'DeleteFunction': 'infra_delete',
  'UpdateFunctionCode': 'deployment_modify',
  'UpdateFunctionConfiguration': 'deployment_modify',
  'Invoke': 'api_endpoint',

  // VPC / networking
  'CreateVpc': 'network_private',
  'DeleteVpc': 'network_private',
  'CreateSubnet': 'network_private',
  'CreateInternetGateway': 'network_public',
  'AttachInternetGateway': 'network_public',

  // CloudFormation / Terraform (via CloudTrail)
  'CreateStack': 'infra_create',
  'UpdateStack': 'infra_modify',
  'DeleteStack': 'infra_delete',
};

/**
 * GCP Audit Log method name → Capability type mapping
 * All types use canonical 18-type lattice.
 */
const GCP_CAPABILITY_MAP: Record<string, CapabilityType> = {
  // Cloud Storage — granular s3_* types (bucket = blob storage regardless of vendor)
  'storage.objects.create': 's3_write',
  'storage.objects.get': 's3_read',
  'storage.objects.delete': 's3_delete',
  'storage.objects.update': 's3_write',
  'storage.buckets.create': 'infra_create',
  'storage.buckets.delete': 'infra_delete',

  // Cloud SQL
  'cloudsql.instances.create': 'infra_create',
  'cloudsql.instances.delete': 'infra_delete',
  'cloudsql.instances.update': 'infra_modify',

  // IAM — all iam_modify
  'iam.roles.create': 'iam_modify',
  'iam.roles.delete': 'iam_modify',
  'iam.roles.update': 'iam_modify',
  'iam.serviceAccounts.create': 'iam_modify',
  'iam.serviceAccounts.delete': 'iam_modify',

  // Secret Manager
  'secretmanager.secrets.create': 'secret_write',
  'secretmanager.secrets.delete': 'secret_write',
  'secretmanager.versions.access': 'secret_read',

  // Compute Engine
  'compute.instances.insert': 'infra_create',
  'compute.instances.delete': 'infra_delete',
  'compute.instances.update': 'infra_modify',

  // Cloud Run / deployment
  'run.services.create': 'infra_create',
  'run.services.update': 'deployment_modify',
  'run.services.delete': 'infra_delete',

  // VPC networking
  'compute.networks.insert': 'network_private',
  'compute.networks.delete': 'network_private',
  'compute.firewalls.insert': 'network_public',
  'compute.firewalls.update': 'network_public',
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
  'GRANT': 'iam_modify',
  'REVOKE': 'iam_modify',
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

/**
 * Map AWS Cost Explorer / Budget Alert event to capability.
 * All cost spike/anomaly events map to the `cost_increase` canonical capability type.
 * Target is the resource ARN when available, falling back to the AWS service name.
 */
export function mapCostExplorerEvent(event: CostExplorerEvent): CapabilityMapping | null {
  // target = resource ARN if present, else AWS service name (normalized)
  const target = event.resourceId || event.awsService.toLowerCase().replace(/\s+/g, '-');

  return {
    capabilityType: 'cost_increase',
    capabilityTarget: target,
    confidence: 1.0,
    metadata: {
      alertType: event.alertType,
      awsService: event.awsService,
      currentSpend: event.currentSpend,
      forecastedSpend: event.forecastedSpend ?? null,
      budgetLimit: event.budgetLimit ?? null,
      anomalyScore: event.anomalyScore ?? null,
      tags: event.tags ?? {},
    },
  };
}

