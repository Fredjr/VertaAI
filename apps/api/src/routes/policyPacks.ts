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
import { PrismaClient, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { z } from 'zod';
import { parsePackYAML, validatePackYAML } from '../services/gatekeeper/yaml-dsl/packValidator.js';
import { computePackHashFull } from '../services/gatekeeper/yaml-dsl/canonicalize.js';
import { parseWorkspaceDefaults, validateWorkspaceDefaults } from '../services/gatekeeper/yaml-dsl/workspaceDefaultsSchema.js';
import { loadAllTemplates, getTemplateById, getTemplateMetadata } from '../services/gatekeeper/yaml-dsl/templateRegistry.js';
import yaml from 'yaml';

const router: Router = Router();
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
      fallbackChannel: z.string().nullable().optional(),
    }),
    writeback: z.object({
      enabled: z.boolean(),
      autoApproveThreshold: z.number().nullable().optional(),
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

    if (!workspaceId || !id) {
      return res.status(400).json({ error: 'Missing workspaceId or id' });
    }

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

    if (!workspaceId) {
      return res.status(400).json({ error: 'Missing workspaceId' });
    }

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
        trackAConfig: (body.trackAConfig || {}) as Prisma.InputJsonValue,
        trackBEnabled: body.trackBEnabled || false,
        trackBConfig: (body.trackBConfig || {}) as Prisma.InputJsonValue,
        approvalTiers: (body.approvalTiers || {}) as Prisma.InputJsonValue,
        routing: (body.routing || {}) as Prisma.InputJsonValue,
        testMode: body.testMode || false,
        testModeConfig: (body.testModeConfig || {}) as Prisma.InputJsonValue,
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

    if (!workspaceId || !id) {
      return res.status(400).json({ error: 'Missing workspaceId or id' });
    }

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
        trackAConfig: newTrackAConfig as Prisma.InputJsonValue,
        trackBEnabled: body.trackBEnabled,
        trackBConfig: newTrackBConfig as Prisma.InputJsonValue,
        approvalTiers: newApprovalTiers as Prisma.InputJsonValue,
        routing: newRouting as Prisma.InputJsonValue,
        testMode: body.testMode,
        testModeConfig: body.testModeConfig as Prisma.InputJsonValue,
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

    if (!workspaceId || !id) {
      return res.status(400).json({ error: 'Missing workspaceId or id' });
    }

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

    if (!workspaceId || !id) {
      return res.status(400).json({ error: 'Missing workspaceId or id' });
    }

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

// ======================================================================
// YAML DSL ENDPOINTS (Track A Migration)
// ======================================================================

/**
 * POST /api/workspaces/:workspaceId/policy-packs/:id/publish
 * Publish a draft YAML pack
 */
router.post('/workspaces/:workspaceId/policy-packs/:id/publish', async (req: Request, res: Response) => {
  try {
    const { workspaceId, id } = req.params;
    const { publishedBy } = req.body;

    if (!workspaceId || !id) {
      return res.status(400).json({ error: 'Missing workspaceId or id' });
    }

    if (!publishedBy) {
      return res.status(400).json({ error: 'Missing publishedBy (user ID)' });
    }

    // Get the pack
    const pack = await prisma.workspacePolicyPack.findUnique({
      where: { workspaceId_id: { workspaceId, id } },
    });

    if (!pack) {
      return res.status(404).json({ error: 'Policy pack not found' });
    }

    if (!pack.trackAConfigYamlDraft) {
      return res.status(400).json({ error: 'No draft YAML to publish' });
    }

    // Parse and validate the draft YAML
    const validation = validatePackYAML(pack.trackAConfigYamlDraft);
    const packYAML = parsePackYAML(pack.trackAConfigYamlDraft);

    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid pack YAML',
        validationErrors: validation.errors
      });
    }

    // Validate metadata is present (required for published packs)
    if (!packYAML.metadata?.id || !packYAML.metadata?.version) {
      return res.status(400).json({
        error: 'Pack metadata.id and metadata.version are required for publishing'
      });
    }

    // Check for duplicate version
    const existing = await prisma.workspacePolicyPack.findFirst({
      where: {
        workspaceId: pack.workspaceId,
        scopeType: pack.scopeType,
        scopeRef: pack.scopeRef,
        packMetadataId: packYAML.metadata.id,
        packMetadataVersion: packYAML.metadata.version,
        packStatus: 'published',
        id: { not: id },  // Allow re-publishing same pack
      },
    });

    if (existing) {
      return res.status(409).json({
        error: `Pack version ${packYAML.metadata.id}@${packYAML.metadata.version} already published for this scope`
      });
    }

    // Compute pack hash
    const packHash = computePackHashFull(pack.trackAConfigYamlDraft);

    // Publish the pack
    const updatedPack = await prisma.workspacePolicyPack.update({
      where: { workspaceId_id: { workspaceId, id } },
      data: {
        trackAConfigYamlPublished: pack.trackAConfigYamlDraft,
        trackAPackHashPublished: packHash,
        packStatus: 'published',
        publishedAt: new Date(),
        publishedBy,
        packMetadataId: packYAML.metadata.id,
        packMetadataVersion: packYAML.metadata.version,
        packMetadataName: packYAML.metadata.name,
      },
    });

    res.json({
      policyPack: updatedPack,
      packHash,
      message: 'Pack published successfully'
    });
  } catch (error: any) {
    console.error('[PolicyPacks] Publish error:', error);
    res.status(500).json({ error: error.message || 'Failed to publish policy pack' });
  }
});

