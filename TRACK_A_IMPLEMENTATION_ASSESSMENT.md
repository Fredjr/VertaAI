# Track A Implementation Assessment: Critical Analysis

**Date:** 2026-02-15  
**Assessor:** Senior Architect Review  
**Scope:** Detailed implementation plan to achieve target state from current product state  
**Reference:** GAP_ANALYSIS_TRACK_A_ARCHITECTURE.md

---

## Executive Summary

**Overall Assessment:** ⚠️ **HIGH RISK - Significant architectural debt and unclear path forward**

**Key Finding:** We have built TWO separate Track A systems that fundamentally conflict with each other. The gap analysis correctly identifies the problems, but the proposed implementation plan underestimates the complexity and risk of unifying them.

**Critical Issues:**
1. **Architectural Conflict:** Agent PR Gatekeeper is FULLY IMPLEMENTED with a complete GitHub Check integration, while Contract Validation is a STUB. Merging them requires careful deprecation strategy.
2. **Missing Foundation:** Surface classification doesn't exist yet, but it's the foundation for everything else.
3. **Data Model Confusion:** We have DeltaSyncFinding (gatekeeper) and IntegrityFinding (contracts) with incompatible schemas.
4. **Customer Impact:** Renaming "Agent PR Gatekeeper" to "Contract Integrity Gate" will confuse existing users if not handled carefully.
5. **Scope Creep Risk:** The gap analysis proposes a massive scope (6-8 surfaces, 4 contract packs, obligation engine, etc.) that could take 8-12 weeks, not 2-3 weeks.

---

## Part 1: Current State Reality Check

### What We Actually Have (Code Review)

#### ✅ **Agent PR Gatekeeper - FULLY IMPLEMENTED**

**Location:** `apps/api/src/services/gatekeeper/`

**Components:**
- ✅ `agentDetector.ts` - Detects agent-authored PRs (author patterns, commit markers, file patterns)
- ✅ `evidenceChecker.ts` - Checks domain-specific evidence requirements (rollback notes, migration notes, etc.)
- ✅ `riskTier.ts` - Calculates risk tier (PASS/INFO/WARN/BLOCK) based on multiple factors
- ✅ `deltaSync.ts` - Analyzes delta sync findings
- ✅ `githubCheck.ts` - Creates GitHub Check runs with full formatting
- ✅ `index.ts` - Main orchestrator (8 steps)

**Integration:**
- ✅ Webhook integration (`apps/api/src/routes/webhooks.ts` lines 481-516)
- ✅ Feature flag: `ENABLE_AGENT_PR_GATEKEEPER`
- ✅ GitHub Check name: "VertaAI Agent PR Gatekeeper"
- ✅ Creates Check with conclusion: success/neutral/failure/action_required

**Trigger Logic:**
```typescript
if (shouldRunGatekeeper({ author: prInfo.authorLogin, labels })) {
  // Runs for all PRs except trusted bots or skip labels
}
```

**Risk Scoring:**
- Hard-coded thresholds: 0.80 (BLOCK), 0.60 (WARN), 0.30 (INFO)
- Factors: agent confidence (30%), high-risk domains (25%), missing evidence (45%), impact score (20%)
- Domains: auth, deployment, database, security, infra

**Evidence Requirements:**
- Deployment: rollback notes, runbook links
- Database: migration notes
- API: breaking change docs
- Universal: test updates or exemption notes

**Status:** ✅ PRODUCTION READY - Fully tested, documented, integrated

---

#### ⚠️ **Contract Validation - STUB IMPLEMENTATION**

**Location:** `apps/api/src/services/contracts/`

**Components:**
- ✅ `contractResolver.ts` - Contract resolution with 5 strategies (COMPLETE - 491 lines)
- ✅ `comparators/base.ts` - Base comparator (COMPLETE - 399 lines, 26/26 tests passing)
- ✅ `comparators/openapi.ts` - OpenAPI comparator (COMPLETE - 413 lines, 13/13 tests passing)
- ✅ `comparators/terraform.ts` - Terraform comparator (COMPLETE - 604 lines, 13/13 tests passing)
- ✅ `findingRepository.ts` - CRUD for IntegrityFinding (COMPLETE - 289 lines, 8/8 tests passing)
- ⚠️ `contractValidation.ts` - Main orchestrator (STUB - 149 lines)

