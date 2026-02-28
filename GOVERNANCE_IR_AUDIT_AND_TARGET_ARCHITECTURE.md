# 🔍 GOVERNANCE IR: PHASE 1-4 AUDIT + TARGET ARCHITECTURE

**Date:** 2026-02-28
**Status:** 🔴 **CRITICAL GAPS IDENTIFIED**
**Architect:** Senior Architect Review

---

## 📊 EXECUTIVE SUMMARY

**Current State:** Phases 1-4 are "directionally correct" but have **7 critical architectural gaps** that will allow inconsistency, "bot-ness," and regressions to leak through.

**Target State:** Governance-grade compiler pipeline with versioned schemas, message catalogs, stable fingerprints, vector confidence, and cross-artifact invariants.

**Risk Level:** 🔴 **HIGH** - Without fixes, the system will drift back to inconsistent output despite IR foundation.

**Bugs Found:** 3 critical bugs in existing implementation (confidence computation, ID stability, normalizer wiring)

---

## 🐛 BUGS & STALLED CODE IDENTIFIED

### **BUG 1: Confidence Uses Multiplication (Line 107, 132 in obligationDSL.ts)** 🔴

**Location:** `apps/api/src/services/gatekeeper/yaml-dsl/ir/obligationDSL.ts`

**Issue:**
```typescript
// Line 104-108 (PASS case)
confidence: {
  applicability: 1.0,
  evidence: 1.0,
  overall: 1.0, // ❌ Hardcoded, not computed
},

// Line 129-133 (FAIL case)
confidence: params.confidence || {
  applicability: 1.0,
  evidence: 1.0,
  overall: 1.0, // ❌ Defaults to multiplication (applicability × evidence)
},
```

**Problem:**
- `overall` is hardcoded to 1.0 or defaults to multiplication
- Doesn't match the 3-layer model in `evaluationNormalizer.ts` (lines 950-1060)
- Inconsistent semantics across codebase

**Impact:**
- Misleading confidence scores
- Can't distinguish classification vs decision confidence
- UX confusion (low applicability but high overall confidence)

**Fix Required:**
- Remove `overall` field from DSL
- Compute `overall` in normalizer based on policy (min, max, or weighted)
- Use vector model (classification, applicability, evidence, decision)

---

### **BUG 2: Obligation IDs Are Not Stable (Line 39-45 in obligationDSL.ts)** 🔴

**Location:** `apps/api/src/services/gatekeeper/yaml-dsl/ir/obligationDSL.ts`

**Issue:**
```typescript
export interface ObligationParams {
  id: string; // ❌ No guidance on stability, no validation
  title: string;
  controlObjective: string;
  scope: ObligationScope;
  decisionOnFail: 'block' | 'warn' | 'pass';
}
```

**Problem:**
- No enforcement of stable ID format
- Comparators can use arbitrary IDs (e.g., `uuidv4()`)
- Same obligation gets different IDs across runs
- Audit trail is broken

**Evidence:**
```typescript
// apps/api/src/services/gatekeeper/yaml-dsl/comparators/artifact/artifactPresent.ts:45
const obligation = createObligation({
  id: `artifact-present-${artifactType}`, // ✅ Stable (good)
  // ...
});

// But nothing prevents:
const obligation = createObligation({
  id: uuidv4(), // ❌ Unstable (bad)
  // ...
});
```

**Impact:**
- Can't track obligation history
- Can't reproduce evaluations
- Fingerprints are meaningless

**Fix Required:**
- Add ID validation (must match pattern: `${packId}:${ruleId}:${scope}`)
- Add `evaluationFingerprint` to IR
- Add `policyRevision` to IR
- Document stable ID requirements

---

### **BUG 3: Normalizer Doesn't Prefer evaluateStructured() Consistently** 🟡

**Location:** `apps/api/src/services/gatekeeper/yaml-dsl/evaluationNormalizer.ts`

**Issue:**
- Normalizer builds IR from `packResults` (line 63-66)
- But `packResults` come from `PackEvaluator` which calls `comparatorRegistry.evaluate()`
- Registry prefers `evaluateStructured()` (line 81-91 in `registry.ts`)
- But normalizer doesn't know if structured or legacy path was used

**Problem:**
- No visibility into which comparators used structured vs legacy path
- Can't enforce "all comparators must use structured" policy
- Can't deprecate legacy path safely

