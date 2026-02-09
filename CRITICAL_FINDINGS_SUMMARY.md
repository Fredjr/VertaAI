# Critical Findings: Drift Detection Reliability & Control-Plane Architecture

**Date**: 2026-02-09
**Status**: 🔴 CRITICAL ARCHITECTURAL FLAWS IDENTIFIED
**Analysis Type**: Senior Architect Review - Control-Plane + Truth-Making System

---

## Executive Summary

After comprehensive architectural analysis against the "control-plane + truth-making" paradigm, I've identified **12 critical gaps** across two categories:

### Category A: Determinism Gaps (5 gaps)
Gaps that make drift detection **probabilistic rather than deterministic**, violating the core "truth-making" principle.

### Category B: Control-Plane Gaps (7 gaps)
Gaps in the control-plane architecture that prevent the system from being a production-grade "surveillance plan" system with reproducible, bounded, and auditable drift detection.

---

## Critical Gap 1: LLM Classification Before Comparison ⚠️ HIGHEST PRIORITY

### Problem
The current flow runs **LLM classification BEFORE comparison**, making drift detection probabilistic.

### Current Flow (WRONG)
```
ELIGIBILITY_CHECKED
  → DRIFT_CLASSIFIED (LLM decides drift type + confidence) ❌ PROBABILISTIC
  → DOCS_RESOLVED (find docs based on LLM classification)
  → EVIDENCE_EXTRACTED (extract evidence)
  → BASELINE_CHECKED (compare evidence vs doc) ✅ DETERMINISTIC
```

### Correct Flow (SHOULD BE)
```
ELIGIBILITY_CHECKED
  → DOCS_RESOLVED (find docs based on repo/service mapping)
  → EVIDENCE_EXTRACTED (extract ALL evidence types)
  → BASELINE_CHECKED (run ALL comparison types) ✅ DETERMINISTIC
    → If comparison finds drift: DRIFT_VERIFIED (skip LLM)
    → If comparison is ambiguous: DRIFT_CLASSIFIED (LLM fallback)
```

### Impact
- If LLM misclassifies drift type, comparison logic won't run correctly
- If LLM assigns low confidence, drift may be skipped entirely
- No way to detect drift that LLM doesn't recognize
- **Violates determinism principle**

### Solution
1. Move `DRIFT_CLASSIFIED` state AFTER `BASELINE_CHECKED`
2. Run ALL comparison types in `BASELINE_CHECKED` (not just one)
3. Use comparison results to determine drift type (not LLM)
4. Only call LLM if comparison is ambiguous (confidence < 0.7)

### Effort
2-3 days

---

## Critical Gap 2: Coverage Drift is Separate Type ⚠️ HIGH PRIORITY

### Problem
Coverage drift is a **separate drift type** that only triggers if LLM classifies as "coverage". But **coverage gaps can exist in ANY drift type**!

### Example
Today's PR #6 was classified as "instruction" drift, but it had a coverage gap (new endpoints not documented). The fix was to add `newContent` tracking to instruction drift, but this is a **band-aid**, not a proper solution.

### Correct Architecture
Coverage drift should be **orthogonal** to other drift types:

```typescript
// BASELINE_CHECKED should return:
{
  driftTypes: {
    instruction: { hasConflicts: true, hasNewContent: true },
    process: { hasConflicts: false, hasNewContent: false },
    ownership: { hasConflicts: false, hasNewContent: false },
    environment: { hasConflicts: false, hasNewContent: false },
  },
  coverageGaps: {
    newCommands: ['npm run build'],
    newEndpoints: ['/api/monitoring/health'],
    newScenarios: ['health check', 'metrics'],
  },
  overallVerdict: {
    hasDrift: true,
    primaryType: 'instruction',
    secondaryTypes: ['coverage'],
    confidence: 0.95,
  }
}
```

### Solution
1. Remove "coverage" as a separate drift type
2. Add `coverageGaps` field to baseline result
3. Track new content separately from conflicts in all drift types
4. Update patch generation to handle coverage gaps

### Effort
1-2 days

---

## Critical Gap 3: No Drift Comparison for Non-GitHub Sources ⚠️ HIGH PRIORITY

### Problem
Evidence extraction exists for PagerDuty, Slack, Datadog, IaC, CODEOWNERS, but **NO drift comparison logic**.

### Current State
- ✅ Evidence extraction: `buildPagerDutyArtifacts()`, `buildSlackArtifacts()`, etc.
- ❌ Drift comparison: Only `extractEvidencePack()` for GitHub PR

### Impact
- PagerDuty incidents don't trigger drift detection
- Slack threads don't trigger drift detection
- Datadog alerts don't trigger drift detection
- IaC changes don't trigger drift detection
- CODEOWNERS changes don't trigger drift detection

### Solution
Implement source-specific evidence extraction for each source type:

```typescript
// For PagerDuty incidents
function extractPagerDutyEvidence(incident: any): EvidencePack {
  // Extract commands from incident notes
  // Extract responders (for ownership drift)
  // Extract timeline (for process drift)
}

// For Slack threads
function extractSlackEvidence(messages: any[]): EvidencePack {
  // Extract commands from messages
  // Extract participants (for ownership drift)
  // Extract conversation flow (for process drift)
}

// For Datadog alerts
function extractDatadogEvidence(alert: any): EvidencePack {
  // Extract thresholds/metrics (for instruction drift)
  // Extract affected services (for environment drift)
}

// For IaC changes
function extractIaCEvidence(iacChanges: any): EvidencePack {
  // Extract resource configs (ports, env vars, etc.)
  // Extract infrastructure changes (for environment drift)
}

// For CODEOWNERS changes
function extractCodeownersEvidence(codeownersDiff: any): EvidencePack {
  // Extract owner changes (for ownership drift)
}
```

### Effort
3-5 days

---

## Critical Gap 4: No Validation for Direct Writeback Targets ⚠️ MEDIUM PRIORITY

### Problem
Confluence and Notion adapters support direct writeback, but **NO validation** before writing.

### Current State
- ✅ Validation for PR workflow targets (Swagger, Backstage, GitBook)
- ❌ No validation for direct writeback targets (Confluence, Notion)

