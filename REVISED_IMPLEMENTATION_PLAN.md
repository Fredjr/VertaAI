# VertaAI: Revised Implementation Plan (Post-Gap Analysis)

## Executive Summary

This revised plan addresses **12 critical architectural gaps** discovered during production testing, plus the **multi-source/multi-target coverage problem**. The plan prioritizes deterministic drift detection across all 5 drift types and all 7 input sources, with full support for all 7 output targets.

## Current State Assessment

### What Works ✅
- ✅ **Phase 1 (COMPLETED)**: EvidenceBundle Pattern & Multi-Source Impact
- ✅ **Phase 3 Week 5 (COMPLETED)**: DriftPlan System with versioning
- ✅ **Phase 3 Week 6 (COMPLETED)**: Coverage Health Monitoring
- ✅ **Phase 3 Week 7 (COMPLETED)**: Advanced State Machine Integration
- ✅ **Phase 4 Week 8 Days 36-38 (COMPLETED)**: Audit Trail System
- ✅ **Phase 4 Week 8 Days 39-40 (COMPLETED)**: Compliance Dashboard

### What's Broken ❌

#### Drift Type Detection Coverage (Only 1/30 combinations work)

| Drift Type | GitHub PR | PagerDuty | Slack | Datadog | IaC | CODEOWNERS |
|------------|-----------|-----------|-------|---------|-----|------------|
| **Instruction** | ✅ WORKS | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Process** | ⚠️ LLM | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Ownership** | ⚠️ LLM | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Coverage** | ⚠️ BROKEN | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Environment** | ⚠️ LLM | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |

**Status**: Only **1 out of 30 combinations** (3.3%) works deterministically.

#### Output Target Support (Only 4/7 targets fully supported)

| Output Target | Writeback | Validation | Rollback | Status |
|---------------|-----------|------------|----------|--------|
| **Confluence** | ✅ Direct | ❌ NO | ❌ NO | ⚠️ PARTIAL |
| **Notion** | ✅ Direct | ❌ NO | ❌ NO | ⚠️ PARTIAL |
| **GitHub README** | ✅ PR | ✅ YES | N/A | ✅ FULL |
| **Swagger/OpenAPI** | ✅ PR | ✅ YES | N/A | ✅ FULL |
| **Backstage** | ✅ PR | ✅ YES | N/A | ✅ FULL |
| **GitBook** | ✅ PR | ✅ YES | N/A | ✅ FULL |
| **Code Comments** | ❌ NO | ✅ YES | N/A | ⚠️ PARTIAL |

**Status**: Only **4 out of 7 targets** (57%) fully supported.

### Critical Gaps Identified

#### Category A: Determinism Gaps (5 gaps)
1. ⚠️ **Gap 1 (HIGHEST)**: LLM classification runs BEFORE comparison (probabilistic)
2. ⚠️ **Gap 2 (HIGH)**: Coverage drift is separate type, not orthogonal
3. ⚠️ **Gap 3 (HIGH)**: No drift comparison for non-GitHub sources
4. ⚠️ **Gap 4 (MEDIUM)**: No validation for direct writeback targets
5. ⚠️ **Gap 5 (MEDIUM)**: No rollback mechanism for failed writebacks

#### Category B: Control-Plane Gaps (7 gaps)
6. ⚠️ **Gap 6 (HIGHEST)**: DriftPlan missing docTargeting, sourceCursors, budgets, noiseControls, PlanRun tracking
7. ⚠️ **Gap 7 (HIGH)**: No immutable SignalEvent with provenance tracking
8. ⚠️ **Gap 8 (HIGH)**: No two-stage doc resolution (bounded retrieval + rerank)
9. ⚠️ **Gap 9 (HIGH)**: No cluster-first drift triage (anti-fatigue)
10. ⚠️ **Gap 10 (MEDIUM)**: No DocBaseline registry (per docRef + revision)
11. ⚠️ **Gap 11 (MEDIUM)**: No deterministic comparator outcome enum
12. ⚠️ **Gap 12 (MEDIUM)**: No coverage health as "insurance narrative"

