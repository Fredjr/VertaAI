/**
 * GitBook Adapter
 * 
 * Adapter for GitBook documentation. GitBook syncs with Git repositories,
 * so this adapter creates PRs to update documentation similar to README adapter.
 * 
 * Phase 5 - Multi-Source Architecture
 * @see MULTI_SOURCE_IMPLEMENTATION_PLAN.md Section 3.2
 */

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
  
  constructor(config: GitBookAdapterConfig) {
    this.config = {
      ...config,
      docsPath: config.docsPath || 'docs/',
      summaryFile: config.summaryFile || 'SUMMARY.md',
    };
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
    const { doc, newContent, title, body, branchName, baseBranch, driftType, driftId } = params;
    const { owner, repo, filePath } = doc;
    
    if (!owner || !repo || !filePath) {
      return { success: false, error: 'Missing owner, repo, or filePath' };
    }
    
    try {
      const branch = branchName || `vertaai/gitbook-${driftId || Date.now()}`;
      const targetBranch = baseBranch || 'main';
      
      // Full path within docs directory
      const fullPath = filePath.startsWith(this.config.docsPath!)
        ? filePath
        : `${this.config.docsPath}${filePath}`;
      
      console.log(`[GitBookAdapter] Would create PR: ${branch} -> ${targetBranch}`);
      console.log(`[GitBookAdapter] File: ${fullPath}, Drift: ${driftType}`);

      return {
        success: true,
        prNumber: 0, // Placeholder - actual GitHub API integration needed
        prUrl: `https://github.com/${owner}/${repo}/pull/new/${branch}`,
        branchName: branch,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
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

