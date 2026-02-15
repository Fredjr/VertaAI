# Track A Requirements Coverage Assessment

**Date:** 2026-02-15  
**Document:** Assessment of TRACK_A_IMPLEMENTATION_PLAN_V2.md against architect's detailed requirements

---

## Executive Summary

**Overall Coverage:** ⚠️ **PARTIAL (60-70%)** - Core concepts present, but missing critical architectural details

**Status:**
- ✅ **HIGH-LEVEL CONCEPTS:** Well covered (surfaces, comparators, obligations, contract packs)
- ⚠️ **DETAILED SPECIFICATIONS:** Partially covered (missing 6-step pipeline, 8 surfaces taxonomy, 4 starter packs, obligation categories)
- ❌ **CONFIGURATION MODEL:** Not explicitly covered (common primitives vs customer config separation)
- ❌ **TRUTH ANCHORS STRATEGY:** Not covered (deterministic doc checks)
- ❌ **COMPARATOR FAMILIES:** Not covered (5 families with design principles)

---

## Detailed Gap Analysis

### ✅ COVERED: Core Architectural Concepts

| Requirement | Status | Evidence in Plan |
|-------------|--------|------------------|
| **Track A = Decision Engine** | ✅ COVERED | Part 2: "Track A makes a DECISION" |
| **Track B = Remediation Engine** | ✅ COVERED | Part 2: "Track B makes a PROPOSAL" |
| **Contract-Centric (not Agent-Centric)** | ✅ COVERED | Gap A: "Trigger on contract surface touched" |
| **Synchronous (< 30s)** | ✅ COVERED | Non-negotiables table |
| **Deterministic (no LLM for pass/fail)** | ✅ COVERED | Non-negotiables table |
| **High Precision (< 5% FP)** | ✅ COVERED | Success metrics |
| **Inline UX (GitHub Check)** | ✅ COVERED | Week 3-4 tasks |
| **Policy Enforcement** | ✅ COVERED | Week 5-6: ContractPolicy model |
| **Evidence Artifacts** | ✅ COVERED | Non-negotiables table |
| **Soft-Fail Strategy** | ✅ COVERED | Section 5.3 with code examples |
| **Surface Classification** | ✅ COVERED | Section 5.1 with 6 surfaces |
| **Comparators** | ✅ COVERED | Week 1-2: Wire comparators |
| **Obligations** | ✅ COVERED | Gap B: "Obligation enforcement" |
| **ContractPack** | ✅ COVERED | Week 5-6: ContractPack model |

---

### ⚠️ PARTIALLY COVERED: Detailed Specifications

#### 1. Common Primitives vs Customer Configuration

**Architect's Requirement:**
- **Common Primitives (you ship):** Surface, ContractPack, Artifact, Snapshot, Comparator, Finding, PolicyRule, RiskScore, GateDecision, EvidenceBundle
- **Engines (you ship):** SurfaceClassifier, ContractResolver, SnapshotFetcher, ComparatorRunner, PolicyEngine, RiskScorer, DecisionEngine, CheckPublisher
- **Customer Config (they define):** File-to-surface mappings, artifact locations, ContractPack activation, policy thresholds, approval requirements, graceful degradation rules, exemptions, rollout mode

**Current Plan Coverage:** ⚠️ **IMPLICIT BUT NOT EXPLICIT**
- Mentions surfaces, comparators, findings, ContractPack
- Does NOT explicitly separate "common primitives" vs "customer configuration"
- Does NOT list all 9 core objects
- Does NOT list all 8 engines

**Gap:** Need explicit section on "Common Primitives vs Customer Configuration" with full lists

---

#### 2. Surface Area Taxonomy (6-8 Surfaces)