#### Category C: User Must-Have Requirements (3 patterns)
13. ⚠️ **Pattern 1 (MEDIUM)**: DriftPlan + Coverage Health UI - 90% implemented, missing PlanRun tracking
14. ⚠️ **Pattern 2 (LOW)**: Impact Engine - 95% implemented, missing optional IMPACT_ASSESSED state
15. ⚠️ **Pattern 3 (HIGH)**: Verify Reality UX - 60% implemented, missing verify actions and conditional patching

## Revised Implementation Plan

### Phase 1: Critical Determinism Fixes (Week 1) - 5 days
**Objective**: Fix the 5 highest-priority gaps that make drift detection probabilistic

#### Day 1-2: Gap 1 - Invert LLM Classification and Comparison Order
**Problem**: LLM classification runs BEFORE comparison, making drift detection probabilistic.

**Current Flow**:
```
ELIGIBILITY_CHECKED → DRIFT_CLASSIFIED (LLM) → BASELINE_CHECKED (comparison)
```

**Correct Flow**:
```
ELIGIBILITY_CHECKED → BASELINE_CHECKED (comparison) → DRIFT_CLASSIFIED (LLM fallback if ambiguous)
```

**Tasks**:
- [ ] Move comparison logic from `handleBaselineChecked()` to new `handleEligibilityChecked()` handler
- [ ] Create deterministic drift type detection from comparison results
- [ ] Make LLM classification conditional (only if comparison is ambiguous)
- [ ] Update state machine transitions
- [ ] Add tests for deterministic classification

**Files to modify**:
- `apps/api/src/services/orchestrator/transitions.ts` (lines 200-400)
- `apps/api/src/services/baseline/comparison.ts` (new file)

**Deliverables**:
- Deterministic drift type detection for instruction/coverage drifts
- LLM classification only for ambiguous cases
- 90%+ test coverage

#### Day 3: Gap 2 - Make Coverage Drift Orthogonal
**Problem**: Coverage drift is a separate type instead of being orthogonal to all drift types.

**Current**: Coverage is one of 5 drift types (instruction, process, ownership, coverage, environment)

**Correct**: Coverage is orthogonal - every drift can have coverage gaps

**Tasks**:
- [ ] Add `hasCoverageGap` boolean field to DriftCandidate
- [ ] Modify comparison logic to detect coverage gaps for ALL drift types
- [ ] Update Slack message to show both drift type AND coverage gap
- [ ] Add tests for coverage gap detection across all drift types

**Files to modify**:
- `apps/api/prisma/schema.prisma` (add hasCoverageGap field)
- `apps/api/src/services/orchestrator/transitions.ts` (comparison logic)
- `apps/api/src/services/evidence/slackMessageBuilder.ts` (message generation)

**Deliverables**:
- Coverage gap detection for all 5 drift types
- Updated Slack messages showing both dimensions
- Database migration

#### Day 4-5: Gap 3 - Multi-Source Drift Comparison
**Problem**: Drift comparison only works for GitHub PRs, not for other 6 source types.

**Current**: Only `compareInstructionDrift()` exists for GitHub PR → Confluence

**Correct**: Comparison logic for all 7 sources × 5 drift types = 35 combinations

**Tasks**:
- [ ] Create comparison functions for each source type:
  - `comparePagerDutyDrift()` - Incident timeline vs runbook
  - `compareSlackDrift()` - Message cluster vs FAQ/troubleshooting
  - `compareDatadogDrift()` - Alert config vs monitoring docs
  - `compareGrafanaDrift()` - Dashboard config vs observability docs
  - `compareIaCDrift()` - Resource changes vs infra docs
  - `compareCODEOWNERSDrift()` - Owner changes vs ownership docs
- [ ] Implement artifact extraction for each source type
- [ ] Add comparison logic for each drift type
- [ ] Comprehensive testing for all combinations

