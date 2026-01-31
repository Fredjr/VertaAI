/**
 * Slack Channels API Routes
 * 
 * Provides endpoints for:
 * - Listing available Slack channels for a workspace
 * - Setting the default notification channel
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { prisma } from '../lib/db.js';

const router: RouterType = Router();

/**
 * GET /api/workspaces/:workspaceId/slack/channels
 * List available Slack channels the bot has access to
 */
router.get('/:workspaceId/slack/channels', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId;

  if (!workspaceId) {
    return res.status(400).json({ error: 'Workspace ID is required' });
  }

  try {
    // Get Slack integration for this workspace
    const integration = await prisma.integration.findUnique({
      where: {
        workspaceId_type: {
          workspaceId,
          type: 'slack',
        },
      },
    });

    if (!integration || integration.status !== 'connected') {
      return res.status(400).json({ error: 'Slack not connected for this workspace' });
    }

    const config = integration.config as any;
    const botToken = config?.botToken;

    if (!botToken) {
      return res.status(400).json({ error: 'No Slack bot token found' });
    }

    // Fetch channels from Slack API
    const response = await fetch('https://slack.com/api/conversations.list', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        types: 'public_channel,private_channel',
        limit: 200,
        exclude_archived: true,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error(`[SlackChannels] Failed to list channels:`, data.error);
      return res.status(500).json({ error: `Slack API error: ${data.error}` });
    }

    // Get current default channel from workspace
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { defaultOwnerRef: true, defaultOwnerType: true },
    });

    const channels = (data.channels || []).map((ch: any) => ({
      id: ch.id,
      name: ch.name,
      isPrivate: ch.is_private,
      isMember: ch.is_member,
      memberCount: ch.num_members,
      isSelected: workspace?.defaultOwnerRef === ch.id,
    }));

    // Sort: selected first, then member channels, then by name
    channels.sort((a: any, b: any) => {
      if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
      if (a.isMember !== b.isMember) return a.isMember ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return res.json({
      channels,
      currentChannelId: workspace?.defaultOwnerRef,
      count: channels.length,
    });
  } catch (err: any) {
    console.error(`[SlackChannels] Error listing channels:`, err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/workspaces/:workspaceId/slack/channels/default
 * Set the default notification channel for the workspace
 * 
 * Body: { channelId: string }
 */
router.post('/:workspaceId/slack/channels/default', async (req: Request, res: Response) => {
  const { workspaceId } = req.params;
  const { channelId } = req.body;

  if (!channelId) {
    return res.status(400).json({ error: 'channelId is required' });
  }

  try {
    // Verify workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Update workspace default channel
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        defaultOwnerRef: channelId,
        defaultOwnerType: 'slack_channel',
      },
    });

    console.log(`[SlackChannels] Set default channel for workspace ${workspaceId} to ${channelId}`);

    return res.json({
      success: true,
      channelId,
    });
  } catch (err: any) {
    console.error(`[SlackChannels] Error setting default channel:`, err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;

