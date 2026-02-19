import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { Octokit } from 'octokit';
import { prisma } from '../lib/db.js';
import { extractPRInfo, getInstallationOctokit, getPRDiff as getLegacyPRDiff, getPRFiles as getLegacyPRFiles } from '../lib/github.js';
import { verifyWebhookSignature as legacyVerifySignature } from '../lib/github.js';
import {
  getGitHubClient,
  getWorkspaceWebhookSecret,
  verifyWebhookSignature,
  getPRDiff,
  getPRFiles,
  getFileContent
} from '../services/github-client.js';
import { runDriftDetectionPipeline } from '../pipelines/drift-detection.js';
import { enqueueJob } from '../services/queue/qstash.js';
import { isFeatureEnabled } from '../config/featureFlags.js';
import {
  isCodeOwnersFile,
  diffCodeOwners,
  createOwnershipDriftSignal
} from '../services/signals/codeownersParser.js';
import { runGatekeeper, shouldRunGatekeeper } from '../services/gatekeeper/index.js';
import { ContractResolver } from '../services/contracts/contractResolver.js';
import type { Contract } from '../services/contracts/types.js';
import {
  calculateResolutionMetrics,
  logResolutionMetrics,
  logResolutionDetails,
} from '../services/contracts/telemetry.js';
import { runContractValidation } from '../services/contracts/contractValidation.js';

// LEGACY: Create Octokit with personal access token for repo webhooks (no installation)
// Used only by legacy endpoint - will be deprecated
function getTokenOctokit(): Octokit | null {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn('[Webhook] GITHUB_TOKEN not set - PR diff fetching will be limited');
    return null;
  }
  return new Octokit({ auth: token });
}

const router: RouterType = Router();

// ============================================================================
// IMPORTANT: Route Order Matters!
// Specific routes (like /github/app) must come BEFORE parameterized routes
// (like /github/:workspaceId) to avoid incorrect matching
// ============================================================================

// ============================================================================
// GitHub App Global Webhook (for multi-tenant app-level webhook)
// URL: POST /webhooks/github/app
// Routes webhooks by installation_id to find the correct workspace
// This is the URL to configure in GitHub App settings for all customers
// ============================================================================
router.post('/github/app', async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const event = req.headers['x-github-event'] as string;
  const deliveryId = req.headers['x-github-delivery'] as string;

  console.log(`[Webhook] [APP] Received ${event} event (delivery: ${deliveryId})`);

  // Extract installation_id from payload
  // GitHub sends installation in different places depending on event type
  let installationId = req.body?.installation?.id;

  // For some events, installation might be at the root level
  if (!installationId && req.body?.installation_id) {
    installationId = req.body.installation_id;
  }

  // For repository events, check the repository.owner
  if (!installationId && req.body?.repository?.owner?.id) {
    // This is a fallback - we'll need to look up by repo owner
    console.log('[Webhook] [APP] No installation object, checking repository owner');
  }

  if (!installationId) {
    console.error('[Webhook] [APP] No installation_id in payload');
    console.error('[Webhook] [APP] Payload keys:', Object.keys(req.body || {}));
    console.error('[Webhook] [APP] Repository:', req.body?.repository?.full_name);
    console.error('[Webhook] [APP] Sender:', req.body?.sender?.login);

    // For ping events without installation_id, verify with global secret
    if (event === 'ping') {
      console.log('[Webhook] [APP] Ping received at app-level endpoint');
      return res.json({ message: 'pong', endpoint: 'app' });
    }

    // Try to find workspace by repository name as fallback
    if (req.body?.repository?.full_name) {
      const repoFullName = req.body.repository.full_name;
      console.log(`[Webhook] [APP] Attempting to find workspace by repository: ${repoFullName}`);

      const integration = await prisma.integration.findFirst({
        where: {
          type: 'github',
          status: 'connected',
          config: {
            path: ['owner'],
            string_contains: repoFullName.split('/')[0],
          },
        },
        select: {
          workspaceId: true,
          webhookSecret: true,
          config: true,
        },
      });

      if (integration) {
        console.log(`[Webhook] [APP] Found workspace by repository: ${integration.workspaceId}`);
        // Extract installation_id from the integration config
        installationId = (integration.config as any)?.installationId;
        console.log(`[Webhook] [APP] Using installation_id from integration: ${installationId}`);
        // Continue processing below with this workspace
      } else {
        return res.status(400).json({ error: 'No installation_id in payload and could not determine workspace' });
      }
    } else {
      return res.status(400).json({ error: 'No installation_id in payload and no repository info' });
    }
  }

  console.log(`[Webhook] [APP] Installation ID: ${installationId}`);

  // Find workspace by installation_id
  const integration = await prisma.integration.findFirst({
    where: {
      type: 'github',
      status: 'connected',
      config: {
        path: ['installationId'],
        equals: installationId,
      },
    },
    select: {
      workspaceId: true,
      webhookSecret: true,
      config: true,
    },
  });

  if (!integration) {
    console.error(`[Webhook] [APP] No workspace found for installation ${installationId}`);
    return res.status(404).json({
      error: `No workspace found for installation ${installationId}`,
      installationId,
      hint: 'Create a GitHub integration for your workspace with this installation_id'
    });
  }

  const workspaceId = integration.workspaceId;
  console.log(`[Webhook] [APP] Routing to workspace ${workspaceId} for installation ${installationId}`);

  // Verify signature using workspace-specific secret or GitHub App secret
  const secret = integration.webhookSecret ||
                 (integration.config as any)?.webhookSecret ||
                 process.env.GITHUB_WEBHOOK_SECRET ||
                 process.env.GH_WEBHOOK_SECRET;

  if (secret) {
    const payload = (req as any).rawBody || JSON.stringify(req.body);
    console.log('[Webhook] [APP] Signature verification:');
    console.log('  - Has rawBody:', !!(req as any).rawBody);
    console.log('  - Payload length:', payload.length);
    console.log('  - Signature header (x-hub-signature-256):', signature || 'MISSING');
    console.log('  - Secret configured:', !!secret);
    console.log('  - Secret length:', secret.length);

    if (!signature) {
      console.warn('[Webhook] [APP] ⚠️  No signature header received from GitHub');
      console.warn('[Webhook] [APP] ⚠️  Proceeding without verification (check GitHub App webhook config)');
      // Continue processing without signature verification
    } else if (!verifyWebhookSignature(payload, signature, secret)) {
      console.error('[Webhook] [APP] Invalid signature - verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    } else {
      console.log('[Webhook] [APP] ✅ Signature verified successfully');
    }
  } else {
    console.warn('[Webhook] [APP] No webhook secret configured - skipping signature verification');
  }

  // Handle ping event
  if (event === 'ping') {
    console.log(`[Webhook] [APP] Ping received for workspace ${workspaceId}`);
    return res.json({ message: 'pong', workspaceId, installationId });
  }

  // Handle pull_request event
  if (event === 'pull_request') {
    return handlePullRequestEventV2(req.body, workspaceId, res);
  }

  // Ignore other events
  console.log(`[Webhook] [APP] Ignoring event: ${event}`);
  return res.json({ message: 'Event ignored' });
});

