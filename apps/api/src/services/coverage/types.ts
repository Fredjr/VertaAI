// Coverage Health Monitoring Types
// Phase 3: Week 6 - Coverage Calculation & Monitoring
// Provides visibility into mapping coverage, processing coverage, and source health

export interface CoverageSnapshot {
  workspaceId: string;
  id: string;
  snapshotAt: Date;
  
  // Mapping Coverage Metrics
  totalServices: number;
  servicesMapped: number;
  totalRepos: number;
  reposMapped: number;
  mappingCoveragePercent: number;
  
  // Processing Coverage Metrics
  totalSignals: number;
  signalsProcessed: number;
  signalsIgnored: number;
  processingCoveragePercent: number;
  
  // Source Health Metrics
  sourceHealth: SourceHealthMap;
  
  // Drift Type Distribution
  driftTypeDistribution: Record<string, number>;
  
  // Coverage Obligations Status
  obligationsStatus: ObligationsStatusMap;
  
  createdAt: Date;
}

export interface SourceHealthMetrics {
  total: number;
  processed: number;
  ignored: number;
  health: 'excellent' | 'good' | 'fair' | 'poor';
  healthScore: number; // 0-100
}

export type SourceHealthMap = Record<string, SourceHealthMetrics>;

export interface CoverageObligation {
  threshold: number; // Expected minimum value (0-1 for percentages)
  actual: number; // Actual current value
  met: boolean; // Whether obligation is met
  severity: 'critical' | 'warning' | 'info';
}

export type ObligationsStatusMap = Record<string, CoverageObligation>;

export interface CoverageCalculationArgs {
  workspaceId: string;
  startDate?: Date; // Start of period (default: 24 hours ago)
  endDate?: Date; // End of period (default: now)
}

export interface CoverageMetrics {
  // Mapping Coverage
  mappingCoverage: {
    totalServices: number;
    servicesMapped: number;
    totalRepos: number;
    reposMapped: number;
    coveragePercent: number;
  };
  
  // Processing Coverage
  processingCoverage: {
    totalSignals: number;
    signalsProcessed: number;
    signalsIgnored: number;
    coveragePercent: number;
  };
  
  // Source Health
  sourceHealth: SourceHealthMap;
  
  // Drift Type Distribution
  driftTypeDistribution: Record<string, number>;
}

export interface CoverageObligationConfig {
  mappingCoverageMin: number; // Minimum mapping coverage (default: 0.8)
  processingCoverageMin: number; // Minimum processing coverage (default: 0.7)
  sourceHealthMin: number; // Minimum source health score (default: 70)
}

export interface CreateSnapshotArgs {
  workspaceId: string;
  metrics: CoverageMetrics;
  obligations: CoverageObligationConfig;
}

export interface GetSnapshotsArgs {
  workspaceId: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export interface CoverageTrend {
  date: Date;
  mappingCoverage: number;
  processingCoverage: number;
  avgSourceHealth: number;
}

export interface CoverageAlert {
  type: 'mapping_coverage' | 'processing_coverage' | 'source_health';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  threshold: number;
  actual: number;
  timestamp: Date;
}

