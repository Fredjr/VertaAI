// State Transition Orchestrator
// Based on Section 15.10.6 of the spec

import {
  DriftState,
  FailureCode,
  TransitionResult,
} from '../../types/state-machine.js';
import { runDriftTriage } from '../../agents/drift-triage.js';
import { runDocResolver } from '../../agents/doc-resolver.js';
// Patch agents will be used in Phase 3 for full LLM-based patch generation
// import { runPatchPlanner } from '../../agents/patch-planner.js';
// import { runPatchGenerator } from '../../agents/patch-generator.js';
// import { runSlackComposer } from '../../agents/slack-composer.js';
import { prisma } from '../../lib/db.js';

// Phase 3 imports
import { computeDriftFingerprint, extractKeyTokens } from '../dedup/fingerprint.js';
import { checkDuplicateDrift } from '../validators/dedup.js';
import { determineNotificationRoute } from '../notifications/policy.js';
import { runAllValidators } from '../validators/index.js';

// Type alias for transition handlers
type TransitionHandler = (drift: any) => Promise<TransitionResult>;

// State transition map - each state has one handler
const TRANSITION_HANDLERS: Partial<Record<DriftState, TransitionHandler>> = {
  [DriftState.INGESTED]: handleIngested,
  [DriftState.ELIGIBILITY_CHECKED]: handleEligibilityChecked,
  [DriftState.SIGNALS_CORRELATED]: handleSignalsCorrelated,
  [DriftState.DRIFT_CLASSIFIED]: handleDriftClassified,
  [DriftState.DOCS_RESOLVED]: handleDocsResolved,
  [DriftState.DOCS_FETCHED]: handleDocsFetched,
  [DriftState.BASELINE_CHECKED]: handleBaselineChecked,
  [DriftState.PATCH_PLANNED]: handlePatchPlanned,
  [DriftState.PATCH_GENERATED]: handlePatchGenerated,
  [DriftState.PATCH_VALIDATED]: handlePatchValidated,
  [DriftState.OWNER_RESOLVED]: handleOwnerResolved,
  [DriftState.SLACK_SENT]: handleSlackSent,
  [DriftState.APPROVED]: handleApproved,
  [DriftState.EDIT_REQUESTED]: handleEditRequested,
  [DriftState.WRITEBACK_VALIDATED]: handleWritebackValidated,
  [DriftState.WRITTEN_BACK]: handleWrittenBack,
};

/**
 * Execute a state transition for a drift candidate
 */
export async function executeTransition(
  drift: any,
  currentState: DriftState
): Promise<TransitionResult> {
  const handler = TRANSITION_HANDLERS[currentState];

  if (!handler) {
    // No handler means terminal or unknown state
    console.log(`[Transitions] No handler for state: ${currentState}`);
    return {
      state: currentState,
      enqueueNext: false,
    };
  }

  try {
    return await handler(drift);
  } catch (error: any) {
    console.error(`[Transitions] Error in ${currentState}:`, error);
    return {
      state: currentState, // Stay in current state for retry
      enqueueNext: true,
      error: {
        code: FailureCode.SERVICE_UNAVAILABLE,
        message: error.message || 'Unknown error',
      },
    };
  }
}

// --- State Handlers ---

/**
 * INGESTED -> ELIGIBILITY_CHECKED
 * Check if this PR should be processed
 */
async function handleIngested(drift: any): Promise<TransitionResult> {
  const signal = drift.signalEvent;

  // Skip if not a merged PR
  if (signal?.sourceType === 'github_pr') {
    const extracted = signal.extracted || {};
    // Check if PR was merged (should have mergedAt in rawPayload)
    const rawPayload = signal.rawPayload || {};
    const prData = rawPayload.pull_request || {};
    
    if (!prData.merged) {
      console.log(`[Transitions] Skipping non-merged PR`);
      return { state: DriftState.COMPLETED, enqueueNext: false };
    }
  }

  return { state: DriftState.ELIGIBILITY_CHECKED, enqueueNext: true };
}

/**
 * ELIGIBILITY_CHECKED -> SIGNALS_CORRELATED
 * (Placeholder - full implementation in Phase 4)
 */
async function handleEligibilityChecked(drift: any): Promise<TransitionResult> {
  // Phase 2: Skip correlation, move to classification
  // Phase 4 will add signal correlation with PagerDuty etc.
  return { state: DriftState.SIGNALS_CORRELATED, enqueueNext: true };
}

/**
 * SIGNALS_CORRELATED -> DRIFT_CLASSIFIED
 * Run drift triage agent
 */
