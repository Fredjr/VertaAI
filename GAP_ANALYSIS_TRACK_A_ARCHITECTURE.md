# Gap Analysis: Current State vs Target State (Track A - PR Gatekeeper)

**Date:** 2026-02-15
**Scope:** Track A (PR Gatekeeper / Contract Validation)
**Analyst:** Based on feedback from external architect review

---

## Executive Summary

**Current State:** We have TWO separate Track A systems running in parallel:
1. **Agent PR Gatekeeper** - Detects agent-authored PRs + risk scoring + evidence checks
2. **Contract Validation** - Validates contracts using comparators (stub implementation)

**Target State (per PRODUCT_GUIDE.md v3.0):** A unified **Contract Integrity Gate** that validates contracts for ALL PRs touching contract surfaces, where agent-authorship is ONE risk signal among many.

**Key Gap:** Our Track A is framed as "Agent PR Gatekeeper" (agent-centric) rather than "Contract Integrity Gate" (contract-centric). This limits PMF to teams already using AI agents heavily, missing the broader "Win Dev Workflow" opportunity.

---

## The Simplest Mental Model: Track A vs Track B

### **Track A = Guardrail at the point of change**

> "Before we merge this PR, are we about to violate any contracts or readiness requirements?"

### **Track B = Maintenance + remediation over time**

> "Given what's changed (and what's happening in ops), what is now out of sync — and how do we fix it safely?"

**Think:**
* Track A is **prevention** at merge time.
* Track B is **detection + repair** continuously.

---

## What Purpose Do They Serve?

### Track A Purpose: **Contract Integrity Gate (PR Gatekeeper)**

Track A exists because the cheapest time to catch inconsistencies is **before** they hit main.

#### What it is trying to solve

When a PR changes something that creates "truth" obligations, Track A answers:

* Did we update the **contract artifacts** that must stay consistent with this change?
* Did we provide required **evidence** (tests, rollback notes, migration plan)?
* Does this PR introduce **risk patterns** that should require extra approvals?

#### Typical real-world failures Track A prevents

* API endpoint changed in code, but **OpenAPI / Swagger not updated**
* Schema change merged without a **migration/rollback plan**
* Terraform change merged without corresponding **runbook / operational docs**
* New feature merged without updating **README / internal docs / feature flags**
* "Agent-generated" PR that touches sensitive files without a human review threshold

#### Output of Track A

A **GitHub Check Run** (status check) on the PR:

* PASS / WARN / BLOCK (and why)
* A list of findings with evidence and "what to do next"
* Optional: link to a patch proposal Track B can generate

#### Track A characteristics (architectural constraints)

* **Fast** (seconds, < 30s total)
* **Deterministic** for decision making (LLM shouldn't decide pass/fail)
* **Low-noise / high precision** (false blocks kill adoption)
* **Inline in dev workflow** (PR UI, CI gating)

---

### Track B Purpose: **Operational Truth Drift + Remediation**

Track B exists because not everything is caught at PR time, and lots of "truth" lives outside PRs.

#### What it is trying to solve

Track B answers:

* Across all systems, what is currently **out of sync** with reality?
* Which drifts are **material** and worth action?
* How do we generate a **safe patch proposal** to reconcile them?
* How do we route approvals and apply updates with a traceable audit log?

#### Typical drift problems Track B solves

* Docs drift caused by changes merged days ago
* Confluence pages stale because teams didn't update them during PR
* Runbooks outdated after operational changes
* Dashboards/alerts drifted from stated SLO policies
* Multiple changes create many alerts; you need clustering and batching
* "Truth" changes due to runtime events (incident, alert spike) not PRs

#### Output of Track B

* Drift tickets / alerts (clustered)
* Proposed patches (Confluence update, README update, OpenAPI update)
* Slack approval workflow
* Change application with audit log ("who approved what and why")

#### Track B characteristics (architectural constraints)

* **Async / stateful** (minutes, not seconds)
* **High recall** (catch everything, then cluster)
* **LLM allowed** for patch generation/explanation
* **Workflow-heavy** (approvals, batching, retries, backoff)
* **Handles noisy environments** (drift constantly happens)

---

## How They Differ (In Detail)

### 1) When they run

**Track A:** triggered by PR events (opened/updated)
**Track B:** triggered by:
* merged PRs (post-merge drift)
* scheduled scans
* incident/alert signals
* Track A findings ("spawn remediation")
* manual "scan now"

### 2) What is the "unit of work"

**Track A:** PR + file diff
* the unit is "this proposed change"

**Track B:** a drift case / remediation plan
* the unit is "these systems are inconsistent; here's the fix"

### 3) Decision vs proposal

**Track A:** makes a **decision** (pass/warn/block)
**Track B:** makes a **proposal** (patch plan + human approval)

**This is *the* key distinction.**

### 4) Determinism vs probabilism

**Track A:** should be mostly deterministic:
* comparisons
* schemas
* rules
* file pattern policies

**Track B:** can be probabilistic:
* LLM patch generation
* summarization
* clustering heuristics
* "best-effort" reconciliation

### 5) Precision vs recall

**Track A:** precision-first
You want a small number of high-confidence findings.

**Track B:** recall-first
You'd rather catch more drift and then reduce noise via clustering/materiality thresholds.

### 6) Where you store "truth"

**Track A:** stores a minimal "evidence bundle" attached to the PR
* what was checked
* what failed
* snapshots/hashes

**Track B:** stores a full "drift dossier"
* cross-system snapshots
* diff evidence
* patch attempts and approvals
* correlation history (alerts/incidents)
* audit chain

### 7) Failure modes

**Track A failure mode must be safe**
* if Confluence API is down → don't hard block by default; warn/soft-fail with "unable to validate"
* otherwise dev workflow halts incorrectly

**Track B failure mode can retry**
* if Confluence down → queue, retry, backoff
* because it's not blocking merges

### 8) Comparators: Shared library, different operating modes

**Can comparators be shared across Track A and Track B?**

✅ **Yes** - You should have one core comparator library that produces structured output:

```typescript
IntegrityFinding {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  evidence: Json;
  confidence: number;
  affectedContracts: string[];
  suggestedFix: string;
}
```

**Comparator Families (What Track A Needs):**

**A) "Required artifact present" comparators** (Easiest, highest-signal)
- If API surface touched → `openapi.yaml` must exist/updated
- If IAM touched → `docs/runbooks/iam.md` must exist
- If DB migration touched → `docs/migrations.md` exists
- **Gate-safe and often BLOCK-worthy**

**B) "Version / reference consistency" comparators**
- `openapi.yaml` version matches README badge or docs anchor
- Docs page contains declared API version
- **Requires structured anchors** (truth anchors):
  - `API_VERSION: 1.7.2`
  - `OPENAPI_SHA: <hash>`
  - `LAST_SYNCED_COMMIT: <sha>`
- **Deterministic verification** (no fuzzy LLM comparisons)

**C) "Schema compatibility" comparators (API / event)**
- OpenAPI diff comparator:
  - breaking vs non-breaking change classification
  - require version bump on breaking changes
  - require changelog update on breaking changes
- **Extremely strong for Track A**

**D) "Config-to-policy" comparators (IaC / security / observability)**
- Terraform resources changed include IAM policies → apply risk rules
- Alerts changed → verify thresholds align with SLO policy (if SLO policy is structured)
- **Determinism depends on structured configuration**

**E) "Cross-system alignment" comparators (GitHub ↔ Confluence)**
- For Track A: **restricted mode**
  - verify presence of required sections/anchors
  - verify hash/version markers
  - do not attempt deep semantic diff unless fully deterministic
- **Deep semantic comparisons belong in Track B**

**Comparator Design Principles:**

- **Deterministic**: no model calls for pass/fail decisions
- **Explainable**: evidence points to exact diffs / missing anchors
- **Configurable**: supports per-customer mappings/rules
- **Graceful**: can return "UNVERIFIABLE" with reason

**Examples of shared comparators:**
- OpenAPI diff comparator
- Required-file presence comparator
- Terraform risk comparator
- Docs reference comparator (structured anchors)
- Approval comparator (CODEOWNER / reviewer count)
- Alert ↔ SLO threshold comparator

**But: Different operating modes**

| Aspect | Track A Mode | Track B Mode |
|--------|--------------|--------------|
| **Depth** | Cheap, deterministic, gate-grade | Deep, best-effort, remediation-grade |
| **Confidence** | High confidence only (> 90%) | Can handle lower confidence (> 70%) |
| **Speed** | Fast (< 5s per comparator) | Can be slower (< 30s per comparator) |
| **False Positives** | Must be extremely low (< 5%) | Can tolerate higher (< 15%) |
| **LLM Usage** | No LLM for pass/fail decisions | LLM allowed for interpretation |

**Example: OpenAPI Comparator**

Track A mode:
- Check breaking changes (deterministic)
- Validate spec syntax (deterministic)
- Check version bump rules (deterministic)
- **Decision:** BLOCK if breaking change without version bump

Track B mode:
- All of Track A checks
- Deep semantic analysis (LLM-assisted)
- Generate patch proposal (LLM-assisted)
- Check prose descriptions match (fuzzy)
- **Output:** Patch proposal + confidence score

---

## Why You Need Both (And Why One Alone Is Weaker)

### If you only had Track B (drift remediation)

You become a "nice-to-have hygiene tool":
* you detect drift after it happened
* teams may ignore it
* value is slower and less visceral
* **no enforcement** - "we'll fix it later" becomes "we never fix it"

### If you only had Track A (gatekeeper)

You prevent some issues, but you still need:
* auto-fix suggestions
* cross-system updates
* evidence artifacts for audits
* handling of drift caused outside PRs
* **friction without solutions** - developers hate gates without easy fixes

**Track B is what turns your gatekeeper from "annoying CI rule" into "we help you fix it."**

### The Correct Relationship: Track A Enforces, Track B Enables

**Track A = "Do not merge until..."**
- Enforces Definition of Done (DoD)
- Enforces approval / liability boundaries
- Provides guarantees at merge time (process, approvals, readiness)
- Prevents "we'll fix it later" from becoming "we never fix it"

**Track B = "Here's the patch and workflow to satisfy that requirement"**
- Removes friction by auto-generating patches
- Handles non-PR drift (Grafana UI changes, manual Confluence edits, incidents)
- Reduces noise through clustering/materiality
- Makes Track A enforceable without being hated

