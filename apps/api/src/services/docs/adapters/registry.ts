/**
 * Doc Adapter Registry
 * 
 * Centralized registry for all documentation system adapters.
 * Provides factory functions to create workspace-scoped adapters.
 * 
 * @see MULTI_SOURCE_IMPLEMENTATION_PLAN.md Section 10.3
 */

import { prisma } from '../../../lib/db.js';
import { isFeatureEnabled } from '../../../config/featureFlags.js';
import { createNotionAdapter, NotionAdapter } from './notionAdapter.js';
import { createReadmeAdapter, ReadmeAdapter } from './readmeAdapter.js';
import { createSwaggerAdapter, type SwaggerAdapterConfig } from './swaggerAdapter.js';
import { createBackstageAdapter, type BackstageAdapterConfig } from './backstageAdapter.js';
import { createCodeCommentsAdapter, type CodeCommentsAdapterConfig } from './codeCommentsAdapter.js';
import { createGitBookAdapter, type GitBookAdapterConfig } from './gitbookAdapter.js';
import { createConfluenceAdapter } from './confluenceAdapter.js';
import type { DocAdapter, DocCategory, DocSystem } from './types.js';

// Type for adapter factory functions
type AdapterFactory<T extends DocAdapter = DocAdapter> = (config: unknown) => T;

// Registry of adapter factories
const adapterFactories: Map<DocSystem, AdapterFactory> = new Map();

// Register built-in adapters
function registerBuiltInAdapters(): void {
  // Notion adapter
  adapterFactories.set('notion', (config: unknown) => {
    const accessToken = (config as { accessToken?: string })?.accessToken;
    if (!accessToken) {
      throw new Error('Notion access token required');
    }
    return createNotionAdapter(accessToken);
  });

  // README adapter (Phase 1)
  adapterFactories.set('github_readme', (config: unknown) => {
    const { installationId, accessToken, appId, privateKey } = config as {
      installationId?: number;
      accessToken?: string;
      appId?: string;
      privateKey?: string;
    };
    return createReadmeAdapter({ installationId, accessToken, appId, privateKey });
  });

  // Swagger/OpenAPI adapter (Phase 2)
  adapterFactories.set('github_swagger', (config: unknown) => {
    const { installationId, owner, repo, filePath } = config as SwaggerAdapterConfig;
    if (!installationId) {
      throw new Error('GitHub installation ID required for Swagger adapter');
    }
    return createSwaggerAdapter({ installationId, owner: owner || '', repo: repo || '', filePath });
  });

  // Backstage catalog adapter (Phase 2)
  adapterFactories.set('backstage', (config: unknown) => {
    const { installationId, owner, repo, filePath } = config as BackstageAdapterConfig;
    if (!installationId) {
      throw new Error('GitHub installation ID required for Backstage adapter');
    }
    return createBackstageAdapter({ installationId, owner: owner || '', repo: repo || '', filePath });
  });

  // Code Comments adapter (Phase 5 - JSDoc/TSDoc)
  adapterFactories.set('github_code_comments', (config: unknown) => {
    const { installationId, owner, repo, accessToken, appId, privateKey } = config as CodeCommentsAdapterConfig;
    if (!installationId) {
      throw new Error('GitHub installation ID required for Code Comments adapter');
    }
    return createCodeCommentsAdapter({ installationId, owner: owner || '', repo: repo || '', accessToken, appId, privateKey });
  });

  // GitBook adapter (Phase 5)
  adapterFactories.set('gitbook', (config: unknown) => {
    const { installationId, owner, repo, accessToken, appId, privateKey, docsPath, summaryFile } = config as GitBookAdapterConfig;
    if (!installationId) {
      throw new Error('GitHub installation ID required for GitBook adapter');
    }
    return createGitBookAdapter({ installationId, owner: owner || '', repo: repo || '', accessToken, appId, privateKey, docsPath, summaryFile });
  });

  // Confluence adapter
  adapterFactories.set('confluence', (config: unknown) => {
    const { workspaceId } = config as { workspaceId?: string };
    if (!workspaceId) {
      throw new Error('Confluence adapter requires workspaceId');
    }
    return createConfluenceAdapter(workspaceId);
  });
}

// Initialize registry
registerBuiltInAdapters();

/**
 * Map doc system to integration type in the database
 */
