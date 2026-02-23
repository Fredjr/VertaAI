# GitHub OAuth Redirect Fix

## Problem

When users clicked "Connect GitHub" from the policy pack creation wizard (Step 2: Scope Configuration), they experienced the following issues:

1. **Redirected to GitHub settings page** instead of back to the wizard
2. **Lost their position in the wizard** - returned to Step 1 instead of Step 2
3. **Lost all form data** they had entered
4. **Stuck in a loop** - clicking "Connect GitHub" again would repeat the cycle

## Root Causes

### Issue 1: Already-Installed GitHub App
- The GitHub App was already installed (installation ID `108852591`)
- When clicking "Connect GitHub", GitHub redirected to the settings page instead of triggering a new installation callback
- Our callback endpoint was never called, so the `returnUrl` redirect never happened

### Issue 2: Wizard Step Not Persisted in URL
- The wizard used React state (`currentStep`) to track which step the user was on
- When the page reloaded after GitHub redirect, the state reset to the default value (Step 1)
- All form data was lost because it was also stored in React state

## Solutions Implemented

### Fix 1: Check for Existing GitHub Connection (Backend)

**File**: `apps/api/src/routes/github-oauth.ts`

**Changes**:
```typescript
router.get('/install', async (req: Request, res: Response) => {
  // ... existing code ...
  
  // Check if GitHub is already connected
  const existingIntegration = await prisma.integration.findUnique({
    where: {
      workspaceId_type: {
        workspaceId: String(workspaceId),
        type: 'github',
      },
    },
  });

  // If already connected and returnUrl provided, redirect back immediately
  if (existingIntegration && existingIntegration.status === 'connected' && returnUrl) {
    console.log(`[GitHubOAuth] GitHub already connected for workspace ${workspaceId}, redirecting to returnUrl`);
    return res.redirect(String(returnUrl));
  }
  
  // ... rest of installation flow ...
});
```

**Result**: If GitHub is already connected, skip the GitHub installation page and redirect immediately back to the policy pack wizard.

### Fix 2: Persist Wizard Step in URL (Frontend)

**File**: `apps/web/src/app/policy-packs/new/page.tsx`

**Changes**:
1. **Read step from URL on page load**:
   ```typescript
   const stepFromUrl = parseInt(searchParams.get('step') || '1', 10);
   const [currentStep, setCurrentStep] = useState(stepFromUrl);
   ```

2. **Update URL when navigating between steps**:
   ```typescript
   const handleNext = () => {
     if (currentStep < steps.length) {
       const nextStep = currentStep + 1;
       setCurrentStep(nextStep);
       router.push(`/policy-packs/new?workspace=${workspaceId}&step=${nextStep}`);
     }
   };
   ```

3. **Sync state with URL when URL changes**:
   ```typescript
   useEffect(() => {
     const urlStep = parseInt(searchParams.get('step') || '1', 10);
     if (urlStep !== currentStep) {
       setCurrentStep(urlStep);
     }
   }, [searchParams]);
   ```

**Result**: The wizard step is now stored in the URL (e.g., `?workspace=demo-workspace&step=2`), so it persists across page reloads.

### Fix 3: Add Polling for GitHub Connection Status (Frontend)

**File**: `apps/web/src/app/policy-packs/new/sections/ScopeForm.tsx`