/**
 * POST /api/workspaces/:workspaceId/policy-packs/:id/validate
 * Validate pack YAML without publishing
 */
router.post('/workspaces/:workspaceId/policy-packs/:id/validate', async (req: Request, res: Response) => {
  try {
    const { workspaceId, id } = req.params;
    const { yamlContent } = req.body;

    if (!workspaceId || !id) {
      return res.status(400).json({ error: 'Missing workspaceId or id' });
    }

    if (!yamlContent) {
      return res.status(400).json({ error: 'Missing yamlContent' });
    }

    // Parse and validate
    try {
      const validation = validatePackYAML(yamlContent);

      if (!validation.valid) {
        return res.json({
          valid: false,
          errors: validation.errors
        });
      }

      const packYAML = parsePackYAML(yamlContent);

      // Compute pack hash for preview
      const packHash = computePackHashFull(yamlContent);

      res.json({
        valid: true,
        packHash,
        metadata: packYAML.metadata,
        ruleCount: packYAML.rules.length,
        message: 'Pack YAML is valid'
      });
    } catch (parseError: any) {
      res.json({
        valid: false,
        errors: [{ message: parseError.message, path: [] }]
      });
    }
  } catch (error: any) {
    console.error('[PolicyPacks] Validate error:', error);
    res.status(500).json({ error: error.message || 'Failed to validate policy pack' });
  }
});

/**
 * GET /api/workspaces/:workspaceId/policy-packs/templates
 * Get starter pack templates
 */
router.get('/workspaces/:workspaceId/policy-packs/templates', async (req: Request, res: Response) => {
  try {
    const templates = [
      {
        id: 'basic-microservices',
        name: 'Basic Microservices Pack',
        description: 'Essential checks for microservices: API contracts, human approval, no secrets',
        category: 'starter',
        yaml: `metadata:
  id: basic-microservices
  version: 1.0.0
  name: Basic Microservices Pack
  description: Essential checks for microservices

scope:
  type: workspace
  branches:
    include: ['main', 'master']

rules:
  - id: require-api-contract
    name: Require API Contract Updates
    description: API changes must update OpenAPI spec
    trigger:
      comparator: changed_path_matches
      config:
        patterns: ['src/api/**', 'src/routes/**']
    obligations:
      - comparator: artifact_updated
        config:
          artifactType: openapi_spec
          message: "API changes require OpenAPI spec update"
    decision: block

  - id: require-human-approval
    name: Require Human Approval
    description: Agent PRs must have human approval
    trigger:
      comparator: actor_is_agent
    obligations:
      - comparator: human_approval_present
        config:
          message: "Agent PRs require human approval"
    decision: block

  - id: no-secrets
    name: No Secrets in Diff
    description: Block PRs with secrets
    trigger:
      always: true
    obligations:
      - comparator: no_secrets_in_diff
        config:
          message: "Secrets detected in diff"
    decision: block
`,
      },
      {
        id: 'security-focused',
        name: 'Security-Focused Pack',
        description: 'Comprehensive security checks: secrets, approvals, checkruns',
        category: 'security',
        yaml: `metadata:
  id: security-focused
  version: 1.0.0
  name: Security-Focused Pack
  description: Comprehensive security checks

scope:
  type: workspace
  branches:
    include: ['main', 'master', 'production']

rules:
  - id: no-secrets
    name: No Secrets in Diff
    description: Block PRs with secrets
    trigger:
      always: true
    obligations:
      - comparator: no_secrets_in_diff
        config:
          message: "Secrets detected in diff"
    decision: block

  - id: require-security-review
    name: Require Security Review
    description: Security-sensitive changes need 2+ approvals
    trigger:
      comparator: changed_path_matches
      config:
        patterns: ['src/auth/**', 'src/security/**', '**/*.env*']
    obligations:
      - comparator: min_approvals
        config:
          minCount: 2
          message: "Security changes require 2+ approvals"
    decision: block

  - id: require-ci-pass
    name: Require CI to Pass
    description: All CI checks must pass
    trigger:
      always: true
    obligations:
      - comparator: checkruns_passed
        config:
          requiredChecks: ['test', 'lint', 'security-scan']
          message: "All CI checks must pass"
    decision: block
`,
      },
      {
        id: 'documentation-enforcement',
        name: 'Documentation Enforcement Pack',
        description: 'Ensure documentation is updated with code changes',
        category: 'documentation',
        yaml: `metadata:
  id: documentation-enforcement
  version: 1.0.0
  name: Documentation Enforcement Pack
  description: Ensure documentation is updated

scope:
  type: workspace
  branches:
    include: ['main', 'master']

rules:
  - id: require-pr-description
    name: Require PR Description
    description: PRs must have description field filled
    trigger:
      always: true
    obligations:
      - comparator: pr_template_field_present
        config:
          fieldName: description
          message: "PR description is required"
    decision: warn

  - id: api-changes-need-docs
    name: API Changes Need Docs
    description: API changes must update documentation
    trigger:
      comparator: changed_path_matches
      config:
        patterns: ['src/api/**', 'src/routes/**']
    obligations:
      - comparator: artifact_updated
        config:
          artifactType: api_documentation
          message: "API changes require documentation update"
    decision: warn
`,
      },
      {
        id: 'deployment-safety',
        name: 'Deployment Safety Pack',
        description: 'Safety checks for production deployments',
        category: 'deployment',
        yaml: `metadata:
  id: deployment-safety
  version: 1.0.0
  name: Deployment Safety Pack
  description: Safety checks for production deployments

scope:
  type: workspace
  branches:
    include: ['production', 'release/**']

rules:
  - id: require-multiple-approvals
    name: Require Multiple Approvals
    description: Production changes need 2+ approvals
    trigger:
      always: true
    obligations:
      - comparator: min_approvals
        config:
          minCount: 2
          message: "Production changes require 2+ approvals"
    decision: block

  - id: require-all-checks
    name: Require All Checks to Pass
    description: All CI/CD checks must pass
    trigger:
      always: true
    obligations:
      - comparator: checkruns_passed
        config:
          requiredChecks: ['test', 'lint', 'build', 'integration-test']
          message: "All checks must pass for production"
    decision: block

  - id: no-agent-direct-merge
    name: No Agent Direct Merge
    description: Agents cannot merge to production
    trigger:
      comparator: actor_is_agent
    obligations:
      - comparator: human_approval_present
        config:
          message: "Agent PRs to production require human approval"
    decision: block
`,
      },
    ];

    res.json({ templates });
  } catch (error: any) {
    console.error('[PolicyPacks] Templates error:', error);
    res.status(500).json({ error: error.message || 'Failed to get templates' });
  }
});

