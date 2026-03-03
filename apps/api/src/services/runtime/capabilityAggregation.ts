/**
 * Capability Aggregation Service
 *
 * Aggregates runtime capability observations by service and time window.
 * This enables efficient Spec→Run verification by comparing declared vs observed capabilities.
 *
 * ARCHITECTURE:
 * - Input: Workspace ID, service, time window
 * - Processing: Aggregate observations at DB level (groupBy), then fetch distinct sources
 * - Output: ServiceCapabilityUsage (aggregated stats)
 *
 * USAGE:
 * ```typescript
 * const usage = await getServiceCapabilityUsage(workspaceId, 'user-service', 7); // Last 7 days
 * const drift = await detectCapabilityDrift(workspaceId, 'user-service', declaredCapabilities);
 * ```
 */

import { prisma } from '../../lib/db.js';
import type { CapabilityType, Capability } from '../../types/agentGovernance.js';
import type { ServiceCapabilityUsage, CapabilityDrift, ObservationSource } from '../../types/runtimeObservation.js';
import {
  calculateCapabilitySeverity,
  computeRecencyWeight,
  computeSourceConfidence,
  applyDecayAndConfidence,
} from './severityConstants.js';

/**
 * Capability types covered by at least one runtime data source.
 * P2-A: schema_modify is the only type with NO source coverage (no mapper emits it).
 * All other 17 types have ≥1 source (CloudTrail, GCP Audit, DB Log, Cost Explorer).
 */
const SOURCE_COVERED_CAPABILITIES = new Set<CapabilityType>([
  'db_read', 'db_write', 'db_admin',
  's3_read', 's3_write', 's3_delete',
  'api_endpoint', 'iam_modify',
  'infra_create', 'infra_modify', 'infra_delete',
  'secret_read', 'secret_write',
  'network_public', 'network_private',
  'cost_increase', 'deployment_modify',
]);

/**
 * Get aggregated capability usage for a service.
 * R2-FIX: Uses DB-level groupBy to avoid loading all observations into Node memory.
 * P1-A: accepts optional mergedAt to anchor the observation window at merge time
 * rather than using a flat rolling window (which conflates pre-merge staging noise
 * with post-merge production drift).
 */
export async function getServiceCapabilityUsage(
  workspaceId: string,
  service: string,
  windowDays: number = 7,
  mergedAt?: Date,
): Promise<ServiceCapabilityUsage> {
  const endDate = new Date();
  let startDate: Date;
  if (mergedAt) {
    // Start 1 hour before merge to include any last-minute pre-merge observations,
    // but cap the lookback at windowDays to avoid unbounded queries.
    const mergeAnchor = new Date(mergedAt.getTime() - 60 * 60 * 1000);
    const maxLookback = new Date();
    maxLookback.setDate(maxLookback.getDate() - windowDays);
    startDate = mergeAnchor > maxLookback ? mergeAnchor : maxLookback;
  } else {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - windowDays);
  }

  const whereClause = {
    workspaceId,
    service,
    observedAt: { gte: startDate, lte: endDate },
  };

  // R2-FIX: Aggregate at DB level — avoids O(N) memory for large observation sets.
  // Two queries: (1) grouped counts + min/max timestamps, (2) distinct sources per group.
  const [grouped, sourceRows] = await Promise.all([
    prisma.runtimeCapabilityObservation.groupBy({
      by: ['capabilityType', 'capabilityTarget'],
      where: whereClause,
      _count: { id: true },
      _min: { observedAt: true },
      _max: { observedAt: true },
    }),
    prisma.runtimeCapabilityObservation.findMany({
      where: whereClause,
      select: { capabilityType: true, capabilityTarget: true, source: true },
      distinct: ['capabilityType', 'capabilityTarget', 'source'],
    }),
  ]);

  // Build sources map: "type:target" → Set<ObservationSource>
  const sourcesMap = new Map<string, Set<ObservationSource>>();
  for (const row of sourceRows) {
    const key = `${row.capabilityType}:${row.capabilityTarget}`;
    if (!sourcesMap.has(key)) sourcesMap.set(key, new Set());
    sourcesMap.get(key)!.add(row.source as ObservationSource);
  }

  const capabilities = grouped.map(g => {
    const lastSeen = g._max.observedAt!;
    const sources = Array.from(sourcesMap.get(`${g.capabilityType}:${g.capabilityTarget}`) ?? []);
    return {
      type: g.capabilityType as CapabilityType,
      target: g.capabilityTarget,
      count: g._count.id,
      firstSeen: g._min.observedAt!,
      lastSeen,
      sources,
      // Intelligence: decay + confidence computed at aggregation time so callers
      // can modulate alert priority without re-querying the DB.
      recencyWeight: computeRecencyWeight(lastSeen),
      confidence: computeSourceConfidence(sources),
    };
  });

  return {
    service,
    timeWindow: { start: startDate, end: endDate },
    capabilities,
  };
}

