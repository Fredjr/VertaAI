# Phase 3: Migrate Renderer to IR - Implementation Strategy

## 🎯 Objective

Migrate `ultimateOutputRenderer.ts` to consume the IR (`result.ir.*`) instead of legacy normalized fields, while maintaining **100% backward compatibility** and **zero output changes**.

---

## 📊 Current State Analysis

### **Fields Currently Used by Renderer:**

1. **`normalized.decision`** → Maps to `ir.contract.decision`
2. **`normalized.confidence`** → Maps to `ir.runContext.confidence` + `ir.contract.confidence`
3. **`normalized.repoClassification`** → Maps to `ir.runContext.confidence.classification`
4. **`normalized.surfaces`** → Maps to `ir.runContext.signals` (detected signals)
5. **`normalized.obligations`** → Maps to `ir.obligationResults[]`
6. **`normalized.findings`** → Maps to `ir.obligationResults[]` (filtered by status)
7. **`normalized.notEvaluable`** → Maps to `ir.obligationResults[]` (status === 'NOT_EVALUABLE')
8. **`normalized.nextActions`** → Derived from `ir.contract.failedObligations`
9. **`normalized.metadata`** → Maps to `ir.policyPlan` + `ir.runContext.evaluatedAt`

---

## 🔄 Migration Mapping

### **1. Decision (`normalized.decision` → `ir.contract.decision`)**

**Old:**
```typescript
normalized.decision = {
  outcome: 'pass' | 'warn' | 'block',
  reason: string,
  contributingFactors: Array<{...}>
}
```

**New:**
```typescript
ir.contract.decision = {
  global: 'PASS' | 'WARN' | 'BLOCK',
  basis: 'enforced_obligations_only',
  robustness: 'deterministic_baseline' | 'diff_analysis' | 'heuristic'
}
```

**Mapping:**
- `outcome` → `global.toLowerCase()`
- `reason` → Derive from `failedObligations` (count + reason codes)
- `contributingFactors` → Derive from `contract.counts`

---

### **2. Confidence (`normalized.confidence` → `ir.runContext.confidence` + `ir.contract.confidence`)**

**Old:**
```typescript
normalized.confidence = {
  score: number,
  level: 'high' | 'medium' | 'low',
  degradationReasons: string[],
  applicabilityConfidence?: {...},
  evidenceConfidence: {...}
}
```

**New:**
```typescript
ir.runContext.confidence = {
  classification: {
    repoType: string,
    confidence: number,
    source: 'explicit' | 'inferred' | 'default',
    evidence: string[]
  },
  decision: {
    confidence: number,
    basis: string,
    degradationReasons: string[]
  }
}

ir.contract.confidence = {
  decision: number,
  classification: number
}
```

**Mapping:**
- `score` → `contract.confidence.decision * 100`
- `level` → Derive from `contract.confidence.decision` (>0.8 = high, >0.5 = medium, else low)
- `degradationReasons` → `runContext.confidence.decision.degradationReasons`

---

### **3. Repo Classification (`normalized.repoClassification` → `ir.runContext.confidence.classification`)**

**Old:**
```typescript
normalized.repoClassification = {
  repoType: string,
  serviceTier: string,
  hasDeployment: boolean,
  metadata: {...},
  confidenceBreakdown: {...}
}
```

**New:**
```typescript
ir.runContext.confidence.classification = {
  repoType: string,
  confidence: number,
  source: 'explicit' | 'inferred' | 'default',
  evidence: string[]
}
```

**Mapping:**
- `repoType` → `classification.repoType`
- `serviceTier` → Derive from `runContext.signals` (tier-specific signals)
- `confidenceBreakdown` → `classification.evidence`

---

### **4. Surfaces (`normalized.surfaces` → `ir.runContext.signals`)**

**Old:**
```typescript
normalized.surfaces = Array<{
  surfaceId: string,
  surfaceType: string,
  description: string,
  confidence: number,
  detectionMethod: string,
  files: string[]
}>
```

**New:**
```typescript
ir.runContext.signals = {
  filesPresent: string[],
  manifestTypes: ManifestType[],
  languages: Language[],
  frameworks: Framework[],
  hasRunbook: boolean,
  hasSLO: boolean,
  hasAlerts: boolean,
  buildSystem: string,
  hasOpenAPI: boolean,
  hasGraphQL: boolean,
  hasProto: boolean,
  hasMigrations: boolean,
  hasORM: boolean
}
```

