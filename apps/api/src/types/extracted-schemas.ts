/**
 * TypeScript Schemas for Extracted Data
 * 
 * Enforces data contracts between webhook ingestion and state machine processing.
 * Each source type has a specific schema that MUST be populated by webhook handlers
 * and is REQUIRED by validators and comparison logic.
 * 
 * CRITICAL: These schemas prevent data contract violations (Bugs #1 and #2)
 */

// ============================================================================
// Base Schema (Common Fields)
// ============================================================================

export interface BaseExtracted {
  // Common fields across all source types
  title?: string;
  summary?: string;
  keywords?: string[];
}

// ============================================================================
// GitHub PR Extracted Schema
// ============================================================================

export interface GitHubPRExtracted extends BaseExtracted {
  // PR metadata
  prNumber: number;
  prTitle: string;
  prBody: string;
  authorLogin: string;
  baseBranch: string;
  headBranch: string;
  
  // REQUIRED by preValidateGitHubPR (outputValidators.ts:193-211)
  merged: boolean;                    // Bug #1: Was missing
  changedFiles: Array<{               // Bug #1: Was missing
    filename: string;
    additions: number;
    deletions: number;
    status: string;
  }>;
  totalChanges: number;               // Bug #1: Was missing
  
  // REQUIRED by deterministic comparison (baseline/comparison.ts)
  diff: string;                       // Bug #2: Was missing
  
  // Optional drift hints (Phase 1 & 2)
  ownershipDriftHint?: any;
  apiDriftHint?: any;
  catalogDriftHint?: any;
}

// ============================================================================
// PagerDuty Incident Extracted Schema
// ============================================================================

export interface PagerDutyIncidentExtracted extends BaseExtracted {
  // Incident metadata
  incidentId: string;
  incidentTitle: string;
  incidentUrl: string;
  
  // REQUIRED by preValidatePagerDutyIncident (outputValidators.ts:216-230)
  status: string;                     // Must be 'resolved'
  service: string;                    // Service name
  durationMinutes?: number;
  
  // REQUIRED by deterministic comparison
  responders: string[];
  timeline: Array<{
    event: string;
    at: string;
    by?: string;
    details?: string;
  }>;
  escalationPolicy: string;
  teams: string[];
  resolvedBy?: string;
  priority?: string;
  notes?: string[];
  
  // Drift detection hints
  driftTypeHints: string[];
  processDriftEvidence?: string;
  ownershipDriftEvidence?: string;
}

// ============================================================================
// Slack Cluster Extracted Schema
// ============================================================================

export interface SlackClusterExtracted extends BaseExtracted {
  // Cluster metadata
  clusterId: string;
  channel: string;
  
  // REQUIRED by preValidateSlackCluster (outputValidators.ts:235-253)
  clusterSize: number;                // Must be >= 2
  uniqueAskers: number;               // Must be >= 2
  questions: Array<{                  // Must not be empty
    text: string;
    asker: string;
    timestamp: string;
  }>;
  
  // REQUIRED by deterministic comparison
  messages: Array<{
    text: string;
    user: string;
    timestamp: string;
  }>;
  participants: string[];
  timeRange: {
    start: string;
    end: string;
  };
  
  // Drift detection hints
  driftTypeHints: string[];
  coverageDriftEvidence?: string;
}

// ============================================================================
// Datadog/Grafana Alert Extracted Schema
// ============================================================================

export interface DatadogAlertExtracted extends BaseExtracted {
  // Alert metadata
  alertId: string;
  alertUrl?: string;
  
  // REQUIRED by preValidateDatadogAlert (outputValidators.ts:258-272)
  monitorName: string;                // Must not be empty
  severity: string;                   // Must not be empty
  
  // REQUIRED by deterministic comparison
  alertType: string;
  metric?: string;
  threshold?: number;
  currentValue?: number;
  tags: string[];
  
  // Drift detection hints
  driftTypeHints: string[];
  environmentDriftEvidence?: string;
}

// ============================================================================
// Union Type for All Extracted Schemas
// ============================================================================

export type ExtractedData =
  | GitHubPRExtracted
  | PagerDutyIncidentExtracted
  | SlackClusterExtracted
  | DatadogAlertExtracted;

// ============================================================================
// Type Guards
// ============================================================================

export function isGitHubPRExtracted(data: any): data is GitHubPRExtracted {
  return data && typeof data.prNumber === 'number' && typeof data.merged === 'boolean';
}

export function isPagerDutyIncidentExtracted(data: any): data is PagerDutyIncidentExtracted {
  return data && typeof data.incidentId === 'string' && typeof data.status === 'string';
}

export function isSlackClusterExtracted(data: any): data is SlackClusterExtracted {
  return data && typeof data.clusterId === 'string' && typeof data.clusterSize === 'number';
}

export function isDatadogAlertExtracted(data: any): data is DatadogAlertExtracted {
  return data && typeof data.alertId === 'string' && typeof data.monitorName === 'string';
}

