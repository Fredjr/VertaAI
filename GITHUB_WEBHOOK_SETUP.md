# GitHub Webhook Configuration

## Current Status

✅ **PR #4 Merged Successfully**
⏳ **Waiting for GitHub webhook to trigger drift detection**

---

## Issue: No Webhook Received

After merging PR #4, no webhook has been received by the Railway API. This indicates the GitHub App webhook URL may not be configured.

---

## Solution: Configure GitHub App Webhook

### Architecture

VertaAI uses a **global webhook endpoint** that automatically routes webhooks to the correct workspace based on the GitHub App `installation.id`:

- **Global Endpoint**: `/webhooks/github/app`
- **Routing**: Looks up workspace by `Integration.config.installationId`
- **Multi-tenant**: Each customer has their own GitHub App installation
- **No hardcoded workspace IDs**: Fully dynamic routing

### Step 1: Go to GitHub App Settings

1. Visit: https://github.com/settings/apps/vertaai-drift-detection
2. Or go to: Settings → Developer settings → GitHub Apps → VertaAI Drift Detection

### Step 2: Configure Webhook URL

**Webhook URL**: `https://vertaai-api-production.up.railway.app/webhooks/github/app`

**Important**: This is a single global URL for all workspaces. The system automatically routes to the correct workspace based on the installation ID in the webhook payload.

### Step 3: Configure Webhook Secret

The webhook secret is stored per-workspace in the `Integration.webhookSecret` field. This was automatically generated during GitHub App installation OAuth flow.

**No manual configuration needed** - the system uses the workspace-specific secret stored in the database.

### Step 4: Enable Events

Make sure these events are enabled in GitHub App settings:
- ✅ **Pull requests** (required for drift detection)
- ✅ **Push** (optional, for future signal types)

### Step 5: Test Webhook

After configuration:
1. Go to GitHub App → Advanced → Recent Deliveries
2. Find the PR #4 merge event
3. Click "Redeliver" to resend the webhook
4. Or create a new test PR and merge it

### How It Works

```
GitHub Webhook → /webhooks/github/app
                 ↓
Extract installation.id from payload
                 ↓
Query: Integration WHERE config.installationId = installation.id
                 ↓
Find workspaceId
                 ↓
Route to workspace-specific processing
                 ↓
Create SignalEvent + DriftCandidate
                 ↓
Send Slack notification to workspace's configured channel
```

---

## Alternative: Manual Test Using Test Endpoint

If you want to test without configuring the webhook, you can use the test endpoint with merged PR data:

```bash
curl -X POST "https://vertaai-api-production.up.railway.app/test/webhooks/github/63e8e9d1-c09d-4dd0-a921-6e54df1724ac" \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -d '{
    "action": "closed",
    "number": 4,
    "pull_request": {
      "number": 4,
      "title": "docs: Add comprehensive deployment runbook",
      "body": "This PR adds deployment procedures and rollback documentation",
      "user": {"login": "Fredjr"},
      "base": {
        "ref": "main",
        "repo": {
          "name": "VertaAI",
          "full_name": "Fredjr/VertaAI",
          "owner": {"login": "Fredjr"}
        }
      },
      "head": {
        "ref": "test/e2e-deployment-docs-update",
        "sha": "93df372"
      },
      "merged": true,
      "merged_at": "2026-02-08T18:15:00Z",
      "changed_files": 1
    },
    "repository": {
      "name": "VertaAI",
      "full_name": "Fredjr/VertaAI",
      "owner": {"login": "Fredjr"}
    },
    "installation": {
      "id": 2755713
    }
  }'
```

**Key difference**: `"merged": true` and `"action": "closed"`

---

## Expected Workflow After Webhook

Once the webhook is received with a merged PR:

1. ✅ Webhook received by Railway API
2. ✅ SignalEvent created
3. ✅ DriftCandidate created in INGESTED state
4. ✅ QStash job enqueued
5. ✅ State machine processes drift (should NOT be rejected)
6. ✅ Drift triage agent analyzes PR
7. ✅ Slack notification sent to `nouveau-canal`
8. ✅ Confluence page updated

---

## Verification

After webhook is configured and triggered:

1. **Check Railway logs** for webhook processing
2. **Check audit logs** for new state transitions
3. **Check Slack** channel `nouveau-canal` for notifications
4. **Check Confluence** page 164013 for updates

---

## Current E2E Test Status

✅ **Production deployment verified**  
✅ **All API endpoints working**  
✅ **All dashboards accessible**  
✅ **Test webhook endpoint working**  
✅ **PR #4 created and merged**  
⏳ **Waiting for GitHub webhook configuration**

**Next Step**: Configure GitHub App webhook URL to complete full E2E workflow test.

