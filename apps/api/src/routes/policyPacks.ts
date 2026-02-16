/**
 * API Routes: WorkspacePolicyPack (P2 Unified Policy Pack)
 * 
 * Unified CRUD endpoints for both Track A (Contract Integrity) and Track B (Drift Remediation)
 * 
 * Routes:
 *   GET    /api/workspaces/:workspaceId/policy-packs
 *   GET    /api/workspaces/:workspaceId/policy-packs/:id
 *   POST   /api/workspaces/:workspaceId/policy-packs
 *   PUT    /api/workspaces/:workspaceId/policy-packs/:id
 *   DELETE /api/workspaces/:workspaceId/policy-packs/:id
 *   POST   /api/workspaces/:workspaceId/policy-packs/:id/test
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

// ======================================================================
// VALIDATION SCHEMAS
// ======================================================================

const TrackAConfigSchema = z.object({
  surfaces: z.array(z.enum(['api', 'infra', 'docs', 'data_model', 'observability', 'security'])).optional(),
  contracts: z.array(z.object({
    contractId: z.string(),
    name: z.string(),
    description: z.string().optional(),
    scope: z.object({
      service: z.string().optional(),
      repo: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }).optional(),
    artifacts: z.array(z.object({
      system: z.enum(['github', 'confluence', 'notion', 'grafana', 'datadog']),
      type: z.string(),
      locator: z.record(z.any()),
      role: z.enum(['primary', 'secondary', 'reference']),
      required: z.boolean(),
      freshnessSlaHours: z.number().optional(),
    })),
    invariants: z.array(z.object({
      invariantId: z.string(),
      name: z.string(),
      description: z.string().optional(),
      enabled: z.boolean(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      comparatorType: z.string(),
      config: z.record(z.any()).optional(),
    })),
    enforcement: z.object({
      mode: z.enum(['pr_gate', 'async_notify', 'both']),
      blockOnFail: z.boolean(),
      warnOnWarn: z.boolean(),
      requireApprovalOverride: z.boolean(),
    }),
    routing: z.object({
      method: z.enum(['contract', 'codeowners', 'service_owner', 'fallback']),
      fallbackChannel: z.string().optional(),
    }),
    writeback: z.object({
      enabled: z.boolean(),
      autoApproveThreshold: z.number().optional(),
      requiresApproval: z.boolean(),
      targetArtifacts: z.array(z.string()),
    }),
  })).optional(),
  dictionaries: z.record(z.any()).optional(),
  extraction: z.record(z.any()).optional(),
  safety: z.record(z.any()).optional(),
  enforcement: z.object({
    mode: z.enum(['warn_only', 'block_high_critical', 'block_all_critical']),
    criticalThreshold: z.number().min(0).max(100),
    highThreshold: z.number().min(0).max(100),
    mediumThreshold: z.number().min(0).max(100),
  }).optional(),
  gracefulDegradation: z.record(z.any()).optional(),
  appliesTo: z.array(z.record(z.any())).optional(),
});

const TrackBConfigSchema = z.object({
  primaryDoc: z.object({
    system: z.string().optional(),
    id: z.string().optional(),
    title: z.string().optional(),
    url: z.string().optional(),
    class: z.string().optional(),
  }).optional(),
  inputSources: z.array(z.object({
    type: z.enum(['github_pr', 'pagerduty_incident', 'slack_cluster', 'datadog_alert', 'grafana_alert']),
    enabled: z.boolean(),
    config: z.record(z.any()).optional(),
  })).optional(),
  driftTypes: z.array(z.object({
    type: z.enum(['instruction', 'process', 'ownership', 'coverage', 'environment_tooling']),
    enabled: z.boolean(),
    sectionTarget: z.string().optional(),
  })).optional(),
  materiality: z.object({
    autoApprove: z.number().min(0).max(1),
    slackNotify: z.number().min(0).max(1),
    digestOnly: z.number().min(0).max(1),
    ignore: z.number().min(0).max(1),
  }).optional(),
  docTargeting: z.record(z.any()).optional(),
  noiseControls: z.record(z.any()).optional(),
  allowedOutputs: z.array(z.string()).optional(),
  eligibility: z.record(z.any()).optional(),
  impactRules: z.record(z.any()).optional(),
  writeback: z.record(z.any()).optional(),
  sourceCursors: z.record(z.any()).optional(),
  budgets: z.record(z.any()).optional(),
});

const CreatePolicyPackSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['active', 'draft', 'archived']).optional(),
  scopeType: z.enum(['workspace', 'service', 'repo']),
  scopeRef: z.string().optional(),
  repoAllowlist: z.array(z.string()).optional(),
  pathGlobs: z.array(z.string()).optional(),
  trackAEnabled: z.boolean().optional(),
  trackAConfig: TrackAConfigSchema.optional(),
  trackBEnabled: z.boolean().optional(),
  trackBConfig: TrackBConfigSchema.optional(),
  approvalTiers: z.record(z.any()).optional(),
  routing: z.record(z.any()).optional(),
  testMode: z.boolean().optional(),
  testModeConfig: z.record(z.any()).optional(),
});

const UpdatePolicyPackSchema = CreatePolicyPackSchema.partial();

// ======================================================================
// HELPER FUNCTIONS
// ======================================================================

/**
 * Generate version hash for policy pack
 */