async function handleSignalsCorrelated(drift: any): Promise<TransitionResult> {
  const signal = drift.signalEvent;
  const rawPayload = signal?.rawPayload || {};
  const prData = rawPayload.pull_request || {};
  const extracted = signal?.extracted || {};

  // Build input for drift triage agent
  const triageInput = {
    prNumber: extracted.prNumber || prData.number,
    prTitle: extracted.prTitle || prData.title || '',
    prBody: extracted.prBody || prData.body || '',
    repoFullName: signal?.repo || '',
    authorLogin: extracted.authorLogin || prData.user?.login || '',
    mergedAt: prData.merged_at || null,
    changedFiles: extracted.changedFiles || [],
    diff: rawPayload.diff || '',
  };

  const result = await runDriftTriage(triageInput);

  if (!result.success || !result.data?.drift_detected) {
    console.log(`[Transitions] No drift detected - completing`);
    return { state: DriftState.COMPLETED, enqueueNext: false };
  }

  const triageData = result.data;

  // Phase 3: Extract key tokens for fingerprinting
  const keyTokens = triageData.key_tokens || extractKeyTokens(triageData.evidence_summary || '');

  // Phase 3: Compute fingerprint for deduplication
  const primaryDriftType = triageData.drift_types?.[0] || 'instruction';
  const fingerprint = computeDriftFingerprint({
    workspaceId: drift.workspaceId,
    service: drift.service,
    driftType: primaryDriftType,
    driftDomains: triageData.impacted_domains || [],
    docId: 'pending', // Will be updated after doc resolution
    keyTokens,
  });

  // Update drift with full triage results (Phase 3 fields)
  await prisma.driftCandidate.update({
    where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
    data: {
      driftType: primaryDriftType,
      driftDomains: triageData.impacted_domains || [],
      evidenceSummary: triageData.evidence_summary || '',
      confidence: triageData.confidence || 0,
      driftScore: triageData.drift_score || (triageData.confidence * (triageData.impact_score || 1)),
      riskLevel: triageData.risk_level || null,
      recommendedAction: triageData.recommended_action || null,
      fingerprint,
    },
  });

  console.log(`[Transitions] Drift classified: type=${primaryDriftType}, confidence=${triageData.confidence}, risk=${triageData.risk_level}`);

  return { state: DriftState.DRIFT_CLASSIFIED, enqueueNext: true };
}

/**
 * DRIFT_CLASSIFIED -> DOCS_RESOLVED
 * Resolve which docs to update (with Phase 3 deduplication)
 */
async function handleDriftClassified(drift: any): Promise<TransitionResult> {
  const signal = drift.signalEvent;

  // Phase 3: Check for duplicate drift before proceeding
  if (drift.driftType && drift.evidenceSummary) {
    const dedupResult = await checkDuplicateDrift({
      workspaceId: drift.workspaceId,
      service: drift.service,
      driftType: drift.driftType,
      driftDomains: drift.driftDomains || [],
      docId: 'pending', // Will be updated after doc resolution
      evidence: drift.evidenceSummary,
      newConfidence: drift.confidence || 0.5,
    });

    if (dedupResult.isDuplicate && !dedupResult.shouldNotify) {
      console.log(`[Transitions] Duplicate drift detected - existing ID: ${dedupResult.existingDriftId}, reason: ${dedupResult.reason}`);
      return { state: DriftState.COMPLETED, enqueueNext: false };
    }

    if (dedupResult.isDuplicate) {
      console.log(`[Transitions] Duplicate drift but re-notifying: ${dedupResult.reason}`);
    }
  }

  const resolverInput = {
    repoFullName: signal?.repo || '',
    suspectedServices: [drift.service || 'unknown'],
    impactedDomains: drift.driftDomains || [],
    orgId: drift.workspaceId, // Use workspaceId
  };

  const result = await runDocResolver(resolverInput);

  if (!result.success || !result.data?.doc_candidates?.length) {
    // No docs found - needs human mapping
    if (result.data?.needs_human) {
      return {
        state: DriftState.FAILED,
        enqueueNext: false,
        error: { code: FailureCode.NEEDS_DOC_MAPPING, message: 'No doc mapping found' },
      };
    }
    return { state: DriftState.COMPLETED, enqueueNext: false };
  }

  // Store doc candidates
  await prisma.driftCandidate.update({
    where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
    data: {
      docCandidates: result.data.doc_candidates,
    },
  });

  return { state: DriftState.DOCS_RESOLVED, enqueueNext: true };
}

/**
 * DOCS_RESOLVED -> DOCS_FETCHED
 * Fetch doc content (placeholder for Phase 3)
 */
