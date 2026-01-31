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
// NEW: Tenant-Routed GitHub Webhook (Phase 1)
// URL: POST /webhooks/github/:workspaceId
// This is the recommended endpoint for new integrations
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
// NEW: GitHub App Global Webhook (for app-level webhook configuration)
// URL: POST /webhooks/github/app
// Routes webhooks by installation_id to find the correct workspace
// This is the URL to configure in GitHub App settings
// ============================================================================
router.post('/github/app', async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const event = req.headers['x-github-event'] as string;
  const deliveryId = req.headers['x-github-delivery'] as string;

  console.log(`[Webhook] [APP] Received ${event} event (delivery: ${deliveryId})`);

  // Extract installation_id from payload
  const installationId = req.body?.installation?.id;

  if (!installationId) {
    console.error('[Webhook] [APP] No installation_id in payload');
    // For ping events without installation_id, verify with global secret
    if (event === 'ping') {
      console.log('[Webhook] [APP] Ping received at app-level endpoint');
      return res.json({ message: 'pong', endpoint: 'app' });
    }
    return res.status(400).json({ error: 'No installation_id in payload' });
  }

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
    return res.status(404).json({ error: `No workspace found for installation ${installationId}` });
  }

  const workspaceId = integration.workspaceId;
  console.log(`[Webhook] [APP] Routing to workspace ${workspaceId} for installation ${installationId}`);

  // Verify signature using workspace-specific secret
  const secret = integration.webhookSecret || (integration.config as any)?.webhookSecret;
  if (secret) {
    const payload = (req as any).rawBody || JSON.stringify(req.body);
    if (!verifyWebhookSignature(payload, signature, secret)) {
      console.error('[Webhook] [APP] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } else {
    // No workspace secret, try global secret for backward compatibility
    const globalSecret = process.env.GH_WEBHOOK_SECRET;
    if (globalSecret) {
      const payload = (req as any).rawBody || JSON.stringify(req.body);
      if (!legacyVerifySignature(payload, signature, globalSecret)) {
        console.error('[Webhook] [APP] Invalid signature (global)');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } else {
      console.warn('[Webhook] [APP] No webhook secret configured - skipping signature verification');
    }
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

  // Only process merged PRs for drift detection
  if (prInfo.action !== 'closed' || !prInfo.merged) {
    console.log(`[Webhook] Ignoring PR action: ${prInfo.action}, merged: ${prInfo.merged}`);
    return res.json({ message: 'PR not merged, ignoring' });
  }

  console.log(`[Webhook] [V2] Processing merged PR #${prInfo.prNumber}: ${prInfo.prTitle}`);

  try {
    // Generate a unique signal event ID
    const signalEventId = `github_pr_${prInfo.repoFullName.replace('/', '_')}_${prInfo.prNumber}`;

    // Check if we already processed this PR (idempotency)
    const existingSignal = await prisma.signalEvent.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: signalEventId,
        }
      },
    });

    if (existingSignal) {
      console.log(`[Webhook] [V2] PR already processed, skipping`);
      return res.json({ message: 'PR already processed', signalEventId });
    }

    // Infer service from repo name (simple heuristic - can be improved)
    const inferredService = prInfo.repoName;

    // Get PR diff and files for analysis using WORKSPACE-SCOPED GitHub client
    let diff = '';
    let files: Array<{ filename: string; status: string; additions: number; deletions: number }> = [];

    try {
      // Use workspace-scoped GitHub client (multi-tenant)
      // This fetches credentials from Integration.config for this workspace
      const octokit = await getGitHubClient(workspaceId, prInfo.installationId);

      if (octokit) {
        console.log(`[Webhook] [V2] Fetching PR diff and files using workspace-scoped client`);
        [diff, files] = await Promise.all([
          getPRDiff(octokit, prInfo.repoOwner, prInfo.repoName, prInfo.prNumber),
          getPRFiles(octokit, prInfo.repoOwner, prInfo.repoName, prInfo.prNumber),
        ]);
        console.log(`[Webhook] [V2] Fetched ${files.length} files, diff length: ${diff.length}`);
      } else {
        console.warn(`[Webhook] [V2] No GitHub client available for workspace ${workspaceId}`);
      }
    } catch (error: any) {
      console.error('[Webhook] [V2] Error fetching PR details:', error.message);
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

    // Create SignalEvent record (workspace-scoped)
    const signalEvent = await prisma.signalEvent.create({
      data: {
        workspaceId,
        id: signalEventId,
        sourceType: 'github_pr',
        occurredAt: prInfo.mergedAt ? new Date(prInfo.mergedAt) : new Date(),
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
          // Include drift hints if detected (Phase 1 & 2)
          ...(ownershipDriftHint && { ownershipDriftHint }),
          ...(apiDriftHint && { apiDriftHint }),
          ...(catalogDriftHint && { catalogDriftHint }),
        },
        rawPayload: {
          ...payload,
          diff: diff.substring(0, 50000), // Limit diff size
        },
      },
    });

    console.log(`[Webhook] [V2] Created signal event ${signalEvent.id}`);

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

    console.log(`[Webhook] [V2] Created drift candidate ${driftCandidate.id} in INGESTED state`);

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

export default router;

