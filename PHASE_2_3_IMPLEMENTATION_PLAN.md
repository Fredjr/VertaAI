# Phase 2 & 3: Real-Time Ingestion + Setup UX - Implementation Plan

**Date:** 2026-03-02  
**Status:** 📋 PLANNED (Phase 1 Complete)

---

## 🎯 Overview

Phase 1 (Track B Runtime Drift Monitor) is complete. Phases 2 & 3 focus on enabling customers to easily set up real-time data ingestion from AWS CloudTrail, GCP Audit Logs, and Database Query Logs.

---

## 📦 Phase 2: Enable Real-Time Ingestion (Week 2-3)

### Objective
Create backend endpoints that generate infrastructure-as-code (Terraform/CloudFormation) for customers to deploy in their AWS/GCP accounts.

### Files to Create

#### 1. **Setup Endpoints** (`apps/api/src/routes/runtime/setup.ts`)

**Endpoints:**
- `POST /api/runtime/setup/terraform/cloudtrail` - Generate Terraform module for AWS CloudTrail
- `POST /api/runtime/setup/cloudformation/cloudtrail` - Generate CloudFormation template for AWS CloudTrail
- `POST /api/runtime/setup/terraform/gcp-audit` - Generate Terraform module for GCP Audit Logs
- `POST /api/runtime/setup/test-connection` - Test if webhook is receiving events
- `GET /api/runtime/setup/status/:workspaceId` - Get connection status for all sources

**Terraform Module Structure (CloudTrail):**
```hcl
# Creates:
# - S3 bucket for CloudTrail logs
# - CloudTrail trail (multi-region)
# - SNS topic for notifications
# - SNS subscription to VertaAI webhook
# - IAM roles and policies
```

**CloudFormation Template Structure (CloudTrail):**
```yaml
# Creates same resources as Terraform
# - CloudTrailLogsBucket
# - CloudTrailNotificationsTopic
# - VertaAIWebhookSubscription
# - VertaAICloudTrail
```

#### 2. **Update Runtime Routes** (`apps/api/src/routes/runtime/index.ts`)

Add setup router:
```typescript
import setupRouter from './setup.js';
router.use('/setup', setupRouter);
```

---

## 🎨 Phase 3: Build Setup UX (Week 4-5)

### Objective
Create user-friendly setup wizards in the web UI for configuring runtime observations.

### Files to Create

#### 1. **CloudTrail Setup Page** (`apps/web/src/app/setup/cloudtrail/page.tsx`)

**UI Flow:**
```
Step 1: Choose Setup Method
  - Terraform (recommended for DevOps teams)
  - CloudFormation (recommended for AWS-native teams)
  - Manual (step-by-step guide)

Step 2: Generate Infrastructure Code
  - Input: AWS region, trail name (optional)
  - Output: Download .tf or .yaml file

Step 3: Deploy Infrastructure
  - Instructions for terraform apply or CloudFormation stack creation

Step 4: Test Connection
  - Button to test if webhook is receiving events
  - Shows last observation timestamp
```

**Components:**
- `SetupMethodSelector` - Choose Terraform/CloudFormation/Manual
- `TerraformGenerator` - Generate and download .tf file
- `CloudFormationGenerator` - Generate and download .yaml file
- `ConnectionTester` - Test webhook connection
- `SetupProgress` - Show setup progress (4 steps)

#### 2. **GCP Audit Setup Page** (`apps/web/src/app/setup/gcp-audit/page.tsx`)

Similar to CloudTrail but for GCP:
- Terraform module for Pub/Sub topic + subscription
- Manual setup guide for GCP Console

#### 3. **Database Logs Setup Page** (`apps/web/src/app/setup/database-logs/page.tsx`)

Manual setup guide for:
- PostgreSQL (pg_stat_statements)
- MySQL (general_log)
- MongoDB (profiler)

#### 4. **Update Onboarding Page** (`apps/web/src/app/onboarding/page.tsx`)

