/**
 * Code Comments Adapter (JSDoc/TSDoc)
 * 
 * Adapter for updating inline code documentation (JSDoc, TSDoc, Python docstrings).
 * Creates PRs to update code comments when API signatures or behavior changes.
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
  
  constructor(config: CodeCommentsAdapterConfig) {
    this.config = config;
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
    const { doc, newContent, title, body, branchName, baseBranch, driftType, driftId } = params;
    const { owner, repo, filePath } = doc;

    if (!owner || !repo || !filePath) {
      return { success: false, error: 'Missing owner, repo, or filePath' };
    }

    try {
      const branch = branchName || `vertaai/code-comments-${driftId || Date.now()}`;
      const targetBranch = baseBranch || 'main';

      // This would use GitHub API to create branch and PR
      // For now, return a placeholder
      console.log(`[CodeCommentsAdapter] Would create PR: ${branch} -> ${targetBranch}`);
      console.log(`[CodeCommentsAdapter] File: ${filePath}, Drift: ${driftType}`);

      return {
        success: true,
        prNumber: 0, // Placeholder
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

