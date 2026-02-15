/**
 * Seed Contract Configuration
 * Adds default ContractPolicy and ContractPack to all workspaces
 * 
 * Usage: tsx apps/api/scripts/seed-contract-config.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedContractConfig() {
  console.log('🌱 Seeding Contract Configuration...\n');

  try {
    // Get all workspaces
    const workspaces = await prisma.workspace.findMany({
      select: { id: true, name: true },
    });

    console.log(`Found ${workspaces.length} workspaces\n`);

    let policiesCreated = 0;
    let packsCreated = 0;
    let skipped = 0;

    for (const workspace of workspaces) {
      console.log(`Processing workspace: ${workspace.name} (${workspace.id})`);

      // Check if workspace already has a policy
      const existingPolicy = await prisma.contractPolicy.findFirst({
        where: { workspaceId: workspace.id },
      });

      if (!existingPolicy) {
        // Create default ContractPolicy
        await prisma.contractPolicy.create({
          data: {
            workspaceId: workspace.id,
            name: 'Default Policy',
            description: 'Default contract validation policy - warns on all findings, never blocks',
            mode: 'warn_only',
            criticalThreshold: 90,
            highThreshold: 70,
            mediumThreshold: 40,
            gracefulDegradation: {},
            appliesTo: [],
            active: true,
          },
        });
        console.log('  ✅ Created default ContractPolicy (warn_only mode)');
        policiesCreated++;
      } else {
        console.log('  ⏭️  ContractPolicy already exists');
      }

      // Check if workspace already has a pack
      const existingPack = await prisma.contractPack.findFirst({
        where: { workspaceId: workspace.id },
      });

      if (!existingPack) {
        // Create default ContractPack (PublicAPI starter pack)
        await prisma.contractPack.create({
          data: {
            workspaceId: workspace.id,
            name: 'PublicAPI Starter Pack',
            description: 'Validates OpenAPI specs and API documentation',
            version: 'v1',
            contracts: [
              {
                contractId: 'public-api-contract',
                name: 'Public API Contract',
                description: 'Ensures OpenAPI spec is valid and breaking changes are documented',
                surfaces: ['api'],
                artifacts: [
                  {
                    artifactId: 'openapi_spec',
                    name: 'OpenAPI Specification',
                    type: 'github_file',
                    path: 'openapi/openapi.yaml',
                    required: true,
                  },
                ],
                invariants: [
                  {
                    invariantId: 'openapi-valid',
                    name: 'OpenAPI Validation',
                    description: 'OpenAPI spec must be valid',
                    enabled: true,
                    severity: 'critical',
                    comparatorType: 'openapi.validate',
                  },
                  {
                    invariantId: 'openapi-breaking-changes',
                    name: 'Breaking Changes Detection',
                    description: 'Detect breaking changes in API',
                    enabled: true,
                    severity: 'high',
                    comparatorType: 'openapi.diff',
                  },
                ],
                enforcement: {
                  mode: 'pr_gate',
                  blockOnFail: false,
                  warnOnWarn: true,
                  requireApprovalOverride: false,
                },
                routing: {
                  method: 'codeowners',
                  fallbackChannel: '#api-team',
                },
                writeback: {
                  enabled: false,
                  requiresApproval: true,
                  targetArtifacts: [],
                },
              },
            ],
            dictionaries: {},
            extraction: {},
            safety: {},
          },
        });
        console.log('  ✅ Created PublicAPI Starter Pack');
        packsCreated++;
      } else {
        console.log('  ⏭️  ContractPack already exists');
      }

      if (existingPolicy && existingPack) {
        skipped++;
      }

      console.log('');
    }

    console.log('✅ Seeding complete!\n');
    console.log(`Summary:`);
    console.log(`  - Workspaces processed: ${workspaces.length}`);
    console.log(`  - Policies created: ${policiesCreated}`);
    console.log(`  - Packs created: ${packsCreated}`);
    console.log(`  - Skipped (already configured): ${skipped}`);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedContractConfig()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Error:', error);
    process.exit(1);
  });