**Why Block PRs if Track B Can Auto-Patch?**

You block for **two reasons**, and only one is "docs are outdated":

**Reason 1: Enforcing Definition of Done (DoD)**

Many teams want this guarantee:
> "A change isn't complete until its contracts and documentation are updated."

If you don't gate, what happens in reality?
- Track B creates patch proposals
- humans ignore them
- drift accumulates
- docs quality decays
- you become "noise"

Blocking turns "nice-to-have drift hygiene" into "release safety + process compliance."

**Reason 2: Enforcing Approval / Liability Boundaries**

Even if Track B can propose or even apply patches, a business may require:
- human approval for docs
- review by API owners for contract changes
- audit evidence that docs were reviewed at release time
- separation of duties ("bots don't publish externally")

In that world, Track B cannot "just patch it."
It can propose and route approvals, but Track A ensures:
> nothing ships without the required approvals.

**Blocking is about enforcing governance policies, not about technical capability.**

---

## The Intended Relationship Between A and B

This is the clean architecture:

1. **Track A detects** risk and integrity violations in PR
2. Track A posts findings to PR as a check
3. If drift is detected:
   * Track A can optionally **spawn Track B** to create a remediation plan
4. Track B proposes patch(es) and routes approvals
5. After patches applied:
   * Track A check can automatically re-run and pass

**So:**
* A is the "stoplight"
* B is the "repair crew"

---

## A Concrete Example (GitHub → Confluence)

### PR changes `/api/orders` response shape

**Track A:**
* sees OpenAPI changed OR detects code changed (via file patterns)
* checks whether Confluence page "Orders API" was updated
* finds mismatch → posts WARN/BLOCK on PR with evidence

**Track B:**
* generates proposed Confluence patch reflecting new response schema
* sends Slack approval
* applies patch
* records audit trail
* Track A re-run now passes

---

## Coverage: Both Tracks Should Include Grafana/Terraform/etc

**The right rule:**
* **Track A (Gate)** can only gate things that have a **merge/release choke point**.
* **Track B (Drift/Remediation)** can cover **anything**, including runtime/off-PR changes.

### Track A should include Grafana/Terraform when they're part of a gated change

Track A should run on events like:
* PR opened/updated
* Push to a protected branch
* Release tag created
* Terraform plan in CI
* GitOps sync PR

**Terraform (great fit for Track A)**
* In most orgs, Terraform changes are reviewed via PR → perfect for gating.
* Gate checks can enforce:
  * "If you changed IAM, you must update access docs / runbooks"
  * "If you changed security groups, you must update threat model / network diagram"
  * "If you changed a service module, you must update SLO/runbook"
* Outputs as GitHub Checks / required status checks.

**Grafana (sometimes fits Track A)**
It depends how dashboards/alerts are managed:
* If dashboards are **JSON in GitHub** (Grafana-as-code), then yes: Track A gates those PRs.
* If dashboards are edited **in the UI** directly, then Track A *cannot reliably gate* them because there's no PR choke point.

So:
* Grafana-as-code → Track A fits
* Grafana UI edits → Track B fits (and Track A can only gate downstream docs if relevant)

### Track B should include Grafana/Terraform always (drift + remediation)

Track B should connect to:
* Terraform state or plan output
* Grafana dashboards/alert rules (API)
* PagerDuty incidents
* Datadog monitors
* Kubernetes manifests / GitOps controllers
* Confluence/runbooks

Because Track B is not blocking anything — it's detecting drift, clustering, and proposing fixes.

**Terraform in Track B**
* Detect drift between:
  * declared IaC vs runbooks / architecture docs
  * actual deployed infra state vs documentation
* Propose:
  * runbook updates
  * ownership updates
  * compliance evidence packs

**Grafana in Track B**
* Detect drift between:
  * documented SLOs vs actual alert rules
  * runbook thresholds vs dashboard thresholds
  * "what we say we monitor" vs "what we actually monitor"
* Propose:
  * updates to runbooks/Confluence
  * changes to alert descriptions, escalation policies
  * consistent naming/tagging

---

## Practical Architecture Rule: "Gate Surfaces" vs "Truth Surfaces"

### Gate surfaces (Track A)

Things with clear, reviewable change events:
* GitHub PRs
* GitOps PRs
* Terraform plan output in CI
* IaC repos
* OpenAPI specs in repo
* Kubernetes manifests in repo

### Truth surfaces (Track B)

Everything that may drift outside PRs:
* Grafana UI changes
* PagerDuty escalations/incidents
* Datadog monitor changes
* SaaS agent permissions
* On-call runbooks in Confluence
* "tribal knowledge" docs

---

## Important Warning: Don't Make Track A Gate on External Systems Being Available

**Example:**
If Confluence API is down, Track A should:
* warn "unable to validate doc target"
* not block by default

Track B can retry and backoff.

---

## Best Practice Operating Mode: Phased Adoption

### Phase 1: Adoption (Weeks 1-4)

**Track A:**
- ✅ WARN-only for doc alignment
- ✅ BLOCK for strict contract/approval checks:
  - OpenAPI invalid
  - Missing required files (changelog, rollback plan)
  - Missing CODEOWNER approvals
  - Breaking changes without version bump

**Track B:**
- ✅ Generate patches automatically
- ✅ Make them easy to apply (one-click Slack approval)
- ✅ Build trust through high-quality patch proposals

**Goal:** Developers see value without friction

---

### Phase 2: Maturity (Weeks 5-12)

**Track A:**
- ✅ Teams opt-in to "block on docs alignment" for certain contract packs (e.g., public API)
- ✅ Confidence thresholds tuned based on false positive rate
- ✅ Deterministic doc checks (anchored sections) become BLOCK-grade

**Track B:**
- ✅ Becomes the autopilot that keeps the gate green
- ✅ Handles 80%+ of drift automatically
- ✅ Clustering reduces noise by 80-90%

**Goal:** Track A gates are green most of the time because Track B keeps things aligned

---

### Phase 3: Governance (Months 3+)

**Track A:**
- ✅ Evidence vault + audit artifacts become first-class
- ✅ Ensures releases are compliant
- ✅ Provides guarantees for SOC2/ISO27001/etc.

**Track B:**
- ✅ Provides the proof + remediation trail
- ✅ Audit log of all changes (who approved what and why)
- ✅ Compliance reporting

**Goal:** VertaAI becomes the system of record for contract integrity

---

## What Track A Should BLOCK vs WARN On

### Track A Should BLOCK Only on Gate-Grade Findings:

✅ **High-confidence, deterministic failures:**
- Required artifacts missing (changelog/rollback/spec file)
- OpenAPI invalid (syntax errors)
- Breaking change without version bump
- Missing required approvals (CODEOWNERS)
- Failed tests
- Failed deterministic contract comparisons (> 95% confidence)

### Track A Should WARN on "Docs Not Yet Updated":

⚠️ **Lower-confidence or external system checks:**
- "Confluence page mismatch" should start as WARN
- Optionally becomes BLOCK only after:
  - Teams opt-in
  - Confidence is extremely high (> 95%)
  - Doc check is deterministic (anchored sections)

**Why:** This prevents dev teams from turning the tool off due to false blocks.

**The Punchline:**

You don't block because "we can't update Confluence."

You block because:
- you need **guarantees at merge time** (process, approvals, readiness)
- you need **deterministic integrity**
- you need to prevent "we'll fix it later" from becoming "we never fix it"

Track B is the mechanism that actually makes "fix it now" cheap.

---

## Part 1: Architectural Assessment

### ✅ What We're Doing Right

#### 1. **Track B (Drift Remediation) - EXCELLENT**
- ✅ 18-state deterministic state machine
- ✅ Evidence-grounded patching with typed deltas
- ✅ Materiality gate + temporal drift accumulation
- ✅ Cluster-first triage (80-90% noise reduction)
- ✅ Human-in-the-loop approval workflow
- ✅ Multi-source correlation (GitHub + PagerDuty + Slack)

**Verdict:** Track B meets and exceeds expectations. No changes needed.

---

#### 2. **Track A Components - ARCHITECTURALLY SOUND**
We have the right building blocks:
- ✅ Deterministic agent detection heuristics
- ✅ Multi-factor risk tier calculation
- ✅ Domain evidence requirements (deployment, database, API, auth)
- ✅ Delta sync findings using parsers (IaC, OpenAPI, CODEOWNERS)
- ✅ Impact assessment integration
- ✅ Signal correlation integration
- ✅ GitHub Check output semantics
- ✅ Comparator framework (BaseComparator, OpenApiComparator, TerraformRunbookComparator)
- ✅ IntegrityFinding model with severity/evidence/recommendations

**Verdict:** The components are correct. The problem is how they're organized and triggered.

---

### ❌ What We're Missing (Critical Gaps)

#### **Gap A: Product Definition - Agent-Centric vs Contract-Centric**

**The Core Issue:** Track A is framed as "Agent PR Gatekeeper" (agent-centric) rather than "Contract Integrity Gate" (contract-centric).

**What Track A Should Actually Be:**

> "Contract Integrity Enforcement based on surface area touched."

Agent detection is just one modifier of risk, not the entry point.

**Surface Area Touched = Which Contract-Bearing Domains the PR Modifies**

A PR doesn't just change "files." It changes **obligations**.

**Surface Area Taxonomy (6-8 Core Surfaces):**

1. **API Contract**
   - OpenAPI/proto/graphql schemas
   - controllers/handlers
   - SDK/public client libs

2. **Data Contract**
   - DB migrations, schema files
   - ORM models (Prisma, TypeORM)
   - event schemas (Kafka/Avro/JSON schema)

3. **Security Boundary**
   - authn/authz
   - secrets handling
   - permission checks
   - sensitive configs

4. **Identity & Access (IAM) / Network**
   - Terraform IAM/policies
   - security groups/firewall rules
   - roles and permissions

5. **Runtime Configuration**
   - k8s manifests, helm charts
   - env templates
   - feature flags

6. **Observability Contract**
   - alert rules
   - SLO definitions
   - dashboards-as-code
   - logging pipelines

7. **Operational Procedures**
   - runbooks
   - incident response docs
   - escalation policies

8. **User-facing Documentation / Dev Portal**
   - README, docs site
   - Confluence pages
   - API reference pages

**Why Surfaces Matter:**

