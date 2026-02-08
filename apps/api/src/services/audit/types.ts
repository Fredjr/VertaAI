// Audit Trail Types
// Phase 4 Week 8: Comprehensive audit logging for compliance

export type AuditEventType =
  // State transitions
  | 'state_transition'
  | 'state_transition_failed'
  
  // Evidence bundle events
  | 'evidence_created'
  | 'evidence_cached'
  | 'evidence_invalidated'
  
  // Plan events
  | 'plan_created'
  | 'plan_updated'
  | 'plan_deleted'
  | 'plan_version_changed'
  
  // Human actions
  | 'approval'
  | 'rejection'
  | 'edit_requested'
  | 'snoozed'
  
  // Writeback events
  | 'patch_generated'
  | 'patch_validated'
  | 'writeback_started'
  | 'writeback_completed'
  | 'writeback_failed'
  
  // Suppression events
  | 'drift_suppressed'
  | 'suppression_created'
  | 'suppression_deleted'
  
  // Coverage events
  | 'coverage_snapshot_created'
  | 'coverage_obligation_violated'
  
  // Integration events
  | 'integration_connected'
  | 'integration_disconnected'
  | 'integration_error'
  
  // Compliance events
  | 'compliance_report_generated'
  | 'retention_policy_applied'
  | 'data_deleted';

export type AuditCategory = 'system' | 'user' | 'integration' | 'compliance';

export type AuditSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

export type AuditEntityType =
  | 'drift_candidate'
  | 'patch_proposal'
  | 'drift_plan'
  | 'evidence_bundle'
  | 'coverage_snapshot'
  | 'drift_suppression'
  | 'integration'
  | 'workspace';

export type AuditActorType = 'system' | 'user' | 'integration' | 'agent';

export interface AuditLogEntry {
  workspaceId: string;
  id?: string; // Auto-generated if not provided
  timestamp?: Date; // Auto-generated if not provided
  
  // Event classification
  eventType: AuditEventType;
  category?: AuditCategory; // Default: 'system'
  severity?: AuditSeverity; // Default: 'info'
  
  // Entity being audited
  entityType: AuditEntityType;
  entityId: string;
  
  // Actor who triggered the event
  actorType: AuditActorType;
  actorId: string;
  
  // State transition details (optional)
  fromState?: string;
  toState?: string;
  
  // Change details
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
  
  // Evidence bundle tracking (optional)
  evidenceBundleHash?: string;
  impactBand?: string;
  
  // Plan version tracking (optional)
  planId?: string;
  planVersionHash?: string;
  
  // Compliance flags (optional)
  requiresRetention?: boolean;
  retentionUntil?: Date;
  complianceTag?: string; // 'SOX', 'SOC2', 'ISO27001', 'GDPR', etc.
}

export interface AuditQueryOptions {
  workspaceId: string;
  
  // Filtering
  entityType?: AuditEntityType;
  entityId?: string;
  eventType?: AuditEventType;
  category?: AuditCategory;
  severity?: AuditSeverity;
  actorId?: string;
  
  // Time range
  startTime?: Date;
  endTime?: Date;
  
  // Pagination
  limit?: number;
  offset?: number;
  
  // Sorting
  sortBy?: 'timestamp' | 'severity';
  sortOrder?: 'asc' | 'desc';
}

export interface AuditQueryResult {
  logs: AuditLogEntry[];
  total: number;
  hasMore: boolean;
}

export interface ComplianceReport {
  workspaceId: string;
  reportType: 'SOX' | 'SOC2' | 'ISO27001' | 'GDPR' | 'CUSTOM';
  startDate: Date;
  endDate: Date;
  
  // Summary statistics
  totalEvents: number;
  criticalEvents: number;
  stateTransitions: number;
  humanActions: number;
  writebacks: number;
  
  // Compliance-specific metrics
  retentionCompliance: boolean;
  auditTrailComplete: boolean;
  
  // Detailed logs
  logs: AuditLogEntry[];
  
  // Generated metadata
  generatedAt: Date;
  generatedBy: string;
}

