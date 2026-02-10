/**
 * Gap #9: Cluster-First Drift Triage - Type Definitions
 * 
 * Types for clustering similar drifts to reduce notification fatigue.
 */

export interface ClusterKey {
  service: string;
  driftType: string;
  fingerprintPattern: string;
}

export interface ClusterConfig {
  enabled: boolean;
  minClusterSize: number; // Minimum drifts to form a cluster (default: 2)
  maxClusterSize: number; // Maximum drifts per cluster (default: 20)
  timeWindowMinutes: number; // Time window for clustering (default: 60)
  notifyOnCount: number; // Notify when cluster reaches this size (default: 2)
  notifyOnExpiry: boolean; // Notify when time window expires (default: true)
}

export interface ClusterMetrics {
  driftCount: number;
  createdAt: Date;
  firstDriftAt: Date;
  lastDriftAt: Date;
  isExpired: boolean;
  shouldNotify: boolean;
  notifyReason: 'count_threshold' | 'time_expiry' | 'manual';
}

export interface DriftClusterData {
  workspaceId: string;
  id: string;
  service: string;
  driftType: string;
  fingerprintPattern: string;
  status: 'pending' | 'notified' | 'closed';
  driftCount: number;
  driftIds: string[];
  createdAt: Date;
  closedAt: Date | null;
  notifiedAt: Date | null;
  slackMessageTs: string | null;
  slackChannel: string | null;
  clusterSummary: string | null;
  bulkActionStatus: string | null;
  bulkActionAt: Date | null;
  bulkActionBy: string | null;
}

