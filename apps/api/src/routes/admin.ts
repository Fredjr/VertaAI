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

export default router;

