/**
 * Contract Resolver Integration Test
 * Phase 1 Week 1-2: Contract Registry & Resolution Engine
 * 
 * Tests end-to-end contract resolution flow
 */

import { prisma } from '../../../lib/db.js';
import { ContractResolver } from '../contractResolver.js';
import type { Contract } from '../types.js';

async function testContractResolution() {
  console.log('=== Contract Resolution Integration Test ===\n');

  try {
    // Step 1: Find or create a test workspace
    console.log('Step 1: Setting up test workspace...');
    let workspace = await prisma.workspace.findFirst({
      where: { slug: 'test-contract-workspace' }
    });

    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: {
          name: 'Test Contract Workspace',
          slug: 'test-contract-workspace',
          ownerEmail: 'test@vertaai.com',
        }
      });
      console.log(`✅ Created test workspace: ${workspace.id}\n`);
    } else {
      console.log(`✅ Using existing workspace: ${workspace.id} (${workspace.name})\n`);
    }

    // Step 2: Create a sample ContractPack
    console.log('Step 2: Creating sample ContractPack...');
    const sampleContracts: Contract[] = [
      {
        contractId: 'api-contract-v1',
        name: 'API Contract: OpenAPI ↔ Docs ↔ Runbook',
        description: 'Ensures API spec, documentation, and runbooks stay in sync',
        scope: {
          service: 'api',
          repo: 'VertaAI',
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
            description: 'All OpenAPI endpoints must be documented in README',
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
        contractId: 'iac-contract-v1',
        name: 'IaC Contract: Terraform ↔ Runbook',
        description: 'Ensures infrastructure changes are documented',
        scope: {
          tags: ['infrastructure', 'terraform'],
        },
        artifacts: [
          {
            system: 'github',
            type: 'iac_terraform',
            locator: {
              path: 'terraform/main.tf',
            },
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

    const contractPack = await prisma.contractPack.create({
      data: {
        workspaceId: workspace.id,
        name: 'Default Contract Pack',
        description: 'Test contract pack for integration testing',
        contracts: sampleContracts as any,
        version: 'v1',
      },
    });

    console.log(`✅ Created ContractPack: ${contractPack.id}`);
    console.log(`   - ${sampleContracts.length} contracts defined\n`);

    // Step 3: Create a sample SignalEvent (simulating a PR webhook)
    console.log('Step 3: Creating sample SignalEvent...');
    const { randomUUID } = await import('crypto');
    const signalEvent = await prisma.signalEvent.create({
      data: {
        workspaceId: workspace.id,
        id: randomUUID(),
        sourceType: 'github_pr',
        occurredAt: new Date(),
        repo: 'VertaAI',
        service: 'api',
        extracted: {
          prNumber: 123,
          prTitle: 'Add new API endpoint',
          changedFiles: [
            'openapi.yaml',
            'README.md',
            'src/routes/api.ts',
          ],
          service: 'api',
          repo: 'VertaAI',
        },
        rawPayload: {},
      },
    });

    console.log(`✅ Created SignalEvent: ${signalEvent.id}`);
    console.log(`   - Changed files: openapi.yaml, README.md, src/routes/api.ts\n`);

    // Step 4: Run ContractResolver
    console.log('Step 4: Running ContractResolver...');
    const resolver = new ContractResolver(workspace.id, sampleContracts);
    const startTime = Date.now();
    const result = await resolver.resolveFromSignal(signalEvent);
    const resolutionTimeMs = Date.now() - startTime;

    console.log(`✅ Contract resolution completed in ${resolutionTimeMs}ms`);
    console.log(`   - Resolved contracts: ${result.resolvedContracts.length}`);
    console.log(`   - Unresolved artifacts: ${result.unresolvedArtifacts.length}`);
    console.log(`   - Obligations: ${result.obligations.length}\n`);

    // Step 5: Display resolution details
    console.log('Step 5: Resolution Details:');
    console.log('─────────────────────────────────────────────────────────');

    if (result.resolvedContracts.length > 0) {
      console.log('\n📋 Resolved Contracts:');
      result.resolvedContracts.forEach((rc, i) => {
        console.log(`\n  ${i + 1}. Contract: ${rc.contractId}`);
        console.log(`     Method: ${rc.resolutionMethod}`);
        console.log(`     Confidence: ${rc.confidence}`);
        console.log(`     Triggered by: ${JSON.stringify(rc.triggeredBy)}`);
      });
    }

    if (result.unresolvedArtifacts.length > 0) {
      console.log('\n\n⚠️  Unresolved Artifacts:');
      result.unresolvedArtifacts.forEach((ua, i) => {
        console.log(`\n  ${i + 1}. File: ${ua.file}`);
        console.log(`     Reason: ${ua.reason}`);
        if (ua.candidates && ua.candidates.length > 0) {
          console.log(`     Candidates: ${ua.candidates.map(c => `${c.contractId} (${c.score})`).join(', ')}`);
        }
      });
    }

    if (result.obligations.length > 0) {
      console.log('\n\n📝 Obligations:');
      result.obligations.forEach((ob, i) => {
        console.log(`\n  ${i + 1}. Type: ${ob.type}`);
        console.log(`     Artifact: ${ob.artifact}`);
        console.log(`     Action: ${ob.suggestedAction}`);
      });
    }

    // Step 6: Store ContractResolution in database
    console.log('\n\nStep 6: Storing ContractResolution in database...');
    const contractResolution = await prisma.contractResolution.create({
      data: {
        workspaceId: workspace.id,
        signalEventId: signalEvent.id,
        resolvedContracts: result.resolvedContracts as any,
        unresolvedArtifacts: result.unresolvedArtifacts as any,
        obligations: result.obligations as any,
        resolutionMethod: result.resolvedContracts.length > 0 && result.resolvedContracts[0]
          ? result.resolvedContracts[0].resolutionMethod
          : 'none',
        resolutionTimeMs,
      },
    });

    console.log(`✅ Stored ContractResolution: ${contractResolution.id}\n`);

    // Step 7: Verify data integrity
    console.log('Step 7: Verifying data integrity...');
    const storedResolution = await prisma.contractResolution.findUnique({
      where: {
        workspaceId_id: {
          workspaceId: workspace.id,
          id: contractResolution.id,
        },
      },
    });

    if (!storedResolution) {
      throw new Error('Failed to retrieve stored ContractResolution');
    }

    console.log('✅ Data integrity verified');
    console.log(`   - Resolution method: ${storedResolution.resolutionMethod}`);
    console.log(`   - Resolution time: ${storedResolution.resolutionTimeMs}ms`);
    console.log(`   - Created at: ${storedResolution.createdAt.toISOString()}\n`);

    console.log('=== ✅ All Tests Passed! ===\n');

    // Cleanup (optional - comment out to inspect data)
    console.log('Cleaning up test data...');
    await prisma.contractResolution.delete({
      where: {
        workspaceId_id: {
          workspaceId: workspace.id,
          id: contractResolution.id,
        },
      },
    });
    await prisma.signalEvent.delete({
      where: {
        workspaceId_id: {
          workspaceId: workspace.id,
          id: signalEvent.id,
        },
      },
    });
    await prisma.contractPack.delete({
      where: {
        workspaceId_id: {
          workspaceId: workspace.id,
          id: contractPack.id,
        },
      },
    });
    console.log('✅ Cleanup complete\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testContractResolution().catch(console.error);