**Architect's Requirement:**
1. **API Contract** - OpenAPI/proto/graphql schemas, controllers/handlers, SDK/public client libs
2. **Data Contract** - DB migrations, schema files, ORM models, event schemas
3. **Security Boundary** - authn/authz, secrets handling, permission checks, sensitive configs
4. **Identity & Access (IAM) / Network** - Terraform IAM/policies, security groups/firewall rules, roles and permissions
5. **Runtime Configuration** - k8s manifests, helm charts, env templates, feature flags
6. **Observability Contract** - alert rules, SLO definitions, dashboards-as-code, logging pipelines
7. **Operational Procedures** - runbooks, incident response docs, escalation policies
8. **User-facing Documentation / Dev Portal** - README, docs site, Confluence pages, API reference pages

**Current Plan Coverage:** ⚠️ **PARTIAL (6 of 8)**
- Section 5.1 defines: `'api' | 'infra' | 'data_model' | 'observability' | 'security' | 'docs'`
- Missing: **IAM/Network** (separate from infra), **Runtime Configuration** (separate from infra), **Operational Procedures** (separate from docs)
- Detection rules only for 3 surfaces (API, Infra, Docs)

**Gap:** Need full 8-surface taxonomy with detection rules for all

---

#### 3. The 6-Step Track A Pipeline

**Architect's Requirement:**
1. **Surface Classification** - Identify contract domains touched
2. **Contract Resolution** - Determine which artifacts are required
3. **Deterministic Integrity Comparison** - Run comparators
4. **Obligation Policy Enforcement** - Run rule engine
5. **Risk Scoring** - Compute risk from surface criticality + scope + agent-confidence + missing obligations
6. **GitHub Check Run** - Single check with all findings + decision

**Current Plan Coverage:** ⚠️ **IMPLICIT BUT NOT NUMBERED**
- Typical Flow (lines 37-44) describes similar steps but not as explicit 6-step pipeline
- Missing: Explicit "Step 1, Step 2, Step 3..." structure
- Missing: Obligation Policy Enforcement as separate step

**Gap:** Need explicit 6-step pipeline section

---

#### 4. Comparator Families (5 Families)

**Architect's Requirement:**
- **A) "Required artifact present" comparators** - OpenAPI must exist/updated, runbook must exist
- **B) "Version / reference consistency" comparators** - OpenAPI version matches README badge
- **C) "Schema compatibility" comparators** - Breaking vs non-breaking change classification
- **D) "Config-to-policy" comparators** - Terraform IAM risk rules, alerts align with SLO policy
- **E) "Cross-system alignment" comparators** - GitHub ↔ Confluence (restricted to anchors)

**Current Plan Coverage:** ❌ **NOT COVERED**
- Mentions "OpenAPI comparator" and "Terraform comparator" but no family taxonomy
- No design principles for each family
- No guidance on which families are gate-safe vs Track B

**Gap:** Need section on "Comparator Families" with 5 families + design principles

---

#### 5. Starter ContractPacks (4 Recommended)

**Architect's Requirement:**
1. **PublicAPI ContractPack**
   - Triggers: openapi + controllers
   - Comparators: OpenAPI validity + diff, version bump rule, changelog rule, docs anchor check
   - Obligations: API owners approval on breaking changes

2. **PrivilegedInfra ContractPack**
   - Triggers: terraform iam / network / k8s
   - Comparators: terraform risk classifier, required runbook section present
   - Obligations: rollback plan required, security approval required

3. **DataMigration ContractPack**
   - Triggers: migrations / schema
   - Comparators: migration present, backward compatibility marker
   - Obligations: migration plan file, tests updated

4. **Observability ContractPack**
   - Triggers: alert rules / slo config / dashboards-as-code
   - Comparators: thresholds align with SLO policy doc
   - Obligations: runbook updated for new alerts

**Current Plan Coverage:** ⚠️ **PARTIAL (2 of 4)**
- Week 5-6 mentions "2 packs (PublicAPI, PrivilegedInfra)"
- Missing: DataMigration, Observability
- Missing: Detailed specifications for each pack (triggers, comparators, obligations)

**Gap:** Need full specifications for all 4 starter packs

---

### ❌ NOT COVERED: Critical Architectural Details

