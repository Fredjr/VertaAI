/**
 * Confluence OAuth Routes for Multi-tenant Integration
 * 
 * Flow:
 * 1. User clicks "Connect Confluence" → /auth/confluence/install
 * 2. Atlassian redirects to /auth/confluence/callback with code
 * 3. Exchange code for tokens, store in organization
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { prisma } from '../lib/db.js';

const router: RouterType = Router();

const CONFLUENCE_CLIENT_ID = process.env.CONFLUENCE_CLIENT_ID;
const CONFLUENCE_CLIENT_SECRET = process.env.CONFLUENCE_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:3001';

// Required OAuth scopes for Confluence
// These must match exactly what's configured in the Atlassian Developer Console
// Using granular scopes (v2) instead of classic scopes
const CONFLUENCE_SCOPES = [
  'read:me',
  'read:page:confluence',
  'write:page:confluence',
  'offline_access',
].join(' ');

/**
 * GET /auth/confluence/install
 * Redirects to Atlassian OAuth authorization page
 * Requires orgId query param to link to existing organization
 */
router.get('/install', (req: Request, res: Response) => {
  const { orgId } = req.query;

  if (!CONFLUENCE_CLIENT_ID) {
    return res.status(500).json({ error: 'Confluence client ID not configured' });
  }

  if (!orgId) {
    return res.status(400).json({ error: 'orgId query parameter required' });
  }

  const redirectUri = `${API_URL}/auth/confluence/callback`;
  const state = `${orgId}:${generateState()}`; // Include orgId in state

  // Store state in cookie for verification
  res.cookie('confluence_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600000, // 10 minutes
  });

  const authUrl = new URL('https://auth.atlassian.com/authorize');
  authUrl.searchParams.set('audience', 'api.atlassian.com');
  authUrl.searchParams.set('client_id', CONFLUENCE_CLIENT_ID);
  authUrl.searchParams.set('scope', CONFLUENCE_SCOPES);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('prompt', 'consent');

  console.log(`[ConfluenceOAuth] Redirecting to Atlassian authorization for org ${orgId}`);
  return res.redirect(authUrl.toString());
});

/**
 * GET /auth/confluence/callback
 * Handles OAuth callback from Atlassian
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query;

  console.log(`[ConfluenceOAuth] Callback received - code: ${code ? 'present' : 'missing'}, state: ${state}, error: ${error}`);

  if (error) {
    console.error(`[ConfluenceOAuth] Authorization error: ${error} - ${error_description}`);
    return res.status(400).json({
      success: false,
      error: String(error),
      description: String(error_description || '')
    });
  }

  if (!code || !state) {
    return res.status(400).json({ success: false, error: 'Missing authorization code or state' });
  }

  // Extract orgId from state
  const [orgId] = String(state).split(':');
  if (!orgId) {
    return res.status(400).json({ success: false, error: 'Invalid state parameter' });
  }

  try {
    // Exchange code for access token
    console.log(`[ConfluenceOAuth] Exchanging code for token...`);
    const tokenResponse = await exchangeCodeForToken(String(code));

    if (tokenResponse.error) {
      console.error(`[ConfluenceOAuth] Token exchange error:`, tokenResponse);
      throw new Error(`Token exchange failed: ${tokenResponse.error} - ${tokenResponse.error_description || ''}`);
    }

    if (!tokenResponse.access_token) {
      console.error(`[ConfluenceOAuth] No access token in response:`, tokenResponse);
      throw new Error('No access token received');
    }

    console.log(`[ConfluenceOAuth] Token received, fetching accessible resources...`);

    // Get accessible resources (cloud IDs)
    const resources = await getAccessibleResources(tokenResponse.access_token);

    if (!resources || resources.length === 0) {
      console.error(`[ConfluenceOAuth] No accessible resources:`, resources);
      throw new Error('No Confluence sites accessible');
    }

    // Use the first accessible Confluence site
    const cloudId = resources[0].id;
    const siteName = resources[0].name;

    console.log(`[ConfluenceOAuth] Found Confluence site: ${siteName} (${cloudId})`);

    // Update organization with Confluence credentials
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        confluenceCloudId: cloudId,
        confluenceAccessToken: tokenResponse.access_token,
        settings: {
          confluenceSiteName: siteName,
          confluenceRefreshToken: tokenResponse.refresh_token,
        },
      },
    });

    console.log(`[ConfluenceOAuth] Successfully connected Confluence for org ${orgId}: ${siteName}`);

    // Return success page instead of redirect
    return res.send(`
      <html>
        <head><title>Confluence Connected</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>✅ Confluence Connected!</h1>
          <p>Site: <strong>${siteName}</strong></p>
          <p>Cloud ID: <code>${cloudId}</code></p>
          <p>You can close this window and return to Slack to test the approval flow.</p>
        </body>
      </html>
    `);

  } catch (err: any) {
    console.error(`[ConfluenceOAuth] Callback error:`, err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

async function exchangeCodeForToken(code: string): Promise<any> {
  const redirectUri = `${API_URL}/auth/confluence/callback`;
  console.log(`[ConfluenceOAuth] Exchanging code for token with redirect_uri: ${redirectUri}`);

  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CONFLUENCE_CLIENT_ID,
      client_secret: CONFLUENCE_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    console.error(`[ConfluenceOAuth] Token exchange failed:`, data);
  }
  return data;
}

async function getAccessibleResources(accessToken: string): Promise<any[]> {
  const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return response.json();
}

function generateState(): string {
  return Math.random().toString(36).substring(2, 15);
}

export default router;

