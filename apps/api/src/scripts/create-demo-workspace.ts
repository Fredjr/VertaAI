import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.workspace.upsert({
    where: { id: 'demo-workspace' },
    update: {},
    create: {
      id: 'demo-workspace',
      name: 'Demo Workspace',
      slug: 'demo-workspace',
      ownerEmail: 'demo@example.com',
    },
  });
  console.log('✅ Created demo-workspace');
  await prisma.$disconnect();
}

main();