**Evidence:**
```typescript
// apps/api/src/services/gatekeeper/yaml-dsl/evaluationNormalizer.ts:63-66
const obligations = buildNormalizedObligations(packResults, surfaces, repoClassification);
// ❌ packResults is opaque - can't tell if it came from evaluateStructured() or evaluate()

// apps/api/src/services/gatekeeper/yaml-dsl/comparators/registry.ts:81-91
if (comparator.evaluateStructured) {
  const structuredResult = await comparator.evaluateStructured(scopedContext, params);
  result = convertObligationResultToComparatorResult(structuredResult, comparatorId);
  console.log(`[ComparatorRegistry] Used evaluateStructured() for ${comparatorId}`);
} else {
  result = await comparator.evaluate(scopedContext, params);
  console.log(`[ComparatorRegistry] Used evaluate() for ${comparatorId}`);
}
// ✅ Registry logs which path was used, but normalizer doesn't see this
```

**Impact:**
- Can't measure migration progress
- Can't enforce structured-only policy
- Regressions can slip through

**Fix Required:**
- Add `evaluationMethod: 'structured' | 'legacy'` to `ComparatorResult`
- Normalizer checks and logs method distribution
- Add telemetry for migration tracking
- Eventually enforce `evaluationMethod === 'structured'`

---

## 🔴 CRITICAL GAPS IDENTIFIED (Phase 1-4 Audit)

### **GAP 1: IR is TypeScript Types, Not Versioned Schema** 🔴

**Current State:**
- `ir/types.ts` defines TypeScript interfaces
- No runtime schema validation (Zod/JSON Schema)
- No `irVersion` field in IR
- Enums exist but not enforced at runtime

**Risk:**
- Packs can emit "almost IR" variants
- No compile-time guarantee of enum values
- Output drifts over time as types evolve

**Evidence:**
```typescript
// apps/api/src/services/gatekeeper/yaml-dsl/ir/types.ts
export interface ObligationResult {
  id: string;
  status: 'PASS' | 'FAIL' | 'SUPPRESSED' | 'NOT_EVALUABLE' | 'INFO'; // ❌ String literal, not runtime enum
  scope: 'repo_invariant' | 'diff_derived' | 'environment_gate'; // ❌ String literal
  reasonCode: ReasonCode; // ✅ Enum, but not validated at runtime
}
```

**Fix Required:**
- Convert to Zod schema with strict enums
- Add `irVersion: "1.0"` to every IR
- Runtime validation before rendering

---

### **GAP 2: GOC Has Only 5 Invariants (Need ~20)** 🔴

**Current State:**
- `contractValidator.ts` enforces 5 basic invariants:
  1. Counting consistency
  2. Decision basis
  3. Confidence display
  4. Evidence completeness
  5. Scope consistency

**Risk:**
- Doesn't prevent:
  - Contradictory confidence scores
  - Suppressed items shown in summary
  - Non-actionable remediation
  - Freeform prose leaking through
  - Cross-artifact parity violations

**Evidence:**
```typescript
// apps/api/src/services/gatekeeper/yaml-dsl/ir/contractValidator.ts
// Only 5 invariants validated
validateCountingConsistency()
validateDecisionBasis()
validateConfidenceDisplay()
validateEvidenceCompleteness()
validateScopeConsistency()
```

**Fix Required:**
- Expand to ~20 invariants across 3 layers:
  - **Structural** (5): Counting, partitioning, required fields
  - **Decision** (8): Derivation, thresholds, basis, robustness
  - **User-Trust** (7): Actionable remediation, no contradictions, no freeform prose

---

### **GAP 3: Normalizer Conflates Compiler/Evaluator/Normalizer** 🔴

**Current State:**
- `evaluationNormalizer.ts` does too much:
  - Interprets pack-specific content
  - Builds IR from raw results
  - Computes derived values
  - Enforces invariants

**Risk:**
- Becomes a brittle mapping layer
- Packs can keep producing bespoke shapes
- Normalizer has to "guess" intent

**Evidence:**
```typescript
// apps/api/src/services/gatekeeper/yaml-dsl/evaluationNormalizer.ts
// Lines 47-149: Normalizer does EVERYTHING
export function normalizeEvaluationResults(
  packResults: PackResult[], // ❌ Raw, unstructured
  globalDecision: 'pass' | 'warn' | 'block',
  prFiles?: GitHubFile[],
  repoName?: string,
  gatekeeperInput?: GatekeeperInput
): NormalizedEvaluationResult {
  // Step 1-8: Extract, build, convert, compute, generate...
  // ❌ This should be split into Compiler → Evaluator → Normalizer
}
```

**Fix Required:**
- **Compiler:** YAML/DSL → PolicyPlan + ObligationSpecs (static)
- **Evaluator:** ObligationSpecs + Evidence → ObligationResults (dynamic)
- **Normalizer:** Enforces invariants + fills derived fields (pure)

---

### **GAP 4: Comparators Emit Freeform Strings** 🟡

**Current State:**
- Comparators use `reasonHuman` with freeform text
- No message catalog
- Prose is hardcoded in comparators

**Risk:**
- "Botty" inconsistent prose
- Can't localize or A/B test messages
- Pack extensibility requires code changes

