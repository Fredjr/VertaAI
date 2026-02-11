# Frontend-Backend Integration Gap Assessment

## 🎯 Executive Summary

**Critical Finding**: We've implemented powerful control-plane features in the backend (Gap #6, Gap #9), but **the frontend UI does not expose these controls to users**. This creates a **configuration gap** where users cannot leverage the features we've built.

---

## 📊 Gap Analysis

### ✅ What We've Implemented in Backend (Gap #6 + Gap #9)

**Backend Schema** (`apps/api/prisma/schema.prisma` - Lines 742-746):
```prisma
// Gap #6 Part 2: Control-Plane Fields
docTargeting   Json @default("{}") @map("doc_targeting")
sourceCursors  Json @default("{}") @map("source_cursors")
budgets        Json @default("{}") // { maxDriftsPerDay: 50, maxDriftsPerWeek: 200, maxSlackNotificationsPerHour: 5, enableClustering: true }
noiseControls  Json @default("{}") @map("noise_controls")
```

**Backend Logic**:
- ✅ Budget enforcement (`apps/api/src/services/plans/budgetEnforcement.ts`)
- ✅ Noise filtering (`apps/api/src/services/plans/noiseFiltering.ts`)
- ✅ Cluster aggregation (`apps/api/src/services/clustering/aggregator.ts`)
- ✅ Plan resolution with threshold routing (`apps/api/src/services/plans/resolver.ts`)
- ✅ PlanRun tracking for audit trail

---

### ❌ What's Missing in Frontend UI

**Current Frontend** (`apps/web/src/app/plans/new/page.tsx`):

**Exposed Fields** (Lines 126-156):
- ✅ `name`, `description`
- ✅ `scopeType`, `scopeRef`
- ✅ `docClass`
- ✅ `inputSources` (checkboxes)
- ✅ `driftTypes` (checkboxes)
- ✅ `allowedOutputs` (checkboxes)
- ✅ `templateId` (template selection)

**Missing Fields** (NOT exposed in UI):
- ❌ `thresholds` - Auto-approve, Slack notify, digest-only, ignore thresholds
- ❌ `budgets.maxDriftsPerDay` - Daily drift limit
- ❌ `budgets.maxDriftsPerWeek` - Weekly drift limit
- ❌ `budgets.maxSlackNotificationsPerHour` - Notification rate limit
- ❌ `budgets.enableClustering` - **Gap #9 cluster-first triage toggle** ⚠️ **CRITICAL**
- ❌ `noiseControls.ignorePatterns` - Keyword patterns to filter
- ❌ `noiseControls.ignorePaths` - File paths to filter
- ❌ `noiseControls.ignoreAuthors` - Authors to filter
- ❌ `docTargeting.strategy` - Doc selection strategy
- ❌ `docTargeting.maxDocsPerDrift` - Max docs to update per drift
- ❌ `docTargeting.priorityOrder` - Doc system priority order

---

## 🚨 Critical Issues

### Issue #1: Cluster-First Triage Not Configurable ⚠️ **HIGHEST PRIORITY**

**Problem**: We implemented Gap #9 (cluster-first triage) with `budgets.enableClustering` flag, but **users cannot enable it** because the UI doesn't expose this control.

**Impact**:
- Users cannot reduce notification fatigue (80-90% reduction)
- Cluster-first triage is effectively **disabled for all users**
- Gap #9 implementation is **not usable** in production

**Backend Code** (`apps/api/src/services/orchestrator/transitions.ts` - Line 2574):
```typescript
const clusteringEnabled = budgetsConfig.enableClustering === true;
```

**Frontend Gap**: No UI control to set `budgets.enableClustering = true`

---

### Issue #2: Budget Controls Not Configurable ⚠️ **HIGH PRIORITY**

**Problem**: Budget enforcement logic exists in backend, but users cannot configure budget limits.

**Impact**:
- Users cannot prevent notification fatigue
- Users cannot control processing costs
- Budget enforcement is **not usable** in production

**Backend Code** (`apps/api/src/services/plans/budgetEnforcement.ts`):
- `maxDriftsPerDay` - Default: 50
- `maxDriftsPerWeek` - Default: 200
- `maxSlackNotificationsPerHour` - Default: 5

**Frontend Gap**: No UI controls to configure these limits

---

### Issue #3: Noise Controls Not Configurable ⚠️ **HIGH PRIORITY**

**Problem**: Noise filtering logic exists in backend, but users cannot configure custom filters.

**Impact**:
- Users cannot filter out their specific noise patterns
- Users cannot customize filtering for their workflow
- Noise filtering is **not customizable** in production