async function handleDocsResolved(drift: any): Promise<TransitionResult> {
  // Phase 3 will fetch actual doc content from Confluence/Notion
  return { state: DriftState.DOCS_FETCHED, enqueueNext: true };
}

/**
 * DOCS_FETCHED -> BASELINE_CHECKED
 * Check baseline (placeholder for Phase 3)
 */
async function handleDocsFetched(drift: any): Promise<TransitionResult> {
  // Phase 3 will add managed region check
  return { state: DriftState.BASELINE_CHECKED, enqueueNext: true };
}

/**
 * BASELINE_CHECKED -> PATCH_PLANNED
 * Plan the patch (placeholder for Phase 3 - full LLM planning)
 */
async function handleBaselineChecked(drift: any): Promise<TransitionResult> {
  // Phase 3 will add full LLM-based patch planning with proper inputs
  // For now, we just transition to the next state
  console.log(`[Transitions] Patch planning for drift ${drift.id} (placeholder)`);
  return { state: DriftState.PATCH_PLANNED, enqueueNext: true };
}

/**
 * PATCH_PLANNED -> PATCH_GENERATED
 * Generate the actual patch (placeholder for Phase 3 - full LLM generation)
 */
async function handlePatchPlanned(drift: any): Promise<TransitionResult> {
  const docCandidates = drift.docCandidates || [];
  if (!docCandidates.length) {
    console.log(`[Transitions] No doc candidates for drift ${drift.id} - completing`);
    return { state: DriftState.COMPLETED, enqueueNext: false };
  }

  const signal = drift.signalEvent;
  const rawPayload = signal?.rawPayload || {};
  const prData = rawPayload.pull_request || {};
  const extracted = signal?.extracted || {};

  // Generate a simple placeholder patch for Phase 2
  // Phase 3 will add full LLM-based patch generation
  const primaryDoc = docCandidates[0];
  const prTitle = extracted.prTitle || prData.title || 'PR';
  const diffExcerpt = (rawPayload.diff || '').substring(0, 500);

  // Create a simple note-style patch
  const simplePatch = `--- a/doc\n+++ b/doc\n@@ -1,0 +1,5 @@\n+<!-- NOTE: This document may need updating due to recent code changes -->\n+<!-- PR: ${prTitle} -->\n+<!-- Evidence: ${drift.evidenceSummary || 'Code changes detected'} -->\n+<!-- Generated by VertaAI Drift Agent -->\n+`;

  // Create PatchProposal record
  await prisma.patchProposal.create({
    data: {
      workspaceId: drift.workspaceId,
      driftId: drift.id,
      docSystem: 'confluence', // Default to confluence
      docId: primaryDoc.doc_id || 'unknown',
      docTitle: primaryDoc.title || 'Unknown Document',
      patchStyle: 'add_note',
      unifiedDiff: simplePatch,
      sourcesUsed: [{ type: 'pr', ref: prTitle }],
      confidence: drift.confidence || 0.5,
      summary: `Auto-generated note for PR: ${prTitle}`,
    },
  });

  console.log(`[Transitions] Created patch proposal for drift ${drift.id}`);
  return { state: DriftState.PATCH_GENERATED, enqueueNext: true };
}

/**
 * PATCH_GENERATED -> PATCH_VALIDATED
 * Validate the generated patch (placeholder for Phase 3)
 */
async function handlePatchGenerated(drift: any): Promise<TransitionResult> {
  // Phase 3 will add 14 validators
  return { state: DriftState.PATCH_VALIDATED, enqueueNext: true };
}

/**
 * PATCH_VALIDATED -> OWNER_RESOLVED
 * Resolve the doc owner
 */
async function handlePatchValidated(drift: any): Promise<TransitionResult> {
  // Try to find an owner mapping for this service/doc
  const ownerMapping = await prisma.ownerMapping.findFirst({
    where: {
      workspaceId: drift.workspaceId,
      service: drift.service || undefined,
    },
  });

  if (ownerMapping) {
    await prisma.driftCandidate.update({
      where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
      data: {
        ownerResolution: {
          ownerType: ownerMapping.ownerType,
          ownerRef: ownerMapping.ownerRef,
          source: 'mapping',
        },
      },
    });
  } else {
    // Use workspace default owner
    await prisma.driftCandidate.update({
      where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
      data: {
        ownerResolution: {
          ownerType: drift.workspace?.defaultOwnerType || 'slack_channel',
          ownerRef: drift.workspace?.defaultOwnerRef || '#engineering',
          source: 'default',
        },
      },
    });
  }

  return { state: DriftState.OWNER_RESOLVED, enqueueNext: true };
}

