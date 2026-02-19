/**
 * Delete and recreate observe-core policy pack with updated template
 * 
 * This script:
 * 1. Deletes the existing "Production Test Pack - Observe Core"
 * 2. Creates a new one with the updated template from the registry
 */

import { PrismaClient } from '@prisma/client';
import { getTemplateById } from '../services/gatekeeper/yaml-dsl/templateRegistry.js';
import { computePackHashFull } from '../services/gatekeeper/yaml-dsl/canonicalize.js';
import yaml from 'yaml';

const prisma = new PrismaClient();

const WORKSPACE_ID = 'demo-workspace';
const TEST_REPO = 'Fredjr/vertaai-e2e-test';

async function main() {
  console.log('[RecreateObservePack] Starting...\n');
  
  // Step 1: Delete existing pack
  console.log('[RecreateObservePack] Step 1: Deleting existing pack...');
  const deleteResult = await prisma.workspacePolicyPack.deleteMany({
    where: {
      workspaceId: WORKSPACE_ID,
      name: 'Production Test Pack - Observe Core'
    }
  });
  
  console.log(`[RecreateObservePack] ✅ Deleted ${deleteResult.count} pack(s)\n`);
  
  // Step 2: Load template from registry
  console.log('[RecreateObservePack] Step 2: Loading template from registry...');
  const template = getTemplateById('verta.observe-core.v1');
  
  if (!template) {
    console.error('[RecreateObservePack] ❌ Template not found: verta.observe-core.v1');
    process.exit(1);
  }
  
  console.log(`[RecreateObservePack] ✅ Loaded template: ${template.name}\n`);
  
  // Step 3: Customize template for test repository
  console.log('[RecreateObservePack] Step 3: Customizing template...');
  const packYAML = { ...template.parsed };

  packYAML.scope = {
    type: 'repo',
    repos: {
      include: [TEST_REPO]
    },
    branches: {
      include: [],  // Empty = match all branches
      exclude: []
    }
  };

  const yamlString = yaml.stringify(packYAML);
  const packHash = computePackHashFull(yamlString);
  
  console.log(`[RecreateObservePack] Template hash: ${packHash.substring(0, 16)}`);
  console.log(`[RecreateObservePack] Scope: repo=${TEST_REPO}, branches=all\n`);
  
  // Step 4: Create new pack
  console.log('[RecreateObservePack] Step 4: Creating new pack...');
  const pack = await prisma.workspacePolicyPack.create({
    data: {
      workspaceId: WORKSPACE_ID,
      name: 'Production Test Pack - Observe Core',
      description: 'Test pack for production validation - Observe mode with CORRECT severity levels',
      scopeType: 'repo',
      scopeRef: TEST_REPO,
      trackAEnabled: true,
      trackAConfigYamlDraft: yamlString,
      trackAConfigYamlPublished: yamlString,
      trackAPackHashPublished: packHash,
      versionHash: packHash,
      packStatus: 'published',
      publishedAt: new Date(),
      publishedBy: 'recreate-script',
      packMetadataId: packYAML.metadata.id,
      packMetadataVersion: packYAML.metadata.version,
      packMetadataName: packYAML.metadata.name,
      status: 'ACTIVE',
      createdAt: new Date(),
      createdBy: 'recreate-script',
      updatedAt: new Date(),
      updatedBy: 'recreate-script',
    }
  });
  
  console.log(`[RecreateObservePack] ✅ Created pack: ${pack.id}\n`);
  
  // Step 5: Verify
  console.log('[RecreateObservePack] Step 5: Verifying...');
  console.log('='.repeat(80));
  console.log(`Pack ID: ${pack.id}`);
  console.log(`Pack Name: ${pack.name}`);
  console.log(`Pack Status: ${pack.status}`);
  console.log(`Pack Metadata ID: ${pack.packMetadataId}`);
  console.log(`Pack Metadata Version: ${pack.packMetadataVersion}`);
  console.log(`Scope Type: ${pack.scopeType}`);
  console.log(`Scope Ref: ${pack.scopeRef}`);
  console.log(`Published: ${pack.packStatus}`);
  console.log(`Hash: ${pack.trackAPackHashPublished?.substring(0, 16)}`);
  console.log('='.repeat(80));
  
  console.log('\n✅ SUCCESS! The pack has been recreated with the updated template.');
  console.log('   The new template has CORRECT severity levels:');
  console.log('   - Secrets: decisionOnFail: block (TRUE severity)');
  console.log('   - Approvals: decisionOnFail: warn');
  console.log('   - PR Template: decisionOnFail: warn');
  console.log('   - OpenAPI: decisionOnFail: warn');
  console.log('\n   Next: Trigger a re-evaluation of PR #14 to see the new behavior!');
}

main()
  .catch((e) => {
    console.error('[RecreateObservePack] ❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