function docSystemToIntegrationType(docSystem: DocSystem): string {
  const mapping: Record<DocSystem, string> = {
    confluence: 'confluence',
    notion: 'notion',
    github_readme: 'github',
    github_swagger: 'github',
    backstage: 'github', // Backstage uses GitHub for catalog-info.yaml
    github_code_comments: 'github', // Phase 5: Code Comments
    gitbook: 'github', // Phase 5: GitBook syncs from GitHub
  };
  return mapping[docSystem];
}

/**
 * Map doc system to its default category
 */
export function getDefaultCategory(docSystem: DocSystem): DocCategory {
  const mapping: Record<DocSystem, DocCategory> = {
    confluence: 'functional',
    notion: 'functional',
    github_readme: 'developer',
    github_swagger: 'developer',
    backstage: 'operational',
    github_code_comments: 'developer', // Phase 5: Code Comments
    gitbook: 'functional', // Phase 5: GitBook
  };
  return mapping[docSystem];
}

/**
 * Get an adapter for a specific workspace and doc system
 * 
 * @param workspaceId - The workspace to get the adapter for
 * @param docSystem - The documentation system
 * @returns The adapter or null if not available/configured
 */
export async function getAdapter(
  workspaceId: string,
  docSystem: DocSystem
): Promise<DocAdapter | null> {
  // Check feature flags for non-core adapters
  if (docSystem === 'github_readme' && !isFeatureEnabled('ENABLE_README_ADAPTER', workspaceId)) {
    console.log(`[AdapterRegistry] README adapter disabled for workspace ${workspaceId}`);
    return null;
  }

  if (docSystem === 'github_swagger' && !isFeatureEnabled('ENABLE_SWAGGER_ADAPTER', workspaceId)) {
    console.log(`[AdapterRegistry] Swagger adapter disabled for workspace ${workspaceId}`);
    return null;
  }

  if (docSystem === 'backstage' && !isFeatureEnabled('ENABLE_BACKSTAGE_ADAPTER', workspaceId)) {
    console.log(`[AdapterRegistry] Backstage adapter disabled for workspace ${workspaceId}`);
    return null;
  }

  // Phase 5 feature flags
  if (docSystem === 'github_code_comments' && !isFeatureEnabled('ENABLE_CODE_COMMENTS_ADAPTER', workspaceId)) {
    console.log(`[AdapterRegistry] Code Comments adapter disabled for workspace ${workspaceId}`);
    return null;
  }

  if (docSystem === 'gitbook' && !isFeatureEnabled('ENABLE_GITBOOK_ADAPTER', workspaceId)) {
    console.log(`[AdapterRegistry] GitBook adapter disabled for workspace ${workspaceId}`);
    return null;
  }

  // Get integration config for this doc system
  const integrationType = docSystemToIntegrationType(docSystem);
  const integration = await prisma.integration.findUnique({
    where: {
      workspaceId_type: {
        workspaceId,
        type: integrationType,
      },
    },
  });

  if (!integration || integration.status !== 'connected') {
    console.log(`[AdapterRegistry] No ${integrationType} integration for workspace ${workspaceId}`);
    return null;
  }

  // Get factory for this doc system
  const factory = adapterFactories.get(docSystem);
  if (!factory) {
    console.warn(`[AdapterRegistry] No adapter factory for doc system: ${docSystem}`);
    return null;
  }

  try {
    // For Confluence, inject workspaceId into config since it needs it for credentials lookup
    const config = docSystem === 'confluence'
      ? { ...integration.config as object, workspaceId }
      : integration.config;
    return factory(config);
  } catch (error) {
    console.error(`[AdapterRegistry] Failed to create adapter for ${docSystem}:`, error);
    return null;
  }
}

/**
 * Get all available adapters for a workspace
 */
export async function getAvailableAdapters(workspaceId: string): Promise<Map<DocSystem, DocAdapter>> {
  const adapters = new Map<DocSystem, DocAdapter>();

  // All doc systems including Phase 5 additions
  const docSystems: DocSystem[] = [
    'confluence', 'notion', 'github_readme', 'github_swagger', 'backstage',
    'github_code_comments', 'gitbook',  // Phase 5
  ];

  for (const docSystem of docSystems) {
    const adapter = await getAdapter(workspaceId, docSystem);
    if (adapter) {
      adapters.set(docSystem, adapter);
    }
  }

  return adapters;
}

/**
 * Register a custom adapter factory
 */
export function registerAdapter(docSystem: DocSystem, factory: AdapterFactory): void {
  adapterFactories.set(docSystem, factory);
}

// Export for testing
export const __test__ = {
  adapterFactories,
  registerBuiltInAdapters,
};

