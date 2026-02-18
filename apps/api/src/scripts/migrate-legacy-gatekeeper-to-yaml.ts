/**
 * Migration Script: Legacy Gatekeeper → YAML DSL Packs
 * 
 * Migrates existing workspaces from hardcoded gatekeeper logic to YAML-based policy packs.
 * Creates a default workspace-level pack that replicates current behavior.
 * 
 * Usage:
 *   npm run migrate:gatekeeper-to-yaml [--dry-run] [--workspace=<id>]
 */

import { PrismaClient } from '@prisma/client';
import { computePackHashFull } from '../services/gatekeeper/yaml-dsl/canonicalize.js';
import yaml from 'yaml';

const prisma = new PrismaClient();

interface MigrationOptions {
  dryRun: boolean;
  workspaceId?: string;
}

/**
 * Generate default YAML pack that replicates legacy gatekeeper behavior
 */
function generateDefaultYAMLPack(workspaceId: string): string {
  const pack = {
    metadata: {
      id: 'default-gatekeeper',
      version: '1.0.0',
      name: 'Default Gatekeeper Pack',
      description: 'Migrated from legacy hardcoded gatekeeper logic',
    },
    scope: {
      type: 'workspace',
      branches: {
        include: ['main', 'master', 'production', 'release/**'],
      },
    },
    rules: [
      {
        id: 'require-human-approval-for-agents',
        name: 'Require Human Approval for Agent PRs',
        description: 'Agent-authored PRs must have human approval before merge',
        trigger: {
          comparator: 'actor_is_agent',
        },
        obligations: [
          {
            comparator: 'human_approval_present',
            config: {
              message: 'Agent PRs require human approval',
            },
          },
        ],
        decision: 'block',
      },
      {
        id: 'no-secrets-in-diff',
        name: 'No Secrets in Diff',
        description: 'Block PRs that contain secrets or credentials',
        trigger: {
          always: true,
        },
        obligations: [
          {
            comparator: 'no_secrets_in_diff',
            config: {
              message: 'Secrets detected in diff - please remove before merging',
            },
          },
        ],
        decision: 'block',
      },
      {
        id: 'require-pr-description',
        name: 'Require PR Description',
        description: 'PRs should have a description explaining the changes',
        trigger: {
          always: true,
        },
        obligations: [
          {
            comparator: 'pr_template_field_present',
            config: {
              fieldName: 'description',
              message: 'Please add a description to your PR',
            },
          },
        ],
        decision: 'warn',
      },
      {
        id: 'api-changes-need-docs',
        name: 'API Changes Need Documentation',
        description: 'Changes to API routes should update API documentation',
        trigger: {
          comparator: 'changed_path_matches',
          config: {
            patterns: ['src/api/**', 'src/routes/**', 'apps/api/**'],
          },
        },
        obligations: [
          {
            comparator: 'artifact_updated',
            config: {
              artifactType: 'api_documentation',
              message: 'API changes should update documentation',
            },
          },
        ],
        decision: 'warn',
      },
    ],
  };

  return yaml.stringify(pack);
}

/**
 * Generate default workspace defaults YAML
 */
function generateDefaultWorkspaceDefaults(): string {
  const defaults = {
    approvalSemantics: {
      humanApprovalKeywords: ['lgtm', 'approved', 'looks good'],
      botUsernames: [
        'dependabot[bot]',
        'renovate[bot]',
        'github-actions[bot]',
        'vercel[bot]',
      ],
    },
    artifactRegistry: {
      services: [],
      globalArtifacts: [
        {
          type: 'openapi_spec',
          patterns: ['**/openapi.yaml', '**/openapi.yml', '**/swagger.yaml'],
        },
        {
          type: 'api_documentation',
          patterns: ['docs/api/**', 'README.md', 'API.md'],
        },
      ],
    },
    paths: {
      apiRoutes: ['src/api/**', 'src/routes/**', 'apps/api/**'],
      infrastructure: ['terraform/**', 'k8s/**', 'kubernetes/**', '.github/workflows/**'],
      documentation: ['docs/**', '*.md'],
    },
  };

  return yaml.stringify(defaults);
}

