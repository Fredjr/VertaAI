/**
 * Check PR #14 processing results
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Checking PR #14 Processing ===\n');

  // Find drift candidates for PR #14
  const drifts = await prisma.driftCandidate.findMany({
    where: {
      signalEvent: {
        path: ['rawPayload', 'pull_request', 'number'],
        equals: 14,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  if (drifts.length === 0) {
    console.log('❌ No drift candidates found for PR #14');
    console.log('\nPossible reasons:');
    console.log('1. Webhook not received yet');
    console.log('2. QStash delay not elapsed (180s)');
    console.log('3. Processing failed');
    return;
  }

  console.log(`✅ Found ${drifts.length} drift candidate(s) for PR #14\n`);

  for (const drift of drifts) {
    console.log(`--- Drift ID: ${drift.id} ---`);
    console.log(`State: ${drift.state}`);
    console.log(`Source Type: ${drift.sourceType}`);
    console.log(`Drift Type: ${drift.driftType || 'NOT SET'}`);
    console.log(`Classification Method: ${drift.classificationMethod || 'NOT SET'}`);
    console.log(`Confidence: ${drift.confidence || 'NOT SET'}`);
    console.log(`Created: ${drift.createdAt}`);
    console.log(`Updated: ${drift.updatedAt}`);

    // Check if comparison was run
    if (drift.comparisonResult) {
      const comparison = drift.comparisonResult as any;
      console.log('\n📊 Comparison Result:');
      console.log(`  Drift Type: ${comparison.driftType}`);
      console.log(`  Confidence: ${comparison.confidence?.toFixed(2)}`);
      console.log(`  Has Drift: ${comparison.hasDrift}`);
      console.log(`  Has Coverage Gap: ${comparison.hasCoverageGap}`);
      console.log(`  Conflicts: ${comparison.conflicts?.length || 0}`);
      console.log(`  New Content: ${comparison.newContent?.length || 0}`);
      console.log(`  Coverage Gaps: ${comparison.coverageGaps?.length || 0}`);
    }

    // Check doc resolution
    if (drift.docCandidates) {
      const docs = drift.docCandidates as any;
      console.log(`\n📄 Doc Candidates: ${docs.length}`);
      for (const doc of docs.slice(0, 3)) {
        console.log(`  - ${doc.doc_title} (${doc.system})`);
      }
    }

    // Check routing decision
    if (drift.routingDecision) {
      console.log(`\n🎯 Routing Decision: ${drift.routingDecision}`);
    }

    // Check Slack notification
    if (drift.slackMessageTs) {
      console.log(`\n✅ Slack notification sent: ${drift.slackMessageTs}`);
    }

    console.log('\n');
  }

  // Check for any errors
  const failedDrifts = drifts.filter(d => 
    d.state === 'FAILED' || 
    d.state === 'FAILED_NEEDS_MAPPING' ||
    d.state === 'FAILED_PATCH_GENERATION'
  );

  if (failedDrifts.length > 0) {
    console.log(`⚠️  ${failedDrifts.length} drift(s) failed`);
    for (const drift of failedDrifts) {
      console.log(`  - ${drift.id}: ${drift.state}`);
    }
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Total Drifts: ${drifts.length}`);
  console.log(`States: ${drifts.map(d => d.state).join(', ')}`);
  console.log(`Classification Methods: ${drifts.map(d => d.classificationMethod || 'NONE').join(', ')}`);
  console.log(`Routing Decisions: ${drifts.map(d => d.routingDecision || 'NONE').join(', ')}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

