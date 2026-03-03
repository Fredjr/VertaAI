/**
 * Runtime Drift Monitor (Track B)
 *
 * Monitors runtime capability observations and detects drift from declared intent.
 * This is the Track B (async, post-deploy) version of INTENT_RUNTIME_PARITY.
 *
 * ARCHITECTURE:
 * - Runs as scheduled job (every 1 hour)
 * - Queries all workspaces with runtime observations
 * - For each service, unions capabilities from all recent merged intent artifacts
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
import {
  calculateDriftSeverity,
  buildSeverityRationale,
  CRITICAL_CAPABILITIES,
  HIGH_CAPABILITIES,
} from './severityConstants.js';
import { buildRemediationOptions } from './remediationGuide.js';
import { getGitHubClient } from '../github-client.js';
import { sendSlackMessage } from '../slack-client.js';
import type { Capability } from '../../types/agentGovernance.js';
import {
  classifyMateriality,
  computeClusterMaterialityTier,
  type MaterialityTier,
} from '../governance/materialityFilter.js';

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
  githubCheckPosted: boolean;
  slackAlertSent: boolean;
  /** Other services in the same workspace that showed the same undeclared capability types. */
  correlatedServices?: string[];
}

/**
 * Run runtime drift monitoring for all workspaces.
 * This is the main entry point for Track B runtime monitoring.
 */
