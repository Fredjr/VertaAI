import { prisma } from '../lib/db.js';

async function main() {
  const workspaceId = process.argv[2] || 'demo-workspace';
  
  console.log(`🔍 Checking policy packs for workspace: ${workspaceId}\n`);
  
  const packs = await prisma.workspacePolicyPack.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
  });
  
  if (packs.length === 0) {
    console.log('❌ No policy packs found for this workspace');
    console.log('\nTo create a test policy pack, run:');
    console.log(`npx tsx src/scripts/create-test-policy-pack.ts ${workspaceId}`);
  } else {
    console.log(`✅ Found ${packs.length} policy pack(s):\n`);
    
    for (const pack of packs) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`ID: ${pack.id}`);
      console.log(`Name: ${pack.name}`);
      console.log(`Version: ${pack.version}`);
      console.log(`Status: ${pack.status}`);
      console.log(`Track A Enabled: ${pack.trackAEnabled}`);
      console.log(`Track B Enabled: ${pack.trackBEnabled}`);
      console.log(`Created: ${pack.createdAt}`);
      console.log(`Updated: ${pack.updatedAt}`);
      console.log('');
    }
  }
  
  await prisma.$disconnect();
}

main();

