/**
 * Check specific drift candidate for PR #13
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const driftId = '9c2bf20e-293e-4a6d-8fa7-7c0e25771f47';
  const signalEventId = 'github_pr_Fredjr_VertaAI_13';

  console.log('🔍 Checking PR #13 specific drift...\n');

  // Also check for any signal events with PR #13
  const allSignals = await prisma.signalEvent.findMany({
    where: {
      workspaceId: '63e8e9d1-c09d-4dd0-a921-6e54df1724ac',
      sourceType: 'github_pr',
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  });

  console.log('📨 All Recent SignalEvents:');
  for (const event of allSignals) {
    const extracted = event.extracted as any;
    console.log({
      id: event.id,
      createdAt: event.createdAt,
      prNumber: extracted?.prNumber,
      prTitle: extracted?.prTitle?.substring(0, 50),
    });
  }

  // Check SignalEvent
  const signalEvent = await prisma.signalEvent.findUnique({
    where: {
      workspaceId_id: {
        workspaceId: '63e8e9d1-c09d-4dd0-a921-6e54df1724ac',
        id: signalEventId,
      },
    },
  });

  console.log('📨 SignalEvent:');
  console.log(signalEvent ? 'Found ✅' : 'Not Found ❌');
  if (signalEvent) {
    const extracted = signalEvent.extracted as any;
    console.log({
      id: signalEvent.id,
      createdAt: signalEvent.createdAt,
      sourceType: signalEvent.sourceType,
      prNumber: extracted?.prNumber,
      prTitle: extracted?.prTitle,
      merged: extracted?.merged,
    });
  }

  // Check DriftCandidate
  const drift = await prisma.driftCandidate.findUnique({
    where: {
      workspaceId_id: {
        workspaceId: '63e8e9d1-c09d-4dd0-a921-6e54df1724ac',
        id: driftId,
      },
    },
  });

  console.log('\n📋 DriftCandidate:');
  console.log(drift ? 'Found ✅' : 'Not Found ❌');
  if (drift) {
    console.log({
      id: drift.id,
      createdAt: drift.createdAt,
      state: drift.state,
      confidence: drift.confidence,
      sourceThreshold: drift.sourceThreshold,
      activePlanId: drift.activePlanId,
      activePlanVersion: drift.activePlanVersion,
      activePlanHash: drift.activePlanHash,
    });
  }

  // Check PlanRun
  const planRuns = await prisma.planRun.findMany({
    where: {
      workspaceId: '63e8e9d1-c09d-4dd0-a921-6e54df1724ac',
      driftId: driftId,
    },
  });

  console.log('\n📊 PlanRun Records:');
  console.log(planRuns.length > 0 ? `Found ${planRuns.length} ✅` : 'Not Found ❌');
  if (planRuns.length > 0) {
    console.log(JSON.stringify(planRuns, null, 2));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