They decide:
- which ContractPacks trigger
- which artifacts to fetch
- which comparators to run
- which obligations apply
- how risk score is computed
- whether to WARN or BLOCK

**Surface classification is the highest leverage piece of Track A.**

**Example Surface Mapping:**

| File Change                 | Surface Area               | Contract Type |
| --------------------------- | -------------------------- | ------------- |
| `openapi.yaml`              | Public API contract        | API |
| `src/controllers/orders.ts` | API behavior contract      | API |
| `terraform/iam.tf`          | Access control contract    | IAM + Security |
| `k8s/deployment.yaml`       | Runtime config contract    | Runtime Config |
| `alerts/orders.json`        | SLO / monitoring contract  | Observability |
| `db/migrations/*.sql`       | Data schema contract       | Data Model |
| `auth/middleware.ts`        | Security boundary contract | Security |

**Surface Matching Strategies (In Order):**

1. **Path-based patterns** (fast, reliable)
   - `/openapi.yaml` → API surface
   - `*.tf` → Infra surface
   - `/migrations/**` → Data Model surface

2. **File-type detection**
   - `.tf`, `.sql`, `openapi.yaml`, `.proto`, `.graphql`

3. **Lightweight content signatures**
   - File contains `openapi:` → API surface
   - File contains `kind: Deployment` → Infra surface

4. **Repo metadata**
   - CODEOWNERS sections can be used for "sensitive" classification

**Current Implementation:**
```typescript
// apps/api/src/routes/webhooks.ts (lines 481-516)
if (isFeatureEnabled('ENABLE_AGENT_PR_GATEKEEPER', workspaceId) && !prInfo.merged) {
  if (shouldRunGatekeeper({ author: prInfo.authorLogin, labels })) {
    // Run gatekeeper ONLY if agent-authored or not trusted bot
  }
}
```

**Current Trigger Logic:**
```typescript
// apps/api/src/services/gatekeeper/index.ts (lines 281-295)
export function shouldRunGatekeeper(pr: { author: string; labels: string[] }): boolean {
  // Skip for certain bot accounts that we trust
  const trustedBots = ['dependabot[bot]', 'renovate[bot]'];
  if (trustedBots.includes(pr.author)) {
    return false;
  }

  // Skip if PR has "skip-gatekeeper" label
  if (pr.labels.includes('skip-gatekeeper')) {
    return false;
  }

  // Run for all other PRs
  return true;
}
```

**Problem:**
- ❌ Trigger is author-based, not surface-based
- ❌ No surface area classification
- ❌ No contract domain detection
- ❌ Agent detection is the primary framing, not a risk modifier

**Target State:**
```typescript
// Should be: "Contract Integrity Gate"
if (isFeatureEnabled('ENABLE_CONTRACT_INTEGRITY_GATE', workspaceId) && !prInfo.merged) {
  if (shouldRunContractGate({ changedFiles, repo, service })) {
    // Run gate if PR touches contract surfaces (OpenAPI, Terraform, auth, etc.)
    // Agent-confidence is ONE risk factor, not the entry point
  }
}
```

**Target Trigger Logic (Surface-Based):**
```typescript
export function shouldRunContractGate(pr: {
  changedFiles: Array<{ filename: string }>;
  repo: string;
  service?: string;
}): boolean {
  // Step 1: Classify surface areas touched
  const surfaces = classifySurfaceAreas(pr.changedFiles);

  // Step 2: Trigger if any contract-bearing surface is touched
  const contractSurfaces = ['api', 'infra', 'data_model', 'observability', 'security'];
  return surfaces.some(s => contractSurfaces.includes(s));
}

function classifySurfaceAreas(files: Array<{ filename: string }>): SurfaceClassification {
  const surfaceMap: Record<Surface, string[]> = {
    api: [],
    infra: [],
    data_model: [],
    observability: [],
    security: [],
    docs: []
  };

  for (const file of files) {
    // API Contract surface
    if (isApiSurface(file.filename)) {
      surfaceMap.api.push(file.filename);
    }

    // Infra surface (IAM, Network, Runtime Config)
    if (isInfraSurface(file.filename)) {
      surfaceMap.infra.push(file.filename);
    }

    // Data Contract surface
    if (isDataModelSurface(file.filename)) {
      surfaceMap.data_model.push(file.filename);
    }

    // Observability Contract surface
    if (isObservabilitySurface(file.filename)) {
      surfaceMap.observability.push(file.filename);
    }

    // Security Boundary surface
    if (isSecuritySurface(file.filename)) {
      surfaceMap.security.push(file.filename);
    }

    // Documentation surface
    if (isDocsSurface(file.filename)) {
      surfaceMap.docs.push(file.filename);
    }
  }

  const surfaces = Object.entries(surfaceMap)
    .filter(([_, files]) => files.length > 0)
    .map(([surface, _]) => surface as Surface);

  return {
    surfaces,
    filesBySurface: surfaceMap,
    confidence: 1.0  // Deterministic classification
  };
}

// Surface detection functions (deterministic matchers)
function isApiSurface(filename: string): boolean {
  return /openapi\.(yaml|yml|json)/i.test(filename) ||
         /swagger\.(yaml|yml|json)/i.test(filename) ||
         /controllers|routes|api/i.test(filename) ||
         /\.proto$/i.test(filename) ||  // gRPC
         /graphql|schema\.graphql/i.test(filename);  // GraphQL
}

function isInfraSurface(filename: string): boolean {
  return /\.tf$/i.test(filename) ||  // Terraform
         /k8s|kubernetes|helm/i.test(filename) ||
         /deployment|iam|network/i.test(filename) ||
         /docker|compose/i.test(filename) ||
         /\.yaml$/i.test(filename) && /manifest|deployment|service/i.test(filename);
}

function isDataModelSurface(filename: string): boolean {
  return /migration|schema\.sql|models/i.test(filename) ||
         /prisma\/schema/i.test(filename) ||
         /\.avsc$/i.test(filename) ||  // Avro schema
         /event.*schema/i.test(filename);  // Event schemas
}

function isObservabilitySurface(filename: string): boolean {
  return /alerts|dashboards|grafana|slo/i.test(filename) ||
         /datadog|prometheus/i.test(filename) ||
         /monitoring|metrics/i.test(filename);
}

function isSecuritySurface(filename: string): boolean {
  return /auth|security|iam|permissions/i.test(filename) ||
         /CODEOWNERS/i.test(filename) ||
         /secrets|vault|encryption/i.test(filename);
}

function isDocsSurface(filename: string): boolean {
  return /README|CHANGELOG|docs\//i.test(filename) ||
         /\.md$/i.test(filename);
}
```

**Impact:**
- ❌ Current: Customers think "This is for teams using AI agents"
- ✅ Target: Customers think "This prevents contract drift for ANY PR"
- ❌ Current: Limited PMF to AI-heavy teams
- ✅ Target: Broad PMF to any team with contracts (OpenAPI, IaC, etc.)
- ❌ Current: No surface area classification
- ✅ Target: Clear contract domain detection drives all downstream checks

---

#### **Gap B: Two Parallel Systems - Not Unified (Missing Pipeline Architecture)**

**The Correct Track A Pipeline:**

Track A should perform **two distinct types of checks** in a structured order:

**A) Cross-Artifact Integrity Checks (Input ↔ Output Comparison)**

Deterministic diff logic comparing source ↔ declared artifacts:
- Code AST → OpenAPI
- OpenAPI → Confluence
- Terraform module → runbook page
- Alert threshold → SLO doc

**B) Obligation Checks (Checklist / Evidence Enforcement)**

Policy obligations triggered by surface area touched (not content comparison):
- Terraform IAM change → require rollback plan file
- DB migration → require migration test + backward compatibility note
- Public API change → require version bump
- Security-sensitive file → require CODEOWNER approval
- High-risk PR → require two human reviewers

**The Correct Track A Pipeline (6 Steps):**

1. **Surface Classification** - Identify contract domains touched (API, Infra, Data Model, etc.)
2. **Contract Resolution** - Determine which artifacts are required for those domains
3. **Deterministic Integrity Comparison** - Run comparators (OpenAPI vs code, alerts vs SLO doc, etc.)
4. **Obligation Policy Enforcement** - Run rule engine (require rollback.md, version bump, approvals)
5. **Risk Scoring** - Compute risk from surface criticality + scope + agent-confidence + missing obligations
6. **GitHub Check Run** - Single check with all findings + decision (PASS/WARN/BLOCK)

**Current State:**
We have TWO separate Track A implementations that don't follow this pipeline:

1. **Agent PR Gatekeeper** (`apps/api/src/services/gatekeeper/`)
   - ✅ Has: Agent detection, risk domains, evidence checks, delta sync findings
   - ❌ Missing: Surface classification, contract resolution, unified pipeline
   - ✅ Output: GitHub Check with risk tier (PASS/INFO/WARN/BLOCK)
   - Status: ✅ FULLY IMPLEMENTED (but wrong architecture)

2. **Contract Validation** (`apps/api/src/services/contracts/`)
   - ✅ Has: Contract resolution, comparators, IntegrityFindings
   - ❌ Missing: Surface classification, obligation checks, risk scoring, GitHub Check
   - ❌ Output: IntegrityFindings only (no GitHub Check)
   - Status: ⚠️ STUB IMPLEMENTATION (contract resolution not wired)

**What We're Already Doing Right (Track B Strengths):**

We're already **much closer to Track B** ("drift + remediation") than most teams:

✅ **18-state deterministic state machine** for drift detection (README.md)
- Doc resolution early
- Bounded context expansion (fetch up to 3 key changed files)
- **Deterministic comparison that yields typed deltas** (not "LLM vibes")

✅ **Control plane** (DriftPlan + PlanRun snapshots for reproducibility)
- Policy hash + thresholds snapshot
- Audit trail and reproducibility

✅ **Cluster-first triage** and early threshold routing
- Reduces fatigue + LLM cost
- 80-90% notification reduction

✅ **Evidence-grounded patching**
- LLM agents receive structured typed deltas
- Claude is for patch generation only, not pass/fail decisions

**So: Track B is real in our product.**

**What We Don't Yet Have Cleanly:**

❌ Track A as a **separate, fast, PR-native decision path** that:
- Outputs a **GitHub Check Run PASS/WARN/BLOCK**
- Never depends on slow/fragile external calls
- Runs in seconds (< 30s total)
- Soft-fails when external systems are unavailable

**The Core Gap:**