**Integration:**
- ✅ Webhook integration (`apps/api/src/routes/webhooks.ts` lines 523-544)
- ✅ Feature flag: `ENABLE_CONTRACT_VALIDATION`
- ❌ GitHub Check creation: NOT IMPLEMENTED (line 539: "TODO: Create GitHub Check")

**Current Implementation:**
```typescript
export async function runContractValidation(input: ContractValidationInput): Promise<ContractValidationResult> {
  // TODO: Step 1: Resolve applicable contracts
  // TODO: Step 2: Fetch artifact snapshots
  // TODO: Step 3: Run comparators
  // For now, return early with PASS status
  console.log(`[ContractValidation] Contract resolution and artifact fetching not yet implemented`);
  
  const allFindings: IntegrityFinding[] = [];
  const riskTier = calculateRiskTier(allFindings);
  
  return {
    ...riskTier,
    findings: allFindings,
    contractsChecked: 0,
    duration,
  };
}
```

**Status:** ⚠️ STUB - Returns PASS for all PRs, no actual validation performed

---

### Data Model Incompatibility

**DeltaSyncFinding (from Agent PR Gatekeeper):**
```typescript
export interface DeltaSyncFinding {
  type: 'endpoint_missing' | 'schema_mismatch' | 'example_outdated' | 'config_drift';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  path?: string;
  line?: number;
  evidence: {
    expected?: any;
    actual?: any;
    diff?: string;
  };
}
```

**IntegrityFinding (from Contract Validation):**
```typescript
export interface IntegrityFinding {
  workspaceId: string;
  id: string;
  contractId: string;
  invariantId: string;
  driftType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  compared: Json;
  evidence: Json;
  confidence: number;
  impact: number;
  band: 'pass' | 'warn' | 'fail';
  recommendedAction: string;
  ownerRouting: Json;
  affectedFiles: string[];
  suggestedDocs: string[];
  createdAt: DateTime;
}
```

**Problem:** These cannot be aggregated into a single GitHub Check without schema unification.

---

## Part 2: Gap Analysis Validation

### Gaps Identified in GAP_ANALYSIS_TRACK_A_ARCHITECTURE.md

**Gap A: Agent-Centric vs Contract-Centric** ✅ VALID
- Current: Trigger is `shouldRunGatekeeper({ author })` - author-based
- Target: Trigger should be surface-based (OpenAPI changed, Terraform changed, etc.)
- Impact: HIGH - Limits PMF to AI-heavy teams

**Gap B: Two Parallel Systems** ✅ VALID
- Current: Agent PR Gatekeeper (complete) + Contract Validation (stub) run separately
- Target: Unified 6-step pipeline
- Impact: HIGH - Confusing UX, duplicate code

**Gap C: Finding Model Not Unified** ✅ VALID
- Current: DeltaSyncFinding vs IntegrityFinding
- Target: Single IntegrityFinding schema with `source` field
- Impact: MEDIUM - Blocks unified GitHub Check

**Gap D: No Blocking Policy Configuration** ✅ VALID
- Current: Hard-coded thresholds (0.80, 0.60, 0.30)
- Target: ContractPack + ContractPolicy models with per-workspace config
- Impact: HIGH - Cannot do gradual rollout

**Gap E: Trigger Logic Misalignment** ✅ VALID
- Current: Author-based trigger (all PRs except trusted bots)
- Target: Surface-based trigger (detect contract surfaces)
- Impact: HIGH - Misses non-agent PRs that touch contracts

---

## Part 3: Critical Assessment of Proposed Implementation Plan

### Phase 1: Surface Classification (1 day) - ⚠️ UNDERESTIMATED

**Proposed:**
- Create `surfaceClassifier.ts`
- Implement 6 surface types
- Write 20+ tests
- Integrate into webhook

**Reality Check:**

This is the FOUNDATION for everything else. If surface classification is wrong, everything downstream breaks.

**Actual Complexity:**
1. **Pattern Matching Accuracy** - Need to test against real repos to avoid false positives
2. **Multi-Surface Files** - What if a file touches both API and Database surfaces?
3. **Confidence Scoring** - How do we handle ambiguous files?
4. **Performance** - Need to classify 100+ files in < 1s
5. **Edge Cases** - Monorepo vs multi-repo, nested paths, symlinks, etc.

