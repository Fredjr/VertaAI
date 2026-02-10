/**
 * Check if PR #13 was processed and PlanRun was created
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Checking PR #13 processing...\n');

  // Check for SignalEvent for PR #13
  const signalEvents = await prisma.signalEvent.findMany({
    where: {
      workspaceId: '63e8e9d1-c09d-4dd0-a921-6e54df1724ac',
      sourceType: 'github_pr',
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 5,
    select: {
      id: true,
      createdAt: true,
      sourceType: true,
      extracted: true,
    },
  });

  console.log('📨 Recent SignalEvents:');
  for (const event of signalEvents) {
    const extracted = event.extracted as any;
    console.log({
      id: event.id,
      createdAt: event.createdAt,
      prNumber: extracted?.prNumber,
      prTitle: extracted?.prTitle,
      merged: extracted?.merged,
    });
  }

  // Find the most recent drift candidate
  const recentDrifts = await prisma.driftCandidate.findMany({
    where: {
      workspaceId: '63e8e9d1-c09d-4dd0-a921-6e54df1724ac',
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 5,
    select: {
      id: true,
      createdAt: true,
      state: true,
      confidence: true,
      sourceThreshold: true,
      activePlanId: true,
      activePlanVersion: true,
      activePlanHash: true,
      repo: true,
      service: true,
    },
  });

  console.log('📋 Recent Drift Candidates:');
  console.log(JSON.stringify(recentDrifts, null, 2));

  // Check for PlanRun records
  const planRuns = await prisma.planRun.findMany({
    where: {
      workspaceId: '63e8e9d1-c09d-4dd0-a921-6e54df1724ac',
    },
    orderBy: {
      executedAt: 'desc',
    },
    take: 5,
  });

  console.log('\n📊 Recent PlanRun Records:');
  console.log(JSON.stringify(planRuns, null, 2));

  // Check workspace thresholds
  const workspace = await prisma.workspace.findUnique({
    where: {
      id: '63e8e9d1-c09d-4dd0-a921-6e54df1724ac',
    },
    select: {
      highConfidenceThreshold: true,
      mediumConfidenceThreshold: true,
    },
  });

  console.log('\n⚙️ Workspace Thresholds:');
  console.log(JSON.stringify(workspace, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

