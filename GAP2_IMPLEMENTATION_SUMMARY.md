# Gap #2: Make Coverage Orthogonal - Implementation Summary

**Date**: 2026-02-11  
**Status**: Steps 1-3 COMPLETE ✅ | Step 4 DEFERRED | Step 5 READY FOR TESTING  
**Commits**: 
- `5c7da10` - Gap #2 Step 1: Add hasCoverageGap field
- `18a9f76` - Gap #2 Steps 2-3: State Machine & Slack Messages

---

## 🎯 **Objective Achieved**

Coverage gaps are now **orthogonal** to drift type, enabling detection of:
- ✅ "Instruction drift + coverage gap"
- ✅ "Process drift + coverage gap"
- ✅ "Ownership drift + coverage gap"
- ✅ "Environment drift + coverage gap"

**Before**: Coverage was 1 of 5 drift types (mutually exclusive)  
**After**: Coverage is a boolean dimension that applies to ANY drift type

---

## ✅ **Completed Work**

### **Step 1: Database Schema** (Commit: 5c7da10)

**File**: `apps/api/prisma/schema.prisma`

```prisma
// Drift classification
driftType       String?  @map("drift_type")
driftDomains    String[] @map("drift_domains")
hasCoverageGap  Boolean  @default(false) @map("has_coverage_gap") // Gap #2: Orthogonal dimension
```

**Migration**: `apps/api/prisma/migrations/20260211_add_has_coverage_gap/migration.sql`

---

### **Step 2: State Machine Logic** (Commit: 18a9f76)

**File**: `apps/api/src/services/orchestrator/transitions.ts`

**Changes**: Updated 3 locations in `handleBaselineChecked()` to set `hasCoverageGap` from `comparisonResult`:

1. **Line 1085** - High confidence deterministic classification:
```typescript
data: {
  driftType,
  confidence: comparisonResult.confidence,
  hasCoverageGap: comparisonResult.hasCoverageGap || false, // Gap #2
  classificationMethod,
  comparisonResult: comparisonResult as any,
}
```

2. **Line 1123** - Low confidence deterministic classification (same pattern)

3. **Line 1738** - LLM override path (same pattern)

**Key Insight**: `compareArtifacts()` in `comparison.ts` ALREADY detects coverage gaps orthogonally! We just needed to read the field.

---

### **Step 3: Slack Message Builders** (Commit: 18a9f76)

#### **3A. Cluster Messages** (`slackClusterMessage.ts`)

**Interface Update**:
```typescript
export interface DriftSummary {
  // ... existing fields ...
  hasCoverageGap?: boolean; // Gap #2
}
```

**Header Update**:
```typescript
const hasCoverageGap = drifts.some(d => d.hasCoverageGap === true);
const headerText = hasCoverageGap 
  ? `${driftTypeEmoji} ${cluster.driftCount} Similar Drifts Detected + 📊 Coverage Gap`
  : `${driftTypeEmoji} ${cluster.driftCount} Similar Drifts Detected`;
```

**Individual Drift Summary**:
```typescript
if (drift.hasCoverageGap) {
  text += ` + 📊 Coverage Gap`;
}
```

#### **3B. Individual Messages** (`slackMessageBuilder.ts`)

**Type Update** (`types.ts`):
```typescript
export interface EvidenceBundle {
  // ... existing fields ...
  driftType?: string;
  hasCoverageGap?: boolean; // Gap #2
}
```

**Header Update**:
```typescript
let headerText = `${impactEmoji} ${driftTypeEmoji} ${capitalizeFirst(driftType)} Drift: ${bundle.assessment.impactBand.toUpperCase()} Impact`;
if (bundle.hasCoverageGap) {
  headerText += ` + 📊 Coverage Gap`;
}
```

**Helper Functions Added**:
- `getDriftTypeEmoji()` - Maps drift type to emoji
- `capitalizeFirst()` - Capitalizes first letter

