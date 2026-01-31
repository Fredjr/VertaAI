/**
 * Swagger/OpenAPI Adapter
 * 
 * Fetches and creates PRs for OpenAPI/Swagger specification files in GitHub repos.
 * Used for API documentation drift detection and writeback.
 * 
 * Phase 2 - Multi-Source Architecture
 * @see MULTI_SOURCE_IMPLEMENTATION_PLAN.md Section 7.2.1
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
import { parseOpenApiSpec } from '../../signals/openApiParser.js';

// ============================================================================
// Configuration
// ============================================================================

export interface SwaggerAdapterConfig {
  installationId: number;
  owner: string;
  repo: string;
  filePath?: string; // Default: 'openapi.yaml'
}

// ============================================================================
// Adapter Factory
// ============================================================================

export function createSwaggerAdapter(config: SwaggerAdapterConfig): GitHubDocAdapter {
  const defaultFilePath = config.filePath || 'openapi.yaml';

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
    system: 'github_swagger',
    category: 'developer',

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
        const spec = parseOpenApiSpec(content);

        return {
          doc: { ...doc, owner, repo, filePath },
          baseRevision: data.sha,
          format: filePath.endsWith('.json') ? 'json' : 'yaml',
          content,
          title: spec?.info?.title || filePath,
          metadata: {
            version: spec?.info?.version,
            description: spec?.info?.description,
            openApiVersion: spec?.openapi || spec?.swagger,
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
      // Swagger files should use PR workflow, not direct write
      return {
        success: false,
        error: 'Direct writeback not supported for OpenAPI specs. Use createPatchPR instead.',
      };
    },

    async createPatchPR(params: CreatePRParams): Promise<PRResult> {
      const octokit = await getOctokit();
      const owner = params.doc.owner || config.owner;
      const repo = params.doc.repo || config.repo;
      const filePath = params.doc.filePath || defaultFilePath;
      const baseBranch = params.baseBranch || 'main';

      // 1. Get default branch SHA
      const { data: refData } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${baseBranch}`,
      });
      const baseSha = refData.object.sha;

      // 2. Create new branch
      const branchName = `vertaai/api-spec-update-${Date.now()}`;
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
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: filePath,
        message: params.title || '[VertaAI] Update OpenAPI specification',
        content: Buffer.from(params.newContent).toString('base64'),
        branch: branchName,
        sha: fileSha,
      });

      // 5. Create pull request
      const { data: pr } = await octokit.rest.pulls.create({
        owner,
        repo,
        title: params.title || '[VertaAI] Update OpenAPI specification',
        body: params.body || 'This PR was automatically generated by VertaAI to update the API specification.',
        head: branchName,
        base: baseBranch,
      });

      return {
        success: true,
        prNumber: pr.number,
        prUrl: pr.html_url,
        branchName,
      };
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