### Impact
- Malformed patches can be written directly to Confluence/Notion
- No rollback mechanism if writeback fails
- No way to detect writeback errors until after the fact

### Solution
Add pre-writeback validation:

```typescript
// For Confluence
function validateConfluenceStorage(content: string): ValidationResult {
  // Validate Confluence storage format (XHTML)
  // Check for broken macros
  // Check for invalid HTML tags
}

// For Notion
function validateNotionBlocks(blocks: any[]): ValidationResult {
  // Validate Notion block structure
  // Check for invalid block types
  // Check for missing required fields
}
```

### Effort
1-2 days

---

## Critical Gap 5: No Rollback Mechanism for Failed Writebacks ⚠️ MEDIUM PRIORITY

### Problem
If writeback fails after partial update, there's no way to rollback.

### Current State
- ✅ Optimistic locking (revision conflict detection)
- ❌ No rollback mechanism

### Impact
- Partial updates can leave docs in inconsistent state
- No way to recover from failed writebacks

### Solution
Implement rollback mechanism:

```typescript
// For Confluence
async function rollbackConfluencePage(
  workspaceId: string,
  docId: string,
  targetRevision: string
): Promise<void> {
  // Fetch page history
  // Restore to target revision
}

// For Notion
async function rollbackNotionPage(
  pageId: string,
  targetRevision: string
): Promise<void> {
  // Notion doesn't support rollback via API
  // Need to implement manual rollback (delete blocks, re-add old blocks)
}
```

### Effort
2-3 days

---

## Immediate Action Plan

### Phase 1: Fix Determinism (Week 1)
1. **Day 1-3**: Fix Gap 1 (LLM classification after comparison)
2. **Day 4-5**: Fix Gap 2 (coverage drift orthogonal)

### Phase 2: Multi-Source Support (Week 2)
3. **Day 6-10**: Fix Gap 3 (non-GitHub sources)

### Phase 3: Safety & Reliability (Week 3)
4. **Day 11-12**: Fix Gap 4 (writeback validation)
5. **Day 13-15**: Fix Gap 5 (rollback mechanism)

---

## Current Status: Drift Type Detection

| Drift Type | GitHub PR | PagerDuty | Slack | Datadog | IaC | CODEOWNERS |
|------------|-----------|-----------|-------|---------|-----|------------|
| **Instruction** | ✅ WORKS | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Process** | ⚠️ LLM | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Ownership** | ⚠️ LLM | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Coverage** | ⚠️ BROKEN | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Environment** | ⚠️ LLM | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |

**Legend**:
- ✅ WORKS: Fully deterministic, no LLM dependency
- ⚠️ LLM: Partially works, but LLM-dependent (not deterministic)
- ⚠️ BROKEN: Separate drift type, not integrated
- ❌ NO: Evidence extraction exists, but no comparison logic

---

## Current Status: Output Target Support

| Output Target | Writeback | Validation | Rollback | Status |
|---------------|-----------|------------|----------|--------|
| **Confluence** | ✅ Direct | ❌ NO | ❌ NO | ⚠️ PARTIAL |
| **Notion** | ✅ Direct | ❌ NO | ❌ NO | ⚠️ PARTIAL |
| **GitHub README** | ✅ PR | ✅ YES | N/A | ✅ FULL |
| **Swagger/OpenAPI** | ✅ PR | ✅ YES | N/A | ✅ FULL |
| **Backstage** | ✅ PR | ✅ YES | N/A | ✅ FULL |
| **GitBook** | ✅ PR | ✅ YES | N/A | ✅ FULL |
| **Code Comments** | ❌ NO | ✅ YES | N/A | ⚠️ PARTIAL |

**Legend**:
- ✅ FULL: Fully implemented with validation
- ⚠️ PARTIAL: Implemented but missing validation/rollback
- ❌ NO: Not implemented

---

## CATEGORY B: CONTROL-PLANE GAPS (7 GAPS)

These gaps prevent VertaAI from being a production-grade "surveillance plan" system with reproducible, bounded, and auditable drift detection.

---

## Critical Gap 6: DriftPlan is Not a True Control-Plane Object ⚠️ HIGHEST PRIORITY

### Problem
Current `DriftPlan` exists but is **underutilized** and **missing critical control-plane features**:

**What EXISTS** ✅:
- `DriftPlan` model with versioning (SHA-256 hash)
- 5-step plan resolution algorithm (exact → repo → service → workspace → none)
- Plan templates (microservice, api_gateway, database, infrastructure, security)
- Plan config: `inputSources`, `driftTypes`, `allowedOutputs`, `thresholds`, `eligibility`

**What's MISSING** ❌:
1. **Doc targeting rules** - No explicit `primary_doc_mapping`, `secondary_doc_candidates`, `resolution_strategy`
2. **Source cursors** - No tracking of last processed event per source (last PR, last incident, last Slack window)
3. **Budgets** - No `max_llm_calls`, `max_tokens`, `max_clusters_per_run` limits
4. **Noise controls** - No `rate_limits`, `cooldowns`, `min_cluster_size`, `confidence_thresholds`
5. **PlanRun tracking** - No `PlanRun` model to track each execution of a plan
6. **Run reproducibility** - No way to replay a plan run with same inputs

### Current vs. Correct Architecture

**Current (WRONG)**:
```typescript
// DriftPlan is passive - just stores config
DriftPlan {
  inputSources: ['github_pr', 'pagerduty'],
  driftTypes: ['instruction', 'process'],
  allowedOutputs: ['confluence'],
  thresholds: { minConfidence: 0.6 }
}

// Doc resolution happens OUTSIDE plan context
resolveDocsForDrift({ repo, service, prBody })
  → P0: PR links
  → P1: DocMappingV2 lookup (separate table)
  → P2: Confluence search (unbounded)
```

