import { prisma } from '../lib/db.js';

async function main() {
  const workspaceId = process.argv[2] || 'demo-workspace';
  
  console.log(`🔍 Checking drift candidates for workspace: ${workspaceId}\n`);
  
  // Get all drift candidates for this workspace
  const drifts = await prisma.driftCandidate.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      signalEvent: true,
    },
  });
  
  if (drifts.length === 0) {
    console.log('❌ No drift candidates found for this workspace');
    return;
  }
  
  console.log(`✅ Found ${drifts.length} drift candidate(s):\n`);
  
  for (const drift of drifts) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Drift ID: ${drift.id}`);
    console.log(`State: ${drift.state}`);
    console.log(`Source: ${drift.sourceType}`);
    console.log(`Repo: ${drift.repo || 'N/A'}`);
    console.log(`Service: ${drift.service || 'N/A'}`);
    console.log(`Created: ${drift.createdAt}`);
    console.log(`Updated: ${drift.updatedAt}`);
    
    if (drift.signalEvent) {
      const extracted = drift.signalEvent.extracted as any;
      console.log(`\nSignal Event:`);
      console.log(`  ID: ${drift.signalEvent.id}`);
      console.log(`  Type: ${drift.signalEvent.type}`);
      console.log(`  PR #${extracted?.prNumber || 'N/A'}: ${extracted?.prTitle || 'N/A'}`);
      console.log(`  Author: ${extracted?.authorLogin || 'N/A'}`);
      console.log(`  Merged: ${extracted?.merged || false}`);
    }
    
    if (drift.lastErrorMessage) {
      console.log(`\n❌ Error: ${drift.lastErrorMessage}`);
      console.log(`   Code: ${drift.lastErrorCode || 'N/A'}`);
      console.log(`   Retry Count: ${drift.retryCount}`);
    }
    
    console.log('');
  }
  
  // Get state distribution
  const stateDistribution = await prisma.driftCandidate.groupBy({
    by: ['state'],
    where: { workspaceId },
    _count: true,
  });
  
  console.log(`\n📊 State Distribution:`);
  for (const { state, _count } of stateDistribution) {
    console.log(`   ${state}: ${_count}`);
  }
  
  await prisma.$disconnect();
}

main();

