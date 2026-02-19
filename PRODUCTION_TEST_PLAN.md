# 🧪 Production Testing Plan - YAML DSL Policy Pack System

**Date**: 2026-02-19  
**Workspace ID**: `demo-workspace`  
**Test Repository**: https://github.com/Fredjr/vertaai-e2e-test  
**Deployment Status**: Railway ✅ | Vercel ⏳

---

## 📋 Test Objectives

### Primary Goals:
1. ✅ Verify YAML DSL Policy Pack system works end-to-end in production
2. ✅ Test all 15 templates with real GitHub PRs
3. ✅ Validate fact catalog (50 facts across 7 categories)
4. ✅ Test gate status facts (cross-gate dependencies)
5. ✅ Test drift facts (Track B integration)
6. ✅ Verify GitHub Check creation and status updates
7. ✅ Test multi-pack evaluation and merge strategies

### Secondary Goals:
- Test conflict detection UX
- Test effective policy view
- Validate pack priority and scope matching
- Test approval tier configuration
- Verify glob pattern matching

---

## 🔧 Pre-Test Setup

### Step 1: Verify Workspace Configuration
```bash
# Check workspace exists and has correct configuration
curl -X GET "https://your-railway-url.railway.app/api/onboarding/setup-status/demo-workspace"
```

**Expected Response**:
```json
{
  "workspace": {
    "id": "demo-workspace",
    "name": "Demo Workspace",
    "slug": "demo-workspace"
  },
  "integrations": {
    "github": { "connected": true, "status": "connected" }
  }
}
```

### Step 2: Verify GitHub Integration
```bash
# Check GitHub integration is configured
curl -X GET "https://your-railway-url.railway.app/api/integrations/demo-workspace"
```

**Expected**: GitHub integration with `installationId: 105899665`

### Step 3: Create Test Policy Pack
We'll create a comprehensive policy pack that tests multiple features:
- Multiple rules with different triggers
- Fact-based conditions
- Comparator-based obligations
- Approval tiers
- Glob patterns

---

## 📝 Test Scenarios

### Scenario 1: Basic YAML Pack - Observe Mode
**Template**: `observe-core-pack.yaml`  
**Objective**: Test basic pack evaluation without blocking

**Steps**:
1. Create policy pack from template
2. Set scope to `Fredjr/vertaai-e2e-test` repository
3. Create PR with changes to trigger rules
4. Verify GitHub Check is created with PASS status
5. Verify findings are logged but PR is not blocked

**Expected Results**:
- ✅ GitHub Check created: "VertaAI Policy Pack: observe-core"
- ✅ Status: PASS (observe mode never blocks)
- ✅ Findings displayed in check output
- ✅ PR can be merged

---

### Scenario 2: Enforce Mode - Breaking Changes
**Template**: `breaking-change-documentation-pack.yaml`  
**Objective**: Test enforcement mode with blocking rules

**Steps**:
1. Create policy pack from template
2. Set enforcement mode to BLOCK
3. Create PR that modifies OpenAPI spec without documentation
4. Verify GitHub Check blocks the PR
5. Add documentation and push new commit
6. Verify GitHub Check now passes

**Expected Results**:
- ✅ Initial check: BLOCK status
- ✅ Check output shows missing documentation
- ✅ After fix: PASS status
- ✅ PR can now be merged

---

### Scenario 3: Fact-Based Conditions
**Template**: Custom pack with fact-based rules  
**Objective**: Test fact catalog and condition evaluator

**Test Facts**:
- `pr.files_changed` (number)
- `pr.additions` (number)
- `pr.has_tests` (boolean)
- `pr.author` (string)

**Steps**:
1. Create pack with fact-based conditions:
   ```yaml
   rules:
     - id: large-pr-check
       name: Large PR Requires Review
       trigger:
         always: true
       obligations:
         - condition:
             fact: pr.files_changed
             operator: greater_than
             value: 10
           severity: high
           decisionOnFail: warn
           message: "Large PR (>10 files) - requires extra review"
   ```
2. Create PR with 15 files changed
3. Verify condition evaluates correctly
4. Verify GitHub Check shows warning

**Expected Results**:
- ✅ Fact resolver fetches `pr.files_changed = 15`
- ✅ Condition evaluates to TRUE (15 > 10)
- ✅ GitHub Check shows WARN status
- ✅ Message displayed in check output

---

### Scenario 4: Gate Status Facts (Cross-Gate Dependencies)
**Template**: `deploy-gate-pack.yaml`  
**Objective**: Test gate status facts using GitHub Check Runs API

**Steps**:
1. Create two policy packs:
   - Pack A: "Security Scan" (runs first)
   - Pack B: "Deploy Gate" (depends on Pack A)