We need a **separate "Gate Policy Engine"** whose only output is:
- `gateDecision: PASS|WARN|BLOCK`
- `findings[]` (typed, policy-linked)
- `evidenceRefs[]` (hashes + pointers)
- `remediationSpawn?: boolean`

Right now our strongest deterministic artifact is the **EvidenceBundle + typed deltas** (which is perfect for Track B), but Track A needs a **"contract readiness policy layer"** on top that makes fast decisions without waiting for Track B's 18-state pipeline.

**The Real Difference: Decision Engine vs Remediation Engine**

Track A is a **decision engine** (PASS/WARN/BLOCK):
- Runs synchronously on PR
- Must be consistent + predictable
- Has policy enforcement and risk scoring
- Produces a compliance artifact attached to PR
- **Output:** GitHub Check with decision

Track B is a **remediation engine** (plan/patch/apply):
- Runs asynchronously
- Can retry/backoff
- Can batch and cluster
- Routes approvals
- Applies updates and records audit trail
- **Output:** Patch proposal + approval workflow

**Decision vs plan is the core distinction.**

**Problem:**
- ❌ Two separate systems running in parallel
- ❌ No unified pipeline architecture
- ❌ No surface classification step
- ❌ Comparator findings and evidence findings are separate
- ❌ Two different GitHub Checks (confusing UX)
- ❌ Not architected as decision engine (missing policy enforcement layer)

**Current Webhook Flow:**
```typescript
// apps/api/src/routes/webhooks.ts (lines 476-544)

// Step 1: Run Agent PR Gatekeeper
if (isFeatureEnabled('ENABLE_AGENT_PR_GATEKEEPER', workspaceId)) {
  const gatekeeperResult = await runGatekeeper({ ... });
  // Creates GitHub Check #1
}

// Step 2: Run Contract Validation (separate)
if (isFeatureEnabled('ENABLE_CONTRACT_VALIDATION', workspaceId)) {
  const validationResult = await runContractValidation({ ... });
  // TODO: Create GitHub Check #2 (not implemented)
}
```

**Target State (Unified Pipeline):**
```typescript
// Unified Track A: Contract Integrity Gate
if (isFeatureEnabled('ENABLE_CONTRACT_INTEGRITY_GATE', workspaceId)) {
  const gateResult = await runContractIntegrityGate({
    workspaceId,
    pr: { ... },
    changedFiles,
  });

  // gateResult follows the 6-step pipeline:
  // Step 1: surfaces = ['api', 'infra']
  // Step 2: contracts = [PublicAPI, IAMInfra]
  // Step 3: integrityFindings = [OpenAPI not updated, runbook missing]
  // Step 4: policyFindings = [rollback.md missing, version bump missing]
  // Step 5: riskScore = 0.85 (HIGH)
  // Step 6: decision = BLOCK

  // Create ONE GitHub Check with unified findings
  await createContractIntegrityCheck(gateResult);
}
```

**Concrete Example:**

PR modifies:
- `/api/orders.ts`
- `terraform/iam.tf`

Track A should:

1. **Detect surfaces:** API + IAM
2. **Compare:**
   - OpenAPI spec updated? ❌
   - Confluence API page updated? ❌
   - IAM doc updated? ❌
3. **Enforce:**
   - IAM requires rollback plan ❌
   - API change requires version bump ❌
4. **Score risk:** IAM + API + >200 LOC = High (0.85)
5. **Output:**
   - BLOCK: missing rollback.md
   - WARN: Confluence not updated
   - Require 2 approvals

---

#### **Gap C: Finding Model - Not Unified**

**Current State:**
We have TWO different finding models:

1. **DeltaSyncFinding** (from Agent PR Gatekeeper):
```typescript
export interface DeltaSyncFinding {
  type: 'iac_drift' | 'api_drift' | 'ownership_drift';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  affectedFiles: string[];
  suggestedDocs: string[];
  evidence: string;
}
```

2. **IntegrityFinding** (from Contract Validation):
```typescript
export interface IntegrityFinding {
  workspaceId: string;
  id: string;
  contractId: string;
  invariantId: string;
  driftType: string;  // 'endpoint_missing', 'schema_mismatch', etc.
  domains: string[];
  severity: string;
  compared: Json;  // { left: { snapshotId }, right: { snapshotId } }
  evidence: Json;
  confidence: number;
  impact: number;
  band: 'pass' | 'warn' | 'fail';
  recommendedAction: string;
  ownerRouting: Json;
  driftCandidateId?: string;
}
```

**Problem:** Two different schemas, can't aggregate or compare.

**Target State:**
Unify into ONE `IntegrityFinding` schema that supports:
- Contract comparator findings (OpenAPI ↔ Docs)
- Evidence requirement findings (missing rollback notes)
- Risk modifier findings (agent-authored, correlated incidents)
- Delta sync findings (IaC drift, API drift)

---

#### **Gap D: Blocking Policy - No Safe Default & No Contract Pack Configuration**

**The Missing Concept: Contract Packs as First-Class Objects**

Track A needs **configurable "contract packs"** that define what to check per surface area.

**The Clean Definition of Track A:**

> "Given this PR, determine which contract surfaces were touched, then run a configured set of deterministic comparators + obligation/policy checks, compute risk, and return a gate decision (PASS/WARN/BLOCK) with evidence."

Everything (customer config, comparators, surface area, integrity comparisons, obligations) is in service of that single pipeline.

**What is a Contract Pack?**

A bundle of checks/policies triggered by surfaces. It describes:
- **Trigger:** which file patterns or surfaces activate it
- **Required artifacts:** what must exist / be updated
- **Comparators:** deterministic functions that produce structured findings
- **Policies/Obligations:** required evidence/approvals (not content comparison)
- **Decision thresholds:** warn/block rules per severity

**Recommended Starter ContractPacks (Ship These - Cover 80% of Value):**

1. **Public API ContractPack**
   - Triggers: openapi + controllers
   - Comparators: OpenAPI validity + diff, version bump rule, changelog rule, docs anchor/version marker check
   - Obligations: API owners approval on breaking changes

2. **Privileged Infra ContractPack**
   - Triggers: terraform iam / network / k8s
   - Comparators: terraform risk classifier, required runbook section present (anchor)
   - Obligations: rollback plan required, security approval required

3. **Data Migration ContractPack**
   - Triggers: migrations / schema
   - Comparators: migration present, backward compatibility marker present
   - Obligations: migration plan file, tests updated

4. **Observability ContractPack**
   - Triggers: alert rules / slo config / dashboards-as-code
   - Comparators: thresholds align with SLO policy doc (structured)
   - Obligations: runbook updated for new alerts

**Detailed ContractPack Schema (Implementable Design):**

Each ContractPack has:
- **activation**: which surfaces trigger it
- **artifacts**: what to fetch (from PR/code and from targets like Confluence)
- **comparators**: deterministic checks producing IntegrityFindings
- **obligations**: checklist/policy requirements producing PolicyFindings
- **decision**: mapping findings → gate outcomes (WARN/BLOCK) and overrides

**Example Contract Pack: PublicAPI (Full Schema)**

```yaml
name: "PublicAPI"
description: "Ensures public API contract, versioning, and docs are consistent at merge time."
activation:
  any_surfaces: ["api_contract"]
  min_confidence: 0.6

artifacts:
  required:
    - id: "openapi_spec"
      type: "github_file"
      ref: "PR_HEAD"
      path: "openapi/openapi.yaml"

    - id: "changelog"
      type: "github_file"
      ref: "PR_HEAD"
      path: "CHANGELOG.md"

    - id: "readme"
      type: "github_file"
      ref: "PR_HEAD"
      path: "README.md"

    - id: "confluence_api_page"
      type: "confluence_page"
      page_id: "123456789"     # customer-configured
      format: "storage"

  optional:
    - id: "openapi_spec_base"
      type: "github_file"
      ref: "PR_BASE"
      path: "openapi/openapi.yaml"

comparators:
  - id: "openapi_valid"
    type: "openapi.validate"
    inputs: ["openapi_spec"]
    params:
      strict: true

  - id: "openapi_diff"
    type: "openapi.diff"
    inputs: ["openapi_spec_base", "openapi_spec"]
    params:
      classify_breaking: true
      treat_remove_required_field_as_breaking: true

  - id: "version_bump_on_breaking"
    type: "policy.version_bump"
    inputs: ["openapi_spec_base", "openapi_spec"]
    params:
      version_field: "info.version"
      bump_required_if: "breaking_change_detected"

  - id: "docs_anchor_matches_openapi"
    type: "docs.anchor_check"
    inputs: ["openapi_spec", "confluence_api_page"]
    params:
      anchors:
        - key: "OPENAPI_SHA"
          source: "sha256(openapi_spec)"
          target_pattern: "OPENAPI_SHA:\\s*([a-f0-9]{64})"
        - key: "API_VERSION"
          source: "jsonpath(openapi_spec, 'info.version')"
          target_pattern: "API_VERSION:\\s*([0-9A-Za-z\\.\\-]+)"
      failure_severity: "warn"  # gate-safe start; customers can later set "block"

  - id: "readme_anchor_matches_openapi"
    type: "docs.anchor_check"
    inputs: ["openapi_spec", "readme"]
    params:
      anchors:
        - key: "API_VERSION"
          source: "jsonpath(openapi_spec, 'info.version')"
          target_pattern: "API_VERSION:\\s*([0-9A-Za-z\\.\\-]+)"
      failure_severity: "warn"

obligations:
  # Obligations are NOT content comparisons - they're checklist/policy requirements
  # triggered by surface area touched or findings detected

  - id: "api_owner_review_on_breaking"
    type: "obligation.approval_required"
    params:
      when:
        finding_type: "OPENAPI_BREAKING_CHANGE"
      required_groups: ["api_owners"]
      severity_if_missing: "block"

  - id: "changelog_updated_on_breaking"
    type: "obligation.file_changed"
    params:
      when:
        finding_type: "OPENAPI_BREAKING_CHANGE"
      path: "CHANGELOG.md"
      severity_if_missing: "block"

decision:
  severity_to_outcome:
    info: "pass"
    warn: "warn"
    block: "block"
  mode_overrides:
    if_repo_mode_warn_only: true
```

**Example Contract Pack: PrivilegedInfra (Terraform/IAM)**

