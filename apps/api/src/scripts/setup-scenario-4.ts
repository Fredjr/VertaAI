/**
 * Setup Test Scenario 4: Gate Status Facts (Cross-Gate Dependencies)
 *
 * Creates a "Deploy Gate" pack that uses gate status facts to check
 * if the previous "VertaAI Policy Pack" check passed.
 *
 * This tests the gate.contractIntegrity.status and gate.contractIntegrity.findings facts.
 */

import { PrismaClient } from '@prisma/client';
import { computePackHashFull } from '../services/gatekeeper/yaml-dsl/canonicalize.js';
import yaml from 'yaml';

const prisma = new PrismaClient();

const WORKSPACE_ID = 'demo-workspace';
const TEST_REPO = 'Fredjr/vertaai-e2e-test';

async function main() {
  console.log('[Scenario4] Setting up Test Scenario 4: Gate Status Facts\n');

  // Create Deploy Gate pack that depends on previous gate status
  console.log('[Scenario4] Creating Deploy Gate pack...');

  const packYAML = {
    metadata: {
      id: 'deploy-gate',
      name: 'Deploy Gate',
      version: '1.0.0',
      description: 'Deploy gate that requires previous policy checks to pass',
      category: 'deployment',
      tags: ['deployment', 'cross-gate']
    },
    scope: {
      type: 'repo',
      repos: {
        include: [TEST_REPO]
      },
      branches: {
        include: [],
        exclude: []
      },
      prEvents: ['labeled']  // Only run when PR is labeled with 'deploy'
    },
    rules: [
      {
        id: 'require-gate-pass',
        name: 'Require Previous Gate to Pass',
        trigger: {
          anyLabels: ['deploy', 'production']
        },
        obligations: [
          {
            type: 'condition',
            condition: {
              fact: 'gate.contractIntegrity.status',
              operator: '==',
              value: 'pass'
            },
            severity: 'critical',
            decisionOnFail: 'block',
            message: 'Previous policy gate must pass before deployment. Current status: {gate.contractIntegrity.status}'
          }
        ]
      },
      {
        id: 'check-finding-count',
        name: 'Check Finding Count',
        trigger: {
          anyLabels: ['deploy', 'production']
        },
        obligations: [
          {
            type: 'condition',
            condition: {
              fact: 'gate.contractIntegrity.findings',
              operator: '<=',
              value: 3
            },
            severity: 'high',
            decisionOnFail: 'warn',
            message: 'Previous gate has {gate.contractIntegrity.findings} findings (threshold: 3)'
          }
        ]
      }
    ],
    routing: {
      github: {
        checkName: 'Deploy Gate',
        conclusionMapping: {
          pass: 'success',
          warn: 'success',
          block: 'failure'
        }
      }
    }
  };

  const packString = yaml.stringify(packYAML);
  const packHash = computePackHashFull(packString);

  const pack = await prisma.workspacePolicyPack.create({
    data: {
      workspaceId: WORKSPACE_ID,
      name: 'Deploy Gate',
      description: 'Deploy gate that requires previous policy checks to pass',
      scopeType: 'repo',
      scopeRef: TEST_REPO,
      trackAEnabled: true,
      trackAConfigYamlDraft: packString,
      trackAConfigYamlPublished: packString,
      trackAPackHashPublished: packHash,
      versionHash: packHash,
      packStatus: 'published',
      publishedAt: new Date(),
      publishedBy: 'scenario4-script',
      packMetadataId: packYAML.metadata.id,
      packMetadataVersion: packYAML.metadata.version,
      packMetadataName: packYAML.metadata.name,
      status: 'ACTIVE',
      createdAt: new Date(),
      createdBy: 'scenario4-script',
      updatedAt: new Date(),
      updatedBy: 'scenario4-script',
    }
  });

  console.log(`[Scenario4] ✅ Created Deploy Gate pack: ${pack.id}\n`);
  console.log('[Scenario4] Pack YAML:');
  console.log('='.repeat(80));
  console.log(packString);
  console.log('='.repeat(80));
  console.log('\n[Scenario4] ✅ Scenario 4 setup complete!');
  console.log('   - Deploy Gate pack created');
  console.log('   - Triggers on PR label: "deploy" or "production"');
  console.log('   - Checks gate.contractIntegrity.status fact');
  console.log('   - Checks gate.contractIntegrity.findings fact');
  console.log('\n   Next: Create a PR, wait for first gate to run, then add "deploy" label!');
}

main()
  .catch((e) => {
    console.error('[Scenario4] ❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

