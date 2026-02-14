/**
 * Setup Test Contract Pack
 * Creates a sample ContractPack for testing webhook integration
 */

import { prisma } from '../src/lib/db.js';
import type { Contract } from '../src/services/contracts/types.js';

async function setupTestContractPack() {
  console.log('=== Setting up Test Contract Pack ===\n');

  try {
    // Find the test workspace
    const workspace = await prisma.workspace.findFirst({
      where: { slug: 'test-contract-workspace' }
    });

    if (!workspace) {
      throw new Error('Test workspace not found. Run the integration test first.');
    }

    console.log(`✅ Found workspace: ${workspace.name} (${workspace.id})\n`);

    // Check if contract pack already exists
    const existing = await prisma.contractPack.findFirst({
      where: { workspaceId: workspace.id }
    });

    if (existing) {
      console.log(`⚠️  Contract pack already exists: ${existing.id}`);
      console.log('   Deleting existing pack...\n');
      await prisma.contractPack.delete({
        where: {
          workspaceId_id: {
            workspaceId: workspace.id,
            id: existing.id
          }
        }
      });
    }

    // Create sample contracts
    const sampleContracts: Contract[] = [
      {
        contractId: 'api-docs-contract',
        name: 'API Documentation Contract',
        description: 'Ensures OpenAPI spec and README stay in sync',
        scope: {
          repo: 'VertaAI',
          tags: ['api', 'documentation'],
        },
        artifacts: [
          {
            system: 'github',
            type: 'openapi',
            locator: {
              repo: 'VertaAI',
              path: 'openapi.yaml',
            },
            role: 'primary',
            required: true,
          },
          {
            system: 'github',
            type: 'readme',
            locator: {
              repo: 'VertaAI',
              path: 'README.md',
            },
            role: 'secondary',
            required: true,
          },
        ],
        invariants: [
          {
            invariantId: 'endpoint-parity',
            name: 'Endpoint Parity',
            description: 'All OpenAPI endpoints must be documented',
            enabled: true,
            severity: 'high',
            comparatorType: 'openapi_docs_endpoint_parity',
          },
        ],
        enforcement: {
          mode: 'pr_gate',
          blockOnFail: true,
          warnOnWarn: true,
          requireApprovalOverride: false,
        },
        routing: {
          method: 'codeowners',
        },
        writeback: {
          enabled: true,
          requiresApproval: true,
          targetArtifacts: ['readme'],
        },
      },
      {
        contractId: 'infrastructure-contract',
        name: 'Infrastructure Documentation Contract',
        description: 'Ensures Terraform changes are documented',
        scope: {
          tags: ['infrastructure', 'terraform'],
        },
        artifacts: [
          {
            system: 'github',
            type: 'iac_terraform',
            locator: {},
            role: 'primary',
            required: true,
          },
          {
            system: 'github',
            type: 'readme',
            locator: {
              path: 'docs/infrastructure.md',
            },
            role: 'secondary',
            required: false,
          },
        ],
        invariants: [
          {
            invariantId: 'resource-documented',
            name: 'Resources Documented',
            description: 'All Terraform resources must be documented',
            enabled: true,
            severity: 'medium',
            comparatorType: 'terraform_docs_parity',
          },
        ],
        enforcement: {
          mode: 'async_notify',
          blockOnFail: false,
          warnOnWarn: true,
          requireApprovalOverride: false,
        },
        routing: {
          method: 'service_owner',
        },
        writeback: {
          enabled: false,
          requiresApproval: true,
          targetArtifacts: [],
        },
      },
    ];

    // Create contract pack
    const contractPack = await prisma.contractPack.create({
      data: {
        workspaceId: workspace.id,
        name: 'Production Contract Pack',
        description: 'Contract pack for testing webhook integration',
        contracts: sampleContracts as any,
        version: 'v1',
      },
    });

    console.log(`✅ Created ContractPack: ${contractPack.id}`);
    console.log(`   - ${sampleContracts.length} contracts defined`);
    console.log(`   - Contracts: ${sampleContracts.map(c => c.contractId).join(', ')}\n`);

    console.log('=== ✅ Setup Complete! ===\n');
    console.log('You can now test with a real PR webhook or use the simulation script.\n');

  } catch (error) {
    console.error('❌ Setup failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

setupTestContractPack().catch(console.error);

