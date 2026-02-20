/**
 * Admin routes for one-time operations
 * SECURITY: These should be protected or removed in production
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { getTemplateById } from '../services/gatekeeper/yaml-dsl/templateRegistry.js';
import { computePackHashFull } from '../services/gatekeeper/yaml-dsl/canonicalize.js';
import yaml from 'yaml';

const router = Router();
const prisma = new PrismaClient();

const WORKSPACE_ID = 'demo-workspace';
const TEST_REPO = 'Fredjr/vertaai-e2e-test';

/**
 * DELETE /api/admin/delete-pack/:packId
 * Delete a policy pack by ID
 */
router.delete('/delete-pack/:packId', async (req: Request, res: Response) => {
  try {
    const { packId } = req.params;
    console.log(`[Admin] Deleting pack: ${packId}`);

    // First find the pack to get its compound key
    const pack = await prisma.workspacePolicyPack.findFirst({
      where: { id: packId }
    });

    if (!pack) {
      return res.status(404).json({ error: 'Pack not found' });
    }

    // Delete using compound unique key
    await prisma.workspacePolicyPack.delete({
      where: {
        workspaceId_id: {
          workspaceId: pack.workspaceId,
          id: packId
        }
      }
    });

    console.log(`[Admin] Deleted pack: ${packId}`);
    res.json({ success: true, packId });
  } catch (error: any) {
    console.error('[Admin] Failed to delete pack:', error);
    res.status(500).json({ error: 'Failed to delete pack', details: error.message });
  }
});

/**
 * POST /api/admin/recreate-observe-pack
 * One-time endpoint to recreate the observe pack with updated template
 */
