# End-to-End Testing Guide for Runtime Observations

This guide walks you through testing the complete runtime observation system with the demo-workspace.

## 🎯 What We're Testing

The runtime observation system consists of:

1. **Webhook Endpoints** - Receive events from AWS CloudTrail, GCP Audit Logs, and Database Query Logs
2. **Observation Ingestion** - Parse and store capability observations in the database
3. **Setup Wizards** - User-friendly UI for configuring runtime observation sources
4. **Connection Testing** - Verify that events are being received
5. **Runtime Drift Monitor** - Detect drift between declared and observed capabilities
6. **DriftPlan Creation** - Generate remediation plans for detected drift

## 📋 Prerequisites

1. **Database Running** - Railway PostgreSQL database accessible
2. **API Server** - Backend API running on port 3001
3. **Web App** - Frontend running on port 3000
4. **Demo Workspace** - `demo-workspace` configured in the database

## 🚀 Quick Start

### Step 1: Set Up Demo Workspace

Run the setup script to populate the demo-workspace with sample data:

```bash
pnpm tsx scripts/setup-demo-workspace.ts
```

This creates:
- ✅ Sample intent artifact for `user-service`
- ✅ Sample agent action trace
- ✅ Sample runtime observations (CloudTrail, Database queries)

### Step 2: Start the Servers

**Terminal 1 - API Server:**
```bash
cd apps/api
pnpm dev
```

**Terminal 2 - Web App:**
```bash
cd apps/web
pnpm dev
```

### Step 3: Run E2E Tests

**Terminal 3 - E2E Tests:**
```bash
pnpm tsx scripts/e2e-test-runtime-observations.ts
```

This tests:
- ✅ CloudTrail webhook endpoint
- ✅ GCP Audit webhook endpoint
- ✅ Database query log webhook endpoint
- ✅ Connection status endpoint
- ✅ Runtime drift monitor

## 🧪 Manual Testing

### Test 1: CloudTrail Setup Wizard

1. Visit: http://localhost:3000/setup/cloudtrail?workspace=demo-workspace
2. Choose setup method (Terraform/CloudFormation/Manual)
3. Configure AWS region and trail name
4. Generate infrastructure code
5. Download or copy the code
6. Test connection

**Expected Result:** ✅ Connection test shows events received

### Test 2: GCP Audit Setup Wizard

1. Visit: http://localhost:3000/setup/gcp-audit?workspace=demo-workspace
2. Choose setup method (Terraform/Manual)
3. Configure GCP project ID
4. Generate infrastructure code or follow manual guide
5. Test connection

**Expected Result:** ✅ Connection test shows events received

### Test 3: Database Logs Setup Wizard

1. Visit: http://localhost:3000/setup/database-logs?workspace=demo-workspace
2. Choose database type (PostgreSQL/MySQL/MongoDB)
3. Follow manual setup guide
4. Test connection

**Expected Result:** ✅ Connection test shows events received

### Test 4: Onboarding Page

1. Visit: http://localhost:3000/onboarding?workspace=demo-workspace
2. Scroll to "Runtime Observations (Advanced)" section
3. Verify connection status for all sources

**Expected Result:**
- ✅ AWS CloudTrail shows connected with last observation timestamp
- ✅ GCP Audit Logs shows connected with last observation timestamp
- ✅ Database Query Logs shows connected with last observation timestamp

### Test 5: Runtime Drift Monitor

1. Trigger the drift monitor:
```bash
curl -X POST http://localhost:3001/api/runtime/drift-monitor
```

2. Check the response for drift detection results

**Expected Result:**
```json
{
  "success": true,
  "workspacesChecked": 1,
  "driftDetected": 0,
  "message": "Runtime drift monitor completed successfully"
}
```

## 📊 Verifying Data in Database

### Check Intent Artifacts

```sql
SELECT * FROM "IntentArtifact" WHERE "workspaceId" = 'demo-workspace';
```

### Check Runtime Observations

```sql
SELECT * FROM "RuntimeCapabilityObservation" WHERE "workspaceId" = 'demo-workspace';
```

### Check Drift Plans

```sql
SELECT * FROM "DriftPlan" WHERE "workspaceId" = 'demo-workspace';
```

## 🔍 Troubleshooting

### Issue: Webhook endpoints return 404

**Solution:** Verify API server is running and routes are mounted:
```bash
curl http://localhost:3001/api/runtime/health
```

### Issue: Connection test shows "No events received"

**Solution:** 
1. Check that setup script created sample observations
2. Verify database connection
3. Check API server logs for errors

### Issue: Drift monitor doesn't detect drift

**Solution:**
1. Verify intent artifacts exist with declared capabilities
2. Verify runtime observations exist with different capabilities
3. Check that service names match between intent and observations

## 📝 Test Scenarios

### Scenario 1: Capability Parity (No Drift)

**Setup:**
- Intent declares: `db_read`, `db_write`, `db_delete`
- Runtime observes: `db_read`, `db_write`, `db_delete`

**Expected:** ✅ No drift detected

### Scenario 2: Capability Drift (Extra Capability)

**Setup:**
- Intent declares: `db_read`, `db_write`
- Runtime observes: `db_read`, `db_write`, `db_delete`, `file_system_access`

**Expected:** ⚠️ Drift detected - Extra capabilities: `db_delete`, `file_system_access`

### Scenario 3: Capability Drift (Missing Capability)

**Setup:**
- Intent declares: `db_read`, `db_write`, `db_delete`, `api_create`
- Runtime observes: `db_read`, `db_write`

**Expected:** ⚠️ Drift detected - Missing capabilities: `db_delete`, `api_create`

## 🎉 Success Criteria

All tests pass when:

- ✅ All webhook endpoints return 200 OK
- ✅ Observations are stored in database
- ✅ Connection status shows all sources connected
- ✅ Setup wizards generate valid infrastructure code
- ✅ Drift monitor executes without errors
- ✅ DriftPlans are created for detected drift
- ✅ Onboarding page displays runtime observation status

## 📚 Additional Resources

- [Phase 1 Implementation](PHASE_1_TRACK_B_IMPLEMENTATION.md)
- [Phase 2 & 3 Implementation Plan](PHASE_2_3_IMPLEMENTATION_PLAN.md)
- [Runtime Observation Audit](RUNTIME_OBSERVATION_AUDIT.md)
- [API Documentation](apps/api/README.md)