#### 7. Truth Anchors Strategy (Deterministic Docs Checks)

**Architect's Requirement:**
> "The fix: 'truth anchors' - Require docs to include deterministic markers you can check"

**Examples:**
- `OPENAPI_SHA: ...`
- `API_VERSION: ...`
- `LAST_SYNCED_COMMIT: ...`
- Required section headers

**Rationale:**
- Deep doc semantic comparisons are NOT deterministic
- Track A can reliably enforce: "Docs updated in same PR" OR "Docs reference latest spec hash"
- Track B handles full semantic rewrite if needed

**Current Plan Coverage:** ❌ **NOT COVERED**
- No mention of truth anchors
- No strategy for deterministic Confluence/doc checks
- Section 5.3 (Soft-Fail) handles external system failures but not deterministic validation

**Gap:** Need section on "Truth Anchors Strategy for Deterministic Docs Checks"

---

#### 8. Detailed ContractPack Schema (YAML Examples)

**Architect's Requirement:**
> "I can draft a concrete `contractpacks.yaml` schema (with examples for PublicAPI + PrivilegedInfra)"

**Expected:**
- Full YAML schema for ContractPack configuration
- Example: PublicAPI pack with triggers, comparators, obligations
- Example: PrivilegedInfra pack with triggers, comparators, obligations

**Current Plan Coverage:** ❌ **NOT COVERED**
- Week 5-6 mentions Prisma schema fields but no YAML config format
- No concrete examples of how customers would configure packs

**Gap:** Need "ContractPack Configuration Schema" section with YAML examples

---

#### 9. The 10-Step Track A Pipeline (Detailed)

**Architect's Requirement:**
> "Here's the concrete pipeline with config points marked"

**Steps:**
0. Trigger (GitHub PR event)
1. PR Context Collector (common)
2. SurfaceClassifier (common + config)
3. ContractResolver (common + config)
4. SnapshotFetcher (common + config)
5. ComparatorRunner (common)
6. PolicyEngine / ObligationRunner (common + config)
7. RiskScorer (common + config)
8. DecisionEngine (common + config)
9. GitHub Check Publisher (common)
10. Optional: Spawn Track B (common)

**Current Plan Coverage:** ⚠️ **PARTIAL**
- "Typical Flow" (lines 37-44) has 6 steps, not 10
- Missing: PR Context Collector, PolicyEngine/ObligationRunner as separate step, Spawn Track B

**Gap:** Need full 10-step pipeline with config points marked

---

#### 10. Comparator Interface & Design Principles

**Architect's Requirement:**
> "You want a stable interface like: Input: snapshots of two or more artifacts + PR context, Output: list of Findings"

**Comparator Contract:**
- **Deterministic**: no model calls
- **Explainable**: evidence points to exact diffs / missing anchors
- **Configurable**: supports per-customer mappings/rules
- **Graceful**: can return "UNVERIFIABLE" with reason

**Finding Schema:**
- `finding_type`: e.g., `OPENAPI_BREAKING_CHANGE_WITHOUT_VERSION_BUMP`
- `severity`: INFO/WARN/BLOCK
- `confidence`: 0–1
- `evidence`: pointers to snapshot hashes + diff fragments
- `remediation_hint`: "Update openapi.yaml version"
- `contract_pack`: "PublicAPI"
- `surface`: API_CONTRACT

**Current Plan Coverage:** ⚠️ **PARTIAL**
- Section 5.2 has IntegrityFinding schema but missing comparator-specific fields
- Missing: `finding_type` (uses `driftType`), `contract_pack`, `surface`, `remediation_hint` (uses `recommendedAction`)
- Missing: Comparator interface specification
- Missing: Design principles (deterministic, explainable, configurable, graceful)

**Gap:** Need "Comparator Interface & Design Principles" section

---

## Summary of Missing Content

### Critical Gaps (Must Add)

