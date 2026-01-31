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

  // TODO: Register more adapters as they are implemented
  // adapterFactories.set('confluence', createConfluenceAdapter);
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
    return factory(integration.config);
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
  
  const docSystems: DocSystem[] = ['confluence', 'notion', 'github_readme', 'github_swagger', 'backstage'];
  
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