router.post('/recreate-observe-pack', async (req: Request, res: Response) => {
  try {
    console.log('[Admin] Recreating observe pack...');
    
    // Step 1: Delete existing pack
    const deleteResult = await prisma.workspacePolicyPack.deleteMany({
      where: {
        workspaceId: WORKSPACE_ID,
        name: 'Production Test Pack - Observe Core'
      }
    });
    
    console.log(`[Admin] Deleted ${deleteResult.count} pack(s)`);
    
    // Step 2: Load template
    const template = getTemplateById('verta.observe-core.v1');
    
    if (!template) {
      return res.status(500).json({ error: 'Template not found' });
    }
    
    // Step 3: Customize template
    const packYAML = { ...template.parsed };
    packYAML.scope = {
      type: 'repo',
      repos: {
        include: [TEST_REPO]
      },
      branches: {
        include: [],
        exclude: []
      }
    };

    const yamlString = yaml.stringify(packYAML);
    const packHash = computePackHashFull(yamlString);
    
    // Step 4: Create new pack
    const pack = await prisma.workspacePolicyPack.create({
      data: {
        workspaceId: WORKSPACE_ID,
        name: 'Production Test Pack - Observe Core',
        description: 'Test pack for production validation - Observe mode with CORRECT severity levels',
        scopeType: 'repo',
        scopeRef: TEST_REPO,
        trackAEnabled: true,
        trackAConfigYamlDraft: yamlString,
        trackAConfigYamlPublished: yamlString,
        trackAPackHashPublished: packHash,
        versionHash: packHash,
        packStatus: 'published',
        publishedAt: new Date(),
        publishedBy: 'admin-api',
        packMetadataId: packYAML.metadata.id,
        packMetadataVersion: packYAML.metadata.version,
        packMetadataName: packYAML.metadata.name,
        status: 'ACTIVE',
        createdAt: new Date(),
        createdBy: 'admin-api',
        updatedAt: new Date(),
        updatedBy: 'admin-api',
      }
    });
    
    console.log(`[Admin] Created pack: ${pack.id}`);
    
    res.json({
      success: true,
      message: 'Pack recreated successfully',
      pack: {
        id: pack.id,
        name: pack.name,
        status: pack.status,
        packStatus: pack.packStatus,
        hash: pack.trackAPackHashPublished?.substring(0, 16),
        scopeType: pack.scopeType,
        scopeRef: pack.scopeRef,
      }
    });
    
  } catch (error) {
    console.error('[Admin] Error recreating pack:', error);
    res.status(500).json({ 
      error: 'Failed to recreate pack',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/admin/setup-scenario-4
 * Setup Test Scenario 4: Gate Status Facts
 */
router.post('/setup-scenario-4', async (req: Request, res: Response) => {
  try {
    console.log('[Admin] Setting up Scenario 4...');

    // Create Deploy Gate pack
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
        prEvents: ['labeled']
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
                operator: 'eq',
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
                operator: 'lte',
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

    const yamlString = yaml.stringify(packYAML);
    const packHash = computePackHashFull(yamlString);

    const pack = await prisma.workspacePolicyPack.create({
      data: {
        workspaceId: WORKSPACE_ID,
        name: 'Deploy Gate',
        description: 'Deploy gate that requires previous policy checks to pass',
        scopeType: 'repo',
        scopeRef: TEST_REPO,
        trackAEnabled: true,
        trackAConfigYamlDraft: yamlString,
        trackAConfigYamlPublished: yamlString,
        trackAPackHashPublished: packHash,
        versionHash: packHash,
        packStatus: 'published',
        publishedAt: new Date(),
        publishedBy: 'admin-api',
        packMetadataId: packYAML.metadata.id,
        packMetadataVersion: packYAML.metadata.version,
        packMetadataName: packYAML.metadata.name,
        status: 'ACTIVE',
        createdAt: new Date(),
        createdBy: 'admin-api',
        updatedAt: new Date(),
        updatedBy: 'admin-api',
      }
    });

    console.log(`[Admin] Created Deploy Gate pack: ${pack.id}`);

    res.json({
      success: true,
      message: 'Scenario 4 setup complete',
      pack: {
        id: pack.id,
        name: pack.name,
        status: pack.status,
        packStatus: pack.packStatus,
        hash: pack.trackAPackHashPublished?.substring(0, 16),
      },
      instructions: [
        '1. Create a PR (or use existing PR)',
        '2. Wait for "VertaAI Policy Pack" check to complete',
        '3. Add label "deploy" or "production" to the PR',
        '4. Verify "Deploy Gate" check runs and queries previous gate status'
      ]
    });

  } catch (error) {
    console.error('[Admin] Error setting up Scenario 4:', error);
    res.status(500).json({
      error: 'Failed to setup Scenario 4',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/admin/fix-deploy-gate-operators
 * Fix operators and fact names in existing Deploy Gate pack
 * - Operators: eq → ==, lte → <=
 * - Facts: gate.contractIntegrity.* → gate.previous.*
 */
router.post('/fix-deploy-gate-operators', async (req: Request, res: Response) => {
  try {
    console.log('[Admin] Fixing Deploy Gate operators and fact names...');

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
      return res.status(404).json({ error: 'Deploy Gate pack not found' });
    }

    console.log(`[Admin] Found pack: ${pack.id}`);

    // Get current YAML
    const currentYaml = pack.trackAConfigYamlPublished;
    if (!currentYaml) {
      return res.status(400).json({ error: 'No published YAML found' });
    }

    // Replace operators in the YAML string
    let fixedYaml = currentYaml;
    const eqCount = (fixedYaml.match(/operator: eq\b/g) || []).length;
    const lteCount = (fixedYaml.match(/operator: lte\b/g) || []).length;

    fixedYaml = fixedYaml.replace(/operator: eq\b/g, 'operator: ==');
    fixedYaml = fixedYaml.replace(/operator: lte\b/g, 'operator: <=');

    console.log(`[Admin] Replaced ${eqCount} 'eq' and ${lteCount} 'lte' operators`);

    // Replace fact names: gate.contractIntegrity.* → gate.previous.*
    const statusFactCount = (fixedYaml.match(/gate\.contractIntegrity\.status/g) || []).length;
    const findingsFactCount = (fixedYaml.match(/gate\.contractIntegrity\.findings/g) || []).length;

    fixedYaml = fixedYaml.replace(/gate\.contractIntegrity\.status/g, 'gate.previous.status');
    fixedYaml = fixedYaml.replace(/gate\.contractIntegrity\.findings/g, 'gate.previous.findings');

    console.log(`[Admin] Replaced ${statusFactCount} 'gate.contractIntegrity.status' and ${findingsFactCount} 'gate.contractIntegrity.findings' facts`);

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
        updatedBy: 'fix-operators-and-facts-script'
      }
    });

    console.log('[Admin] Updated pack in database');

    res.json({
      success: true,
      packId: pack.id,
      message: `Fixed operators: ${eqCount} eq → ==, ${lteCount} lte → <=. Fixed facts: ${statusFactCount} status, ${findingsFactCount} findings`
    });

  } catch (error: any) {
    console.error('[Admin] Failed to fix operators and facts:', error);
    res.status(500).json({ error: 'Failed to fix operators and facts', details: error.message });
  }
});

export default router;

