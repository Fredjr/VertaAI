#!/usr/bin/env tsx
/**
 * E2E Testing Matrix Runner
 * 
 * Systematically tests all input source × output target combinations
 * from the architecture diagram.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const WORKSPACE_ID = '63d61996-28c2-4050-a020-ebd784aa4076';
const API_URL = process.env.API_URL || 'https://vertaai-api-production.up.railway.app';

interface TestCase {
  sourceType: string;
  outputTarget: string;
  driftType: string;
  signalData: any;
  expectedStates: string[];
  description: string;
}

// Define all test cases based on SOURCE_OUTPUT_COMPATIBILITY matrix
const TEST_CASES: TestCase[] = [
  // ===== GitHub PR (6 output targets) =====
  {
    sourceType: 'github_pr',
    outputTarget: 'github_readme',
    driftType: 'instruction',
    description: 'GitHub PR with API changes → README documentation update',
    signalData: {
      title: 'Add OAuth2 authentication',
      body: 'Implements OAuth2 with PKCE flow. Breaking change: JWT tokens deprecated.',
      merged: true,
      authorLogin: 'Fredjr',
      additions: 150,
      deletions: 20,
      changedFiles: [{ filename: 'src/auth/oauth.ts' }],
      totalChanges: 170,
      labels: ['breaking-change', 'api'],
    },
    expectedStates: ['AWAITING_HUMAN', 'COMPLETED'],
  },
  {
    sourceType: 'github_pr',
    outputTarget: 'github_swagger',
    driftType: 'instruction',
    description: 'GitHub PR with API endpoint changes → OpenAPI spec update',
    signalData: {
      title: 'Add /api/v2/users endpoint',
      body: 'New REST endpoint for user management with pagination',
      merged: true,
      authorLogin: 'Fredjr',
      additions: 200,
      deletions: 10,
      changedFiles: [{ filename: 'src/routes/users.ts' }],
      totalChanges: 210,
      labels: ['api', 'enhancement'],
    },
    expectedStates: ['AWAITING_HUMAN', 'COMPLETED'],
  },
  {
    sourceType: 'github_pr',
    outputTarget: 'github_code_comments',
    driftType: 'instruction',
    description: 'GitHub PR with function signature changes → JSDoc update',
    signalData: {
      title: 'Refactor authentication helper',
      body: 'Changed validateToken() to accept options object instead of individual params',
      merged: true,
      authorLogin: 'Fredjr',
      additions: 80,
      deletions: 60,
      changedFiles: [{ filename: 'src/utils/auth.ts' }],
      totalChanges: 140,
      labels: ['refactor'],
    },
    expectedStates: ['AWAITING_HUMAN', 'COMPLETED'],
  },
  {
    sourceType: 'github_pr',
    outputTarget: 'confluence',
    driftType: 'process',
    description: 'GitHub PR with deployment changes → Confluence runbook update',
    signalData: {
      title: 'Update deployment process',
      body: 'Switched from manual deploys to GitHub Actions. New workflow requires approval.',
      merged: true,
      authorLogin: 'Fredjr',
      additions: 120,
      deletions: 80,
      changedFiles: [{ filename: '.github/workflows/deploy.yml' }],
      totalChanges: 200,
      labels: ['deployment', 'process'],
    },
    expectedStates: ['AWAITING_HUMAN', 'COMPLETED'],
  },
  {
    sourceType: 'github_pr',
    outputTarget: 'gitbook',
    driftType: 'process',
    description: 'GitHub PR with process changes → GitBook guide update',
    signalData: {
      title: 'Update contribution guidelines',
      body: 'New PR template and review process. All PRs require 2 approvals.',
      merged: true,
      authorLogin: 'Fredjr',
      additions: 90,
      deletions: 30,
      changedFiles: [{ filename: '.github/PULL_REQUEST_TEMPLATE.md' }],
      totalChanges: 120,
      labels: ['process', 'documentation'],
    },
    expectedStates: ['AWAITING_HUMAN', 'COMPLETED'],
  },
  {
    sourceType: 'github_pr',
    outputTarget: 'backstage',
    driftType: 'ownership',
    description: 'GitHub PR with team changes → Backstage catalog update',
    signalData: {
      title: 'Update service ownership',
      body: 'API service now owned by Platform team. Updated on-call rotation.',
      merged: true,
      authorLogin: 'Fredjr',
      additions: 50,
      deletions: 20,
      changedFiles: [{ filename: 'CODEOWNERS' }],
      totalChanges: 70,
      labels: ['ownership'],
    },
    expectedStates: ['AWAITING_HUMAN', 'COMPLETED'],
  },

  // ===== PagerDuty Incident (4 output targets) =====
  {
    sourceType: 'pagerduty_incident',
    outputTarget: 'confluence',
    driftType: 'process',
    description: 'PagerDuty P1 incident → Confluence runbook update',
    signalData: {
      status: 'resolved',
      priority: 'P1',
      service: 'api-production',
      durationMinutes: 45,
      hasNotes: true,
      title: 'Database connection pool exhausted',
      description: 'Resolved by increasing max_connections from 100 to 200',
      tags: ['database', 'performance'],
    },
    expectedStates: ['AWAITING_HUMAN', 'COMPLETED'],
  },
  {
    sourceType: 'pagerduty_incident',
    outputTarget: 'backstage',
    driftType: 'ownership',
    description: 'PagerDuty incident → Backstage on-call info update',
    signalData: {
      status: 'resolved',
      priority: 'P2',
      service: 'api-production',
      durationMinutes: 30,
      hasNotes: true,
      title: 'Service degradation during deploy',
      description: 'Need to update on-call escalation policy',
      tags: ['on-call'],
    },
    expectedStates: ['AWAITING_HUMAN', 'COMPLETED'],
  },

  // ===== Slack Cluster (4 output targets) =====
  {
    sourceType: 'slack_cluster',
    outputTarget: 'confluence',
    driftType: 'coverage',
    description: 'Slack repeated questions → Confluence FAQ update',
    signalData: {
      clusterSize: 8,
      uniqueAskers: 5,
      oldestQuestionHoursAgo: 48,
      channel: '#engineering',
      commonQuestion: 'How do I reset my local database?',
      answers: ['Run npm run db:reset', 'Use docker-compose down -v'],
    },
    expectedStates: ['AWAITING_HUMAN', 'COMPLETED'],
  },
];

async function runTest(testCase: TestCase): Promise<{ success: boolean; error?: string; result?: any }> {
  try {
    console.log(`\n🧪 Testing: ${testCase.description}`);
    console.log(`   Source: ${testCase.sourceType} → Target: ${testCase.outputTarget}`);

    // Create signal event
    const signalId = `${testCase.sourceType}_test_${Date.now()}`;
    await prisma.signalEvent.create({
      data: {
        workspaceId: WORKSPACE_ID,
        id: signalId,
        sourceType: testCase.sourceType as any,
        repo: 'Fredjr/VertaAI',
        service: 'api',
        occurredAt: new Date(),
        extracted: testCase.signalData,
        rawPayload: { test: true },
      },
    });

    // Create drift candidate
    const drift = await prisma.driftCandidate.create({
      data: {
        workspaceId: WORKSPACE_ID,
        signalEventId: signalId,
        sourceType: testCase.sourceType as any,
        repo: 'Fredjr/VertaAI',
        service: 'api',
        state: 'INGESTED',
      },
    });

    console.log(`   Created drift: ${drift.id}`);

    // Run state machine
    const response = await fetch(`${API_URL}/api/test/run-state-machine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: WORKSPACE_ID,
        driftId: drift.id,
        maxIterations: 30,
      }),
    });

    const result = await response.json();
    
    console.log(`   Result: ${result.state} (${result.iterations} iterations)`);
    console.log(`   States: ${result.stateLog?.join(' → ')}`);

    const success = testCase.expectedStates.includes(result.state);
    
    if (success) {
      console.log(`   ✅ PASS`);
    } else {
      console.log(`   ❌ FAIL - Expected ${testCase.expectedStates.join(' or ')}, got ${result.state}`);
    }

    return { success, result };
  } catch (error: any) {
    console.log(`   ❌ ERROR: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function checkPrerequisites(): Promise<{ ready: boolean; missing: string[] }> {
  const missing: string[] = [];

  // Check integrations
  const integrations = await prisma.integration.findMany({
    where: { workspaceId: WORKSPACE_ID },
  });

  const hasGitHub = integrations.some(i => i.type === 'github' && i.status === 'connected');
  const hasConfluence = integrations.some(i => i.type === 'confluence' && i.status === 'connected');
  const hasSlack = integrations.some(i => i.type === 'slack' && i.status === 'connected');

  if (!hasGitHub) missing.push('GitHub integration');
  if (!hasConfluence) missing.push('Confluence integration');
  if (!hasSlack) missing.push('Slack integration');

  // Check doc mappings
  const docMappings = await prisma.docMappingV2.findMany({
    where: { workspaceId: WORKSPACE_ID },
  });

  console.log(`\n📋 Prerequisites Check:`);
  console.log(`   Integrations: ${integrations.length} (GitHub: ${hasGitHub}, Confluence: ${hasConfluence}, Slack: ${hasSlack})`);
  console.log(`   Doc Mappings: ${docMappings.length}`);
  docMappings.forEach(dm => {
    console.log(`     - ${dm.docSystem}: ${dm.docTitle}`);
  });

  return { ready: missing.length === 0, missing };
}

async function main() {
  console.log('🚀 Starting E2E Testing Matrix');
  console.log(`   Workspace: ${WORKSPACE_ID}`);
  console.log(`   API: ${API_URL}`);
  console.log(`   Total test cases: ${TEST_CASES.length}\n`);

  // Check prerequisites
  const prereqs = await checkPrerequisites();
  if (!prereqs.ready) {
    console.log(`\n⚠️  Missing prerequisites: ${prereqs.missing.join(', ')}`);
    console.log(`   Some tests may fail due to missing integrations.\n`);
  }

  const results = [];

  for (const testCase of TEST_CASES) {
    const result = await runTest(testCase);
    results.push({ testCase, ...result });

    // Wait between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Summary
  console.log('\n\n📊 Test Summary');
  console.log('='.repeat(80));

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`✅ Passed: ${passed}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.testCase.description}`);
      if (r.error) console.log(`    Error: ${r.error}`);
    });
  }

  // Detailed results by source type
  console.log('\n\n📈 Results by Input Source:');
  const bySource = results.reduce((acc, r) => {
    const source = r.testCase.sourceType;
    if (!acc[source]) acc[source] = { passed: 0, failed: 0 };
    if (r.success) acc[source].passed++;
    else acc[source].failed++;
    return acc;
  }, {} as Record<string, { passed: number; failed: number }>);

  Object.entries(bySource).forEach(([source, stats]) => {
    console.log(`   ${source}: ${stats.passed}/${stats.passed + stats.failed} passed`);
  });

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);

