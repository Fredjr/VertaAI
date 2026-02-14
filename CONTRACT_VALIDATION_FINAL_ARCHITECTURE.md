# 🏗️ Contract Validation: Final Architecture & Implementation Plan

**Date**: 2026-02-14
**Status**: ARCHITECTURAL DECISION DOCUMENT
**Scope**: Track 1 (Contract Validation) - Complete End-to-End Flow

---

## Executive Summary

This document defines the **final architecture** for Track 1 (Contract Validation), addressing:
1. **Comparator Reuse**: How Track 1 and Track 2 share comparison logic
2. **Integration Requirements**: What systems users must connect
3. **Shallow vs Deep Comparison**: How to detect value mismatches, not just existence
4. **Complete Flow**: GitHub webhook → GitHub Check creation

---

## Jobs to Be Done: Track 1 vs Track 2

### **Track 1: Contract Validation** (Prevention)
**Job**: Prevent inconsistencies from reaching production by validating contracts in real-time during PR review.

**When**: PR opened/updated (GitHub webhook)
**Latency**: < 30 seconds (PR-blocking)
**Method**: Deterministic comparison (no LLM)
**Output**: GitHub Check (PASS/WARN/FAIL)
**User Experience**: Developer sees inline annotations on PR

**Example**:
```
Developer opens PR that updates OpenAPI spec
  → VertaAI validates: "Does Confluence doc match this spec?"
  → GitHub Check: ❌ FAIL - "3 endpoints missing from docs"
  → Developer fixes docs before merge
```

**Value**: Catches drift **before** it reaches production.

---

### **Track 2: Drift Remediation** (Correction)
**Job**: Detect and fix drift that has accumulated over time or slipped through validation.

**When**: Scheduled job, manual trigger, or escalated from Track 1
**Latency**: Minutes to hours (async)
**Method**: Deterministic comparison + LLM-based patch generation
**Output**: Slack message with patch proposal
**User Experience**: Team receives Slack notification with diff preview

**Example**:
```
PR merged 2 weeks ago changed kubectl → helm
  → VertaAI detects: "Runbook still shows kubectl"
  → Generates patch: "Replace kubectl with helm in deployment section"
  → Sends to Slack for approval
  → Team approves → Doc updated automatically
```

**Value**: Fixes drift **after** it reaches production.

---

## Part 1: Architectural Decisions

### **Decision 1: Separate But Complementary Comparison Systems** ✅

**Problem**: We have two comparison systems with different purposes:
- **Track 1 Comparators**: Contract validation (OpenAPI, Terraform, etc.)
- **Track 2 Baseline Comparison**: Drift detection (instruction, process, ownership, environment, coverage)

**Decision**: **Keep both systems, but make them complementary**

**Rationale**:
- ✅ **Different jobs to be done**:
  - Track 1: "Does this PR violate any contracts?" (contract-centric)
  - Track 2: "What changed and what docs need updating?" (drift-centric)
- ✅ **Different triggers**:
  - Track 1: PR opened/updated (real-time)
  - Track 2: PR merged, incident resolved, scheduled job (async)
- ✅ **Different outputs**:
  - Track 1: GitHub Check with pass/warn/fail
  - Track 2: Slack message with patch proposal
- ✅ **Complementary, not redundant**:
  - Track 1 prevents drift (proactive)
  - Track 2 fixes drift (reactive)

**How They Work Together**:
```typescript
// Track 1: Contract Validation (PR opened)
const contractFindings = await runContractValidation(pr);
if (contractFindings.band === 'FAIL') {
  await createGitHubCheck({ conclusion: 'failure', findings: contractFindings });
  // Block merge
}

// Track 2: Drift Remediation (PR merged)
const driftCandidate = await createDriftCandidate({
  sourceType: 'github_pr',
  signalEventId: pr.id,
});

// Run deterministic comparison (baseline check)
const baselineResult = await compareArtifacts({
  sourceArtifacts: extractFromPR(pr),
  docArtifacts: extractFromDocs(docs),
});

// If drift detected → Generate patch
if (baselineResult.hasMatch) {
  const patch = await generatePatch({ baselineResult, context });
  await sendToSlack({ patch, driftCandidate });
}
```

**Key Insight**: Track 1 comparators are **contract-specific** (OpenAPI ↔ Docs, Terraform ↔ Runbook), while Track 2 comparison is **drift-type-specific** (instruction, process, ownership, environment, coverage). They serve different purposes and should remain separate.

