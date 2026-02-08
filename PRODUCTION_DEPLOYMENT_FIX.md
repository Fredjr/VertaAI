# Production Deployment Fix

**Date**: 2026-02-08  
**Issue**: Frontend cannot connect to Railway API  
**Status**: ✅ RESOLVED

---

## 🔧 Issue Details

### Problem
The Vercel frontend was trying to connect to the wrong Railway API URL:
- ❌ **Wrong URL**: `https://vertaai-production.up.railway.app`
- ✅ **Correct URL**: `https://vertaai-api-production.up.railway.app`

### Impact
- All dashboard pages (Compliance, Coverage, Plans, Settings) were showing errors
- Error message: `Failed to fetch coverage snapshot`
- HTTP 404 responses from API calls

---

## ✅ Solution

### Step 1: Update Vercel Environment Variable

**In Vercel Dashboard**:
1. Go to: https://vercel.com/fredjr/verta-ai-pearl/settings/environment-variables
2. Update the environment variable:
   - **Name**: `NEXT_PUBLIC_API_URL`
   - **Value**: `https://vertaai-api-production.up.railway.app`
   - **Environments**: Production, Preview, Development

3. Redeploy the frontend:
   ```bash
   # Trigger a new deployment
   git commit --allow-empty -m "chore: Trigger Vercel redeploy with correct API URL"
   git push origin main
   ```

### Step 2: Verify API Connectivity

Test the production API endpoints:

```bash
# Health check
curl https://vertaai-api-production.up.railway.app/health

# Expected response:
# {"status":"ok","service":"vertaai-api","database":"connected","timestamp":"..."}

# Coverage endpoint
curl "https://vertaai-api-production.up.railway.app/api/coverage/latest?workspaceId=63e8e9d1-c09d-4dd0-a921-6e54df1724ac"

# Plans endpoint
curl "https://vertaai-api-production.up.railway.app/api/plans?workspaceId=63e8e9d1-c09d-4dd0-a921-6e54df1724ac"

# Audit logs endpoint
curl "https://vertaai-api-production.up.railway.app/api/audit/logs?workspaceId=63e8e9d1-c09d-4dd0-a921-6e54df1724ac&limit=10"
```

### Step 3: Create Initial Coverage Snapshot

The coverage dashboard needs at least one snapshot to display data:

```bash
curl -X POST "https://vertaai-api-production.up.railway.app/api/coverage/snapshot" \
  -H "Content-Type: application/json" \
  -d '{"workspaceId": "63e8e9d1-c09d-4dd0-a921-6e54df1724ac"}'
```

---

## 📊 Verification

### Test All Dashboards

After redeployment, verify each dashboard loads correctly:

1. **Compliance Dashboard**:
   - URL: https://verta-ai-pearl.vercel.app/compliance?workspace=63e8e9d1-c09d-4dd0-a921-6e54df1724ac
   - Should show: Audit logs, compliance report generator, retention stats

2. **Coverage Dashboard**:
   - URL: https://verta-ai-pearl.vercel.app/coverage?workspace=63e8e9d1-c09d-4dd0-a921-6e54df1724ac
   - Should show: Coverage metrics, snapshots, trends, alerts

3. **Plans Dashboard**:
   - URL: https://verta-ai-pearl.vercel.app/plans?workspace=63e8e9d1-c09d-4dd0-a921-6e54df1724ac
   - Should show: Drift plans list, templates, create plan form

4. **Settings Dashboard**:
   - URL: https://verta-ai-pearl.vercel.app/settings?workspace=63e8e9d1-c09d-4dd0-a921-6e54df1724ac
   - Should show: Workflow preferences, drift types, input sources, output targets

---

## 🎯 Current Status

### ✅ Completed
- [x] Identified correct Railway API URL
- [x] Created initial coverage snapshot
- [x] Tested all API endpoints (17/17 tests passing)
- [x] Created E2E test suite
- [x] Documented fix procedure

### ⏭️ Next Steps
1. Update Vercel environment variable (requires manual action in Vercel dashboard)
2. Redeploy frontend
3. Verify all dashboards load correctly
4. Run full workflow E2E test with real integrations

---

## 📝 API Endpoints Reference

### Base URL
```
https://vertaai-api-production.up.railway.app
```

### Available Endpoints

#### Health & System
- `GET /health` - API health check
- `GET /api/workspaces` - List workspaces

#### Coverage Monitoring (Phase 3 Week 6)
- `GET /api/coverage/current?workspaceId=<id>` - Real-time coverage metrics
- `GET /api/coverage/latest?workspaceId=<id>` - Latest snapshot
- `GET /api/coverage/snapshots?workspaceId=<id>&limit=<n>` - Historical snapshots
- `GET /api/coverage/trends?workspaceId=<id>&days=<n>` - Coverage trends
- `GET /api/coverage/alerts?workspaceId=<id>` - Coverage alerts
- `POST /api/coverage/snapshot` - Create snapshot

#### DriftPlan Management (Phase 3 Week 5)
- `GET /api/plans/templates` - List all templates
- `GET /api/plans/templates/:templateId` - Get specific template
- `GET /api/plans?workspaceId=<id>` - List drift plans
- `GET /api/plans/:planId` - Get specific plan
- `POST /api/plans` - Create drift plan
- `PATCH /api/plans/:planId` - Update drift plan
- `DELETE /api/plans/:planId` - Delete drift plan
- `POST /api/plans/resolve` - Resolve plan for drift

#### Audit Trail & Compliance (Phase 4 Week 8)
- `GET /api/audit/logs?workspaceId=<id>&limit=<n>` - Get audit logs
- `GET /api/audit/entity/:entityType/:entityId?workspaceId=<id>` - Get entity audit trail
- `GET /api/audit/drift/:driftId/history?workspaceId=<id>` - Get drift history
- `POST /api/audit/compliance/report` - Generate compliance report
- `POST /api/audit/compliance/report/export` - Export report to CSV
- `POST /api/audit/retention/apply` - Apply retention policy
- `GET /api/audit/retention/policy?workspaceId=<id>&framework=<name>` - Get retention policy
- `POST /api/audit/retention/evidence-bundles/apply` - Apply evidence bundle retention
- `GET /api/audit/retention/evidence-bundles/stats?workspaceId=<id>` - Get retention stats

#### Webhooks
- `POST /webhooks/github` - GitHub webhook endpoint
- `POST /slack/interactions` - Slack interactions endpoint

---

## 🔐 Environment Variables

### Required in Vercel (Frontend)
```
NEXT_PUBLIC_API_URL=https://vertaai-api-production.up.railway.app
```

### Required in Railway (Backend)
```
DATABASE_URL=<postgresql connection string>
ANTHROPIC_API_KEY=<claude api key>
QSTASH_URL=<upstash qstash url>
QSTASH_TOKEN=<upstash qstash token>
UPSTASH_REDIS_REST_URL=<upstash redis url>
UPSTASH_REDIS_REST_TOKEN=<upstash redis token>
SLACK_CLIENT_ID=<slack client id>
SLACK_CLIENT_SECRET=<slack client secret>
SLACK_SIGNING_SECRET=<slack signing secret>
GITHUB_APP_ID=<github app id>
GITHUB_CLIENT_ID=<github client id>
GITHUB_CLIENT_SECRET=<github client secret>
CONFLUENCE_TOKEN=<confluence api token>
```

---

**Status**: Ready for Vercel environment variable update and redeployment

