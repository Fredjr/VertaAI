/**
 * Simulate PR Webhook
 * Simulates a GitHub PR webhook to test contract resolution
 */

import { prisma } from '../src/lib/db.js';
import { ContractResolver } from '../src/services/contracts/contractResolver.js';
import type { Contract } from '../src/services/contracts/types.js';
import {
  calculateResolutionMetrics,
  logResolutionMetrics,
  logResolutionDetails,
} from '../src/services/contracts/telemetry.js';

async function simulatePRWebhook() {
  console.log('=== Simulating PR Webhook ===\n');

  try {
    // Find the test workspace
    const workspace = await prisma.workspace.findFirst({
      where: { slug: 'test-contract-workspace' }
    });

    if (!workspace) {
      throw new Error('Test workspace not found. Run setup-test-contract-pack.ts first.');
    }

    console.log(`✅ Using workspace: ${workspace.name} (${workspace.id})\n`);

    // Load contract pack
    const contractPack = await prisma.contractPack.findFirst({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: 'desc' }
    });

    if (!contractPack) {
      throw new Error('No contract pack found. Run setup-test-contract-pack.ts first.');
    }

    console.log(`✅ Loaded ContractPack: ${contractPack.name} (${contractPack.id})\n`);

    // Simulate different PR scenarios
    const scenarios = [
      {
        name: 'API Change PR',
        changedFiles: ['openapi.yaml', 'README.md', 'src/routes/api.ts'],
        service: 'api',
        repo: 'VertaAI',
      },
      {
        name: 'Infrastructure Change PR',
        changedFiles: ['terraform/main.tf', 'terraform/variables.tf', 'docs/infrastructure.md'],
        service: 'infrastructure',
        repo: 'VertaAI',
      },
      {
        name: 'Mixed Change PR',
        changedFiles: ['openapi.yaml', 'terraform/main.tf', 'README.md'],
        service: 'api',
        repo: 'VertaAI',
      },
      {
        name: 'Unmatched Files PR',
        changedFiles: ['src/utils/helper.ts', 'package.json'],
        service: 'api',
        repo: 'VertaAI',
      },
    ];

    for (const scenario of scenarios) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`Scenario: ${scenario.name}`);
      console.log(`${'='.repeat(70)}\n`);

      // Create SignalEvent
      const { randomUUID } = await import('crypto');
      const signalEvent = await prisma.signalEvent.create({
        data: {
          workspaceId: workspace.id,
          id: randomUUID(),
          sourceType: 'github_pr',
          occurredAt: new Date(),
          repo: scenario.repo,
          service: scenario.service,
          extracted: {
            prNumber: Math.floor(Math.random() * 1000),
            prTitle: `Test PR: ${scenario.name}`,
            changedFiles: scenario.changedFiles,
            service: scenario.service,
            repo: scenario.repo,
          },
          rawPayload: {},
        },
      });

      console.log(`✅ Created SignalEvent: ${signalEvent.id}`);
      console.log(`   Changed files: ${scenario.changedFiles.join(', ')}\n`);

      // Run contract resolution
      const contracts = contractPack.contracts as unknown as Contract[];
      const resolver = new ContractResolver(workspace.id, contracts);
      
      const startTime = Date.now();
      const result = await resolver.resolveFromSignal(signalEvent);
      const resolutionTimeMs = Date.now() - startTime;

      // Calculate and log metrics
      const metrics = calculateResolutionMetrics(
        workspace.id,
        signalEvent.id,
        result,
        resolutionTimeMs,
        scenario.changedFiles.length
      );

      console.log('📊 Metrics:');
      console.log(`   - Resolution time: ${metrics.resolutionTimeMs}ms`);
      console.log(`   - Contracts resolved: ${metrics.contractsResolved}`);
      console.log(`   - Unresolved artifacts: ${metrics.unresolvedArtifacts}`);
      console.log(`   - Obligations: ${metrics.obligations}`);
      console.log(`   - Coverage rate: ${metrics.coverageRate.toFixed(1)}%`);
      console.log(`   - Confidence: ${metrics.confidenceDistribution.high} high, ${metrics.confidenceDistribution.medium} medium, ${metrics.confidenceDistribution.low} low\n`);

      // Log detailed results
      logResolutionDetails(result, true);

      // Store contract resolution
      await prisma.contractResolution.create({
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

      console.log(`\n✅ ContractResolution stored in database\n`);
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log('=== ✅ All Scenarios Complete! ===');
    console.log(`${'='.repeat(70)}\n`);

    // Summary
    const totalResolutions = await prisma.contractResolution.count({
      where: { workspaceId: workspace.id }
    });

    console.log(`📊 Summary:`);
    console.log(`   - Total contract resolutions: ${totalResolutions}`);
    console.log(`   - Scenarios tested: ${scenarios.length}\n`);

  } catch (error) {
    console.error('❌ Simulation failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

simulatePRWebhook().catch(console.error);