**Realistic Estimate:** 2-3 days (not 1 day)

**Risks:**
- ❌ False positives → Triggers wrong contract packs → Noise
- ❌ False negatives → Misses contract violations → Security risk
- ❌ Performance issues → Slows down PR checks → Bad UX

**Recommendation:** Start with 2-3 surfaces (API, Infra, Docs) and expand incrementally.

---

### Phase 2: Rename & Reframe (4 hours) - ⚠️ CUSTOMER IMPACT UNDERESTIMATED

**Proposed:**
- Rename feature flag
- Rename service directory
- Update docs
- Update marketing copy

**Reality Check:**

This is NOT just a find-and-replace. We have PRODUCTION USERS using "Agent PR Gatekeeper" right now.

**Actual Impact:**
1. **GitHub Check Name Change** - "VertaAI Agent PR Gatekeeper" → "VertaAI Contract Integrity Gate"
   - Existing PRs will show BOTH checks (old + new) during transition
   - Users will be confused: "Why do I have two checks?"
2. **Feature Flag Migration** - `ENABLE_AGENT_PR_GATEKEEPER` → `ENABLE_CONTRACT_INTEGRITY_GATE`
   - Need migration script for existing workspaces
   - Need backward compatibility period
3. **Documentation** - All existing docs, screenshots, videos reference "Agent PR Gatekeeper"
   - Need to update or deprecate
4. **Customer Communication** - Need to notify users of the change
   - Email campaign, changelog, migration guide

**Realistic Estimate:** 1-2 days (not 4 hours)

**Risks:**
- ❌ Breaking change for existing users
- ❌ Confusion during transition period
- ❌ Support tickets: "Where did Agent PR Gatekeeper go?"

**Recommendation:**
- Keep both feature flags during transition (4-8 weeks)
- Deprecate `ENABLE_AGENT_PR_GATEKEEPER` with sunset date
- Add banner in UI: "Agent PR Gatekeeper is now Contract Integrity Gate"

---

### Phase 3: ContractPack Configuration (2 days) - ⚠️ SIGNIFICANTLY UNDERESTIMATED

**Proposed:**
- Add ContractPack Prisma model
- Add ContractPolicy Prisma model
- Create CRUD API
- Create UI
- Create seed data

**Reality Check:**

This is a MAJOR feature, not a 2-day task.

**Actual Scope:**
1. **Data Model Design** (1 day)
   - ContractPack schema (triggers, artifacts, comparators, obligations, thresholds)
   - ContractPolicy schema (workspace-level defaults)
   - Migration strategy (how to migrate existing hard-coded config)
   - Validation rules (what combinations are valid?)

2. **Backend Implementation** (2-3 days)
   - Prisma schema + migration
   - CRUD API endpoints (8 endpoints: list, get, create, update, delete, activate, deactivate, test)
   - Validation logic (prevent invalid configs)
   - Seed data (4 starter packs: PublicAPI, PrivilegedInfra, DataMigration, Observability)
   - Tests (20+ test cases)

3. **Frontend Implementation** (2-3 days)
   - Settings page UI (list view, detail view, create/edit form)
   - Form validation
   - Preview/test functionality ("Test this pack against a PR")
   - Documentation tooltips

4. **Integration** (1-2 days)
   - Update contract resolver to use ContractPack config
   - Update risk scorer to use ContractPolicy thresholds
   - Update GitHub Check to show which packs were triggered
   - Backward compatibility (fallback to hard-coded config if no packs defined)

**Realistic Estimate:** 6-8 days (not 2 days)

**Risks:**
- ❌ Complex UI → Hard to use → Low adoption
- ❌ Invalid configs → Runtime errors → PRs blocked incorrectly
- ❌ Migration issues → Existing workspaces break

**Recommendation:**
- Phase 3a: Backend only (3 days) - API + seed data
- Phase 3b: Frontend (3 days) - UI for managing packs
- Phase 3c: Integration (2 days) - Wire into pipeline

---

### Phase 4: Unify Finding Model (1 day) - ✅ REASONABLE

