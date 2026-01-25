/**
 * Notion OAuth Routes for Multi-tenant Integration (Phase 4)
 *
 * Flow:
 * 1. User clicks "Connect Notion" → /auth/notion/install
 * 2. Notion redirects to /auth/notion/callback with code
 * 3. Exchange code for access token, store in workspace Integration
 *
 * Notion OAuth Reference:
 * https://developers.notion.com/docs/authorization
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/db.js';

const router: RouterType = Router();

const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID;
const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET;
const API_URL = process.env.API_URL || 'http://localhost:3001';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

/**
 * Generate a random state string for OAuth
 */
function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * GET /auth/notion/install
 * Redirects to Notion OAuth authorization page
 */
router.get('/install', (req: Request, res: Response) => {
  const { workspaceId } = req.query;

  if (!NOTION_CLIENT_ID) {
    return res.status(500).json({ error: 'Notion client ID not configured' });
  }

  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId query parameter required' });
  }

  const redirectUri = `${API_URL}/auth/notion/callback`;
  const state = `${workspaceId}:${generateState()}`;

  // Store state in cookie for verification
  res.cookie('notion_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600000, // 10 minutes
  });

  // Notion OAuth URL
  const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
  authUrl.searchParams.set('client_id', NOTION_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('owner', 'user'); // Authorize as user, not workspace
  authUrl.searchParams.set('state', state);

  console.log(`[NotionOAuth] Redirecting to Notion authorization for workspace ${workspaceId}`);
  return res.redirect(authUrl.toString());
});

/**
 * GET /auth/notion/callback
 * Handles OAuth callback from Notion
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  console.log(`[NotionOAuth] Callback received - code: ${code ? 'present' : 'missing'}, state: ${state}`);

  if (error) {
    console.error(`[NotionOAuth] Authorization error: ${error}`);
    return res.status(400).json({ success: false, error: String(error) });
  }

  if (!code || !state) {
    return res.status(400).json({ success: false, error: 'Missing authorization code or state' });
  }

  // Parse state: format is "workspaceId:nonce"
  const [workspaceId] = String(state).split(':');

  if (!workspaceId) {
    return res.status(400).json({ success: false, error: 'Invalid state parameter' });
  }

  try {
    // Exchange code for access token
    console.log(`[NotionOAuth] Exchanging code for token...`);

    const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${API_URL}/auth/notion/callback`,
      }),
    });

    const tokenData = await tokenResponse.json() as any;

    if (tokenData.error) {
      console.error(`[NotionOAuth] Token exchange error:`, tokenData);
      throw new Error(`Token exchange failed: ${tokenData.error}`);
    }

    if (!tokenData.access_token) {
      console.error(`[NotionOAuth] No access token in response:`, tokenData);
      throw new Error('No access token received');
    }

    console.log(`[NotionOAuth] Token received for workspace: ${tokenData.workspace_name}`);

    // Create/update Notion integration for workspace
    await prisma.integration.upsert({
      where: {
        workspaceId_type: {
          workspaceId,
          type: 'notion',
        },
      },
      update: {
        status: 'connected',
        config: {
          accessToken: tokenData.access_token,
          botId: tokenData.bot_id,
          workspaceId: tokenData.workspace_id,
          workspaceName: tokenData.workspace_name,
          workspaceIcon: tokenData.workspace_icon,
          owner: tokenData.owner,
        },
      },
      create: {
        workspaceId,
        type: 'notion',
        status: 'connected',
        config: {
          accessToken: tokenData.access_token,
          botId: tokenData.bot_id,
          workspaceId: tokenData.workspace_id,
          workspaceName: tokenData.workspace_name,
          workspaceIcon: tokenData.workspace_icon,
          owner: tokenData.owner,
        },
      },
    });

    console.log(`[NotionOAuth] Notion integration connected for workspace ${workspaceId}`);

    // Redirect to success page
    return res.redirect(`${APP_URL}/settings/integrations?notion=success`);
  } catch (error: any) {
    console.error(`[NotionOAuth] Error:`, error);
    return res.redirect(`${APP_URL}/settings/integrations?notion=error&message=${encodeURIComponent(error.message)}`);
  }
});

export default router;