```yaml
name: "PrivilegedInfra"
description: "Guards IAM/network/infra changes with risk scoring and required evidence."
activation:
  any_surfaces: ["privileged_infra", "security_boundary"]
  min_confidence: 0.6

artifacts:
  required:
    - id: "terraform_dir"
      type: "github_directory"
      ref: "PR_HEAD"
      path: "terraform/"

    - id: "runbook_infra"
      type: "github_file"
      ref: "PR_HEAD"
      path: "docs/runbooks/infra.md"

    - id: "rollback_plan"
      type: "github_file"
      ref: "PR_HEAD"
      path: "docs/rollback.md"
      required_if:
        surfaces_any: ["privileged_infra"]

  optional:
    - id: "terraform_plan"
      type: "ci_artifact"
      name: "terraform-plan.json"

comparators:
  - id: "terraform_risk"
    type: "terraform.risk_classifier"
    inputs: ["terraform_dir"]
    params:
      rules:
        iam_resource_patterns:
          - "aws_iam_*"
          - "google_project_iam_*"
          - "azurerm_role_*"
        network_resource_patterns:
          - "aws_security_group*"
          - "aws_network_acl*"
        severity_map:
          iam_change: "block"
          network_change: "warn"
          compute_change: "warn"

  - id: "runbook_anchor_present"
    type: "docs.required_sections"
    inputs: ["runbook_infra"]
    params:
      required_headers:
        - "Rollback"
        - "Deployment"
        - "Permissions"
      severity_if_missing: "warn"

obligations:
  - id: "security_review_for_iam"
    type: "obligation.approval_required"
    params:
      when:
        finding_type: "TERRAFORM_IAM_CHANGE"
      required_groups: ["security"]
      severity_if_missing: "block"

  - id: "rollback_plan_required"
    type: "obligation.file_present"
    params:
      when:
        surfaces_any: ["privileged_infra"]
      path: "docs/rollback.md"
      severity_if_missing: "block"

  - id: "two_reviewers_on_high_risk"
    type: "obligation.min_reviewers"
    params:
      when:
        risk_score_gte: 80
      min_reviewers: 2
      severity_if_missing: "block"

decision:
  severity_to_outcome:
    info: "pass"
    warn: "warn"
    block: "block"
```

**Truth Anchors Strategy (Critical for Deterministic Docs Checks):**

To make Track A compare PR changes to Confluence **deterministically**, require docs to include structured markers:

**In Confluence:**
```
Operational Truth
OPENAPI_SHA: <64-hex>
API_VERSION: 1.7.2
LAST_SYNCED_COMMIT: <sha>
```

**In README:**
```
API_VERSION: 1.7.2
OPENAPI_SHA: <64-hex>
```

Then `docs.anchor_check` comparator becomes deterministic:
- compute sha256(openapi)
- parse doc to extract anchor values
- compare exact equality

**This is gate-safe** and avoids LLM semantics. Track B can still do rich doc rewrites; Track A only validates anchors.

**Current State:**
```typescript
// apps/api/src/services/gatekeeper/riskTier.ts (lines 116-128)
if (score >= 0.80) {
  tier = 'BLOCK';
  recommendation = 'Block merge - requires manual review and evidence';
} else if (score >= 0.60) {
  tier = 'WARN';
  recommendation = 'Warning - recommend manual review before merge';
}
```

**Problem:**
- ❌ No ContractPack model or configuration
- ❌ No per-repo policy configuration
- ❌ No warn-only mode by default
- ❌ No degraded mode rules (e.g., if Confluence is down, don't BLOCK—WARN)
- ❌ Hard-coded thresholds (0.80, 0.60, 0.30)
- ❌ No mapping of surfaces → required artifacts → comparators
- ❌ Customers can't configure "for API changes, our spec lives in `/spec/openapi.yaml`"

**Repo-Level Configuration Schema (`contractpacks.yaml`):**

Design goals:
- **Common primitives**: surfaces, artifacts, comparators, obligations, policies
- **Customer-configurable mapping**: paths → surfaces, surfaces → packs, pack → artifacts & rules
- **Gate-safe**: Track A can run deterministically in <30s

```yaml
version: 1

org:
  name: "acme"
  default_mode: "warn"            # warn | block
  grace:
    external_fetch_failure: "warn" # warn | ignore | block (recommend warn)
  evidence:
    store: "s3://verta-evidence/acme"
    retention_days: 90
    include_diff_snippets: true

repos:
  - repo: "acme/payments-service"
    branch_protection:
      required_check_name: "VertaAI Contract Integrity"
    config:
      mode: "warn"                 # override org default per repo
      exclusions:
        paths:
          - "experimental/**"
          - "**/*.md"
    surfaces:
      matchers:
        - id: "api_openapi_files"
          surface: "api_contract"
          type: "path_glob"
          patterns: ["openapi/**", "**/openapi.yaml", "**/openapi.yml"]
          confidence: 0.95

        - id: "api_controller_changes"
          surface: "api_contract"
          type: "path_glob"
          patterns: ["src/controllers/**", "src/routes/**"]
          confidence: 0.75

        - id: "infra_terraform"
          surface: "privileged_infra"
          type: "path_glob"
          patterns: ["terraform/**", "infra/**"]
          confidence: 0.9

        - id: "security_auth"
          surface: "security_boundary"
          type: "path_glob"
          patterns: ["src/auth/**", "src/security/**"]
          confidence: 0.9

    contractpacks:
      enabled:
        - "PublicAPI"
        - "PrivilegedInfra"

    policy:
      risk_weights:
        api_contract: 30
        privileged_infra: 45
        security_boundary: 40
        data_contract: 35
        observability_contract: 20
      thresholds:
        warn_risk: 40
        block_risk: 80
      approvals:
        groups:
          api_owners: ["team:acme-api-owners"]
          security:   ["team:acme-security"]
          sre:        ["team:acme-sre"]
```

**Track A Pipeline Wiring (How Config Drives Execution):**

```typescript
export async function runContractIntegrityGate(
  prEvent: GitHubPREvent,
  repoConfig: RepoConfig,
  contractPacksDefs: ContractPackDefinition[]
): Promise<GateResult> {

  // 0) Collect PR context
  const pr = await collectPRContext(prEvent);
  const prFiltered = applyExclusions(pr, repoConfig.config.exclusions);

  // 1) Surface Classification
  const surfaceHits = classifySurfaces(
    prFiltered.changedFiles,
    repoConfig.surfaces.matchers
  );
  const surfaces = selectSurfaces(surfaceHits);  // keep confidence >= threshold

  // 2) Resolve ContractPacks
  const packs = resolveContractPacks(
    surfaces,
    repoConfig.contractpacks.enabled,
    contractPacksDefs
  );

  const allFindings: IntegrityFinding[] = [];
  const evidenceRefs: SnapshotRef[] = [];
  const extractedCache: Record<string, any> = {};

  for (const pack of packs) {
    // 3) Fetch required artifacts for pack
    const snapshots = await fetchSnapshots(
      pack.artifacts,
      pr,
      repoConfig,
      grace: repoConfig.org.grace
    );
    evidenceRefs.push(...Object.values(snapshots));

    // 4) Run comparators (deterministic)
    for (const compCfg of pack.comparators) {
      const comp = comparatorRegistry[compCfg.type];
      const result = await comp.run({
        contractPack: pack.name,
        surface: pack.primarySurface,
        snapshots,
        extracted: extractedCache,
        params: compCfg.params || {},
        prContext: pr.asDict()
      });

      allFindings.push(...result.findings);

      // If unverifiable, emit a warn finding instead of failing hard
      if (result.unverifiable) {
        allFindings.push({
          findingType: "UNVERIFIABLE_CHECK",
          severity: "warn",
          confidence: 0.7,
          surface: pack.primarySurface,
          contractPack: pack.name,
          summary: `Unable to verify ${compCfg.id}: ${result.unverifiableReason}`,
          evidence: { comparator: compCfg.type }
        });
      }
    }

    // 5) Run obligations
    for (const oblCfg of pack.obligations) {
      const obl = obligationRegistry[oblCfg.type];
      const oblFindings = await obl.run({
        contractPack: pack.name,
        surfaces,
        findings: allFindings,
        prContext: pr.asDict(),
        params: oblCfg.params || {}
      });
      allFindings.push(...oblFindings);
    }
  }

  // 6) Risk scoring
  const risk = computeRiskScore(
    surfaces,
    allFindings,
    repoConfig.policy.risk_weights
  );

  // 7) Decision
  const outcome = decide(
    allFindings,
    risk,
    repoConfig.policy.thresholds,
    mode: repoConfig.config.mode || "warn"
  );

  // 8) Publish check run + evidence
  const evidenceBundleId = await storeEvidence(
    evidenceRefs,
    allFindings,
    pr,
    repoConfig.org.evidence
  );

  await publishGitHubCheck(
    pr,
    outcome,
    risk,
    allFindings,
    evidenceBundleId
  );

  // 9) Optional: spawn Track B if enabled
  if (shouldSpawnTrackB(outcome, allFindings, repoConfig)) {
    await enqueueTrackBJob(pr, allFindings, evidenceBundleId);
  }

  return outcome;
}
```

**Key Mapping Mechanism:**

Surface classification does **not** directly run checks. It selects **ContractPacks**.

ContractPack selects:
- artifacts to fetch
- comparators to run
- obligations to enforce
- decision thresholds

**That's what makes the system scalable.**

**Example mapping:**
- If `api_contract` touched → run `PublicAPI`
- If `privileged_infra` touched → run `PrivilegedInfra`
- If both touched → run both packs

Each pack can run multiple comparators and obligations.

---

**Architecture: Common Primitives + Customer Configuration**

**The Key Principle:** Customers configure **mapping and thresholds**, not logic.

**Layer 1: Common Primitives (You Ship - Same Across Customers)**

**Core Objects:**
- `Surface` - contract-bearing domain (API, IAM, DB, Observability, etc.)
- `ContractPack` - bundle of checks/policies triggered by surfaces
- `Artifact` - piece of truth (OpenAPI file, README, Confluence page, Terraform plan)
- `Snapshot` - time/version-specific capture of an artifact
- `Comparator` - deterministic function that produces structured findings
- `Finding` - `{type, severity, confidence, evidence, remediation_hint}`
- `PolicyRule / ObligationCheck` - deterministic rule enforcing required evidence/approvals
- `RiskScore` - derived metric from surfaces + findings + blast radius
- `GateDecision` - PASS/WARN/BLOCK + reason codes
- `EvidenceBundle` - immutable record of what was checked and why decision was made

**Engines (Services):**
- `SurfaceClassifier` - deterministic surface detection
- `ContractResolver` - maps surfaces → contract packs
- `SnapshotFetcher` - fetches artifacts with caching
- `ComparatorRunner` - runs comparators for contract packs
- `PolicyEngine` - enforces obligation checks
- `RiskScorer` - computes risk from surfaces + findings
- `DecisionEngine` - applies thresholds to determine PASS/WARN/BLOCK
- `CheckPublisher` - GitHub Check Run integration

**Obligation Rule Categories (Common Primitives):**

Track A needs "obligation rules" tied to change surfaces - these are NOT content comparisons, they're checklist/policy requirements.

**A) Approval Obligations**
- CODEOWNER approval required for sensitive paths
- 2 reviewers required if risk >= X
- security approval required if SECURITY_BOUNDARY touched
- **Deterministic and very valuable**