**Proposed:**
- Extend IntegrityFinding schema
- Migrate DeltaSyncFinding → IntegrityFinding
- Update all finding creation code

**Reality Check:**

This is actually reasonable IF we do it carefully.

**Actual Steps:**
1. Extend IntegrityFinding schema with `source` field
2. Create adapter: `DeltaSyncFinding → IntegrityFinding`
3. Update Agent PR Gatekeeper to use adapter
4. Update GitHub Check formatter to handle both sources
5. Tests (10+ test cases)

**Realistic Estimate:** 1-2 days ✅

**Risks:**
- ❌ Data loss during migration
- ❌ Breaking changes to existing findings

**Recommendation:**
- Add `source` field as optional first
- Run both schemas in parallel for 1 week
- Migrate once confident

---

### Phase 5: Unified Pipeline (2 days) - ❌ SEVERELY UNDERESTIMATED

**Proposed:**
- Merge Agent PR Gatekeeper + Contract Validation
- Implement 6-step pipeline
- Update webhook integration
- Tests

**Reality Check:**

This is the MOST COMPLEX phase. We're merging two complete systems with different architectures.

**Actual Complexity:**

**Step 1: Surface Classification** (already covered in Phase 1)

**Step 2: Contract Resolution** (1-2 days)
- Current: ContractResolver exists but not wired
- Need: Map surfaces → contract packs
- Need: Handle multiple packs per surface
- Need: Confidence scoring for resolution
- Need: Fallback when no packs match

**Step 3: Deterministic Integrity Comparison** (2-3 days)
- Current: Comparators exist (OpenAPI, Terraform) but not wired
- Need: Fetch artifact snapshots (GitHub, Confluence, Grafana)
- Need: Handle external system failures (soft-fail strategy)
- Need: Cache snapshots (avoid re-fetching)
- Need: Run comparators in parallel (performance)
- Need: Aggregate findings from multiple comparators

**Step 4: Obligation Policy Enforcement** (3-4 days)
- Current: Evidence checker exists but limited
- Need: NEW obligation engine (approval, evidence, test, release obligations)
- Need: Map change surfaces → required obligations
- Need: Check CODEOWNERS for approval obligations
- Need: Check file presence for evidence obligations
- Need: Deterministic evaluation (no LLM)

**Step 5: Risk Scoring** (1-2 days)
- Current: Risk tier calculator exists
- Need: Integrate surface criticality
- Need: Integrate obligation failures
- Need: Integrate comparator findings
- Need: Configurable weights (from ContractPolicy)

**Step 6: GitHub Check Run** (1-2 days)
- Current: GitHub Check creator exists
- Need: Format findings from multiple sources
- Need: Group findings by contract pack
- Need: Show surface areas touched
- Need: Show which obligations failed
- Need: Link to evidence bundles

**Realistic Estimate:** 8-12 days (not 2 days)

**Risks:**
- ❌ Breaking existing Agent PR Gatekeeper functionality
- ❌ Performance regression (> 30s)
- ❌ External system failures block PRs
- ❌ Complex error handling

**Recommendation:**
- Build unified pipeline as NEW service (`contractGate/`)
- Run in parallel with existing gatekeeper (A/B test)
- Migrate workspaces gradually (opt-in beta)
- Deprecate old gatekeeper after 4-8 weeks

---

## Part 4: Missing Critical Components

### 1. Obligation Engine - NOT IMPLEMENTED

**Gap Analysis Mentions:**
- Approval obligations (CODEOWNERS, 2-reviewer rule)
- Evidence obligations (rollback.md, migration_plan.md)
- Test obligations (tests updated)
- Release obligations (changelog, version bump)

**Current State:**
- Evidence checker exists but limited (only checks PR body text)
- No CODEOWNERS integration
- No file presence checks
- No version bump detection

**Effort:** 3-4 days

---

### 2. External System Integration - PARTIALLY IMPLEMENTED

**Required Integrations:**
- ✅ GitHub (file fetching) - EXISTS
- ⚠️ Confluence (page fetching) - EXISTS but not wired to Track A
- ❌ Grafana (dashboard fetching) - NOT IMPLEMENTED
- ❌ Terraform Cloud (plan fetching) - NOT IMPLEMENTED
- ❌ Notion (page fetching) - NOT IMPLEMENTED

