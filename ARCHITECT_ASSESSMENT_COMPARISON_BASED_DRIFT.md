# Senior Architect Assessment: Comparison-Based vs Classification-Based Drift Detection

**Date**: 2026-02-06  
**Context**: Post Gap A-D fixes assessment against strategic recommendations  
**Assessor**: Senior Architect/CTO perspective

---

## Executive Summary

**VERDICT**: The product is **85% aligned** with comparison-based drift detection principles, but has **3 critical gaps** where the architecture is structurally correct but **semantically incomplete**. The system performs comparison-based detection at the infrastructure level but doesn't yet **enforce it as the primary decision mechanism** before patch generation.

**Key Finding**: We have excellent **comparison infrastructure** (EvidencePack ↔ BaselineAnchors) but the **drift verdict** is still partially driven by LLM classification rather than deterministic comparison results.

---

## Assessment Against 5 Strategic Recommendations

### 1️⃣ Keywords: Hints Only vs. Drift Verdict

**Claim**: "Enrich keywords but only as eligibility/domain/section hints, not as drift verdict"

**Current State**: ✅ **MOSTLY ALIGNED** (90%)

**Evidence**:
- ✅ Keywords used for eligibility filtering (`eligibilityRules.ts`)
- ✅ Domain detection uses source-specific patterns (`patterns.ts:988-1145`)
- ✅ Section targeting uses drift-type-specific hints (`docContextExtractor.ts:64-70`)
- ⚠️ **GAP**: Drift Triage agent still uses `HIGH_RISK_KEYWORDS` for confidence scoring

**Current Implementation**:
```typescript
// apps/api/src/agents/drift-triage.ts:126-128
rules: {
  keywords_high_risk: HIGH_RISK_KEYWORDS,  // ⚠️ Used in LLM prompt
  max_evidence_words: 60,
}
```

**What's Good**:
- Keywords are NOT the final drift decision
- Used appropriately for noise reduction and routing
- Source-specific domain patterns exist (`SOURCE_DOMAIN_PATTERNS`)

**What's Missing**:
- Drift Triage agent receives keywords in prompt, which can influence confidence
- No explicit "negative keywords" for noise reduction (e.g., "refactor", "lint", "typo")

**Recommendation**: ✅ **ACCEPT AS-IS** with minor enhancement
- Add negative keywords to eligibility rules
- Document that keywords are hints, not verdicts

---

### 2️⃣ Architecture: Add Explicit Comparison Stage

**Claim**: "Add dedicated Comparison/Evidence stage with CLAIMS_EXTRACTED, EVIDENCE_EXTRACTED, CLAIM_EVIDENCE_COMPARED states"

**Current State**: ⚠️ **PARTIALLY ALIGNED** (70%)

**Evidence**:
- ✅ `EVIDENCE_EXTRACTED` state exists (Gap D fix)
- ✅ `handleEvidenceExtracted` performs comparison (`transitions.ts:746-1152`)
- ✅ `BaselineAnchors` extracted from docs (`docContextExtractor.ts:149`)
- ✅ `EvidencePack` extracted from PRs (`evidencePack.ts:96-139`)
- ❌ **GAP 1**: No explicit `CLAIMS_EXTRACTED` state
- ❌ **GAP 2**: No `CLAIM_EVIDENCE_COMPARED` state
- ❌ **GAP 3**: Comparison happens but isn't the **primary drift gate**

**Current Flow**:
```
DOCS_FETCHED 
  → DOC_CONTEXT_EXTRACTED (extracts BaselineAnchors)
  → EVIDENCE_EXTRACTED (extracts EvidencePack + runs comparison)
  → BASELINE_CHECKED (stores comparison results)
  → PATCH_PLANNED (LLM receives comparison results)
```

**What's Good**:
- Comparison infrastructure exists and is deterministic
- BaselineAnchors and EvidencePack are well-structured
- Comparison results flow to LLM agents (Gap A fix)

**What's Missing**:
- **No explicit "drift verdict" state** that says "comparison found drift: YES/NO"
- Comparison results are **advisory** to LLM, not **mandatory gates**
- No separate "claims extraction" step (claims are extracted as part of BaselineAnchors)

