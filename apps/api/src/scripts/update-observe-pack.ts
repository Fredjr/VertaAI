/**
 * Update existing observe-core policy pack with new template
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function main() {
  console.log('[UpdatePack] Loading new template...');
  
  const templatePath = path.join(__dirname, '../services/gatekeeper/yaml-dsl/templates/observe-core-pack.yaml');
  const yamlContent = fs.readFileSync(templatePath, 'utf-8');
  
  // Compute new hash
  const hash = createHash('sha256').update(yamlContent).digest('hex');
  
  console.log('[UpdatePack] New template hash:', hash.substring(0, 16));
  
  // Find existing pack
  const pack = await prisma.workspacePolicyPack.findFirst({
    where: {
      workspaceId: 'demo-workspace',
      packMetadataId: 'verta.observe-core.v1',
    },
  });
  
  if (!pack) {
    console.error('[UpdatePack] Pack not found!');
    process.exit(1);
  }
  
  console.log('[UpdatePack] Found pack:', pack.id);
  console.log('[UpdatePack] Current hash:', pack.trackAPackHashPublished?.substring(0, 16));

  // Update pack with new YAML using compound unique key
  await prisma.workspacePolicyPack.update({
    where: {
      workspaceId_scopeType_scopeRef_packMetadataId_packMetadataVersion: {
        workspaceId: pack.workspaceId,
        scopeType: pack.scopeType,
        scopeRef: pack.scopeRef || '',
        packMetadataId: pack.packMetadataId!,
        packMetadataVersion: pack.packMetadataVersion!,
      },
    },
    data: {
      trackAConfigYamlPublished: yamlContent,
      trackAPackHashPublished: hash,
      versionHash: hash, // Also update versionHash
    },
  });
  
  console.log('[UpdatePack] ✅ Pack updated successfully!');
  console.log('[UpdatePack] New hash:', hash.substring(0, 16));
}

main()
  .catch((e) => {
    console.error('[UpdatePack] Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
