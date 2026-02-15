/**
 * ContractPack Resolver
 * 
 * Resolves applicable ContractPacks from database based on surfaces touched.
 * This replaces the mock contract generator with real database-backed contracts.
 * 
 * Architecture:
 * - Layer 1: Common check types (shipped by us)
 * - Layer 2: Customer config (defined per workspace)
 */

import { prisma } from '../../lib/db.js';
import type { Contract } from './types.js';
import type { Surface } from '../contractGate/surfaceClassifier.js';

// ======================================================================
// TYPES
// ======================================================================

export interface ContractPackResolutionResult {
  contracts: Contract[];
  packIds: string[];
  resolutionReasons: string[];
}

// ======================================================================
// CONTRACT PACK RESOLVER
// ======================================================================

/**
 * Resolve applicable ContractPacks from database based on surfaces touched
 * 
 * This is the bridge between surface classification and contract validation.
 * It fetches ContractPacks from the database and filters contracts based on
 * which surfaces were touched in the PR.
 */
export async function resolveContractPacks(
  workspaceId: string,
  surfacesTouched: Surface[],
  changedFiles: Array<{ filename: string; status: string }>
): Promise<ContractPackResolutionResult> {
  console.log(`[ContractPackResolver] Resolving packs for workspace ${workspaceId}`);
  console.log(`[ContractPackResolver] Surfaces touched: ${surfacesTouched.join(', ')}`);

  // Fetch all ContractPacks for this workspace
  const packs = await prisma.contractPack.findMany({
    where: {
      workspaceId,
    },
    select: {
      id: true,
      name: true,
      contracts: true, // JSON array of Contract objects
    },
  });

  console.log(`[ContractPackResolver] Found ${packs.length} contract packs`);

  if (packs.length === 0) {
    console.log(`[ContractPackResolver] No contract packs found - returning empty result`);
    return {
      contracts: [],
      packIds: [],
      resolutionReasons: ['No contract packs configured for workspace'],
    };
  }

  // Extract and filter contracts from all packs
  const allContracts: Contract[] = [];
  const packIds: string[] = [];
  const resolutionReasons: string[] = [];

  for (const pack of packs) {
    // Parse contracts JSON
    const contracts = Array.isArray(pack.contracts) ? pack.contracts as Contract[] : [];
    
    console.log(`[ContractPackResolver] Pack "${pack.name}" has ${contracts.length} contracts`);

    // Filter contracts based on surfaces touched
    for (const contract of contracts) {
      const shouldActivate = shouldActivateContract(contract, surfacesTouched, changedFiles);
      
      if (shouldActivate.activate) {
        allContracts.push(contract);
        packIds.push(pack.id);
        resolutionReasons.push(`Pack "${pack.name}": ${shouldActivate.reason}`);
        
        console.log(`[ContractPackResolver] ✓ Activated contract "${contract.name}" from pack "${pack.name}"`);
      } else {
        console.log(`[ContractPackResolver] ✗ Skipped contract "${contract.name}": ${shouldActivate.reason}`);
      }
    }
  }

  console.log(`[ContractPackResolver] Resolved ${allContracts.length} applicable contracts`);

  return {
    contracts: allContracts,
    packIds,
    resolutionReasons,
  };
}

// ======================================================================
// ACTIVATION LOGIC
// ======================================================================

interface ActivationDecision {
  activate: boolean;
  reason: string;
}

/**
 * Determine if a contract should be activated based on surfaces touched
 * 
 * Activation rules:
 * 1. Contract has explicit surface triggers → check if any match
 * 2. Contract has file pattern triggers → check if any files match
 * 3. Contract is always-on → activate
 */
function shouldActivateContract(
  contract: Contract,
  surfacesTouched: Surface[],
  changedFiles: Array<{ filename: string; status: string }>
): ActivationDecision {
  // Rule 1: Check if contract is enabled
  if (!contract.enabled) {
    return { activate: false, reason: 'Contract is disabled' };
  }

  // Rule 2: Check surface-based triggers (if contract has surface metadata)
  // This is a convention: contracts can have a `surfaces` field to declare which surfaces they apply to
  const contractSurfaces = (contract as any).surfaces as Surface[] | undefined;
  
  if (contractSurfaces && contractSurfaces.length > 0) {
    const hasMatchingSurface = contractSurfaces.some(s => surfacesTouched.includes(s));
    
    if (hasMatchingSurface) {
      return { 
        activate: true, 
        reason: `Surface match: ${contractSurfaces.filter(s => surfacesTouched.includes(s)).join(', ')}` 
      };
    } else {
      return { 
        activate: false, 
        reason: `No surface match (requires: ${contractSurfaces.join(', ')})` 
      };
    }
  }

  // Rule 3: Fallback - activate all contracts if no surface metadata
  // This is conservative: better to check too much than too little
  return { 
    activate: true, 
    reason: 'No surface filters defined - activating by default' 
  };
}

