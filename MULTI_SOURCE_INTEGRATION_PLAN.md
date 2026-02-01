# Multi-Source Integration Plan

**Status**: 📋 PLANNING  
**Date**: 2026-02-01  
**Author**: Senior Technical Architect

## Executive Summary

This document provides a comprehensive integration plan for wiring Points 2-10 of the Multi-Source Enrichment system into VertaAI's existing 18-state drift detection pipeline. The plan ensures that source-aware and output-aware logic exists **WITHIN each state**, not as new states.

## Core Architectural Principles

### 1. Universal State Machine (UNCHANGED)

The 18-state pipeline is a **universal primitive** that applies to ALL drift detection:

```
INGESTED 
  → ELIGIBILITY_CHECKED          ✅ Point 1 (DONE)
    → SIGNALS_CORRELATED         ⏳ Point 9
      → DRIFT_CLASSIFIED         ⏳ Point 10
        → DOCS_RESOLVED          ⏳ Point 2 + SOURCE_OUTPUT_COMPATIBILITY
          → DOC_CONTEXT_EXTRACTED
            → BASELINE_CHECKED   ⏳ Point 4
              → PATCH_PLANNED    ⏳ Point 6
                → PATCH_GENERATED ⏳ Point 5
                  → PATCH_VALIDATED ⏳ Point 3
                    → OWNER_RESOLVED ⏳ Point 7
                      → SLACK_SENT  ⏳ Point 8
```

### 2. Source-Output Compatibility Matrix (NEW - CRITICAL)

**Hard Constraints**: Which input sources can target which output systems

| Input Source | Allowed Outputs | Rationale |
|--------------|----------------|-----------|
| `github_pr` | README, Swagger, Code Comments, Confluence, Notion, GitBook, Backstage | Developer changes can update any functional/team docs |
| `pagerduty_incident` | Confluence, Notion, GitBook, Backstage | Operational runbooks + service catalog |
| `slack_cluster` | Confluence, Notion, GitBook, README | FAQ sections in knowledge bases |
| `datadog_alert` | Confluence, Notion, GitBook | Observability runbooks only |
| `github_iac` | README, Confluence, Notion | Infrastructure docs (README preferred) |
| `github_codeowners` | Backstage, README, Confluence, Notion | Team/ownership docs |

**Key Design Decisions**:
- IaC changes → README.md (infrastructure docs live in code)
- PagerDuty incidents → Runbooks only (operational docs)
- Slack questions → FAQ sections (knowledge base)
- CODEOWNERS → Backstage + team docs (service catalog)

### 3. Drift Type Preferences (EXISTING - SOFT)

**Soft Preferences**: Which drift types prefer which outputs (can be overridden by source constraints)

| Drift Type | Preferred Outputs | Priority |
|------------|------------------|----------|
| `instruction` | README, Swagger, Code Comments | Developer docs |
| `process` | Confluence, Notion, GitBook | Runbooks |
| `ownership` | Backstage, Confluence, Notion | Team docs |
| `coverage` | Confluence, Notion, GitBook | FAQ |
| `environment_tooling` | README, Confluence, Notion | Infra docs |

## Integration Plan by State Transition

### ✅ State 1→2: INGESTED → ELIGIBILITY_CHECKED

**Status**: COMPLETE  
**Point**: 1 - Eligibility Rules  
**File**: `apps/api/src/services/orchestrator/transitions.ts` (lines 113-197)

**Implementation**: Already wired. Source-specific eligibility rules filter signals before processing.

---

### ⏳ State 2→3: ELIGIBILITY_CHECKED → SIGNALS_CORRELATED

**Status**: TODO  
**Point**: 9 - Correlation Strategies  
**File**: `apps/api/src/config/correlationStrategies.ts`

**Integration Steps**:
1. Import `calculateCorrelationScore()` in `transitions.ts`
2. In `handleEligibilityChecked()`, correlate with existing signals:
   ```typescript
   const existingSignals = await getRecentSignals(workspaceId, 72h);
   for (const existing of existingSignals) {
     const score = calculateCorrelationScore(newSignal, existing);
     if (score > 0.7) {
       // Merge signals or boost confidence
     }
   }
   ```
3. Update `DriftCandidate.metadata.correlatedSignals` array
4. Boost confidence score based on correlation

**Data Elements**:
- `DriftCandidate.metadata.correlatedSignals: string[]` (signal IDs)
- `DriftCandidate.metadata.correlationScore: number` (0-1)

---

### ⏳ State 3→4: SIGNALS_CORRELATED → DRIFT_CLASSIFIED

**Status**: TODO  
**Point**: 10 - Domain Patterns by Source  
**File**: `apps/api/src/services/baseline/patterns.ts` (lines 987-1138)

