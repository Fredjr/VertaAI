# Track A Detailed Requirements Assessment

**Date:** 2026-02-15  
**Assessment:** Coverage of architect's detailed implementation design in TRACK_A_IMPLEMENTATION_PLAN_V2.md

---

## Executive Summary

**Overall Coverage:** ❌ **CRITICAL GAPS (20-30%)** - High-level concepts present, but missing ALL detailed implementation specifications

**Critical Finding:** The implementation plan covers the **WHAT** (build Contract Integrity Gate) but is missing the **HOW** (detailed schemas, interfaces, pipeline wiring, configuration model).

**Architect's Core Definition:**
> **Track A = "Given this PR, determine which contract surfaces were touched, then run a configured set of deterministic comparators + obligation/policy checks, compute risk, and return a gate decision (PASS/WARN/BLOCK) with evidence."**

**Status:**
- ✅ **Strategic Direction:** Correct (Contract-centric, 6-8 weeks, hybrid approach)
- ✅ **High-Level Components:** Mentioned (surfaces, comparators, obligations, ContractPack)
- ❌ **Configuration Schema:** NOT COVERED (no contractpacks.yaml design)
- ❌ **Comparator Interfaces:** NOT COVERED (no code-level contracts)
- ❌ **Obligation Interfaces:** NOT COVERED (no code-level contracts)
- ❌ **Pipeline Wiring:** NOT COVERED (no detailed 10-step execution flow)
- ❌ **Truth Anchors Strategy:** NOT COVERED (no deterministic docs validation)
- ❌ **Concrete Pack Examples:** NOT COVERED (no PublicAPI/PrivilegedInfra specs)
- ❌ **8-Surface Taxonomy:** PARTIAL (6 of 8 surfaces defined)
- ❌ **5 Comparator Families:** NOT COVERED (no family taxonomy)
- ❌ **4 Obligation Categories:** NOT COVERED (no category taxonomy)

---

## Detailed Gap Analysis

### ❌ GAP 1: `contractpacks.yaml` Configuration Schema

**Architect's Requirement:**
- Complete YAML schema for multi-repo/team configuration
- Top-level structure: `org`, `repos`, `surfaces.matchers`, `contractpacks.enabled`, `policy`
- Customer-configurable mapping: paths → surfaces, surfaces → packs, pack → artifacts & rules
- Grace rules for external system failures
- Evidence storage configuration

**Current Plan Coverage:** ❌ **NOT COVERED AT ALL**
- No mention of `contractpacks.yaml`
- No configuration schema design
- Week 5-6 mentions "ContractPack model" but only Prisma schema fields, not YAML config
- No org-level vs repo-level configuration hierarchy

**Impact:** **CRITICAL** - Engineers cannot implement without knowing:
- How customers configure file-to-surface mappings
- How customers specify artifact locations (OpenAPI paths, Confluence page IDs)
- How customers configure policy thresholds
- How configuration drives execution

**What's Missing:**
```yaml
# Example of what's NOT in the plan:
version: 1
org:
  name: "acme"
  default_mode: "warn"
  grace:
    external_fetch_failure: "warn"
repos:
  - repo: "acme/payments-service"
    surfaces:
      matchers:
        - id: "api_openapi_files"
          surface: "api_contract"
          patterns: ["openapi/**"]
    contractpacks:
      enabled: ["PublicAPI", "PrivilegedInfra"]
```

---

### ❌ GAP 2: ContractPack Definition Schema

**Architect's Requirement:**
- Each ContractPack has: `activation`, `artifacts`, `comparators`, `obligations`, `decision`
- Detailed schema for each section
- Examples: PublicAPI pack, PrivilegedInfra pack, DataMigration pack, Observability pack

**Current Plan Coverage:** ❌ **NOT COVERED**
- Week 5-6 mentions creating ContractPack model with fields: `name`, `surfaces`, `filePatterns`, `requiredArtifacts`, `comparators`, `obligations`, `thresholds`
- But NO detailed schema for how these are structured
- NO examples of actual pack definitions