**B) Evidence Obligations**
- `rollback.md` required when infra touched
- `migration_plan.md` required when DB migration touched
- `customer_impact.md` required when public API changed
- **These become the "Definition of Done" enforceable in CI**

**C) Test Obligations**
- tests updated when touching a module
- migration tests included if migrations changed
- **Start with "presence required" not "quality required" (low-noise)**

**D) Release Obligations**
- changelog updated for certain surfaces
- version bump required for breaking changes
- **Great gate checks**

**Change Surface Detection (Deterministic):**

Example **change surfaces** (deterministically detected from PR diff paths + heuristics):
- `openapi_changed`
- `api_handler_changed`
- `db_schema_changed`
- `migration_added_or_missing`
- `terraform_changed`
- `auth_policy_changed`
- `slo_threshold_changed` (grafana/datadog as code)
- `agent_authored_sensitive_change` (agent signatures)

Example **required artifacts** (mapped from change surfaces):
- `openapi_spec_updated`
- `migration_present`
- `rollback_notes_present`
- `runbook_updated`
- `dashboard_alert_rule_updated`
- `owner_ack_required`
- `2-person-review_required`

**Decision determinism:** obligation rule evaluation decides PASS/WARN/BLOCK.

**Why Obligations Are Essential:**

Not every risk is "diffable" by comparator.

Example:
- Terraform changed IAM — you can't always "compare" to docs reliably.
  But you can require:
  - rollback plan
  - security approval
  - runbook section updated

That's a durable gate.

---

**Layer 2: Customer Configuration (They Define - Varies by Org/Repo/Team)**

Customers should only configure **mapping and thresholds**, not logic:

- **File-to-surface mappings** - "Which files map to which surfaces" (their repo structure)
- **Change surface detection rules** - "Which patterns trigger which change surfaces"
- **Artifact locations** - "Which artifacts represent the 'truth' for a surface"
  - OpenAPI path(s): `/spec/openapi.yaml`
  - Docs targets: README paths, Confluence page IDs
  - Runbook locations: `/docs/runbooks/infra.md`
  - Terraform directories: `/terraform/**`
  - Alert rule locations: `/alerts/**`
- **ContractPack activation** - "Which checks apply to which surfaces"
- **Policy thresholds** - WARN vs BLOCK severity levels
- **Approval requirements** - CODEOWNERS mapping, required reviewers
- **Graceful degradation rules** - "What happens if Confluence is down"
- **Exemptions** - paths, branches, experimental dirs
- **Rollout mode** - warn-only → block-high-only → block-all-critical

**What's Common vs Configurable:**

| Aspect | Common (You Ship) | Configurable (Customer Defines) |
|--------|-------------------|----------------------------------|
| **Surface categories** | ✅ 6-8 core surfaces (API, Infra, Data, Observability, Security, Docs) | ❌ |
| **Comparator library** | ✅ OpenAPI diff, required artifacts, version markers, approvals | ❌ |
| **Obligation rule types** | ✅ Approval, evidence, test, release obligations | ❌ |
| **Finding schema** | ✅ Structured output format | ❌ |
| **GitHub Check publishing** | ✅ Standard format | ❌ |
| **Path mappings** | ❌ | ✅ Per-repo file patterns |
| **Artifact locations** | ❌ | ✅ OpenAPI paths, Confluence page IDs |
| **Severity thresholds** | ❌ | ✅ WARN/BLOCK levels |
| **Approval groups** | ❌ | ✅ CODEOWNERS mapping |
| **Rollout mode** | ❌ | ✅ warn-only vs block |

This is how you get "same engine, different org" without becoming a services company.

**Target State:**
```prisma
model ContractPack {
  workspaceId String
  id          String
  name        String

  // Triggers
  filePatterns String[]  // ["/openapi.yaml", "/src/controllers/**"]
  surfaces     String[]  // ["api", "infra"]

  // Required artifacts
  requiredArtifacts Json  // [{ type: "openapi_spec", path: "..." }]

  // Comparators to run
  comparators Json  // [{ type: "OpenAPIDiffComparator", config: {...} }]

  // Policy rules
  policies Json  // [{ rule: "version_bump_required", severity: "critical" }]

  // Decision thresholds
  blockThreshold Float @default(0.80)
  warnThreshold  Float @default(0.60)

  @@id([workspaceId, id])
}

model ContractPolicy {
  workspaceId String @id

  // Policy mode
  mode String @default("warn-only")  // 'warn-only', 'block-high-only', 'block-all-critical'

  // Degraded mode rules
  degradedMode Json @default("{}")  // { confluenceDown: 'warn', githubDown: 'skip' }

  // Exemptions
  exemptRepos  String[] @default([])
  exemptLabels String[] @default(["hotfix", "emergency"])

  workspace Workspace @relation(fields: [workspaceId], references: [id])
}
```

**Critical Design Principle: "Block" Must Be Conservative**

Block only on high-confidence, deterministic failures:
- ✅ OpenAPI invalid
- ✅ Missing required file (changelog, rollback plan)
- ✅ Approvals missing for sensitive change
- ✅ Breaking change without version bump

Everything else starts as WARN.

**External Systems Must Not Create False Blocks:**

If Confluence is down, Track A should:
- ⚠️ WARN "could not validate doc target"
- ❌ NOT BLOCK by default

Track B can do the async fetch/retry.

---

## Part 2: Detailed Gap Breakdown

### Gap Summary Table

| Gap | Current State | Target State | Impact | Effort |
|-----|---------------|--------------|--------|--------|
| **A: Product Definition** | Agent-centric ("Agent PR Gatekeeper") | Contract-centric ("Contract Integrity Gate") with surface classification | HIGH - Limits PMF | MEDIUM - Rename + add surface classifier |
| **B: Pipeline Architecture** | 2 separate systems, no unified pipeline | 6-step pipeline: Surface → Contract → Compare → Enforce → Score → Check | HIGH - Confusing UX, missing key steps | HIGH - Implement pipeline |
| **C: Finding Model** | 2 different schemas (DeltaSyncFinding vs IntegrityFinding) | 1 unified IntegrityFinding with source field | MEDIUM - Can't aggregate | MEDIUM - Schema migration |
| **D: Contract Pack Config** | Hard-coded thresholds, no contract packs | ContractPack model + ContractPolicy with degraded mode | HIGH - Can't configure per-customer | HIGH - Add config models + UI |
| **E: Trigger Logic** | Author-based (all PRs except trusted bots) | Surface-based (PRs touching contract surfaces) | HIGH - Misses non-agent PRs, wrong entry point | MEDIUM - Implement surface classifier |

---

## Part 3: Recommended Changes

### Change 1: Implement Surface Classification (Foundation)

**What:** Add surface area classification as the entry point for Track A.

**Why:** This is the foundation that enables contract-centric architecture. Without it, you can't map surfaces → contracts → comparators.

**Implementation:**
```typescript
// apps/api/src/services/contractGate/surfaceClassifier.ts

export type Surface = 'api' | 'infra' | 'data_model' | 'observability' | 'security' | 'docs';

export interface SurfaceClassification {
  surfaces: Surface[];
  filesBySurface: Record<Surface, string[]>;
  confidence: number;
}

export function classifySurfaceAreas(
  files: Array<{ filename: string; patch?: string }>
): SurfaceClassification {
  const surfaceMap: Record<Surface, string[]> = {
    api: [],
    infra: [],
    data_model: [],
    observability: [],
    security: [],
    docs: []
  };

  for (const file of files) {
    // API surface
    if (isApiSurface(file.filename)) {
      surfaceMap.api.push(file.filename);
    }

    // Infra surface
    if (isInfraSurface(file.filename)) {
      surfaceMap.infra.push(file.filename);
    }

    // Data model surface
    if (isDataModelSurface(file.filename)) {
      surfaceMap.data_model.push(file.filename);
    }

    // Observability surface
    if (isObservabilitySurface(file.filename)) {
      surfaceMap.observability.push(file.filename);
    }

    // Security surface
    if (isSecuritySurface(file.filename)) {
      surfaceMap.security.push(file.filename);
    }

    // Docs surface
    if (isDocsSurface(file.filename)) {
      surfaceMap.docs.push(file.filename);
    }
  }

  const surfaces = Object.entries(surfaceMap)
    .filter(([_, files]) => files.length > 0)
    .map(([surface, _]) => surface as Surface);

  return {
    surfaces,
    filesBySurface: surfaceMap,
    confidence: 1.0  // Deterministic classification
  };
}

function isApiSurface(filename: string): boolean {
  return /openapi\.(yaml|yml|json)/i.test(filename) ||
         /swagger\.(yaml|yml|json)/i.test(filename) ||
         /controllers|routes|api/i.test(filename) ||
         /\.proto$/i.test(filename);
}

function isInfraSurface(filename: string): boolean {
  return /\.tf$/i.test(filename) ||
         /k8s|kubernetes|helm/i.test(filename) ||
         /deployment|iam|network/i.test(filename) ||
         /docker|compose/i.test(filename);
}

function isDataModelSurface(filename: string): boolean {
  return /migration|schema\.sql|models/i.test(filename) ||
         /prisma\/schema/i.test(filename);
}

function isObservabilitySurface(filename: string): boolean {
  return /alerts|dashboards|grafana|slo/i.test(filename) ||
         /datadog|prometheus/i.test(filename);
}

function isSecuritySurface(filename: string): boolean {
  return /auth|security|iam|permissions/i.test(filename) ||
         /CODEOWNERS/i.test(filename);
}

function isDocsSurface(filename: string): boolean {
  return /README|CHANGELOG|docs\//i.test(filename);
}
```