**Integration Steps**:
1. Import `detectDomainsFromSource()` in drift classification logic
2. Use source-specific patterns instead of generic patterns:
   ```typescript
   const domains = detectDomainsFromSource(signal.content, signal.sourceType);
   ```
3. Update `DriftCandidate.domains` with detected domains

**Data Elements**:
- `DriftCandidate.domains: string[]` (e.g., ['rollback', 'deployment'])

---

### ⏳ State 4→5: DRIFT_CLASSIFIED → DOCS_RESOLVED

**Status**: TODO (CRITICAL)  
**Point**: 2 - Doc Targeting + SOURCE_OUTPUT_COMPATIBILITY  
**File**: `apps/api/src/config/docTargeting.ts`

**Integration Steps**:
1. Import `getTargetDocSystemsForSourceAndDrift()` in `handleDocsResolved()`
2. Replace current doc resolution logic:
   ```typescript
   const targetSystems = getTargetDocSystemsForSourceAndDrift(
     candidate.sourceType,
     candidate.driftType
   );
   ```
3. Filter by workspace-enabled doc systems
4. Update `DriftCandidate.targetDocSystems: DocSystem[]`

**Data Elements**:
- `DriftCandidate.targetDocSystems: DocSystem[]` (priority-ordered)
- `DriftCandidate.metadata.sourceOutputCompatible: boolean`

**Architecture Delta**:
- Add `sourceType: InputSourceType` to `DriftCandidate` schema
- Add `targetDocSystems: DocSystem[]` to `DriftCandidate` schema

---

### ⏳ State 6→7: BASELINE_CHECKED → PATCH_PLANNED

**Status**: TODO  
**Point**: 6 - Patch Styles by Output  
**File**: `apps/api/src/config/patchStyles.ts`

**Integration Steps**:
1. Import `getPatchStyle()` in patch planning logic
2. Select patch style based on target doc system:
   ```typescript
   const style = getPatchStyle(candidate.targetDocSystems[0], candidate.driftType);
   ```
3. Validate confidence threshold for risky styles (e.g., `reorder_steps`)
4. Update `DriftCandidate.metadata.patchStyle: string`

**Data Elements**:
- `DriftCandidate.metadata.patchStyle: string` (e.g., 'update_section')
- `DriftCandidate.metadata.patchStyleSafe: boolean`

---

## 📊 Source → Output Compatibility Matrix (IMPLEMENTED)

The following matrix defines **hard constraints** for which input sources can target which output systems. This is based on the architectural diagrams and ensures deterministic routing.

### Matrix Implementation

```typescript
// From apps/api/src/config/docTargeting.ts (lines 158-201)

export const SOURCE_OUTPUT_COMPATIBILITY: Record<InputSourceType, DocSystem[]> = {
  github_pr: [
    'github_readme',
    'github_swagger',
    'github_code_comments',
    'confluence',
    'notion',
    'gitbook',
    'backstage',  // Can update service descriptions
  ],

  pagerduty_incident: [
    'confluence',   // Runbooks
    'notion',       // Runbooks
    'gitbook',      // Runbooks
    'backstage',    // Service catalog (on-call info)
  ],

  slack_cluster: [
    'confluence',   // FAQ sections
    'notion',       // FAQ sections
    'gitbook',      // FAQ sections
    'github_readme', // FAQ in README
  ],

  datadog_alert: [
    'confluence',   // Observability runbooks
    'notion',       // Observability runbooks
    'gitbook',      // Observability runbooks
  ],

  github_iac: [
    'github_readme',  // Infrastructure docs in README (PRIMARY)
    'confluence',     // Deployment guides
    'notion',         // Deployment guides
  ],

  github_codeowners: [
    'backstage',      // Service catalog ownership (PRIMARY)
    'github_readme',  // Team section in README
    'confluence',     // Team pages
    'notion',         // Team pages
  ],
};
```

### Two-Level Routing Algorithm

The system uses a **two-level routing decision** that combines:

1. **Hard Constraint**: Source → Output compatibility (must satisfy)
2. **Soft Preference**: Drift Type → Preferred outputs (should satisfy)

```typescript
export function getTargetDocSystemsForSourceAndDrift(
  sourceType: InputSourceType,
  driftType: DriftType
): DocSystem[] {
  // Step 1: Get allowed outputs for this source (hard constraint)
  const allowedOutputs = SOURCE_OUTPUT_COMPATIBILITY[sourceType] || [];

  // Step 2: Get preferred outputs for this drift type
  const driftConfig = DRIFT_TYPE_TO_DOC_TARGETS[driftType];
  const preferredOutputs = [...driftConfig.primary, ...driftConfig.secondary];

  // Step 3: Intersect - only outputs that satisfy BOTH constraints
  const validOutputs = preferredOutputs.filter(output =>
    allowedOutputs.includes(output) && !driftConfig.exclude.includes(output)
  );

  // Step 4: If no valid outputs, fall back to allowed outputs
  if (validOutputs.length === 0) {
    return allowedOutputs.filter(output => !driftConfig.exclude.includes(output));
  }

  return validOutputs;
}
```

