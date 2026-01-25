// QStash Job Enqueue Service
// Based on Section 15.10.3 of the spec

import { Client } from '@upstash/qstash';
import { JobPayload } from '../../types/state-machine.js';

// Create QStash client
const getQStashClient = (): Client | null => {
  if (!process.env.QSTASH_TOKEN) {
    console.warn('[QStash] QSTASH_TOKEN not configured - jobs will not be enqueued');
    return null;
  }
  return new Client({ token: process.env.QSTASH_TOKEN });
};

/**
 * Enqueue a drift processing job to QStash
 * This will trigger the /api/jobs/run endpoint
 */
export async function enqueueJob(payload: JobPayload): Promise<string | null> {
  const client = getQStashClient();
  if (!client) {
    console.log('[QStash] Skipping enqueue - client not configured');
    return null;
  }

  const appBaseUrl = process.env.APP_BASE_URL;
  if (!appBaseUrl) {
    console.warn('[QStash] APP_BASE_URL not configured');
    return null;
  }

  try {
    const result = await client.publishJSON({
      url: `${appBaseUrl}/api/jobs/run`,
      body: {
        ...payload,
        attempt: (payload.attempt || 0) + 1,
      },
      retries: 3,
      delay: 1, // 1 second delay to allow DB writes to propagate
    });

    console.log(`[QStash] Job enqueued: ${result.messageId} for drift ${payload.driftId}`);
    return result.messageId;
  } catch (error) {
    console.error('[QStash] Failed to enqueue job:', error);
    // Return null instead of throwing - let caller fall back to sync processing
    return null;
  }
}

/**
 * Enqueue a delayed job (e.g., for snoozed drifts)
 */
export async function enqueueDelayedJob(
  payload: JobPayload,
  delaySeconds: number
): Promise<string | null> {
  const client = getQStashClient();
  if (!client) {
    console.log('[QStash] Skipping delayed enqueue - client not configured');
    return null;
  }

  const appBaseUrl = process.env.APP_BASE_URL;
  if (!appBaseUrl) {
    console.warn('[QStash] APP_BASE_URL not configured');
    return null;
  }

  try {
    const result = await client.publishJSON({
      url: `${appBaseUrl}/api/jobs/run`,
      body: payload,
      delay: delaySeconds,
    });

    console.log(`[QStash] Delayed job enqueued: ${result.messageId} for drift ${payload.driftId} (delay: ${delaySeconds}s)`);
    return result.messageId;
  } catch (error) {
    console.error('[QStash] Failed to enqueue delayed job:', error);
    // Return null instead of throwing - let caller handle gracefully
    return null;
  }
}

/**
 * Check if QStash is configured
 */
export function isQStashConfigured(): boolean {
  return !!process.env.QSTASH_TOKEN && !!process.env.APP_BASE_URL;
}

