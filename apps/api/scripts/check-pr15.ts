/**
 * Check PR #16 drift detection results
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPR17() {
  console.log('\n=== Checking PR #17 Drift Detection Results ===\n');

  // Find signal events for PR #17
  const signals = await prisma.signalEvent.findMany({
    where: {
      sourceType: 'github_pr',
      extracted: {
        path: ['prNumber'],
        equals: 17
      }
    },
    include: {
      driftCandidates: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  // Extract drift candidates from signals
  const drifts = signals.flatMap(s => s.driftCandidates);

  if (drifts.length === 0) {
    console.log('❌ No drift candidates found for PR #17');
    console.log('\nLet me check recent drifts instead...\n');

    const recentDrifts = await prisma.driftCandidate.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    console.log(`Found ${recentDrifts.length} recent drifts:`);
    for (const drift of recentDrifts) {
      console.log(`\n- Drift ID: ${drift.id}`);
      console.log(`  State: ${drift.state}`);
      console.log(`  Source: ${drift.sourceType}`);
      console.log(`  Created: ${drift.createdAt}`);
      console.log(`  PR Number: ${drift.prNumber || 'N/A'}`);
      console.log(`  Classification Method: ${drift.classificationMethod || 'N/A'}`);
      console.log(`  Drift Type: ${drift.driftType || 'N/A'}`);
      console.log(`  Confidence: ${drift.confidence || 'N/A'}`);
    }
  } else {
    console.log(`✅ Found ${drifts.length} drift candidate(s) for PR #17:\n`);
    
    for (const drift of drifts) {
      console.log(`\n=== Drift ID: ${drift.id} ===`);
      console.log(`State: ${drift.state}`);
      console.log(`State Updated At: ${drift.stateUpdatedAt}`);
      console.log(`Source Type: ${drift.sourceType}`);
      console.log(`Service: ${drift.service || 'N/A'}`);
      console.log(`Repo: ${drift.repo || 'N/A'}`);
      console.log(`Classification Method: ${drift.classificationMethod || 'NOT SET'}`);
      console.log(`Drift Type: ${drift.driftType || 'NOT SET'}`);
      console.log(`Confidence: ${drift.confidence || 'NOT SET'}`);
      console.log(`Created: ${drift.createdAt}`);

      // Check for noise filtering
      if (drift.lastErrorMessage) {
        console.log(`\n⚠️ Error: ${drift.lastErrorMessage}`);
      }

      // Check doc resolution
      if (drift.docsResolutionStatus) {
        console.log(`\n📄 Docs Resolution:`);
        console.log(`  - Status: ${drift.docsResolutionStatus}`);
        console.log(`  - Method: ${drift.docsResolutionMethod || 'N/A'}`);
        console.log(`  - Confidence: ${drift.docsResolutionConfidence || 'N/A'}`);
      }

      // Check evidence bundle
      if (drift.evidenceBundle) {
        console.log(`\n📦 Evidence Bundle: Present`);
      }

      if (drift.comparisonResult) {
        console.log('\n📊 Comparison Result:');
        const result = drift.comparisonResult as any;
        console.log(`  - Has Drift: ${result.hasDrift}`);
        console.log(`  - Drift Type: ${result.driftType}`);
        console.log(`  - Confidence: ${result.confidence}`);
        console.log(`  - Conflicts: ${result.conflicts?.length || 0}`);
        console.log(`  - New Content: ${result.newContent?.length || 0}`);
        console.log(`  - Coverage Gaps: ${result.coverageGaps?.length || 0}`);
      }

      if (drift.activePlanId) {
        console.log(`\n📋 Active Plan: ${drift.activePlanId} (v${drift.activePlanVersion})`);
      }

      // Check correlated signals
      const correlatedSignals = drift.correlatedSignals as any;
      if (correlatedSignals && Array.isArray(correlatedSignals) && correlatedSignals.length > 0) {
        console.log(`\n🔗 Correlated Signals: ${correlatedSignals.length}`);
      }

      console.log('\n' + '='.repeat(50));
    }
  }

  await prisma.$disconnect();
}

checkPR17().catch(console.error);

