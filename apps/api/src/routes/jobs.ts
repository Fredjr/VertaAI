// Job Runner Route - processes drift candidates via QStash
// Based on Section 15.10.4 of the spec

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { Receiver } from '@upstash/qstash';
import { prisma } from '../lib/db.js';
import { acquireLock, releaseLock } from '../services/queue/locking.js';
import { enqueueJob } from '../services/queue/qstash.js';
import { executeTransition } from '../services/orchestrator/transitions.js';
import {
  DriftState,
  TERMINAL_STATES,
  HUMAN_GATED_STATES,
  MAX_TRANSITIONS_PER_INVOCATION,
} from '../types/state-machine.js';
import { isFeatureEnabled } from '../config/featureFlags.js';
import {
  ingestRecentQuestions,
  getSlackBotToken,
} from '../services/signals/slackMessageIngester.js';
import {
  clusterQuestions,
  saveClusters,
  getUnprocessedClusters,
  markClusterProcessed,
} from '../services/signals/questionClusterer.js';
import { detectCoverageDrift, createCoverageDriftSignal } from '../agents/coverage-drift-detector.js';
import { resolveDocsForDrift } from '../services/docs/docResolution.js';

const router: RouterType = Router();

// FIX C3: Max retry limit to prevent infinite loops
const MAX_RETRIES = 10;

// QStash signature verification
const getReceiver = (): Receiver | null => {
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY) {
    console.warn('[Jobs] QStash signing keys not configured - signature verification disabled');
    return null;
  }
  return new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
  });
};

/**
 * POST /api/jobs/run
 * Process a drift candidate through the state machine
 */
router.post('/run', async (req: Request, res: Response) => {
  const receiver = getReceiver();

  // 1. Verify QStash signature (if configured)
  if (receiver) {
    const signature = req.headers['upstash-signature'] as string;
    const body = (req as any).rawBody || JSON.stringify(req.body);

    try {
      const isValid = await receiver.verify({ signature, body });
      if (!isValid) {
        console.error('[Jobs] Invalid QStash signature');
        return res.status(401).json({ error: 'Invalid QStash signature' });
      }
    } catch (error) {
      console.error('[Jobs] Signature verification failed:', error);
      return res.status(401).json({ error: 'Signature verification failed' });
    }
  }

  const { workspaceId, driftId, attempt = 1 } = req.body;

  if (!workspaceId || !driftId) {
    return res.status(400).json({ error: 'Missing workspaceId or driftId' });
  }

  console.log(`[Jobs] Processing drift ${driftId} (attempt ${attempt})`);

  // 2. Acquire distributed lock
  const lockAcquired = await acquireLock(workspaceId, driftId);
  if (!lockAcquired) {
    console.log(`[Jobs] Skipping drift ${driftId} - another worker is processing it`);
    return res.status(200).json({ status: 'skipped', reason: 'locked' });
  }

  try {
    // 3. Load drift candidate with relations
    const drift = await prisma.driftCandidate.findUnique({
      where: {
        workspaceId_id: { workspaceId, id: driftId },
      },
      include: {
        signalEvent: true,
        workspace: true,
      },
    });

    if (!drift) {
      console.error(`[Jobs] Drift ${driftId} not found`);
      return res.status(404).json({ error: 'Drift not found' });
    }

    // 4. Check if already terminal
    if (TERMINAL_STATES.includes(drift.state as DriftState)) {
      console.log(`[Jobs] Drift ${driftId} is in terminal state: ${drift.state}`);
      return res.status(200).json({ status: 'complete', state: drift.state });
    }

    // 5. Check if human-gated
    if (HUMAN_GATED_STATES.includes(drift.state as DriftState)) {
      console.log(`[Jobs] Drift ${driftId} is awaiting human action: ${drift.state}`);
      return res.status(200).json({ status: 'waiting', state: drift.state, reason: 'awaiting_human_action' });
    }

    // FIX C3: Check if max retries exceeded
    if (drift.retryCount >= MAX_RETRIES) {
      console.error(`[Jobs] Drift ${driftId} exceeded max retries (${MAX_RETRIES}), transitioning to FAILED`);
      await prisma.driftCandidate.update({
        where: { workspaceId_id: { workspaceId, id: driftId } },
        data: {
          state: DriftState.FAILED,
          stateUpdatedAt: new Date(),
          lastErrorCode: 'MAX_RETRIES_EXCEEDED',
          lastErrorMessage: `Exceeded maximum retry limit of ${MAX_RETRIES}`,
        },
      });
      return res.status(200).json({
        status: 'failed',
        state: DriftState.FAILED,
        reason: 'max_retries_exceeded',
        retryCount: drift.retryCount,
      });
    }

    // 6. Execute bounded transition loop
    let currentState = drift.state as DriftState;
    let transitions = 0;
    let lastError: { code: string; message: string } | null = null;
    let currentDrift = drift; // Track current drift object

    while (
      transitions < MAX_TRANSITIONS_PER_INVOCATION &&
      !TERMINAL_STATES.includes(currentState) &&
      !HUMAN_GATED_STATES.includes(currentState)
    ) {
      console.log(`[Jobs] Executing transition ${transitions + 1} from state ${currentState}`);

      const result = await executeTransition(currentDrift, currentState);

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

      currentState = result.state;
      transitions++;

      // If error, break and potentially retry
      if (result.error) {
        lastError = result.error;
        console.error(`[Jobs] Transition error: ${result.error.code} - ${result.error.message}`);
        break;
      }

      // CRITICAL FIX: Refetch drift candidate to get updated fields (docCandidates, baselineFindings, etc.)
      // This ensures each transition handler has access to data stored by previous transitions
      if (!TERMINAL_STATES.includes(currentState) && !HUMAN_GATED_STATES.includes(currentState)) {
        currentDrift = await prisma.driftCandidate.findUnique({
          where: { workspaceId_id: { workspaceId, id: driftId } },
          include: {
            signalEvent: true,
            workspace: true,
          },
        }) || currentDrift; // Fallback to current if refetch fails
      }
    }

    // 7. If not terminal and not human-gated, enqueue next batch
    if (
      !TERMINAL_STATES.includes(currentState) &&
      !HUMAN_GATED_STATES.includes(currentState)
    ) {
      console.log(`[Jobs] Enqueuing next batch for drift ${driftId}`);
      await enqueueJob({ workspaceId, driftId, attempt });
    }

    return res.status(200).json({
      status: 'ok',
      state: currentState,
      transitions,
      ...(lastError && { error: lastError }),
    });
  } finally {
    // 8. Always release lock
    await releaseLock(workspaceId, driftId);
  }
});