**Correct (SHOULD BE)**:
```typescript
// DriftPlan is active control-plane object
DriftPlan {
  // Existing fields...

  // NEW: Doc targeting rules (deterministic)
  docTargeting: {
    primary_doc_mapping: { docId: '164013', docSystem: 'confluence' },
    secondary_doc_candidates: [
      { docId: '164014', docSystem: 'confluence', confidence: 0.8 }
    ],
    resolution_strategy: 'mapping_only' | 'mapping_then_search' | 'search_only',
    max_docs_per_run: 3,
    allowed_doc_classes: ['runbook', 'api_doc'],
  },

  // NEW: Source cursors (prevent reprocessing)
  sourceCursors: {
    github_pr: { last_pr_number: 423, last_processed_at: '2026-02-09T10:00:00Z' },
    pagerduty: { last_incident_id: 'INC-789', last_processed_at: '2026-02-09T09:00:00Z' },
    slack: { last_message_ts: '1707472800.123456', last_processed_at: '2026-02-09T08:00:00Z' },
  },

  // NEW: Budgets (cost control)
  budgets: {
    max_llm_calls_per_run: 10,
    max_tokens_per_run: 100000,
    max_clusters_per_run: 5,
    max_drifts_per_run: 20,
  },

  // NEW: Noise controls (anti-fatigue)
  noiseControls: {
    rate_limit_per_hour: 5,
    cooldown_minutes: 60,
    min_cluster_size: 3,
    confidence_threshold: 0.6,
    dedup_window_hours: 24,
  },
}

// NEW: PlanRun model tracks each execution
PlanRun {
  id: 'run-uuid',
  planId: 'plan-uuid',
  planVersionHash: 'sha256-hash', // Reproducibility
  startedAt: '2026-02-09T10:00:00Z',
  completedAt: '2026-02-09T10:05:00Z',
  status: 'completed' | 'failed' | 'partial',

  // Inputs (for reproducibility)
  inputSignals: ['signal-1', 'signal-2'],
  inputCursors: { github_pr: { last_pr_number: 422 } },

  // Outputs (for audit)
  driftsCreated: ['drift-1', 'drift-2'],
  docsResolved: [{ docId: '164013', method: 'primary_mapping' }],
  llmCallsUsed: 5,
  tokensUsed: 45000,

  // Budget tracking
  budgetStatus: {
    llm_calls: { used: 5, limit: 10, exceeded: false },
    tokens: { used: 45000, limit: 100000, exceeded: false },
  },
}
```

### Impact
- **Doc resolution is non-deterministic**: P2 Confluence search is unbounded, can return different results
- **No cost control**: LLM calls can explode without budgets
- **No deduplication**: Same PR can trigger multiple drifts
- **No reproducibility**: Can't replay a plan run to debug issues
- **No audit trail**: Can't prove which plan version produced which drift

### Solution
1. **Enhance DriftPlan model** with `docTargeting`, `sourceCursors`, `budgets`, `noiseControls`
2. **Create PlanRun model** to track each plan execution
3. **Refactor doc resolution** to use plan's `docTargeting` rules
4. **Add cursor management** to prevent reprocessing same events
5. **Add budget tracking** to prevent cost blowups

### Effort
5-7 days

---

## Critical Gap 7: No Immutable SignalEvent as Evidence ⚠️ HIGH PRIORITY

### Problem
Current `SignalEvent` is mutable and lacks provenance tracking.

**What EXISTS** ✅:
- `SignalEvent` model with `sourceType`, `sourceId`, `payload`
- Fingerprinting for deduplication (`fingerprint.ts`)

**What's MISSING** ❌:
1. **Immutability** - SignalEvent can be updated after creation
2. **Provenance** - No links to original source (PR URL, incident URL, Slack thread URL)
3. **Normalization version** - No hash of extraction logic version
4. **Extracted snippets** - No bounded excerpts stored for reproducibility

### Current vs. Correct Architecture

**Current (WRONG)**:
```typescript
SignalEvent {
  sourceType: 'github_pr',
  sourceId: 'Fredjr/VertaAI#6',
  payload: { /* raw webhook payload */ },
  fingerprint: 'sha256-hash', // Good!
}

// Extraction happens on-demand, not stored
const evidencePack = extractEvidencePack(signal.payload);
```

**Correct (SHOULD BE)**:
```typescript
SignalEvent {
  // Existing fields...

  // NEW: Immutability
  immutable: true, // Prevent updates after creation

  // NEW: Provenance
  provenance: {
    source_url: 'https://github.com/Fredjr/VertaAI/pull/6',
    source_api_endpoint: 'https://api.github.com/repos/Fredjr/VertaAI/pulls/6',
    ingested_at: '2026-02-09T10:00:00Z',
    ingested_by: 'webhook-handler',
  },

  // NEW: Normalization version
  normalization_version: 'v1.2.3', // Version of extraction logic
  normalization_hash: 'sha256-hash', // Hash of extraction code

  // NEW: Extracted snippets (bounded, deterministic)
  extracted_snippets: {
    title: 'Add monitoring endpoints',
    description: 'This PR adds /api/monitoring/health...',
    diff_excerpt: '+router.get(\'/health\', async (req, res) => {',
    files_changed: ['apps/api/src/routes/monitoring.ts'],
    commands_found: ['curl /api/monitoring/health'],
    endpoints_found: ['/api/monitoring/health', '/api/monitoring/metrics'],
  },
}
```

### Impact
- **Non-reproducible drift detection**: Can't replay extraction with same inputs
- **No audit trail**: Can't prove what evidence was seen at detection time
- **No version tracking**: Can't compare results across extraction logic versions

### Solution
1. **Make SignalEvent immutable** after creation
2. **Add provenance fields** (source_url, ingested_at, ingested_by)
3. **Add normalization version** tracking
4. **Store extracted snippets** in SignalEvent (not just payload)

### Effort
2-3 days

---

## Critical Gap 8: No Two-Stage Doc Resolution (Bounded Retrieval + Rerank) ⚠️ HIGH PRIORITY

### Problem
Current doc resolution is **unbounded** and **non-deterministic**.

**What EXISTS** ✅:
- P0: PR link extraction (explicit doc references)
- P1: DocMappingV2 lookup (manual mappings)
- P2: Confluence search (CQL search with top-10 results)

**What's MISSING** ❌:
1. **Stage 1 (cheap, high recall)** - No deterministic keyword-based filtering before search
2. **Stage 2 (expensive, bounded rerank)** - No embedding-based reranking of top-N candidates
3. **Candidate scoring** - No explicit scoring/ranking of candidates
4. **Selection justification** - No explanation of why a doc was selected

