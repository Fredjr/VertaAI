/**
 * Capability Aggregation Service
 * 
 * Aggregates runtime capability observations by service and time window.
 * This enables efficient Spec→Run verification by comparing declared vs observed capabilities.
 * 
 * ARCHITECTURE:
 * - Input: Workspace ID, service, time window
 * - Processing: Aggregate observations by capability type + target
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

/**
 * Get aggregated capability usage for a service
 */
export async function getServiceCapabilityUsage(
  workspaceId: string,
  service: string,
  windowDays: number = 7
): Promise<ServiceCapabilityUsage> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - windowDays);
  
  // Fetch all observations in time window
  const observations = await prisma.runtimeCapabilityObservation.findMany({
    where: {
      workspaceId,
      service,
      observedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: {
      observedAt: 'asc',
    },
  });
  
  // Aggregate by capability type + target
  const capabilityMap = new Map<string, {
    type: CapabilityType;
    target: string;
    count: number;
    firstSeen: Date;
    lastSeen: Date;
    sources: Set<ObservationSource>;
  }>();
  
  for (const obs of observations) {
    const key = `${obs.capabilityType}:${obs.capabilityTarget}`;
    const existing = capabilityMap.get(key);
    
    if (existing) {
      existing.count++;
      existing.lastSeen = obs.observedAt;
      existing.sources.add(obs.source as ObservationSource);
    } else {
      capabilityMap.set(key, {
        type: obs.capabilityType as CapabilityType,
        target: obs.capabilityTarget,
        count: 1,
        firstSeen: obs.observedAt,
        lastSeen: obs.observedAt,
        sources: new Set([obs.source as ObservationSource]),
      });
    }
  }
  
  // Convert to array
  const capabilities = Array.from(capabilityMap.values()).map(cap => ({
    type: cap.type,
    target: cap.target,
    count: cap.count,
    firstSeen: cap.firstSeen,
    lastSeen: cap.lastSeen,
    sources: Array.from(cap.sources),
  }));
  
  return {
    service,
    timeWindow: {
      start: startDate,
      end: endDate,
    },
    capabilities,
  };
}

/**
 * Detect capability drift between declared and observed capabilities
 */
export async function detectCapabilityDrift(
  workspaceId: string,
  service: string,
  declaredCapabilities: Capability[],
  windowDays: number = 7
): Promise<CapabilityDrift[]> {
  const usage = await getServiceCapabilityUsage(workspaceId, service, windowDays);
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
      drifts.push({
        service,
        driftType: 'undeclared_usage',
        capabilityType: observed.type,
        capabilityTarget: observed.target,
        observedAt: observed.lastSeen,
        severity: calculateSeverity(observed.type),
        evidence: [{
          source: observed.sources[0],
          timestamp: observed.lastSeen,
          metadata: { count: observed.count, sources: observed.sources },
        }],
      });
    }
  }

  // Detect unused declarations (declared but not observed at runtime)
  for (const [, declared] of declaredMap) {
    if (!isObserved(declared.type, declared.target)) {
      drifts.push({
        service,
        driftType: 'unused_declaration',
        capabilityType: declared.type,
        capabilityTarget: declared.target,
        severity: 'low', // Unused declarations are low severity
        evidence: [],
      });
    }
  }

  return drifts;
}

/**
 * Calculate severity based on capability type (canonical 18-type lattice).
 * Any undeclared usage is treated as minimum medium — privilege expansion is never low.
 */
function calculateSeverity(capabilityType: CapabilityType): 'low' | 'medium' | 'high' | 'critical' {
  // Critical: immediate security review required
  const criticalCapabilities: CapabilityType[] = ['iam_modify', 'secret_write', 'db_admin', 'infra_delete', 'deployment_modify'];
  // High: sensitive capability — escalate to security
  const highCapabilities: CapabilityType[] = ['s3_delete', 's3_write', 'schema_modify', 'network_public', 'infra_create', 'infra_modify', 'secret_read'];

  if (criticalCapabilities.includes(capabilityType)) return 'critical';
  if (highCapabilities.includes(capabilityType)) return 'high';
  // Any other undeclared usage → medium (privilege expansion minimum)
  return 'medium';
}

