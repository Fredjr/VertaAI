// Script to create a test DriftPlan for end-to-end testing
// Usage: npx tsx scripts/create-test-plan.ts <workspaceId>

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createTestPlan(workspaceId: string) {
  // Verify workspace exists
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });
  
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }
  
  console.log(`\n✅ Found workspace: ${workspace.name}\n`);
  
  // Create DriftPlan
  const plan = await prisma.driftPlan.create({
    data: {
      workspaceId,
      name: 'E2E Test Plan - Phase 1-5 Validation',
      description: 'End-to-end test plan to validate all Phase 1-5 features with Confluence and README targets',

      // Scope - workspace level
      scopeType: 'workspace',
      scopeRef: null,

      // Primary doc target - Confluence
      primaryDocId: 'https://frederic-le.atlassian.net/wiki/spaces/SD/pages/164013/Template+-+Decision+documentation',
      primaryDocSystem: 'confluence',
      docClass: 'decision_doc',

      // Input sources
      inputSources: ['github_pr'],

      // Drift types - all 4 types enabled
      driftTypes: ['instruction', 'process', 'ownership', 'environment_tooling'],

      // Allowed outputs - Confluence and GitHub README
      allowedOutputs: ['confluence', 'github_readme'],

      // Thresholds
      thresholds: {
        autoApprove: 0.98,
        slackNotify: 0.40,
        digestOnly: 0.30,
        ignore: 0.20,
      },

      // Eligibility rules
      eligibility: {
        requiresIncident: false,
        minSeverity: null,
        repos: ['Fredjr/VertaAI'],
      },

      // Doc targeting strategy
      docTargeting: {
        strategy: 'all_parallel',
        maxDocsPerDrift: 2,
        priorityOrder: ['confluence', 'github_readme'],
      },

      // Writeback config
      writeback: {
        enabled: true,
        requiresApproval: false,
      },

      // Version hash (simple hash for now)
      versionHash: `v1-${Date.now()}`,

      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  
  console.log('✅ Test DriftPlan Created Successfully!\n');
  console.log('Plan Details:');
  console.log('=============');
  console.log(`ID:   ${plan.id}`);
  console.log(`Name: ${plan.name}`);
  console.log(`Status: ${plan.status}`);
  console.log(`Scope: ${plan.scopeType}`);
  console.log('\nPrimary Doc:');
  console.log(`  System: ${plan.primaryDocSystem}`);
  console.log(`  ID: ${plan.primaryDocId}`);
  console.log('\nInput Sources:', plan.inputSources);
  console.log('Allowed Outputs:', plan.allowedOutputs);
  console.log('Drift Types:', plan.driftTypes);
  console.log('\nDoc Targeting:');
  console.log(JSON.stringify(plan.docTargeting, null, 2));
  console.log('\n📋 Next Steps:');
  console.log('1. Create a test PR with significant changes');
  console.log('2. Trigger the webhook to process the PR');
  console.log('3. Monitor the pipeline execution\n');
  
  return plan;
}

const workspaceId = process.argv[2];
if (!workspaceId) {
  console.error('Usage: npx tsx scripts/create-test-plan.ts <workspaceId>');
  process.exit(1);
}

createTestPlan(workspaceId)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error creating test plan:', error);
    process.exit(1);
  });