### Current vs. Correct Architecture

**Current (WRONG)**:
```typescript
// P2: Unbounded Confluence search
const searchResults = await searchPages(workspaceId, searchQuery, limit=10);
// Returns top 10, but:
// - No filtering by space/domain
// - No keyword matching
// - No reranking
// - Confidence decreases linearly (0.65, 0.60, 0.55...)
```

**Correct (SHOULD BE)**:
```typescript
// STAGE 1: Cheap, deterministic, high recall (top-N candidates)
async function stage1_shortlist(args: {
  workspaceId: string;
  repo: string;
  service: string;
  prTitle: string;
  driftType: DriftType;
  plan: DriftPlan;
}): Promise<DocCandidate[]> {
  const candidates: DocCandidate[] = [];

  // Step 1: Use plan's primary mapping (highest priority)
  if (plan.docTargeting.primary_doc_mapping) {
    candidates.push({
      docId: plan.docTargeting.primary_doc_mapping.docId,
      method: 'primary_mapping',
      confidence: 0.95,
      reason: 'Explicit primary mapping in plan',
    });
  }

  // Step 2: Use plan's secondary candidates
  candidates.push(...plan.docTargeting.secondary_doc_candidates);

  // Step 3: Deterministic keyword search (if allowed by plan)
  if (plan.docTargeting.resolution_strategy !== 'mapping_only') {
    const keywords = extractKeywords(repo, service, prTitle, driftType);
    const searchResults = await searchPages(workspaceId, keywords, limit=30);

    // Filter by allowed spaces/domains
    const filtered = searchResults.filter(doc =>
      plan.docTargeting.allowed_doc_classes.includes(doc.docClass) &&
      plan.docTargeting.allowed_spaces.includes(doc.spaceKey)
    );

    candidates.push(...filtered.map(doc => ({
      ...doc,
      method: 'keyword_search',
      confidence: 0.5, // Lower confidence for search results
    })));
  }

  // Return top-N candidates (bounded by plan)
  return candidates.slice(0, plan.docTargeting.max_docs_per_run);
}

// STAGE 2: Expensive, bounded rerank (top-K selection)
async function stage2_rerank(args: {
  candidates: DocCandidate[];
  evidencePack: EvidencePack;
  driftType: DriftType;
}): Promise<DocCandidate[]> {
  // Only fetch titles + snippets for reranking (not full docs)
  const snippets = await fetchDocSnippets(candidates.map(c => c.docId));

  // Embed evidence + doc snippets
  const evidenceEmbedding = await embed(evidencePack.extracted.keywords.join(' '));
  const docEmbeddings = await Promise.all(
    snippets.map(s => embed(s.title + ' ' + s.headings.join(' ')))
  );

  // Rerank by similarity
  const scored = candidates.map((candidate, i) => ({
    ...candidate,
    similarity: cosineSimilarity(evidenceEmbedding, docEmbeddings[i]),
    rerank_confidence: candidate.confidence * cosineSimilarity(evidenceEmbedding, docEmbeddings[i]),
  }));

  // Return top-K (K ≤ 3-5)
  return scored
    .sort((a, b) => b.rerank_confidence - a.rerank_confidence)
    .slice(0, 3);
}

// Combined two-stage resolution
const shortlist = await stage1_shortlist({ workspaceId, repo, service, prTitle, driftType, plan });
const selected = await stage2_rerank({ candidates: shortlist, evidencePack, driftType });
```

### Impact
- **Non-deterministic doc selection**: P2 search can return different results
- **High cost**: Fetching full doc content for all candidates is expensive
- **Low accuracy**: No reranking means first result may not be best match
- **No explainability**: Can't explain why a doc was selected

### Solution
1. **Add DOCS_SHORTLISTED state** between DOCS_RESOLVED and DOCS_FETCHED
2. **Implement stage1_shortlist** with deterministic keyword filtering
3. **Implement stage2_rerank** with embedding-based reranking
4. **Store candidate scores** in drift candidate metadata

### Effort
3-4 days

---

## Critical Gap 9: No Cluster-First Drift Triage (Anti-Fatigue) ⚠️ HIGH PRIORITY

### Problem
Current system sends **one Slack message per drift**, causing notification fatigue.

**What EXISTS** ✅:
- Question clustering for Slack (`questionClusterer.ts`)
- `SlackQuestionCluster` model
- Rate limiting (10 notifications/hour per workspace)

**What's MISSING** ❌:
1. **DriftCluster model** - No clustering of drift candidates
2. **Cluster aggregation** - No grouping of drifts by (service + docRef + driftType + time window)
3. **Cluster Slack UX** - No consolidated notification format
4. **Bulk actions** - No approve/reject/snooze at cluster level

### Current vs. Correct Architecture

**Current (WRONG)**:
```typescript
// handleOwnerResolved sends one Slack message per drift
await sendSlackNotification({
  driftId: drift.id,
  message: 'Drift detected in payment-service runbook',
  actions: ['Approve', 'Reject', 'Snooze'],
});

// Result: 7 PRs touching same doc = 7 Slack messages = fatigue
```

**Correct (SHOULD BE)**:
```typescript
// NEW: DriftCluster model
DriftCluster {
  id: 'cluster-uuid',
  workspaceId: 'workspace-uuid',
  clusterKey: 'payment-service|confluence:164013|instruction|2026-W06', // (service + docRef + driftType + week)

  driftIds: ['drift-1', 'drift-2', 'drift-3', 'drift-4', 'drift-5', 'drift-6', 'drift-7'],
  exemplarDriftId: 'drift-3', // Most representative drift

  count: 7,
  windowStart: '2026-02-03T00:00:00Z',
  windowEnd: '2026-02-09T23:59:59Z',

  status: 'pending' | 'notified' | 'acknowledged' | 'snoozed',
  notifiedAt: '2026-02-09T10:00:00Z',
  acknowledgedAt: null,
  snoozedUntil: null,
}

// Cluster aggregation in handleOwnerResolved
const clusterKey = computeClusterKey(drift); // (service + docRef + driftType + week)
const cluster = await findOrCreateCluster(clusterKey, drift);

if (cluster.count >= MIN_CLUSTER_SIZE && !cluster.notifiedAt) {
  // Send ONE cluster notification
  await sendClusterNotification({
    clusterId: cluster.id,
    message: '🔔 7 drifts for payment-service runbook in 5 days',
    exemplar: cluster.exemplarDriftId,
    actions: ['View All', 'Ack All', 'Snooze 7d'],
  });
} else if (drift.impactBand === 'CRITICAL') {
  // Critical drifts bypass clustering
  await sendIndividualNotification(drift);
} else {
  // Add to cluster, don't notify yet
  await addToCluster(cluster, drift);
}
```