1. ❌ **Common Primitives vs Customer Configuration** - Explicit separation with full lists
2. ❌ **8-Surface Taxonomy** - Full taxonomy with detection rules for all 8
3. ❌ **6-Step Track A Pipeline** - Explicit numbered pipeline
4. ❌ **5 Comparator Families** - Taxonomy with design principles
5. ❌ **4 Starter ContractPacks** - Full specifications (triggers, comparators, obligations)
6. ❌ **4 Obligation Rule Categories** - Explicit taxonomy with examples
7. ❌ **Truth Anchors Strategy** - Deterministic docs checks
8. ❌ **ContractPack YAML Schema** - Concrete configuration examples
9. ❌ **10-Step Pipeline** - Detailed pipeline with config points
10. ❌ **Comparator Interface** - Stable interface + design principles

### Medium Priority Gaps (Should Add)

11. ⚠️ **Surface Matcher Strategies** - Path-based, file-type, content signatures, repo metadata
12. ⚠️ **Why Surfaces Matter** - Decision tree (which packs trigger, which artifacts fetch, etc.)
13. ⚠️ **Comparator Sharing Between Track A and Track B** - Operating modes (gate-grade vs remediation-grade)
14. ⚠️ **Evidence Bundle Schema** - Immutable record format
15. ⚠️ **Circuit Breaker Pattern** - Disable external checks after 3 failures

---

## Recommendations

### Option 1: Extend TRACK_A_IMPLEMENTATION_PLAN_V2.md (Recommended)

**Add new sections:**
- Part 9: Common Primitives vs Customer Configuration
- Part 10: 8-Surface Taxonomy (Full Specification)
- Part 11: 6-Step Track A Pipeline
- Part 12: 5 Comparator Families
- Part 13: 4 Starter ContractPacks (Full Specifications)
- Part 14: 4 Obligation Rule Categories
- Part 15: Truth Anchors Strategy
- Part 16: ContractPack Configuration Schema (YAML Examples)

**Estimated Size:** +400-500 lines

---

### Option 2: Create Separate Architecture Document

**Create:** `TRACK_A_DETAILED_ARCHITECTURE.md`

**Content:**
- All 10 critical gaps above
- Reference from implementation plan

**Pros:**
- Keeps implementation plan focused on timeline/tasks
- Separates "what to build" from "how it works architecturally"

**Cons:**
- Two documents to maintain
- Risk of divergence

---

### Option 3: Create Appendix in Implementation Plan

**Add:** "Appendix: Detailed Architectural Specifications"

**Content:**
- All 10 critical gaps as appendix sections
- Keep main plan focused on 8-week timeline

**Pros:**
- Single document
- Clear separation between plan and specs

**Cons:**
- Very long document (1200+ lines)

---

## Recommended Action

**I recommend Option 1: Extend TRACK_A_IMPLEMENTATION_PLAN_V2.md**

**Rationale:**
- Implementation plan should be self-contained
- Engineers need architectural details to implement correctly
- Better to have one comprehensive document than split knowledge

**Next Steps:**
1. Add Part 9-16 to TRACK_A_IMPLEMENTATION_PLAN_V2.md
2. Update table of contents
3. Commit with message: "docs: Add detailed architectural specifications to Track A plan"

**Would you like me to proceed with adding these sections?**
#### 6. Obligation Rule Categories (4 Types)

**Architect's Requirement:**
- **A) Approval Obligations** - CODEOWNER approval, 2 reviewers if risk >= X, security approval
- **B) Evidence Obligations** - rollback.md required, migration_plan.md required, customer_impact.md required
- **C) Test Obligations** - tests updated, migration tests included
- **D) Release Obligations** - changelog updated, version bump required

**Current Plan Coverage:** ⚠️ **MENTIONED BUT NOT CATEGORIZED**
- Gap B mentions "Obligation enforcement (evidence, approvals, tests, release)"
- Gap C mentions `source: 'obligation_policy'`
- Missing: Explicit 4-category taxonomy
- Missing: Examples for each category

**Gap:** Need section on "Obligation Rule Categories" with 4 types + examples

---


