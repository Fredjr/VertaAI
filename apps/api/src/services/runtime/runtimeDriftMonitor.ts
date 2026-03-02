/**
 * Runtime Drift Monitor (Track B)
 *
 * Monitors runtime capability observations and detects drift from declared intent.
 * This is the Track B (async, post-deploy) version of INTENT_RUNTIME_PARITY.
 *
 * ARCHITECTURE:
 * - Runs as scheduled job (every 1 hour)
 * - Queries all workspaces with runtime observations
 * - For each service, compares declared capabilities (from merged intent artifacts) to observed capabilities
 * - Creates DriftPlans for detected drift
 * - Sends PagerDuty alerts for critical drift
 *
 * DIFFERENCE FROM TRACK A:
 * - Track A (AUTO_INVOKED_COMPARATORS): Runs during PR evaluation, checks existing services
 * - Track B (this file): Runs post-deploy, monitors production continuously
 *
 * USAGE:
 * ```typescript
 * // Scheduled job (QStash, cron, etc.)
 * await runRuntimeDriftMonitor();
 * ```
 */

import { prisma } from '../../lib/db.js';
import { detectCapabilityDrift } from './capabilityAggregation.js';
import type { Capability } from '../../types/agentGovernance.js';

/**
 * Runtime drift detection result
 */
export interface RuntimeDriftResult {
  workspaceId: string;
  service: string;
  driftsDetected: number;
  undeclaredUsage: number;
  unusedDeclarations: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  driftPlanCreated: boolean;
  pagerdutyAlertSent: boolean;
}

/**
 * Run runtime drift monitoring for all workspaces
 * This is the main entry point for Track B runtime monitoring
 */
export async function runRuntimeDriftMonitor(): Promise<RuntimeDriftResult[]> {
  console.log('[RuntimeDriftMonitor] Starting runtime drift monitoring...');

  const results: RuntimeDriftResult[] = [];

  // Step 1: Get all workspaces with runtime observations
  const workspacesWithObservations = await prisma.runtimeCapabilityObservation.groupBy({
    by: ['workspaceId'],
    _count: {
      id: true,
    },
  });

  console.log(`[RuntimeDriftMonitor] Found ${workspacesWithObservations.length} workspaces with observations`);

  // Step 2: For each workspace, detect drift
  for (const { workspaceId } of workspacesWithObservations) {
    try {
      const workspaceResults = await detectDriftForWorkspace(workspaceId);
      results.push(...workspaceResults);
    } catch (error: any) {
      console.error(`[RuntimeDriftMonitor] Error processing workspace ${workspaceId}:`, error.message);
    }
  }

  console.log(`[RuntimeDriftMonitor] Completed. Processed ${results.length} services`);
  return results;
}

/**
 * Detect drift for a specific workspace
 */
async function detectDriftForWorkspace(workspaceId: string): Promise<RuntimeDriftResult[]> {
  const results: RuntimeDriftResult[] = [];

  // Step 1: Get all services with runtime observations
  const servicesWithObservations = await prisma.runtimeCapabilityObservation.groupBy({
    by: ['service'],
    where: { workspaceId },
    _count: { id: true },
  });

  console.log(`[RuntimeDriftMonitor] Workspace ${workspaceId}: ${servicesWithObservations.length} services`);

  // Step 2: For each service, get the latest merged intent artifact
  for (const { service } of servicesWithObservations) {
    try {
      const result = await detectDriftForService(workspaceId, service);
      if (result) {
        results.push(result);
      }
    } catch (error: any) {
      console.error(`[RuntimeDriftMonitor] Error processing service ${service}:`, error.message);
    }
  }

  return results;
}

/**
 * Detect drift for a specific service
 */