### Example Routing Scenarios

| Input Source | Drift Type | Allowed Outputs (Hard) | Preferred Outputs (Soft) | Final Targets |
|--------------|------------|------------------------|--------------------------|---------------|
| `github_iac` | `environment_tooling` | README, Confluence, Notion | README, Confluence, Backstage | ✅ README, Confluence |
| `pagerduty_incident` | `process` | Confluence, Notion, GitBook, Backstage | Confluence, Notion, GitBook | ✅ Confluence, Notion, GitBook |
| `slack_cluster` | `coverage` | Confluence, Notion, GitBook, README | Confluence, Notion, README | ✅ Confluence, Notion, README |
| `github_codeowners` | `ownership` | Backstage, README, Confluence, Notion | Backstage, Confluence, Notion | ✅ Backstage, Confluence, Notion |
| `github_pr` | `instruction` | All 7 outputs | README, Swagger, Code Comments | ✅ README, Swagger, Code Comments |

**Key Insights**:
- IaC changes will **never** target Swagger or Code Comments (infrastructure docs belong in README)
- PagerDuty incidents will **never** target README or Swagger (operational docs belong in runbooks)
- Slack questions will **never** target Backstage or Code Comments (FAQs belong in knowledge bases)
- CODEOWNERS changes will **never** target Swagger or Code Comments (ownership docs belong in service catalog)

---

## 📋 Integration Checklist

### Phase 1: Core Routing (CRITICAL) ✅ COMPLETE
- [x] **Point 1**: Eligibility Rules by Source
- [x] **Point 2**: Doc Targeting by Drift Type
- [x] Source-Output Compatibility Matrix
- [x] Integration with state machine (Point 1 only)

### Phase 2: Safety & Precision (HIGH) ✅ COMPLETE
- [x] **Point 3**: Validators by Output
- [x] **Point 4**: Section Targeting by Output
- [x] **Point 7**: Pre-Validators by Source

### Phase 3: Intelligence (HIGH) ✅ COMPLETE
- [x] **Point 5**: Scoring Model by Source
- [x] **Point 6**: Patch Styles by Output
- [x] **Point 9**: Correlation Strategy

### Phase 4: Fine-Tuning (MEDIUM) ✅ COMPLETE
- [x] **Point 8**: Thresholds by Source
- [x] **Point 10**: Domain Patterns by Source

### Phase 5: State Machine Integration (TODO)
- [ ] Wire Point 2 into `DOCS_RESOLVED` state
- [ ] Wire Point 3 into `PATCH_VALIDATED` state
- [ ] Wire Point 4 into `BASELINE_CHECKED` state
- [ ] Wire Point 5 into `PATCH_GENERATED` state
- [ ] Wire Point 6 into `PATCH_PLANNED` state
- [ ] Wire Point 7 into `OWNER_RESOLVED` state
- [ ] Wire Point 8 into `SLACK_SENT` state
- [ ] Wire Point 9 into `SIGNALS_CORRELATED` state
- [ ] Wire Point 10 into `DRIFT_CLASSIFIED` state

---

## 🎯 Summary

**Configuration Files: ✅ COMPLETE**

All 10 enrichment points have been successfully implemented in configuration files:

- ✅ `apps/api/src/config/docTargeting.ts` - Source-output compatibility matrix + routing logic
- ✅ `apps/api/src/config/eligibilityRules.ts` - Source-specific eligibility rules
- ✅ `apps/api/src/config/outputValidators.ts` - Output validators and pre-validators
- ✅ `apps/api/src/config/scoringWeights.ts` - Source-specific scoring weights
- ✅ `apps/api/src/config/patchStyles.ts` - Output-specific patch styles
- ✅ `apps/api/src/config/correlationStrategies.ts` - Cross-source correlation

**State Machine Integration: ⏳ TODO**

Points 2-10 need to be wired into the appropriate state transitions in `apps/api/src/services/orchestrator/transitions.ts`.

**Next Steps**:
1. Review the source-output compatibility matrix to ensure it aligns with product requirements
2. Begin wiring Points 2-10 into state transitions (see detailed integration steps above)
3. Test each integration point before proceeding to the next
4. Update `DriftCandidate` schema to include new metadata fields

---

**Status**: ✅ Configuration Complete - ⏳ State Machine Integration Pending
**Last Updated**: 2026-02-01

