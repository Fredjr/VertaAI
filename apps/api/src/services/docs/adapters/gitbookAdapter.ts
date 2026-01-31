/**
 * GitBook Adapter
 *
 * Adapter for GitBook documentation. GitBook syncs with Git repositories,
 * so this adapter creates PRs to update documentation similar to README adapter.
 *
 * Phase 5 - Multi-Source Architecture
 * @see MULTI_SOURCE_IMPLEMENTATION_PLAN.md Section 3.2
 */

import { Octokit } from 'octokit';
import crypto from 'crypto';
import type {
  DocAdapter,
  GitHubDocAdapter,
  DocRef,
  DocFetchResult,
  WritePatchParams,
  WriteResult,
  CreatePRParams,
  PRResult,
  DocCategory,
  DocSystem,
} from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface GitBookAdapterConfig {
  installationId: number;
  owner?: string;
  repo?: string;
  accessToken?: string;
  appId?: string;
  privateKey?: string;
  // GitBook-specific config
  docsPath?: string;  // Path to docs in repo (e.g., 'docs/', 'gitbook/')
  summaryFile?: string;  // SUMMARY.md path
}

// ============================================================================
// Adapter Implementation
// ============================================================================

class GitBookAdapter implements GitHubDocAdapter {
  readonly system: DocSystem = 'gitbook';
  readonly category: DocCategory = 'functional';

  private config: GitBookAdapterConfig;
  private octokitInstance: Octokit | null = null;

  constructor(config: GitBookAdapterConfig) {
    this.config = {
      ...config,
      docsPath: config.docsPath || 'docs/',
      summaryFile: config.summaryFile || 'SUMMARY.md',
    };
  }

  /**
   * Get authenticated Octokit instance
   */
  private async getOctokit(): Promise<Octokit> {
    if (this.octokitInstance) return this.octokitInstance;

    // Try Personal Access Token first
    if (this.config.accessToken) {
      this.octokitInstance = new Octokit({ auth: this.config.accessToken });
      return this.octokitInstance;
    }

    // Try GitHub App installation
    if (this.config.installationId && this.config.appId && this.config.privateKey) {
      const jwt = await this.createAppJWT(this.config.appId, this.config.privateKey.replace(/\\n/g, '\n'));
      const appOctokit = new Octokit({ auth: jwt });
      const { data: { token } } = await appOctokit.rest.apps.createInstallationAccessToken({
        installation_id: this.config.installationId,
      });
      this.octokitInstance = new Octokit({ auth: token });
      return this.octokitInstance;
    }

    throw new Error('No GitHub credentials provided for GitBook adapter');
  }

