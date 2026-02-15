/**
 * IntegrityFinding Repository
 * 
 * CRUD operations for IntegrityFinding model
 * Handles database persistence for contract validation findings
 */

import { prisma } from '../../lib/db.js';
import type { IntegrityFinding } from './types.js';

// ======================================================================
// CREATE OPERATIONS
// ======================================================================

/**
 * Create a single IntegrityFinding
 */
export async function createFinding(finding: IntegrityFinding): Promise<void> {
  await prisma.integrityFinding.create({
    data: {
      workspaceId: finding.workspaceId,
      id: finding.id,
      contractId: finding.contractId,
      invariantId: finding.invariantId,
      driftType: finding.driftType,
      domains: finding.domains,
      severity: finding.severity,
      compared: finding.compared as any,
      evidence: finding.evidence as any,
      confidence: finding.confidence,
      impact: finding.impact,
      band: finding.band,
      recommendedAction: finding.recommendedAction,
      ownerRouting: finding.ownerRouting as any,
      driftCandidateId: finding.driftCandidateId,
      createdAt: finding.createdAt,
    },
  });
}

/**
 * Create multiple IntegrityFindings in a single transaction
 */
export async function createFindings(findings: IntegrityFinding[]): Promise<void> {
  if (findings.length === 0) {
    return;
  }

  await prisma.integrityFinding.createMany({
    data: findings.map(f => ({
      workspaceId: f.workspaceId,
      id: f.id,
      contractId: f.contractId,
      invariantId: f.invariantId,
      driftType: f.driftType,
      domains: f.domains,
      severity: f.severity,
      compared: f.compared as any,
      evidence: f.evidence as any,
      confidence: f.confidence,
      impact: f.impact,
      band: f.band,
      recommendedAction: f.recommendedAction,
      ownerRouting: f.ownerRouting as any,
      driftCandidateId: f.driftCandidateId,
      createdAt: f.createdAt,
    })),
  });
}

// ======================================================================
// READ OPERATIONS
// ======================================================================

/**
 * Find findings by contract ID
 */
