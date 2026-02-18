/**
 * Create Production Workspace with YAML Policy Pack
 * 
 * Creates a production workspace and publishes a comprehensive YAML policy pack
 */

import { PrismaClient } from '@prisma/client';
import { computePackHashFull } from '../services/gatekeeper/yaml-dsl/canonicalize.js';
import yaml from 'yaml';

const prisma = new PrismaClient();

async function createProductionWorkspace() {
  const timestamp = Date.now();
  
  console.log('🚀 Creating production workspace...\n');

  // 1. Create workspace
  const workspace = await prisma.workspace.create({
    data: {
      name: `Production Workspace ${timestamp}`,
      slug: `prod-${timestamp}`,
      ownerEmail: 'fredericle77@gmail.com',
      
      // Ownership config
      ownershipSourceRanking: ['pagerduty', 'codeowners', 'manual'],
      defaultOwnerType: 'slack_channel',
      defaultOwnerRef: '#engineering',
      
      // Notification policy
      highConfidenceThreshold: 0.98,
      mediumConfidenceThreshold: 0.40,
      digestChannel: '#drift-digest',
      
      // Doc resolution policy
      primaryDocRequired: false,
      allowPrLinkOverride: true,
      allowSearchSuggestMapping: false,
    },
  });

  console.log(`✅ Created workspace: ${workspace.id}`);
  console.log(`   Name: ${workspace.name}`);
  console.log(`   Slug: ${workspace.slug}\n`);

  // 2. Create comprehensive YAML policy pack
  const packYAML = {
    apiVersion: 'verta.ai/v1',
    kind: 'PolicyPack',
    
    metadata: {
      id: 'production-policy-pack',
      name: 'Production Policy Pack',
      version: '1.0.0',
      description: 'Comprehensive production policy pack with all safety checks',
      tags: ['production', 'safety', 'governance'],
      packMode: 'enforce',
      strictness: 'strict',
    },
    
    scope: {
      type: 'workspace',
      branches: {
        include: ['main', 'master', 'production'],
      },
      prEvents: ['opened', 'synchronize', 'reopened'],
    },
    
    rules: [
      {
        id: 'require-human-approval-for-agents',
        name: 'Require Human Approval for AI Agent PRs',
        description: 'Block AI-generated PRs unless they have human approval',
        decision: 'block',
        condition: {
          all: [
            { comparator: 'ACTOR_IS_AGENT', params: {} },
            { comparator: 'HUMAN_APPROVAL_PRESENT', params: {}, negate: true },
          ],
        },
        message: 'AI-generated PRs require human review and approval',
      },
      {
        id: 'no-secrets-in-code',
        name: 'No Secrets in Code',
        description: 'Block PRs that introduce secrets or API keys',
        decision: 'block',
        condition: {
          any: [
            { comparator: 'NO_SECRETS_IN_DIFF', params: {}, negate: true },
          ],
        },
        message: 'Secrets detected in code changes. Please remove them and use environment variables.',
      },
      {
        id: 'require-api-docs-update',
        name: 'Require API Documentation Update',
        description: 'Warn if API routes changed but OpenAPI spec not updated',
        decision: 'warn',
        condition: {
          all: [
            { comparator: 'CHANGED_PATH_MATCHES', params: { patterns: ['**/api/**', '**/routes/**'] } },
            { comparator: 'ARTIFACT_UPDATED', params: { artifactType: 'openapi_spec' }, negate: true },
          ],
        },
        message: 'API routes changed but OpenAPI spec not updated. Consider updating documentation.',
      },
      {
        id: 'require-checkruns-pass',
        name: 'Require All CI Checks to Pass',
        description: 'Block PRs if required CI checks are not passing',
        decision: 'block',
        condition: {
          any: [
            { comparator: 'CHECKRUNS_PASSED', params: { requiredChecks: ['build', 'test', 'lint'] }, negate: true },
          ],
        },
        message: 'Required CI checks must pass before merging',
      },
      {
        id: 'require-min-approvals',
        name: 'Require Minimum Approvals',
        description: 'Require at least 1 approval for production branches',
        decision: 'block',
        condition: {
          any: [
            { comparator: 'MIN_APPROVALS', params: { minCount: 1 }, negate: true },
          ],
        },
        message: 'At least 1 approval required for production branches',
      },
    ],
    
    evaluation: {
      strategy: 'all-rules',
      continueOnError: true,
      timeoutMs: 30000,
    },
    
    routing: {
      createGitHubCheck: true,
      checkName: 'Verta Policy Gate',
      postComment: true,
      commentMode: 'on-block-or-warn',
    },
    
    spawnTrackB: {
      enabled: true,
      when: [{ onDecision: 'block' }, { onDecision: 'warn' }],
      createRemediationCase: true,
      remediationDefaults: {
        priority: 'high',
      },
      grouping: {
        strategy: 'by-drift-type-and-service',
        maxPerPR: 10,
      },
    },
  };

  const yamlContent = yaml.stringify(packYAML);
  const packHash = computePackHashFull(yamlContent);
  const versionHash = packHash.substring(0, 16);

  const policyPack = await prisma.workspacePolicyPack.create({
    data: {
      id: packYAML.metadata.id,
      name: packYAML.metadata.name,
      workspaceId: workspace.id,
      scopeType: 'workspace',
      scopeRef: workspace.id,
      trackAConfigYamlDraft: yamlContent,
      trackAConfigYamlPublished: yamlContent,
      trackAPackHashPublished: packHash,
      packStatus: 'published',
      packMetadataId: packYAML.metadata.id,
      packMetadataVersion: packYAML.metadata.version,
      versionHash,
    },
  });

  console.log(`✅ Created and published policy pack: ${policyPack.id}`);
  console.log(`   Version: ${packYAML.metadata.version}`);
  console.log(`   Pack Hash: ${versionHash}...`);
  console.log(`   Rules: ${packYAML.rules.length}\n`);

  console.log('📋 Summary:');
  console.log(`   Workspace ID: ${workspace.id}`);
  console.log(`   Policy Pack ID: ${policyPack.id}`);
  console.log(`   Status: Published and ready for use\n`);

  await prisma.$disconnect();
  
  return { workspace, policyPack };
}

createProductionWorkspace()
  .then(({ workspace }) => {
    console.log(`\n✅ Production workspace created successfully!`);
    console.log(`\n🎯 WORKSPACE ID: ${workspace.id}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error creating production workspace:', error);
    process.exit(1);
  });

