/**
 * Slack Interactions Handler
 * Handles button clicks (approve/edit/reject/snooze) from Slack messages
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/db.js';
import { updateSlackMessage, openSlackModal } from '../services/slack-client.js';
import { processApproval } from '../pipelines/approval.js';

const router: RouterType = Router();

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

/**
 * Verify Slack request signature
 */
function verifySlackSignature(req: Request): boolean {
  if (!SLACK_SIGNING_SECRET) return false;

  const timestamp = req.headers['x-slack-request-timestamp'] as string;
  const signature = req.headers['x-slack-signature'] as string;

  if (!timestamp || !signature) return false;

  // Check timestamp is within 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const sigBasestring = `v0:${timestamp}:${req.body}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', SLACK_SIGNING_SECRET)
    .update(sigBasestring)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
}

/**
 * POST /slack/interactions
 * Handles all Slack interactive components (buttons, modals)
 */
router.post('/', async (req: Request, res: Response) => {
  // Parse the payload (Slack sends it as form-urlencoded)
  let payload: any;
  try {
    payload = JSON.parse(req.body.payload || req.body);
  } catch {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  console.log(`[SlackInteractions] Received ${payload.type} from ${payload.user?.id}`);

  // Handle different interaction types
  switch (payload.type) {
    case 'block_actions':
      return handleBlockActions(payload, res);
    case 'view_submission':
      return handleViewSubmission(payload, res);
    default:
      console.log(`[SlackInteractions] Unknown interaction type: ${payload.type}`);
      return res.json({ ok: true });
  }
});

/**
 * Handle button clicks from messages
 */
async function handleBlockActions(payload: any, res: Response) {
  const action = payload.actions?.[0];
  if (!action) return res.json({ ok: true });

  const [actionType, proposalId] = (action.value || '').split(':');
  console.log(`[SlackInteractions] Action: ${actionType} on proposal ${proposalId}`);

  if (!proposalId) {
    return res.json({ ok: true });
  }

  // Find the proposal and its organization
  const proposal = await prisma.diffProposal.findUnique({
    where: { id: proposalId },
    include: { organization: true },
  });

  if (!proposal) {
    console.error(`[SlackInteractions] Proposal not found: ${proposalId}`);
    return res.json({ ok: true });
  }

  const orgId = proposal.orgId;
  const userId = payload.user?.id;

  switch (actionType) {
    case 'approve':
      await handleApprove(proposal, userId, payload);
      break;
    case 'reject':
      await openRejectModal(orgId, payload.trigger_id, proposalId);
      break;
    case 'edit':
      await openEditModal(orgId, payload.trigger_id, proposalId, proposal.diffContent || '');
      break;
    case 'snooze':
      await handleSnooze(proposal, userId);
      break;
  }

  return res.json({ ok: true });
}

/**
 * Handle approve action - uses the approval pipeline
 */
async function handleApprove(proposal: any, slackUserId: string, _payload: any) {
  console.log(`[SlackInteractions] Approving proposal ${proposal.id}`);

  // Find or create user
  const user = await findOrCreateUser(proposal.orgId, slackUserId);

  // Use the approval pipeline to process the approval
  // This handles: Confluence update, status update, audit log, Slack message update
  const result = await processApproval(proposal.id, user.id);

  if (!result.success) {
    console.error(`[SlackInteractions] Approval failed: ${result.error}`);
    // Update Slack message with error
    if (proposal.slackChannelId && proposal.slackMessageTs) {
      await updateSlackMessage(
        proposal.orgId,
        proposal.slackChannelId,
        proposal.slackMessageTs,
        '❌ Approval failed',
        [{ type: 'section', text: { type: 'mrkdwn', text: `❌ *Approval failed*: ${result.error}` } }]
      );
    }
  }
}

/**
 * Handle snooze action (48 hours)
 */
async function handleSnooze(proposal: any, slackUserId: string) {
  const snoozeUntil = new Date(Date.now() + 48 * 60 * 60 * 1000);

  await prisma.diffProposal.update({
    where: { id: proposal.id },
    data: { status: 'snoozed', snoozeUntil },
  });

  if (proposal.slackChannelId && proposal.slackMessageTs) {
    await updateSlackMessage(
      proposal.orgId,
      proposal.slackChannelId,
      proposal.slackMessageTs,
      '💤 Snoozed for 48 hours',
      [{ type: 'section', text: { type: 'mrkdwn', text: '💤 *Snoozed* until ' + snoozeUntil.toISOString() } }]
    );
  }
}

async function openRejectModal(orgId: string, triggerId: string, proposalId: string) {
  // Simplified modal - will be expanded
  await openSlackModal(orgId, triggerId, {
    type: 'modal',
    callback_id: `reject:${proposalId}`,
    title: { type: 'plain_text', text: 'Reject Patch' },
    submit: { type: 'plain_text', text: 'Reject' },
    blocks: [
      {
        type: 'input',
        block_id: 'reason',
        element: { type: 'plain_text_input', action_id: 'reason_input', multiline: true },
        label: { type: 'plain_text', text: 'Rejection Reason' },
      },
    ],
  });
}

async function openEditModal(orgId: string, triggerId: string, proposalId: string, diff: string) {
  await openSlackModal(orgId, triggerId, {
    type: 'modal',
    callback_id: `edit:${proposalId}`,
    title: { type: 'plain_text', text: 'Edit Patch' },
    submit: { type: 'plain_text', text: 'Save' },
    blocks: [
      {
        type: 'input',
        block_id: 'diff',
        element: { type: 'plain_text_input', action_id: 'diff_input', multiline: true, initial_value: diff },
        label: { type: 'plain_text', text: 'Edit the diff' },
      },
    ],
  });
}

async function handleViewSubmission(payload: any, res: Response) {
  const [action, proposalId] = (payload.view?.callback_id || '').split(':');
  // Handle modal submissions - to be expanded
  console.log(`[SlackInteractions] View submission: ${action} for ${proposalId}`);
  return res.json({ response_action: 'clear' });
}

async function findOrCreateUser(orgId: string, slackUserId: string) {
  return prisma.user.upsert({
    where: { orgId_slackUserId: { orgId, slackUserId } },
    update: {},
    create: { orgId, slackUserId },
  });
}

export default router;