**Mapping:**
- Derive surfaces from signals (e.g., `hasOpenAPI` → "API Surface")
- `files` → `filesPresent` (filtered by surface type)
- `confidence` → Always 1.0 (deterministic detection)

---

### **5. Obligations (`normalized.obligations` → `ir.obligationResults`)**

**Old:**
```typescript
normalized.obligations = Array<{
  id: string,
  description: string,
  triggeredBy: string[],
  result: {...},
  sourceRule: {...},
  decisionOnFail: string
}>
```

**New:**
```typescript
ir.obligationResults = Array<{
  id: string,
  title: string,
  controlObjective: string,
  scope: 'repo_invariant' | 'diff_derived' | 'environment_gate',
  decisionOnFail: 'block' | 'warn' | 'pass',
  status: 'PASS' | 'FAIL' | 'SUPPRESSED' | 'NOT_EVALUABLE' | 'INFO',
  reasonCode: ReasonCode,
  reasonHuman: string,
  evidence: EvidenceItem[],
  remediation: {...},
  risk: {...},
  confidence: {...}
}>
```

**Mapping:**
- `description` → `title`
- `triggeredBy` → Derive from `scope` (repo_invariant vs diff_derived)
- `result.status` → `status`
- `decisionOnFail` → `decisionOnFail`

---

### **6. Findings (`normalized.findings` → `ir.obligationResults` filtered)**

**Old:**
```typescript
normalized.findings = Array<{
  obligationId: string,
  what: string,
  why: string,
  severity: string,
  result: {...},
  evidence: {...},
  remediation: {...}
}>
```

**New:**
```typescript
ir.obligationResults.filter(o => o.status === 'FAIL')
```

**Mapping:**
- `what` → `title`
- `why` → Derive from `controlObjective` + `risk`
- `severity` → Derive from `risk.total` (0-30 = low, 31-60 = medium, 61-100 = high)
- `evidence` → `evidence[]`
- `remediation` → `remediation`

---

## 🛠️ Implementation Plan

### **Step 1: Create IR Adapter Functions**

Create helper functions that adapt IR to the old format:

```typescript
function adaptDecisionFromIR(ir): Decision { ... }
function adaptConfidenceFromIR(ir): Confidence { ... }
function adaptRepoClassificationFromIR(ir): RepoClassification { ... }
function adaptSurfacesFromIR(ir): DetectedSurface[] { ... }
function adaptObligationsFromIR(ir): NormalizedObligation[] { ... }
function adaptFindingsFromIR(ir): NormalizedFinding[] { ... }
function adaptNotEvaluableFromIR(ir): NotEvaluableItem[] { ... }
function adaptNextActionsFromIR(ir): NextAction[] { ... }
function adaptMetadataFromIR(ir): Metadata { ... }
```

### **Step 2: Update Renderer Entry Point**

```typescript
export function renderUltimateOutput(normalized: NormalizedEvaluationResult): string {
  // If IR is present, adapt it to the old format
  const adapted = normalized.ir
    ? adaptNormalizedFromIR(normalized.ir)
    : normalized;
  
  // Render using adapted format (existing logic unchanged)
  return renderUltimateOutputInternal(adapted);
}
```

### **Step 3: Test for Regression**

- Run existing tests
- Compare output with and without IR
- Ensure 100% identical output

### **Step 4: Gradual Migration**

Once adapters are working:
1. Migrate one section at a time (e.g., Executive Summary)
2. Read directly from IR instead of adapted format
3. Test for regressions
4. Repeat for all sections

---

## ✅ Success Criteria

1. ✅ Renderer works with IR present
2. ✅ Renderer works without IR (backward compatibility)
3. ✅ Output is 100% identical (regression test)
4. ✅ All existing tests pass
5. ✅ No direct YAML access in renderer

---

## 🚀 Next Steps

1. Create IR adapter functions
2. Update renderer entry point
3. Run regression tests
4. Gradually migrate sections to read directly from IR
5. Remove adapters once all sections migrated


