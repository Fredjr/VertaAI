/**
 * Create Production Test Workspace
 * Creates a fully configured workspace with:
 * - DriftPlan
 * - ContractPolicy (block_high_critical mode)
 * - ContractPack (PublicAPI + PrivilegedInfra)
 * 
 * Usage: npx tsx scripts/create-production-test-workspace.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createProductionTestWorkspace() {
  console.log('🏗️  Creating Production Test Workspace...\n');

  try {
    const timestamp = Date.now();
    
    // Step 1: Create Workspace
    console.log('Step 1: Creating workspace...');
    const workspace = await prisma.workspace.create({
      data: {
        name: `Production Test Workspace ${timestamp}`,
        slug: `prod-test-${timestamp}`,
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

        // Workflow preferences with ALL feature flags enabled
        workflowPreferences: {
          featureFlags: {
            ENABLE_TYPED_DELTAS: true,
            ENABLE_EVIDENCE_TO_LLM: true,
            ENABLE_MATERIALITY_GATE: true,
            ENABLE_CONTEXT_EXPANSION: true,
            ENABLE_TEMPORAL_ACCUMULATION: true,
            ENABLE_AGENT_PR_GATEKEEPER: true,
            ENABLE_CONTRACT_VALIDATION: true,
          },
          enabledDriftTypes: ['instruction', 'process', 'ownership', 'environment_tooling'],
          enabledInputSources: ['github_pr', 'pagerduty_incident', 'datadog_alert'],
          enabledOutputTargets: ['confluence', 'github_readme'],
          outputTargetPriority: ['confluence', 'github_readme'],
        },
      },
    });
    console.log(`✅ Workspace created: ${workspace.id}\n`);

    // Step 2: Create DriftPlan
    console.log('Step 2: Creating DriftPlan...');
    const driftPlan = await prisma.driftPlan.create({
      data: {
        workspaceId: workspace.id,
        name: 'Production API Service Plan',
        description: 'Monitors API service for drift and contract violations',
        scopeType: 'service',
        scopeRef: 'api',
        primaryDocSystem: 'github_readme',
        primaryDocId: 'Fredjr/VertaAI/README.md',
        docClass: 'runbook',
        inputSources: ['github_pr', 'pagerduty_incident'],
        driftTypes: ['instruction', 'process', 'environment_tooling'],
        allowedOutputs: ['confluence', 'github_readme'],
        versionHash: 'initial',
        thresholds: {
          autoApprove: 0.98,
          slackNotify: 0.40,
          digestOnly: 0.30,
          ignore: 0.20,
        },
        eligibility: {
          requiresIncident: false,
        },
        writeback: {
          enabled: true,
          requiresApproval: true,
        },
      },
    });
    console.log(`✅ DriftPlan created: ${driftPlan.id}\n`);

    // Step 3: Create ContractPolicy (block_high_critical mode)
    console.log('Step 3: Creating ContractPolicy (block_high_critical mode)...');
    const contractPolicy = await prisma.contractPolicy.create({
      data: {
        workspaceId: workspace.id,
        name: 'Production Enforcement Policy',
        description: 'Blocks PRs with high or critical contract violations',
        mode: 'block_high_critical',
        criticalThreshold: 90,
        highThreshold: 70,
        mediumThreshold: 40,
        gracefulDegradation: {
          softFailOnTimeout: true,
          timeoutMs: 25000,
          fallbackMode: 'warn_only',
        },
        appliesTo: ['api', 'infra', 'data_model'],
        active: true,
      },
    });
    console.log(`✅ ContractPolicy created: ${contractPolicy.id}\n`);

    // Step 4: Create ContractPack (PublicAPI + PrivilegedInfra)
    console.log('Step 4: Creating ContractPack...');
    const contractPack = await prisma.contractPack.create({
      data: {
        workspaceId: workspace.id,
        name: 'Production Contract Pack',
        description: 'Validates API contracts and infrastructure changes',
        version: 'v1',
        contracts: [
          // Contract 1: PublicAPI
          {
            contractId: 'public-api-contract',
            name: 'Public API Contract',
            description: 'Ensures OpenAPI spec is valid and breaking changes are documented',
            surfaces: ['api'],
            artifacts: [
              {
                artifactId: 'openapi_spec',
                name: 'OpenAPI Specification',
                type: 'github_file',
                path: 'openapi/openapi.yaml',
                required: true,
              },
            ],
            invariants: [
              {
                invariantId: 'openapi-valid',
                name: 'OpenAPI Validation',
                description: 'OpenAPI spec must be valid',
                enabled: true,
                severity: 'critical',
                comparatorType: 'openapi.validate',
              },
              {
                invariantId: 'openapi-breaking-changes',
                name: 'Breaking Changes Detection',
                description: 'Detect breaking changes in API',
                enabled: true,
                severity: 'high',
                comparatorType: 'openapi.diff',
              },
            ],
            enforcement: {
              mode: 'pr_gate',
              blockOnFail: true,
              warnOnWarn: true,
              requireApprovalOverride: true,
            },
            routing: {
              method: 'codeowners',
              fallbackChannel: '#api-team',
            },
          },
        ],
      },
    });
    console.log(`✅ ContractPack created: ${contractPack.id}\n`);

    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Production Test Workspace Created Successfully!\n');
    console.log('Workspace Details:');
    console.log('==================');
    console.log(`ID:        ${workspace.id}`);
    console.log(`Name:      ${workspace.name}`);
    console.log(`Slug:      ${workspace.slug}`);
    console.log(`Owner:     ${workspace.ownerEmail}\n`);
    console.log('Configuration:');
    console.log('==============');
    console.log(`DriftPlan:       ${driftPlan.id}`);
    console.log(`ContractPolicy:  ${contractPolicy.id} (${contractPolicy.mode})`);
    console.log(`ContractPack:    ${contractPack.id}\n`);
    console.log('Frontend URL:');
    console.log('=============');
    console.log(`http://localhost:3000/contracts?workspace=${workspace.id}\n`);
    console.log('═══════════════════════════════════════════════════════════');

    return { workspace, driftPlan, contractPolicy, contractPack };
  } catch (error) {
    console.error('❌ Error creating workspace:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createProductionTestWorkspace()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

