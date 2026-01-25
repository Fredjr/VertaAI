/**
 * Deduplication Validator
 * 
 * Checks for duplicate drift candidates based on fingerprints.
 * Prevents sending multiple notifications for the same underlying issue.
 * 
 * @see IMPLEMENTATION_PLAN.md Section 3.4
 */

import { prisma } from '../../lib/db.js';
import { computeDriftFingerprint, extractKeyTokens } from '../dedup/fingerprint.js';

export interface DedupResult {
  isDuplicate: boolean;
  existingDriftId?: string;
  shouldNotify: boolean;
  reason?: string;
  confidenceDelta?: number;
}

export interface DedupInput {
  workspaceId: string;
  service: string | null;
  driftType: string;
  driftDomains: string[];
  docId: string;
  evidence: string;
  newConfidence: number;
}

/**
 * Check if a drift candidate is a duplicate of an existing one.
 * Returns whether to notify and the existing drift ID if found.
 */
export async function checkDuplicateDrift(input: DedupInput): Promise<DedupResult> {
  const keyTokens = extractKeyTokens(input.evidence);
  const fingerprint = computeDriftFingerprint({
    workspaceId: input.workspaceId,
    service: input.service,
    driftType: input.driftType,
    driftDomains: input.driftDomains,
    docId: input.docId,
    keyTokens,
  });

  // Check for existing drift with same fingerprint that's not in a terminal state
  const existing = await prisma.driftCandidate.findFirst({
    where: {
      workspaceId: input.workspaceId,
      fingerprint,
      state: {
        notIn: ['COMPLETED', 'FAILED', 'REJECTED'],
      },
    },
    include: {
      patchProposals: {
        select: { id: true, status: true },
      },
    },
  });

  if (!existing) {
    return {
      isDuplicate: false,
      shouldNotify: true,
    };
  }

  // Same fingerprint exists - check if we should re-notify
  const existingConfidence = existing.confidence || 0;
  const confidenceDelta = input.newConfidence - existingConfidence;

  // Re-notify if new evidence significantly increases confidence (≥15%)
  if (confidenceDelta >= 0.15) {
    return {
      isDuplicate: true,
      existingDriftId: existing.id,
      shouldNotify: true,
      reason: `Confidence increased by ${(confidenceDelta * 100).toFixed(0)}%`,
      confidenceDelta,
    };
  }

  // Check if existing drift has a pending proposal
  const hasPendingProposal = existing.patchProposals.some(
    (p: { id: string; status: string }) => ['proposed', 'sent'].includes(p.status)
  );

  if (hasPendingProposal) {
    return {
      isDuplicate: true,
      existingDriftId: existing.id,
      shouldNotify: false,
      reason: 'Duplicate drift with pending proposal',
      confidenceDelta,
    };
  }

  // Don't re-notify for minor confidence changes
  return {
    isDuplicate: true,
    existingDriftId: existing.id,
    shouldNotify: false,
    reason: 'Duplicate drift already pending',
    confidenceDelta,
  };
}

/**
 * Merge evidence from a new signal into an existing drift candidate.
 * Updates the confidence and correlated signals.
 */
export async function mergeIntoExistingDrift(
  workspaceId: string,
  existingDriftId: string,
  newSignalId: string,
  newConfidence: number,
  newEvidence: string
): Promise<void> {
  const existing = await prisma.driftCandidate.findUnique({
    where: {
      workspaceId_id: { workspaceId, id: existingDriftId },
    },
  });

  if (!existing) return;

  const correlatedSignals = (existing.correlatedSignals as string[]) || [];
  if (!correlatedSignals.includes(newSignalId)) {
    correlatedSignals.push(newSignalId);
  }

  // Boost confidence based on correlated signals (max +0.15)
  const correlationBoost = Math.min(correlatedSignals.length * 0.05, 0.15);
  const newTotalConfidence = Math.min((existing.confidence || 0) + correlationBoost, 1.0);

  await prisma.driftCandidate.update({
    where: {
      workspaceId_id: { workspaceId, id: existingDriftId },
    },
    data: {
      correlatedSignals,
      correlationBoost,
      confidence: newTotalConfidence,
      evidenceSummary: existing.evidenceSummary
        ? `${existing.evidenceSummary}\n\n---\n\n${newEvidence}`
        : newEvidence,
    },
  });
}