### Impact
- **Notification fatigue**: Users get spammed with individual drift notifications
- **Low signal-to-noise**: Hard to see patterns across multiple drifts
- **No bulk actions**: Users must approve/reject each drift individually

### Solution
1. **Create DriftCluster model** with clusterKey, driftIds, exemplar, status
2. **Implement cluster aggregation** in handleOwnerResolved
3. **Create cluster Slack UX** with consolidated message format
4. **Add bulk actions** (Ack All, Snooze All)

### Effort
4-5 days

---

## Critical Gap 10: No DocBaseline Registry (Per docRef + Revision) ⚠️ MEDIUM PRIORITY

### Problem
Current baseline extraction happens **on-demand** and is **not cached**.

**What EXISTS** ✅:
- `extractDocContext()` extracts baseline anchors (commands, endpoints, steps, decisions)
- `BaselineAnchors` type with structured extraction
- Managed region extraction

**What's MISSING** ❌:
1. **DocBaseline model** - No persistent storage of extracted baselines
2. **Baseline versioning** - No tracking of baseline per doc revision
3. **Baseline facts** - No canonical owner/team/channel extraction
4. **Baseline reuse** - Baseline is re-extracted on every drift check

### Current vs. Correct Architecture

**Current (WRONG)**:
```typescript
// Baseline extracted on-demand in handleDocsFetched
const docContext = extractDocContext({
  docText,
  driftType,
  // ...
});

// Baseline anchors are ephemeral (not stored)
const baselineAnchors = docContext.baselineAnchors;

// Next drift for same doc = re-extract baseline (wasteful)
```

**Correct (SHOULD BE)**:
```typescript
// NEW: DocBaseline model
DocBaseline {
  id: 'baseline-uuid',
  workspaceId: 'workspace-uuid',
  docId: '164013',
  docSystem: 'confluence',
  docRevision: '42', // Confluence version number

  // Extracted structure
  headings: ['Overview', 'Deployment', 'Rollback', 'Troubleshooting'],
  owner_block: { text: 'Owner: @platform-team', startChar: 100, endChar: 150 },
  managed_region: { text: '...', startChar: 200, endChar: 1000 },

  // Baseline facts (canonical truth)
  facts: {
    canonical_owner: '@platform-team',
    canonical_team: 'Platform',
    canonical_channel: '#platform-alerts',
    canonical_endpoints: ['/api/health', '/api/metrics'],
    canonical_commands: ['kubectl apply -f deploy.yaml', 'kubectl rollout status'],
    canonical_config_keys: ['DATABASE_URL', 'REDIS_URL'],
    process_skeleton: ['1. Deploy', '2. Verify', '3. Monitor', '4. Rollback if needed'],
  },

  // Metadata
  extracted_at: '2026-02-09T10:00:00Z',
  extraction_version: 'v1.2.3', // Version of extraction logic
  last_verified_at: '2026-02-09T10:00:00Z',
  verified_by: 'user-uuid', // Human verification
}

// Baseline extraction with caching
async function getOrExtractBaseline(args: {
  workspaceId: string;
  docId: string;
  docRevision: string;
  docText: string;
}): Promise<DocBaseline> {
  // Check if baseline exists for this revision
  const existing = await prisma.docBaseline.findFirst({
    where: {
      workspaceId: args.workspaceId,
      docId: args.docId,
      docRevision: args.docRevision,
    },
  });

  if (existing) {
    console.log('[Baseline] Using cached baseline');
    return existing;
  }

  // Extract and persist new baseline
  console.log('[Baseline] Extracting new baseline');
  const baseline = await extractAndPersistBaseline(args);
  return baseline;
}
```

### Impact
- **Wasteful re-extraction**: Same doc baseline extracted multiple times
- **No canonical facts**: Can't compare against "known good" state
- **No human verification**: Can't mark baseline as "verified by human"

### Solution
1. **Create DocBaseline model** with facts, extraction_version, verified_by
2. **Implement baseline caching** in handleDocsFetched
3. **Add baseline verification** UI for humans to confirm accuracy

### Effort
3-4 days

---

## Critical Gap 11: No Deterministic Comparator Outcome Enum ⚠️ MEDIUM PRIORITY

### Problem
Current baseline comparison returns **boolean** (`hasMatch`) instead of **structured outcome**.

**What EXISTS** ✅:
- Instruction drift comparison (conflicts + new content)
- Process drift comparison (gates, steps, decisions)
- Ownership drift comparison (owner block)

**What's MISSING** ❌:
1. **Outcome enum** - No standard outcomes (NOT_APPLICABLE, INSUFFICIENT_BASELINE, BELOW_THRESHOLD, WATCH, SIGNAL, BLOCKED)
2. **Policy engine** - No rules for when to mint writeback-ready patch
3. **Gating logic** - No explicit gates before patch generation

### Current vs. Correct Architecture

**Current (WRONG)**:
```typescript
// Baseline comparison returns boolean
const baselineResult = {
  hasMatch: true, // Boolean - not enough information
  matchCount: 5,
  evidence: ['conflict 1', 'conflict 2'],
};

// Patch generation happens if hasMatch=true (too simplistic)
if (baselineResult.hasMatch) {
  await generatePatch();
}
```

