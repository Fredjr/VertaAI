/**
 * Contract Resolution Telemetry
 * Phase 1 Week 1-2: Contract Registry & Resolution Engine - Step 5
 * 
 * Provides structured logging and metrics for contract resolution
 */

import type {
  ContractResolutionResult,
  ResolvedContract,
  UnresolvedArtifact,
  Obligation,
} from './types.js';

// ============================================================================
// Telemetry Types
// ============================================================================

export interface ContractResolutionMetrics {
  workspaceId: string;
  signalEventId: string;
  resolutionTimeMs: number;
  contractsResolved: number;
  unresolvedArtifacts: number;
  obligations: number;
  resolutionMethods: Record<string, number>;
  confidenceDistribution: {
    high: number; // >= 0.9
    medium: number; // >= 0.7
    low: number; // < 0.7
  };
  coverageRate: number; // % of changed files that matched contracts
  timestamp: string;
}

export interface ContractResolutionEvent {
  type: 'contract_resolution_complete' | 'contract_resolution_failed' | 'contract_obligation_created';
  workspaceId: string;
  signalEventId: string;
  data: any;
  timestamp: string;
}

// ============================================================================
// Telemetry Functions
// ============================================================================

/**
 * Calculate metrics from contract resolution result
 */
export function calculateResolutionMetrics(
  workspaceId: string,
  signalEventId: string,
  result: ContractResolutionResult,
  resolutionTimeMs: number,
  totalChangedFiles: number
): ContractResolutionMetrics {
  // Count resolution methods
  const resolutionMethods: Record<string, number> = {};
  result.resolvedContracts.forEach(rc => {
    resolutionMethods[rc.resolutionMethod] = (resolutionMethods[rc.resolutionMethod] || 0) + 1;
  });

  // Calculate confidence distribution
  const confidenceDistribution = {
    high: 0,
    medium: 0,
    low: 0,
  };

  result.resolvedContracts.forEach(rc => {
    if (rc.confidence >= 0.9) {
      confidenceDistribution.high++;
    } else if (rc.confidence >= 0.7) {
      confidenceDistribution.medium++;
    } else {
      confidenceDistribution.low++;
    }
  });

  // Calculate coverage rate
  const resolvedFiles = new Set(
    result.resolvedContracts.flatMap(rc => rc.triggeredBy.files || [])
  );
  const coverageRate = totalChangedFiles > 0
    ? (resolvedFiles.size / totalChangedFiles) * 100
    : 0;

  return {
    workspaceId,
    signalEventId,
    resolutionTimeMs,
    contractsResolved: result.resolvedContracts.length,
    unresolvedArtifacts: result.unresolvedArtifacts.length,
    obligations: result.obligations.length,
    resolutionMethods,
    confidenceDistribution,
    coverageRate,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Log contract resolution metrics (structured logging)
 */
export function logResolutionMetrics(metrics: ContractResolutionMetrics): void {
  console.log('[ContractResolution] Metrics:', JSON.stringify({
    workspaceId: metrics.workspaceId,
    signalEventId: metrics.signalEventId,
    resolutionTimeMs: metrics.resolutionTimeMs,
    contractsResolved: metrics.contractsResolved,
    unresolvedArtifacts: metrics.unresolvedArtifacts,
    obligations: metrics.obligations,
    resolutionMethods: metrics.resolutionMethods,
    confidenceDistribution: metrics.confidenceDistribution,
    coverageRate: `${metrics.coverageRate.toFixed(1)}%`,
    timestamp: metrics.timestamp,
  }, null, 2));
}

/**
 * Log contract resolution details (verbose)
 */
export function logResolutionDetails(
  result: ContractResolutionResult,
  verbose: boolean = false
): void {
  if (result.resolvedContracts.length > 0) {
    console.log(`[ContractResolution] Resolved ${result.resolvedContracts.length} contract(s):`);
    result.resolvedContracts.forEach((rc, i) => {
      console.log(`  ${i + 1}. ${rc.contractId} (${rc.resolutionMethod}, confidence: ${rc.confidence})`);
      if (verbose && rc.triggeredBy.files) {
        console.log(`     Files: ${rc.triggeredBy.files.join(', ')}`);
      }
    });
  }

  if (result.unresolvedArtifacts.length > 0) {
    console.log(`[ContractResolution] ${result.unresolvedArtifacts.length} unresolved artifact(s):`);
    result.unresolvedArtifacts.forEach((ua, i) => {
      console.log(`  ${i + 1}. ${ua.file} (${ua.reason})`);
      if (verbose && ua.candidates && ua.candidates.length > 0) {
        console.log(`     Candidates: ${ua.candidates.map(c => `${c.contractId} (${c.score})`).join(', ')}`);
      }
    });
  }

  if (result.obligations.length > 0) {
    console.log(`[ContractResolution] ${result.obligations.length} obligation(s) created:`);
    result.obligations.forEach((ob, i) => {
      console.log(`  ${i + 1}. ${ob.type}: ${ob.artifact}`);
      if (verbose) {
        console.log(`     Action: ${ob.suggestedAction}`);
      }
    });
  }
}

