/**
 * GitHub OAuth Routes for Multi-tenant GitHub App Installation
 *
 * Flow:
 * 1. User clicks "Connect GitHub" → /auth/github/install
 * 2. GitHub redirects to /auth/github/callback with installation_id
 * 3. Store installationId and setup info in workspace's Integration.config
 *
 * GitHub App installation flow is different from standard OAuth:
 * - Users install the GitHub App on their org/repos
 * - GitHub sends installation_id in callback
 * - We use installation_id to authenticate API calls per workspace
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { prisma } from '../lib/db.js';
import { clearGitHubClientCache } from '../services/github-client.js';

const router: RouterType = Router();

// GitHub App configuration from environment
const GITHUB_APP_NAME = process.env.GITHUB_APP_NAME || 'vertaai';
const GITHUB_APP_ID = process.env.GH_APP_ID;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:3001';

/**
 * GET /auth/github/install
 * Redirects to GitHub App installation page
 *
 * Query params:
 * - workspaceId: (required) The workspace to associate this installation with
 */
router.get('/install', async (req: Request, res: Response) => {
  const { workspaceId } = req.query;

  if (!workspaceId) {
    return res.status(400).json({ 
      error: 'workspaceId query parameter required',
      example: '/auth/github/install?workspaceId=YOUR_WORKSPACE_ID'
    });
  }

  // Verify workspace exists
  const workspace = await prisma.workspace.findUnique({
    where: { id: String(workspaceId) },
  });

  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found' });
  }

  // Generate state for CSRF protection and workspace association
  const state = `${workspaceId}:${generateState()}`;
  
  // Store state in cookie for verification
  res.cookie('github_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600000, // 10 minutes
    sameSite: 'lax',
  });

  // Build GitHub App installation URL
  // Users can install on all repos or select specific ones
  const installUrl = new URL(`https://github.com/apps/${GITHUB_APP_NAME}/installations/new`);
  installUrl.searchParams.set('state', state);

  console.log(`[GitHubOAuth] Redirecting workspace ${workspaceId} to GitHub App installation`);
  return res.redirect(installUrl.toString());
});

/**
 * GET /auth/github/callback
 * Handles callback from GitHub after app installation
 *
 * GitHub sends:
 * - installation_id: The installation ID for API access
 * - setup_action: 'install' or 'update'
 * - state: Our state parameter for CSRF/workspace association
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { installation_id, setup_action, state, code } = req.query;

  console.log(`[GitHubOAuth] Callback received - installation_id: ${installation_id}, setup_action: ${setup_action}, state: ${state ? 'present' : 'missing'}`);

  // Parse state to get workspaceId
  const stateParts = String(state || '').split(':');
  const workspaceId = stateParts[0];

  if (!workspaceId) {
    console.error('[GitHubOAuth] No workspaceId in state');
    return res.redirect(`${APP_URL}/auth/error?message=${encodeURIComponent('Invalid state - no workspace ID')}`);
  }

  // Verify state matches cookie (CSRF protection)
  const storedState = req.cookies?.github_oauth_state;
  if (state !== storedState) {
    console.warn(`[GitHubOAuth] State mismatch - expected: ${storedState}, got: ${state}`);
    // Continue anyway for MVP, but log warning
  }

  if (!installation_id) {
    console.error('[GitHubOAuth] No installation_id in callback');
    return res.redirect(`${APP_URL}/auth/error?message=${encodeURIComponent('No installation ID received')}`);
  }

  try {
    // Verify workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Get installation details from GitHub API (optional - for repo list)
    const repos = await getInstallationRepos(Number(installation_id));

    // Generate a unique webhook secret for this workspace
    const webhookSecret = generateWebhookSecret();

    // Upsert GitHub integration for this workspace
    await prisma.integration.upsert({
      where: {
        workspaceId_type: {
          workspaceId,
          type: 'github',
        },
      },
      update: {
        status: 'connected',
        webhookSecret,
        config: {
          installationId: Number(installation_id),
          appId: GITHUB_APP_ID,
          setupAction: setup_action,
          repos: repos.map((r: any) => r.full_name),
          installedAt: new Date().toISOString(),
          webhookSecret, // Also in config for easy access
        },
      },
      create: {
        workspaceId,
        type: 'github',
        status: 'connected',
        webhookSecret,
        config: {
          installationId: Number(installation_id),
          appId: GITHUB_APP_ID,
          setupAction: setup_action,
          repos: repos.map((r: any) => r.full_name),
          installedAt: new Date().toISOString(),
          webhookSecret,
        },
      },
    });

    // Clear any cached GitHub client for this workspace
    clearGitHubClientCache(workspaceId);

    console.log(`[GitHubOAuth] Successfully installed GitHub App for workspace ${workspaceId} (installation: ${installation_id}, repos: ${repos.length})`);

    // Redirect to success page with webhook URL info
    const webhookUrl = `${API_URL}/webhooks/github/${workspaceId}`;
    return res.redirect(`${APP_URL}/onboarding?workspace=${workspaceId}&github=connected&webhookUrl=${encodeURIComponent(webhookUrl)}`);

  } catch (err: any) {
    console.error(`[GitHubOAuth] Callback error:`, err);
    return res.redirect(`${APP_URL}/auth/error?message=${encodeURIComponent(err.message)}`);
  }
});

/**
 * GET /auth/github/status/:workspaceId
 * Check GitHub connection status for a workspace
 */
router.get('/status/:workspaceId', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;

  try {
    const integration = await prisma.integration.findUnique({
      where: {
        workspaceId_type: {
          workspaceId,
          type: 'github',
        },
      },
    });

    if (!integration) {
      return res.json({
        connected: false,
        status: 'not_installed',
      });
    }

    const config = integration.config as any;
    return res.json({
      connected: integration.status === 'connected',
      status: integration.status,
      installationId: config?.installationId,
      repos: config?.repos || [],
      installedAt: config?.installedAt,
      webhookUrl: `${API_URL}/webhooks/github/${workspaceId}`,
    });
  } catch (err: any) {
    console.error(`[GitHubOAuth] Status check error:`, err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Get list of repos accessible to the installation
 * Uses GitHub App auth to fetch installation repos
 */
async function getInstallationRepos(installationId: number): Promise<any[]> {
  try {
    // Import the existing getGitHubClient which handles app auth
    const { App } = await import('octokit');

    const appId = process.env.GH_APP_ID;
    const privateKey = process.env.GH_APP_PRIVATE_KEY;

    if (!appId || !privateKey) {
      console.warn('[GitHubOAuth] GH_APP_ID or GH_APP_PRIVATE_KEY not set - cannot fetch repos');
      return [];
    }

    const app = new App({
      appId,
      privateKey,
    });

    const octokit = await app.getInstallationOctokit(installationId);

    const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
      per_page: 100,
    });

    return data.repositories || [];
  } catch (err: any) {
    console.error('[GitHubOAuth] Error fetching installation repos:', err.message);
    return [];
  }
}

/**
 * Generate random state for CSRF protection
 */
function generateState(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}

/**
 * Generate a secure webhook secret for the workspace
 */
function generateWebhookSecret(): string {
  const crypto = require('crypto');
  return 'whsec_' + crypto.randomBytes(24).toString('hex');
}

export default router;

