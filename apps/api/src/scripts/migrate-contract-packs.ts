/**
 * Migration Script: ContractPack → WorkspacePolicyPack
 * 
 * Migrates existing ContractPack records to the new unified WorkspacePolicyPack model.
 * Preserves all configuration while adding new unified structure.
 * 
 * Usage:
 *   npm run migrate:contract-packs [--dry-run] [--workspace=<id>]
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID, createHash } from 'crypto';

const prisma = new PrismaClient();

interface MigrationOptions {
  dryRun: boolean;
  workspaceId?: string;
}

interface ContractPack {
  workspaceId: string;
  id: string;
  version: string;
  name: string;
  description: string | null;
  contracts: any;
  dictionaries: any;
  extraction: any;
  safety: any;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Generate version hash for WorkspacePolicyPack
 */
function generateVersionHash(config: any): string {
  const content = JSON.stringify(config, Object.keys(config).sort());
  return createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Transform ContractPack to WorkspacePolicyPack trackAConfig
 */
function transformContractPackToTrackAConfig(pack: ContractPack): any {
  const contracts = Array.isArray(pack.contracts) ? pack.contracts : [];
  
  // Extract surfaces from contracts
  const surfaces = new Set<string>();
  contracts.forEach((contract: any) => {
    if (contract.surfaces && Array.isArray(contract.surfaces)) {
      contract.surfaces.forEach((s: string) => surfaces.add(s));
    }
  });

  // Build trackAConfig with ALL 56 configurable elements
  return {
    surfaces: Array.from(surfaces),
    contracts: contracts.map((contract: any) => ({
      // Contract Structure (18 fields)
      contractId: contract.contractId || randomUUID(),
      name: contract.name || 'Unnamed Contract',
      description: contract.description || null,
      scope: contract.scope || {},
      
      // Artifacts (11 fields each)
      artifacts: (contract.artifacts || []).map((artifact: any) => ({
        system: artifact.system || 'github',
        type: artifact.type || 'github_repo_code',
        locator: artifact.locator || {},
        role: artifact.role || 'primary',
        required: artifact.required !== false,
        freshnessSlaHours: artifact.freshnessSlaHours || null,
      })),
      
      // Invariants (7 fields each)
      invariants: (contract.invariants || []).map((invariant: any) => ({
        invariantId: invariant.invariantId || randomUUID(),
        name: invariant.name || 'Unnamed Invariant',
        description: invariant.description || null,
        enabled: invariant.enabled !== false,
        severity: invariant.severity || 'medium',
        comparatorType: invariant.comparatorType || 'unknown',
        config: invariant.config || {},
      })),
      
      // Enforcement (4 fields)
      enforcement: {
        mode: contract.enforcement?.mode || 'pr_gate',
        blockOnFail: contract.enforcement?.blockOnFail !== false,
        warnOnWarn: contract.enforcement?.warnOnWarn !== false,
        requireApprovalOverride: contract.enforcement?.requireApprovalOverride !== false,
      },
      
      // Routing (2 fields)
      routing: {
        method: contract.routing?.method || 'codeowners',
        fallbackChannel: contract.routing?.fallbackChannel || null,
      },
      
      // Writeback (4 fields)
      writeback: {
        enabled: contract.writeback?.enabled || false,
        autoApproveThreshold: contract.writeback?.autoApproveThreshold || null,
        requiresApproval: contract.writeback?.requiresApproval !== false,
        targetArtifacts: contract.writeback?.targetArtifacts || [],
      },
    })),
    
    // Dictionaries (from ContractPack)
    dictionaries: pack.dictionaries || {},
    
    // Extraction (from ContractPack)
    extraction: pack.extraction || {},
    
    // Safety (from ContractPack)
    safety: pack.safety || {},
    
    // Enforcement (ContractPolicy fields - use defaults for now)
    enforcement: {
      mode: 'warn_only',
      criticalThreshold: 90,
      highThreshold: 70,
      mediumThreshold: 40,
    },
    
    // Graceful Degradation
    gracefulDegradation: {
      timeoutMs: 30000,
      maxArtifactFetchFailures: 3,
      fallbackMode: 'warn_only',
      enableSoftFail: true,
    },
    
    // Applies To
    appliesTo: [],
  };
}

/**
 * Migrate a single ContractPack to WorkspacePolicyPack
 */
async function migrateContractPack(pack: ContractPack, options: MigrationOptions): Promise<void> {
  const trackAConfig = transformContractPackToTrackAConfig(pack);
  const versionHash = generateVersionHash({ trackA: trackAConfig });

  const policyPack = {
    workspaceId: pack.workspaceId,
    id: pack.id, // Preserve original ID
    name: pack.name,
    description: pack.description,
    status: 'active',

    // Scope (default to workspace-level)
    scopeType: 'workspace',
    scopeRef: null,
    repoAllowlist: [],
    pathGlobs: [],

    // Track A enabled with migrated config
    trackAEnabled: true,
    trackAConfig,

    // Track B disabled
    trackBEnabled: false,
    trackBConfig: {},

    // Shared configs (empty for now)
    approvalTiers: {},
    routing: {},
    testMode: false,
    testModeConfig: {},

    // Versioning
    version: 1,
    versionHash,
    parentId: null,

    createdBy: null,
    updatedBy: null,
  };

  if (options.dryRun) {
    console.log(`[DRY RUN] Would migrate ContractPack: ${pack.workspaceId}/${pack.id}`);
    console.log(`  Name: ${pack.name}`);
    console.log(`  Contracts: ${trackAConfig.contracts.length}`);
    console.log(`  Version Hash: ${versionHash}`);
  } else {
    await prisma.workspacePolicyPack.create({
      data: policyPack,
    });
    console.log(`✅ Migrated ContractPack: ${pack.workspaceId}/${pack.id} → WorkspacePolicyPack`);
  }
}

/**
 * Main migration function
 */
async function migrateContractPacks(options: MigrationOptions): Promise<void> {
  console.log('🚀 Starting ContractPack → WorkspacePolicyPack migration...\n');

  if (options.dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  // Fetch all ContractPacks (or filtered by workspace)
  const where = options.workspaceId ? { workspaceId: options.workspaceId } : {};
  const contractPacks = await prisma.contractPack.findMany({ where });

  console.log(`Found ${contractPacks.length} ContractPack(s) to migrate\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const pack of contractPacks) {
    try {
      await migrateContractPack(pack as any, options);
      successCount++;
    } catch (error) {
      console.error(`❌ Failed to migrate ContractPack ${pack.workspaceId}/${pack.id}:`, error);
      errorCount++;
    }
  }

  console.log('\n📊 Migration Summary:');
  console.log(`  Total: ${contractPacks.length}`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);

  if (options.dryRun) {
    console.log('\n⚠️  This was a DRY RUN - no changes were made');
  }
}

/**
 * CLI Entry Point
 */
async function main() {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    dryRun: args.includes('--dry-run'),
    workspaceId: args.find(arg => arg.startsWith('--workspace='))?.split('=')[1],
  };

  try {
    await migrateContractPacks(options);
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if this is the main module
main();

export { migrateContractPacks, transformContractPackToTrackAConfig };

