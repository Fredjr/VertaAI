import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { prisma } from './lib/db.js';
import webhooksRouter from './routes/webhooks.js';
import pagerdutyRouter from './routes/pagerduty.js';
import slackOAuthRouter from './routes/slack-oauth.js';
import slackInteractionsRouter from './routes/slack-interactions.js';
import confluenceOAuthRouter from './routes/confluence-oauth.js';
import notionOAuthRouter from './routes/notion-oauth.js';
import githubOAuthRouter from './routes/github-oauth.js';
import githubRouter from './routes/github.js';
import onboardingRouter from './routes/onboarding.js';
import slackChannelsRouter from './routes/slack-channels.js';
import jobsRouter from './routes/jobs.js';
import settingsRouter from './routes/settings.js';  // Phase 5: Workflow Settings
import datadogRouter from './routes/datadog.js';  // Phase 5: Datadog/Grafana Webhooks
import plansRouter from './routes/plans.js';  // Phase 3: DriftPlan Management
// import coverageRouter from './routes/coverage.js';  // Phase 3 Week 6: Coverage Monitoring - TEMPORARILY DISABLED
import auditRouter from './routes/audit.js';  // Phase 4 Week 8: Audit Trail & Compliance
import monitoringRouter from './routes/monitoring.js';  // Production monitoring endpoints
import testWebhooksRouter from './routes/test-webhooks.js';  // Test endpoint for E2E testing
import healthCheckRouter from './routes/health-check.js';  // Health check endpoints
import contractPacksRouter from './routes/contractPacks.js';  // Phase 1 Week 1-2: Contract Packs Management
import contractPoliciesRouter from './routes/contractPolicies.js';  // Week 5-6: Contract Policies Management
import policyPacksRouter from './routes/policyPacks.js';  // P2 Week 7: Unified WorkspacePolicyPack Management
import adminRouter from './routes/admin.js';  // Admin routes for one-time operations
import runtimeRouter from './routes/runtime/index.js';  // Agent Governance: Runtime observation webhooks
import { registerSseClient, unregisterSseClient, notifyGovernanceSse, activeSseClientCount } from './lib/governanceSse.js';  // Track 1: real-time SSE push
import { initializeComparators } from './services/gatekeeper/yaml-dsl/comparators/index.js';  // YAML DSL Migration
import { buildCompactSummary, type ParsedDriftCluster } from './services/governance/compactSummaryBuilder.js';  // Phase 2: Compact governance summary
import { buildWorkspaceGovernanceMarkdown } from './services/governance/claudeMdWriter.js';  // Phase 3+4: governance markdown builder
import { createGovernanceMcpServer, registerSession, unregisterSession } from '@vertaai/mcp-server';  // Phase 4: MCP resource server
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';  // Phase 4: MCP transport
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';  // Phase 4: MCP session check
import { randomUUID } from 'node:crypto';  // Phase 4: session ID generator

const app: Application = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(cookieParser());
// Preserve raw body for webhook signature verification
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ extended: true })); // For Slack form-encoded payloads

// Health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      service: 'vertaai-api',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      service: 'vertaai-api',
      database: 'disconnected',
      timestamp: new Date().toISOString()
    });
  }
});

// Webhook routes
app.use('/webhooks', webhooksRouter);
app.use('/webhooks/pagerduty', pagerdutyRouter);
app.use('/webhooks', datadogRouter);  // Phase 5: Datadog/Grafana alert webhooks

// Test webhook routes (for E2E testing without signature validation)
app.use('/test/webhooks', testWebhooksRouter);

// Slack OAuth routes (multi-tenant installation)
app.use('/auth/slack', slackOAuthRouter);

// Confluence OAuth routes (multi-tenant integration)
app.use('/auth/confluence', confluenceOAuthRouter);

// Notion OAuth routes (multi-tenant integration - Phase 4)
app.use('/auth/notion', notionOAuthRouter);

// GitHub OAuth routes (multi-tenant GitHub App installation)
app.use('/auth/github', githubOAuthRouter);

// GitHub API routes (repos, branches, status)
app.use('/api', githubRouter);

// Onboarding API routes (setup status, webhook URLs, doc mappings)
app.use('/api/workspaces', onboardingRouter);

// Slack channels API routes (list channels, set default)
app.use('/api/workspaces', slackChannelsRouter);

// Settings API routes (Phase 5 - Workflow preferences)
app.use('/api/workspaces', settingsRouter);

// Plans API routes (Phase 3 - DriftPlan Management)
app.use('/api/plans', plansRouter); // Legacy routes for backward compatibility
app.use('/api', plansRouter); // New workspace-scoped routes

// Coverage API routes (Phase 3 Week 6 - Coverage Monitoring) - TEMPORARILY DISABLED
// app.use('/api/coverage', coverageRouter);

// Audit API routes (Phase 4 Week 8 - Audit Trail & Compliance)
app.use('/api/audit', auditRouter);

// Monitoring API routes (Production health and metrics)
app.use('/api/monitoring', monitoringRouter);

// Contract Packs API routes (Phase 1 Week 1-2 - Contract Integrity & Readiness)
app.use('/api', contractPacksRouter);

// Contract Policies API routes (Week 5-6 - Policy Enforcement Configuration)
app.use('/api', contractPoliciesRouter);

// Policy Packs API routes (P2 Week 7 - Unified WorkspacePolicyPack)
app.use('/api', policyPacksRouter);

// Admin API routes (one-time operations)
app.use('/api/admin', adminRouter);

// Runtime observation webhook routes (Agent Governance - Spec→Run verification)
app.use('/api/runtime', runtimeRouter);

