/**
 * Fact Resolver Service
 * Phase 2.1 - Hybrid Comparator/Fact-Based Approach
 * 
 * Resolves fact values from PR context
 */

import { factCatalog } from './catalog.js';
import type { PRContext } from '../comparators/types.js';
import type { FactResolutionResult, ResolvedFact } from './types.js';

/**
 * Resolve a single fact value
 */
export function resolveFact(factId: string, context: PRContext): ResolvedFact {
  const fact = factCatalog.get(factId);
  
  if (!fact) {
    return {
      factId,
      value: undefined,
      resolvedAt: new Date().toISOString(),
      error: `Fact ${factId} not found in catalog`,
    };
  }

  try {
    const value = fact.resolver(context);
    return {
      factId,
      value,
      resolvedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    return {
      factId,
      value: undefined,
      resolvedAt: new Date().toISOString(),
      error: `Error resolving fact ${factId}: ${error.message}`,
    };
  }
}

/**
 * Resolve multiple facts at once
 */
export function resolveFacts(factIds: string[], context: PRContext): FactResolutionResult {
  const facts: Record<string, any> = {};
  const errors: Record<string, string> = {};

  for (const factId of factIds) {
    const resolved = resolveFact(factId, context);
    
    if (resolved.error) {
      errors[factId] = resolved.error;
    } else {
      facts[factId] = resolved.value;
    }
  }

  return {
    facts,
    errors,
    resolvedAt: new Date().toISOString(),
    catalogVersion: factCatalog.getVersion(),
  };
}

/**
 * Resolve all facts for a given context
 * Useful for debugging and testing
 */
export function resolveAllFacts(context: PRContext): FactResolutionResult {
  const allFactIds = factCatalog.getAll().map(f => f.id);
  return resolveFacts(allFactIds, context);
}

/**
 * Get fact value with type safety
 */
export function getFactValue<T = any>(factId: string, context: PRContext): T | undefined {
  const resolved = resolveFact(factId, context);
  return resolved.error ? undefined : resolved.value as T;
}

/**
 * Check if a fact exists and can be resolved
 */
export function canResolveFact(factId: string): boolean {
  return factCatalog.has(factId);
}

/**
 * Get fact metadata without resolving
 */
export function getFactMetadata(factId: string) {
  const fact = factCatalog.get(factId);
  if (!fact) {
    return null;
  }

  return {
    id: fact.id,
    name: fact.name,
    description: fact.description,
    category: fact.category,
    valueType: fact.valueType,
    version: fact.version,
    examples: fact.examples,
    deprecated: fact.deprecated,
    replacedBy: fact.replacedBy,
  };
}

/**
 * Validate that all required facts can be resolved
 */
export function validateFactIds(factIds: string[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const factId of factIds) {
    if (!factCatalog.has(factId)) {
      errors.push(`Fact ${factId} not found in catalog v${factCatalog.getVersion()}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get all available fact IDs by category
 */
export function getFactIdsByCategory(category: string): string[] {
  return factCatalog.getByCategory(category as any).map(f => f.id);
}

/**
 * Search facts by keyword
 */
export function searchFacts(keyword: string): string[] {
  const lowerKeyword = keyword.toLowerCase();
  return factCatalog.getAll()
    .filter(f => 
      f.id.toLowerCase().includes(lowerKeyword) ||
      f.name.toLowerCase().includes(lowerKeyword) ||
      f.description.toLowerCase().includes(lowerKeyword)
    )
    .map(f => f.id);
}

