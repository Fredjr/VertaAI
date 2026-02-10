/**
 * Datadog/Grafana Webhook Routes
 * 
 * Phase 5 - Multi-Source Architecture
 * Handles alert webhooks from Datadog and Grafana for environment drift detection.
 * 
 * @see MULTI_SOURCE_IMPLEMENTATION_PLAN.md Section 3.1
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/db.js';
import { enqueueJob } from '../services/queue/qstash.js';
import { isFeatureEnabled } from '../config/featureFlags.js';
import {
  normalizeDatadogAlert,
  normalizeGrafanaAlert,
  isSignificantAlert,
  type DatadogAlert,
  type GrafanaAlert,
} from '../services/signals/datadogNormalizer.js';

const router: RouterType = Router();

/**
 * POST /webhooks/datadog/:workspaceId
 * Handles Datadog alert webhooks
 */
router.post('/datadog/:workspaceId', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId;

  if (!workspaceId) {
    return res.status(400).json({ error: 'Missing workspaceId parameter' });
  }

  console.log(`[Datadog] Received webhook for workspace ${workspaceId}`);

  // Check feature flag
  if (!isFeatureEnabled('ENABLE_DATADOG_WEBHOOK', workspaceId)) {
    console.log(`[Datadog] Feature disabled for workspace ${workspaceId}`);
    return res.status(200).json({ status: 'feature_disabled' });
  }

  // Validate workspace exists
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace) {
    console.error(`[Datadog] Workspace not found: ${workspaceId}`);
    return res.status(404).json({ error: 'Workspace not found' });
  }

  const alert = req.body as DatadogAlert;

  // Check if alert is significant
  if (!isSignificantAlert(alert)) {
    console.log(`[Datadog] Alert ${alert.id} not significant, ignoring`);
    return res.status(200).json({ status: 'ignored', reason: 'not_significant' });
  }

  try {
    // Normalize the alert
    const normalized = normalizeDatadogAlert(alert, workspaceId);

    // Check idempotency
    const existingSignal = await prisma.signalEvent.findUnique({
      where: { workspaceId_id: { workspaceId, id: normalized.id } },
    });

    if (existingSignal) {
      console.log(`[Datadog] Alert ${alert.id} already processed`);
      return res.status(200).json({ status: 'already_processed', signalEventId: normalized.id });
    }

    // PATTERN 1: Validate extracted data BEFORE creating SignalEvent
    const { validateExtractedData } = await import('../services/validators/extractedDataValidator.js');
    const extractedData = {
      title: normalized.extracted.title,
      summary: normalized.extracted.summary,
      keywords: normalized.extracted.keywords,
      // REQUIRED by pre-validation and deterministic comparison
      monitorName: alert.title || alert.monitor_name || 'Unknown Monitor',  // REQUIRED by preValidateDatadogAlert
      severity: normalized.severity,  // REQUIRED by preValidateDatadogAlert
      alertType: normalized.extracted.alertType,  // REQUIRED by deterministic comparison
      alertId: normalized.alertId,  // REQUIRED by validator
      metric: normalized.extracted.metric || null,
      threshold: normalized.extracted.threshold || null,
      currentValue: normalized.extracted.currentValue || null,
      tags: normalized.extracted.tags,  // REQUIRED by validator
      driftTypeHints: normalized.extracted.driftTypeHints,
      environmentDriftEvidence: normalized.extracted.environmentDriftEvidence || null,
      alertUrl: normalized.alertUrl || null,
    };

    const validationResult = validateExtractedData('datadog_alert', extractedData);
    if (!validationResult.valid) {
      console.error(`[Datadog] Invalid extracted data: ${validationResult.errors.join(', ')}`);
      return res.status(400).json({
        error: 'Invalid extracted data',
        errors: validationResult.errors,
        warnings: validationResult.warnings,
      });
    }

    if (validationResult.warnings.length > 0) {
      console.warn(`[Datadog] Extracted data warnings: ${validationResult.warnings.join(', ')}`);
    }

    // Create SignalEvent
    const signalEvent = await prisma.signalEvent.create({
      data: {
        workspaceId,
        id: normalized.id,
        sourceType: 'datadog_alert',
        occurredAt: normalized.occurredAt,
        service: normalized.service,
        severity: normalized.severity,
        extracted: extractedData,
        rawPayload: JSON.parse(JSON.stringify(alert)),
      },
    });

    console.log(`[Datadog] Created signal event ${signalEvent.id}`);

    // Create DriftCandidate
    const driftCandidate = await prisma.driftCandidate.create({
      data: {
        workspaceId,
        signalEventId: signalEvent.id,
        state: 'INGESTED',
        sourceType: 'datadog_alert',
        service: normalized.service,
        driftType: 'environment_tooling', // Primary drift type for alerts
      },
    });

    console.log(`[Datadog] Created drift candidate ${driftCandidate.id}`);

    // Enqueue for async processing
    const messageId = await enqueueJob({ workspaceId, driftId: driftCandidate.id });
    console.log(`[Datadog] Enqueued job ${messageId || 'sync'} for drift ${driftCandidate.id}`);

    return res.status(202).json({
      status: 'accepted',
      signalEventId: signalEvent.id,
      driftId: driftCandidate.id,
    });
  } catch (error: any) {
    console.error(`[Datadog] Error processing alert:`, error);
    return res.status(500).json({ error: error.message || 'Failed to process alert' });
  }
});

