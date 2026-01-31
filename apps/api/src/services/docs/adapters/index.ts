/**
 * Documentation System Adapters - Barrel Export
 * 
 * Multi-source architecture for drift detection (Phase 1)
 * See: MULTI_SOURCE_IMPLEMENTATION_PLAN.md
 */

// Core types
export * from './types.js';

// Adapter factory/registry
export { getAdapter, getDefaultCategory, getAvailableAdapters, registerAdapter } from './registry.js';

// Individual adapters
export { createNotionAdapter } from './notionAdapter.js';
export { createReadmeAdapter } from './readmeAdapter.js';
export { createSwaggerAdapter } from './swaggerAdapter.js';
export { createBackstageAdapter } from './backstageAdapter.js';

// Re-export adapter types for convenience
export type { NotionAdapter } from './notionAdapter.js';
export type { ReadmeAdapter } from './readmeAdapter.js';
export type { SwaggerAdapterConfig } from './swaggerAdapter.js';
export type { BackstageAdapterConfig } from './backstageAdapter.js';