**Backend Code** (`apps/api/src/services/plans/noiseFiltering.ts`):
- `ignorePatterns` - Filter by title/body patterns
- `ignorePaths` - Filter by file paths
- `ignoreAuthors` - Filter by authors

**Frontend Gap**: No UI controls to configure these filters

---

### Issue #4: Threshold Configuration Not Exposed ⚠️ **MEDIUM PRIORITY**

**Problem**: Threshold routing logic exists in backend, but users cannot override thresholds per plan.

**Impact**:
- Users cannot customize routing decisions per plan
- Users stuck with workspace-level defaults
- Plan-level threshold overrides are **not usable** in production

**Backend Code** (`apps/api/src/services/plans/resolver.ts`):
- `autoApprove` - Default: 0.98
- `slackNotify` - Default: 0.40
- `digestOnly` - Default: 0.30
- `ignore` - Default: 0.20

**Frontend Gap**: No UI controls to configure these thresholds

---

## 📋 Implementation Plan

### Priority 1: Enable Cluster-First Triage (1 day)

**Goal**: Add UI toggle for `budgets.enableClustering`

**Tasks**:
1. Add "Enable Cluster-First Triage" toggle to plan creation form
2. Add explanation text about notification reduction (80-90%)
3. Update form submission to include `budgets.enableClustering`
4. Add to plan detail view
5. Test end-to-end: UI → API → Database → Workflow Logic

**Files to Modify**:
- `apps/web/src/app/plans/new/page.tsx` - Add toggle
- `apps/web/src/app/plans/[id]/page.tsx` - Display toggle in detail view

---

### Priority 2: Add Budget Controls UI (1 day)

**Goal**: Add UI inputs for budget limits

**Tasks**:
1. Add "Budget Limits" section to plan creation form
2. Add number inputs for:
   - Max Drifts Per Day (default: 50)
   - Max Drifts Per Week (default: 200)
   - Max Slack Notifications Per Hour (default: 5)
3. Add explanation text for each limit
4. Update form submission to include `budgets` object
5. Add to plan detail view

**Files to Modify**:
- `apps/web/src/app/plans/new/page.tsx` - Add budget inputs
- `apps/web/src/app/plans/[id]/page.tsx` - Display budgets in detail view

---

### Priority 3: Add Noise Controls UI (1 day)

**Goal**: Add UI inputs for noise filtering

**Tasks**:
1. Add "Noise Filtering" section to plan creation form
2. Add text area inputs for:
   - Ignore Patterns (comma-separated)
   - Ignore Paths (comma-separated)
   - Ignore Authors (comma-separated)
3. Add explanation text and examples
4. Update form submission to include `noiseControls` object
5. Add to plan detail view

**Files to Modify**:
- `apps/web/src/app/plans/new/page.tsx` - Add noise control inputs
- `apps/web/src/app/plans/[id]/page.tsx` - Display noise controls in detail view

---

### Priority 4: Add Threshold Configuration UI (1 day)

**Goal**: Add UI sliders for threshold overrides

**Tasks**:
1. Add "Threshold Overrides" section to plan creation form
2. Add range sliders for:
   - Auto-Approve Threshold (0-100%, default: 98%)
   - Slack Notify Threshold (0-100%, default: 40%)
   - Digest-Only Threshold (0-100%, default: 30%)
   - Ignore Threshold (0-100%, default: 20%)
3. Add explanation text for each threshold
4. Update form submission to include `thresholds` object
5. Add to plan detail view

**Files to Modify**:
- `apps/web/src/app/plans/new/page.tsx` - Add threshold sliders
- `apps/web/src/app/plans/[id]/page.tsx` - Display thresholds in detail view

---

## ✅ Success Criteria

1. **Cluster-First Triage**: Users can enable/disable clustering via UI toggle
2. **Budget Controls**: Users can configure budget limits via UI inputs
3. **Noise Controls**: Users can configure noise filters via UI inputs
4. **Threshold Overrides**: Users can configure thresholds via UI sliders
5. **Bidirectional Data Flow**: UI → API → Database → Workflow Logic (verified end-to-end)
6. **Plan Detail View**: All new fields displayed in plan detail view
7. **Form Validation**: Proper validation for all new inputs
8. **User Experience**: Clear explanations and examples for each control

---

## 🎯 Expected Impact

**After Implementation**:
- ✅ Users can enable cluster-first triage (80-90% notification reduction)
- ✅ Users can configure budget limits (prevent notification fatigue)
- ✅ Users can configure noise filters (reduce false positives)
- ✅ Users can configure thresholds (customize routing decisions)
- ✅ Gap #6 and Gap #9 features are **fully usable** in production
- ✅ Complete control-plane configuration exposed to users

