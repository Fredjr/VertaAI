# 🚨 Critical Action Items - Track A Implementation

**Date:** 2026-02-15  
**Priority:** URGENT  
**Status:** Track A is deployed but NOT FUNCTIONAL

---

## Executive Summary

**The Contract Integrity Gate (Track A) is currently deployed to all users but is NOT performing validation.**

The feature flag `ENABLE_CONTRACT_VALIDATION: true` is enabled, but the validation logic is a stub that always returns PASS. This creates a false sense of security.

---

## Critical Issues (Must Fix Before Production)

### Issue #1: Contract Validation is a Stub ❌ BLOCKER

**Severity:** CRITICAL  
**Impact:** Feature is deployed but doesn't work  
**Location:** `apps/api/src/services/contracts/contractValidation.ts` lines 63-68

**Current Code:**
```typescript
export async function runContractValidation(input): Promise<ContractValidationResult> {
  const startTime = Date.now();

  // TODO: Step 1: Resolve applicable contracts
  // TODO: Step 2: Fetch artifact snapshots
  // TODO: Step 3: Run comparators
  // For now, return early with PASS status
  console.log(`[ContractValidation] Returning PASS status (no validation performed)`);

  const allFindings: IntegrityFinding[] = [];
  const riskTier = calculateRiskTier(allFindings);
  
  return { ...riskTier, findings: allFindings, contractsChecked: 0, duration };
}
```

**Missing Implementation:**
1. Step 1: Resolve applicable contracts (from ContractPack)
2. Step 2: Fetch artifact snapshots (baseline vs candidate)
3. Step 3: Run comparators (OpenAPI, Terraform, etc.)

**Action Required:**
- **Option A:** Implement Steps 1-3 (Week 1-2 tasks from TRACK_A_IMPLEMENTATION_PLAN_V2.md)
- **Option B:** Disable feature flag until implementation complete

**Recommendation:** **Option B (disable flag) - safer**

```typescript
// apps/api/src/config/featureFlags.ts
export const FEATURE_FLAGS = {
  // ...
  ENABLE_CONTRACT_VALIDATION: false,  // Disable until Steps 1-3 implemented
} as const;
```

---

### Issue #2: No Timeout Enforcement ⚠️ HIGH PRIORITY

**Severity:** HIGH  
**Impact:** Could block webhook > 30s, causing GitHub retries  
**Location:** `apps/api/src/routes/webhooks.ts` line 527

**Current Code:**
```typescript
const validationResult = await runContractValidation({...});
```

**Problem:** No timeout wrapper - if validation takes > 30s, GitHub will retry webhook

**Action Required:** Add timeout enforcement

**Recommended Fix:**
```typescript
const TRACK_A_TIMEOUT_MS = 25000; // 25s (leave 5s buffer for GitHub)

const validationPromise = runContractValidation({
  workspaceId,
  signalEventId,
  changedFiles: files,
  service: inferredService,
  repo: prInfo.repoFullName,
});

const timeoutPromise = new Promise((_, reject) => 
  setTimeout(() => reject(new Error('Contract validation timeout')), TRACK_A_TIMEOUT_MS)
);

try {
  const validationResult = await Promise.race([validationPromise, timeoutPromise]);
  
  console.log(`[Webhook] [V2] Contract validation result: ${validationResult.band}`);
  
  // Create GitHub Check
  if (prInfo.installationId) {
    await createContractValidationCheck({...});
  }
} catch (error: any) {
  if (error.message === 'Contract validation timeout') {
    console.error('[Webhook] [V2] Contract validation timeout - soft-failing to WARN');
    
    // Soft-fail to WARN on timeout
    if (prInfo.installationId) {
      await createContractValidationCheck({
        owner: prInfo.repoOwner,
        repo: prInfo.repoName,
        headSha: payload.pull_request.head.sha,
        installationId: prInfo.installationId,
        band: 'warn',
        findings: [],
        contractsChecked: 0,
        duration: TRACK_A_TIMEOUT_MS,
        signalEventId,
        workspaceId,
        policyMode: 'warn_only',
      });
    }
  } else {
    console.error('[Webhook] [V2] Contract validation failed:', error.message);
  }
}
```

---

### Issue #3: Two Parallel Gating Systems ⚠️ MEDIUM PRIORITY

**Severity:** MEDIUM  
**Impact:** Confusing UX, duplicate GitHub Checks  
**Location:** `apps/api/src/routes/webhooks.ts` lines 477-575

**Current State:**
- **Agent PR Gatekeeper** (lines 477-516) - Creates "VertaAI Agent PR Gatekeeper" check
- **Contract Validation** (lines 519-575) - Creates "VertaAI Contract Integrity Gate" check

**Problem:** Two separate checks for same PR

**User Experience:**
```
PR #123 Checks:
✅ VertaAI Agent PR Gatekeeper - PASS
⚠️ VertaAI Contract Integrity Gate - WARN

Which one should I trust?
```

**Action Required:** Unify into single system

**Recommended Approach:**
1. Keep both running in parallel for 2 weeks (gradual migration)
2. Add deprecation notice to Agent Gatekeeper check
3. Migrate agent detection into Contract Integrity Gate as optional modifier
4. Disable Agent Gatekeeper feature flag

