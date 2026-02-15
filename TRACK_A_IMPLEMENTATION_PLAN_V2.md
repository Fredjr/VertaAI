# Track A Implementation Plan v2: Contract Integrity Gate

**Date:** 2026-02-15  
**Approach:** Option C (Hybrid) - Build Contract Validation as separate system  
**Timeline:** 6-8 weeks  
**Target:** Meet all architectural requirements for Track A vs Track B separation

---

## Executive Summary

**Goal:** Build Track A as a **Contract Integrity Gate** that validates contracts for ALL PRs touching contract surfaces, where agent-authorship is ONE risk signal among many.

**Key Principle:** Track A is a **decision engine** (PASS/WARN/BLOCK), Track B is a **remediation engine** (plan/patch/apply).

**Approach:** Keep existing Agent PR Gatekeeper running, build new Contract Integrity Gate in parallel, validate PMF, then decide whether to merge or keep separate.

---

## Part 1: Target Requirements Validation

### Track A: Contract Integrity Gate (PR Gatekeeper)

**Non-Negotiables:**

| Requirement | Target | Current State | Gap |
|-------------|--------|---------------|-----|
| **Synchronous** | < 30s total | Agent Gatekeeper: ✅ < 10s | Contract Validation: ❌ Not implemented |
| **Deterministic** | No LLM for pass/fail | Agent Gatekeeper: ✅ No LLM | Contract Validation: ✅ No LLM (comparators only) |
| **High Precision** | < 5% false positive rate | Agent Gatekeeper: ✅ Low FP | Contract Validation: ⚠️ Unknown (not tested) |
| **Inline UX** | GitHub Check Run | Agent Gatekeeper: ✅ Complete | Contract Validation: ❌ Not implemented |
| **Policy Enforcement** | Configurable warn→block | Agent Gatekeeper: ⚠️ Hard-coded thresholds | Contract Validation: ❌ No policy model |
| **Evidence Artifact** | Hashes/snapshots | Agent Gatekeeper: ✅ Evidence bundle | Contract Validation: ⚠️ Partial (findings only) |

**Typical Flow (Target):**

```
PR event 
  → Determine impacted contracts (OpenAPI, runbook, README, Confluence, dashboards)
  → Fetch baseline + candidate versions
  → Deterministic comparators produce IntegrityFindings
  → Risk score + policy evaluation
  → Create/update GitHub Check Run (PASS/WARN/BLOCK)
  → (Optional) Generate patch proposal via Track B
```

**Current Flow (Agent Gatekeeper):**

```
PR event
  → Detect if agent-authored
  → Check evidence requirements (rollback notes, migration notes)
  → Calculate risk tier (agent confidence + domains + missing evidence)
  → Create GitHub Check Run (PASS/INFO/WARN/BLOCK)
```

**Gap:** Current flow is **agent-centric**, not **contract-centric**.

---

### Track B: Drift Detector (Operational Truth Drift + Remediation)

**Non-Negotiables:**

| Requirement | Target | Current State | Status |
|-------------|--------|---------------|--------|
| **Async Pipeline** | Minutes ok | ✅ 18-state machine | ✅ MEETS |
| **High Recall** | Catch everything, cluster | ✅ Cluster-first triage | ✅ MEETS |
| **LLM Allowed** | For patch generation | ✅ Claude for patches only | ✅ MEETS |
| **Human Workflow** | Slack approvals, batching | ✅ Slack + approval workflow | ✅ MEETS |
| **Temporal Accumulation** | Bundle multiple drifts | ✅ Clustering + batching | ✅ MEETS |

**Status:** ✅ Track B is COMPLETE and meets all requirements.

---

## Part 2: The Core Architectural Distinction

### Decision vs Proposal (The Key Difference)

**Track A makes a DECISION:**
- Input: PR + file diff
- Output: PASS/WARN/BLOCK + evidence
- Characteristics: Fast, deterministic, high precision
- Failure mode: Safe (soft-fail to WARN if external systems down)

**Track B makes a PROPOSAL:**
- Input: Drift case / remediation plan
- Output: Patch proposal + approval workflow
- Characteristics: Async, high recall, LLM-assisted
- Failure mode: Can retry and backoff

**The Relationship:**
- Track A is the "stoplight" (prevents bad merges)
- Track B is the "repair crew" (fixes drift over time)
- Track A can spawn Track B (optional remediation)
- Track B patches can make Track A checks pass

---

