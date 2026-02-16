import { prisma } from '../lib/db.js';

async function main() {
  const signalId = process.argv[2] || 'signal-1771249173970-a3hgg';

  const signal = await prisma.signalEvent.findUnique({
    where: {
      workspaceId_id: {
        workspaceId: 'demo-workspace',
        id: signalId
      }
    }
  });

  console.log(`Signal Event: ${signalId}`);
  console.log('Extracted data:');
  console.log(JSON.stringify(signal?.extracted, null, 2));

  await prisma.$disconnect();
}

main();

