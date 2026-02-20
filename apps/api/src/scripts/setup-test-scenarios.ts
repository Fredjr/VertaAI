/**
 * Setup Test Scenarios for Production Testing
 * Creates multiple policy packs for different test scenarios
 */

import { PrismaClient } from '@prisma/client';
import * as yaml from 'yaml';
import { getTemplateById } from '../services/gatekeeper/yaml-dsl/templates/index.js';
import { computePackHashFull } from '../services/gatekeeper/yaml-dsl/packHasher.js';

const prisma = new PrismaClient();

const WORKSPACE_ID = 'demo-workspace';
const TEST_REPO = 'Fredjr/vertaai-e2e-test';

async function main() {
  console.log('🧪 Setting up test scenarios...\n');

  // Scenario 1: Already created (observe-core)
  console.log('✅ Scenario 1: Observe Mode - Already created\n');

  // Scenario 2: Enforce Mode - Security Focused
  console.log('📝 Scenario 2: Enforce Mode - Security Focused');
  const securityTemplate = getTemplateById('verta.security-focused.v1');
  const securityPack = { ...securityTemplate };
  
  // Customize for test repository
  securityPack.scope = {
    type: 'repo' as const,
    repos: {
      include: [TEST_REPO]
    },
    branches: {
      include: [],  // Match all branches
      exclude: []
    }
  };

  const securityYaml = yaml.stringify(securityPack);
  const securityHash = computePackHashFull(securityYaml);

  const scenario2Pack = await prisma.workspacePolicyPack.upsert({
    where: {
      workspaceId_packMetadataId_packMetadataVersion: {
        workspaceId: WORKSPACE_ID,
        packMetadataId: securityPack.metadata.id,
        packMetadataVersion: securityPack.metadata.version,
      }
    },
    create: {
      workspaceId: WORKSPACE_ID,
      name: 'Test Scenario 2 - Security Focused',
      description: 'Enforce mode pack for security testing',
      scopeType: 'repo',
      scopeRef: null,
      status: 'DRAFT',  // Start as DRAFT
      trackAEnabled: true,
      trackAConfigYamlPublished: securityYaml,
      trackAPackHashPublished: securityHash,
      packStatus: 'draft',
      packMetadataId: securityPack.metadata.id,
      packMetadataVersion: securityPack.metadata.version,
      packMetadataName: securityPack.metadata.name,
      versionHash: securityHash,
      trackBEnabled: false,
      repoAllowlist: [TEST_REPO],
      pathGlobs: [],
      createdBy: 'test-script',
      updatedBy: 'test-script',
    },
    update: {
      trackAConfigYamlPublished: securityYaml,
      trackAPackHashPublished: securityHash,
      versionHash: securityHash,
      updatedBy: 'test-script',
      updatedAt: new Date(),
    }
  });

  console.log(`✅ Created pack: ${scenario2Pack.id}`);
  console.log(`   Status: ${scenario2Pack.status} (use DRAFT to avoid triggering on all PRs)`);
  console.log(`   To activate: Update status to ACTIVE and packStatus to 'published'\n`);

  // Scenario 3: High-Risk File Protection
  console.log('📝 Scenario 3: High-Risk File Protection');
  const highRiskTemplate = getTemplateById('verta.high-risk-file-protection.v1');
  const highRiskPack = { ...highRiskTemplate };
  
  highRiskPack.scope = {
    type: 'repo' as const,
    repos: {
      include: [TEST_REPO]
    },
    branches: {
      include: [],
      exclude: []
    }
  };

  const highRiskYaml = yaml.stringify(highRiskPack);
  const highRiskHash = computePackHashFull(highRiskYaml);

  const scenario3Pack = await prisma.workspacePolicyPack.upsert({
    where: {
      workspaceId_packMetadataId_packMetadataVersion: {
        workspaceId: WORKSPACE_ID,
        packMetadataId: highRiskPack.metadata.id,
        packMetadataVersion: highRiskPack.metadata.version,
      }
    },
    create: {
      workspaceId: WORKSPACE_ID,
      name: 'Test Scenario 3 - High-Risk Files',
      description: 'Test path-based protection rules',
      scopeType: 'repo',
      scopeRef: null,
      status: 'DRAFT',
      trackAEnabled: true,
      trackAConfigYamlPublished: highRiskYaml,
      trackAPackHashPublished: highRiskHash,
      packStatus: 'draft',
      packMetadataId: highRiskPack.metadata.id,
      packMetadataVersion: highRiskPack.metadata.version,
      packMetadataName: highRiskPack.metadata.name,
      versionHash: highRiskHash,
      trackBEnabled: false,
      repoAllowlist: [TEST_REPO],
      pathGlobs: [],
      createdBy: 'test-script',
      updatedBy: 'test-script',
    },
    update: {
      trackAConfigYamlPublished: highRiskYaml,
      trackAPackHashPublished: highRiskHash,
      versionHash: highRiskHash,
      updatedBy: 'test-script',
      updatedAt: new Date(),
    }
  });

  console.log(`✅ Created pack: ${scenario3Pack.id}`);
  console.log(`   Status: ${scenario3Pack.status}\n`);

  console.log('✅ Test scenarios setup complete!');
  console.log('\n📋 Summary:');
  console.log('- Scenario 1: Observe Core (ACTIVE)');
  console.log(`- Scenario 2: Security Focused (${scenario2Pack.status}) - ID: ${scenario2Pack.id}`);
  console.log(`- Scenario 3: High-Risk Files (${scenario3Pack.status}) - ID: ${scenario3Pack.id}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