/**
 * POST /api/jobs/slack-analysis
 * Scheduled job to analyze Slack questions and detect coverage drift (Phase 4)
 *
 * Can be triggered by:
 * - QStash scheduled message (weekly cron)
 * - Manual trigger for a specific workspace
 */
router.post('/slack-analysis', async (req: Request, res: Response) => {
  const receiver = getReceiver();

  // Verify QStash signature (if configured)
  if (receiver) {
    const signature = req.headers['upstash-signature'] as string;
    const body = (req as any).rawBody || JSON.stringify(req.body);

    try {
      const isValid = await receiver.verify({ signature, body });
      if (!isValid) {
        console.error('[Jobs] Invalid QStash signature for slack-analysis');
        return res.status(401).json({ error: 'Invalid QStash signature' });
      }
    } catch (error) {
      console.error('[Jobs] Signature verification failed:', error);
      return res.status(401).json({ error: 'Signature verification failed' });
    }
  }

  const { workspaceId, daysBack = 7, channelIds } = req.body;
  const results: Array<{
    workspaceId: string;
    status: string;
    clustersFound?: number;
    signalsCreated?: number;
    error?: string;
  }> = [];

  // Get workspaces to process
  let workspaces: Array<{ id: string }>;
  if (workspaceId) {
    workspaces = [{ id: workspaceId }];
  } else {
    // Process all workspaces with Slack integration
    workspaces = await prisma.workspace.findMany({
      where: {
        integrations: {
          some: {
            type: 'slack',
            status: 'connected',
          },
        },
      },
      select: { id: true },
    });
  }

  console.log(`[Jobs] Slack analysis starting for ${workspaces.length} workspace(s)`);

  for (const ws of workspaces) {
    const wsId = ws.id;

    // Check feature flag
    if (!isFeatureEnabled('ENABLE_SLACK_CLUSTERING', wsId)) {
      console.log(`[Jobs] Slack clustering disabled for workspace ${wsId}`);
      results.push({ workspaceId: wsId, status: 'feature_disabled' });
      continue;
    }

    try {
      // 1. Get Slack bot token
      const botToken = await getSlackBotToken(wsId);
      if (!botToken) {
        console.log(`[Jobs] No Slack bot token for workspace ${wsId}`);
        results.push({ workspaceId: wsId, status: 'no_slack_token' });
        continue;
      }

      // 2. Ingest questions from Slack
      console.log(`[Jobs] Ingesting Slack questions for workspace ${wsId}`);
      const ingestionResults = await ingestRecentQuestions(wsId, botToken, {
        daysBack,
        channelIds,
      });

      // 3. Cluster questions from all channels
      const allQuestions = ingestionResults.flatMap((r) => r.messages);
      console.log(`[Jobs] Found ${allQuestions.length} questions across ${ingestionResults.length} channels`);

      if (allQuestions.length < 3) {
        console.log(`[Jobs] Not enough questions for clustering in workspace ${wsId}`);
        results.push({ workspaceId: wsId, status: 'insufficient_questions', clustersFound: 0 });
        continue;
      }

      const clusters = clusterQuestions(allQuestions, {
        similarityThreshold: 0.7,
        minClusterSize: 3,
        maxClusters: 20,
      });

      console.log(`[Jobs] Found ${clusters.length} question clusters for workspace ${wsId}`);

      // 4. Save clusters to database
      const savedCount = await saveClusters(wsId, clusters);
      console.log(`[Jobs] Saved ${savedCount} clusters to database`);

      // 5. Process unprocessed clusters for coverage drift (if enabled)
      let signalsCreated = 0;
      if (isFeatureEnabled('ENABLE_COVERAGE_DRIFT', wsId)) {
        const unprocessedClusters = await getUnprocessedClusters(wsId, 5);

        for (const cluster of unprocessedClusters) {
          try {
            // Resolve relevant docs for this cluster
            const docResult = await resolveDocsForDrift({
              workspaceId: wsId,
              driftTypeHints: ['coverage'],
              service: cluster.topic || null,
              repo: null,
            });

            if (docResult.candidates.length === 0) {
              console.log(`[Jobs] No docs found for cluster ${cluster.id}`);
              await markClusterProcessed(wsId, cluster.id);
              continue;
            }

            // Analyze against first matching doc
            const doc = docResult.candidates[0];
            if (!doc) {
              await markClusterProcessed(wsId, cluster.id);
              continue;
            }

            const driftResult = await detectCoverageDrift({
              cluster,
              docContent: '', // Would need to fetch doc content via adapter
              docTitle: doc.docTitle || '',
              docUrl: doc.docUrl || undefined,
            });

            if (driftResult.success && driftResult.data?.coverage_gap_detected) {
              // Create SignalEvent for coverage drift
              const signalEventId = `slack_cluster_${wsId}_${cluster.id}`;
              const signal = createCoverageDriftSignal(cluster, driftResult.data, {
                title: doc.docTitle || '',
                url: doc.docUrl || undefined,
              });

              if (signal) {
                await prisma.signalEvent.create({
                  data: {
                    workspaceId: wsId,
                    id: signalEventId,
                    sourceType: 'slack_cluster',
                    occurredAt: cluster.lastSeen,
                    service: cluster.topic,
                    extracted: {
                      title: `Coverage gap: ${cluster.representativeQuestion.substring(0, 100)}`,
                      summary: signal.evidenceSummary,
                      driftType: signal.driftType,
                      confidence: signal.confidence,
                      clusterId: cluster.id,
                      questionCount: cluster.frequency,
                      suggestedPatch: signal.suggestedPatch,
                      gapType: driftResult.data.gap_type,
                      docTitle: doc.docTitle,
                      docUrl: doc.docUrl,
                    },
                    rawPayload: {
                      cluster: {
                        id: cluster.id,
                        representativeQuestion: cluster.representativeQuestion,
                        topic: cluster.topic,
                        frequency: cluster.frequency,
                        channelName: cluster.channelName,
                      },
                      driftAnalysis: driftResult.data,
                    },
                    slackClusterId: cluster.id,
                    messageCount: cluster.frequency,
                  },
                });
                signalsCreated++;
                console.log(`[Jobs] Created coverage drift signal for cluster ${cluster.id}`);
              }
            }

            await markClusterProcessed(wsId, cluster.id, `slack_cluster_${wsId}_${cluster.id}`);
          } catch (clusterError) {
            console.error(`[Jobs] Error processing cluster ${cluster.id}:`, clusterError);
          }
        }
      }

      results.push({
        workspaceId: wsId,
        status: 'success',
        clustersFound: clusters.length,
        signalsCreated,
      });
    } catch (error) {
      console.error(`[Jobs] Error processing workspace ${wsId}:`, error);
      results.push({
        workspaceId: wsId,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  console.log(`[Jobs] Slack analysis complete. Results:`, results);
  return res.status(200).json({ status: 'complete', results });
});

export default router;

