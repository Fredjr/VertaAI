# Setup Test Repository for VertaAI

This guide helps you create a separate test repository for testing drift detection without triggering backend redeployment.

## Why We Need This

When testing on the VertaAI repository itself:
- Merging PRs triggers Railway redeployment
- Webhooks sent during redeployment are dropped
- Backend restarts before processing merge events
- This creates a timing issue that doesn't exist in production

## Step 1: Create Test Repository

1. Go to https://github.com/new
2. Create repository:
   - **Name**: `vertaai-test-repo`
   - **Description**: "Test repository for VertaAI drift detection"
   - **Visibility**: Public (or Private if you prefer)
   - **Initialize**: ✅ Add a README file
3. Click "Create repository"

## Step 2: Install GitHub App on Test Repository

Your GitHub App is already installed on your account (installation ID: 108852591).

If it's installed org-wide, it will automatically monitor the new repo.

If it's installed per-repository, you need to:
1. Go to https://github.com/settings/installations
2. Click "Configure" on your VertaAI app
3. Under "Repository access", select "Only select repositories"
4. Add `vertaai-test-repo` to the list
5. Click "Save"

## Step 3: Update Workspace Configuration

The webhook handler already routes by repository name, so it should automatically work!

The webhook handler in `apps/api/src/routes/webhooks.ts` (lines 276-291) finds the workspace by:
1. Installation ID (from GitHub webhook)
2. Repository name (from webhook payload)

Since your workspace is already linked to installation ID `108852591`, any repository under that installation will be monitored.

## Step 4: Test Drift Detection

1. Create a new branch in `vertaai-test-repo`:
   ```bash
   git clone https://github.com/Fredjr/vertaai-test-repo.git
   cd vertaai-test-repo
   git checkout -b test/feature-1
   ```

2. Make a simple change:
   ```bash
   echo "# Test Feature" >> README.md
   git add README.md
   git commit -m "test: Add test feature"
   git push -u origin test/feature-1
   ```

3. Create a PR on GitHub

4. **Merge the PR** (this won't trigger VertaAI backend redeployment!)

5. Check Railway logs for:
   ```
   [Webhook] [V2] PR was opened earlier, now merged - updating signal to merged=true
   [Webhook] [V2] Re-enqueueing drift candidate...
   [Jobs] Processing drift...
   [Transitions] Signal eligible - proceeding to ELIGIBILITY_CHECKED
   ```

## Expected Behavior

✅ **PR opened** → SignalEvent created with `merged=false`
✅ **PR merged** → SignalEvent updated to `merged=true`, drift re-enqueued
✅ **Job runs** → Refetches SignalEvent, sees `merged=true`, passes eligibility
✅ **Drift detection** → Proceeds through full pipeline

## Troubleshooting

### Webhook not received
- Check GitHub App installation includes the test repo
- Check Railway logs for webhook signature verification errors
- Verify webhook URL is correct in GitHub App settings

### Workspace not found
- The webhook handler should find workspace by installation ID
- If it doesn't work, you may need to update the workspace's `integrationConfig` to explicitly list the test repo

### Still seeing "PR not merged"
- Check that Fix #3 is deployed (refetch SignalEvent in handleIngested)
- Verify the SignalEvent was actually updated in the database
- Check Railway logs for the webhook update logs

