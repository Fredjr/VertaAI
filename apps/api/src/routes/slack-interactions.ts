/**
 * Slack Interactions Handler
 * Handles button clicks (approve/edit/reject/snooze) from Slack messages
 *
 * Phase 2: Added workspace-scoped handlers for PatchProposal model with state machine
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/db.js';
import { updateSlackMessage, openSlackModal } from '../services/slack-client.js';
import { processApproval, applyDiff } from '../pipelines/approval.js';
import { processRejection } from '../pipelines/reject.js';
import { getPage, updatePage, markdownToStorage } from '../services/confluence-client.js';
import { enqueueJob } from '../services/queue/qstash.js';
import { DriftState } from '../types/state-machine.js';

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

  // Find the proposal and its organization + document
  const proposal = await prisma.diffProposal.findUnique({
    where: { id: proposalId },
    include: { organization: true, document: true },
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
      await openRejectModal(
        orgId,
        payload.trigger_id,
        proposalId,
        proposal.document?.title,
        proposal.summary || undefined
      );
      break;
    case 'edit':
      await openEditModal(
        orgId,
        payload.trigger_id,
        proposalId,
        proposal.diffContent || '',
        proposal.document?.title,
        proposal.summary || undefined,
        proposal.confidence ? Math.round(Number(proposal.confidence) * 100) : undefined
      );
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

async function openRejectModal(
  orgId: string,
  triggerId: string,
  proposalId: string,
  docTitle?: string,
  summary?: string
) {
  // Build context header
  const contextText = [
    docTitle ? `📄 *${docTitle}*` : '',
    summary ? `\n${summary}` : '',
  ].filter(Boolean).join('');

  const blocks: any[] = [];

  // Add context section if we have any
  if (contextText) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: contextText },
    });
    blocks.push({ type: 'divider' });
  }

  // Quick-select rejection categories
  blocks.push({
    type: 'input',
    block_id: 'category',
    element: {
      type: 'static_select',
      action_id: 'category_select',
      placeholder: { type: 'plain_text', text: 'Select a category' },
      options: [
        { text: { type: 'plain_text', text: '❌ Incorrect change' }, value: 'incorrect_change' },
        { text: { type: 'plain_text', text: '🚫 Not needed' }, value: 'not_needed' },
        { text: { type: 'plain_text', text: '📋 Out of scope' }, value: 'out_of_scope' },
        { text: { type: 'plain_text', text: '🔍 Needs more context' }, value: 'needs_more_context' },
        { text: { type: 'plain_text', text: '📄 Wrong document' }, value: 'doc_not_source_of_truth' },
        { text: { type: 'plain_text', text: '👤 Wrong owner' }, value: 'wrong_owner' },
        { text: { type: 'plain_text', text: '📝 Formatting issue' }, value: 'formatting_issue' },
        { text: { type: 'plain_text', text: '❓ Other' }, value: 'other' },
      ],
    },
    label: { type: 'plain_text', text: 'Why are you rejecting this patch?' },
  });

  // Free-text reason (optional but helpful for Agent F)
  blocks.push({
    type: 'input',
    block_id: 'reason',
    optional: true,
    element: {
      type: 'plain_text_input',
      action_id: 'reason_input',
      multiline: true,
      placeholder: { type: 'plain_text', text: 'Add details to help us improve future suggestions...' },
    },
    label: { type: 'plain_text', text: 'Additional details (optional)' },
  });

  await openSlackModal(orgId, triggerId, {
    type: 'modal',
    callback_id: `reject:${proposalId}`,
    title: { type: 'plain_text', text: 'Reject Patch' },
    submit: { type: 'plain_text', text: 'Reject' },
    blocks,
  });
}

async function openEditModal(
  orgId: string,
  triggerId: string,
  proposalId: string,
  diff: string,
  docTitle?: string,
  summary?: string,
  confidence?: number
) {
  // Build context header
  const contextText = [
    docTitle ? `📄 *${docTitle}*` : '',
    summary ? `\n${summary}` : '',
    confidence ? `\n_Confidence: ${confidence}%_` : '',
  ].filter(Boolean).join('');

  const blocks: any[] = [];

  // Add context section if we have any
  if (contextText) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: contextText },
    });
    blocks.push({ type: 'divider' });
  }

  // Add the diff input
  blocks.push({
    type: 'input',
    block_id: 'diff',
    element: {
      type: 'plain_text_input',
      action_id: 'diff_input',
      multiline: true,
      initial_value: diff,
    },
    label: { type: 'plain_text', text: 'Edit the diff (unified format)' },
  });

  // Add checkbox to apply immediately
  blocks.push({
    type: 'input',
    block_id: 'apply_option',
    optional: true,
    element: {
      type: 'checkboxes',
      action_id: 'apply_checkbox',
      options: [
        {
          text: { type: 'plain_text', text: 'Apply to Confluence immediately' },
          value: 'apply_now',
        },
      ],
    },
    label: { type: 'plain_text', text: 'Options' },
  });

  await openSlackModal(orgId, triggerId, {
    type: 'modal',
    callback_id: `edit:${proposalId}`,
    title: { type: 'plain_text', text: 'Edit Patch' },
    submit: { type: 'plain_text', text: 'Save' },
    blocks,
  });
}

async function handleViewSubmission(payload: any, res: Response) {
  const [action, proposalId] = (payload.view?.callback_id || '').split(':');
  const slackUserId = payload.user?.id;

  console.log(`[SlackInteractions] View submission: ${action} for ${proposalId}`);

  if (!proposalId) {
    return res.json({ response_action: 'clear' });
  }

  // Get the proposal to find the org
  const proposal = await prisma.diffProposal.findUnique({
    where: { id: proposalId },
  });

  if (!proposal) {
    console.error(`[SlackInteractions] Proposal not found: ${proposalId}`);
    return res.json({ response_action: 'clear' });
  }

  const user = await findOrCreateUser(proposal.orgId, slackUserId);

  switch (action) {
    case 'reject': {
      // Get the rejection category from dropdown
      const category = payload.view?.state?.values?.category?.category_select?.selected_option?.value || 'other';

      // Get the optional additional details
      const additionalDetails = payload.view?.state?.values?.reason?.reason_input?.value || '';

      // Combine category and details into a rejection reason for Agent F
      const categoryLabels: Record<string, string> = {
        'incorrect_change': 'Incorrect change',
        'not_needed': 'Not needed',
        'out_of_scope': 'Out of scope',
        'needs_more_context': 'Needs more context',
        'doc_not_source_of_truth': 'Wrong document',
        'wrong_owner': 'Wrong owner',
        'formatting_issue': 'Formatting issue',
        'other': 'Other',
      };

      const rejectionReason = additionalDetails
        ? `${categoryLabels[category] || category}: ${additionalDetails}`
        : categoryLabels[category] || category;

      console.log(`[SlackInteractions] Rejection - category: ${category}, reason: ${rejectionReason}`);

      const result = await processRejection(proposal.id, user.id, rejectionReason);

      if (!result.success) {
        console.error(`[SlackInteractions] Rejection failed: ${result.error}`);
        // Show error in Slack
        return res.json({
          response_action: 'errors',
          errors: { category: `Rejection failed: ${result.error}` },
        });
      }
      break;
    }

    case 'edit': {
      // Get the edited diff from the modal input
      const editedDiff = payload.view?.state?.values?.diff?.diff_input?.value;

      // Check if user wants to apply immediately
      const applyOptions = payload.view?.state?.values?.apply_option?.apply_checkbox?.selected_options || [];
      const shouldApplyNow = applyOptions.some((opt: any) => opt.value === 'apply_now');

      if (!editedDiff) {
        break;
      }

      console.log(`[SlackInteractions] Edit submission - applyNow: ${shouldApplyNow}`);

      // Get full proposal with document and organization for Confluence update
      const fullProposal = await prisma.diffProposal.findUnique({
        where: { id: proposalId },
        include: { document: true, organization: true },
      });

      if (!fullProposal) {
        return res.json({
          response_action: 'errors',
          errors: { diff: 'Proposal not found' },
        });
      }

      let confluenceUpdated = false;
      const now = new Date();

      // If apply immediately is checked, update Confluence
      if (shouldApplyNow && fullProposal.organization.confluenceAccessToken) {
        const pageId = fullProposal.document?.confluencePageId;

        if (pageId) {
          try {
            // Fetch current page from Confluence
            const page = await getPage(fullProposal.orgId, pageId);

            if (page) {
              // Apply the edited diff
              const newContent = applyDiff(
                fullProposal.document?.lastContentSnapshot || page.content,
                editedDiff
              );

              // Convert and update
              const storageContent = markdownToStorage(newContent);
              const updateResult = await updatePage(
                fullProposal.orgId,
                pageId,
                page.title,
                storageContent,
                page.version
              );

              if (updateResult.success) {
                confluenceUpdated = true;
                console.log(`[SlackInteractions] Applied edited diff to Confluence page ${pageId}`);
              } else {
                console.error(`[SlackInteractions] Confluence update failed: ${updateResult.error}`);
              }
            }
          } catch (error: any) {
            console.error(`[SlackInteractions] Error applying edit to Confluence:`, error);
          }
        }
      }

      // Update the proposal with the edited diff
      await prisma.diffProposal.update({
        where: { id: proposalId },
        data: {
          editedDiffContent: editedDiff,
          status: confluenceUpdated ? 'approved' : 'edited',
          resolvedAt: now,
          resolvedByUserId: user.id,
        },
      });

      // Update document freshness if applied
      if (confluenceUpdated && fullProposal.documentId) {
        await prisma.trackedDocument.update({
          where: { id: fullProposal.documentId },
          data: {
            freshnessScore: 1.0,
            lastSyncedAt: now,
          },
        });
      }

      // Create audit log
      await prisma.auditLog.create({
        data: {
          orgId: fullProposal.orgId,
          action: confluenceUpdated ? 'edited_and_applied' : 'edited',
          actorUserId: user.id,
          documentId: fullProposal.documentId,
          diffProposalId: fullProposal.id,
          metadata: {
            slackUserId,
            confluenceUpdated,
            editedAt: now.toISOString(),
          },
        },
      });

      // Update Slack message
      if (fullProposal.slackChannelId && fullProposal.slackMessageTs) {
        const statusText = confluenceUpdated
          ? '✏️ *Edited & Applied* - Patch has been applied to Confluence'
          : '✏️ *Edited* - Diff saved (not applied to Confluence)';

        await updateSlackMessage(
          fullProposal.orgId,
          fullProposal.slackChannelId,
          fullProposal.slackMessageTs,
          confluenceUpdated ? '✏️ Edited & Applied' : '✏️ Patch edited',
          [
            { type: 'section', text: { type: 'mrkdwn', text: statusText } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `By <@${slackUserId}> at ${now.toISOString()}` }] },
          ]
        );
      }
      break;
    }
  }

  return res.json({ response_action: 'clear' });
}

async function findOrCreateUser(orgId: string, slackUserId: string) {
  return prisma.user.upsert({
    where: { orgId_slackUserId: { orgId, slackUserId } },
    update: {},
    create: { orgId, slackUserId },
  });
}

// ============================================================================
// Phase 2: Workspace-Scoped State Machine Handlers
// These functions handle actions on PatchProposal/DriftCandidate models
// and enqueue QStash jobs for async state machine processing
// ============================================================================

/**
 * Handle approve action for workspace-scoped PatchProposal
 * Updates DriftCandidate state to APPROVED and enqueues job
 */
