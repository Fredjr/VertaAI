# Production Testing Steps: Baseline Pack & UI Field Mapping

## 🎯 Goal

Test the UI field mapping fixes and baseline pack in **production** on the **demo-workspace**.

---

## 📍 Production URLs

- **Web App**: https://verta-ai-pearl.vercel.app
- **API**: (Railway deployment - need to find URL)

---

## Step 1: Find Production API URL

The API is deployed to Railway. We need to find the production URL.

**Option A: Check Railway Dashboard**
1. Go to Railway dashboard
2. Find `vertaai-api` service
3. Copy the public URL (e.g., `https://vertaai-api-production.up.railway.app`)

**Option B: Check Environment Variables in Vercel**
1. Go to Vercel dashboard: https://vercel.com/fredjr/verta-ai-pearl
2. Go to Settings → Environment Variables
3. Find `NEXT_PUBLIC_API_URL`
4. Copy the value

**Option C: Inspect Network Tab**
1. Open https://verta-ai-pearl.vercel.app
2. Open browser DevTools → Network tab
3. Navigate to any page that makes API calls
4. Look for API requests (e.g., `/api/workspaces/...`)
5. Copy the base URL

---

## Step 2: Call Admin Endpoint to Create Baseline Pack

Once you have the production API URL (let's call it `$API_URL`):

```bash
# Replace $API_URL with actual production URL
curl -X POST $API_URL/api/admin/create-baseline-pack | jq '.'
```

**Expected response**:
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

**If this fails**, it means:
- Admin endpoint is not deployed yet (need to wait for Railway deployment)
- Admin endpoint is protected (need authentication)
- API URL is incorrect

---

## Step 3: Verify Baseline Pack in Production UI

1. Go to: https://verta-ai-pearl.vercel.app/policy-packs?workspace=demo-workspace
2. Look for "Baseline — Workspace Contract Integrity" in the list
3. Click on it to view details
4. Verify:
   - Pack status: Published
   - Pack mode: warn
   - Scope: workspace / demo-workspace
   - Rules: 7 rules listed

---

## Step 4: Create Test PR #23 in E2E Repo

```bash
cd /tmp
git clone https://github.com/Fredjr/vertaai-e2e-test.git
cd vertaai-e2e-test

git checkout main
git pull origin main
git checkout -b test-baseline-pack-pr23

# Make a simple change
echo "# Testing Baseline Pack in Production" >> README.md
git add README.md
git commit -m "test: baseline pack evaluation in production (PR #23)"

# Push and create PR
git push origin test-baseline-pack-pr23
gh pr create \
  --title "Test: Baseline Pack Evaluation in Production (PR #23)" \
  --body "Testing the baseline-contract-integrity pack in production.

## Expected Behavior

The baseline pack should evaluate the following rules:

1. ✅ **Check-Run Must Always Be Posted** - Should PASS
2. ⚠️ **CODEOWNERS File Required** - Should WARN (file may not exist)
3. ⚠️ **Service Owner Required** - Should WARN
4. ⚠️ **Ownership↔Docs Parity** - Should WARN
5. ⚠️ **Runbook Required (Tier-1)** - Should WARN
6. ⚠️ **Alert Routing Ownership** - Should WARN
7. ⚠️ **Waiver Policy** - Should WARN

## Pack Configuration

- **Pack Mode**: \`warn\` (should show warnings but NOT block PR)
- **Scope**: \`workspace\` (applies to all repos)
- **Branches**: \`main\`, \`release/*\`, \`hotfix/*\`
- **Priority**: \`10\` (low priority baseline)
- **Merge Strategy**: \`MOST_RESTRICTIVE\`

## Verification

Check the VertaAI Policy Pack check run output to verify:
- Baseline pack is evaluated
- Pack mode is 'warn' (shows warnings, doesn't block)
- All 7 rules are evaluated
- Coverage report shows 'X/7 rules evaluable'
- Global decision is NOT affected by observe-mode packs"
```

---

## Step 5: Verify GitHub Check Run

1. Go to PR #23: https://github.com/Fredjr/vertaai-e2e-test/pull/23
2. Wait for GitHub check run: "VertaAI Policy Pack"
3. Click "Details" to see full output
4. Verify:
   - Baseline pack appears in output
   - Pack mode is "warn"
   - Rules are evaluated
   - Coverage report is shown
   - Global decision is correct

---

## Step 6: Test UI Field Mapping in Production

1. Go to: https://verta-ai-pearl.vercel.app/policy-packs/new?workspace=demo-workspace

2. **Test Option 1: Template → Skip to Save**
   - Step 1: Fill in name, owner, packMode=enforce, scopePriority=100
   - Step 2: Fill in scope (repo, branches)
   - Step 3: Select "Baseline — Workspace Contract Integrity" template
   - Step 4: Verify green banner appears ✅
   - Click "Save"
   - Verify pack is created
   - Check YAML contains UI fields (packMode: enforce, scopePriority: 100)

3. **Test Option 2: Surfaces Wizard**
   - Same as above, but in Step 4:
   - Click "Surfaces" tab
   - Select a surface
   - Click "Generate Rules"
   - Verify confirmation dialog appears ⚠️
   - Click "OK"
   - Verify YAML is updated
   - Click "Save"
   - Verify UI fields are in YAML

4. **Test Option 3: Builder**
   - Same as Test 1, but in Step 4:
   - Click "Builder" tab
   - Edit a rule
   - Click "Save"
   - Verify UI fields are in YAML

5. **Test Option 4: Manual YAML**
   - Same as Test 1, but in Step 4:
   - Click "Advanced YAML" tab
   - Manually edit YAML
   - Click "Save"
   - Verify UI fields are in YAML

---

## 🎯 Success Criteria

- [ ] Production API URL identified
- [ ] Baseline pack created via admin endpoint
- [ ] Baseline pack visible in production UI
- [ ] Test PR #23 created
- [ ] GitHub check run shows baseline pack evaluation
- [ ] Pack mode (warn) is respected
- [ ] All 7 rules are evaluated
- [ ] Coverage report is accurate
- [ ] UI field mapping works for all 4 authoring paths

---

## 🐛 Troubleshooting

### Admin endpoint returns 404
- Check if Railway deployment is complete
- Verify API URL is correct
- Check if admin routes are registered in production

### Admin endpoint returns 401/403
- Admin endpoint may be protected in production
- May need to add authentication header
- Alternative: Use UI to create pack manually

### Baseline pack not appearing in UI
- Check if pack was created successfully (call GET /api/workspaces/demo-workspace/policy-packs)
- Verify pack status is "published"
- Check if workspace ID matches

### GitHub check run doesn't show baseline pack
- Verify pack scope matches PR (workspace-level should match all repos)
- Check pack branch filters (main, release/*, hotfix/*)
- Verify pack is published and enabled

---

## 📝 Notes

- The admin endpoint is for **programmatic pack creation** (seeding, testing)
- The UI flow uses the **regular API endpoint** with field merging
- All 4 authoring paths use the same `mergeFormDataIntoYAML()` function
- Track B configuration is saved to DB but evaluation logic is not fully implemented yet

---

## 🔗 Next Steps After Testing

If all tests pass:
1. Document results in a summary
2. Close any related issues/tickets
3. Update project documentation
4. Plan next phase (Track B implementation, additional templates, etc.)

If tests fail:
1. Document failures with screenshots
2. Check browser console for errors
3. Check API logs for errors
4. Create bug reports with reproduction steps

