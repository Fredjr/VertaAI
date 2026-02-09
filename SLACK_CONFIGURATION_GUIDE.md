# Slack Configuration Guide for VertaAI

## How Slack Notifications Work

### Architecture Overview

VertaAI uses a **workspace-based Slack configuration** where each customer configures their own Slack workspace and notification channel.

### Configuration Flow

```
Customer Onboarding
  ↓
1. Customer connects Slack OAuth
   - Installs VertaAI Slack App to their workspace
   - Grants permissions (chat:write, channels:read, etc.)
   - OAuth flow stores bot token in Integration table
  ↓
2. System auto-detects default channel
   - Queries Slack API for available channels
   - Selects first public channel bot has access to
   - Stores in Workspace.defaultOwnerRef
  ↓
3. Customer can customize channel (optional)
   - Uses UI to select preferred notification channel
   - Updates Workspace.defaultOwnerRef
  ↓
4. Drift notifications sent to configured channel
   - State machine reads Workspace.defaultOwnerRef
   - Sends Slack message using Integration.config.bot_token
```

---

## Database Schema

### Workspace Table
```typescript
model Workspace {
  id: string                    // Workspace UUID
  name: string                  // "Acme Corp"
  defaultOwnerType: string      // "slack_channel" (default)
  defaultOwnerRef: string       // Channel ID: "C0AAA14C11V" or "#nouveau-canal"
  
  // Notification thresholds
  highConfidenceThreshold: number    // Default: 0.70
  mediumConfidenceThreshold: number  // Default: 0.55
}
```

### Integration Table
```typescript
model Integration {
  workspaceId: string
  type: string                  // "slack"
  status: string                // "connected" | "pending" | "error"
  config: {
    bot_token: string           // OAuth bot token (xoxb-...)
    team_id: string             // Slack workspace ID
    team_name: string           // "Acme Corp Slack"
    channelId?: string          // Optional: specific channel override
  }
}
```

---

## Notification Routing Logic

### State Machine: OWNER_RESOLVED → SLACK_SENT

**File**: `apps/api/src/services/orchestrator/transitions.ts`

**Logic**:
```typescript
async function handleOwnerResolved(drift) {
  // 1. Determine notification route (confidence-based)
  const notificationRoute = await determineNotificationRoute({
    workspaceId: drift.workspaceId,
    confidence: patchProposal.confidence,
    ownerSlackId: primaryOwner?.ref,
    ownerChannel: ownerChannel,
  });
  
  // 2. Determine target channel (priority order)
  const targetChannel = 
    notificationRoute.target ||        // From notification policy
    primaryOwner?.ref ||               // From owner resolution
    ownerChannel ||                    // From owner mapping
    slackConfig.channelId ||           // From Slack integration config
    workspace.defaultOwnerRef ||       // From workspace default
    'general';                         // Fallback
  
  // 3. Send Slack message
  await sendSlackMessage(
    drift.workspaceId,
    targetChannel,
    slackMessage.text,
    slackMessage.blocks
  );
}
```

### Confidence-Based Routing

**File**: `apps/api/src/services/notifications/policy.ts`

| Confidence | Channel | Priority | Behavior |
|------------|---------|----------|----------|
| ≥70% | DM to owner (if known) or team channel | P0 | Immediate notification |
| 55-69% | Team channel | P1 | Immediate notification |
| <55% | Digest (no immediate notification) | P2 | Batched weekly |

---

## Customer Setup Process

### For Each Customer

**Step 1: Slack OAuth Connection**
- Customer clicks "Connect Slack" in VertaAI dashboard
- Redirected to Slack OAuth consent screen
- Grants permissions to VertaAI Slack App
- OAuth callback stores bot token in `Integration` table

**Step 2: Auto-Configuration**
- System queries Slack API: `conversations.list`
- Finds first public channel bot has access to
- Sets `Workspace.defaultOwnerRef` to channel ID
- Example: `C0AAA14C11V` (nouveau-canal)

**Step 3: Optional Customization**
- Customer navigates to Settings → Notifications
- Sees list of available Slack channels
- Selects preferred channel (e.g., #engineering, #alerts)
- System updates `Workspace.defaultOwnerRef`

**Step 4: Test Notification**
- Customer can send test notification
- Verifies message appears in configured channel

---

## API Endpoints

### GET /api/workspaces/:workspaceId/slack/channels
List available Slack channels for workspace

**Response**:
```json
{
  "channels": [
    {
      "id": "C0AAA14C11V",
      "name": "nouveau-canal",
      "isPrivate": false,
      "isMember": true,
      "isSelected": true
    }
  ],
  "currentChannelId": "C0AAA14C11V"
}
```

### POST /api/workspaces/:workspaceId/slack/channel
Set default notification channel

**Request**:
```json
{
  "channelId": "C0AAA14C11V"
}
```

---

## Current Status: Your Workspace

**Workspace ID**: `63e8e9d1-c09d-4dd0-a921-6e54df1724ac`

**Issue**: Slack integration not connected

**Error**: `"Slack not connected for this workspace"`

**Required Action**:
1. Connect Slack OAuth for your workspace
2. Grant bot permissions
3. Select notification channel (#nouveau-canal)
4. Test notification delivery

---

## Next Steps

1. **Connect Slack Integration**
   - Navigate to: https://verta-ai-pearl.vercel.app/settings/integrations
   - Click "Connect Slack"
   - Complete OAuth flow

2. **Verify Channel Configuration**
   - Check `Workspace.defaultOwnerRef` is set to `C0AAA14C11V` (nouveau-canal)
   - Or use channel name: `#nouveau-canal`

3. **Test Full Pipeline**
   - Create code-change PR
   - Merge PR
   - Verify Slack notification appears in #nouveau-canal


