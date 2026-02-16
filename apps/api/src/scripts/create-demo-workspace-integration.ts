import { prisma } from '../lib/db.js';

async function main() {
  console.log('🔧 Creating GitHub integration for demo-workspace...\n');
  
  const workspaceId = 'demo-workspace';
  const installationId = 105899665; // From GitHub URL
  const appId = '2755713';
  
  // Check if integration already exists
  const existing = await prisma.integration.findUnique({
    where: {
      workspaceId_type: {
        workspaceId,
        type: 'github',
      },
    },
  });
  
  if (existing) {
    console.log('⚠️  Integration already exists. Updating...\n');
    
    const updated = await prisma.integration.update({
      where: { id: existing.id },
      data: {
        status: 'connected',
        config: {
          installationId,
          appId,
          repos: ['Fredjr/vertaai-e2e-test'], // Add your test repo
          installedAt: new Date().toISOString(),
        },
      },
    });
    
    console.log('✅ Integration updated:');
    console.log(`   ID: ${updated.id}`);
    console.log(`   Workspace: ${updated.workspaceId}`);
    console.log(`   Type: ${updated.type}`);
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
          appId,
          repos: ['Fredjr/vertaai-e2e-test'],
          installedAt: new Date().toISOString(),
        },
      },
    });
    
    console.log('✅ Integration created:');
    console.log(`   ID: ${integration.id}`);
    console.log(`   Workspace: ${integration.workspaceId}`);
    console.log(`   Type: ${integration.type}`);
    console.log(`   Status: ${integration.status}`);
    console.log(`   Config:`, JSON.stringify(integration.config, null, 2));
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n✅ GitHub integration ready!\n');
  console.log('📝 Next steps:');
  console.log('1. Add repository access on GitHub: https://github.com/settings/installations/105899665');
  console.log('2. Select "Fredjr/vertaai-e2e-test" repository');
  console.log('3. Re-trigger the PR webhook or create a new PR');
  console.log('');
  
  await prisma.$disconnect();
}

main();

