import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { prisma } from './lib/db.js';
import webhooksRouter from './routes/webhooks.js';
import slackOAuthRouter from './routes/slack-oauth.js';
import slackInteractionsRouter from './routes/slack-interactions.js';
import confluenceOAuthRouter from './routes/confluence-oauth.js';

const app: Application = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(cookieParser());
app.use(express.json());
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

// Slack OAuth routes (multi-tenant installation)
app.use('/auth/slack', slackOAuthRouter);

// Confluence OAuth routes (multi-tenant integration)
app.use('/auth/confluence', confluenceOAuthRouter);

// Slack interaction routes (button clicks, modals)
app.use('/slack/interactions', slackInteractionsRouter);

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
    res.json({ organizations: orgs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch organizations' });
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
      await prisma.diffProposal.update({
        where: { id: proposalId },
        data: {
          slackChannelId: channel,
          slackMessageTs: result.ts,
        },
      });
    }

    res.json({ success: result.ok, messageTs: result.ts, error: result.error });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/test/trigger-drift', async (req: Request, res: Response) => {
  const { orgId, prNumber, prTitle, prBody, changedFiles, diff } = req.body;

  if (!orgId) {
    return res.status(400).json({ error: 'Missing orgId' });
  }

  try {
    // Create a test signal
    const signal = await prisma.signal.create({
      data: {
        orgId,
        type: 'github_pr',
        externalId: `Fredjr/VertaAI#${prNumber || 999}`,
        repoFullName: 'Fredjr/VertaAI',
        payload: {
          prNumber: prNumber || 999,
          prTitle: prTitle || 'Test PR for drift detection',
          prBody: prBody || 'Testing drift detection pipeline',
          changedFiles: changedFiles || [],
          diff: diff || '',
        },
      },
    });

    // Run the pipeline
    const result = await runDriftDetectionPipeline({
      signalId: signal.id,
      orgId,
      prNumber: prNumber || 999,
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
      signalId: signal.id,
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

