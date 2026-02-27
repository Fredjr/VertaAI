# Governance IR Implementation Strategy (No Regressions)

## Overview

This document outlines the **careful, incremental** implementation strategy for the Governance IR architecture that ensures:
- ✅ **Zero regressions** in existing functionality
- ✅ **Backward compatibility** with existing policy packs
- ✅ **Proper integration** with workspace configuration, overlays, pack selection
- ✅ **Incremental rollout** (not a big-bang rewrite)

---

## Current Architecture Analysis

### **What Exists Today** ✅

1. **Pack Selection & Overlay System** (`packSelector.ts`, `packMatcher.ts`)
   - Workspace/service/repo scoped packs
   - Priority-based selection (scopePriority)
   - Merge strategies (MOST_RESTRICTIVE, HIGHEST_PRIORITY, EXPLICIT)
   - Branch filtering, PR event filtering
   - **Status:** ✅ Working, must preserve

2. **Evaluation Pipeline** (`packEvaluator.ts`)
   - Rule evaluation with triggers
   - Comparator execution
   - Finding generation
   - Decision computation
   - **Status:** ✅ Working, must preserve

3. **Partial IR** (`evaluationNormalizer.ts`)
   - `NormalizedEvaluationResult` exists
   - 8-step normalization pipeline
   - Surface extraction, obligation building
   - **Status:** ✅ Working, needs expansion (not replacement)

4. **Evaluation Graph** (`packEvaluator.ts`)
   - `PackEvaluationGraph` with surfaces, obligations, evidence
   - Already structured data (not just strings)
   - **Status:** ✅ Working, can be mapped to new IR

5. **Rendering** (`ultimateOutputRenderer.ts`)
   - Reads from `NormalizedEvaluationResult`
   - Some comparator-specific logic
   - **Status:** ✅ Working, needs to be made fully IR-driven

---

## Implementation Strategy: Layered Approach

### **Phase 1: Extend IR (No Breaking Changes)** 🎯 **WEEK 1-2**

**Goal:** Add new IR entities alongside existing structures, map existing data into new IR.

#### Step 1.1: Create IR Type Definitions (Additive Only)
- Create `apps/api/src/services/gatekeeper/yaml-dsl/ir/types.ts`
- Define `RunContext`, `PolicyPlan`, `ObligationResult`, `GovernanceOutputContract`
- **Key:** These are NEW types, don't modify existing types yet

#### Step 1.2: Create IR Builders (Parallel to Existing Code)
- Create `apps/api/src/services/gatekeeper/yaml-dsl/ir/runContextBuilder.ts`
  - Build `RunContext` from `GatekeeperInput` + `PRContext`
  - Extract signals from files, manifests, service catalog
- Create `apps/api/src/services/gatekeeper/yaml-dsl/ir/policyPlanBuilder.ts`
  - Build `PolicyPlan` from `PackResult[]`
  - Track which packs activated, which overlays applied
  - Record activation reasons (from pack selection logic)
- Create `apps/api/src/services/gatekeeper/yaml-dsl/ir/obligationResultBuilder.ts`
  - Map `NormalizedFinding` → `ObligationResult`
  - Preserve all existing data, add new structured fields

#### Step 1.3: Wire IR Builders into Normalization Pipeline
- Update `evaluationNormalizer.ts` to call IR builders
- **Key:** Build new IR in parallel, don't remove existing fields yet
- Return both old and new structures for backward compatibility

```typescript
// evaluationNormalizer.ts (updated)
export function normalizeEvaluationResults(...): NormalizedEvaluationResult {
  // Existing normalization (unchanged)
  const surfaces = extractAllSurfaces(packResults);
  const obligations = buildNormalizedObligations(...);
  const findings = buildNormalizedFindings(...);
  // ... existing code ...

  // NEW: Build IR in parallel (additive)
  const runContext = buildRunContext(input, prFiles, repoName);
  const policyPlan = buildPolicyPlan(packResults, selectedPacks);
  const obligationResults = buildObligationResults(findings, obligations);

  return {
    // Existing fields (unchanged)
    surfaces,
    obligations,
    findings,
    notEvaluable,
    decision,
    confidence,
    nextActions,
    metadata,
    repoClassification,
    
    // NEW: IR fields (additive)
    ir: {
      runContext,
      policyPlan,
      obligationResults,
    },
  };
}
```

**Success Criteria:**
- ✅ All existing tests pass
- ✅ New IR fields populated correctly
- ✅ No changes to existing output (yet)

---

