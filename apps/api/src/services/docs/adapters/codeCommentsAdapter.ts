/**
 * Code Comments Adapter (JSDoc/TSDoc)
 *
 * Adapter for updating inline code documentation (JSDoc, TSDoc, Python docstrings).
 * Creates PRs to update code comments when API signatures or behavior changes.
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

export interface CodeCommentsAdapterConfig {
  installationId: number;
  owner?: string;
  repo?: string;
  accessToken?: string;
  appId?: string;
  privateKey?: string;
}

interface CodeComment {
  type: 'jsdoc' | 'tsdoc' | 'docstring' | 'block';
  startLine: number;
  endLine: number;
  content: string;
  associatedSymbol?: string;
}

// Patterns for detecting code comments
const COMMENT_PATTERNS = {
  jsdoc: /\/\*\*[\s\S]*?\*\//g,
  tsdoc: /\/\*\*[\s\S]*?\*\//g,
  pythonDocstring: /"""[\s\S]*?"""|'''[\s\S]*?'''/g,
  blockComment: /\/\*[\s\S]*?\*\//g,
};

// ============================================================================
// Adapter Implementation
// ============================================================================

class CodeCommentsAdapter implements GitHubDocAdapter {
  readonly system: DocSystem = 'github_code_comments';
  readonly category: DocCategory = 'developer';

  private config: CodeCommentsAdapterConfig;
  private octokitInstance: Octokit | null = null;

  constructor(config: CodeCommentsAdapterConfig) {
    this.config = config;
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

    throw new Error('No GitHub credentials provided for Code Comments adapter');
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
   * Fetch code file and extract comments
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
      // Use GitHub API to fetch file content
      const response = await this.fetchFromGitHub(owner, repo, filePath, ref);
      
      if (!response.content) {
        return {
          doc,
          baseRevision: null,
          format: 'markdown',
          content: null,
          title: filePath,
          error: 'File not found',
        };
      }
      
      // Extract comments from the code
      const comments = this.extractComments(response.content, filePath);
      const commentsMarkdown = this.commentsToMarkdown(comments);
      
      return {
        doc,
        baseRevision: response.sha,
        format: 'markdown',
        content: response.content,
        markdown: commentsMarkdown,
        title: filePath,
        metadata: {
          commentCount: comments.length,
          comments,
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
   * Direct writeback not supported - use PRs
   */
  async writePatch(_params: WritePatchParams): Promise<WriteResult> {
    return {
      success: false,
      error: 'Code comments adapter does not support direct writeback. Use createPatchPR instead.',
    };
  }
  
  supportsDirectWriteback(): boolean {
    return false;
  }
  
  getDocUrl(doc: DocRef): string {
    const { owner, repo, filePath, ref } = doc;
    const branch = ref || 'main';
    return `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`;
  }
  
  /**
   * Create a PR with updated code comments
   */
  async createPatchPR(params: CreatePRParams): Promise<PRResult> {
    const { doc, newContent, baseSha } = params;
    const prTitle = params.title || '[VertaAI] Update code documentation';
    const prBody = params.body || 'Automated code comment update by VertaAI';
    const { owner, repo, filePath } = doc;

    if (!owner || !repo || !filePath) {
      return { success: false, error: 'Missing owner, repo, or filePath' };
    }

    const octokit = await this.getOctokit();

    try {
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
      const branchName = params.branchName || `vertaai/code-comments-${params.driftId || Date.now()}`;

      // 4. Create a new branch from default branch
      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: latestSha,
      });

      // 5. Get the current file SHA for update
      const fileSha = baseSha || await this.getFileSha(doc);
      if (!fileSha) {
        return { success: false, error: 'Could not get file SHA' };
      }

      // 6. Update the file on the new branch
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: filePath,
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

      console.log(`[CodeCommentsAdapter] Created PR #${prData.number}: ${prData.html_url}`);

      return {
        success: true,
        prNumber: prData.number,
        prUrl: prData.html_url,
        branchName,
      };
    } catch (error: any) {
      console.error(`[CodeCommentsAdapter] Error creating PR:`, error);
      return { success: false, error: error.message || 'Failed to create PR' };
    }
  }

  /**
   * Get file content at a specific ref
   */
  async getFileContent(doc: DocRef): Promise<string | null> {
    const { owner, repo, filePath, ref } = doc;
    if (!owner || !repo || !filePath) return null;

    try {
      const response = await this.fetchFromGitHub(owner, repo, filePath, ref);
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
      const response = await this.fetchFromGitHub(owner, repo, filePath, ref);
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
    // In production, this would use Octokit with the installation token
    // For now, we use the GitHub API directly
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

  /**
   * Extract comments from code based on file type
   */
  private extractComments(content: string, filePath: string): CodeComment[] {
    const comments: CodeComment[] = [];
    const ext = filePath.split('.').pop()?.toLowerCase();

    // Determine comment pattern based on file extension
    let pattern: RegExp;
    let type: CodeComment['type'];

    if (ext === 'py') {
      pattern = COMMENT_PATTERNS.pythonDocstring;
      type = 'docstring';
    } else if (ext === 'ts' || ext === 'tsx') {
      pattern = COMMENT_PATTERNS.tsdoc;
      type = 'tsdoc';
    } else if (ext === 'js' || ext === 'jsx') {
      pattern = COMMENT_PATTERNS.jsdoc;
      type = 'jsdoc';
    } else {
      pattern = COMMENT_PATTERNS.blockComment;
      type = 'block';
    }

    // Find all matches
    let match;
    const lines = content.split('\n');

    while ((match = pattern.exec(content)) !== null) {
      const startIndex = match.index;
      const endIndex = startIndex + match[0].length;

      // Calculate line numbers
      const textBefore = content.substring(0, startIndex);
      const startLine = textBefore.split('\n').length;
      const endLine = startLine + match[0].split('\n').length - 1;

      // Try to find associated symbol (function/class name after comment)
      const afterComment = content.substring(endIndex, endIndex + 200);
      const symbolMatch = afterComment.match(/(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var|def)\s+(\w+)/);

      comments.push({
        type,
        startLine,
        endLine,
        content: match[0],
        associatedSymbol: symbolMatch?.[1],
      });
    }

    return comments;
  }

  /**
   * Convert extracted comments to markdown format
   */
  private commentsToMarkdown(comments: CodeComment[]): string {
    if (comments.length === 0) {
      return '# Code Documentation\n\nNo documentation comments found in this file.';
    }

    const sections = comments.map((c, i) => {
      const header = c.associatedSymbol
        ? `## ${c.associatedSymbol}`
        : `## Comment ${i + 1}`;

      // Clean up the comment content
      let cleanContent = c.content
        .replace(/^\/\*\*?/, '')
        .replace(/\*\/$/, '')
        .replace(/^\s*\*\s?/gm, '')
        .replace(/^"""|"""$/g, '')
        .replace(/^'''|'''$/g, '')
        .trim();

      return `${header}\n\n**Type:** ${c.type} (lines ${c.startLine}-${c.endLine})\n\n${cleanContent}`;
    });

    return `# Code Documentation\n\n${sections.join('\n\n---\n\n')}`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createCodeCommentsAdapter(config: CodeCommentsAdapterConfig): CodeCommentsAdapter {
  return new CodeCommentsAdapter(config);
}