## Part 3: Critical Gaps in Current Implementation

### Gap A: Agent-Centric vs Contract-Centric ⚠️ HIGH PRIORITY

**Current State:**
- Trigger: `shouldRunGatekeeper({ author })` - runs for all PRs except trusted bots
- Primary signal: Agent detection (author patterns, commit markers)
- Risk factors: Agent confidence (30%), domains (25%), missing evidence (45%)

**Target State:**
- Trigger: **"PR touches a contract surface"** (OpenAPI, Terraform, schema, runbooks, etc.)
- Primary signal: **Contract surface classification**
- Risk factors: Surface criticality + contract violations + missing obligations + agent confidence (optional modifier)

**Impact:** Current framing limits PMF to AI-heavy teams. Target framing opens to ANY team with contracts.

**Solution:** Build surface classifier as foundation for new Contract Integrity Gate.

---

### Gap B: Two Parallel Gating Engines ⚠️ HIGH PRIORITY

**Current State:**
- **Agent PR Gatekeeper** - Evidence checklist + risk scoring + GitHub Check (COMPLETE)
- **Contract Validation** - Comparators + IntegrityFindings (STUB)

**Target State:**
- **Single unified Contract Integrity Gate** with:
  - Surface classification
  - Contract resolution
  - Deterministic comparators (OpenAPI, Terraform, etc.)
  - Obligation enforcement (evidence, approvals, tests, release)
  - Risk scoring
  - GitHub Check Run

**Impact:** Two systems create confusion, duplicate code, inconsistent UX.

**Solution:** Build new unified system, run in parallel with old gatekeeper, migrate gradually.

---

### Gap C: No Unified Finding Model ⚠️ MEDIUM PRIORITY

**Current State:**
- `DeltaSyncFinding` (from Agent Gatekeeper) - Simple schema, no workspace/contract context
- `IntegrityFinding` (from Contract Validation) - Rich schema with contract/invariant context

**Target State:**
- Single `IntegrityFinding` schema with `source` field:
  - `source: 'contract_comparator'` - From OpenAPI/Terraform comparators
  - `source: 'obligation_policy'` - From evidence/approval checks
  - `source: 'risk_modifier'` - From agent detection, impact assessment

**Impact:** Cannot aggregate findings from both systems into single GitHub Check.

**Solution:** Extend IntegrityFinding schema, create adapter for DeltaSyncFinding.

---

### Gap D: No Policy Configuration ⚠️ HIGH PRIORITY

**Current State:**
- Hard-coded thresholds: 0.80 (BLOCK), 0.60 (WARN), 0.30 (INFO)
- No per-workspace customization
- No graceful degradation rules

**Target State:**
- `ContractPolicy` model with workspace-level defaults
- `ContractPack` model with per-surface configuration
- Policy modes: `warn-only`, `block-high-only`, `block-all-critical`
- Graceful degradation: If Confluence down → WARN (not BLOCK)

**Impact:** Cannot do gradual rollout, cannot handle external system failures safely.

**Solution:** Add ContractPolicy + ContractPack models with configurable thresholds.

---

### Gap E: No Soft-Fail Strategy ⚠️ CRITICAL

**Current State:**
- No timeout handling for external systems
- No fallback when Confluence/Grafana/Notion down
- Could block PRs incorrectly if external system unavailable

**Target State:**
- Timeout: 5s per external call, 30s total
- Fallback: WARN (not BLOCK) when external system down
- Circuit breaker: Disable external checks after 3 consecutive failures
- Cache: 1-hour TTL for external artifacts

**Impact:** External system failures could block PRs incorrectly → kills adoption.

**Solution:** Implement soft-fail strategy with timeouts, fallbacks, circuit breaker.

---

## Part 4: Implementation Plan (6-8 Weeks)

### Week 1-2: Foundation (Contract Surface Classification)

**Goal:** Build the foundation - surface classification that drives everything downstream.

**Tasks:**

1. **Create Surface Classifier** (2 days)
   - File: `apps/api/src/services/contractGate/surfaceClassifier.ts`
   - Implement 3 surfaces initially: API, Infra, Docs
   - Detection functions: `isApiSurface()`, `isInfraSurface()`, `isDocsSurface()`
   - Tests: 15+ test cases covering all patterns

2. **Wire Contract Resolution** (2 days)
   - Update `contractValidation.ts` to call `ContractResolver`
   - Map surfaces → contract packs
   - Handle resolution failures gracefully
   - Tests: 10+ test cases

