/**
 * README.md Adapter
 * 
 * Fetches and creates PRs for README.md and other markdown files in GitHub repos.
 * Part of the multi-source architecture for developer documentation.
 * 
 * @see MULTI_SOURCE_IMPLEMENTATION_PLAN.md Section 6.3
 */

import { Octokit } from 'octokit';
import crypto from 'crypto';
import type {
  DocRef,
  DocFetchResult,
  WritePatchParams,
  WriteResult,
  CreatePRParams,
  PRResult,
  GitHubDocAdapter,
} from './types.js';

export interface ReadmeAdapterConfig {
  installationId?: number;
  accessToken?: string;
  appId?: string;
  privateKey?: string;
}

export interface ReadmeAdapter extends GitHubDocAdapter {
  system: 'github_readme';
}

/**
 * Create a README adapter with the given configuration
 */
export function createReadmeAdapter(config: ReadmeAdapterConfig): ReadmeAdapter {
  let octokitInstance: Octokit | null = null;

  async function getOctokit(): Promise<Octokit> {
    if (octokitInstance) return octokitInstance;

    // Try Personal Access Token first
    if (config.accessToken) {
      octokitInstance = new Octokit({ auth: config.accessToken });
      return octokitInstance;
    }

    // Try GitHub App installation
    if (config.installationId && config.appId && config.privateKey) {
      const jwt = await createAppJWT(config.appId, config.privateKey.replace(/\\n/g, '\n'));
      const appOctokit = new Octokit({ auth: jwt });
      const { data: { token } } = await appOctokit.rest.apps.createInstallationAccessToken({
        installation_id: config.installationId,
      });
      octokitInstance = new Octokit({ auth: token });
      return octokitInstance;
    }

    throw new Error('No GitHub credentials provided for README adapter');
  }

  return {
    system: 'github_readme',
    category: 'developer',

    async fetch(doc: DocRef): Promise<DocFetchResult> {
      if (!doc.owner || !doc.repo) {
        throw new Error('DocRef must include owner and repo for GitHub README');
      }

      const octokit = await getOctokit();
      const filePath = doc.filePath || 'README.md';

      const { data } = await octokit.rest.repos.getContent({
        owner: doc.owner,
        repo: doc.repo,
        path: filePath,
        ref: doc.ref,
      });

      if (Array.isArray(data) || data.type !== 'file') {
        throw new Error(`Path ${filePath} is not a file`);
      }

      const content = Buffer.from(data.content, 'base64').toString('utf-8');

      // Extract title from first heading or filename
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = (titleMatch && titleMatch[1]) ? titleMatch[1] : filePath;

      return {
        doc,
        baseRevision: data.sha,
        format: 'markdown',
        content,
        markdown: content,
        title,
        metadata: {
          path: data.path,
          size: data.size,
          htmlUrl: data.html_url,
        },
      };
    },

    async writePatch(_params: WritePatchParams): Promise<WriteResult> {
      // README adapter doesn't support direct writes - use createPatchPR instead
      return {
        success: false,
        error: 'Direct writeback not supported. Use createPatchPR to create a PR.',
      };
    },

    supportsDirectWriteback(): boolean {
      return false;
    },

    getDocUrl(doc: DocRef): string {
      if (doc.docUrl) return doc.docUrl;
      const filePath = doc.filePath || 'README.md';
      const ref = doc.ref || 'main';
      return `https://github.com/${doc.owner}/${doc.repo}/blob/${ref}/${filePath}`;
    },

    async getFileContent(doc: DocRef): Promise<string | null> {
      try {
        const result = await this.fetch(doc);
        return result.content;
      } catch (error) {
        console.error(`[ReadmeAdapter] Error fetching file:`, error);
        return null;
      }
    },

    async getFileSha(doc: DocRef): Promise<string | null> {
      try {
        const result = await this.fetch(doc);
        return result.baseRevision;
      } catch (error) {
        console.error(`[ReadmeAdapter] Error getting file SHA:`, error);
        return null;
      }
    },

    async createPatchPR(params: CreatePRParams): Promise<PRResult> {
      const { doc, baseSha, newContent } = params;
      const title = params.title || '[VertaAI] Update documentation';
      const body = params.body || 'Automated documentation update by VertaAI';
      const branchName = params.branchName || `vertaai/doc-update-${Date.now()}`;

      if (!doc.owner || !doc.repo) {
        return { success: false, error: 'DocRef must include owner and repo' };
      }

      const octokit = await getOctokit();
      const filePath = doc.filePath || 'README.md';

      try {
        // 1. Get the default branch
        const { data: repoData } = await octokit.rest.repos.get({
          owner: doc.owner,
          repo: doc.repo,
        });
        const defaultBranch = repoData.default_branch;

        // 2. Get the latest commit SHA on the default branch
        const { data: refData } = await octokit.rest.git.getRef({
          owner: doc.owner,
          repo: doc.repo,
          ref: `heads/${defaultBranch}`,
        });
        const latestSha = refData.object.sha;

        // 3. Create a new branch
        await octokit.rest.git.createRef({
          owner: doc.owner,
          repo: doc.repo,
          ref: `refs/heads/${branchName}`,
          sha: latestSha,
        });

        // 4. Update the file on the new branch
        await octokit.rest.repos.createOrUpdateFileContents({
          owner: doc.owner,
          repo: doc.repo,
          path: filePath,
          message: title,
          content: Buffer.from(newContent).toString('base64'),
          sha: baseSha,
          branch: branchName,
        });

        // 5. Create the pull request
        const { data: prData } = await octokit.rest.pulls.create({
          owner: doc.owner,
          repo: doc.repo,
          title,
          body,
          head: branchName,
          base: defaultBranch,
        });

        console.log(`[ReadmeAdapter] Created PR #${prData.number}: ${prData.html_url}`);

        return {
          success: true,
          prNumber: prData.number,
          prUrl: prData.html_url,
          branchName,
        };

      } catch (error: any) {
        console.error(`[ReadmeAdapter] Error creating PR:`, error);
        return {
          success: false,
          error: error.message || 'Failed to create PR',
        };
      }
    },
  };
}

/**
 * Create JWT for GitHub App authentication
 */
async function createAppJWT(appId: string, privateKey: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,
    exp: now + 600,
    iss: appId,
  };

  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signatureInput = `${base64Header}.${base64Payload}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(privateKey, 'base64url');

  return `${signatureInput}.${signature}`;
}