export async function runRuntimeDriftMonitor(): Promise<RuntimeDriftResult[]> {
  console.log('[RuntimeDriftMonitor] Starting runtime drift monitoring...');

  const results: RuntimeDriftResult[] = [];

  // Step 1: Get all workspaces with runtime observations
  const workspacesWithObservations = await prisma.runtimeCapabilityObservation.groupBy({
    by: ['workspaceId'],
    _count: { id: true },
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
 * Detect drift for a specific workspace.
 *
 * Cross-service correlation (principle #5):
 * After the per-service pass, we identify capability types that appear as
 * undeclared usage in ≥ 2 services simultaneously. A single IAM policy change
 * that affects 5 services is a qualitatively different event than 5 independent
 * incidents — this context is surfaced in each cluster's correlationSignal.
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

  // Step 2: First pass — collect undeclared capability types per service.
  // This lets us build the cross-service correlation index before committing clusters.
  const serviceUndeclaredTypes = new Map<string, Set<string>>(); // service → Set<capabilityType>

  for (const { service } of servicesWithObservations) {
    try {
      const caps = await getUndeclaredCapabilityTypes(workspaceId, service);
      if (caps.size > 0) serviceUndeclaredTypes.set(service, caps);
    } catch (error: any) {
      console.error(`[RuntimeDriftMonitor] Error prefetching undeclared caps for ${service}:`, error.message);
    }
  }

  // Step 3: Build correlation index: capabilityType → services that show it undeclared
  const correlationIndex = new Map<string, string[]>(); // capabilityType → [service, ...]
  for (const [service, types] of serviceUndeclaredTypes) {
    for (const type of types) {
      const list = correlationIndex.get(type) ?? [];
      list.push(service);
      correlationIndex.set(type, list);
    }
  }

  // Log correlated signals (≥2 services sharing the same undeclared capability)
  for (const [type, services] of correlationIndex) {
    if (services.length >= 2) {
      console.log(`[RuntimeDriftMonitor] Correlated undeclared ${type} across ${services.length} services: ${services.join(', ')}`);
    }
  }

  // Step 4: Second pass — full drift detection and cluster management per service
  for (const { service } of servicesWithObservations) {
    try {
      // Compute which other services share at least one undeclared capability type with this service
      const myTypes = serviceUndeclaredTypes.get(service) ?? new Set();
      const correlatedServices = new Set<string>();
      for (const type of myTypes) {
        const peers = correlationIndex.get(type) ?? [];
        for (const peer of peers) {
          if (peer !== service) correlatedServices.add(peer);
        }
      }

      const result = await detectDriftForService(
        workspaceId,
        service,
        correlatedServices.size > 0 ? Array.from(correlatedServices) : undefined,
      );
      if (result) results.push(result);
    } catch (error: any) {
      console.error(`[RuntimeDriftMonitor] Error processing service ${service}:`, error.message);
    }
  }

  return results;
}

/**
 * Lightweight pre-flight: collect the set of undeclared capability types for a
 * service without creating clusters or sending alerts. Used for correlation indexing.
 */
async function getUndeclaredCapabilityTypes(
  workspaceId: string,
  service: string,
): Promise<Set<string>> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentArtifacts = await prisma.intentArtifact.findMany({
    where: { workspaceId, affectedServices: { has: service }, createdAt: { gte: thirtyDaysAgo } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  if (recentArtifacts.length === 0) return new Set();

  const capabilitySet = new Map<string, Capability>();
  for (const artifact of recentArtifacts) {
    for (const cap of ((artifact.requestedCapabilities as any) || [])) {
      const type = typeof cap === 'string' ? cap : cap.type;
      const target = typeof cap === 'string' ? '*' : (cap.target ?? cap.resource ?? '*');
      const key = `${type}:${target}`;
      if (!capabilitySet.has(key)) capabilitySet.set(key, { type, target } as unknown as Capability);
    }
  }

  const first = recentArtifacts[0]!;
  const mergedAt = first.createdAt instanceof Date ? first.createdAt : new Date(first.createdAt);
  const drifts = await detectCapabilityDrift(
    workspaceId, service, Array.from(capabilitySet.values()), 7, mergedAt,
  );

  return new Set(
    drifts.filter(d => d.driftType === 'undeclared_usage').map(d => d.capabilityType),
  );
}

/**
 * Detect drift for a specific service.
 * R1-FIX: Unions capabilities from all recent intent artifacts (up to 10, last 30 days)
 * rather than using only the most recent one, giving a broader declared capability surface.
 * @param correlatedServices Other services in the workspace showing the same undeclared
 *   capability types this cycle (cross-service correlation signal).
 */
async function detectDriftForService(
  workspaceId: string,
  service: string,
  correlatedServices?: string[],
): Promise<RuntimeDriftResult | null> {
  // R1-FIX: Query all recent intent artifacts for this service (not just the latest)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentArtifacts = await prisma.intentArtifact.findMany({
    where: {
      workspaceId,
      affectedServices: { has: service },
      createdAt: { gte: thirtyDaysAgo },
    },
    orderBy: { createdAt: 'desc' },
    take: 10, // Union up to 10 most recent intents for this service
  });

  if (recentArtifacts.length === 0) {
    console.log(`[RuntimeDriftMonitor] No intent artifact found for service ${service}`);
    return null;
  }

  // R1-FIX: Union declared capabilities from all recent artifacts.
  // If an agent opened 3 PRs touching the same service, all declared capabilities
  // from all 3 are treated as authorised — avoiding false undeclared_usage positives.
  const capabilitySet = new Map<string, Capability>();
  for (const artifact of recentArtifacts) {
    const rawCaps: any[] = (artifact.requestedCapabilities as any) || [];
    for (const cap of rawCaps) {
      const type = typeof cap === 'string' ? cap : cap.type;
      const target = typeof cap === 'string' ? '*' : (cap.target ?? cap.resource ?? '*');
      const key = `${type}:${target}`;
      if (!capabilitySet.has(key)) {
        capabilitySet.set(key, { type, target } as unknown as Capability);
      }
    }
  }

  const declaredCapabilities = Array.from(capabilitySet.values());

  if (declaredCapabilities.length === 0) {
    console.log(`[RuntimeDriftMonitor] No declared capabilities for service ${service}`);
    return null;
  }

  // Use the most recent artifact for anchor/metadata
  const latestArtifact = recentArtifacts[0]!;

  // Step 3: Detect drift anchored to merge time (P1-A)
  const mergedAt = latestArtifact.createdAt instanceof Date
    ? latestArtifact.createdAt
    : new Date(latestArtifact.createdAt);
  const drifts = await detectCapabilityDrift(workspaceId, service, declaredCapabilities, 7, mergedAt);

  // R7-FIX: Auto-close cluster when undeclared usage has fully resolved.
  const undeclaredUsage = drifts.filter(d => d.driftType === 'undeclared_usage');
  if (undeclaredUsage.length === 0) {
    const openCluster = await prisma.driftCluster.findFirst({
      where: {
        workspaceId,
        service,
        driftType: 'runtime_capability_drift',
        status: 'pending',
      },
    });
    if (openCluster) {
      let existingSummary: Record<string, any> = {};
      try {
        existingSummary = JSON.parse(openCluster.clusterSummary as string || '{}');
      } catch {
        // ignore parse errors on stale data
      }
      await prisma.driftCluster.update({
        where: { workspaceId_id: { workspaceId, id: openCluster.id } },
        data: {
          status: 'closed',
          closedAt: new Date(),
          clusterSummary: JSON.stringify({
            ...existingSummary,
            autoResolvedAt: new Date().toISOString(),
            resolvedReason: 'No undeclared capabilities detected in current observation window',
          }),
        },
      });
      console.log(`[RuntimeDriftMonitor] Auto-closed drift cluster for service ${service} (drift resolved)`);
    }
    console.log(`[RuntimeDriftMonitor] No undeclared usage for service ${service} — no action needed`);
    return null;
  }

  // Step 5: Calculate severity using shared constants
  const severity = calculateDriftSeverity(drifts);
  const unusedDeclarations = drifts.filter(d => d.driftType === 'unused_declaration');

  console.log(`[RuntimeDriftMonitor] Service ${service}: ${drifts.length} drifts (${undeclaredUsage.length} undeclared, ${unusedDeclarations.length} unused), severity: ${severity}`);

  // Step 6: Create/update DriftCluster and retrieve the materiality tier.
  // The materiality tier (critical | operational | petty) drives all alert routing below.
  const { created: driftPlanCreated, materialityTier: clusterMaterialityTier } =
    await createDriftPlanForRuntimeDrift(
      workspaceId,
      service,
      latestArtifact,
      drifts,
      correlatedServices,
    );

  // Step 7: Send PagerDuty alert — critical materiality + critical effective severity only.
  // ATC rule: petty clusters never page on-call. operational clusters use Slack instead.
  // Also uses effectiveSeverity (decay+confidence adjusted) so a stale low-confidence
  // observation does not page at 3 am with the same urgency as a fresh CloudTrail event.
  const effectiveSeverityForAlert = undeclaredUsage.reduce<string>((worst, d: any) => {
    const s = d.effectiveSeverity ?? d.severity;
    if (s === 'critical') return 'critical';
    if (s === 'high' && worst !== 'critical') return 'high';
    return worst;
  }, 'medium');

  const pagerdutyAlertSent =
    effectiveSeverityForAlert === 'critical' && clusterMaterialityTier !== 'petty'
      ? await sendPagerDutyAlert(workspaceId, service, drifts)
      : false;

  // Step 8: Post GitHub check-run — skip for petty clusters (ATC: no noise in PR UI).
  const githubCheckPosted = clusterMaterialityTier !== 'petty'
    ? await sendGitHubDriftCheck(workspaceId, service, latestArtifact, drifts, severity)
    : false;

  // Step 9: Send Slack alert — critical/high effective severity AND not petty.
  // Operational clusters still get a Slack alert (human decision needed), just no PD page.
  const slackAlertSent =
    (effectiveSeverityForAlert === 'critical' || effectiveSeverityForAlert === 'high') &&
    clusterMaterialityTier !== 'petty'
      ? await sendSlackDriftAlert(workspaceId, service, drifts, severity)
      : false;

  if (clusterMaterialityTier === 'petty') {
    console.log(`[RuntimeDriftMonitor] Service ${service}: materiality=petty — all alerts suppressed (ATC silent mode)`);
  }

  return {
    workspaceId,
    service,
    driftsDetected: drifts.length,
    undeclaredUsage: undeclaredUsage.length,
    unusedDeclarations: unusedDeclarations.length,
    severity,
    driftPlanCreated,
    pagerdutyAlertSent,
    githubCheckPosted,
    slackAlertSent,
    correlatedServices: correlatedServices?.length ? correlatedServices : undefined,
  };
}

/**
 * Create DriftCluster for runtime drift.
 * Returns the created/updated status plus the computed cluster-level materiality tier
 * so the caller can make alert-routing decisions without re-reading the cluster.
 *
 * @param correlatedServices Other services with the same undeclared capability types this cycle.
 */
async function createDriftPlanForRuntimeDrift(
  workspaceId: string,
  service: string,
  intentArtifact: any,
  drifts: any[],
  correlatedServices?: string[],
): Promise<{ created: boolean; materialityTier: MaterialityTier }> {
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

    // Enrich each undeclared capability with actual observation evidence from DB.
    // Run in parallel to avoid sequential N+1 latency.
    const undeclaredUsageEnriched = await Promise.all(
      undeclaredUsage.map(async (d: any) => {
        const samples = await prisma.runtimeCapabilityObservation.findMany({
          where: {
            workspaceId,
            service,
            capabilityType: d.capabilityType,
            capabilityTarget: d.capabilityTarget,
          },
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
          // Gap D: resource scope parsed from capabilityTarget
          scopeDetails: deriveResourceScope(d.capabilityType, d.capabilityTarget),
          evidence: samples.map((s: any) => {
            const meta = s.metadata as any;
            return {
              observedAt: s.observedAt.toISOString(),
              source: s.source,
              sourceEventId: s.sourceEventId ?? null,
              actor: meta?.userArn ?? meta?.principalEmail ?? meta?.user ?? 'unknown',
              region: meta?.awsRegion ?? meta?.region ?? null,
              rawEvent: meta?.eventName ?? meta?.methodName ?? meta?.operation ?? null,
              // Gap B: deep link to source console for audit-grade evidence
              evidenceLink: generateEvidenceLink(s.source, meta),
            };
          }),
        };
      }),
    );

    // P1-B: Cross-reference specBuildFindings to establish chain-of-custody.
    // L3-FIX: Wrap JSON.parse in try/catch — malformed stored JSON must not abort cluster creation.
    let specBuildFindings: any = null;
    try {
      specBuildFindings = intentArtifact.specBuildFindings
        ? JSON.parse(intentArtifact.specBuildFindings as string)
        : null;
    } catch {
      console.warn(`[RuntimeDriftMonitor] Failed to parse specBuildFindings for ${service} — skipping chain-of-custody`);
    }
    const gateFlaggedTypes = new Set<string>(
      (specBuildFindings?.violations ?? []).map((v: any) => String(v.capability ?? v.type ?? '')),
    );
    const specBuildViolated = gateFlaggedTypes.size > 0;
    const mergedAtDate = intentArtifact.createdAt instanceof Date
      ? intentArtifact.createdAt
      : new Date(intentArtifact.createdAt);
    const mergedAtIso = mergedAtDate.toISOString();

    // Gap B: Compute observation window bounds (mirrors getServiceCapabilityUsage logic)
    const obsWindowEnd = new Date();
    const mergeAnchor = new Date(mergedAtDate.getTime() - 60 * 60 * 1000); // 1 h before merge
    const maxLookback = new Date();
    maxLookback.setDate(maxLookback.getDate() - 7);
    const obsWindowStart = mergeAnchor > maxLookback ? mergeAnchor : maxLookback;

    // FIX(issue-6): confirmedCompliant — declared caps actually observed at runtime.
    const unusedCapabilityTypes = new Set(unusedDeclarations.map((d: any) => d.capabilityType));
    const declaredCaps: string[] = Array.isArray(intentArtifact.requestedCapabilities)
      ? intentArtifact.requestedCapabilities.map((c: any) =>
          typeof c === 'string' ? c : (c.type ?? String(c)),
        )
      : [];

    // Only count a cap as confirmed compliant if it is NOT in unusedDeclarations
    // (i.e., it was declared AND observed).
    const confirmedCompliant = (await Promise.all(
      declaredCaps
        .filter(cap => !unusedCapabilityTypes.has(cap))
        .map(async (cap) => {
          const count = await prisma.runtimeCapabilityObservation.count({
            where: { workspaceId, service, capabilityType: cap },
          });
          if (count === 0) return null;
          const sourceSamples = await prisma.runtimeCapabilityObservation.findMany({
            where: { workspaceId, service, capabilityType: cap },
            select: { source: true },
            take: 10,
          });
          return {
            capability: cap,
            observationCount: count,
            sources: [...new Set(sourceSamples.map((o: any) => o.source))],
          };
        }),
    )).filter(Boolean);

    // FIX(issue-1): buildContext — link to agent action trace (file-level evidence).
    const agentTrace = await prisma.agentActionTrace.findFirst({
      where: {
        workspaceId,
        prNumber: intentArtifact.prNumber,
        repoFullName: intentArtifact.repoFullName,
      },
      select: { filesModified: true },
    });
    const buildContext = agentTrace
      ? { changedFiles: agentTrace.filesModified as any[] ?? [] }
      : null;

    // ── Phase 0: Materiality + Attribution pre-compute ────────────────────────
    // Classify each undeclared capability into critical / operational / petty.
    // We do this before building summaryPayload so the cluster-level tier is
    // available for both the DB write and the caller's alert-routing decisions.
    const materialityResultsList: Array<ReturnType<typeof classifyMateriality>> = [];
    const undeclaredUsageWithMateriality = undeclaredUsageEnriched.map((d: any) => {
      // Attribution confidence is only meaningful for cost/storage capabilities.
      const attrConf = (d.capability === 'cost_increase' || d.capability === 's3_write')
        ? deriveAttributionConfidence(d.capability, d.target, buildContext)
        : undefined;
      const attrNote = (d.capability === 'cost_increase' || d.capability === 's3_write')
        ? deriveAttributionNote(d.capability, d.target, buildContext)
        : undefined;

      const matResult = classifyMateriality({
        capabilityType: d.capability,
        capabilityTarget: d.target,
        severity: d.severity as 'critical' | 'high' | 'medium' | 'low',
        observationCount: d.observationCount,
        sources: d.sources,
        attributionConfidence: attrConf,
        scopeDetails: d.scopeDetails,
      });
      materialityResultsList.push(matResult);

      return {
        ...d,
        // P1-B: flag whether the gate predicted this undeclared capability
        gatePredicted: gateFlaggedTypes.has(d.capability),
        // Gap C: attribution confidence + explanation
        attributionConfidence: attrConf,
        attributionNote: attrNote,
        // Phase 0: per-item materiality (drives UI badge + operator copy)
        materialityTier: matResult.tier,
        materialityReason: matResult.reason,
      };
    });

    // Cluster-level tier: worst tier across all undeclared items.
    // One critical item makes the whole cluster critical.
    const clusterMaterialityTier: MaterialityTier = computeClusterMaterialityTier(materialityResultsList);

    // Build the summary object (used for both create and update)
    const summaryPayload = {
      intentArtifactId: intentArtifact.id,
      // P1-A: expose merge anchor for UI display
      mergedAt: mergedAtIso,
      // Gap B: audit-grade observation window (exact date range used for drift detection)
      observationWindow: {
        start: obsWindowStart.toISOString(),
        end: obsWindowEnd.toISOString(),
      },
      // Gap B: gate provenance — when did the gate run and which policy pack applied
      gateProvenance: {
        gateRunAt: specBuildFindings?.checkedAt ?? null,
        isFinalSnapshot: specBuildFindings?.isFinalSnapshot ?? false,
        packName: specBuildFindings?.packName ?? null,
        packVersion: specBuildFindings?.packVersion ?? null,
      },
      // Gap F: agent context from the originating intent artifact
      agentContext: {
        authorType: intentArtifact.authorType ?? null,
        agentIdentity: tryParseJson(intentArtifact.agentIdentity),
        traceId: intentArtifact.agentTraceId ?? null,
        promptProvided: !!(intentArtifact as any).promptText,
        claimSetProvided: !!(intentArtifact as any).claimSet,
      },
      // P1-B: chain-of-custody
      specBuildViolated,
      gatePredictedCount: gateFlaggedTypes.size,
      severity,
      severityRationale,
      // Phase 0: cluster-level materiality tier (drives alert routing)
      materialityTier: clusterMaterialityTier,
      driftsDetected: drifts.length,
      undeclaredUsage: undeclaredUsageWithMateriality,
      unusedDeclarations: unusedDeclarations.map((d: any) => ({
        capability: d.capabilityType,
        target: d.capabilityTarget,
        // P2-A: why wasn't this observed?
        observationReason: d.observationReason ?? 'not_observed_in_window',
      })),
      // Remediation specificity (principle #7): generate concrete, per-capability-type
      // steps instead of generic "remove or restrict" guidance.
      // Each undeclared capability gets its own A/B/C option set with IAM snippets,
      // CLI commands, and audit console links specific to that capability type.
      remediationOptions: undeclaredUsage.map((d: any) =>
        buildRemediationOptions(d.capabilityType, d.capabilityTarget),
      ),
      // FIX(issue-6): confirmed compliant capabilities
      confirmedCompliant,
      // FIX(issue-1): build context from agent action trace
      buildContext,
      // Cross-service correlation signal (principle #5)
      correlationSignal: correlatedServices && correlatedServices.length > 0
        ? {
            correlatedServices,
            correlatedCount: correlatedServices.length,
            note: `${correlatedServices.length} other service(s) show the same undeclared capability type(s) in this monitoring window. This may indicate a shared IAM policy, infrastructure change, or common dependency.`,
          }
        : null,
    };

    if (existingCluster) {
      // Refresh the clusterSummary with latest observations (keeps data current)
      await prisma.driftCluster.update({
        where: { workspaceId_id: { workspaceId: existingCluster.workspaceId, id: existingCluster.id } },
        data: {
          clusterSummary: JSON.stringify(summaryPayload),
          driftCount: drifts.length,
          materialityTier: clusterMaterialityTier,
        },
      });
      console.log(`[RuntimeDriftMonitor] Updated existing DriftCluster for service ${service} (materiality: ${clusterMaterialityTier})`);
      return { created: false, materialityTier: clusterMaterialityTier };
    }

    // R4-FIX: driftIds should reference real DB records, not synthetic strings.
    // Since RuntimeCapabilityObservation records ARE the canonical drift evidence,
    // we store the IDs of the most recent observation per undeclared capability pair.
    const realDriftIds: string[] = [];
    for (const d of undeclaredUsage) {
      const obs = await prisma.runtimeCapabilityObservation.findFirst({
        where: { workspaceId, service, capabilityType: d.capabilityType, capabilityTarget: d.capabilityTarget },
        orderBy: { observedAt: 'desc' },
        select: { id: true },
      });
      if (obs) realDriftIds.push(obs.id);
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
        driftIds: realDriftIds,
        materialityTier: clusterMaterialityTier,
      },
    });

    console.log(`[RuntimeDriftMonitor] Created DriftCluster ${cluster.id} for service ${service} (materiality: ${clusterMaterialityTier})`);
    return { created: true, materialityTier: clusterMaterialityTier };
  } catch (error: any) {
    console.error(`[RuntimeDriftMonitor] Error creating DriftCluster:`, error.message);
    // Default to operational so callers still fire non-critical alerts on error
    return { created: false, materialityTier: 'operational' as MaterialityTier };
  }
}

/**
 * Post a GitHub check-run on the PR that introduced the service's latest intent artifact.
 * R10-FIX: Use pr.head.sha — the feature branch's latest commit — not pr.merge_commit_sha
 * (which is the merge commit on the base branch and is not a valid check-run target SHA).
 */
async function sendGitHubDriftCheck(
  workspaceId: string,
  service: string,
  intentArtifact: any,
  drifts: any[],
  severity: string,
): Promise<boolean> {
  try {
    const octokit = await getGitHubClient(workspaceId);
    if (!octokit) {
      console.log(`[RuntimeDriftMonitor] No GitHub client for workspace ${workspaceId} — skipping check-run`);
      return false;
    }

    const repoFullName: string | undefined = intentArtifact.repoFullName;
    const prNumber: number | undefined = intentArtifact.prNumber;
    if (!repoFullName || !prNumber) return false;

    const [owner, repo] = repoFullName.split('/');
    if (!owner || !repo) return false;

    // R10-FIX: Always use pr.head.sha — the commit that the PR introduced.
    // pr.merge_commit_sha is the merge commit on the base branch after merging and
    // is not a valid target for a check run associated with the original PR.
    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
    const headSha: string = pr.head.sha;

    const undeclaredUsage = drifts.filter(d => d.driftType === 'undeclared_usage');
    const conclusion = (severity === 'critical' || severity === 'high')
      ? 'failure'
      : severity === 'medium'
        ? 'action_required'
        : 'neutral';

    const capList = undeclaredUsage.map(d =>
      `- **${d.capabilityType}** on \`${d.capabilityTarget}\` (undeclared at spec time)`,
    ).join('\n');

    await octokit.rest.checks.create({
      owner,
      repo,
      name: 'VertaAI Runtime Drift Monitor',
      head_sha: headSha,
      status: 'completed',
      conclusion,
      output: {
        title: `Runtime Drift — ${severity.toUpperCase()} severity on ${service}`,
        summary: `**${service}** has **${undeclaredUsage.length}** undeclared runtime capability usage(s) detected since merge.\n\n${capList}`,
        text: `Total drifts: ${drifts.length}. Review the VertaAI governance dashboard for remediation options (A/B/C).`,
      },
    });

    console.log(`[RuntimeDriftMonitor] GitHub check-run posted for ${repoFullName}#${prNumber} (${conclusion})`);
    return true;
  } catch (error: any) {
    console.error(`[RuntimeDriftMonitor] Error posting GitHub check:`, error.message);
    return false;
  }
}

/**
 * Send Slack drift alert for critical/high severity using the workspace's Slack integration.
 */
async function sendSlackDriftAlert(
  workspaceId: string,
  service: string,
  drifts: any[],
  severity: string,
): Promise<boolean> {
  try {
    const integration = await prisma.integration.findFirst({
      where: { workspaceId, type: 'slack', status: 'connected' },
    });

    if (!integration) {
      console.log(`[RuntimeDriftMonitor] No Slack integration for workspace ${workspaceId}`);
      return false;
    }

    const config = integration.config as any;
    const channel: string = config?.defaultChannel || config?.channel || '#security-alerts';

    const undeclaredUsage = drifts.filter(d => d.driftType === 'undeclared_usage');
    const severityEmoji = severity === 'critical' ? '🚨' : '⚠️';

    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${severityEmoji} Runtime Drift Detected: ${service}`, emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Severity:*\n${severity.toUpperCase()}` },
          { type: 'mrkdwn', text: `*Service:*\n${service}` },
          { type: 'mrkdwn', text: `*Undeclared Capabilities:*\n${undeclaredUsage.length}` },
          { type: 'mrkdwn', text: `*Workspace:*\n${workspaceId}` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Undeclared capability usage:*\n${undeclaredUsage.map(d => `• \`${d.capabilityType}\` on \`${d.capabilityTarget}\``).join('\n')}`,
        },
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `VertaAI Runtime Drift Monitor • ${new Date().toISOString()}` },
        ],
      },
    ];

    const result = await sendSlackMessage(
      workspaceId,
      channel,
      `${severityEmoji} Runtime drift detected in *${service}*: ${undeclaredUsage.length} undeclared capability(ies) — ${severity.toUpperCase()} severity`,
      blocks,
    );

    if (!result.ok) {
      console.error(`[RuntimeDriftMonitor] Slack alert failed: ${result.error}`);
      return false;
    }

    console.log(`[RuntimeDriftMonitor] Slack alert sent for service ${service} → ${channel}`);
    return true;
  } catch (error: any) {
    console.error(`[RuntimeDriftMonitor] Error sending Slack alert:`, error.message);
    return false;
  }
}

/**
 * Send PagerDuty alert for critical drift using the Events API v2.
 * R9-FIX: Use config.routingKey as the integration key, POST to the canonical
 * Events API v2 endpoint. If only a generic webhookUrl is configured (no routingKey),
 * fall back to the generic webhook for backward compatibility.
 * Also fixed: d.capabilityType (not d.capability.type).
 */
async function sendPagerDutyAlert(
  workspaceId: string,
  service: string,
  drifts: any[],
): Promise<boolean> {
  try {
    const integration = await prisma.integration.findFirst({
      where: { workspaceId, type: 'pagerduty', status: 'connected' },
    });

    if (!integration) {
      console.log(`[RuntimeDriftMonitor] No PagerDuty integration for workspace ${workspaceId}`);
      return false;
    }

    const config = integration.config as any;
    const routingKey: string | undefined = config?.routingKey;
    const webhookUrl: string | undefined = config?.webhookUrl;

    if (!routingKey && !webhookUrl) {
      console.log(`[RuntimeDriftMonitor] No PagerDuty routing key or webhook URL configured`);
      return false;
    }

    const undeclaredUsage = drifts.filter(d => d.driftType === 'undeclared_usage');

    // R9-FIX: Use PagerDuty Events API v2 endpoint when routingKey is present.
    // The routingKey goes in the request body, not as a URL param.
    const endpoint = routingKey
      ? 'https://events.pagerduty.com/v2/enqueue'
      : webhookUrl!;

    const payload = {
      routing_key: routingKey || config.routingKey || 'default',
      event_action: 'trigger',
      payload: {
        summary: `[VertaAI] Critical Runtime Drift Detected: ${service}`,
        severity: 'critical',
        source: 'vertaai-runtime-monitor',
        custom_details: {
          service,
          driftsDetected: drifts.length,
          undeclaredUsage: undeclaredUsage.length,
          // R9-FIX: d.capabilityType (not d.capability.type — d has no .capability sub-object)
          capabilities: undeclaredUsage.map((d: any) => d.capabilityType).join(', '),
        },
      },
    };

    const response = await fetch(endpoint, {
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

// ─────────────────────────────────────────────────────────────────────────────
// Governance Intelligence Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Safe JSON parse — returns null on error instead of throwing. */
function tryParseJson(value: string | null | undefined): any {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

/**
 * Gap D: Derive resource scope from a capability type + target string.
 * Parses S3 URIs, AWS ARNs, and detects environment tags.
 */
function deriveResourceScope(capabilityType: string, target: string): {
  resourcePath: string | null;
  environment: string | null;
  isWildcard: boolean;
  isExactResource: boolean;
} {
  const isWildcard = target === '*';
  if (isWildcard) {
    return { resourcePath: null, environment: null, isWildcard: true, isExactResource: false };
  }

  // Detect environment from naming conventions
  const envMatch = target.match(/\b(prod|production|staging|stage|dev|development|test)\b/i);
  const environment = envMatch ? envMatch[1]!.toLowerCase() : null;

  // Parse S3 URIs: s3://bucket/prefix or bucket-name/prefix
  if (capabilityType === 's3_write' || capabilityType === 's3_read' || capabilityType === 's3_delete') {
    const s3Match = target.match(/^(?:s3:\/\/)?([^/]+)(?:\/(.*))?$/);
    if (s3Match) {
      const bucket = s3Match[1] ?? target;
      const prefix = s3Match[2];
      return {
        resourcePath: prefix ? `${bucket}/${prefix}` : bucket,
        environment,
        isWildcard: false,
        isExactResource: !!prefix,
      };
    }
  }

  // Generic: any non-wildcard target is at least a type-level resource
  return {
    resourcePath: target,
    environment,
    isWildcard: false,
    isExactResource: target.includes('/') || target.includes(':'),
  };
}

/**
 * Gap B: Generate a deep link to the source audit console for a given observation.
 * Returns null if insufficient metadata to construct the URL.
 */
function generateEvidenceLink(source: string, meta: Record<string, any> | null): string | null {
  if (!meta) return null;
  if (source === 'aws_cloudtrail') {
    const region = meta.awsRegion ?? meta.region;
    const eventName = meta.eventName;
    if (region && eventName) {
      return `https://console.aws.amazon.com/cloudtrail/home?region=${region}#/events?EventName=${encodeURIComponent(eventName)}`;
    }
    if (region) {
      return `https://console.aws.amazon.com/cloudtrail/home?region=${region}#/events`;
    }
    return null;
  }
  if (source === 'gcp_audit_log') {
    const methodName = meta.methodName;
    if (methodName) {
      return `https://console.cloud.google.com/logs/query;query=protoPayload.methodName%3D%22${encodeURIComponent(methodName)}%22`;
    }
    return null;
  }
  if (source === 'azure_activity_log') {
    return `https://portal.azure.com/#view/Microsoft_Azure_MonitoringMetrics/AzureMonitoringBrowseBlade/~/activityLog`;
  }
  return null;
}