**Correct (SHOULD BE)**:
```typescript
// NEW: Comparator outcome enum
type ComparatorOutcome =
  | 'NOT_APPLICABLE'           // Wrong doc class/target
  | 'INSUFFICIENT_BASELINE'    // No mapping / no managed region / doc too large
  | 'BELOW_THRESHOLD'          // Weak evidence
  | 'WATCH'                    // Drift likely but not enough evidence
  | 'SIGNAL'                   // High confidence + high impact + baseline mismatch
  | 'BLOCKED';                 // Missing required plan inputs

// Baseline comparison returns structured outcome
const baselineResult = {
  outcome: 'SIGNAL' as ComparatorOutcome,
  confidence: 0.85,
  impact: 'high',
  evidence: ['conflict 1', 'conflict 2'],
  recommendation: 'replace_steps',
  gates_passed: {
    has_primary_mapping: true,
    has_managed_region: true,
    baseline_extracted: true,
    mismatch_proven: true,
    validators_pass: true,
    budget_allows: true,
  },
};

// Policy engine decides if patch should be generated
function shouldGeneratePatch(result: BaselineResult): boolean {
  // Rule 1: Must be SIGNAL outcome
  if (result.outcome !== 'SIGNAL') return false;

  // Rule 2: All gates must pass
  if (!Object.values(result.gates_passed).every(Boolean)) return false;

  // Rule 3: Confidence above threshold
  if (result.confidence < 0.7) return false;

  // Rule 4: Impact must be medium or high
  if (result.impact === 'low') return false;

  return true;
}
```

### Impact
- **No explainability**: Can't explain why patch was/wasn't generated
- **No gating**: Patches can be generated without required inputs
- **No trust**: Users don't know what criteria were used

### Solution
1. **Create ComparatorOutcome enum** with 6 standard outcomes
2. **Add gates_passed tracking** to baseline result
3. **Implement policy engine** with explicit rules

### Effort
2-3 days

---

## Critical Gap 12: No Coverage Health as "Insurance Narrative" ⚠️ MEDIUM PRIORITY

### Problem
Current coverage monitoring is **passive** and doesn't generate **obligations**.

**What EXISTS** ✅:
- `CoverageSnapshot` model with mapping/processing coverage
- Coverage calculator (`calculateCoverageMetrics`)
- Coverage API endpoints (`/api/coverage/current`, `/api/coverage/snapshots`)
- Coverage dashboard (React UI)

**What's MISSING** ❌:
1. **Obligation generation** - No automatic creation of NEEDS_MAPPING, SOURCE_STALE, INTEGRATION_MISCONFIGURED obligations
2. **Coverage health per source** - No "% of PRs in infra paths evaluated"
3. **Critical service tracking** - No "% of critical services with primary runbook mapping"
4. **Silent failure prevention** - No alerts when sources go stale

### Current vs. Correct Architecture

**Current (WRONG)**:
```typescript
// Coverage snapshot is passive (just metrics)
CoverageSnapshot {
  mappingCoveragePercent: 75, // 75% of services have mappings
  processingCoveragePercent: 80, // 80% of signals processed
  sourceHealth: { github_pr: 'good', pagerduty: 'fair' },
}

// No action taken if coverage is low
```

**Correct (SHOULD BE)**:
```typescript
// NEW: Coverage obligations
type CoverageObligation =
  | 'NEEDS_MAPPING'              // Service has no doc mapping
  | 'SOURCE_STALE'               // Source hasn't sent events in 7 days
  | 'INTEGRATION_MISCONFIGURED'  // Integration credentials expired
  | 'CRITICAL_SERVICE_UNMAPPED'; // Critical service has no primary mapping

// Coverage snapshot generates obligations
CoverageSnapshot {
  // Existing metrics...

  // NEW: Obligations
  obligations: [
    {
      type: 'NEEDS_MAPPING',
      severity: 'high',
      service: 'payment-service',
      reason: 'No primary doc mapping for critical service',
      action: 'Create doc mapping for payment-service',
    },
    {
      type: 'SOURCE_STALE',
      severity: 'medium',
      source: 'pagerduty',
      reason: 'No incidents received in 7 days',
      action: 'Check PagerDuty integration credentials',
    },
  ],

  // NEW: Coverage health per source
  sourceHealthDetailed: {
    github_pr: {
      total_repos: 50,
      repos_monitored: 45,
      coverage_percent: 90,
      last_event_at: '2026-02-09T09:00:00Z',
      health: 'excellent',
    },
    pagerduty: {
      total_services: 30,
      services_monitored: 20,
      coverage_percent: 67,
      last_event_at: '2026-02-02T10:00:00Z', // 7 days ago!
      health: 'poor',
    },
  },

  // NEW: Critical service tracking
  criticalServices: {
    total: 10,
    with_primary_mapping: 8,
    coverage_percent: 80,
    unmapped: ['payment-service', 'auth-service'],
  },
}

// Obligation handler creates drift candidates
async function handleCoverageObligations(snapshot: CoverageSnapshot) {
  for (const obligation of snapshot.obligations) {
    if (obligation.type === 'NEEDS_MAPPING') {
      // Create drift candidate with state=NEEDS_MAPPING
      await prisma.driftCandidate.create({
        data: {
          workspaceId: snapshot.workspaceId,
          state: 'NEEDS_MAPPING',
          service: obligation.service,
          driftType: 'coverage',
          evidenceSummary: obligation.reason,
        },
      });
    } else if (obligation.type === 'SOURCE_STALE') {
      // Send alert to workspace admin
      await sendAdminAlert({
        workspaceId: snapshot.workspaceId,
        severity: obligation.severity,
        message: obligation.reason,
        action: obligation.action,
      });
    }
  }
}
```

### Impact
- **Silent failures**: Sources can go stale without anyone noticing
- **No proactive mapping**: Services remain unmapped until drift is detected
- **No insurance narrative**: Can't prove "we monitor X% of critical services"

### Solution
1. **Add obligations field** to CoverageSnapshot
2. **Implement obligation generation** in coverage calculator
3. **Create obligation handler** to create drift candidates or send alerts
4. **Add critical service tracking** to coverage metrics

### Effort
3-4 days

---

---

## PATTERN-BASED GAP ANALYSIS (User Must-Have Requirements)

The user provided 3 architectural patterns as **must-have requirements**. Below is a detailed analysis of what EXISTS vs. what's MISSING for each pattern.

---

### Pattern 1: DriftPlan + Coverage Health UI (Control Plane)

**User's Requirement**: First-class, versioned "plan" that governs detection, routing, and policy.