export async function handleWorkspaceApprove(
  workspaceId: string,
  patchProposalId: string,
  slackUserId: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[SlackInteractions] [V2] Approving patch proposal ${patchProposalId}`);

  try {
    // Find the patch proposal
    const patchProposal = await prisma.patchProposal.findFirst({
      where: { workspaceId, id: patchProposalId },
    });

    if (!patchProposal) {
      return { success: false, error: 'Patch proposal not found' };
    }

    // Update PatchProposal status
    await prisma.patchProposal.update({
      where: { workspaceId_id: { workspaceId, id: patchProposalId } },
      data: { status: 'approved' },
    });

    // Find and update associated DriftCandidate
    const driftCandidate = await prisma.driftCandidate.findFirst({
      where: { workspaceId, id: patchProposal.driftId },
    });

    if (driftCandidate) {
      // Update state to APPROVED
      await prisma.driftCandidate.update({
        where: { workspaceId_id: { workspaceId, id: driftCandidate.id } },
        data: {
          state: DriftState.APPROVED,
          stateUpdatedAt: new Date(),
        },
      });

      // Create approval record
      await prisma.approval.create({
        data: {
          workspaceId,
          patchId: patchProposalId,
          action: 'approve',
          actorSlackId: slackUserId,
        },
      });

      // Enqueue QStash job to continue state machine (APPROVED -> WRITEBACK_VALIDATED -> ...)
      const messageId = await enqueueJob({
        workspaceId,
        driftId: driftCandidate.id,
      });

      console.log(`[SlackInteractions] [V2] Approved - enqueued job ${messageId || 'sync'}`);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[SlackInteractions] [V2] Approve error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle reject action for workspace-scoped PatchProposal
 * Updates DriftCandidate state to REJECTED (terminal state, no enqueue)
 */
export async function handleWorkspaceReject(
  workspaceId: string,
  patchProposalId: string,
  slackUserId: string,
  category: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[SlackInteractions] [V2] Rejecting patch proposal ${patchProposalId} - ${category}`);

  try {
    // Find the patch proposal
    const patchProposal = await prisma.patchProposal.findFirst({
      where: { workspaceId, id: patchProposalId },
    });

    if (!patchProposal) {
      return { success: false, error: 'Patch proposal not found' };
    }

    // Update PatchProposal status
    await prisma.patchProposal.update({
      where: { workspaceId_id: { workspaceId, id: patchProposalId } },
      data: { status: 'rejected' },
    });

    // Find and update associated DriftCandidate
    const driftCandidate = await prisma.driftCandidate.findFirst({
      where: { workspaceId, id: patchProposal.driftId },
    });

    if (driftCandidate) {
      // Update state to REJECTED (terminal state)
      await prisma.driftCandidate.update({
        where: { workspaceId_id: { workspaceId, id: driftCandidate.id } },
        data: {
          state: DriftState.REJECTED,
          stateUpdatedAt: new Date(),
        },
      });

      // Create approval record with rejection
      await prisma.approval.create({
        data: {
          workspaceId,
          patchId: patchProposalId,
          action: 'reject',
          actorSlackId: slackUserId,
          rejectionCategory: category,
          note: reason,
        },
      });

      // Create audit event
      await prisma.auditEvent.create({
        data: {
          workspaceId,
          entityType: 'drift',
          entityId: driftCandidate.id,
          eventType: 'rejected',
          payload: { category, reason, patchProposalId },
          actorType: 'slack_user',
          actorId: slackUserId,
        },
      });

      // No QStash enqueue - REJECTED is a terminal state
      console.log(`[SlackInteractions] [V2] Rejected - terminal state, no job enqueue`);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[SlackInteractions] [V2] Reject error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle edit action for workspace-scoped PatchProposal
 * Updates DriftCandidate state to EDIT_REQUESTED and enqueues job
 */
export async function handleWorkspaceEdit(
  workspaceId: string,
  patchProposalId: string,
  slackUserId: string,
  editedDiff: string,
  applyNow: boolean
): Promise<{ success: boolean; error?: string }> {
  console.log(`[SlackInteractions] [V2] Editing patch proposal ${patchProposalId}, applyNow=${applyNow}`);

  try {
    // Find the patch proposal
    const patchProposal = await prisma.patchProposal.findFirst({
      where: { workspaceId, id: patchProposalId },
    });

    if (!patchProposal) {
      return { success: false, error: 'Patch proposal not found' };
    }

    // Update PatchProposal with edited diff
    await prisma.patchProposal.update({
      where: { workspaceId_id: { workspaceId, id: patchProposalId } },
      data: {
        unifiedDiff: editedDiff,
        status: applyNow ? 'approved' : 'edited',
      },
    });

    // Find and update associated DriftCandidate
    const driftCandidate = await prisma.driftCandidate.findFirst({
      where: { workspaceId, id: patchProposal.driftId },
    });

    if (driftCandidate) {
      const newState = applyNow ? DriftState.APPROVED : DriftState.EDIT_REQUESTED;

      // Update state
      await prisma.driftCandidate.update({
        where: { workspaceId_id: { workspaceId, id: driftCandidate.id } },
        data: {
          state: newState,
          stateUpdatedAt: new Date(),
        },
      });

      // Create approval record
      await prisma.approval.create({
        data: {
          workspaceId,
          patchId: patchProposalId,
          action: applyNow ? 'approve' : 'edit',
          actorSlackId: slackUserId,
          editedDiff,
        },
      });

      // Enqueue QStash job to continue state machine
      const messageId = await enqueueJob({
        workspaceId,
        driftId: driftCandidate.id,
      });

      console.log(`[SlackInteractions] [V2] Edited - enqueued job ${messageId || 'sync'}`);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[SlackInteractions] [V2] Edit error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle snooze action for workspace-scoped PatchProposal
 * Updates DriftCandidate state to SNOOZED (human-gated state, waits for snooze to expire)
 */
export async function handleWorkspaceSnooze(
  workspaceId: string,
  patchProposalId: string,
  slackUserId: string,
  snoozeHours: number = 24
): Promise<{ success: boolean; error?: string }> {
  console.log(`[SlackInteractions] [V2] Snoozing patch proposal ${patchProposalId} for ${snoozeHours}h`);

  try {
    // Find the patch proposal
    const patchProposal = await prisma.patchProposal.findFirst({
      where: { workspaceId, id: patchProposalId },
    });

    if (!patchProposal) {
      return { success: false, error: 'Patch proposal not found' };
    }

    const snoozeUntil = new Date(Date.now() + snoozeHours * 60 * 60 * 1000);

    // Update PatchProposal status
    await prisma.patchProposal.update({
      where: { workspaceId_id: { workspaceId, id: patchProposalId } },
      data: { status: 'snoozed' },
    });

    // Find and update associated DriftCandidate
    const driftCandidate = await prisma.driftCandidate.findFirst({
      where: { workspaceId, id: patchProposal.driftId },
    });

    if (driftCandidate) {
      // Update state to SNOOZED (human-gated state)
      await prisma.driftCandidate.update({
        where: { workspaceId_id: { workspaceId, id: driftCandidate.id } },
        data: {
          state: DriftState.SNOOZED,
          stateUpdatedAt: new Date(),
        },
      });

      // Create approval record with snooze info
      await prisma.approval.create({
        data: {
          workspaceId,
          patchId: patchProposalId,
          action: 'snooze',
          actorSlackId: slackUserId,
          snoozeUntil,
        },
      });

      // No immediate QStash enqueue - SNOOZED is human-gated
      // Phase 3 will add scheduled job to check snooze expiry
      console.log(`[SlackInteractions] [V2] Snoozed until ${snoozeUntil.toISOString()}`);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[SlackInteractions] [V2] Snooze error:', error);
    return { success: false, error: error.message };
  }
}

export default router;

