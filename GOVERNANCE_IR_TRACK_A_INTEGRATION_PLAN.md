# 🚀 TRACK A INTEGRATION PLAN: Cross-Artifact Governance + Vector Confidence

**Date:** 2026-02-28  
**Goal:** Activate Phase 6 optional features for Track A governance  
**Estimated Effort:** 2-3 days

---

## 🎯 OBJECTIVES

### **1. Cross-Artifact Governance** (Track A Priority)
Enable sophisticated cross-artifact checks:
- Dashboard ↔ Alert consistency
- OpenAPI ↔ Code parity
- Schema ↔ Migration alignment
- SLO ↔ Alert coverage
- Runbook ↔ Alert references

### **2. Vector Confidence Model** (Track A Priority)
Replace legacy confidence multiplication with transparent vector model:
- Applicability (should this policy run?)
- Evidence (did we find what we looked for?)
- Decision Quality (how confident in the decision?)

---

## 📊 CURRENT STATE

### **✅ What's Already Done**
- ✅ Types defined (`CrossArtifactReference`, `ConfidenceBreakdown`)
- ✅ Schemas defined (`crossArtifactReferenceSchema`, `confidenceVectorSchema`)
- ✅ Evidence types extended (5 new cross-artifact types)
- ✅ Schema validation ready

### **❌ What's Missing**
- ❌ Comparators don't emit cross-artifact evidence
- ❌ No cross-artifact validation logic
- ❌ Builders still use legacy confidence model
- ❌ Renderer doesn't display cross-artifact evidence
- ❌ Renderer doesn't display vector confidence

---

## 🔧 IMPLEMENTATION PLAN

### **TASK 1: Migrate to Vector Confidence Model** (Priority 1)

**Estimated Time:** 4-6 hours

#### **Step 1.1: Update `obligationResultBuilder.ts`**
**File:** `apps/api/src/services/gatekeeper/yaml-dsl/ir/obligationResultBuilder.ts`

**Current Code (lines 228-253):**
```typescript
function buildConfidence(finding: NormalizedFinding): ObligationResult['confidence'] {
  const applicability = finding.obligation.applicability?.confidence || 1.0;
  const evidenceConfidence = ...;
  const overall = Math.min(applicability, evidenceConfidence); // ❌ LEGACY
  
  return {
    applicability,
    evidence: evidenceConfidence,
    overall, // ❌ LEGACY
  };
}
```

**New Code (Vector Model):**
```typescript
function buildConfidence(finding: NormalizedFinding): ObligationResult['confidence'] {
  // Component 1: Applicability
  const applicability = {
    score: finding.obligation.applicability?.confidence || 1.0,
    basis: finding.obligation.applicability?.source || 'explicit_signal',
    evidence: finding.obligation.applicability?.evidence || [],
  };
  
  // Component 2: Evidence quality
  const hasEvidence = finding.obligation.evidence?.length > 0;
  const allFound = finding.obligation.evidence?.every(e => e.found) ?? false;
  
  const evidence = {
    score: hasEvidence ? (allFound ? 1.0 : 0.7) : 0.5,
    basis: hasEvidence ? 'deterministic_baseline' : 'heuristic',
    degradationReasons: !allFound ? ['Some evidence not found'] : [],
  };
  
  // Component 3: Decision quality
  const decisionQuality = {
    score: finding.obligation.result === 'PASS' ? 1.0 : 0.9,
    basis: 'all_checks_passed',
    reasons: [],
  };
  
  return {
    decision: {
      applicability,
      evidence,
      decisionQuality,
    },
  };
}
```

**Changes:**
- Replace flat structure with nested `decision` object
- Add explicit `basis` for each component
- Add `evidence` array for applicability
- Add `degradationReasons` for evidence
- Add `reasons` for decision quality
- **NEVER multiply scores** (keep them separate)

#### **Step 1.2: Update `runContextBuilder.ts`**
**File:** `apps/api/src/services/gatekeeper/yaml-dsl/ir/runContextBuilder.ts`

**Current Code (lines 180-241):**
```typescript
function buildConfidenceBreakdown(...): ConfidenceBreakdown {
  return {
    classification: {...},
    tier: {...},
    decision: {
      confidence: 0.95,
      basis: 'deterministic_baseline',
      degradationReasons: [],
    },
  };
}
```

**New Code (Vector Model):**
```typescript
function buildConfidenceBreakdown(...): ConfidenceBreakdown {
  return {
    classification: {...}, // Keep existing
    tier: {...}, // Keep existing
    decision: {
      // Component 1: Applicability (repo classification)
      applicability: {
        score: repoClassification?.confidence || 0.5,
        basis: repoClassification ? 'explicit_signal' : 'default',
        evidence: repoClassification?.evidence || [],
      },
      
      // Component 2: Evidence (signal detection)
      evidence: {
        score: signals ? 0.95 : 0.7,
        basis: signals ? 'deterministic_baseline' : 'heuristic',
        degradationReasons: !signals ? ['No signals detected'] : [],
      },
      
      // Component 3: Decision quality
      decisionQuality: {
        score: 0.95,
        basis: 'all_checks_passed',
        reasons: [],
      },
    },
  };
}
```

#### **Step 1.3: Update Schema to Require Vector Confidence**
**File:** `apps/api/src/services/gatekeeper/yaml-dsl/ir/schema.ts`

**Current Code (line 358):**
```typescript
confidence: confidenceBreakdownLegacySchema, // ❌ LEGACY
```

