/**
 * Runtime Capability Observation Types
 * 
 * Defines types for observing actual capability usage in production.
 * This enables Spec→Run verification for agent governance.
 * 
 * ARCHITECTURE:
 * - Observation sources: AWS CloudTrail, GCP Audit, DB query logs, Cost Explorer
 * - Observation window: Configurable (default: 7 days)
 * - Aggregation: By service, by capability type, by time window
 * - Storage: RuntimeCapabilityObservation model in database
 * 
 * SPEC→RUN TRIANGLE:
 * - Spec: Intent artifact declares capabilities
 * - Build: Code merged with declared capabilities
 * - Run: Actual capabilities observed in production
 * - Drift: Declared capabilities ≠ Observed capabilities
 */

import type { CapabilityType } from './agentGovernance.js';

/**
 * Source of runtime observation
 */
export type ObservationSource =
  | 'aws_cloudtrail'
  | 'gcp_audit_log'
  | 'azure_activity_log'
  | 'database_query_log'
  | 'cost_explorer'
  | 'datadog_apm'
  | 'manual';

/**
 * Runtime capability observation
 * Records actual capability usage in production
 */
export interface RuntimeCapabilityObservation {
  id: string;
  workspaceId: string;
  service: string;
  capabilityType: CapabilityType;
  capabilityTarget: string; // e.g., "users_table", "GET:/api/users"
  observedAt: Date;
  source: ObservationSource;
  sourceEventId?: string; // CloudTrail event ID, GCP log entry ID, etc.
  metadata: Record<string, any>; // Source-specific metadata
  createdAt: Date;
}

/**
 * Aggregated capability usage for a service
 */
export interface ServiceCapabilityUsage {
  service: string;
  timeWindow: {
    start: Date;
    end: Date;
  };
  capabilities: {
    type: CapabilityType;
    target: string;
    count: number;
    firstSeen: Date;
    lastSeen: Date;
    sources: ObservationSource[];
    /**
     * Observation recency weight [0.0–1.0].
     * 1.0 = seen within last 24 h; decays to 0.3 beyond 5 days.
     * Used to downgrade severity for stale observations.
     */
    recencyWeight: number;
    /**
     * Maximum source confidence [0.0–1.0] across all sources that
     * observed this capability. Structured audit logs (CloudTrail, GCP)
     * score higher than inferred signals (raw DB queries).
     */
    confidence: number;
  }[];
}

/**
 * Capability drift detection result
 * Compares declared capabilities vs observed capabilities
 */
export interface CapabilityDrift {
  service: string;
  driftType: 'undeclared_usage' | 'unused_declaration' | 'escalated_privilege';
  capabilityType: CapabilityType;
  capabilityTarget: string;
  declaredAt?: Date; // When capability was declared in intent
  observedAt?: Date; // When capability was observed in production
  severity: 'low' | 'medium' | 'high' | 'critical';
  evidence: {
    source: ObservationSource;
    eventId?: string;
    timestamp: Date;
    metadata: Record<string, any>;
  }[];
  /**
   * P2-A: Why was this unused_declaration not observed?
   * - 'not_observed_in_window': data source covers this cap type but no observation found
   * - 'source_coverage_gap': no data source covers this cap type (e.g. schema_modify)
   */
  observationReason?: 'not_observed_in_window' | 'source_coverage_gap';
  /**
   * Recency-weighted, confidence-adjusted severity for undeclared_usage drifts.
   * May be lower than `severity` when the evidence is stale or low-confidence.
   * Always at least 'medium' for undeclared_usage (privilege expansion floor).
   */
  effectiveSeverity?: 'low' | 'medium' | 'high' | 'critical';
  /** Recency weight [0.0–1.0] of the most recent observation for this capability. */
  recencyWeight?: number;
  /** Max source confidence [0.0–1.0] across evidence sources. */
  confidence?: number;
  /**
   * Other services in the same workspace that observed the same undeclared
   * capability type simultaneously (within the same monitoring window).
   * Non-empty = correlated multi-service event.
   */
  correlatedServices?: string[];
}

/**
 * AWS CloudTrail event (simplified)
 */
export interface CloudTrailEvent {
  eventID: string;
  eventName: string; // e.g., "PutObject", "CreateTable", "ModifyDBInstance"
  eventSource: string; // e.g., "s3.amazonaws.com", "dynamodb.amazonaws.com"
  eventTime: string;
  userIdentity: {
    type: string;
    principalId: string;
    arn: string;
  };
  requestParameters?: Record<string, any>;
  responseElements?: Record<string, any>;
  resources?: Array<{
    type: string;
    ARN: string;
  }>;
}

/**
 * GCP Audit Log entry (simplified)
 */
export interface GCPAuditLogEntry {
  logName: string;
  /**
   * R5-FIX: insertId is the globally unique identifier for a log entry.
   * Use this for deduplication instead of `${logName}:${timestamp}`,
   * which is not unique when multiple log entries share the same timestamp.
   */
  insertId?: string;
  resource: {
    type: string;
    labels: Record<string, string>;
  };
  timestamp: string;
  severity: string;
  protoPayload: {
    methodName: string; // e.g., "storage.objects.create", "compute.instances.insert"
    serviceName: string;
    authenticationInfo: {
      principalEmail: string;
    };
    request?: Record<string, any>;
    response?: Record<string, any>;
  };
}

/**
 * Database query log entry
 */
export interface DatabaseQueryLog {
  timestamp: Date;
  database: string;
  table: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE' | 'ALTER' | 'DROP';
  user: string;
  query: string;
  duration: number; // milliseconds
}

/**
 * Cost Explorer observation
 * Tracks cost impact of capabilities
 */
export interface CostObservation {
  service: string;
  resourceType: string;
  cost: number;
  currency: string;
  timeWindow: {
    start: Date;
    end: Date;
  };
  tags: Record<string, string>;
}

/**
 * Runtime observation configuration
 */
export interface RuntimeObservationConfig {
  enabled: boolean;
  sources: {
    cloudtrail?: {
      enabled: boolean;
      region: string;
      bucketName: string;
      roleArn?: string;
    };
    gcpAudit?: {
      enabled: boolean;
      projectId: string;
      logName: string;
    };
    databaseLogs?: {
      enabled: boolean;
      databases: string[];
    };
    costExplorer?: {
      enabled: boolean;
      granularity: 'DAILY' | 'HOURLY';
    };
  };
  observationWindow: number; // days
  aggregationInterval: number; // hours
}