3. **Wire Comparators + Artifact Fetching** (3 days)
   - Implement artifact fetching (GitHub files, Confluence pages)
   - Wire OpenAPI comparator
   - Wire Terraform comparator
   - Implement soft-fail strategy (timeouts, fallbacks)
   - Tests: 15+ test cases

4. **Performance Testing** (1 day)
   - Test with 100+ file PRs
   - Ensure < 30s latency
   - Optimize parallel execution

**Deliverables:**
- ✅ Surface classification working for 3 surfaces
- ✅ Contract resolution wired and tested
- ✅ Comparators running and generating IntegrityFindings
- ✅ < 30s latency for 100-file PRs
- ✅ Soft-fail working (external failures → WARN)

**Success Criteria:**
- All tests passing (40+ tests)
- < 30s p95 latency
- Zero false blocks in testing

---

### Week 3-4: GitHub Check Integration

**Goal:** Create GitHub Check Run from Contract Validation findings.

**Tasks:**

1. **Create GitHub Check Publisher** (2 days)
   - File: `apps/api/src/services/contractGate/githubCheck.ts`
   - Format IntegrityFindings into GitHub Check
   - Show contract packs triggered
   - Show surfaces touched
   - Show which obligations failed
   - Link to evidence bundles
   - Tests: 10+ test cases

2. **Unify Finding Model** (1 day)
   - Extend IntegrityFinding schema with `source` field
   - Create adapter: `DeltaSyncFinding → IntegrityFinding`
   - Update finding creation code
   - Tests: 8+ test cases