**New Code:**
```typescript
confidence: confidenceVectorSchema, // ✅ VECTOR MODEL
```

**Impact:** This will require all ObligationResults to use vector confidence

#### **Step 1.4: Update Renderer to Display Vector Confidence**
**File:** `apps/api/src/services/gatekeeper/yaml-dsl/ultimateOutputRenderer.ts`

**Add function to render vector confidence:**
```typescript
function renderVectorConfidence(confidence: ConfidenceBreakdown): string {
  const { applicability, evidence, decisionQuality } = confidence.decision;
  
  return `
Confidence Breakdown:
  • Applicability: ${(applicability.score * 100).toFixed(0)}% (${applicability.basis})
  • Evidence: ${(evidence.score * 100).toFixed(0)}% (${evidence.basis})
  • Decision Quality: ${(decisionQuality.score * 100).toFixed(0)}% (${decisionQuality.basis})
  `.trim();
}
```

**Benefits:**
- ✅ No more weird multiplication
- ✅ Transparent confidence reasoning
- ✅ Independent component thresholds
- ✅ Explicit basis for each component

---

### **TASK 2: Implement Cross-Artifact Evidence** (Priority 2)

**Estimated Time:** 6-8 hours

#### **Step 2.1: Create Cross-Artifact Comparators**

**Example: Dashboard ↔ Alert Consistency**

**New File:** `apps/api/src/services/gatekeeper/yaml-dsl/comparators/cross-artifact/dashboardAlertParity.ts`

```typescript
import type { Comparator, ComparatorResult, PRContext } from '../types.js';
import type { ObligationResult, CrossArtifactReference } from '../../ir/types.js';
import { createObligation } from '../../ir/obligationDSL.js';

export const dashboardAlertParityComparator: Comparator = {
  id: 'DASHBOARD_ALERT_PARITY',
  version: '1.0.0',
  
  async evaluateStructured(context: PRContext, params: any): Promise<ObligationResult> {
    const obligation = createObligation({
      id: 'dashboard-alert-parity',
      title: 'Dashboard Alert Parity',
      controlObjective: 'Ensure dashboards reference valid alerts',
      scope: 'repo_invariant',
      decisionOnFail: 'warn',
    });
    
    // Find dashboard files
    const dashboardFiles = context.files.filter(f => 
      f.filename.match(/dashboard.*\.(yaml|json)$/i)
    );
    
    if (dashboardFiles.length === 0) {
      return obligation.notApplicable('No dashboard files in PR');
    }
    
    // Parse dashboards and check alert references
    const violations: CrossArtifactReference[] = [];
    
    for (const file of dashboardFiles) {
      // Parse dashboard (simplified)
      const alertRefs = extractAlertReferences(file);
      
      for (const alertRef of alertRefs) {
        // Check if alert exists
        const alertExists = await checkAlertExists(context, alertRef);
        
        const crossRef: CrossArtifactReference = {
          source: {
            type: 'dashboard',
            id: file.filename,
            location: file.filename,
          },
          target: {
            type: 'alert',
            id: alertRef,
            found: alertExists,
          },
          relationship: 'references',
          valid: alertExists,
          validationDetails: alertExists 
            ? undefined 
            : `Alert '${alertRef}' not found`,
        };
        
        if (!alertExists) {
          violations.push(crossRef);
        }
      }
    }
    
    if (violations.length > 0) {
      return obligation.fail(
        `${violations.length} dashboard(s) reference missing alerts`,
        violations.map(v => ({
          type: 'dashboard_alert_reference',
          location: v.source.location,
          found: false,
          details: v.validationDetails,
          crossArtifactRef: v, // ✅ PHASE 6 FIELD
        }))
      );
    }
    
    return obligation.pass('All dashboard alert references are valid');
  },
};
```

**Similar Comparators to Create:**
1. `openapiCodeParityComparator` - OpenAPI ↔ Code
2. `schemaMigrationParityComparator` - Schema ↔ Migration
3. `sloAlertParityComparator` - SLO ↔ Alert
4. `runbookAlertParityComparator` - Runbook ↔ Alert

---

## 📋 IMPLEMENTATION CHECKLIST

### **Phase 1: Vector Confidence (4-6 hours)**
- [ ] Update `buildConfidence()` in `obligationResultBuilder.ts`
- [ ] Update `buildConfidenceBreakdown()` in `runContextBuilder.ts`
- [ ] Update schema to require `confidenceVectorSchema`
- [ ] Add `renderVectorConfidence()` to renderer
- [ ] Test with existing policy packs
- [ ] Verify no regressions

### **Phase 2: Cross-Artifact Evidence (6-8 hours)**
- [ ] Create `dashboardAlertParityComparator.ts`
- [ ] Create `openapiCodeParityComparator.ts`
- [ ] Create `schemaMigrationParityComparator.ts`
- [ ] Create `sloAlertParityComparator.ts`
- [ ] Create `runbookAlertParityComparator.ts`
- [ ] Add cross-artifact invariant checks to semantic validator
- [ ] Update renderer to display cross-artifact evidence
- [ ] Create policy pack using cross-artifact comparators
- [ ] Test end-to-end

---

## ✅ SUCCESS CRITERIA

- ✅ Vector confidence model active (no multiplication)
- ✅ All confidence components displayed separately
- ✅ Cross-artifact comparators implemented
- ✅ Cross-artifact evidence in IR
- ✅ Renderer displays cross-artifact violations
- ✅ Zero regressions
- ✅ All tests pass

---

**Ready to implement? Let me know which task to start with!** 🚀

