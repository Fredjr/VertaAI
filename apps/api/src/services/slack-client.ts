/**
 * Multi-tenant Slack Client
 * Handles OAuth, messaging, and interactions for multiple organizations/workspaces
 *
 * Supports both:
 * - NEW: Workspace + Integration model (Phase 1)
 * - LEGACY: Organization model (for backward compatibility)
 */

import { WebClient, LogLevel } from '@slack/web-api';
import { prisma } from '../lib/db.js';

// Cache of Slack clients per workspace/organization
const clientCache = new Map<string, WebClient>();

/**
 * Get or create a Slack WebClient for a workspace
 * Tries Integration model first, then falls back to Organization model
 * Uses cached client if available, otherwise creates new one from stored token
 */
export async function getSlackClient(workspaceOrOrgId: string): Promise<WebClient | null> {
  // Check cache first
  if (clientCache.has(workspaceOrOrgId)) {
    return clientCache.get(workspaceOrOrgId)!;
  }

  let botToken: string | null = null;

  // Try new Integration model first (Phase 1)
  const integration = await prisma.integration.findUnique({
    where: {
      workspaceId_type: {
        workspaceId: workspaceOrOrgId,
        type: 'slack',
      }
    },
    select: { config: true, status: true },
  });

  if (integration?.status === 'connected' && integration.config) {
    const config = integration.config as { botToken?: string };
    botToken = config.botToken || null;
  }

  // Fall back to legacy Organization model
  if (!botToken) {
    const org = await prisma.organization.findUnique({
      where: { id: workspaceOrOrgId },
      select: { slackBotToken: true },
    });
    botToken = org?.slackBotToken || null;
  }

  if (!botToken) {
    console.warn(`[SlackClient] No Slack token for workspace/org ${workspaceOrOrgId}`);
    return null;
  }

  // Create and cache client
  const client = new WebClient(botToken, {
    logLevel: LogLevel.WARN,
  });

  clientCache.set(workspaceOrOrgId, client);
  return client;
}

/**
 * Clear cached client for a workspace/organization (e.g., after token refresh)
 */
export function clearSlackClientCache(workspaceOrOrgId: string): void {
  clientCache.delete(workspaceOrOrgId);
}

/**
 * Send a message to a Slack channel or user
 */
export async function sendSlackMessage(
  orgId: string,
  channel: string,
  text: string,
  blocks?: any[]
): Promise<{ ok: boolean; ts?: string; channel?: string; error?: string }> {
  const client = await getSlackClient(orgId);
  if (!client) {
    return { ok: false, error: 'No Slack client available for organization' };
  }

  try {
    const result = await client.chat.postMessage({
      channel,
      text,
      blocks,
    });

    // Return the actual channel ID from Slack response (not the input which could be a name)
    return { ok: result.ok ?? false, ts: result.ts, channel: result.channel };
  } catch (error: any) {
    console.error(`[SlackClient] Error sending message:`, error);
    return { ok: false, error: error.message };
  }
}

/**
 * Update an existing Slack message
 */
export async function updateSlackMessage(
  orgId: string,
  channel: string,
  ts: string,
  text: string,
  blocks?: any[]
): Promise<{ ok: boolean; error?: string }> {
  const client = await getSlackClient(orgId);
  if (!client) {
    return { ok: false, error: 'No Slack client available for organization' };
  }

  try {
    const result = await client.chat.update({
      channel,
      ts,
      text,
      blocks,
    });

    return { ok: result.ok ?? false };
  } catch (error: any) {
    console.error(`[SlackClient] Error updating message:`, error);
    return { ok: false, error: error.message };
  }
}

/**
 * Get user info from Slack
 */
export async function getSlackUser(
  orgId: string,
  userId: string
): Promise<{ id: string; name: string; email?: string } | null> {
  const client = await getSlackClient(orgId);
  if (!client) return null;

  try {
    const result = await client.users.info({ user: userId });
    if (!result.ok || !result.user) return null;

    return {
      id: result.user.id!,
      name: result.user.real_name || result.user.name || 'Unknown',
      email: result.user.profile?.email,
    };
  } catch (error) {
    console.error(`[SlackClient] Error fetching user:`, error);
    return null;
  }
}

/**
 * Open a modal dialog in Slack
 */
export async function openSlackModal(
  orgId: string,
  triggerId: string,
  view: any
): Promise<{ ok: boolean; error?: string }> {
  const client = await getSlackClient(orgId);
  if (!client) {
    return { ok: false, error: 'No Slack client available for organization' };
  }

  try {
    const result = await client.views.open({
      trigger_id: triggerId,
      view,
    });

    return { ok: result.ok ?? false };
  } catch (error: any) {
    console.error(`[SlackClient] Error opening modal:`, error);
    return { ok: false, error: error.message };
  }
}

export { WebClient };

