/**
 * Check PR #16 drift detection results (detailed)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPR16Detailed() {
  console.log('\n=== Checking PR #16 Drift Detection Results (Detailed) ===\n');

  // Find signal events for PR #16
  const signals = await prisma.signalEvent.findMany({
    where: {
      sourceType: 'github_pr',
      extracted: {
        path: ['prNumber'],
        equals: 16
      }
    },
    include: {
      driftCandidates: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });

  if (signals.length === 0) {
    console.log('❌ No signal events found for PR #16');
    return;
  }

  const signal = signals[0];
  const drift = signal.driftCandidates[0];

  if (!drift) {
    console.log('❌ No drift candidate found for PR #16');
    return;
  }

  console.log(`✅ Found drift candidate for PR #16:\n`);
  console.log(`Drift ID: ${drift.id}`);
  console.log(`State: ${drift.state}`);
  console.log(`State Updated At: ${drift.stateUpdatedAt}`);
  console.log(`Classification Method: ${drift.classificationMethod || 'NOT SET'}`);
  console.log(`Drift Type: ${drift.driftType || 'NOT SET'}`);
  console.log(`Confidence: ${drift.confidence || 'NOT SET'}`);
  console.log(`\nLast Error Code: ${drift.lastErrorCode || 'NONE'}`);
  console.log(`Last Error Message: ${drift.lastErrorMessage || 'NONE'}`);
  console.log(`Retry Count: ${drift.retryCount}`);

  // Check comparison result
  if (drift.comparisonResult) {
    console.log('\n📊 Comparison Result:');
    const result = drift.comparisonResult as any;
    console.log(JSON.stringify(result, null, 2));
  }

  // Check evidence bundle
  if (drift.evidenceBundle) {
    console.log('\n📦 Evidence Bundle:');
    const bundle = drift.evidenceBundle as any;
    console.log(`  - Source Type: ${bundle.sourceType || 'N/A'}`);
    console.log(`  - Has Artifacts: ${!!bundle.artifacts}`);
  }

  // Check doc resolution
  if (drift.docsResolution) {
    console.log('\n📄 Docs Resolution:');
    const resolution = drift.docsResolution as any;
    console.log(`  - Status: ${resolution.status || 'N/A'}`);
    console.log(`  - Method: ${resolution.method || 'N/A'}`);
    console.log(`  - Candidates: ${resolution.candidates?.length || 0}`);
  }

  // Check owner resolution
  if (drift.ownerResolution) {
    console.log('\n👤 Owner Resolution:');
    const owner = drift.ownerResolution as any;
    console.log(JSON.stringify(owner, null, 2));
  }

  // Check patch proposals
  const patches = await prisma.patchProposal.findMany({
    where: {
      workspaceId: drift.workspaceId,
      driftId: drift.id,
    },
  });

  if (patches.length > 0) {
    console.log(`\n📝 Patch Proposals: ${patches.length}`);
    for (const patch of patches) {
      console.log(`  - Patch ID: ${patch.id}`);
      console.log(`    Status: ${patch.status}`);
      console.log(`    Last Notified: ${patch.lastNotifiedAt || 'NEVER'}`);
      console.log(`    Slack Message TS: ${patch.slackMessageTs || 'NONE'}`);
    }
  } else {
    console.log('\n📝 Patch Proposals: NONE');
  }

  await prisma.$disconnect();
}

checkPR16Detailed().catch(console.error);