---

### **Decision 2: Integration Requirements by Use Case**

**Problem**: Do users need to connect ALL tools (GitHub, Confluence, Terraform, Grafana, etc.)?

**Decision**: **Flexible integration based on use case**

| Use Case | Required Integrations | Optional Integrations |
|----------|----------------------|----------------------|
| **API ↔ Docs Drift** | GitHub + (Confluence OR Notion) | - |
| **Terraform ↔ Runbook Drift** | GitHub + (Confluence OR Notion) | - |
| **Dashboard ↔ Alert Drift** | Grafana + Datadog + (Confluence OR Notion) | GitHub (for runbooks in repo) |
| **CODEOWNERS Drift** | GitHub + (Confluence OR Notion) | - |
| **Full Coverage** | GitHub + Confluence/Notion + Slack | Grafana + Datadog + PagerDuty |

**Minimum Viable Setup**:
- ✅ GitHub (required) - For PR monitoring
- ✅ Confluence OR Notion (required) - For documentation
- ✅ Slack (required) - For notifications

**Progressive Enhancement**:
- Add Grafana → Unlock dashboard drift detection
- Add Datadog → Unlock alert drift detection
- Add PagerDuty → Unlock incident drift detection

---

### **Decision 3: Shallow vs Deep Comparison**

**Problem**: Current comparators only detect **existence** (e.g., "endpoint missing") but not **value mismatches** (e.g., "required field differs").

**Decision**: **Enhance comparators with deep comparison logic**

**Current State** (Shallow):
```typescript
// ❌ CURRENT: Only checks if parameter exists
if (!docParams.has(param.name)) {
  findings.push({ kind: 'parameter_missing', ... });
}
```

**Target State** (Deep):
```typescript
// ✅ NEW: Check existence
if (!docParams.has(param.name)) {
  findings.push({ kind: 'parameter_missing', ... });
}
// ✅ NEW: Check value match
else {
  const docParam = docParams.get(param.name);
  if (openApiParam.required !== docParam.required) {
    findings.push({ 
      kind: 'parameter_requirement_mismatch',
      leftValue: { name: param.name, required: openApiParam.required },
      rightValue: { name: param.name, required: docParam.required },
      severity: 'high',
    });
  }
}
```

**Pain Points Addressed**:
1. ✅ **API ↔ Docs Drift**: "OpenAPI says `userId` required, docs say optional"
2. ✅ **Infrastructure ↔ Runbook Drift**: "Terraform deploys to 3 regions, runbook covers 2"
3. ⏳ **Dashboard ↔ Alert Drift**: "Metric name mismatch" (requires new comparator)
4. ⏳ **Code ↔ Ownership Drift**: "Team renamed" (requires new comparator)
5. ✅ **Deployment ↔ Docs Drift**: "kubectl → Helm" (partially detected)

---

## Part 2: Complete Contract Validation Flow

### **End-to-End Flow: GitHub Webhook → GitHub Check**