**Evidence:**
```typescript
// apps/api/src/services/gatekeeper/yaml-dsl/comparators/artifact/artifactPresent.ts
return obligation.fail({
  reasonCode: 'ARTIFACT_MISSING',
  reasonHuman: `Artifact ${artifactType} not found. Expected paths: ${expectedPaths.join(', ')}`, // ❌ Freeform
  // ...
});
```

**Fix Required:**
- Message catalog (i18n-style templates)
- Comparators emit message IDs + parameters
- Renderer owns prose via templates

---

### **GAP 5: Confidence Uses Multiplication (Often Wrong)** 🟡

**Current State:**
- `confidence.overall = applicability × evidence`
- Simple but misleading

**Risk:**
- Low applicability but high decision confidence → confusing UX
- Multiplication yields weird results

**Evidence:**
```typescript
// apps/api/src/services/gatekeeper/yaml-dsl/ir/obligationDSL.ts
confidence: {
  applicability: 1.0,
  evidence: 1.0,
  overall: 1.0, // ❌ Computed as product
}
```

**Fix Required:**
- Vector confidence model:
  - `classificationConfidence`
  - `applicabilityConfidence` (per obligation)
  - `evidenceConfidence` (per obligation)
  - `decisionConfidence` (derived from basis, not product)

---

### **GAP 6: No Stable IDs or Fingerprints** 🔴

**Current State:**
- Obligation IDs are generated dynamically
- No `evaluationFingerprint`
- No `policyRevision`
- No stable sorting

**Risk:**
- Same run, different order
- Rule IDs change when renamed
- Can't reproduce evaluations
- Audit trail is broken

**Evidence:**
```typescript
// apps/api/src/services/gatekeeper/yaml-dsl/ir/obligationDSL.ts
export interface ObligationParams {
  id: string; // ❌ No guidance on stability
  title: string;
  controlObjective: string;
  scope: ObligationScope;
  decisionOnFail: 'block' | 'warn' | 'pass';
}
// ❌ No evaluationFingerprint, policyRevision, stable sorting
```

**Fix Required:**
- Stable `obligationId` (immutable)
- Stable `ruleId` and `packId`
- `evaluationFingerprint` (hash of PolicyPlan + inputs)
- `policyRevision` (git sha or bundle hash)
- Stable sorting (severity → risk → id)

---

### **GAP 7: Evidence Model Doesn't Support Cross-Artifact Invariants** 🔴

**Current State:**
- Evidence is file/content/checkrun/approval/artifact
- No cross-artifact parity support
- No invariant graph

**Risk:**
- Can't express "OpenAPI ↔ Code parity"
- Can't express "Dashboard ↔ Alert parity"
- Product differentiation is blocked

**Evidence:**
```typescript
// apps/api/src/services/gatekeeper/yaml-dsl/ir/types.ts
export interface EvidenceItem {
  type: 'file' | 'content' | 'checkrun' | 'approval' | 'artifact' | 'api_call'; // ❌ No cross-artifact types
  location: string;
  found: boolean;
  details?: string;
  metadata?: Record<string, any>;
}
```

**Fix Required:**
- Add evidence types:
  - `file_presence`, `content_match`, `schema_diff`, `endpoint_parity`, `ownership_map`, `dashboard_alert_parity`
- Add cross-link graph:
  - `ArtifactRef` nodes (openapi, runbook, dashboard, codeowners)
  - `InvariantRef` edges (dashboard↔alert)

---

## 🎯 TARGET ARCHITECTURE (Governance-Grade v2.0)

### **Phase 5: IR Schema + Semantic Validator Suite**

**Deliverables:**
1. **IR v1.0 Zod Schema** (`ir/schema.ts`)
   - Convert all TS types to Zod schemas
   - Add `irVersion: "1.0"` field
   - Strict enums for status, scope, decisionOnFail, reasonCode
   - Runtime validation before rendering

2. **Semantic Validator Suite** (`ir/semanticValidator.ts`)
   - ~20 invariants across 3 layers
   - Structural, Decision, User-Trust
   - Actionable error messages

3. **Message Catalog** (`ir/messageCatalog.ts`)
   - i18n-style templates
   - Comparators emit message IDs + params
   - Renderer owns prose

**Timeline:** Week 1-2

---

### **Phase 6: PolicyPlan Ledger + Evidence Typing**

**Deliverables:**
1. **PolicyPlan Ledger** (mandatory)
   - Every evaluation includes PolicyPlan
   - Activation ledger is source of truth
   - Overlay suppression is explicit

2. **Evidence Typing** (`ir/evidenceTypes.ts`)
   - Add cross-artifact evidence types
   - Add invariant graph (lightweight)
   - Support parity checks

