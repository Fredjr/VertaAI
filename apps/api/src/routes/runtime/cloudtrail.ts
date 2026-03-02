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
import crypto from 'crypto';
import https from 'https';
import { ingestCloudTrailEvent } from '../../services/runtime/observationIngestion.js';

// Certificate cache — avoids re-fetching the PEM on every webhook request
const certCache = new Map<string, string>();

/**
 * Fetch SNS signing certificate from AWS with SSRF guard + in-process cache.
 * Only hosts ending in `.amazonaws.com` are allowed.
 */
async function fetchCert(certUrl: string): Promise<string> {
  const parsed = new URL(certUrl);
  if (!parsed.hostname.endsWith('.amazonaws.com')) {
    throw new Error(`Rejected SNS SigningCertURL with non-Amazon host: ${parsed.hostname}`);
  }

  const cached = certCache.get(certUrl);
  if (cached) return cached;

  return new Promise((resolve, reject) => {
    https.get(certUrl, (res) => {
      let pem = '';
      res.on('data', (chunk: string) => { pem += chunk; });
      res.on('end', () => {
        certCache.set(certUrl, pem);
        resolve(pem);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Verify AWS SNS Notification message signature.
 *
 * Algorithm per AWS docs:
 * https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
 *
 * For a Notification message the string-to-sign is built from these fields
 * (alphabetical order, each field followed by \n):
 *   Message, MessageId, Subject (only if present), Timestamp, TopicArn, Type
 */
async function verifySNSSignature(notification: {
  Type: string;
  Message: string;
  MessageId: string;
  Subject?: string;
  Timestamp: string;
  TopicArn: string;
  Signature: string;
  SigningCertURL: string;
}): Promise<boolean> {
  try {
    const { Type, Message, MessageId, Subject, Timestamp, TopicArn, Signature, SigningCertURL } = notification;

    const cert = await fetchCert(SigningCertURL);

    let stringToSign = '';
    stringToSign += `Message\n${Message}\n`;
    stringToSign += `MessageId\n${MessageId}\n`;
    if (Subject) {
      stringToSign += `Subject\n${Subject}\n`;
    }
    stringToSign += `Timestamp\n${Timestamp}\n`;
    stringToSign += `TopicArn\n${TopicArn}\n`;
    stringToSign += `Type\n${Type}\n`;

    const verifier = crypto.createVerify('sha1WithRSAEncryption');
    verifier.update(stringToSign);
    return verifier.verify(cert, Buffer.from(Signature, 'base64'));
  } catch (error: any) {
    console.error('[CloudTrail Webhook] SNS signature verification error:', error.message);
    return false;
  }
}

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

    // Verify AWS SNS signature before trusting the payload
    // Explicit spread satisfies the required-field signature (Zod already validated all fields)
    const signatureValid = await verifySNSSignature({
      Type: notification.Type,
      Message: notification.Message,
      MessageId: notification.MessageId,
      Subject: notification.Subject,
      Timestamp: notification.Timestamp,
      TopicArn: notification.TopicArn,
      Signature: notification.Signature,
      SigningCertURL: notification.SigningCertURL,
    });
    if (!signatureValid) {
      console.warn('[CloudTrail Webhook] SNS signature verification failed — rejecting request');
      return res.status(403).json({
        success: false,
        error: 'SNS signature verification failed',
      });
    }

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

