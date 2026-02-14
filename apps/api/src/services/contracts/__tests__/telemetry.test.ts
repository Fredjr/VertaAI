/**
 * Contract Resolution Telemetry Test
 * Phase 1 Week 1-2: Contract Registry & Resolution Engine - Step 5
 */

import {
  calculateResolutionMetrics,
  logResolutionMetrics,
  logResolutionDetails,
} from '../telemetry.js';
import type { ContractResolutionResult } from '../types.js';

async function testTelemetry() {
  console.log('=== Contract Resolution Telemetry Test ===\n');

  // Sample resolution result
  const sampleResult: ContractResolutionResult = {
    resolvedContracts: [
      {
        contractId: 'api-contract-v1',
        resolutionMethod: 'file_pattern',
        confidence: 1.0,
        triggeredBy: { files: ['openapi.yaml', 'README.md'] },
      },
      {
        contractId: 'iac-contract-v1',
        resolutionMethod: 'file_pattern',
        confidence: 0.7,
        triggeredBy: { files: ['terraform/main.tf'] },
      },
      {
        contractId: 'docs-contract-v1',
        resolutionMethod: 'service_tag',
        confidence: 0.8,
        triggeredBy: { service: 'api' },
      },
    ],
    unresolvedArtifacts: [
      {
        file: 'src/routes/api.ts',
        reason: 'no_mapping',
        candidates: [],
      },
    ],
    obligations: [
      {
        type: 'NEEDS_CONTRACT_MAPPING',
        artifact: 'src/routes/api.ts',
        suggestedAction: 'Add contract mapping for src/routes/api.ts',
      },
    ],
  };

  const workspaceId = 'test-workspace-123';
  const signalEventId = 'test-signal-456';
  const resolutionTimeMs = 15;
  const totalChangedFiles = 4;

  console.log('Step 1: Calculate metrics...');
  const metrics = calculateResolutionMetrics(
    workspaceId,
    signalEventId,
    sampleResult,
    resolutionTimeMs,
    totalChangedFiles
  );

  console.log('✅ Metrics calculated\n');

  console.log('Step 2: Verify metrics...');
  console.log(`  - Contracts resolved: ${metrics.contractsResolved} (expected: 3)`);
  console.log(`  - Unresolved artifacts: ${metrics.unresolvedArtifacts} (expected: 1)`);
  console.log(`  - Obligations: ${metrics.obligations} (expected: 1)`);
  console.log(`  - Resolution time: ${metrics.resolutionTimeMs}ms (expected: 15ms)`);
  console.log(`  - Coverage rate: ${metrics.coverageRate.toFixed(1)}% (expected: 75.0%)`);
  console.log(`  - High confidence: ${metrics.confidenceDistribution.high} (expected: 1)`);
  console.log(`  - Medium confidence: ${metrics.confidenceDistribution.medium} (expected: 2)`);
  console.log(`  - Low confidence: ${metrics.confidenceDistribution.low} (expected: 0)`);
  console.log(`  - Resolution methods: ${JSON.stringify(metrics.resolutionMethods)}`);

  // Verify calculations
  const assertions = [
    { name: 'contractsResolved', actual: metrics.contractsResolved, expected: 3 },
    { name: 'unresolvedArtifacts', actual: metrics.unresolvedArtifacts, expected: 1 },
    { name: 'obligations', actual: metrics.obligations, expected: 1 },
    { name: 'resolutionTimeMs', actual: metrics.resolutionTimeMs, expected: 15 },
    { name: 'coverageRate', actual: Math.round(metrics.coverageRate), expected: 75 },
    { name: 'high confidence', actual: metrics.confidenceDistribution.high, expected: 1 },
    { name: 'medium confidence', actual: metrics.confidenceDistribution.medium, expected: 2 },
    { name: 'low confidence', actual: metrics.confidenceDistribution.low, expected: 0 },
  ];

  let allPassed = true;
  assertions.forEach(({ name, actual, expected }) => {
    if (actual !== expected) {
      console.error(`  ❌ ${name}: expected ${expected}, got ${actual}`);
      allPassed = false;
    }
  });

  if (allPassed) {
    console.log('✅ All metrics verified\n');
  } else {
    throw new Error('Metric verification failed');
  }

  console.log('Step 3: Test structured logging...\n');
  console.log('─────────────────────────────────────────────────────────');
  logResolutionMetrics(metrics);
  console.log('─────────────────────────────────────────────────────────\n');

  console.log('Step 4: Test detailed logging...\n');
  console.log('─────────────────────────────────────────────────────────');
  logResolutionDetails(sampleResult, true);
  console.log('─────────────────────────────────────────────────────────\n');

  console.log('=== ✅ All Telemetry Tests Passed! ===\n');
}

// Run the test
testTelemetry().catch(console.error);

