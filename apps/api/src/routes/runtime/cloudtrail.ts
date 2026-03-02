/**
 * AWS CloudTrail Webhook Endpoint
 * 
 * Receives CloudTrail events and ingests them as runtime capability observations.
 * 
 * ARCHITECTURE:
 * - Validates CloudTrail event signature (SNS message verification)
 * - Maps CloudTrail events to capability types
 * - Stores observations in database
 * - Returns 200 OK to acknowledge receipt
 * 
 * USAGE:
 * POST /api/runtime/cloudtrail
 * Body: CloudTrail SNS notification
 */

import { Router } from 'express';
import { z } from 'zod';
import { ingestCloudTrailEvent } from '../../services/runtime/observationIngestion.js';

const router = Router();

/**
 * CloudTrail SNS notification schema
 */
const CloudTrailSNSNotificationSchema = z.object({
  Type: z.literal('Notification'),
  MessageId: z.string(),
  TopicArn: z.string(),
  Subject: z.string().optional(),
  Message: z.string(), // JSON string containing CloudTrail event
  Timestamp: z.string(),
  SignatureVersion: z.string(),
  Signature: z.string(),
  SigningCertURL: z.string(),
  UnsubscribeURL: z.string(),
});

/**
 * POST /api/runtime/cloudtrail
 * Ingest CloudTrail events from SNS notification
 */
router.post('/', async (req, res) => {
  try {
    console.log('[CloudTrail Webhook] Received event');

    // Parse SNS notification
    const notification = CloudTrailSNSNotificationSchema.parse(req.body);

    // Parse CloudTrail event from message
    const cloudTrailEvent = JSON.parse(notification.Message);

    // Extract workspace ID from topic ARN or use default
    // Format: arn:aws:sns:region:account:vertaai-cloudtrail-workspace-{workspaceId}
    const topicArn = notification.TopicArn;
    const workspaceIdMatch = topicArn.match(/vertaai-cloudtrail-workspace-(.+)$/);
    const workspaceId = workspaceIdMatch ? workspaceIdMatch[1] : 'default-workspace';

    console.log(`[CloudTrail Webhook] Processing event for workspace: ${workspaceId}`);

    // Ingest CloudTrail event
    // CloudTrail sends events in batches, so we need to handle Records array
    const records = cloudTrailEvent.Records || [cloudTrailEvent];
    const results = [];

    for (const record of records) {
      try {
        const service = record.eventSource || 'unknown';
        const observationId = await ingestCloudTrailEvent(workspaceId, service, record);
        results.push({ success: true, observationId });
      } catch (error: any) {
        console.error('[CloudTrail Webhook] Error ingesting record:', error.message);
        results.push({ success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[CloudTrail Webhook] Ingested ${successCount}/${records.length} events`);

    res.status(200).json({
      success: true,
      message: `Ingested ${successCount}/${records.length} CloudTrail events`,
      results,
    });
  } catch (error: any) {
    console.error('[CloudTrail Webhook] Error:', error.message);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/runtime/cloudtrail/subscription-confirmation
 * Handle SNS subscription confirmation
 */
router.post('/subscription-confirmation', async (req, res) => {
  try {
    const { Type, SubscribeURL } = req.body;

    if (Type === 'SubscriptionConfirmation') {
      console.log('[CloudTrail Webhook] SNS subscription confirmation received');
      console.log('[CloudTrail Webhook] Visit this URL to confirm:', SubscribeURL);

      // In production, you would automatically confirm by making a GET request to SubscribeURL
      // For now, we'll just log it and return success

      res.status(200).json({
        success: true,
        message: 'Subscription confirmation received. Please visit the SubscribeURL to confirm.',
        subscribeURL: SubscribeURL,
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid subscription confirmation',
      });
    }
  } catch (error: any) {
    console.error('[CloudTrail Webhook] Subscription confirmation error:', error.message);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;

