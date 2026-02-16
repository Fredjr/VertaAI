import { prisma } from '../lib/db.js';

async function main() {
  console.log('🔍 Checking integrations for demo-workspace...\n');

  const integrations = await prisma.integration.findMany({
    where: { workspaceId: 'demo-workspace' },
    select: {
      id: true,
      type: true,
      status: true,
      config: true,
      createdAt: true,
    }
  });
  
  if (integrations.length === 0) {
    console.log('❌ No integrations found for demo-workspace');
    console.log('\n📝 To set up GitHub integration:');
    console.log('1. Create a GitHub App at: https://github.com/settings/apps/new');
    console.log('2. Set webhook URL to: https://vertaai-api-production.up.railway.app/webhooks/github/app');
    console.log('3. Install the app on your test repository');
    console.log('4. Create an Integration record in the database');
  } else {
    console.log(`✅ Found ${integrations.length} integration(s):\n`);
    integrations.forEach((integration, index) => {
      console.log(`${index + 1}. ${integration.type}`);
      console.log(`   ID: ${integration.id}`);
      console.log(`   Status: ${integration.status}`);
      console.log(`   Config:`, JSON.stringify(integration.config, null, 2));
      console.log(`   Created: ${integration.createdAt}`);
      console.log('');
    });
  }
  
  await prisma.$disconnect();
}

main();

