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
import { getGitHubClient } from '../github-client.js';
import { sendSlackMessage } from '../slack-client.js';
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
  githubCheckPosted: boolean;
  slackAlertSent: boolean;
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

  // Step 3: Detect drift anchored to merge time (P1-A)
  // Use intentArtifact.createdAt as a proxy for the merge timestamp.
  // This anchors the observation window to post-merge production traffic
  // instead of a flat rolling 7-day window that conflates pre-merge staging noise.
  const mergedAt = intentArtifact.createdAt instanceof Date
    ? intentArtifact.createdAt
    : new Date(intentArtifact.createdAt);
  const drifts = await detectCapabilityDrift(workspaceId, service, declaredCapabilities, 7, mergedAt);

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

  // Step 8: Post GitHub check-run on the originating PR
  const githubCheckPosted = await sendGitHubDriftCheck(
    workspaceId, service, intentArtifact, drifts, severity
  );

  // Step 9: Send Slack alert for critical or high severity drift
  const slackAlertSent = (severity === 'critical' || severity === 'high')
    ? await sendSlackDriftAlert(workspaceId, service, drifts, severity)
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
    githubCheckPosted,
    slackAlertSent,
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

    // P1-B: Cross-reference specBuildFindings to establish chain-of-custody.
    // If the Spec→Build gate already flagged a capability, runtime drift of
    // the same type is a regression confirmation, not a surprise.
    const specBuildFindings = intentArtifact.specBuildFindings
      ? JSON.parse(intentArtifact.specBuildFindings as string)
      : null;
    const gateFlaggedTypes = new Set<string>(
      (specBuildFindings?.violations ?? []).map((v: any) => String(v.capability ?? v.type ?? ''))
    );
    const specBuildViolated = gateFlaggedTypes.size > 0;
    const mergedAtIso = intentArtifact.createdAt instanceof Date
      ? intentArtifact.createdAt.toISOString()
      : new Date(intentArtifact.createdAt).toISOString();

    // FIX(issue-6): confirmedCompliant — declared caps that are actually observed at runtime.
    // Gives operators confidence that the declared surface is exercised.
    const unusedCapabilityTypes = new Set(unusedDeclarations.map((d: any) => d.capabilityType));
    const declaredCaps: string[] = Array.isArray(intentArtifact.requestedCapabilities)
      ? intentArtifact.requestedCapabilities.map((c: any) =>
          typeof c === 'string' ? c : (c.type ?? String(c))
        )
      : [];
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
        })
    )).filter(Boolean);

    // FIX(issue-1): buildContext — link to the agent action trace (file-level evidence).
    // Lets the BUILD column show which files changed rather than just the PR link.
    const agentTrace = await prisma.agentActionTrace.findFirst({
      where: { workspaceId, prNumber: intentArtifact.prNumber, repoFullName: intentArtifact.repoFullName },
      select: { filesModified: true },
    });
    const buildContext = agentTrace
      ? { changedFiles: agentTrace.filesModified as any[] ?? [] }
      : null;

    // Build the summary object (used for both create and update)
    const summaryPayload = {
      intentArtifactId: intentArtifact.id,
      // P1-A: expose merge anchor for UI display
      mergedAt: mergedAtIso,
      // P1-B: chain-of-custody — was the Spec→Build gate already aware of these violations?
      specBuildViolated,
      gatePredictedCount: gateFlaggedTypes.size,
      severity,
      severityRationale,
      driftsDetected: drifts.length,
      undeclaredUsage: undeclaredUsageEnriched.map((d: any) => ({
        ...d,
        // P1-B: flag whether the gate predicted this undeclared capability
        gatePredicted: gateFlaggedTypes.has(d.capability),
      })),
      unusedDeclarations: unusedDeclarations.map((d: any) => ({
        capability: d.capabilityType,
        target: d.capabilityTarget,
        // P2-A: why wasn't this observed?
        observationReason: d.observationReason ?? 'not_observed_in_window',
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
      // FIX(issue-6): confirmed compliant capabilities
      confirmedCompliant,
      // FIX(issue-1): build context from agent action trace
      buildContext,
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
 * Post a GitHub check-run on the PR that introduced the service's latest intent artifact.
 * Conclusion is 'failure' for critical/high, 'action_required' for medium, 'neutral' for low.
 */
async function sendGitHubDriftCheck(
  workspaceId: string,
  service: string,
  intentArtifact: any,
  drifts: any[],
  severity: string
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

    // Fetch the PR to get the merge/head SHA
    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
    const headSha: string = pr.merge_commit_sha || pr.head.sha;

    const undeclaredUsage = drifts.filter(d => d.driftType === 'undeclared_usage');
    const conclusion = (severity === 'critical' || severity === 'high')
      ? 'failure'
      : severity === 'medium'
        ? 'action_required'
        : 'neutral';

    const capList = undeclaredUsage.map(d =>
      `- **${d.capabilityType}** on \`${d.capabilityTarget}\` (undeclared at spec time)`
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
  severity: string
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
      blocks
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
