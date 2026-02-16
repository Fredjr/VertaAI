/**
 * Migration Script: DriftPlan → WorkspacePolicyPack
 * 
 * Migrates existing DriftPlan records to the new unified WorkspacePolicyPack model.
 * Preserves all configuration while adding new unified structure.
 * 
 * Usage:
 *   npm run migrate:drift-plans [--dry-run] [--workspace=<id>]
 */

import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

interface MigrationOptions {
  dryRun: boolean;
  workspaceId?: string;
}

interface DriftPlan {
  workspaceId: string;
  id: string;
  name: string;
  description: string | null;
  status: string;
  scopeType: string;
  scopeRef: string | null;
  primaryDocId: string | null;
  primaryDocSystem: string | null;
  docClass: string | null;
  inputSources: string[];
  driftTypes: string[];
  allowedOutputs: string[];
  thresholds: any;
  eligibility: any;
  sectionTargets: any;
  impactRules: any;
  writeback: any;
  docTargeting: any;
  sourceCursors: any;
  budgets: any;
  noiseControls: any;
  version: number;
  versionHash: string;
  parentId: string | null;
  templateId: string | null;
  templateName: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

/**
 * Generate version hash for WorkspacePolicyPack
 */
function generateVersionHash(config: any): string {
  const content = JSON.stringify(config, Object.keys(config).sort());
  return createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Transform DriftPlan to WorkspacePolicyPack trackBConfig
 */
function transformDriftPlanToTrackBConfig(plan: DriftPlan): any {
  return {
    // Primary documentation target
    primaryDoc: {
      system: plan.primaryDocSystem || null,
      id: plan.primaryDocId || null,
      title: null, // Not stored in DriftPlan
      url: null,   // Not stored in DriftPlan
      class: plan.docClass || null,
    },
    
    // Input sources (5 types)
    inputSources: (plan.inputSources || []).map((type: string) => ({
      type,
      enabled: true,
      config: {},
    })),
    
    // Drift types (5 types)
    driftTypes: (plan.driftTypes || []).map((type: string) => ({
      type,
      enabled: true,
      sectionTarget: (plan.sectionTargets as any)?.[type] || null,
    })),
    
    // Materiality thresholds (4 thresholds)
    materiality: {
      autoApprove: (plan.thresholds as any)?.autoApprove || 0.98,
      slackNotify: (plan.thresholds as any)?.slackNotify || 0.40,
      digestOnly: (plan.thresholds as any)?.digestOnly || 0.30,
      ignore: (plan.thresholds as any)?.ignore || 0.20,
    },
    
    // Doc targeting strategy
    docTargeting: {
      strategy: (plan.docTargeting as any)?.strategy || 'primary_first',
      maxDocsPerDrift: (plan.docTargeting as any)?.maxDocsPerDrift || 3,
    },
    
    // Noise controls
    noiseControls: {
      ignorePatterns: (plan.noiseControls as any)?.ignorePatterns || [],
      ignorePaths: (plan.noiseControls as any)?.ignorePaths || [],
      ignoreAuthors: (plan.noiseControls as any)?.ignoreAuthors || [],
      temporalAccumulation: {
        enabled: true,
        windowDays: 7,
      },
    },
    
    // Allowed outputs
    allowedOutputs: plan.allowedOutputs || [],
    
    // Eligibility rules
    eligibility: plan.eligibility || {},
    
    // Impact rules
    impactRules: plan.impactRules || {},
    
    // Writeback config
    writeback: plan.writeback || {},
    
    // Source cursors
    sourceCursors: plan.sourceCursors || {},
    
    // Budgets
    budgets: plan.budgets || {},
  };
}

/**
 * Migrate a single DriftPlan to WorkspacePolicyPack
 */
async function migrateDriftPlan(plan: DriftPlan, options: MigrationOptions): Promise<void> {
  const trackBConfig = transformDriftPlanToTrackBConfig(plan);
  const versionHash = generateVersionHash({ trackB: trackBConfig });

  const policyPack = {
    workspaceId: plan.workspaceId,
    id: plan.id, // Preserve original ID
    name: plan.name,
    description: plan.description,
    status: plan.status,

    // Scope (from DriftPlan)
    scopeType: plan.scopeType,
    scopeRef: plan.scopeRef,
    repoAllowlist: [],
    pathGlobs: [],

    // Track A disabled
    trackAEnabled: false,
    trackAConfig: {},

    // Track B enabled with migrated config
    trackBEnabled: true,
    trackBConfig,

    // Shared configs (empty for now)
    approvalTiers: {},
    routing: {},
    testMode: false,
    testModeConfig: {},

    // Versioning (preserve from DriftPlan)
    version: plan.version,
    versionHash,
    parentId: plan.parentId,

    createdBy: plan.createdBy,
    updatedBy: plan.updatedBy,
  };

  if (options.dryRun) {
    console.log(`[DRY RUN] Would migrate DriftPlan: ${plan.workspaceId}/${plan.id}`);
    console.log(`  Name: ${plan.name}`);
    console.log(`  Scope: ${plan.scopeType}${plan.scopeRef ? ` (${plan.scopeRef})` : ''}`);
    console.log(`  Input Sources: ${plan.inputSources.length}`);
    console.log(`  Drift Types: ${plan.driftTypes.length}`);
    console.log(`  Version Hash: ${versionHash}`);
  } else {
    await prisma.workspacePolicyPack.create({
      data: policyPack,
    });
    console.log(`✅ Migrated DriftPlan: ${plan.workspaceId}/${plan.id} → WorkspacePolicyPack`);
  }
}

/**
 * Main migration function
 */
async function migrateDriftPlans(options: MigrationOptions): Promise<void> {
  console.log('🚀 Starting DriftPlan → WorkspacePolicyPack migration...\n');

  if (options.dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  // Fetch all DriftPlans (or filtered by workspace)
  const where = options.workspaceId ? { workspaceId: options.workspaceId } : {};
  const driftPlans = await prisma.driftPlan.findMany({ where });

  console.log(`Found ${driftPlans.length} DriftPlan(s) to migrate\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const plan of driftPlans) {
    try {
      await migrateDriftPlan(plan as any, options);
      successCount++;
    } catch (error) {
      console.error(`❌ Failed to migrate DriftPlan ${plan.workspaceId}/${plan.id}:`, error);
      errorCount++;
    }
  }

  console.log('\n📊 Migration Summary:');
  console.log(`  Total: ${driftPlans.length}`);
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
    await migrateDriftPlans(options);
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

export { migrateDriftPlans, transformDriftPlanToTrackBConfig };

