import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/db.js';
import { enqueueJob } from '../services/queue/qstash.js';
import { isFeatureEnabled } from '../config/featureFlags.js';
import {
  normalizeIncident,
  isSignificantIncident,
  createProcessDriftSignal,
  createOwnershipDriftSignal,
  type PagerDutyIncident,
} from '../services/signals/pagerdutyNormalizer.js';

const router: RouterType = Router();

/**
 * PagerDuty webhook signature verification
 * https://developer.pagerduty.com/docs/db0fa8c8984fc-webhooks#webhook-signature-verification
 */
function verifyPagerDutySignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) return false;
  
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  // PagerDuty signature format: v1=<hex>
  const expectedSignature = `v1=${expected}`;
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Map PagerDuty urgency to severity
 */
function mapPagerDutySeverity(urgency: string | undefined): string {
  if (urgency === 'high') return 'sev1';
  if (urgency === 'low') return 'sev3';
  return 'sev2';
}

/**
 * Calculate incident duration in milliseconds
 */
function calculateDuration(createdAt: string, resolvedAt: string | undefined): number | null {
  if (!resolvedAt) return null;
  return new Date(resolvedAt).getTime() - new Date(createdAt).getTime();
}

/**
 * Infer service name from incident metadata
 */
function inferServiceFromIncident(incident: any): string | undefined {
  // Try service summary first
  if (incident.service?.summary) {
    return incident.service.summary.toLowerCase().replace(/\s+/g, '-');
  }
  // Try escalation policy
  if (incident.escalation_policy?.summary) {
    return incident.escalation_policy.summary.toLowerCase().replace(/\s+/g, '-');
  }
  return undefined;
}

