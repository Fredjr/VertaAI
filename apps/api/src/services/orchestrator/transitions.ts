// State Transition Orchestrator
// Based on Section 15.10.6 of the spec

import {
  DriftState,
  FailureCode,
  TransitionResult,
  DriftVerdict,
} from '../../types/state-machine.js';
import { runDriftTriage } from '../../agents/drift-triage.js';
import { runPatchPlanner } from '../../agents/patch-planner.js';
import { runPatchGenerator } from '../../agents/patch-generator.js';
import { runSlackComposer } from '../../agents/slack-composer.js';
import { prisma } from '../../lib/db.js';
import { Prisma } from '@prisma/client';

// Phase 3 imports
import { computeDriftFingerprint, extractKeyTokens } from '../dedup/fingerprint.js';
import { checkDuplicateDrift } from '../validators/dedup.js';
import { determineNotificationRoute } from '../notifications/policy.js';
import { runAllValidators } from '../validators/index.js';

// Phase 4 imports
import { joinSignals, summarizeCorrelatedSignals } from '../correlation/signalJoiner.js';
import { resolveOwner, formatOwnerResolution } from '../ownership/resolver.js';

// Phase 5 imports - Scoring and baseline
import { calculateEvidenceStrength, calculateImpactScore, calculateDriftScore } from '../scoring/index.js';
import {
  checkInstructionBaseline,
  checkOwnershipBaseline,
  checkCoverageBaseline,
  checkEnvironmentBaseline,
  checkProcessBaseline,
  checkProcessBaselineDetailed,
  findPatternMatches,
  INSTRUCTION_PATTERNS,
  ENVIRONMENT_PATTERNS,
} from '../baseline/patterns.js';
import { selectPatchStyle } from '../../config/driftMatrix.js';

// Phase 6 imports - DocContext extraction
import { extractDocContext, buildLlmPayload } from '../docs/docContextExtractor.js';

// Phase 7 imports - Doc resolution with priority order
import { resolveDocsForDrift } from '../docs/docResolution.js';

