# Track A Trust-Killers: Architectural Fixes

## Executive Summary

This document addresses the **5 critical trust-killers** identified in the senior architect review that prevent Track A output from being "decision-grade" and "enterprise-ready."

**Status:** 3/5 COMPLETE ✅ (Confidence, Risk, Evidence Transparency, Change Surface), 2/5 PLANNED 🚧 (Service Owner Nuance, Consolidate Repetition)

### Completed Fixes (Commits 9927593, fe64fee)
1. ✅ **Confidence Transparency** - Split into classification/evidence/decision layers with explicit vs inferred sources
2. ✅ **Risk Transparency** - Tier acts as multiplier with transparent drivers for each factor
3. ✅ **Evidence Transparency** - Show where we looked, what we found, closest matches
4. ✅ **Change Surface Summary** - Show THIS PR's files and triggered obligations

### Planned Enhancements
5. 🚧 **Service Owner Nuance** - Acknowledge alternative evidence sources
6. 🚧 **Consolidate Repetition** - Reduce redundancy across sections

---

## Trust-Killer #1: Confidence = 100% is Not Credible ✅ FIXED

### Problem
- Asserting **HIGH (100%)** confidence globally without evidence
- No transparency on how we determined "SERVICE" or "TIER-1"
- Classification is inferred but presented as fact

### Solution Implemented

#### 1.1 Split Confidence into 3 Layers

**Type Definition:**
```typescript
confidenceBreakdown?: {
  repoTypeConfidence: number;
  repoTypeSource: 'explicit' | 'inferred';
  repoTypeEvidence: string[];
  
  tierConfidence: number;
  tierSource: 'explicit' | 'inferred' | 'unknown';
  tierEvidence: string[];
}
```

#### 1.2 Enhanced Classification Logic

**Explicit Classification (95% confidence):**
- Repo type from `catalog-info.yaml`, `service.yaml`, or `backstage.yaml`
- Tier from service catalog annotation: `tier: 1`

**Inferred Classification (60-80% confidence):**
- Repo type from Dockerfile, K8s manifests, or file structure
- Tier from SLO file (tier-1), runbook (tier-2), or absence (tier-3)

#### 1.3 Transparent Output

**Before:**
```
Repository: ⚙️ SERVICE
Service Tier: 🔴 TIER-1
```

**After:**
```
Repository: ⚙️ SERVICE (HIGH) – from catalog-info.yaml
Service Tier: 🔴 TIER-1 (HIGH) – from service catalog annotation
```

or

```
Repository: ⚙️ SERVICE (MEDIUM) – inferred from Dockerfile, K8s manifests
Service Tier: 🔴 TIER-1 (MEDIUM) – inferred from SLO file: slo.yaml
```

### Impact
- ✅ No more fake 100% confidence
- ✅ Classification sources are explicit
- ✅ Reviewers can assess trustworthiness
- ✅ Inferred classifications are clearly labeled

---

## Trust-Killer #2: Change Surface Summary is Empty 🚧 IN PROGRESS

### Problem
- "Rule triggers on every PR to protected branches"
- "Detection Method: explicit"
- Doesn't answer: "What in THIS PR caused these obligations?"

### Solution Design

#### 2.1 Show Changed Paths
```
Changed files: services/auth/..., deploy/...
Detected domains: auth, deployment
Surfaces activated: service, observability, infra
```

#### 2.2 Show Evidence Checked
```
- Changed paths matched service patterns: services/*
- Tier read from catalog-info.yaml: tier=1
- Searched for runbook in: RUNBOOK.md, docs/runbook/**, runbooks/**
- CODEOWNERS paths checked: CODEOWNERS, .github/CODEOWNERS
```

### Status
- ✅ Types added (`evidenceSearch` field)
- 🚧 Rendering logic (next commit)
- 🚧 Integration with comparators (next commit)

---

## Trust-Killer #3: Risk Model Lacks Transparency ✅ FIXED

### Problem
- Risk scores felt arbitrary (all 25/100 or all 80/100)
- Component weights weren't shown
- Tier-1 inflated criticality to 30/30 for everything
- No explanation of drivers

### Solution Implemented

#### 3.1 Transparent Risk Drivers

**Type Definition:**
```typescript
drivers?: {
  blastRadiusReason: string;
  criticalityReason: string;
  immediacyReason: string;
  dependencyReason: string;
}
```

#### 3.2 Tier as Multiplier (Not Hard Max)

**Before:**
- All tier-1 findings: Criticality = 30/30

**After:**
- Base criticality depends on obligation type:
  - Runbook/SLO: 30 (operational readiness)
  - CODEOWNERS/Service Owner: 20 (ownership)
  - Service Catalog: 15 (metadata)
- Tier acts as multiplier:
  - Tier-1: × 1.0
  - Tier-2: × 0.67
  - Tier-3: × 0.33

**Example:**
- CODEOWNERS (tier-1): 20 × 1.0 = 20/30
- CODEOWNERS (tier-2): 20 × 0.67 = 13/30
- Runbook (tier-1): 30 × 1.0 = 30/30

#### 3.3 Transparent Output

