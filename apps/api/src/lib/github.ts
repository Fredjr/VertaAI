import crypto from 'crypto';
import { Octokit } from 'octokit';

// Verify GitHub webhook signature
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

// Create authenticated Octokit instance for a specific installation
export async function getInstallationOctokit(installationId: number): Promise<Octokit> {
  const appId = process.env.GH_APP_ID;
  const privateKey = process.env.GH_APP_PRIVATE_KEY?.replace(/\\n/g, '\n');
  
  if (!appId || !privateKey) {
    throw new Error('GitHub App credentials not configured');
  }

  // Create JWT for GitHub App authentication
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,
    exp: now + 600,
    iss: appId,
  };

  // Import jsonwebtoken dynamically to create JWT
  const jwt = await createAppJWT(payload, privateKey);
  
  // Get installation access token
  const appOctokit = new Octokit({ auth: jwt });
  const { data: { token } } = await appOctokit.rest.apps.createInstallationAccessToken({
    installation_id: installationId,
  });

  return new Octokit({ auth: token });
}

// Simple JWT creation for GitHub App
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

// Extract relevant info from a PR payload
export interface PRInfo {
  action: string;
  prNumber: number;
  prTitle: string;
  prBody: string | null;
  repoFullName: string;
  repoOwner: string;
  repoName: string;
  merged: boolean;
  mergedAt: string | null;
  baseBranch: string;
  headBranch: string;
  authorLogin: string;
  installationId: number;
  changedFiles: number;
}

export function extractPRInfo(payload: any): PRInfo | null {
  if (!payload.pull_request || !payload.repository) {
    return null;
  }

  const pr = payload.pull_request;
  const repo = payload.repository;

  // Extract owner from repo.owner.login or parse from full_name
  let repoOwner = repo.owner?.login;
  if (!repoOwner && repo.full_name) {
    repoOwner = repo.full_name.split('/')[0];
  }

  return {
    action: payload.action,
    prNumber: pr.number,
    prTitle: pr.title,
    prBody: pr.body || '',
    repoFullName: repo.full_name,
    repoOwner: repoOwner || 'unknown',
    repoName: repo.name,
    merged: pr.merged || false,
    mergedAt: pr.merged_at,
    baseBranch: pr.base?.ref || 'main',
    headBranch: pr.head?.ref || 'unknown',
    authorLogin: pr.user?.login || 'unknown',
    installationId: payload.installation?.id,
    changedFiles: pr.changed_files || 0,
  };
}

// Get PR diff from GitHub
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

// Get list of changed files in a PR
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