/**
 * Detect capability drift between declared and observed capabilities.
 * P1-A: optional mergedAt anchors the observation window to post-merge production.
 * P2-A: unused declarations include observationReason to distinguish "not seen"
 *        from "data source can't see this capability type at all".
 */
export async function detectCapabilityDrift(
  workspaceId: string,
  service: string,
  declaredCapabilities: Capability[],
  windowDays: number = 7,
  mergedAt?: Date,
): Promise<CapabilityDrift[]> {
  const usage = await getServiceCapabilityUsage(workspaceId, service, windowDays, mergedAt);
  const drifts: CapabilityDrift[] = [];

  // Build declared capability map.
  // Supports wildcard target '*' (e.g. requestedCapabilities string array converted to Capability-like objects).
  // Key is `type:target`; a key of `type:*` acts as a type-level wildcard.
  const declaredMap = new Map<string, { type: CapabilityType; target: string }>();
  for (const cap of declaredCapabilities) {
    const capAny = cap as any;
    const target: string = capAny.target ?? capAny.resource ?? '*';
    const key = `${cap.type}:${target}`;
    declaredMap.set(key, { type: cap.type, target });
  }

  // Build observed capability map
  const observedMap = new Map<string, typeof usage.capabilities[0]>();
  for (const cap of usage.capabilities) {
    const key = `${cap.type}:${cap.target}`;
    observedMap.set(key, cap);
  }

  /**
   * Helper: check whether an observed key is covered by a declared entry.
   * - Exact match: `db_read:production.users` declared
   * - Wildcard match: `db_read:*` declared (covers all targets for that type)
   */
  function isDeclared(observedType: CapabilityType, observedTarget: string): boolean {
    if (declaredMap.has(`${observedType}:${observedTarget}`)) return true;
    if (declaredMap.has(`${observedType}:*`)) return true;
    return false;
  }

  /**
   * Helper: check whether a declared entry has at least one matching observation.
   * - Exact: look for `type:target` key in observedMap
   * - Wildcard (`target === '*'`): look for any observed key starting with `type:`
   */
  function isObserved(declaredType: CapabilityType, declaredTarget: string): boolean {
    if (declaredTarget !== '*') return observedMap.has(`${declaredType}:${declaredTarget}`);
    return Array.from(observedMap.keys()).some(k => k.startsWith(`${declaredType}:`));
  }

  // Detect undeclared usage (observed but not covered by any declared capability)
  for (const [, observed] of observedMap) {
    if (!isDeclared(observed.type, observed.target)) {
      const baseSeverity = calculateCapabilitySeverity(observed.type);
      // Apply decay + confidence to compute effective alert priority.
      // A critical capability observed 6 days ago by a low-confidence source
      // is downgraded — still minimum medium (privilege expansion floor).
      const effectiveSeverity = applyDecayAndConfidence(
        baseSeverity,
        observed.recencyWeight,
        observed.confidence,
      );
      drifts.push({
        service,
        driftType: 'undeclared_usage',
        capabilityType: observed.type,
        capabilityTarget: observed.target,
        observedAt: observed.lastSeen,
        severity: baseSeverity,          // raw — for audit / chain-of-custody
        effectiveSeverity,               // decay+confidence adjusted — for alerting
        recencyWeight: observed.recencyWeight,
        confidence: observed.confidence,
        evidence: [{
          source: observed.sources[0],
          timestamp: observed.lastSeen,
          metadata: { count: observed.count, sources: observed.sources },
        }],
      });
    }
  }

  // Detect unused declarations (declared but not observed at runtime)
  // P2-A: tag observationReason to distinguish a data-coverage gap from a genuine "not seen"
  for (const [, declared] of declaredMap) {
    if (!isObserved(declared.type, declared.target)) {
      drifts.push({
        service,
        driftType: 'unused_declaration',
        capabilityType: declared.type,
        capabilityTarget: declared.target,
        severity: 'low', // Unused declarations are low severity
        evidence: [],
        observationReason: SOURCE_COVERED_CAPABILITIES.has(declared.type)
          ? 'not_observed_in_window'
          : 'source_coverage_gap',
      });
    }
  }

  return drifts;
}
