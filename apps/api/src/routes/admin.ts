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

export default router;