// Gap Filling imports - EvidencePack extraction and tool migration detection
import {
  extractEvidencePack,
  detectToolMigrations,
  extractScenarioKeywords,
} from '../baseline/evidencePack.js';

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
  [DriftState.DOC_CONTEXT_EXTRACTED]: handleDocContextExtracted,
  [DriftState.EVIDENCE_EXTRACTED]: handleEvidenceExtracted,
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
 * Phase 4 Week 8: Added comprehensive audit logging
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
    // Execute state transition
    const result = await handler(drift);

    // Phase 4 Week 8: Log successful state transition to audit trail
    if (result.state !== currentState) {
      const { logStateTransition } = await import('../audit/logger.js');
      await logStateTransition(
        drift.workspaceId,
        drift.id,
        currentState,
        result.state,
        'system',
        'state-machine',
        {
          enqueueNext: result.enqueueNext,
          nextStateHint: result.nextStateHint,
        }
      );
    }

    return result;
  } catch (error: any) {
    console.error(`[Transitions] Error in ${currentState}:`, error);

    // Phase 4 Week 8: Log failed state transition to audit trail
    const { createAuditLog } = await import('../audit/logger.js');
    await createAuditLog({
      workspaceId: drift.workspaceId,
      eventType: 'state_transition_failed',
      category: 'system',
      severity: 'error',
      entityType: 'drift_candidate',
      entityId: drift.id,
      actorType: 'system',
      actorId: 'state-machine',
      fromState: currentState,
      toState: currentState,
      metadata: {
        error: error.message || 'Unknown error',
        stack: error.stack,
      },
    });

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
 * Check if this signal passes source-specific eligibility rules
 * Point 1: Eligibility Rules by Source - noise control knob
 */
async function handleIngested(drift: any): Promise<TransitionResult> {
  const signal = drift.signalEvent;
  const sourceType = signal?.sourceType || drift.sourceType;

  // Import eligibility rules dynamically
  const {
    checkGitHubPREligibility,
    checkPagerDutyEligibility,
    checkSlackClusterEligibility,
    getEligibilityRules,
    DEFAULT_ELIGIBILITY_RULES
  } = await import('../../config/eligibilityRules.js');

  // Get workspace-specific rules (TODO: load from workspace.workflowPreferences)
  const workspaceRules = undefined; // For now, use defaults

  let eligibilityResult: { eligible: boolean; reason?: string } = { eligible: true };

  // Check eligibility based on source type
  if (sourceType === 'github_pr') {
    const rawPayload = signal.rawPayload || {};
    const prData = rawPayload.pull_request || {};
    const extracted = signal.extracted || {};

    const rules = getEligibilityRules('github_pr', workspaceRules) as any;

    eligibilityResult = checkGitHubPREligibility({
      changedFiles: extracted.changedFiles,
      totalChanges: extracted.totalChanges || prData.additions + prData.deletions,
      labels: prData.labels?.map((l: any) => l.name) || [],
      author: prData.user?.login || extracted.authorLogin,
      merged: prData.merged ?? extracted.merged,
    }, rules);
  }
  else if (sourceType === 'pagerduty_incident') {
    const extracted = signal.extracted || {};
    const rules = getEligibilityRules('pagerduty_incident', workspaceRules) as any;

    eligibilityResult = checkPagerDutyEligibility({
      status: extracted.status,
      severity: signal.severity,
      priority: extracted.priority,
      service: signal.service,
      durationMinutes: extracted.duration ? extracted.duration / (1000 * 60) : undefined,
      hasNotes: (extracted.notes?.length || 0) > 0,
      tags: extracted.tags,
    }, rules);
  }
  else if (sourceType === 'slack_cluster') {
    const extracted = signal.extracted || {};
    const rules = getEligibilityRules('slack_cluster', workspaceRules) as any;

    eligibilityResult = checkSlackClusterEligibility({
      clusterSize: extracted.clusterSize,
      uniqueAskers: extracted.uniqueAskers,
      oldestQuestionHoursAgo: extracted.oldestQuestionHoursAgo,
      channel: extracted.channel,
    }, rules);
  }
  // github_codeowners and datadog_alert/github_iac are always eligible for now

  // If not eligible, mark as COMPLETED with reason
  if (!eligibilityResult.eligible) {
    console.log(`[Transitions] Signal not eligible: ${eligibilityResult.reason}`);

    // Store eligibility failure reason in drift candidate
    await prisma.driftCandidate.update({
      where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
      data: {
        lastErrorCode: 'ELIGIBILITY_FAILED',
        lastErrorMessage: eligibilityResult.reason,
      },
    });

    return { state: DriftState.COMPLETED, enqueueNext: false };
  }

  // PHASE 1 QUICK WIN: Keyword hints for noise reduction (HINT ONLY, not final verdict)
  const { analyzeKeywordHints, isLikelyNoise } = await import('../keywords/keywordHints.js');

  const rawPayload = signal.rawPayload || {};
  const extracted = signal.extracted || {};

  // Build text to analyze (source-specific)
  let textToAnalyze = '';
  if (sourceType === 'github_pr') {
    const prData = rawPayload.pull_request || {};
    textToAnalyze = [
      prData.title || '',
      prData.body || '',
      extracted.prTitle || '',
      extracted.prBody || '',
    ].join(' ');
  } else if (sourceType === 'pagerduty_incident') {
    textToAnalyze = [
      extracted.title || '',
      extracted.description || '',
      extracted.notes?.join(' ') || '',
    ].join(' ');
  } else if (sourceType === 'slack_cluster') {
    textToAnalyze = extracted.representativeQuestion || '';
  }

  // Check if likely noise based on negative keywords
  if (textToAnalyze && isLikelyNoise(textToAnalyze, sourceType as any)) {
    console.log(`[Transitions] PHASE 1 - Keyword hint: Likely noise, skipping`);

    await prisma.driftCandidate.update({
      where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
      data: {
        lastErrorCode: 'NOISE_FILTERED',
        lastErrorMessage: 'Filtered by negative keyword hints',
      },
    });

    return { state: DriftState.COMPLETED, enqueueNext: false };
  }

  // Analyze keyword hints for logging (not used as final verdict)
  if (textToAnalyze) {
    const hints = analyzeKeywordHints(textToAnalyze, sourceType as any);
    console.log(`[Transitions] PHASE 1 - Keyword hints: positive=${hints.positiveMatches.length}, negative=${hints.negativeMatches.length}, recommendation=${hints.recommendation}`);
    if (hints.positiveMatches.length > 0) {
      console.log(`[Transitions]   Positive keywords: ${hints.positiveMatches.slice(0, 5).join(', ')}`);
    }
    if (hints.negativeMatches.length > 0) {
      console.log(`[Transitions]   Negative keywords: ${hints.negativeMatches.slice(0, 5).join(', ')}`);
    }
  }

  console.log(`[Transitions] Signal passed eligibility check`);
  return { state: DriftState.ELIGIBILITY_CHECKED, enqueueNext: true };
}

/**
 * ELIGIBILITY_CHECKED -> SIGNALS_CORRELATED
 * Phase 4: Correlate signals from multiple sources (GitHub + PagerDuty)
 * Point 9: Correlation Strategies - Source-aware correlation scoring
 */
async function handleEligibilityChecked(drift: any): Promise<TransitionResult> {
  const signal = drift.signalEvent;
  const service = drift.service || signal?.service;

  // Phase 4: Use SignalJoiner to find correlated signals
  const joinResult = await joinSignals(
    drift.workspaceId,
    drift.signalEventId,
    service
  );

  // Point 9: Calculate cross-source correlation score using advanced strategies
  const { calculateCorrelationScore } = await import('../../config/correlationStrategies.js');

  let maxCorrelationScore = 0;
  if (joinResult.correlatedSignals.length > 0) {
    // Calculate correlation score with each correlated signal
    for (const correlatedSignal of joinResult.correlatedSignals) {
      const result = calculateCorrelationScore(
        signal as any,
        correlatedSignal as any
      );
      maxCorrelationScore = Math.max(maxCorrelationScore, result.score);
    }
  }

  // Store correlation results in drift metadata
  if (joinResult.correlatedSignals.length > 0 || joinResult.confidenceBoost > 0) {
    const correlationSummary = summarizeCorrelatedSignals(joinResult.correlatedSignals);

    await prisma.driftCandidate.update({
      where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
      data: {
        // Store correlation metadata in extracted field
        correlatedSignals: joinResult.correlatedSignals.map(s => s.id),
        correlationBoost: joinResult.confidenceBoost,
        correlationReason: joinResult.joinReason,
        correlationScore: maxCorrelationScore, // Point 9: Store correlation score
      },
    });

    console.log(
      `[Transitions] Point 9 - Signal correlation: ${correlationSummary}, ` +
      `boost=${joinResult.confidenceBoost}, score=${maxCorrelationScore.toFixed(2)}, reason=${joinResult.joinReason}`
    );
  }

  return { state: DriftState.SIGNALS_CORRELATED, enqueueNext: true };
}

/**
 * SIGNALS_CORRELATED -> DRIFT_CLASSIFIED
 * Run drift triage agent
 * Point 10: Domain Patterns - Source-specific domain detection
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

  // Phase 3: Extract drift type and metadata
  const primaryDriftType = triageData.drift_types?.[0] || 'instruction';

  // Point 10: Enhance domain detection with source-specific patterns
  const { detectDomainsFromSource } = await import('../baseline/patterns.js');
  const sourceType = drift.sourceType || signal?.sourceType || 'github_pr';
  const evidenceText = `${triageInput.prTitle} ${triageInput.prBody}`;
  const detectedDomains = detectDomainsFromSource(evidenceText, sourceType);

  // Merge LLM-detected domains with pattern-detected domains
  const llmDomains = triageData.impacted_domains || [];
  const allDomains = [...new Set([...llmDomains, ...detectedDomains])];

  console.log(`[Transitions] Point 10 - Domain detection: LLM=[${llmDomains.join(', ')}], patterns=[${detectedDomains.join(', ')}], merged=[${allDomains.join(', ')}]`);

  // Phase 4: Apply correlation boost to confidence
  const baseConfidence = triageData.confidence || 0;
  const correlationBoost = drift.correlationBoost || 0;
  const boostedConfidence = Math.min(1, baseConfidence + correlationBoost);

  // Update drift with triage results (fingerprint stored in DRIFT_CLASSIFIED after dedup check)
  await prisma.driftCandidate.update({
    where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
    data: {
      driftType: primaryDriftType,
      driftDomains: allDomains, // Point 10: Use merged domains
      evidenceSummary: triageData.evidence_summary || '',
      confidence: boostedConfidence,
      driftScore: triageData.drift_score || (boostedConfidence * (triageData.impact_score || 1)),
      riskLevel: triageData.risk_level || null,
      recommendedAction: triageData.recommended_action || null,
      // Note: fingerprint stored after dedup check in DRIFT_CLASSIFIED state
    },
  });

  console.log(`[Transitions] Drift classified: type=${primaryDriftType}, base_conf=${baseConfidence}, boost=${correlationBoost}, final_conf=${boostedConfidence}, risk=${triageData.risk_level}`);

  return { state: DriftState.DRIFT_CLASSIFIED, enqueueNext: true };
}

/**
 * DRIFT_CLASSIFIED -> DOCS_RESOLVED
 * Resolve which docs to update (with Phase 3 deduplication)
 * Point 2: Doc Targeting - Use source-output compatibility matrix
 */
async function handleDriftClassified(drift: any): Promise<TransitionResult> {
  const signal = drift.signalEvent;

  // Phase 3: Compute fingerprint and check for duplicates
  let fingerprint: string | null = null;
  if (drift.driftType && drift.evidenceSummary) {
    // Extract key tokens for fingerprinting
    const keyTokens = extractKeyTokens(drift.evidenceSummary);
    fingerprint = computeDriftFingerprint({
      workspaceId: drift.workspaceId,
      service: drift.service,
      driftType: drift.driftType,
      driftDomains: drift.driftDomains || [],
      docId: 'pending', // Will be updated after doc resolution
      keyTokens,
    });

    const dedupResult = await checkDuplicateDrift({
      workspaceId: drift.workspaceId,
      service: drift.service,
      driftType: drift.driftType,
      driftDomains: drift.driftDomains || [],
      docId: 'pending',
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

    // Store fingerprint after dedup check passes (this is the "primary" drift for this fingerprint)
    await prisma.driftCandidate.update({
      where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
      data: { fingerprint },
    });
    console.log(`[Transitions] Fingerprint stored: ${fingerprint}`);
  }

  // Point 2: Determine target doc systems using source-output compatibility matrix
  const { getTargetDocSystemsForSourceAndDrift } = await import('../../config/docTargeting.js');
  const sourceType = drift.sourceType || signal?.sourceType || 'github_pr';
  const driftType = drift.driftType || 'instruction';

  const targetDocSystems = getTargetDocSystemsForSourceAndDrift(sourceType, driftType);
  console.log(`[Transitions] Point 2 - Doc Targeting: source=${sourceType}, drift=${driftType}, targets=[${targetDocSystems.join(', ')}]`);

  // Store target doc systems for downstream use
  await prisma.driftCandidate.update({
    where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
    data: { targetDocSystems },
  });


  // Phase 7: Use new doc resolution with priority order (P0 → P1 → P2 → NEEDS_MAPPING)
  const extracted = signal?.extracted || {};
  const rawPayload = signal?.rawPayload || {};
  const prData = rawPayload.pull_request || {};

  // Fetch workspace policy for doc resolution (per spec Section 1.1 + Section 7)
  const workspace = await prisma.workspace.findUnique({
    where: { id: drift.workspaceId },
    select: {
      primaryDocRequired: true,
      allowPrLinkOverride: true,
      allowSearchSuggestMapping: true,
      minConfidenceForSuggest: true,
      allowedConfluenceSpaces: true,
    },
  });

  const resolutionResult = await resolveDocsForDrift({
    workspaceId: drift.workspaceId,
    repo: signal?.repo || null,
    service: drift.service || null,
    prBody: extracted.prBody || prData.body || null,
    prTitle: extracted.prTitle || prData.title || null,
    policy: workspace ? {
      primaryDocRequired: workspace.primaryDocRequired,
      allowPrLinkOverride: workspace.allowPrLinkOverride,
      allowSearchSuggestMapping: workspace.allowSearchSuggestMapping,
      minConfidenceForSuggest: workspace.minConfidenceForSuggest,
      allowedConfluenceSpaces: workspace.allowedConfluenceSpaces,
    } : undefined,
    // NEW: Pass sourceType for explicit source-specific mappings
    sourceType: sourceType,
    // DEPRECATED: targetDocSystems - replaced with explicit source-specific mappings
    // Kept for backward compatibility during transition
    targetDocSystems,
  });

  console.log(`[Transitions] Doc resolution: status=${resolutionResult.status}, method=${resolutionResult.method}, candidates=${resolutionResult.candidates.length}`);

  // Handle NEEDS_MAPPING case with notification deduplication (per spec Section 7)
  if (resolutionResult.status === 'needs_mapping') {
    // Generate needs_mapping_key for deduplication: "workspace_id:repo"
    const needsMappingKey = `${drift.workspaceId}:${signal?.repo || drift.service || 'unknown'}`;

    // Check if we've already notified for this key in the past week
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentNotification = await prisma.driftCandidate.findFirst({
      where: {
        workspaceId: drift.workspaceId,
        needsMappingKey,
        needsMappingNotifiedAt: { gte: oneWeekAgo },
      },
      select: { id: true, needsMappingNotifiedAt: true },
    });

    // Update current candidate with needs_mapping tracking
    await prisma.driftCandidate.update({
      where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
      data: {
        needsMappingKey,
        // Only set notifiedAt if we're actually going to notify (no recent notification)
        needsMappingNotifiedAt: recentNotification ? null : new Date(),
        docsResolutionStatus: 'needs_mapping',
        docsResolutionMethod: 'none',
      },
    });

    // If recently notified, skip the Slack notification spam
    const shouldNotify = !recentNotification;
    console.log(`[Transitions] NEEDS_MAPPING: key=${needsMappingKey}, shouldNotify=${shouldNotify}, recentNotification=${recentNotification?.needsMappingNotifiedAt}`);

    return {
      state: DriftState.FAILED_NEEDS_MAPPING,
      enqueueNext: false,
      error: {
        code: FailureCode.NEEDS_DOC_MAPPING,
        message: resolutionResult.notes || 'No doc mapping found - human needs to configure doc mapping',
        // Include deduplication info for downstream handlers
        shouldNotify,
        needsMappingKey,
      },
    };
  }

  // Handle IGNORED status (per spec Section 6.1)
  // status=ignored → transition to COMPLETED (no doc update needed)
  if (resolutionResult.status === 'ignored') {
    console.log(`[Transitions] Doc resolution ignored: ${resolutionResult.notes}`);

    await prisma.driftCandidate.update({
      where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
      data: {
        docsResolutionStatus: 'ignored',
        docsResolutionMethod: 'none',
        noWritebackMode: true,
      },
    });

    return { state: DriftState.COMPLETED, enqueueNext: false };
  }

  // No candidates found (shouldn't happen if status != needs_mapping/ignored, but handle gracefully)
  if (resolutionResult.candidates.length === 0) {
    return { state: DriftState.COMPLETED, enqueueNext: false };
  }

  // Transform candidates to legacy format for compatibility with downstream handlers
  const docCandidates = resolutionResult.candidates.map(c => ({
    doc_id: c.docId,
    docId: c.docId,
    system: c.docSystem,
    title: c.docTitle,
    doc_title: c.docTitle,
    doc_url: c.docUrl,
    is_primary: c.isPrimary,
    has_managed_region: c.hasManagedRegion,
    allow_writeback: c.allowWriteback,
    space_key: c.spaceKey,
    match_reasons: c.reasons, // Per spec: multiple reasons (was match_reason: string)
    confidence: c.confidence,
  }));

  // Get the selected (first) doc for tracking (per spec Section 0.1)
  const selectedDoc = resolutionResult.candidates[0];

  // Store doc candidates and resolution metadata
  // Per spec Section 0.1: Store full docsResolution blob for flight recorder debugging
  await prisma.driftCandidate.update({
    where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
    data: {
      docCandidates,
      docsResolutionStatus: resolutionResult.status,
      docsResolutionMethod: resolutionResult.method,
      docsResolutionConfidence: resolutionResult.confidence,
      noWritebackMode: resolutionResult.noWritebackMode,
      // Per spec Section 0.1 - Full flight recorder blob for debugging
      docsResolution: resolutionResult as unknown as Prisma.InputJsonValue,
      // Per spec Section 0.1 - store selected doc details for observability
      selectedDocId: selectedDoc?.docId || null,
      selectedDocUrl: selectedDoc?.docUrl || null,
      selectedDocTitle: selectedDoc?.docTitle || null,
    },
  });

  return { state: DriftState.DOCS_RESOLVED, enqueueNext: true };
}

/**
 * DOCS_RESOLVED -> DOCS_FETCHED
 * Fetch doc content from Confluence/Notion using adapter.fetch()
 *
 * FIX F1: Now actually fetches real doc content with baseRevision tracking
 */
async function handleDocsResolved(drift: any): Promise<TransitionResult> {
  const docCandidates = drift.docCandidates || [];
  if (!docCandidates.length) {
    return { state: DriftState.COMPLETED, enqueueNext: false };
  }

  // Get the primary doc candidate
  const primaryDoc = docCandidates[0];
  const docId = primaryDoc.doc_id || primaryDoc.docId;

  // Fetch doc mapping to get the doc system type
  const docMapping = await prisma.docMappingV2.findFirst({
    where: { workspaceId: drift.workspaceId, docId },
  });

  if (!docMapping) {
    console.error(`[Transitions] No doc mapping found for docId=${docId}`);
    return { state: DriftState.FAILED_NEEDS_MAPPING, enqueueNext: false };
  }

  let docContent = '';
  let docRevision: string | null = null;
  let docTitle = docMapping.docTitle || primaryDoc.doc_title || 'Unknown';

  try {
    // FIX F1: Use adapter registry to fetch actual doc content
    const { getAdapter } = await import('../docs/adapters/registry.js');
    const adapter = await getAdapter(drift.workspaceId, docMapping.docSystem as any);

    if (!adapter) {
      console.error(`[Transitions] No adapter available for docSystem=${docMapping.docSystem}`);
      // Fallback to empty content rather than failing
      docContent = '';
      docRevision = new Date().toISOString();
    } else {
      // Fetch real doc content using adapter
      const fetchResult = await adapter.fetch({
        docId,
        docSystem: docMapping.docSystem as any,
        docUrl: docMapping.docUrl || primaryDoc.doc_url || '',
      });

      // Use markdown content for baseline checks
      docContent = fetchResult.markdown || fetchResult.content || '';
      docRevision = fetchResult.baseRevision; // Real revision from doc system
      docTitle = fetchResult.title || docTitle;

      console.log(`[Transitions] Fetched doc via adapter: system=${docMapping.docSystem}, revision=${docRevision}, content_length=${docContent.length}`);
    }
  } catch (error: any) {
    console.error(`[Transitions] Error fetching doc content:`, error);
    // Don't fail the entire pipeline - store error and continue
    docContent = '';
    docRevision = null;
  }

  // Store fetched content in baselineFindings (DocContext extraction happens in next state)
  const updatedFindings = [{
    docId,
    docContent,
    docRevision, // Real revision from adapter.fetch()
    fetchedAt: new Date().toISOString(),
    docSystem: docMapping.docSystem,
    docUrl: docMapping.docUrl || primaryDoc.doc_url || '',
    docTitle,
  }] as unknown as import('@prisma/client').Prisma.InputJsonValue;

  await prisma.driftCandidate.update({
    where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
    data: {
      baselineFindings: updatedFindings,
    },
  });

  return { state: DriftState.DOCS_FETCHED, enqueueNext: true };
}

/**
 * Extract evidence keywords from signal for DocContext section targeting
 */
function extractEvidenceKeywords(signal: any): string[] {
  if (!signal) return [];

  const keywords: string[] = [];
  const extracted = signal.extracted || {};

  // Extract keywords from PR title
  if (extracted.title) {
    const words = extracted.title.split(/\s+/).filter((w: string) => w.length > 3);
    keywords.push(...words.slice(0, 5));
  }

  // Extract from file paths (service names, directories)
  if (extracted.changed_files && Array.isArray(extracted.changed_files)) {
    for (const file of extracted.changed_files.slice(0, 10)) {
      const parts = file.split('/');
      for (const part of parts) {
        if (part.length > 3 && !part.includes('.')) {
          keywords.push(part);
        }
      }
    }
  }

  // Extract from PR description (limited to key terms)
  if (extracted.description) {
    const desc = extracted.description.toLowerCase();
    const techTerms = ['deploy', 'config', 'migration', 'rollback', 'feature', 'fix', 'update'];
    for (const term of techTerms) {
      if (desc.includes(term)) {
        keywords.push(term);
      }
    }
  }

  // Deduplicate and return
  return [...new Set(keywords.map((k: string) => k.toLowerCase()))].slice(0, 15);
}

/**
 * DOCS_FETCHED -> DOC_CONTEXT_EXTRACTED
 * Extract DocContext for deterministic slicing (prevents hallucination)
 */
async function handleDocsFetched(drift: any): Promise<TransitionResult> {
  // Get doc content from baselineFindings (stored by handleDocsResolved)
  const findings = drift.baselineFindings || [];
  const finding = findings[0] || {};
  const docContent = finding.docContent || '';
  const docId = finding.docId;

  // Extract DocContext for deterministic slicing
  const driftType = (drift.driftType || 'instruction') as import('../../types/doc-context.js').DriftType;
  const driftDomains = drift.driftDomains || [];
  const signal = drift.signalEvent;
  const evidenceKeywords = extractEvidenceKeywords(signal);

  const docContext = extractDocContext({
    workspaceId: drift.workspaceId,
    docSystem: (finding.docSystem as 'confluence' | 'notion') || 'confluence',
    docId,
    docUrl: finding.docUrl || '',
    docTitle: finding.docTitle || 'Unknown',
    docText: docContent,
    baseRevision: finding.docRevision || 'unknown',
    driftType,
    driftDomains,
    evidenceKeywords,
  });

  console.log(`[Transitions] DocContext extracted: ${docContext.extractedSections.length} sections, managed=${!docContext.flags.managedRegionMissing}`);

  // Per spec Section 0.1: Compute doc_context_sha256 for stable fingerprinting
  // Use a simple hash of the extracted sections' text for deduplication/caching
  const contextSlice = docContext.extractedSections
    .map(s => s.text)
    .join('|||');
  const docContextSha256 = await computeSimpleHash(contextSlice);

  // Store DocContext in baselineFindings (legacy format)
  const updatedFindings = [{
    ...finding,
    docContext: JSON.parse(JSON.stringify(docContext)),
    llmPayload: JSON.parse(JSON.stringify(buildLlmPayload(docContext))),
  }] as unknown as import('@prisma/client').Prisma.InputJsonValue;

  // Per spec Section 0.1: Store docContext, baseRevision, and sha256 in dedicated columns
  await prisma.driftCandidate.update({
    where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
    data: {
      baselineFindings: updatedFindings,
      // Per spec Section 0.1 - Idempotency + debuggability fields
      docContext: docContext as unknown as Prisma.InputJsonValue, // Full DocContext snapshot
      baseRevision: finding.docRevision || null,              // Confluence/Notion version at fetch
      docContextSha256,                                        // Stable fingerprint for cache/dedup
    },
  });

  return { state: DriftState.DOC_CONTEXT_EXTRACTED, enqueueNext: true };
}

/**
 * Simple hash function for computing doc context fingerprint.
 * Uses Web Crypto API for SHA-256.
 */
async function computeSimpleHash(text: string): Promise<string> {
  // In Node.js environment, use crypto module
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * DOC_CONTEXT_EXTRACTED -> EVIDENCE_EXTRACTED
 * Simple passthrough - DocContext already extracted in handleDocsFetched
 * This state exists for auditability in the state timeline
 */
async function handleDocContextExtracted(drift: any): Promise<TransitionResult> {
  console.log(`[Transitions] DocContext extracted, proceeding to evidence extraction`);
  return { state: DriftState.EVIDENCE_EXTRACTED, enqueueNext: true };
}

/**
 * EVIDENCE_EXTRACTED -> BASELINE_CHECKED
 * Extract EvidencePack and check baseline patterns using EvidencePack vs BaselineAnchors comparison
 *
 * Per Spec - Comparison logic: drift-vs-Confluence baseline across 5 drift types
 * Core principle: Compare Evidence from PR vs Baseline from doc
 */
async function handleEvidenceExtracted(drift: any): Promise<TransitionResult> {
  // Get doc content and DocContext from baselineFindings
  const findings = drift.baselineFindings || [];
  const finding = findings[0] || {};
  const docContent = finding.docContent || '';
  const docContext = finding.docContext;
  const driftType = drift.driftType || 'instruction';
  const signal = drift.signalEvent;
  const rawPayload = signal?.rawPayload || {};
  const prData = rawPayload.pull_request || {};
  const extracted = signal?.extracted || {};

  // --- Build EvidencePack from PR data ---
  const changedFilesRaw = extracted.changedFiles || prData.changed_files || [];
  const changedFiles: string[] = Array.isArray(changedFilesRaw)
    ? changedFilesRaw.map((f: any) => typeof f === 'string' ? f : f.filename || '')
    : [];

  const evidencePack = extractEvidencePack({
    prTitle: extracted.prTitle || prData.title || '',
    prBody: extracted.prBody || prData.body || null,
    changedFiles,
    diff: extracted.diff || '',
    ruleHits: drift.ruleHits || [],
  });

  // --- Get BaselineAnchors from DocContext ---
  const baselineAnchors = docContext?.baselineAnchors?.anchors || {
    commands: [],
    tool_mentions: [],
    config_keys: [],
    endpoints: [],
    step_markers: [],
    decision_markers: [],
    owner_refs: [],
    coverage_keywords_present: [],
  };

  // Extended baseline result type
  let baselineResult: {
    driftType: string;
    hasMatch: boolean;
    matchCount: number;
    evidence: string[];
    comparisonDetails?: {
      prArtifacts: string[];
      docArtifacts: string[];
      conflicts: string[];
      recommendation: string;
    };
    toolMigration?: {
      oldTool: string;
      newTool: string;
      confidence: number;
    };
    authoritativeOwner?: {
      primary: string | null;
      source: string;
    };
    processResult?: {
      detected: boolean;
      confidence_suggestion: number;
      mismatch_type: string;
      affected_section_ids: string[];
      findings: Array<{
        kind: string;
        doc_snippet: string;
        doc_location: { section_id?: string; start_char: number; end_char: number };
        matched_patterns: string[];
      }>;
      doc_flow: string[];
      pr_flow: string[];
      recommended_patch_style: string;
      recommended_action: string;
      rationale: string;
    };
  } = {
    driftType,
    hasMatch: false,
    matchCount: 0,
    evidence: [],
  };

  // ==========================================================================
  // A) INSTRUCTION DRIFT - Gap 3
  // Compare EvidencePack artifacts vs DocContext baselineAnchors
  // ENHANCED: Also detect NEW content (coverage gaps) not just conflicts
  // ==========================================================================
  if (driftType === 'instruction') {
    const prCommands = evidencePack.extracted.commands;
    const prConfigKeys = evidencePack.extracted.config_keys;
    const prEndpoints = evidencePack.extracted.endpoints;
    const prKeywords = evidencePack.extracted.keywords;

    const docCommands = baselineAnchors.commands;
    const docConfigKeys = baselineAnchors.config_keys;
    const docEndpoints = baselineAnchors.endpoints;

    // Find conflicts: PR has artifact that conflicts with doc artifact
    const conflicts: string[] = [];

    // Find new content: PR has artifact NOT in doc (coverage gap)
    const newContent: string[] = [];

    // Check for command conflicts (PR changed command, doc has old version)
    for (const prCmd of prCommands) {
      let foundInDoc = false;
      for (const docCmd of docCommands) {
        // Same base command but different arguments/flags
        const prBase = prCmd.split(' ')[0];
        const docBase = docCmd.split(' ')[0];
        if (prBase === docBase) {
          foundInDoc = true;
          if (prCmd !== docCmd) {
            conflicts.push(`Command conflict: PR="${prCmd}" vs Doc="${docCmd}"`);
          }
        }
      }
      // NEW: If command not found in doc at all, it's new content
      if (!foundInDoc && prCmd.trim()) {
        newContent.push(`New command: ${prCmd}`);
      }
    }

    // Check for config key changes and new keys
    for (const prKey of prConfigKeys) {
      let foundInDoc = false;
      for (const docKey of docConfigKeys) {
        if (prKey === docKey) {
          foundInDoc = true;
          // PR mentions a config key that exists in doc (potential update)
          if (prKeywords.some(k =>
            ['rename', 'deprecate', 'migrate', 'replace', 'change', 'update'].includes(k)
          )) {
            conflicts.push(`Config change detected: ${prKey}`);
          }
        }
      }
      // NEW: If config key not found in doc, it's new content
      if (!foundInDoc && prKey.trim()) {
        newContent.push(`New config key: ${prKey}`);
      }
    }

    // Check for endpoint changes and new endpoints
    for (const prEndpoint of prEndpoints) {
      let foundInDoc = false;
      for (const docEndpoint of docEndpoints) {
        // Same path prefix but different full path
        const prPath = prEndpoint.replace(/^https?:\/\/[^/]+/, '');
        const docPath = docEndpoint.replace(/^https?:\/\/[^/]+/, '');
        const prPrefix = prPath.split('/').slice(0, 3).join('/');
        const docPrefix = docPath.split('/').slice(0, 3).join('/');

        if (prPrefix === docPrefix) {
          foundInDoc = true;
          if (prPath !== docPath) {
            conflicts.push(`Endpoint change: ${docPath} → ${prPath}`);
          }
        }
      }
      // NEW: If endpoint not found in doc, it's new content
      if (!foundInDoc && prEndpoint.trim()) {
        newContent.push(`New endpoint: ${prEndpoint}`);
      }
    }

    // Check if PR keywords indicate change + doc has related artifacts
    const changeKeywords = ['rename', 'deprecate', 'migrate', 'replace', 'change', 'update', 'remove'];
    const hasChangeIntent = prKeywords.some(k => changeKeywords.includes(k));
    const docHasRelatedArtifacts = docCommands.length > 0 || docConfigKeys.length > 0 || docEndpoints.length > 0;

    if (hasChangeIntent && docHasRelatedArtifacts && conflicts.length === 0) {
      // Even without explicit conflicts, flag if PR has change intent and doc has artifacts
      conflicts.push(`Change intent detected (${prKeywords.filter(k => changeKeywords.includes(k)).join(', ')}) with doc artifacts present`);
    }

    // ENHANCED: Combine conflicts and new content for drift detection
    const allEvidence = [...conflicts, ...newContent];
    const hasDrift = allEvidence.length > 0;

    baselineResult = {
      driftType,
      hasMatch: hasDrift,
      matchCount: allEvidence.length,
      evidence: allEvidence.slice(0, 5),
      comparisonDetails: {
        prArtifacts: [...prCommands, ...prConfigKeys, ...prEndpoints].slice(0, 10),
        docArtifacts: [...docCommands, ...docConfigKeys, ...docEndpoints].slice(0, 10),
        conflicts,
        newContent, // NEW: Track new content separately
        recommendation: conflicts.length > 0 ? 'replace_steps' : (newContent.length > 0 ? 'add_section' : 'add_note'),
      },
    };
    console.log(`[Transitions] Instruction drift comparison: ${conflicts.length} conflicts, ${newContent.length} new items, PR artifacts=${prCommands.length + prConfigKeys.length + prEndpoints.length}, Doc artifacts=${docCommands.length + docConfigKeys.length + docEndpoints.length}`);
  }

  // ==========================================================================
  // B) PROCESS DRIFT - Per spec Section 3.2 with PR signal comparison
  // ==========================================================================
  else if (driftType === 'process') {
    // Get section IDs from DocContext if available
    const sectionIds = docContext?.extracted_sections?.map((s: { section_id: string }) => s.section_id) || [];

    const processResult = checkProcessBaselineDetailed(
      docContent,
      {
        prTitle: extracted.prTitle || prData.title || undefined,
        prDescription: extracted.prBody || prData.body || undefined,
        diffExcerpt: extracted.diff || prData.diff || undefined,
        changedFiles: extracted.changedFiles || prData.changed_files || undefined,
      },
      sectionIds
    );

    baselineResult = {
      driftType,
      hasMatch: processResult.detected,
      matchCount: processResult.findings.length,
      evidence: processResult.findings.slice(0, 5).map(f => f.doc_snippet),
      processResult: {
        detected: processResult.detected,
        confidence_suggestion: processResult.confidence_suggestion,
        mismatch_type: processResult.mismatch_type,
        affected_section_ids: processResult.affected_section_ids,
        findings: processResult.findings,
        doc_flow: processResult.doc_flow,
        pr_flow: processResult.pr_flow,
        recommended_patch_style: processResult.recommended_patch_style,
        recommended_action: processResult.recommended_action,
        rationale: processResult.rationale,
      },
    };
    console.log(`[Transitions] Process baseline (detailed): detected=${processResult.detected}, mismatch_type=${processResult.mismatch_type}, findings=${processResult.findings.length}, pr_signals=${processResult.pr_flow.length}`);
  }

  // ==========================================================================
  // C) OWNERSHIP DRIFT - Gap 4: Use resolveOwner() for authoritative source
  // ==========================================================================
  else if (driftType === 'ownership') {
    // Resolve authoritative owner using proper ownership resolver
    const service = drift.service || signal?.service || null;
    const repo = drift.repo || signal?.repo || extracted.repo || null;

    const ownerResolution = await resolveOwner(drift.workspaceId, service, repo);
    const authoritativeOwner = ownerResolution.primary?.ref || ownerResolution.fallback?.ref || null;
    const ownerSource = ownerResolution.primary?.source || ownerResolution.fallback?.source || 'unknown';

    // Extract owner refs from doc
    const docOwnerRefs = baselineAnchors.owner_refs;

    // Check if doc owner matches authoritative owner
    let ownerMismatch = false;
    const mismatches: string[] = [];

    if (authoritativeOwner && docOwnerRefs.length > 0) {
      // Normalize for comparison
      const normalizedAuth = authoritativeOwner.toLowerCase().replace(/^[@#]/, '');
      const docOwnersNormalized = docOwnerRefs.map((o: string) => o.toLowerCase().replace(/^[@#]/, ''));

      // Check if any doc owner matches authoritative
      const hasMatch = docOwnersNormalized.some((docOwner: string) =>
        docOwner.includes(normalizedAuth) || normalizedAuth.includes(docOwner)
      );

      if (!hasMatch) {
        ownerMismatch = true;
        mismatches.push(`Doc owner(s): ${docOwnerRefs.join(', ')} ≠ Authoritative: ${authoritativeOwner} (source: ${ownerSource})`);
      }
    } else if (authoritativeOwner && docOwnerRefs.length === 0) {
      // Doc has no owner refs but we have an authoritative owner
      ownerMismatch = true;
      mismatches.push(`Doc missing owner, authoritative owner: ${authoritativeOwner} (source: ${ownerSource})`);
    }

    baselineResult = {
      driftType,
      hasMatch: ownerMismatch,
      matchCount: mismatches.length,
      evidence: mismatches,
      authoritativeOwner: {
        primary: authoritativeOwner,
        source: ownerSource,
      },
      comparisonDetails: {
        prArtifacts: [authoritativeOwner || 'unknown'],
        docArtifacts: docOwnerRefs,
        conflicts: mismatches,
        recommendation: ownerMismatch ? 'update_owner_block' : 'no_action',
      },
    };
    console.log(`[Transitions] Ownership drift comparison: mismatch=${ownerMismatch}, authoritative=${authoritativeOwner} (${ownerSource}), docOwners=${docOwnerRefs.join(', ')}`);
  }

  // ==========================================================================
  // D) COVERAGE DRIFT - Gap 5: Extract scenario keywords from PR
  // ==========================================================================
  else if (driftType === 'coverage') {
    // Extract scenario keywords from PR using dedicated function
    const prScenarios = extractScenarioKeywords(
      extracted.prTitle || prData.title || '',
      extracted.prBody || prData.body || null,
      extracted.diff || ''
    );

    // Get scenarios already covered in doc
    const docScenarios = baselineAnchors.coverage_keywords_present;

    // Find scenarios in PR that are NOT in doc
    const missingScenarios = prScenarios.filter(scenario => {
      const normalizedScenario = scenario.toLowerCase().replace(/[-_\s]/g, '');
      return !docScenarios.some((docScenario: string) => {
        const normalizedDoc = docScenario.toLowerCase().replace(/[-_\s]/g, '');
        return normalizedDoc.includes(normalizedScenario) || normalizedScenario.includes(normalizedDoc);
      });
    });

    const hasCoverageGap = missingScenarios.length > 0;

    baselineResult = {
      driftType,
      hasMatch: hasCoverageGap,
      matchCount: missingScenarios.length,
      evidence: missingScenarios.map(s => `PR introduces "${s}" scenario not documented`),
      comparisonDetails: {
        prArtifacts: prScenarios,
        docArtifacts: docScenarios,
        conflicts: missingScenarios,
        recommendation: hasCoverageGap ? 'add_section' : 'no_action',
      },
    };
    console.log(`[Transitions] Coverage drift comparison: gap=${hasCoverageGap}, prScenarios=[${prScenarios.join(', ')}], docScenarios=[${docScenarios.join(', ')}], missing=[${missingScenarios.join(', ')}]`);
  }

  // ==========================================================================
  // E) ENVIRONMENT DRIFT - Gap 6: Detect tool migration patterns
  // ==========================================================================
  else if (driftType === 'environment') {
    // Get changed files with status for migration detection
    const changedFilesWithStatus = (rawPayload.files || []).map((f: any) => ({
      filename: f.filename || '',
      status: f.status || 'modified',
    }));

    // Detect tool migrations from file changes
    const migrations = detectToolMigrations(changedFilesWithStatus);

    // Get tool mentions from doc
    const docTools = baselineAnchors.tool_mentions;

    // Find migrations where doc still references old tool
    const relevantMigrations: Array<{
      oldTool: string;
      newTool: string;
      confidence: number;
      docHasOldTool: boolean;
    }> = [];

    for (const migration of migrations) {
      // Check if doc mentions the old tool
      const docHasOldTool = docTools.some((tool: string) =>
        tool.toLowerCase().includes(migration.oldTool.toLowerCase().replace('_', ' ')) ||
        migration.oldTool.toLowerCase().includes(tool.toLowerCase())
      );

      if (docHasOldTool) {
        relevantMigrations.push({
          ...migration,
          docHasOldTool: true,
        });
      }
    }

    // Also check PR tool mentions vs doc tool mentions for simple replacements
    const prTools = evidencePack.extracted.tool_mentions;
    const toolConflicts: string[] = [];

    // Check if PR introduces new tools that doc doesn't mention
    for (const prTool of prTools) {
      const prToolNorm = prTool.toLowerCase();
      const docHasTool = docTools.some((t: string) => t.toLowerCase() === prToolNorm);

      if (!docHasTool && evidencePack.extracted.keywords.some(k =>
        ['migrate', 'replace', 'switch', 'upgrade'].includes(k)
      )) {
        toolConflicts.push(`PR introduces ${prTool} (migration/replacement detected)`);
      }
    }

    const hasEnvironmentDrift = relevantMigrations.length > 0 || toolConflicts.length > 0;
    const bestMigration = relevantMigrations[0];

    baselineResult = {
      driftType,
      hasMatch: hasEnvironmentDrift,
      matchCount: relevantMigrations.length + toolConflicts.length,
      evidence: [
        ...relevantMigrations.map(m => `Tool migration: ${m.oldTool} → ${m.newTool} (confidence: ${(m.confidence * 100).toFixed(0)}%, doc references old tool)`),
        ...toolConflicts,
      ].slice(0, 5),
      toolMigration: bestMigration ? {
        oldTool: bestMigration.oldTool,
        newTool: bestMigration.newTool,
        confidence: bestMigration.confidence,
      } : undefined,
      comparisonDetails: {
        prArtifacts: prTools,
        docArtifacts: docTools,
        conflicts: relevantMigrations.map(m => `${m.oldTool} → ${m.newTool}`),
        recommendation: relevantMigrations.some(m => m.confidence > 0.7) ? 'replace_steps' : 'add_note',
      },
    };
    console.log(`[Transitions] Environment drift comparison: drift=${hasEnvironmentDrift}, migrations=${relevantMigrations.length}, prTools=[${prTools.join(', ')}], docTools=[${docTools.join(', ')}]`);
  }

  // Store baseline check results in baselineFindings along with evidencePack
  const updatedFindings = [{
    ...finding,
    baselineCheck: baselineResult,
    evidencePack: {
      extracted: evidencePack.extracted,
      rule_hits: evidencePack.rule_hits,
    },
  }] as unknown as import('@prisma/client').Prisma.InputJsonValue;

  // PHASE 1 QUICK WIN: Compute explicit drift verdict from comparison results
  const driftVerdict: DriftVerdict = {
    hasMatch: baselineResult.hasMatch,
    confidence: computeComparisonConfidence(baselineResult),
    source: 'comparison',
    evidence: baselineResult.evidence || [],
    comparisonType: baselineResult.driftType || driftType,
    timestamp: new Date().toISOString(),
  };

  console.log(`[Transitions] PHASE 1 - Drift Verdict: hasMatch=${driftVerdict.hasMatch}, confidence=${driftVerdict.confidence}, source=${driftVerdict.source}`);

  await prisma.driftCandidate.update({
    where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
    data: {
      baselineFindings: updatedFindings,
      driftVerdict: driftVerdict as unknown as Prisma.InputJsonValue,
    },
  });

  // PHASE 1 QUICK WIN: MANDATORY comparison gate (no confidence condition)
  // If comparison found NO drift, skip patch generation (comparison is primary verdict)
  if (!driftVerdict.hasMatch) {
    console.log(`[Transitions] PHASE 1 - MANDATORY GATE: Comparison found no drift (hasMatch=false), skipping patch generation`);
    console.log(`[Transitions] Evidence checked: ${baselineResult.evidence?.length || 0} items, matchCount=${baselineResult.matchCount}`);
    return { state: DriftState.COMPLETED, enqueueNext: false };
  }

  // If comparison confidence is very low, also skip (ambiguous comparison)
  if (driftVerdict.confidence < 0.3) {
    console.log(`[Transitions] PHASE 1 - MANDATORY GATE: Comparison confidence too low (${driftVerdict.confidence}), skipping patch generation`);
    return { state: DriftState.COMPLETED, enqueueNext: false };
  }

  console.log(`[Transitions] PHASE 1 - Baseline check PASSED: hasMatch=${driftVerdict.hasMatch}, confidence=${driftVerdict.confidence}, proceeding to patch planning`);
  return { state: DriftState.BASELINE_CHECKED, enqueueNext: true };
}

/**
 * Helper: Compute comparison confidence from baseline result
 * Higher matchCount = higher confidence
 */
function computeComparisonConfidence(baselineResult: any): number {
  if (!baselineResult.hasMatch) {
    return 0.0; // No drift detected
  }

  const matchCount = baselineResult.matchCount || 0;

  // Confidence based on number of matches
  if (matchCount >= 5) return 0.95;
  if (matchCount >= 3) return 0.85;
  if (matchCount >= 2) return 0.75;
  if (matchCount >= 1) return 0.65;

  return 0.5; // Has match but low count
}

/**
 * BASELINE_CHECKED -> PATCH_PLANNED
 * Plan the patch using Agent C (Patch Planner)
 * Point 4: Section Targeting - Target specific sections based on doc system and drift type
 */
async function handleBaselineChecked(drift: any): Promise<TransitionResult> {
  // Get doc content and DocContext from baselineFindings
  const findings = drift.baselineFindings || [];
  const finding = findings[0] || {};
  const llmPayload = finding.llmPayload;
  const docContext = finding.docContext;
  const docCandidates = drift.docCandidates || [];
  const primaryDoc = docCandidates[0] || {};

  const signal = drift.signalEvent;
  const rawPayload = signal?.rawPayload || {};
  const prData = rawPayload.pull_request || {};
  const extracted = signal?.extracted || {};

  // Point 4: Get target section patterns for this doc system and drift type
  const { getSectionPatterns } = await import('../../config/docTargeting.js');
  const docSystem = finding.docSystem || 'confluence';
  const driftType = drift.driftType || 'instruction';
  const sectionPatterns = getSectionPatterns(docSystem, driftType);

  // Store the primary section pattern for downstream use
  const primarySectionPattern = sectionPatterns[0]?.heading || null;
  if (primarySectionPattern) {
    await prisma.driftCandidate.update({
      where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
      data: { sectionPattern: primarySectionPattern },
    });
    console.log(`[Transitions] Point 4 - Section targeting: docSystem=${docSystem}, driftType=${driftType}, targetSection=${primarySectionPattern}`);
  }

  // Build doc content for planner - use DocContext if available
  let docContentForPlanner: string;
  if (llmPayload) {
    // Use bounded LLM payload from DocContext
    docContentForPlanner = JSON.stringify({
      outline: llmPayload.outline,
      managedRegion: llmPayload.managedRegionText,
      sections: llmPayload.extractedSections,
      flags: llmPayload.flags,
      targetSectionPatterns: sectionPatterns.map(p => p.heading), // Point 4: Include section patterns
    }, null, 2);
    console.log(`[Transitions] Using DocContext for patch planning (${llmPayload.extractedSections?.length || 0} sections)`);
  } else {
    // Fallback to raw content (legacy)
    docContentForPlanner = (finding.docContent || '').substring(0, 15000);
    console.log(`[Transitions] Using raw doc content for patch planning (fallback)`);
  }

  // FIX GAP A: Get baseline comparison results and evidence pack from findings
  const baselineCheck = finding.baselineCheck;
  const evidencePack = finding.evidencePack;

  // NEW: Phase 1 - Build EvidenceBundle for deterministic decision making
  // Phase 3 Week 7: Added Redis caching for performance
  try {
    const { buildEvidenceBundle } = await import('../evidence/builder.js');
    const { cacheEvidence } = await import('../cache/evidenceCache.js');

    const evidenceBundleResult = await buildEvidenceBundle({
      driftCandidate: drift,
      signalEvent: signal,
      docContext: docContext || finding,
      parserArtifacts: {
        // Use existing extracted data as parser artifacts
        openApiDiff: extracted.openApiDiff,
        codeownersDiff: extracted.codeownersDiff,
        iacSummary: extracted.iacSummary,
        pagerdutyNormalized: extracted.pagerdutyNormalized,
        slackCluster: extracted.slackCluster,
        alertNormalized: extracted.alertNormalized,
      }
    });

    if (evidenceBundleResult.success && evidenceBundleResult.bundle) {
      const bundle = evidenceBundleResult.bundle;

      // Store evidence bundle and impact assessment in database
      await prisma.driftCandidate.update({
        where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
        data: {
          evidenceBundle: bundle as any,
          impactScore: bundle.assessment.impactScore,
          impactBand: bundle.assessment.impactBand,
          impactJson: bundle.assessment as any,
          consequenceText: bundle.assessment.consequenceText,
          impactAssessedAt: new Date(),
          fingerprintStrict: bundle.fingerprints.strict,
          fingerprintMedium: bundle.fingerprints.medium,
          fingerprintBroad: bundle.fingerprints.broad,
        },
      });

      // Cache evidence bundle for 24 hours (Phase 3 Week 7)
      await cacheEvidence(drift.workspaceId, drift.id, bundle);

      // Phase 4 Week 8: Log evidence bundle creation to audit trail
      const { logEvidenceCreated } = await import('../audit/logger.js');
      await logEvidenceCreated(
        drift.workspaceId,
        drift.id,
        bundle.fingerprints.strict,
        bundle.assessment.impactBand,
        {
          impactScore: bundle.assessment.impactScore,
          claimsCount: bundle.targetEvidence.claims.length,
          firedRulesCount: bundle.assessment.firedRules.length,
        }
      );

      console.log(`[Transitions] EvidenceBundle created: impact=${bundle.assessment.impactBand} (${bundle.assessment.impactScore.toFixed(3)}), claims=${bundle.targetEvidence.claims.length}`);

      // Check for suppressions using fingerprints
      const suppressionCheck = await checkSuppressions(drift.workspaceId, bundle.fingerprints);
      if (suppressionCheck.shouldSuppress) {
        console.log(`[Transitions] Drift suppressed by ${suppressionCheck.level} fingerprint: ${suppressionCheck.reason}`);

        // Update suppression last seen
        if (suppressionCheck.fingerprint) {
          await updateSuppressionLastSeen(drift.workspaceId, suppressionCheck.fingerprint);
        }

        // Transition to SUPPRESSED state
        return { state: DriftState.SUPPRESSED, enqueueNext: false };
      }
    } else {
      console.warn(`[Transitions] EvidenceBundle creation failed: ${evidenceBundleResult.error?.message}`);
      // Continue with existing flow if evidence bundle creation fails
    }
  } catch (error: any) {
    console.error(`[Transitions] Error creating EvidenceBundle:`, error);
    // Continue with existing flow if there's an error
  }

  // Call Agent C: Patch Planner
  const plannerResult = await runPatchPlanner({
    docId: primaryDoc.doc_id || primaryDoc.docId || 'unknown',
    docTitle: primaryDoc.title || llmPayload?.docTitle || 'Unknown Document',
    docContent: docContentForPlanner,
    impactedDomains: drift.driftDomains || [],
    prTitle: extracted.prTitle || prData.title || '',
    prDescription: extracted.prBody || prData.body || '',
    diffExcerpt: (rawPayload.diff || '').substring(0, 4000),
    // Pass DocContext info for planner to use
    docContext: docContext ? {
      allowedEditRanges: docContext.allowedEditRanges,
      managedRegionMissing: docContext.flags?.managedRegionMissing,
    } : undefined,
    // FIX GAP A: Pass baseline comparison results and evidence pack
    baselineCheck: baselineCheck || undefined,
    evidencePack: evidencePack || undefined,
  });

  if (!plannerResult.success || !plannerResult.data) {
    console.log(`[Transitions] Patch planning failed: ${plannerResult.error}`);
    // Use drift matrix to select default patch style
    const defaultStyle = selectPatchStyle(drift.driftType || 'instruction', 'github', drift.confidence || 0.5);
    // Store default plan in baselineFindings
    const updatedFindings = findings.length > 0
      ? [{ ...findings[0], patchPlan: { targets: [], constraints: [], style: defaultStyle, needs_human: true } }]
      : [{ patchPlan: { targets: [], constraints: [], style: defaultStyle, needs_human: true } }];
    await prisma.driftCandidate.update({
      where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
      data: {
        baselineFindings: updatedFindings,
      },
    });
    return { state: DriftState.PATCH_PLANNED, enqueueNext: true };
  }

  const plan = plannerResult.data;
  console.log(`[Transitions] Patch planned: ${plan.targets?.length || 0} targets`);

  // Store patch plan in baselineFindings (existing JSON field)
  const updatedFindings = findings.length > 0
    ? [{ ...findings[0], patchPlan: plan }]
    : [{ patchPlan: plan }];

  await prisma.driftCandidate.update({
    where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
    data: {
      baselineFindings: updatedFindings,
    },
  });

  return { state: DriftState.PATCH_PLANNED, enqueueNext: true };
}

/**
 * PATCH_PLANNED -> PATCH_GENERATED
 * Generate the actual patch using Agent D (Patch Generator)
 * Point 6: Patch Styles - Use output-specific patch styles
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

  // Get patch plan and DocContext from baselineFindings
  const findings = drift.baselineFindings || [];
  const finding = findings[0] || {};
  const patchPlan = finding.patchPlan || {};
  const llmPayload = finding.llmPayload;
  const docContext = finding.docContext;
  const primaryDoc = docCandidates[0];

  // Point 6: Select patch style based on output doc system and drift type
  const { getPatchStyle } = await import('../../config/patchStyles.js');
  const targetDocSystems = drift.targetDocSystems || [];
  const primaryDocSystem = targetDocSystems[0] || finding.docSystem || 'confluence';
  const driftType = drift.driftType || 'instruction';
  const confidence = drift.confidence || 0.5;

  const patchStyle = getPatchStyle(primaryDocSystem, driftType, confidence);

  await prisma.driftCandidate.update({
    where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
    data: { patchStyle },
  });
  console.log(`[Transitions] Point 6 - Patch style selected: docSystem=${primaryDocSystem}, driftType=${driftType}, style=${patchStyle}`);

  // Build doc content for generator - use DocContext if available
  let docContentForGenerator: string;
  if (llmPayload) {
    // Use bounded LLM payload from DocContext
    docContentForGenerator = JSON.stringify({
      outline: llmPayload.outline,
      managedRegion: llmPayload.managedRegionText,
      sections: llmPayload.extractedSections,
      allowedEditRanges: llmPayload.allowedEditRanges,
      flags: llmPayload.flags,
    }, null, 2);
    console.log(`[Transitions] Using DocContext for patch generation`);
  } else {
    // Fallback to raw content (legacy)
    docContentForGenerator = (finding.docContent || '').substring(0, 15000);
    console.log(`[Transitions] Using raw doc content for patch generation (fallback)`);
  }

  // FIX GAP A: Get baseline comparison results and evidence pack from findings
  const baselineCheck = finding.baselineCheck;
  const evidencePack = finding.evidencePack;

  // Call Agent D: Patch Generator with correct input shape
  const generatorResult = await runPatchGenerator({
    docId: primaryDoc.doc_id || primaryDoc.docId || 'unknown',
    docTitle: primaryDoc.title || llmPayload?.docTitle || 'Unknown Document',
    docContent: docContentForGenerator,
    patchPlan: patchPlan.targets ? patchPlan : { targets: [], constraints: [], needs_human: true },
    prId: `${signal?.repo || 'unknown'}#${extracted.prNumber || prData.number || '0'}`,
    prTitle: extracted.prTitle || prData.title || 'PR',
    prDescription: extracted.prBody || prData.body || '',
    changedFiles: (extracted.changedFiles || []).map((f: any) => f.filename || f),
    diffExcerpt: (rawPayload.diff || '').substring(0, 4000),
    // Pass DocContext info for generator to respect edit boundaries
    docContext: docContext ? {
      allowedEditRanges: docContext.allowedEditRanges,
      managedRegionMissing: docContext.flags?.managedRegionMissing,
    } : undefined,
    // FIX GAP A: Pass baseline comparison results and evidence pack
    baselineCheck: baselineCheck || undefined,
    evidencePack: evidencePack || undefined,
  });

  let unifiedDiff: string;
  let summary: string;

  if (generatorResult.success && generatorResult.data) {
    unifiedDiff = generatorResult.data.unified_diff;
    summary = generatorResult.data.summary;
    console.log(`[Transitions] Patch generated: ${summary}`);
  } else {
    // Fallback to simple note patch
    const prTitle = extracted.prTitle || prData.title || 'PR';
    unifiedDiff = `--- a/doc\n+++ b/doc\n@@ -1,0 +1,5 @@\n+<!-- NOTE: This document may need updating due to recent code changes -->\n+<!-- PR: ${prTitle} -->\n+<!-- Evidence: ${drift.evidenceSummary || 'Code changes detected'} -->\n+<!-- Generated by VertaAI Drift Agent -->\n+`;
    summary = `Auto-generated note for PR: ${prTitle}`;
    console.log(`[Transitions] Using fallback patch: ${generatorResult.error}`);
  }

  // Create PatchProposal record
  await prisma.patchProposal.create({
    data: {
      workspaceId: drift.workspaceId,
      driftId: drift.id,
      docSystem: primaryDoc.system || 'confluence',
      docId: primaryDoc.doc_id || primaryDoc.docId || 'unknown',
      docTitle: primaryDoc.title || 'Unknown Document',
      patchStyle,
      unifiedDiff,
      sourcesUsed: [{ type: 'pr', ref: extracted.prTitle || prData.title || 'PR' }],
      confidence: drift.confidence || 0.5,
      summary,
    },
  });

  console.log(`[Transitions] Created patch proposal for drift ${drift.id}`);
  return { state: DriftState.PATCH_GENERATED, enqueueNext: true };
}

/**
 * PATCH_GENERATED -> PATCH_VALIDATED
 * Validate the generated patch using all 14 validators
 * Point 5: Scoring Weights - Apply source-specific confidence weights
 */
async function handlePatchGenerated(drift: any): Promise<TransitionResult> {
  // Get the patch proposal
  const patchProposal = await prisma.patchProposal.findFirst({
    where: { workspaceId: drift.workspaceId, driftId: drift.id },
    orderBy: { createdAt: 'desc' },
  });

  if (!patchProposal) {
    return {
      state: DriftState.FAILED,
      enqueueNext: false,
      error: { code: FailureCode.PATCH_VALIDATION_FAILED, message: 'No patch proposal found' },
    };
  }

  // Point 5: Apply source-specific confidence weight
  const { getSourceConfidenceWeight } = await import('../../config/scoringWeights.js');
  const signal = drift.signalEvent;
  const sourceType = drift.sourceType || signal?.sourceType || 'github_pr';
  const extracted = signal?.extracted || {};

  // Determine evidence quality for weight calculation
  const evidenceQuality = extracted.merged ? 'pr_explicit_change' :
                         extracted.hasNotes ? 'incident_postmortem' :
                         'pr_inferred_change';

  const confidenceWeight = getSourceConfidenceWeight(sourceType, evidenceQuality);
  const baseConfidence = drift.confidence || 0.5;
  const weightedConfidence = Math.min(1.0, baseConfidence * confidenceWeight);

  // Store weighted confidence
  await prisma.driftCandidate.update({
    where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
    data: {
      sourceConfidenceWeight: confidenceWeight,
      confidence: weightedConfidence, // Update with weighted confidence
    },
  });

  console.log(`[Transitions] Point 5 - Confidence weighting: source=${sourceType}, quality=${evidenceQuality}, weight=${confidenceWeight}, base=${baseConfidence.toFixed(2)}, weighted=${weightedConfidence.toFixed(2)}`);

  // Get doc content from baselineFindings
  const findings = drift.baselineFindings || [];
  const docContent = findings[0]?.docContent || '';
  const docRevision = findings[0]?.docRevision || null;

  // FIX GAP B: Use structured evidence from evidencePack instead of LLM summary
  const evidencePack = findings[0]?.evidencePack;
  let structuredEvidence: string[] = [];

  if (evidencePack?.extracted) {
    // Build evidence array from structured extraction
    structuredEvidence = [
      ...evidencePack.extracted.commands,
      ...evidencePack.extracted.config_keys,
      ...evidencePack.extracted.endpoints,
      ...evidencePack.extracted.tool_mentions,
      ...evidencePack.extracted.keywords,
    ];
    console.log(`[Transitions] GAP B FIX - Using structured evidence: ${structuredEvidence.length} items from evidencePack`);
  } else {
    // Fallback to LLM summary if evidencePack not available
    structuredEvidence = [drift.evidenceSummary || ''];
    console.log(`[Transitions] GAP B FIX - Fallback to LLM evidence summary (evidencePack not available)`);
  }

  // FIX GAP B: Get PR data for hard evidence binding validator (F3)
  const rawPayload = signal?.rawPayload || {};
  const prData = rawPayload.pull_request || {};
  const changedFilesRaw = extracted.changedFiles || prData.changed_files || [];
  const changedFiles: string[] = Array.isArray(changedFilesRaw)
    ? changedFilesRaw.map((f: any) => typeof f === 'string' ? f : f.filename || '')
    : [];

  // FIX GAP B: Auto-approve threshold (default 0.85 per F3)
  // TODO: Make this configurable per workspace in future
  const autoApproveThreshold = 0.85;

  // Build validator context
  const validatorCtx = {
    workspaceId: drift.workspaceId,
    driftId: drift.id,
    docId: patchProposal.docId,
    service: drift.service || null,
    driftType: drift.driftType || 'instruction',
    patchStyle: patchProposal.patchStyle,
    originalMarkdown: docContent,
    patchedMarkdown: applyPatchToDoc(docContent, patchProposal.unifiedDiff),
    diff: patchProposal.unifiedDiff,
    evidence: structuredEvidence, // FIX GAP B: Use structured evidence
    confidence: weightedConfidence, // Point 5: Use weighted confidence
    expectedRevision: docRevision,
    // FIX GAP B: Add prData and autoApproveThreshold for hard evidence binding (F3)
    autoApproveThreshold,
    prData: {
      changedFiles,
      diff: extracted.diff || rawPayload.diff || '',
      title: extracted.prTitle || prData.title || '',
      body: extracted.prBody || prData.body || '',
    },
  };

  // Point 3: Run output-specific validators first
  const { validatePatchForOutput } = await import('../../config/outputValidators.js');
  const targetDocSystems = drift.targetDocSystems || [];
  // Use the ACTUAL doc system from baselineFindings (the doc being patched),
  // not the theoretical target list (which may prioritize github_readme over confluence)
  const primaryDocSystem = findings[0]?.docSystem || targetDocSystems[0] || 'confluence';

  const outputValidationResult = validatePatchForOutput(
    primaryDocSystem,
    validatorCtx.patchedMarkdown,
    drift.driftType || 'instruction'
  );

  if (!outputValidationResult.valid) {
    console.log(`[Transitions] Point 3 - Output validation failed for ${primaryDocSystem}: ${outputValidationResult.errors.join(', ')}`);
    return {
      state: DriftState.FAILED,
      enqueueNext: false,
      error: {
        code: FailureCode.PATCH_VALIDATION_FAILED,
        message: `Output validation failed: ${outputValidationResult.errors.join('; ')}`,
      },
    };
  }

  console.log(`[Transitions] Point 3 - Output validation passed for ${primaryDocSystem}`);

  // Run all 14 validators
  const validationResult = await runAllValidators(validatorCtx);

  if (!validationResult.valid) {
    console.log(`[Transitions] Patch validation failed: ${validationResult.errors.join(', ')}`);
    return {
      state: DriftState.FAILED,
      enqueueNext: false,
      error: {
        code: FailureCode.PATCH_VALIDATION_FAILED,
        message: validationResult.errors.join('; '),
      },
    };
  }

  if (validationResult.warnings.length > 0) {
    console.log(`[Transitions] Patch validation warnings: ${validationResult.warnings.join(', ')}`);
  }

  console.log(`[Transitions] Patch validated successfully`);
  return { state: DriftState.PATCH_VALIDATED, enqueueNext: true };
}

/**
 * FIX C2: Proper unified diff application
 * Applies a unified diff to the original text, handling additions, deletions, and context lines.
 *
 * Unified diff format:
 * @@ -oldStart,oldCount +newStart,newCount @@
 * Lines starting with ' ' are context (unchanged)
 * Lines starting with '-' are deletions
 * Lines starting with '+' are additions
 */
function applyPatchToDoc(original: string, diff: string): string {
  const originalLines = original.split('\n');
  const diffLines = diff.split('\n');

  // Parse hunks from the diff
  const hunks: Array<{
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    lines: string[];
  }> = [];

  let currentHunk: typeof hunks[0] | null = null;

  for (const line of diffLines) {
    // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
    if (hunkMatch) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }
      currentHunk = {
        oldStart: parseInt(hunkMatch[1]!, 10),
        oldCount: hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1,
        newStart: parseInt(hunkMatch[3]!, 10),
        newCount: hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1,
        lines: [],
      };
      continue;
    }

    // Skip file headers (---, +++)
    if (line.startsWith('---') || line.startsWith('+++')) {
      continue;
    }

    // Add line to current hunk
    if (currentHunk) {
      currentHunk.lines.push(line);
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  // If no hunks found, return original (invalid diff or empty diff)
  if (hunks.length === 0) {
    console.warn('[applyPatchToDoc] No hunks found in diff, returning original');
    return original;
  }

  // Apply hunks in order
  let result = [...originalLines];
  let offset = 0; // Track line number offset as we add/remove lines

  for (const hunk of hunks) {
    const targetLine = hunk.oldStart - 1 + offset; // Convert to 0-based index
    let oldLineIdx = 0;
    let newLines: string[] = [];

    for (const line of hunk.lines) {
      if (line.startsWith(' ')) {
        // Context line - keep it
        newLines.push(line.substring(1));
        oldLineIdx++;
      } else if (line.startsWith('-')) {
        // Deletion - skip this line from original
        oldLineIdx++;
      } else if (line.startsWith('+')) {
        // Addition - add this line to result
        newLines.push(line.substring(1));
      }
      // Ignore other lines (shouldn't happen in valid diff)
    }

    // Replace the old lines with new lines
    const deleteCount = hunk.oldCount;
    result.splice(targetLine, deleteCount, ...newLines);

    // Update offset for next hunk
    offset += newLines.length - deleteCount;
  }

  return result.join('\n');
}

/**
 * PATCH_VALIDATED -> OWNER_RESOLVED
 * Phase 4: Resolve doc owner using configurable ownership ranking
 * Point 7: Pre-Validators - Run source-specific pre-validation checks
 */
async function handlePatchValidated(drift: any): Promise<TransitionResult> {
  const signal = drift.signalEvent;

  // Point 7: Run pre-validation checks for this source type
  const { runPreValidation } = await import('../../config/outputValidators.js');
  const sourceType = drift.sourceType || signal?.sourceType || 'github_pr';
  const extracted = signal?.extracted || {};

  // Build changedFiles array from extracted data (may be array of objects or strings)
  const rawChangedFiles = extracted.changedFiles || [];
  const changedFiles = Array.isArray(rawChangedFiles)
    ? rawChangedFiles.map((f: any) => typeof f === 'string' ? { filename: f } : { filename: f.filename || '' })
    : [];
  // Compute totalChanges from changedFiles if not directly available
  const totalChanges = extracted.totalChanges ?? (Array.isArray(rawChangedFiles)
    ? rawChangedFiles.reduce((sum: number, f: any) => sum + (f.additions || 0) + (f.deletions || 0), 0)
    : 0);

  const preValidationResult = runPreValidation(sourceType, {
    merged: extracted.merged,
    hasNotes: (extracted.notes?.length || 0) > 0,
    hasEvidence: !!drift.evidenceSummary,
    confidence: drift.confidence || 0.5,
    changedFiles,
    totalChanges,
    // PagerDuty fields
    status: extracted.status,
    service: extracted.service || drift.service,
    durationMinutes: extracted.durationMinutes,
    // Slack cluster fields
    clusterSize: extracted.clusterSize,
    uniqueAskers: extracted.uniqueAskers,
    questions: extracted.questions,
    // Datadog fields
    monitorName: extracted.monitorName,
    severity: extracted.severity,
  });

  if (!preValidationResult.valid) {
    const errorMessages = preValidationResult.errors?.join('; ') || 'Unknown error';
    console.log(`[Transitions] Point 7 - Pre-validation failed for ${sourceType}: ${errorMessages}`);
    await prisma.driftCandidate.update({
      where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
      data: { preValidationPassed: false },
    });
    return {
      state: DriftState.FAILED,
      enqueueNext: false,
      error: {
        code: FailureCode.PATCH_VALIDATION_FAILED,
        message: `Pre-validation failed: ${errorMessages}`,
      },
    };
  }

  await prisma.driftCandidate.update({
    where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
    data: { preValidationPassed: true },
  });
  console.log(`[Transitions] Point 7 - Pre-validation passed for ${sourceType}`);

  // Phase 4: Use ownership resolver with configurable ranking
  const resolution = await resolveOwner(
    drift.workspaceId,
    drift.service || signal?.service || null,
    drift.repo || signal?.repo || null
  );

  // Store owner resolution in drift candidate
  await prisma.driftCandidate.update({
    where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
    data: {
      ownerResolution: formatOwnerResolution(resolution),
    },
  });

  console.log(
    `[Transitions] Owner resolved: primary=${resolution.primary?.ref || 'none'}, ` +
    `fallback=${resolution.fallback?.ref || 'none'}, sources=${resolution.sources.length}`
  );

  return { state: DriftState.OWNER_RESOLVED, enqueueNext: true };
}

/**
 * OWNER_RESOLVED -> SLACK_SENT
 * Send Slack notification (with Phase 3 notification routing)
 * Point 8: Thresholds - Apply source-specific routing thresholds
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

  // Point 8: Apply source-specific thresholds
  const { getSourceThreshold } = await import('../../config/scoringWeights.js');
  const signal = drift.signalEvent;
  const sourceType = drift.sourceType || signal?.sourceType || 'github_pr';
  const threshold = getSourceThreshold(sourceType);
  const confidence = drift.confidence || 0.5;

  // Store threshold for reference
  await prisma.driftCandidate.update({
    where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
    data: { sourceThreshold: threshold.slackNotify },
  });

  console.log(`[Transitions] Point 8 - Threshold check: source=${sourceType}, confidence=${confidence.toFixed(2)}, slackThreshold=${threshold.slackNotify}, autoApproveThreshold=${threshold.autoApprove}`);

  // Check if confidence meets threshold for Slack notification
  if (confidence < threshold.slackNotify) {
    console.log(`[Transitions] Point 8 - Confidence ${confidence.toFixed(2)} below Slack threshold ${threshold.slackNotify}, completing without notification`);
    return { state: DriftState.COMPLETED, enqueueNext: false };
  }

  // Check if confidence meets auto-approve threshold
  if (confidence >= threshold.autoApprove) {
    console.log(`[Transitions] Point 8 - Confidence ${confidence.toFixed(2)} meets auto-approve threshold ${threshold.autoApprove}, auto-approving`);
    // Auto-approve and proceed to writeback
    return { state: DriftState.APPROVED, enqueueNext: true };
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

  // Phase 4: Get owner info from new format
  const ownerResolution = drift.ownerResolution || {};
  const primaryOwner = ownerResolution.primary || ownerResolution; // Backward compatible
  const fallbackOwner = ownerResolution.fallback;

  // Phase 3: Use notification routing policy
  const ownerSlackId = primaryOwner?.type === 'slack_user' ? primaryOwner.ref : null;
  const ownerChannel = primaryOwner?.type === 'slack_channel' ? primaryOwner.ref :
                       (fallbackOwner?.type === 'slack_channel' ? fallbackOwner.ref : null);
  const notificationRoute = await determineNotificationRoute({
    workspaceId: drift.workspaceId,
    driftId: drift.id,
    confidence: confidence,
    riskLevel: drift.riskLevel as 'low' | 'medium' | 'high' | undefined,
    ownerSlackId,
    ownerChannel,
  });

  console.log(`[Transitions] Notification decision: ${notificationRoute.channel}, priority=${notificationRoute.priority}, reason=${notificationRoute.reason}`);

  if (!notificationRoute.shouldNotify) {
    // Low confidence - skip Slack, complete without notification
    console.log(`[Transitions] Skipping Slack notification: ${notificationRoute.reason}`);
    return { state: DriftState.COMPLETED, enqueueNext: false };
  }

  // FIX C1: Actually send to Slack using slack-client + runSlackComposer
  // Reuse 'signal' variable from above (already declared at line 1820)
  const rawPayload = signal?.rawPayload || {};
  const prData = rawPayload.pull_request || {};
  const extracted = signal?.extracted || {};

  // Determine target channel (DM or channel)
  // Fall back to channelId from Slack integration config, then workspace default
  const slackConfig = (slackIntegration.config || {}) as { channelId?: string };
  const targetChannel = notificationRoute.target || primaryOwner?.ref || ownerChannel || slackConfig.channelId || 'general';

  // Get owner name for display
  const ownerName = primaryOwner?.ref || 'Team';

  // Phase 4 Week 7: Try to use zero-LLM message builder from EvidenceBundle first
  // Phase 3 Week 7 Days 34-35: Check cache first for performance
  let slackMessage;

  // Try to get evidence bundle from cache first (faster)
  const { getCachedEvidence } = await import('../cache/evidenceCache.js');
  let evidenceBundle = await getCachedEvidence(drift.workspaceId, drift.id);

  // Fall back to database if not in cache
  if (!evidenceBundle) {
    evidenceBundle = drift.evidenceBundle;
    if (evidenceBundle) {
      console.log(`[Transitions] EvidenceBundle loaded from database (cache miss)`);
    }
  } else {
    console.log(`[Transitions] EvidenceBundle loaded from cache (cache hit)`);
  }

  if (evidenceBundle) {
    // Use zero-LLM message builder (deterministic, no LLM calls)
    const { buildSlackMessageFromEvidence } = await import('../evidence/slackMessageBuilder.js');
    slackMessage = buildSlackMessageFromEvidence(
      evidenceBundle as any,
      patchProposal.id,
      targetChannel,
      ownerName
    );
    console.log(`[Transitions] Slack message built from EvidenceBundle (zero-LLM)`);
  } else {
    // Fallback to LLM-based composer if no evidence bundle
    console.log(`[Transitions] No EvidenceBundle found, falling back to LLM composer`);

    const sourcesUsed = Array.isArray(patchProposal.sourcesUsed)
      ? (patchProposal.sourcesUsed as Array<{ type: string; ref: string }>)
      : [];
    const slackInput = {
      patch: {
        doc_id: patchProposal.docId,
        unified_diff: patchProposal.unifiedDiff,
        summary: patchProposal.summary || 'Documentation update needed',
        confidence: drift.confidence || 0.5,
        sources_used: sourcesUsed,
        needs_human: true,
        safety: {
          secrets_redacted: true,
          risky_change_avoided: false,
        },
      },
      patchId: patchProposal.id,
      doc: {
        title: patchProposal.docTitle,
        docId: patchProposal.docId,
      },
      owner: {
        slackId: targetChannel,
        name: ownerName,
      },
      pr: {
        id: extracted.prNumber || prData.number || 'unknown',
        title: extracted.prTitle || prData.title || 'Code change',
        repo: drift.repo || signal?.repo || 'unknown',
      },
      maxDiffPreviewLines: 12,
    };

    // Try to compose message with Agent E (Slack Composer)
    const composerResult = await runSlackComposer(slackInput);

    if (composerResult.success && composerResult.data) {
      slackMessage = composerResult.data;
      console.log(`[Transitions] Slack message composed by Agent E (LLM)`);
    } else {
      // Fallback to simple message if Agent E fails
      const { buildFallbackSlackMessage } = await import('../../agents/slack-composer.js');
      slackMessage = buildFallbackSlackMessage(slackInput);
      console.log(`[Transitions] Using fallback Slack message: ${composerResult.error}`);
    }
  }

  // Send the message via Slack client
  const { sendSlackMessage } = await import('../slack-client.js');
  const sendResult = await sendSlackMessage(
    drift.workspaceId,
    targetChannel,
    slackMessage.text,
    slackMessage.blocks
  );

  if (!sendResult.ok) {
    console.error(`[Transitions] Failed to send Slack message: ${sendResult.error}`);
    return {
      state: DriftState.FAILED,
      enqueueNext: false,
      error: {
        code: FailureCode.SLACK_POST_DENIED,
        message: `Failed to send Slack message: ${sendResult.error}`,
      },
    };
  }

  // Store Slack message metadata in PatchProposal for button interactions
  await prisma.patchProposal.update({
    where: {
      workspaceId_id: {
        workspaceId: patchProposal.workspaceId,
        id: patchProposal.id,
      },
    },
    data: {
      slackChannel: sendResult.channel || targetChannel,
      slackTs: sendResult.ts,
    },
  });

  console.log(`[Transitions] Slack message sent: channel=${sendResult.channel}, ts=${sendResult.ts}`);
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
 * Validate doc revision before writeback
 */
async function handleApproved(drift: any): Promise<TransitionResult> {
  // Get the patch proposal
  const patchProposal = await prisma.patchProposal.findFirst({
    where: { workspaceId: drift.workspaceId, driftId: drift.id },
    orderBy: { createdAt: 'desc' },
  });

  if (!patchProposal) {
    return {
      state: DriftState.FAILED,
      enqueueNext: false,
      error: { code: FailureCode.PATCH_VALIDATION_FAILED, message: 'No patch proposal found' },
    };
  }

  // Get stored revision from baselineFindings
  const findings = drift.baselineFindings || [];
  const storedRevision = findings[0]?.docRevision;

  // Check doc revision hasn't changed since patch was generated
  const docMapping = await prisma.docMappingV2.findFirst({
    where: { workspaceId: drift.workspaceId, docId: patchProposal.docId },
  });

  // Use updatedAt as revision proxy since DocMappingV2 doesn't have docRevision
  if (docMapping && storedRevision) {
    const isNumericRevision = /^[0-9]+$/.test(storedRevision);
    if (isNumericRevision) {
      // Confluence-style numeric revision — can't compare against timestamp
      // Defer conflict detection to the actual writeback (adapter will check version)
      console.log(`[Transitions] Numeric revision (${storedRevision}) — conflict check deferred to writeback`);
    } else {
      const currentRevision = docMapping.updatedAt.toISOString();
      if (currentRevision !== storedRevision) {
        console.log(`[Transitions] Doc revision conflict: expected ${storedRevision}, found ${currentRevision}`);
        return {
          state: DriftState.FAILED,
          enqueueNext: false,
          error: {
            code: FailureCode.DOC_CONFLICT,
            message: 'Document has been modified since patch was generated',
          },
        };
      }
    }
  }

  return { state: DriftState.WRITEBACK_VALIDATED, enqueueNext: true };
}

/**
 * EDIT_REQUESTED -> PATCH_GENERATED
 * Re-generate with human edits using Agent H (Editor Helper)
 */
async function handleEditRequested(drift: any): Promise<TransitionResult> {
  // The human edit instruction should be stored in drift metadata (via Slack action)
  const editInstruction = (drift.baselineFindings?.[0]?.editInstruction) || '';

  if (!editInstruction) {
    // No edit instruction, just re-validate
    return { state: DriftState.PATCH_GENERATED, enqueueNext: true };
  }

  // Get current patch
  const patchProposal = await prisma.patchProposal.findFirst({
    where: { workspaceId: drift.workspaceId, driftId: drift.id },
    orderBy: { createdAt: 'desc' },
  });

  if (!patchProposal) {
    return { state: DriftState.PATCH_GENERATED, enqueueNext: true };
  }

  // Get doc content from baselineFindings
  const findings = drift.baselineFindings || [];
  const docContent = findings[0]?.docContent || '';

  // Import and call Agent H dynamically to avoid circular deps
  const { runEditorHelper, validateEditedDiff } = await import('../../agents/editor-helper.js');

  const editorResult = await runEditorHelper({
    currentText: docContent,
    currentPatch: patchProposal.unifiedDiff,
    userInstruction: editInstruction,
    constraints: {
      noNewSteps: true,
      noNewCommands: true,
      maxDiffLines: 120,
    },
  });

  if (editorResult.success && editorResult.data) {
    // Validate the edited diff doesn't expand scope
    const validation = validateEditedDiff(patchProposal.unifiedDiff, editorResult.data.unified_diff);

    if (validation.valid) {
      // Update patch proposal with edited diff using composite key
      await prisma.patchProposal.update({
        where: {
          workspaceId_id: {
            workspaceId: patchProposal.workspaceId,
            id: patchProposal.id
          }
        },
        data: {
          unifiedDiff: editorResult.data.unified_diff,
          summary: editorResult.data.summary,
        },
      });
      console.log(`[Transitions] Patch edited: ${editorResult.data.summary}`);
    } else {
      console.log(`[Transitions] Edit validation failed: ${validation.reason}`);
    }
  }

  return { state: DriftState.PATCH_GENERATED, enqueueNext: true };
}

/**
 * WRITEBACK_VALIDATED -> WRITTEN_BACK
 * Perform the actual writeback to Confluence/Notion
 */
async function handleWritebackValidated(drift: any): Promise<TransitionResult> {
  // Get the patch proposal
  const patchProposal = await prisma.patchProposal.findFirst({
    where: { workspaceId: drift.workspaceId, driftId: drift.id },
    orderBy: { createdAt: 'desc' },
  });

  if (!patchProposal) {
    return {
      state: DriftState.FAILED,
      enqueueNext: false,
      error: { code: FailureCode.WRITEBACK_FAILED, message: 'No patch proposal found' },
    };
  }

  // Get doc content and revision from baselineFindings
  const findings = drift.baselineFindings || [];
  const docContent = findings[0]?.docContent || '';
  const docRevision = findings[0]?.docRevision || '';

  const docSystem = (patchProposal.docSystem || 'confluence') as 'confluence' | 'notion' | 'github_readme' | 'github_swagger' | 'backstage';
  console.log(`[Transitions] Writing back to ${docSystem} doc: ${patchProposal.docId}`);

  try {
    // Use adapter registry for unified writeback (Phase 1 - Multi-Source)
    const { getAdapter } = await import('../docs/adapters/registry.js');
    const { isFeatureEnabled } = await import('../../config/featureFlags.js');

    // Apply patch to get new content
    const newContent = applyPatchToDoc(docContent, patchProposal.unifiedDiff);

    // Try to use adapter registry if enabled
    if (isFeatureEnabled('ENABLE_ADAPTER_REGISTRY', drift.workspaceId)) {
      const adapter = await getAdapter(drift.workspaceId, docSystem);

      if (adapter) {
        if (adapter.supportsDirectWriteback()) {
          await adapter.writePatch({
            doc: { docId: patchProposal.docId, docSystem },
            baseRevision: docRevision,
            newContent: newContent,
            summary: patchProposal.summary || 'Drift fix applied via VertaAI',
          });
        } else {
          // For GitHub-based docs, create a PR instead
          const { createPatchPR } = adapter as any;
          if (typeof createPatchPR === 'function') {
            const prResult = await createPatchPR({
              doc: { docId: patchProposal.docId, docSystem },
              newContent,
              title: `[VertaAI] ${patchProposal.summary || 'Documentation drift fix'}`,
              body: `This PR was automatically generated by VertaAI to fix documentation drift.\n\n**Summary:** ${patchProposal.summary || 'N/A'}`,
              baseBranch: 'main',
            });
            console.log(`[Transitions] Created PR for ${docSystem}: ${prResult.prUrl}`);
          } else {
            throw new Error(`Adapter for ${docSystem} does not support writeback`);
          }
        }
      } else {
        throw new Error(`No adapter available for ${docSystem}`);
      }
    } else {
      // Fallback: Legacy direct adapter usage
      if (docSystem === 'notion') {
        const { createNotionAdapter } = await import('../docs/adapters/notionAdapter.js');

        const notionIntegration = await prisma.integration.findFirst({
          where: { workspaceId: drift.workspaceId, type: 'notion', status: 'connected' },
        });

        const notionConfig = notionIntegration?.config as { accessToken?: string } | null;
        if (!notionConfig?.accessToken) {
          throw new Error('Notion integration not configured');
        }

        const adapter = createNotionAdapter(notionConfig.accessToken);
        await adapter.writePatch({
          doc: { docId: patchProposal.docId, docSystem: 'notion' },
          baseRevision: docRevision,
          newContent: newContent,
          summary: patchProposal.summary || 'Drift fix applied via VertaAI',
        });
      } else {
        // Confluence writeback (legacy)
        const { createConfluenceAdapter } = await import('../docs/adapters/confluenceAdapter.js');

        const confluenceIntegration = await prisma.integration.findFirst({
          where: { workspaceId: drift.workspaceId, type: 'confluence', status: 'connected' },
        });

        const confluenceConfig = confluenceIntegration?.config as { accessToken?: string } | null;
        if (!confluenceConfig?.accessToken) {
          throw new Error('Confluence integration not configured');
        }

        // Use Confluence adapter to write the patch
        const adapter = createConfluenceAdapter(drift.workspaceId);
        const writeResult = await adapter.writePatch({
          doc: { docId: patchProposal.docId, docSystem: 'confluence' },
          baseRevision: docRevision,
          newContent: newContent,
          summary: patchProposal.summary || 'Drift fix applied via VertaAI',
        });

        if (!writeResult.success) {
          console.error(`[Transitions] Confluence writeback failed: ${writeResult.error}`);
          throw new Error(`Confluence writeback failed: ${writeResult.error}`);
        }

        console.log(`[Transitions] Successfully wrote patch to Confluence doc ${patchProposal.docId}, new revision: ${writeResult.newRevision}`);
      }
    }

    // Update doc mapping with new revision
    await prisma.docMappingV2.updateMany({
      where: { workspaceId: drift.workspaceId, docId: patchProposal.docId },
      data: { updatedAt: new Date() },
    });

    console.log(`[Transitions] Writeback completed for drift ${drift.id}`);
    return { state: DriftState.WRITTEN_BACK, enqueueNext: true };
  } catch (error: any) {
    console.error(`[Transitions] Writeback failed:`, error);
    return {
      state: DriftState.FAILED,
      enqueueNext: false,
      error: { code: FailureCode.WRITEBACK_FAILED, message: error.message },
    };
  }
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

// NEW: Suppression checking functions for EvidenceBundle integration

/**
 * Check if drift should be suppressed based on fingerprints
 */
async function checkSuppressions(workspaceId: string, fingerprints: { strict: string; medium: string; broad: string }): Promise<{
  shouldSuppress: boolean;
  level?: 'strict' | 'medium' | 'broad';
  reason?: string;
  fingerprint?: string;
}> {
  try {
    // Check strict fingerprint first
    const strictSuppression = await prisma.driftSuppression.findFirst({
      where: {
        workspaceId,
        fingerprint: fingerprints.strict,
        fingerprintLevel: 'strict',
        OR: [
          { expiresAt: null }, // Permanent suppression
          { expiresAt: { gt: new Date() } } // Not expired
        ]
      }
    });

    if (strictSuppression) {
      return {
        shouldSuppress: true,
        level: 'strict',
        reason: strictSuppression.reason || 'Exact match suppression',
        fingerprint: fingerprints.strict
      };
    }

    // Check medium fingerprint
    const mediumSuppression = await prisma.driftSuppression.findFirst({
      where: {
        workspaceId,
        fingerprint: fingerprints.medium,
        fingerprintLevel: 'medium',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    });

    if (mediumSuppression) {
      return {
        shouldSuppress: true,
        level: 'medium',
        reason: mediumSuppression.reason || 'Normalized token suppression',
        fingerprint: fingerprints.medium
      };
    }

    // Check broad fingerprint
    const broadSuppression = await prisma.driftSuppression.findFirst({
      where: {
        workspaceId,
        fingerprint: fingerprints.broad,
        fingerprintLevel: 'broad',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    });

    if (broadSuppression) {
      return {
        shouldSuppress: true,
        level: 'broad',
        reason: broadSuppression.reason || 'Pattern-based suppression',
        fingerprint: fingerprints.broad
      };
    }

    return { shouldSuppress: false };
  } catch (error: any) {
    console.error('[Transitions] Error checking suppressions:', error);
    return { shouldSuppress: false };
  }
}

/**
 * Update last seen timestamp for suppression
 */
async function updateSuppressionLastSeen(workspaceId: string, fingerprint: string): Promise<void> {
  try {
    await prisma.driftSuppression.updateMany({
      where: {
        workspaceId,
        fingerprint
      },
      data: {
        lastSeenAt: new Date()
      }
    });
  } catch (error: any) {
    console.error('[Transitions] Error updating suppression last seen:', error);
  }
}
