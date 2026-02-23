# Testing Plan: UI Field Mapping & Template Selection

## Overview

This document outlines the testing plan to verify that all UI fields are properly mapped to YAML and used by Track A evaluation logic, regardless of which authoring path the user chooses.

---

## Prerequisites

### 1. Start API Server
```bash
cd apps/api
pnpm install
pnpm dev
```

### 2. Create Baseline Pack (Admin Endpoint)
```bash
curl -X POST http://localhost:3001/api/admin/create-baseline-pack
```

Expected response:
```json
{
  "success": true,
  "pack": {
    "id": "...",
    "name": "Baseline — Workspace Contract Integrity",
    "packMetadataId": "baseline-contract-integrity",
    "packMetadataVersion": "1.0.0",
    "packHash": "...",
    "scopeType": "workspace",
    "scopeRef": "demo-workspace",
    "publishedAt": "..."
  }
}
```

### 3. Start Web Server
```bash
cd apps/web
pnpm install
pnpm dev
```

---

## Test Suite 1: UI Field Mapping (Fix A)

### Test 1.1: Option 1 - Template Selected, Skip to Save

**Steps**:
1. Navigate to `/policy-packs/new?workspace=demo-workspace`
2. **Step 1 - Overview & Identity**:
   - Name: `Test Pack Option 1`
   - Description: `Testing template selection with skip`
   - Owner: `platform-team`
   - Pack Type: `SERVICE_OVERLAY`
   - Pack Mode: `enforce`
   - Strictness: `strict`
3. **Step 2 - Scope Configuration**:
   - Scope Type: `repo`
   - Scope Ref: `Fredjr/vertaai-e2e-test`
   - Repos Include: `Fredjr/vertaai-e2e-test`
   - Branches Include: `main`, `develop`
   - Scope Priority: `100`
   - Scope Merge Strategy: `HIGHEST_PRIORITY`
4. **Step 3 - Pack Defaults**:
   - Click "Start from a Template"
   - Select "Baseline — Workspace Contract Integrity"
   - Verify green checkmark appears
5. **Step 4 - Policy Authoring**:
   - Verify green banner: "✅ Template loaded from Step 3"
   - **DO NOT** edit anything
   - Click "Next"
6. **Step 5-6**: Skip, click "Next"
7. Click "Save"

**Expected Result**:
- Pack is created successfully
- YAML contains:
  ```yaml
  metadata:
    name: Test Pack Option 1
    description: Testing template selection with skip
    owner: platform-team
    packType: SERVICE_OVERLAY
    packMode: enforce
    strictness: strict
    scopePriority: 100
    scopeMergeStrategy: HIGHEST_PRIORITY
  scope:
    type: repo
    ref: Fredjr/vertaai-e2e-test
    repos:
      include:
        - Fredjr/vertaai-e2e-test
    branches:
      include:
        - main
        - develop
  rules:
    # ... template rules preserved ...
  ```

**Verification**:
```bash
# Get pack from API
curl http://localhost:3001/api/workspaces/demo-workspace/policy-packs/{pack-id}

# Check YAML contains UI fields
echo "$YAML" | grep "packMode: enforce"
echo "$YAML" | grep "scopePriority: 100"
echo "$YAML" | grep "scopeMergeStrategy: HIGHEST_PRIORITY"
```

---

### Test 1.2: Option 2 - Surfaces Wizard Overwrites Template

**Steps**:
1. Navigate to `/policy-packs/new?workspace=demo-workspace`
2. **Step 1-2**: Same as Test 1.1, but use:
   - Name: `Test Pack Option 2`
   - Pack Mode: `warn`
   - Scope Priority: `75`
3. **Step 3**: Select "Observe Core Pack" template
4. **Step 4 - Policy Authoring**:
   - Verify green banner appears
   - Click "Surfaces" tab
   - Select surface: `openapi_changed`
   - Click "Generate Rules"
   - **Verify confirmation dialog** appears: "⚠️ Warning: This will replace your current YAML configuration..."
   - Click "OK"
   - Verify YAML is updated with generated rules
5. Click "Save"

**Expected Result**:
- YAML contains UI fields + generated rules (template rules replaced)
- `packMode: warn`, `scopePriority: 75` are in YAML

---

### Test 1.3: Option 3 - Builder Edits Template

**Steps**:
1. Navigate to `/policy-packs/new?workspace=demo-workspace`
2. **Step 1-2**: Same as Test 1.1, but use:
   - Name: `Test Pack Option 3`
   - Pack Mode: `observe`
   - Scope Priority: `50`