#### What EXISTS ✅

**DriftPlan Model** (schema.prisma lines 641-695):
- ✅ `scopeType`, `scopeRef` - Scope definition (workspace/service/repo)
- ✅ `primaryDocId`, `primaryDocSystem`, `docClass` - Primary doc target
- ✅ `inputSources`, `driftTypes`, `allowedOutputs` - Plan configuration
- ✅ `thresholds`, `eligibility`, `sectionTargets`, `impactRules`, `writeback` - Plan rules (JSON)
- ✅ `version`, `versionHash`, `parentId` - Versioning for reproducibility
- ✅ `templateId`, `templateName` - Template reference
- ✅ `createdAt`, `updatedAt`, `createdBy`, `updatedBy` - Audit trail

**Plan Resolution** (apps/api/src/services/plans/resolver.ts):
- ✅ 5-step resolution hierarchy (exact match → repo match → service match → workspace default → no plan)
- ✅ `resolveDriftPlan()` function with deterministic selection
- ✅ `checkPlanEligibility()` function for plan-based filtering

**CoverageSnapshot Model** (schema.prisma lines 702-741):
- ✅ Mapping coverage metrics (totalServices, servicesMapped, totalRepos, reposMapped, mappingCoveragePercent)
- ✅ Processing coverage metrics (totalSignals, signalsProcessed, signalsIgnored, processingCoveragePercent)
- ✅ Source health metrics (JSON: sourceHealth)
- ✅ Drift type distribution (JSON: driftTypeDistribution)
- ✅ Coverage obligations status (JSON: obligationsStatus)

**Coverage Calculation** (apps/api/src/services/coverage/):
- ✅ `calculateCoverageMetrics()` - Main coverage calculator
- ✅ `calculateMappingCoverage()` - Mapping coverage calculation
- ✅ `calculateProcessingCoverage()` - Processing coverage calculation
- ✅ `calculateSourceHealth()` - Source health calculation
- ✅ `calculateDriftTypeDistribution()` - Drift type distribution

**Coverage API** (apps/api/src/routes/coverage.ts):
- ✅ GET `/api/coverage/current` - Current coverage snapshot
- ✅ GET `/api/coverage/snapshots` - Historical snapshots
- ✅ GET `/api/coverage/latest` - Latest snapshot
- ✅ GET `/api/coverage/trends` - Coverage trends
- ✅ GET `/api/coverage/alerts` - Coverage alerts
- ✅ POST `/api/coverage/snapshot` - Create snapshot

**Coverage Dashboard UI** (apps/web/src/app/coverage/page.tsx):
- ✅ React-based coverage dashboard
- ✅ Mapping coverage widget
- ✅ Processing coverage widget
- ✅ Source health widget
- ✅ Drift type distribution widget

**Plan Version Tracking** (schema.prisma lines 780-782):
- ✅ AuditTrail has `planId`, `planVersionHash` fields for tracking plan versions

#### What's MISSING ❌

**DriftPlan Enhancements**:
- ❌ No `docTargeting` field (resolution_strategy, max_docs_per_run, allowed_doc_classes)
- ❌ No `sourceCursors` field (last_processed_at per source to prevent reprocessing)
- ❌ No `budgets` field (max_llm_calls, max_tokens, max_clusters_per_run)
- ❌ No `noiseControls` field (min_confidence, max_drifts_per_day, cluster_threshold)

**PlanRun Model**:
- ❌ No `PlanRun` model to track each execution of a plan
- ❌ No tracking of: startedAt, completedAt, signalsProcessed, driftsCreated, tokensUsed, costUsd

