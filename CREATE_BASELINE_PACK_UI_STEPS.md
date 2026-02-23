# Create Baseline Pack via Production UI

## URL
https://verta-ai-pearl.vercel.app/policy-packs/new?workspace=demo-workspace

## Step-by-Step Instructions

### Step 1: Overview & Identity
- **Name**: `Baseline — Workspace Contract Integrity`
- **Description**: `Workspace-wide cross-cutting integrity baseline`
- **Owner**: (your choice, e.g., `platform-team`)
- **Pack Type**: `GLOBAL_BASELINE`
- **Pack Mode**: `warn`
- **Strictness**: `balanced`
- Click **Next**

### Step 2: Scope Configuration
- **Scope Type**: `workspace`
- **Scope Ref**: `demo-workspace`
- **Scope Priority**: `10`
- **Scope Merge Strategy**: `MOST_RESTRICTIVE`
- **Branches Include**: `main`, `release/*`, `hotfix/*`
- Click **Next**

### Step 3: Pack Defaults
- Click **"Start from a Template"** button
- Select **"Baseline — Workspace Contract Integrity"**
- Verify green checkmark appears ✅
- Click **Next**

### Step 4: Policy Authoring (Track A)
- You should see a green banner: **"✅ Template loaded from Step 3"**
- **DO NOT** click any tabs (Surfaces, Builder, Advanced YAML)
- Just click **Next** to keep the template as-is

### Step 5: Approval Tiers (Track B)
- Skip this (not implemented yet)
- Click **Next**

### Step 6: Routing & Notifications
- Skip this
- Click **Next**

### Step 7: Review & Save
- Review the configuration
- Click **"Save as Draft"**
- Then click **"Publish"** to make it active

## Expected Result

The baseline pack should be created with:
- **Pack ID**: `baseline-contract-integrity`
- **Status**: Published
- **7 Rules**:
  1. Check-Run Must Always Be Posted
  2. CODEOWNERS File Required
  3. Service Owner Required
  4. Ownership↔Docs Parity
  5. Runbook Required (Tier-1)
  6. Alert Routing Ownership
  7. Waiver Policy

## Verification

After creating the pack:
1. Go to: https://verta-ai-pearl.vercel.app/policy-packs?workspace=demo-workspace
2. Verify the baseline pack appears in the list
3. Click on it to view details
4. Verify all 7 rules are present
5. Verify pack mode is "warn"
6. Verify scope is "workspace / demo-workspace"

