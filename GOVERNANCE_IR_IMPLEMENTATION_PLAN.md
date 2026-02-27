# Governance IR Implementation Plan (Weeks 1-4 REVISED)

## Overview

This plan integrates the **Canonical Evaluation IR** architecture into the existing Week 1-4 implementation plan, addressing all 9 points from senior architect feedback.

**Goal:** Transform the system from "partial IR with inconsistencies" to "full IR with contract-driven guarantees."

---

## Phase 1: IR + Normalizer (Week 1-2) 🎯 **HIGHEST PRIORITY**

### Week 1: Core IR Entities + Contract Validation

#### Task 1.1: Define IR Type System ✅ (Partial - Needs Expansion)

**Current State:**
- ✅ `NormalizedEvaluationResult` exists in `evaluationNormalizer.ts`
- ❌ Missing `RunContext`, `PolicyPlan`, `ObligationResult` as formal types

**Action Items:**
1. Create `apps/api/src/services/gatekeeper/yaml-dsl/ir/types.ts`
   - Define `RunContext` interface
   - Define `PolicyPlan` interface
   - Define `ObligationResult` interface
   - Define `GovernanceOutputContract` interface
   - Define `ObligationDSL` interface

2. Create `apps/api/src/services/gatekeeper/yaml-dsl/ir/signals.ts`
   - Implement `detectSignals()` function
   - Extract file-based signals (manifests, languages, frameworks)
   - Extract service catalog signals
   - Extract operational signals (runbook, SLO, alerts)

3. Create `apps/api/src/services/gatekeeper/yaml-dsl/ir/confidence.ts`
   - Implement `computeConfidenceBreakdown()` function
   - Separate classification confidence from decision confidence
   - Track confidence sources (explicit vs inferred)

**Success Criteria:**
- ✅ All IR types defined with strict TypeScript interfaces
- ✅ No `any` types in IR definitions
- ✅ IR types are exported and used throughout codebase

---

#### Task 1.2: Implement Governance Output Contract (GOC) Validator

**Purpose:** Enforce invariants before rendering (catch regressions at runtime).

**Action Items:**
1. Create `apps/api/src/services/gatekeeper/yaml-dsl/ir/contract-validator.ts`
   - Implement `validateGovernanceOutputContract()` function
   - Check INVARIANT 1: Counting Consistency
   - Check INVARIANT 2: Decision Basis
   - Check INVARIANT 3: Confidence Display
   - Check INVARIANT 4: Evidence Completeness
   - Check INVARIANT 5: Scope Consistency

2. Integrate validator into normalization pipeline
   - Call `validateGovernanceOutputContract()` after normalization
   - Throw error if contract violated (fail fast)
   - Log contract violations to monitoring

3. Add contract validation tests
   - Test each invariant violation scenario
   - Ensure validator catches all known regressions

**Success Criteria:**
- ✅ Contract validator catches all 5 invariants
- ✅ Validator runs on every evaluation (no bypassing)
- ✅ Contract violations fail the run (not just warnings)

---

#### Task 1.3: Refactor Normalizer to Produce Full IR

**Current State:**
- ✅ `normalizeEvaluationResult()` exists
- ❌ Doesn't produce `RunContext` or `PolicyPlan`
- ❌ Doesn't track overlay activation/suppression

**Action Items:**
1. Update `evaluationNormalizer.ts` to produce full IR
   - Build `RunContext` from PR context + detected signals
   - Build `PolicyPlan` with activation ledger
   - Build `ObligationResult[]` with structured evidence/remediation
   - Return complete IR (not partial)

2. Separate applicability from evidence
   - `applicability.confidence` → how certain we are this obligation applies
   - `evidence.confidence` → how certain we are about the evidence
   - Never conflate the two

3. Track overlay activation/suppression
   - Record which overlays activated and why
   - Record which overlays suppressed and how to activate
   - Store in `PolicyPlan.activationLedger`

**Success Criteria:**
- ✅ Normalizer produces complete IR (all entities)
- ✅ Applicability and evidence are cleanly separated
- ✅ Overlay ledger tracks all activation decisions

---

### Week 2: Adaptive Renderer + Pack Refactoring

#### Task 2.1: Refactor Renderer to Read Only from IR

**Current State:**
- ✅ `ultimateOutputRenderer.ts` exists
- ❌ Some strings come from pack YAML (not IR)
- ❌ Renderer is not fully adaptive

**Action Items:**
1. Update `ultimateOutputRenderer.ts` to read only from IR
   - Remove all direct YAML string access
   - Use `ObligationResult.remediation` (not pack strings)
   - Use `ObligationResult.risk` (not hardcoded values)

2. Make renderer adaptive based on IR
   - If only `repo_invariant` → show "Repo Governance Controls"
   - If `diff_derived` → show "Change Surface Summary"
   - If classification confidence low → show "How to make applicability explicit"
   - Collapse irrelevant sections (e.g., no change surface for baseline checks)

3. Implement section selection logic
   - Create `selectSections(ir: EvaluationIR): Section[]`
   - Each section has: `id`, `title`, `shouldShow`, `content`
   - Renderer iterates sections and renders only if `shouldShow === true`

**Success Criteria:**
- ✅ Renderer reads 100% from IR (0% from YAML)
- ✅ Sections are adaptive (not fixed templates)
- ✅ Irrelevant sections are suppressed

---

#### Task 2.2: Refactor Packs to Produce Obligation DSL

**Current State:**
- ❌ Packs have inconsistent shapes
- ❌ Some packs write output strings directly

