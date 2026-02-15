# Week 3-4 Plan: GitHub Check Integration

**Goal:** Create GitHub Check Run from Contract Validation findings and integrate with webhook flow.

**Timeline:** 4-6 days  
**Approach:** Incremental delivery with continuous testing

---

## 📋 Overview

### Current State (Week 1-2 Complete)
- ✅ Surface Classifier working
- ✅ Mock Contract Generator creating contracts
- ✅ Artifact Fetcher integrated
- ✅ Comparators wired (OpenAPI + Terraform)
- ✅ 31/31 tests passing

### Target State (Week 3-4)
- ✅ GitHub Check created for contract validation
- ✅ IntegrityFinding model unified with source field
- ✅ Webhook integration calling contract validation
- ✅ End-to-end flow working

---

## 🎯 Tasks Breakdown

### Task 1: Create GitHub Check Publisher (2 days)

**Goal:** Format IntegrityFindings into GitHub Check Run

**File to create:** `apps/api/src/services/contractGate/githubCheck.ts`

**Reference:** Existing `apps/api/src/services/gatekeeper/githubCheck.ts` (Agent PR Gatekeeper)

**Key Differences:**
- **Agent Gatekeeper**: Shows risk tier, agent detection, evidence requirements
- **Contract Gate**: Shows contract violations, surfaces touched, findings

**Interface:**
```typescript
export interface ContractCheckInput {
  owner: string;
  repo: string;
  headSha: string;
  installationId: number;
  
  // Contract validation results
  band: 'pass' | 'warn' | 'fail';
  findings: IntegrityFinding[];
  contractsChecked: number;
  surfacesTouched: string[];
  duration: number;
  
  // Optional context
  signalEventId: string;
  workspaceId: string;
}
```

**Output Format:**
- **Title**: "✅ Contract Validation Passed" / "⚠️ Contract Violations Found" / "🛑 Critical Contract Violations"
- **Summary**: Surfaces touched, contracts checked, findings count
- **Details**: 
  - Surfaces touched section
  - Contracts checked section
  - Findings by severity
  - Evidence links
- **Annotations**: File-level annotations for findings

**Tests:** 10+ test cases
- Should create PASS check when no findings
- Should create WARN check when medium findings
- Should create FAIL check when critical findings
- Should format surfaces correctly
- Should format findings correctly
- Should create annotations for findings
- Should handle empty findings
- Should handle multiple surfaces
- Should handle missing optional fields
- Should format duration correctly

---

### Task 2: Unify Finding Model (1 day)

**Goal:** Extend IntegrityFinding with `source` field to distinguish contract findings from other findings

**Current IntegrityFinding** (from `apps/api/src/services/contracts/types.ts`):
```typescript
export interface IntegrityFinding {
  workspaceId: string;
  id: string;
  contractId: string;
  invariantId: string;
  driftType: DriftType;
  domains: string[];
  severity: Severity;
  compared: ComparedArtifacts;
  evidence: EvidenceItem[];
  confidence: number;
  impact: number;
  band: Band;
  recommendedAction: RecommendedAction;
  ownerRouting: OwnerRouting;
  driftCandidateId?: string;
  createdAt: Date;
}
```

**Updated IntegrityFinding** (add source field):
```typescript
export interface IntegrityFinding {
  workspaceId: string;
  id: string;
  
  // NEW: Source field
  source: 'contract_comparator' | 'obligation_policy' | 'risk_modifier';
  
  // Make these optional (only for contract_comparator)
  contractId?: string;
  invariantId?: string;
  
  driftType: DriftType;
  domains: string[];
  severity: Severity;
  compared?: ComparedArtifacts; // Optional (only for contract_comparator)
  evidence: EvidenceItem[];
  confidence: number;
  impact: number;
  band: Band;
  recommendedAction: RecommendedAction;
  ownerRouting: OwnerRouting;
  driftCandidateId?: string;
  createdAt: Date;
}
```

**Changes needed:**
1. Update `apps/api/src/services/contracts/types.ts`
2. Update `apps/api/src/services/contracts/comparators/base.ts` (add source field)
3. Update `apps/api/src/services/contracts/findingRepository.ts` (handle optional fields)
4. Update all comparators to set `source: 'contract_comparator'`
5. Update tests

**Tests:** 8+ test cases

---

### Task 3: Update Webhook Integration (1 day)

**Goal:** Call contract validation from webhook handler

**File to update:** `apps/api/src/routes/webhooks.ts`

**Current flow** (line 481-508):
```typescript
if (isFeatureEnabled('ENABLE_AGENT_PR_GATEKEEPER', workspaceId) && !prInfo.merged) {
  if (shouldRunGatekeeper({ author: prInfo.authorLogin, labels })) {
    const gatekeeperResult = await runGatekeeper({...});
    // Creates GitHub Check
  }
}
```

**New flow** (add contract validation):
```typescript
// Run Agent PR Gatekeeper (existing)
if (isFeatureEnabled('ENABLE_AGENT_PR_GATEKEEPER', workspaceId) && !prInfo.merged) {
  // ... existing code ...
}

// Run Contract Validation (NEW)
if (isFeatureEnabled('ENABLE_CONTRACT_GATE', workspaceId) && !prInfo.merged) {
  try {
    const contractResult = await runContractValidation({
      workspaceId,
      signalEventId: signalEvent.id,
      changedFiles: files,
      service: inferredService,
      repo: prInfo.repoFullName,
    });
    
    await createContractValidationCheck({
      owner: prInfo.repoOwner,
      repo: prInfo.repoName,
      headSha: payload.pull_request.head.sha,
      installationId: prInfo.installationId,
      ...contractResult,
      signalEventId: signalEvent.id,
      workspaceId,
    });
  } catch (error) {
    console.error('[Webhook] Contract validation failed (soft-fail):', error);
    // Don't fail webhook - continue processing
  }
}
```

**Tests:** 5+ test cases

---

### Task 4: End-to-End Testing (2 days)

**Goal:** Test the full flow with real-world scenarios

**Test Scenarios:**
1. PR with OpenAPI changes → Contract validation runs → GitHub Check created
2. PR with Terraform changes → Contract validation runs → GitHub Check created
3. PR with no contract surfaces → Early exit → PASS check
4. PR with multiple surfaces → Multiple contracts checked → Findings aggregated
5. Contract validation timeout → Soft-fail → PASS check
6. Artifact fetching failure → Soft-fail → PASS check

**Manual Testing:**
- Create test PRs in a test repository
- Verify GitHub Checks appear correctly
- Verify findings are actionable
- Verify performance (< 30s)

---

## 🏗️ Implementation Order

1. **Day 1-2**: Task 1 - GitHub Check Publisher
   - Create `githubCheck.ts`
   - Write tests
   - Verify formatting

2. **Day 3**: Task 2 - Unify Finding Model
   - Update types
   - Update comparators
   - Update tests

3. **Day 4**: Task 3 - Webhook Integration
   - Update webhook handler
   - Add feature flag
   - Write tests

4. **Day 5-6**: Task 4 - End-to-End Testing
   - Manual testing
   - Performance testing
   - Bug fixes

---

## ✅ Success Criteria

- [ ] GitHub Check created for all PRs touching contract surfaces
- [ ] Check shows correct status (PASS/WARN/FAIL)
- [ ] Findings are formatted clearly
- [ ] Annotations point to correct files
- [ ] Performance < 30s for typical PRs
- [ ] Soft-fail strategy works (doesn't block webhook)
- [ ] All tests passing (40+ tests total)
- [ ] No regression in existing functionality