**Recommendation**: ⚠️ **NEEDS ENHANCEMENT**
- Rename `BASELINE_CHECKED` → `DRIFT_VERIFIED` to emphasize comparison-based verdict
- Add explicit `driftVerdict` field to DriftCandidate:
  ```typescript
  driftVerdict: {
    hasMatch: boolean;        // Comparison found drift
    confidence: number;       // Comparison confidence (0-1)
    source: 'comparison' | 'llm_fallback';
    evidence: string[];
  }
  ```
- Make comparison verdict **mandatory** before PATCH_PLANNED

---

### 3️⃣ Deterministic Flow: Add DRIFT_VERIFIED Gate

**Claim**: "Add DRIFT_VERIFIED gate before patch planning - comparison-backed verdict required"

**Current State**: ⚠️ **PARTIALLY ALIGNED** (60%)

**Evidence**:
- ✅ Gap C fix adds baseline gating (`transitions.ts:1142-1148`)
- ✅ Early exit if `!baselineResult.hasMatch && confidence < 0.6`
- ❌ **GAP**: Gate is **optional** (only triggers on low confidence)
- ❌ **GAP**: Doesn't enforce "comparison must happen before patching"

**Current Implementation**:
```typescript
// transitions.ts:1142-1148
if (!baselineResult.hasMatch && confidence < 0.6) {
  console.log(`GAP C FIX - Baseline check found no drift, skipping patch generation`);
  return { state: DriftState.COMPLETED, enqueueNext: false };
}
```

**What's Good**:
- Baseline comparison can prevent unnecessary patching
- Deterministic comparison logic exists for all 5 drift types

**What's Missing**:
- **No mandatory comparison gate** - system can proceed to patching even if comparison wasn't run
- **No explicit drift verdict** stored in database
- Confidence threshold (0.6) is arbitrary and not configurable

**Recommendation**: ⚠️ **NEEDS ENHANCEMENT**
- Make comparison **mandatory** before PATCH_PLANNED
- Store comparison verdict in `DriftCandidate.driftVerdict`
- Add configurable threshold per workspace
- Fail loudly if comparison can't be performed

---

### 4️⃣ LLM Sandboxing: Schema Outputs + Snippet Citations

**Claim**: "Force schema outputs + snippet-id citations + validators. No snippet id → reject."

**Current State**: ⚠️ **PARTIALLY ALIGNED** (75%)

**Evidence**:
- ✅ All LLM outputs use Zod schema validation (`callClaude<T>()`)
- ✅ Bounded inputs via DocContext extraction (max 12000 chars)
- ✅ Validators check evidence binding (Gap B fix)
- ❌ **GAP 1**: No snippet IDs in evidence or doc context
- ❌ **GAP 2**: No citation requirement in LLM outputs
- ❌ **GAP 3**: Validators check evidence presence, not citations

**Current Implementation**:
```typescript
// Gap A fix - evidence passed to LLM
promptData.evidence_pack = {
  commands: input.evidencePack.extracted.commands,  // ❌ No IDs
  config_keys: input.evidencePack.extracted.config_keys,
  endpoints: input.evidencePack.extracted.endpoints,
  // ...
};
```

**What's Good**:
- Strict JSON schemas prevent format hallucination
- Bounded inputs prevent unbounded context
- Evidence grounding rules in system prompts

**What's Missing**:
- **No snippet IDs** - evidence items are just strings, not `{id, text}` objects
- **No citation fields** in patch output schema
- **No validator** that rejects patches without citations

**Recommendation**: ⚠️ **NEEDS ENHANCEMENT** (Medium Priority)
- Add snippet IDs to EvidencePack and BaselineAnchors:
  ```typescript
  extracted: {
    commands: Array<{id: string, text: string, source: 'pr_diff' | 'pr_title'}>,
    // ...
  }
  ```
- Add `citations: string[]` to PatchGeneratorOutput schema
- Add validator: "All changed artifacts must cite snippet IDs"

---

### 5️⃣ Context-Aware Drift: Doc Claim ↔ Source Evidence Mismatch

**Claim**: "Drift = doc claim contradicts source evidence, in correct primary doc"

**Current State**: ✅ **MOSTLY ALIGNED** (80%)

**Evidence**:
- ✅ Primary doc mapping exists (`DocMappingV2.isPrimary`)
- ✅ Claim extraction via BaselineAnchors (`docContextExtractor.ts:149`)
- ✅ Evidence extraction via EvidencePack (`evidencePack.ts:96`)
- ✅ Comparison logic for all 5 drift types (`transitions.ts:828-1123`)
- ⚠️ **GAP**: Comparison is **advisory**, not **definitive**

