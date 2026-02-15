/**
 * Hybrid Config Resolver
 * 
 * Combines YAML-based and database-based contract pack resolution.
 * 
 * Resolution Order:
 * 1. Try YAML config from repository (.verta/contractpacks.yaml)
 * 2. Fall back to database ContractPacks
 * 3. Merge results (YAML takes precedence)
 * 
 * This enables gradual migration from database to YAML config.
 */

import { getYamlConfigLoader } from './yamlLoader.js';
import { getYamlConfigResolver, type ResolvedContractPack } from './yamlResolver.js';
import { resolveContractPacks } from '../contractPackResolver.js';
import type { SurfaceType } from './schema.js';

// ======================================================================
// TYPES
// ======================================================================

export interface HybridResolveOptions {
  workspaceId: string;
  owner: string; // GitHub owner (org or user)
  repo: string; // GitHub repo name
  ref?: string; // Git ref (branch, tag, or commit SHA). Default: "main"
  surfaces: SurfaceType[]; // Surfaces touched in the PR
  preferYaml?: boolean; // If true, only use YAML (no database fallback). Default: false
}

export interface HybridResolveResult {
  packs: ResolvedContractPack[];
  source: 'yaml' | 'database' | 'hybrid';
  yamlFound: boolean;
  yamlValid: boolean;
  yamlError?: string;
}

// ======================================================================
// RESOLVER
// ======================================================================

export class HybridConfigResolver {
  /**
   * Resolve contract packs from YAML and/or database
   */
  async resolve(options: HybridResolveOptions): Promise<HybridResolveResult> {
    const {
      workspaceId,
      owner,
      repo,
      ref = 'main',
      surfaces,
      preferYaml = false,
    } = options;

    const loader = getYamlConfigLoader();
    const resolver = getYamlConfigResolver();

    // Try to load YAML config from repository
    const yamlResult = await loader.loadFromGitHub(owner, repo, ref);

    if (yamlResult.success && yamlResult.config) {
      // YAML config found and valid
      console.log(`[HybridResolver] Using YAML config from ${owner}/${repo}`);

      const packs = resolver.resolve(yamlResult.config, {
        owner,
        repo,
        surfaces,
      });

      return {
        packs,
        source: 'yaml',
        yamlFound: true,
        yamlValid: true,
      };
    }

    // YAML not found or invalid
    if (preferYaml) {
      // User requested YAML-only mode, don't fall back to database
      console.log(`[HybridResolver] YAML config not found/invalid, and preferYaml=true`);
      return {
        packs: [],
        source: 'yaml',
        yamlFound: yamlResult.error !== 'File not found',
        yamlValid: false,
        yamlError: yamlResult.error,
      };
    }

    // Fall back to database
    console.log(`[HybridResolver] YAML config not found/invalid, falling back to database`);
    
    const dbResult = await resolveContractPacks({
      workspaceId,
      surfaces,
    });

    // Convert database result to ResolvedContractPack format
    const packs: ResolvedContractPack[] = dbResult.packs.map(pack => ({
      packId: pack.packId,
      name: pack.name,
      description: pack.description,
      surfaces: pack.surfaces as SurfaceType[],
      contracts: pack.contracts.map(contract => ({
        contractId: contract.contractId,
        name: contract.name,
        description: contract.description,
        surfaces: contract.surfaces as SurfaceType[],
        artifactLocations: contract.artifactLocations,
        invariants: contract.invariants.map(inv => ({
          invariantId: inv.invariantId,
          comparatorType: inv.comparatorType,
          description: inv.description,
          config: inv.config,
          severity: inv.severity || 'medium',
        })),
      })),
      rolloutMode: 'warn' as const, // Database packs default to warn mode
      enabled: true,
      source: 'database' as const,
    }));

    return {
      packs,
      source: 'database',
      yamlFound: yamlResult.error !== 'File not found',
      yamlValid: false,
      yamlError: yamlResult.error,
    };
  }

  /**
   * Check if YAML config exists in repository
   */
  async hasYamlConfig(
    owner: string,
    repo: string,
    ref: string = 'main'
  ): Promise<boolean> {
    const loader = getYamlConfigLoader();
    return loader.existsInGitHub(owner, repo, ref);
  }
}

// ======================================================================
// SINGLETON
// ======================================================================

let hybridResolverInstance: HybridConfigResolver | null = null;

export function getHybridConfigResolver(): HybridConfigResolver {
  if (!hybridResolverInstance) {
    hybridResolverInstance = new HybridConfigResolver();
  }
  return hybridResolverInstance;
}

