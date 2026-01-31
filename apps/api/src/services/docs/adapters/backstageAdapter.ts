/**
 * Backstage Catalog Adapter
 * 
 * Fetches and creates PRs for Backstage catalog-info.yaml files in GitHub repos.
 * Used for operational documentation drift detection (service catalog).
 * 
 * Phase 2 - Multi-Source Architecture
 * @see MULTI_SOURCE_IMPLEMENTATION_PLAN.md Section 7.2.2
 */

import { App } from 'octokit';
import type {
  GitHubDocAdapter,
  DocRef,
  DocFetchResult,
  WritePatchParams,
  WriteResult,
  CreatePRParams,
  PRResult,
} from './types.js';

// ============================================================================
// Configuration
// ============================================================================

export interface BackstageAdapterConfig {
  installationId: number;
  owner: string;
  repo: string;
  filePath?: string; // Default: 'catalog-info.yaml'
}

// ============================================================================
// Catalog-info.yaml Parser (Simple YAML)
// ============================================================================

interface CatalogEntity {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    description?: string;
    annotations?: Record<string, string>;
    tags?: string[];
    links?: Array<{ url: string; title?: string }>;
  };
  spec?: {
    type?: string;
    owner?: string;
    lifecycle?: string;
    system?: string;
    dependsOn?: string[];
    providesApis?: string[];
  };
}

/**
 * Parse catalog-info.yaml content (basic YAML parsing)
 * For production, consider using js-yaml for full YAML support
 */