**Files to create**:
- `apps/api/src/services/baseline/comparePagerDuty.ts`
- `apps/api/src/services/baseline/compareSlack.ts`
- `apps/api/src/services/baseline/compareDatadog.ts`
- `apps/api/src/services/baseline/compareGrafana.ts`
- `apps/api/src/services/baseline/compareIaC.ts`
- `apps/api/src/services/baseline/compareCODEOWNERS.ts`

**Deliverables**:
- 6 new comparison modules (one per source type)
- Artifact extraction for all source types
- Test coverage for all 35 combinations

---

### Phase 2: Control-Plane Enhancements (Week 2) - 5 days
**Objective**: Complete the control-plane architecture with PlanRun tracking, two-stage resolution, and clustering

#### Day 6-7: Gap 6 - Enhance DriftPlan as True Control-Plane Object
**Problem**: DriftPlan is passive config, not an active control object.

**Missing Fields**:
- `docTargeting` - Resolution strategy, max docs per run, allowed doc classes
- `sourceCursors` - Last processed event per source (prevent reprocessing)
- `budgets` - Max LLM calls, max tokens, max clusters per run
- `noiseControls` - Min confidence, max drifts per day, cluster threshold

**Missing Model**:
- `PlanRun` - Track each execution of a plan for reproducibility

**Tasks**:
- [ ] Add 4 JSON fields to DriftPlan model (docTargeting, sourceCursors, budgets, noiseControls)
- [ ] Create PlanRun model with tracking fields
- [ ] Add planId/planVersion/planVersionHash/coverageFlags to DriftCandidate
- [ ] Implement PlanRun creation and tracking logic
- [ ] Add budget enforcement (stop processing if budget exceeded)
- [ ] Add source cursor tracking (skip already-processed events)
- [ ] Database migration

**Files to modify**:
- `apps/api/prisma/schema.prisma` (add fields and PlanRun model)
- `apps/api/src/services/plans/types.ts` (type definitions)
- `apps/api/src/services/plans/runner.ts` (new file - PlanRun tracking)
- `apps/api/src/services/orchestrator/transitions.ts` (budget enforcement)

**Deliverables**:
- Enhanced DriftPlan with 4 new fields
- PlanRun model and tracking system
- Budget enforcement preventing cost blowups
- Source cursor preventing reprocessing

#### Day 8: Gap 8 - Two-Stage Doc Resolution
**Problem**: P2 Confluence search is unbounded (can return 100+ pages).

**Current**: Single-stage search returns all results

**Correct**: Two-stage resolution (bounded retrieval + rerank)

**Tasks**:
- [ ] Stage 1: Cheap shortlist (metadata only, limit 20 candidates)
- [ ] Stage 2: Expensive rerank (fetch content for top 5 only)
- [ ] Implement candidate scoring function
- [ ] Update P2 Confluence search to use two-stage resolution
- [ ] Add tests for bounded retrieval

**Files to modify**:
- `apps/api/src/services/docResolution/docResolution.ts` (lines 452-545)
- `apps/api/src/services/docResolution/scoring.ts` (new file)

**Deliverables**:
- Two-stage doc resolution with bounded retrieval
- Candidate scoring function
- Cost reduction from 100+ page fetches to 5

#### Day 9-10: Gap 9 - Cluster-First Drift Triage
**Problem**: Each drift sends individual Slack notification (50 drifts = 50 messages).

**Current**: Individual notifications cause fatigue

**Correct**: Cluster-first notifications (50 drifts = 5 clusters = 5 messages)

**Tasks**:
- [ ] Create DriftCluster model
- [ ] Implement cluster aggregation logic (group by fingerprint + service + drift type)
- [ ] Build cluster Slack UX (single message for N drifts)
- [ ] Add bulk actions (approve all, reject all, snooze all, review individually)
- [ ] Update state machine to support cluster notifications
- [ ] Database migration

**Files to create**:
- `apps/api/prisma/schema.prisma` (DriftCluster model)
- `apps/api/src/services/clustering/aggregator.ts`
- `apps/api/src/services/clustering/slackClusterMessage.ts`
- `apps/api/src/routes/slack-cluster-interactions.ts`

**Deliverables**:
- DriftCluster model and aggregation logic
- Cluster Slack UX with bulk actions
- 10x reduction in notification volume