**Action Items:**
1. Create `apps/api/src/services/gatekeeper/yaml-dsl/dsl/obligation-dsl.ts`
   - Define `ObligationDSL` schema
   - Implement `compileObligationDSL()` function
   - Validate DSL at pack load time

2. Refactor existing packs to DSL format
   - Start with `CODEOWNERS`, `OPENAPI_SCHEMA_VALID`, `RUNBOOK`
   - Move remediation strings to `remediationTemplate`
   - Move "why it matters" to `explainTemplate`
   - Define `riskModel` explicitly

3. Remove all output strings from YAML
   - Packs only define: activation, scope, evidence query, templates
   - Templates use placeholders: `{{repo_type}}`, `{{tier}}`, `{{file_path}}`
   - Renderer fills placeholders at runtime

**Success Criteria:**
- ✅ All packs conform to Obligation DSL
- ✅ No output strings in YAML (only templates)
- ✅ DSL validation catches malformed packs

---

## Phase 2: Policy Plan Ledger + UI Parity (Week 3)

### Week 3: Policy Plan Ledger + Audit Trail

#### Task 3.1: Implement Policy Plan Ledger

**Purpose:** Track overlay activation/suppression as first-class IR object.

**Action Items:**
1. Create `apps/api/src/services/gatekeeper/yaml-dsl/ir/policy-plan.ts`
   - Implement `buildPolicyPlan()` function
   - Track base packs + overlays
   - Record activation reasons
   - Record suppression reasons + how to activate

2. Integrate ledger into evaluation pipeline
   - Build ledger before evaluation
   - Pass ledger to renderer
   - Show ledger in "Policy Activation" section

3. Add ledger to IR output
   - Include in `EvaluationIR.policyPlan`
   - Persist to database for audit trail
   - Expose via API for workspace UI

**Success Criteria:**
- ✅ Ledger tracks all overlay decisions
- ✅ Suppressed overlays show "how to activate"
- ✅ Ledger is auditable (persisted + queryable)

---

#### Task 3.2: UI Parity (Same IR → Multiple Outputs)

**Purpose:** Same IR powers GitHub PR output, workspace UI, audit log.

**Action Items:**
1. Create `apps/api/src/services/gatekeeper/yaml-dsl/renderers/`
   - `github-pr-renderer.ts` (existing, refactored)
   - `workspace-ui-renderer.ts` (new - JSON for UI)
   - `audit-log-renderer.ts` (new - structured log)

2. All renderers read from same IR
   - No renderer-specific logic in normalizer
   - Renderers only differ in format (Markdown vs JSON vs Log)

3. Validate parity
   - Same IR → same data in all outputs
   - GitHub shows Markdown, workspace shows JSON, audit shows structured log
   - All outputs pass GOC validation

**Success Criteria:**
- ✅ 3 renderers (GitHub, workspace, audit)
- ✅ All read from same IR
- ✅ Parity validated (same data, different formats)

---

## Phase 3: Comparator Coverage + End-to-End Validation (Week 4)

### Week 4: Complete Comparator Coverage + Validation

#### Task 4.1: Upgrade Remaining Comparators to DSL

**Action Items:**
1. Upgrade 8 remaining comparators to Obligation DSL
   - `CHECKRUNS_PASSED`
   - `APPROVAL_REQUIRED`
   - `ARTIFACT_UPDATED`
   - `ARTIFACT_PRESENT`
   - `PARITY_INVARIANT`
   - `SECRET_SCAN`
   - `PR_FIELD_PRESENT`
   - `FILE_CHANGED`

2. For each comparator:
   - Define `riskModel` (blast radius, criticality, immediacy, dependency)
   - Define `remediationTemplate` (steps + patch)
   - Define `explainTemplate` (why it matters + governance impact)
   - Add to Obligation DSL registry

**Success Criteria:**
- ✅ 11/11 comparators use Obligation DSL
- ✅ All have calibrated risk scores
- ✅ All have specific remediation guidance

---

#### Task 4.2: End-to-End Validation

**Action Items:**
1. Create comprehensive test matrix
   - Test all pack/overlay/surface combinations
   - Validate IR structure for each
   - Validate GOC for each
   - Validate output quality for each

2. Run invariant tests
   - All 6 invariants pass for all combinations
   - No regressions in counting, confidence, evidence

3. Validate governance-grade output
   - No "bot-speak" in any output
   - All outputs show deterministic decisions
   - All outputs show transparent confidence
   - All outputs show actionable remediation

**Success Criteria:**
- ✅ 100% of test matrix passes
- ✅ All invariants pass
- ✅ All outputs are governance-grade

---

## Summary: Before vs After

### BEFORE (Current State)
- Partial IR (`NormalizedEvaluationResult`)
- No contract validation (invariants tested, not enforced)
- Packs write output strings
- Renderer is partially adaptive
- Applicability/evidence conflated
- No policy plan ledger

### AFTER (Target State)
- Full IR (`RunContext`, `PolicyPlan`, `ObligationResult`)
- GOC validation enforced at runtime
- Packs produce data only (Obligation DSL)
- Renderer is fully adaptive
- Applicability/evidence cleanly separated
- Policy plan ledger tracks all decisions

---

## Next Steps

1. **Immediate:** Review and approve this plan
2. **Week 1:** Implement IR types + GOC validator
3. **Week 2:** Refactor renderer + packs to DSL
4. **Week 3:** Implement policy plan ledger + UI parity
5. **Week 4:** Complete comparator coverage + validation

**This plan addresses all 9 points from senior architect feedback and ensures systematic consistency across all use cases.**

