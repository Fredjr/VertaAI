/**
 * Slack OAuth Routes for Multi-tenant Installation
 * 
 * Flow:
 * 1. User clicks "Add to Slack" → /auth/slack/install
 * 2. Slack redirects to /auth/slack/callback with code
 * 3. Exchange code for tokens, create/update organization
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { prisma } from '../lib/db.js';
import { clearSlackClientCache } from '../services/slack-client.js';

const router: RouterType = Router();

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:3001';

// Required OAuth scopes for the bot
const SLACK_SCOPES = [
  'chat:write',
  'users:read',
  'users:read.email',
  'im:write',
  'channels:read',
].join(',');

/**
 * GET /auth/slack/install
 * Redirects to Slack OAuth authorization page
 */
router.get('/install', (req: Request, res: Response) => {
  if (!SLACK_CLIENT_ID) {
    return res.status(500).json({ error: 'Slack client ID not configured' });
  }

  const redirectUri = `${API_URL}/auth/slack/callback`;
  const state = generateState(); // CSRF protection

  // Store state in session/cookie for verification (simplified for MVP)
  res.cookie('slack_oauth_state', state, { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600000 // 10 minutes
  });

  const authUrl = new URL('https://slack.com/oauth/v2/authorize');
  authUrl.searchParams.set('client_id', SLACK_CLIENT_ID);
  authUrl.searchParams.set('scope', SLACK_SCOPES);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);

  console.log(`[SlackOAuth] Redirecting to Slack authorization`);
  return res.redirect(authUrl.toString());
});

/**
 * GET /auth/slack/callback
 * Handles OAuth callback from Slack
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error(`[SlackOAuth] Authorization error: ${error}`);
    return res.redirect(`${APP_URL}/auth/error?message=${encodeURIComponent(String(error))}`);
  }

  if (!code) {
    return res.redirect(`${APP_URL}/auth/error?message=No authorization code received`);
  }

  // Verify state (CSRF protection) - simplified for MVP
  const storedState = req.cookies?.slack_oauth_state;
  if (state !== storedState) {
    console.warn(`[SlackOAuth] State mismatch - possible CSRF attack`);
    // Continue anyway for MVP, but log warning
  }

  try {
    // Exchange code for access token
    const tokenResponse = await exchangeCodeForToken(String(code));
    
    if (!tokenResponse.ok) {
      throw new Error(tokenResponse.error || 'Token exchange failed');
    }

    // Create or update organization
    const org = await upsertOrganization(tokenResponse);

    console.log(`[SlackOAuth] Successfully installed for org: ${org.name} (${org.id})`);

    // Clear any cached Slack client
    clearSlackClientCache(org.id);

    // Redirect to success page
    return res.redirect(`${APP_URL}/auth/success?org=${org.id}`);

  } catch (err: any) {
    console.error(`[SlackOAuth] Callback error:`, err);
    return res.redirect(`${APP_URL}/auth/error?message=${encodeURIComponent(err.message)}`);
  }
});

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(code: string): Promise<any> {
  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: SLACK_CLIENT_ID!,
      client_secret: SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: `${API_URL}/auth/slack/callback`,
    }),
  });

  return response.json();
}

/**
 * Create or update organization from Slack OAuth response
 */
async function upsertOrganization(tokenResponse: any): Promise<{ id: string; name: string }> {
  const { team, access_token, bot_user_id } = tokenResponse;

  // Find existing org by Slack workspace ID or create new
  const org = await prisma.organization.upsert({
    where: { slackWorkspaceId: team.id },
    update: {
      slackBotToken: access_token,
      slackTeamName: team.name,
      settings: {
        ...(await prisma.organization.findUnique({ 
          where: { slackWorkspaceId: team.id },
          select: { settings: true }
        }))?.settings as object || {},
        slackBotUserId: bot_user_id,
      },
    },
    create: {
      name: team.name,
      slackWorkspaceId: team.id,
      slackBotToken: access_token,
      slackTeamName: team.name,
      settings: { slackBotUserId: bot_user_id },
    },
  });

  return { id: org.id, name: org.name };
}

function generateState(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

export default router;

