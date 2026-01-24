/**
 * Approval Pipeline
 * Handles the flow when a user approves a diff proposal:
 * 1. Fetch current Confluence page
 * 2. Apply the diff
 * 3. Update Confluence
 * 4. Update proposal status
 * 5. Log to audit
 * 6. Update Slack message
 */

import { prisma } from '../lib/db.js';
import { getPage, updatePage, markdownToStorage } from '../services/confluence-client.js';
import { updateSlackMessage } from '../services/slack-client.js';
import * as Diff from 'diff';

interface ApprovalResult {
  success: boolean;
  error?: string;
  confluenceUpdated?: boolean;
}

/**
 * Process an approved diff proposal
 */
export async function processApproval(
  proposalId: string,
  approverUserId: string
): Promise<ApprovalResult> {
  console.log(`[ApprovalPipeline] Processing approval for proposal ${proposalId}`);

  // Fetch the proposal with related data
  const proposal = await prisma.diffProposal.findUnique({
    where: { id: proposalId },
    include: {
      document: true,
      organization: true,
    },
  });

  if (!proposal) {
    return { success: false, error: 'Proposal not found' };
  }

  if (proposal.status !== 'pending' && proposal.status !== 'snoozed') {
    return { success: false, error: `Proposal already ${proposal.status}` };
  }

  const orgId = proposal.orgId;
  const pageId = proposal.document?.confluencePageId;

  // Check if Confluence is connected
  if (!proposal.organization.confluenceAccessToken) {
    console.log(`[ApprovalPipeline] Confluence not connected, marking as approved without writeback`);
    
    // Still mark as approved, but note that writeback didn't happen
    await markApproved(proposal, approverUserId, false);
    return { success: true, confluenceUpdated: false };
  }

  if (!pageId) {
    return { success: false, error: 'No Confluence page linked to document' };
  }

  try {
    // Fetch current page from Confluence
    const page = await getPage(orgId, pageId);
    if (!page) {
      return { success: false, error: 'Could not fetch Confluence page' };
    }

    // Apply the diff to get new content
    const newContent = applyDiff(
      proposal.document?.lastContentSnapshot || page.content,
      proposal.diffContent || ''
    );

    // Convert to Confluence storage format if needed
    const storageContent = markdownToStorage(newContent);

    // Update Confluence page
    const updateResult = await updatePage(
      orgId,
      pageId,
      page.title,
      storageContent,
      page.version
    );

    if (!updateResult.success) {
      return { success: false, error: updateResult.error };
    }

    // Mark as approved and update records
    await markApproved(proposal, approverUserId, true);

    console.log(`[ApprovalPipeline] Successfully applied patch to Confluence page ${pageId}`);
    return { success: true, confluenceUpdated: true };

  } catch (error: any) {
    console.error(`[ApprovalPipeline] Error:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Apply a unified diff to original content
 */
function applyDiff(originalContent: string, diffContent: string): string {
  try {
    // Parse the unified diff and apply patches
    const patches = Diff.parsePatch(diffContent);
    
    if (patches.length === 0) {
      console.warn('[ApprovalPipeline] No patches found in diff');
      return originalContent;
    }

    let result = originalContent;
    for (const patch of patches) {
      const applied = Diff.applyPatch(result, patch);
      if (applied === false) {
        console.warn('[ApprovalPipeline] Patch did not apply cleanly, using original');
        // If patch doesn't apply cleanly, try a fuzzy match
        const fuzzyApplied = Diff.applyPatch(result, patch, { fuzzFactor: 2 });
        if (fuzzyApplied !== false) {
          result = fuzzyApplied;
        }
      } else {
        result = applied;
      }
    }

    return result;
  } catch (error) {
    console.error('[ApprovalPipeline] Error applying diff:', error);
    return originalContent;
  }
}

/**
 * Mark proposal as approved and update related records
 */
async function markApproved(
  proposal: any,
  approverUserId: string,
  confluenceUpdated: boolean
): Promise<void> {
  const now = new Date();

  // Update proposal status
  await prisma.diffProposal.update({
    where: { id: proposal.id },
    data: {
      status: 'approved',
      resolvedAt: now,
      resolvedByUserId: approverUserId,
    },
  });

  // Update document freshness
  if (proposal.documentId) {
    await prisma.trackedDocument.update({
      where: { id: proposal.documentId },
      data: {
        freshnessScore: 1.0,
        lastSyncedAt: now,
      },
    });
  }

  // Create audit log
  await prisma.auditLog.create({
    data: {
      orgId: proposal.orgId,
      action: 'approved',
      actorUserId: approverUserId,
      documentId: proposal.documentId,
      diffProposalId: proposal.id,
      metadata: {
        confluenceUpdated,
        approvedAt: now.toISOString(),
      },
    },
  });

  // Update Slack message
  if (proposal.slackChannelId && proposal.slackMessageTs) {
    await updateSlackMessage(
      proposal.orgId,
      proposal.slackChannelId,
      proposal.slackMessageTs,
      '✅ Patch approved and applied!',
      [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: confluenceUpdated
              ? '✅ *Approved* - Patch has been applied to Confluence'
              : '✅ *Approved* - Marked as approved (Confluence not connected)',
          },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `Approved at ${now.toISOString()}` },
          ],
        },
      ]
    );
  }
}

export { applyDiff };

