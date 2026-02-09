# VertaAI Webhook Architecture

## Overview

VertaAI uses a **global webhook endpoint** that automatically routes webhooks to the correct workspace based on the GitHub App installation ID. This allows each customer to have their own GitHub App installation without requiring workspace-specific webhook URLs.

---

## Architecture

### Global Webhook Endpoint

**URL**: `https://vertaai-api-production.up.railway.app/webhooks/github/app`

This single URL handles webhooks for **all workspaces**.

### Routing Logic

```typescript
// 1. Extract installation ID from webhook payload
const installationId = req.body?.installation?.id;

// 2. Find workspace by installation ID
const integration = await prisma.integration.findFirst({
  where: {
    type: 'github',
    status: 'connected',
    config: {
      path: ['installationId'],
      equals: installationId,
    },
  },
  select: {
    workspaceId: true,
    webhookSecret: true,
    config: true,
  },
});

// 3. Route to workspace-specific processing
const workspaceId = integration.workspaceId;
```

### Database Schema

```prisma
model Integration {
  id            BigInt   @id @default(autoincrement())
  workspaceId   String   // Links to Workspace
  type          String   // 'github', 'slack', 'confluence', etc.
  status        String   // 'connected', 'pending', 'error'
  config        Json     // Stores { installationId, appId, repos, etc. }
  webhookSecret String?  // Workspace-specific webhook secret
  createdAt     DateTime
  updatedAt     DateTime
}
```

**Key Fields**:
- `config.installationId`: GitHub App installation ID (e.g., 2755713)
- `webhookSecret`: Unique secret per workspace for signature verification
- `workspaceId`: Links to the workspace that owns this integration

---

## Workflow

### 1. GitHub App Installation (One-time Setup)

```
User clicks "Install GitHub App"
  ↓
OAuth flow: /auth/github/install?workspaceId=...
  ↓
GitHub redirects to: /auth/github/callback?installation_id=2755713&code=...
  ↓
Backend creates Integration record:
  - workspaceId: 63e8e9d1-c09d-4dd0-a921-6e54df1724ac
  - type: 'github'
  - config: { installationId: 2755713, appId: ..., repos: [...] }
  - webhookSecret: <generated-secret>
  ↓
User is redirected back to app
```

### 2. Webhook Processing (Runtime)

```
GitHub sends webhook to: /webhooks/github/app
  ↓
Extract installation.id = 2755713 from payload
  ↓
Query: Integration WHERE config.installationId = 2755713
  ↓
Found: workspaceId = 63e8e9d1-c09d-4dd0-a921-6e54df1724ac
  ↓
Verify signature using Integration.webhookSecret
  ↓
Process webhook for workspace 63e8e9d1-c09d-4dd0-a921-6e54df1724ac
  ↓
Create SignalEvent + DriftCandidate
  ↓
Send Slack notification to workspace's configured channel
```

---

## Configuration Steps

### For Each Customer/Workspace

1. **Install GitHub App**
   - User clicks "Connect GitHub" in VertaAI UI
   - OAuth flow creates Integration record with installationId
   - Webhook secret is auto-generated

2. **Configure GitHub App Webhook** (One-time, in GitHub App settings)
   - Go to: https://github.com/settings/apps/vertaai-drift-detection
   - Set Webhook URL: `https://vertaai-api-production.up.railway.app/webhooks/github/app`
   - Leave webhook secret **empty** (or use a global secret for app-level events)
   - Enable events: Pull requests, Push

3. **Test Webhook**
   - Merge a PR in a repo where the GitHub App is installed
   - GitHub sends webhook with installation.id
   - VertaAI routes to correct workspace
   - Slack notification sent to workspace's channel

---

## Multi-Tenancy Benefits

✅ **Single webhook URL for all customers**  
✅ **Automatic routing based on installation ID**  
✅ **Per-workspace webhook secrets for security**  
✅ **No hardcoded workspace IDs in GitHub App**  
✅ **Scales to unlimited workspaces**  
✅ **Each workspace gets notifications in their own Slack channel**

---

## Current Setup for Your Workspace

**Workspace ID**: `63e8e9d1-c09d-4dd0-a921-6e54df1724ac`  
**GitHub App Installation ID**: `2755713`  
**Slack Channel**: `nouveau-canal` (C0AAA14C11V)  
**Confluence Page**: https://frederic-le.atlassian.net/wiki/spaces/SD/pages/164013

### Expected Flow

```
PR merged in Fredjr/VertaAI
  ↓
GitHub webhook → /webhooks/github/app
  ↓
Extract installation.id = 2755713
  ↓
Find workspace: 63e8e9d1-c09d-4dd0-a921-6e54df1724ac
  ↓
Create drift candidate
  ↓
Slack notification → #nouveau-canal
  ↓
Confluence update → page 164013
```

---

## Next Steps

1. ✅ **Configure GitHub App webhook URL** (if not already done)
   - URL: `https://vertaai-api-production.up.railway.app/webhooks/github/app`

2. ✅ **Verify Integration record exists**
   - Check database: `Integration` table
   - Ensure `config.installationId = 2755713`
   - Ensure `workspaceId = 63e8e9d1-c09d-4dd0-a921-6e54df1724ac`

3. ✅ **Test with real PR**
   - Merge PR #4 (already done)
   - Or redeliver webhook from GitHub App → Advanced → Recent Deliveries
   - Or create new test PR and merge

4. ✅ **Monitor Railway logs**
   - Look for: `[Webhook] [APP] Received pull_request event`
   - Look for: `[Webhook] [APP] Routing to workspace 63e8e9d1-c09d-4dd0-a921-6e54df1724ac`
   - Look for: `[Transitions] Processing merged PR`

---

## Troubleshooting

### No webhook received
- Check GitHub App webhook URL is configured
- Check GitHub App → Advanced → Recent Deliveries for errors
- Verify installation ID matches Integration.config.installationId

### Webhook received but no workspace found
- Check Integration record exists for installation ID
- Check Integration.status = 'connected'
- Check Integration.type = 'github'

### Webhook processed but no Slack notification
- Check workspace has Slack integration configured
- Check Slack channel ID is correct
- Check Railway logs for Slack API errors

---

**Status**: Architecture is correct. Just need to configure GitHub App webhook URL.