export async function findByContractId(
  workspaceId: string,
  contractId: string
): Promise<IntegrityFinding[]> {
  const findings = await prisma.integrityFinding.findMany({
    where: {
      workspaceId,
      contractId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return findings.map(f => ({
    ...f,
    driftType: f.driftType as any,
    severity: f.severity as any,
    band: f.band as any,
    recommendedAction: f.recommendedAction as any,
    driftCandidateId: f.driftCandidateId ?? undefined,
    compared: f.compared as any,
    evidence: f.evidence as any,
    ownerRouting: f.ownerRouting as any,
  }));
}

/**
 * Find findings by band (pass/warn/fail)
 */
export async function findByBand(
  workspaceId: string,
  band: 'pass' | 'warn' | 'fail'
): Promise<IntegrityFinding[]> {
  const findings = await prisma.integrityFinding.findMany({
    where: {
      workspaceId,
      band,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return findings.map(f => ({
    ...f,
    driftType: f.driftType as any,
    severity: f.severity as any,
    band: f.band as any,
    recommendedAction: f.recommendedAction as any,
    driftCandidateId: f.driftCandidateId ?? undefined,
    compared: f.compared as any,
    evidence: f.evidence as any,
    ownerRouting: f.ownerRouting as any,
  }));
}

/**
 * Find findings for a specific signal event (PR, incident, etc.)
 * This requires querying through ArtifactSnapshot to find the signalEventId
 */
export async function findBySignalEvent(
  workspaceId: string,
  signalEventId: string
): Promise<IntegrityFinding[]> {
  // First, find all artifact snapshots for this signal event
  const snapshots = await prisma.artifactSnapshot.findMany({
    where: {
      workspaceId,
      triggeredBy: {
        path: ['signalEventId'],
        equals: signalEventId,
      },
    },
    select: {
      id: true,
    },
  });

  const snapshotIds = snapshots.map(s => s.id);

  if (snapshotIds.length === 0) {
    return [];
  }

  // Then, find all findings that reference these snapshots
  // Note: Prisma doesn't support 'in' operator for JSON path queries
  // We'll fetch all findings and filter in memory
  const allFindings = await prisma.integrityFinding.findMany({
    where: {
      workspaceId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Filter findings that reference any of the snapshot IDs
  const findings = allFindings.filter(f => {
    const compared = f.compared as any;
    const leftSnapshotId = compared?.left?.snapshotId;
    const rightSnapshotId = compared?.right?.snapshotId;
    return snapshotIds.includes(leftSnapshotId) || snapshotIds.includes(rightSnapshotId);
  });

  return findings.map(f => ({
    ...f,
    driftType: f.driftType as any,
    severity: f.severity as any,
    band: f.band as any,
    recommendedAction: f.recommendedAction as any,
    driftCandidateId: f.driftCandidateId ?? undefined,
    compared: f.compared as any,
    evidence: f.evidence as any,
    ownerRouting: f.ownerRouting as any,
  }));
}

// ======================================================================
// UPDATE OPERATIONS
// ======================================================================

/**
 * Link a finding to a DriftCandidate (when escalating to Track 2)
 */
export async function linkToDriftCandidate(
  workspaceId: string,
  findingId: string,
  driftCandidateId: string
): Promise<void> {
  await prisma.integrityFinding.update({
    where: {
      workspaceId_id: {
        workspaceId,
        id: findingId,
      },
    },
    data: {
      driftCandidateId,
    },
  });
}

// ======================================================================
// AGGREGATE OPERATIONS
// ======================================================================

/**
 * Contract Policy type (subset of Prisma model)
 */
export interface ContractPolicy {
  mode: string; // 'warn_only' | 'block_high_critical' | 'block_all_critical'
  criticalThreshold?: number;
  highThreshold?: number;
  mediumThreshold?: number;
}

/**
 * Calculate risk tier from findings
 * Returns: { band: 'pass' | 'warn' | 'fail', criticalCount, highCount, mediumCount, lowCount }
 *
 * @param findings - Array of IntegrityFindings to evaluate
 * @param policy - Optional ContractPolicy to enforce (if not provided, uses default behavior)
 */
export function calculateRiskTier(
  findings: IntegrityFinding[],
  policy?: ContractPolicy | null
): {
  band: 'pass' | 'warn' | 'fail';
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  totalCount: number;
  policyMode?: string;
} {
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const highCount = findings.filter(f => f.severity === 'high').length;
  const mediumCount = findings.filter(f => f.severity === 'medium').length;
  const lowCount = findings.filter(f => f.severity === 'low').length;

  // Determine band based on policy mode (if provided)
  let band: 'pass' | 'warn' | 'fail';

  if (policy) {
    // Policy-based enforcement
    const mode = policy.mode;

    if (mode === 'warn_only') {
      // warn_only: Never block, only warn or pass
      if (criticalCount > 0 || highCount > 0 || mediumCount > 0) {
        band = 'warn';
      } else {
        band = 'pass';
      }
    } else if (mode === 'block_high_critical') {
      // block_high_critical: Block on critical OR high, warn on medium
      if (criticalCount > 0 || highCount > 0) {
        band = 'fail';
      } else if (mediumCount > 0) {
        band = 'warn';
      } else {
        band = 'pass';
      }
    } else if (mode === 'block_all_critical') {
      // block_all_critical: Block only on critical, warn on high/medium
      if (criticalCount > 0) {
        band = 'fail';
      } else if (highCount > 0 || mediumCount > 0) {
        band = 'warn';
      } else {
        band = 'pass';
      }
    } else {
      // Unknown mode - fall back to default behavior
      console.warn(`[calculateRiskTier] Unknown policy mode: ${mode}, using default behavior`);
      band = getDefaultBand(criticalCount, highCount, mediumCount);
    }
  } else {
    // No policy - use default behavior (backward compatibility)
    band = getDefaultBand(criticalCount, highCount, mediumCount);
  }

  return {
    band,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    totalCount: findings.length,
    policyMode: policy?.mode,
  };
}

/**
 * Default band determination logic (used when no policy is provided)
 * This maintains backward compatibility with existing behavior
 */
function getDefaultBand(
  criticalCount: number,
  highCount: number,
  mediumCount: number
): 'pass' | 'warn' | 'fail' {
  if (criticalCount > 0) {
    return 'fail';
  } else if (highCount > 0) {
    return 'warn';
  } else if (mediumCount > 0) {
    return 'warn';
  } else {
    return 'pass';
  }
}

/**
 * Get findings summary for a contract
 */
export async function getFindingsSummary(
  workspaceId: string,
  contractId: string
): Promise<{
  total: number;
  byBand: { pass: number; warn: number; fail: number };
  bySeverity: { critical: number; high: number; medium: number; low: number };
  recent: IntegrityFinding[];
}> {
  const findings = await findByContractId(workspaceId, contractId);

  const byBand = {
    pass: findings.filter(f => f.band === 'pass').length,
    warn: findings.filter(f => f.band === 'warn').length,
    fail: findings.filter(f => f.band === 'fail').length,
  };

  const bySeverity = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
  };

  const recent = findings.slice(0, 10);

  return {
    total: findings.length,
    byBand,
    bySeverity,
    recent,
  };
}
