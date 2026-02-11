/**
 * Check recent signal events
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkRecentSignals() {
  console.log('\n=== Checking Recent Signal Events ===\n');

  const signals = await prisma.signalEvent.findMany({
    where: {
      sourceType: 'github_pr',
    },
    include: {
      driftCandidates: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  console.log(`Found ${signals.length} recent GitHub PR signals:\n`);

  for (const signal of signals) {
    const prNumber = (signal.extracted as any)?.prNumber;
    console.log(`\n- Signal ID: ${signal.id}`);
    console.log(`  PR Number: ${prNumber || 'N/A'}`);
    console.log(`  Created: ${signal.createdAt}`);
    console.log(`  Drift Candidates: ${signal.driftCandidates.length}`);
    
    if (signal.driftCandidates.length > 0) {
      for (const drift of signal.driftCandidates) {
        console.log(`    - Drift ${drift.id}: ${drift.state}`);
        if (drift.lastErrorMessage) {
          console.log(`      Error: ${drift.lastErrorMessage}`);
        }
      }
    }
  }

  await prisma.$disconnect();
}

checkRecentSignals().catch(console.error);