---

### Phase 3: Verify Reality UX (Week 3) - 5 days
**Objective**: Implement "verify reality" paradigm shift from "review doc diff"

#### Day 11-13: Pattern 3 - Verify Reality Slack Actions
**Problem**: Current UX is "review doc diff" (approve/reject/edit/snooze), not "verify reality".

**Missing Actions**:
- ✅ `verify_true` - "Verified: update needed"
- ❌ `verify_false` - "False positive"
- 🧭 `needs_mapping` - "Needs mapping"
- 📝 `generate_patch` - "Generate patch"

**Missing States**:
- `AWAITING_VERIFICATION` - After SLACK_SENT
- `VERIFIED_TRUE` - After verify_true action
- `VERIFIED_FALSE` - After verify_false action
- `PATCH_REQUESTED` - After generate_patch action

**Tasks**:
- [ ] Add 4 new Slack action handlers (verify_true, verify_false, needs_mapping, generate_patch)
- [ ] Add 4 new states to DriftState enum
- [ ] Create transition handlers for new states
- [ ] Update Slack message builder to show verify reality actions
- [ ] Make patch generation conditional on verify_true action
- [ ] Update state machine flow: BASELINE_CHECKED → SLACK_SENT → AWAITING_VERIFICATION → (if verify_true) → PATCH_REQUESTED → PATCH_PLANNED
- [ ] Add tests for new actions and states

**Files to modify**:
- `apps/api/src/routes/slack-interactions.ts` (add 4 new action handlers)
- `apps/api/src/services/orchestrator/transitions.ts` (add 4 new state handlers)
- `apps/api/src/services/evidence/slackMessageBuilder.ts` (update message structure)
- `apps/api/src/types/drift.ts` (add new states to enum)

**Deliverables**:
- 4 new Slack actions for verify reality UX
- 4 new states for verification workflow
- Conditional patch generation (only on verify_true)
- Token use reduction (LLM calls gated by user action)

#### Day 14-15: Pattern 1 - Coverage Obligations
**Problem**: Coverage monitoring is passive (just metrics), not actionable.

**Missing**:
- Automatic obligation generation (NEEDS_MAPPING, SOURCE_STALE, INTEGRATION_MISCONFIGURED)
- Critical service tracking
- Detailed source health per source

**Tasks**:
- [ ] Implement obligation generation logic
- [ ] Create obligation handler (creates drift candidates or sends alerts)
- [ ] Add critical service tracking to coverage metrics
- [ ] Add detailed source health (per-source health with last_event_at, error_rate)
- [ ] Update coverage dashboard to show obligations
- [ ] Add tests for obligation generation

**Files to modify**:
- `apps/api/src/services/coverage/calculator.ts` (add obligation generation)
- `apps/api/src/services/coverage/obligations.ts` (new file)
- `apps/web/src/app/coverage/page.tsx` (update dashboard)

**Deliverables**:
- Automatic obligation generation
- Obligation handler creating drift candidates
- Critical service tracking
- Updated coverage dashboard

---

### Phase 4: Output Target Validation & Rollback (Week 4) - 5 days
**Objective**: Add validation and rollback for direct writeback targets (Confluence, Notion)

#### Day 16-18: Gap 4 - Writeback Validation
**Problem**: No validation for direct writeback targets (Confluence, Notion).

**Current**: Confluence/Notion writebacks happen without validation

**Correct**: Validate writebacks before committing

**Tasks**:
- [ ] Create validation functions for Confluence writebacks
- [ ] Create validation functions for Notion writebacks
- [ ] Add WRITEBACK_VALIDATED state (already exists, but not used for Confluence/Notion)
- [ ] Implement validation logic:
  - Check if managed region exists
  - Verify no concurrent edits (compare baseRevision)
  - Validate patch syntax (no broken markdown/HTML)
  - Check if patch size is within limits
- [ ] Add tests for validation logic

**Files to modify**:
- `apps/api/src/adapters/confluence/validator.ts` (new file)
- `apps/api/src/adapters/notion/validator.ts` (new file)
- `apps/api/src/services/orchestrator/transitions.ts` (add validation for Confluence/Notion)

