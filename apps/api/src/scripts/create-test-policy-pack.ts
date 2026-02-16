/**
 * Create Test Policy Pack with Track A and Track B
 * 
 * This script creates a comprehensive policy pack for testing the unified UI
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

function generateVersionHash(config: any): string {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(config));
  return hash.digest('hex');
}

async function main() {
  const workspaceId = 'demo-workspace';

  // Ensure workspace exists
  await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: {},
    create: {
      id: workspaceId,
      name: 'Demo Workspace',
      slug: 'demo-workspace',
      ownerEmail: 'demo@example.com',
    },
  });

  // Track A Configuration (Contract Integrity Gate)
  const trackAConfig = {
    surfaces: ['api', 'docs', 'infra'],
    contracts: [
      {
        contractId: 'public-api-contract',
        name: 'Public API Contract',
        description: 'Validates OpenAPI spec and prevents breaking changes',
        scope: {
          repos: ['demo-org/api-service'],
          paths: ['src/api/**', 'openapi/**'],
        },
        artifacts: [
          {
            system: 'github',
            type: 'openapi_spec',
            locator: {
              repo: 'demo-org/api-service',
              path: 'openapi/openapi.yaml',
              ref: 'main',
            },
            role: 'primary',
            required: true,
            freshnessSlaHours: 24,
          },
        ],
        invariants: [
          {
            invariantId: 'no-breaking-changes',
            comparatorType: 'openapi_diff',
            description: 'Prevent breaking changes to public API',
            config: {
              allowBreakingChanges: false,
              requireVersionBump: true,
            },
            severity: 'error',
            enforcement: 'block',
          },
          {
            invariantId: 'valid-openapi',
            comparatorType: 'openapi_validate',
            description: 'Ensure OpenAPI spec is valid',
            config: {},
            severity: 'error',
            enforcement: 'block',
          },
        ],
      },
    ],
    dictionaries: {
      approvedTerms: ['API', 'endpoint', 'schema', 'authentication'],
      deprecatedTerms: ['legacy', 'old', 'deprecated'],
    },
    extraction: {
      enabled: true,
      autoExtract: true,
      extractionRules: [
        {
          pattern: '*.yaml',
          extractor: 'openapi',
        },
      ],
    },
    safety: {
      requireApproval: true,
      approvalThreshold: 2,
      allowedApprovers: ['platform-team'],
    },
  };

  // Track B Configuration (Drift Remediation)
  const trackBConfig = {
    primaryDoc: {
      id: 'readme-main',
      system: 'github',
      class: 'readme',
    },
    inputSources: [
      { type: 'github_pr', enabled: true, weight: 1.0 },
      { type: 'code_comments', enabled: true, weight: 0.8 },
      { type: 'openapi_spec', enabled: true, weight: 0.9 },
      { type: 'terraform_plan', enabled: false, weight: 0.7 },
      { type: 'confluence_page', enabled: false, weight: 0.6 },
    ],
    driftTypes: [
      { type: 'new_endpoint', enabled: true, defaultSeverity: 'medium' },
      { type: 'config_change', enabled: true, defaultSeverity: 'low' },
      { type: 'breaking_change', enabled: true, defaultSeverity: 'high' },
      { type: 'deprecation', enabled: true, defaultSeverity: 'medium' },
      { type: 'instruction', enabled: true, defaultSeverity: 'low' },
    ],
    allowedOutputs: ['github_pr_comment', 'slack_message', 'jira_ticket'],
    materiality: {
      autoApprove: 0.8,
      slackNotify: 0.5,
      digestOnly: 0.3,
      ignore: 0.2,
    },
    eligibility: {
      minConfidence: 0.6,
      requireSourceType: ['github_pr', 'openapi_spec'],
      excludePatterns: ['test/**', '*.test.ts'],
    },
    sectionTargets: {
      preferredSections: ['API', 'Configuration', 'Deployment'],
      fallbackSection: 'Changes',
    },
    impactRules: {
      boostFactors: {
        breaking_change: 1.5,
        new_endpoint: 1.2,
      },
      penaltyFactors: {
        low_confidence: 0.5,
      },
    },
    writeback: {
      enabled: true,
      autoApproveThreshold: 0.8,
      requiresApproval: true,
      targetArtifacts: ['README.md', 'CHANGELOG.md'],
    },
  };

  // Generate version hash
  const versionHash = generateVersionHash({
    trackAConfig,
    trackBConfig,
    approvalTiers: {},
    routing: {},
  });

  // Create policy pack
  const policyPack = await prisma.workspacePolicyPack.create({
    data: {
      workspaceId,
      name: 'Production Policy Pack',
      description: 'Comprehensive policy pack with Track A (Contract Integrity) and Track B (Drift Remediation)',
      status: 'active',
      scopeType: 'workspace',
      scopeRef: null,
      repoAllowlist: ['demo-org/api-service', 'demo-org/web-app'],
      pathGlobs: ['src/**', 'openapi/**', 'README.md'],
      trackAEnabled: true,
      trackAConfig: trackAConfig as any,
      trackBEnabled: true,
      trackBConfig: trackBConfig as any,
      approvalTiers: {
        tier1: { approvers: ['tech-lead'], minApprovals: 1 },
        tier2: { approvers: ['platform-team'], minApprovals: 2 },
        tier3: { approvers: ['security-team'], minApprovals: 1 },
      } as any,
      routing: {
        method: 'codeowners',
        fallbackChannel: '#engineering',
      } as any,
      testMode: false,
      testModeConfig: {} as any,
      version: 1,
      versionHash,
      parentId: null,
    },
  });

  console.log('✅ Created Policy Pack:');
  console.log(`   ID: ${policyPack.id}`);
  console.log(`   Name: ${policyPack.name}`);
  console.log(`   Workspace: ${policyPack.workspaceId}`);
  console.log(`   Track A Enabled: ${policyPack.trackAEnabled}`);
  console.log(`   Track B Enabled: ${policyPack.trackBEnabled}`);
  console.log(`   Status: ${policyPack.status}`);
  console.log(`   Version: ${policyPack.version}`);
  console.log('');
  console.log('🎯 Test the UI at:');
  console.log(`   http://localhost:3000/policy-packs?workspace=${workspaceId}`);
  console.log(`   http://localhost:3000/policy-packs/${policyPack.id}?workspace=${workspaceId}`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