**Impact:** **CRITICAL** - Engineers cannot implement without knowing:
- How to structure a ContractPack definition
- What goes in `artifacts.required` vs `artifacts.optional`
- How comparators reference artifacts
- How obligations reference findings

**What's Missing:**
```yaml
# Example of what's NOT in the plan:
contractpacks_definitions:
  - name: "PublicAPI"
    activation:
      any_surfaces: ["api_contract"]
    artifacts:
      required:
        - id: "openapi_spec"
          type: "github_file"
          path: "openapi/openapi.yaml"
    comparators:
      - id: "openapi_diff"
        type: "openapi.diff"
        inputs: ["openapi_spec_base", "openapi_spec"]
    obligations:
      - id: "api_owner_review_on_breaking"
        type: "obligation.approval_required"
```

---

### ❌ GAP 3: Comparator Interface (Code-Level)

**Architect's Requirement:**
- Core data models: `SnapshotRef`, `Finding`, `ComparatorResult`
- Comparator contract: `run()` method signature
- Type definitions for `Severity`, `Outcome`

**Current Plan Coverage:** ❌ **NOT COVERED**
- Section 5.2 has `IntegrityFinding` schema but it's different from architect's `Finding` schema
- NO `SnapshotRef` model
- NO `ComparatorResult` model
- NO comparator interface specification

**Impact:** **HIGH** - Engineers cannot implement comparators without knowing:
- What inputs comparators receive
- What outputs comparators must return
- How to handle unverifiable checks
- How to structure evidence

**What's Missing:**
```python
# Example of what's NOT in the plan:
@dataclass
class SnapshotRef:
    artifact_id: str
    source: str
    ref: str
    digest: str
    meta: Dict[str, Any]

class Comparator:
    def run(
        self,
        contract_pack: str,
        surface: str,
        snapshots: Dict[str, SnapshotRef],
        extracted: Dict[str, Any],
        params: Dict[str, Any],
        pr_context: Dict[str, Any],
    ) -> ComparatorResult:
        ...
```

---

### ❌ GAP 4: Obligation Interface (Code-Level)

**Architect's Requirement:**
- Obligation contract: `run()` method signature
- Returns `List[Finding]` for missing obligations
- Types: `approval_required`, `file_present`, `min_reviewers`, `doc_section_present`

**Current Plan Coverage:** ❌ **NOT COVERED**
- Gap B mentions "Obligation enforcement" but no interface
- Gap C mentions `source: 'obligation_policy'` but no implementation details
- NO obligation interface specification

**Impact:** **HIGH** - Engineers cannot implement obligations without knowing:
- What inputs obligations receive
- How obligations check conditions
- How to generate findings for missing obligations

**What's Missing:**
```python
# Example of what's NOT in the plan:
class ObligationCheck:
    type_name: str
    
    def run(
        self,
        contract_pack: str,
        surfaces: List[str],
        findings: List[Finding],
        pr_context: Dict[str, Any],
        params: Dict[str, Any],
    ) -> List[Finding]:
        ...
```

---

### ❌ GAP 5: Track A Pipeline Wiring (Detailed Execution Flow)

**Architect's Requirement:**
- 9-step pipeline showing how config drives execution:
  1. Collect PR context
  2. Apply exclusions
  3. Classify surfaces
  4. Resolve ContractPacks
  5. Fetch snapshots
  6. Run comparators
  7. Run obligations
  8. Compute risk score
  9. Decide outcome
  10. Publish check + evidence
  11. Optional: spawn Track B

**Current Plan Coverage:** ⚠️ **PARTIAL (40%)**
- "Typical Flow" (lines 37-44) has 6 steps but very high-level
- Missing: How config drives each step
- Missing: How extracted cache works
- Missing: How unverifiable checks are handled
- Missing: How evidence bundle is assembled