**Deliverables**:
- Validation functions for Confluence and Notion
- WRITEBACK_VALIDATED state used for all targets
- Prevention of broken writebacks

#### Day 19-20: Gap 5 - Rollback Mechanism
**Problem**: No rollback mechanism for failed writebacks.

**Current**: If writeback fails, drift candidate is stuck in error state

**Correct**: Automatic rollback on failure

**Tasks**:
- [ ] Implement rollback logic for Confluence (restore previous version)
- [ ] Implement rollback logic for Notion (restore previous version)
- [ ] Add WRITEBACK_FAILED state
- [ ] Create rollback handler
- [ ] Add retry logic with exponential backoff
- [ ] Add tests for rollback scenarios

**Files to modify**:
- `apps/api/src/adapters/confluence/rollback.ts` (new file)
- `apps/api/src/adapters/notion/rollback.ts` (new file)
- `apps/api/src/services/orchestrator/transitions.ts` (add rollback handler)
- `apps/api/src/types/drift.ts` (add WRITEBACK_FAILED state)

**Deliverables**:
- Rollback mechanism for Confluence and Notion
- WRITEBACK_FAILED state with automatic rollback
- Retry logic with exponential backoff

---

### Phase 5: Remaining Gaps & Polish (Week 5) - 5 days
**Objective**: Complete remaining medium-priority gaps

#### Day 21-22: Gap 7 - Immutable SignalEvent with Provenance
**Problem**: SignalEvent is mutable, no provenance tracking.

**Missing Fields**:
- `sourceUrl` - URL to original event
- `sourceSha` - SHA of original event for verification
- `sourceTimestamp` - Timestamp from source system
- `normalizationVersion` - Version of normalization logic used
- `extractedSnippets` - Deterministic excerpts for evidence

**Tasks**:
- [ ] Add 5 fields to SignalEvent model
- [ ] Add database constraint to prevent updates (remove updatedAt field)
- [ ] Add application-level check to prevent updates
- [ ] Update signal creation logic to populate new fields
- [ ] Database migration

**Files to modify**:
- `apps/api/prisma/schema.prisma` (add fields, remove updatedAt)
- `apps/api/src/services/signals/creator.ts` (populate new fields)

**Deliverables**:
- Immutable SignalEvent with provenance tracking
- Database constraints preventing updates
- Audit trail for all signals

#### Day 23: Gap 10 - DocBaseline Registry
**Problem**: Baseline extraction runs on every drift, no caching.

**Missing**:
- DocBaseline model (cache extracted baselines per doc revision)
- Baseline caching logic
- Human verification support

**Tasks**:
- [ ] Create DocBaseline model
- [ ] Implement baseline caching logic (getOrExtractBaseline)
- [ ] Add human verification fields (verified, verifiedBy, verifiedAt)
- [ ] Update baseline extraction to use cache
- [ ] Database migration

**Files to create**:
- `apps/api/prisma/schema.prisma` (DocBaseline model)
- `apps/api/src/services/baseline/cache.ts`

**Deliverables**:
- DocBaseline model and caching system
- Reduced redundant baseline extraction
- Human verification support

#### Day 24: Gap 11 - Deterministic Comparator Outcome Enum
**Problem**: Comparison returns boolean `hasMatch`, not structured outcome.

**Missing**:
- ComparatorOutcome enum (NOT_APPLICABLE, SIGNAL, WATCH, SUPPRESS, NEEDS_MAPPING)
- Policy engine (rules to map comparison results to outcomes)
- Gating logic (stop pipeline if outcome is NOT_APPLICABLE or SUPPRESS)

**Tasks**:
- [ ] Create ComparatorOutcome enum
- [ ] Implement policy engine (determineOutcome function)
- [ ] Update comparison logic to return structured outcome
- [ ] Add gating logic to state machine
- [ ] Add tests for all outcomes