### **Phase 2: GOC Validator (Runtime Safety)** 🎯 **WEEK 2**

**Goal:** Add contract validation without changing behavior.

#### Step 2.1: Create GOC Validator
- Create `apps/api/src/services/gatekeeper/yaml-dsl/ir/contractValidator.ts`
- Implement 5 invariant checks
- **Key:** Validator runs in "audit mode" first (log violations, don't throw)

#### Step 2.2: Integrate Validator (Audit Mode)
- Call validator after normalization
- Log violations to console + monitoring
- **Don't throw errors yet** - just observe

```typescript
// evaluationNormalizer.ts (updated)
export function normalizeEvaluationResults(...): NormalizedEvaluationResult {
  // ... existing code ...
  
  const result = { /* ... */ };
  
  // NEW: Validate GOC (audit mode - log only)
  const violations = validateGovernanceOutputContract(result, { mode: 'audit' });
  if (violations.length > 0) {
    console.warn(`[GOC] Contract violations detected:`, violations);
    // TODO: Send to monitoring
  }
  
  return result;
}
```

**Success Criteria:**
- ✅ Validator identifies existing violations (if any)
- ✅ No impact on existing behavior
- ✅ Violations logged for analysis

---

### **Phase 3: Migrate Renderer to IR** 🎯 **WEEK 2-3**

**Goal:** Make renderer read from IR, preserve existing output.

#### Step 3.1: Refactor Renderer (IR-First)
- Update `ultimateOutputRenderer.ts` to read from `result.ir.*` fields
- **Key:** Output should be identical to before (regression test)

#### Step 3.2: Remove Direct YAML Access
- Ensure renderer never reads pack YAML directly
- All data comes from IR

**Success Criteria:**
- ✅ Output is byte-for-byte identical to before
- ✅ Renderer is fully IR-driven

---

### **Phase 4: Obligation DSL (Pack Refactoring)** 🎯 **WEEK 3-4**

**Goal:** Standardize pack format without breaking existing packs.

#### Step 4.1: Define Obligation DSL Schema
- Create `apps/api/src/services/gatekeeper/yaml-dsl/dsl/obligationDSL.ts`
- Define schema with backward compatibility

#### Step 4.2: Migrate Packs Incrementally
- Start with 3 comparators (OPENAPI, CODEOWNERS, RUNBOOK)
- Keep old format working alongside new format
- Gradual migration

**Success Criteria:**
- ✅ New DSL packs work correctly
- ✅ Old format packs still work
- ✅ No breaking changes

---

## Integration Points (Must Preserve)

### 1. **Pack Selection** (`packSelector.ts`)
- **Current:** Selects packs based on workspace/service/repo scope
- **IR Integration:** `PolicyPlan` records which packs were selected and why
- **Preservation:** Pack selection logic unchanged, just record decisions

### 2. **Overlay System** (API service overlay, DB service overlay)
- **Current:** Overlays activate based on signals (OpenAPI present, migrations present)
- **IR Integration:** `PolicyPlan.activationLedger` records overlay activation
- **Preservation:** Overlay activation logic unchanged, just record decisions

### 3. **Workspace Configuration** (`WorkspacePolicyPack`)
- **Current:** Database-backed pack configuration with scope/priority/merge strategy
- **IR Integration:** `RunContext` includes workspace context
- **Preservation:** Database schema unchanged, just read additional fields

### 4. **Multi-Pack Evaluation** (`yamlGatekeeperIntegration.ts`)
- **Current:** Evaluates multiple packs, aggregates decisions
- **IR Integration:** `PolicyPlan` tracks all evaluated packs
- **Preservation:** Multi-pack logic unchanged, just record in IR

---

## Risk Mitigation

### **Risk 1: Breaking Existing Packs**
- **Mitigation:** All changes are additive, old format continues to work
- **Validation:** Run existing test suite after each change

### **Risk 2: Performance Regression**
- **Mitigation:** IR building happens in parallel, minimal overhead
- **Validation:** Benchmark evaluation time before/after

### **Risk 3: Output Changes**
- **Mitigation:** Phase 3 includes regression test (output must be identical)
- **Validation:** Compare rendered output byte-for-byte

---

## Next Steps

1. **Review this strategy** - Ensure it preserves all existing functionality
2. **Begin Phase 1** - Create IR types and builders (additive only)
3. **Continuous validation** - Run tests after each change
4. **Incremental rollout** - One phase at a time, validate before proceeding

**This strategy ensures we get to the target IR architecture without breaking anything along the way.**