**Impact:** **HIGH** - Engineers need detailed pseudocode showing:
- How `repo_config` drives surface classification
- How `contractpacks_defs` drives pack resolution
- How `pack.artifacts` drives snapshot fetching
- How `pack.comparators` drives comparator execution
- How findings accumulate across packs

**What's Missing:**
```python
# Example of what's NOT in the plan:
def track_a_run(pr_event, repo_config, contractpacks_defs):
    pr = collect_pr_context(pr_event)
    pr = apply_exclusions(pr, repo_config["config"]["exclusions"])
    surface_hits = classify_surfaces(pr.changed_files, repo_config["surfaces"]["matchers"])
    packs = resolve_contractpacks(surfaces, repo_config["contractpacks"]["enabled"], contractpacks_defs)
    # ... detailed execution flow
```

---

### ❌ GAP 6: Truth Anchors Strategy (Deterministic Docs Checks)

**Architect's Requirement:**
> "If you want Track A to compare PR changes to Confluence *deterministically*, you need anchors."

**Recommended Convention:**
```
# In Confluence:
Operational Truth
OPENAPI_SHA: <64-hex>
API_VERSION: 1.7.2
LAST_SYNCED_COMMIT: <sha>

# In README:
API_VERSION: 1.7.2
OPENAPI_SHA: <64-hex>
```

**Comparator:** `docs.anchor_check`
- Compute sha256(openapi)
- Parse doc to extract anchor values
- Compare exact equality
- **Gate-safe** (no LLM semantics)

**Current Plan Coverage:** ❌ **NOT COVERED AT ALL**
- No mention of truth anchors
- No strategy for deterministic Confluence validation
- Section 5.3 (Soft-Fail) handles external failures but not deterministic validation
- No `docs.anchor_check` comparator

**Impact:** **CRITICAL** - Without this:
- Cannot do deterministic Confluence checks in Track A
- Will fall back to LLM semantic comparison (not gate-safe)
- False positive rate will be high
- Customers will disable Confluence checks

**What's Missing:**
- Truth anchor convention documentation
- `docs.anchor_check` comparator specification
- How to extract anchors from docs
- How to compute source values (sha256, jsonpath)
- How to match target patterns (regex)

**Architect's Guidance:**
> "If you want Track A to compare PR changes to Confluence *deterministically*, you need anchors. Deep semantic comparisons belong in Track B."

---

### ❌ GAP 7: Concrete ContractPack Examples (PublicAPI + PrivilegedInfra)

**Architect's Requirement:**
- **PublicAPI Pack:** Full specification with activation, artifacts, comparators, obligations
- **PrivilegedInfra Pack:** Full specification with Terraform risk classification
- **DataMigration Pack:** Optional starter
- **Observability Pack:** Optional starter

**Current Plan Coverage:** ⚠️ **MENTIONED BUT NOT SPECIFIED**
- Week 5-6 mentions "Seed data: 2 packs (PublicAPI, PrivilegedInfra)"
- But NO detailed specifications
- NO list of comparators for each pack
- NO list of obligations for each pack
- NO artifact mappings

**Impact:** **HIGH** - Engineers need concrete examples to:
- Understand how packs are structured
- See which comparators are needed
- See which obligations are needed
- Implement seed data correctly

**What's Missing:**

#### PublicAPI Pack (NOT in plan):
```yaml
activation:
  any_surfaces: ["api_contract"]
artifacts:
  - openapi_spec (github_file)
  - changelog (github_file)
  - readme (github_file)
  - confluence_api_page (confluence_page)
comparators:
  - openapi.validate
  - openapi.diff (breaking classification)
  - policy.version_bump
  - docs.anchor_check (Confluence)
  - docs.anchor_check (README)
obligations:
  - api_owner_review_on_breaking
  - changelog_updated_on_breaking
```