3. **Step 3**: Select "Baseline — Workspace Contract Integrity" template
4. **Step 4 - Policy Authoring**:
   - Click "Builder" tab
   - Edit a rule (e.g., change severity)
   - Click "YAML" tab to verify changes
5. Click "Save"

**Expected Result**:
- YAML contains UI fields + edited template rules
- `packMode: observe`, `scopePriority: 50` are in YAML

---

### Test 1.4: Option 4 - Manual YAML Edit

**Steps**:
1. Navigate to `/policy-packs/new?workspace=demo-workspace`
2. **Step 1-2**: Same as Test 1.1, but use:
   - Name: `Test Pack Option 4`
   - Pack Mode: `enforce`
   - Scope Priority: `90`
3. **Step 3**: Select "Observe Core Pack" template
4. **Step 4 - Policy Authoring**:
   - Click "Advanced YAML" tab
   - Manually edit YAML (e.g., add a new rule)
5. Click "Save"

**Expected Result**:
- YAML contains UI fields + manual edits
- `packMode: enforce`, `scopePriority: 90` are in YAML

---

## Test Suite 2: Template Selection UX (Fix B)

### Test 2.1: Template Banner Appears

**Steps**:
1. Navigate to `/policy-packs/new?workspace=demo-workspace`
2. **Step 3**: Select any template
3. **Step 4**: Navigate to Policy Authoring

**Expected Result**:
- Green banner appears: "✅ Template loaded from Step 3"
- Warning text: "Using the Surfaces wizard will replace the template rules"

### Test 2.2: Templates Tab Removed

**Steps**:
1. Navigate to `/policy-packs/new?workspace=demo-workspace`
2. **Step 4**: Navigate to Policy Authoring

**Expected Result**:
- Tabs visible: Surfaces, Builder, Advanced YAML, Preview, Exceptions & Waivers
- **Templates tab is NOT visible**

---

## Test Suite 3: Validation (Fix C)

### Test 3.1: Confirmation Dialog on Surfaces Overwrite

**Steps**:
1. Navigate to `/policy-packs/new?workspace=demo-workspace`
2. **Step 3**: Select any template
3. **Step 4**: Click "Surfaces" tab
4. Select a surface and click "Generate Rules"

**Expected Result**:
- Confirmation dialog appears
- Message: "⚠️ Warning: This will replace your current YAML configuration with generated rules from the Surfaces wizard. Your template rules will be overwritten. Continue?"
- User can click "Cancel" to abort
- User can click "OK" to proceed

---

## Test Suite 4: Track A Evaluation Uses Merged Fields

### Test 4.1: Pack Mode Used in Evaluation

**Steps**:
1. Create pack with `packMode: observe` (Test 1.3)
2. Publish pack
3. Create PR in `Fredjr/vertaai-e2e-test`
4. Check GitHub check run output

**Expected Result**:
- Pack is evaluated
- Global decision **excludes** observe pack (observe packs don't affect global decision)
- Output shows: "👁️ Observation complete - no issues detected"

### Test 4.2: Scope Priority Used in Conflict Resolution

**Steps**:
1. Create two packs with same scope but different priorities:
   - Pack A: `scopePriority: 100`
   - Pack B: `scopePriority: 50`
2. Both packs have conflicting rules
3. Create PR

**Expected Result**:
- Pack A (higher priority) wins conflict resolution
- Effective policy uses Pack A's rules

### Test 4.3: Scope Merge Strategy Used in Decision Aggregation

**Steps**:
1. Create pack with `scopeMergeStrategy: MOST_RESTRICTIVE`
2. Pack has multiple rules with different decisions (PASS, WARN, BLOCK)
3. Create PR

**Expected Result**:
- Global decision uses MOST_RESTRICTIVE strategy
- If any rule is BLOCK, global decision is BLOCK

---

## Success Criteria

✅ All 4 authoring paths produce valid YAML with UI fields merged  
✅ Template selection is only in Step 3 (no Templates tab in Step 4)  
✅ Green banner appears when template is loaded  
✅ Confirmation dialog appears before Surfaces wizard overwrites template  
✅ `packMode` is used to exclude observe packs from global decision  
✅ `scopePriority` is used for conflict resolution  
✅ `scopeMergeStrategy` is used for decision aggregation  
✅ `scope.repos/branches` filters are used for pack matching  