/**
 * Migrate a single workspace to YAML DSL
 */
async function migrateWorkspace(workspaceId: string, options: MigrationOptions): Promise<void> {
  // Check if workspace already has a default YAML pack
  const existingPack = await prisma.workspacePolicyPack.findFirst({
    where: {
      workspaceId,
      scopeType: 'workspace',
      packMetadataId: 'default-gatekeeper',
      packStatus: 'published',
    },
  });

  if (existingPack) {
    console.log(`⏭️  Skipping workspace ${workspaceId}: Already has default YAML pack`);
    return;
  }

  // Generate YAML pack and workspace defaults
  const yamlPack = generateDefaultYAMLPack(workspaceId);
  const workspaceDefaults = generateDefaultWorkspaceDefaults();

  // Compute pack hash (pass the YAML string, not the parsed object)
  const packHash = computePackHashFull(yamlPack);
  const packYAML = yaml.parse(yamlPack);

  if (options.dryRun) {
    console.log(`[DRY RUN] Would migrate workspace: ${workspaceId}`);
    console.log(`  Pack ID: default-gatekeeper@1.0.0`);
    console.log(`  Pack Hash: ${packHash.substring(0, 16)}...`);
    console.log(`  Rules: ${packYAML.rules.length}`);
    return;
  }

  // Create the policy pack
  await prisma.workspacePolicyPack.create({
    data: {
      workspaceId,
      name: 'Default Gatekeeper Pack',
      description: 'Migrated from legacy hardcoded gatekeeper logic',
      scopeType: 'workspace',
      scopeRef: null,
      trackAEnabled: true,
      trackAConfigYamlDraft: yamlPack,
      trackAConfigYamlPublished: yamlPack,
      trackAPackHashPublished: packHash,
      packStatus: 'published',
      publishedAt: new Date(),
      publishedBy: 'system-migration',
      packMetadataId: packYAML.metadata.id,
      packMetadataVersion: packYAML.metadata.version,
      packMetadataName: packYAML.metadata.name,
      trackBEnabled: false,
      trackBConfig: {},
      versionHash: packHash.substring(0, 16), // Use short hash for version tracking
    },
  });

  // Update workspace defaults
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { workspaceDefaultsYaml: workspaceDefaults },
  });

  console.log(`✅ Migrated workspace: ${workspaceId} → YAML DSL`);
}

/**
 * Main migration function
 */
async function migrateGatekeeperToYAML(options: MigrationOptions): Promise<void> {
  console.log('🚀 Starting Legacy Gatekeeper → YAML DSL migration...\n');

  if (options.dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  // Fetch all workspaces (or filtered by ID)
  const where = options.workspaceId ? { id: options.workspaceId } : {};
  const workspaces = await prisma.workspace.findMany({ where });

  console.log(`Found ${workspaces.length} workspace(s) to migrate\n`);

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const workspace of workspaces) {
    try {
      await migrateWorkspace(workspace.id, options);
      successCount++;
    } catch (error: any) {
      if (error.message?.includes('Already has default YAML pack')) {
        skippedCount++;
      } else {
        console.error(`❌ Failed to migrate workspace ${workspace.id}:`, error);
        errorCount++;
      }
    }
  }

  console.log('\n📊 Migration Summary:');
  console.log(`  ✅ Migrated: ${successCount}`);
  console.log(`  ⏭️  Skipped: ${skippedCount}`);
  console.log(`  ❌ Errors: ${errorCount}`);
  console.log(`  📦 Total: ${workspaces.length}`);
}

/**
 * Parse command-line arguments
 */
function parseArgs(): MigrationOptions {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    dryRun: args.includes('--dry-run'),
    workspaceId: undefined,
  };

  const workspaceArg = args.find(arg => arg.startsWith('--workspace='));
  if (workspaceArg) {
    options.workspaceId = workspaceArg.split('=')[1];
  }

  return options;
}

/**
 * Run migration
 */
async function main() {
  try {
    const options = parseArgs();
    await migrateGatekeeperToYAML(options);
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();


