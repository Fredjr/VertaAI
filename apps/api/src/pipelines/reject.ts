/**
 * Reject Pipeline
 * Handles the flow when a user rejects a diff proposal:
 * 1. Receive rejection reason from Slack modal
 * 2. Call Agent F to classify rejection
 * 3. Update proposal status to 'rejected'
 * 4. Store rejection_reason and rejection_tags
 * 5. Create audit log entry
 * 6. Update Slack message with rejection confirmation
 */

import { prisma } from '../lib/db.js';
import { classifyRejection } from '../agents/rejection-classifier.js';
import { updateSlackMessage } from '../services/slack-client.js';

interface RejectResult {
  success: boolean;
  error?: string;
  tags?: string[];
}

/**
 * Process a rejected diff proposal
 */
export async function processRejection(
  proposalId: string,
  rejectorUserId: string,
  rejectionReason: string
): Promise<RejectResult> {
  console.log(`[RejectPipeline] Processing rejection for proposal ${proposalId}`);

  // Fetch the proposal with related data
  const proposal = await prisma.diffProposal.findUnique({
    where: { id: proposalId },
    include: {
      document: true,
      signal: true,
    },
  });

  if (!proposal) {
    return { success: false, error: 'Proposal not found' };
  }

  if (proposal.status !== 'pending' && proposal.status !== 'snoozed') {
    return { success: false, error: `Proposal already ${proposal.status}` };
  }

  try {
    // Extract PR title from signal payload (stored as JSON)
    const signalPayload = proposal.signal?.payload as { pr?: { title?: string } } | null;
    const prTitle = signalPayload?.pr?.title || 'Unknown PR';

    // Call Agent F to classify the rejection reason
    const classification = await classifyRejection({
      rejection_text: rejectionReason,
      context: {
        doc_title: proposal.document?.title || 'Unknown document',
        pr_title: prTitle,
        diff_summary: proposal.summary || undefined,
      },
    });

    const now = new Date();

    // Update proposal with rejection info
    await prisma.diffProposal.update({
      where: { id: proposalId },
      data: {
        status: 'rejected',
        rejectionReason: rejectionReason,
        rejectionTags: classification.tags,
        resolvedAt: now,
        resolvedByUserId: rejectorUserId,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        orgId: proposal.orgId,
        action: 'rejected',
        actorUserId: rejectorUserId,
        documentId: proposal.documentId,
        diffProposalId: proposal.id,
        metadata: {
          rejectionReason,
          rejectionTags: classification.tags,
          confidence: classification.confidence,
          needsHuman: classification.needs_human,
          notes: classification.notes,
          rejectedAt: now.toISOString(),
        },
      },
    });

    // Update Slack message
    if (proposal.slackChannelId && proposal.slackMessageTs) {
      await updateSlackMessage(
        proposal.orgId,
        proposal.slackChannelId,
        proposal.slackMessageTs,
        '❌ Patch rejected',
        [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `❌ *Rejected*\n*Reason:* ${rejectionReason}`,
            },
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: `Tags: ${classification.tags.join(', ')}` },
              { type: 'mrkdwn', text: `Rejected at ${now.toISOString()}` },
            ],
          },
        ]
      );
    }

    console.log(`[RejectPipeline] Successfully rejected proposal ${proposalId}`);
    console.log(`[RejectPipeline] Classification tags: ${classification.tags.join(', ')}`);

    return { success: true, tags: classification.tags };

  } catch (error: any) {
    console.error(`[RejectPipeline] Error:`, error);
    return { success: false, error: error.message };
  }
}

