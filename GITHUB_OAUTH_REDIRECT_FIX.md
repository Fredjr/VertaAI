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

## Testing

Once Vercel deployment completes, test the flow:

1. Go to: `https://verta-ai-pearl.vercel.app/policy-packs/new?workspace=demo-workspace`
2. Fill out Step 1 and click "Next"
3. On Step 2, click "Connect GitHub"
4. Verify you stay on Step 2 (URL should be `?workspace=demo-workspace&step=2`)
5. Verify the warning banner disappears and shows "✅ GitHub Connected"
6. Verify repositories appear in the dropdown

## Related Files

- `apps/api/src/routes/github-oauth.ts` - OAuth flow with existing connection check
- `apps/web/src/app/policy-packs/new/page.tsx` - Wizard with URL-persisted step
- `apps/web/src/app/policy-packs/new/sections/ScopeForm.tsx` - Scope form with polling
- `GITHUB_OAUTH_SECURITY.md` - Security documentation for OAuth flow