function generateVersionHash(config: any): string {
  const content = JSON.stringify(config, Object.keys(config).sort());
  return createHash('sha256').update(content).digest('hex').substring(0, 16);
}

// ======================================================================
// ROUTE HANDLERS
// ======================================================================

/**
 * GET /api/workspaces/:workspaceId/policy-packs
 * List all policy packs for a workspace
 */
router.get('/workspaces/:workspaceId/policy-packs', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { status, trackAEnabled, trackBEnabled } = req.query;

    const where: any = { workspaceId };

    if (status) where.status = status;
    if (trackAEnabled !== undefined) where.trackAEnabled = trackAEnabled === 'true';
    if (trackBEnabled !== undefined) where.trackBEnabled = trackBEnabled === 'true';

    const policyPacks = await prisma.workspacePolicyPack.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ policyPacks });
  } catch (error) {
    console.error('[PolicyPacks] List error:', error);
    res.status(500).json({ error: 'Failed to list policy packs' });
  }
});

/**
 * GET /api/workspaces/:workspaceId/policy-packs/:id
 * Get a specific policy pack
 */
router.get('/workspaces/:workspaceId/policy-packs/:id', async (req: Request, res: Response) => {
  try {
    const { workspaceId, id } = req.params;

    const policyPack = await prisma.workspacePolicyPack.findUnique({
      where: {
        workspaceId_id: { workspaceId, id },
      },
    });

    if (!policyPack) {
      return res.status(404).json({ error: 'Policy pack not found' });
    }

    res.json({ policyPack });
  } catch (error) {
    console.error('[PolicyPacks] Get error:', error);
    res.status(500).json({ error: 'Failed to get policy pack' });
  }
});

/**
 * POST /api/workspaces/:workspaceId/policy-packs
 * Create a new policy pack
 */
router.post('/workspaces/:workspaceId/policy-packs', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const body = CreatePolicyPackSchema.parse(req.body);

    // Generate version hash
    const versionHash = generateVersionHash({
      trackAConfig: body.trackAConfig || {},
      trackBConfig: body.trackBConfig || {},
      approvalTiers: body.approvalTiers || {},
      routing: body.routing || {},
    });

    const policyPack = await prisma.workspacePolicyPack.create({
      data: {
        workspaceId,
        name: body.name,
        description: body.description,
        status: body.status || 'active',
        scopeType: body.scopeType,
        scopeRef: body.scopeRef,
        repoAllowlist: body.repoAllowlist || [],
        pathGlobs: body.pathGlobs || [],
        trackAEnabled: body.trackAEnabled || false,
        trackAConfig: body.trackAConfig || {},
        trackBEnabled: body.trackBEnabled || false,
        trackBConfig: body.trackBConfig || {},
        approvalTiers: body.approvalTiers || {},
        routing: body.routing || {},
        testMode: body.testMode || false,
        testModeConfig: body.testModeConfig || {},
        version: 1,
        versionHash,
        createdBy: req.headers['x-user-id'] as string,
      },
    });

    res.status(201).json({ policyPack });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[PolicyPacks] Create error:', error);
    res.status(500).json({ error: 'Failed to create policy pack' });
  }
});

/**
 * PUT /api/workspaces/:workspaceId/policy-packs/:id
 * Update a policy pack (creates new version)
 */