**Files to modify**:
- `apps/api/src/services/baseline/types.ts` (add ComparatorOutcome enum)
- `apps/api/src/services/baseline/policy.ts` (new file - policy engine)
- `apps/api/src/services/orchestrator/transitions.ts` (use outcomes for gating)

**Deliverables**:
- ComparatorOutcome enum with 6 standard outcomes
- Policy engine with explicit rules
- Gating logic preventing unnecessary processing

#### Day 25: Gap 12 - Coverage Health as "Insurance Narrative"
**Problem**: Coverage metrics are passive, no obligations.

**Tasks**:
- [ ] Implement obligation generation (already covered in Day 14-15)
- [ ] Add critical service tracking (already covered in Day 14-15)
- [ ] Add detailed source health (already covered in Day 14-15)

**Status**: ✅ Already covered in Phase 3 Day 14-15

---

## Implementation Summary

### Total Effort: 5 weeks (25 working days)

| Phase | Days | Focus | Priority |
|-------|------|-------|----------|
| **Phase 1** | 5 | Critical Determinism Fixes | HIGHEST |
| **Phase 2** | 5 | Control-Plane Enhancements | HIGH |
| **Phase 3** | 5 | Verify Reality UX | HIGH |
| **Phase 4** | 5 | Output Target Validation & Rollback | MEDIUM |
| **Phase 5** | 5 | Remaining Gaps & Polish | MEDIUM |

### Coverage Improvement Targets

**Drift Type Detection**:
- **Before**: 1/30 combinations (3.3%)
- **After Phase 1**: 30/30 combinations (100%)

**Output Target Support**:
- **Before**: 4/7 targets (57%)
- **After Phase 4**: 7/7 targets (100%)

### Success Metrics

**Technical**:
- ✅ 100% drift type detection coverage (all 5 types × all 7 sources)
- ✅ 100% output target support (all 7 targets with validation)
- ✅ <5% false positive rate (down from current ~20%)
- ✅ 10x reduction in notification fatigue (clustering)
- ✅ 90%+ test coverage for all new code

**Business**:
- ✅ Deterministic drift detection (no LLM hallucination)
- ✅ Enterprise-ready control-plane (PlanRun tracking, budgets)
- ✅ Production-grade reliability (validation, rollback)
- ✅ Compliance-ready (immutable audit trail)

---

## Risk Mitigation

### High-Risk Items
1. **Multi-source comparison logic** (Phase 1 Day 4-5) - Complex, requires deep understanding of each source type
2. **Cluster-first notifications** (Phase 2 Day 9-10) - UX paradigm shift, requires user testing
3. **Verify reality UX** (Phase 3 Day 11-13) - Major state machine changes, high regression risk

### Mitigation Strategies
- **Incremental rollout**: Deploy each phase to staging first, validate with real data
- **Feature flags**: Use feature flags for new UX (verify reality, clustering)
- **Comprehensive testing**: 90%+ test coverage for all new code
- **User validation**: Get user feedback on UX changes before full rollout

---

## Next Steps

1. **Review and approve** this revised plan
2. **Prioritize phases** based on business needs
3. **Start Phase 1** (Critical Determinism Fixes) immediately
4. **Set up tracking** for all 12 gaps + 3 patterns
5. **Schedule weekly reviews** to track progress

---

## Appendix: Gap Reference

### 12 Critical Gaps
1. LLM classification before comparison (HIGHEST)
2. Coverage drift as separate type (HIGH)
3. No multi-source comparison (HIGH)
4. No writeback validation (MEDIUM)
5. No rollback mechanism (MEDIUM)
6. DriftPlan not true control-plane (HIGHEST)
7. No immutable SignalEvent (HIGH)
8. No two-stage doc resolution (HIGH)
9. No cluster-first triage (HIGH)
10. No DocBaseline registry (MEDIUM)
11. No comparator outcome enum (MEDIUM)
12. No coverage obligations (MEDIUM)

### 3 User Must-Have Patterns
1. DriftPlan + Coverage Health UI (90% implemented, missing PlanRun)
2. Impact Engine (95% implemented, missing optional IMPACT_ASSESSED state)
3. Verify Reality UX (60% implemented, missing verify actions)

