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

const router: RouterType = Router();

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

    // 6. Execute bounded transition loop
    let currentState = drift.state as DriftState;
    let transitions = 0;
    let lastError: { code: string; message: string } | null = null;

    while (
      transitions < MAX_TRANSITIONS_PER_INVOCATION &&
      !TERMINAL_STATES.includes(currentState) &&
      !HUMAN_GATED_STATES.includes(currentState)
    ) {
      console.log(`[Jobs] Executing transition ${transitions + 1} from state ${currentState}`);

      const result = await executeTransition(drift, currentState);

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

export default router;