```
┌─────────────────────────────────────────────────────────────────┐
│  1. GITHUB WEBHOOK (PR opened/updated)                          │
│  ├─ Verify signature                                            │
│  ├─ Extract PR metadata (files, diff, author)                   │
│  └─ Create SignalEvent                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. CONTRACT RESOLUTION (< 2s)                                   │
│  ├─ Match changed files to contract patterns                    │
│  ├─ Match service/repo to contract scope                        │
│  ├─ Return applicable contracts (0-N)                           │
│  └─ If no contracts → Skip validation                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. ARTIFACT FETCHING (< 10s, parallel)                          │
│  ├─ For each contract, fetch artifact snapshots                 │
│  ├─ Primary: OpenAPI spec, Terraform files (from GitHub)        │
│  ├─ Secondary: Confluence docs, Notion pages                    │
│  ├─ Reference: Grafana dashboards, Datadog alerts               │
│  └─ Store snapshots with TTL                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. RUN COMPARATORS (< 5s each, parallel)                       │
│  ├─ For each contract invariant:                                │
│  │   ├─ Select appropriate comparator                           │
│  │   ├─ Run comparison (deterministic, no LLM)                  │
│  │   └─ Generate IntegrityFindings                              │
│  ├─ OpenAPI ↔ Docs: Endpoint/parameter/schema parity            │
│  ├─ Terraform ↔ Runbook: Resource/variable/deployment parity    │
│  └─ Aggregate findings across all comparators                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. CALCULATE RISK TIER (< 1s)                                   │
│  ├─ Group findings by severity (critical/high/medium/low)       │
│  ├─ Calculate risk score (weighted by severity)                 │
│  ├─ Determine band: PASS / WARN / FAIL                          │
│  ├─ Map to GitHub Check conclusion:                             │
│  │   ├─ PASS → success (merge allowed)                          │
│  │   ├─ WARN → neutral (merge allowed, create DriftCandidate)   │
│  │   └─ FAIL → failure (block merge)                            │
│  └─ Generate recommended action                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. CREATE GITHUB CHECK (< 2s)                                   │
│  ├─ Title: "Contract Validation: [PASS/WARN/FAIL]"              │
│  ├─ Summary: Risk tier, findings count, impact band             │
│  ├─ Annotations: File-level findings (max 50)                   │
│  │   ├─ Map severity to annotation level:                       │
│  │   │   ├─ critical → failure                                  │
│  │   │   ├─ high → warning                                      │
│  │   │   └─ medium/low → notice                                 │
│  │   └─ Include evidence and pointers                           │
│  ├─ Details: Full findings list with recommendations            │
│  └─ Actions: Links to fix docs, view contract, snooze           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  7. (OPTIONAL) CREATE DRIFT CANDIDATE                            │
│  ├─ If band = WARN or FAIL:                                     │
│  │   ├─ Create DriftCandidate with findings                     │
│  │   ├─ Link to SignalEvent                                     │
│  │   └─ Trigger Track 2 remediation (async)                     │
│  └─ If band = PASS: No action                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Total Latency**: < 30 seconds (target: 20s average)

---

## Part 3: Implementation Plan

### **Phase 1: Enhance Existing Comparators (Week 5-6)** ✅ IN PROGRESS

**Status**: 3/5 steps complete

#### **Step 1: Comparator Interface & Base Class** ✅ COMPLETE
- ✅ Created `BaseComparator` with Template Method pattern
- ✅ 26/26 tests passing
- ✅ Committed and pushed

#### **Step 2: OpenAPI Comparator** ✅ COMPLETE
- ✅ Endpoint parity detection
- ✅ Parameter parity detection (shallow)
- ✅ Schema parity detection
- ✅ 13/13 tests passing
- ✅ Committed and pushed

#### **Step 3: Terraform ↔ Runbook Comparator** ✅ COMPLETE
- ✅ Resource parity detection
- ✅ Variable parity detection
- ✅ Deployment step parity detection
- ✅ 13/13 tests passing
- ✅ Committed (NOT pushed)

#### **Step 4: IntegrityFinding Generation** ⏳ NEXT
**Duration**: 1 day

**Tasks**:
1. **Database Persistence** (2 hours):
   - Add `IntegrityFinding` table to Prisma schema
   - Create CRUD operations
   - Add indexes for querying

2. **Webhook Integration** (3 hours):
   - Integrate comparators into GitHub webhook handler
   - Run comparisons after artifact fetching
   - Store findings in database

3. **Telemetry Logging** (1 hour):
   - Log comparison duration
   - Log findings count
   - Log errors and warnings

**Files to Create/Modify**:
- `prisma/schema.prisma` - Add IntegrityFinding model
- `apps/api/src/routes/webhooks.ts` - Integrate comparators
- `apps/api/src/services/contracts/findingRepository.ts` - CRUD operations

#### **Step 5: Comparison Telemetry** ⏳ PENDING
**Duration**: 1 day

**Tasks**:
1. **Metrics Tracking** (3 hours):
   - Comparison duration per comparator
   - Findings count by severity
   - Coverage percentage

2. **Performance Monitoring** (2 hours):
   - Slow comparator detection
   - Memory usage tracking
   - Error rate monitoring

3. **Error Logging** (1 hour):
   - Structured error logging
   - Error categorization
   - Alerting thresholds

---

### **Phase 2: Deep Comparison Enhancement (Week 7)** ⏳ NOT STARTED

**Goal**: Detect value mismatches, not just existence

#### **Step 6: Enhance OpenAPI Comparator**
**Duration**: 1 day

**Tasks**:
1. **Parameter Requirement Mismatch** (2 hours):
   ```typescript
   // Detect: OpenAPI says required=true, docs say required=false
   if (openApiParam.required !== docParam.required) {
     findings.push({ kind: 'parameter_requirement_mismatch', ... });
   }
   ```

2. **Parameter Type Mismatch** (2 hours):
   ```typescript
   // Detect: OpenAPI says type=string, docs say type=number
   if (openApiParam.type !== docParam.type) {
     findings.push({ kind: 'parameter_type_mismatch', ... });
   }
   ```

3. **Schema Field Mismatch** (2 hours):
   ```typescript
   // Detect: OpenAPI schema has field, docs don't mention it
   for (const field of openApiSchema.fields) {
     if (!docSchema.fields.includes(field.name)) {
       findings.push({ kind: 'schema_field_missing', ... });
     }
   }
   ```

**Files to Modify**:
- `apps/api/src/services/contracts/comparators/openapi.ts`
- `apps/api/src/__tests__/contracts/openApiComparator.test.ts`

#### **Step 7: Enhance Terraform Comparator**
**Duration**: 1 day

**Tasks**:
1. **Configuration Value Mismatch** (3 hours):
   ```typescript
   // Detect: Terraform deploys to 3 regions, runbook covers 2
   const tfRegions = extractRegions(tfResource.config);
   const docRegions = extractRegions(runbookResource.description);

   if (tfRegions.length !== docRegions.length) {
     findings.push({ kind: 'region_count_mismatch', ... });
   }
   ```

2. **Deployment Tool Version Mismatch** (2 hours):
   ```typescript
   // Detect: Switched from kubectl to Helm
   const tfTool = detectDeploymentTool(tfOutput);
   const docTool = detectDeploymentTool(runbookStep);

   if (tfTool !== docTool) {
     findings.push({ kind: 'deployment_tool_mismatch', ... });
   }
   ```

**Files to Modify**:
- `apps/api/src/services/contracts/comparators/terraform.ts`
- `apps/api/src/__tests__/contracts/terraformComparator.test.ts`

---

### **Phase 3: GitHub Check Integration (Week 7-8)** ⏳ NOT STARTED

**Goal**: Create GitHub Checks from IntegrityFindings

#### **Step 8: GitHub Check Creation**
**Duration**: 2 days

**Tasks**:
1. **Map IntegrityFinding to GitHub Check** (4 hours):
   - Convert severity to annotation level
   - Format evidence as annotations
   - Generate summary and details

2. **Risk Tier Calculation** (2 hours):
   - Aggregate findings by severity
   - Calculate risk score
   - Determine PASS/WARN/FAIL band

3. **Create Check Run** (2 hours):
   - Use GitHub Checks API
   - Include annotations (max 50)
   - Add actions (fix docs, view contract)

**Reference Implementation**:
- `apps/api/src/services/gatekeeper/githubCheck.ts` (existing pattern)

**Files to Create**:
- `apps/api/src/services/contracts/githubCheck.ts`
- `apps/api/src/__tests__/contracts/githubCheck.test.ts`

#### **Step 9: End-to-End Testing**
**Duration**: 1 day

**Tasks**:
1. **Integration Test** (4 hours):
   - Mock GitHub webhook
   - Verify contract resolution
   - Verify artifact fetching
   - Verify comparator execution
   - Verify GitHub Check creation

2. **Performance Test** (2 hours):
   - Measure total latency
   - Verify < 30s target
   - Identify bottlenecks

**Files to Create**:
- `apps/api/src/__tests__/integration/contractValidation.test.ts`

---

## Part 4: Future Comparators (Week 9+)

### **Comparator Roadmap**

| Comparator | Priority | Duration | Pain Point Addressed |
|------------|----------|----------|---------------------|
| **Grafana ↔ Datadog** | High | 2 days | Dashboard ↔ Alert metric name drift |
| **CODEOWNERS ↔ Docs** | High | 1 day | Team rename drift |
| **Postman ↔ Docs** | Medium | 2 days | API collection drift |
| **Pulumi ↔ Runbook** | Medium | 2 days | Alternative IaC drift |
| **Semantic Coverage** | Low | 3 days | Missing failure modes (LLM-based) |

---

## Part 5: Success Criteria

### **Track 1 (Contract Validation) is Complete When:**

1. ✅ **Latency**: < 30 seconds from webhook to GitHub Check
2. ✅ **Accuracy**: 95%+ precision (no false positives)
3. ✅ **Coverage**: Detects all 6 pain points (API, Terraform, Dashboard, CODEOWNERS, Deployment, Coverage)
4. ✅ **Reliability**: 99.9% uptime (no failed checks due to system errors)
5. ✅ **Usability**: Clear annotations with actionable recommendations

### **Current Progress**:
- ✅ Latency: Not measured yet (target: < 30s)
- ✅ Accuracy: 100% on test cases (26 + 13 + 13 = 52 tests passing)
- ⏳ Coverage: 2/6 pain points (API ↔ Docs, Terraform ↔ Runbook)
- ⏳ Reliability: Not deployed yet
- ⏳ Usability: GitHub Check integration not implemented

---

## Part 6: Next Immediate Steps

### **Recommended Order**:

1. **Push Step 3 commit** (5 minutes)
   ```bash
   git push origin main
   ```

2. **Implement Step 4: IntegrityFinding Generation** (1 day)
   - Add Prisma model
   - Integrate into webhook
   - Add telemetry

3. **Implement Step 6-7: Deep Comparison** (2 days)
   - Enhance OpenAPI comparator
   - Enhance Terraform comparator
   - Add comprehensive tests

4. **Implement Step 8-9: GitHub Check Integration** (3 days)
   - Create GitHub Check service
   - Map findings to annotations
   - End-to-end testing

5. **Deploy and Monitor** (1 day)
   - Deploy to Railway
   - Monitor latency
   - Collect feedback

**Total Remaining Time**: 7 days (1.5 weeks)

---

## Part 7: Open Questions

1. **Should we block merges on FAIL band?**
   - Option A: Always block (strict)
   - Option B: Allow override with approval (flexible)
   - **Recommendation**: Option B (allow override)

2. **Should we create DriftCandidates for WARN band?**
   - Option A: Yes, always escalate to Track 2
   - Option B: Only if user opts in
   - **Recommendation**: Option A (automatic escalation)

3. **Should we support multiple documentation systems per contract?**
   - Option A: Yes, check all (Confluence + Notion + GitHub README)
   - Option B: No, pick one primary
   - **Recommendation**: Option A (check all, report best match)

---

## Appendix: Architecture Diagrams

### **Dual-Track Relationship**

```
┌─────────────────────────────────────────────────────────────────┐
│  TRACK 1: CONTRACT VALIDATION (Prevention)                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Job: Prevent drift before it reaches production         │    │
│  │ Trigger: PR opened/updated                              │    │
│  │ Latency: < 30 seconds                                   │    │
│  │ Method: Deterministic comparators (no LLM)              │    │
│  │ Output: GitHub Check (PASS/WARN/FAIL)                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Comparators (Contract-Specific)                         │    │
│  │ ├─ OpenApiComparator: API ↔ Docs parity                │    │
│  │ ├─ TerraformRunbookComparator: IaC ↔ Runbook parity     │    │
│  │ ├─ GrafanaDatadogComparator: Dashboard ↔ Alert parity   │    │
│  │ └─ CodeOwnersComparator: Ownership ↔ Docs parity        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ IntegrityFindings (Structured Output)                   │    │
│  │ ├─ severity: critical/high/medium/low                   │    │
│  │ ├─ evidence: { kind, leftValue, rightValue, pointers }  │    │
│  │ └─ recommendedAction: block_merge/create_patch/notify   │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ (Escalation if severity >= high)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  TRACK 2: DRIFT REMEDIATION (Correction)                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Job: Fix drift that slipped through or accumulated      │    │
│  │ Trigger: PR merged, incident, scheduled, Track 1 WARN   │    │
│  │ Latency: Minutes to hours                               │    │
│  │ Method: Deterministic comparison + LLM patch generation │    │
│  │ Output: Slack message with patch proposal               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Baseline Comparison (Drift-Type-Specific)               │    │
│  │ ├─ Instruction Drift: Command/tool changes              │    │
│  │ ├─ Process Drift: Workflow/procedure changes            │    │
│  │ ├─ Ownership Drift: Team/contact changes                │    │
│  │ ├─ Environment Drift: Config/deployment changes         │    │
│  │ └─ Coverage Drift: Missing documentation                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ LLM Patch Generation (Evidence-Grounded)                │    │
│  │ ├─ Receives typed deltas from baseline comparison       │    │
│  │ ├─ Generates surgical diff (not full rewrite)           │    │
│  │ └─ Includes confidence score and evidence trail         │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

**End of Document**