**Implementation:**
```typescript
// Step 1: Add agent detection to Contract Validation
export async function runContractValidation(input): Promise<ContractValidationResult> {
  // ... existing validation logic ...
  
  // Optional: Add agent detection as risk modifier
  const agentDetection = detectAgentAuthoredPR({
    author: input.author,
    commits: input.commits,
    files: input.files,
  });
  
  if (agentDetection.isAgentAuthored) {
    // Increase risk score by agent confidence
    riskTier.score += agentDetection.confidence * 0.1;
  }
  
  return { ...riskTier, agentDetected: agentDetection.isAgentAuthored };
}

// Step 2: Disable Agent Gatekeeper after 2 weeks
// apps/api/src/config/featureFlags.ts
export const FEATURE_FLAGS = {
  ENABLE_AGENT_PR_GATEKEEPER: false,  // Deprecated - merged into Contract Validation
  ENABLE_CONTRACT_VALIDATION: true,
} as const;
```

---

## High Priority Issues (Should Fix Soon)

### Issue #4: No Performance Metrics ⚠️ MEDIUM

**Severity:** MEDIUM  
**Impact:** Can't verify < 30s requirement  
**Location:** Track A has no metrics collection

**Action Required:** Add metrics

**Recommended Implementation:**
```typescript
// apps/api/src/services/contracts/metrics.ts
export interface ContractValidationMetrics {
  workspaceId: string;
  signalEventId: string;
  duration: number;
  band: 'pass' | 'warn' | 'fail';
  findingsCount: number;
  contractsChecked: number;
  errorOccurred: boolean;
  errorMessage?: string;
  timestamp: Date;
}

export async function logContractValidationMetrics(metrics: ContractValidationMetrics): Promise<void> {
  // Log to console
  console.log(`[Metrics] Contract validation: ${metrics.duration}ms, band=${metrics.band}, findings=${metrics.findingsCount}`);
  
  // TODO: Store in database for analytics
  // await prisma.contractValidationMetrics.create({ data: metrics });
}
```

---

### Issue #5: No Evidence Hashes ⚠️ LOW

**Severity:** LOW  
**Impact:** Can't reproduce validation results  
**Location:** IntegrityFinding model

**Action Required:** Add artifact hashes

**Recommended Implementation:**
```typescript
// Add to IntegrityFinding
export interface IntegrityFinding {
  // ... existing fields ...
  
  // NEW: Evidence artifacts
  baselineHash?: string;      // SHA-256 of baseline artifact
  candidateHash?: string;     // SHA-256 of candidate artifact
  artifactUrl?: string;       // URL to artifact (GitHub, S3, etc.)
}
```

---

## Immediate Action Plan

### Step 1: Disable Feature Flag (5 minutes) ⚠️ URGENT

```bash
# Edit apps/api/src/config/featureFlags.ts
# Change ENABLE_CONTRACT_VALIDATION from true to false
# Commit and deploy
```

**Rationale:** Feature is deployed but doesn't work - creates false sense of security

### Step 2: Implement Contract Validation Steps 1-3 (3-5 days)

Follow Week 1-2 tasks from `TRACK_A_IMPLEMENTATION_PLAN_V2.md`:
1. Surface classification (already done)
2. Contract resolution (TODO)
3. Artifact fetching (TODO)
4. Comparator execution (partially done)

### Step 3: Add Timeout Enforcement (1 hour)

Wrap `runContractValidation()` in Promise.race() with 25s timeout

### Step 4: Add Performance Metrics (2 hours)

Track latency, error rate, false positive rate

### Step 5: Re-enable Feature Flag (after Steps 2-4 complete)

```bash
# Edit apps/api/src/config/featureFlags.ts
# Change ENABLE_CONTRACT_VALIDATION from false to true
# Commit and deploy
```

---

## Testing Checklist

Before re-enabling feature flag:

- [ ] Contract resolution works (resolves contracts from ContractPack)
- [ ] Artifact fetching works (fetches baseline + candidate)
- [ ] Comparators execute (OpenAPI, Terraform, etc.)
- [ ] Timeout enforcement works (soft-fails to WARN after 25s)
- [ ] Performance metrics logged
- [ ] All 86 tests passing
- [ ] Manual testing with real PR
- [ ] Latency < 30s verified

---

## Summary

**Current Status:**
- ✅ Track B (Drift Detection) - FULLY FUNCTIONAL
- ❌ Track A (Contract Validation) - DEPLOYED BUT NOT FUNCTIONAL

**Critical Actions:**
1. **URGENT:** Disable `ENABLE_CONTRACT_VALIDATION` feature flag
2. **HIGH:** Implement contract validation Steps 1-3
3. **HIGH:** Add timeout enforcement
4. **MEDIUM:** Add performance metrics
5. **MEDIUM:** Unify gating systems

**Timeline:**
- Immediate (today): Disable feature flag
- Week 1: Implement Steps 1-3
- Week 2: Add timeout + metrics
- Week 3: Re-enable feature flag + monitor

---

**END OF ACTION ITEMS**

