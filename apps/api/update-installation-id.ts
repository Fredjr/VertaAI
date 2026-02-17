import { prisma } from './src/lib/db.js';

async function main() {
  console.log('🔧 Updating GitHub integration installation ID...\n');
  
  const oldInstallationId = 105899665;
  const newInstallationId = 108852591;
  
  const integration = await prisma.integration.findFirst({
    where: {
      workspaceId: 'demo-workspace',
      type: 'github',
    },
  });
  
  if (!integration) {
    console.error('❌ No GitHub integration found for demo-workspace');
    process.exit(1);
  }
  
  console.log('Current config:', JSON.stringify(integration.config, null, 2));
  
  const config = integration.config as any;
  config.installationId = newInstallationId;
  
  const updated = await prisma.integration.update({
    where: { id: integration.id },
    data: { config },
  });
  
  console.log('\n✅ Updated installation ID from', oldInstallationId, 'to', newInstallationId);
  console.log('\nNew config:', JSON.stringify(updated.config, null, 2));
  
  await prisma.$disconnect();
}

main();