3. **Stable IDs + Fingerprints**
   - `evaluationFingerprint` (hash of PolicyPlan + inputs)
   - `policyRevision` (git sha or bundle hash)
   - Stable sorting (severity → risk → id)

**Timeline:** Week 3-4

---

### **Phase 7: Compiler/Evaluator/Normalizer Split**

**Deliverables:**
1. **Compiler** (`compiler.ts`)
   - YAML/DSL → PolicyPlan + ObligationSpecs (static)
   - No runtime evaluation
   - Pure transformation

2. **Evaluator** (`evaluator.ts`)
   - ObligationSpecs + Evidence → ObligationResults (dynamic)
   - Calls comparators
   - Collects evidence

3. **Normalizer** (`normalizer.ts`)
   - Enforces invariants
   - Fills derived fields (counts, decision, confidence)
   - Pure function (no interpretation)

**Timeline:** Week 5-6

---

### **Phase 8: Pack Migration + Cross-Artifact Invariants**

**Deliverables:**
1. **Incremental Pack Migration**
   - Migrate packs to Obligation DSL behind feature flags
   - Use adapters for compatibility
   - Gradual rollout

2. **Cross-Artifact Comparators**
   - Dashboard ↔ Alert parity
   - OpenAPI ↔ Code consistency
   - Runbook ↔ Service catalog alignment
   - CODEOWNERS ↔ Docs ownership

**Timeline:** Ongoing

---

## 📋 EXPANDED GOC INVARIANTS (~20)

### **Structural Invariants (5)**

1. **INVARIANT_1_COUNTING_CONSISTENCY** ✅ (Existing)
   - `considered = enforced + suppressed + notEvaluable + informational`

2. **INVARIANT_2_PARTITION_COMPLETENESS** (NEW)
   - Every obligation appears in exactly one partition

3. **INVARIANT_3_REQUIRED_FIELDS** (NEW)
   - All required fields present (id, title, status, reasonCode, evidence, remediation)

4. **INVARIANT_4_ENUM_VALIDITY** (NEW)
   - All enum fields use valid values (status, scope, decisionOnFail)

5. **INVARIANT_5_SCOPE_CONSISTENCY** ✅ (Existing)
   - Scope flags match obligation scopes

---

### **Decision Invariants (8)**

6. **INVARIANT_6_DECISION_BASIS** ✅ (Existing)
   - Decision based on enforced obligations only (never suppressed)

