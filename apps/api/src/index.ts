import express, { Application, Request, Response } from 'express';
import cors from 'cors';

const app: Application = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'vertaai-api',
    timestamp: new Date().toISOString()
  });
});

// Webhook endpoints (to be implemented)
app.post('/webhooks/github', (_req: Request, res: Response) => {
  // TODO: Implement GitHub webhook handler
  res.json({ received: true });
});

// Slack endpoints (to be implemented)
app.post('/slack/events', (_req: Request, res: Response) => {
  // TODO: Implement Slack event handler
  res.json({ challenge: _req.body?.challenge });
});

app.post('/slack/interactions', (_req: Request, res: Response) => {
  // TODO: Implement Slack interaction handler
  res.json({ ok: true });
});

// API routes (to be implemented)
app.get('/api/proposals', (_req: Request, res: Response) => {
  // TODO: Implement proposals list
  res.json({ proposals: [] });
});

app.get('/api/metrics', (_req: Request, res: Response) => {
  // TODO: Implement metrics
  res.json({
    approval_rate: 0,
    patches_today: 0,
    avg_response_hours: 0
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 VertaAI API running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
});

export default app;

