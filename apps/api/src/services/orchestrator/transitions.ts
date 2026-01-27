// State Transition Orchestrator
// Based on Section 15.10.6 of the spec

import {
  DriftState,
  FailureCode,
  TransitionResult,
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
 * Phase 4: Correlate signals from multiple sources (GitHub + PagerDuty)
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
      },
    });

    console.log(
      `[Transitions] Signal correlation: ${correlationSummary}, ` +
      `boost=${joinResult.confidenceBoost}, reason=${joinResult.joinReason}`
    );
  }

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

  // Phase 3: Extract drift type and metadata
  const primaryDriftType = triageData.drift_types?.[0] || 'instruction';

  // Phase 4: Apply correlation boost to confidence
  const baseConfidence = triageData.confidence || 0;
  const correlationBoost = drift.correlationBoost || 0;
  const boostedConfidence = Math.min(1, baseConfidence + correlationBoost);

  // Update drift with triage results (fingerprint stored in DRIFT_CLASSIFIED after dedup check)
  await prisma.driftCandidate.update({
    where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
    data: {
      driftType: primaryDriftType,
      driftDomains: triageData.impacted_domains || [],
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
 * Fetch doc content from Confluence/Notion
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

  let docContent = '';
  let docRevision: string | null = null;

  if (docMapping) {
    // TODO: Fetch actual doc content from Confluence/Notion API
    // For now, use cached content from baselineFindings if available
    const currentFindings = drift.baselineFindings || [];
    if (currentFindings.length > 0 && currentFindings[0].docContent) {
      docContent = currentFindings[0].docContent;
    }
    // Use updatedAt as a revision proxy since we don't have docRevision field
    docRevision = docMapping.updatedAt.toISOString();
    console.log(`[Transitions] Fetched doc: system=${docMapping.docSystem}, revision=${docRevision}`);
  }

  // Store fetched content in baselineFindings (DocContext extraction happens in next state)
  const updatedFindings = [{
    docId,
    docContent,
    docRevision,
    fetchedAt: new Date().toISOString(),
    docSystem: docMapping?.docSystem || 'confluence',
    docUrl: docMapping?.docUrl || primaryDoc.doc_url || '',
    docTitle: docMapping?.docTitle || primaryDoc.doc_title || 'Unknown',
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
 * DOC_CONTEXT_EXTRACTED -> BASELINE_CHECKED
 * Check baseline patterns against doc content using EvidencePack vs BaselineAnchors comparison
 *
 * Per Spec - Comparison logic: drift-vs-Confluence baseline across 5 drift types
 * Core principle: Compare Evidence from PR vs Baseline from doc
 */
async function handleDocContextExtracted(drift: any): Promise<TransitionResult> {
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

    // Check for command conflicts (PR changed command, doc has old version)
    for (const prCmd of prCommands) {
      for (const docCmd of docCommands) {
        // Same base command but different arguments/flags
        const prBase = prCmd.split(' ')[0];
        const docBase = docCmd.split(' ')[0];
        if (prBase === docBase && prCmd !== docCmd) {
          conflicts.push(`Command conflict: PR="${prCmd}" vs Doc="${docCmd}"`);
        }
      }
    }

    // Check for config key changes
    for (const prKey of prConfigKeys) {
      for (const docKey of docConfigKeys) {
        // PR mentions a config key that exists in doc (potential update)
        if (prKey === docKey && prKeywords.some(k =>
          ['rename', 'deprecate', 'migrate', 'replace', 'change', 'update'].includes(k)
        )) {
          conflicts.push(`Config change detected: ${prKey}`);
        }
      }
    }

    // Check for endpoint changes
    for (const prEndpoint of prEndpoints) {
      for (const docEndpoint of docEndpoints) {
        // Same path prefix but different full path
        const prPath = prEndpoint.replace(/^https?:\/\/[^/]+/, '');
        const docPath = docEndpoint.replace(/^https?:\/\/[^/]+/, '');
        if (prPath.split('/').slice(0, 3).join('/') === docPath.split('/').slice(0, 3).join('/') && prPath !== docPath) {
          conflicts.push(`Endpoint change: ${docPath} → ${prPath}`);
        }
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

    baselineResult = {
      driftType,
      hasMatch: conflicts.length > 0 || (prCommands.length > 0 && docCommands.length > 0),
      matchCount: conflicts.length,
      evidence: conflicts.slice(0, 5),
      comparisonDetails: {
        prArtifacts: [...prCommands, ...prConfigKeys, ...prEndpoints].slice(0, 10),
        docArtifacts: [...docCommands, ...docConfigKeys, ...docEndpoints].slice(0, 10),
        conflicts,
        recommendation: conflicts.length > 0 ? 'replace_steps' : 'add_note',
      },
    };
    console.log(`[Transitions] Instruction drift comparison: ${conflicts.length} conflicts, PR artifacts=${prCommands.length + prConfigKeys.length + prEndpoints.length}, Doc artifacts=${docCommands.length + docConfigKeys.length + docEndpoints.length}`);
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

  await prisma.driftCandidate.update({
    where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
    data: {
      baselineFindings: updatedFindings,
    },
  });

  return { state: DriftState.BASELINE_CHECKED, enqueueNext: true };
}

/**
 * BASELINE_CHECKED -> PATCH_PLANNED
 * Plan the patch using Agent C (Patch Planner)
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

  // Build doc content for planner - use DocContext if available
  let docContentForPlanner: string;
  if (llmPayload) {
    // Use bounded LLM payload from DocContext
    docContentForPlanner = JSON.stringify({
      outline: llmPayload.outline,
      managedRegion: llmPayload.managedRegionText,
      sections: llmPayload.extractedSections,
      flags: llmPayload.flags,
    }, null, 2);
    console.log(`[Transitions] Using DocContext for patch planning (${llmPayload.extractedSections?.length || 0} sections)`);
  } else {
    // Fallback to raw content (legacy)
    docContentForPlanner = (finding.docContent || '').substring(0, 15000);
    console.log(`[Transitions] Using raw doc content for patch planning (fallback)`);
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

  // Select patch style from drift matrix
  const patchStyle = selectPatchStyle(
    drift.driftType || 'instruction',
    signal?.sourceType === 'pagerduty' ? 'pagerduty' : 'github',
    drift.confidence || 0.5
  );

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

  // Get doc content from baselineFindings
  const findings = drift.baselineFindings || [];
  const docContent = findings[0]?.docContent || '';
  const docRevision = findings[0]?.docRevision || null;

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
    evidence: [drift.evidenceSummary || ''],
    confidence: drift.confidence || 0.5,
    expectedRevision: docRevision,
  };

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
 * Simple patch application helper (for validation purposes)
 */
function applyPatchToDoc(original: string, diff: string): string {
  // For validation, we just need to estimate the patched content
  // A full diff application would be more complex
  const addedLines = diff.split('\n')
    .filter(l => l.startsWith('+') && !l.startsWith('+++'))
    .map(l => l.substring(1));

  if (addedLines.length > 0) {
    return original + '\n' + addedLines.join('\n');
  }
  return original;
}

/**
 * PATCH_VALIDATED -> OWNER_RESOLVED
 * Phase 4: Resolve doc owner using configurable ownership ranking
 */
async function handlePatchValidated(drift: any): Promise<TransitionResult> {
  const signal = drift.signalEvent;

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
    confidence: drift.confidence || 0.5,
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

  // TODO: Actually send to Slack using slack-client
  // For now, just log and transition
  console.log(`[Transitions] Would send Slack message for drift ${drift.id}`);
  console.log(`[Transitions] Target: ${notificationRoute.target || primaryOwner?.ref || 'default'}`);
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

  const docSystem = patchProposal.docSystem || 'confluence';
  console.log(`[Transitions] Writing back to ${docSystem} doc: ${patchProposal.docId}`);

  try {
    if (docSystem === 'notion') {
      // Use Notion adapter for writeback
      const { createNotionAdapter } = await import('../docs/adapters/notionAdapter.js');

      const notionIntegration = await prisma.integration.findFirst({
        where: { workspaceId: drift.workspaceId, type: 'notion', status: 'connected' },
      });

      // Access token is stored in config JSON field
      const notionConfig = notionIntegration?.config as { accessToken?: string } | null;
      if (!notionConfig?.accessToken) {
        throw new Error('Notion integration not configured');
      }

      const adapter = createNotionAdapter(notionConfig.accessToken);

      // Apply patch to get new content
      const newContent = applyPatchToDoc(docContent, patchProposal.unifiedDiff);

      await adapter.writePatch({
        doc: { docId: patchProposal.docId },
        baseRevision: docRevision,
        newMarkdown: newContent,
      });
    } else {
      // Confluence writeback
      const confluenceIntegration = await prisma.integration.findFirst({
        where: { workspaceId: drift.workspaceId, type: 'confluence', status: 'connected' },
      });

      // Access token is stored in config JSON field
      const confluenceConfig = confluenceIntegration?.config as { accessToken?: string } | null;
      if (!confluenceConfig?.accessToken) {
        throw new Error('Confluence integration not configured');
      }

      // TODO: Implement actual Confluence API writeback
      // For now, log the writeback intent
      console.log(`[Transitions] Would call Confluence API to update doc ${patchProposal.docId}`);
      console.log(`[Transitions] Patch diff: ${patchProposal.unifiedDiff.substring(0, 200)}...`);
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