// ============================================================================
// PagerDuty Webhook: Tenant-Routed (Phase 4)
// URL: POST /webhooks/pagerduty/:workspaceId
// Handles incident.resolved events for correlation with GitHub PRs
// ============================================================================
router.post('/:workspaceId', async (req: Request, res: Response) => {
  const workspaceIdParam = req.params.workspaceId;
  const signature = req.headers['x-pagerduty-signature'] as string | undefined;

  if (!workspaceIdParam) {
    return res.status(400).json({ error: 'Missing workspaceId parameter' });
  }

  console.log(`[PagerDuty] Received webhook for workspace ${workspaceIdParam}`);

  // 1. Load workspace and PagerDuty integration
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceIdParam },
    include: { integrations: { where: { type: 'pagerduty' } } },
  });

  if (!workspace) {
    console.error(`[PagerDuty] Workspace not found: ${workspaceIdParam}`);
    return res.status(404).json({ error: 'Workspace not found' });
  }

  // After validation, workspaceId is guaranteed to be a string
  const workspaceId: string = workspaceIdParam;

  const integration = workspace.integrations[0];

  // 2. Verify webhook signature
  const secret = integration?.webhookSecret || process.env.PD_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[PagerDuty] No webhook secret configured');
    return res.status(500).json({ error: 'PagerDuty webhook secret not configured' });
  }

  const payload = (req as any).rawBody || JSON.stringify(req.body);
  if (!verifyPagerDutySignature(payload, signature, secret)) {
    console.error('[PagerDuty] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // 3. Parse event payload
  // PagerDuty sends events in a messages array or as a single event object
  const events = req.body.messages || (req.body.event ? [req.body] : []);

  if (events.length === 0) {
    console.log('[PagerDuty] No events in payload');
    return res.json({ status: 'ok', message: 'No events to process' });
  }

  const results: Array<{ eventType: string; signalEventId?: string; driftId?: string; status: string }> = [];

  for (const eventWrapper of events) {
    const event = eventWrapper.event || eventWrapper;
    const eventType = event.event_type || eventWrapper.event_type;

    console.log(`[PagerDuty] Processing event type: ${eventType}`);

    // Only process incident.resolved events for drift detection
    // (indicates a fix was deployed - correlates with merged PRs)
    if (eventType !== 'incident.resolved') {
      results.push({ eventType, status: 'ignored' });
      continue;
    }

    const incident = event.data || event.incident;
    if (!incident) {
      console.log('[PagerDuty] No incident data in event');
      results.push({ eventType, status: 'no_data' });
      continue;
    }

    // Check if feature is enabled
    if (!isFeatureEnabled('ENABLE_PAGERDUTY_WEBHOOK', workspaceId)) {
      console.log(`[PagerDuty] Feature disabled for workspace ${workspaceId}`);
      results.push({ eventType, status: 'feature_disabled' });
      continue;
    }

    // Check if incident is significant enough for drift detection
    if (!isSignificantIncident(incident as PagerDutyIncident)) {
      console.log(`[PagerDuty] Incident ${incident.id} not significant enough`);
      results.push({ eventType, status: 'not_significant' });
      continue;
    }

    // Use normalizer to get structured incident data
    const normalized = normalizeIncident(incident as PagerDutyIncident, workspaceId);
    const service = normalized.service;
    const signalEventId = normalized.id;

    // Check idempotency - skip if already processed
    const existingSignal = await prisma.signalEvent.findUnique({
      where: { workspaceId_id: { workspaceId, id: signalEventId } },
    });

    if (existingSignal) {
      console.log(`[PagerDuty] Incident ${incident.id} already processed`);
      results.push({ eventType, signalEventId, status: 'already_processed' });
      continue;
    }

    // Generate drift hints based on incident analysis
    const processDriftHint = isFeatureEnabled('ENABLE_PROCESS_DRIFT', workspaceId)
      ? createProcessDriftSignal(normalized, service || 'unknown')
      : null;

    const ownershipDriftHint = isFeatureEnabled('ENABLE_ONCALL_OWNERSHIP', workspaceId)
      ? createOwnershipDriftSignal(normalized)
      : null;

    // 4. Create SignalEvent with enriched data from normalizer
    // Serialize timeline to plain objects for Prisma JSON compatibility
    const timelineData = normalized.extracted.timeline.map(t => ({
      event: t.event,
      at: t.at,
      by: t.by || null,
      details: t.details || null,
    }));

    const signalEvent = await prisma.signalEvent.create({
      data: {
        workspaceId,
        id: signalEventId,
        sourceType: 'pagerduty_incident',
        occurredAt: normalized.occurredAt,
        service,
        severity: normalized.severity,
        extracted: {
          // Core incident data
          title: normalized.extracted.title,
          summary: normalized.extracted.summary,
          incidentNumber: incident.incident_number,
          incidentId: normalized.incidentId,
          incidentUrl: normalized.incidentUrl,
          // Keywords for doc matching
          keywords: normalized.extracted.keywords,
          // Responders and timeline for process drift
          responders: normalized.responders,
          timeline: timelineData,
          // Ownership data
          escalationPolicy: normalized.extracted.escalationPolicy,
          teams: normalized.extracted.teams,
          resolvedBy: normalized.extracted.resolvedBy || null,
          // Duration and priority
          duration: normalized.extracted.duration || null,
          priority: normalized.extracted.priority || null,
          // Troubleshooting notes
          notes: normalized.extracted.notes || null,
          serviceId: incident.service?.id || null,
          // Drift hints for downstream processing (Phase 3)
          driftTypeHints: normalized.extracted.driftTypeHints,
          processDriftHint: processDriftHint || null,
          ownershipDriftHint: ownershipDriftHint || null,
        },
        rawPayload: eventWrapper,
      },
    });

    console.log(`[PagerDuty] Created signal event ${signalEvent.id}`);

    // 5. Create DriftCandidate in INGESTED state
    const driftCandidate = await prisma.driftCandidate.create({
      data: {
        workspaceId,
        signalEventId: signalEvent.id,
        state: 'INGESTED',
        sourceType: 'pagerduty_incident',
        service,
      },
    });

    console.log(`[PagerDuty] Created drift candidate ${driftCandidate.id}`);

    // 6. Enqueue for async processing
    const messageId = await enqueueJob({ workspaceId, driftId: driftCandidate.id });
    console.log(`[PagerDuty] Enqueued job ${messageId || 'sync'} for drift ${driftCandidate.id}`);

    results.push({
      eventType,
      signalEventId: signalEvent.id,
      driftId: driftCandidate.id,
      status: 'processed',
    });
  }

  return res.status(202).json({
    message: 'Webhook received',
    processed: results.filter(r => r.status === 'processed').length,
    ignored: results.filter(r => r.status === 'ignored').length,
    results,
  });
});

export default router;