7. **INVARIANT_7_DECISION_DERIVATION** (NEW)
   - Global decision = max(enforced obligations' decisionOnFail)

8. **INVARIANT_8_THRESHOLD_CONSISTENCY** (NEW)
   - Thresholds consistent with decisionOnFail

9. **INVARIANT_9_ROBUSTNESS_ACCURACY** (NEW)
   - Robustness matches evaluation type (deterministic_baseline vs diff_analysis)

10. **INVARIANT_10_SUPPRESSED_NEVER_TRIGGERED** (NEW)
    - Suppressed obligations never appear in triggered list

11. **INVARIANT_11_DECISION_CONFIDENCE_BASIS** (NEW)
    - Decision confidence references decision basis (deterministic → HIGH, LLM → MEDIUM)

12. **INVARIANT_12_NO_CONTRADICTORY_DECISIONS** (NEW)
    - No obligation has status=PASS but decisionOnFail=block

13. **INVARIANT_13_DECISION_EXPLANATION** (NEW)
    - Every non-PASS decision has explicit reason

---

### **User-Trust Invariants (7)**

14. **INVARIANT_14_EVIDENCE_COMPLETENESS** ✅ (Existing)
    - Every FAIL/WARN has reasonCode, evidenceLocationsSearched, minimumToPassSteps

15. **INVARIANT_15_ACTIONABLE_REMEDIATION** (NEW)
    - Every FAIL/WARN has ≥1 actionable remediation step

16. **INVARIANT_16_NO_FREEFORM_PROSE** (NEW)
    - All prose comes from message catalog (no hardcoded strings)

17. **INVARIANT_17_CONFIDENCE_NO_CONTRADICTION** (NEW)
    - Confidence fields don't contradict each other (e.g., high classification + low decision)

18. **INVARIANT_18_CLASSIFICATION_GUIDANCE** (NEW)
    - If classification confidence < 0.7, output includes "how to make explicit" guidance

19. **INVARIANT_19_SCOPE_CLAIM_ACCURACY** (NEW)
    - Output must not claim "diff-derived" if it's repo invariant

20. **INVARIANT_20_EVIDENCE_SEARCH_TRANSPARENCY** (NEW)
    - Every evidence search includes locationsSearched, strategy, confidence

---

## 🏗️ IMPLEMENTATION SEQUENCING (Safe Migration)

### **Week 1-2: Lock the Governance Spine**

**Goal:** Prevent regressions with versioned schema + expanded GOC

**Tasks:**
1. Create `ir/schema.ts` (Zod schemas for all IR types)
2. Add `irVersion: "1.0"` to IR
3. Expand GOC to ~20 invariants
4. Add runtime validation before rendering
5. Create snapshot tests (given IR → output exactly matches golden files)

**Deliverables:**
- ✅ IR v1.0 schema
- ✅ Semantic validator (~20 invariants)
- ✅ Snapshot tests

**Success Criteria:**
- All IR validated at runtime
- 20 invariants enforced
- Zero regressions (snapshot tests pass)

---

### **Week 3-4: PolicyPlan Ledger + Evidence Typing + Message Catalog**

**Goal:** Enable cross-artifact invariants + eliminate freeform prose

**Tasks:**
1. Make PolicyPlan ledger mandatory
2. Add cross-artifact evidence types
3. Create message catalog (`ir/messageCatalog.ts`)
4. Add `evaluationFingerprint` + `policyRevision`
5. Implement stable sorting

**Deliverables:**
- ✅ PolicyPlan ledger mandatory
- ✅ Evidence typing for cross-artifact checks
- ✅ Message catalog
- ✅ Stable IDs + fingerprints

**Success Criteria:**
- Every evaluation has PolicyPlan
- Cross-artifact evidence types working
- 0% freeform prose in comparators
- Evaluations are reproducible (same fingerprint → same output)

---

### **Week 5-6: Compiler/Evaluator/Normalizer Split**

**Goal:** Clean separation of concerns

**Tasks:**
1. Create `compiler.ts` (YAML → PolicyPlan + ObligationSpecs)
2. Create `evaluator.ts` (ObligationSpecs → ObligationResults)
3. Refactor `normalizer.ts` (pure invariant enforcement)
4. Add adapters for backward compatibility
5. Lock output parity tests

**Deliverables:**
- ✅ Compiler (static)
- ✅ Evaluator (dynamic)
- ✅ Normalizer (pure)

**Success Criteria:**
- Compiler is pure (no runtime evaluation)
- Evaluator is isolated (no interpretation)
- Normalizer is pure (no guessing)
- All tests pass with new pipeline

---

### **Week 7+: Pack Migration + Cross-Artifact Invariants**

**Goal:** Migrate packs incrementally + add parity checks

**Tasks:**
1. Migrate packs to Obligation DSL behind feature flags
2. Add cross-artifact comparators (dashboard↔alert, openapi↔code, etc.)
3. Gradually deprecate legacy `evaluate()` method
4. Remove backward compatibility adapters

**Deliverables:**
- ✅ All packs migrated to DSL
- ✅ Cross-artifact invariants working
- ✅ Legacy path removed

**Success Criteria:**
- 100% packs use DSL
- Cross-artifact parity checks working
- Zero legacy code paths

---

## 📊 CONFIDENCE MODEL v2.0 (Vector-Based)

### **Current Model (Multiplication - WRONG)**

```typescript
confidence.overall = applicability × evidence
```

**Problems:**
- Low applicability (0.3) × high evidence (1.0) = 0.3 overall (misleading)
- Doesn't distinguish classification vs decision confidence
- Can't express "high decision confidence despite low classification confidence"

---

### **Target Model (Vector-Based - CORRECT)**

```typescript
interface ConfidenceVector {
  // How confident are we this policy applies to this repo?
  classification: {
    score: number; // 0.0-1.0
    level: 'HIGH' | 'MEDIUM' | 'LOW';
    basis: 'explicit_manifest' | 'inferred_signals' | 'default_assumption';
    degradationReasons: string[];
  };

  // How confident are we in the applicability of each obligation?
  applicability: {
    score: number; // 0.0-1.0
    level: 'HIGH' | 'MEDIUM' | 'LOW';
    basis: 'deterministic_baseline' | 'diff_analysis' | 'heuristic';
  };

  // How confident are we in the evidence we collected?
  evidence: {
    score: number; // 0.0-1.0
    level: 'HIGH' | 'MEDIUM' | 'LOW';
    basis: 'file_present' | 'content_parsed' | 'api_verified' | 'inferred';
  };

  // How confident are we in the final decision?
  decision: {
    score: number; // 0.0-1.0
    level: 'HIGH' | 'MEDIUM' | 'LOW';
    basis: 'deterministic' | 'threshold_based' | 'llm_assisted';
    contributingFactors: string[];
  };
}
```

**Derivation Rules:**
- `classification.score` = based on manifest presence, signal strength
- `applicability.score` = per-obligation (repo invariant = 1.0, diff-derived = varies)
- `evidence.score` = per-obligation (file found + parsed = 1.0, inferred = 0.5)
- `decision.score` = based on basis (deterministic = 1.0, threshold = 0.8, LLM = 0.6)

**Display Logic:**
- Show classification confidence in header
- Show decision confidence in summary
- Show per-obligation applicability/evidence in details
- Never multiply scores (show vector components)

---

## 🔑 STABLE IDENTITY SYSTEM

### **Current State (UNSTABLE)**

```typescript
// Obligation IDs are generated dynamically
const id = uuidv4(); // ❌ Different every run

// No evaluation fingerprint
// No policy revision
// No stable sorting
```

**Problems:**
- Same evaluation, different IDs
- Can't reproduce evaluations
- Audit trail is broken
- Can't track obligation history

---

### **Target State (STABLE)**

```typescript
interface StableIdentity {
  // Immutable obligation ID (hash of pack + rule + scope)
  obligationId: string; // "openapi_pack:schema_valid:repo_invariant"

  // Stable rule ID (survives renames)
  ruleId: string; // "openapi_pack:schema_valid"

  // Stable pack ID
  packId: string; // "openapi_pack"

  // Evaluation fingerprint (hash of PolicyPlan + inputs)
  evaluationFingerprint: string; // "sha256:abc123..."

  // Policy revision (git sha or bundle hash)
  policyRevision: string; // "git:abc123" or "bundle:v1.2.3"

  // Stable sorting key
  sortKey: string; // "severity:HIGH|risk:8|id:openapi_pack:schema_valid"
}
```

**Derivation Rules:**
- `obligationId` = `${packId}:${ruleId}:${scope}`
- `ruleId` = stable identifier (never changes, even if title changes)
- `evaluationFingerprint` = `sha256(PolicyPlan + repo + pr + headSha)`
- `policyRevision` = git sha of policy bundle or semantic version
- `sortKey` = `severity:${severity}|risk:${risk}|id:${obligationId}`

**Benefits:**
- Same evaluation → same fingerprint
- Obligation IDs are stable across runs
- Can track obligation history
- Audit trail is complete
- Reproducible evaluations

---

## 📝 MESSAGE CATALOG (i18n-Style Templates)

### **Current State (Freeform Prose)**

```typescript
// ❌ Hardcoded in comparators
reasonHuman: `Artifact ${artifactType} not found. Expected paths: ${expectedPaths.join(', ')}`
```

**Problems:**
- Inconsistent tone/style
- Can't localize
- Can't A/B test
- Pack extensibility requires code changes

---

### **Target State (Message Catalog)**

```typescript
// ir/messageCatalog.ts
export const MESSAGE_CATALOG = {
  'artifact.missing': {
    template: 'Artifact {{artifactType}} not found. Expected paths: {{expectedPaths}}',
    severity: 'error',
    category: 'artifact',
  },
  'artifact.outdated': {
    template: 'Artifact {{artifactType}} is outdated. Last updated: {{lastUpdated}}, expected: {{expectedDate}}',
    severity: 'warning',
    category: 'artifact',
  },
  // ... ~100 messages
};

// Comparators emit message IDs + params
return obligation.fail({
  reasonCode: 'ARTIFACT_MISSING',
  messageId: 'artifact.missing', // ✅ Message ID
  messageParams: { artifactType, expectedPaths }, // ✅ Parameters
  // ...
});

// Renderer owns prose
function renderReason(messageId: string, params: Record<string, any>): string {
  const template = MESSAGE_CATALOG[messageId].template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => params[key]);
}
```

**Benefits:**
- Consistent tone/style
- Localizable (i18n)
- A/B testable
- Pack extensibility without code changes
- 0% freeform prose

---

## 🔗 CROSS-ARTIFACT INVARIANTS (Product Differentiation)

### **Current State (Single-Artifact Only)**

```typescript
// ❌ Can only check individual artifacts
- "OpenAPI spec is valid"
- "Dashboard exists"
- "Alert is configured"
```

**Problems:**
- Can't express parity constraints
- Can't detect drift between artifacts
- Product differentiation is blocked

---

### **Target State (Cross-Artifact Parity)**

```typescript
// ✅ Can express parity constraints
- "Dashboard ↔ Alert parity: Every dashboard panel has a corresponding alert"
- "OpenAPI ↔ Code consistency: Every endpoint in spec is implemented in code"
- "Runbook ↔ Service catalog alignment: Every runbook references a service in catalog"
- "CODEOWNERS ↔ Docs ownership: Every code module has a corresponding docs owner"
```

**Evidence Types:**

```typescript
interface CrossArtifactEvidence {
  type: 'parity_check';
  sourceArtifact: ArtifactRef;
  targetArtifact: ArtifactRef;
  parityType: 'dashboard_alert' | 'openapi_code' | 'runbook_catalog' | 'codeowners_docs';

  // Parity results
  matched: Array<{ source: string; target: string }>;
  missingInTarget: Array<{ source: string; reason: string }>;
  missingInSource: Array<{ target: string; reason: string }>;

  // Confidence
  confidence: {
    score: number;
    basis: 'exact_match' | 'fuzzy_match' | 'semantic_match';
  };
}

interface ArtifactRef {
  type: 'openapi' | 'dashboard' | 'alert' | 'runbook' | 'service_catalog' | 'codeowners' | 'docs';
  path: string;
  version?: string;
  hash?: string;
}
```

**Example Comparators:**

1. **Dashboard ↔ Alert Parity**
   ```typescript
   // Every dashboard panel should have a corresponding alert
   const dashboardPanels = parseDashboard(dashboardPath);
   const alerts = parseAlerts(alertPath);

   const missingAlerts = dashboardPanels.filter(panel =>
     !alerts.some(alert => alert.metric === panel.metric)
   );

   if (missingAlerts.length > 0) {
     return obligation.fail({
       reasonCode: 'PARITY_VIOLATION',
       messageId: 'dashboard_alert.missing_alerts',
       messageParams: { missingAlerts },
       evidence: crossArtifactEvidence({
         sourceArtifact: { type: 'dashboard', path: dashboardPath },
         targetArtifact: { type: 'alert', path: alertPath },
         parityType: 'dashboard_alert',
         missingInTarget: missingAlerts,
       }),
     });
   }
   ```

2. **OpenAPI ↔ Code Consistency**
   ```typescript
   // Every endpoint in OpenAPI spec should be implemented in code
   const spec = parseOpenAPI(specPath);
   const routes = parseRoutes(codePath);

   const missingImplementations = spec.paths.filter(path =>
     !routes.some(route => route.path === path)
   );

   if (missingImplementations.length > 0) {
     return obligation.fail({
       reasonCode: 'PARITY_VIOLATION',
       messageId: 'openapi_code.missing_implementations',
       messageParams: { missingImplementations },
       evidence: crossArtifactEvidence({
         sourceArtifact: { type: 'openapi', path: specPath },
         targetArtifact: { type: 'code', path: codePath },
         parityType: 'openapi_code',
         missingInTarget: missingImplementations,
       }),
     });
   }
   ```

**Benefits:**
- Product differentiation (unique capability)
- Prevents drift between artifacts
- Systematic consistency across repo
- Governance-grade output

---

## 🎯 ENHANCED REASONING GAPS ADDRESSED

### **Gap 1: Confidence Semantics**

**Your Concern:** "Multiplication yields weird results"

**Enhancement:**
- Vector confidence model (classification, applicability, evidence, decision)
- Each component has explicit basis
- Display logic shows components separately (never multiply)
- Policy can specify confidence thresholds per component

**Example:**
```typescript
// ✅ High decision confidence despite low classification confidence
{
  classification: { score: 0.4, basis: 'inferred_signals' },
  applicability: { score: 1.0, basis: 'deterministic_baseline' },
  evidence: { score: 1.0, basis: 'file_present' },
  decision: { score: 1.0, basis: 'deterministic' }
}
// Display: "Decision: HIGH confidence (deterministic basis)"
// Display: "Classification: MEDIUM confidence (inferred from signals)"
```

---

### **Gap 2: Pack-Specific Textual Drift**

**Your Concern:** "Comparators emit freeform strings"

**Enhancement:**
- Message catalog with ~100 templates
- Comparators emit message IDs + parameters
- Renderer owns all prose
- 0% freeform prose in comparators
- Systematic tone/style across all packs

**Example:**
```typescript
// ❌ Before: Freeform prose
reasonHuman: `File ${file} is missing. Please add it.`

// ✅ After: Message ID + params
messageId: 'file.missing'
messageParams: { file, expectedLocation, remediation: 'add_file' }

// Renderer uses catalog
MESSAGE_CATALOG['file.missing'].template =
  'Required file {{file}} not found at {{expectedLocation}}. Add this file to proceed.'
```

---

### **Gap 3: Brittle Normalizer Mappings**

**Your Concern:** "Normalizer has to 'guess' intent"

**Enhancement:**
- Compiler/Evaluator/Normalizer split
- Compiler: YAML → PolicyPlan (static, no runtime evaluation)
- Evaluator: PolicyPlan → ObligationResults (dynamic, calls comparators)
- Normalizer: Pure invariant enforcement (no interpretation)
- Packs produce structured IR directly (no guessing)

**Example:**
```typescript
// ❌ Before: Normalizer guesses
function normalizeEvaluationResults(packResults: PackResult[]) {
  // Guess intent from unstructured findings
  const obligations = packResults.flatMap(result =>
    guessObligationsFromFindings(result.findings) // ❌ Brittle
  );
}

// ✅ After: Packs produce IR directly
function evaluateStructured(context: EvaluationContext): ObligationResult {
  // Pack produces structured IR
  return obligation.fail({
    reasonCode: 'FILE_MISSING',
    messageId: 'file.missing',
    evidence: [...],
    remediation: [...],
  });
}

// Normalizer just enforces invariants
function normalize(ir: GovernanceIR): NormalizedIR {
  validateInvariants(ir); // ✅ Pure validation
  return ir;
}
```

---

### **Gap 4: Regressions During Rapid Refactors**

**Your Concern:** "Regressions during rapid refactors"

**Enhancement:**
- Versioned IR schema (Zod runtime validation)
- ~20 GOC invariants (structural, decision, user-trust)
- Snapshot tests (given IR → output exactly matches golden files)
- Stable IDs + fingerprints (reproducible evaluations)
- Adapters for backward compatibility (zero-regression migration)

**Example:**
```typescript
// ✅ Runtime validation prevents regressions
const irSchema = z.object({
  irVersion: z.literal('1.0'),
  runContext: runContextSchema,
  policyPlan: policyPlanSchema,
  obligations: z.array(obligationResultSchema),
  summary: summarySchema,
});

// Before rendering, validate
const validatedIR = irSchema.parse(ir); // ❌ Throws if invalid

// Snapshot tests lock output
expect(render(validatedIR)).toMatchSnapshot(); // ❌ Fails if output changes
```

---

## 📋 IMPLEMENTATION CHECKLIST

### **Phase 5: IR Schema + Semantic Validator (Week 1-2)**

- [ ] Create `ir/schema.ts` with Zod schemas for all IR types
- [ ] Add `irVersion: "1.0"` field to all IR
- [ ] Convert enums to strict Zod enums (status, scope, reasonCode)
- [ ] Create `ir/semanticValidator.ts` with ~20 invariants
- [ ] Add runtime validation before rendering
- [ ] Create snapshot tests for all policy packs
- [ ] Document invariants in `GOVERNANCE_IR_INVARIANTS.md`

### **Phase 6: PolicyPlan Ledger + Evidence Typing (Week 3-4)**

- [ ] Make PolicyPlan ledger mandatory in all evaluations
- [ ] Create `ir/evidenceTypes.ts` with cross-artifact evidence types
- [ ] Add `ArtifactRef` and `InvariantRef` types
- [ ] Create `ir/messageCatalog.ts` with ~100 message templates
- [ ] Update comparators to emit message IDs instead of prose
- [ ] Add `evaluationFingerprint` to IR
- [ ] Add `policyRevision` to IR
- [ ] Implement stable sorting (severity → risk → id)
- [ ] Add stable `obligationId` generation

### **Phase 7: Compiler/Evaluator/Normalizer Split (Week 5-6)**

- [ ] Create `compiler.ts` (YAML → PolicyPlan + ObligationSpecs)
- [ ] Create `evaluator.ts` (ObligationSpecs → ObligationResults)
- [ ] Refactor `normalizer.ts` to pure invariant enforcement
- [ ] Add adapters for backward compatibility
- [ ] Create output parity tests (old path vs new path)
- [ ] Migrate all packs to new pipeline
- [ ] Remove legacy code paths

### **Phase 8: Pack Migration + Cross-Artifact Invariants (Week 7+)**

- [ ] Create cross-artifact comparators (dashboard↔alert, openapi↔code, etc.)
- [ ] Add feature flags for incremental rollout
- [ ] Migrate packs to Obligation DSL
- [ ] Add cross-artifact parity tests
- [ ] Deprecate legacy `evaluate()` method
- [ ] Remove backward compatibility adapters
- [ ] Document cross-artifact invariants

---

## 🎯 SUCCESS METRICS

### **Governance-Grade Output**

1. **0% Unvalidated Freeform Prose**
   - All prose comes from message catalog
   - Comparators emit message IDs only

2. **100% IR Validation**
   - All IR validated at runtime (Zod schemas)
   - 20 invariants enforced before rendering

3. **100% Reproducible Evaluations**
   - Same fingerprint → same output
   - Stable IDs across runs

4. **100% Actionable Remediation**
   - Every FAIL/WARN has ≥1 actionable step
   - No vague guidance

5. **Cross-Artifact Parity**
   - Dashboard ↔ Alert parity working
   - OpenAPI ↔ Code consistency working
   - Runbook ↔ Service catalog alignment working

---

## 🚀 NEXT STEPS

1. **Review this audit with Senior Architect** ✅
2. **Approve target architecture** ⏳
3. **Begin Phase 5 implementation** ⏳
4. **Incremental rollout with feature flags** ⏳
5. **Achieve governance-grade output** ⏳

---

**END OF AUDIT**


