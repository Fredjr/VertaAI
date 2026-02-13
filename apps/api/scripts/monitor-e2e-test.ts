// Script to monitor E2E test execution and verify Phase 1-5 features
// Usage: npx tsx scripts/monitor-e2e-test.ts <workspaceId>

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function monitorE2ETest(workspaceId: string) {
  console.log('\n🔍 E2E Test Monitoring Dashboard\n');
  console.log('='.repeat(80));
  console.log(`Workspace ID: ${workspaceId}\n`);
  
  // 1. Check SignalEvents
  console.log('📡 Signal Events:');
  console.log('-'.repeat(80));
  const signalEvents = await prisma.signalEvent.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  
  if (signalEvents.length === 0) {
    console.log('❌ No signal events found. Webhook may not have triggered.\n');
  } else {
    signalEvents.forEach((event, i) => {
      console.log(`${i + 1}. ${event.sourceType} - ${event.id}`);
      console.log(`   Created: ${event.createdAt}`);
      console.log(`   Repo: ${event.repo || 'N/A'}`);
    });
    console.log('');
  }
  
  // 2. Check DriftCandidates
  console.log('🎯 Drift Candidates:');
  console.log('-'.repeat(80));
  const driftCandidates = await prisma.driftCandidate.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  
  if (driftCandidates.length === 0) {
    console.log('❌ No drift candidates found. Pipeline may not have executed.\n');
  } else {
    for (const drift of driftCandidates) {
      console.log(`\nDrift ID: ${drift.id}`);
      console.log(`State: ${drift.state}`);
      console.log(`Created: ${drift.createdAt}`);
      console.log(`Drift Type: ${drift.driftType || 'N/A'}`);
      console.log(`Confidence: ${drift.confidence || 'N/A'}`);
      
      // Phase 1: Check Typed Deltas
      const comparisonResult = drift.comparisonResult as any;
      if (comparisonResult?.typedDeltas) {
        console.log(`\n✅ Phase 1 - Typed Deltas: ${comparisonResult.typedDeltas.length} deltas found`);
        console.log('   Sample deltas:');
        comparisonResult.typedDeltas.slice(0, 3).forEach((delta: any) => {
          console.log(`   - ${delta.artifactType}: ${delta.action} (confidence: ${delta.confidence})`);
        });
      } else {
        console.log('\n❌ Phase 1 - Typed Deltas: NOT FOUND');
      }
      
      // Phase 3: Check Materiality Score
      if (comparisonResult?.materialityScore !== undefined) {
        console.log(`\n✅ Phase 3 - Materiality Score: ${comparisonResult.materialityScore.toFixed(3)}`);
        console.log(`   Should Patch: ${comparisonResult.shouldPatch ? 'YES' : 'NO'}`);
        if (comparisonResult.materialityFactors) {
          console.log(`   Impact Band: ${comparisonResult.materialityFactors.impactBandScore}`);
          console.log(`   Delta Count: ${comparisonResult.materialityFactors.deltaCountScore}`);
        }
      } else {
        console.log('\n❌ Phase 3 - Materiality Score: NOT FOUND');
      }
      
      // Phase 4: Check Expanded Context
      const evidenceBundle = drift.evidenceBundle as any;
      if (evidenceBundle?.expandedContext) {
        console.log(`\n✅ Phase 4 - Expanded Context: ${evidenceBundle.expandedContext.length} files fetched`);
        evidenceBundle.expandedContext.forEach((file: any) => {
          console.log(`   - ${file.path} (${file.content?.length || 0} chars)`);
        });
      } else {
        console.log('\n❌ Phase 4 - Expanded Context: NOT FOUND');
      }
      
      // Phase 2: Check Evidence Contract (in logs or state)
      if (drift.state === 'PATCH_GENERATED' || drift.state === 'PATCH_VALIDATED') {
        console.log('\n✅ Phase 2 - Evidence Contract: Likely passed to LLM (patch generated)');
      }
    }
    console.log('');
  }
  
  // 3. Check Drift Histories (Phase 5)
  console.log('📈 Drift Histories (Phase 5 - Temporal Accumulation):');
  console.log('-'.repeat(80));
  const driftHistories = await prisma.driftHistory.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  
  if (driftHistories.length === 0) {
    console.log('❌ No drift histories found. Temporal accumulation may not be enabled.\n');
  } else {
    driftHistories.forEach((history, i) => {
      console.log(`${i + 1}. Doc: ${history.docSystem}/${history.docId}`);
      console.log(`   Status: ${history.status}`);
      console.log(`   Drift Count: ${history.driftCount}`);
      console.log(`   Total Materiality: ${history.totalMateriality}`);
      console.log(`   Window: ${history.windowStart} - ${history.windowEnd}`);
      console.log(`   Accumulated Drifts: ${(history.accumulatedDriftIds as string[]).length}`);
      console.log('');
    });
  }
  
  // 4. Check Patch Proposals
  console.log('📝 Patch Proposals:');
  console.log('-'.repeat(80));
  const patchProposals = await prisma.patchProposal.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  
  if (patchProposals.length === 0) {
    console.log('⚠️  No patch proposals found yet. May still be processing.\n');
  } else {
    patchProposals.forEach((patch, i) => {
      console.log(`${i + 1}. ${patch.docSystem} - ${patch.docId}`);
      console.log(`   Status: ${patch.status}`);
      console.log(`   Created: ${patch.createdAt}`);
      console.log('');
    });
  }
  
  // Summary
  console.log('='.repeat(80));
  console.log('\n📊 Summary:\n');
  console.log(`Signal Events: ${signalEvents.length}`);
  console.log(`Drift Candidates: ${driftCandidates.length}`);
  console.log(`Drift Histories: ${driftHistories.length}`);
  console.log(`Patch Proposals: ${patchProposals.length}`);
  console.log('\n');
}

const workspaceId = process.argv[2];
if (!workspaceId) {
  console.error('Usage: npx tsx scripts/monitor-e2e-test.ts <workspaceId>');
  process.exit(1);
}

monitorE2ETest(workspaceId)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error monitoring E2E test:', error);
    process.exit(1);
  });

