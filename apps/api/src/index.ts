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
import onboardingRouter from './routes/onboarding.js';
import jobsRouter from './routes/jobs.js';

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

// Slack OAuth routes (multi-tenant installation)
app.use('/auth/slack', slackOAuthRouter);

// Confluence OAuth routes (multi-tenant integration)
app.use('/auth/confluence', confluenceOAuthRouter);

// Notion OAuth routes (multi-tenant integration - Phase 4)
app.use('/auth/notion', notionOAuthRouter);

// GitHub OAuth routes (multi-tenant GitHub App installation)
app.use('/auth/github', githubOAuthRouter);

// Onboarding API routes (setup status, webhook URLs, doc mappings)
app.use('/api/workspaces', onboardingRouter);

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

    const [total, approved, edited, rejected, pending] = await Promise.all([
      prisma.diffProposal.count(),
      prisma.diffProposal.count({ where: { status: 'approved' } }),
      prisma.diffProposal.count({ where: { status: 'edited' } }),
      prisma.diffProposal.count({ where: { status: 'rejected' } }),
      prisma.diffProposal.count({ where: { status: 'pending' } }),
    ]);

    const approvalRate = total > 0 ? ((approved + edited) / total) * 100 : 0;

    res.json({
      total_proposals: total,
      approved_count: approved,
      edited_count: edited,
      rejected_count: rejected,
      pending_count: pending,
      approval_rate: Math.round(approvalRate * 10) / 10,
    });
  } catch (error) {
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

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

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

