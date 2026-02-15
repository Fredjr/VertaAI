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

---

# Part 9: Configuration Architecture

## 9.1 `contractpacks.yaml` Configuration Schema

**Purpose:** Multi-repo/team configuration that drives Track A execution

**Top-Level Structure:**

```yaml
version: 1

# Organization-level defaults
org:
  name: "acme"
  default_mode: "warn"  # warn | block-high | block-all
  grace:
    external_fetch_failure: "warn"  # warn | block | skip
    timeout_seconds: 5
  evidence:
    storage: "s3"
    bucket: "vertai-evidence-bundles"
    retention_days: 90

# Repository-specific configuration
repos:
  - repo: "acme/payments-service"
    mode: "block-high"  # Override org default

    # Exclusions
    config:
      exclusions:
        branches: ["experimental/*", "sandbox/*"]
        paths: ["docs/drafts/**", "*.md"]
        authors: ["dependabot[bot]"]

    # Surface classification rules
    surfaces:
      matchers:
        - id: "api_openapi_files"
          surface: "api_contract"
          patterns:
            - "openapi/**/*.yaml"
            - "openapi/**/*.json"
            - "src/controllers/**/*.ts"
            - "src/routes/**/*.ts"

        - id: "terraform_iam"
          surface: "privileged_infra"
          patterns:
            - "terraform/**/*.tf"
            - "infrastructure/iam/**"

        - id: "db_migrations"
          surface: "data_contract"
          patterns:
            - "prisma/migrations/**"
            - "db/migrations/**"

        - id: "security_boundary"
          surface: "security_boundary"
          patterns:
            - "src/middleware/auth/**"
            - "src/services/permissions/**"

        - id: "observability"
          surface: "observability_contract"
          patterns:
            - "monitoring/alerts/**"
            - "dashboards/**/*.json"

    # ContractPack activation
    contractpacks:
      enabled:
        - "PublicAPI"
        - "PrivilegedInfra"
        - "DataMigration"

      # Pack-specific overrides
      overrides:
        PublicAPI:
          mode: "block-all"  # Stricter for public API
        PrivilegedInfra:
          grace:
            confluence_unavailable: "warn"  # Don't block on Confluence down

    # Policy thresholds
    policy:
      risk_score:
        warn_threshold: 50
        block_threshold: 80

      severity_mapping:
        critical: "block"
        high: "block"
        medium: "warn"
        low: "pass"

      approval_groups:
        api_owners: ["@acme/api-team"]
        security_reviewers: ["@acme/security"]
        infra_owners: ["@acme/platform"]

  - repo: "acme/internal-tools"
    mode: "warn"  # More lenient for internal tools
    contractpacks:
      enabled: ["PublicAPI"]
```