router.put('/workspaces/:workspaceId/policy-packs/:id', async (req: Request, res: Response) => {
  try {
    const { workspaceId, id } = req.params;
    const body = UpdatePolicyPackSchema.parse(req.body);

    // Get existing policy pack
    const existing = await prisma.workspacePolicyPack.findUnique({
      where: { workspaceId_id: { workspaceId, id } },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Policy pack not found' });
    }

    // Merge configs
    const newTrackAConfig = body.trackAConfig !== undefined ? body.trackAConfig : existing.trackAConfig;
    const newTrackBConfig = body.trackBConfig !== undefined ? body.trackBConfig : existing.trackBConfig;
    const newApprovalTiers = body.approvalTiers !== undefined ? body.approvalTiers : existing.approvalTiers;
    const newRouting = body.routing !== undefined ? body.routing : existing.routing;

    // Generate new version hash
    const versionHash = generateVersionHash({
      trackAConfig: newTrackAConfig,
      trackBConfig: newTrackBConfig,
      approvalTiers: newApprovalTiers,
      routing: newRouting,
    });

    const policyPack = await prisma.workspacePolicyPack.update({
      where: { workspaceId_id: { workspaceId, id } },
      data: {
        name: body.name,
        description: body.description,
        status: body.status,
        scopeType: body.scopeType,
        scopeRef: body.scopeRef,
        repoAllowlist: body.repoAllowlist,
        pathGlobs: body.pathGlobs,
        trackAEnabled: body.trackAEnabled,
        trackAConfig: newTrackAConfig,
        trackBEnabled: body.trackBEnabled,
        trackBConfig: newTrackBConfig,
        approvalTiers: newApprovalTiers,
        routing: newRouting,
        testMode: body.testMode,
        testModeConfig: body.testModeConfig,
        version: existing.version + 1,
        versionHash,
        parentId: existing.id,
        updatedBy: req.headers['x-user-id'] as string,
      },
    });

    res.json({ policyPack });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[PolicyPacks] Update error:', error);
    res.status(500).json({ error: 'Failed to update policy pack' });
  }
});

/**
 * DELETE /api/workspaces/:workspaceId/policy-packs/:id
 * Delete a policy pack (soft delete by setting status to 'archived')
 */
router.delete('/workspaces/:workspaceId/policy-packs/:id', async (req: Request, res: Response) => {
  try {
    const { workspaceId, id } = req.params;
    const { hard } = req.query;

    if (hard === 'true') {
      // Hard delete (use with caution)
      await prisma.workspacePolicyPack.delete({
        where: { workspaceId_id: { workspaceId, id } },
      });
      res.json({ message: 'Policy pack deleted permanently' });
    } else {
      // Soft delete (recommended)
      const policyPack = await prisma.workspacePolicyPack.update({
        where: { workspaceId_id: { workspaceId, id } },
        data: {
          status: 'archived',
          updatedBy: req.headers['x-user-id'] as string,
        },
      });
      res.json({ policyPack, message: 'Policy pack archived' });
    }
  } catch (error) {
    console.error('[PolicyPacks] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete policy pack' });
  }
});

/**
 * POST /api/workspaces/:workspaceId/policy-packs/:id/test
 * Test a policy pack in dry-run mode
 */
router.post('/workspaces/:workspaceId/policy-packs/:id/test', async (req: Request, res: Response) => {
  try {
    const { workspaceId, id } = req.params;
    const { prNumber, service, repo } = req.body;

    const policyPack = await prisma.workspacePolicyPack.findUnique({
      where: { workspaceId_id: { workspaceId, id } },
    });

    if (!policyPack) {
      return res.status(404).json({ error: 'Policy pack not found' });
    }

    // TODO: Implement test mode execution
    // This would run the policy pack in dry-run mode without actually blocking PRs
    // or creating real findings

    const testResults = {
      policyPackId: id,
      testMode: true,
      timestamp: new Date().toISOString(),
      context: { prNumber, service, repo },
      trackA: policyPack.trackAEnabled ? {
        enabled: true,
        contracts: [], // Would be populated by actual contract validation
        findings: [],
        wouldBlock: false,
      } : null,
      trackB: policyPack.trackBEnabled ? {
        enabled: true,
        drifts: [], // Would be populated by actual drift detection
        suggestions: [],
        wouldUpdate: false,
      } : null,
      message: 'Test mode execution completed (dry-run)',
    };

    res.json({ testResults });
  } catch (error) {
    console.error('[PolicyPacks] Test error:', error);
    res.status(500).json({ error: 'Failed to test policy pack' });
  }
});

export default router;