function parseCatalogInfo(content: string): CatalogEntity | null {
  try {
    // Try JSON first (sometimes catalog files are JSON)
    if (content.trim().startsWith('{')) {
      return JSON.parse(content);
    }
    
    // Basic YAML parsing for flat structure
    const result: Record<string, unknown> = {};
    const lines = content.split('\n');
    const stack: { obj: Record<string, unknown>; indent: number }[] = [{ obj: result, indent: -1 }];
    
    for (const line of lines) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      
      const match = line.match(/^(\s*)([^:]+):\s*(.*)$/);
      if (!match || !match[1] || !match[2]) continue;
      
      const indent = match[1].length;
      const key = match[2].trim();
      const valueStr = (match[3] || '').trim();
      
      while (stack.length > 1 && (stack[stack.length - 1]?.indent ?? 0) >= indent) {
        stack.pop();
      }
      
      const currentTop = stack[stack.length - 1];
      if (!currentTop) continue;
      const parent = currentTop.obj;
      
      if (valueStr === '' || valueStr === '|' || valueStr === '>') {
        const newObj: Record<string, unknown> = {};
        parent[key] = newObj;
        stack.push({ obj: newObj, indent });
      } else if (valueStr.startsWith('[') || valueStr.startsWith('{')) {
        try {
          parent[key] = JSON.parse(valueStr);
        } catch {
          parent[key] = valueStr;
        }
      } else if (valueStr.startsWith('-')) {
        // Array item - simplified handling
        if (!Array.isArray(parent[key])) {
          parent[key] = [];
        }
        (parent[key] as unknown[]).push(valueStr.substring(1).trim());
      } else {
        parent[key] = valueStr.replace(/^["']|["']$/g, '');
      }
    }
    
    return result as CatalogEntity;
  } catch (error) {
    console.error('[BackstageAdapter] Failed to parse catalog-info.yaml:', error);
    return null;
  }
}

// ============================================================================
// Adapter Factory
// ============================================================================

export function createBackstageAdapter(config: BackstageAdapterConfig): GitHubDocAdapter {
  const defaultFilePath = config.filePath || 'catalog-info.yaml';

  async function getOctokit() {
    const appId = process.env.GITHUB_APP_ID;
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!appId || !privateKey) {
      throw new Error('GitHub App credentials not configured');
    }

    const app = new App({ appId, privateKey });
    return app.getInstallationOctokit(config.installationId);
  }

  return {
    system: 'backstage',
    category: 'operational',

    async fetch(doc: DocRef): Promise<DocFetchResult> {
      const octokit = await getOctokit();
      const owner = doc.owner || config.owner;
      const repo = doc.repo || config.repo;
      const filePath = doc.filePath || defaultFilePath;

      try {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: filePath,
          ref: doc.ref,
        });

        if (Array.isArray(data) || data.type !== 'file') {
          throw new Error(`Path ${filePath} is not a file`);
        }

        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        const entity = parseCatalogInfo(content);

        return {
          doc: { ...doc, owner, repo, filePath },
          baseRevision: data.sha,
          format: 'yaml',
          content,
          title: entity?.metadata?.name || filePath,
          metadata: {
            kind: entity?.kind,
            owner: entity?.spec?.owner,
            lifecycle: entity?.spec?.lifecycle,
            system: entity?.spec?.system,
            description: entity?.metadata?.description,
          },
        };
      } catch (error: any) {
        if (error.status === 404) {
          return {
            doc: { ...doc, owner, repo, filePath },
            baseRevision: null,
            format: 'yaml',
            content: null,
            title: filePath,
            error: `File not found: ${filePath}`,
          };
        }
        throw error;
      }
    },

    async writePatch(_params: WritePatchParams): Promise<WriteResult> {
      // Backstage catalog files should use PR workflow, not direct write
      return {
        success: false,
        error: 'Direct writeback not supported for catalog-info.yaml. Use createPatchPR instead.',
      };
    },

    async createPatchPR(params: CreatePRParams): Promise<PRResult> {
      const octokit = await getOctokit();
      const owner = params.doc.owner || config.owner;
      const repo = params.doc.repo || config.repo;
      const filePath = params.doc.filePath || defaultFilePath;
      const baseBranch = params.baseBranch || 'main';

      try {
        // 1. Get default branch SHA
        const { data: refData } = await octokit.rest.git.getRef({
          owner,
          repo,
          ref: `heads/${baseBranch}`,
        });
        const baseSha = refData.object.sha;

        // 2. Create new branch
        const branchName = params.branchName || `vertaai/catalog-update-${Date.now()}`;
        await octokit.rest.git.createRef({
          owner,
          repo,
          ref: `refs/heads/${branchName}`,
          sha: baseSha,
        });

        // 3. Get current file SHA (if exists)
        let fileSha: string | undefined;
        try {
          const { data } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: filePath,
            ref: baseBranch,
          });
          if (!Array.isArray(data) && data.type === 'file') {
            fileSha = data.sha;
          }
        } catch {
          // File doesn't exist yet
        }

        // 4. Create/update file on new branch
        const title = params.title || '[VertaAI] Update catalog-info.yaml';
        await octokit.rest.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: filePath,
          message: title,
          content: Buffer.from(params.newContent).toString('base64'),
          branch: branchName,
          sha: fileSha,
        });

        // 5. Create pull request
        const { data: pr } = await octokit.rest.pulls.create({
          owner,
          repo,
          title,
          body: params.body || 'This PR was automatically generated by VertaAI to update the service catalog.',
          head: branchName,
          base: baseBranch,
        });

        return {
          success: true,
          prNumber: pr.number,
          prUrl: pr.html_url,
          branchName,
        };
      } catch (error: any) {
        console.error('[BackstageAdapter] Error creating PR:', error);
        return {
          success: false,
          error: error.message || 'Failed to create PR',
        };
      }
    },

    supportsDirectWriteback(): boolean {
      return false; // Uses PR workflow
    },

    getDocUrl(doc: DocRef): string {
      if (doc.docUrl) return doc.docUrl;
      const owner = doc.owner || config.owner;
      const repo = doc.repo || config.repo;
      const filePath = doc.filePath || defaultFilePath;
      const ref = doc.ref || 'main';
      return `https://github.com/${owner}/${repo}/blob/${ref}/${filePath}`;
    },

    async getFileContent(doc: DocRef): Promise<string | null> {
      try {
        const result = await this.fetch(doc);
        return result.content;
      } catch {
        return null;
      }
    },

    async getFileSha(doc: DocRef): Promise<string | null> {
      try {
        const result = await this.fetch(doc);
        return result.baseRevision;
      } catch {
        return null;
      }
    },
  };
}

