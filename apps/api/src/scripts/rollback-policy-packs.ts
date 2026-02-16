/**
 * Rollback Script: WorkspacePolicyPack → ContractPack/DriftPlan
 * 
 * Rolls back WorkspacePolicyPack records to their original ContractPack or DriftPlan format.
 * Used for emergency rollback if migration causes issues.
 * 
 * Usage:
 *   npm run rollback:policy-packs [--dry-run] [--workspace=<id>]
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface RollbackOptions {
  dryRun: boolean;
  workspaceId?: string;
}

/**
 * Rollback a WorkspacePolicyPack with Track A enabled
 */
async function rollbackToContractPack(policyPack: any, options: RollbackOptions): Promise<void> {
  const trackAConfig = policyPack.trackAConfig || {};
  
  const contractPack = {
    workspaceId: policyPack.workspaceId,
    id: policyPack.id,
    version: 'v1',
    name: policyPack.name,
    description: policyPack.description,
    contracts: trackAConfig.contracts || [],
    dictionaries: trackAConfig.dictionaries || {},
    extraction: trackAConfig.extraction || {},
    safety: trackAConfig.safety || {},
  };

  if (options.dryRun) {
    console.log(`[DRY RUN] Would rollback to ContractPack: ${policyPack.workspaceId}/${policyPack.id}`);
    console.log(`  Name: ${policyPack.name}`);
    console.log(`  Contracts: ${contractPack.contracts.length}`);
  } else {
    // Delete WorkspacePolicyPack
    await prisma.workspacePolicyPack.delete({
      where: {
        workspaceId_id: {
          workspaceId: policyPack.workspaceId,
          id: policyPack.id,
        },
      },
    });

    // Recreate ContractPack
    await prisma.contractPack.create({
      data: contractPack,
    });

    console.log(`✅ Rolled back to ContractPack: ${policyPack.workspaceId}/${policyPack.id}`);
  }
}

/**
 * Rollback a WorkspacePolicyPack with Track B enabled
 */
async function rollbackToDriftPlan(policyPack: any, options: RollbackOptions): Promise<void> {
  const trackBConfig = policyPack.trackBConfig || {};
  
  const driftPlan = {
    workspaceId: policyPack.workspaceId,
    id: policyPack.id,
    name: policyPack.name,
    description: policyPack.description,
    status: policyPack.status,
    scopeType: policyPack.scopeType,
    scopeRef: policyPack.scopeRef,
    primaryDocId: trackBConfig.primaryDoc?.id || null,
    primaryDocSystem: trackBConfig.primaryDoc?.system || null,
    docClass: trackBConfig.primaryDoc?.class || null,
    inputSources: (trackBConfig.inputSources || []).map((s: any) => s.type),
    driftTypes: (trackBConfig.driftTypes || []).map((d: any) => d.type),
    allowedOutputs: trackBConfig.allowedOutputs || [],
    thresholds: trackBConfig.materiality || {},
    eligibility: trackBConfig.eligibility || {},
    sectionTargets: (trackBConfig.driftTypes || []).reduce((acc: any, d: any) => {
      if (d.sectionTarget) acc[d.type] = d.sectionTarget;
      return acc;
    }, {}),
    impactRules: trackBConfig.impactRules || {},
    writeback: trackBConfig.writeback || {},
    docTargeting: trackBConfig.docTargeting || {},
    sourceCursors: trackBConfig.sourceCursors || {},
    budgets: trackBConfig.budgets || {},
    noiseControls: trackBConfig.noiseControls || {},
    version: policyPack.version,
    versionHash: policyPack.versionHash,
    parentId: policyPack.parentId,
    templateId: null,
    templateName: null,
    createdBy: policyPack.createdBy,
    updatedBy: policyPack.updatedBy,
  };

  if (options.dryRun) {
    console.log(`[DRY RUN] Would rollback to DriftPlan: ${policyPack.workspaceId}/${policyPack.id}`);
    console.log(`  Name: ${policyPack.name}`);
    console.log(`  Scope: ${policyPack.scopeType}${policyPack.scopeRef ? ` (${policyPack.scopeRef})` : ''}`);
  } else {
    // Delete WorkspacePolicyPack
    await prisma.workspacePolicyPack.delete({
      where: {
        workspaceId_id: {
          workspaceId: policyPack.workspaceId,
          id: policyPack.id,
        },
      },
    });

    // Recreate DriftPlan
    await prisma.driftPlan.create({
      data: driftPlan,
    });

    console.log(`✅ Rolled back to DriftPlan: ${policyPack.workspaceId}/${policyPack.id}`);
  }
}

/**
 * Main rollback function
 */
async function rollbackPolicyPacks(options: RollbackOptions): Promise<void> {
  console.log('🔄 Starting WorkspacePolicyPack rollback...\n');
  
  if (options.dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  // Fetch all WorkspacePolicyPacks (or filtered by workspace)
  const where = options.workspaceId ? { workspaceId: options.workspaceId } : {};
  const policyPacks = await prisma.workspacePolicyPack.findMany({ where });

  console.log(`Found ${policyPacks.length} WorkspacePolicyPack(s) to rollback\n`);

  let trackACount = 0;
  let trackBCount = 0;
  let errorCount = 0;

  for (const pack of policyPacks) {
    try {
      if (pack.trackAEnabled && !pack.trackBEnabled) {
        // Rollback to ContractPack
        await rollbackToContractPack(pack, options);
        trackACount++;
      } else if (pack.trackBEnabled && !pack.trackAEnabled) {
        // Rollback to DriftPlan
        await rollbackToDriftPlan(pack, options);
        trackBCount++;
      } else if (pack.trackAEnabled && pack.trackBEnabled) {
        console.warn(`⚠️  Skipping ${pack.workspaceId}/${pack.id}: Both tracks enabled (unified pack)`);
      } else {
        console.warn(`⚠️  Skipping ${pack.workspaceId}/${pack.id}: No tracks enabled`);
      }
    } catch (error) {
      console.error(`❌ Failed to rollback ${pack.workspaceId}/${pack.id}:`, error);
      errorCount++;
    }
  }

  console.log('\n📊 Rollback Summary:');
  console.log(`  Total: ${policyPacks.length}`);
  console.log(`  Rolled back to ContractPack: ${trackACount}`);
  console.log(`  Rolled back to DriftPlan: ${trackBCount}`);
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
  const options: RollbackOptions = {
    dryRun: args.includes('--dry-run'),
    workspaceId: args.find(arg => arg.startsWith('--workspace='))?.split('=')[1],
  };

  try {
    await rollbackPolicyPacks(options);
  } catch (error) {
    console.error('💥 Rollback failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

export { rollbackPolicyPacks };

