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
  
  // Build declared capability map
  const declaredMap = new Map<string, Capability>();
  for (const cap of declaredCapabilities) {
    const key = `${cap.type}:${cap.target}`;
    declaredMap.set(key, cap);
  }
  
  // Build observed capability map
  const observedMap = new Map<string, typeof usage.capabilities[0]>();
  for (const cap of usage.capabilities) {
    const key = `${cap.type}:${cap.target}`;
    observedMap.set(key, cap);
  }
  
  // Detect undeclared usage (observed but not declared)
  for (const [key, observed] of observedMap) {
    if (!declaredMap.has(key)) {
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
  
  // Detect unused declarations (declared but not observed)
  for (const [key, declared] of declaredMap) {
    if (!observedMap.has(key)) {
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
 * Calculate severity based on capability type
 */
function calculateSeverity(capabilityType: CapabilityType): 'low' | 'medium' | 'high' | 'critical' {
  const criticalCapabilities: CapabilityType[] = ['db_admin', 'permission_grant', 'secret_write', 'infra_delete'];
  const highCapabilities: CapabilityType[] = ['db_write', 'permission_revoke', 'secret_read', 'infra_modify', 'code_delete'];
  const mediumCapabilities: CapabilityType[] = ['api_modify', 'api_delete', 'infra_create', 'code_modify'];
  
  if (criticalCapabilities.includes(capabilityType)) return 'critical';
  if (highCapabilities.includes(capabilityType)) return 'high';
  if (mediumCapabilities.includes(capabilityType)) return 'medium';
  return 'low';
}