**Key Design Principles:**
- **Org-level defaults** with **repo-level overrides**
- **Explicit surface matchers** (customers define their repo structure)
- **Pack activation** (not all packs run on all repos)
- **Graceful degradation** (external system failures don't block by default)
- **Policy thresholds** (configurable warn/block boundaries)

---

## 9.2 ContractPack Definition Schema

**Purpose:** Define what checks run when a surface is touched

**ContractPack Structure:**

```yaml
contractpacks_definitions:
  - name: "PublicAPI"
    description: "Ensures public API changes maintain contract integrity"
    version: "1.0"

    # When does this pack activate?
    activation:
      any_surfaces: ["api_contract"]
      min_confidence: 0.7

    # What artifacts are needed?
    artifacts:
      required:
        - id: "openapi_spec"
          type: "github_file"
          path: "openapi/openapi.yaml"
          base_ref: true  # Fetch both base and head

        - id: "changelog"
          type: "github_file"
          path: "CHANGELOG.md"

        - id: "readme"
          type: "github_file"
          path: "README.md"

      optional:
        - id: "confluence_api_page"
          type: "confluence_page"
          space: "ENG"
          page_id: "123456789"
          timeout_seconds: 3

    # What comparisons to run?
    comparators:
      - id: "openapi_validate"
        type: "openapi.validate"
        inputs: ["openapi_spec"]
        severity: "critical"
        params:
          strict_mode: true

      - id: "openapi_diff"
        type: "openapi.diff"
        inputs: ["openapi_spec_base", "openapi_spec"]
        severity: "high"
        params:
          classify_breaking: true

      - id: "version_bump_check"
        type: "policy.version_bump"
        inputs: ["openapi_spec_base", "openapi_spec"]
        severity: "high"
        params:
          require_bump_on_breaking: true
          version_field: "info.version"

      - id: "changelog_updated"
        type: "policy.file_updated"
        inputs: ["changelog"]
        severity: "medium"
        params:
          require_on_breaking: true

      - id: "readme_anchor_check"
        type: "docs.anchor_check"
        inputs: ["readme", "openapi_spec"]
        severity: "medium"
        params:
          anchors:
            - name: "API_VERSION"
              source: "openapi_spec"
              source_path: "$.info.version"
              target_pattern: "API_VERSION:\\s*([\\d\\.]+)"

      - id: "confluence_anchor_check"
        type: "docs.anchor_check"
        inputs: ["confluence_api_page", "openapi_spec"]
        severity: "low"  # WARN only (external system)
        params:
          anchors:
            - name: "OPENAPI_SHA"
              source: "openapi_spec"
              source_hash: "sha256"
              target_pattern: "OPENAPI_SHA:\\s*([a-f0-9]{64})"

    # What obligations must be met?
    obligations:
      - id: "api_owner_review_on_breaking"
        type: "obligation.approval_required"
        severity: "critical"
        params:
          required_approvers: "${policy.approval_groups.api_owners}"
          condition: "findings.any(type='OPENAPI_BREAKING_CHANGE')"

      - id: "changelog_entry_on_breaking"
        type: "obligation.file_present"
        severity: "high"
        params:
          file: "CHANGELOG.md"
          condition: "findings.any(type='OPENAPI_BREAKING_CHANGE')"

    # How to decide outcome?
    decision:
      default_mode: "warn"
      block_on:
        - "severity >= critical"
        - "missing_obligations.any(severity >= critical)"
      warn_on:
        - "severity >= medium"
        - "unverifiable_checks > 0"
```

**Key Components:**
- **Activation rules:** When does this pack run?
- **Artifact dependencies:** What needs to be fetched?
- **Comparators:** What deterministic checks to run?
- **Obligations:** What evidence/approvals are required?
- **Decision logic:** How to map findings → PASS/WARN/BLOCK

---

## 9.3 Common Primitives vs Customer Configuration

**Design Principle:** Customers configure **mapping and thresholds**, not **logic**.

### Common Primitives (You Ship - Same Across Customers)

**Core Objects:**
1. **Surface** - Contract-bearing domain (8 types)
2. **ContractPack** - Bundle of checks/policies
3. **Artifact** - Piece of truth (OpenAPI, README, Confluence, Terraform)
4. **Snapshot** - Time/version-specific artifact capture
5. **Comparator** - Deterministic function producing findings
6. **Finding** - `{type, severity, confidence, evidence, remediation_hint}`
7. **PolicyRule / ObligationCheck** - Required evidence/approvals
8. **RiskScore** - Derived metric from surfaces + findings + blast radius
9. **GateDecision** - PASS/WARN/BLOCK + reason codes
10. **EvidenceBundle** - Immutable record of what was checked

**Engines (Services):**
1. **SurfaceClassifier** - Applies matchers to changed files
2. **ContractResolver** - Selects packs based on surfaces
3. **SnapshotFetcher** - Fetches artifacts with caching
4. **ComparatorRunner** - Executes comparators
5. **PolicyEngine** - Runs obligation checks
6. **RiskScorer** - Computes risk score
7. **DecisionEngine** - Maps findings → gate decision
8. **CheckPublisher** - GitHub Check Run integration

### Customer Configuration (They Define - Varies by Org/Repo/Team)

| Configuration Area | What Customers Define | Example |
|-------------------|----------------------|---------|
| **File → Surface Mapping** | Which paths trigger which surface | `terraform/**/*.tf` → `privileged_infra` |
| **Artifact Locations** | Where truth lives | OpenAPI: `openapi/openapi.yaml`<br>Docs: Confluence page `123456789` |
| **Pack Activation** | Which packs run on which repos | `payments-service` → PublicAPI + PrivilegedInfra |
| **Policy Thresholds** | WARN vs BLOCK boundaries | `critical` → BLOCK<br>`medium` → WARN |
| **Approval Mapping** | GitHub teams → approval groups | `api_owners` → `@acme/api-team` |
| **Graceful Degradation** | What happens if external system down | Confluence unavailable → WARN not BLOCK |
| **Exemptions** | Paths/branches/authors to skip | `experimental/*` branches exempt |
| **Rollout Mode** | warn-only → block progression | Start `warn`, move to `block-high` after 2 weeks |

**Why This Matters:**
- **Reusable primitives** across all customers
- **Flexible configuration** for different org structures
- **Multi-tenant support** without code changes
- **Gradual rollout** (warn-only mode)

---

# Part 10: Code-Level Interfaces

## 10.1 Comparator Interface

**Purpose:** Standardized contract for all comparators

### Core Data Models

```typescript
// Snapshot reference (input to comparators)
export interface SnapshotRef {
  artifactId: string;           // "openapi_spec", "readme", etc.
  source: 'github' | 'confluence' | 'grafana' | 'local';
  ref: string;                  // commit SHA, page version, etc.
  digest: string;               // sha256 hash of content
  content: string | object;     // Parsed content
  meta: {
    fetchedAt: string;
    ttl?: number;
    url?: string;
    [key: string]: any;
  };
}

// Finding (output from comparators)
export interface Finding {
  findingType: string;          // "OPENAPI_BREAKING_CHANGE_WITHOUT_VERSION_BUMP"
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  confidence: number;           // 0-1
  evidence: {
    snapshot_refs: string[];    // Which snapshots were compared
    diff_fragments?: string[];  // Specific diffs
    anchors?: Record<string, { expected: string; actual: string }>;
    [key: string]: any;
  };
  remediationHint: string;      // "Update openapi.yaml version from 1.2.0 to 1.3.0"
  contractPack: string;         // "PublicAPI"
  surface: string;              // "api_contract"
  affectedFiles?: string[];
}

// Comparator result
export interface ComparatorResult {
  comparatorId: string;
  status: 'success' | 'unverifiable' | 'error';
  findings: Finding[];
  unverifiableReason?: string;  // "Confluence page not found"
  duration: number;             // milliseconds
  meta?: Record<string, any>;
}

// Outcome enum
export type Outcome = 'pass' | 'warn' | 'block';
```

### Comparator Contract

```typescript
export abstract class Comparator {
  abstract readonly type: string;  // "openapi.diff", "docs.anchor_check", etc.

  /**
   * Run the comparator
   *
   * @param contractPack - Name of the contract pack ("PublicAPI")
   * @param surface - Surface that triggered this pack ("api_contract")
   * @param snapshots - Map of artifact ID → snapshot
   * @param extracted - Cached extracted values (for performance)
   * @param params - Comparator-specific parameters from config
   * @param prContext - PR metadata (author, files changed, approvals, etc.)
   * @returns ComparatorResult with findings
   */
  abstract run(
    contractPack: string,
    surface: string,
    snapshots: Record<string, SnapshotRef>,
    extracted: Record<string, any>,
    params: Record<string, any>,
    prContext: PRContext
  ): Promise<ComparatorResult>;

  /**
   * Validate that required snapshots are present
   */
  protected validateInputs(
    snapshots: Record<string, SnapshotRef>,
    required: string[]
  ): void {
    const missing = required.filter(id => !snapshots[id]);
    if (missing.length > 0) {
      throw new Error(`Missing required snapshots: ${missing.join(', ')}`);
    }
  }

  /**
   * Create a finding
   */
  protected createFinding(
    type: string,
    severity: Finding['severity'],
    evidence: Finding['evidence'],
    hint: string,
    contractPack: string,
    surface: string
  ): Finding {
    return {
      findingType: type,
      severity,
      confidence: 1.0,  // Deterministic comparators have 100% confidence
      evidence,
      remediationHint: hint,
      contractPack,
      surface,
    };
  }
}

// PR Context
export interface PRContext {
  repo: string;
  prNumber: number;
  author: string;
  title: string;
  baseRef: string;
  headRef: string;
  changedFiles: Array<{
    filename: string;
    status: 'added' | 'modified' | 'removed';
    additions: number;
    deletions: number;
  }>;
  approvals: Array<{
    user: string;
    teams: string[];
  }>;
  labels: string[];
}
```

### Example Comparator Implementation

```typescript
export class OpenAPIDiffComparator extends Comparator {
  readonly type = 'openapi.diff';

  async run(
    contractPack: string,
    surface: string,
    snapshots: Record<string, SnapshotRef>,
    extracted: Record<string, any>,
    params: Record<string, any>,
    prContext: PRContext
  ): Promise<ComparatorResult> {
    const startTime = Date.now();

    try {
      // Validate inputs
      this.validateInputs(snapshots, ['openapi_spec_base', 'openapi_spec']);

      const baseSpec = snapshots['openapi_spec_base'].content as OpenAPISpec;
      const headSpec = snapshots['openapi_spec'].content as OpenAPISpec;

      // Run diff
      const diff = await this.computeDiff(baseSpec, headSpec);

      // Classify changes
      const findings: Finding[] = [];

      if (diff.breakingChanges.length > 0) {
        findings.push(this.createFinding(
          'OPENAPI_BREAKING_CHANGE',
          'high',
          {
            snapshot_refs: ['openapi_spec_base', 'openapi_spec'],
            breaking_changes: diff.breakingChanges,
          },
          `Found ${diff.breakingChanges.length} breaking changes. Consider version bump.`,
          contractPack,
          surface
        ));
      }

      return {
        comparatorId: this.type,
        status: 'success',
        findings,
        duration: Date.now() - startTime,
      };

    } catch (error) {
      return {
        comparatorId: this.type,
        status: 'error',
        findings: [],
        unverifiableReason: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  private async computeDiff(base: OpenAPISpec, head: OpenAPISpec) {
    // Implementation details...
    return { breakingChanges: [], nonBreakingChanges: [] };
  }
}
```

---

## 10.2 Obligation Interface

**Purpose:** Standardized contract for obligation checks

### Obligation Contract

```typescript
export abstract class ObligationCheck {
  abstract readonly type: string;  // "approval_required", "file_present", etc.

  /**
   * Run the obligation check
   *
   * @param contractPack - Name of the contract pack
   * @param surfaces - Surfaces touched in this PR
   * @param findings - Findings from comparators (used for conditional obligations)
   * @param prContext - PR metadata
   * @param params - Obligation-specific parameters from config
   * @returns List of findings for missing obligations (empty if satisfied)
   */
  abstract run(
    contractPack: string,
    surfaces: string[],
    findings: Finding[],
    prContext: PRContext,
    params: Record<string, any>
  ): Promise<Finding[]>;

  /**
   * Evaluate condition expression
   * Example: "findings.any(type='OPENAPI_BREAKING_CHANGE')"
   */
  protected evaluateCondition(
    condition: string,
    findings: Finding[],
    prContext: PRContext
  ): boolean {
    // Simple expression evaluator
    // In production, use a proper expression parser
    if (condition.includes('findings.any')) {
      const match = condition.match(/type='([^']+)'/);
      if (match) {
        const findingType = match[1];
        return findings.some(f => f.findingType === findingType);
      }
    }
    return false;
  }
}
```

### Example Obligation Implementations

```typescript
// Approval obligation
export class ApprovalRequiredObligation extends ObligationCheck {
  readonly type = 'obligation.approval_required';

  async run(
    contractPack: string,
    surfaces: string[],
    findings: Finding[],
    prContext: PRContext,
    params: Record<string, any>
  ): Promise<Finding[]> {
    // Check condition
    if (params.condition && !this.evaluateCondition(params.condition, findings, prContext)) {
      return [];  // Condition not met, obligation doesn't apply
    }

    // Check if required approvers have approved
    const requiredApprovers = params.required_approvers as string[];  // ["@acme/api-team"]
    const actualApprovers = prContext.approvals.flatMap(a => a.teams);

    const hasRequiredApproval = requiredApprovers.some(required =>
      actualApprovers.includes(required)
    );

    if (!hasRequiredApproval) {
      return [{
        findingType: 'MISSING_REQUIRED_APPROVAL',
        severity: params.severity || 'critical',
        confidence: 1.0,
        evidence: {
          required_approvers: requiredApprovers,
          actual_approvers: actualApprovers,
        },
        remediationHint: `Approval required from: ${requiredApprovers.join(', ')}`,
        contractPack,
        surface: surfaces[0],
      }];
    }

    return [];
  }
}

// File present obligation
export class FilePresentObligation extends ObligationCheck {
  readonly type = 'obligation.file_present';

  async run(
    contractPack: string,
    surfaces: string[],
    findings: Finding[],
    prContext: PRContext,
    params: Record<string, any>
  ): Promise<Finding[]> {
    // Check condition
    if (params.condition && !this.evaluateCondition(params.condition, findings, prContext)) {
      return [];
    }

    const requiredFile = params.file as string;
    const fileExists = prContext.changedFiles.some(f => f.filename === requiredFile);

    if (!fileExists) {
      return [{
        findingType: 'MISSING_REQUIRED_FILE',
        severity: params.severity || 'high',
        confidence: 1.0,
        evidence: {
          required_file: requiredFile,
          changed_files: prContext.changedFiles.map(f => f.filename),
        },
        remediationHint: `Required file missing or not updated: ${requiredFile}`,
        contractPack,
        surface: surfaces[0],
      }];
    }

    return [];
  }
}
```

---

## 10.3 Core Data Models (Complete TypeScript Definitions)

```typescript
// Surface types (8 surfaces)
export type Surface =
  | 'api_contract'
  | 'data_contract'
  | 'security_boundary'
  | 'privileged_infra'
  | 'runtime_config'
  | 'observability_contract'
  | 'operational_procedures'
  | 'user_facing_docs';

// Artifact types
export type ArtifactType =
  | 'github_file'
  | 'github_directory'
  | 'confluence_page'
  | 'grafana_dashboard'
  | 'terraform_plan'
  | 'local_file';

// Comparator types (5 families)
export type ComparatorType =
  // Family A: Required artifact present
  | 'artifact.required'
  // Family B: Version/reference consistency
  | 'policy.version_bump'
  | 'docs.anchor_check'
  // Family C: Schema compatibility
  | 'openapi.validate'
  | 'openapi.diff'
  | 'graphql.diff'
  | 'protobuf.diff'
  // Family D: Config-to-policy
  | 'terraform.risk_classifier'
  | 'observability.threshold_check'
  // Family E: Cross-system alignment
  | 'docs.required_sections'
  | 'policy.file_updated';

// Obligation types (4 categories)
export type ObligationType =
  // Category A: Approval obligations
  | 'obligation.approval_required'
  | 'obligation.min_reviewers'
  // Category B: Evidence obligations
  | 'obligation.file_present'
  | 'obligation.doc_section_present'
  // Category C: Test obligations
  | 'obligation.tests_updated'
  | 'obligation.migration_tests_present'
  // Category D: Release obligations
  | 'obligation.changelog_updated'
  | 'obligation.version_bumped';

// Gate decision
export interface GateDecision {
  outcome: Outcome;  // 'pass' | 'warn' | 'block'
  reasonCodes: string[];
  riskScore: number;
  surfacesTouched: Surface[];
  packsExecuted: string[];
  findingsSummary: {
    total: number;
    bySeverity: Record<Finding['severity'], number>;
    byPack: Record<string, number>;
  };
  obligationsSummary: {
    total: number;
    satisfied: number;
    missing: number;
  };
  evidenceBundleId: string;
  duration: number;
}

// Evidence bundle
export interface EvidenceBundle {
  id: string;
  workspaceId: string;
  prContext: PRContext;
  surfaceClassification: {
    surfaces: Surface[];
    confidence: number;
    reasons: string[];
  };
  packsExecuted: string[];
  snapshots: Record<string, SnapshotRef>;
  comparatorResults: ComparatorResult[];
  obligationResults: Finding[];
  decision: GateDecision;
  createdAt: string;
  expiresAt: string;
}
```

---

# Part 11: Track A Pipeline Wiring

## 11.1 Detailed Execution Flow (10-Step Pipeline)

**Purpose:** Show exactly how configuration drives execution

### Pipeline Overview

```typescript
/**
 * Track A Main Pipeline
 *
 * Input: GitHub PR webhook event
 * Output: GitHub Check Run (PASS/WARN/BLOCK) + Evidence Bundle
 * Latency Target: < 30 seconds
 */
export async function runTrackAPipeline(
  prEvent: GitHubPREvent,
  repoConfig: RepoConfig,
  contractPackDefs: ContractPackDefinition[]
): Promise<GateDecision> {

  // Step 0: Trigger
  const startTime = Date.now();

  // Step 1: Collect PR Context
  const prContext = await collectPRContext(prEvent);

  // Step 2: Apply Exclusions
  if (shouldExclude(prContext, repoConfig.config.exclusions)) {
    return createPassDecision('PR excluded by configuration');
  }

  // Step 3: Classify Surfaces
  const surfaceHits = await classifySurfaces(
    prContext.changedFiles,
    repoConfig.surfaces.matchers
  );

  if (surfaceHits.surfaces.length === 0) {
    return createPassDecision('No contract surfaces touched');
  }

  // Step 4: Resolve ContractPacks
  const packs = resolveContractPacks(
    surfaceHits.surfaces,
    repoConfig.contractpacks.enabled,
    contractPackDefs
  );

  if (packs.length === 0) {
    return createPassDecision('No contract packs activated');
  }

  // Step 5: Fetch Snapshots
  const snapshots = await fetchSnapshots(
    packs,
    prContext,
    repoConfig.org.grace
  );

  // Step 6: Run Comparators
  const comparatorResults = await runComparators(
    packs,
    surfaceHits.surfaces,
    snapshots,
    prContext
  );

  // Step 7: Run Obligations
  const obligationFindings = await runObligations(
    packs,
    surfaceHits.surfaces,
    comparatorResults.flatMap(r => r.findings),
    prContext
  );

  // Step 8: Compute Risk Score
  const riskScore = computeRiskScore(
    surfaceHits.surfaces,
    comparatorResults,
    obligationFindings,
    prContext,
    repoConfig.policy
  );

  // Step 9: Decide Outcome
  const decision = decideOutcome(
    comparatorResults,
    obligationFindings,
    riskScore,
    repoConfig.policy,
    repoConfig.mode
  );

  // Step 10: Publish Check + Evidence
  const evidenceBundle = await createEvidenceBundle({
    prContext,
    surfaceHits,
    packs: packs.map(p => p.name),
    snapshots,
    comparatorResults,
    obligationFindings,
    decision,
  });

  await publishGitHubCheck(prContext, decision, evidenceBundle);

  // Step 11 (Optional): Spawn Track B
  if (decision.outcome !== 'pass' && shouldSpawnTrackB(repoConfig)) {
    await spawnTrackBRemediation(evidenceBundle);
  }

  return decision;
}
```

---

## 11.2 How Config Drives Execution (Detailed)

### Step 3: Surface Classification

```typescript
async function classifySurfaces(
  changedFiles: PRContext['changedFiles'],
  matchers: SurfaceMatcher[]
): Promise<SurfaceClassification> {
  const surfaceHits: Map<Surface, { files: string[]; confidence: number; reasons: string[] }> = new Map();

  for (const file of changedFiles) {
    for (const matcher of matchers) {
      // Check if file matches any pattern
      const matches = matcher.patterns.some(pattern =>
        minimatch(file.filename, pattern)
      );

      if (matches) {
        const existing = surfaceHits.get(matcher.surface) || {
          files: [],
          confidence: 0,
          reasons: [],
        };

        existing.files.push(file.filename);
        existing.confidence = Math.max(existing.confidence, 0.9);  // Pattern match = high confidence
        existing.reasons.push(`Matched pattern: ${matcher.id}`);

        surfaceHits.set(matcher.surface, existing);
      }
    }
  }

  return {
    surfaces: Array.from(surfaceHits.keys()),
    filesBySurface: Object.fromEntries(
      Array.from(surfaceHits.entries()).map(([surface, data]) => [surface, data.files])
    ),
    confidence: surfaceHits.size > 0 ? 0.9 : 0,
    reasons: Array.from(surfaceHits.values()).flatMap(d => d.reasons),
  };
}
```

### Step 4: ContractPack Resolution

```typescript
function resolveContractPacks(
  surfaces: Surface[],
  enabledPacks: string[],
  packDefs: ContractPackDefinition[]
): ContractPackDefinition[] {
  const resolved: ContractPackDefinition[] = [];

  for (const packName of enabledPacks) {
    const packDef = packDefs.find(p => p.name === packName);
    if (!packDef) {
      console.warn(`ContractPack ${packName} not found in definitions`);
      continue;
    }

    // Check activation rules
    const shouldActivate = packDef.activation.any_surfaces.some(surface =>
      surfaces.includes(surface)
    );

    if (shouldActivate) {
      resolved.push(packDef);
    }
  }

  return resolved;
}
```

### Step 5: Snapshot Fetching

```typescript
async function fetchSnapshots(
  packs: ContractPackDefinition[],
  prContext: PRContext,
  graceConfig: GraceConfig
): Promise<Record<string, SnapshotRef>> {
  const snapshots: Record<string, SnapshotRef> = {};

  // Collect all required artifacts across all packs
  const artifactsToFetch = new Set<ArtifactDefinition>();
  for (const pack of packs) {
    pack.artifacts.required.forEach(a => artifactsToFetch.add(a));
    pack.artifacts.optional?.forEach(a => artifactsToFetch.add(a));
  }

  // Fetch in parallel with soft-fail
  const fetchPromises = Array.from(artifactsToFetch).map(async artifact => {
    try {
      const snapshot = await fetchArtifactWithTimeout(
        artifact,
        prContext,
        graceConfig.timeout_seconds * 1000
      );

      // Fetch both base and head if required
      if (artifact.base_ref) {
        snapshots[`${artifact.id}_base`] = await fetchArtifactAtRef(
          artifact,
          prContext.baseRef
        );
      }

      snapshots[artifact.id] = snapshot;

    } catch (error) {
      // Soft-fail: log error but don't throw
      console.error(`Failed to fetch artifact ${artifact.id}:`, error);

      // Mark as unverifiable
      snapshots[artifact.id] = {
        artifactId: artifact.id,
        source: 'local',
        ref: 'unverifiable',
        digest: '',
        content: null,
        meta: {
          fetchedAt: new Date().toISOString(),
          error: error.message,
        },
      };
    }
  });

  await Promise.all(fetchPromises);

  return snapshots;
}
```

### Step 6: Comparator Execution

```typescript
async function runComparators(
  packs: ContractPackDefinition[],
  surfaces: Surface[],
  snapshots: Record<string, SnapshotRef>,
  prContext: PRContext
): Promise<ComparatorResult[]> {
  const results: ComparatorResult[] = [];
  const extracted: Record<string, any> = {};  // Cache for extracted values

  for (const pack of packs) {
    for (const comparatorDef of pack.comparators) {
      // Get comparator instance
      const comparator = getComparator(comparatorDef.type);

      // Check if required inputs are available
      const requiredSnapshots = comparatorDef.inputs.reduce((acc, inputId) => {
        acc[inputId] = snapshots[inputId];
        return acc;
      }, {} as Record<string, SnapshotRef>);

      // Skip if any required snapshot is unverifiable
      const hasUnverifiable = Object.values(requiredSnapshots).some(
        s => s?.ref === 'unverifiable'
      );

      if (hasUnverifiable) {
        results.push({
          comparatorId: comparatorDef.id,
          status: 'unverifiable',
          findings: [],
          unverifiableReason: 'Required artifact unavailable',
          duration: 0,
        });
        continue;
      }

      // Run comparator
      const result = await comparator.run(
        pack.name,
        surfaces[0],  // Primary surface
        requiredSnapshots,
        extracted,
        comparatorDef.params || {},
        prContext
      );

      results.push(result);
    }
  }

  return results;
}
```

### Step 7: Obligation Execution

```typescript
async function runObligations(
  packs: ContractPackDefinition[],
  surfaces: Surface[],
  findings: Finding[],
  prContext: PRContext
): Promise<Finding[]> {
  const obligationFindings: Finding[] = [];

  for (const pack of packs) {
    for (const obligationDef of pack.obligations) {
      // Get obligation instance
      const obligation = getObligation(obligationDef.type);

      // Run obligation check
      const missingObligations = await obligation.run(
        pack.name,
        surfaces,
        findings,
        prContext,
        obligationDef.params || {}
      );

      obligationFindings.push(...missingObligations);
    }
  }

  return obligationFindings;
}
```

---

## 11.3 Surface → Pack Mapping Mechanism

### Explicit Mapping Table

| Surface Touched | Activated ContractPacks | Rationale |
|----------------|------------------------|-----------|
| `api_contract` | PublicAPI | API changes require contract validation |
| `privileged_infra` | PrivilegedInfra | IAM/network changes require security review |
| `security_boundary` | PrivilegedInfra | Auth changes require security review |
| `data_contract` | DataMigration | Schema changes require migration plan |
| `observability_contract` | Observability | Alert changes require runbook updates |
| `api_contract` + `data_contract` | PublicAPI + DataMigration | Both packs run in parallel |

### Activation Rules

**Single Surface → Single Pack:**
```yaml
# If only api_contract touched
surfaces: ["api_contract"]
→ packs: ["PublicAPI"]
```

**Single Surface → Multiple Packs:**
```yaml
# If security_boundary touched
surfaces: ["security_boundary"]
→ packs: ["PrivilegedInfra", "SecurityAudit"]  # Multiple packs can activate
```

**Multiple Surfaces → Multiple Packs:**
```yaml
# If both api_contract and data_contract touched
surfaces: ["api_contract", "data_contract"]
→ packs: ["PublicAPI", "DataMigration"]  # Both run independently
```

### Multi-Pack Execution Strategy

**Parallel Execution:**
- All packs run in parallel for speed
- Each pack has independent comparators and obligations
- Findings accumulate across all packs
- Final decision considers ALL findings

**Example:**
```typescript
// PR touches: openapi/openapi.yaml + prisma/migrations/001.sql
// Surfaces: ["api_contract", "data_contract"]
// Packs: ["PublicAPI", "DataMigration"]

// PublicAPI pack runs:
// - openapi.validate
// - openapi.diff
// - docs.anchor_check
// → Findings: [OPENAPI_BREAKING_CHANGE]

// DataMigration pack runs:
// - migration.backward_compatible
// - docs.migration_plan_present
// → Findings: [MISSING_MIGRATION_PLAN]

// Combined decision:
// - 2 findings total
// - Max severity: HIGH
// - Outcome: WARN (or BLOCK if configured)
```

---

# Part 12: Truth Anchors Strategy

## 12.1 Deterministic Docs Validation

**Problem:** Deep semantic doc comparisons are NOT deterministic and NOT gate-safe.

**Why LLM Semantic Comparison Fails for Track A:**
- Non-deterministic (same input → different output)
- Slow (adds 5-10s latency)
- High false positive rate (stylistic changes flagged as drift)
- Not explainable (hard to show evidence)

**Solution:** Require docs to include **deterministic markers** (truth anchors) that Track A can verify exactly.

---

## 12.2 Anchor Convention

**Recommended Convention for Docs:**

### In Confluence Pages:

```markdown
# API Documentation

## Operational Truth

**Contract Anchors:**
- OPENAPI_SHA: `a3f5b2c8d1e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5`
- API_VERSION: `1.7.2`
- LAST_SYNCED_COMMIT: `abc123def456`
- LAST_UPDATED: `2026-02-15`

[Rest of documentation...]
```

### In README.md:

```markdown
# Payments Service

![API Version](https://img.shields.io/badge/API-1.7.2-blue)

## Contract Anchors

- API_VERSION: 1.7.2
- OPENAPI_SHA: a3f5b2c8d1e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5
- SPEC_PATH: openapi/openapi.yaml

[Rest of README...]
```

### In Runbooks:

```markdown
# IAM Runbook

## Infrastructure Truth

- TERRAFORM_DIR: terraform/iam
- LAST_APPLIED: 2026-02-10
- TERRAFORM_VERSION: 1.6.0

[Rest of runbook...]
```

---

## 12.3 `docs.anchor_check` Comparator

**Purpose:** Deterministically verify that docs contain correct anchor values

### Implementation

```typescript
export class DocsAnchorCheckComparator extends Comparator {
  readonly type = 'docs.anchor_check';

  async run(
    contractPack: string,
    surface: string,
    snapshots: Record<string, SnapshotRef>,
    extracted: Record<string, any>,
    params: Record<string, any>,
    prContext: PRContext
  ): Promise<ComparatorResult> {
    const findings: Finding[] = [];

    // params.anchors = [
    //   {
    //     name: "OPENAPI_SHA",
    //     source: "openapi_spec",
    //     source_hash: "sha256",
    //     target_pattern: "OPENAPI_SHA:\\s*`?([a-f0-9]{64})`?"
    //   }
    // ]

    for (const anchor of params.anchors) {
      // Step 1: Compute source value
      const sourceValue = await this.computeSourceValue(
        anchor,
        snapshots,
        extracted
      );

      // Step 2: Extract target value from docs
      const targetSnapshot = snapshots[params.inputs[0]];  // e.g., "readme" or "confluence_api_page"
      const targetValue = this.extractTargetValue(
        anchor,
        targetSnapshot.content as string
      );

      // Step 3: Compare
      if (sourceValue !== targetValue) {
        findings.push(this.createFinding(
          'DOCS_ANCHOR_MISMATCH',
          params.severity || 'medium',
          {
            snapshot_refs: [anchor.source, params.inputs[0]],
            anchors: {
              [anchor.name]: {
                expected: sourceValue,
                actual: targetValue || 'NOT_FOUND',
              },
            },
          },
          `Update ${anchor.name} in docs from "${targetValue || 'NOT_FOUND'}" to "${sourceValue}"`,
          contractPack,
          surface
        ));
      }
    }

    return {
      comparatorId: this.type,
      status: 'success',
      findings,
      duration: 0,
    };
  }

  private async computeSourceValue(
    anchor: AnchorDefinition,
    snapshots: Record<string, SnapshotRef>,
    extracted: Record<string, any>
  ): Promise<string> {
    const sourceSnapshot = snapshots[anchor.source];

    // Hash-based anchor
    if (anchor.source_hash) {
      const cacheKey = `${anchor.source}_${anchor.source_hash}`;
      if (extracted[cacheKey]) {
        return extracted[cacheKey];
      }

      const hash = crypto
        .createHash(anchor.source_hash)
        .update(JSON.stringify(sourceSnapshot.content))
        .digest('hex');

      extracted[cacheKey] = hash;
      return hash;
    }

    // JSONPath-based anchor
    if (anchor.source_path) {
      const cacheKey = `${anchor.source}_${anchor.source_path}`;
      if (extracted[cacheKey]) {
        return extracted[cacheKey];
      }

      const value = jsonpath.query(sourceSnapshot.content, anchor.source_path)[0];
      extracted[cacheKey] = value;
      return value;
    }

    throw new Error(`Anchor ${anchor.name} must specify source_hash or source_path`);
  }

  private extractTargetValue(
    anchor: AnchorDefinition,
    docContent: string
  ): string | null {
    const regex = new RegExp(anchor.target_pattern, 'i');
    const match = docContent.match(regex);
    return match ? match[1] : null;
  }
}

interface AnchorDefinition {
  name: string;
  source: string;  // Snapshot ID
  source_hash?: 'sha256' | 'md5';
  source_path?: string;  // JSONPath
  target_pattern: string;  // Regex with capture group
}
```

### Example Usage in ContractPack

```yaml
comparators:
  - id: "readme_anchor_check"
    type: "docs.anchor_check"
    inputs: ["readme", "openapi_spec"]
    severity: "medium"
    params:
      anchors:
        # Check API version matches
        - name: "API_VERSION"
          source: "openapi_spec"
          source_path: "$.info.version"
          target_pattern: "API_VERSION:\\s*([\\d\\.]+)"

        # Check OpenAPI hash matches
        - name: "OPENAPI_SHA"
          source: "openapi_spec"
          source_hash: "sha256"
          target_pattern: "OPENAPI_SHA:\\s*`?([a-f0-9]{64})`?"
```

### Benefits

✅ **Deterministic** - Exact string/hash comparison
✅ **Fast** - No LLM calls, < 100ms
✅ **Explainable** - Clear evidence (expected vs actual)
✅ **Gate-safe** - Low false positive rate
✅ **Actionable** - Clear remediation hint

---

# Part 13: Concrete ContractPack Examples

## 13.1 PublicAPI Pack (Full Specification)

**Purpose:** Ensure public API changes maintain contract integrity

```yaml
name: "PublicAPI"
description: "Contract validation for public API changes"
version: "1.0"

activation:
  any_surfaces: ["api_contract"]
  min_confidence: 0.7

artifacts:
  required:
    - id: "openapi_spec"
      type: "github_file"
      path: "openapi/openapi.yaml"
      base_ref: true  # Fetch both base and head

    - id: "changelog"
      type: "github_file"
      path: "CHANGELOG.md"

    - id: "readme"
      type: "github_file"
      path: "README.md"

  optional:
    - id: "confluence_api_page"
      type: "confluence_page"
      space: "ENG"
      page_id: "123456789"
      timeout_seconds: 3

comparators:
  # 1. Validate OpenAPI spec is valid
  - id: "openapi_validate"
    type: "openapi.validate"
    inputs: ["openapi_spec"]
    severity: "critical"
    params:
      strict_mode: true

  # 2. Classify breaking vs non-breaking changes
  - id: "openapi_diff"
    type: "openapi.diff"
    inputs: ["openapi_spec_base", "openapi_spec"]
    severity: "high"
    params:
      classify_breaking: true

  # 3. Require version bump on breaking changes
  - id: "version_bump_check"
    type: "policy.version_bump"
    inputs: ["openapi_spec_base", "openapi_spec"]
    severity: "high"
    params:
      require_bump_on_breaking: true
      version_field: "info.version"
      bump_type: "minor"  # At least minor bump

  # 4. Require changelog update on breaking changes
  - id: "changelog_updated"
    type: "policy.file_updated"
    inputs: ["changelog"]
    severity: "medium"
    params:
      require_on_breaking: true

  # 5. Check README anchors match OpenAPI
  - id: "readme_anchor_check"
    type: "docs.anchor_check"
    inputs: ["readme", "openapi_spec"]
    severity: "medium"
    params:
      anchors:
        - name: "API_VERSION"
          source: "openapi_spec"
          source_path: "$.info.version"
          target_pattern: "API_VERSION:\\s*([\\d\\.]+)"
        - name: "OPENAPI_SHA"
          source: "openapi_spec"
          source_hash: "sha256"
          target_pattern: "OPENAPI_SHA:\\s*`?([a-f0-9]{64})`?"

  # 6. Check Confluence anchors (WARN only - external system)
  - id: "confluence_anchor_check"
    type: "docs.anchor_check"
    inputs: ["confluence_api_page", "openapi_spec"]
    severity: "low"  # WARN only
    params:
      anchors:
        - name: "OPENAPI_SHA"
          source: "openapi_spec"
          source_hash: "sha256"
          target_pattern: "OPENAPI_SHA:\\s*`?([a-f0-9]{64})`?"

obligations:
  # 1. API owner approval required on breaking changes
  - id: "api_owner_review_on_breaking"
    type: "obligation.approval_required"
    severity: "critical"
    params:
      required_approvers: ["@acme/api-team"]
      condition: "findings.any(type='OPENAPI_BREAKING_CHANGE')"

  # 2. Changelog entry required on breaking changes
  - id: "changelog_entry_on_breaking"
    type: "obligation.file_present"
    severity: "high"
    params:
      file: "CHANGELOG.md"
      condition: "findings.any(type='OPENAPI_BREAKING_CHANGE')"

decision:
  default_mode: "warn"
  block_on:
    - "severity >= critical"
    - "missing_obligations.any(severity >= critical)"
  warn_on:
    - "severity >= medium"
    - "unverifiable_checks > 0"
```

**Expected Findings:**
- `OPENAPI_INVALID` (critical) - Spec fails validation
- `OPENAPI_BREAKING_CHANGE` (high) - Breaking change detected
- `VERSION_BUMP_REQUIRED` (high) - Breaking change without version bump
- `CHANGELOG_NOT_UPDATED` (medium) - Breaking change without changelog
- `DOCS_ANCHOR_MISMATCH` (medium) - README version doesn't match spec
- `MISSING_REQUIRED_APPROVAL` (critical) - API owner approval missing

---

## 13.2 PrivilegedInfra Pack (Full Specification)

**Purpose:** Ensure infrastructure changes follow security and operational best practices

```yaml
name: "PrivilegedInfra"
description: "Contract validation for privileged infrastructure changes"
version: "1.0"

activation:
  any_surfaces: ["privileged_infra", "security_boundary"]
  min_confidence: 0.7

artifacts:
  required:
    - id: "terraform_dir"
      type: "github_directory"
      path: "terraform/"
      base_ref: true

    - id: "runbook_infra"
      type: "github_file"
      path: "docs/runbooks/infrastructure.md"

    - id: "rollback_plan"
      type: "github_file"
      path: "docs/rollback_plan.md"

comparators:
  # 1. Classify Terraform changes by risk
  - id: "terraform_risk_classifier"
    type: "terraform.risk_classifier"
    inputs: ["terraform_dir_base", "terraform_dir"]
    severity: "high"
    params:
      high_risk_resources:
        - "aws_iam_*"
        - "aws_security_group"
        - "aws_vpc"
        - "aws_kms_key"
      medium_risk_resources:
        - "aws_s3_bucket"
        - "aws_rds_*"

  # 2. Check runbook has required sections
  - id: "runbook_sections_check"
    type: "docs.required_sections"
    inputs: ["runbook_infra"]
    severity: "medium"
    params:
      required_sections:
        - "## Rollback Procedure"
        - "## Incident Response"
        - "## Access Control"

obligations:
  # 1. Security approval required for IAM changes
  - id: "security_review_for_iam"
    type: "obligation.approval_required"
    severity: "critical"
    params:
      required_approvers: ["@acme/security"]
      condition: "findings.any(type='TERRAFORM_HIGH_RISK_CHANGE')"

  # 2. Rollback plan required
  - id: "rollback_plan_required"
    type: "obligation.file_present"
    severity: "high"
    params:
      file: "docs/rollback_plan.md"

  # 3. Two reviewers on high-risk changes
  - id: "two_reviewers_on_high_risk"
    type: "obligation.min_reviewers"
    severity: "high"
    params:
      min_reviewers: 2
      condition: "findings.any(severity='high')"

decision:
  default_mode: "block-high"  # Stricter for infra
  block_on:
    - "severity >= high"
    - "missing_obligations.any(severity >= high)"
  warn_on:
    - "severity >= medium"
```

**Expected Findings:**
- `TERRAFORM_HIGH_RISK_CHANGE` (high) - IAM/network resource changed
- `TERRAFORM_MEDIUM_RISK_CHANGE` (medium) - S3/RDS resource changed
- `MISSING_RUNBOOK_SECTION` (medium) - Required section missing
- `MISSING_REQUIRED_APPROVAL` (critical) - Security approval missing
- `MISSING_REQUIRED_FILE` (high) - Rollback plan missing
- `INSUFFICIENT_REVIEWERS` (high) - < 2 reviewers

---

## 13.3 DataMigration Pack (Optional Starter)

```yaml
name: "DataMigration"
description: "Contract validation for database schema changes"
version: "1.0"

activation:
  any_surfaces: ["data_contract"]

artifacts:
  required:
    - id: "migrations_dir"
      type: "github_directory"
      path: "prisma/migrations/"
    - id: "migration_plan"
      type: "github_file"
      path: "docs/migration_plan.md"

comparators:
  - id: "migration_backward_compatible"
    type: "migration.compatibility_check"
    inputs: ["migrations_dir"]
    severity: "high"

obligations:
  - id: "migration_plan_required"
    type: "obligation.file_present"
    severity: "high"
    params:
      file: "docs/migration_plan.md"

  - id: "migration_tests_present"
    type: "obligation.tests_updated"
    severity: "medium"
    params:
      test_pattern: "**/*.migration.test.ts"
```

---

## 13.4 Observability Pack (Optional Starter)

```yaml
name: "Observability"
description: "Contract validation for observability changes"
version: "1.0"

activation:
  any_surfaces: ["observability_contract"]

artifacts:
  required:
    - id: "alert_rules"
      type: "github_directory"
      path: "monitoring/alerts/"
    - id: "slo_policy"
      type: "github_file"
      path: "docs/slo_policy.yaml"

comparators:
  - id: "alert_threshold_check"
    type: "observability.threshold_check"
    inputs: ["alert_rules", "slo_policy"]
    severity: "medium"
    params:
      verify_alignment: true

obligations:
  - id: "runbook_updated_for_new_alerts"
    type: "obligation.doc_section_present"
    severity: "medium"
    params:
      file: "docs/runbooks/alerts.md"
      section_pattern: "## {alert_name}"
```

---

# Part 14: V1 Implementation Scope

## 14.1 Specific Comparators to Build (8 Comparators)

**Priority Order for Fastest PMF:**

### Week 1-2: Core Comparators (4)

1. **`openapi.validate`** (Family C: Schema compatibility)
   - **Purpose:** Validate OpenAPI spec is syntactically valid
   - **Inputs:** `openapi_spec`
   - **Outputs:** `OPENAPI_INVALID` finding if validation fails
   - **Complexity:** LOW (use existing OpenAPI validator library)
   - **Estimated:** 4 hours

2. **`openapi.diff`** (Family C: Schema compatibility)
   - **Purpose:** Classify breaking vs non-breaking API changes
   - **Inputs:** `openapi_spec_base`, `openapi_spec`
   - **Outputs:** `OPENAPI_BREAKING_CHANGE`, `OPENAPI_NON_BREAKING_CHANGE`
   - **Complexity:** MEDIUM (use openapi-diff library + custom classification)
   - **Estimated:** 8 hours

3. **`policy.version_bump`** (Family B: Version consistency)
   - **Purpose:** Require version bump on breaking changes
   - **Inputs:** `openapi_spec_base`, `openapi_spec`
   - **Outputs:** `VERSION_BUMP_REQUIRED` if breaking change without bump
   - **Complexity:** LOW (JSONPath extraction + semver comparison)
   - **Estimated:** 4 hours

4. **`policy.file_updated`** (Family A: Required artifact present)
   - **Purpose:** Require file updated in PR
   - **Inputs:** `changelog` (or any file)
   - **Outputs:** `FILE_NOT_UPDATED` if file not in changed files
   - **Complexity:** LOW (check PR changed files)
   - **Estimated:** 2 hours

### Week 3-4: Docs & Infra Comparators (4)

5. **`docs.anchor_check`** (Family B: Version consistency)
   - **Purpose:** Verify docs contain correct anchor values
   - **Inputs:** `readme` + `openapi_spec` (or `confluence_api_page` + `openapi_spec`)
   - **Outputs:** `DOCS_ANCHOR_MISMATCH` if anchors don't match
   - **Complexity:** MEDIUM (regex extraction + hash computation)
   - **Estimated:** 6 hours

6. **`terraform.risk_classifier`** (Family D: Config-to-policy)
   - **Purpose:** Classify Terraform changes by risk level
   - **Inputs:** `terraform_dir_base`, `terraform_dir`
   - **Outputs:** `TERRAFORM_HIGH_RISK_CHANGE`, `TERRAFORM_MEDIUM_RISK_CHANGE`
   - **Complexity:** MEDIUM (parse Terraform, pattern matching)
   - **Estimated:** 8 hours

7. **`docs.required_sections`** (Family E: Cross-system alignment)
   - **Purpose:** Verify docs contain required sections
   - **Inputs:** `runbook_infra` (or any markdown file)
   - **Outputs:** `MISSING_RUNBOOK_SECTION` if section missing
   - **Complexity:** LOW (regex pattern matching)
   - **Estimated:** 3 hours

8. **`artifact.required`** (Family A: Required artifact present)
   - **Purpose:** Verify required artifact exists and was fetched
   - **Inputs:** Any artifact
   - **Outputs:** `REQUIRED_ARTIFACT_MISSING` if artifact not found
   - **Complexity:** LOW (check snapshot status)
   - **Estimated:** 2 hours

**Total Comparator Development:** ~37 hours (~5 days)

---

## 14.2 Specific Obligations to Build (3 Obligations)

**Priority Order:**

### Week 1-2: Core Obligations (3)

1. **`obligation.approval_required`** (Category A: Approval obligations)
   - **Purpose:** Require approval from specific GitHub teams
   - **Inputs:** PR approvals, required approvers list
   - **Outputs:** `MISSING_REQUIRED_APPROVAL` if approval missing
   - **Complexity:** LOW (check PR approvals against team list)
   - **Estimated:** 4 hours

2. **`obligation.file_present`** (Category B: Evidence obligations)
   - **Purpose:** Require specific file exists in PR
   - **Inputs:** PR changed files, required file path
   - **Outputs:** `MISSING_REQUIRED_FILE` if file not present
   - **Complexity:** LOW (check changed files list)
   - **Estimated:** 2 hours

3. **`obligation.min_reviewers`** (Category A: Approval obligations)
   - **Purpose:** Require minimum number of reviewers
   - **Inputs:** PR approvals, min reviewers count
   - **Outputs:** `INSUFFICIENT_REVIEWERS` if < min reviewers
   - **Complexity:** LOW (count approvals)
   - **Estimated:** 2 hours

**Total Obligation Development:** ~8 hours (~1 day)

---

## 14.3 Priority Order & Success Criteria

### V1 Milestone: "Track A is Real"

**Definition:** Track A can make a real gate decision on a real PR with real contract validation.

**Minimum Viable Feature Set:**

✅ **Surface Classification** (Week 1)
- 3 surfaces: `api_contract`, `privileged_infra`, `data_contract`
- Path-based matchers
- Confidence scoring

✅ **ContractPack System** (Week 1-2)
- 2 packs: PublicAPI, PrivilegedInfra
- Pack activation based on surfaces
- Configuration loading from `contractpacks.yaml`

✅ **Artifact Fetching** (Week 1-2)
- GitHub files (OpenAPI, README, Terraform)
- Soft-fail strategy (timeouts, fallbacks)
- Snapshot caching (1-hour TTL)

✅ **Comparators** (Week 1-4)
- 8 comparators (listed above)
- Deterministic findings
- Evidence bundles

✅ **Obligations** (Week 1-2)
- 3 obligations (listed above)
- Conditional evaluation
- Missing obligation findings

✅ **Decision Engine** (Week 2)
- Risk score computation
- Threshold mapping (warn/block)
- Policy mode support (warn-only, block-high, block-all)

✅ **GitHub Check Integration** (Week 3-4)
- Check Run creation
- Annotations on files
- Summary with findings
- Links to evidence bundle

✅ **Evidence Bundle Storage** (Week 3-4)
- Immutable snapshots
- S3 storage
- 90-day retention
- Reproducibility

---

### Success Criteria for V1

**Week 2 Milestone:**
- [ ] Surface classifier correctly identifies 3 surfaces
- [ ] ContractPack resolver activates correct packs
- [ ] Artifact fetcher retrieves GitHub files with soft-fail
- [ ] 4 core comparators produce findings
- [ ] 3 obligations check PR state
- [ ] Decision engine produces PASS/WARN/BLOCK outcome
- [ ] **End-to-end test:** PR with OpenAPI change → PublicAPI pack → findings → decision

**Week 4 Milestone:**
- [ ] All 8 comparators implemented and tested
- [ ] GitHub Check Run published with annotations
- [ ] Evidence bundle stored in S3
- [ ] Truth anchors working (docs.anchor_check)
- [ ] Terraform risk classification working
- [ ] **End-to-end test:** PR with IAM change → PrivilegedInfra pack → BLOCK outcome

**Week 6 Milestone:**
- [ ] 2 real repos configured with contractpacks.yaml
- [ ] 10+ real PRs processed
- [ ] < 5% false positive rate
- [ ] < 30s latency (p95)
- [ ] Zero production incidents from Track A blocks
- [ ] **PMF Signal:** Developers trust the gate and don't disable it

---

### Implementation Priority (What to Build First)

**Phase 1: Foundation (Week 1-2)**
1. Surface classifier
2. ContractPack resolver
3. Artifact fetcher (GitHub only)
4. `openapi.validate` comparator
5. `openapi.diff` comparator
6. `policy.version_bump` comparator
7. `obligation.approval_required`
8. Decision engine (basic)
9. **Deliverable:** End-to-end test passing

**Phase 2: GitHub Integration (Week 3-4)**
1. GitHub Check Run publisher
2. Evidence bundle storage
3. `docs.anchor_check` comparator
4. `terraform.risk_classifier` comparator
5. `docs.required_sections` comparator
6. `obligation.file_present`
7. **Deliverable:** Real PR gets real GitHub Check

**Phase 3: Polish & Rollout (Week 5-6)**
1. Configuration UI (Next.js)
2. Evidence bundle viewer
3. Soft-fail improvements
4. Performance optimization (parallel execution)
5. Documentation
6. **Deliverable:** 2 repos in production

---

### What Makes Track A "Real" vs "Stub"

**Current State (Stub):**
```typescript
// contractValidation.ts
export async function runContractValidation() {
  console.log('Not implemented');
  return { outcome: 'pass', findings: [] };  // Always passes
}
```

**V1 State (Real):**
```typescript
// contractValidation.ts
export async function runContractValidation(input) {
  // 1. Classify surfaces
  const surfaces = await classifySurfaces(input.changedFiles);

  // 2. Resolve packs
  const packs = resolvePacks(surfaces, config);

  // 3. Fetch artifacts
  const snapshots = await fetchSnapshots(packs);

  // 4. Run comparators
  const comparatorResults = await runComparators(packs, snapshots);

  // 5. Run obligations
  const obligationFindings = await runObligations(packs, comparatorResults);

  // 6. Decide outcome
  const decision = decideOutcome(comparatorResults, obligationFindings);

  // 7. Publish check
  await publishGitHubCheck(decision);

  return decision;  // PASS/WARN/BLOCK based on real findings
}
```

**The Difference:**
- **Stub:** Always returns PASS, no actual validation
- **Real:** Makes real decisions based on real contract validation

---

# Part 15: Updated Implementation Timeline

## Week 1-2: Foundation (UPDATED)

**Goal:** Build core pipeline with 4 comparators + 2 obligations

**Tasks:**
1. **Surface Classifier** (2 days)
   - Implement `SurfaceClassifier` service
   - Add 3 surface types: `api_contract`, `privileged_infra`, `data_contract`
   - Path-based matchers
   - Tests: 10+ test cases

2. **ContractPack System** (2 days)
   - Implement `ContractResolver` service
   - Load `contractpacks.yaml` configuration
   - Pack activation logic
   - Seed data: PublicAPI + PrivilegedInfra packs
   - Tests: 10+ test cases

3. **Artifact Fetcher** (2 days)
   - Implement `SnapshotFetcher` service
   - GitHub file fetcher (OpenAPI, README, Terraform)
   - Soft-fail strategy (timeouts, fallbacks)
   - Snapshot caching (1-hour TTL)
   - Tests: 15+ test cases

4. **Core Comparators** (3 days)
   - `openapi.validate` (4 hours)
   - `openapi.diff` (8 hours)
   - `policy.version_bump` (4 hours)
   - `policy.file_updated` (2 hours)
   - Tests: 20+ test cases

5. **Core Obligations** (1 day)
   - `obligation.approval_required` (4 hours)
   - `obligation.file_present` (2 hours)
   - Tests: 10+ test cases

6. **Decision Engine** (1 day)
   - Risk score computation
   - Threshold mapping
   - Policy mode support
   - Tests: 10+ test cases

7. **Integration** (1 day)
   - Wire all components in `contractValidation.ts`
   - End-to-end test
   - Performance testing (< 30s target)

**Deliverable:** End-to-end pipeline working locally

---

## Week 3-4: GitHub Integration (UPDATED)

**Goal:** Publish GitHub Checks + add docs/infra comparators

**Tasks:**
1. **GitHub Check Publisher** (2 days)
   - Create Check Run on PR
   - Add annotations on files
   - Summary with findings
   - Link to evidence bundle
   - Tests: 10+ test cases

2. **Evidence Bundle Storage** (1 day)
   - S3 integration
   - Evidence bundle schema
   - 90-day retention
   - Tests: 5+ test cases

3. **Docs & Infra Comparators** (3 days)
   - `docs.anchor_check` (6 hours)
   - `terraform.risk_classifier` (8 hours)
   - `docs.required_sections` (3 hours)
   - `artifact.required` (2 hours)
   - Tests: 20+ test cases

4. **Additional Obligations** (0.5 days)
   - `obligation.min_reviewers` (2 hours)
   - Tests: 5+ test cases

5. **Integration Testing** (1.5 days)
   - Test with real PRs
   - Fix edge cases
   - Performance optimization

**Deliverable:** Real GitHub Checks on real PRs

---

## Week 5-6: Configuration UI + Rollout (UPDATED)

**Goal:** Make Track A configurable + roll out to 2 repos

**Tasks:**
1. **Configuration UI** (3 days)
   - Next.js page for `contractpacks.yaml` editing
   - Surface matcher configuration
   - Pack activation configuration
   - Policy threshold configuration

2. **Evidence Bundle Viewer** (1 day)
   - View evidence bundle details
   - Snapshot viewer
   - Finding details

3. **Documentation** (1 day)
   - Truth anchors guide
   - ContractPack authoring guide
   - Configuration guide

4. **Rollout** (3 days)
   - Configure 2 repos
   - Monitor for false positives
   - Iterate on thresholds
   - Collect feedback

**Deliverable:** 2 repos in production with < 5% false positive rate

---

**Ready to proceed with Week 1-2 implementation?**