#### PrivilegedInfra Pack (NOT in plan):
```yaml
activation:
  any_surfaces: ["privileged_infra", "security_boundary"]
artifacts:
  - terraform_dir (github_directory)
  - runbook_infra (github_file)
  - rollback_plan (github_file)
comparators:
  - terraform.risk_classifier (IAM/network patterns)
  - docs.required_sections (runbook)
obligations:
  - security_review_for_iam
  - rollback_plan_required
  - two_reviewers_on_high_risk
```

---

### ❌ GAP 8: Surface Area → Which Checks Run? (Mapping Mechanism)

**Architect's Requirement:**
> "Surface classification does **not** directly run checks. It selects **ContractPacks**."

**Key Insight:**
- If `api_contract` touched → run `PublicAPI` pack
- If `privileged_infra` touched → run `PrivilegedInfra` pack
- If both touched → run both packs
- Each pack runs multiple comparators and obligations

**Current Plan Coverage:** ⚠️ **IMPLICIT BUT NOT EXPLICIT**
- Week 1-2 mentions "Map surfaces → contract packs"
- But NO detailed explanation of mapping mechanism
- NO example showing how one surface triggers one pack
- NO example showing how multiple surfaces trigger multiple packs

**Impact:** **MEDIUM** - Engineers need to understand:
- How surface classification drives pack selection
- How pack activation rules work
- How to handle multiple packs running in parallel

**What's Missing:**
- Explicit mapping table (surface → pack)
- Activation rule specification
- Multi-pack execution strategy

---

### ❌ GAP 9: Common Primitives vs Customer Config (Explicit Separation)

**Architect's Requirement:**

**Common Primitives (you ship):**
- Surface types, Artifact types, Comparator types, Obligation types
- Finding schema, Decision engine, Evidence bundle

**Customer Config (they define):**
- Which paths trigger which surface
- Where OpenAPI lives
- Which Confluence page is "API doc"
- Which approval groups map to GitHub teams
- Thresholds for warn/block
- Whether doc anchor mismatch is warn or block

**Current Plan Coverage:** ❌ **NOT EXPLICITLY SEPARATED**
- Concepts are mentioned but not organized into "common" vs "customer"
- No clear guidance on what engineers build vs what customers configure

**Impact:** **MEDIUM** - Without this separation:
- Engineers might hard-code customer-specific logic
- Configuration model will be inflexible
- Multi-tenant support will be difficult

**What's Missing:**
- Explicit section: "Common Primitives vs Customer Configuration"
- Table showing what's common vs what's configurable
- Design principle: "Customers configure mapping and thresholds, not logic"

---

### ❌ GAP 10: Recommended V1 Implementation Scope

**Architect's Requirement:**
> "What I'd recommend you implement first (so Track A becomes real fast)"

**V1 Track A (most PMF-leverage):**
1. Surface classifier
2. PublicAPI ContractPack:
   - openapi.validate
   - openapi.diff (breaking classification)
   - version bump on breaking
   - changelog updated on breaking
   - docs.anchor_check for README + Confluence (WARN first)
   - api_owner approval on breaking
3. PrivilegedInfra ContractPack:
   - terraform risk classifier (IAM/network)
   - rollback plan required
   - security approval required
4. GitHub Check Run integration
5. Evidence bundle storage

**Current Plan Coverage:** ⚠️ **PARTIAL (60%)**
- Week 1-2 mentions surface classifier ✅
- Week 1-2 mentions "Wire OpenAPI comparator" ✅
- Week 1-2 mentions "Wire Terraform comparator" ✅
- Week 3-4 mentions GitHub Check integration ✅
- Missing: Specific comparators (openapi.validate, openapi.diff, version bump, changelog, docs.anchor_check)
- Missing: Specific obligations (api_owner approval, rollback plan, security approval)
- Missing: Evidence bundle storage specification

**Impact:** **MEDIUM** - Engineers have general direction but need specific comparator/obligation list

**What's Missing:**
- Explicit V1 scope: "Build these 8 comparators and 3 obligations first"
- Priority order for implementation
- Success criteria for V1 (what makes Track A "real")

