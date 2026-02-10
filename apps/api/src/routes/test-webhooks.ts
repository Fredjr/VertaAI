import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { prisma } from '../lib/db.js';
import { extractPRInfo } from '../lib/github.js';
import { enqueueJob } from '../services/queue/qstash.js';
import { runDriftDetectionPipeline } from '../pipelines/drift-detection.js';

const router: RouterType = Router();

/**
 * TEST ENDPOINT: Simulate GitHub PR webhook without signature validation
 * POST /test/webhooks/github/:workspaceId
 * 
 * This endpoint is for E2E testing only. It processes PR webhooks
 * without requiring valid GitHub webhook signatures.
 * 
 * ⚠️ WARNING: This endpoint should be disabled in production or
 * protected with authentication.
 */
router.post('/github/:workspaceId', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId;
  const event = req.headers['x-github-event'] as string;

  console.log(`[TestWebhook] Received ${event} event for workspace ${workspaceId}`);

  if (!workspaceId) {
    return res.status(400).json({ error: 'Workspace ID is required' });
  }

  // Handle ping event
  if (event === 'ping') {
    console.log('[TestWebhook] Ping received');
    return res.json({ message: 'pong', workspaceId });
  }

  // Handle pull_request event
  if (event === 'pull_request') {
    return handleTestPullRequest(req.body, workspaceId, res);
  }

  // Ignore other events
  console.log(`[TestWebhook] Ignoring event: ${event}`);
  return res.json({ message: 'Event ignored' });
});

/**
 * Process a test PR webhook
 * This is a simplified version of the real webhook handler
 */
async function handleTestPullRequest(payload: any, workspaceId: string, res: Response) {
  const prInfo = extractPRInfo(payload);

  if (!prInfo) {
    console.error('[TestWebhook] Could not extract PR info');
    return res.status(400).json({ error: 'Invalid PR payload' });
  }

  console.log(`[TestWebhook] PR #${prInfo.prNumber} ${prInfo.action} in ${prInfo.repoFullName}`);

  // Only process opened or closed PRs
  if (prInfo.action !== 'opened' && prInfo.action !== 'closed') {
    console.log(`[TestWebhook] Ignoring PR action: ${prInfo.action}`);
    return res.json({ message: `PR action ${prInfo.action} ignored` });
  }

  try {
    const signalEventId = `signal-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const inferredService = prInfo.repoName;

    // For testing, we'll use simplified file data
    const files = [
      {
        filename: 'apps/api/routes/monitoring.ts',
        status: 'modified',
        additions: payload.pull_request?.additions || 100,
        deletions: payload.pull_request?.deletions || 10,
      },
    ];

    // Generate realistic diff based on PR body
    // Extract endpoint patterns from PR body (e.g., "/api/monitoring/health")
    const prBody = prInfo.prBody || '';
    const endpointMatches = prBody.match(/\/api\/[^\s]+/g) || [];

    // Create a realistic diff with router definitions
    let diffContent = `diff --git a/apps/api/routes/monitoring.ts b/apps/api/routes/monitoring.ts
index abc123..def456 100644
--- a/apps/api/routes/monitoring.ts
+++ b/apps/api/routes/monitoring.ts
@@ -1,5 +1,20 @@
 import { Router } from 'express';
 const router = Router();

`;

    // Add router definitions for each endpoint found in PR body
    endpointMatches.forEach((endpoint, index) => {
      const method = endpoint.includes('webhook') ? 'post' : 'get';
      diffContent += `+router.${method}('${endpoint}', async (req, res) => {
+  // Implementation for ${endpoint}
+  res.json({ status: 'ok' });
+});
+
`;
    });

    diffContent += `+export default router;`;

    const diff = diffContent;

    // Create SignalEvent record
    const signalEvent = await prisma.signalEvent.create({
      data: {
        workspaceId,
        id: signalEventId,
        sourceType: 'github_pr',
        occurredAt: new Date(),
        repo: prInfo.repoFullName,
        service: inferredService,
        extracted: {
          prNumber: prInfo.prNumber,
          prTitle: prInfo.prTitle,
          prBody: prInfo.prBody,
          authorLogin: prInfo.authorLogin,
          baseBranch: prInfo.baseBranch,
          headBranch: prInfo.headBranch,
          changedFiles: files,
          diff: diff, // FIX: Add diff to extracted for Phase 1 deterministic comparison
        },
        rawPayload: payload,
      },
    });

    console.log(`[TestWebhook] Created signal event ${signalEvent.id}`);

    // Create DriftCandidate in INGESTED state
    const driftCandidate = await prisma.driftCandidate.create({
      data: {
        workspaceId,
        signalEventId: signalEvent.id,
        state: 'INGESTED',
        sourceType: 'github_pr',
        repo: prInfo.repoFullName,
        service: inferredService,
      },
    });

    console.log(`[TestWebhook] Created drift candidate ${driftCandidate.id} in INGESTED state`);

    // Enqueue QStash job for async processing
    const messageId = await enqueueJob({
      workspaceId,
      driftId: driftCandidate.id,
    });

    if (messageId) {
      console.log(`[TestWebhook] Enqueued job ${messageId} for drift candidate ${driftCandidate.id}`);
    } else {
      // QStash not configured - run synchronous pipeline
      console.log(`[TestWebhook] QStash not configured - running synchronous pipeline`);
      // Note: For testing, we'll skip the full pipeline to avoid LLM calls
      // In a real scenario, this would call runDriftDetectionPipeline
    }

    // Return 202 Accepted
    return res.status(202).json({
      message: 'Test webhook received and processed',
      signalEventId: signalEvent.id,
      driftId: driftCandidate.id,
      qstashMessageId: messageId || undefined,
      note: 'This is a test endpoint - full pipeline processing may be skipped',
    });

  } catch (error) {
    console.error('[TestWebhook] Error processing PR:', error);
    return res.status(500).json({ error: 'Failed to process PR' });
  }
}

export default router;

