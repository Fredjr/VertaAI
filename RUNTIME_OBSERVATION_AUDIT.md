# Runtime Observation Data Flow Audit

**Date:** 2026-03-02  
**Status:** ⚠️ PARTIALLY IMPLEMENTED - CRITICAL GAPS IDENTIFIED

---

## 🔍 Executive Summary

**CRITICAL FINDING:** The runtime observation infrastructure is **BUILT but NOT CONNECTED to real-time data sources**. The webhooks exist but require **manual customer setup** that is not documented. The INTENT_RUNTIME_PARITY comparator runs **synchronously during PR evaluation** but queries **historical data**, creating a **timing mismatch**.

---

## ✅ What's FULLY WIRED

### 1. Database Schema ✅
- `runtime_capability_observations` table exists
- Columns: workspace_id, service, capability_type, capability_target, source, observed_at, etc.
- Migration applied successfully

### 2. Capability Mapper ✅
- `apps/api/src/services/runtime/capabilityMapper.ts`
- Maps CloudTrail events → capability types (CLOUDTRAIL_CAPABILITY_MAP)
- Maps GCP Audit logs → capability types (GCP_CAPABILITY_MAP)
- Maps DB operations → capability types (DB_OPERATION_MAP)

### 3. Observation Ingestion Service ✅
- `apps/api/src/services/runtime/observationIngestion.ts`
- Functions: `ingestCloudTrailEvent()`, `ingestGCPAuditLog()`, `ingestDatabaseQuery()`
- Idempotency by `sourceEventId`
- Writes to `runtime_capability_observations` table

### 4. Capability Aggregation Service ✅
- `apps/api/src/services/runtime/capabilityAggregation.ts`
- `getServiceCapabilityUsage()` - Queries observations by time window
- `detectCapabilityDrift()` - Compares declared vs observed capabilities
- Returns: undeclared_usage, unused_declaration

### 5. Webhook Endpoints ✅
- `POST /api/runtime/cloudtrail` - AWS CloudTrail SNS notifications
- `POST /api/runtime/gcp-audit` - GCP Pub/Sub push notifications
- `POST /api/runtime/database-query-log` - Direct query log ingestion
- `GET /api/runtime/health` - Health check
- All mounted at `/api/runtime` in main API

### 6. INTENT_RUNTIME_PARITY Comparator ✅
- Registered in comparator registry
- Added to AUTO_INVOKED_COMPARATORS (runs on every PR)
- Queries intent artifact from database
- Queries runtime observations from database
- Calls `detectCapabilityDrift()` to compare
- Returns findings with evidence

---

## ⚠️ CRITICAL GAPS - NOT WIRED

### Gap #1: Real-Time Data Ingestion NOT CONFIGURED 🚨

**Problem:** The webhook endpoints exist but are **NOT connected to real-time data sources**.

**What's Missing:**
1. **AWS CloudTrail Setup Documentation**
   - How to configure CloudTrail to send events to SNS
   - How to configure SNS to POST to `/api/runtime/cloudtrail`
   - How to extract workspace ID from topic ARN
   - How to configure IAM permissions

2. **GCP Audit Log Setup Documentation**
   - How to configure Audit Logs to send to Pub/Sub
   - How to configure Pub/Sub push subscription to `/api/runtime/gcp-audit`
   - How to extract workspace ID from subscription
   - How to configure service account permissions

3. **Database Query Log Setup Documentation**
   - How to configure PostgreSQL/MySQL to stream query logs
   - How to configure log forwarder to POST to `/api/runtime/database-query-log`
   - How to extract workspace ID from connection metadata

4. **Cost Explorer Integration - NOT IMPLEMENTED**
   - No webhook endpoint for Cost Explorer
   - No capability mapper for cost data
   - No ingestion service for cost data

**Impact:** Customers cannot actually send runtime observations to VertaAI.

---

### Gap #2: Timing Mismatch - Sync PR Evaluation vs Async Runtime Data 🚨

**Problem:** INTENT_RUNTIME_PARITY runs **synchronously during PR evaluation** (Track A) but queries **historical runtime data** that may not exist yet.

**Current Flow:**
```
PR Opened (t=0)
  ↓
PackEvaluator.evaluate() runs SYNCHRONOUSLY
  ↓
runAutoInvokedComparators() runs SYNCHRONOUSLY
  ↓
INTENT_RUNTIME_PARITY.evaluate() runs SYNCHRONOUSLY
  ↓
Queries runtime_capability_observations table
  ↓
Looks for observations in last 7 days
  ↓
BUT: The code in this PR hasn't been deployed yet!
  ↓
Result: No observations found → "not evaluable" or false positive
```

**The Paradox:**
- **Spec→Build** (INTENT_CAPABILITY_PARITY): ✅ Works - compares intent to PR diff
- **Build→Run** (INFRA_OWNERSHIP_PARITY): ✅ Works - checks IaC files in PR
- **Spec→Run** (INTENT_RUNTIME_PARITY): ❌ BROKEN - queries runtime data that doesn't exist yet