  /**
   * Create JWT for GitHub App authentication
   */
  private async createAppJWT(appId: string, privateKey: string): Promise<string> {
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
  
  /**
   * Fetch GitBook document from GitHub repo
   */
  async fetch(doc: DocRef): Promise<DocFetchResult> {
    const { owner, repo, filePath, ref } = doc;
    
    if (!owner || !repo || !filePath) {
      return {
        doc,
        baseRevision: null,
        format: 'markdown',
        content: null,
        title: 'Unknown',
        error: 'Missing owner, repo, or filePath',
      };
    }
    
    try {
      // Construct full path within docs directory
      const docsPath = this.config.docsPath || 'docs/';
      const fullPath = filePath.startsWith(docsPath)
        ? filePath
        : `${docsPath}${filePath}`;

      const response = await this.fetchFromGitHub(owner, repo, fullPath, ref);

      if (!response.content) {
        return {
          doc,
          baseRevision: null,
          format: 'markdown',
          content: null,
          title: filePath,
          error: 'Document not found',
        };
      }

      // Extract title from markdown
      const titleMatch = response.content.match(/^#\s+(.+)$/m);
      const extractedTitle = titleMatch && titleMatch[1] ? titleMatch[1] : filePath;

      return {
        doc,
        baseRevision: response.sha,
        format: 'markdown',
        content: response.content,
        markdown: response.content,
        title: extractedTitle,
        metadata: {
          docsPath: this.config.docsPath,
          fullPath,
        },
      };
    } catch (error: any) {
      return {
        doc,
        baseRevision: null,
        format: 'markdown',
        content: null,
        title: filePath,
        error: error.message,
      };
    }
  }
  
  /**
   * Direct writeback not supported - GitBook syncs from Git
   */
  async writePatch(_params: WritePatchParams): Promise<WriteResult> {
    return {
      success: false,
      error: 'GitBook adapter does not support direct writeback. Use createPatchPR instead.',
    };
  }
  
  supportsDirectWriteback(): boolean {
    return false;
  }
  
  getDocUrl(doc: DocRef): string {
    const { owner, repo, filePath, ref } = doc;
    const branch = ref || 'main';
    const docsPath = this.config.docsPath || 'docs/';
    if (!filePath) {
      return `https://github.com/${owner}/${repo}/tree/${branch}/${docsPath}`;
    }
    const fullPath = filePath.startsWith(docsPath)
      ? filePath
      : `${docsPath}${filePath}`;
    return `https://github.com/${owner}/${repo}/blob/${branch}/${fullPath}`;
  }
  
  /**
   * Create a PR with updated GitBook documentation
   */
  async createPatchPR(params: CreatePRParams): Promise<PRResult> {
    const { doc, newContent, baseSha } = params;
    const prTitle = params.title || '[VertaAI] Update GitBook documentation';
    const prBody = params.body || 'Automated GitBook documentation update by VertaAI';
    const { owner, repo, filePath } = doc;

    if (!owner || !repo || !filePath) {
      return { success: false, error: 'Missing owner, repo, or filePath' };
    }

    const octokit = await this.getOctokit();

    try {
      // Full path within docs directory
      const docsPath = this.config.docsPath || 'docs/';
      const fullPath = filePath.startsWith(docsPath)
        ? filePath
        : `${docsPath}${filePath}`;

      // 1. Get the default branch
      const { data: repoData } = await octokit.rest.repos.get({
        owner,
        repo,
      });
      const defaultBranch = repoData.default_branch;

      // 2. Get the latest commit SHA on the default branch
      const { data: refData } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${defaultBranch}`,
      });
      const latestSha = refData.object.sha;

      // 3. Create a unique branch name
      const branchName = params.branchName || `vertaai/gitbook-${params.driftId || Date.now()}`;

      // 4. Create a new branch from default branch
      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: latestSha,
      });

      // 5. Get the current file SHA for update
      const fileSha = baseSha || await this.getFileShaForPath(owner, repo, fullPath);
      if (!fileSha) {
        return { success: false, error: 'Could not get file SHA' };
      }

      // 6. Update the file on the new branch
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: fullPath,
        message: prTitle,
        content: Buffer.from(newContent).toString('base64'),
        sha: fileSha,
        branch: branchName,
      });

      // 7. Create the pull request
      const { data: prData } = await octokit.rest.pulls.create({
        owner,
        repo,
        title: prTitle,
        body: prBody,
        head: branchName,
        base: defaultBranch,
      });

      console.log(`[GitBookAdapter] Created PR #${prData.number}: ${prData.html_url}`);

      return {
        success: true,
        prNumber: prData.number,
        prUrl: prData.html_url,
        branchName,
      };
    } catch (error: any) {
      console.error(`[GitBookAdapter] Error creating PR:`, error);
      return { success: false, error: error.message || 'Failed to create PR' };
    }
  }

  /**
   * Get file SHA for a specific path (helper for createPatchPR)
   */
  private async getFileShaForPath(owner: string, repo: string, path: string): Promise<string | null> {
    try {
      const response = await this.fetchFromGitHub(owner, repo, path);
      return response.sha;
    } catch {
      return null;
    }
  }

  /**
   * Get file content at a specific ref
   */
  async getFileContent(doc: DocRef): Promise<string | null> {
    const { owner, repo, filePath, ref } = doc;
    if (!owner || !repo || !filePath) return null;

    try {
      const docsPath = this.config.docsPath || 'docs/';
      const fullPath = filePath.startsWith(docsPath) ? filePath : `${docsPath}${filePath}`;
      const response = await this.fetchFromGitHub(owner, repo, fullPath, ref);
      return response.content;
    } catch {
      return null;
    }
  }

  /**
   * Get the SHA of a file
   */
  async getFileSha(doc: DocRef): Promise<string | null> {
    const { owner, repo, filePath, ref } = doc;
    if (!owner || !repo || !filePath) return null;

    try {
      const docsPath = this.config.docsPath || 'docs/';
      const fullPath = filePath.startsWith(docsPath) ? filePath : `${docsPath}${filePath}`;
      const response = await this.fetchFromGitHub(owner, repo, fullPath, ref);
      return response.sha;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Fetch file content from GitHub
   */
  private async fetchFromGitHub(
    owner: string,
    repo: string,
    filePath: string,
    ref?: string
  ): Promise<{ content: string; sha: string }> {
    const branch = ref || 'main';
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'VertaAI',
    };

    if (this.config.accessToken) {
      headers['Authorization'] = `Bearer ${this.config.accessToken}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    const content = Buffer.from(data.content, 'base64').toString('utf-8');

    return { content, sha: data.sha };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createGitBookAdapter(config: GitBookAdapterConfig): GitBookAdapter {
  return new GitBookAdapter(config);
}