Add runtime observation cards:
```tsx
{/* Runtime Observations (Advanced) */}
<div className="mt-8 p-6 bg-purple-50 rounded-xl">
  <h3 className="font-semibold text-lg mb-4">
    🔬 Runtime Observations (Advanced)
  </h3>
  <p className="text-sm text-gray-600 mb-4">
    Enable Spec→Run verification by streaming runtime capability observations
  </p>
  
  <RuntimeObservationCard
    name="AWS CloudTrail"
    icon="☁️"
    description="Stream AWS API calls to detect runtime capability usage"
    connected={status.runtimeObservations?.cloudtrail?.connected}
    setupUrl={`/setup/cloudtrail?workspace=${workspaceId}`}
    setupLabel="Setup CloudTrail"
    optional
  />
  
  <RuntimeObservationCard
    name="GCP Audit Logs"
    icon="🔍"
    description="Stream GCP Audit Logs to detect runtime capability usage"
    connected={status.runtimeObservations?.gcpAudit?.connected}
    setupUrl={`/setup/gcp-audit?workspace=${workspaceId}`}
    setupLabel="Setup GCP Audit"
    optional
  />
  
  <RuntimeObservationCard
    name="Database Query Logs"
    icon="🗄️"
    description="Stream database query logs to detect data access patterns"
    connected={status.runtimeObservations?.databaseLogs?.connected}
    setupUrl={`/setup/database-logs?workspace=${workspaceId}`}
    setupLabel="Setup DB Logs"
    optional
  />
</div>
```

#### 5. **Runtime Observation Card Component** (`apps/web/src/components/RuntimeObservationCard.tsx`)

Similar to `IntegrationCard` but with:
- Setup wizard link instead of OAuth flow
- Connection status indicator
- Last observation timestamp
- "Test Connection" button

---

## 🧪 Testing Plan

### Phase 2 Testing
1. **Terraform Module Generation**
   - Generate module for test workspace
   - Deploy to test AWS account
   - Verify CloudTrail → SNS → VertaAI webhook flow
   - Verify observations appear in database

2. **CloudFormation Template Generation**
   - Generate template for test workspace
   - Deploy to test AWS account
   - Verify same flow as Terraform

3. **Test Connection Endpoint**
   - Test with active CloudTrail
   - Test with no observations (should return "not connected")
   - Test with recent observations (should return "connected")

### Phase 3 Testing
1. **Setup Wizard UX**
   - Complete CloudTrail setup end-to-end
   - Verify Terraform download works
   - Verify CloudFormation download works
   - Verify test connection button works

2. **Onboarding Page**
   - Verify runtime observation cards appear
   - Verify connection status updates
   - Verify setup links work

---

## 📊 Success Criteria

### Phase 2
✅ Terraform module generates correctly  
✅ CloudFormation template generates correctly  
✅ Test connection endpoint works  
✅ Setup status endpoint returns accurate data  
✅ Deployed infrastructure successfully sends events to VertaAI  

### Phase 3
✅ Setup wizard is user-friendly (< 5 minutes to complete)  
✅ Terraform/CloudFormation download works  
✅ Test connection provides clear feedback  
✅ Onboarding page shows runtime observation status  
✅ Connection status updates in real-time  

---

## 🎯 Implementation Priority

**High Priority (Must Have):**
1. ✅ Phase 1: Track B Runtime Drift Monitor (COMPLETE)
2. ⏳ Phase 2: Terraform/CloudFormation generation for CloudTrail
3. ⏳ Phase 2: Test connection endpoint
4. ⏳ Phase 3: CloudTrail setup wizard

**Medium Priority (Should Have):**
5. ⏳ Phase 2: GCP Audit Logs Terraform generation
6. ⏳ Phase 3: GCP Audit setup wizard
7. ⏳ Phase 3: Update onboarding page with runtime observation cards

**Low Priority (Nice to Have):**
8. ⏳ Phase 2: Database Query Logs setup
9. ⏳ Phase 3: Database Logs setup wizard
10. ⏳ Phase 3: Connection status dashboard

---

## 📝 Next Steps

1. **Immediate (This Week):**
   - Create `apps/api/src/routes/runtime/setup.ts` with Terraform/CloudFormation generation
   - Test Terraform module deployment in test AWS account
   - Verify webhook receives CloudTrail events

2. **Week 2:**
   - Create CloudTrail setup wizard page
   - Add runtime observation cards to onboarding page
   - Test end-to-end setup flow

3. **Week 3:**
   - Add GCP Audit Logs support
   - Create GCP setup wizard
   - Documentation and troubleshooting guides

---

**Current Status:** Phase 1 Complete ✅ | Phase 2 & 3 Planned 📋

