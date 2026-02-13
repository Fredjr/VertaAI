// Script to create a test workspace for end-to-end testing
// Usage: npx tsx scripts/create-test-workspace.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createTestWorkspace() {
  const timestamp = Date.now();
  const workspace = await prisma.workspace.create({
    data: {
      name: `E2E Test Workspace ${timestamp}`,
      slug: `e2e-test-${timestamp}`,
      ownerEmail: 'fredericle77@gmail.com',
      
      // Ownership config
      ownershipSourceRanking: ['pagerduty', 'codeowners', 'manual'],
      defaultOwnerType: 'slack_channel',
      defaultOwnerRef: '#engineering',
      
      // Notification policy
      highConfidenceThreshold: 0.98,
      mediumConfidenceThreshold: 0.40,
      digestChannel: '#drift-digest',
      
      // Doc resolution policy
      primaryDocRequired: false,
      allowPrLinkOverride: true,
      allowSearchSuggestMapping: false,

      // Workflow preferences with feature flags and drift types
      workflowPreferences: {
        // Feature flags - ENABLE ALL PHASE 1-5 FEATURES
        featureFlags: {
          ENABLE_TYPED_DELTAS: true,
          ENABLE_EVIDENCE_TO_LLM: true,
          ENABLE_MATERIALITY_GATE: true,
          ENABLE_CONTEXT_EXPANSION: true,
          ENABLE_TEMPORAL_ACCUMULATION: true,
        },
        // Drift type preferences
        enabledDriftTypes: ['instruction', 'process', 'ownership', 'environment_tooling'],
        // Input sources
        enabledInputSources: ['github_pr', 'pagerduty_incident', 'datadog_alert'],
        // Output targets
        enabledOutputTargets: ['confluence', 'github_readme'],
        outputTargetPriority: ['confluence', 'github_readme'],
      },
      
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  
  console.log('\n✅ Test Workspace Created Successfully!\n');
  console.log('Workspace Details:');
  console.log('==================');
  console.log(`ID:   ${workspace.id}`);
  console.log(`Name: ${workspace.name}`);
  console.log(`Slug: ${workspace.slug}`);
  console.log(`Owner: ${workspace.ownerEmail}`);
  console.log('\nWorkflow Preferences:');
  console.log('====================');
  console.log(JSON.stringify(workspace.workflowPreferences, null, 2));
  console.log('\n📋 Next Steps:');
  console.log('1. Copy the Workspace ID above');
  console.log('2. Create a DriftPlan with this workspace ID');
  console.log('3. Create a test PR to trigger the pipeline\n');
  
  return workspace;
}

createTestWorkspace()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error creating test workspace:', error);
    process.exit(1);
  });