/**
 * Gap C: Determine if a cost regression is causally linked to this PR's changes
 * or merely correlated (temporal coincidence).
 * Causal: changed files directly reference the capability's resource.
 * Correlated: no code anchor found — may be a pre-existing trend.
 */
function deriveAttributionConfidence(
  capabilityType: string,
  target: string,
  buildContext: { changedFiles?: Array<{ path: string }> } | null,
): 'causal' | 'correlated' {
  if (!buildContext?.changedFiles?.length) return 'correlated';
  const files = buildContext.changedFiles.map(f => f.path.toLowerCase());
  const targetLower = target.toLowerCase();

  // s3_write: look for S3 client usage patterns in changed files
  if (capabilityType === 's3_write' || capabilityType === 'cost_increase') {
    const bucketName = targetLower.replace(/^s3:\/\//, '').split('/')[0] ?? '';
    const s3Patterns = ['s3', 'putobject', 'upload', 'storage', bucketName].filter((p): p is string => !!p);
    if (files.some(f => s3Patterns.some(p => f.includes(p)))) return 'causal';
  }

  // Generic: if any changed file mentions the target resource name
  const resourceId = targetLower.split('/')[0]?.split(':').pop() ?? '';
  if (resourceId && files.some(f => f.includes(resourceId))) return 'causal';

  return 'correlated';
}

/**
 * Gap C: Explain WHY the attribution confidence was assigned.
 * Provides the operator with a code anchor (or lack thereof).
 */
function deriveAttributionNote(
  capabilityType: string,
  target: string,
  buildContext: { changedFiles?: Array<{ path: string }> } | null,
): string {
  if (!buildContext?.changedFiles?.length) {
    return 'No code changes found in this PR — cost regression may be pre-existing or from another deployment.';
  }
  const confidence = deriveAttributionConfidence(capabilityType, target, buildContext);
  if (confidence === 'causal') {
    const tl = target.toLowerCase().replace(/^s3:\/\//, '').split('/')[0] ?? '';
    const matchingFile = buildContext.changedFiles.find(f => {
      const fl = f.path.toLowerCase();
      return fl.includes('s3') || fl.includes('upload') || fl.includes('storage') || (tl && fl.includes(tl));
    });
    return matchingFile
      ? `Code anchor found: ${matchingFile.path} was modified in this PR and likely introduced the ${capabilityType} behavior.`
      : `File changes in this PR match ${capabilityType} patterns — likely causal.`;
  }
  return `No direct code anchor found for ${target}. ${capabilityType} may be correlated with this deployment window rather than caused by specific changes.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Real-time drift check entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check drift for a single service and create/update a DriftCluster as needed.
 *
 * This is the lightweight entry point called by observationIngestion after each new
 * observation is persisted. Unlike the full batch monitor loop, it:
 *   - Processes only the one service that just received a new observation
 *   - Does not build the cross-workspace correlation index (correlatedServices = undefined)
 *   - Is debounced per (workspaceId, service) in the caller to avoid hammering the DB
 *
 * The batch monitor loop (runRuntimeDriftMonitor) remains the reconciliation sweep
 * that fills in cross-service correlation signals every hour.
 */
export async function checkDriftForService(
  workspaceId: string,
  service: string,
): Promise<RuntimeDriftResult | null> {
  return detectDriftForService(workspaceId, service, undefined);
}
