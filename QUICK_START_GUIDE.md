# Quick Start Guide: Testing UI Field Mapping Fixes

## 🎯 What Was Fixed

**Problem**: UI form fields (packMode, scopePriority, etc.) were NOT being written to YAML, breaking Track A evaluation.

**Solution**: Implemented 3 fixes:
- ✅ **Fix A**: Merge UI fields into YAML before saving (all 4 authoring paths)
- ✅ **Fix B**: Removed redundant Templates tab, added green banner
- ✅ **Fix C**: Added confirmation dialog before overwriting templates

**Commit**: `8c64a18` (pushed to main)

---

## 🚀 Quick Start (5 minutes)

### Step 1: Start API Server
```bash
cd apps/api
pnpm install  # Only needed once
pnpm dev
```

Wait for: `Server running on http://localhost:3001`

### Step 2: Create Baseline Pack
```bash
# In a new terminal
./scripts/test-ui-field-mapping.sh
```

Expected output:
```
✅ Baseline pack created: <pack-id>
✅ Pack verified in database
✅ packMode found
✅ scopePriority found
✅ scopeMergeStrategy found
✅ packType found
```

### Step 3: Start Web Server
```bash
cd apps/web
pnpm install  # Only needed once
pnpm dev
```

Wait for: `Ready on http://localhost:3000`

### Step 4: Test UI Flow
1. Navigate to: http://localhost:3000/policy-packs/new?workspace=demo-workspace
2. **Step 1**: Fill in name, owner, packMode, etc.
3. **Step 2**: Fill in scope (repo, branches, etc.)
4. **Step 3**: Select "Baseline — Workspace Contract Integrity" template
5. **Step 4**: Verify green banner appears ✅
6. Click "Save"
7. Verify pack is created

### Step 5: Verify YAML
```bash
# Get pack ID from UI or API response
PACK_ID="<pack-id>"

# Fetch pack YAML
curl -s "http://localhost:3001/api/workspaces/demo-workspace/policy-packs/${PACK_ID}" | \
  jq -r '.policyPack.trackAConfigYamlDraft' | \
  grep -E "(packMode|scopePriority|scopeMergeStrategy)"
```

Expected output:
```yaml
packMode: enforce
scopePriority: 100
scopeMergeStrategy: HIGHEST_PRIORITY
```

---

## 📋 Full Testing Checklist

See `TESTING_PLAN_UI_FIELD_MAPPING.md` for comprehensive test cases.

### Quick Tests (15 minutes)

- [ ] **Test 1**: Template selected → Skip to save → YAML has UI fields
- [ ] **Test 2**: Template selected → Surfaces wizard → Confirmation dialog appears
- [ ] **Test 3**: No Templates tab in Step 4
- [ ] **Test 4**: Green banner appears when template loaded

### Full Tests (1 hour)

- [ ] All 4 authoring paths (template, surfaces, builder, manual YAML)
- [ ] All UI fields mapped correctly
- [ ] Track A evaluation uses merged fields

---

## 🐛 Troubleshooting

### API won't start
```bash
cd apps/api
rm -rf node_modules
pnpm install
```

### Web won't start
```bash
cd apps/web
rm -rf node_modules .next
pnpm install
```

### Baseline pack not created
```bash
# Check API logs
# Verify template exists
ls apps/api/src/services/gatekeeper/yaml-dsl/templates/baseline-contract-integrity.yaml
```

### YAML missing UI fields
```bash
# Check browser console for errors
# Verify mergeFormDataIntoYAML() is called
# Check network tab for POST request payload
```

---

## 📚 Documentation

- **Implementation Details**: `POLICY_PACK_UI_FIELD_MAPPING_FIXES.md`
- **Testing Plan**: `TESTING_PLAN_UI_FIELD_MAPPING.md`
- **Summary**: `IMPLEMENTATION_SUMMARY.md`
- **Flow Diagram**: See Mermaid diagram above

---

## 🎉 Success Criteria

✅ All code changes committed and pushed  
✅ Admin endpoint created  
✅ Testing plan documented  
✅ Test script created  
⏳ Manual testing (you do this)  
⏳ Create test PR (you do this)  
⏳ Verify Track A evaluation (you do this)  

---

## 📞 Next Steps

1. **Run quick tests** (5 minutes)
2. **Create test PR** to verify Track A evaluation:
   ```bash
   cd /tmp/vertaai-e2e-test
   git checkout -b test-ui-field-mapping
   echo 'test' >> README.md
   git add README.md
   git commit -m 'test: UI field mapping'
   git push origin test-ui-field-mapping
   gh pr create --title 'Test: UI Field Mapping' --body 'Testing UI field mapping fixes'
   ```
3. **Verify GitHub check run** shows baseline pack evaluation
4. **Confirm** packMode, scopePriority, scopeMergeStrategy are used

---

## 🔍 What to Look For in PR Check Run

Expected output:
```
⚠️ Baseline — Workspace Contract Integrity v1.0.0 (workspace): WARN
  Checks: 7, Coverage: X/7, Time: Xms

Details:
⚠️ Warnings
  - CODEOWNERS File Required: NOT_FOUND
  - Service Owner Required: NOT_FOUND
  
✅ Passing Checks
  - README File Required: PASS
  - Check-Run Must Always Be Posted: PASS
```

**Key things to verify**:
- ✅ Pack is evaluated (shows in check run)
- ✅ Pack mode is "warn" (shows warnings, doesn't block)
- ✅ Scope filters work (only evaluates on main/release/hotfix branches)
- ✅ Priority is used (if multiple packs, baseline has priority 10)


