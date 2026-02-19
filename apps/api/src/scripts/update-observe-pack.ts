/**
 * Update existing observe-core policy pack with new template
 *
 * This script re-runs the setup to update the database with the new template YAML
 * that has correct severity levels (decisionOnFail: block/warn instead of pass)
 */

import { PrismaClient } from '@prisma/client';
import { getTemplateById } from '../services/gatekeeper/yaml-dsl/templateRegistry.js';
import { computePackHashFull } from '../services/gatekeeper/yaml-dsl/canonicalize.js';
import yaml from 'yaml';

const prisma = new PrismaClient();

const WORKSPACE_ID = 'demo-workspace';
const TEST_REPO = 'Fredjr/vertaai-e2e-test';

async function main() {
  console.log('[UpdatePack] Loading new template from registry...');

  const template = getTemplateById('verta.observe-core.v1');

  if (!template) {
    console.error('[UpdatePack] Template not found: verta.observe-core.v1');
    process.exit(1);
  }

  // Use the already-parsed template
  const packYAML = { ...template.parsed };

  // Customize for test repository
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

  // Convert to YAML string and compute hash
  const yamlString = yaml.stringify(packYAML);
  const packHash = computePackHashFull(yamlString);

  console.log('[UpdatePack] New template hash:', packHash.substring(0, 16));

  // Find existing pack
  const existingPack = await prisma.workspacePolicyPack.findFirst({
    where: {
      workspaceId: WORKSPACE_ID,
      name: 'Production Test Pack - Observe Core'
    }
  });

  if (!existingPack) {
    console.error('[UpdatePack] Pack not found!');
    process.exit(1);
  }

  console.log('[UpdatePack] Found pack:', existingPack.id);
  console.log('[UpdatePack] Current hash:', existingPack.trackAPackHashPublished?.substring(0, 16));

  // Update pack with new YAML
  await prisma.workspacePolicyPack.update({
    where: {
      workspaceId_id: {
        workspaceId: WORKSPACE_ID,
        id: existingPack.id
      }
    },
    data: {
      trackAConfigYamlPublished: yamlString,
      trackAPackHashPublished: packHash,
      versionHash: packHash,
      updatedAt: new Date(),
      updatedBy: 'update-script',
    }
  });

  console.log('[UpdatePack] ✅ Pack updated successfully!');
  console.log('[UpdatePack] New hash:', packHash.substring(0, 16));
  console.log('[UpdatePack] The database now has the updated template with correct severity levels');
}

main()
  .catch((e) => {
    console.error('[UpdatePack] Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