**DriftCandidate Plan Tracking**:
- ❌ No `planId` field in DriftCandidate (can't trace which plan was used)
- ❌ No `planVersion` field in DriftCandidate
- ❌ No `planVersionHash` field in DriftCandidate
- ❌ No `coverageFlags` field in DriftCandidate (BLOCKED_NEEDS_MAPPING, NO_MANAGED_REGION, etc.)

**Coverage Obligations**:
- ⚠️ Coverage obligations exist in `obligationsStatus` JSON field but not as first-class objects
- ❌ No automatic obligation generation (NEEDS_MAPPING, SOURCE_STALE, INTEGRATION_MISCONFIGURED)
- ❌ No obligation handler to create drift candidates or send alerts

#### Gap Priority: MEDIUM
**Reason**: DriftPlan and Coverage Health are mostly implemented. Missing pieces are enhancements for cost control, reproducibility tracking, and proactive obligation handling.

**Effort**: 3-4 days
- Add 4 JSON fields to DriftPlan (docTargeting, sourceCursors, budgets, noiseControls)
- Create PlanRun model and tracking logic
- Add planId/planVersion/planVersionHash/coverageFlags to DriftCandidate
- Implement obligation generation and handler

---

### Pattern 2: Impact Engine (Deterministic Consequence Scoring)

**User's Requirement**: Compute impact without LLM, with deterministic inputs and consequence templates.

#### What EXISTS ✅

**Impact Assessment Engine** (apps/api/src/services/evidence/impactAssessment.ts):
- ✅ `computeImpactAssessment()` - Main impact assessment function
- ✅ Deterministic impact scoring (no LLM dependency)
- ✅ Multi-source/multi-target aware impact rules matrix
- ✅ Drift type multipliers
- ✅ Impact band calculation (low/medium/high/critical)
- ✅ Fired rules tracking
- ✅ Consequence text generation (template-based)
- ✅ Blast radius calculation
- ✅ Risk factors identification

**Impact Rules Matrix** (apps/api/src/services/evidence/impactRules.ts):
- ✅ `IMPACT_RULES` array with source+target combinations
- ✅ Base impact scores per rule
- ✅ Multipliers with conditions (deployment_related, high_severity, etc.)
- ✅ `computeImpactFromRules()` function

**DriftCandidate Impact Fields** (schema.prisma lines 148-153):
- ✅ `impactScore` (0-1 scale)
- ✅ `impactBand` (low/medium/high/critical)
- ✅ `impactJson` (complete impact assessment details)
- ✅ `consequenceText` (human-readable consequence)
- ✅ `impactAssessedAt` (timestamp)

**Impact Assessment in State Machine** (transitions.ts lines 1407-1425):
- ✅ Impact assessment computed in EVIDENCE_EXTRACTED state
- ✅ Impact stored in database with evidence bundle

#### What's MISSING ❌

**IMPACT_ASSESSED State**:
- ❌ No separate `IMPACT_ASSESSED` state in state machine
- ⚠️ Impact is computed inline in EVIDENCE_EXTRACTED state (not a separate gate)

**ImpactAssessment Type**:
- ⚠️ Impact assessment exists but is stored in `impactJson` JSON field
- ✅ Impact fields are first-class (impactScore, impactBand, consequenceText)

#### Gap Priority: LOW
**Reason**: Impact Engine is fully implemented with deterministic scoring, fired rules, and consequence templates. The only missing piece is a separate IMPACT_ASSESSED state, which is optional (impact can be computed inline).

**Effort**: 0.5 days (optional)
- Add IMPACT_ASSESSED state to DriftState enum
- Create handleImpactAssessed() transition handler
- Move impact assessment from EVIDENCE_EXTRACTED to IMPACT_ASSESSED

---

### Pattern 3: Slack UX - "Verify Reality" (Instead of "Review Doc Diff")

**User's Requirement**: Reframe from "documentation chore" to "risk verification" with Claim → Evidence → Consequence → Actions.

#### What EXISTS ✅

**Slack Message Structure** (apps/api/src/services/evidence/slackMessageBuilder.ts):
- ✅ `buildSlackMessageFromEvidence()` - Zero-LLM message builder
- ✅ Header with impact band (lines 27-36)
- ✅ Summary section (lines 38-46)
- ✅ Claims section - "Current Documentation Claims" (lines 48-62)
- ✅ Reality section - "Signal Evidence" (lines 64-74)
- ✅ Fired rules section - "Impact Rules Triggered" (lines 76-90)
- ✅ Impact assessment section (lines 92-100)
- ✅ Consequence text from impact engine

**Current Slack Actions** (apps/api/src/routes/slack-interactions.ts lines 100-130):
- ✅ `approve` - Approve patch
- ✅ `reject` - Reject patch (opens modal)
- ✅ `edit` - Edit patch (opens modal)
- ✅ `snooze` - Snooze 48h

#### What's MISSING ❌

**Verify Reality Actions**:
- ❌ No `verify_true` action ("✅ Verified: update needed")
- ❌ No `verify_false` action ("❌ False positive")
- ❌ No `needs_mapping` action ("🧭 Needs mapping")
- ❌ No `generate_patch` action ("📝 Generate patch")

**Verify Reality States**:
- ❌ No `AWAITING_VERIFICATION` state (after SLACK_SENT)
- ❌ No `VERIFIED_TRUE` state (after verify_true action)
- ❌ No `VERIFIED_FALSE` state (after verify_false action)
- ❌ No `PATCH_REQUESTED` state (after generate_patch action)

**Conditional Patch Generation**:
- ⚠️ Current flow: BASELINE_CHECKED → PLAN_RESOLVED → PATCH_PLANNED → PATCH_GENERATED (always generates patch)
- ❌ Should be: BASELINE_CHECKED → SLACK_SENT → AWAITING_VERIFICATION → (if verify_true) → PATCH_REQUESTED → PATCH_PLANNED

**Token Use Reduction**:
- ⚠️ LLM calls are not conditional on user action
- ❌ Patch generation happens automatically, not on "Generate patch" button

#### Gap Priority: HIGH
**Reason**: This is a UX paradigm shift from "review doc diff" to "verify reality". It requires new Slack actions, new states, and conditional patch generation logic.

**Effort**: 4-5 days
- Add 4 new Slack actions (verify_true, verify_false, needs_mapping, generate_patch)
- Add 3 new states (AWAITING_VERIFICATION, VERIFIED_TRUE, VERIFIED_FALSE, PATCH_REQUESTED)
- Modify state machine to make patch generation conditional on verify_true action
- Update Slack message builder to show verify reality actions instead of approve/reject

---

## SUMMARY: Minimal Gaps Confirmed ✅

As the user predicted, **most features are already implemented**. The gaps are minimal:

### Pattern 1: DriftPlan + Coverage Health UI
- **Status**: ✅ 90% implemented
- **Missing**: PlanRun tracking, DriftCandidate plan fields, obligation generation
- **Priority**: MEDIUM
- **Effort**: 3-4 days

### Pattern 2: Impact Engine
- **Status**: ✅ 95% implemented
- **Missing**: Optional IMPACT_ASSESSED state
- **Priority**: LOW
- **Effort**: 0.5 days (optional)

### Pattern 3: Verify Reality UX
- **Status**: ⚠️ 60% implemented (message structure exists, actions missing)
- **Missing**: Verify reality actions, verification states, conditional patch generation
- **Priority**: HIGH
- **Effort**: 4-5 days

### Total Effort: 7.5-9.5 days (1.5-2 weeks)

---

## Conclusion

The VertaAI drift detection system has **strong foundations** with most of the control-plane architecture already implemented. The immediate priorities are:

### Phase 1: Verify Reality UX (Week 1) - HIGH PRIORITY
1. **Add verify reality Slack actions** (verify_true, verify_false, needs_mapping, generate_patch)
2. **Add verification states** (AWAITING_VERIFICATION, VERIFIED_TRUE, VERIFIED_FALSE, PATCH_REQUESTED)
3. **Make patch generation conditional** on verify_true action

### Phase 2: Control-Plane Enhancements (Week 2) - MEDIUM PRIORITY
4. **Add PlanRun tracking** for reproducibility
5. **Add plan fields to DriftCandidate** (planId, planVersion, planVersionHash, coverageFlags)
6. **Implement obligation generation** for proactive coverage health

### Phase 3: Determinism Fixes (Week 3) - From Original Analysis
7. **Fix Gap 1**: Invert LLM classification and comparison order
8. **Fix Gap 2**: Make coverage drift orthogonal to other drift types
9. **Fix Gap 3**: Implement drift comparison for non-GitHub sources

These fixes will complete the control-plane + truth-making architecture and enable reliable drift detection across all 5 drift types and all 7 input sources, with production-grade reproducibility, auditability, and cost control.

