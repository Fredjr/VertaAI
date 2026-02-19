/**
 * Setup Production Test Environment
 * 
 * This script:
 * 1. Verifies workspace exists
 * 2. Verifies GitHub integration
 * 3. Creates test policy pack from template
 * 4. Outputs configuration for testing
 */

import { PrismaClient } from '@prisma/client';
import { getTemplateById } from '../services/gatekeeper/yaml-dsl/templateRegistry.js';
import { computePackHashFull } from '../services/gatekeeper/yaml-dsl/canonicalize.js';
import yaml from 'yaml';

const prisma = new PrismaClient();

const WORKSPACE_ID = 'demo-workspace';
const TEST_REPO = 'Fredjr/vertaai-e2e-test';

async function main() {
  console.log('🧪 Setting up production test environment...\n');
  console.log('='.repeat(80));
  
  // Step 1: Verify workspace exists
  console.log('\n📋 Step 1: Verifying workspace...');
  const workspace = await prisma.workspace.findUnique({
    where: { id: WORKSPACE_ID },
    include: {
      integrations: {
        where: { type: 'github' }
      }
    }
  });
  
  if (!workspace) {
    console.error(`❌ Workspace not found: ${WORKSPACE_ID}`);
    console.log('\n💡 Create workspace first:');
    console.log(`   await prisma.workspace.create({ data: { id: '${WORKSPACE_ID}', name: 'Demo Workspace', slug: '${WORKSPACE_ID}', ownerEmail: 'fredericle77@gmail.com' } })`);
    process.exit(1);
  }
  
  console.log(`✅ Workspace found: ${workspace.name}`);
  console.log(`   ID: ${workspace.id}`);
  console.log(`   Slug: ${workspace.slug}`);
  
  // Step 2: Verify GitHub integration
  console.log('\n📋 Step 2: Verifying GitHub integration...');
  const githubIntegration = workspace.integrations.find(i => i.type === 'github');
  
  if (!githubIntegration) {
    console.error('❌ GitHub integration not found');
    console.log('\n💡 Run: tsx src/scripts/create-demo-workspace-integration.ts');
    process.exit(1);
  }
  
  console.log('✅ GitHub integration found');
  console.log(`   Status: ${githubIntegration.status}`);
  console.log(`   Config:`, JSON.stringify(githubIntegration.config, null, 2));
  
  // Step 3: List available templates
  console.log('\n📋 Step 3: Available templates:');
  const templates = [
    'observe-core',
    'enforce-core',
    'security-focused',
    'documentation',
    'infrastructure',
    'database-migration-safety',
    'breaking-change-documentation',
    'high-risk-file-protection',
    'dependency-update-safety',
    'deploy-gate',
    'time-based-restrictions',
    'team-based-routing',
  ];
  
  templates.forEach((id, index) => {
    const template = getTemplateById(id);
    if (template) {
      console.log(`   ${index + 1}. ${id} - ${template.name}`);
    }
  });
  
  // Step 4: Create test policy pack from observe-core template
  console.log('\n📋 Step 4: Creating test policy pack...');
  const template = getTemplateById('observe-core');
  
  if (!template) {
    console.error('❌ Template not found: observe-core');
    process.exit(1);
  }
  
  // Parse template YAML
  const packYAML = yaml.parse(template.yaml);
  
  // Customize for test repository
  packYAML.scope = {
    type: 'repo',
    repos: {
      include: [TEST_REPO]
    }
  };
  
  // Compute pack hash
  const packHash = computePackHashFull(packYAML);
  const yamlString = yaml.stringify(packYAML);
  
  // Create or update policy pack
  const existingPack = await prisma.workspacePolicyPack.findFirst({
    where: {
      workspaceId: WORKSPACE_ID,
      name: 'Production Test Pack - Observe Core'
    }
  });
  
  let pack;
  if (existingPack) {
    console.log('⚠️  Pack already exists. Updating...');
    pack = await prisma.workspacePolicyPack.update({
      where: {
        workspaceId_id: {
          workspaceId: WORKSPACE_ID,
          id: existingPack.id
        }
      },
      data: {
        yamlContent: yamlString,
        packHash,
        status: 'ACTIVE',
        updatedAt: new Date(),
      }
    });
  } else {
    pack = await prisma.workspacePolicyPack.create({
      data: {
        workspaceId: WORKSPACE_ID,
        name: 'Production Test Pack - Observe Core',
        description: 'Test pack for production validation - Observe mode',
        scopeType: 'repo',
        scopeRef: TEST_REPO,
        status: 'ACTIVE',
        yamlContent: yamlString,
        packHash,
        trackAEnabled: true,
        trackAConfig: {},
        trackBEnabled: false,
        trackBConfig: {},
        repoAllowlist: [TEST_REPO],
        pathGlobs: [],
        createdBy: 'setup-script',
        updatedBy: 'setup-script',
      }
    });
  }
  
  console.log('✅ Policy pack created/updated:');
  console.log(`   ID: ${pack.id}`);
  console.log(`   Name: ${pack.name}`);
  console.log(`   Status: ${pack.status}`);
  console.log(`   Hash: ${packHash}`);
  
  // Step 5: Output test instructions
  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Production test environment ready!\n');
  console.log('📝 Test Instructions:');
  console.log('');
  console.log('1. Create a PR on the test repository:');
  console.log(`   Repository: ${TEST_REPO}`);
  console.log(`   URL: https://github.com/${TEST_REPO}/pulls`);
  console.log('');
  console.log('2. Make some changes (e.g., modify README.md)');
  console.log('');
  console.log('3. Open the PR and wait for GitHub Check to appear');
  console.log('');
  console.log('4. Verify the check shows:');
  console.log('   - Check name: "VertaAI Policy Pack: Production Test Pack - Observe Core"');
  console.log('   - Status: PASS (observe mode never blocks)');
  console.log('   - Output: Shows evaluated rules and findings');
  console.log('');
  console.log('5. Check Railway logs for processing:');
  console.log('   - Search for: "[Gatekeeper]" or "[YAML DSL]"');
  console.log('   - Verify pack was matched and evaluated');
  console.log('');
  console.log('📊 Workspace Configuration:');
  console.log(`   Workspace ID: ${WORKSPACE_ID}`);
  console.log(`   Policy Pack ID: ${pack.id}`);
  console.log(`   Test Repository: ${TEST_REPO}`);
  console.log(`   GitHub Installation ID: ${(githubIntegration.config as any)?.installationId}`);
  console.log('');
  
  await prisma.$disconnect();
}

main().catch(console.error);