**Soft-Fail Strategy:**
- NOT IMPLEMENTED
- Need: Timeout handling (< 5s per external call)
- Need: Fallback to WARN when external system down
- Need: Cache external artifacts (TTL: 1 hour)

**Effort:** 2-3 days

---

### 3. Truth Anchors - NOT IMPLEMENTED

**Gap Analysis Mentions:**
- Docs should include `OPENAPI_SHA: ...`
- Docs should include `API_VERSION: ...`
- Docs should include `LAST_SYNCED_COMMIT: ...`

**Current State:**
- NOT IMPLEMENTED
- No anchor detection
- No anchor validation

**Effort:** 1-2 days

---

### 4. Evidence Bundle Storage - PARTIALLY IMPLEMENTED

**Gap Analysis Mentions:**
- GateRun model (PR context, decision, policy hash, evidence hash)
- GateFinding model (findings with evidence refs)
- Evidence bundle "fast lane" schema

**Current State:**
- DriftCandidate model exists (Track B)
- No GateRun model (Track A)
- No evidence bundle storage for Track A

**Effort:** 1-2 days

---

## Part 5: Realistic Implementation Timeline

### Conservative Estimate (Senior Engineer, Full-Time)

**Phase 1: Foundation (Week 1-2) - 10 days**
- Surface Classification (2-3 days)
- Obligation Engine (3-4 days)
- External System Integration + Soft-Fail (2-3 days)

**Phase 2: Data Model & Configuration (Week 3-4) - 10 days**
- ContractPack Backend (3 days)
- ContractPack Frontend (3 days)
- ContractPolicy Model (2 days)
- Unify Finding Model (2 days)

**Phase 3: Unified Pipeline (Week 5-7) - 15 days**
- Contract Resolution Integration (2 days)
- Comparator Integration + Artifact Fetching (3 days)
- Obligation Policy Enforcement (3 days)
- Risk Scoring Integration (2 days)
- GitHub Check Integration (2 days)
- Testing + Bug Fixes (3 days)

**Phase 4: Migration & Rollout (Week 8-9) - 10 days**
- Rename & Reframe (2 days)
- Backward Compatibility (2 days)
- Customer Migration (2 days)
- Documentation (2 days)
- Beta Testing (2 days)

**Phase 5: Deprecation (Week 10-12) - 15 days**
- Monitor beta users (5 days)
- Fix issues (5 days)
- Migrate all workspaces (3 days)
- Deprecate old gatekeeper (2 days)

**Total: 60 days (12 weeks) for one senior engineer**

**With 2 engineers: 6-8 weeks**

---

## Part 6: Critical Risks & Mitigation

### Risk 1: Breaking Existing Functionality ⚠️ HIGH

**Problem:** Agent PR Gatekeeper is PRODUCTION READY and used by customers. Merging it with Contract Validation could break existing functionality.