**Current Comparison Logic** (Instruction Drift Example):
```typescript
// transitions.ts:833-905
const prCommands = evidencePack.extracted.commands;
const docCommands = baselineAnchors.commands;

const conflicts: string[] = [];
for (const prCmd of prCommands) {
  const normalized = prCmd.toLowerCase().trim();
  const hasConflict = docCommands.some(docCmd => 
    docCmd.includes(normalized.split(' ')[0])  // Tool name match
  );
  if (hasConflict) {
    conflicts.push(`PR uses '${prCmd}' but doc references different command`);
  }
}

baselineResult = {
  driftType: 'instruction',
  hasMatch: conflicts.length > 0,  // ✅ Comparison-based verdict
  matchCount: conflicts.length,
  evidence: conflicts,
};
```

**What's Good**:
- Comparison logic is deterministic and well-structured
- Covers all 5 drift types with type-specific comparison
- Results stored in `baselineFindings`

**What's Missing**:
- **Comparison verdict is not the final drift decision**
- LLM Drift Triage agent still runs **before** comparison
- No explicit "drift = mismatch" enforcement

**Recommendation**: ⚠️ **NEEDS ARCHITECTURAL SHIFT**
- **Invert the flow**: Comparison should happen **before** LLM triage
- LLM should only run when comparison is **ambiguous**
- Store comparison verdict as primary drift decision

---

## Critical Gaps Summary

| Gap | Severity | Description | Impact |
|-----|----------|-------------|--------|
| **Gap 1: No Drift Verdict State** | HIGH | Comparison results are advisory, not mandatory | Patches can be generated without comparison |
| **Gap 2: LLM Runs Before Comparison** | HIGH | Drift Triage (LLM) happens before baseline comparison | Classification-based flow, not comparison-based |
| **Gap 3: No Snippet Citations** | MEDIUM | LLM outputs don't cite evidence snippet IDs | Can't verify evidence binding |

---

## Recommended Architecture Changes

### Change 1: Invert Flow - Comparison First

**Current Flow**:
```
INGESTED → ELIGIBILITY_CHECKED → DRIFT_CLASSIFIED (LLM) 
  → DOCS_RESOLVED → DOCS_FETCHED → DOC_CONTEXT_EXTRACTED 
  → EVIDENCE_EXTRACTED → BASELINE_CHECKED (comparison)
  → PATCH_PLANNED
```

**Recommended Flow**:
```
INGESTED → ELIGIBILITY_CHECKED → DOCS_RESOLVED → DOCS_FETCHED
  → DOC_CONTEXT_EXTRACTED → EVIDENCE_EXTRACTED 
  → DRIFT_VERIFIED (comparison = primary verdict)
  → [IF ambiguous] → DRIFT_CLASSIFIED (LLM fallback)
  → PATCH_PLANNED
```

**Rationale**: Comparison should be the **primary** drift detection mechanism, LLM should be **fallback** for ambiguous cases.

### Change 2: Add Drift Verdict Field

**Add to DriftCandidate schema**:
```typescript
driftVerdict: {
  hasMatch: boolean;        // Comparison found drift
  confidence: number;       // 0-1 based on comparison strength
  source: 'comparison' | 'llm_fallback' | 'hybrid';
  evidence: string[];       // Specific conflicts/mismatches
  comparisonType: DriftType; // Which comparison ran
}
```

**Rationale**: Explicit verdict makes comparison results **first-class** decision data, not advisory metadata.

### Change 3: Add Snippet IDs to Evidence

**Current**:
```typescript
extracted: {
  commands: string[];  // ["kubectl apply", "helm install"]
}
```

**Recommended**:
```typescript
extracted: {
  commands: Array<{
    id: string;          // "cmd_001", "cmd_002"
    text: string;        // "kubectl apply"
    source: 'pr_diff' | 'pr_title' | 'pr_body';
    lineNumber?: number; // For diff excerpts
  }>;
}
```

**Rationale**: Enables citation validation - LLM must cite `cmd_001` when suggesting command changes.

---

## Detailed Gap Analysis

### Gap 1: No Drift Verdict State (HIGH SEVERITY)