/**
 * POST /webhooks/grafana/:workspaceId
 * Handles Grafana alert webhooks
 */
router.post('/grafana/:workspaceId', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId;

  if (!workspaceId) {
    return res.status(400).json({ error: 'Missing workspaceId parameter' });
  }

  console.log(`[Grafana] Received webhook for workspace ${workspaceId}`);

  // Check feature flag (using same flag as Datadog)
  if (!isFeatureEnabled('ENABLE_DATADOG_WEBHOOK', workspaceId)) {
    console.log(`[Grafana] Feature disabled for workspace ${workspaceId}`);
    return res.status(200).json({ status: 'feature_disabled' });
  }

  // Validate workspace exists
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace) {
    console.error(`[Grafana] Workspace not found: ${workspaceId}`);
    return res.status(404).json({ error: 'Workspace not found' });
  }

  const alert = req.body as GrafanaAlert;

  // Check if alert is significant
  if (!isSignificantAlert(alert)) {
    console.log(`[Grafana] Alert not significant, ignoring`);
    return res.status(200).json({ status: 'ignored', reason: 'not_significant' });
  }

  try {
    // Normalize the alert
    const normalized = normalizeGrafanaAlert(alert, workspaceId);

    // Check idempotency
    const existingSignal = await prisma.signalEvent.findUnique({
      where: { workspaceId_id: { workspaceId, id: normalized.id } },
    });

    if (existingSignal) {
      console.log(`[Grafana] Alert already processed`);
      return res.status(200).json({ status: 'already_processed', signalEventId: normalized.id });
    }

    // PATTERN 1: Validate extracted data BEFORE creating SignalEvent
    const { validateExtractedData } = await import('../services/validators/extractedDataValidator.js');
    const extractedData = {
      title: normalized.extracted.title,
      summary: normalized.extracted.summary,
      keywords: normalized.extracted.keywords,
      // REQUIRED by pre-validation and deterministic comparison
      monitorName: alert.title || alert.ruleName || 'Unknown Monitor',  // REQUIRED by preValidateDatadogAlert
      severity: normalized.severity,  // REQUIRED by preValidateDatadogAlert
      alertType: normalized.extracted.alertType,  // REQUIRED by deterministic comparison
      alertId: normalized.alertId,  // REQUIRED by validator
      metric: normalized.extracted.metric || null,
      currentValue: normalized.extracted.currentValue || null,
      tags: normalized.extracted.tags,  // REQUIRED by validator
      driftTypeHints: normalized.extracted.driftTypeHints,
      environmentDriftEvidence: normalized.extracted.environmentDriftEvidence || null,
      alertUrl: normalized.alertUrl || null,
    };

    const validationResult = validateExtractedData('grafana_alert', extractedData);
    if (!validationResult.valid) {
      console.error(`[Grafana] Invalid extracted data: ${validationResult.errors.join(', ')}`);
      return res.status(400).json({
        error: 'Invalid extracted data',
        errors: validationResult.errors,
        warnings: validationResult.warnings,
      });
    }

    if (validationResult.warnings.length > 0) {
      console.warn(`[Grafana] Extracted data warnings: ${validationResult.warnings.join(', ')}`);
    }

    // Create SignalEvent
    const signalEvent = await prisma.signalEvent.create({
      data: {
        workspaceId,
        id: normalized.id,
        sourceType: 'datadog_alert', // Using same source type for unified handling
        occurredAt: normalized.occurredAt,
        service: normalized.service,
        severity: normalized.severity,
        extracted: extractedData,
        rawPayload: JSON.parse(JSON.stringify(alert)),
      },
    });

    console.log(`[Grafana] Created signal event ${signalEvent.id}`);

    // Create DriftCandidate
    const driftCandidate = await prisma.driftCandidate.create({
      data: {
        workspaceId,
        signalEventId: signalEvent.id,
        state: 'INGESTED',
        sourceType: 'datadog_alert',
        service: normalized.service,
        driftType: 'environment_tooling',
      },
    });

    console.log(`[Grafana] Created drift candidate ${driftCandidate.id}`);

    // Enqueue for async processing
    const messageId = await enqueueJob({ workspaceId, driftId: driftCandidate.id });
    console.log(`[Grafana] Enqueued job ${messageId || 'sync'} for drift ${driftCandidate.id}`);

    return res.status(202).json({
      status: 'accepted',
      signalEventId: signalEvent.id,
      driftId: driftCandidate.id,
    });
  } catch (error: any) {
    console.error(`[Grafana] Error processing alert:`, error);
    return res.status(500).json({ error: error.message || 'Failed to process alert' });
  }
});

export default router;