/**
 * GET /api/workspaces/:workspaceId/defaults
 * Get workspace defaults
 */
router.get('/workspaces/:workspaceId/defaults', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Missing workspaceId' });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { workspaceDefaultsYaml: true },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    res.json({
      workspaceDefaultsYaml: workspace.workspaceDefaultsYaml || null
    });
  } catch (error: any) {
    console.error('[PolicyPacks] Get defaults error:', error);
    res.status(500).json({ error: error.message || 'Failed to get workspace defaults' });
  }
});

/**
 * PUT /api/workspaces/:workspaceId/defaults
 * Update workspace defaults
 */
router.put('/workspaces/:workspaceId/defaults', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { workspaceDefaultsYaml } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Missing workspaceId' });
    }

    if (!workspaceDefaultsYaml) {
      return res.status(400).json({ error: 'Missing workspaceDefaultsYaml' });
    }

    // Parse and validate
    try {
      const validation = validateWorkspaceDefaults(workspaceDefaultsYaml);

      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid workspace defaults YAML',
          validationErrors: validation.errors
        });
      }

      const defaults = parseWorkspaceDefaults(workspaceDefaultsYaml);

      // Update workspace
      const workspace = await prisma.workspace.update({
        where: { id: workspaceId },
        data: { workspaceDefaultsYaml },
      });

      res.json({
        workspace,
        message: 'Workspace defaults updated successfully'
      });
    } catch (parseError: any) {
      res.status(400).json({
        error: 'Failed to parse workspace defaults YAML',
        details: parseError.message
      });
    }
  } catch (error: any) {
    console.error('[PolicyPacks] Update defaults error:', error);
    res.status(500).json({ error: error.message || 'Failed to update workspace defaults' });
  }
});

// ======================================================================
// TEMPLATE ENDPOINTS
// ======================================================================

/**
 * GET /api/workspaces/:workspaceId/policy-packs/templates
 * Get all available pack templates (metadata only)
 */
router.get('/workspaces/:workspaceId/policy-packs/templates', async (req: Request, res: Response) => {
  try {
    const templates = getTemplateMetadata();
    res.json({ templates });
  } catch (error: any) {
    console.error('[PolicyPacks] Get templates error:', error);
    res.status(500).json({ error: error.message || 'Failed to load templates' });
  }
});

/**
 * GET /api/workspaces/:workspaceId/policy-packs/templates/:templateId
 * Get a specific template with full YAML content
 */
router.get('/workspaces/:workspaceId/policy-packs/templates/:templateId', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const template = getTemplateById(templateId);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ template });
  } catch (error: any) {
    console.error('[PolicyPacks] Get template error:', error);
    res.status(500).json({ error: error.message || 'Failed to load template' });
  }
});

export default router;

