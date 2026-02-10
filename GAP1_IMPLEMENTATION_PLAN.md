# Gap #1: Deterministic Drift Detection for All Sources

## Executive Summary

**Goal**: Make drift detection deterministic for all 7 sources (currently only GitHub PR works)

**Current Status**: 1/7 sources (14%) have deterministic drift detection
**Target Status**: 7/7 sources (100%) have deterministic drift detection

**Impact**: Fixes 30/35 drift combinations (from 3.3% to 100%)

---

## Current Architecture Assessment

### ✅ What's Already Built

1. **Artifact Extraction** (`apps/api/src/services/baseline/artifactExtractor.ts`):
   - All 7 source extractors exist
   - All extract to common `BaselineArtifacts` interface
   - Extraction is deterministic (same input → same output)

2. **Artifact Comparison** (`apps/api/src/services/baseline/comparison.ts`):
   - `compareArtifacts()` compares source vs doc
   - Detects all 5 drift types (instruction, process, ownership, environment, coverage)
   - Comparison is deterministic (same input → same output)

3. **Integration** (`apps/api/src/services/orchestrator/transitions.ts`):
   - Comparison runs in `handleBaselineChecked()` (lines 1437-1600)
   - Overrides LLM if confidence ≥ 0.6
   - Works for GitHub PR only

### ❌ What's Broken

1. **Flow Order**: LLM runs BEFORE comparison (should be reversed)
2. **Doc Selection**: Based on LLM classification (should use mapping table)
3. **Source Coverage**: Only GitHub PR integrated (need all 7 sources)

---

## Implementation Steps

### Step 1: Move Doc Resolution Earlier (2 hours)

**Current**: `SIGNALS_CORRELATED → DRIFT_CLASSIFIED (LLM) → DOCS_RESOLVED`
**Target**: `SIGNALS_CORRELATED → DOCS_RESOLVED (mapping) → DRIFT_CLASSIFIED (LLM fallback)`

**Changes**:
1. Update `handleSignalsCorrelated()` to transition to `DOCS_RESOLVED` instead of `DRIFT_CLASSIFIED`
2. Update `handleDriftClassified()` to be a fallback state (only reached if comparison is ambiguous)
3. Update state machine flow diagram

**Files**:
- `apps/api/src/services/orchestrator/transitions.ts` (lines 446-511)

### Step 2: Make Doc Resolution Deterministic (3 hours)

**Current**: `handleDriftClassified()` uses LLM drift type to select docs (line 578)
**Target**: Use source-output compatibility matrix (no LLM needed)

**Key Discovery**: `SOURCE_OUTPUT_COMPATIBILITY` already exists in `docTargeting.ts`!
- We can use `SOURCE_OUTPUT_COMPATIBILITY[sourceType]` directly
- No need for drift type classification
- Example: `github_pr` → `['github_readme', 'confluence', 'notion', 'gitbook', 'backstage']`

**Changes**:
1. Update `handleSignalsCorrelated()` to transition to `DOCS_RESOLVED` instead of `DRIFT_CLASSIFIED`
2. Update `handleDriftClassified()` to be a fallback (only called if comparison is ambiguous)
3. Use `SOURCE_OUTPUT_COMPATIBILITY[sourceType]` in doc resolution (no drift type needed)

**Files**:
- `apps/api/src/services/orchestrator/transitions.ts` (lines 446-511, 518-650)

### Step 3: Move Comparison Earlier (4 hours)

**Current**: Comparison runs in `handleBaselineChecked()` (after evidence extraction)
**Target**: Comparison runs in `handleEvidenceExtracted()` (right after evidence is ready)

**Changes**:
1. Move comparison logic from `handleBaselineChecked()` to `handleEvidenceExtracted()`
2. Store comparison result in DriftCandidate
3. Use comparison result to determine next state:
   - If confidence ≥ 0.6 → `PATCH_PLANNED` (skip LLM)
   - If confidence < 0.6 → `DRIFT_CLASSIFIED` (LLM fallback)

**Files**:
- `apps/api/src/services/orchestrator/transitions.ts` (lines 1200-1437)

### Step 4: Extend to All 7 Sources (6 hours)

**Current**: Only GitHub PR has comparison integrated
**Target**: All 7 sources use comparison

**Changes**:
1. Verify all source extractors work correctly:
   - `extractGitHubPRArtifacts()` ✅ DONE
   - `extractPagerDutyArtifacts()` ⚠️ VERIFY
   - `extractSlackArtifacts()` ⚠️ VERIFY
   - `extractAlertArtifacts()` ⚠️ VERIFY
   - `extractIaCArtifacts()` ⚠️ VERIFY
   - `extractCodeownersArtifacts()` ⚠️ VERIFY

2. Test comparison with real data from each source
3. Tune confidence thresholds per source if needed

**Files**:
- `apps/api/src/services/baseline/artifactExtractor.ts` (lines 15-300)

### Step 5: Add Conditional LLM Fallback (2 hours)

**Current**: LLM always runs
**Target**: LLM only runs if comparison is ambiguous (confidence < 0.6)

**Changes**:
1. Add `classificationMethod` field to track 'deterministic' vs 'llm'
2. Skip LLM if comparison confidence ≥ 0.6
3. Log classification method for observability

**Files**:
- `apps/api/src/services/orchestrator/transitions.ts` (lines 446-511)

### Step 6: Update Tests (3 hours)

**Changes**:
1. Add tests for all 7 source extractors
2. Add tests for comparison with each source
3. Add tests for conditional LLM fallback
4. Add end-to-end tests for new flow

**Files**:
- `apps/api/src/services/baseline/__tests__/artifactExtractor.test.ts` (NEW)
- `apps/api/src/services/baseline/__tests__/comparison.test.ts` (NEW)

---

## Total Effort: 20 hours (2.5 days)

---

## Success Criteria

1. ✅ All 7 sources use deterministic comparison
2. ✅ LLM only runs if comparison confidence < 0.6
3. ✅ Doc selection is deterministic (no LLM needed)
4. ✅ Comparison happens BEFORE patch planning
5. ✅ Classification method is tracked ('deterministic' vs 'llm')
6. ✅ All tests pass

---

## Risks & Mitigations

**Risk 1**: Breaking existing GitHub PR flow
**Mitigation**: Keep existing flow as fallback, add feature flag

**Risk 2**: Source extractors not working correctly
**Mitigation**: Test with real data from each source before deploying

**Risk 3**: Confidence thresholds too high/low
**Mitigation**: Start with 0.6, tune based on production data