// ============================================================================
// Tenant-Routed GitHub Webhook (for single-tenant webhook URLs)
// URL: POST /webhooks/github/:workspaceId
// This endpoint is for workspace-specific webhook URLs (optional)
// ============================================================================
router.post('/github/:workspaceId', async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId;
  const signature = req.headers['x-hub-signature-256'] as string;
  const event = req.headers['x-github-event'] as string;
  const deliveryId = req.headers['x-github-delivery'] as string;

  if (!workspaceId) {
    return res.status(400).json({ error: 'Workspace ID is required' });
  }

  console.log(`[Webhook] Received ${event} event for workspace ${workspaceId} (delivery: ${deliveryId})`);

  // 1. Load workspace
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace) {
    console.error(`[Webhook] Workspace not found: ${workspaceId}`);
    return res.status(404).json({ error: 'Workspace not found' });
  }

  // 2. Get workspace-specific webhook secret (from Integration.config or Integration.webhookSecret)
  const secret = await getWorkspaceWebhookSecret(workspaceId);
  if (!secret) {
    console.error('[Webhook] No webhook secret configured for workspace');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // 3. Verify webhook signature using workspace-specific secret
  const payload = (req as any).rawBody || JSON.stringify(req.body);
  if (!verifyWebhookSignature(payload, signature, secret)) {
    console.error('[Webhook] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Handle ping event
  if (event === 'ping') {
    console.log('[Webhook] Ping received for workspace', workspaceId);
    return res.json({ message: 'pong', workspaceId });
  }

  // Handle pull_request event
  if (event === 'pull_request') {
    return handlePullRequestEventV2(req.body, workspaceId, res);
  }

  // Ignore other events
  console.log(`[Webhook] Ignoring event: ${event}`);
  return res.json({ message: 'Event ignored' });
});

// ============================================================================
// LEGACY: Non-tenant GitHub Webhook (deprecated)
// URL: POST /webhooks/github
// Keep for backward compatibility during migration
// ============================================================================
router.post('/github', async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const event = req.headers['x-github-event'] as string;
  const deliveryId = req.headers['x-github-delivery'] as string;

  console.log(`[Webhook] [LEGACY] Received ${event} event (delivery: ${deliveryId})`);
  console.warn('[Webhook] Using legacy webhook endpoint. Please migrate to /webhooks/github/:workspaceId');

  // Verify webhook signature
  const secret = process.env.GH_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Webhook] GH_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // Use raw body for signature verification (preserves original formatting)
  const payload = (req as any).rawBody || JSON.stringify(req.body);
  if (!legacyVerifySignature(payload, signature, secret)) {
    console.error('[Webhook] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Handle different event types
  if (event === 'ping') {
    console.log('[Webhook] Ping received, webhook is configured correctly');
    return res.json({ message: 'pong' });
  }

  if (event === 'pull_request') {
    return handlePullRequestEventLegacy(req.body, res);
  }

  // Ignore other events
  console.log(`[Webhook] Ignoring event: ${event}`);
  return res.json({ message: 'Event ignored' });
});

// ============================================================================
// NEW: Workspace-Scoped PR Handler (Phase 1)
// Uses SignalEvent and DriftCandidate models
// Returns 202 immediately - async processing via pipeline (QStash in Phase 2)
// ============================================================================
async function handlePullRequestEventV2(payload: any, workspaceId: string, res: Response) {
  const prInfo = extractPRInfo(payload);

  if (!prInfo) {
    console.error('[Webhook] Could not extract PR info');
    return res.status(400).json({ error: 'Invalid PR payload' });
  }

  console.log(`[Webhook] [V2] PR #${prInfo.prNumber} ${prInfo.action} in ${prInfo.repoFullName}`);

  // Process merged PRs, opened PRs, synchronize events (new commits), and labeled events
  const shouldProcess =
    (prInfo.action === 'closed' && prInfo.merged) ||  // Merged PR
    prInfo.action === 'opened' ||                      // New PR opened
    prInfo.action === 'synchronize' ||                 // New commits pushed to PR
    prInfo.action === 'labeled';                       // Label added to PR

  if (!shouldProcess) {
    console.log(`[Webhook] Ignoring PR action: ${prInfo.action}, merged: ${prInfo.merged}`);
    return res.json({ message: 'PR action not relevant for drift detection' });
  }

  // For labeled events, only run gatekeeper (skip drift detection)
  const isLabeledEvent = prInfo.action === 'labeled';
  if (isLabeledEvent) {
    console.log(`[Webhook] [V2] Label added to PR #${prInfo.prNumber} - running gatekeeper only`);
  }

  const eventType = prInfo.merged ? 'merged' : prInfo.action;
  console.log(`[Webhook] [V2] Processing ${eventType} PR #${prInfo.prNumber}: ${prInfo.prTitle}`);

  // For labeled events, we only need to run the gatekeeper (no drift detection)
  // Fetch PR details and run gatekeeper, then return early
  if (isLabeledEvent) {
    try {
      const octokit = await getGitHubClient(workspaceId, prInfo.installationId);
      if (!octokit) {
        console.error('[Webhook] [V2] Could not get GitHub client for labeled event');
        return res.status(500).json({ error: 'GitHub client not available' });
      }

      // Fetch PR details to get labels, commits, files
      const { data: prData } = await octokit.rest.pulls.get({
        owner: prInfo.repoOwner,
        repo: prInfo.repoName,
        pull_number: prInfo.prNumber,
      });

      const labels = prData.labels?.map((l: any) => l.name) || [];
      const additions = prData.additions || 0;
      const deletions = prData.deletions || 0;

      // Fetch commits
      const { data: commitsData } = await octokit.rest.pulls.listCommits({
        owner: prInfo.repoOwner,
        repo: prInfo.repoName,
        pull_number: prInfo.prNumber,
      });
      const commits = commitsData.map((c: any) => ({
        message: c.commit.message,
        author: c.commit.author?.name || 'unknown',
      }));

      // Fetch files
      const { data: filesData } = await octokit.rest.pulls.listFiles({
        owner: prInfo.repoOwner,
        repo: prInfo.repoName,
        pull_number: prInfo.prNumber,
      });
      const files = filesData.map((f: any) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      }));

      // Run gatekeeper
      if (isFeatureEnabled('ENABLE_AGENT_PR_GATEKEEPER', workspaceId)) {
        if (shouldRunGatekeeper({ author: prInfo.authorLogin, labels })) {
          console.log(`[Webhook] [V2] Running Agent PR Gatekeeper for labeled PR #${prInfo.prNumber}`);

          try {
            const gatekeeperResult = await runGatekeeper({
              owner: prInfo.repoOwner,
              repo: prInfo.repoName,
              prNumber: prInfo.prNumber,
              headSha: payload.pull_request.head.sha,
              installationId: prInfo.installationId,
              workspaceId,
              author: prInfo.authorLogin,
              title: prInfo.prTitle,
              body: prInfo.prBody || '',
              labels,
              baseBranch: payload.pull_request.base.ref,
              headBranch: payload.pull_request.head.ref,
              commits,
              additions,
              deletions,
              files,
            });

            console.log(`[Webhook] [V2] Gatekeeper result for labeled event: ${gatekeeperResult.riskTier}`);

            return res.status(200).json({
              message: 'Label added - gatekeeper check triggered',
              prNumber: prInfo.prNumber,
              labels,
            });
          } catch (error: any) {
            console.error('[Webhook] [V2] Gatekeeper failed for labeled event:', error.message);
            return res.status(500).json({ error: 'Gatekeeper failed', details: error.message });
          }
        } else {
          console.log(`[Webhook] [V2] Skipping gatekeeper for labeled PR #${prInfo.prNumber} (trusted bot or skip label)`);
          return res.json({ message: 'Label added but gatekeeper skipped' });
        }
      } else {
        console.log(`[Webhook] [V2] Gatekeeper not enabled for workspace ${workspaceId}`);
        return res.json({ message: 'Label added but gatekeeper not enabled' });
      }
    } catch (error: any) {
      console.error('[Webhook] [V2] Error handling labeled event:', error.message);
      return res.status(500).json({ error: 'Failed to handle labeled event', details: error.message });
    }
  }

  try {
    // Generate a unique signal event ID
    const signalEventId = `github_pr_${prInfo.repoFullName.replace('/', '_')}_${prInfo.prNumber}`;

    // Check if we already processed this PR
    const existingSignal = await prisma.signalEvent.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: signalEventId,
        }
      },
    });

    // If PR was already processed and is now being merged, update the signal
    if (existingSignal && prInfo.merged) {
      console.log(`[Webhook] [V2] PR was opened earlier, now merged - updating signal to merged=true`);

      // Update the existing signal to mark it as merged
      await prisma.signalEvent.update({
        where: {
          workspaceId_id: {
            workspaceId,
            id: signalEventId,
          }
        },
        data: {
          extracted: {
            ...(existingSignal.extracted as any),
            merged: true,
            mergedAt: prInfo.mergedAt,
          }
        }
      });

      // Find the existing drift candidate and re-enqueue it for processing
      const existingDrift = await prisma.driftCandidate.findFirst({
        where: {
          workspaceId,
          signalEventId,
        }
      });

      if (existingDrift) {
        console.log(`[Webhook] [V2] Re-enqueueing drift candidate ${existingDrift.id} for merged PR`);

        // Reset state to INGESTED so it can be processed again
        await prisma.driftCandidate.update({
          where: {
            workspaceId_id: {
              workspaceId,
              id: existingDrift.id,
            }
          },
          data: { state: 'INGESTED' }
        });

        // Enqueue job for async processing
        const messageId = await enqueueJob({
          workspaceId,
          driftId: existingDrift.id,
        });

        console.log(`[Webhook] [V2] Re-enqueued job ${messageId} for drift candidate ${existingDrift.id}`);

        return res.status(202).json({
          message: 'PR merged - drift candidate re-enqueued',
          signalEventId,
          driftId: existingDrift.id,
          qstashMessageId: messageId || undefined,
        });
      }
    }

    // Infer service from repo name (simple heuristic - can be improved)
    const inferredService = prInfo.repoName;

    // Get PR diff and files for analysis using WORKSPACE-SCOPED GitHub client
    let diff = '';
    let files: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }> = [];
    let commits: Array<{ message: string; author: string }> = [];
    let labels: string[] = [];
    let additions = 0;
    let deletions = 0;

    try {
      // Use workspace-scoped GitHub client (multi-tenant)
      // This fetches credentials from Integration.config for this workspace
      const octokit = await getGitHubClient(workspaceId, prInfo.installationId);

      if (octokit) {
        console.log(`[Webhook] [V2] Fetching PR diff and files using workspace-scoped client`);

        // Fetch PR details, diff, files, and commits in parallel
        const [prDetails, prDiff, prFiles, prCommits] = await Promise.all([
          octokit.rest.pulls.get({
            owner: prInfo.repoOwner,
            repo: prInfo.repoName,
            pull_number: prInfo.prNumber,
          }),
          getPRDiff(octokit, prInfo.repoOwner, prInfo.repoName, prInfo.prNumber),
          octokit.rest.pulls.listFiles({
            owner: prInfo.repoOwner,
            repo: prInfo.repoName,
            pull_number: prInfo.prNumber,
            per_page: 100,
          }),
          octokit.rest.pulls.listCommits({
            owner: prInfo.repoOwner,
            repo: prInfo.repoName,
            pull_number: prInfo.prNumber,
            per_page: 100,
          }),
        ]);

        diff = prDiff;
        files = prFiles.data.map(file => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          patch: file.patch,
        }));
        commits = prCommits.data.map(commit => ({
          message: commit.commit.message,
          author: commit.commit.author?.name || commit.author?.login || 'unknown',
        }));
        labels = prDetails.data.labels.map(label => typeof label === 'string' ? label : label.name);
        additions = prDetails.data.additions;
        deletions = prDetails.data.deletions;

        console.log(`[Webhook] [V2] Fetched ${files.length} files, ${commits.length} commits, ${labels.length} labels`);
      } else {
        console.warn(`[Webhook] [V2] No GitHub client available for workspace ${workspaceId}`);
      }
    } catch (error: any) {
      console.error('[Webhook] [V2] Error fetching PR details:', error.message);
    }

    // =========================================================================
    // AGENT PR GATEKEEPER (Phase 1)
    // Run gatekeeper for opened and synchronize events (not for merged PRs)
    // Creates GitHub Check with risk tier and evidence requirements
    // NOTE: Run this BEFORE checking for duplicate signals so that we can
    // re-run the gatekeeper if needed (e.g., after a deployment)
    // =========================================================================
    if (isFeatureEnabled('ENABLE_AGENT_PR_GATEKEEPER', workspaceId) && !prInfo.merged) {
      if (shouldRunGatekeeper({ author: prInfo.authorLogin, labels })) {
        console.log(`[Webhook] [V2] Running Agent PR Gatekeeper for PR #${prInfo.prNumber}`);

        try {
          const gatekeeperResult = await runGatekeeper({
            owner: prInfo.repoOwner,
            repo: prInfo.repoName,
            prNumber: prInfo.prNumber,
            headSha: payload.pull_request.head.sha,
            installationId: prInfo.installationId,
            workspaceId,
            author: prInfo.authorLogin,
            title: prInfo.prTitle,
            body: prInfo.prBody || '',
            labels,
            baseBranch: payload.pull_request.base.ref,
            headBranch: payload.pull_request.head.ref,
            commits,
            additions,
            deletions,
            files,
          });

          console.log(`[Webhook] [V2] Gatekeeper result: ${gatekeeperResult.riskTier} (agent: ${gatekeeperResult.agentDetected})`);
          if (gatekeeperResult.deltaSyncFindings.length > 0) {
            console.log(`[Webhook] [V2] Delta sync findings: ${gatekeeperResult.deltaSyncFindings.length}`);
          }
        } catch (error: any) {
          console.error('[Webhook] [V2] Gatekeeper failed:', error.message);
          // Don't fail the webhook if gatekeeper fails
        }
      } else {
        console.log(`[Webhook] [V2] Skipping gatekeeper for PR #${prInfo.prNumber} (trusted bot or skip label)`);
      }
    }

    // If signal already exists and it's not a merge event, skip creating duplicate signal
    // NOTE: We still run the gatekeeper above even for duplicate signals
    if (existingSignal) {
      console.log(`[Webhook] [V2] Signal already exists, skipping signal/drift creation`);
      return res.json({ message: 'PR already processed', signalEventId });
    }

    // =========================================================================
    // CONTRACT VALIDATION (Track 1 - Week 5-6)
    // Run contract validation for opened and synchronize events (not for merged PRs)
    // Creates GitHub Check with contract integrity findings
    // CRITICAL: Must complete in < 30s to avoid GitHub webhook timeout
    // =========================================================================
    if (isFeatureEnabled('ENABLE_CONTRACT_VALIDATION', workspaceId) && !prInfo.merged) {
      console.log(`[Webhook] [V2] Running Contract Validation for PR #${prInfo.prNumber}`);

      // FIX: Declare timeout ID outside try block so it's accessible in catch
      let timeoutId: NodeJS.Timeout | undefined;

      try {
        // Track A requirement: < 30s total latency
        // Use 25s timeout to leave 5s buffer for GitHub webhook processing
        const TRACK_A_TIMEOUT_MS = 25000;

        const validationPromise = runContractValidation({
          workspaceId,
          signalEventId,
          changedFiles: files,
          service: inferredService,
          repo: prInfo.repoFullName,
        });

        // FIX: Store timeout ID so we can clear it to prevent memory leak
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Contract validation timeout')), TRACK_A_TIMEOUT_MS);
        });

        const validationResult = await Promise.race([validationPromise, timeoutPromise]);

        // FIX: Clear timeout if validation completed successfully
        if (timeoutId) clearTimeout(timeoutId);

        console.log(`[Webhook] [V2] Contract validation result: ${validationResult.band} (${validationResult.totalCount} findings)`);
        console.log(`[Webhook] [V2] Severity breakdown: critical=${validationResult.criticalCount}, high=${validationResult.highCount}, medium=${validationResult.mediumCount}, low=${validationResult.lowCount}`);
        console.log(`[Webhook] [V2] Contracts checked: ${validationResult.contractsChecked}, duration: ${validationResult.duration}ms`);

        // Create GitHub Check from validation result (Week 3-4 Task 1)
        if (prInfo.installationId) {
          try {
            const { createContractValidationCheck } = await import('../services/contractGate/githubCheck.js');

            await createContractValidationCheck({
              owner: prInfo.repoOwner,
              repo: prInfo.repoName,
              headSha: payload.pull_request.head.sha,
              installationId: prInfo.installationId,
              band: validationResult.band,
              findings: validationResult.findings,
              contractsChecked: validationResult.contractsChecked,
              duration: validationResult.duration,
              signalEventId,
              workspaceId,
              surfacesTouched: validationResult.surfacesTouched,
              criticalCount: validationResult.criticalCount,
              highCount: validationResult.highCount,
              mediumCount: validationResult.mediumCount,
              lowCount: validationResult.lowCount,
              policyMode: validationResult.policyMode, // NEW: Policy enforcement mode
            });

            console.log(`[Webhook] [V2] Created GitHub Check for contract validation`);
          } catch (checkError: any) {
            console.error('[Webhook] [V2] Failed to create GitHub Check:', checkError.message);
            // Don't fail the webhook if check creation fails
          }
        } else {
          console.warn('[Webhook] [V2] No installation ID - skipping GitHub Check creation');
        }
      } catch (error: any) {
        // FIX: Clear timeout on error to prevent memory leak
        if (timeoutId) clearTimeout(timeoutId);

        // Handle timeout with soft-fail to WARN
        if (error.message === 'Contract validation timeout') {
          console.error('[Webhook] [V2] Contract validation timeout - soft-failing to WARN');

          // Create WARN check to indicate timeout
          if (prInfo.installationId) {
            try {
              const { createContractValidationCheck } = await import('../services/contractGate/githubCheck.js');

              await createContractValidationCheck({
                owner: prInfo.repoOwner,
                repo: prInfo.repoName,
                headSha: payload.pull_request.head.sha,
                installationId: prInfo.installationId,
                band: 'warn',
                findings: [],
                contractsChecked: 0,
                duration: 25000,
                signalEventId,
                workspaceId,
                surfacesTouched: [],
                criticalCount: 0,
                highCount: 0,
                mediumCount: 0,
                lowCount: 0,
                policyMode: 'warn_only',
                timeoutOccurred: true, // Flag to indicate timeout
              });

              console.log(`[Webhook] [V2] Created WARN GitHub Check for timeout`);
            } catch (checkError: any) {
              console.error('[Webhook] [V2] Failed to create timeout GitHub Check:', checkError.message);
            }
          }
        } else {
          console.error('[Webhook] [V2] Contract validation failed:', error.message);
          // Don't fail the webhook if validation fails
        }
      }
    }

    // =========================================================================
    // CODEOWNERS Detection (Phase 1 - Multi-Source)
    // Detect ownership drift when CODEOWNERS file is modified
    // =========================================================================
    let ownershipDriftHint: {
      driftType: 'ownership';
      driftDomains: string[];
      evidenceSummary: string;
      confidence: number;
    } | null = null;

    if (isFeatureEnabled('ENABLE_CODEOWNERS_DETECTION', workspaceId)) {
      const codeownersFile = files.find(f => isCodeOwnersFile(f.filename));

      if (codeownersFile) {
        console.log(`[Webhook] [V2] CODEOWNERS file detected: ${codeownersFile.filename}`);

        try {
          const octokit = await getGitHubClient(workspaceId, prInfo.installationId);

          if (octokit) {
            // Fetch old CODEOWNERS content (from base branch)
            const oldContent = await getFileContent(
              octokit,
              prInfo.repoOwner,
              prInfo.repoName,
              codeownersFile.filename,
              prInfo.baseBranch
            );

            // Fetch new CODEOWNERS content (from head branch / merged state)
            const newContent = await getFileContent(
              octokit,
              prInfo.repoOwner,
              prInfo.repoName,
              codeownersFile.filename,
              prInfo.headBranch
            );

            // Diff and create ownership drift signal
            const codeownersDiff = diffCodeOwners(oldContent, newContent);

            if (codeownersDiff.hasOwnershipDrift) {
              console.log(`[Webhook] [V2] Ownership drift detected: ${codeownersDiff.summary}`);
              ownershipDriftHint = createOwnershipDriftSignal(
                codeownersDiff,
                prInfo.repoFullName,
                prInfo.prNumber
              );
            }
          }
        } catch (error: any) {
          console.error('[Webhook] [V2] Error processing CODEOWNERS:', error.message);
        }
      }
    }

    // =========================================================================
    // OpenAPI/Swagger Detection (Phase 2 - Multi-Source)
    // Detect API drift when OpenAPI/Swagger files are modified
    // =========================================================================
    let apiDriftHint: {
      driftType: 'instruction';
      driftDomains: string[];
      evidenceSummary: string;
      confidence: number;
    } | null = null;

    if (isFeatureEnabled('ENABLE_SWAGGER_ADAPTER', workspaceId)) {
      const { isOpenApiFile, diffOpenApiSpecs, createApiDriftSignal } = await import(
        '../services/signals/openApiParser.js'
      );

      const openApiFile = files.find(f => isOpenApiFile(f.filename));

      if (openApiFile) {
        console.log(`[Webhook] [V2] OpenAPI file detected: ${openApiFile.filename}`);

        try {
          const octokit = await getGitHubClient(workspaceId, prInfo.installationId);

          if (octokit) {
            // Fetch old spec content (from base branch)
            const oldContent = await getFileContent(
              octokit,
              prInfo.repoOwner,
              prInfo.repoName,
              openApiFile.filename,
              prInfo.baseBranch
            );

            // Fetch new spec content (from head branch / merged state)
            const newContent = await getFileContent(
              octokit,
              prInfo.repoOwner,
              prInfo.repoName,
              openApiFile.filename,
              prInfo.headBranch
            );

            // Diff and create API drift signal
            const openApiDiff = diffOpenApiSpecs(oldContent, newContent);

            if (openApiDiff.changes.length > 0) {
              console.log(`[Webhook] [V2] API drift detected: ${openApiDiff.summary}`);
              apiDriftHint = createApiDriftSignal(
                openApiDiff,
                prInfo.repoFullName,
                prInfo.prNumber
              );
            }
          }
        } catch (error: any) {
          console.error('[Webhook] [V2] Error processing OpenAPI spec:', error.message);
        }
      }
    }

    // =========================================================================
    // Backstage catalog-info.yaml Detection (Phase 2 - Multi-Source)
    // Detect operational drift when catalog-info.yaml is modified
    // =========================================================================
    let catalogDriftHint: {
      driftType: 'ownership' | 'environment_tooling';
      driftDomains: string[];
      evidenceSummary: string;
      confidence: number;
    } | null = null;

    if (isFeatureEnabled('ENABLE_BACKSTAGE_ADAPTER', workspaceId)) {
      const catalogFile = files.find(f =>
        f.filename === 'catalog-info.yaml' ||
        f.filename === 'catalog-info.yml' ||
        f.filename.endsWith('/catalog-info.yaml') ||
        f.filename.endsWith('/catalog-info.yml')
      );

      if (catalogFile) {
        console.log(`[Webhook] [V2] Backstage catalog file detected: ${catalogFile.filename}`);

        // Catalog changes typically indicate ownership or operational drift
        catalogDriftHint = {
          driftType: 'ownership', // catalog-info.yaml primarily documents ownership
          driftDomains: ['service-catalog', 'operational', prInfo.repoName],
          evidenceSummary: `Backstage catalog file ${catalogFile.status}: ${catalogFile.filename} in PR #${prInfo.prNumber}`,
          confidence: 0.70, // Medium confidence - needs human review
        };
      }
    }

    // PATTERN 1: Validate extracted data BEFORE creating SignalEvent
    const { validateExtractedData } = await import('../services/validators/extractedDataValidator.js');
    const extractedData = {
      prNumber: prInfo.prNumber,
      prTitle: prInfo.prTitle,
      prBody: prInfo.prBody,
      authorLogin: prInfo.authorLogin,
      baseBranch: prInfo.baseBranch,
      headBranch: prInfo.headBranch,
      merged: prInfo.merged,  // FIX: Required by pre-validation (preValidateGitHubPR)
      mergedAt: prInfo.mergedAt,  // Include merge timestamp
      repoFullName: prInfo.repoFullName,  // Include full repo name
      installationId: prInfo.installationId,  // FIX: Required for GitHub client fallback
      changedFiles: files,
      diff: diff.substring(0, 50000),  // FIX: Required by deterministic comparison
      totalChanges: files.reduce((sum, f) => sum + f.additions + f.deletions, 0),  // FIX: Required by pre-validation
      // Include drift hints if detected (Phase 1 & 2)
      ...(ownershipDriftHint && { ownershipDriftHint }),
      ...(apiDriftHint && { apiDriftHint }),
      ...(catalogDriftHint && { catalogDriftHint }),
    };

    const validationResult = validateExtractedData('github_pr', extractedData);
    if (!validationResult.valid) {
      console.error(`[Webhook] [V2] Invalid extracted data: ${validationResult.errors.join(', ')}`);
      return res.status(400).json({
        error: 'Invalid extracted data',
        errors: validationResult.errors,
        warnings: validationResult.warnings,
      });
    }

    if (validationResult.warnings.length > 0) {
      console.warn(`[Webhook] [V2] Extracted data warnings: ${validationResult.warnings.join(', ')}`);
    }

    // Create SignalEvent record (workspace-scoped)
    const signalEvent = await prisma.signalEvent.create({
      data: {
        workspaceId,
        id: signalEventId,
        sourceType: 'github_pr',
        occurredAt: prInfo.mergedAt ? new Date(prInfo.mergedAt) : new Date(),
        repo: prInfo.repoFullName,
        service: inferredService,
        extracted: extractedData,
        rawPayload: {
          ...payload,
          diff: diff.substring(0, 50000), // Limit diff size
        },
      },
    });

    console.log(`[Webhook] [V2] Created signal event ${signalEvent.id}`);

    // PHASE 1 WEEK 1-2: Contract Resolution (parallel with drift detection)
    // Load contract pack and resolve contracts from signal
    let contractResolutionResult = null;
    try {
      const contractPack = await prisma.contractPack.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' }, // Get latest version
      });

      if (contractPack) {
        const contracts = contractPack.contracts as unknown as Contract[];
        const resolver = new ContractResolver(workspaceId, contracts);

        const startTime = Date.now();
        contractResolutionResult = await resolver.resolveFromSignal(signalEvent);
        const resolutionTimeMs = Date.now() - startTime;

        // Calculate and log telemetry metrics
        const metrics = calculateResolutionMetrics(
          workspaceId,
          signalEvent.id,
          contractResolutionResult,
          resolutionTimeMs,
          files.length
        );

        logResolutionMetrics(metrics);
        logResolutionDetails(contractResolutionResult, true);

        // Store contract resolution result
        await prisma.contractResolution.create({
          data: {
            workspaceId,
            signalEventId: signalEvent.id,
            resolvedContracts: contractResolutionResult.resolvedContracts as any,
            unresolvedArtifacts: contractResolutionResult.unresolvedArtifacts as any,
            obligations: contractResolutionResult.obligations as any,
            resolutionMethod: contractResolutionResult.resolvedContracts.length > 0 && contractResolutionResult.resolvedContracts[0]
              ? contractResolutionResult.resolvedContracts[0].resolutionMethod
              : 'none',
            resolutionTimeMs,
          },
        });

        console.log(`[Webhook] [V2] Contract resolution stored successfully`);

        // PHASE 1 WEEK 3-4: Artifact Fetching (after contract resolution)
        // Fetch artifacts for resolved contracts
        if (contractResolutionResult.resolvedContracts.length > 0) {
          try {
            const { ArtifactFetcher } = await import('../services/contracts/artifactFetcher.js');
            const fetcher = new ArtifactFetcher(workspaceId);

            for (const resolvedContract of contractResolutionResult.resolvedContracts) {
              // Find the contract definition
              const contract = contracts.find(c => c.contractId === resolvedContract.contractId);
              if (!contract) {
                continue;
              }

              // Fetch artifacts for this contract
              const triggeredBy = {
                signalEventId: signalEvent.id,
                prNumber: prInfo?.prNumber,
              };

              const snapshots = await fetcher.fetchContractArtifacts(
                contract.contractId,
                contract.artifacts,
                triggeredBy
              );

              console.log(`[Webhook] [V2] Fetched ${snapshots.length} artifact snapshots for contract ${contract.contractId}`);
            }
          } catch (fetchError) {
            console.error('[Webhook] [V2] Artifact fetching failed (non-blocking):', fetchError);
          }
        }
      } else {
        console.log(`[Webhook] [V2] No contract pack found for workspace ${workspaceId} - skipping contract resolution`);
      }
    } catch (contractError) {
      console.error('[Webhook] [V2] Contract resolution failed (non-blocking):', contractError);
      // Contract resolution failure should not block drift detection
    }

    // PHASE 4: Generate trace ID for end-to-end observability
    const { generateTraceId } = await import('../lib/structuredLogger.js');
    const traceId = generateTraceId();

    // Create DriftCandidate in INGESTED state
    const driftCandidate = await prisma.driftCandidate.create({
      data: {
        workspaceId,
        signalEventId: signalEvent.id,
        state: 'INGESTED',
        sourceType: 'github_pr',
        repo: prInfo.repoFullName,
        service: inferredService,
        traceId, // PHASE 4: Add trace ID for observability
      },
    });

    console.log(`[Webhook] [V2] Created drift candidate ${driftCandidate.id} in INGESTED state (traceId: ${traceId})`);

    // Phase 2: Enqueue QStash job for async state machine processing
    const messageId = await enqueueJob({
      workspaceId,
      driftId: driftCandidate.id,
    });

    if (messageId) {
      console.log(`[Webhook] [V2] Enqueued job ${messageId} for drift candidate ${driftCandidate.id}`);
    } else {
      // QStash not configured - fall back to synchronous pipeline (backward compatibility)
      console.log(`[Webhook] [V2] QStash not configured - running synchronous pipeline`);
      try {
        const pipelineResult = await runDriftDetectionPipeline({
          signalId: signalEvent.id,
          workspaceId,
          driftCandidateId: driftCandidate.id,
          prNumber: prInfo.prNumber,
          prTitle: prInfo.prTitle,
          prBody: prInfo.prBody,
          repoFullName: prInfo.repoFullName,
          authorLogin: prInfo.authorLogin,
          mergedAt: prInfo.mergedAt,
          changedFiles: files,
          diff,
        });

        // Update drift candidate state based on pipeline result
        if (pipelineResult.driftDetected && pipelineResult.proposalIds.length > 0) {
          await prisma.driftCandidate.update({
            where: {
              workspaceId_id: { workspaceId, id: driftCandidate.id }
            },
            data: {
              state: 'SLACK_SENT',
              stateUpdatedAt: new Date(),
            }
          });
        }

        console.log(`[Webhook] [V2] Sync pipeline complete: drift_detected=${pipelineResult.driftDetected}`);
      } catch (pipelineError) {
        console.error('[Webhook] [V2] Sync pipeline failed:', pipelineError);
        // Update drift candidate with error
        await prisma.driftCandidate.update({
          where: {
            workspaceId_id: { workspaceId, id: driftCandidate.id }
          },
          data: {
            lastErrorMessage: String(pipelineError),
            retryCount: { increment: 1 },
          }
        });
      }
    }

    // Return 202 Accepted (async processing pattern)
    return res.status(202).json({
      message: 'Webhook received',
      signalEventId: signalEvent.id,
      driftId: driftCandidate.id,
      qstashMessageId: messageId || undefined,
    });

  } catch (error) {
    console.error('[Webhook] [V2] Error processing PR:', error);
    return res.status(500).json({ error: 'Failed to process PR' });
  }
}

