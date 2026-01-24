import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { prisma } from './lib/db.js';
import webhooksRouter from './routes/webhooks.js';
import slackOAuthRouter from './routes/slack-oauth.js';
import slackInteractionsRouter from './routes/slack-interactions.js';

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