// Health check API routes
app.use('/api', healthCheckRouter);

// Slack interaction routes (button clicks, modals)
app.use('/slack/interactions', slackInteractionsRouter);

// Jobs route (QStash callback endpoint for state machine processing)
app.use('/api/jobs', jobsRouter);

// Slack events endpoint (for URL verification and events)
app.post('/slack/events', (req: Request, res: Response) => {
  // Handle Slack URL verification challenge
  if (req.body?.type === 'url_verification') {
    return res.json({ challenge: req.body.challenge });
  }
  // TODO: Handle other Slack events (app_mention, message.im)
  console.log(`[SlackEvents] Received event: ${req.body?.event?.type}`);
  res.json({ ok: true });
});

// API routes
app.get('/api/proposals', async (_req: Request, res: Response) => {
  try {
    const proposals = await prisma.diffProposal.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        document: { select: { title: true } },
        signal: { select: { type: true, externalId: true } },
        routedTo: { select: { name: true, slackUserId: true } },
      },
    });
    res.json({ proposals });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch proposals' });
  }
});

// Admin endpoint to update proposal (for fixing channel IDs, etc.)
app.patch('/api/proposals/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { slackChannelId, status } = req.body;

  try {
    const updateData: any = {};
    if (slackChannelId) updateData.slackChannelId = slackChannelId;
    if (status) updateData.status = status;

    const proposal = await prisma.diffProposal.update({
      where: { id },
      data: updateData,
    });
    res.json({ success: true, proposal });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin endpoint to update organization (for setting tokens manually)
app.patch('/api/organizations/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { confluenceAccessToken } = req.body;

  try {
    const updateData: any = {};
    if (confluenceAccessToken) updateData.confluenceAccessToken = confluenceAccessToken;

    const org = await prisma.organization.update({
      where: { id },
      data: updateData,
    });
    res.json({ success: true, org: { id: org.id, name: org.name, hasToken: !!org.confluenceAccessToken } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/metrics', async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // FIX F7: Enhanced pipeline observability metrics
    const [
      total, approved, edited, rejected, pending,
      needsMappingCount,
      driftCandidates,
      rejectedProposals,
    ] = await Promise.all([
      prisma.diffProposal.count(),
      prisma.diffProposal.count({ where: { status: 'approved' } }),
      prisma.diffProposal.count({ where: { status: 'edited' } }),
      prisma.diffProposal.count({ where: { status: 'rejected' } }),
      prisma.diffProposal.count({ where: { status: 'pending' } }),
      // FIX F7: Track needs_mapping percentage
      prisma.driftCandidate.count({ where: { state: 'FAILED_NEEDS_MAPPING' } }),
      // FIX F7: Get drift candidates with doc resolution data
      prisma.driftCandidate.findMany({
        select: {
          docsResolution: true,
          state: true,
          sourceType: true,
          createdAt: true,
          stateUpdatedAt: true,
        },
        take: 1000, // Sample recent 1000
        orderBy: { createdAt: 'desc' },
      }),
      // FIX F7: Get rejected proposals with rejection data
      prisma.diffProposal.findMany({
        where: { status: 'rejected' },
        select: {
          rejectionReason: true,
          rejectionTags: true,
          createdAt: true,
          resolvedAt: true,
        },
        take: 500, // Sample recent 500
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const approvalRate = total > 0 ? ((approved + edited) / total) * 100 : 0;

    // FIX F7: Calculate doc resolution method breakdown
    let mappingCount = 0;
    let searchCount = 0;
    let prLinkCount = 0;
    let unknownCount = 0;

    for (const drift of driftCandidates) {
      const resolution = drift.docsResolution as any;
      if (resolution?.method === 'mapping') mappingCount++;
      else if (resolution?.method === 'search') searchCount++;
      else if (resolution?.method === 'pr_link') prLinkCount++;
      else unknownCount++;
    }

    const totalResolutions = mappingCount + searchCount + prLinkCount + unknownCount;
    const needsMappingPercentage = totalResolutions > 0
      ? (needsMappingCount / totalResolutions) * 100
      : 0;

    // FIX F7: Calculate time to human action (median)
    const timeToActionMinutes: number[] = [];
    for (const proposal of rejectedProposals) {
      if (proposal.resolvedAt) {
        const minutes = (proposal.resolvedAt.getTime() - proposal.createdAt.getTime()) / (1000 * 60);
        timeToActionMinutes.push(minutes);
      }
    }
    timeToActionMinutes.sort((a, b) => a - b);
    const medianTimeToAction = timeToActionMinutes.length > 0
      ? timeToActionMinutes[Math.floor(timeToActionMinutes.length / 2)]
      : null;

    // FIX F7: Rejection reason breakdown
    const rejectionReasons: Record<string, number> = {};
    for (const proposal of rejectedProposals) {
      const tags = proposal.rejectionTags as string[] || [];
      for (const tag of tags) {
        rejectionReasons[tag] = (rejectionReasons[tag] || 0) + 1;
      }
    }

    // FIX F7: Source type breakdown
    const sourceBreakdown: Record<string, number> = {};
    for (const drift of driftCandidates) {
      const source = drift.sourceType || 'unknown';
      sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1;
    }

    res.json({
      // Original metrics
      total_proposals: total,
      approved_count: approved,
      edited_count: edited,
      rejected_count: rejected,
      pending_count: pending,
      approval_rate: Math.round(approvalRate * 10) / 10,

      // FIX F7: New observability metrics
      doc_resolution: {
        mapping_count: mappingCount,
        search_count: searchCount,
        pr_link_count: prLinkCount,
        unknown_count: unknownCount,
        needs_mapping_count: needsMappingCount,
        needs_mapping_percentage: Math.round(needsMappingPercentage * 10) / 10,
      },
      time_to_action: {
        median_minutes: medianTimeToAction ? Math.round(medianTimeToAction) : null,
        sample_size: timeToActionMinutes.length,
      },
      rejection_reasons: rejectionReasons,
      source_breakdown: sourceBreakdown,
    });
  } catch (error) {
    console.error('[Metrics] Error:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

app.get('/api/organizations', async (_req: Request, res: Response) => {
  try {
    const orgs = await prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        slackTeamName: true,
        confluenceCloudId: true,
        confluenceAccessToken: true,
        createdAt: true,
        _count: {
          select: {
            users: true,
            trackedDocuments: true,
            diffProposals: true,
          },
        },
      },
    });
    // Mask the token but indicate if it exists
    const maskedOrgs = orgs.map(org => ({
      ...org,
      confluenceAccessToken: org.confluenceAccessToken ? 'SET' : null,
    }));
    res.json({ organizations: maskedOrgs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

app.get('/api/audit-logs', async (_req: Request, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        document: { select: { title: true } },
        diffProposal: { select: { id: true, summary: true } },
      },
    });
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// ============================================================================
// NEW: Workspace endpoints (Phase 1)
// ============================================================================

// List all workspaces
app.get('/api/workspaces', async (_req: Request, res: Response) => {
  try {
    const workspaces = await prisma.workspace.findMany({
      include: {
        integrations: {
          select: { id: true, type: true, status: true },
        },
        _count: {
          select: { signalEvents: true, driftCandidates: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Convert BigInt ids to strings for JSON serialization
    const serializedWorkspaces = workspaces.map(w => ({
      ...w,
      integrations: w.integrations.map(i => ({
        ...i,
        id: i.id.toString(),
      })),
    }));
    res.json({ workspaces: serializedWorkspaces });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch workspaces' });
  }
});

// Get a single workspace
app.get('/api/workspaces/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: {
        integrations: true,
        _count: {
          select: { signalEvents: true, driftCandidates: true, patchProposals: true },
        },
      },
    });
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    // Mask sensitive data and convert BigInt to string
    const maskedIntegrations = workspace.integrations.map(i => ({
      ...i,
      id: i.id.toString(),
      config: i.status === 'connected' ? 'CONFIGURED' : null,
    }));
    res.json({ ...workspace, integrations: maskedIntegrations });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch workspace' });
  }
});

// Create a new workspace
app.post('/api/workspaces', async (req: Request, res: Response) => {
  const { name, ownerEmail, slug } = req.body;

  if (!name || !ownerEmail) {
    return res.status(400).json({ error: 'Missing name or ownerEmail' });
  }

  try {
    const workspace = await prisma.workspace.create({
      data: {
        name,
        ownerEmail,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      },
    });
    res.status(201).json({ workspace });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Workspace with this slug already exists' });
    }
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

// List signal events for a workspace
app.get('/api/workspaces/:id/signals', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const signals = await prisma.signalEvent.findMany({
      where: { workspaceId: id },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ signals });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch signals' });
  }
});

// List drift candidates for a workspace
app.get('/api/workspaces/:id/drifts', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const drifts = await prisma.driftCandidate.findMany({
      where: { workspaceId: id },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ drifts });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch drifts' });
  }
});

// List runtime drift clusters for a workspace (Agent Governance - Spec→Run)
app.get('/api/workspaces/:id/drift-clusters', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.query;
  try {
    const clusters = await prisma.driftCluster.findMany({
      where: {
        workspaceId: id,
        ...(status ? { status: status as string } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Enrich each cluster with parsed clusterSummary and intent artifact (Spec layer)
    const enriched = await Promise.all(clusters.map(async (cluster) => {
      // Parse clusterSummary — stored as a JSON string in the Text column
      let summary: Record<string, unknown> = {};
      try {
        if (typeof cluster.clusterSummary === 'string' && cluster.clusterSummary.length > 0) {
          summary = JSON.parse(cluster.clusterSummary) as Record<string, unknown>;
        }
      } catch { /* leave summary empty if unparseable */ }

      // Fetch intent artifact for Spec layer using intentArtifactId from summary
      let intentArtifact: {
        id: string;
        prNumber: number;
        author: string;
        authorType: string;
        agentIdentity: string | null;
        repoFullName: string;
        affectedServices: string[];
        requestedCapabilities: unknown;
        specBuildFindings: string | null;
        links: unknown;
        signature: unknown;
        createdAt: Date;
        // Gap A: vibe coding provenance
        promptText: string | null;
        claimSet: unknown;
        agentTraceId: string | null;
      } | null = null;
      const intentArtifactId = summary.intentArtifactId as string | undefined;
      if (intentArtifactId) {
        intentArtifact = await prisma.intentArtifact.findUnique({
          where: { id: intentArtifactId },
          select: {
            id: true,
            prNumber: true,
            author: true,
            authorType: true,
            agentIdentity: true,
            repoFullName: true,
            affectedServices: true,
            requestedCapabilities: true,
            specBuildFindings: true,
            links: true,
            signature: true,
            createdAt: true,
            promptText: true,
            claimSet: true,
            agentTraceId: true,
          },
        }) as any;
      }

      return { ...cluster, clusterSummary: summary, intentArtifact };
    }));

    res.json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch drift clusters' });
  }
});

// Compact governance summary — Phase 2
// Designed for injection into developer LLM sessions (Claude Code, Cursor) via
// MCP resource subscription or CLAUDE.md injection.
//
// GET  /api/workspaces/:id/governance-summary/compact
//      ?format=markdown (default) | json
//
// Response (markdown): text/markdown — terse LLM-ready governance state block
// Response (json):     application/json — { success, data: CompactSummary }
app.get('/api/workspaces/:id/governance-summary/compact', async (req: Request, res: Response) => {
  const { id } = req.params;
  const format = (req.query.format as string | undefined) ?? 'markdown';

  try {
    // Validate workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id },
      select: { name: true, slug: true },
    });
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    // Fetch all pending drift clusters — includes materialityTier DB column
    const clusters = await prisma.driftCluster.findMany({
      where: { workspaceId: id, status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });

    // Count distinct services that have ever had runtime observations
    const observedServiceGroups = await prisma.runtimeCapabilityObservation.groupBy({
      by: ['service'],
      where: { workspaceId: id },
      _count: { id: true },
    });
    const totalObservedServices = observedServiceGroups.length;

    // Services with a non-petty pending cluster are "drifting"
    const driftingServices = new Set(
      clusters
        .filter(c => (c.materialityTier ?? 'operational') !== 'petty')
        .map(c => c.service),
    );
    const compliantServiceCount = Math.max(0, totalObservedServices - driftingServices.size);

    // Parse clusterSummary JSON for each cluster
    const parsed: ParsedDriftCluster[] = clusters.map(c => {
      let summary: Record<string, any> = {};
      try {
        if (typeof c.clusterSummary === 'string' && c.clusterSummary.length > 0) {
          summary = JSON.parse(c.clusterSummary) as Record<string, any>;
        }
      } catch { /* leave empty if malformed */ }
      return {
        id: c.id,
        service: c.service,
        materialityTier: c.materialityTier,
        createdAt: c.createdAt,
        clusterSummary: summary,
      };
    });

    const result = buildCompactSummary({ id, name: workspace.name }, parsed, compliantServiceCount);

    if (format === 'json') {
      return res.json({ success: true, data: result });
    }

    // Default: serve as text/markdown for direct MCP/CLAUDE.md consumption
    res.type('text/markdown').send(result.markdown);
  } catch (error) {
    console.error('[GovernanceSummary] Error building compact summary:', error);
    res.status(500).json({ success: false, error: 'Failed to generate governance summary' });
  }
});

// ── Track 1: Real-time governance SSE stream ──────────────────────────────────
// VSCode extension and lightweight clients connect here instead of polling.
// Events: connected (on open), drift_updated (on new drift cluster), :ping (heartbeat).
//
// Workspace isolation: each client connects to its own workspaceId stream.
// The endpoint does NOT require auth — workspaceId scoping is the isolation primitive.
// (Same security model as the compact governance markdown endpoint above.)
app.get('/api/governance/events/:workspaceId', (req: Request, res: Response) => {
  const { workspaceId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // prevent nginx from buffering SSE

  // Send initial connected event so client knows the stream is live
  res.write(`event: connected\ndata: ${JSON.stringify({ workspaceId, connectedAt: new Date().toISOString() })}\n\n`);

  registerSseClient(workspaceId, res);

  // Heartbeat every 25s to prevent proxies from closing idle connections
  const heartbeat = setInterval(() => {
    try { res.write(':ping\n\n'); } catch { clearInterval(heartbeat); }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unregisterSseClient(workspaceId, res);
  });
});

// ── Track 0: REST capability intent check (VSCode LM Tool + REST clients) ────
// Mirrors the MCP check_capability_intent tool but accessible via plain HTTP.
// Called by the VSCode extension's vscode.lm.registerTool handler (Copilot) and
// any other REST client that needs a pre-flight governance check.
//
// POST /api/workspaces/:id/capability-intent-check
// Body: { service: string, capabilities: Array<{ type: string, target?: string }> }
app.post('/api/workspaces/:id/capability-intent-check', async (req: Request, res: Response) => {
  const workspaceId = req.params.id;
  const { service, capabilities: requestedCapabilities } = req.body as {
    service: string;
    capabilities: Array<{ type: string; target?: string }>;
  };

  if (!service || !Array.isArray(requestedCapabilities)) {
    return res.status(400).json({ success: false, error: 'service (string) and capabilities (array) are required' });
  }

  try {
    // Fetch the most recent IntentArtifact that lists this service as an affected service
    const artifact = await prisma.intentArtifact.findFirst({
      where: { workspaceId, affectedServices: { has: service } },
      orderBy: { createdAt: 'desc' },
      select: { requestedCapabilities: true },
    });

    const declared: Array<{ capabilityType: string; capabilityTarget: string }> = [];
    if (artifact?.requestedCapabilities) {
      const caps = Array.isArray(artifact.requestedCapabilities) ? artifact.requestedCapabilities : [];
      for (const c of caps as any[]) {
        declared.push({
          capabilityType: String(c.type ?? ''),
          capabilityTarget: String(c.target ?? c.resource ?? '*'),
        });
      }
    }

    // Check each requested capability against declared set (exact + wildcard)
    const undeclaredRequested: Array<{ type: string; target: string }> = [];
    for (const reqCap of requestedCapabilities) {
      const reqTarget = reqCap.target ?? '*';
      const isCovered =
        declared.some(d => d.capabilityType === reqCap.type && (d.capabilityTarget === '*' || d.capabilityTarget === reqTarget));
      if (!isCovered) undeclaredRequested.push({ type: reqCap.type, target: reqTarget });
    }

    // Fetch active drift cluster count for this service
    const activeDrifts = await prisma.driftCluster.count({
      where: { workspaceId, service, status: 'pending' },
    });

    const allowed = undeclaredRequested.length === 0;

    return res.json({ success: true, allowed, undeclaredRequested, activeDrifts, declaredCapabilities: declared, service });
  } catch (err: any) {
    console.error('[CapabilityIntentCheck] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Create or update an integration for a workspace
app.put('/api/workspaces/:id/integrations/:type', async (req: Request, res: Response) => {
  const workspaceId = req.params.id;
  const integrationType = req.params.type;
  const { config, webhookSecret } = req.body;

  if (!workspaceId || !integrationType) {
    return res.status(400).json({ error: 'Missing workspace ID or integration type' });
  }

  const validTypes = ['github', 'slack', 'confluence', 'notion', 'pagerduty'];
  if (!validTypes.includes(integrationType)) {
    return res.status(400).json({ error: `Invalid integration type. Must be one of: ${validTypes.join(', ')}` });
  }

  try {
    const integration = await prisma.integration.upsert({
      where: {
        workspaceId_type: {
          workspaceId: workspaceId,
          type: integrationType,
        },
      },
      update: {
        config: config || {},
        webhookSecret: webhookSecret || null,
        status: 'connected',
      },
      create: {
        workspaceId: workspaceId,
        type: integrationType,
        status: 'connected',
        config: config || {},
        webhookSecret: webhookSecret || null,
      },
    });
    // Convert BigInt id to string for JSON serialization
    res.json({
      integration: {
        ...integration,
        id: integration.id.toString(),
        config: 'CONFIGURED'
      }
    });
  } catch (error: any) {
    console.error('[Integration] Error creating/updating integration:', error);
    if (error.code === 'P2003') {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    res.status(500).json({ error: 'Failed to create/update integration', details: error.message });
  }
});

// Delete an integration for a workspace
app.delete('/api/workspaces/:id/integrations/:type', async (req: Request, res: Response) => {
  const workspaceId = req.params.id;
  const integrationType = req.params.type;

  if (!workspaceId || !integrationType) {
    return res.status(400).json({ error: 'Missing workspace ID or integration type' });
  }

  try {
    await prisma.integration.delete({
      where: {
        workspaceId_type: {
          workspaceId: workspaceId,
          type: integrationType,
        },
      },
    });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Integration not found' });
    }
    res.status(500).json({ error: 'Failed to delete integration' });
  }
});

app.get('/api/signals', async (_req: Request, res: Response) => {
  try {
    const signals = await prisma.signal.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        externalId: true,
        repoFullName: true,
        driftAnalysis: true,
        processedAt: true,
        createdAt: true,
      },
    });
    res.json({ signals });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch signals' });
  }
});

// Test Slack messaging endpoint
import { sendSlackMessage } from './services/slack-client.js';

app.post('/api/test/slack', async (req: Request, res: Response) => {
  const { orgId, channel, message } = req.body;

  if (!orgId || !channel || !message) {
    return res.status(400).json({ error: 'Missing orgId, channel, or message' });
  }

  try {
    const result = await sendSlackMessage(orgId, channel, message, [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🧪 *Test Message from VertaAI*\n\n${message}`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Sent at ${new Date().toISOString()}`
          }
        ]
      }
    ]);

    if (result.ok) {
      res.json({ success: true, messageTs: result.ts });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create test data endpoint (tracked document + mapping)
// List tracked documents for an organization
app.get('/api/documents', async (req: Request, res: Response) => {
  const { orgId } = req.query;
  try {
    const documents = await prisma.trackedDocument.findMany({
      where: orgId ? { orgId: String(orgId) } : undefined,
      include: {
        docMappings: { select: { repoFullName: true, pathPatterns: true, serviceName: true } },
        _count: { select: { diffProposals: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ documents });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Update a tracked document (for setting real Confluence page ID)
app.patch('/api/documents/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { confluencePageId, title, lastContentSnapshot } = req.body;
  try {
    const updated = await prisma.trackedDocument.update({
      where: { id },
      data: {
        ...(confluencePageId && { confluencePageId }),
        ...(title && { title }),
        ...(lastContentSnapshot && { lastContentSnapshot }),
      },
    });
    res.json({ document: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/test/setup', async (req: Request, res: Response) => {
  const { orgId, confluencePageId, title } = req.body;

  if (!orgId) {
    return res.status(400).json({ error: 'Missing orgId' });
  }

  const pageId = confluencePageId || 'test-doc-123';
  const docTitle = title || 'VertaAI Service Runbook';

  try {
    // Create a test tracked document
    const doc = await prisma.trackedDocument.upsert({
      where: {
        orgId_confluencePageId: {
          orgId,
          confluencePageId: pageId
        }
      },
      update: { title: docTitle },
      create: {
        orgId,
        confluencePageId: pageId,
        title: docTitle,
        lastContentSnapshot: `# ${docTitle}

## Overview
VertaAI is a knowledge drift detection system.

## Deployment
- Platform: Railway (API) + Vercel (Frontend)
- Database: PostgreSQL on Railway

## Configuration
- Environment variables are stored in Railway dashboard
- Slack integration requires OAuth setup

## Troubleshooting
### API not responding
1. Check Railway logs
2. Verify DATABASE_URL is set
3. Check health endpoint: /health

### Slack messages not sending
1. Verify SLACK_BOT_TOKEN is set
2. Check bot has correct permissions
`,
      },
    });

    // Create a doc mapping for the VertaAI repo
    const mapping = await prisma.docMapping.upsert({
      where: {
        orgId_repoFullName_documentId: {
          orgId,
          repoFullName: 'Fredjr/VertaAI',
          documentId: doc.id
        }
      },
      update: {},
      create: {
        orgId,
        repoFullName: 'Fredjr/VertaAI',
        pathPatterns: ['apps/*', 'packages/*', 'src/*'],
        serviceName: 'vertaai',
        documentId: doc.id,
      },
    });

    res.json({
      success: true,
      document: { id: doc.id, title: doc.title, confluencePageId: doc.confluencePageId },
      mapping: { id: mapping.id, repo: mapping.repoFullName, service: mapping.serviceName }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test endpoint to manually trigger drift detection pipeline
import { runDriftDetectionPipeline } from './pipelines/drift-detection.js';

// Create and send a test proposal to Slack (for testing Edit Modal)
app.post('/api/test/create-proposal', async (req: Request, res: Response) => {
  const { channel, documentTitle, summary, diff, confidence, prNumber } = req.body;

  if (!channel) {
    return res.status(400).json({ error: 'Missing channel' });
  }

  try {
    // Get the default org
    const org = await prisma.organization.findFirst();
    if (!org) {
      return res.status(400).json({ error: 'No organization found' });
    }

    // Find or create a test document
    let document = await prisma.trackedDocument.findFirst({
      where: { orgId: org.id, title: documentTitle || 'Test Document' },
    });

    if (!document) {
      document = await prisma.trackedDocument.create({
        data: {
          orgId: org.id,
          title: documentTitle || 'Test Document',
          confluencePageId: '262146', // Use existing test page
          freshnessScore: 0.5,
        },
      });
    }

    // Create a new proposal
    const proposal = await prisma.diffProposal.create({
      data: {
        orgId: org.id,
        documentId: document.id,
        status: 'pending',
        confidence: confidence || 0.85,
        summary: summary || 'Test proposal for Edit Modal testing',
        diffContent: diff || '--- current\n+++ proposed\n@@ -1,3 +1,4 @@\n # Test Document\n \n This is a test.\n+Added new line for testing.',
      },
      include: { document: true },
    });

    // Build Slack message blocks
    const truncatedDiff = (proposal.diffContent || '').split('\n').slice(0, 15).join('\n');
    const confidencePercent = Math.round(Number(proposal.confidence || 0) * 100);

    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📝 Documentation update ready for review', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Document:* ${proposal.document?.title || 'Unknown'}\n*Triggered by:* PR #${prNumber || 'test'}\n*Confidence:* ${confidencePercent}%`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Summary:* ${proposal.summary || 'No summary available'}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Diff preview:*\n\`\`\`${truncatedDiff}\`\`\``,
        },
      },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: '✅ Approve', emoji: true }, style: 'primary', value: `approve:${proposal.id}`, action_id: 'approve_action' },
          { type: 'button', text: { type: 'plain_text', text: '✏️ Edit', emoji: true }, value: `edit:${proposal.id}`, action_id: 'edit_action' },
          { type: 'button', text: { type: 'plain_text', text: '❌ Reject', emoji: true }, style: 'danger', value: `reject:${proposal.id}`, action_id: 'reject_action' },
        ],
      },
    ];

    const result = await sendSlackMessage(org.id, channel, `Documentation update for ${proposal.document?.title}`, blocks);

    if (result.ok && result.ts) {
      await prisma.diffProposal.update({
        where: { id: proposal.id },
        data: {
          slackChannelId: result.channel || channel,
          slackMessageTs: result.ts,
        },
      });
    }

    res.json({
      success: result.ok,
      proposalId: proposal.id,
      messageTs: result.ts,
      channel: result.channel,
      error: result.error,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send proposal notification to Slack
app.post('/api/test/send-proposal', async (req: Request, res: Response) => {
  const { proposalId, channel } = req.body;

  if (!proposalId || !channel) {
    return res.status(400).json({ error: 'Missing proposalId or channel' });
  }

  try {
    const proposal = await prisma.diffProposal.findUnique({
      where: { id: proposalId },
      include: { document: true, signal: true },
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const truncatedDiff = (proposal.diffContent || '').split('\n').slice(0, 15).join('\n');
    const confidence = Math.round(Number(proposal.confidence || 0) * 100);

    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📝 Documentation update ready for review', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Document:* ${proposal.document?.title || 'Unknown'}\n*Triggered by:* ${proposal.signal?.externalId || 'Unknown PR'}\n*Confidence:* ${confidence}%`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Summary:* ${proposal.summary || 'No summary available'}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Diff preview:*\n\`\`\`${truncatedDiff}\`\`\``,
        },
      },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: '✅ Approve', emoji: true }, style: 'primary', value: `approve:${proposalId}`, action_id: 'approve_action' },
          { type: 'button', text: { type: 'plain_text', text: '✏️ Edit', emoji: true }, value: `edit:${proposalId}`, action_id: 'edit_action' },
          { type: 'button', text: { type: 'plain_text', text: '❌ Reject', emoji: true }, style: 'danger', value: `reject:${proposalId}`, action_id: 'reject_action' },
        ],
      },
    ];

    const result = await sendSlackMessage(proposal.orgId, channel, `Documentation update for ${proposal.document?.title}`, blocks);

    if (result.ok && result.ts) {
      // Store the message reference for later updates
      // Use the channel ID returned by Slack (not the input which could be a name like #channel)
      await prisma.diffProposal.update({
        where: { id: proposalId },
        data: {
          slackChannelId: result.channel || channel,
          slackMessageTs: result.ts,
        },
      });
    }

    res.json({ success: result.ok, messageTs: result.ts, channel: result.channel, error: result.error });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test endpoint: Run state machine without QStash signature verification
app.post('/api/test/run-state-machine', async (req: Request, res: Response) => {
  const { workspaceId, driftId, maxIterations = 30 } = req.body;

  if (!workspaceId || !driftId) {
    return res.status(400).json({ error: 'Missing workspaceId or driftId' });
  }

  const { executeTransition } = await import('./services/orchestrator/transitions.js');
  const stateMachine = await import('./types/state-machine.js');
  const terminalStates = stateMachine.TERMINAL_STATES.map((s: any) => String(s));
  const humanGatedStates = stateMachine.HUMAN_GATED_STATES.map((s: any) => String(s));

  const stateLog: string[] = [];
  let iteration = 0;

  try {
    while (iteration < maxIterations) {
      // Re-fetch drift on each iteration to get latest state
      const drift = await prisma.driftCandidate.findUnique({
        where: { workspaceId_id: { workspaceId, id: driftId } },
        include: { signalEvent: true, workspace: true },
      });

      if (!drift) {
        return res.status(404).json({ error: 'Drift not found', stateLog });
      }

      const currentState = drift.state as string;
      stateLog.push(currentState);

      if (terminalStates.includes(currentState)) {
        return res.json({ status: 'terminal', state: currentState, iterations: iteration, stateLog });
      }
      if (humanGatedStates.includes(currentState)) {
        return res.json({ status: 'human_gated', state: currentState, iterations: iteration, stateLog });
      }

      console.log(`[TestStateMachine] Iteration ${iteration + 1}: state=${currentState}`);
      const result = await executeTransition(drift, currentState as any);

      // Update state in DB
      await prisma.driftCandidate.update({
        where: { workspaceId_id: { workspaceId, id: driftId } },
        data: {
          state: result.state,
          stateUpdatedAt: new Date(),
          ...(result.error && {
            lastErrorCode: result.error.code,
            lastErrorMessage: result.error.message,
            retryCount: { increment: 1 },
          }),
        },
      });

      if (result.error) {
        stateLog.push(`ERROR:${result.error.code}:${result.error.message}`);
        return res.json({
          status: 'error',
          state: result.state,
          error: result.error,
          iterations: iteration + 1,
          stateLog,
        });
      }

      iteration++;
    }

    // Fetch final state
    const finalDrift = await prisma.driftCandidate.findUnique({
      where: { workspaceId_id: { workspaceId, id: driftId } },
    });

    return res.json({
      status: 'max_iterations',
      state: finalDrift?.state,
      iterations: iteration,
      stateLog,
    });
  } catch (error: any) {
    return res.status(500).json({
      status: 'exception',
      error: error.message,
      iterations: iteration,
      stateLog,
    });
  }
});

app.post('/api/test/trigger-drift', async (req: Request, res: Response) => {
  const { workspaceId, prNumber, prTitle, prBody, changedFiles, diff } = req.body;

  if (!workspaceId) {
    return res.status(400).json({ error: 'Missing workspaceId' });
  }

  try {
    const testPrNumber = prNumber || 999;
    const signalEventId = `github_pr_test_${testPrNumber}_${Date.now()}`;

    // Create a test SignalEvent (workspace-scoped)
    const signalEvent = await prisma.signalEvent.create({
      data: {
        workspaceId,
        id: signalEventId,
        sourceType: 'github_pr',
        occurredAt: new Date(),
        repo: 'Fredjr/VertaAI',
        service: 'test',
        extracted: {
          prNumber: testPrNumber,
          prTitle: prTitle || 'Test PR for drift detection',
          prBody: prBody || 'Testing drift detection pipeline',
          changedFiles: changedFiles || [],
        },
        rawPayload: { diff: diff || '' },
      },
    });

    // Create a DriftCandidate
    const driftCandidate = await prisma.driftCandidate.create({
      data: {
        workspaceId,
        signalEventId: signalEvent.id,
        state: 'INGESTED',
        sourceType: 'github_pr',
        repo: 'Fredjr/VertaAI',
        service: 'test',
      },
    });

    // Run the pipeline
    const result = await runDriftDetectionPipeline({
      signalId: signalEvent.id,
      workspaceId,
      driftCandidateId: driftCandidate.id,
      prNumber: testPrNumber,
      prTitle: prTitle || 'Test PR for drift detection',
      prBody: prBody || 'Testing drift detection pipeline',
      repoFullName: 'Fredjr/VertaAI',
      authorLogin: 'test-user',
      mergedAt: new Date().toISOString(),
      changedFiles: changedFiles || [],
      diff: diff || '',
    });

    res.json({
      success: true,
      signalEventId: signalEvent.id,
      driftCandidateId: driftCandidate.id,
      driftDetected: result.driftDetected,
      proposalIds: result.proposalIds,
      errors: result.errors,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: MCP Resource Server — vertaai://governance/{workspaceId}
//
// Exposes real-time governance state as an MCP resource for Claude Code / Cursor.
// Each Streamable HTTP session gets its own McpServer instance (required for
// per-session resource subscriptions). After each non-petty drift detection,
// runtimeDriftMonitor.ts calls notifyDriftUpdated() which pushes
// notifications/resources/updated to all active sessions.
//
// Claude Code connection config (add to .claude/settings.json):
//   { "mcpServers": { "vertaai": { "type": "http", "url": "http://localhost:3001/mcp" } } }
// ─────────────────────────────────────────────────────────────────────────────

// Session registry: sessionId → transport (for request routing after init)
const mcpSessions = new Map<string, StreamableHTTPServerTransport>();

app.post('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  // Route to an existing session
  if (sessionId && mcpSessions.has(sessionId)) {
    const transport = mcpSessions.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // Initialize a new session
  if (isInitializeRequest(req.body)) {
    // Optional: scope the session to a specific workspace for isolation.
    // Claude Code users pass ?workspaceId=<id> in the MCP server URL.
    // Example: "url": "https://api.vertaai.com/mcp?workspaceId=demo-workspace"
    const scopedWorkspaceId = req.query['workspaceId'] as string | undefined;

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    // Create a fresh McpServer for this session with governance resource + tool.
    // Workspace isolation: if scopedWorkspaceId is set, list/read/notify are scoped to it.
    const mcpServer = createGovernanceMcpServer({
      readGovernanceMarkdown: buildWorkspaceGovernanceMarkdown,
      listWorkspaces: async () => {
        if (scopedWorkspaceId) {
          // Return only the session's workspace — prevents enumeration of other workspaces
          const ws = await prisma.workspace.findUnique({
            where: { id: scopedWorkspaceId },
            select: { id: true, name: true },
          });
          return ws ? [ws] : [];
        }
        return prisma.workspace.findMany({ select: { id: true, name: true } });
      },
      checkCapabilityIntent: async (workspaceId, service, requestedCapabilities) => {
        // Fetch the most recent IntentArtifact that lists this service as an affected service
        const artifact = await prisma.intentArtifact.findFirst({
          where: { workspaceId, affectedServices: { has: service } },
          orderBy: { createdAt: 'desc' },
          select: { requestedCapabilities: true },
        });

        // Parse declared capabilities from the artifact
        const declared: Array<{ type: string; target: string }> = [];
        if (artifact?.requestedCapabilities) {
          const caps = Array.isArray(artifact.requestedCapabilities) ? artifact.requestedCapabilities : [];
          for (const c of caps as any[]) {
            declared.push({ type: String(c.type ?? ''), target: String(c.target ?? c.resource ?? '*') });
          }
        }

        // Build declared set for fast lookup
        const declaredSet = new Set(declared.map(c => `${c.type}:${c.target}`));

        // Check each requested capability against declared set (exact + wildcard)
        const undeclaredRequested: Array<{ type: string; target: string; reason: string }> = [];
        for (const req of requestedCapabilities) {
          const reqTarget = req.target ?? '*';
          // Exact match or wildcard declared covers any target
          const isCovered = declaredSet.has(`${req.type}:${reqTarget}`)
            || declaredSet.has(`${req.type}:*`)
            || declared.some(d => d.type === req.type && (d.target === '*' || d.target === reqTarget));
          if (!isCovered) {
            undeclaredRequested.push({
              type: req.type,
              target: reqTarget,
              reason: declared.length === 0
                ? 'No IntentArtifact found — capability is implicitly undeclared'
                : `Not found in current spec (${declared.filter(d => d.type === req.type).length} ${req.type} declaration(s) exist)`,
            });
          }
        }

        // Fetch active drift clusters for this service
        const driftClusters = await prisma.driftCluster.findMany({
          where: { workspaceId, service, status: 'pending' },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, materialityTier: true, clusterSummary: true, createdAt: true, driftIds: true },
        });

        const activeDrifts = driftClusters.map(d => {
          const summary = d.clusterSummary as any;
          return {
            id: d.id,
            severity: summary?.severity ?? d.materialityTier ?? 'unknown',
            materialityTier: d.materialityTier ?? summary?.materialityTier ?? 'unknown',
            driftCount: d.driftIds?.length ?? 0,
            createdAt: d.createdAt.toISOString(),
          };
        });

        const hasCriticalDrift = activeDrifts.some(d => d.materialityTier === 'critical');
        const allowed = undeclaredRequested.length === 0 && !hasCriticalDrift;

        return { allowed, undeclaredRequested, activeDrifts, declaredCapabilities: declared, service };
      },
      workspaceId: scopedWorkspaceId,
    });

    // Register for drift notifications (workspace-scoped); clean up on disconnect
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) {
        mcpSessions.delete(sid);
        unregisterSession(sid);
      }
    };

    await mcpServer.connect(transport);

    const sid = transport.sessionId!;
    mcpSessions.set(sid, transport);
    registerSession(sid, mcpServer, scopedWorkspaceId);

    await transport.handleRequest(req, res, req.body);
    return;
  }

  res.status(400).json({ error: 'No valid MCP session ID — send an initialize request first' });
});

// GET /mcp — SSE stream for server-to-client notifications (subscriptions, resource updates)
app.get('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !mcpSessions.has(sessionId)) {
    res.status(400).json({ error: 'Unknown MCP session ID' });
    return;
  }
  const transport = mcpSessions.get(sessionId)!;
  await transport.handleRequest(req, res);
});

// DELETE /mcp — explicit session termination
app.delete('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (sessionId && mcpSessions.has(sessionId)) {
    const transport = mcpSessions.get(sessionId)!;
    await transport.close();
    mcpSessions.delete(sessionId);
    unregisterSession(sessionId);
  }
  res.status(200).end();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

// Initialize YAML DSL comparators
console.log('[Startup] Initializing YAML DSL comparators...');
initializeComparators();

// Start server
app.listen(PORT, () => {
  console.log(`🚀 VertaAI API running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Webhook endpoint: http://localhost:${PORT}/webhooks/github`);
  console.log(`   Slack OAuth: http://localhost:${PORT}/auth/slack/install`);
  console.log(`   Slack Interactions: http://localhost:${PORT}/slack/interactions`);
  console.log(`   Signals endpoint: http://localhost:${PORT}/api/signals`);
});

export default app;