// ============================================================================
// LEGACY: Organization-Based PR Handler (deprecated)
// Uses Signal and DiffProposal models
// Keep for backward compatibility during migration
// ============================================================================
async function handlePullRequestEventLegacy(payload: any, res: Response) {
  const prInfo = extractPRInfo(payload);

  if (!prInfo) {
    console.error('[Webhook] [LEGACY] Could not extract PR info');
    return res.status(400).json({ error: 'Invalid PR payload' });
  }

  console.log(`[Webhook] [LEGACY] PR #${prInfo.prNumber} ${prInfo.action} in ${prInfo.repoFullName}`);

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

    // LEGACY: Get PR diff and files for analysis using environment credentials
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
        console.log(`[Webhook] [LEGACY] Fetching PR diff and files using ${prInfo.installationId ? 'GitHub App' : 'token'} auth`);
        [diff, files] = await Promise.all([
          getLegacyPRDiff(octokit, prInfo.repoOwner, prInfo.repoName, prInfo.prNumber),
          getLegacyPRFiles(octokit, prInfo.repoOwner, prInfo.repoName, prInfo.prNumber),
        ]);
        console.log(`[Webhook] [LEGACY] Fetched ${files.length} files, diff length: ${diff.length}`);
      } else {
        console.warn('[Webhook] [LEGACY] No GitHub auth available - set GITHUB_TOKEN env var to enable PR diff fetching');
        console.log(`[Webhook] [LEGACY] Will use PR title/body for drift detection (${prInfo.changedFiles} files changed)`);
      }
    } catch (error: any) {
      console.error('[Webhook] [LEGACY] Error fetching PR details:', error.message);
      console.log(`[Webhook] [LEGACY] Will use PR title/body for drift detection (${prInfo.changedFiles} files changed)`);
    }

    // If we couldn't fetch files but have changedFiles count, create placeholder entries
    // This helps the drift detection know files were changed even without details
    if (files.length === 0 && prInfo.changedFiles > 0) {
      console.log(`[Webhook] Creating placeholder for ${prInfo.changedFiles} changed files`);
      // We don't have filenames, but we can indicate files were changed
      // The drift detection will rely more on PR title/body in this case
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

    // DEPRECATED: Legacy pipeline disabled - use tenant-routed webhooks instead
    // The legacy pipeline uses the old Signal model, not workspace-scoped SignalEvent
    console.warn('[Webhook] [LEGACY] Pipeline disabled. Please migrate to /webhooks/github/:workspaceId');

    return res.json({
      message: 'PR recorded (legacy mode - pipeline disabled)',
      signalId: signal.id,
      deprecated: true,
      migrateTo: '/webhooks/github/:workspaceId',
    });

  } catch (error) {
    console.error('[Webhook] Error processing PR:', error);
    return res.status(500).json({ error: 'Failed to process PR' });
  }
}

// Export the handler for use in test endpoint
export { handlePullRequestEventV2 };

export default router;

