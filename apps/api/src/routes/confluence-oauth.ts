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
const CONFLUENCE_SCOPES = [
  'read:confluence-content.all',
  'write:confluence-content',
  'read:confluence-space.summary',
  'offline_access', // For refresh tokens
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
  const { code, state, error } = req.query;

  if (error) {
    console.error(`[ConfluenceOAuth] Authorization error: ${error}`);
    return res.redirect(`${APP_URL}/auth/error?message=${encodeURIComponent(String(error))}`);
  }

  if (!code || !state) {
    return res.redirect(`${APP_URL}/auth/error?message=Missing authorization code or state`);
  }

  // Extract orgId from state
  const [orgId] = String(state).split(':');
  if (!orgId) {
    return res.redirect(`${APP_URL}/auth/error?message=Invalid state parameter`);
  }

  try {
    // Exchange code for access token
    const tokenResponse = await exchangeCodeForToken(String(code));

    if (!tokenResponse.access_token) {
      throw new Error('No access token received');
    }

    // Get accessible resources (cloud IDs)
    const resources = await getAccessibleResources(tokenResponse.access_token);
    
    if (!resources || resources.length === 0) {
      throw new Error('No Confluence sites accessible');
    }

    // Use the first accessible Confluence site
    const cloudId = resources[0].id;
    const siteName = resources[0].name;

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
    return res.redirect(`${APP_URL}/settings?confluence=connected`);

  } catch (err: any) {
    console.error(`[ConfluenceOAuth] Callback error:`, err);
    return res.redirect(`${APP_URL}/auth/error?message=${encodeURIComponent(err.message)}`);
  }
});

async function exchangeCodeForToken(code: string): Promise<any> {
  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CONFLUENCE_CLIENT_ID,
      client_secret: CONFLUENCE_CLIENT_SECRET,
      code,
      redirect_uri: `${API_URL}/auth/confluence/callback`,
    }),
  });

  return response.json();
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

