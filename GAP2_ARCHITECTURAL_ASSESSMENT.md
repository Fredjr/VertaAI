# Gap #2: Make Coverage Orthogonal - Architectural Assessment

**Date**: 2026-02-11  
**Status**: Step 1 Complete (Schema), Steps 2-4 In Progress  
**Architect**: Senior System Architect

---

## 🎯 **Objective**

Make coverage gaps **orthogonal** to drift type, enabling detection of:
- "Instruction drift + coverage gap"
- "Process drift + coverage gap"
- "Ownership drift + coverage gap"
- "Environment drift + coverage gap"

**Current State**: Coverage is a separate drift type (1 of 5)  
**Target State**: Coverage is a boolean dimension that applies to ANY drift type

---

## 📊 **Current Architecture Analysis**

### **1. Drift Matrix (35 Combinations)**

Currently we have **8 explicit combinations** in `driftMatrix.ts`:

| Drift Type | Source | Count |
|------------|--------|-------|
| instruction | github, slack | 2 |
| process | incident | 1 |
| ownership | pagerduty, codeowners | 2 |
| **coverage** | **slack, incident** | **2** ← THESE BECOME ORTHOGONAL |
| environment | github | 1 |

**Total**: 8 combinations (not 35 - the matrix is sparse)

**Key Insight**: The drift matrix does NOT need to change! It defines patch styles and confidence ranges for drift types. Coverage gaps are detected SEPARATELY in `compareArtifacts()`.

---

## 🔍 **Current Coverage Detection Flow**

### **Step 1: Artifact Comparison** (`comparison.ts`)

```typescript
export function compareArtifacts(args): ComparisonResult {
  // Detect all drift types simultaneously
  const instructionDrift = detectInstructionDrift(sourceArtifacts, docArtifacts);
  const processDrift = detectProcessDrift(sourceArtifacts, docArtifacts);
  const ownershipDrift = detectOwnershipDrift(sourceArtifacts, docArtifacts);
  const environmentDrift = detectEnvironmentDrift(sourceArtifacts, docArtifacts);
  const coverageGaps = detectCoverageGaps(sourceArtifacts, docArtifacts); // ✅ ALREADY SEPARATE!
  
  // Determine primary drift type (highest confidence)
  const primaryDrift = /* ... */;
  
  return {
    driftType: primaryDrift?.type || 'instruction',
    confidence: primaryDrift?.confidence || 0,
    hasDrift: driftTypes.length > 0,
    hasCoverageGap: coverageGaps.hasGap, // ✅ ALREADY ORTHOGONAL!
    coverageGaps: coverageGaps.gaps || [],
    // ...
  };
}
```

**✅ GOOD NEWS**: `compareArtifacts()` ALREADY detects coverage gaps separately!  
**✅ GOOD NEWS**: `ComparisonResult` ALREADY has `hasCoverageGap` field!

### **Step 2: State Machine** (`transitions.ts`)

**Current Flow**:
1. `handleDocContextExtracted()` - Runs `compareArtifacts()`
2. Stores `comparisonResult` in database
3. `handleBaselineChecked()` - Reads `comparisonResult.driftType` and sets `drift.driftType`
4. **PROBLEM**: Does NOT read `comparisonResult.hasCoverageGap` ❌

**Required Fix**: Update `handleBaselineChecked()` to ALSO set `drift.hasCoverageGap`

---

## 🏗️ **Architecture Decision: Where to Modify**

### **✅ NO CHANGES NEEDED**:
1. **`comparison.ts`** - Already detects coverage gaps orthogonally
2. **`driftMatrix.ts`** - Defines patch styles, not coverage detection
3. **`artifactExtractor.ts`** - Already extracts scenarios/features/errors
4. **Schema** - Already has `hasCoverageGap` field (Step 1 complete)

### **✅ CHANGES REQUIRED**:

| File | Function | Change | Risk |
|------|----------|--------|------|
| `transitions.ts` | `handleBaselineChecked()` | Set `hasCoverageGap` from `comparisonResult` | **LOW** - Additive only |
| `slackMessageBuilder.ts` | `buildSlackMessage()` | Show coverage gap indicator | **LOW** - UI only |
| `apps/web/src/app/drifts/` | Drift list/detail views | Display coverage gap badge | **LOW** - UI only |

---

## 🔒 **Zero Regression Strategy**

### **Principle 1: Additive Only**
- **DO**: Add `hasCoverageGap` field alongside `driftType`
- **DON'T**: Change how `driftType` is determined
- **DON'T**: Remove 'coverage' from drift type enum (backward compatibility)

### **Principle 2: Backward Compatible**
- Old drifts without `hasCoverageGap` field → default to `false`
- Existing 'coverage' drift type → still valid, just deprecated
- Migration path: `driftType='coverage'` → `driftType='instruction' + hasCoverageGap=true`

### **Principle 3: Deterministic**
- Coverage gap detection is ALREADY deterministic (artifact comparison)
- No LLM involved in coverage detection
- Same input → same output

---

## 📋 **Implementation Plan**

### **Step 2: Update State Machine Logic** (1 hour)

**File**: `apps/api/src/services/orchestrator/transitions.ts`

**Function**: `handleBaselineChecked()` (lines ~1015-1150)

**Change**:
```typescript
// BEFORE (current):
await prisma.driftCandidate.update({
  where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
  data: {
    driftType: comparisonResult.driftType,
    confidence: comparisonResult.confidence,
    comparisonResult: comparisonResult as any,
    classificationMethod: 'deterministic',
  },
});

// AFTER (Gap #2):
await prisma.driftCandidate.update({
  where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
  data: {
    driftType: comparisonResult.driftType,
    confidence: comparisonResult.confidence,
    hasCoverageGap: comparisonResult.hasCoverageGap || false, // ✅ NEW
    comparisonResult: comparisonResult as any,
    classificationMethod: 'deterministic',
  },
});
```

**Testing**: All 7 source types × 4 drift types = 28 combinations (coverage is now orthogonal)

---

## 📝 **Implementation Status**

1. ✅ **Step 1**: Add `hasCoverageGap` field to schema (COMPLETE)
2. ✅ **Step 2**: Update `handleBaselineChecked()` to set `hasCoverageGap` (COMPLETE)
3. ✅ **Step 3**: Update Slack message builders to show coverage gap (COMPLETE)
4. ⏳ **Step 4**: Update frontend UI to display coverage gap (DEFERRED - No drift list view exists yet)
5. ⏳ **Step 5**: Test with real PRs (NEXT)

**Completed Work**:
- ✅ Schema migration with `hasCoverageGap` field
- ✅ State machine updates in 3 locations in `transitions.ts`
- ✅ Cluster message builder updated (`slackClusterMessage.ts`)
- ✅ Individual message builder updated (`slackMessageBuilder.ts`)
- ✅ EvidenceBundle type updated with `driftType` and `hasCoverageGap`
- ✅ TypeScript compilation passes

**Deferred Work**:
- ⏳ Frontend drift list view (doesn't exist yet - will be created in future sprint)
- ⏳ Frontend drift detail view (doesn't exist yet - will be created in future sprint)

**Total Time Spent**: 2 hours
**Risk Level**: **LOW** (additive changes only, no breaking changes)

---

## ✅ **Validation Checklist**

- [ ] `hasCoverageGap` is set correctly in `handleBaselineChecked()`
- [ ] Slack messages show both drift type AND coverage gap
- [ ] Frontend displays coverage gap badge
- [ ] Test: Instruction drift WITHOUT coverage gap
- [ ] Test: Instruction drift WITH coverage gap
- [ ] Test: Process drift WITH coverage gap
- [ ] Test: Ownership drift WITH coverage gap
- [ ] Test: Environment drift WITH coverage gap
- [ ] Backward compatibility: Old drifts still work
- [ ] No regression: Existing drift detection unchanged