async function detectDriftForService(
  workspaceId: string,
  service: string
): Promise<RuntimeDriftResult | null> {
  // Step 1: Get the latest merged intent artifact for this service
  const intentArtifact = await prisma.intentArtifact.findFirst({
    where: {
      workspaceId,
      affectedServices: {
        has: service,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!intentArtifact) {
    console.log(`[RuntimeDriftMonitor] No intent artifact found for service ${service}`);
    return null;
  }

  // Step 2: Extract declared capabilities from requestedCapabilities (stored as string[] in DB)
  // The DB stores requestedCapabilities as a string[] like ["db_read", "db_write", ...]
  // We convert each string to a Capability-like object with wildcard target ('*')
  // so that comparisons match any observed target for that capability type.
  const rawRequested: any[] = (intentArtifact.requestedCapabilities as any) || [];
  const declaredCapabilities: Capability[] = rawRequested.map((cap: any) => {
    if (typeof cap === 'string') {
      return { type: cap, target: '*' } as unknown as Capability;
    }
    // Already a Capability object (type + resource or target)
    return { type: cap.type, target: cap.target ?? cap.resource ?? '*' } as unknown as Capability;
  });

  if (declaredCapabilities.length === 0) {
    console.log(`[RuntimeDriftMonitor] No declared capabilities for service ${service}`);
    return null;
  }

  // Step 3: Detect drift (last 7 days)
  const drifts = await detectCapabilityDrift(workspaceId, service, declaredCapabilities, 7);

  if (drifts.length === 0) {
    console.log(`[RuntimeDriftMonitor] No drift detected for service ${service}`);
    return null;
  }

  // Step 4: Categorize drifts
  const undeclaredUsage = drifts.filter(d => d.driftType === 'undeclared_usage');
  const unusedDeclarations = drifts.filter(d => d.driftType === 'unused_declaration');

  // Step 5: Calculate severity
  const severity = calculateDriftSeverity(drifts);

  console.log(`[RuntimeDriftMonitor] Service ${service}: ${drifts.length} drifts (${undeclaredUsage.length} undeclared, ${unusedDeclarations.length} unused), severity: ${severity}`);

  // Step 6: Create DriftPlan if drift detected
  const driftPlanCreated = await createDriftPlanForRuntimeDrift(
    workspaceId,
    service,
    intentArtifact,
    drifts
  );

  // Step 7: Send PagerDuty alert for critical drift
  const pagerdutyAlertSent = severity === 'critical'
    ? await sendPagerDutyAlert(workspaceId, service, drifts)
    : false;

  return {
    workspaceId,
    service,
    driftsDetected: drifts.length,
    undeclaredUsage: undeclaredUsage.length,
    unusedDeclarations: unusedDeclarations.length,
    severity,
    driftPlanCreated,
    pagerdutyAlertSent,
  };
}

// Canonical severity tiers (18-type lattice only)
const CRITICAL_CAPABILITIES = ['iam_modify', 'secret_write', 'db_admin', 'infra_delete', 'deployment_modify'];
const HIGH_CAPABILITIES = ['s3_delete', 's3_write', 'schema_modify', 'network_public', 'infra_create', 'infra_modify', 'secret_read'];

/**
 * Deterministic severity — privilege expansion is NEVER low.
 * Low is reserved exclusively for clusters with zero undeclared usage.
 */
function calculateDriftSeverity(drifts: any[]): 'critical' | 'high' | 'medium' | 'low' {
  const undeclaredUsage = drifts.filter(d => d.driftType === 'undeclared_usage');
  if (undeclaredUsage.length === 0) return 'low'; // Only unused declarations
  if (undeclaredUsage.some(d => CRITICAL_CAPABILITIES.includes(d.capabilityType))) return 'critical';
  if (undeclaredUsage.some(d => HIGH_CAPABILITIES.includes(d.capabilityType))) return 'high';
  return 'medium'; // Any undeclared usage → minimum medium (privilege expansion)
}

/**
 * Human-readable explanation of why this severity was assigned.
 */
function buildSeverityRationale(undeclaredUsage: any[], severity: string): string {
  if (undeclaredUsage.length === 0) return 'No undeclared capabilities; only over-scoped declarations.';
  const criticalCaps = undeclaredUsage.filter(d => CRITICAL_CAPABILITIES.includes(d.capabilityType));
  const highCaps = undeclaredUsage.filter(d => HIGH_CAPABILITIES.includes(d.capabilityType));
  if (criticalCaps.length > 0) {
    return `Critical: undeclared ${criticalCaps.map((d: any) => d.capabilityType).join(', ')} detected — requires immediate security review.`;
  }
  if (highCaps.length > 0) {
    return `High: undeclared ${highCaps.map((d: any) => d.capabilityType).join(', ')} — sensitive capability used without spec declaration.`;
  }
  return `Medium: ${undeclaredUsage.length} capability(ies) used at runtime without intent declaration — privilege expansion detected.`;
}

/**
 * Create DriftCluster for runtime drift
 */
async function createDriftPlanForRuntimeDrift(
  workspaceId: string,
  service: string,
  intentArtifact: any,
  drifts: any[]
): Promise<boolean> {
  try {
    // Check if a pending DriftCluster already exists for this service's runtime drift
    const existingCluster = await prisma.driftCluster.findFirst({
      where: {
        workspaceId,
        service,
        driftType: 'runtime_capability_drift',
        status: 'pending',
      },
    });

    const undeclaredUsage = drifts.filter(d => d.driftType === 'undeclared_usage');
    const unusedDeclarations = drifts.filter(d => d.driftType === 'unused_declaration');
    const severity = calculateDriftSeverity(drifts);
    const severityRationale = buildSeverityRationale(undeclaredUsage, severity);

    // Enrich each undeclared capability with actual observation evidence from DB
    const undeclaredUsageEnriched = await Promise.all(
      undeclaredUsage.map(async (d: any) => {
        const samples = await prisma.runtimeCapabilityObservation.findMany({
          where: { workspaceId, service, capabilityType: d.capabilityType, capabilityTarget: d.capabilityTarget },
          orderBy: { observedAt: 'desc' },
          take: 3,
          select: { observedAt: true, source: true, sourceEventId: true, metadata: true },
        });
        const baseCount = d.evidence?.[0]?.metadata?.count ?? samples.length ?? 1;
        const oldestSample = samples[samples.length - 1];
        const newestSample = samples[0];
        return {
          capability: d.capabilityType,
          target: d.capabilityTarget,
          observationCount: baseCount,
          firstSeen: oldestSample?.observedAt?.toISOString() ?? null,
          lastSeen: newestSample?.observedAt?.toISOString() ?? null,
          sources: [...new Set(samples.map((s: any) => s.source))],
          severity: CRITICAL_CAPABILITIES.includes(d.capabilityType) ? 'critical'
            : HIGH_CAPABILITIES.includes(d.capabilityType) ? 'high' : 'medium',
          evidence: samples.map((s: any) => {
            const meta = s.metadata as any;
            return {
              observedAt: s.observedAt.toISOString(),
              source: s.source,
              sourceEventId: s.sourceEventId ?? null,
              actor: meta?.userArn ?? meta?.principalEmail ?? meta?.user ?? 'unknown',
              region: meta?.awsRegion ?? null,
              rawEvent: meta?.eventName ?? meta?.methodName ?? meta?.operation ?? null,
            };
          }),
        };
      })
    );

    // Build the summary object (used for both create and update)
    const summaryPayload = {
      intentArtifactId: intentArtifact.id,
      severity,
      severityRationale,
      driftsDetected: drifts.length,
      undeclaredUsage: undeclaredUsageEnriched,
      unusedDeclarations: unusedDeclarations.map((d: any) => ({
        capability: d.capabilityType,
        target: d.capabilityTarget,
      })),
      remediationOptions: [
        {
          id: 'A',
          label: 'Tighten runtime (recommended)',
          description: 'Remove or restrict the undeclared capability from code/IAM. Spec remains unchanged.',
          requiresApproval: false,
          actions: undeclaredUsage.map((d: any) => ({
            type: 'remove_capability',
            capability: d.capabilityType,
            target: d.capabilityTarget,
            guidance: `Remove ${d.capabilityType} access to ${d.capabilityTarget} from code/IAM policy.`,
          })),
        },
        {
          id: 'B',
          label: 'Expand intent (requires security approval)',
          description: 'Add the capability to the intent artifact — triggers security review workflow.',
          requiresApproval: true,
          actions: undeclaredUsage.map((d: any) => ({
            type: 'add_to_intent',
            capability: d.capabilityType,
            target: d.capabilityTarget,
            guidance: `Add ${d.capabilityType}:${d.capabilityTarget} to intent artifact. Requires security team sign-off.`,
          })),
        },
        {
          id: 'C',
          label: 'Mark as false positive',
          description: 'Dismiss with documented justification and mandatory expiry date for re-evaluation.',
          requiresApproval: true,
          actions: undeclaredUsage.map((d: any) => ({
            type: 'false_positive',
            capability: d.capabilityType,
            target: d.capabilityTarget,
            guidance: `Document why ${d.capabilityType} is benign. Set expiry ≤ 90 days for mandatory re-evaluation.`,
          })),
        },
      ],
    };

    if (existingCluster) {
      // Refresh the clusterSummary with latest observations (keeps data current)
      await prisma.driftCluster.update({
        where: { workspaceId_id: { workspaceId: existingCluster.workspaceId, id: existingCluster.id } },
        data: { clusterSummary: JSON.stringify(summaryPayload), driftCount: drifts.length },
      });
      console.log(`[RuntimeDriftMonitor] Updated existing DriftCluster for service ${service}`);
      return false;
    }

    const cluster = await prisma.driftCluster.create({
      data: {
        workspaceId,
        service,
        driftType: 'runtime_capability_drift',
        fingerprintPattern: `runtime:${service}:capability_drift`,
        status: 'pending',
        driftCount: drifts.length,
        clusterSummary: JSON.stringify(summaryPayload),
        driftIds: drifts.map((d, i) => `runtime-drift-${service}-${i}`),
      },
    });

    console.log(`[RuntimeDriftMonitor] Created DriftCluster ${cluster.id} for service ${service}`);
    return true;
  } catch (error: any) {
    console.error(`[RuntimeDriftMonitor] Error creating DriftCluster:`, error.message);
    return false;
  }
}

/**
 * Send PagerDuty alert for critical drift
 */
async function sendPagerDutyAlert(
  workspaceId: string,
  service: string,
  drifts: any[]
): Promise<boolean> {
  try {
    // Get workspace PagerDuty integration
    const integration = await prisma.integration.findFirst({
      where: {
        workspaceId,
        type: 'pagerduty',
        status: 'connected',
      },
    });

    if (!integration) {
      console.log(`[RuntimeDriftMonitor] No PagerDuty integration for workspace ${workspaceId}`);
      return false;
    }

    const config = integration.config as any;
    const webhookUrl = config?.webhookUrl;

    if (!webhookUrl) {
      console.log(`[RuntimeDriftMonitor] No PagerDuty webhook URL configured`);
      return false;
    }

    // Send PagerDuty event
    const undeclaredUsage = drifts.filter(d => d.driftType === 'undeclared_usage');

    const payload = {
      routing_key: config.routingKey || 'default',
      event_action: 'trigger',
      payload: {
        summary: `[VertaAI] Critical Runtime Drift Detected: ${service}`,
        severity: 'critical',
        source: 'vertaai-runtime-monitor',
        custom_details: {
          service,
          driftsDetected: drifts.length,
          undeclaredUsage: undeclaredUsage.length,
          capabilities: undeclaredUsage.map(d => d.capability.type).join(', '),
        },
      },
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`[RuntimeDriftMonitor] PagerDuty alert failed: ${response.statusText}`);
      return false;
    }

    console.log(`[RuntimeDriftMonitor] PagerDuty alert sent for service ${service}`);
    return true;
  } catch (error: any) {
    console.error(`[RuntimeDriftMonitor] Error sending PagerDuty alert:`, error.message);
    return false;
  }
}