3. **Update Webhook Integration** (1 day)
   - Remove TODO comment (line 539 in webhooks.ts)
   - Call `createContractValidationCheck()`
   - Handle errors gracefully (don't fail webhook)
   - Tests: 5+ test cases

4. **End-to-End Testing** (2 days)
   - Test with real PRs (OpenAPI changes, Terraform changes, etc.)
   - Verify GitHub Check appears correctly
   - Verify findings are actionable
   - Verify soft-fail works (simulate Confluence down)

**Deliverables:**
- ✅ GitHub Check created for Contract Validation
- ✅ Findings formatted and actionable
- ✅ Unified finding model (DeltaSyncFinding + IntegrityFinding)
- ✅ Webhook integration complete

**Success Criteria:**
- GitHub Check appears on PRs
- Findings are clear and actionable
- Zero false blocks in testing
- Soft-fail working (external failures → WARN not BLOCK)

---

### Week 5-6: Configuration & Beta Deployment

**Goal:** Add policy configuration and deploy to beta workspaces.

**Tasks:**

1. **Add ContractPolicy Model** (1 day)
   - Prisma schema: `ContractPolicy` model
   - Fields: `mode` (warn-only, block-high-only, block-all-critical), `thresholds`, `gracefulDegradation`
   - Migration
   - Tests: 5+ test cases

2. **Add ContractPack Model (Backend Only)** (2 days)
   - Prisma schema: `ContractPack` model
   - Fields: `name`, `surfaces`, `filePatterns`, `requiredArtifacts`, `comparators`, `obligations`, `thresholds`
   - CRUD API endpoints
   - Seed data: 2 packs (PublicAPI, PrivilegedInfra)
   - Tests: 10+ test cases

3. **Wire Policy Enforcement** (2 days)
   - Update risk scorer to use ContractPolicy thresholds
   - Update decision engine to respect policy mode
   - Update GitHub Check to show policy mode
   - Tests: 8+ test cases

4. **Beta Deployment** (1 day)
   - Deploy to production
   - Enable for 10% of workspaces (feature flag: `ENABLE_CONTRACT_INTEGRITY_GATE_BETA`)
   - Monitor: latency, error rate, false positive rate
   - Set up alerts

**Deliverables:**
- ✅ ContractPolicy model with configurable thresholds
- ✅ ContractPack model with 2 starter packs
- ✅ Policy enforcement working
- ✅ Beta deployed to 10% of workspaces

**Success Criteria:**
- < 5% false positive rate
- < 30s p95 latency
- Zero production incidents
- Beta users can configure policy mode

---

### Week 7-8: Feedback, Iteration & Decision

**Goal:** Gather customer feedback, fix issues, decide next steps.

**Tasks:**

1. **Monitor Beta Users** (2 days)
   - Track adoption rate (% of PRs checked)
   - Track false positive rate
   - Track latency (p50, p95, p99)
   - Track customer feedback (surveys, support tickets)

2. **Fix Issues** (3 days)
   - Address bugs reported by beta users
   - Optimize performance if needed
   - Improve error messages
   - Update documentation

3. **Gather Customer Feedback** (1 day)
   - Conduct user interviews (5-10 beta users)
   - Send surveys
   - Analyze usage data

4. **Decision Point** (2 days)
   - Review metrics and feedback
   - Decide next steps:
     - **If adoption > 50%:** Expand to more surfaces/packs, roll out to 100%
     - **If adoption 20-50%:** Iterate on UX, add more contract packs
     - **If adoption < 20%:** Pause and reassess PMF
     - **If both gatekeeper + contract validation valuable:** Plan merge (Option B)

**Deliverables:**
- ✅ Customer feedback collected
- ✅ Issues fixed
- ✅ Decision made on next steps
- ✅ Roadmap updated

**Success Criteria:**
- Adoption rate measured
- Customer feedback analyzed
- Clear decision on next steps

---

## Part 5: Detailed Technical Specifications

### 5.1 Surface Classification

**File:** `apps/api/src/services/contractGate/surfaceClassifier.ts`

**Interface:**

```typescript
export type Surface = 'api' | 'infra' | 'data_model' | 'observability' | 'security' | 'docs';

export interface SurfaceClassification {
  surfaces: Surface[];
  filesBySurface: Record<Surface, string[]>;
  confidence: number;
}

export function classifySurfaceAreas(
  files: Array<{ filename: string }>
): SurfaceClassification;
```

**Detection Rules:**

```typescript
function isApiSurface(filename: string): boolean {
  return /openapi\.(yaml|yml|json)/i.test(filename) ||
         /swagger\.(yaml|yml|json)/i.test(filename) ||
         /controllers|routes|api/i.test(filename) ||
         /\.proto$/i.test(filename) ||
         /graphql|schema\.graphql/i.test(filename);
}

function isInfraSurface(filename: string): boolean {
  return /terraform|\.tf$/i.test(filename) ||
         /cloudformation|\.cfn\./i.test(filename) ||
         /kubernetes|k8s|\.yaml$/i.test(filename) ||
         /helm|charts/i.test(filename) ||
         /ansible|playbook/i.test(filename);
}

function isDocsSurface(filename: string): boolean {
  return /README|CHANGELOG|docs\//i.test(filename) ||
         /\.md$/i.test(filename);
}
```

**Tests:**

```typescript
describe('Surface Classification', () => {
  it('should detect API surface from OpenAPI file', () => {
    const result = classifySurfaceAreas([{ filename: 'openapi/openapi.yaml' }]);
    expect(result.surfaces).toContain('api');
  });

  it('should detect Infra surface from Terraform file', () => {
    const result = classifySurfaceAreas([{ filename: 'terraform/main.tf' }]);
    expect(result.surfaces).toContain('infra');
  });

  it('should detect multiple surfaces', () => {
    const result = classifySurfaceAreas([
      { filename: 'openapi/openapi.yaml' },
      { filename: 'terraform/main.tf' },
    ]);
    expect(result.surfaces).toContain('api');
    expect(result.surfaces).toContain('infra');
  });

  it('should handle files that match no surfaces', () => {
    const result = classifySurfaceAreas([{ filename: 'src/utils/helper.ts' }]);
    expect(result.surfaces).toHaveLength(0);
  });
});
```

---

### 5.2 Unified Finding Model

**Schema Extension:**

```typescript
export interface IntegrityFinding {
  // Core identity
  workspaceId: string;
  id: string;

  // Source (NEW FIELD)
  source: 'contract_comparator' | 'obligation_policy' | 'risk_modifier';

  // Contract context (optional - only for contract_comparator)
  contractId?: string;
  invariantId?: string;

  // Classification
  driftType: string;
  domains: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';

  // Evidence
  compared?: Json;  // For contract comparators
  evidence: Json;
  confidence: number;
  impact: number;

  // Routing
  band: 'pass' | 'warn' | 'fail';
  recommendedAction: string;
  ownerRouting: Json;

  // Links
  driftCandidateId?: string;
  affectedFiles: string[];
  suggestedDocs: string[];

  createdAt: DateTime;
}
```

**Adapter:**

```typescript
export function adaptDeltaSyncFinding(
  finding: DeltaSyncFinding,
  context: {
    workspaceId: string;
    prId: number;
    sha: string;
  }
): IntegrityFinding {
  return {
    workspaceId: context.workspaceId,
    id: uuidv4(),
    source: 'contract_comparator',
    driftType: finding.type,
    domains: [],
    severity: finding.severity,
    evidence: finding.evidence,
    confidence: 1.0,  // DeltaSyncFindings are deterministic
    impact: severityToImpact(finding.severity),
    band: severityToBand(finding.severity),
    recommendedAction: finding.message,
    ownerRouting: {},
    affectedFiles: finding.path ? [finding.path] : [],
    suggestedDocs: [],
    createdAt: new Date(),
  };
}
```

---

### 5.3 Soft-Fail Strategy

**Implementation:**

```typescript
export async function fetchArtifactWithSoftFail<T>(
  fetcher: () => Promise<T>,
  options: {
    timeout: number;  // milliseconds
    fallback: T | null;
    onError: (error: Error) => void;
  }
): Promise<{ data: T | null; failed: boolean; reason?: string }> {
  try {
    const data = await Promise.race([
      fetcher(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), options.timeout)
      ),
    ]);

    return { data, failed: false };
  } catch (error) {
    options.onError(error as Error);

    return {
      data: options.fallback,
      failed: true,
      reason: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

**Usage:**

```typescript
const confluenceResult = await fetchArtifactWithSoftFail(
  () => fetchConfluencePage(pageId),
  {
    timeout: 5000,  // 5s timeout
    fallback: null,
    onError: (error) => {
      console.warn(`[ContractGate] Confluence fetch failed: ${error.message}`);
      // Increment circuit breaker counter
    },
  }
);

if (confluenceResult.failed) {
  // Add WARN finding instead of BLOCK
  findings.push({
    source: 'obligation_policy',
    driftType: 'external_system_unavailable',
    severity: 'medium',
    band: 'warn',
    message: `Unable to validate Confluence page: ${confluenceResult.reason}`,
    recommendedAction: 'Verify Confluence is accessible and retry',
  });
}
```

---

### 5.4 GitHub Check Format

**Check Run Output:**

```typescript
export async function createContractValidationCheck(input: {
  owner: string;
  repo: string;
  headSha: string;
  installationId: number;
  surfaces: Surface[];
  contractsChecked: number;
  findings: IntegrityFinding[];
  decision: 'PASS' | 'WARN' | 'BLOCK';
  policyMode: 'warn-only' | 'block-high-only' | 'block-all-critical';
}): Promise<void> {
  const octokit = await getInstallationOctokit(input.installationId);

  const conclusion = decisionToConclusion(input.decision, input.policyMode);
  const title = formatTitle(input.decision, input.surfaces);
  const summary = formatSummary(input);
  const text = formatDetails(input);
  const annotations = formatAnnotations(input.findings);

  await octokit.rest.checks.create({
    owner: input.owner,
    repo: input.repo,
    name: 'VertaAI Contract Integrity Gate',
    head_sha: input.headSha,
    status: 'completed',
    conclusion,
    output: {
      title,
      summary,
      text,
      annotations: annotations.length > 0 ? annotations : undefined,
    },
  });
}

function formatSummary(input: {
  surfaces: Surface[];
  contractsChecked: number;
  findings: IntegrityFinding[];
  decision: string;
  policyMode: string;
}): string {
  const criticalCount = input.findings.filter(f => f.severity === 'critical').length;
  const highCount = input.findings.filter(f => f.severity === 'high').length;
  const mediumCount = input.findings.filter(f => f.severity === 'medium').length;
  const lowCount = input.findings.filter(f => f.severity === 'low').length;

  return `
## Contract Integrity Check: ${input.decision}

**Surfaces Touched:** ${input.surfaces.join(', ')}
**Contracts Checked:** ${input.contractsChecked}
**Policy Mode:** ${input.policyMode}

### Findings Summary
- 🔴 Critical: ${criticalCount}
- 🟠 High: ${highCount}
- 🟡 Medium: ${mediumCount}
- 🟢 Low: ${lowCount}

${input.decision === 'BLOCK' ? '⛔ **This PR is blocked due to contract violations.**' : ''}
${input.decision === 'WARN' ? '⚠️ **This PR has warnings. Review before merging.**' : ''}
${input.decision === 'PASS' ? '✅ **All contract checks passed.**' : ''}
  `.trim();
}
```

---

## Part 6: Success Metrics

### Week 2 Metrics (Foundation Complete)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Surface classification accuracy | > 95% | Manual review of 100 PRs |
| Contract resolution accuracy | > 90% | Manual review of 50 PRs |
| Comparator execution time | < 5s per comparator | Performance logs |
| Total latency (p95) | < 30s | Performance logs |
| Test coverage | > 80% | Jest coverage report |

### Week 4 Metrics (GitHub Check Complete)

| Metric | Target | Measurement |
|--------|--------|-------------|
| GitHub Check creation success rate | > 99% | Error logs |
| False positive rate | < 5% | User feedback + manual review |
| False negative rate | < 10% | Manual review of missed violations |
| Soft-fail working | 100% | Simulate external system failures |

### Week 6 Metrics (Beta Deployed)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Adoption rate | > 20% | % of PRs checked |
| False positive rate | < 5% | User feedback |
| Latency (p95) | < 30s | Performance logs |
| Error rate | < 1% | Error logs |
| Customer satisfaction | > 7/10 | Surveys |

### Week 8 Metrics (Decision Point)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Adoption rate | > 50% for expansion | % of PRs checked |
| Contract violations caught | > 10 per week | Finding logs |
| False blocks | 0 | User reports |
| Customer NPS | > 30 | Surveys |

---

## Part 7: Risk Mitigation

### Risk 1: Breaking Existing Agent PR Gatekeeper

**Mitigation:**
- ✅ Build Contract Integrity Gate as NEW service (separate directory)
- ✅ Run both in parallel (separate feature flags)
- ✅ Don't modify existing gatekeeper code
- ✅ Rollback plan: Disable new gate, keep old gatekeeper

### Risk 2: Performance Regression

**Mitigation:**
- ✅ Parallel execution (surface classification + contract resolution + artifact fetching)
- ✅ Caching (artifact snapshots: 1-hour TTL)
- ✅ Timeouts (5s per external call, 30s total)
- ✅ Performance testing (100+ file PRs)

### Risk 3: External System Failures Block PRs

**Mitigation:**
- ✅ Soft-fail strategy (WARN instead of BLOCK)
- ✅ Timeouts (5s per call)
- ✅ Circuit breaker (disable after 3 failures)
- ✅ Fallback to local artifacts only

### Risk 4: Low Adoption

**Mitigation:**
- ✅ Start with warn-only mode (no blocking)
- ✅ Clear, actionable findings
- ✅ "Fix it" button → spawns Track B remediation
- ✅ Starter packs (PublicAPI, PrivilegedInfra)

### Risk 5: Scope Creep

**Mitigation:**
- ✅ MVP: 3 surfaces (API, Infra, Docs), 2 packs
- ✅ Incremental expansion based on feedback
- ✅ Kill criteria: < 20% adoption after 4 weeks → pause

---

## Part 8: Next Steps

### Immediate Actions (This Week)

1. ✅ Review this plan with team
2. ✅ Get approval for Option C (Hybrid Approach)
3. ✅ Set up project tracking (GitHub Project or Linear)
4. ✅ Assign engineer(s) to Week 1-2 tasks

### Week 1 Kickoff

1. Create `apps/api/src/services/contractGate/` directory
2. Implement surface classifier
3. Wire contract resolution
4. Wire comparators
5. Daily standups to track progress

### Decision Points

**Week 2:** Foundation complete? If yes → proceed to Week 3-4. If no → extend 1 week.

**Week 4:** GitHub Check working? If yes → proceed to Week 5-6. If no → extend 1 week.

**Week 6:** Beta deployed successfully? If yes → proceed to Week 7-8. If no → fix issues first.

**Week 8:** Adoption > 20%? If yes → expand. If no → pause and reassess.

---

## Conclusion

This plan addresses all target requirements for Track A vs Track B separation:

✅ **Synchronous** - < 30s latency target
✅ **Deterministic** - No LLM for pass/fail decisions
✅ **High Precision** - < 5% false positive rate target
✅ **Inline UX** - GitHub Check Run integration
✅ **Policy Enforcement** - Configurable warn→block modes
✅ **Evidence Artifact** - Hashes/snapshots stored
✅ **Contract-Centric** - Triggers on contract surfaces, not just agent detection
✅ **Soft-Fail Strategy** - External failures → WARN not BLOCK
✅ **Incremental Delivery** - 6-8 weeks, validate PMF before full commitment

**Ready to proceed with Week 1-2 implementation?**