**Effort:** 1 day (implementation + tests)

**Impact:** HIGH - Enables contract-centric architecture, foundation for all other changes

---

### Change 2: Rename & Reframe (Minimal Code, Maximum PMF Impact)

**Action Items:**
1. Rename feature flag: `ENABLE_AGENT_PR_GATEKEEPER` → `ENABLE_CONTRACT_INTEGRITY_GATE`
2. Rename service: `apps/api/src/services/gatekeeper/` → `apps/api/src/services/contractGate/`
3. Update PRODUCT_GUIDE.md: Change "Agent PR Gatekeeper" → "Contract Integrity Gate"
4. Update README.md: Same rename
5. Update marketing copy: Focus on "contract validation" not "agent detection"
6. Update trigger logic to use surface classification

**Effort:** 4 hours (find-and-replace + documentation + trigger update)

**Impact:** HIGH - Changes customer perception from "AI agent tool" to "contract governance tool"

---

### Change 3: Implement Unified Pipeline (Merge Two Systems)

**What:** Merge Agent PR Gatekeeper + Contract Validation into one unified pipeline.

**The 6-Step Pipeline:**

```typescript
// apps/api/src/services/contractGate/index.ts

export async function runContractIntegrityGate(
  input: ContractGateInput
): Promise<ContractGateResult> {

  // Step 1: Surface Classification
  const classification = classifySurfaceAreas(input.files);
  console.log(`[ContractGate] Surfaces touched: ${classification.surfaces.join(', ')}`);

  // Step 2: Contract Resolution
  const contracts = await resolveContracts({
    workspaceId: input.workspaceId,
    surfaces: classification.surfaces,
    files: input.files,
    repo: input.repo
  });
  console.log(`[ContractGate] Resolved ${contracts.length} contract packs`);

  // Step 3: Deterministic Integrity Comparison
  const integrityFindings: IntegrityFinding[] = [];
  for (const contract of contracts) {
    const snapshots = await fetchArtifactSnapshots(contract);
    const comparatorFindings = await runComparators(contract, snapshots);
    integrityFindings.push(...comparatorFindings);
  }
  console.log(`[ContractGate] Found ${integrityFindings.length} integrity findings`);

  // Step 4: Obligation Policy Enforcement
  const policyFindings: IntegrityFinding[] = [];
  for (const contract of contracts) {
    const obligationFindings = await enforceObligations(contract, input);
    policyFindings.push(...obligationFindings);
  }
  console.log(`[ContractGate] Found ${policyFindings.length} policy findings`);

  // Step 5: Risk Scoring
  const allFindings = [...integrityFindings, ...policyFindings];
  const riskScore = calculateRiskScore({
    surfaces: classification.surfaces,
    findings: allFindings,
    prSize: input.additions + input.deletions,
    agentConfidence: detectAgentAuthorship(input)  // Optional modifier
  });
  console.log(`[ContractGate] Risk score: ${riskScore.score} (${riskScore.tier})`);

  // Step 6: GitHub Check Run
  const decision = determineDecision(riskScore, allFindings, input.policy);
  await createGitHubCheck({
    ...input,
    surfaces: classification.surfaces,
    contracts,
    findings: allFindings,
    riskScore,
    decision
  });

  return {
    surfaces: classification.surfaces,
    contractsChecked: contracts.length,
    findings: allFindings,
    riskScore: riskScore.score,
    riskTier: riskScore.tier,
    decision: decision.conclusion,
    checkCreated: true
  };
}
```

**Key Changes:**
1. ✅ Unified entry point (`runContractIntegrityGate`)
2. ✅ Surface classification drives everything
3. ✅ Contract resolution maps surfaces → contract packs
4. ✅ Both comparator findings AND policy findings in one pipeline
5. ✅ Agent detection is a risk modifier, not the trigger
6. ✅ Single GitHub Check with all findings

**Effort:** 2 days (merge logic + tests)

**Impact:** HIGH - Eliminates confusion, provides unified UX

**Critical Design Principle: Don't Shoehorn Track A into Track B's 18-State Machine**

❌ **Don't do this:** Try to make Track A use the existing 18-state drift remediation pipeline
- It will slow it down (Track A must be < 30s)
- It will inherit failure modes that should never block merges
- External system failures will block PRs incorrectly

✅ **Do this:** Create a **separate, small state machine** for Track A:

**Gate A State Machine (6-8 states, seconds):**

1. `GATE_INGESTED` (PR opened/sync)
2. `GATE_EVIDENCE_EXTRACTED` (diff + bounded key file fetch)
3. `GATE_CONTRACT_CHECKED` (deterministic obligations + typed deltas)
4. `GATE_DECIDED` (PASS/WARN/BLOCK)
5. `CHECKRUN_POSTED` (GitHub Check Run)
6. `OPTIONAL_REMEDIATION_SPAWNED` (enqueue Track B drift case)
7. `GATE_COMPLETED`

**Key rule:** `CHECKRUN_POSTED` must happen even if partial evidence; decisions degrade to WARN on missing external data.

**Shared Primitives (Reused by Both A and B):**

- Signal normalization
- Deterministic artifact extraction
- Typed delta comparator (already exists!)
- Control plane (DriftPlan/PlanRun snapshots - already exists!)
- EvidenceBundle + audit events (already exists!)

**Track A (Gatekeeper)** = *decision engine* + GitHub Check Run writer

**Track B (Drift/Remediation)** = existing 18-state pipeline

**Evidence Bundle "Fast Lane" Schema:**

