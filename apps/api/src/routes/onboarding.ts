/**
 * Onboarding API Routes
 * 
 * Provides endpoints for:
 * - Workspace setup status (which integrations are connected)
 * - Webhook URL generation
 * - Doc mapping management (repo → doc associations)
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { prisma } from '../lib/db.js';

const router: RouterType = Router();

const API_URL = process.env.API_URL || 'http://localhost:3001';

/**
 * GET /api/workspaces/:workspaceId/setup-status
 * Returns the setup status for all integrations
 */
router.get('/:workspaceId/setup-status', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;

  try {
    // Get workspace with all integrations
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        integrations: true,
        _count: {
          select: {
            signalEvents: true,
            driftCandidates: true,
          }
        }
      }
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Build integration status map
    const integrations: Record<string, any> = {
      github: { connected: false, status: 'not_installed' },
      confluence: { connected: false, status: 'not_installed' },
      slack: { connected: false, status: 'not_installed' },
      notion: { connected: false, status: 'not_installed' },
      pagerduty: { connected: false, status: 'not_installed' },
    };

    for (const int of workspace.integrations) {
      const config = int.config as any || {};
      integrations[int.type] = {
        connected: int.status === 'connected',
        status: int.status,
        ...(int.type === 'github' && {
          repos: config.repos || [],
          installationId: config.installationId,
        }),
        ...(int.type === 'slack' && {
          teamName: config.teamName,
        }),
        ...(int.type === 'confluence' && {
          siteName: config.siteName,
          siteUrl: config.siteUrl,
        }),
        ...(int.type === 'notion' && {
          workspaceName: config.workspaceName,
        }),
      };
    }

    // Count connected integrations
    const connectedCount = Object.values(integrations).filter((i: any) => i.connected).length;
    const totalRequired = 3; // GitHub, Confluence/Notion, Slack

    // Get doc mappings count
    const docMappingsCount = await prisma.docMappingV2.count({
      where: { workspaceId }
    });

    return res.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      },
      integrations,
      progress: {
        connected: connectedCount,
        required: totalRequired,
        percentage: Math.round((connectedCount / totalRequired) * 100),
      },
      stats: {
        signalEvents: workspace._count.signalEvents,
        driftCandidates: workspace._count.driftCandidates,
        docMappings: docMappingsCount,
      },
      webhookUrls: {
        github: `${API_URL}/webhooks/github/${workspaceId}`,
        pagerduty: `${API_URL}/webhooks/pagerduty/${workspaceId}`,
      },
    });
  } catch (err: any) {
    console.error(`[Onboarding] Setup status error:`, err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/workspaces/:workspaceId/webhook-urls
 * Returns webhook URLs for the workspace
 */
router.get('/:workspaceId/webhook-urls', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        integrations: {
          where: { type: 'github' },
          select: { webhookSecret: true }
        }
      }
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const githubIntegration = workspace.integrations[0];

    return res.json({
      github: {
        url: `${API_URL}/webhooks/github/${workspaceId}`,
        secret: githubIntegration?.webhookSecret || null,
        instructions: 'Configure this URL in your GitHub repository Settings > Webhooks. Use the secret for signature verification.',
      },
      pagerduty: {
        url: `${API_URL}/webhooks/pagerduty/${workspaceId}`,
        instructions: 'Configure this URL in PagerDuty Service > Integrations > Generic Webhooks V3.',
      },
    });
  } catch (err: any) {
    console.error(`[Onboarding] Webhook URLs error:`, err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/workspaces/:workspaceId/doc-mappings
 * List all doc mappings for the workspace
 */
router.get('/:workspaceId/doc-mappings', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;

  try {
    const mappings = await prisma.docMappingV2.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({
      mappings: mappings.map(m => ({
        id: m.id.toString(),
        repo: m.repo,
        service: m.service,
        docId: m.docId,
        docSystem: m.docSystem,
        docTitle: m.docTitle,
        docUrl: m.docUrl,
        isPrimary: m.isPrimary,
        spaceKey: m.spaceKey,
        createdAt: m.createdAt,
      })),
      count: mappings.length,
    });
  } catch (err: any) {
    console.error(`[Onboarding] List doc mappings error:`, err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/workspaces/:workspaceId/doc-mappings
 * Add a new doc mapping (repo → doc association)
 *
 * Body:
 * - repo: string (e.g., "owner/repo")
 * - service: string (optional, e.g., "api-service")
 * - docId: string (Confluence page ID or Notion page ID)
 * - docTitle: string (title of the document)
 * - docSystem: "confluence" | "notion"
 * - docUrl: string (optional, URL to the document)
 * - isPrimary: boolean (default: false)
 * - spaceKey: string (optional, Confluence space key)
 */
router.post('/:workspaceId/doc-mappings', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;
  const { repo, service, docId, docTitle, docSystem, docUrl, isPrimary, spaceKey } = req.body;

  // Validate required fields
  if (!docId || !docTitle || !docSystem) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['docId', 'docTitle', 'docSystem'],
      optional: ['repo', 'service', 'docUrl', 'isPrimary', 'spaceKey'],
      example: {
        repo: 'myorg/myrepo',
        service: 'api-service',
        docId: '123456789',
        docTitle: 'API Documentation',
        docSystem: 'confluence',
        docUrl: 'https://mycompany.atlassian.net/wiki/spaces/DOCS/pages/123456789',
        isPrimary: true,
        spaceKey: 'DOCS'
      }
    });
  }

  if (!['confluence', 'notion'].includes(docSystem)) {
    return res.status(400).json({
      error: 'Invalid docSystem',
      allowed: ['confluence', 'notion']
    });
  }

  try {
    // Verify workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId }
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Create the mapping
    const mapping = await prisma.docMappingV2.create({
      data: {
        workspaceId,
        repo: repo || null,
        service: service || null,
        docId,
        docTitle,
        docSystem,
        docUrl: docUrl || null,
        isPrimary: isPrimary || false,
        spaceKey: spaceKey || null,
      }
    });

    console.log(`[Onboarding] Created doc mapping: ${repo || service || 'default'} → ${docSystem}:${docId} for workspace ${workspaceId}`);

    return res.status(201).json({
      success: true,
      mapping: {
        id: mapping.id.toString(),
        repo: mapping.repo,
        service: mapping.service,
        docId: mapping.docId,
        docTitle: mapping.docTitle,
        docSystem: mapping.docSystem,
        docUrl: mapping.docUrl,
        isPrimary: mapping.isPrimary,
        spaceKey: mapping.spaceKey,
        createdAt: mapping.createdAt,
      }
    });
  } catch (err: any) {
    console.error(`[Onboarding] Create doc mapping error:`, err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/workspaces/:workspaceId/doc-mappings/:mappingId
 * Delete a doc mapping
 */
router.delete('/:workspaceId/doc-mappings/:mappingId', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;
  const mappingId = req.params.mappingId as string;

  try {
    // Verify the mapping belongs to this workspace
    const mapping = await prisma.docMappingV2.findFirst({
      where: {
        id: BigInt(mappingId),
        workspaceId,
      }
    });

    if (!mapping) {
      return res.status(404).json({ error: 'Mapping not found' });
    }

    await prisma.docMappingV2.delete({
      where: { id: BigInt(mappingId) }
    });

    console.log(`[Onboarding] Deleted doc mapping ${mappingId} for workspace ${workspaceId}`);

    return res.json({ success: true, deleted: mappingId });
  } catch (err: any) {
    console.error(`[Onboarding] Delete doc mapping error:`, err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;

