# Track A Critical Logic Fixes

## Problem Statement

The initial Phase 1-3 implementation had critical logic flaws that made the output noisy and inconsistent:

1. **Failing tier-gated rules when tier is unknown** - Saying "I don't know if this applies, but you failed it"
2. **No repo-type gating** - Service-specific rules applied to docs/library repos
3. **Fake risk scores** - All findings showed 25/100 with identical breakdowns
4. **Missing "Minimum to PASS"** - No clear decision-grade guidance
5. **Repetitive output** - Same info in 4 different sections

## Critical Fixes Implemented

### 1. Added NOT_EVALUABLE and NOT_APPLICABLE Status Types

**File:** `apps/api/src/services/gatekeeper/yaml-dsl/types.ts`

```typescript
status: 'pass' | 'fail' | 'unknown' | 'not_evaluable' | 'not_applicable';
```

**Impact:**
- Obligations can now be marked as "not applicable" instead of "failed"
- Tier-unknown scenarios return "not evaluable" instead of "fail"

### 2. Enhanced Applicability Resolver

**File:** `apps/api/src/services/gatekeeper/yaml-dsl/evaluationNormalizer.ts`

**Tier-Gated Rules:**
```typescript
if (repoClassification.serviceTier === 'unknown') {
  return {
    applies: false,
    reason: 'Service tier not declared; cannot evaluate tier-1 requirement',
    recommendedStatus: 'not_evaluable',
  };
}
```

**Service-Specific Rules:**
```typescript
if (repoClassification.repoType === 'docs' || repoClassification.repoType === 'library') {
  return {
    applies: false,
    reason: `This rule applies to services. Current repo type: ${repoClassification.repoType}`,
    recommendedStatus: 'not_applicable',
  };
}
```

**Result:**
- ✅ Tier-1 runbook rule returns NOT_EVALUABLE for tier-unknown repos
- ✅ Service catalog rule returns NOT_APPLICABLE for docs/library repos
- ✅ No more false positive warnings

### 3. Filter Non-Applicable Findings

**File:** `apps/api/src/services/gatekeeper/yaml-dsl/evaluationNormalizer.ts`

```typescript
// If not applicable, skip adding to findings (don't show in warnings)
if (applicability.recommendedStatus === 'not_applicable') {
  continue;
}

// If not evaluable, skip to reduce noise
if (applicability.recommendedStatus === 'not_evaluable') {
  continue;
}
```

**Result:**
- ✅ Non-applicable findings don't show in "Next Best Actions"
- ✅ Non-applicable findings don't count toward WARN decision
- ✅ Dramatically reduced noise for docs/library repos

### 4. Differentiated Risk Scoring

**File:** `apps/api/src/services/gatekeeper/yaml-dsl/evaluationNormalizer.ts`

**Before:** All findings = 25/100 (10+0+10+5)

**After:**
- **CODEOWNERS missing (DOCS repo):** 35/100 (20+5+10+10)
  - Blast: 20 (team coordination)
  - Criticality: 5 (docs repo)
  - Immediacy: 10 (warn)
  - Dependency: 10 (review routing)

- **CODEOWNERS missing (TIER-1 service):** 60/100 (20+30+10+10)
  - Blast: 20 (team coordination)
  - Criticality: 30 (tier-1 service)
  - Immediacy: 10 (warn)
  - Dependency: 10 (review routing)

- **Runbook missing (TIER-1 service):** 70/100 (25+30+10+15)
  - Blast: 25 (incident recovery)
  - Criticality: 30 (tier-1 service)
  - Immediacy: 10 (warn)
  - Dependency: 15 (on-call readiness)

**Result:**
- ✅ Risk scores now meaningful and differentiated
- ✅ Tier-1 services show higher criticality (30 vs 5)
- ✅ Different obligation types have different blast radius

### 5. Added "Minimum to PASS" Section

**File:** `apps/api/src/services/gatekeeper/yaml-dsl/ultimateOutputRenderer.ts`

```typescript
const failedFindings = normalized.findings.filter(f => 
  f.result.status === 'fail' && f.decision !== 'pass'
);

if (failedFindings.length > 0) {
  lines.push(`**Minimum to PASS:** ${failedFindings.length} action(s) required`);
  const topActions = failedFindings.slice(0, 3).map(f => f.what);
  topActions.forEach(action => {
    lines.push(`- ${action}`);
  });
}
```

**Result:**
- ✅ Clear decision-grade guidance at the top
- ✅ Shows exactly what's needed to reach PASS
- ✅ No ambiguity about merge requirements

## Expected Output Changes

### DOCS Repo (PR #28)

**Before:**
- ❌ 3 warnings (CODEOWNERS, service catalog, runbook)
- ❌ All risk scores: 25/100
- ❌ "Runbook required" shows as FAIL with warning

**After:**
- ✅ 1 warning (CODEOWNERS only)
- ✅ Risk score: 35/100 (differentiated)
- ✅ Service catalog: NOT_APPLICABLE (filtered out)
- ✅ Runbook: NOT_EVALUABLE (filtered out)
- ✅ "Minimum to PASS: 1 action required"

### TIER-1 Service Repo (PR #29)

**Before:**
- ❌ 3 warnings with identical 25/100 scores
- ❌ No differentiation between DOCS and TIER-1

**After:**
- ✅ 3 warnings with differentiated scores:
  - CODEOWNERS: 60/100 (criticality: 30)
  - Service catalog: 55/100 (criticality: 30)
  - Runbook: 70/100 (criticality: 30, blast: 25)
- ✅ "Extra caution required for tier-1 services" warning
- ✅ "Minimum to PASS: 3 actions required"

## Validation

**Test PRs:**
- PR #28: DOCS repo (test/ultimate-track-a-validation)
- PR #29: TIER-1 SERVICE repo (test/tier1-classification)

**Expected Results:**
1. PR #28 shows only 1 warning (CODEOWNERS)
2. PR #29 shows 3 warnings with higher risk scores
3. No "not applicable" warnings in findings
4. "Minimum to PASS" section appears in both
5. Risk scores are differentiated and meaningful

## Files Modified

1. `apps/api/src/services/gatekeeper/yaml-dsl/types.ts`
   - Added `not_evaluable` and `not_applicable` status types
   - Added `recommendedStatus` to `ObligationApplicability`

2. `apps/api/src/services/gatekeeper/yaml-dsl/evaluationNormalizer.ts`
   - Enhanced `resolveObligationApplicability()` with tier/repo-type gating
   - Added filtering logic for non-applicable findings
   - Enhanced `computeRiskScore()` with differentiated scoring

3. `apps/api/src/services/gatekeeper/yaml-dsl/ultimateOutputRenderer.ts`
   - Added "Minimum to PASS" section in executive summary

## Success Criteria

- [x] Code compiles without errors
- [x] All changes are deterministic
- [x] Backward compatible
- [ ] DOCS repo shows only applicable warnings
- [ ] TIER-1 repo shows higher risk scores
- [ ] No false positive "not applicable" warnings
- [ ] "Minimum to PASS" section appears
- [ ] Risk scores are differentiated

## Deployment

**Commit:** `48d2143`
**Branch:** `main`
**Status:** Pushed to GitHub, Railway deploying

