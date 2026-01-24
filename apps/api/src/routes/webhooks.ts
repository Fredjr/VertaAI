import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { Octokit } from 'octokit';
import { prisma } from '../lib/db.js';
import { verifyWebhookSignature, extractPRInfo, getInstallationOctokit, getPRDiff, getPRFiles } from '../lib/github.js';
import { runDriftDetectionPipeline } from '../pipelines/drift-detection.js';

// Create Octokit with personal access token for repo webhooks (no installation)
function getTokenOctokit(): Octokit | null {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  return new Octokit({ auth: token });
}

const router: RouterType = Router();

// GitHub webhook endpoint
router.post('/github', async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const event = req.headers['x-github-event'] as string;
  const deliveryId = req.headers['x-github-delivery'] as string;

  console.log(`[Webhook] Received ${event} event (delivery: ${deliveryId})`);

  // Verify webhook signature
  const secret = process.env.GH_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Webhook] GH_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const payload = JSON.stringify(req.body);
  if (!verifyWebhookSignature(payload, signature, secret)) {
    console.error('[Webhook] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Handle different event types
  if (event === 'ping') {
    console.log('[Webhook] Ping received, webhook is configured correctly');
    return res.json({ message: 'pong' });
  }

  if (event === 'pull_request') {
    return handlePullRequestEvent(req.body, res);
  }

  // Ignore other events
  console.log(`[Webhook] Ignoring event: ${event}`);
  return res.json({ message: 'Event ignored' });
});

async function handlePullRequestEvent(payload: any, res: Response) {
  const prInfo = extractPRInfo(payload);
  
  if (!prInfo) {
    console.error('[Webhook] Could not extract PR info');
    return res.status(400).json({ error: 'Invalid PR payload' });
  }

  console.log(`[Webhook] PR #${prInfo.prNumber} ${prInfo.action} in ${prInfo.repoFullName}`);

  // Only process merged PRs for drift detection
  if (prInfo.action !== 'closed' || !prInfo.merged) {
    console.log(`[Webhook] Ignoring PR action: ${prInfo.action}, merged: ${prInfo.merged}`);
    return res.json({ message: 'PR not merged, ignoring' });
  }

  console.log(`[Webhook] Processing merged PR #${prInfo.prNumber}: ${prInfo.prTitle}`);

  try {
    // Find or create organization
    // For GitHub App webhooks, use installationId; for repo webhooks, use repoOwner
    let org = prInfo.installationId
      ? await prisma.organization.findFirst({
          where: { githubInstallationId: BigInt(prInfo.installationId) },
        })
      : await prisma.organization.findFirst({
          where: { name: prInfo.repoOwner },
        });

    if (!org) {
      // Create a new organization
      org = await prisma.organization.create({
        data: {
          name: prInfo.repoOwner,
          ...(prInfo.installationId && { githubInstallationId: BigInt(prInfo.installationId) }),
        },
      });
      console.log(`[Webhook] Created new organization: ${org.name}`);
    }

    // Check if we already processed this PR
    const existingSignal = await prisma.signal.findFirst({
      where: {
        orgId: org.id,
        type: 'github_pr',
        externalId: `${prInfo.repoFullName}#${prInfo.prNumber}`,
      },
    });

    if (existingSignal) {
      console.log(`[Webhook] PR already processed, skipping`);
      return res.json({ message: 'PR already processed' });
    }

    // Get PR diff and files for analysis
    let diff = '';
    let files: Array<{ filename: string; status: string; additions: number; deletions: number }> = [];

    try {
      // Use GitHub App auth if installationId exists, otherwise use token auth
      let octokit: Octokit | null = null;
      if (prInfo.installationId) {
        octokit = await getInstallationOctokit(prInfo.installationId);
      } else {
        octokit = getTokenOctokit();
      }

      if (octokit) {
        [diff, files] = await Promise.all([
          getPRDiff(octokit, prInfo.repoOwner, prInfo.repoName, prInfo.prNumber),
          getPRFiles(octokit, prInfo.repoOwner, prInfo.repoName, prInfo.prNumber),
        ]);
      } else {
        console.log('[Webhook] No GitHub auth available, skipping PR diff/files fetch');
      }
    } catch (error) {
      console.error('[Webhook] Error fetching PR details:', error);
      // Continue without diff - we can still create the signal
    }

    // Create signal record
    const signal = await prisma.signal.create({
      data: {
        orgId: org.id,
        type: 'github_pr',
        externalId: `${prInfo.repoFullName}#${prInfo.prNumber}`,
        repoFullName: prInfo.repoFullName,
        payload: {
          prNumber: prInfo.prNumber,
          prTitle: prInfo.prTitle,
          prBody: prInfo.prBody,
          authorLogin: prInfo.authorLogin,
          baseBranch: prInfo.baseBranch,
          headBranch: prInfo.headBranch,
          mergedAt: prInfo.mergedAt,
          changedFiles: files,
          diff: diff.substring(0, 50000), // Limit diff size
        },
      },
    });

    console.log(`[Webhook] Created signal ${signal.id} for PR #${prInfo.prNumber}`);

    // Run full drift detection pipeline (A → B → C → D → E)
    // Note: For production, this should be queued with BullMQ
    try {
      const pipelineResult = await runDriftDetectionPipeline({
        signalId: signal.id,
        orgId: org.id,
        prNumber: prInfo.prNumber,
        prTitle: prInfo.prTitle,
        prBody: prInfo.prBody,
        repoFullName: prInfo.repoFullName,
        authorLogin: prInfo.authorLogin,
        mergedAt: prInfo.mergedAt,
        changedFiles: files,
        diff,
      });

      console.log(`[Webhook] Pipeline complete: drift_detected=${pipelineResult.driftDetected}, proposals=${pipelineResult.proposalIds.length}`);
      if (pipelineResult.errors.length > 0) {
        console.warn(`[Webhook] Pipeline errors: ${pipelineResult.errors.join(', ')}`);
      }
    } catch (pipelineError) {
      console.error('[Webhook] Pipeline failed:', pipelineError);
      // Don't fail the webhook - we still created the signal
    }

    return res.json({
      message: 'PR processed successfully',
      signalId: signal.id,
    });

  } catch (error) {
    console.error('[Webhook] Error processing PR:', error);
    return res.status(500).json({ error: 'Failed to process PR' });
  }
}

export default router;