**Mitigation:**
- ✅ Build unified pipeline as NEW service (don't modify existing gatekeeper)
- ✅ Run both in parallel during transition (feature flag: `ENABLE_UNIFIED_CONTRACT_GATE`)
- ✅ A/B test with 10% of workspaces first
- ✅ Monitor error rates, latency, false positive rates
- ✅ Rollback plan: disable unified pipeline, fall back to old gatekeeper

---

### Risk 2: Performance Regression ⚠️ HIGH

**Problem:** Unified pipeline has more steps (6 vs 8 in old gatekeeper). Could exceed 30s latency target.

**Mitigation:**
- ✅ Parallel execution (surface classification + contract resolution + artifact fetching)
- ✅ Caching (artifact snapshots, CODEOWNERS, external docs)
- ✅ Timeouts (5s per external call, 30s total)
- ✅ Performance testing (simulate 100+ file PRs)
- ✅ Monitoring (track p50, p95, p99 latency)

---

### Risk 3: External System Failures Block PRs ⚠️ CRITICAL

**Problem:** If Confluence/Grafana/Notion is down, PRs could be blocked incorrectly.

**Mitigation:**
- ✅ Soft-fail strategy (WARN instead of BLOCK when external system down)
- ✅ Timeouts (5s per call)
- ✅ Circuit breaker (disable external checks after 3 consecutive failures)
- ✅ Fallback to local artifacts only (GitHub files)
- ✅ Status page integration (check if Confluence is down before calling)

---

### Risk 4: Complex Configuration → Low Adoption ⚠️ HIGH

**Problem:** ContractPack configuration is complex (triggers, artifacts, comparators, obligations, thresholds). Users might not understand how to configure it.

**Mitigation:**
- ✅ Starter packs (PublicAPI, PrivilegedInfra, DataMigration, Observability)
- ✅ Wizard UI ("What do you want to validate?" → generates config)
- ✅ Preview/test functionality ("Test this pack against PR #123")
- ✅ Documentation (video walkthrough, examples)
- ✅ Defaults (sensible defaults that work for 80% of users)

---

### Risk 5: Scope Creep ⚠️ CRITICAL

**Problem:** Gap analysis proposes 6-8 surfaces, 4 contract packs, obligation engine, truth anchors, etc. This is a MASSIVE scope.

**Mitigation:**
- ✅ MVP first: 2-3 surfaces (API, Infra, Docs), 2 contract packs (PublicAPI, PrivilegedInfra)
- ✅ Incremental rollout: Add surfaces/packs one at a time
- ✅ Customer feedback: Validate each surface/pack with real users before building next
- ✅ Kill criteria: If adoption < 20% after 4 weeks, pause and reassess

---

## Part 7: Recommended Approach

### Option A: Big Bang Rewrite (12 weeks, HIGH RISK) ❌ NOT RECOMMENDED

**Approach:**
- Build unified pipeline from scratch
- Migrate all workspaces at once
- Deprecate old gatekeeper immediately

**Pros:**
- Clean architecture
- No technical debt

**Cons:**
- ❌ High risk of breaking existing functionality
- ❌ Long development time (12 weeks)
- ❌ No customer feedback until end
- ❌ All-or-nothing (can't rollback easily)

---

### Option B: Incremental Migration (8-10 weeks, MEDIUM RISK) ✅ RECOMMENDED

**Approach:**
- Build unified pipeline as NEW service
- Run both in parallel (old + new)
- Migrate workspaces gradually (opt-in beta → auto-migrate → deprecate old)
- Start with MVP (2 surfaces, 2 packs) → expand incrementally

**Pros:**
- ✅ Lower risk (can rollback)
- ✅ Customer feedback early
- ✅ Incremental value delivery
- ✅ Existing functionality not disrupted

**Cons:**
- ⚠️ More complex (maintain two systems temporarily)
- ⚠️ Longer total timeline (8-10 weeks)

**Timeline:**

**Week 1-2: MVP Foundation**
- Surface Classification (API, Infra, Docs only)
- Obligation Engine (approval + evidence obligations only)
- External System Integration (GitHub + Confluence only, soft-fail)

**Week 3-4: MVP Configuration**
- ContractPack Backend (2 packs: PublicAPI, PrivilegedInfra)
- Seed data + API
- Unify Finding Model

**Week 5-6: MVP Pipeline**
- Build unified pipeline (6 steps)
- Integration testing
- Beta deployment (10% of workspaces)

**Week 7-8: Feedback & Iteration**
- Monitor beta users
- Fix issues
- Add 1-2 more surfaces based on feedback

**Week 9-10: Migration & Deprecation**
- Migrate all workspaces
- Deprecate old gatekeeper
- Documentation

---

### Option C: Hybrid Approach (6-8 weeks, LOW RISK) ✅ ALSO RECOMMENDED

**Approach:**
- Keep Agent PR Gatekeeper as-is (don't touch it)
- Build Contract Validation as SEPARATE system
- Let customers choose which one to use (or both)
- Eventually merge when both are mature

**Pros:**
- ✅ Lowest risk (no breaking changes)
- ✅ Fastest time to value (6-8 weeks)
- ✅ Customer choice (flexibility)
- ✅ Can validate PMF before committing to merge

**Cons:**
- ⚠️ Two systems to maintain (technical debt)
- ⚠️ Confusing UX (two separate checks)

**Timeline:**

**Week 1-2: Contract Validation MVP**
- Surface Classification (API, Infra only)
- Wire Contract Resolution
- Wire Comparators (OpenAPI, Terraform)

**Week 3-4: GitHub Check Integration**
- Create GitHub Check from Contract Validation
- Format findings
- Test with real PRs

**Week 5-6: Configuration & Rollout**
- ContractPack Backend (2 packs)
- Beta deployment
- Customer feedback

**Week 7-8: Iteration**
- Add more surfaces/packs based on feedback
- Decide: merge with gatekeeper OR keep separate

---

## Part 8: Final Recommendation

### Recommended Path: **Option C (Hybrid Approach)**

**Why:**
1. **Lowest Risk** - Don't touch existing Agent PR Gatekeeper (it works!)
2. **Fastest Time to Value** - 6-8 weeks to production
3. **Validate PMF** - See if customers actually want contract validation before committing to big rewrite
4. **Flexibility** - Can merge later if both systems prove valuable

**Concrete Next Steps:**

**Week 1-2: Foundation**
1. Create `apps/api/src/services/contractGate/surfaceClassifier.ts`
   - Implement 2-3 surfaces (API, Infra, Docs)
   - Write 15+ tests
   - Integrate into webhook (separate from gatekeeper)

2. Wire Contract Resolution
   - Update `contractValidation.ts` to actually call `ContractResolver`
   - Handle resolution failures gracefully

3. Wire Comparators
   - Update `contractValidation.ts` to fetch snapshots + run comparators
   - Implement soft-fail for external systems

**Week 3-4: GitHub Check**
1. Create `apps/api/src/services/contractGate/githubCheck.ts`
   - Format IntegrityFindings into GitHub Check
   - Show contract packs triggered
   - Show surfaces touched
   - Link to evidence

2. Update webhook to create GitHub Check
   - Remove TODO comment (line 539)
   - Call `createContractValidationCheck()`

**Week 5-6: Configuration & Beta**
1. Add ContractPack model (backend only, no UI yet)
2. Create seed data (2 packs: PublicAPI, PrivilegedInfra)
3. Deploy to beta workspaces (10%)
4. Monitor: latency, error rate, false positive rate

**Week 7-8: Iteration & Decision**
1. Gather customer feedback
2. Fix issues
3. Decide:
   - If adoption > 50% → Continue expanding (add more surfaces/packs)
   - If adoption < 20% → Pause and reassess PMF
   - If both gatekeeper + contract validation are valuable → Plan merge (Option B)
   - If only one is valuable → Deprecate the other

---

## Part 9: Success Criteria

### Week 2 (Foundation Complete)
- ✅ Surface classification working for 2-3 surfaces
- ✅ Contract resolution wired and tested
- ✅ Comparators running and generating findings
- ✅ < 30s latency for 100-file PRs

### Week 4 (GitHub Check Complete)
- ✅ GitHub Check created for Contract Validation
- ✅ Findings formatted and actionable
- ✅ Soft-fail working (external system failures → WARN not BLOCK)
- ✅ Zero false blocks in testing

### Week 6 (Beta Deployed)
- ✅ 10% of workspaces using Contract Validation
- ✅ < 5% false positive rate
- ✅ < 30s p95 latency
- ✅ Zero production incidents

### Week 8 (Decision Point)
- ✅ Customer feedback collected (surveys, interviews)
- ✅ Adoption rate measured (% of PRs checked)
- ✅ Value demonstrated (# of contract violations caught)
- ✅ Decision made: expand, pause, or merge

---

## Conclusion

**The gap analysis is EXCELLENT** - it correctly identifies all the problems and proposes a sound target architecture.

**The implementation plan is OPTIMISTIC** - it underestimates complexity by 3-6x.

**The recommended approach is HYBRID** - build Contract Validation separately, validate PMF, then decide whether to merge.

**The realistic timeline is 6-8 weeks for MVP** (not 2-3 weeks), with 8-12 weeks for full unification if we decide to merge.

**The critical success factor is INCREMENTAL DELIVERY** - ship small, get feedback, iterate. Don't try to build the perfect system in one go.

---

**Next Action:** Review this assessment with the team and decide:
1. Do we agree with the Hybrid Approach (Option C)?
2. Are we willing to maintain two systems temporarily?
3. Do we have 6-8 weeks to invest in this?
4. What are our kill criteria if adoption is low?