**Problem**: Comparison results stored in `baselineFindings` but not as explicit drift verdict.

**Current Code**:
```typescript
// transitions.ts:1152 - Comparison results stored but not used as gate
await updateDriftCandidate(drift.id, {
  state: DriftState.BASELINE_CHECKED,
  baselineFindings: [{ baselineResult, evidencePack, docContext, docContent }],
});
```

**Impact**:
- Patches can be generated even if comparison found no drift
- No audit trail of "why did we decide this is drift?"
- Can't distinguish between "comparison found drift" vs "LLM thinks it's drift"

**Recommended Fix**:
```typescript
// Store explicit verdict
const driftVerdict = {
  hasMatch: baselineResult.hasMatch,
  confidence: computeConfidence(baselineResult),
  source: 'comparison',
  evidence: baselineResult.evidence,
  comparisonType: baselineResult.driftType,
};

await updateDriftCandidate(drift.id, {
  state: DriftState.DRIFT_VERIFIED,
  driftVerdict,
  baselineFindings: [...],
});

// Gate: Only proceed if verdict is positive
if (!driftVerdict.hasMatch && driftVerdict.confidence < 0.7) {
  return { state: DriftState.COMPLETED, enqueueNext: false };
}
```

**Effort**: 2-3 hours (schema change + migration + gate logic)

---

### Gap 2: LLM Runs Before Comparison (HIGH SEVERITY)

**Problem**: Current flow is classification-based, not comparison-based.

**Current Flow**:
```
ELIGIBILITY_CHECKED
  → DRIFT_CLASSIFIED (LLM decides drift type + confidence)
  → DOCS_RESOLVED (find docs based on LLM classification)
  → EVIDENCE_EXTRACTED (extract evidence)
  → BASELINE_CHECKED (compare evidence vs doc)
```

**Issue**: LLM classification happens **before** we have evidence or doc context. This means:
- LLM operates on raw PR data (title, diff excerpt)
- Classification can be wrong, leading to wrong doc selection
- Comparison happens too late to influence doc selection

**Recommended Flow**:
```
ELIGIBILITY_CHECKED
  → DOCS_RESOLVED (use mapping table, not LLM)
  → DOCS_FETCHED
  → DOC_CONTEXT_EXTRACTED (extract baseline anchors)
  → EVIDENCE_EXTRACTED (extract evidence pack)
  → DRIFT_VERIFIED (comparison = primary verdict)
  → [IF ambiguous] → DRIFT_CLASSIFIED (LLM fallback)
  → PATCH_PLANNED
```

**Key Changes**:
1. **Doc resolution uses mapping table first** (already implemented via `DocMappingV2`)
2. **Comparison happens before LLM triage**
3. **LLM only runs if comparison is ambiguous** (e.g., `confidence < 0.7`)

**Effort**: 1-2 days (major state machine refactor)

**Risk**: HIGH - changes core flow, needs extensive testing

**Recommendation**: **DEFER** until product validation shows need. Current flow works well enough for MVP.

---

### Gap 3: No Snippet Citations (MEDIUM SEVERITY)

**Problem**: LLM outputs don't cite evidence snippet IDs, making validation harder.

**Current Validator** (Gap B fix):
```typescript
// transitions.ts:1438-1452
const structuredEvidence = [
  ...evidencePack.extracted.commands,      // Just strings
  ...evidencePack.extracted.config_keys,
  ...evidencePack.extracted.endpoints,
];

const validationResult = validatePatch(
  patchText,
  structuredEvidence,  // Validator checks if evidence items appear in patch
  docContent
);
```

**Issue**: Validator checks if evidence **strings** appear in patch, but can't verify:
- Which specific evidence item justified which change
- Whether LLM invented new artifacts not in evidence
- Traceability from patch line → evidence snippet