/**
 * OWNER_RESOLVED -> SLACK_SENT
 * Send Slack notification (with Phase 3 notification routing)
 */
async function handleOwnerResolved(drift: any): Promise<TransitionResult> {
  // Get the patch proposal
  const patchProposal = await prisma.patchProposal.findFirst({
    where: {
      workspaceId: drift.workspaceId,
      driftId: drift.id,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!patchProposal) {
    return {
      state: DriftState.FAILED,
      enqueueNext: false,
      error: { code: FailureCode.PATCH_VALIDATION_FAILED, message: 'No patch proposal found' },
    };
  }

  // Get Slack integration
  const slackIntegration = await prisma.integration.findFirst({
    where: {
      workspaceId: drift.workspaceId,
      type: 'slack',
      status: 'connected',
    },
  });

  if (!slackIntegration) {
    return {
      state: DriftState.FAILED,
      enqueueNext: false,
      error: { code: FailureCode.SLACK_POST_DENIED, message: 'Slack integration not configured' },
    };
  }

  // Get owner info
  const ownerResolution = drift.ownerResolution || {};

  // Phase 3: Use notification routing policy
  const ownerSlackId = ownerResolution.ownerType === 'slack_user' ? ownerResolution.ownerRef : null;
  const notificationRoute = await determineNotificationRoute({
    workspaceId: drift.workspaceId,
    driftId: drift.id,
    confidence: drift.confidence || 0.5,
    riskLevel: drift.riskLevel as 'low' | 'medium' | 'high' | undefined,
    ownerSlackId,
    ownerChannel: ownerResolution.ownerType === 'slack_channel' ? ownerResolution.ownerRef : null,
  });

  console.log(`[Transitions] Notification decision: ${notificationRoute.channel}, priority=${notificationRoute.priority}, reason=${notificationRoute.reason}`);

  if (!notificationRoute.shouldNotify) {
    // Low confidence - skip Slack, complete without notification
    console.log(`[Transitions] Skipping Slack notification: ${notificationRoute.reason}`);
    return { state: DriftState.COMPLETED, enqueueNext: false };
  }

  // TODO: Actually send to Slack using slack-client
  // For now, just log and transition
  console.log(`[Transitions] Would send Slack message for drift ${drift.id}`);
  console.log(`[Transitions] Target: ${notificationRoute.target || ownerResolution.ownerRef || 'default'}`);
  console.log(`[Transitions] Channel: ${notificationRoute.channel}`);
  console.log(`[Transitions] Doc: ${patchProposal.docTitle}`);
  console.log(`[Transitions] Patch summary: ${patchProposal.summary || 'N/A'}`);

  return { state: DriftState.SLACK_SENT, enqueueNext: true };
}

/**
 * SLACK_SENT -> AWAITING_HUMAN
 * Wait for human action
 */
async function handleSlackSent(drift: any): Promise<TransitionResult> {
  return { state: DriftState.AWAITING_HUMAN, enqueueNext: false };
}

/**
 * APPROVED -> WRITEBACK_VALIDATED
 * Validate before writeback
 */
async function handleApproved(drift: any): Promise<TransitionResult> {
  // Phase 3 will add writeback validation
  return { state: DriftState.WRITEBACK_VALIDATED, enqueueNext: true };
}

/**
 * EDIT_REQUESTED -> PATCH_GENERATED
 * Re-generate with human edits
 */
async function handleEditRequested(drift: any): Promise<TransitionResult> {
  // Re-generate patch with human edits, then go back to PATCH_GENERATED
  return { state: DriftState.PATCH_GENERATED, enqueueNext: true };
}

/**
 * WRITEBACK_VALIDATED -> WRITTEN_BACK
 * Perform the actual writeback
 */
async function handleWritebackValidated(drift: any): Promise<TransitionResult> {
  // Phase 3 will add actual Confluence/Notion writeback
  console.log(`[Transitions] Would write back to doc for drift ${drift.id}`);
  return { state: DriftState.WRITTEN_BACK, enqueueNext: true };
}

/**
 * WRITTEN_BACK -> COMPLETED
 * Finalize
 */
async function handleWrittenBack(drift: any): Promise<TransitionResult> {
  // Create audit event using correct schema fields
  await prisma.auditEvent.create({
    data: {
      workspaceId: drift.workspaceId,
      entityType: 'drift',
      entityId: drift.id,
      eventType: 'completed',
      payload: { state: DriftState.COMPLETED },
      actorType: 'system',
      actorId: 'drift-agent',
    },
  });

  console.log(`[Transitions] Drift ${drift.id} completed`);
  return { state: DriftState.COMPLETED, enqueueNext: false };
}
