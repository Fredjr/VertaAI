/**
 * SignalJoiner - Cross-source signal correlation service
 * 
 * Correlates signals from different sources (GitHub PRs, PagerDuty incidents)
 * to boost confidence when multiple sources indicate the same drift.
 * 
 * Example: A GitHub PR merged shortly before a PagerDuty incident was resolved
 * suggests the PR was a fix, giving higher confidence that related docs need updating.
 */

import { prisma } from '../../lib/db.js';

export interface CorrelatedSignal {
  id: string;
  sourceType: string;
  occurredAt: Date;
  summary: string;
  service: string | null;
  relevanceScore: number;
}

export interface JoinResult {
  /** List of correlated signals from different sources */
  correlatedSignals: CorrelatedSignal[];
  /** Confidence boost to apply (0 to 0.15) */
  confidenceBoost: number;
  /** Human-readable reason for correlation */
  joinReason: string | null;
  /** Whether this is a multi-source correlation */
  isMultiSource: boolean;
}

/**
 * Find and correlate signals for the same service within a time window
 * 
 * @param workspaceId - Workspace to search within
 * @param primarySignalId - The signal event we're correlating from
 * @param service - Service name to match (null returns empty result)
 * @param timeWindowHours - How far back to look for correlations (default 7 days)
 */
export async function joinSignals(
  workspaceId: string,
  primarySignalId: string,
  service: string | null,
  timeWindowHours: number = 168 // 7 days
): Promise<JoinResult> {
  // No service = no correlation possible
  if (!service) {
    return { correlatedSignals: [], confidenceBoost: 0, joinReason: null, isMultiSource: false };
  }

  // Fetch the primary signal
  const primarySignal = await prisma.signalEvent.findUnique({
    where: { workspaceId_id: { workspaceId, id: primarySignalId } },
  });

  if (!primarySignal) {
    return { correlatedSignals: [], confidenceBoost: 0, joinReason: null, isMultiSource: false };
  }

  // Calculate time window
  const windowStart = new Date(
    primarySignal.occurredAt.getTime() - timeWindowHours * 60 * 60 * 1000
  );
  const windowEnd = new Date(
    primarySignal.occurredAt.getTime() + timeWindowHours * 60 * 60 * 1000
  );

  // Find signals for the same service within the time window
  const relatedSignals = await prisma.signalEvent.findMany({
    where: {
      workspaceId,
      service,
      id: { not: primarySignalId },
      occurredAt: {
        gte: windowStart,
        lte: windowEnd,
      },
    },
    orderBy: { occurredAt: 'desc' },
    take: 10, // Limit to prevent excessive correlation
  });

  // Score each signal's relevance based on time proximity
  const correlatedSignals: CorrelatedSignal[] = relatedSignals.map(signal => {
    const timeDelta = Math.abs(
      primarySignal.occurredAt.getTime() - signal.occurredAt.getTime()
    );
    const hoursApart = timeDelta / (60 * 60 * 1000);

    // Closer in time = higher relevance (1.0 at same time, 0.0 at window edge)
    const relevanceScore = Math.max(0, 1 - hoursApart / timeWindowHours);

    // Extract summary from signal's extracted data
    const extracted = signal.extracted as Record<string, any> || {};
    const summary = extracted.title || extracted.prTitle || extracted.summary || '';

    return {
      id: signal.id,
      sourceType: signal.sourceType,
      occurredAt: signal.occurredAt,
      summary,
      service: signal.service,
      relevanceScore,
    };
  });

  // Calculate confidence boost based on source types
  const sourceTypes = new Set([
    primarySignal.sourceType,
    ...correlatedSignals.map(s => s.sourceType),
  ]);

  const hasGitHub = sourceTypes.has('github_pr');
  const hasPagerDuty = sourceTypes.has('pagerduty_incident');

  let confidenceBoost = 0;
  let joinReason: string | null = null;
  const isMultiSource = sourceTypes.size > 1;

  if (hasGitHub && hasPagerDuty) {
    // Strong correlation: PR merged around incident resolution
    confidenceBoost = 0.15;
    joinReason = 'PR merged near PagerDuty incident resolution - high confidence fix';
  } else if (correlatedSignals.length >= 3) {
    // Multiple signals from same source
    confidenceBoost = 0.10;
    joinReason = `${correlatedSignals.length} related signals found for service '${service}'`;
  } else if (correlatedSignals.length >= 1 && correlatedSignals[0]) {
    // At least one related signal
    confidenceBoost = 0.05;
    joinReason = `Related signal found: ${correlatedSignals[0].summary.slice(0, 50)}`;
  }

  console.log(
    `[SignalJoiner] Correlated ${correlatedSignals.length} signals for service '${service}', ` +
    `boost=${confidenceBoost}, multi-source=${isMultiSource}`
  );

  return {
    correlatedSignals,
    confidenceBoost,
    joinReason,
    isMultiSource,
  };
}

/**
 * Get a summary of all signals that contributed to a drift
 */
export function summarizeCorrelatedSignals(signals: CorrelatedSignal[]): string {
  if (signals.length === 0) return '';

  const bySource = signals.reduce((acc, s) => {
    acc[s.sourceType] = (acc[s.sourceType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const parts = Object.entries(bySource).map(
    ([type, count]) => `${count} ${type.replace('_', ' ')}${count > 1 ? 's' : ''}`
  );

  return `Correlated with ${parts.join(', ')}`;
}

