/**
 * Create Test Workspace and YAML Policy Pack for E2E Testing
 * 
 * This script:
 * 1. Creates a new test workspace
 * 2. Creates a YAML policy pack with all 10 comparators
 * 3. Publishes the pack
 * 4. Outputs the workspace ID and pack ID for E2E testing
 */

import { PrismaClient } from '@prisma/client';
import { computePackHashFull } from '../services/gatekeeper/yaml-dsl/canonicalize.js';
import yaml from 'yaml';

const prisma = new PrismaClient();

async function main() {
  console.log('[Setup] Creating test workspace and YAML policy pack...\n');

  // 1. Create test workspace
  const workspaceId = `test-yaml-e2e-${Date.now()}`;
  const workspace = await prisma.workspace.create({
    data: {
      id: workspaceId,
      name: 'YAML DSL E2E Test Workspace',
      slug: workspaceId,
      ownerEmail: 'test@verta.ai',
    },
  });

  console.log(`✅ Created workspace: ${workspace.id}`);
  console.log(`   Name: ${workspace.name}`);
  console.log(`   Slug: ${workspace.slug}\n`);

  // 2. Create comprehensive YAML pack that tests all 10 comparators
  const packYAML = `apiVersion: verta.ai/v1
kind: PolicyPack
metadata:
  id: e2e-comprehensive-pack
  version: 1.0.0
  name: E2E Comprehensive Test Pack
  description: Tests all 10 core comparators

scope:
  type: workspace
  workspaceId: ${workspaceId}
  branches:
    - main
    - develop
    - feature/*

rules:
  # Rule 1: Test ACTOR_IS_AGENT + HUMAN_APPROVAL_PRESENT
  - id: agent-pr-requires-human-approval
    name: Agent PRs Require Human Approval
    trigger:
      anyOf:
        - comparator: ACTOR_IS_AGENT
          params: {}
    obligations:
      - comparator: HUMAN_APPROVAL_PRESENT
        params: {}
        severity: critical
        decisionOnFail: block
        decisionOnUnknown: warn

  # Rule 2: Test NO_SECRETS_IN_DIFF
  - id: no-secrets-allowed
    name: No Secrets in Diff
    trigger:
      anyChangedPaths:
        - "**/*"
    obligations:
      - comparator: NO_SECRETS_IN_DIFF
        params: {}
        severity: critical
        decisionOnFail: block
        decisionOnUnknown: pass

  # Rule 3: Test CHANGED_PATH_MATCHES + ARTIFACT_UPDATED
  - id: api-changes-require-openapi-update
    name: API Changes Require OpenAPI Update
    trigger:
      anyChangedPaths:
        - "src/routes/**/*.ts"
        - "src/api/**/*.ts"
    obligations:
      - comparator: ARTIFACT_UPDATED
        params:
          artifactType: openapi
        severity: high
        decisionOnFail: warn
        decisionOnUnknown: pass

  # Rule 4: Test ARTIFACT_PRESENT + OPENAPI_SCHEMA_VALID
  - id: openapi-must-be-valid
    name: OpenAPI Spec Must Be Valid
    trigger:
      anyChangedPaths:
        - "docs/openapi.yaml"
        - "docs/openapi.json"
    obligations:
      - comparator: ARTIFACT_PRESENT
        params:
          artifactType: openapi
        severity: high
        decisionOnFail: warn
        decisionOnUnknown: pass
      - comparator: OPENAPI_SCHEMA_VALID
        params:
          artifactType: openapi
        severity: high
        decisionOnFail: warn
        decisionOnUnknown: pass

  # Rule 5: Test PR_TEMPLATE_FIELD_PRESENT
  - id: pr-description-required
    name: PR Description Required
    trigger:
      anyChangedPaths:
        - "**/*"
    obligations:
      - comparator: PR_TEMPLATE_FIELD_PRESENT
        params:
          fieldName: description
        severity: medium
        decisionOnFail: warn
        decisionOnUnknown: pass

  # Rule 6: Test MIN_APPROVALS
  - id: production-changes-require-two-approvals
    name: Production Changes Require 2 Approvals
    trigger:
      anyChangedPaths:
        - "infrastructure/**/*"
        - "k8s/**/*"
        - ".github/workflows/**/*"
    obligations:
      - comparator: MIN_APPROVALS
        params:
          minCount: 2
        severity: critical
        decisionOnFail: block
        decisionOnUnknown: warn

  # Rule 7: Test CHECKRUNS_PASSED
  - id: ci-must-pass
    name: CI Must Pass
    trigger:
      anyChangedPaths:
        - "**/*"
    obligations:
      - comparator: CHECKRUNS_PASSED
        params:
          requiredChecks:
            - "build"
            - "test"
        severity: high
        decisionOnFail: warn
        decisionOnUnknown: pass
`;

  // 3. Compute pack hash
  const packHash = computePackHashFull(packYAML);
  const parsedPack = yaml.parse(packYAML);

  console.log(`✅ Created YAML pack: ${parsedPack.metadata.name}`);
  console.log(`   Pack ID: ${parsedPack.metadata.id}`);
  console.log(`   Version: ${parsedPack.metadata.version}`);
  console.log(`   Pack Hash: ${packHash.substring(0, 16)}...`);
  console.log(`   Rules: ${parsedPack.rules.length}\n`);

  // 4. Create WorkspacePolicyPack
  const policyPack = await prisma.workspacePolicyPack.create({
    data: {
      workspaceId: workspace.id,
      id: 'e2e-test-pack',
      name: parsedPack.metadata.name,
      description: parsedPack.metadata.description,
      status: 'active',
      scopeType: 'workspace',
      scopeRef: workspace.id,
      trackAEnabled: true,
      trackAConfigYamlDraft: packYAML,
      trackAConfigYamlPublished: packYAML,
      trackAPackHashPublished: packHash,
      packStatus: 'published',
      publishedAt: new Date(),
      publishedBy: 'test-script',
      packMetadataId: parsedPack.metadata.id,
      packMetadataVersion: parsedPack.metadata.version,
      packMetadataName: parsedPack.metadata.name,
      versionHash: packHash.substring(0, 16),
    },
  });

  console.log(`✅ Created and published policy pack: ${policyPack.id}\n`);

  // 5. Create workspace defaults
  const workspaceDefaults = `approvalSemantics:
  humanApprovalKeywords:
    - "lgtm"
    - "approved"
    - "looks good"
  botUsernames:
    - "dependabot[bot]"
    - "renovate[bot]"
    - "github-actions[bot]"

artifactRegistry:
  openapi:
    paths:
      - "docs/openapi.yaml"
      - "docs/openapi.json"
      - "api/openapi.yaml"
  readme:
    paths:
      - "README.md"
      - "docs/README.md"

pathPatterns:
  apiRoutes:
    - "src/routes/**/*.ts"
    - "src/api/**/*.ts"
  infrastructure:
    - "infrastructure/**/*"
    - "k8s/**/*"
    - ".github/workflows/**/*"
  documentation:
    - "docs/**/*.md"
    - "README.md"
`;

  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { workspaceDefaultsYaml: workspaceDefaults },
  });

  console.log(`✅ Created workspace defaults\n`);

  // 6. Output summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('E2E TEST SETUP COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Workspace ID: ${workspace.id}`);
  console.log(`Policy Pack ID: ${policyPack.id}`);
  console.log(`Pack Hash: ${packHash}`);
  console.log(`\nUse these values in your E2E test:\n`);
  console.log(`const WORKSPACE_ID = '${workspace.id}';`);
  console.log(`const PACK_ID = '${policyPack.id}';`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

main()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