**Before:**
```
Risk Score: 🔴 80/100
- Blast Radius: 25/30
- Criticality: 30/30
- Immediacy: 10/20
- Dependency: 15/20
```

**After:**
```
Risk Score: 🔴 80/100
- Blast Radius: 25/30 (Runbook missing affects incident recovery)
- Criticality: 30/30 (Tier-1 service (30 × 1.0 multiplier))
- Immediacy: 10/20 (Should fix soon (warning))
- Dependency: 15/20 (Missing runbook affects on-call readiness)
```

### Impact
- ✅ Risk scores are transparent and justified
- ✅ Tier acts as multiplier (not all tier-1 = 30/30)
- ✅ Reviewers understand WHY each score was calculated
- ✅ Differentiation between obligation types

---

## Trust-Killer #4: Service Owner Check Lacks Nuance 🚧 PLANNED

### Problem
- Only supports narrow set of artifacts
- Doesn't acknowledge alternative evidence sources
- Creates noise for orgs using different systems

### Solution Design

#### 4.1 Show Accepted Evidence Sources
```
Accepted evidence (configured): catalog-info.yaml, backstage.yaml, service.yaml
Your org can add: OWNERS.yaml, ops/ownership.yaml, GitHub team mapping
```

#### 4.2 Configurable Evidence Sources
```yaml
obligations:
  - id: service-owner-declared
    acceptedEvidence:
      - catalog-info.yaml
      - backstage.yaml
      - service.yaml
      - OWNERS.yaml  # Custom org-specific
```

### Status
- 🚧 Design complete
- 🚧 Implementation (next phase)

---

## Trust-Killer #5: Too Repetitive (Structure) 🚧 PLANNED

### Problem
- Obligations list
- Findings list
- Provenance list
- Evidence trace list
- Same info in 4 sections

### Solution Design

#### 5.1 Consolidate Sections
- **Findings** = canonical section (what, why, how, evidence, risk)
- **Audit Trail** = collapsed/accordion (provenance, evidence trace)
- **Metadata** = collapsed (pack info, evaluation time)

#### 5.2 Remove Redundancy
- Don't repeat evidence in 3 places
- Don't show provenance unless debugging
- Focus on actionable findings

### Status
- 🚧 Design complete
- 🚧 Implementation (next phase)

---

## Files Modified

### Commit 1: Confidence & Risk Transparency (9927593)
1. `apps/api/src/services/gatekeeper/yaml-dsl/types.ts`
   - Added `confidenceBreakdown` to `RepoClassification`
   - Added `drivers` to `RiskScore`
   - Added `evidenceSearch` to `NormalizedFinding`

2. `apps/api/src/services/gatekeeper/yaml-dsl/repoClassifier.ts`
   - Enhanced classification to track explicit vs inferred sources
   - Added detailed evidence for repo type and tier
   - Compute confidence based on source type

3. `apps/api/src/services/gatekeeper/yaml-dsl/evaluationNormalizer.ts`
   - Enhanced risk scoring with transparent drivers
   - Tier now acts as multiplier (not hard max)
   - Added reasoning for each risk factor

4. `apps/api/src/services/gatekeeper/yaml-dsl/ultimateOutputRenderer.ts`
   - Show classification confidence + source in executive summary
   - Show risk drivers in findings

5. `TRACK_A_CRITICAL_LOGIC_FIXES.md` (NEW)
   - Summary of applicability gating fixes

---

### Commit 2: Evidence Transparency & Change Surface Summary (fe64fee)
1. `apps/api/src/services/gatekeeper/yaml-dsl/comparators/artifact/artifactPresent.ts`
   - Added `findClosestMatches()` helper function
   - Track searchedPaths, matchedPaths, closestMatches
   - Populate `metadata.evidenceSearch` in comparator results

2. `apps/api/src/services/gatekeeper/yaml-dsl/evaluationNormalizer.ts`
   - Added `extractEvidenceSearch()` helper
   - Extract evidenceSearch from comparator metadata
   - Attach to normalized findings

3. `apps/api/src/services/gatekeeper/yaml-dsl/ultimateOutputRenderer.ts`
   - Render evidence search in collapsible details
   - Enhanced change surface summary with THIS PR's files
   - Show triggered obligations per surface
   - Display detection patterns in collapsible details

---

## Next Steps

### Phase 3: Consolidate Repetitive Sections (Future)
- Collapse audit trail
- Remove redundant evidence
- Focus on findings

### Phase 4: Configurable Evidence Sources (Future)
- Allow orgs to configure accepted evidence
- Show alternative evidence paths
- Reduce noise for custom org setups

---

## Success Criteria

- [x] Confidence is credible (not fake 100%)
- [x] Classification sources are explicit
- [x] Risk scores are transparent and justified
- [x] Tier acts as multiplier (not hard max)
- [ ] Evidence search is transparent
- [ ] Change surface shows THIS PR's triggers
- [ ] Service owner check acknowledges alternatives
- [ ] Output is not repetitive

---

## Deployment

**Commit:** `9927593`
**Branch:** `main`
**Status:** Pushed to GitHub, Railway deploying