Track A needs a smaller "GateEvidenceBundle" (subset of Track B's full evidence):

- PR metadata (title, author, labels)
- file change summary (paths, counts, risk-scored)
- extracted artifacts (top N):
  - OpenAPI deltas if relevant
  - schema/migration signals
  - infra key changes (ports, env vars)
- links/hashes:
  - diff hash
  - obligation rule hash (policy version)
  - extraction version hash

Store the **same reproducibility anchors** we already do for PlanRun: policy hash + thresholds snapshot.

---

### Change 4: Add ContractPack Configuration Model

**What:** Add ContractPack as a first-class configurable object.

**Why:** This is what makes Track A configurable per-customer without becoming a services company.

**New Prisma Models:**
```prisma
model ContractPack {
  workspaceId String
  id          String
  name        String
  description String?

  // Triggers (when this pack applies)
  filePatterns String[]  // ["/openapi.yaml", "/src/controllers/**"]
  surfaces     String[]  // ["api", "infra"]

  // Required artifacts (what must exist/be updated)
  requiredArtifacts Json  // [{ type: "openapi_spec", path: "openapi.yaml" }, { type: "docs", target: "confluence:123" }]

  // Comparators to run (deterministic checks)
  comparators Json  // [{ type: "OpenAPIDiffComparator", config: { checkBreaking: true } }]

  // Policy rules (obligation checks)
  policies Json  // [{ rule: "version_bump_required", severity: "critical" }, { rule: "require_rollback_plan" }]

  // Decision thresholds
  blockThreshold Float @default(0.80)
  warnThreshold  Float @default(0.60)

  // Metadata
  enabled   Boolean @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@id([workspaceId, id])
  workspace Workspace @relation(fields: [workspaceId], references: [id])
}

model ContractPolicy {
  workspaceId String @id

  // Policy mode (global workspace setting)
  mode String @default("warn-only")  // 'warn-only', 'block-high-only', 'block-all-critical'

  // Degraded mode rules (what to do when external systems are down)
  degradedMode Json @default("{}")  // { confluenceDown: 'warn', githubDown: 'skip' }

  // Exemptions (repos/labels that skip checks)
  exemptRepos  String[] @default([])
  exemptLabels String[] @default(["hotfix", "emergency"])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id])
}
```

**Example ContractPack Configuration:**

```typescript
// Seed data: PublicAPI contract pack
{
  workspaceId: "ws_123",
  id: "pack_public_api",
  name: "Public API Contract",
  description: "Ensures API changes update OpenAPI spec and docs",

  filePatterns: [
    "/openapi.yaml",
    "/swagger.json",
    "/src/controllers/**",
    "/src/routes/**"
  ],

  surfaces: ["api"],

  requiredArtifacts: [
    { type: "openapi_spec", path: "openapi.yaml" },
    { type: "docs", target: "confluence:page-id-123" },
    { type: "changelog", path: "CHANGELOG.md" }
  ],

  comparators: [
    {
      type: "OpenAPIDiffComparator",
      config: {
        checkBreaking: true,
        requireVersionBump: true
      }
    },
    {
      type: "DocsReferenceComparator",
      config: {
        checkVersion: true,
        checkEndpoints: true
      }
    }
  ],

  policies: [
    {
      rule: "if_breaking_change",
      require: "api-owners-approval",
      severity: "critical"
    },
    {
      rule: "version_bump_required",
      severity: "critical"
    },
    {
      rule: "changelog_updated",
      severity: "high"
    }
  ],

  blockThreshold: 0.80,
  warnThreshold: 0.60,
  enabled: true
}
```

**Effort:** 2 days (models + CRUD API + UI + seed data)

**Impact:** HIGH - Enables per-customer configuration, makes product scalable

---

### Change 5: Unify Finding Model

**Action:** Extend `IntegrityFinding` to support all finding types

**New Schema:**
```typescript
export interface IntegrityFinding {
  // Core identity
  workspaceId: string;
  id: string;

  // Source (contract or evidence check or risk modifier)
  source: 'contract_comparator' | 'obligation_policy' | 'risk_modifier';
  contractId?: string;  // If from contract comparator
  invariantId?: string;  // If from contract comparator

  // Classification
  driftType: string;  // 'endpoint_missing', 'missing_rollback_note', 'agent_authored', etc.
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

**Migration:**
- Convert `DeltaSyncFinding` → `IntegrityFinding` with `source: 'contract_comparator'`
- Convert evidence check failures → `IntegrityFinding` with `source: 'obligation_policy'`
- Convert agent detection → `IntegrityFinding` with `source: 'risk_modifier'`

**Effort:** 1 day

**Impact:** MEDIUM - Enables unified GitHub Check with all findings

---

## Part 4: Implementation Plan

### Minimal Data Model Changes (To Avoid "Patchy" Architecture)

**Add a second orchestrator "lane": GateRun**

Don't shoehorn Track A into the 18-state machine. Create a **new, small state machine** for Track A.

**New Models:**

```prisma
model GateRun {
  workspaceId String
  id          String

  // PR context
  prId        Int
  sha         String
  repo        String

  // State
  status      String  // GATE_INGESTED, GATE_EVIDENCE_EXTRACTED, GATE_CONTRACT_CHECKED, GATE_DECIDED, CHECKRUN_POSTED, GATE_COMPLETED
  decision    String  // PASS, WARN, BLOCK

  // Evidence
  policyHash      String  // Reproducibility anchor (like PlanRun)
  evidenceHash    String
  surfacesTouched String[]

  // Timestamps
  createdAt   DateTime @default(now())
  completedAt DateTime?

  @@id([workspaceId, id])
  @@index([workspaceId, prId])
}

model GateFinding {
  workspaceId String
  id          String
  gateRunId   String

  // Finding details
  ruleId              String  // Which obligation/comparator produced this
  severity            String  // info, warn, block
  message             String
  evidenceRefs        Json    // Snapshot refs, diff fragments
  recommendedActions  String[]

  createdAt   DateTime @default(now())

  @@id([workspaceId, id])
  @@index([workspaceId, gateRunId])
}
```

**Services:**

- `gate/ingestPrEvent()` - Entry point for PR events
- `gate/extractEvidence(pr)` - Bounded fetch (reuse existing artifact fetchers)
- `gate/evaluateObligations(evidence, policyPack)` - New obligation engine
- `gate/postCheckRun(decision, findings)` - GitHub Check Run publisher
- `gate/spawnRemediation(findings)` - Enqueue DriftCandidate in Track B

**Policies:**

- `contractObligations.ts` (versioned, like your existing policy snapshots)
- Minimal initial packs: `api_integrity`, `schema_readiness`

**UX:**

- GitHub check summary + annotations
- "Spawn fix" link to app + Slack/approval entry point

---

### Phase 1: Foundation - Surface Classification (1 day)
**Goal:** Add surface area classification as the entry point

- [ ] Create `apps/api/src/services/contractGate/surfaceClassifier.ts`
- [ ] Implement `classifySurfaceAreas()` with 6 surface types
- [ ] Implement surface detection functions (isApiSurface, isInfraSurface, etc.)
- [ ] Write tests (20+ test cases covering all surfaces)
- [ ] Update webhook to call surface classifier

**Deliverable:** Surface classification working, tested, integrated

---

### Phase 2: Rename & Reframe (4 hours)
**Goal:** Change product framing from agent-centric to contract-centric

- [ ] Rename feature flag: `ENABLE_AGENT_PR_GATEKEEPER` → `ENABLE_CONTRACT_INTEGRITY_GATE`
- [ ] Rename service: `apps/api/src/services/gatekeeper/` → `apps/api/src/services/contractGate/`
- [ ] Update PRODUCT_GUIDE.md: "Agent PR Gatekeeper" → "Contract Integrity Gate"
- [ ] Update README.md: Same rename
- [ ] Update webhook trigger to use surface classification
- [ ] Update marketing copy

**Deliverable:** Product reframed, surface-based trigger working

---

### Phase 3: ContractPack Configuration (2 days)
**Goal:** Add ContractPack as first-class configurable object

- [ ] Add `ContractPack` Prisma model
- [ ] Add `ContractPolicy` Prisma model
- [ ] Create database migration
- [ ] Implement ContractPack CRUD API
- [ ] Implement ContractPolicy CRUD API
- [ ] Create seed data (PublicAPI, IAMInfra, DatabaseMigration packs)
- [ ] Add ContractPack UI (Settings page)
- [ ] Update contract resolver to use ContractPack config

**Deliverable:** ContractPack configuration working, customers can configure packs

---

### Phase 4: Unify Finding Model (1 day)
**Goal:** Single IntegrityFinding schema for all finding types

- [ ] Extend `IntegrityFinding` schema with `source` field
- [ ] Add `affectedFiles` and `suggestedDocs` fields
- [ ] Migrate `DeltaSyncFinding` → `IntegrityFinding` with `source: 'contract_comparator'`
- [ ] Migrate evidence checks → `IntegrityFinding` with `source: 'obligation_policy'`
- [ ] Migrate agent detection → `IntegrityFinding` with `source: 'risk_modifier'`
- [ ] Update database migration
- [ ] Update all finding creation code

**Deliverable:** Unified finding model, all findings in one schema

---

### Phase 5: Unified Pipeline (2 days)
**Goal:** Merge two systems into 6-step pipeline

- [ ] Create `runContractIntegrityGate()` with 6-step pipeline
- [ ] Step 1: Surface classification (already done in Phase 1)
- [ ] Step 2: Contract resolution (use ContractPack config from Phase 3)
- [ ] Step 3: Deterministic integrity comparison (reuse existing comparators)
- [ ] Step 4: Obligation policy enforcement (convert evidence checks)
- [ ] Step 5: Risk scoring (merge gatekeeper risk logic)
- [ ] Step 6: GitHub Check creation (unified check with all findings)
- [ ] Remove old `runGatekeeper()` and `runContractValidation()`
- [ ] Update webhook to call unified pipeline
- [ ] Test end-to-end flow
- [ ] Deploy to production

**Deliverable:** Unified Track A system, single GitHub Check, production-ready

---

### Total Effort Estimate

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1: Surface Classification | 1 day | None |
| Phase 2: Rename & Reframe | 4 hours | Phase 1 |
| Phase 3: ContractPack Config | 2 days | Phase 1 |
| Phase 4: Unify Finding Model | 1 day | None (parallel with Phase 3) |
| Phase 5: Unified Pipeline | 2 days | Phases 1-4 |
| **Total** | **~6 days** | Sequential + some parallel work |

**Critical Path:** Phase 1 → Phase 2 → Phase 3 → Phase 5

**Can be done in parallel:** Phase 4 (Finding Model) can start anytime

---

## Part 5: Success Metrics

### Before (Current State)

**Architecture:**
- ❌ Two separate Track A systems (Agent PR Gatekeeper + Contract Validation)
- ❌ No surface classification
- ❌ No unified pipeline
- ❌ No ContractPack configuration
- ❌ Two different finding models (DeltaSyncFinding vs IntegrityFinding)
- ❌ Author-based trigger (all PRs except trusted bots)

**User Experience:**
- ❌ Two separate GitHub Checks (confusing)
- ❌ Product framed as "Agent PR Gatekeeper" (agent-centric)
- ❌ Limited PMF to AI-heavy teams
- ❌ Hard-coded thresholds, no per-customer config

**Coverage:**
- ❌ Misses non-agent PRs that touch contracts
- ❌ No systematic surface area detection
- ❌ Comparator findings and evidence findings are separate

---

### After (Target State)

**Architecture:**
- ✅ One unified Track A system (Contract Integrity Gate)
- ✅ Surface classification as entry point (6 surface types)
- ✅ 6-step pipeline: Surface → Contract → Compare → Enforce → Score → Check
- ✅ ContractPack configuration (common primitives + customer config)
- ✅ Unified IntegrityFinding model with source field
- ✅ Surface-based trigger (PRs touching contract surfaces)

**User Experience:**
- ✅ Single GitHub Check with all findings
- ✅ Product framed as "Contract Integrity Gate" (contract-centric)
- ✅ Broad PMF to any team with contracts (OpenAPI, IaC, etc.)
- ✅ Per-workspace policy configuration with degraded mode rules

**Coverage:**
- ✅ Catches ALL PRs touching contract surfaces (not just agent-authored)
- ✅ Systematic surface area detection (API, Infra, Data Model, Observability, Security, Docs)
- ✅ Unified findings (comparator + obligation + risk modifier)

---

### Key Metrics to Track

| Metric | Before | After (Target) |
|--------|--------|----------------|
| **PRs Checked** | All PRs (except trusted bots) | PRs touching contract surfaces (~30-40% of PRs) |
| **False Positive Rate** | Unknown (no metrics) | < 5% (block on high-confidence only) |
| **Customer Perception** | "AI agent tool" | "Contract governance platform" |
| **Configuration Time** | N/A (hard-coded) | < 30 min to configure first ContractPack |
| **GitHub Checks per PR** | 2 (confusing) | 1 (unified) |
| **Finding Types** | 2 schemas (can't aggregate) | 1 schema (unified) |
| **Surface Coverage** | Ad-hoc (no classification) | 6 surfaces (systematic) |

---

## Conclusion

**Key Insight:** We have the right components, but they're organized around "agent detection" rather than "contract validation." This is a **framing problem** AND an **architecture problem**.

**The Core Gap:** Missing surface classification + unified pipeline + ContractPack configuration.

**Recommended Action:**

1. **Start with Phase 1 (Surface Classification)** - This is the foundation that enables everything else. Without it, you can't map surfaces → contracts → comparators.

2. **Then Phase 2 (Rename & Reframe)** - Change product framing from agent-centric to contract-centric.

3. **Then Phase 3 (ContractPack Config)** - Add configuration layer so customers can define their contracts.

4. **Then Phase 4-5 (Unify)** - Merge systems into unified pipeline.

**Total Effort:** ~6 days to complete all phases

**Risk:** MEDIUM - Significant refactoring, but components already exist

**Impact:** HIGH - Transforms product from "AI agent tool" to "contract governance platform" with broad PMF

**Critical Success Factor:** Surface classification must be deterministic, fast (< 1s), and accurate (> 95% precision). This is the foundation of the entire architecture.

---

## Appendix: Track A v1 Recommended Scope (4-6 weeks)

Based on the architect's guidance, the best Track A v1 is:

### Core Features
- ✅ Surface classification (API/Infra/Docs/Data Model/Observability/Security)
- ✅ ContractPack configuration (per-workspace)
- ✅ Deterministic checks:
  - OpenAPI valid + version bump required
  - Required files present (README/runbook/changelog/rollback)
  - CODEOWNER approvals based on paths
  - "Doc target changed?" (WARN if not)
- ✅ GitHub Check Run integration
- ✅ One "DocsReferenceComparator" that works for Confluence/Markdown

### Then Track B Generates Patches
- Track A detects drift → WARN
- Track B generates patch proposal → Slack approval → Apply
- Track A re-runs → PASS

This is the clean separation that makes both tracks valuable.