**Changes**:
```typescript
useEffect(() => {
  const checkGitHubStatus = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/github/status`);
      if (response.ok) {
        const data = await response.json();
        setGithubConnected(data.connected);
      }
    } catch (error) {
      console.error('Failed to check GitHub status:', error);
    }
  };
  checkGitHubStatus();
  
  // Poll every 3 seconds
  const interval = setInterval(checkGitHubStatus, 3000);
  return () => clearInterval(interval);
}, [workspaceId, apiUrl]);
```

**Result**: The UI automatically detects when GitHub gets connected and updates the UI without requiring a manual refresh.

## Expected User Flow (After Fix)

1. User fills out Step 1 (Overview) and clicks "Next"
2. User is on Step 2 (Scope Configuration) - URL is `?workspace=demo-workspace&step=2`
3. User clicks "Connect GitHub" button
4. Backend checks: GitHub already connected ✅
5. Backend redirects immediately to `?workspace=demo-workspace&step=2` (no GitHub visit)
6. Page reloads, reads `step=2` from URL, shows Step 2
7. Polling detects GitHub connection, UI updates to show "✅ GitHub Connected"
8. User can now select repositories and continue with the wizard

### Fix 4: Persist Form Data in localStorage (Frontend)

**File**: `apps/web/src/app/policy-packs/new/page.tsx`

**Problem**: When the page reloaded after GitHub redirect, all form data was lost because it was stored in React state.

**Changes**:
1. **Load from localStorage on mount**:
   ```typescript
   const getInitialFormData = (): PolicyPackFormData => {
     if (typeof window !== 'undefined') {
       const saved = localStorage.getItem(`policy-pack-draft-${workspaceId}`);
       if (saved) {
         return JSON.parse(saved);
       }
     }
     return { /* default values */ };
   };
   ```

2. **Save to localStorage on every change**:
   ```typescript
   useEffect(() => {
     if (typeof window !== 'undefined') {
       localStorage.setItem(`policy-pack-draft-${workspaceId}`, JSON.stringify(formData));
     }
   }, [formData, workspaceId]);
   ```

3. **Clear draft on successful save**:
   ```typescript
   localStorage.removeItem(`policy-pack-draft-${workspaceId}`);
   ```

**Result**: Form data persists across page reloads, including after GitHub OAuth redirects.

### Fix 5: Use Correct GitHub Status Endpoint (Frontend)

**File**: `apps/web/src/app/policy-packs/new/sections/ScopeForm.tsx`

**Problem**: The UI was calling `/api/workspaces/:id/github/status` which tests the actual GitHub API connection, but this was failing or slow.

**Change**: Switch to `/auth/github/status/:id` which simply checks the Integration table in the database:
```typescript
const response = await fetch(`${apiUrl}/auth/github/status/${workspaceId}`);
```

**Result**: Faster and more reliable GitHub connection status checks.

## Testing

Once Vercel deployment completes, test the flow:

1. Go to: `https://verta-ai-pearl.vercel.app/policy-packs/new?workspace=demo-workspace`
2. Fill out Step 1 (name, description, etc.) and click "Next"
3. On Step 2, click "Connect GitHub"
4. **Verify**: You stay on Step 2 (URL should be `?workspace=demo-workspace&step=2`)
5. **Verify**: All form data from Step 1 is still there (check by going back to Step 1)
6. **Verify**: The warning banner disappears and shows "✅ GitHub Connected - X repositories available"
7. **Verify**: Repositories appear in the dropdown (not free text)
8. **Verify**: Branches appear when you select a repository

## Summary of All Fixes

| Fix | File | Problem | Solution |
|-----|------|---------|----------|
| 1 | `github-oauth.ts` | Already-installed app redirects to settings | Check Integration table, skip GitHub if connected |
| 2 | `page.tsx` | Wizard step resets to 1 on reload | Store step in URL query parameter |
| 3 | `ScopeForm.tsx` | GitHub status not detected | Poll status endpoint every 3s |
| 4 | `page.tsx` | Form data lost on reload | Persist to localStorage |
| 5 | `ScopeForm.tsx` | Wrong status endpoint used | Use `/auth/github/status/:id` |

## Related Files

- `apps/api/src/routes/github-oauth.ts` - OAuth flow with existing connection check
- `apps/web/src/app/policy-packs/new/page.tsx` - Wizard with URL-persisted step and localStorage
- `apps/web/src/app/policy-packs/new/sections/ScopeForm.tsx` - Scope form with polling and correct endpoint
- `GITHUB_OAUTH_SECURITY.md` - Security documentation for OAuth flow