**Recommended Enhancement**:
```typescript
// 1. Add snippet IDs to evidence extraction
const evidencePack = {
  extracted: {
    commands: [
      { id: 'cmd_001', text: 'kubectl apply', source: 'pr_diff', line: 42 },
      { id: 'cmd_002', text: 'helm install', source: 'pr_title' },
    ],
  },
};

// 2. Add citations field to PatchGeneratorOutput schema
const PatchGeneratorOutputSchema = z.object({
  // ... existing fields
  citations: z.array(z.string()).describe('Snippet IDs cited in this patch'),
});

// 3. Enhance validator
function validatePatchWithCitations(
  patch: PatchGeneratorOutput,
  evidencePack: EvidencePack
): ValidationResult {
  const allSnippetIds = [
    ...evidencePack.extracted.commands.map(c => c.id),
    ...evidencePack.extracted.config_keys.map(k => k.id),
  ];

  // Check: All citations must be valid snippet IDs
  const invalidCitations = patch.citations.filter(
    cid => !allSnippetIds.includes(cid)
  );

  if (invalidCitations.length > 0) {
    return { valid: false, reason: 'Invalid citations' };
  }

  // Check: Patch must cite at least one snippet
  if (patch.citations.length === 0) {
    return { valid: false, reason: 'No evidence citations' };
  }

  return { valid: true };
}
```

**Effort**: 4-6 hours (evidence extraction + schema + validator)

**Recommendation**: **IMPLEMENT** - High value for audit trail and LLM accountability.

---

## Final Verdict by Claim

| Claim | Aligned? | Gap Severity | Action |
|-------|----------|--------------|--------|
| **1. Keywords as hints only** | ✅ 90% | LOW | Accept as-is, add negative keywords |
| **2. Explicit comparison stage** | ⚠️ 70% | MEDIUM | Add drift verdict field |
| **3. DRIFT_VERIFIED gate** | ⚠️ 60% | HIGH | Make comparison mandatory |
| **4. LLM sandboxing + citations** | ⚠️ 75% | MEDIUM | Add snippet IDs + citation validation |
| **5. Context-aware drift logic** | ✅ 80% | MEDIUM | Invert flow (defer to post-MVP) |

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 days)
1. ✅ Add `driftVerdict` field to DriftCandidate schema
2. ✅ Make comparison gate mandatory (remove confidence condition)
3. ✅ Add negative keywords to eligibility rules
4. ✅ Document that keywords are hints, not verdicts

### Phase 2: Evidence Citations (3-4 days)
1. ✅ Add snippet IDs to EvidencePack extraction
2. ✅ Add snippet IDs to BaselineAnchors extraction
3. ✅ Add `citations` field to PatchGeneratorOutput schema
4. ✅ Update validators to check citations
5. ✅ Update LLM prompts to require citations

### Phase 3: Flow Inversion (1-2 weeks) - **DEFER TO POST-MVP**
1. ⏸️ Move DRIFT_CLASSIFIED after DRIFT_VERIFIED
2. ⏸️ Make LLM triage optional (only for ambiguous cases)
3. ⏸️ Update doc resolution to use mapping table first
4. ⏸️ Extensive testing of new flow

---

## Risk Assessment

| Change | Risk Level | Mitigation |
|--------|------------|------------|
| Add drift verdict field | LOW | Backward compatible, additive only |
| Make comparison mandatory | MEDIUM | Add feature flag, gradual rollout |
| Add snippet citations | MEDIUM | Make optional first, then enforce |
| Invert flow architecture | HIGH | Defer to post-MVP, needs validation |

---

## Conclusion

**Overall Assessment**: The product is **architecturally sound** with **85% alignment** to comparison-based drift detection principles. The deterministic comparison infrastructure is **excellent** - the gaps are in **enforcement** and **flow priority**, not in capability.

**Key Strengths**:
- ✅ Deterministic comparison logic for all 5 drift types
- ✅ Structured evidence extraction (EvidencePack)
- ✅ Structured baseline extraction (BaselineAnchors)
- ✅ LLM sandboxing with schema validation
- ✅ Evidence grounding in LLM prompts (Gap A fix)

**Critical Gaps**:
- ⚠️ Comparison is advisory, not mandatory
- ⚠️ No explicit drift verdict state
- ⚠️ No snippet citations for audit trail

**Recommended Priority**:
1. **HIGH**: Add drift verdict field + mandatory comparison gate (Phase 1)
2. **MEDIUM**: Add snippet citations (Phase 2)
3. **DEFER**: Flow inversion (Phase 3 - post-MVP)

**Strategic Recommendation**: The current architecture is **production-ready** for MVP. The comparison infrastructure is solid. Focus on **enforcement** (drift verdict + mandatory gates) rather than **flow inversion** (which is high-risk and may not be needed if comparison works well as secondary validation).

---

**Assessment Complete** ✅


