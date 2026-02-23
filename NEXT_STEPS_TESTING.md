# Next Steps: Testing UI Field Mapping & Baseline Pack

## ✅ What's Complete

1. **Fix A: UI Field Mapping** - `mergeFormDataIntoYAML()` function merges all UI fields into YAML
2. **Fix B: Template Selection UX** - Removed redundant Templates tab, added green banner
3. **Fix C: Validation** - Confirmation dialog before Surfaces wizard overwrites template
4. **Admin Endpoint** - `POST /api/admin/create-baseline-pack` for programmatic pack creation
5. **Documentation** - Comprehensive testing plan, implementation summary, quick start guide
6. **Code Committed** - All changes pushed to main (commit `8c64a18`)

## 📋 What You Need to Do

### Step 1: Install Dependencies & Start API Server

```bash
# Terminal 1: Start API server
cd /Users/fredericle/VertaAI/apps/api
pnpm install
pnpm dev
```

Wait for: `Server running on http://localhost:3001`

### Step 2: Create Baseline Pack via Admin Endpoint

```bash
# Terminal 2: Call admin endpoint
curl -X POST http://localhost:3001/api/admin/create-baseline-pack | jq '.'
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

### Step 3: Verify Pack in Database

```bash
# Get pack ID from previous response
PACK_ID="<pack-id-from-response>"

# Fetch pack details
curl -s "http://localhost:3001/api/workspaces/demo-workspace/policy-packs/${PACK_ID}" | jq '.policyPack | {id, name, packStatus, trackAEnabled, packMetadataId}'
```

### Step 4: Check YAML Contains Expected Fields

```bash
# Extract YAML and check for required fields
curl -s "http://localhost:3001/api/workspaces/demo-workspace/policy-packs/${PACK_ID}" | \
  jq -r '.policyPack.trackAConfigYamlPublished' | \
  grep -E "(packMode|scopePriority|scopeMergeStrategy|packType)"
```

Expected output:
```yaml
packMode: warn
scopePriority: 10
scopeMergeStrategy: MOST_RESTRICTIVE
packType: GLOBAL_BASELINE
```

### Step 5: Create Test PR (PR #23)

```bash
# Clone e2e test repo (if not already cloned)
cd /tmp
git clone https://github.com/Fredjr/vertaai-e2e-test.git
cd vertaai-e2e-test

# Create test branch
git checkout main
git pull origin main
git checkout -b test-baseline-pack-pr23

# Make a simple change
echo "# Testing Baseline Pack" >> README.md
git add README.md
git commit -m "test: baseline pack evaluation (PR #23)"

# Push and create PR
git push origin test-baseline-pack-pr23
gh pr create \
  --title "Test: Baseline Pack Evaluation (PR #23)" \
  --body "Testing the baseline-contract-integrity pack rules:

## Expected Behavior

The baseline pack should evaluate the following rules:

1. ✅ **Check-Run Must Always Be Posted** - Should PASS (checkrun is always posted)
2. ⚠️ **CODEOWNERS File Required** - Should WARN (file may not exist)
3. ⚠️ **Service Owner Required** - Should WARN (owner may not be defined)
4. ⚠️ **Ownership↔Docs Parity** - Should WARN (docs may not match)
5. ⚠️ **Runbook Required (Tier-1)** - Should WARN (runbook may not exist)
6. ⚠️ **Alert Routing Ownership** - Should WARN (routing may not be defined)
7. ⚠️ **Waiver Policy** - Should WARN (waiver may not be defined)

## Pack Configuration

- **Pack Mode**: `warn` (should show warnings but NOT block PR)
- **Scope**: `workspace` (applies to all repos)
- **Branches**: `main`, `release/*`, `hotfix/*`
- **Priority**: `10` (low priority baseline)
- **Merge Strategy**: `MOST_RESTRICTIVE`

## What to Verify

- [ ] GitHub check run appears: \"VertaAI / Baseline Contract Integrity\"
- [ ] Pack mode is \"warn\" (shows warnings, doesn't block)
- [ ] All 7 rules are evaluated
- [ ] Coverage report shows \"X/7 rules evaluable\"
- [ ] Global decision is NOT affected by observe-mode packs
- [ ] Scope filters work (only evaluates on main/release/hotfix branches)
"
```

### Step 6: Verify GitHub Check Run

1. Go to PR #23 on GitHub: https://github.com/Fredjr/vertaai-e2e-test/pull/23
2. Check for GitHub check run: "VertaAI / Baseline Contract Integrity"
3. Verify output shows:
   - Pack name and version
   - Pack mode (warn)
   - Rule evaluation results
   - Coverage report (X/7 rules evaluable)
   - Global decision (should be WARN, not BLOCK)

Expected check run output:
```
⚠️ Baseline — Workspace Contract Integrity v1.0.0 (workspace): WARN
  Checks: 7, Coverage: X/7, Time: Xms

Details:
⚠️ Warnings
  - CODEOWNERS File Required: NOT_FOUND
  - Service Owner Required: NOT_FOUND
  - Ownership↔Docs Parity: NOT_EVALUABLE
  - Runbook Required (Tier-1): NOT_FOUND
  - Alert Routing Ownership: NOT_EVALUABLE
  - Waiver Policy: NOT_EVALUABLE
  
✅ Passing Checks
  - Check-Run Must Always Be Posted: PASS
```

### Step 7: Test UI Field Mapping (Optional)

```bash
# Terminal 3: Start web server
cd /Users/fredericle/VertaAI/apps/web
pnpm install
pnpm dev
```

Wait for: `Ready on http://localhost:3000`

Then follow the testing plan in `TESTING_PLAN_UI_FIELD_MAPPING.md`:
1. Navigate to: http://localhost:3000/policy-packs/new?workspace=demo-workspace
2. Test all 4 authoring paths (template, surfaces, builder, manual YAML)
3. Verify UI fields are merged into YAML
4. Verify green banner appears when template is loaded
5. Verify confirmation dialog appears before Surfaces wizard overwrites template

## 🎯 Success Criteria

- [ ] API server starts successfully
- [ ] Baseline pack created via admin endpoint
- [ ] Pack verified in database with correct YAML fields
- [ ] PR #23 created in e2e test repo
- [ ] GitHub check run appears and evaluates baseline pack
- [ ] Pack mode (warn) is respected (doesn't block PR)
- [ ] All 7 rules are evaluated
- [ ] Coverage report is accurate
- [ ] (Optional) UI field mapping tested for all 4 authoring paths

## 📚 Reference Documentation

- **Quick Start**: `QUICK_START_GUIDE.md`
- **Testing Plan**: `TESTING_PLAN_UI_FIELD_MAPPING.md`
- **Implementation Summary**: `IMPLEMENTATION_SUMMARY.md`
- **Admin Endpoint Clarification**: `ADMIN_ENDPOINT_CLARIFICATION.md`
- **Test Script**: `scripts/test-ui-field-mapping.sh`

## 🐛 Troubleshooting

See `QUICK_START_GUIDE.md` for troubleshooting tips.

