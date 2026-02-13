// Script to create GitHub integration for a workspace
// Usage: npx tsx scripts/create-github-integration.ts <workspaceId> <installationId>

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createGitHubIntegration(workspaceId: string, installationId: number) {
  console.log('\n🔧 Creating GitHub Integration\n');
  console.log('='.repeat(80));
  console.log(`Workspace ID: ${workspaceId}`);
  console.log(`Installation ID: ${installationId}\n`);
  
  // Check if workspace exists
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });
  
  if (!workspace) {
    console.error('❌ Workspace not found');
    process.exit(1);
  }
  
  console.log(`✅ Workspace found: ${workspace.name}\n`);
  
  // Check if integration already exists
  const existing = await prisma.integration.findFirst({
    where: {
      workspaceId,
      type: 'github',
    },
  });
  
  if (existing) {
    console.log('⚠️  GitHub integration already exists. Updating...\n');
    
    const updated = await prisma.integration.update({
      where: { id: existing.id },
      data: {
        status: 'connected',
        config: {
          installationId,
          owner: 'Fredjr',
          repo: 'VertaAI',
        },
        webhookSecret: process.env.GH_WEBHOOK_SECRET || null,
      },
    });
    
    console.log('✅ Integration updated:');
    console.log(`   ID: ${updated.id}`);
    console.log(`   Status: ${updated.status}`);
    console.log(`   Config:`, JSON.stringify(updated.config, null, 2));
  } else {
    console.log('Creating new integration...\n');
    
    const integration = await prisma.integration.create({
      data: {
        workspaceId,
        type: 'github',
        status: 'connected',
        config: {
          installationId,
          owner: 'Fredjr',
          repo: 'VertaAI',
        },
        webhookSecret: process.env.GH_WEBHOOK_SECRET || null,
      },
    });
    
    console.log('✅ Integration created:');
    console.log(`   ID: ${integration.id}`);
    console.log(`   Status: ${integration.status}`);
    console.log(`   Config:`, JSON.stringify(integration.config, null, 2));
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n✅ GitHub integration ready!\n');
  console.log('📝 Next steps:');
  console.log('1. Update GitHub webhook URL to: https://vertaai-api-production.up.railway.app/webhooks/github/app');
  console.log('2. Trigger a PR event to test the webhook');
  console.log('3. Run: npx tsx scripts/monitor-e2e-test.ts ' + workspaceId);
  console.log('');
}

const workspaceId = process.argv[2];
const installationId = parseInt(process.argv[3], 10);

if (!workspaceId || !installationId) {
  console.error('Usage: npx tsx scripts/create-github-integration.ts <workspaceId> <installationId>');
  console.error('\nTo find your installation_id:');
  console.error('1. Go to https://github.com/settings/installations');
  console.error('2. Click on your GitHub App installation');
  console.error('3. The installation_id is in the URL: /installations/<installation_id>');
  process.exit(1);
}

createGitHubIntegration(workspaceId, installationId)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error creating GitHub integration:', error);
    process.exit(1);
  });

