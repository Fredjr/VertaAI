# GitHub Authentication Fix & UX Improvements

## ✅ Fixed: GitHub Authentication Error (Commit: `4281482`)

### Problem
When creating a policy pack in production, the UI showed:
```
GET /api/workspaces/demo-workspace/github/repos
Status: 500 Internal Server Error

Error: "You must authenticate with an installation access token in order to list repositories for an installation."
```

### Root Cause
The `getGitHubClient` function was falling back to a **Personal Access Token** from environment variables instead of using the **GitHub App installation access token**.

**Why this happened**:
1. The Integration table stores `installationId` and `appId` in the config
2. But it does NOT store the `privateKey` (for security reasons, it's in environment variables)
3. The `getGitHubClient` function checked for `config.appId && config.privateKey` (line 141)
4. Since `privateKey` was missing from config, it skipped Strategy 1
5. It fell back to Strategy 3 (`getEnvOctokit`) but didn't pass the `installationId`
6. Without `installationId`, `getEnvOctokit` used the Personal Access Token (PAT)
7. PATs cannot call `/installation/repositories` - only installation tokens can

### Solution
**File**: `apps/api/src/services/github-client.ts`

1. Extract `installationId` from config early (line 140)
2. Add Strategy 3.5: Use env app credentials (`GH_APP_ID` + `GH_APP_PRIVATE_KEY`) with `installationId` from DB
3. Pass `installationId` to `getEnvOctokit()` so it can create an installation access token
4. Cache the result

**File**: `apps/api/src/routes/github.ts`

Added retry logic with cache clearing for authentication errors (lines 51-72):
- If auth error occurs, clear the cached client
- Retry once with a fresh client
- This handles expired tokens gracefully

### Result
✅ GitHub repos endpoint now works correctly
✅ Uses installation access token (not PAT)
✅ Respects GitHub App permissions
✅ Handles token expiration gracefully

---

## 🔄 TODO: UX Improvements for Policy Pack Creation

### Current State (Free-Text Inputs)
The Scope Configuration step currently has free-text inputs for:
- Repository Filters (Include/Exclude)
- Branch Filters (Include/Exclude)
- Owners

**Problems**:
1. Users must manually type repository names (error-prone)
2. No validation - typos cause packs to not match
3. No autocomplete or suggestions
4. Users don't know what repos/branches are available

### Desired State (Multi-Select Dropdowns)

#### 1. Repository Filters
**Current**: Free-text input `e.g., owner/repo-name or owner/*`
**Desired**: Multi-select dropdown populated from `/api/workspaces/:id/github/repos`

**Implementation**:
- Fetch repos on component mount
- Show dropdown with repo names (e.g., `Fredjr/VertaAI`, `Fredjr/vertaai-e2e-test`)
- Allow multi-select
- Support wildcards (e.g., `Fredjr/*`)
- Show repo count: "12 repositories available"

#### 2. Branch Filters
**Current**: Free-text input `e.g., main, release/*, feature/*`
**Desired**: Multi-select dropdown with common branches + wildcard support

**Implementation**:
- Fetch branches from selected repos via `/api/workspaces/:id/github/repos/:owner/:repo/branches`
- Show common branches: `main`, `master`, `develop`, `staging`, `production`
- Allow wildcards: `release/*`, `hotfix/*`, `feature/*`
- Show branch count: "5 branches selected"

#### 3. Owners
**Current**: Free-text input (not visible in current UI)
**Desired**: Multi-select dropdown populated from unique repo owners

**Implementation**:
- Add new endpoint: `GET /api/workspaces/:id/github/owners`
- Extract unique owners from repos
- Show dropdown with owner names (e.g., `Fredjr`, `VertaAI`)
- Allow multi-select

#### 4. Scope Type Selection
**Current**: Dropdown with `workspace`, `service`, `repository`
**Desired**: Dynamic form based on selection

**Implementation**:
- If `workspace`: No additional fields (applies to all repos)
- If `service`: Show service name dropdown (populated from services in repos)
- If `repository`: Show repository dropdown (populated from GitHub repos)

---

## 📋 Implementation Plan

### Phase 1: Backend API Endpoints (DONE ✅)
- [x] Fix GitHub authentication
- [x] Add retry logic for auth errors
- [ ] Add `GET /api/workspaces/:id/github/owners` endpoint
- [ ] Add pagination support for repos (if > 100)

### Phase 2: Frontend Components (TODO)
- [ ] Create `MultiSelectDropdown` component
- [ ] Update `TrackAFormScope.tsx` to use multi-select for repos
- [ ] Update `TrackAFormScope.tsx` to use multi-select for branches
- [ ] Update `TrackAFormScope.tsx` to use multi-select for owners
- [ ] Add loading states while fetching from GitHub
- [ ] Add error handling for GitHub API failures
- [ ] Add "Refresh Repositories" button

### Phase 3: Validation & UX Polish (TODO)
- [ ] Validate selected repos exist in GitHub
- [ ] Show warning if no repos match filters
- [ ] Add tooltip explaining wildcards (`*`, `?`)
- [ ] Add "Select All" / "Deselect All" buttons
- [ ] Show preview of matching repos/branches
- [ ] Add search/filter within dropdowns

---

## 🧪 Testing

### Test GitHub Authentication Fix
1. Go to: https://verta-ai-pearl.vercel.app/policy-packs/new?workspace=demo-workspace
2. Navigate to Step 2 (Scope Configuration)
3. Verify "GitHub Connected - X repositories available" appears
4. Verify no 500 error in browser console
5. Verify Railway logs show successful repo fetch

### Test Multi-Select UX (After Implementation)
1. Repository Filters:
   - Click "Include Repositories" dropdown
   - Verify repos from GitHub appear
   - Select multiple repos
   - Verify selection is saved
2. Branch Filters:
   - Click "Include Branches" dropdown
   - Verify common branches appear
   - Add wildcard pattern `release/*`
   - Verify both are saved
3. Scope Type:
   - Select "repository"
   - Verify repository dropdown appears
   - Select a repo
   - Verify scope is saved correctly

---

## 📝 Notes

- The GitHub authentication fix is **deployed to production** (commit `4281482`)
- The UX improvements require **frontend changes** (not yet implemented)
- The backend is ready - just need to add the `/owners` endpoint
- Consider using a UI library like `react-select` or `@headlessui/react` for multi-select dropdowns

---

## 🔗 Related Files

- `apps/api/src/services/github-client.ts` - GitHub client with installation token support
- `apps/api/src/routes/github.ts` - GitHub API routes (repos, branches, status)
- `apps/web/src/app/policy-packs/new/sections/TrackAFormScope.tsx` - Scope configuration UI
- `apps/api/prisma/schema.prisma` - Integration model definition

---

## ✅ Success Criteria

### Authentication Fix (DONE)
- [x] No 500 errors when fetching repos
- [x] Uses installation access token (not PAT)
- [x] Handles token expiration gracefully
- [x] Works in production

### UX Improvements (TODO)
- [ ] Users can select repos from dropdown (no typing)
- [ ] Users can select branches from dropdown
- [ ] Users can select owners from dropdown
- [ ] Wildcards are supported and documented
- [ ] Loading states are shown while fetching
- [ ] Errors are handled gracefully
- [ ] Preview of matching repos/branches is shown

