/**
 * YAML Config Resolver
 * 
 * Resolves contract packs from YAML configuration with org→repo→pack hierarchy.
 * Handles:
 * - Rollout mode inheritance (org → repo → pack)
 * - Enabled/disabled state propagation
 * - Surface-based filtering
 * - ID generation for contracts and invariants
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ContractPacksConfig,
  ContractPackConfig,
  ContractConfig,
  InvariantConfig,
  RolloutMode,
  SurfaceType,
} from './schema.js';

// ======================================================================
// TYPES
// ======================================================================

export interface ResolvedContractPack {
  packId: string;
  name: string;
  description?: string;
  surfaces: SurfaceType[];
  contracts: ResolvedContract[];
  rolloutMode: RolloutMode;
  enabled: boolean;
  source: 'yaml' | 'database';
}

export interface ResolvedContract {
  contractId: string;
  name: string;
  description?: string;
  surfaces: SurfaceType[];
  artifactLocations: Array<{
    artifactType: string;
    location: string;
  }>;
  invariants: ResolvedInvariant[];
}

export interface ResolvedInvariant {
  invariantId: string;
  comparatorType: string;
  description?: string;
  config?: Record<string, any>;
  severity: string;
}

export interface ResolveOptions {
  owner: string; // GitHub owner (org or user)
  repo: string; // GitHub repo name
  surfaces: SurfaceType[]; // Surfaces touched in the PR
}

// ======================================================================
// RESOLVER
// ======================================================================

export class YamlConfigResolver {
  /**
   * Resolve contract packs for a specific repository and surfaces
   */
  resolve(
    config: ContractPacksConfig,
    options: ResolveOptions
  ): ResolvedContractPack[] {
    const { owner, repo, surfaces } = options;
    const fullRepoName = `${owner}/${repo}`;

    // Find org config
    const orgConfig = config.orgs.find(org => org.org === owner);
    if (!orgConfig) {
      console.log(`[YamlResolver] No org config found for ${owner}`);
      return [];
    }

    // Check if org is enabled
    if (orgConfig.enabled === false) {
      console.log(`[YamlResolver] Org ${owner} is disabled`);
      return [];
    }

    // Find repo config
    const repoConfig = orgConfig.repos?.find(r => r.repo === fullRepoName);
    if (!repoConfig) {
      console.log(`[YamlResolver] No repo config found for ${fullRepoName}`);
      return [];
    }

    // Check if repo is enabled
    if (repoConfig.enabled === false) {
      console.log(`[YamlResolver] Repo ${fullRepoName} is disabled`);
      return [];
    }

    // Determine effective rollout mode (repo overrides org)
    const effectiveOrgRolloutMode = orgConfig.rolloutMode || 'warn';
    const effectiveRepoRolloutMode = repoConfig.rolloutMode || effectiveOrgRolloutMode;

    // Resolve packs
    const resolvedPacks: ResolvedContractPack[] = [];

    for (const pack of repoConfig.packs) {
      // Check if pack is enabled
      if (pack.enabled === false) {
        continue;
      }

      // Check if pack applies to any of the touched surfaces
      const packApplies = pack.surfaces.some(s => surfaces.includes(s));
      if (!packApplies) {
        continue;
      }

      // Determine effective rollout mode (pack overrides repo)
      const effectiveRolloutMode = pack.rolloutMode || effectiveRepoRolloutMode;

      // Resolve contracts
      const resolvedContracts = this.resolveContracts(pack.contracts, surfaces);

      // Only include pack if it has contracts
      if (resolvedContracts.length === 0) {
        continue;
      }

      resolvedPacks.push({
        packId: pack.packId || uuidv4(),
        name: pack.name,
        description: pack.description,
        surfaces: pack.surfaces,
        contracts: resolvedContracts,
        rolloutMode: effectiveRolloutMode,
        enabled: pack.enabled ?? true,
        source: 'yaml',
      });
    }

    console.log(`[YamlResolver] Resolved ${resolvedPacks.length} packs for ${fullRepoName}`);
    return resolvedPacks;
  }

  /**
   * Resolve contracts, filtering by surfaces
   */
  private resolveContracts(
    contracts: ContractConfig[],
    surfaces: SurfaceType[]
  ): ResolvedContract[] {
    const resolved: ResolvedContract[] = [];

    for (const contract of contracts) {
      // Check if contract applies to any of the touched surfaces
      const contractApplies = contract.surfaces.some(s => surfaces.includes(s));
      if (!contractApplies) {
        continue;
      }

      // Resolve invariants
      const resolvedInvariants = this.resolveInvariants(contract.invariants);

      resolved.push({
        contractId: contract.contractId || uuidv4(),
        name: contract.name,
        description: contract.description,
        surfaces: contract.surfaces,
        artifactLocations: contract.artifactLocations,
        invariants: resolvedInvariants,
      });
    }

    return resolved;
  }

  /**
   * Resolve invariants, generating IDs if needed
   */
  private resolveInvariants(invariants: InvariantConfig[]): ResolvedInvariant[] {
    return invariants.map(inv => ({
      invariantId: inv.invariantId || uuidv4(),
      comparatorType: inv.comparatorType,
      description: inv.description,
      config: inv.config,
      severity: inv.severity || 'medium',
    }));
  }
}

// ======================================================================
// SINGLETON
// ======================================================================

let resolverInstance: YamlConfigResolver | null = null;

export function getYamlConfigResolver(): YamlConfigResolver {
  if (!resolverInstance) {
    resolverInstance = new YamlConfigResolver();
  }
  return resolverInstance;
}

