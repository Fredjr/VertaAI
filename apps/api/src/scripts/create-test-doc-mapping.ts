/**
 * Create a test DocMapping for demo-workspace
 * This allows Track B to resolve documentation targets
 */

import { prisma } from '../lib/db.js';

async function main() {
  const workspaceId = 'demo-workspace';
  const repo = 'Fredjr/vertaai-e2e-test';
  const service = 'vertaai-e2e-test';
  
  console.log(`📝 Creating DocMapping for ${repo}...`);
  
  // Check if mapping already exists
  const existing = await prisma.docMappingV2.findFirst({
    where: {
      workspaceId,
      repo,
      service,
    },
  });
  
  if (existing) {
    console.log(`✅ DocMapping already exists: ${existing.id}`);
    console.log(JSON.stringify(existing, null, 2));
    await prisma.$disconnect();
    return;
  }
  
  // Create new mapping
  const mapping = await prisma.docMappingV2.create({
    data: {
      workspaceId,
      repo,
      service,
      sourceType: 'github_pr',
      docSystem: 'confluence',
      docId: 'test-page-123', // Placeholder - replace with real Confluence page ID
      docUrl: 'https://your-domain.atlassian.net/wiki/spaces/TEST/pages/123456/Test+Page',
      docTitle: 'Test Documentation Page',
      confidence: 1.0,
      method: 'manual',
      createdBy: 'system',
    },
  });
  
  console.log(`✅ Created DocMapping: ${mapping.id}`);
  console.log(JSON.stringify(mapping, null, 2));
  
  await prisma.$disconnect();
}

main();