2. Configure Pack B with gate status fact:
   ```yaml
   rules:
     - id: require-security-pass
       name: Require Security Scan Pass
       trigger:
         always: true
       obligations:
         - condition:
             fact: gate.security_scan.status
             operator: equals
             value: "pass"
           severity: critical
           decisionOnFail: block
           message: "Security scan must pass before deployment"
   ```
3. Create PR and verify Pack A runs first
4. Verify Pack B queries Pack A's status
5. If Pack A fails, verify Pack B blocks

**Expected Results**:
- ✅ Pack A creates GitHub Check: "Security Scan"
- ✅ Pack B queries GitHub Check Runs API
- ✅ Pack B evaluates gate status fact correctly
- ✅ Cross-gate dependency enforced

---

### Scenario 5: Drift Facts (Track B Integration)
**Template**: Custom pack with drift facts  
**Objective**: Test drift fact integration with DriftCandidate table

**Test Facts**:
- `drift.has_high_priority` (boolean)
- `drift.instruction_count` (number)
- `drift.types` (array)

**Steps**:
1. Create drift candidate in database (simulate Track B detection)
2. Create policy pack that checks drift facts:
   ```yaml
   rules:
     - id: block-high-priority-drift
       name: Block PRs with High Priority Drift
       trigger:
         always: true
       obligations:
         - condition:
             fact: drift.has_high_priority
             operator: equals
             value: true
           severity: critical
           decisionOnFail: block
           message: "High priority drift detected - must be resolved first"
   ```
3. Create PR and verify drift facts are resolved
4. Verify GitHub Check blocks if high priority drift exists

**Expected Results**:
- ✅ Drift fact resolver queries DriftCandidate table
- ✅ Fact values populated correctly
- ✅ Condition evaluates based on drift data
- ✅ PR blocked if high priority drift exists

---

## 🎯 Test Matrix

| Scenario | Template | Mode | Facts | Expected Status | Priority |
|----------|----------|------|-------|----------------|----------|
| 1 | observe-core | OBSERVE | Comparator | PASS | P0 |
| 2 | breaking-change-docs | ENFORCE | Comparator | BLOCK→PASS | P0 |
| 3 | Custom | ENFORCE | Fact-based | WARN | P0 |
| 4 | deploy-gate | ENFORCE | Gate status | BLOCK | P1 |
| 5 | Custom | ENFORCE | Drift facts | BLOCK | P1 |
| 6 | security-focused | ENFORCE | Mixed | BLOCK | P1 |
| 7 | high-risk-file | ENFORCE | Glob patterns | BLOCK | P2 |
| 8 | dependency-update | OBSERVE | Comparator | PASS | P2 |

---

## 📊 Success Criteria

### Must Pass (P0):
- ✅ GitHub Check created for every PR
- ✅ Observe mode never blocks PRs
- ✅ Enforce mode blocks when rules fail
- ✅ Fact-based conditions evaluate correctly
- ✅ Comparator-based obligations work
- ✅ Check status updates on new commits

### Should Pass (P1):
- ✅ Gate status facts query GitHub API correctly
- ✅ Drift facts query database correctly
- ✅ Multi-pack evaluation works
- ✅ Merge strategies apply correctly
- ✅ Approval tiers enforce correctly

### Nice to Have (P2):
- ✅ Conflict detection shows warnings
- ✅ Effective policy view displays correctly
- ✅ Pack preview renders YAML
- ✅ Glob pattern tester works

---

## 🚀 Execution Plan

### Phase 1: Setup (15 minutes)
1. ✅ Verify workspace configuration
2. ✅ Verify GitHub integration
3. ✅ Create test policy packs
4. ✅ Configure pack scopes

### Phase 2: Basic Tests (30 minutes)
1. ✅ Run Scenario 1 (Observe mode)
2. ✅ Run Scenario 2 (Enforce mode)
3. ✅ Run Scenario 3 (Fact-based)

### Phase 3: Advanced Tests (45 minutes)
1. ✅ Run Scenario 4 (Gate status facts)
2. ✅ Run Scenario 5 (Drift facts)
3. ✅ Test multi-pack evaluation
4. ✅ Test merge strategies

### Phase 4: Validation (30 minutes)
1. ✅ Review all GitHub Checks
2. ✅ Verify database records
3. ✅ Check logs for errors
4. ✅ Document any issues

---

## 📝 Next Steps

After completing this test plan:
1. Document all findings
2. Create bug reports for any failures
3. Update templates based on learnings
4. Create user documentation
5. Plan for additional templates

---

**Total Estimated Time**: 2 hours  
**Prerequisites**: Railway deployed ✅, Vercel deployed ⏳, GitHub integration configured ✅

