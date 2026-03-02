/**
 * Apply the "Test" policy pack (07390d20-251d-4607-95d2-259d69bc21c3) to vertaai-e2e-test
 * 
 * This script updates the Test policy pack to:
 * 1. Set it to ACTIVE status
 * 2. Configure it for the vertaai-e2e-test repository
 * 3. Increase the GitHub API budget to handle OpenAPI comparator
 */

import { PrismaClient } from '@prisma/client';
import yaml from 'yaml';

const prisma = new PrismaClient();

const WORKSPACE_ID = 'demo-workspace';
const TEST_REPO = 'Fredjr/vertaai-e2e-test';
const PACK_ID = '07390d20-251d-4607-95d2-259d69bc21c3';

async function main() {
  console.log('[ApplyTestPack] Starting...\n');

  // Step 1: Find the Test pack
  console.log('[ApplyTestPack] Step 1: Finding Test pack...');
  const pack = await prisma.workspacePolicyPack.findUnique({
    where: {
      workspaceId_id: {
        workspaceId: WORKSPACE_ID,
        id: PACK_ID
      }
    }
  });

  if (!pack) {
    console.error('[ApplyTestPack] ❌ Pack not found!');
    console.error(`  Looking for: ${PACK_ID} in workspace ${WORKSPACE_ID}`);
    process.exit(1);
  }

  console.log('[ApplyTestPack] ✅ Found pack:', pack.name);
  console.log('  Current status:', pack.status);
  console.log('  Current packStatus:', pack.packStatus);
  console.log('  Current scopeType:', pack.scopeType);
  console.log('  Current scopeRef:', pack.scopeRef);

  // Step 2: Get the YAML config
  console.log('\n[ApplyTestPack] Step 2: Checking YAML config...');
  const yamlConfig = pack.trackAConfigYamlPublished || pack.trackAConfigYamlDraft;
  
  if (!yamlConfig) {
    console.error('[ApplyTestPack] ❌ No YAML config found!');
    process.exit(1);
  }

  // Step 3: Parse and update the YAML to increase API budget
  console.log('[ApplyTestPack] Step 3: Updating YAML config...');
  const packYAML = yaml.parse(yamlConfig);
  
  // Ensure evaluation budgets exist and increase GitHub API calls
  if (!packYAML.evaluation) {
    packYAML.evaluation = {};
  }
  if (!packYAML.evaluation.budgets) {
    packYAML.evaluation.budgets = {};
  }
  
  packYAML.evaluation.budgets.maxGitHubApiCalls = 500;
  packYAML.evaluation.budgets.maxTotalMs = packYAML.evaluation.budgets.maxTotalMs || 60000;
  packYAML.evaluation.budgets.perComparatorTimeoutMs = packYAML.evaluation.budgets.perComparatorTimeoutMs || 15000;
  
  console.log('[ApplyTestPack] Updated GitHub API budget to 500');

  // Step 4: Update the pack
  console.log('\n[ApplyTestPack] Step 4: Applying pack to repository...');
  
  const updatedYaml = yaml.stringify(packYAML);
  
  await prisma.workspacePolicyPack.update({
    where: {
      workspaceId_id: {
        workspaceId: WORKSPACE_ID,
        id: PACK_ID
      }
    },
    data: {
      status: 'ACTIVE',
      packStatus: 'published',
      scopeType: 'repo',
      scopeRef: TEST_REPO,
      trackAConfigYamlPublished: updatedYaml,
      trackAConfigYamlDraft: updatedYaml,
      publishedAt: new Date(),
      publishedBy: 'apply-test-pack-script',
      updatedAt: new Date(),
      updatedBy: 'apply-test-pack-script',
    }
  });

  console.log('[ApplyTestPack] ✅ Pack applied successfully!');
  console.log('\nConfiguration:');
  console.log('  Pack ID:', PACK_ID);
  console.log('  Pack Name:', pack.name);
  console.log('  Status: ACTIVE');
  console.log('  Pack Status: published');
  console.log('  Scope: repo');
  console.log('  Repository:', TEST_REPO);
  console.log('  GitHub API Budget: 500 calls');
  console.log('\nNext steps:');
  console.log('  1. Re-trigger PR #35 checks');
  console.log('  2. Verify OpenAPI comparator runs without rate limit errors');
  console.log('  3. Check that all 5 cross-artifact comparators are evaluated');
}

main()
  .catch((error) => {
    console.error('[ApplyTestPack] ❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

