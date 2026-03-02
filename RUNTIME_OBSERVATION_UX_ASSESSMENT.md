# Runtime Observation Setup - UX Assessment & Recommendations

**Date:** 2026-03-02  
**Status:** ❌ NO USER-FRIENDLY SETUP EXISTS

---

## 🔍 Current State Assessment

### Existing Onboarding UI (What Works Well)

**Current Integrations** (`apps/web/src/app/onboarding/page.tsx`):
1. ✅ **GitHub** - OAuth flow with GitHub App installation
2. ✅ **Confluence** - OAuth flow with site selection
3. ✅ **Slack** - OAuth flow with workspace selection
4. ✅ **Notion** - OAuth flow with workspace selection
5. ✅ **PagerDuty** - Webhook configuration

**UX Pattern:**
```
Integration Card
  ├─ Icon + Name
  ├─ Description
  ├─ Connection Status (✓ Connected or button)
  ├─ Details (e.g., "3 repos connected")
  └─ Connect Button → OAuth flow or webhook setup
```

**What Makes It User-Friendly:**
- ✅ One-click OAuth flows (GitHub, Slack, Confluence, Notion)
- ✅ Clear visual status (connected vs not connected)
- ✅ Progress tracking (1/3 integrations)
- ✅ Active workflows section (shows what's enabled)
- ✅ Next steps guidance

---

## ❌ What's Missing for Runtime Observations

### Gap #1: No UI for Cloud Provider Setup

**Current State:**
- ❌ No "AWS CloudTrail" integration card
- ❌ No "GCP Audit Logs" integration card
- ❌ No "Database Query Logs" integration card
- ❌ No "Cost Explorer" integration card

**Why This Is Hard:**
Unlike GitHub/Slack (OAuth flows), cloud provider setup requires:
1. **Customer-side infrastructure** (SNS topics, Pub/Sub subscriptions, log forwarders)
2. **IAM permissions** (AWS roles, GCP service accounts)
3. **Webhook configuration** (endpoints, authentication)
4. **Workspace ID mapping** (how to route events to correct workspace)

**This is NOT a one-click OAuth flow!**

---

## 🎯 Recommended UX Approach

### Option A: Guided Setup Wizard (Recommended)

**Add to Onboarding Page:**

```tsx
{/* Runtime Observations (optional) */}
<div className="mt-8 p-6 bg-purple-50 dark:bg-purple-900/30 rounded-xl border border-purple-200 dark:border-purple-800">
  <h3 className="font-semibold text-lg mb-2 text-purple-800 dark:text-purple-200">
    🔬 Runtime Observations (Advanced)
  </h3>
  <p className="text-sm text-purple-700 dark:text-purple-300 mb-4">
    Enable Spec→Run verification by streaming runtime capability observations from your cloud infrastructure.
  </p>
  
  {/* AWS CloudTrail */}
  <RuntimeObservationCard
    name="AWS CloudTrail"
    icon="☁️"
    description="Stream AWS API calls to detect runtime capability usage"
    connected={status.integrations.cloudtrail?.connected}
    setupUrl={`/setup/cloudtrail?workspace=${workspaceId}`}
    setupLabel="Setup CloudTrail"
    optional
  />
  
  {/* GCP Audit Logs */}
  <RuntimeObservationCard
    name="GCP Audit Logs"
    icon="🔵"
    description="Stream GCP API calls to detect runtime capability usage"
    connected={status.integrations.gcpAudit?.connected}
    setupUrl={`/setup/gcp-audit?workspace=${workspaceId}`}
    setupLabel="Setup GCP Audit"
    optional
  />
  
  {/* Database Query Logs */}
  <RuntimeObservationCard
    name="Database Query Logs"
    icon="🗄️"
    description="Stream database queries to detect data access patterns"
    connected={status.integrations.dbQueryLogs?.connected}
    setupUrl={`/setup/database-logs?workspace=${workspaceId}`}
    setupLabel="Setup DB Logs"
    optional
  />
</div>
```

---

### Setup Wizard Flow (Multi-Step)

**Page:** `/setup/cloudtrail?workspace={workspaceId}`

**Step 1: Choose Setup Method**
```
┌─────────────────────────────────────────────────┐
│ How would you like to set up AWS CloudTrail?   │
├─────────────────────────────────────────────────┤
│                                                 │
│ ○ Automated Setup (Terraform)                  │
│   We'll generate a Terraform module you can    │
│   apply to your AWS account.                   │
│                                                 │
│ ○ Automated Setup (CloudFormation)             │
│   We'll generate a CloudFormation template     │
│   you can deploy to your AWS account.          │
│                                                 │
│ ○ Manual Setup (Step-by-Step Guide)            │
│   Follow our guide to configure CloudTrail,    │
│   SNS, and webhooks manually.                  │
│                                                 │
│         [Continue →]                            │
└─────────────────────────────────────────────────┘
```

**Step 2A: Terraform Setup (Automated)**
```
┌─────────────────────────────────────────────────┐
│ Terraform Module Generated                     │
├─────────────────────────────────────────────────┤
│                                                 │
│ 1. Download the Terraform module:              │
│    [Download vertaai-cloudtrail.tf]            │
│                                                 │
│ 2. Review the module:                          │
│    ┌─────────────────────────────────────────┐ │
│    │ module "vertaai_cloudtrail" {           │ │
│    │   source = "./vertaai-cloudtrail"       │ │
│    │   workspace_id = "demo-workspace"       │ │
│    │   webhook_url = "https://api.vertaai... │ │
│    │   aws_region = "us-east-1"              │ │
│    │ }                                        │ │
│    └─────────────────────────────────────────┘ │
│                                                 │
│ 3. Apply the module:                           │
│    $ terraform init                            │
│    $ terraform apply                           │
│                                                 │
│ 4. Verify the setup:                           │
│    [Test Connection]                           │
│                                                 │
│         [← Back]  [Complete Setup →]           │
└─────────────────────────────────────────────────┘
```

**Step 2B: Manual Setup (Step-by-Step)**
```
┌─────────────────────────────────────────────────┐
│ Manual Setup Guide                              │
├─────────────────────────────────────────────────┤
│                                                 │
│ Step 1: Create CloudTrail Trail                │
│ ☐ Go to AWS CloudTrail console                 │
│ ☐ Create a new trail named "vertaai-trail"     │
│ ☐ Enable logging for all regions               │
│                                                 │
│ Step 2: Create SNS Topic                       │
│ ☐ Go to AWS SNS console                        │
│ ☐ Create topic: vertaai-cloudtrail-demo-workspace │
│ ☐ Copy topic ARN: [Copy]                       │
│                                                 │
│ Step 3: Configure CloudTrail → SNS             │
│ ☐ In CloudTrail, add SNS topic notification    │
│ ☐ Paste topic ARN from Step 2                  │
│                                                 │
│ Step 4: Create SNS Subscription                │
│ ☐ In SNS, create HTTPS subscription            │
│ ☐ Endpoint: https://api.vertaai.com/api/runtime/cloudtrail │
│ ☐ Confirm subscription (check email)           │
│                                                 │
│ Step 5: Test Connection                        │
│ [Send Test Event]  Status: ⏳ Waiting...       │
│                                                 │
│         [← Back]  [Complete Setup →]           │
└─────────────────────────────────────────────────┘
```

---

### Database Schema Changes

**Add to `Integration` model:**
```prisma
model Integration {
  // ... existing fields ...
  
  // Runtime observation integrations
  runtimeObservationType String?  // 'cloudtrail' | 'gcp_audit' | 'db_query_logs' | 'cost_explorer'
  runtimeConfig Json?              // { topicArn, subscriptionName, forwarderUrl, etc. }
  lastObservationAt DateTime?      // Last time we received an observation
  observationCount Int @default(0) // Total observations received
}
```

---

### API Endpoints Needed

**1. Generate Terraform Module**
```
GET /api/workspaces/:workspaceId/runtime-setup/terraform/cloudtrail
Response: { terraformModule: string, variables: {...} }
```

**2. Generate CloudFormation Template**
```
GET /api/workspaces/:workspaceId/runtime-setup/cloudformation/cloudtrail
Response: { template: string, parameters: {...} }
```

**3. Test Connection**
```
POST /api/workspaces/:workspaceId/runtime-setup/test
Body: { type: 'cloudtrail' | 'gcp_audit' | 'db_query_logs' }
Response: { success: boolean, message: string, lastEvent: {...} }
```

**4. Get Setup Status**
```
GET /api/workspaces/:workspaceId/runtime-setup/status
Response: {
  cloudtrail: { connected: boolean, lastObservation: string, count: number },
  gcpAudit: { connected: boolean, lastObservation: string, count: number },
  dbQueryLogs: { connected: boolean, lastObservation: string, count: number }
}
```

---

## 📊 Comparison: OAuth vs Infrastructure Setup

| Aspect | OAuth (GitHub, Slack) | Infrastructure (CloudTrail, GCP) |
|--------|----------------------|----------------------------------|
| **Setup Complexity** | Low (1-click) | High (multi-step) |
| **Customer Action** | Click "Authorize" | Deploy infrastructure |
| **Time to Complete** | 30 seconds | 5-15 minutes |
| **Technical Skill** | None | DevOps/Cloud engineer |
| **Failure Points** | 1 (OAuth rejection) | 5+ (IAM, networking, config) |
| **Verification** | Immediate | Delayed (wait for events) |
| **Reversibility** | Easy (revoke token) | Medium (delete resources) |

**Conclusion:** Infrastructure setup is **10x more complex** than OAuth flows.

---

## 🎯 Recommended Implementation Plan

### Phase 1: Basic Setup Wizard (Week 1-2)
1. Create `/setup/cloudtrail` page with step-by-step guide
2. Generate Terraform module endpoint
3. Test connection endpoint
4. Update onboarding page with runtime observation cards

### Phase 2: Automated Setup (Week 3-4)
1. Generate CloudFormation template endpoint
2. One-click deploy to AWS (via CloudFormation stack URL)
3. GCP Audit Logs setup wizard
4. Database query logs setup wizard

### Phase 3: Monitoring & Validation (Week 5-6)
1. Real-time connection status dashboard
2. Observation count metrics
3. Health checks and alerts
4. Troubleshooting guide

---

## 💡 Key Insights

**Why This Is Hard:**
1. **No OAuth equivalent** - Can't use standard OAuth flows
2. **Customer infrastructure required** - They must deploy resources in their AWS/GCP account
3. **IAM complexity** - Permissions, roles, service accounts
4. **Async verification** - Can't test immediately (need to wait for events)
5. **Multi-cloud support** - Different setup for AWS vs GCP vs Azure

**Best Practices from Similar Products:**
- **Datadog**: Terraform modules + CloudFormation templates
- **Sentry**: Step-by-step guides with copy-paste commands
- **PagerDuty**: Webhook URLs with test event buttons
- **Segment**: Source setup wizards with validation

**Our Approach Should Be:**
1. ✅ Terraform modules (for DevOps teams)
2. ✅ CloudFormation templates (for AWS-native teams)
3. ✅ Step-by-step guides (for manual setup)
4. ✅ Test connection button (for validation)
5. ✅ Real-time status dashboard (for monitoring)

---

**BOTTOM LINE:** We need a **multi-step setup wizard** with **Terraform/CloudFormation generation** to make runtime observation setup user-friendly. This is **NOT a one-click OAuth flow**.

