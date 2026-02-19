/**
 * Fix Deploy Gate pack operators in database
 * Updates the existing pack's YAML to use == and <= instead of eq and lte
 */

import { PrismaClient } from '@prisma/client';
import yaml from 'yaml';

const prisma = new PrismaClient();

const WORKSPACE_ID = 'demo-workspace';
const TEST_REPO = 'Fredjr/vertaai-e2e-test';

async function fixDeployGateOperators() {
  try {
    console.log('[FixOperators] Finding Deploy Gate pack...');
    
    // Find the Deploy Gate pack
    const pack = await prisma.workspacePolicyPack.findFirst({
      where: {
        workspaceId: WORKSPACE_ID,
        scopeType: 'repo',
        scopeRef: TEST_REPO,
        name: 'Deploy Gate'
      }
    });
    
    if (!pack) {
      console.log('[FixOperators] No Deploy Gate pack found');
      return { success: false, error: 'Pack not found' };
    }
    
    console.log(`[FixOperators] Found pack: ${pack.id}`);
    
    // Parse the current YAML
    const currentYaml = pack.trackAConfigYamlPublished;
    if (!currentYaml) {
      console.log('[FixOperators] No published YAML found');
      return { success: false, error: 'No published YAML' };
    }
    
    // Replace operators in the YAML string
    let fixedYaml = currentYaml;
    fixedYaml = fixedYaml.replace(/operator: eq\b/g, 'operator: ==');
    fixedYaml = fixedYaml.replace(/operator: lte\b/g, 'operator: <=');
    
    console.log('[FixOperators] Fixed operators in YAML');
    
    // Update the pack
    await prisma.workspacePolicyPack.update({
      where: {
        workspaceId_id: {
          workspaceId: pack.workspaceId,
          id: pack.id
        }
      },
      data: {
        trackAConfigYamlPublished: fixedYaml,
        trackAConfigYamlDraft: fixedYaml,
        updatedAt: new Date(),
        updatedBy: 'fix-operators-script'
      }
    });
    
    console.log('[FixOperators] Updated pack in database');
    
    return {
      success: true,
      packId: pack.id,
      message: 'Operators fixed: eq → ==, lte → <='
    };
    
  } catch (error: any) {
    console.error('[FixOperators] Error:', error);
    return { success: false, error: error.message };
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fixDeployGateOperators()
    .then(result => {
      console.log('[FixOperators] Result:', JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('[FixOperators] Fatal error:', error);
      process.exit(1);
    });
}

export { fixDeployGateOperators };