---

## Summary: What's Missing from TRACK_A_IMPLEMENTATION_PLAN_V2.md

### Critical Gaps (Must Add to Make Plan Implementable)

| Gap | Requirement | Current Coverage | Impact |
|-----|-------------|------------------|--------|
| **1** | `contractpacks.yaml` schema | ❌ 0% | CRITICAL |
| **2** | ContractPack definition schema | ❌ 0% | CRITICAL |
| **3** | Comparator interface (code-level) | ❌ 0% | HIGH |
| **4** | Obligation interface (code-level) | ❌ 0% | HIGH |
| **5** | Track A pipeline wiring (detailed) | ⚠️ 40% | HIGH |
| **6** | Truth anchors strategy | ❌ 0% | CRITICAL |
| **7** | Concrete pack examples (PublicAPI, PrivilegedInfra) | ⚠️ 20% | HIGH |
| **8** | Surface → Pack mapping mechanism | ⚠️ 30% | MEDIUM |
| **9** | Common primitives vs customer config | ❌ 0% | MEDIUM |
| **10** | V1 implementation scope (specific comparators/obligations) | ⚠️ 60% | MEDIUM |

---

## Recommendations

### Option 1: Add Detailed Specifications to Implementation Plan (RECOMMENDED)

**Add these sections to TRACK_A_IMPLEMENTATION_PLAN_V2.md:**

**Part 9: Configuration Architecture**
- 9.1 `contractpacks.yaml` Schema
- 9.2 ContractPack Definition Schema
- 9.3 Common Primitives vs Customer Configuration

**Part 10: Code-Level Interfaces**
- 10.1 Comparator Interface
- 10.2 Obligation Interface
- 10.3 Core Data Models (SnapshotRef, Finding, ComparatorResult)

**Part 11: Track A Pipeline Wiring**
- 11.1 Detailed Execution Flow (9-step pipeline with pseudocode)
- 11.2 How Config Drives Execution
- 11.3 Surface → Pack Mapping Mechanism

**Part 12: Truth Anchors Strategy**
- 12.1 Deterministic Docs Validation
- 12.2 Anchor Convention
- 12.3 `docs.anchor_check` Comparator

**Part 13: Concrete ContractPack Examples**
- 13.1 PublicAPI Pack (Full Specification)
- 13.2 PrivilegedInfra Pack (Full Specification)
- 13.3 DataMigration Pack (Optional)
- 13.4 Observability Pack (Optional)

**Part 14: V1 Implementation Scope**
- 14.1 Specific Comparators to Build (8 comparators)
- 14.2 Specific Obligations to Build (3 obligations)
- 14.3 Priority Order

**Estimated Addition:** +600-800 lines

---

### Option 2: Create Separate Technical Specification Document

**Create:** `TRACK_A_TECHNICAL_SPECIFICATION.md`

**Content:** All 10 gaps above in detailed technical format

**Pros:**
- Keeps implementation plan focused on timeline
- Separates "what to build when" from "how to build it"
- Can be referenced by multiple implementation docs

**Cons:**
- Two documents to maintain
- Engineers need to read both

---

## Recommended Action

**I strongly recommend Option 1: Extend the implementation plan**

**Rationale:**
- Engineers need these details to implement Week 1-2 tasks
- "Wire comparators" is not actionable without comparator interface
- "ContractPack model" is not implementable without schema
- Truth anchors are critical for deterministic Confluence checks
- Better to have one comprehensive document

**Next Steps:**
1. Add Parts 9-14 to TRACK_A_IMPLEMENTATION_PLAN_V2.md
2. Include all YAML schemas, code interfaces, and concrete examples
3. Update Week 1-2 tasks to reference specific comparators/obligations
4. Commit with message: "docs: Add detailed technical specifications to Track A implementation plan"

**Would you like me to proceed with adding these sections?**
