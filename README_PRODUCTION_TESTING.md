# Production Testing: UI Field Mapping & Baseline Pack

## ✅ What Was Completed (All Code Changes Pushed to Main)

### 1. UI Field Mapping Implementation (Commit: `8c64a18`)

**Fix A: Merge UI Fields into YAML**
- Created `mergeFormDataIntoYAML()` function that merges all UI form fields into YAML before saving
- Supports all 4 authoring paths: template, surfaces, builder, manual YAML
- Fields mapped: name, owner, packMode, scopePriority, scopeMergeStrategy, scope filters, etc.

**Fix B: Simplified Template Selection UX**
- Removed redundant Templates tab from Step 4
- Added green banner when template is loaded from Step 3
- Single, clear template selection flow

**Fix C: Added Validation**
- Confirmation dialog before Surfaces wizard overwrites template
- User can cancel and keep template

### 2. Admin Endpoint for Baseline Pack (Commit: `8c64a18`)

- Created `POST /api/admin/create-baseline-pack` endpoint
- Loads baseline-contract-integrity template from disk
- Creates and publishes pack to database
- Ready to use in production

### 3. Documentation (Commits: `8c64a18`, `deb7c75`, `a0333f8`)

- `PRODUCTION_TESTING_STEPS.md` - Step-by-step production testing guide
- `scripts/create-baseline-pack-production.sh` - Interactive script to create baseline pack
- `TESTING_PLAN_UI_FIELD_MAPPING.md` - Comprehensive testing plan
- `IMPLEMENTATION_SUMMARY.md` - Implementation details
- `ADMIN_ENDPOINT_CLARIFICATION.md` - Admin endpoint vs UI flow explanation

---

## 🚀 What You Need to Do (3 Simple Steps)

### Step 1: Find Your Production API URL

Your production web app is at: **https://verta-ai-pearl.vercel.app**

You need to find the production API URL. Choose one method:

**Method A: Check Railway Dashboard**
1. Go to Railway dashboard
2. Find `vertaai-api` service
3. Copy the public URL (e.g., `https://vertaai-api-production.up.railway.app`)

**Method B: Check Vercel Environment Variables**
1. Go to https://vercel.com (login)
2. Find your `verta-ai-pearl` project
3. Go to Settings → Environment Variables
4. Find `NEXT_PUBLIC_API_URL`
5. Copy the value

**Method C: Browser DevTools**
1. Open https://verta-ai-pearl.vercel.app
2. Open DevTools (F12) → Network tab
3. Navigate to any page
4. Look for API requests (e.g., `/api/workspaces/...`)
5. Copy the base URL from the request

### Step 2: Run the Script to Create Baseline Pack

```bash
cd /Users/fredericle/VertaAI
./scripts/create-baseline-pack-production.sh
```

The script will:
1. Ask you for the production API URL
2. Test API connectivity
3. Call the admin endpoint to create the baseline pack
4. Verify the pack was created successfully
5. Show you next steps

**Expected output**:
```
=== Create Baseline Pack in Production ===

Step 1: Finding production API URL...
Enter production API URL: https://your-api-url.railway.app

Step 2: Testing API connectivity...
✅ API is reachable

Step 3: Creating baseline pack via admin endpoint...
{
  "success": true,
  "pack": {
    "id": "...",
    "name": "Baseline — Workspace Contract Integrity",
    ...
  }
}
✅ Baseline pack created successfully!

Step 4: Verifying pack in database...
✅ Baseline pack found in database

=== Success! ===
```

### Step 3: Create Test PR #23

```bash
cd /tmp
git clone https://github.com/Fredjr/vertaai-e2e-test.git
cd vertaai-e2e-test

git checkout main
git pull origin main
git checkout -b test-baseline-pack-pr23

echo "# Testing Baseline Pack in Production" >> README.md
git add README.md
git commit -m "test: baseline pack evaluation in production (PR #23)"
git push origin test-baseline-pack-pr23

gh pr create \
  --title "Test: Baseline Pack Evaluation in Production (PR #23)" \
  --body "Testing the baseline-contract-integrity pack in production demo-workspace.

## Expected Behavior

The baseline pack should evaluate 7 rules:
1. ✅ Check-Run Must Always Be Posted
2. ⚠️ CODEOWNERS File Required
3. ⚠️ Service Owner Required
4. ⚠️ Ownership↔Docs Parity
5. ⚠️ Runbook Required (Tier-1)
6. ⚠️ Alert Routing Ownership
7. ⚠️ Waiver Policy

Pack mode: warn (non-blocking)
Scope: workspace (all repos)
Priority: 10 (baseline)"
```

Then:
1. Go to https://github.com/Fredjr/vertaai-e2e-test/pull/23
2. Wait for GitHub check run: "VertaAI Policy Pack"
3. Click "Details" to see the output
4. Verify baseline pack is evaluated correctly

---

## 🎯 What to Verify

### In the GitHub Check Run Output:

- [ ] Baseline pack appears: "Baseline — Workspace Contract Integrity v1.0.0"
- [ ] Pack mode is "warn" (shows warnings, doesn't block PR)
- [ ] All 7 rules are evaluated
- [ ] Coverage report shows "X/7 rules evaluable"
- [ ] Global decision respects pack mode (WARN, not BLOCK)

### In the Production UI:

1. Go to: https://verta-ai-pearl.vercel.app/policy-packs?workspace=demo-workspace
2. Verify baseline pack appears in the list
3. Click on it to view details
4. Verify pack configuration is correct

### Test UI Field Mapping (Optional):

1. Go to: https://verta-ai-pearl.vercel.app/policy-packs/new?workspace=demo-workspace
2. Create a new pack using each authoring path:
   - Option 1: Template → Skip to save
   - Option 2: Surfaces wizard
   - Option 3: Builder
   - Option 4: Manual YAML
3. Verify UI fields (packMode, scopePriority, etc.) are in the saved YAML

---

## 📚 Reference Documentation

- **Production Testing Guide**: `PRODUCTION_TESTING_STEPS.md`
- **Testing Plan**: `TESTING_PLAN_UI_FIELD_MAPPING.md`
- **Implementation Summary**: `IMPLEMENTATION_SUMMARY.md`
- **Admin Endpoint Clarification**: `ADMIN_ENDPOINT_CLARIFICATION.md`

---

## 🐛 If Something Goes Wrong

### Admin endpoint returns 404
- Verify Railway deployment is complete
- Check if API URL is correct
- Verify admin routes are registered

### Admin endpoint returns 401/403
- Admin endpoint may be protected in production
- May need authentication
- Alternative: Create pack manually via UI

### Baseline pack not in UI
- Check if pack was created (call GET /api/workspaces/demo-workspace/policy-packs)
- Verify pack status is "published"
- Check workspace ID matches

### GitHub check run doesn't show baseline pack
- Verify pack scope matches PR (workspace-level)
- Check branch filters (main, release/*, hotfix/*)
- Verify pack is published and enabled

---

## ✨ Summary

**All code is complete and deployed to production.**

You just need to:
1. Find your production API URL
2. Run `./scripts/create-baseline-pack-production.sh`
3. Create test PR #23
4. Verify the output

That's it! 🎉