**Why This Happens:**
- Track A runs **synchronously on PR open/sync** (before merge, before deploy)
- Runtime observations come from **production** (after merge, after deploy)
- There's a **temporal gap** between PR evaluation and runtime observation

---

### Gap #3: No Integration with Track B (Async Runtime Monitoring) 🚨

**Problem:** INTENT_RUNTIME_PARITY should be a **Track B comparator** (async, post-deploy), not a Track A comparator (sync, pre-merge).

**What Track B Does:**
- Runs **asynchronously** after deployment
- Monitors **production drift**
- Creates **DriftPlans** for remediation
- Integrates with PagerDuty for alerts

**What INTENT_RUNTIME_PARITY Should Do:**
1. Run **after deployment** (not during PR)
2. Query runtime observations from **production**
3. Compare to **merged intent artifact**
4. Create **DriftPlan** if drift detected
5. Send **PagerDuty alert** for critical drift

**Current State:**
- INTENT_RUNTIME_PARITY is in AUTO_INVOKED_COMPARATORS (Track A)
- It runs during PR evaluation (wrong timing)
- It doesn't create DriftPlans (wrong output)
- It doesn't integrate with PagerDuty (wrong alerting)

---

## 📊 Data Flow Analysis

### Current (Broken) Flow:
```
Cloud Events (CloudTrail, GCP Audit, DB logs)
  ↓
❌ NOT CONFIGURED - No real-time ingestion setup
  ↓
Capability Mapper (event → capability type + target)
  ↓
Observation Ingestion Service
  ↓
runtime_capability_observations table
  ↓
❌ TIMING MISMATCH - PR evaluation happens before deployment
  ↓
Capability Aggregation Service
  ↓
INTENT_RUNTIME_PARITY Comparator (runs during PR - WRONG)
  ↓
❌ No observations found → "not evaluable"
```

### Correct Flow (What Should Happen):
```
TRACK A (PR Evaluation - Synchronous):
PR Opened
  ↓
INTENT_CAPABILITY_PARITY (Spec→Build) ✅
  - Compare intent artifact to PR diff
  - Block if undeclared capabilities
  ↓
INFRA_OWNERSHIP_PARITY (Build→Run ownership) ✅
  - Check IaC files for ownership metadata
  - Warn if missing
  ↓
CHURN_COMPLEXITY_RISK (Build→Run quality) ✅
  - Analyze churn/complexity
  - Require design notes for high-risk
  ↓
PR Merged
  ↓
Deployment to Production
  ↓

TRACK B (Runtime Monitoring - Asynchronous):
Cloud Events (CloudTrail, GCP Audit, DB logs)
  ↓
Real-Time Ingestion (webhooks configured by customer)
  ↓
Capability Mapper
  ↓
Observation Ingestion Service
  ↓
runtime_capability_observations table
  ↓
Scheduled Job (every 1 hour)
  ↓
INTENT_RUNTIME_PARITY Comparator (runs async - CORRECT)
  ↓
Capability Aggregation Service
  ↓
Detect Drift (undeclared usage, unused declarations)
  ↓
Create DriftPlan
  ↓
PagerDuty Alert (if critical)
```

---

## 🔧 What Needs to Be Fixed

### Fix #1: Move INTENT_RUNTIME_PARITY to Track B
- Remove from AUTO_INVOKED_COMPARATORS
- Create Track B scheduled job for runtime drift detection
- Integrate with DriftPlan creation
- Add PagerDuty alerting for critical drift

### Fix #2: Create Customer Setup Documentation
- AWS CloudTrail → SNS → VertaAI webhook setup guide
- GCP Audit Log → Pub/Sub → VertaAI webhook setup guide
- Database query log streaming setup guide
- Workspace ID extraction and configuration

### Fix #3: Implement Cost Explorer Integration
- Create `/api/runtime/cost-explorer` webhook endpoint
- Create capability mapper for cost data
- Create ingestion service for cost observations

### Fix #4: Create Track B Runtime Monitoring Job
- Scheduled job (every 1 hour)
- Query all workspaces with runtime observations
- Run INTENT_RUNTIME_PARITY for each service
- Create DriftPlans for detected drift
- Send PagerDuty alerts for critical drift

---

## 🎯 Recommendations

**SHORT TERM (Fix Critical Bugs):**
1. Remove INTENT_RUNTIME_PARITY from AUTO_INVOKED_COMPARATORS
2. Document that Spec→Run verification is "coming soon" (Track B)
3. Keep webhook endpoints for future use

**MEDIUM TERM (Enable Track B):**
1. Create Track B scheduled job for runtime drift detection
2. Integrate with DriftPlan creation
3. Add PagerDuty alerting

**LONG TERM (Enable Real-Time Ingestion):**
1. Create customer setup documentation
2. Build Terraform modules for CloudTrail/GCP setup
3. Create Cost Explorer integration
4. Build VertaAI UI for workspace configuration

---

**BOTTOM LINE:** The infrastructure is built, but it's **not connected to real-time data** and **runs at the wrong time**. INTENT_RUNTIME_PARITY should be a **Track B comparator**, not Track A.