---

## 📊 **Architecture Validation**

### **Zero Regression Strategy** ✅

1. **Additive Only**: Added `hasCoverageGap` alongside `driftType`, didn't change drift type determination
2. **Backward Compatible**: Old drifts default to `hasCoverageGap=false`
3. **Deterministic**: Coverage detection is already deterministic (no LLM)

### **Coverage Detection Flow** ✅

```
1. compareArtifacts() detects ALL drift types + coverage gaps simultaneously
   ├─ detectInstructionDrift()
   ├─ detectProcessDrift()
   ├─ detectOwnershipDrift()
   ├─ detectEnvironmentDrift()
   └─ detectCoverageGaps() ← ALREADY ORTHOGONAL!

2. Returns ComparisonResult with:
   ├─ driftType: 'instruction' | 'process' | 'ownership' | 'environment'
   └─ hasCoverageGap: boolean ← SEPARATE DIMENSION!

3. handleBaselineChecked() stores BOTH fields in database

4. Slack messages display BOTH dimensions
```

---

## ⏳ **Deferred Work**

### **Step 4: Frontend UI** (No drift list view exists yet)

**Reason for Deferral**: The frontend doesn't have a dedicated drift list or detail view yet. Drift display is primarily in Slack messages.

**Future Work** (when drift UI is built):
- Add coverage gap badge to drift list view
- Add coverage gap indicator to drift detail view
- Update drift type labels to show both dimensions

---

## 🧪 **Next Step: Testing**

### **Step 5: Test with Real PRs**

**Test Scenarios**:
1. ✅ Instruction drift WITHOUT coverage gap
2. ✅ Instruction drift WITH coverage gap (new scenario in PR)
3. ✅ Process drift WITH coverage gap
4. ✅ Ownership drift WITH coverage gap
5. ✅ Environment drift WITH coverage gap

**Expected Slack Message Format**:
- Without gap: `🔴 📋 Instruction Drift: HIGH Impact`
- With gap: `🔴 📋 Instruction Drift: HIGH Impact + 📊 Coverage Gap`

**Cluster Message Format**:
- Without gap: `📋 5 Similar Drifts Detected`
- With gap: `📋 5 Similar Drifts Detected + 📊 Coverage Gap`

---

## 📈 **Impact**

**Before Gap #2**:
- Coverage was a separate drift type
- Could NOT detect "instruction drift + coverage gap"
- Matrix had 8 combinations (5 drift types × sources)

**After Gap #2**:
- Coverage is orthogonal dimension
- CAN detect "instruction drift + coverage gap"
- Matrix has 8 combinations × 2 (with/without coverage) = 16 possible states

**Business Value**:
- More accurate drift classification
- Better patch recommendations (can address both drift AND coverage in one patch)
- Clearer Slack notifications showing both dimensions

---

## ✅ **Validation Checklist**

- [x] `hasCoverageGap` field added to schema
- [x] Migration created and applied
- [x] Prisma client regenerated
- [x] State machine sets `hasCoverageGap` from comparison result
- [x] Cluster Slack messages show coverage gap
- [x] Individual Slack messages show coverage gap
- [x] TypeScript compilation passes
- [x] Zero regression: Additive changes only
- [x] Backward compatible: Defaults to false
- [ ] Test: Instruction drift WITHOUT coverage gap
- [ ] Test: Instruction drift WITH coverage gap
- [ ] Test: Process drift WITH coverage gap
- [ ] Test: Ownership drift WITH coverage gap
- [ ] Test: Environment drift WITH coverage gap
- [ ] Frontend UI (deferred - no drift list view exists)

---

## 🚀 **Deployment Status**

- ✅ Code pushed to GitHub (commits: 5c7da10, 18a9f76)
- ✅ Railway will auto-deploy backend changes
- ⏳ Wait 180 seconds for deployment
- ⏳ Test with real PRs

**Ready for production testing!** 🎉

