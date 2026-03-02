/**
 * GCP Audit Log Webhook Endpoint
 * 
 * Receives GCP Audit Log entries and ingests them as runtime capability observations.
 * 
 * ARCHITECTURE:
 * - Validates GCP Pub/Sub message signature
 * - Maps GCP Audit Log entries to capability types
 * - Stores observations in database
 * - Returns 200 OK to acknowledge receipt
 * 
 * USAGE:
 * POST /api/runtime/gcp-audit
 * Body: GCP Pub/Sub push notification
 */

import { Router } from 'express';
import { z } from 'zod';
import { ingestGCPAuditLog } from '../../services/runtime/observationIngestion.js';

const router = Router();

/**
 * GCP Pub/Sub push notification schema
 */
const GCPPubSubPushSchema = z.object({
  message: z.object({
    data: z.string(), // Base64-encoded JSON string containing audit log entry
    messageId: z.string(),
    publishTime: z.string(),
    attributes: z.record(z.string()).optional(),
  }),
  subscription: z.string(),
});

/**
 * POST /api/runtime/gcp-audit
 * Ingest GCP Audit Log entries from Pub/Sub push notification
 */
router.post('/', async (req, res) => {
  try {
    console.log('[GCP Audit Webhook] Received event');

    // Parse Pub/Sub notification
    const notification = GCPPubSubPushSchema.parse(req.body);

    // Decode base64 message data
    const messageData = Buffer.from(notification.message.data, 'base64').toString('utf-8');
    const auditLogEntry = JSON.parse(messageData);

    // Extract workspace ID from subscription name or use default
    // Format: projects/{project}/subscriptions/vertaai-audit-workspace-{workspaceId}
    const subscription = notification.subscription;
    const workspaceIdMatch = subscription.match(/vertaai-audit-workspace-(.+)$/);
    const workspaceId = workspaceIdMatch ? workspaceIdMatch[1] : 'default-workspace';

    console.log(`[GCP Audit Webhook] Processing event for workspace: ${workspaceId}`);

    // Ingest GCP Audit Log entry
    const service = auditLogEntry.protoPayload?.serviceName || auditLogEntry.resource?.labels?.service_name || 'unknown';
    const observationId = await ingestGCPAuditLog(workspaceId, service, auditLogEntry);

    console.log(`[GCP Audit Webhook] Ingested observation: ${observationId}`);

    res.status(200).json({
      success: true,
      message: 'GCP Audit Log entry ingested successfully',
      observationId,
    });
  } catch (error: any) {
    console.error('[GCP Audit Webhook] Error:', error.message);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/runtime/gcp-audit/batch
 * Ingest multiple GCP Audit Log entries in a single request
 */
router.post('/batch', async (req, res) => {
  try {
    console.log('[GCP Audit Webhook] Received batch event');

    const { workspaceId, entries } = req.body;

    if (!workspaceId || !Array.isArray(entries)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: workspaceId and entries array required',
      });
    }

    console.log(`[GCP Audit Webhook] Processing ${entries.length} entries for workspace: ${workspaceId}`);

    const results = [];

    for (const entry of entries) {
      try {
        const service = entry.protoPayload?.serviceName || entry.resource?.labels?.service_name || 'unknown';
        const observationId = await ingestGCPAuditLog(workspaceId, service, entry);
        results.push({ success: true, observationId });
      } catch (error: any) {
        console.error('[GCP Audit Webhook] Error ingesting entry:', error.message);
        results.push({ success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[GCP Audit Webhook] Ingested ${successCount}/${entries.length} entries`);

    res.status(200).json({
      success: true,
      message: `Ingested ${successCount}/${entries.length} GCP Audit Log entries`,
      results,
    });
  } catch (error: any) {
    console.error('[GCP Audit Webhook] Batch error:', error.message);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;

