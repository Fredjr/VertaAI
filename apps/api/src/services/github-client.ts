/**
 * Multi-tenant GitHub Client
 * Handles GitHub API interactions for multiple workspaces
 *
 * Supports:
 * - Workspace + Integration model (per-workspace credentials stored in Integration.config)
 * - GitHub App authentication (installationId + appId + privateKey)
 * - Personal Access Token authentication (accessToken)
 * - Webhook signature verification (webhookSecret)
 */

import { Octokit } from 'octokit';
import crypto from 'crypto';
import { prisma } from '../lib/db.js';

// Cache of Octokit clients per workspace
const clientCache = new Map<string, Octokit>();

/**
 * GitHub credentials stored in Integration.config
 */
export interface GitHubIntegrationConfig {
  // GitHub App authentication (preferred for organization repos)
  appId?: string;
  privateKey?: string;
  installationId?: number;
  
  // Personal Access Token authentication (for personal repos or simpler setup)
  accessToken?: string;
  
  // Webhook secret for signature verification
  webhookSecret?: string;
  
  // Optional: list of repos this integration has access to
  repos?: string[];
}

/**
 * Get GitHub credentials for a workspace from the Integration table
 */
export async function getGitHubIntegration(workspaceId: string): Promise<GitHubIntegrationConfig | null> {
  const integration = await prisma.integration.findUnique({
    where: {
      workspaceId_type: {
        workspaceId,
        type: 'github',
      }
    },
    select: { config: true, status: true },
  });

  if (integration?.status === 'connected' && integration.config) {
    return integration.config as GitHubIntegrationConfig;
  }

  return null;
}

/**
 * Get webhook secret for a workspace
 * Falls back to environment variable if not stored per-workspace
 */
export async function getWorkspaceWebhookSecret(workspaceId: string): Promise<string | null> {
  const config = await getGitHubIntegration(workspaceId);
  
  // Prefer workspace-specific secret
  if (config?.webhookSecret) {
    return config.webhookSecret;
  }
  
  // Also check the Integration.webhookSecret field directly
  const integration = await prisma.integration.findUnique({
    where: {
      workspaceId_type: {
        workspaceId,
        type: 'github',
      }
    },
    select: { webhookSecret: true },
  });
  
  if (integration?.webhookSecret) {
    return integration.webhookSecret;
  }
  
  // Fall back to environment variable (legacy)
  return process.env.GH_WEBHOOK_SECRET || null;
}

/**
 * Verify GitHub webhook signature using workspace-specific secret
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) return false;
  
  const sig = Buffer.from(signature, 'utf8');
  const hmac = crypto.createHmac('sha256', secret);
  const digest = Buffer.from('sha256=' + hmac.update(payload).digest('hex'), 'utf8');
  
  if (sig.length !== digest.length) return false;
  return crypto.timingSafeEqual(digest, sig);
}

/**
 * Create JWT for GitHub App authentication
 */
async function createAppJWT(payload: object, privateKey: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  
  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  const signatureInput = `${base64Header}.${base64Payload}`;
  
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(privateKey, 'base64url');
  
  return `${signatureInput}.${signature}`;
}

/**
 * Get an authenticated Octokit instance for a workspace
 * Tries workspace-specific credentials first, then falls back to environment variables
 */
export async function getGitHubClient(workspaceId: string, installationIdOverride?: number): Promise<Octokit | null> {
  const cacheKey = `${workspaceId}:${installationIdOverride || 'default'}`;
  
  // Check cache first
  if (clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey)!;
  }

  const config = await getGitHubIntegration(workspaceId);
  
  // Strategy 1: Use workspace-specific GitHub App credentials
  if (config?.appId && config?.privateKey) {
    const installationId = installationIdOverride || config.installationId;
    if (installationId) {
      try {
        const octokit = await createInstallationOctokit(
          config.appId,
          config.privateKey.replace(/\\n/g, '\n'),
          installationId
        );
        clientCache.set(cacheKey, octokit);
        return octokit;
      } catch (error) {
        console.error(`[GitHubClient] Failed to create app client for workspace ${workspaceId}:`, error);
      }
    }
  }
  
  // Strategy 2: Use workspace-specific Personal Access Token
  if (config?.accessToken) {
    const octokit = new Octokit({ auth: config.accessToken });
    clientCache.set(cacheKey, octokit);
    return octokit;
  }
  
  // Strategy 3: Fall back to environment variables (legacy)
  return getEnvOctokit(installationIdOverride);
}

/**
 * Create Octokit from GitHub App installation using workspace-specific or env credentials
 */
async function createInstallationOctokit(appId: string, privateKey: string, installationId: number): Promise<Octokit> {
  // Create JWT for GitHub App authentication
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,
    exp: now + 600,
    iss: appId,
  };

  const jwt = await createAppJWT(payload, privateKey);

  // Get installation access token
  const appOctokit = new Octokit({ auth: jwt });
  const { data: { token } } = await appOctokit.rest.apps.createInstallationAccessToken({
    installation_id: installationId,
  });

  return new Octokit({ auth: token });
}

/**
 * Fall back to environment variables for GitHub authentication
 */
async function getEnvOctokit(installationIdOverride?: number): Promise<Octokit | null> {
  // Try GitHub App auth with env vars
  const appId = process.env.GH_APP_ID;
  const privateKey = process.env.GH_APP_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (appId && privateKey && installationIdOverride) {
    try {
      return await createInstallationOctokit(appId, privateKey, installationIdOverride);
    } catch (error) {
      console.error('[GitHubClient] Failed to create env app client:', error);
    }
  }

  // Try Personal Access Token from env
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    return new Octokit({ auth: token });
  }

  console.warn('[GitHubClient] No GitHub credentials available');
  return null;
}

/**
 * Clear cached client for a workspace (e.g., after token refresh)
 */
export function clearGitHubClientCache(workspaceId: string): void {
  // Clear all cache entries for this workspace
  for (const key of clientCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) {
      clientCache.delete(key);
    }
  }
}

/**
 * Get PR diff from GitHub using workspace-scoped client
 */
export async function getPRDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  const { data } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: { format: 'diff' },
  });

  return data as unknown as string;
}

/**
 * Get list of changed files in a PR
 */
export async function getPRFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<Array<{ filename: string; status: string; additions: number; deletions: number }>> {
  const { data } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  return data.map(file => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
  }));
}

/**
 * Fetch file content from a repository
 */
export async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<string | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if ('content' in data && data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch (error) {
    console.error(`[GitHubClient] Error fetching file ${path}:`, error);
    return null;
  }
}

