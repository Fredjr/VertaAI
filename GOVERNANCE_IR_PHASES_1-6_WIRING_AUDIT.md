# 🔍 GOVERNANCE IR PHASES 1-6: WIRING AUDIT

**Date:** 2026-02-28  
**Status:** 🟡 **MOSTLY WIRED** (Core features active, optional features available)

---

## 📊 PHASE-BY-PHASE WIRING STATUS

### **PHASE 1: IR Types & Schema** ✅ FULLY WIRED

**Status:** ✅ **100% Active**

**What's Wired:**
- ✅ All IR types defined in `ir/types.ts`
- ✅ All Zod schemas defined in `ir/schema.ts`
- ✅ Runtime validation active (validateGovernanceIR)
- ✅ Type inference from Zod schemas

**Evidence:**
- `obligationResultSchema` validates all ObligationResult objects
- `governanceIRSchema` validates complete IR output
- Used in `evaluationNormalizer.ts` and `ultimateOutputRenderer.ts`

**Conclusion:** ✅ **FULLY WIRED - NO ACTION NEEDED**

---

### **PHASE 2: IR Builders** ✅ FULLY WIRED

**Status:** ✅ **100% Active**

**What's Wired:**
- ✅ `runContextBuilder.ts` - Builds RunContext (with Phase 6 fingerprints)
- ✅ `policyPlanBuilder.ts` - Builds PolicyPlan ledger
- ✅ `obligationResultBuilder.ts` - Maps NormalizedFinding → ObligationResult
- ✅ All builders called from `evaluationNormalizer.ts`

**Evidence:**
```typescript
// evaluationNormalizer.ts lines 90-108
const policyPlan = buildPolicyPlan(packResults, signals);
const runContext = buildRunContext(input, prFiles, repoClassification, undefined, undefined, policyPlan);
const obligationResults = findings.map(finding => buildObligationResult(finding));
```

**Conclusion:** ✅ **FULLY WIRED - NO ACTION NEEDED**

---

### **PHASE 3: Obligation DSL** ✅ FULLY WIRED

**Status:** ✅ **100% Active**

**What's Wired:**
- ✅ `obligationDSL.ts` - Fluent API for building ObligationResults
- ✅ All 10 comparators migrated to use DSL
- ✅ Message catalog integration active

**Evidence:**
- All comparators have `evaluateStructured()` method
- All use `createObligation()` builder
- All use `passWithMessage()`, `failWithMessage()`, etc.

**Example:**
```typescript
// changedPathMatches.ts
const obligation = createObligation({...});
return obligation.passWithMessage('pass.trigger.path_matched', {...});
```

**Conclusion:** ✅ **FULLY WIRED - NO ACTION NEEDED**

---

### **PHASE 4: Comparator Migration** ✅ FULLY WIRED

**Status:** ✅ **100% Active**

**What's Wired:**
- ✅ All 10 comparators have `evaluateStructured()` method
- ✅ All return structured `ObligationResult`
- ✅ Legacy `evaluate()` method kept for backward compatibility

**Comparators Migrated:**
1. ✅ artifactPresent
2. ✅ artifactUpdated
3. ✅ openapiSchemaValid
4. ✅ noSecretsInDiff
5. ✅ checkrunsPassed
6. ✅ prTemplateFieldPresent
7. ✅ humanApprovalPresent
8. ✅ minApprovals
9. ✅ actorIsAgent
10. ✅ changedPathMatches

**Conclusion:** ✅ **FULLY WIRED - NO ACTION NEEDED**

---

### **PHASE 5.1-5.4: Schema + Validator + Catalog** ✅ FULLY WIRED

**Status:** ✅ **100% Active**

**What's Wired:**
- ✅ Zod schema with runtime validation
- ✅ Semantic validator (20 invariants)
- ✅ Message catalog (50+ templates)
- ✅ All comparators use message catalog
- ✅ 0% freeform prose achieved

**Conclusion:** ✅ **FULLY WIRED - NO ACTION NEEDED**

---

### **PHASE 5.5: Runtime Validation** ✅ FULLY WIRED

**Status:** ✅ **100% Active**

**What's Wired:**
- ✅ Validation in `evaluationNormalizer.ts` (post-construction)
- ✅ Validation in `ultimateOutputRenderer.ts` (pre-rendering)
- ✅ All 20 invariants enforced in audit mode
- ✅ INVARIANT_16 (0% freeform prose) active

**Conclusion:** ✅ **FULLY WIRED - NO ACTION NEEDED**

---

### **PHASE 6: Fingerprints + Evidence + Confidence** ⚠️ PARTIALLY WIRED

**Status:** ⚠️ **Core Features Active, Optional Features Available**

#### **✅ WIRED: Stable Fingerprints**
- ✅ `evaluationFingerprint` calculated for every evaluation
- ✅ `policyRevision` tracked for every evaluation
- ✅ SHA-256 hash of inputs + policy plan
- ✅ Enables caching and reproducibility

#### **⚠️ AVAILABLE BUT NOT USED: Cross-Artifact Evidence**
- ✅ Types defined in `types.ts`
- ✅ Schema validated in `schema.ts`
- ✅ `crossArtifactRef` field available in `EvidenceItem`
- ❌ **NOT USED:** No comparators emit cross-artifact evidence yet
- ❌ **NOT USED:** No cross-artifact invariant checks yet

**What's Missing:**
- Comparators don't populate `crossArtifactRef` field
- No cross-artifact validation logic implemented

#### **⚠️ AVAILABLE BUT NOT USED: Vector Confidence Model**
- ✅ Types defined in `types.ts` (`ConfidenceBreakdown` with 3 components)
- ✅ Schema defined in `schema.ts` (`confidenceVectorSchema`)
- ❌ **NOT USED:** Builders still use legacy confidence model
- ❌ **NOT USED:** Schema still requires `confidenceBreakdownLegacySchema`

**What's Missing:**
- `buildConfidence()` in `obligationResultBuilder.ts` uses legacy model
- `buildConfidenceBreakdown()` in `runContextBuilder.ts` uses legacy model
- Schema requires legacy confidence, not vector confidence

**Conclusion:** ⚠️ **CORE WIRED, OPTIONAL FEATURES NEED MIGRATION**

---

## 🎯 SUMMARY: WHAT NEEDS TO BE DONE

### **✅ FULLY WIRED (No Action Needed)**
- Phase 1: IR Types & Schema
- Phase 2: IR Builders
- Phase 3: Obligation DSL
- Phase 4: Comparator Migration
- Phase 5.1-5.4: Schema + Validator + Catalog
- Phase 5.5: Runtime Validation
- Phase 6 (Core): Stable Fingerprints

### **⚠️ AVAILABLE BUT NOT USED (Optional Migration)**

#### **1. Cross-Artifact Evidence (Track A Integration)**
**Current State:**
- Types: ✅ Defined
- Schema: ✅ Validated
- Usage: ❌ Not used

**To Activate:**
1. Update comparators to emit cross-artifact evidence
2. Add cross-artifact validation logic
3. Update renderer to display cross-artifact evidence

#### **2. Vector Confidence Model (Track A Integration)**
**Current State:**
- Types: ✅ Defined
- Schema: ✅ Defined (but not required)
- Usage: ❌ Not used

**To Activate:**
1. Migrate `buildConfidence()` to vector model
2. Migrate `buildConfidenceBreakdown()` to vector model
3. Update schema to require vector confidence
4. Update renderer to display vector components

---

## 📋 NEXT STEPS FOR TRACK A INTEGRATION

See `GOVERNANCE_IR_TRACK_A_INTEGRATION_PLAN.md` for detailed implementation plan.

