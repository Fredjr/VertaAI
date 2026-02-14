# VertaAI Product Guide

**Version:** 3.0
**Last Updated:** February 14, 2026
**Audience:** New developers, customers, and technical stakeholders

**Major Update:** This version reflects the strategic pivot to **Contract Integrity & Readiness**, introducing a dual-track architecture with fast contract validation (Track 1) and thorough drift remediation (Track 2).

---

## Table of Contents

1. [What is VertaAI?](#what-is-vertaai)
2. [The Problem We Solve](#the-problem-we-solve)
3. [How VertaAI Works](#how-vertaai-works)
4. [Why Not Build It Yourself?](#why-not-build-it-yourself)
5. [Technical Architecture](#technical-architecture)
6. [State Machine & Processing Flow](#state-machine--processing-flow)
7. [Input Sources & Output Targets](#input-sources--output-targets)
8. [User Onboarding & Setup](#user-onboarding--setup)
9. [Integration Compatibility Matrix](#integration-compatibility-matrix)
10. [Key Technical Concepts](#key-technical-concepts)
11. [Example Workflows](#example-workflows)
12. [FAQ](#faq)

---

## What is VertaAI?

**VertaAI** is an **AI-powered governance platform** that ensures consistency across your entire operational stack — from code to APIs to documentation to infrastructure to observability.

### One-Liner
> "We prevent inconsistencies across code ↔ API ↔ docs ↔ runbooks ↔ dashboards ↔ diagrams by validating contracts in real-time and proposing surgical fixes when drift occurs."

### Core Value Proposition
VertaAI operates on two levels:

1. **Contract Integrity & Readiness** (Prevention): Fast, deterministic validation that catches inconsistencies before they reach production. When you open a PR, VertaAI validates that your OpenAPI spec matches your documentation, your Terraform matches your runbooks, and your dashboards match your alerts — all in < 30 seconds.

2. **Drift Detection & Remediation** (Correction): When changes slip through or accumulate over time, VertaAI detects the drift between what your documentation says and what actually happens, then proposes precise, evidence-grounded fixes for human approval.

---

## The Problem We Solve

### The Contract Integrity Problem

Every engineering team faces this cycle:

```
Code Changes → API Drifts → Docs Become Stale → Runbooks Lie → Dashboards Mislead → Incidents Happen → (Maybe) Fixed
```

**Specific pain points:**

1. **API ↔ Docs Drift**: OpenAPI spec says endpoint requires `userId`, docs say it's optional
2. **Infrastructure ↔ Runbook Drift**: Terraform deploys to 3 regions, runbook only covers 2
3. **Dashboard ↔ Alert Drift**: Grafana dashboard shows metric `api_latency_p99`, but alerts use `api_response_time_p99`
4. **Code ↔ Ownership Drift**: CODEOWNERS says `@platform-team`, but team was renamed to `@infra-team`
5. **Deployment ↔ Docs Drift**: Switched from kubectl to Helm, runbook still shows kubectl commands
6. **Missing Coverage**: New failure modes, rollback procedures, or edge cases aren't documented

### Why Traditional Solutions Fail

| Approach | Why It Fails |
|----------|--------------|
| **Manual updates** | Humans forget, especially during incidents |
| **Linters** | Can't detect semantic drift (wrong commands that are syntactically valid) |
| **Search tools** | Help you find docs, don't keep them correct |
| **Wikis with "last updated"** | Timestamp doesn't mean content is accurate |
| **"Living documentation"** | Requires discipline that doesn't scale |
| **Contract testing** | Only validates code ↔ API, ignores docs/runbooks/dashboards |
| **Schema validation** | Catches syntax errors, not semantic inconsistencies |

---

## How VertaAI Works

### The VertaAI Dual-Track Approach

VertaAI operates on two parallel tracks:

#### **Track 1: Contract Validation (Fast, Deterministic, PR-Blocking)**

```
┌─────────────────────────────────────────────────────────────────┐
│  1. PR OPENED/UPDATED (GitHub Webhook)                           │
│  ├─ Extract changed files (OpenAPI, Terraform, CODEOWNERS, etc.) │
│  ├─ Resolve applicable contracts (file patterns, service tags)   │
│  └─ Trigger contract validation (< 30s total)                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. FETCH ARTIFACT SNAPSHOTS (Parallel)                          │
│  ├─ Primary artifacts (OpenAPI spec, Terraform configs)          │
│  ├─ Secondary artifacts (Confluence docs, Notion pages)          │
│  └─ Reference artifacts (Grafana dashboards, alert configs)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. RUN COMPARATORS (Deterministic, < 5s each)                   │
│  ├─ OpenAPI ↔ Docs: Endpoint/schema/example parity              │
│  ├─ Terraform ↔ Runbook: Infrastructure consistency             │
│  ├─ Dashboard ↔ Alert: Metric name consistency                  │
│  └─ CODEOWNERS ↔ Docs: Ownership accuracy                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. GENERATE INTEGRITY FINDINGS (Structured)                     │
│  ├─ Severity: critical/high/medium/low                           │
│  ├─ Drift type: endpoint_missing, schema_mismatch, etc.          │
│  ├─ Evidence: Specific mismatches with pointers                  │
│  └─ Recommended action: block_merge/create_patch/notify         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. CREATE GITHUB CHECK (Real-time)                              │
│  ├─ Conclusion: success (PASS) / neutral (WARN) / failure (BLOCK)│
│  ├─ Summary: Risk tier, findings count, impact band              │
│  ├─ Annotations: File-level findings (max 50)                    │
│  └─ Details: Evidence, recommendations, links                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. (OPTIONAL) CREATE DRIFT CANDIDATE                            │
│  └─ If findings are severe → Trigger remediation track          │
└─────────────────────────────────────────────────────────────────┘
```

#### **Track 2: Drift Remediation (Thorough, LLM-Assisted, Human-Approved)**

```
┌─────────────────────────────────────────────────────────────────┐
│  1. DETECT DRIFT (Deterministic)                                 │
│  ├─ GitHub PR merged (changed deployment scripts)                │
│  ├─ PagerDuty incident resolved (new failure scenario)           │
│  ├─ Contract validation findings (from Track 1)                  │
│  └─ Slack questions clustered (knowledge gap detected)           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. ANALYZE & CLASSIFY (Deterministic Comparison + Typed Deltas) │
│  ├─ Extract artifacts from source (commands, URLs, steps)        │
│  ├─ Extract artifacts from docs (current state)                  │
│  ├─ Bounded context expansion: fetch up to 3 key changed files   │
│  ├─ Compare artifacts with typed deltas (key:value, not just     │
│  │   key presence; tool replacement; version mismatch)           │
│  ├─ Detect coverage gaps (orthogonal dimension)                  │
│  └─ Confidence score (0-100%) based on artifact overlap          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. THRESHOLD ROUTING + MATERIALITY GATE                         │
│  ├─ Check confidence against ignore threshold                    │
│  ├─ If below threshold → Skip patch generation (save LLM calls)  │
│  ├─ Materiality gate: skip low-value patches deterministically   │
│  │   (e.g., single low-confidence delta, missing managed region) │
│  ├─ Check temporal drift accumulation (bundle small drifts)      │
│  └─ If above threshold + material → Continue to patch generation │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. GENERATE PATCH (Evidence-Grounded, NOT Full Rewrite)         │
│  ├─ LLM receives typed deltas from EvidenceBundle (not raw diff) │
│  ├─ Structured evidence contract: deltas, impact band, drift     │
│  │   type, consequence text, fired rules                         │
│  ├─ Truncation priority: critical/high deltas included first     │
│  ├─ Generate unified diff (like a PR)                            │
│  └─ Add summary and sources                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. ROUTE TO RIGHT OWNER & CLUSTER (OPT-IN)                      │
│  ├─ Check CODEOWNERS file                                        │
│  ├─ Check doc ownership mappings                                 │
│  ├─ Check PagerDuty on-call                                      │
│  ├─ If clustering enabled → Group similar drifts                 │
│  └─ Fallback to team default                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. SEND TO SLACK FOR APPROVAL                                   │
│  ├─ Individual: Show diff preview (12 lines)                     │
│  ├─ Cluster: Show aggregated summary + bulk actions              │
│  ├─ Include confidence score and coverage gap indicator          │
│  ├─ Link to source (PR, incident, etc.)                          │
│  └─ Buttons: [Approve] [Edit] [Reject] [Snooze]                 │
│  └─ Cluster: [Approve All] [Review Individually] [Reject All]   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  7. HUMAN DECISION                                               │
│  ├─ Approve → Update doc immediately (Confluence/Notion)         │
│  ├─ Edit → Modify diff → Re-approve                              │
│  ├─ Reject → Learn from feedback (audit trail)                   │
│  └─ Snooze → Remind in 24 hours (re-queue)                       │
└─────────────────────────────────────────────────────────────────┘
```

### Key Differentiators

#### **Contract Validation (Track 1)**
1. **Fast, deterministic validation**: < 30s total for PR checks (no LLM calls)
2. **Contract-first design**: Explicit contract definitions with artifact roles (primary/secondary/reference)
3. **Pluggable comparators**: Easy to add new comparator types (OpenAPI, Terraform, Grafana, etc.)
4. **Structured findings**: Machine-readable IntegrityFindings with severity, evidence, and recommendations
5. **Real-time GitHub Checks**: Inline annotations on changed files with actionable feedback
6. **Snapshot versioning**: Immutable artifact snapshots with TTL cleanup
7. **Multi-artifact comparison**: Compare across 3+ artifact types in a single contract
8. **Confidence scoring**: Resolution confidence (0.0-1.0) based on matching strategy

#### **Drift Remediation (Track 2)**
9. **Deterministic detection with typed deltas**: 100% reproducible artifact comparison producing machine-readable typed deltas (no LLM randomness)
10. **Evidence-grounded patching**: LLM agents receive structured typed deltas from the EvidenceBundle — not raw diffs — ensuring every patch element traces to deterministic evidence
11. **Materiality gate**: Deterministic pre-patch filter prevents low-value patches (tag-only changes, low-confidence single deltas) from reaching the LLM
12. **Bounded context expansion**: Fetches up to 3 key changed files (config, Dockerfile, API specs) to distinguish critical changes from trivial edits
13. **Temporal drift accumulation**: Tracks cumulative drift per document over time, bundling multiple small drifts into comprehensive updates
14. **Cluster-first triage**: Groups similar drifts for bulk actions (80-90% notification reduction)
15. **Orthogonal coverage**: Detects both incorrect AND missing documentation
16. **Early threshold routing**: Filters low-confidence drifts before patch generation (30-40% LLM call reduction)
17. **Diff-based, not rewrites**: We propose surgical changes, not full document regeneration
18. **Human-in-the-loop**: No autonomous publishing — you always approve
19. **Multi-source correlation**: Combines GitHub + PagerDuty + Slack + Contract findings
20. **Ownership-aware**: Routes to the right person based on CODEOWNERS, mappings, on-call
21. **Complete audit trail**: Full observability with PlanRun tracking, EvidenceBundle pattern, and materiality skip reasons

#### **Cross-Cutting**
22. **Agent PR gatekeeper**: Detects agent-authored PRs and gates risky changes with evidence-based checks
23. **Delta sync findings**: Reuses existing parsers (IaC, OpenAPI, CODEOWNERS) to detect drift in real-time
24. **Workspace-scoped multi-tenancy**: Complete data isolation with composite primary keys

---

## Why Not Build It Yourself?

### Option 1: Deterministic Rules

**What you'd build:**
```python
if "kubectl" in pr_diff and "helm" in pr_diff:
    update_doc("deployment.md", old="kubectl", new="helm")
```

**Why it fails:**
- ❌ Can't handle semantic changes ("deploy to staging first" → "deploy to prod directly")
- ❌ Brittle - breaks when doc structure changes
- ❌ Can't understand context (is this kubectl→helm migration or just adding helm?)
- ❌ Requires maintaining hundreds of rules
- ❌ No confidence scoring
- ❌ Can't handle ambiguity

### Option 2: Pure LLM Solution

**What you'd build:**
```python
prompt = f"Update this doc based on this PR: {pr_diff}"
new_doc = llm.generate(prompt)
```

**Why it fails:**
- ❌ Hallucinations - LLM invents commands/URLs that don't exist
- ❌ Scope creep - rewrites entire sections unnecessarily
- ❌ No version control - can't track what changed
- ❌ No evidence trail - can't explain why it made changes
- ❌ Expensive - processes entire doc every time
- ❌ No approval workflow

### VertaAI's Hybrid Approach

```
Deterministic Rules + LLM + Human Approval = Reliable Automation
```

| Component | Role | Why It Matters |
|-----------|------|----------------|
| **Deterministic baseline checks** | Find exact matches (old tool names, URLs) | Fast, accurate, explainable |
| **LLM classification** | Understand semantic drift | Handles nuance and context |
| **Diff generation** | Surgical changes only | Reviewable, version-controlled |
| **Validation layer** | Block unsafe changes | Prevents secrets, scope violations |
| **Human approval** | Final decision | Trust and accountability |

**Example:**
```
Signal: PR changes "kubectl apply" to "helm install"
├─ Baseline check: Finds "kubectl" in deployment runbook ✓
├─ LLM classification: "instruction drift" (tool migration) ✓
├─ LLM diff generation: Proposes specific line changes ✓
├─ Validator: Checks diff applies cleanly, no secrets ✓
├─ Owner routing: Sends to @platform-team (from CODEOWNERS) ✓
└─ Human: Reviews diff in Slack, clicks "Approve" ✓
```

---

## Technical Architecture

### System Overview

VertaAI is built as a **multi-tenant, event-driven system** with **two parallel processing tracks**: fast contract validation and thorough drift remediation.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VERTAAI ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                    INPUT LAYER (Webhooks)                           │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │     │
│  │  │   GitHub     │  │  PagerDuty   │  │    Slack     │              │     │
│  │  │   Webhook    │  │   Webhook    │  │   Events     │              │     │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │     │
│  └─────────┼──────────────────┼──────────────────┼──────────────────────┘     │
│            │                  │                  │                           │
│            └──────────────────┼──────────────────┘                           │
│                               ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │              SIGNAL NORMALIZATION & STORAGE                          │     │
│  │  • SignalEvent table (workspace-scoped)                              │     │
│  │  • Extract: repo, service, author, diff, metadata                    │     │
│  │  • Dual routing: Contract validation + Drift detection               │     │
│  └────────────────────────────┬────────────────────────────────────────┘     │
│                               │                                              │
│            ┌──────────────────┼──────────────────┐                           │
│            ▼                  ▼                  ▼                           │
│  ┌──────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐     │
│  │ CONTRACT         │  │ AGENT PR        │  │ STATE MACHINE           │     │
│  │ VALIDATION       │  │ GATEKEEPER      │  │ ORCHESTRATOR            │     │
│  │ • Resolver       │  │ • Agent Detect  │  │ • QStash job queue      │     │
│  │ • Fetcher        │  │ • Risk Scoring  │  │ • Bounded loop (5 max)  │     │
│  │ • Comparators    │  │ • Delta Sync    │  │ • Distributed locking   │     │
│  │ • Findings       │  │ • GitHub Checks │  │ • Retry w/ backoff      │     │
│  │ • GitHub Check   │  └─────────────────┘  └─────────┬───────────────┘     │
│  └────────┬─────────┘                                 │                     │
│           │                                           │                     │
│           ▼                                           ▼                     │
│  ┌──────────────────┐         ┌─────────┬─────────────────────────┐         │
│  │ GitHub Check API │         ▼         ▼                         ▼         │
│  │ • PASS/WARN/BLOCK│  ┌─────────────┐      ┌─────────────┐  ┌──────────┐  │
│  │ • Annotations    │  │ LLM AGENTS  │      │ DOC SERVICE │  │ SLACK APP│  │
│  │ • Findings       │  │             │      │             │  │          │  │
│  └──────────────────┘  │ • Triage    │      │ • Adapters  │  │ • Compose│  │
│                        │ • Planner   │      │ • Fetch     │  │ • Buttons│  │
│                        │ • Generator │      │ • Writeback │  │ • Routing│  │
│                        │ (Stateless) │      │ • Versioning│  │          │  │
│                        └─────────────┘      └─────────────┘  └──────────┘  │
│                               │                                              │
│                               ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │                    DATABASE (PostgreSQL)                             │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │     │
│  │  │  Workspace   │  │ SignalEvent  │  │DriftCandidate│               │     │
│  │  │ (tenant)     │  │ (normalized) │  │ (state)      │               │     │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │     │
│  │  │ContractPack  │  │ArtifactSnap  │  │IntegrityFind │               │     │
│  │  │ (contracts)  │  │ (versioned)  │  │ (findings)   │               │     │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │     │
│  │  │PatchProposal │  │ Integration  │  │DocMappingsV2 │               │     │
│  │  │ (diff)       │  │ (OAuth)      │  │ (routing)    │               │     │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Deployment | Purpose |
|-------|------------|------------|---------|
| **Frontend** | Next.js 14 (React) | Vercel | Admin UI, onboarding |
| **Backend API** | Node.js + Express | Railway | Webhooks, state machine |
| **Database** | PostgreSQL 15 | Railway | Workspace data, state |
| **Job Queue** | QStash (Upstash) | Cloud | Async state transitions |
| **LLM** | Claude Sonnet 4 | Anthropic API | Classification, generation |
| **Auth** | Slack OAuth | - | Primary auth method |

### Key Architectural Patterns

#### 1. Multi-Tenant Workspace Model

Every entity is scoped to a `workspaceId`:

```typescript
// Composite primary key pattern
model DriftCandidate {
  workspaceId String
  id          String
  @@id([workspaceId, id])
}

model ContractPack {
  workspaceId String
  id          String
  @@id([workspaceId, id])
}
```

**Why:** Ensures complete data isolation between customers.

#### 2. Contract-First Design

Contracts are first-class objects that define what should be consistent:

```typescript
model ContractPack {
  workspaceId     String
  id              String
  name            String
  description     String
  invariants      Invariant[]  // What to check
  scope           Json         // Where to apply (repos, services, file patterns)
  isActive        Boolean
  @@id([workspaceId, id])
}

model Invariant {
  invariantId       String
  comparatorType    String      // 'openapi_docs_endpoint_parity', 'terraform_runbook_consistency'
  artifactRoles     Json        // { primary: 'openapi', secondary: 'confluence_page' }
  expectedOutcome   String      // 'all_endpoints_documented', 'infrastructure_matches_runbook'
}
```

**Why:** Explicit, versioned contracts that can be audited and evolved.

#### 3. Deterministic State Machine (Drift Remediation)

18 states with explicit transition handlers:

```typescript
const TRANSITION_HANDLERS: Record<DriftState, TransitionHandler> = {
  [DriftState.INGESTED]: handleIngested,
  [DriftState.ELIGIBILITY_CHECKED]: handleEligibilityChecked,
  // ... 16 more states
};
```

**Why:** Predictable, debuggable, resumable processing.

#### 4. Adapter Pattern for Artifacts & Documentation

Unified interface for different systems:

```typescript
interface ArtifactAdapter {
  fetch(ref: ArtifactRef): Promise<FetchResult>;
  getArtifactUrl(ref: ArtifactRef): string;
}

interface DocAdapter {
  fetch(doc: DocRef): Promise<FetchResult>;
  writePatch(params: WritePatchParams): Promise<WriteResult>;
  supportsDirectWriteback(): boolean;
  getDocUrl(docId: string): string;
}
```

**Why:** Easy to add new systems (Grafana, Datadog, etc.) without changing core logic.

#### 5. Comparator Pattern (Template Method)

Pluggable, stateless comparators:

```typescript
abstract class BaseComparator implements IComparator {
  async compare(input: ComparatorInput): Promise<ComparatorResult> {
    this.validateInput(input);
    if (!this.canCompare(input.invariant, [input.leftSnapshot, input.rightSnapshot])) {
      return this.createSkippedResult(input.invariant.invariantId, 'not_applicable');
    }
    const leftData = this.extractData(input.leftSnapshot);
    const rightData = this.extractData(input.rightSnapshot);
    const findings = await this.performComparison(leftData, rightData, input);
    return { invariantId: input.invariant.invariantId, evaluated: true, findings };
  }

  abstract canCompare(invariant: Invariant, snapshots: ArtifactSnapshot[]): boolean;
  abstract extractData(snapshot: ArtifactSnapshot): any;
  abstract performComparison(left: any, right: any, input: ComparatorInput): Promise<IntegrityFinding[]>;
}
```

**Why:** Consistent workflow, easy to test, pluggable implementations.

#### 6. Bounded Loop Pattern

```typescript
const MAX_TRANSITIONS_PER_INVOCATION = 5;
```

**Why:** Prevents infinite loops, keeps job execution time predictable.

#### 7. Evidence-Based Patch Generation

```typescript
interface EvidencePack {
  toolMigrations: ToolMigration[];  // kubectl → helm
  scenarioKeywords: string[];       // "rollback", "incident"
  ownershipChanges: OwnerChange[];  // team moves
}
```

**Why:** Every change is traceable to a real signal.

---

## State Machine & Processing Flow

### The 18-State Pipeline

VertaAI uses a **deterministic state machine** to process every drift candidate. Each state has a single responsibility and explicit transition logic.

```
INGESTED
  ↓
ELIGIBILITY_CHECKED ────→ (filtered out if noise)
  ↓
SIGNALS_CORRELATED ─────→ (join signals + check temporal drift accumulation)
  ↓
DOCS_RESOLVED ──────────→ (deterministic doc targeting, no LLM)
  ↓
DOCS_FETCHED ───────────→ (fetch doc content + bounded context expansion: up to 3 key files)
  ↓
DOC_CONTEXT_EXTRACTED ──→ (extract relevant sections)
  ↓
EVIDENCE_EXTRACTED ─────→ (deterministic comparison with typed deltas: key:value, tool
                           replacement, version mismatch, coverage gap)
  ↓
BASELINE_CHECKED ───────→ (build EvidenceBundle + early threshold routing + materiality gate)
  ↓                        ├─ Below threshold → COMPLETED
  ↓                        └─ Not material → COMPLETED (skip reason persisted for temporal tracking)
PATCH_PLANNED ──────────→ (LLM receives typed deltas from EvidenceBundle, not raw diff)
  ↓
PATCH_GENERATED ────────→ (LLM: generate unified diff, evidence-grounded)
  ↓
PATCH_VALIDATED ────────→ (code validation: secrets, size, scope)
  ↓
OWNER_RESOLVED ─────────→ (clustering: group similar drifts if enabled)
  ↓
SLACK_SENT ─────────────→ (send individual or cluster notification)
  ↓
AWAITING_HUMAN ─────────→ (wait for button click)
  ↓
  ├─ APPROVED ──────────→ WRITEBACK_VALIDATED → WRITTEN_BACK → COMPLETED
  ├─ EDIT_REQUESTED ────→ (back to PATCH_GENERATED)
  ├─ REJECTED ──────────→ COMPLETED (with audit trail)
  └─ SNOOZED ───────────→ AWAITING_HUMAN (re-queue after delay)
```

### State Descriptions

| State | What Happens | Exit Conditions |
|-------|--------------|-----------------|
| **INGESTED** | Signal received from webhook | Always → ELIGIBILITY_CHECKED |
| **ELIGIBILITY_CHECKED** | Apply noise filters (file paths, labels, size) | Pass → SIGNALS_CORRELATED<br>Fail → COMPLETED |
| **SIGNALS_CORRELATED** | Join multiple signals for same drift (dedup). Check temporal drift accumulation: has this doc accumulated N small drifts that should be bundled into a comprehensive update? | Always → DOCS_RESOLVED |
| **DOCS_RESOLVED** | Deterministic doc targeting (no LLM) | Found → DOCS_FETCHED<br>Not found → FAILED_NEEDS_MAPPING |
| **DOCS_FETCHED** | Fetch current doc content via adapter. **Bounded context expansion**: also fetch up to 3 key changed files (`*.yaml`, `*.conf`, `Dockerfile`, `*.tf`, `openapi.*`, `CODEOWNERS`) with a 30K char budget for richer artifact extraction | Success → DOC_CONTEXT_EXTRACTED<br>Error → FAILED |
| **DOC_CONTEXT_EXTRACTED** | Extract relevant sections (deployment, rollback, etc.) | Always → EVIDENCE_EXTRACTED |
| **EVIDENCE_EXTRACTED** | Deterministic comparison with **typed deltas**: extract artifacts from source + doc (with file context when available), compare using key:value matching, tool replacement detection, version mismatch detection. Output: `TypedDelta[]` with `{artifactType, action, sourceValue, docValue, confidence}` | Always → BASELINE_CHECKED |
| **BASELINE_CHECKED** | Build EvidenceBundle with typed deltas. Early threshold routing filters low-confidence drifts. **Materiality gate**: deterministic rules skip low-value patches (e.g., `impactBand=low` + single delta, managed region missing + non-additive change). Skip reasons persisted for temporal tracking | Above threshold + material → PATCH_PLANNED<br>Below threshold → COMPLETED<br>Not material → COMPLETED (skip reason stored) |
| **PATCH_PLANNED** | LLM receives structured typed deltas from EvidenceBundle (not raw diff). Evidence contract includes: deltas, impact band, drift type, consequence text, fired rules. Truncation priority: critical/high deltas first | Success → PATCH_GENERATED<br>Uncertain → COMPLETED |
| **PATCH_GENERATED** | LLM generates unified diff | Success → PATCH_VALIDATED<br>Error → FAILED |
| **PATCH_VALIDATED** | Validate diff (no secrets, size < 120 lines, applies cleanly) | Valid → OWNER_RESOLVED<br>Invalid → FAILED |
| **OWNER_RESOLVED** | Determine owner + clustering (if enabled, group similar drifts) | Always → SLACK_SENT |
| **SLACK_SENT** | Send individual or cluster Slack notification | Always → AWAITING_HUMAN |
| **AWAITING_HUMAN** | Wait for user action (approve/reject/snooze/edit) | (see human actions below) |
| **APPROVED** | User clicked "Approve" | Always → WRITEBACK_VALIDATED |
| **REJECTED** | User clicked "Reject" | Creates audit event → COMPLETED |
| **SNOOZED** | User clicked "Snooze" | Check expiry → OWNER_RESOLVED (if expired)<br>Still snoozed → SNOOZED |
| **WRITEBACK_VALIDATED** | Check doc version hasn't changed | Valid → WRITTEN_BACK<br>Conflict → FAILED |
| **WRITTEN_BACK** | Apply diff to doc via adapter | Success → COMPLETED<br>Error → FAILED |
| **COMPLETED** | Terminal state (success or rejected) | - |
| **FAILED** | Terminal state (error) | - |

### Bounded Loop Execution

To prevent infinite loops and keep job execution predictable:

```typescript
const MAX_TRANSITIONS_PER_INVOCATION = 5;

// Example execution:
Job 1: INGESTED → ELIGIBILITY_CHECKED → SIGNALS_CORRELATED → DRIFT_CLASSIFIED → DOCS_RESOLVED
       (5 transitions, stop and enqueue next job)

Job 2: DOCS_RESOLVED → DOCS_FETCHED → DOC_CONTEXT_EXTRACTED → EVIDENCE_EXTRACTED → BASELINE_CHECKED
       (5 transitions, stop and enqueue next job)

Job 3: BASELINE_CHECKED → PATCH_PLANNED → PATCH_GENERATED → PATCH_VALIDATED → OWNER_RESOLVED
       (5 transitions, stop and enqueue next job)

Job 4: OWNER_RESOLVED → SLACK_SENT → AWAITING_HUMAN
       (3 transitions, stop - human gate reached)
```

### Error Handling & Retries

```typescript
// Retryable errors (exponential backoff)
- TIMEOUT
- RATE_LIMITED
- SERVICE_UNAVAILABLE

// Non-retryable errors (immediate failure)
- NEEDS_DOC_MAPPING
- PATCH_VALIDATION_FAILED
- SECRETS_DETECTED
- DOC_NOT_FOUND

// Max retries: 3 attempts
// After 3 failures → state = FAILED, error code stored
```

### Distributed Locking

```typescript
// Prevent concurrent processing of same drift
const LOCK_TTL_SECONDS = 30;

// Lock key: `drift:${workspaceId}:${driftId}`
// Acquired before state transition, released after
```

---

## Input Sources & Output Targets

### Input Sources (Signals)

VertaAI listens to multiple signal sources to detect documentation drift:

| Source | Status | What It Detects | Webhook Endpoint |
|--------|--------|-----------------|------------------|
| **GitHub PRs** | ✅ Live | Code/config changes that invalidate docs + Agent PR gatekeeper | `POST /webhooks/github/:workspaceId` |
| **PagerDuty Incidents** | ✅ Live | New failure scenarios, ownership changes | `POST /webhooks/pagerduty/:workspaceId` |
| **Slack Questions** | 🚧 Planned | Clustered questions revealing knowledge gaps | `POST /webhooks/slack/:workspaceId` |
| **Datadog/Grafana Alerts** | 🚧 Planned | Environment/tooling drift | TBD |

#### GitHub PR Signal

**Trigger conditions:**
- PR is **merged** (not just opened)
- Touches operational paths: `**/deploy/**`, `**/infra/**`, `**/terraform/**`, `**/helm/**`, `**/k8s/**`, `**/.github/workflows/**`, `**/config/**`
- OR contains keywords: `breaking`, `migrate`, `deprecate`, `rollback`, `deploy`, `helm`, `k8s`, `terraform`, `config`, `endpoint`, `auth`

**Dual Processing:**
1. **Drift Detection Pipeline**: Analyzes merged PRs for documentation drift
2. **Agent PR Gatekeeper**: Runs on all PRs (opened/synchronized) to detect agent-authored PRs and gate risky changes

**Extracted data:**
```typescript
{
  repo: "acme/api-service",
  service: "api-service",
  author: "alice",
  prNumber: 1234,
  title: "Migrate deployment from kubectl to helm",
  changedFiles: ["deploy/k8s/deployment.yaml", "docs/runbook.md"],
  diffExcerpt: "- kubectl apply -f deployment.yaml\n+ helm install api-service ./chart",
  mergedAt: "2026-02-07T10:30:00Z"
}
```

#### PagerDuty Incident Signal

**Trigger conditions:**
- Incident is **resolved** (not triggered/acknowledged)
- Incident has notes or resolution details

**Extracted data:**
```typescript
{
  incidentId: "Q1234567",
  service: "api-service",
  title: "API Gateway 503 errors",
  urgency: "high",
  resolvedBy: "bob",
  resolvedAt: "2026-02-07T11:00:00Z",
  notes: "Root cause: Redis connection pool exhausted. Fixed by increasing pool size.",
  impactedUsers: 1500
}
```

### Output Targets (Documentation Systems & GitHub Checks)

VertaAI supports multiple documentation platforms with two update strategies, plus GitHub Checks for PR gating:

| Doc System | Direct Writeback? | Update Method | Adapter |
|------------|-------------------|---------------|---------|
| **Confluence** | ✅ Yes | API call (immediate) | `confluenceAdapter.ts` |
| **Notion** | ✅ Yes | API call (immediate) | `notionAdapter.ts` |
| **GitHub README** | ❌ No | Create PR (manual merge) | `readmeAdapter.ts` |
| **Backstage catalog-info.yaml** | ❌ No | Create PR (manual merge) | `backstageAdapter.ts` |
| **GitBook** | ❌ No | Create PR (manual merge) | `gitbookAdapter.ts` |
| **Swagger/OpenAPI** | ❌ No | Create PR (manual merge) | `swaggerAdapter.ts` |
| **GitHub Checks** | ✅ Yes | GitHub Check API (real-time) | `githubCheck.ts` |

#### Direct Writeback (Confluence, Notion)

When user clicks **Approve** in Slack:
1. Fetch current page version
2. Check version hasn't changed since baseline (optimistic locking)
3. Apply unified diff to page content
4. Update page via API with new version number
5. Add comment: "Updated by VertaAI from [signal source]"

**Example Confluence API call:**
```typescript
PUT /wiki/api/v2/pages/{pageId}
{
  "id": "164013",
  "status": "current",
  "title": "Deployment Runbook",
  "body": {
    "representation": "storage",
    "value": "<updated HTML content>"
  },
  "version": {
    "number": 3,  // Incremented from current version
    "message": "Updated by VertaAI from PR #1234"
  }
}
```

#### PR Workflow (GitHub-based docs)

When user clicks **Approve** in Slack:
1. Create new branch: `vertaai/drift-fix-{driftId}`
2. Apply unified diff to file
3. Commit with message: `[VertaAI] {summary}`
4. Create PR with:
   - Title: `[VertaAI] {summary}`
   - Body: Links to source signal, confidence score, evidence
   - Base branch: `main` (configurable)
5. Post PR URL back to Slack
6. User manually reviews and merges PR

**Why PR workflow for GitHub docs?**
- Code-adjacent documentation should go through code review
- Allows CI checks to run (linting, tests)
- Maintains git history and blame
- Safer for critical docs like API specs

#### GitHub Check Workflow (Agent PR Gatekeeper)

When a PR is opened or updated:
1. **Agent Detection**: Analyze PR author, commit messages, size, and code patterns
2. **Risk Assessment**: Calculate risk tier based on:
   - Agent confidence (30% weight)
   - High-risk domains touched (25% per domain, capped at 50%)
   - Missing evidence requirements (15% per item, capped at 45%)
   - Impact score from deterministic rules (20% weight)
   - Correlated incidents/alerts (10% per incident, capped at 30%)
3. **Delta Sync Analysis**: Analyze IaC, API, and ownership changes using existing parsers
4. **Create GitHub Check** with:
   - **Conclusion**: `success` (PASS), `neutral` (INFO/WARN), `failure` (BLOCK)
   - **Summary**: Risk tier, impact band, correlated signals count
   - **Annotations**: File-level findings from delta sync (max 50)
   - **Details**: Evidence requirements, domain analysis, delta sync findings
5. **Risk Tiers**:
   - **PASS** (<30%): ✅ Green check, no action needed
   - **INFO** (30-60%): ℹ️ Neutral, informational warnings
   - **WARN** (60-80%): ⚠️ Neutral, requires attention
   - **BLOCK** (≥80%): ❌ Red X, blocks merge (if configured)

**Example GitHub Check:**
```
VertaAI Agent PR Gatekeeper
Status: ⚠️ WARN (Risk: 72%)

Summary:
- Agent Confidence: 85% (likely agent-authored)
- High-Risk Domains: deployment, database
- Missing Evidence: rollback note, migration note
- Impact Band: 🟠 high
- Correlated Signals: 2 incidents in past 7 days

Delta Sync Findings (3):
- [CRITICAL] IaC drift: Database infrastructure change detected
- [HIGH] API drift: Breaking API change in openapi.yaml
- [MEDIUM] Ownership drift: 2 CODEOWNERS rules changed

Suggested Actions:
- Add rollback procedure to PR description
- Add database migration note
- Review correlated incidents: INC-123, INC-456
```

### Signal Normalization

All signals are normalized to a common `SignalEvent` schema:

```typescript
model SignalEvent {
  workspaceId String
  id          String
  sourceType  String  // 'github_pr', 'pagerduty_incident', 'slack_cluster'
  repo        String?
  service     String?
  extracted   Json    // Source-specific data
  rawPayload  Json    // Original webhook payload
  createdAt   DateTime
  @@id([workspaceId, id])
}
```

This allows the state machine to process all signals uniformly.

---

## User Onboarding & Setup

### Onboarding Flow

```
1. Sign up with Slack
   ↓
2. Connect GitHub (OAuth App)
   ↓
3. Connect Confluence or Notion (OAuth)
   ↓
4. Configure doc mappings (repo → doc)
   ↓
5. (Optional) Connect PagerDuty
   ↓
6. Test with sample PR
   ↓
7. Go live!
```

### Step-by-Step Setup Guide

#### 1. Sign Up with Slack

**URL:** `https://app.vertaai.com/auth/slack`

**What happens:**
- Slack OAuth flow
- Creates workspace in VertaAI
- Installs VertaAI Slack app to your workspace
- Grants permissions:
  - `chat:write` - Send messages
  - `channels:read` - List channels
  - `users:read` - Resolve user mentions
  - `im:write` - Send DMs

**Result:** You're logged into VertaAI dashboard

---

#### 2. Connect GitHub

**Dashboard:** Settings → Integrations → GitHub → "Connect"

**What happens:**
- GitHub OAuth flow
- Installs VertaAI GitHub App to selected repos
- Grants permissions:
  - `contents:read` - Read code and CODEOWNERS
  - `pull_requests:read` - Read PR metadata
  - `webhooks:write` - Register webhook

**Webhook registered:**
```
URL: https://api.vertaai.com/webhooks/github/{workspaceId}
Events: pull_request (merged)
Secret: Auto-generated, stored in Integration table
```

**Result:** GitHub PRs will now trigger drift detection

---

#### 3. Connect Documentation Platform

**Option A: Confluence**

Dashboard → Integrations → Confluence → "Connect"

- Confluence OAuth flow (Atlassian)
- Grants permissions:
  - `read:confluence-content.all`
  - `write:confluence-content`
  - `read:confluence-space.summary`
- Stores OAuth tokens in Integration table

**Option B: Notion**

Dashboard → Integrations → Notion → "Connect"

- Notion OAuth flow
- Grants permissions:
  - `Read content`
  - `Update content`
  - `Read comments`
- Stores OAuth tokens in Integration table

**Result:** VertaAI can fetch and update docs

---

#### 4. Configure Doc Mappings

**Dashboard:** Settings → Doc Mappings → "Add Mapping"

**Mapping structure:**
```typescript
{
  repo: "acme/api-service",        // GitHub repo
  sourceType: "github_pr",         // Signal source
  docId: "164013",                 // Confluence page ID or Notion page ID
  docSystem: "confluence",         // confluence | notion | readme | backstage
  category: "runbook",             // runbook | onboarding | decision | api_spec
  priority: "primary"              // primary | secondary
}
```

**Example mappings:**

| Repo | Source | Doc System | Doc ID | Category | Priority |
|------|--------|------------|--------|----------|----------|
| `acme/api-service` | `github_pr` | `confluence` | `164013` | `runbook` | `primary` |
| `acme/api-service` | `pagerduty_incident` | `confluence` | `164013` | `runbook` | `primary` |
| `acme/frontend` | `github_pr` | `notion` | `abc123` | `onboarding` | `primary` |
| `acme/platform` | `github_pr` | `readme` | `README.md` | `readme` | `primary` |

**How to find doc IDs:**

- **Confluence:** Page ID is in URL: `https://your-domain.atlassian.net/wiki/spaces/SD/pages/164013/Page+Title` → `164013`
- **Notion:** Page ID is in URL: `https://notion.so/Page-Title-abc123def456` → `abc123def456`
- **GitHub README:** Use file path: `README.md` or `docs/deployment.md`

**Result:** VertaAI knows which docs to update for each repo

---

#### 5. (Optional) Connect PagerDuty

**Dashboard:** Settings → Integrations → PagerDuty → "Connect"

**What happens:**
- PagerDuty OAuth flow
- Grants permissions:
  - `Read incidents`
  - `Read services`
  - `Read on-call schedules`
- Registers webhook:
  ```
  URL: https://api.vertaai.com/webhooks/pagerduty/{workspaceId}
  Events: incident.resolved
  ```

**Result:** Resolved incidents will trigger drift detection

---

#### 6. Test with Sample PR

**Dashboard:** Settings → Test → "Trigger Test Drift"

**What happens:**
1. Creates a test `SignalEvent` with sample PR data
2. Creates `DriftCandidate` with state=INGESTED
3. Runs state machine
4. Sends test Slack message to configured channel

**Expected result:**
- Slack message appears in your channel
- Contains sample diff
- Buttons work (Approve, Edit, Reject, Snooze)
- Clicking "Approve" updates the test doc

**If it fails:**
- Check Railway logs for errors
- Verify doc mapping exists
- Verify Slack channel is correct
- Verify OAuth tokens are valid

---

#### 7. Go Live!

**Checklist:**
- ✅ GitHub connected and webhook active
- ✅ Confluence or Notion connected
- ✅ At least one doc mapping configured
- ✅ Test drift completed successfully
- ✅ Slack notifications working

**What to expect:**
- When a PR is merged, you'll see a Slack message within 30-60 seconds
- Message will show proposed diff
- Click "Approve" to update the doc
- Check Confluence/Notion to verify update

---

### Configuration Options

#### Workspace Settings

**Dashboard:** Settings → Workspace

| Setting | Default | Description |
|---------|---------|-------------|
| **Default Slack Channel** | `#engineering` | Where to send drift notifications |
| **Confidence Threshold** | `0.7` | Minimum confidence to send notification (0-1) |
| **Max Diff Lines** | `120` | Maximum diff size before requiring manual review |
| **Auto-Approve Low-Risk** | `false` | Auto-approve diffs with confidence > 0.95 (not recommended) |
| **Rate Limit** | `10/hour` | Max notifications per hour |

#### Eligibility Rules

**Dashboard:** Settings → Eligibility Rules

Control which PRs trigger drift detection:

```yaml
github_pr:
  min_changes: 10              # Ignore tiny PRs
  max_changes: 5000            # Ignore massive refactors
  required_paths:              # At least one file must match
    - "**/deploy/**"
    - "**/infra/**"
    - "**/terraform/**"
    - "**/helm/**"
    - "**/k8s/**"
    - "**/.github/workflows/**"
    - "**/config/**"
  excluded_labels:             # Skip PRs with these labels
    - "skip-vertaai"
    - "docs-only"
  excluded_authors:            # Skip PRs from bots
    - "dependabot[bot]"
    - "renovate[bot]"
```

---

## Integration Compatibility Matrix

### Input Source × Output Target Compatibility

| Input Source | Confluence | Notion | README | Backstage | GitBook | Swagger |
|--------------|------------|--------|--------|-----------|---------|---------|
| **GitHub PR** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **PagerDuty Incident** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Slack Questions** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

**Why some combinations don't work:**
- **PagerDuty → GitHub docs:** Incidents rarely relate to code-adjacent docs (README, Backstage, etc.)
- **Slack → GitHub docs:** Knowledge gaps are better documented in wikis, not code repos

### Drift Type × Doc Category Routing

| Drift Type | Runbook | Onboarding | Decision Doc | API Spec | Ownership |
|------------|---------|------------|--------------|----------|-----------|
| **Instruction** | ✅ Primary | ✅ | ❌ | ✅ | ❌ |
| **Process** | ✅ | ✅ Primary | ✅ Primary | ❌ | ❌ |
| **Ownership** | ✅ | ✅ | ❌ | ❌ | ✅ Primary |
| **Coverage** | ✅ Primary | ✅ | ✅ | ✅ | ❌ |
| **Environment/Tooling** | ✅ Primary | ✅ | ✅ | ❌ | ❌ |

**Example:**
- PR changes `kubectl` → `helm` (Instruction drift) → Updates **Runbook**
- Incident reveals new failure mode (Coverage drift) → Updates **Runbook**
- PR changes team ownership (Ownership drift) → Updates **Ownership doc** (CODEOWNERS, team page)

### Update Method by Doc System

| Doc System | Update Method | Approval Required? | Version Control? |
|------------|---------------|-------------------|------------------|
| **Confluence** | Direct API write | ✅ Yes (Slack) | ✅ Page versions |
| **Notion** | Direct API write | ✅ Yes (Slack) | ✅ Page history |
| **README** | GitHub PR | ✅ Yes (Slack + PR review) | ✅ Git history |
| **Backstage** | GitHub PR | ✅ Yes (Slack + PR review) | ✅ Git history |
| **GitBook** | GitHub PR | ✅ Yes (Slack + PR review) | ✅ Git history |
| **Swagger** | GitHub PR | ✅ Yes (Slack + PR review) | ✅ Git history |

---

## Key Technical Concepts

### 1. Contract Packs & Invariants

**Contract Packs** are collections of invariants that define what should be consistent across your operational stack.

**Key Concepts:**

- **ContractPack**: A named collection of invariants with scope rules (which repos/services/files it applies to)
- **Invariant**: A single consistency rule (e.g., "all OpenAPI endpoints must be documented in Confluence")
- **Artifact Roles**: Each invariant defines which artifacts to compare:
  - `primary`: Source of truth (e.g., OpenAPI spec)
  - `secondary`: Derived artifact (e.g., Confluence docs)
  - `reference`: Additional context (e.g., Grafana dashboard)
- **Comparator Type**: Which comparator to use (e.g., `openapi_docs_endpoint_parity`)
- **Expected Outcome**: What success looks like (e.g., `all_endpoints_documented`)

**Example Contract Pack:**

```typescript
{
  name: "API Documentation Consistency",
  description: "Ensures OpenAPI spec matches Confluence API docs",
  scope: {
    repos: ["acme/api-service"],
    services: ["api-service"],
    filePatterns: ["**/openapi.yaml", "**/swagger.json"]
  },
  invariants: [
    {
      invariantId: "endpoint-parity",
      comparatorType: "openapi_docs_endpoint_parity",
      artifactRoles: {
        primary: { type: "openapi", locator: "openapi.yaml" },
        secondary: { type: "confluence_page", locator: "164013" }
      },
      expectedOutcome: "all_endpoints_documented"
    },
    {
      invariantId: "schema-parity",
      comparatorType: "openapi_docs_schema_parity",
      artifactRoles: {
        primary: { type: "openapi", locator: "openapi.yaml" },
        secondary: { type: "confluence_page", locator: "164013" }
      },
      expectedOutcome: "all_schemas_documented"
    }
  ]
}
```

### 2. Contract Resolution Strategies

When a PR is opened, VertaAI resolves which contracts apply using 5 strategies (in priority order):

| Strategy | Confidence | How It Works | Example |
|----------|-----------|--------------|---------|
| **explicit_path** | 1.0 | Exact file path match | `scope.filePaths = ["openapi.yaml"]` |
| **file_pattern** | 0.7-1.0 | Glob pattern match | `scope.filePatterns = ["**/openapi.yaml"]` |
| **directory_pattern** | 0.7 | Directory match | `scope.directoryPatterns = ["deploy/**"]` |
| **codeowners** | 0.75 | CODEOWNERS team match | `scope.codeownersTeams = ["@platform-team"]` |
| **service_tag** | 0.6 | Service name match | `scope.services = ["api-service"]` |

**Why confidence matters:** Higher confidence = more likely to block merge on failure.

### 3. Artifact Snapshots & Versioning

Every artifact is fetched and stored as an immutable snapshot:

```typescript
model ArtifactSnapshot {
  workspaceId     String
  id              String
  artifactType    String      // 'openapi', 'confluence_page', 'terraform_config'
  artifactLocator String      // URL, file path, or ID
  content         Json        // Parsed artifact content
  rawContent      String?     // Original raw content
  version         String?     // Artifact version (if available)
  fetchedAt       DateTime
  expiresAt       DateTime    // TTL for cleanup
  @@id([workspaceId, id])
}
```

**Benefits:**
- ✅ **Reproducibility**: Can replay comparisons with exact same data
- ✅ **Performance**: No need to re-fetch artifacts for multiple comparisons
- ✅ **Auditability**: Full history of what was compared
- ✅ **TTL Cleanup**: Automatic cleanup after 24 hours (configurable)

### 4. Comparators & IntegrityFindings

**Comparators** are deterministic, stateless functions that compare artifact snapshots and produce structured findings.

**Key Properties:**
- ✅ **Deterministic**: Same input always produces same output (no LLM calls)
- ✅ **Fast**: Complete in < 5 seconds
- ✅ **Stateless**: No side effects, easy to test
- ✅ **Pluggable**: Easy to add new comparators

**Comparator Types (Implemented):**
1. **OpenAPI ↔ Docs** (`openapi_docs_endpoint_parity`):
   - Detects missing endpoints (in OpenAPI but not in docs)
   - Detects deprecated endpoints (in docs but not in OpenAPI)
   - Detects missing parameters (required/optional)
   - Detects missing schemas
   - Detects missing examples

**Comparator Types (Planned):**
2. **Terraform ↔ Runbook** (`terraform_runbook_consistency`):
   - Detects infrastructure drift (regions, resources, configs)
   - Detects missing deployment steps
   - Detects outdated rollback procedures

3. **Dashboard ↔ Alert** (`dashboard_alert_metric_parity`):
   - Detects metric name mismatches
   - Detects missing alerts for dashboard panels
   - Detects threshold inconsistencies

4. **CODEOWNERS ↔ Docs** (`codeowners_docs_ownership_parity`):
   - Detects ownership drift (team renames, moves)
   - Detects missing ownership documentation

**IntegrityFinding Structure:**

```typescript
model IntegrityFinding {
  workspaceId       String
  id                String
  contractId        String
  invariantId       String
  signalEventId     String
  driftType         String      // 'endpoint_missing', 'schema_mismatch', etc.
  severity          String      // 'critical', 'high', 'medium', 'low'
  evidence          Json        // Structured evidence with pointers
  comparedArtifacts Json        // Which snapshots were compared
  recommendedAction String      // 'block_merge', 'create_patch_candidate', 'notify', 'no_action'
  confidence        Float       // 0.0-1.0
  impact            Float       // 0.0-1.0
  band              String      // 'pass', 'warn', 'fail'
  routedTo          Json        // Who should be notified
  createdAt         DateTime
  @@id([workspaceId, id])
}
```

**Evidence Structure:**

```typescript
{
  kind: "endpoint_missing",
  leftValue: { method: "POST", path: "/api/users", summary: "Create user" },
  rightValue: null,
  leftSnippet: "POST /api/users - Create a new user account",
  rightSnippet: null,
  pointers: {
    left: "paths./api/users.post",
    right: null
  }
}
```

### 5. Drift Types & Orthogonal Coverage

VertaAI classifies drift into 4 primary types, with **coverage as an orthogonal dimension**:

| Type | Description | Example | Detection Method |
|------|-------------|---------|------------------|
| **Instruction** | Commands, configs, URLs are wrong | `kubectl` → `helm` | Deterministic artifact comparison |
| **Process** | Workflow/sequence changed | "Deploy to staging first" → "Deploy to prod directly" | Deterministic artifact comparison |
| **Ownership** | Team structure, contacts, on-call changed | Team moved from `#backend` to `#platform` | CODEOWNERS diff + PagerDuty API |
| **Environment/Tooling** | Infrastructure, deployment tools changed | Jenkins → GitHub Actions | Deterministic artifact comparison |

**Orthogonal Coverage Dimension**:

Coverage gaps are detected **independently** and can apply to ANY drift type:

- **Instruction + Coverage**: Doc has wrong command AND doesn't cover the new scenario
- **Process + Coverage**: Doc has outdated steps AND doesn't cover the new workflow
- **Ownership + Coverage**: Doc has wrong owner AND doesn't cover the new team structure
- **Environment + Coverage**: Doc has wrong tool AND doesn't cover the new platform

**How Coverage Detection Works**:
1. Extract artifacts from source signal (new commands, steps, scenarios)
2. Extract artifacts from documentation (current coverage)
3. Compare: Does doc mention the new scenario?
4. If not → Set `hasCoverageGap = true` (orthogonal to drift type)

**Example**:
- **Source**: PR adds new rollback procedure using Helm
- **Doc**: Deployment runbook only covers forward deployment with kubectl
- **Detection**: `driftType = "instruction"` + `hasCoverageGap = true`
- **Slack**: "📋 Instruction Drift + 📊 Coverage Gap Detected"

### 6. Evidence-Based Detection (EvidenceBundle Pattern + Typed Deltas)

**Purpose:** Deterministic, reproducible drift detection without LLM randomness. Produces machine-readable typed deltas that flow directly to LLM agents.

**How it works:**
1. **Extract artifacts from source signal** (with bounded context expansion):
   - Commands: `kubectl apply`, `helm install`, `docker run`
   - URLs: API endpoints, service URLs, documentation links
   - Config values: Environment variables, settings, parameters (key:value pairs)
   - Process steps: Deployment steps, runbook procedures, workflows
   - Ownership: Teams, channels, on-call rotations, CODEOWNERS
   - Environment: Tools, platforms, versions, dependencies
   - When available, full file content (up to 3 key files, 30K chars) enriches artifact extraction beyond diff-only context

2. **Extract artifacts from documentation**:
   - Parse current doc content for same artifact types
   - Build structured representation of doc state

3. **Deterministic comparison with typed deltas**:
   - Compare source artifacts vs doc artifacts using typed delta comparison
   - **Key:value comparison** for config keys (detects value changes, not just presence)
   - **Tool replacement detection**: A removed + B added in same artifact category
   - **Version mismatch detection**: Pinned version changes (e.g., `node:18` → `node:20`)
   - Detect coverage gaps (source has X, doc doesn't mention it)
   - Each difference produces a `TypedDelta`: `{artifactType, action, sourceValue, docValue, section, confidence}`
   - Calculate overall confidence score (0.0 to 1.0) based on artifact overlap

4. **Classification**:
   - If confidence ≥ 0.6 → Use comparison result (deterministic)
   - If confidence < 0.6 → Use default type (deterministic_low_confidence)
   - No drift → Mark as COMPLETED

**EvidenceBundle Model:**
```typescript
{
  workspaceId: string;
  id: string;
  driftId: string;
  sourceArtifacts: Json; // Extracted from signal (+ file context when available)
  docArtifacts: Json;    // Extracted from documentation
  comparisonResult: {
    driftType: string;
    hasCoverageGap: boolean;
    confidence: number;
    conflicts: Array<{type, source, doc}>;
    gaps: Array<{type, content}>;
    typedDeltas: Array<{        // Machine-readable deltas for LLM agents
      artifactType: string;     // 'command' | 'configKey' | 'endpoint' | 'tool' | 'version' | ...
      action: string;           // 'added' | 'removed' | 'changed' | 'missing_in_doc'
      sourceValue: string;
      docValue?: string;
      section?: string;
      confidence: number;
    }>;
  };
  assessment: {
    impactBand: string;         // 'critical' | 'high' | 'medium' | 'low'
    consequenceText: string;    // Deterministic impact narrative
    firedRules: string[];       // Which comparison rules matched
  };
  createdAt: DateTime;
}
```

**Why this matters:**
- **100% Reproducible**: Same input always produces same output
- **Fast**: No LLM calls needed for classification (~10x faster)
- **Transparent**: Typed deltas explain exactly what changed, how, and where
- **Evidence-grounded**: LLM agents receive structured deltas, not raw text — preventing hallucination
- **Accurate**: Detects 5 types of drift across 7 source types with key:value depth
- **Auditable**: Full evidence trail with per-delta provenance for compliance

### 7. Patch Generation (Unified Diff)

**Key constraint:** Generate diffs, not full rewrites

**Unified diff format:**
```diff
--- a/deployment-runbook.md
+++ b/deployment-runbook.md
@@ -15,7 +15,7 @@
 ## Deploy to Production

 1. Merge PR to `main`
-2. Run: `kubectl apply -f k8s/deployment.yaml`
+2. Run: `helm install api-service ./chart`
 3. Verify pods are running: `kubectl get pods`
 4. Check logs: `kubectl logs -f deployment/api-service`
```

**Why diffs?**
- ✅ Reviewable (like a PR)
- ✅ Version controlled (can revert)
- ✅ Scoped (only changes what's needed)
- ✅ Explainable (shows before/after)
- ✅ Testable (can validate diff applies cleanly)

**Diff constraints:**
- Max 120 lines
- Only modify within allowed sections (marked with `<!-- DRIFT_AGENT_MANAGED -->`)
- No secrets (validated with regex)
- Must apply cleanly to current doc version

### 8. Owner Resolution

**Priority chain:**

```
1. CODEOWNERS file (if repo has one)
   ├─ Parse file
   ├─ Match changed file paths
   └─ Extract @team or @user

2. Doc ownership mapping (manual config)
   └─ DocMappingsV2.owner field

3. PagerDuty on-call (if PagerDuty connected)
   ├─ Match service name
   └─ Get current on-call user

4. Workspace default owner (fallback)
   └─ Workspace.defaultSlackChannel
```

**Example:**

```
PR changes: deploy/k8s/deployment.yaml

CODEOWNERS:
  deploy/** @platform-team

Result: Send Slack message to #platform-team
```

### 9. Notification Routing

**Decision tree:**

```
Confidence >= 0.9 → Send to owner's channel
Confidence 0.7-0.9 → Send to owner's channel (with warning)
Confidence 0.5-0.7 → Send to review queue
Confidence < 0.5 → Don't send (log only)
```

**Rate limiting:**
- Max 10 notifications per hour per workspace (configurable)
- Deduplication: Same drift fingerprint within 24 hours → Skip

### 10. Managed Regions

**Purpose:** Limit where VertaAI can make changes

**Syntax:**
```markdown
<!-- DRIFT_AGENT_MANAGED: deployment -->
## Deployment Steps

1. Run: `kubectl apply -f deployment.yaml`
2. Verify: `kubectl get pods`
<!-- END_DRIFT_AGENT_MANAGED -->

## Manual Steps (DO NOT AUTO-UPDATE)

These steps require human judgment...
```

**Behavior:**
- VertaAI can only modify content within `DRIFT_AGENT_MANAGED` blocks
- Attempts to modify outside blocks → Validation fails
- If no managed blocks → Entire doc is fair game (risky!)

**Best practice:** Mark operational sections as managed, leave strategic/judgment sections unmanaged

### 11. Audit Trail & Compliance

**Purpose:** Complete observability and compliance for all drift processing decisions

**Components:**

#### PlanRun Tracking
Every drift is linked to a PlanRun record that captures:
- Which plan version was active (`activePlanId`, `activePlanVersion`, `activePlanHash`)
- What thresholds were used (snapshot at execution time)
- What routing decision was made (`auto_approve`, `slack_notify`, `digest_only`, `ignore`)
- Timestamp of execution

**Why this matters:**
- **Reproducibility**: Can replay exact routing decision from any point in time
- **Auditability**: Full history of which plan was used for each drift
- **Debugging**: Understand why a drift was routed a certain way

#### AuditEvent Model
All significant actions are logged as audit events:
- Drift state transitions
- Human actions (approve, reject, snooze, edit)
- Budget enforcement decisions
- Noise filtering decisions
- Writeback operations
- Errors and failures

**AuditEvent Schema:**
```typescript
{
  workspaceId: string;
  id: string;
  entityType: 'drift' | 'plan' | 'workspace';
  entityId: string;
  eventType: string; // 'approved', 'rejected', 'snoozed', 'budget_exceeded', etc.
  payload: Json;     // Event-specific data
  actorType: 'human' | 'system' | 'llm';
  actorId: string;   // User ID or 'drift-agent'
  createdAt: DateTime;
}
```

**Benefits:**
- ✅ **Compliance**: Full audit trail for SOC2, ISO27001, GDPR
- ✅ **Debugging**: Trace every decision and action
- ✅ **Analytics**: Understand system behavior and user patterns
- ✅ **Accountability**: Know who did what and when

### 12. Early Threshold Routing + Materiality Gate

**Purpose:** Two-layer pre-patch filter at BASELINE_CHECKED that prevents both low-confidence AND low-value drifts from reaching the LLM.

**Layer 1 — Confidence Threshold Routing:**
1. At BASELINE_CHECKED state (before PATCH_PLANNED)
2. Resolve active DriftPlan and thresholds
3. Check drift confidence against ignore threshold
4. If confidence < ignore threshold → Skip to COMPLETED

**Layer 2 — Materiality Gate (runs after threshold check passes):**
1. Examine typed deltas from the EvidenceBundle
2. Apply deterministic materiality rules:
   - **Skip** if `impactBand = low` AND only 1 typed delta AND `delta.confidence < 0.5`
   - **Skip** if managed region missing in target doc AND change is non-additive (removal/change, not addition)
   - **Skip** if all deltas are tag-only changes with no semantic content change
3. If not material → Skip to COMPLETED with `materialitySkipReason` persisted
4. Skip reasons feed into temporal drift accumulation (Phase 5)

**Implementation:**
```typescript
// At BASELINE_CHECKED state
const confidence = drift.confidence || 0.5;
const threshold = resolveThresholds({...});

// Layer 1: Confidence threshold
if (confidence < threshold.ignore) {
  return { state: DriftState.COMPLETED, enqueueNext: false };
}

// Layer 2: Materiality gate
const materialityResult = evaluateMateriality(evidenceBundle.typedDeltas, evidenceBundle.assessment);
if (!materialityResult.isMaterial) {
  await persistMaterialitySkip(drift.id, materialityResult.skipReason);
  await recordTemporalDriftEvent(drift.docId, materialityResult); // Feed to Phase 5
  return { state: DriftState.COMPLETED, enqueueNext: false };
}
```

**Benefits:**
- ✅ **Cost Savings**: 30-40% reduction from threshold routing + additional ~30% from materiality gate
- ✅ **Noise Elimination**: Low-value patches (tag-only, single low-confidence delta) never reach LLM
- ✅ **Faster Processing**: Non-material drifts complete immediately
- ✅ **Temporal Tracking**: Skip reasons feed into drift accumulation for future bundled updates

**Example:**
- Drift confidence: 0.15, Ignore threshold: 0.20 → **Skipped by threshold** (saves 2-3 LLM calls)
- Drift confidence: 0.65, but single delta with `impactBand=low` and `confidence=0.4` → **Skipped by materiality gate** (skip reason persisted for temporal bundling)

### 9. Cluster-First Drift Triage

**Purpose:** Reduce notification fatigue by grouping similar drifts

**How it works:**
1. At OWNER_RESOLVED state (after patch generation)
2. Check if clustering is enabled (`DriftPlan.budgets.enableClustering`)
3. Extract cluster key: `{service}_{driftType}_{fingerprintPattern}`
4. Find or create cluster within 1-hour time window
5. Add drift to cluster
6. Check notification criteria:
   - 2+ drifts in cluster → Send cluster notification
   - 1 hour expiry → Send cluster notification
   - Max cluster size (20) reached → Send cluster notification
7. Send aggregated Slack message with bulk actions

**Cluster Slack Message:**
```
🔄 5 Similar Drifts Detected

Service: api-service
Type: Instruction Drift
Pattern: kubectl → helm
Avg Confidence: 87%
Sources: 3 PRs, 2 incidents

Drifts:
1. PR #1234 - Migrate deployment (92%) [Review]
2. PR #1235 - Remove kubectl files (85%) [Review]
3. Incident P-123 - Deployment failure (83%) [Review]
... (2 more)

[✅ Approve All] [👀 Review Individually] [❌ Reject All] [💤 Snooze All]
```

**Benefits:**
- ✅ **80-90% Notification Reduction**: 50 drifts → 5-10 clusters
- ✅ **Bulk Actions**: 1 click approves 5-10 drifts
- ✅ **Better UX**: Less notification fatigue, higher engagement
- ✅ **OPT-IN**: Enable per DriftPlan for gradual rollout

**Status:** ✅ Fully implemented and verified functional (P0-2 audit)

### 10. Agent PR Gatekeeper

**Purpose:** Detect agent-authored PRs (Claude, ChatGPT, Copilot, etc.) and gate risky changes with evidence-based checks to reduce review overload and prevent unsafe merges.

**Target Users:** Platform/Eng Productivity/Staff Engineers who own merge hygiene

**How it works:**

#### 1. Agent Detection (Deterministic Heuristics)

Detects agent-authored PRs using multiple signals:

- **Author patterns**: Matches `copilot`, `claude`, `gpt`, `chatgpt`, `ai-`, `bot`, `assistant`, `codewhisperer`, `tabnine`, `cursor`, `aider`, `augment`
- **Commit message markers**: Detects `Co-authored-by: GitHub Copilot`, `Generated by Claude`, `AI-generated`, etc.
- **PR size threshold**: Flags PRs with >1000 lines changed
- **Tool signatures**: Detects `// Generated by`, `@generated`, `# Auto-generated` in code
- **Confidence scoring**: Additive weights, capped at 1.0, threshold at 0.50

#### 2. Risk Tier Calculation (Multi-Factor Scoring)

Calculates risk score (0-100%) based on:

| Factor | Weight | Description |
|--------|--------|-------------|
| **Agent Confidence** | 30% | How confident we are this is agent-authored |
| **High-Risk Domains** | 25% per domain (max 50%) | IaC, auth, deployment, database, API contracts |
| **Missing Evidence** | 15% per item (max 45%) | Tests, rollback notes, migration notes, runbook links |
| **Impact Score** | 20% | Deterministic impact assessment from rules matrix |
| **Correlated Incidents** | 10% per incident (max 30%) | Recent incidents/alerts for same service (7-day window) |

**Risk Tiers:**
- **PASS** (<30%): ✅ Green check, safe to merge
- **INFO** (30-60%): ℹ️ Informational, review recommended
- **WARN** (60-80%): ⚠️ Warning, requires attention
- **BLOCK** (≥80%): ❌ Blocks merge, high risk

#### 3. Evidence Requirements (Domain-Specific Checklist)

Deterministic checklist based on domains touched:

| Domain | Required Evidence |
|--------|-------------------|
| **Deployment/IaC** | Rollback procedure, deployment runbook link |
| **Database/Schema** | Migration note, rollback plan |
| **Auth/Security** | Security review note, threat model update |
| **API Contract** | Breaking change note, migration guide |
| **All PRs** | Tests changed OR explicit "no tests needed" note |

#### 4. Delta Sync Findings (Reuses Existing Parsers)

Analyzes PR changes using existing drift detection parsers:

**IaC Analysis** (`iacParser.ts`):
- Detects Terraform/Pulumi/CloudFormation changes
- Classifies: deployment infrastructure, database infrastructure, security infrastructure
- Severity: high (deployment), critical (database/security)
- Suggests: deployment runbook, migration guide, security policies

**API Analysis** (`openApiParser.ts`):
- Detects OpenAPI/Swagger spec changes
- Classifies: breaking vs non-breaking changes
- Severity: critical (breaking), medium (non-breaking)
- Suggests: API documentation, migration guide, changelog

**Ownership Analysis** (`codeownersParser.ts`):
- Detects CODEOWNERS file changes
- Classifies: ownership rule changes
- Severity: medium/high (based on count)
- Suggests: team structure docs, on-call rotation docs

#### 5. Impact Assessment Integration

Reuses existing `impactAssessment.ts` service:

1. Builds `SourceEvidence` from PR data (files changed, lines added/removed, PR title/body)
2. Builds `TargetEvidence` (defaults to runbook surface for high-risk domains)
3. Calls `computeImpactAssessment()` using deterministic rules matrix
4. Returns: `impactScore` (0-1), `impactBand` (low/medium/high/critical)

#### 6. Signal Correlation Integration

Reuses existing `signalJoiner.ts` service:

1. Creates signal ID: `github_pr_{owner}_{repo}_{prNumber}`
2. Infers service name from file paths (e.g., `services/api/...` → `api`)
3. Calls `joinSignals()` to find correlated incidents/alerts within 7-day window
4. Boosts risk score when correlated signals are found

#### 7. GitHub Check Output

Creates GitHub Check run with:

**Summary:**
- Risk tier with emoji (✅ PASS, ℹ️ INFO, ⚠️ WARN, ❌ BLOCK)
- Risk score percentage
- Agent confidence
- Impact band (🟢 low, 🟡 medium, 🟠 high, 🔴 critical)
- Correlated signals count
- Delta sync findings count

**Annotations** (max 50):
- File-level findings from delta sync analysis
- Severity mapping: critical→failure, high→warning, medium/low→notice
- Includes suggested docs to update

**Details:**
- Evidence requirements checklist
- High-risk domains detected
- Delta sync findings with descriptions
- Suggested actions

**Example:**
```
VertaAI Agent PR Gatekeeper
Status: ⚠️ WARN (Risk: 72%)

Agent Confidence: 85%
Impact Band: 🟠 high
Correlated Signals: 2 incidents
Delta Sync Findings: 3 (1 critical, 2 high)

Missing Evidence:
- ❌ Rollback procedure
- ❌ Database migration note

High-Risk Domains:
- deployment
- database

Delta Sync Findings:
1. [CRITICAL] IaC drift: Database infrastructure change in terraform/rds.tf
   Suggested docs: migration guide, rollback plan
2. [HIGH] API drift: Breaking change in openapi.yaml (removed endpoint)
   Suggested docs: API documentation, migration guide
3. [HIGH] Ownership drift: 2 CODEOWNERS rules changed
   Suggested docs: team structure docs
```

**Benefits:**
- ✅ **Reduces Review Overload**: Automated risk assessment for agent PRs
- ✅ **Prevents Unsafe Merges**: Blocks high-risk changes without evidence
- ✅ **Evidence-Based**: Deterministic checks, no LLM randomness
- ✅ **Reuses Existing Infrastructure**: 85% code reuse from drift detection
- ✅ **Real-Time Feedback**: GitHub Check appears within seconds of PR creation
- ✅ **Actionable**: Clear checklist of what's needed to pass

**Status:** ✅ Fully implemented (Phase 1-4 complete)

### 11. Typed Deltas & Evidence-Grounded Patching

**Purpose:** Replace raw diff text with structured, machine-readable typed deltas that flow from deterministic comparison all the way to LLM agents.

**What are Typed Deltas?**

A `TypedDelta` is a machine-readable object that describes a single, atomic difference between a source signal and a target document:

```typescript
interface TypedDelta {
  artifactType: 'command' | 'configKey' | 'endpoint' | 'tool' | 'step' | 'owner' | 'version' | 'dependency' | 'scenario';
  action: 'added' | 'removed' | 'changed' | 'missing_in_doc';
  sourceValue: string;       // What the source signal says
  docValue?: string;         // What the doc currently says (if applicable)
  section?: string;          // Which doc section is affected
  confidence: number;        // Per-delta confidence (0.0-1.0)
}
```

**How Typed Deltas flow to LLM agents:**

Instead of passing raw `diffExcerpt` + `prTitle` + `prDescription` to the patch planner and generator, the system now passes a **structured evidence contract**:

```typescript
interface EvidenceContract {
  typedDeltas: TypedDelta[];        // Machine-readable deltas
  consequenceText: string;          // Deterministic impact narrative
  impactBand: 'critical' | 'high' | 'medium' | 'low';
  sourceType: string;               // github_pr, pagerduty_incident, etc.
  driftType: string;                // instruction, process, ownership, etc.
  firedRules: string[];             // Which comparison rules matched
}
```

**Truncation priority order:** When the LLM token budget is tight, deltas are prioritized:
1. `critical` and `high` impact deltas always included
2. `medium` deltas included if budget allows
3. `low` impact deltas dropped first

**Comparison depth improvements:**
- **Config keys**: Compared by key name AND value (detects `DB_HOST=localhost` → `DB_HOST=prod.db.com`)
- **Tool replacement**: Detects when tool A is removed AND tool B is added (e.g., `kubectl` → `helm`)
- **Version mismatch**: Detects pinned version changes (e.g., `node:18` → `node:20`)

### 11. Bounded Context Expansion

**Purpose:** Fetch full file content for key changed files to provide richer artifact extraction beyond diff-only context.

**The problem:**
Without context expansion, artifact extraction operates only on diff text — the lines that changed. This means a config key that appears in the diff but whose full context (surrounding keys, file structure) is in the unchanged portion of the file goes undetected.

**How it works:**
1. At DOCS_FETCHED state, after fetching the target doc
2. Identify key changed files from the source signal (PR file list)
3. Apply file selection heuristic (prioritize operational files):
   - `*.yaml`, `*.yml`, `*.conf`, `*.toml`, `*.ini` (config files)
   - `Dockerfile`, `docker-compose.yml` (container definitions)
   - `*.tf`, `*.tfvars` (Terraform infrastructure)
   - `*.proto`, `openapi.*`, `swagger.*` (API definitions)
   - `CODEOWNERS` (ownership)
4. Fetch up to **3 files**, max **10K chars per file** (30K total budget)
5. Feed full file content into artifact extraction alongside diff text

**Benefits:**
- ✅ **Richer extraction**: Full file context reveals config keys, versions, and tools not visible in diff alone
- ✅ **Bounded by design**: Hard limits on file count (3) and size (30K chars) prevent unbounded expansion
- ✅ **Operational focus**: File selection heuristic targets the files most likely to contain operational truth

### 12. Temporal Drift Accumulation

**Purpose:** Track cumulative drift per document over time, bundling multiple small drifts into comprehensive updates.

**The problem:**
Without temporal tracking, each signal is processed independently. A document that accumulates 10 individually non-material drifts over a week (each skipped by the materiality gate) never gets updated — even though the cumulative effect is significant.

**How it works:**
1. Every time the materiality gate **skips** a drift, the skip reason is recorded in a `DriftHistory` record for that document
2. At SIGNALS_CORRELATED, check the drift history for the target document:
   - Count skipped drifts within the configured time window (default: 7 days)
   - If count ≥ bundling threshold (default: 5 skips) → **Promote to bundled update**
3. A bundled update aggregates all the skipped typed deltas into a single comprehensive patch
4. The bundled update bypasses the materiality gate (it's already been determined to be material in aggregate)

**DriftHistory Model:**
```typescript
{
  id: string;
  workspaceId: string;
  docId: string;                // Which document this tracks
  driftCandidateId: string;     // The drift that was skipped
  skipReason: string;           // Why materiality gate skipped it
  typedDeltas: TypedDelta[];    // What deltas were skipped
  timeWindow: string;           // '7d', '14d', '30d'
  createdAt: DateTime;
}
```

**Configurable thresholds:**
- `temporalWindow`: Time window for accumulation (default: 7 days)
- `bundlingThreshold`: Number of skips before bundling (default: 5)
- `maxBundleSize`: Maximum deltas in a single bundled update (default: 30)

**Benefits:**
- ✅ **No stale docs**: Documents can't silently accumulate drift indefinitely
- ✅ **Comprehensive updates**: Bundled patches are more valuable than N individual small patches
- ✅ **Configurable**: Teams control the window and threshold per workspace

---

## Example Workflows

### Example 1: Contract Validation - OpenAPI ↔ Docs Consistency (Track 1)

**Scenario:** Developer opens PR that adds new endpoint to OpenAPI spec but forgets to update Confluence API docs

**Timeline:**

```
2:00 PM - PR #5678 opened
  ├─ Changed files: openapi.yaml (added POST /api/users endpoint)
  ├─ No changes to Confluence docs
  └─ GitHub webhook fires (pull_request.opened)

2:00:02 PM - VertaAI receives webhook
  ├─ Creates SignalEvent (github_pr)
  ├─ Dual routing: Contract validation + Drift detection
  └─ Contract validation runs immediately (no queue)

2:00:05 PM - Contract Resolution
  ├─ Matches file pattern: **/openapi.yaml
  ├─ Resolves contract: "API Documentation Consistency"
  ├─ Confidence: 1.0 (explicit_path match)
  └─ Invariants: [endpoint-parity, schema-parity, example-parity]

2:00:08 PM - Artifact Fetching (parallel)
  ├─ Primary: openapi.yaml from PR branch (GitHub API)
  ├─ Secondary: Confluence page 164013 (Confluence API)
  └─ Both snapshots stored with 24h TTL

2:00:12 PM - Comparator Execution
  ├─ OpenApiComparator.compare()
  ├─ Extracts endpoints from OpenAPI: [GET /api/users, POST /api/users, ...]
  ├─ Extracts endpoints from Confluence: [GET /api/users, DELETE /api/users, ...]
  ├─ Detects missing endpoint: POST /api/users (in OpenAPI, not in docs)
  └─ Creates IntegrityFinding:
      {
        driftType: "endpoint_missing",
        severity: "high",
        evidence: {
          kind: "endpoint_missing",
          leftValue: { method: "POST", path: "/api/users", summary: "Create user" },
          rightValue: null,
          pointers: { left: "paths./api/users.post", right: null }
        },
        recommendedAction: "create_patch_candidate",
        confidence: 0.95,
        impact: 0.8,
        band: "fail"
      }

2:00:15 PM - GitHub Check Created
  ├─ Conclusion: failure (band=fail)
  ├─ Summary: "⚠️ WARN (Risk: 75%) - 1 high-severity finding"
  ├─ Annotation on openapi.yaml:
      Line 45: "Endpoint POST /api/users is not documented in Confluence"
  └─ Details: Link to Confluence page, suggested action

2:00:16 PM - PR Status Updated
  ├─ GitHub shows red X on PR
  ├─ Developer sees inline annotation
  └─ Can click through to see full evidence

2:05 PM - Developer updates Confluence docs
  ├─ Adds POST /api/users endpoint documentation
  └─ Pushes new commit to PR

2:05:30 PM - VertaAI re-validates
  ├─ Fetches new snapshots
  ├─ Comparator runs again
  ├─ No findings (all endpoints documented)
  └─ GitHub Check: ✅ success (PASS)

2:06 PM - PR approved and merged
```

**Key Benefits:**
- ✅ **Fast feedback**: < 20 seconds from PR open to check result
- ✅ **Inline annotations**: Developer sees exactly what's wrong
- ✅ **Prevents drift**: Catches inconsistency before merge
- ✅ **No LLM calls**: Deterministic, reproducible, fast

---

### Example 2: Drift Remediation - GitHub PR → Confluence Runbook Update (Track 2)

**Scenario:** Developer merges PR that changes deployment from kubectl to Helm

**Timeline:**

```
10:00 AM - PR #1234 merged to main
  ├─ Changed files: deploy/helm/values.yaml, deploy/k8s/deployment.yaml (deleted)
  ├─ Diff: "kubectl apply" → "helm install"
  └─ GitHub webhook fires

10:00:05 AM - VertaAI receives webhook
  ├─ Creates SignalEvent (github_pr)
  ├─ Creates DriftCandidate (state=INGESTED)
  └─ Enqueues job

10:00:10 AM - State machine runs (Job 1)
  ├─ INGESTED → ELIGIBILITY_CHECKED (passes: touches deploy/)
  ├─ ELIGIBILITY_CHECKED → SIGNALS_CORRELATED (no duplicates, no temporal bundle pending)
  ├─ SIGNALS_CORRELATED → DOCS_RESOLVED (mapping: repo=acme/api → doc=164013)
  ├─ DOCS_RESOLVED → DOCS_FETCHED (fetches Confluence page 164013)
  └─ Context expansion: fetches deploy/helm/values.yaml (full content, 2.1K chars)

10:00:15 AM - State machine runs (Job 2)
  ├─ DOCS_FETCHED → DOC_CONTEXT_EXTRACTED (extracts "Deployment" section)
  ├─ DOC_CONTEXT_EXTRACTED → EVIDENCE_EXTRACTED
  │   Typed deltas generated:
  │     [1] {artifactType: "tool", action: "changed", sourceValue: "helm", docValue: "kubectl", confidence: 0.95}
  │     [2] {artifactType: "command", action: "removed", sourceValue: "kubectl apply -f k8s/deployment.yaml", confidence: 0.92}
  │     [3] {artifactType: "command", action: "added", sourceValue: "helm install api-service ./chart", confidence: 0.92}
  ├─ EVIDENCE_EXTRACTED → BASELINE_CHECKED
  │   EvidenceBundle built: impactBand=high, 3 typed deltas
  │   Threshold routing: confidence 0.92 > ignore 0.20 → PASS
  │   Materiality gate: impactBand=high, 3 deltas → MATERIAL (no skip)
  ├─ BASELINE_CHECKED → PATCH_PLANNED
  │   LLM receives typed deltas (not raw diff): tool replacement kubectl→helm + 2 command changes
  └─ PATCH_PLANNED → PATCH_GENERATED (LLM: generates evidence-grounded diff)

10:00:25 AM - State machine runs (Job 3)
  ├─ PATCH_GENERATED → PATCH_VALIDATED (passes: no secrets, 8 lines, applies cleanly)
  ├─ PATCH_VALIDATED → OWNER_RESOLVED (CODEOWNERS: @platform-team)
  ├─ OWNER_RESOLVED → SLACK_SENT (sends to #platform-team)
  └─ SLACK_SENT → AWAITING_HUMAN

10:00:30 AM - Slack message appears in #platform-team
```

**Slack message:**

```
🔄 Documentation Drift Detected

Source: PR #1234 - "Migrate deployment from kubectl to helm"
Repo: acme/api-service
Doc: Deployment Runbook (Confluence)
Confidence: 92%

Proposed changes (8 lines):
───────────────────────────────────────
--- a/deployment-runbook.md
+++ b/deployment-runbook.md
@@ -15,7 +15,7 @@
 ## Deploy to Production

 1. Merge PR to `main`
-2. Run: `kubectl apply -f k8s/deployment.yaml`
+2. Run: `helm install api-service ./chart`
 3. Verify pods are running: `kubectl get pods`
───────────────────────────────────────

[Approve] [Edit] [Reject] [Snooze 24h]
```

**10:05 AM - Platform engineer clicks "Approve"**

```
10:05:00 AM - Slack interaction received
  ├─ Updates PatchProposal.status = 'approved'
  ├─ Updates DriftCandidate.state = APPROVED
  └─ Enqueues job

10:05:05 AM - State machine runs (Job 4)
  ├─ APPROVED → WRITEBACK_VALIDATED (checks Confluence page version)
  ├─ WRITEBACK_VALIDATED → WRITTEN_BACK (applies diff via Confluence API)
  └─ WRITTEN_BACK → COMPLETED

10:05:10 AM - Slack message updates
  ✅ Approved and applied by @alice
  View updated doc: https://acme.atlassian.net/wiki/spaces/ENG/pages/164013
```

**Result:** Confluence page updated, deployment runbook now shows correct Helm command

---

### Example 3: PagerDuty Incident → Confluence Runbook Update (Track 2)

**Scenario:** Production incident reveals new failure mode that should be documented

**Timeline:**

```
3:00 PM - Incident P-456 triggered (API Gateway 503 errors)
  ├─ Service: api-service
  ├─ Severity: high
  └─ On-call: @bob

3:45 PM - Incident resolved
  ├─ Root cause: Redis connection pool exhausted
  ├─ Fix: Increased pool size from 10 to 50
  ├─ Resolution notes: "Added connection pool monitoring, updated config"
  └─ PagerDuty webhook fires (incident.resolved)

3:45:05 PM - VertaAI receives webhook
  ├─ Creates SignalEvent (pagerduty_incident)
  ├─ Creates DriftCandidate (state=INGESTED)
  └─ Enqueues job

3:45:10 PM - State machine processes
  ├─ INGESTED → ELIGIBILITY_CHECKED (passes: has resolution notes)
  ├─ ELIGIBILITY_CHECKED → SIGNALS_CORRELATED (no duplicates)
  ├─ SIGNALS_CORRELATED → DOCS_RESOLVED (mapping: service=api-service → doc=164013)
  ├─ DOCS_RESOLVED → DOCS_FETCHED (fetches Confluence runbook)
  ├─ DOCS_FETCHED → DOC_CONTEXT_EXTRACTED (extracts "Troubleshooting" section)
  ├─ DOC_CONTEXT_EXTRACTED → EVIDENCE_EXTRACTED
  │   Coverage gap detected: "Redis connection pool" not mentioned in runbook
  ├─ EVIDENCE_EXTRACTED → BASELINE_CHECKED
  │   driftType: "coverage", hasCoverageGap: true, confidence: 0.78
  ├─ BASELINE_CHECKED → PATCH_PLANNED (LLM: plan new troubleshooting section)
  ├─ PATCH_PLANNED → PATCH_GENERATED (LLM: generates diff with new section)
  ├─ PATCH_GENERATED → PATCH_VALIDATED (passes: no secrets, size OK)
  ├─ PATCH_VALIDATED → OWNER_RESOLVED (routes to @bob, on-call engineer)
  └─ OWNER_RESOLVED → SLACK_SENT

3:45:30 PM - Slack message sent to @bob
  📊 Coverage Gap Detected

  Source: Incident P-456 (API Gateway 503 errors)
  Service: api-service
  Confidence: 78%

  Proposed change: Add new troubleshooting section for Redis connection pool issues

  [Approve] [Edit] [Reject] [Snooze 24h]

3:50 PM - @bob clicks "Approve"
  ├─ AWAITING_HUMAN → APPROVED → WRITEBACK_VALIDATED
  ├─ Fetches current Confluence page version
  ├─ Applies diff (adds new "Redis Connection Pool Issues" section)
  └─ Updates Confluence page with comment: "Updated by VertaAI from Incident P-456"

3:50:05 PM - Confluence page updated
  ✅ New troubleshooting section added
  ✅ Future incidents will have documented resolution steps
```

**Result:** Runbook now includes new failure mode, preventing future confusion

---

### Example 4: Agent PR Gatekeeper → Risk Assessment & GitHub Check (Cross-Cutting)

**Scenario:** Agent-authored PR touches deployment infrastructure without required evidence

**Timeline:**

```
10:00 AM - Developer opens PR #5678 (authored by GitHub Copilot)
  ├─ Title: "Update deployment configuration"
  ├─ Author: developer-name (but commit messages show Copilot markers)
  ├─ Files changed: terraform/eks.tf, deploy/helm/values.yaml
  ├─ Lines changed: 450 additions, 120 deletions
  └─ GitHub webhook fires (pull_request.opened)

10:00:05 AM - VertaAI receives webhook
  ├─ Gatekeeper enabled (feature flag check)
  ├─ Runs agent detection heuristics
  └─ Runs risk assessment

10:00:10 AM - Agent Detection Results
  ├─ Commit messages: Found "Co-authored-by: GitHub Copilot" (weight: 0.40)
  ├─ PR size: 570 lines (weight: 0.20)
  ├─ Tool signatures: Found "# Generated by" in code (weight: 0.15)
  └─ Agent confidence: 75%

10:00:12 AM - Domain Detection
  ├─ IaC files detected: terraform/eks.tf
  ├─ Deployment files detected: deploy/helm/values.yaml
  └─ High-risk domains: deployment, iac

10:00:14 AM - Evidence Check
  ├─ Tests changed: ❌ No test files modified
  ├─ "No tests needed" note: ❌ Not found in PR body
  ├─ Rollback procedure: ❌ Not found in PR body
  ├─ Deployment runbook link: ❌ Not found in PR body
  └─ Missing evidence: 4 items

10:00:16 AM - Delta Sync Analysis
  ├─ IaC Parser: Detects EKS cluster configuration change
  │   └─ Finding: [CRITICAL] Deployment infrastructure change
  ├─ API Parser: No OpenAPI changes detected
  └─ CODEOWNERS Parser: No ownership changes detected

10:00:18 AM - Impact Assessment
  ├─ Source Evidence: 450 lines added, 120 removed, deployment files
  ├─ Target Evidence: Runbook surface (deployment domain)
  ├─ Rules fired: "iac_change_high_impact", "deployment_config_change"
  └─ Impact: score=0.75, band=high

10:00:20 AM - Signal Correlation
  ├─ Signal ID: github_pr_acme_api-service_5678
  ├─ Service inferred: api-service
  ├─ Correlation window: 7 days
  ├─ Found: 2 incidents (INC-789, INC-790) for api-service
  └─ Correlated signals: 2

10:00:22 AM - Risk Tier Calculation
  ├─ Agent confidence: 75% × 0.30 = 22.5%
  ├─ High-risk domains: 2 domains × 0.25 = 50% (capped)
  ├─ Missing evidence: 4 items × 0.15 = 60% → 45% (capped)
  ├─ Impact score: 0.75 × 0.20 = 15%
  ├─ Correlated incidents: 2 × 0.10 = 20%
  └─ Total risk score: 22.5 + 50 + 45 + 15 + 20 = 152.5% → capped at 100%
      Final risk tier: BLOCK (≥80%)

10:00:25 AM - GitHub Check Created
  └─ Status: ❌ failure (BLOCK tier)
```

**GitHub Check Output:**

```
VertaAI Agent PR Gatekeeper
Status: ❌ BLOCK (Risk: 100%)

Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Agent Confidence: 75% (likely agent-authored)
Impact Band: 🔴 critical
Correlated Signals: 2 incidents in past 7 days
Delta Sync Findings: 1 critical

Missing Evidence (4):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ Tests changed OR "no tests needed" note
❌ Rollback procedure
❌ Deployment runbook link
❌ Migration note

High-Risk Domains (2):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ deployment
⚠️ iac

Delta Sync Findings (1):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. [CRITICAL] IaC drift: Deployment infrastructure change detected
   File: terraform/eks.tf
   Suggested docs: deployment runbook, migration guide

Correlated Signals:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• INC-789 - API service outage (2 days ago)
• INC-790 - Deployment failure (5 days ago)

Suggested Actions:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Add tests for infrastructure changes OR add "no tests needed" note to PR description
2. Add rollback procedure to PR description
3. Add link to deployment runbook
4. Review correlated incidents: INC-789, INC-790
5. Consider breaking this PR into smaller, reviewable chunks
```

**Annotations on terraform/eks.tf:**
```
Line 45-60: [FAILURE] IaC drift: Deployment infrastructure change detected
Suggested docs: deployment runbook, migration guide
```

**10:05 AM - Developer updates PR**
  ├─ Adds rollback procedure to PR description
  ├─ Adds deployment runbook link
  ├─ Adds "no tests needed" note (infrastructure-only change)
  ├─ Adds migration note
  └─ GitHub webhook fires (pull_request.synchronize)

**10:05:30 AM - VertaAI re-runs gatekeeper**
  ├─ Evidence check: All items now present ✅
  ├─ Risk score recalculated: 22.5 + 50 + 0 + 15 + 20 = 107.5% → capped at 100%
  │   (Missing evidence now 0%, but still BLOCK due to other factors)
  └─ GitHub Check updated: Still BLOCK (high impact + correlated incidents)

**10:10 AM - Platform team reviews**
  ├─ Sees evidence is complete
  ├─ Reviews correlated incidents
  ├─ Approves PR with manual override
  └─ PR merged

**Result:** High-risk agent PR was properly gated, required evidence was added, and platform team made informed decision

---

### Example 3: PagerDuty Incident → Ownership Doc Update

**Scenario:** Incident reveals team ownership changed

**Timeline:**

```
2:00 PM - PagerDuty incident P-12345 resolved
  ├─ Service: api-service
  ├─ Resolved by: bob (from new team @platform-team)
  ├─ Notes: "API gateway issue. Note: This service is now owned by platform team, not backend team."
  └─ PagerDuty webhook fires

2:00:05 PM - VertaAI receives webhook
  ├─ Creates SignalEvent (pagerduty_incident)
  ├─ Creates DriftCandidate (state=INGESTED)
  └─ Enqueues job

2:00:10 PM - State machine runs
  ├─ INGESTED → ELIGIBILITY_CHECKED (passes: has resolution notes)
  ├─ ... (similar flow)
  ├─ DRIFT_CLASSIFIED (LLM: "ownership drift")
  ├─ DOCS_RESOLVED (mapping: service=api-service → doc=165000 "Team Ownership")
  ├─ BASELINE_CHECKED (finds "@backend-team" in doc)
  ├─ PATCH_GENERATED (LLM: generates diff to change team)
  └─ SLACK_SENT (sends to #platform-team)

2:00:30 PM - Slack message appears
```

**Slack message:**

```
👥 Ownership Drift Detected

Source: PagerDuty Incident P-12345 - "API Gateway 503 errors"
Service: api-service
Doc: Team Ownership (Confluence)
Confidence: 85%

Proposed changes (4 lines):
───────────────────────────────────────
--- a/team-ownership.md
+++ b/team-ownership.md
@@ -10,7 +10,7 @@
 ## API Service

-Owner: @backend-team
+Owner: @platform-team
 Slack: #platform-team
───────────────────────────────────────

[Approve] [Edit] [Reject] [Snooze 24h]
```

**2:05 PM - Team lead clicks "Approve"**

**Result:** Ownership doc updated, future incidents will route to correct team

---

### Example 3: Multiple Signals Correlated → Single Patch

**Scenario:** Two PRs in same repo change related deployment steps

**Timeline:**

```
9:00 AM - PR #1234 merged (adds Helm chart)
9:05 AM - PR #1235 merged (removes old kubectl files)

9:05:10 AM - VertaAI processes both signals
  ├─ Signal 1: PR #1234 (adds helm)
  ├─ Signal 2: PR #1235 (removes kubectl)
  ├─ Fingerprint match: Both affect "deployment" in same repo
  └─ Correlation: Join signals into single DriftCandidate

9:05:15 AM - State machine runs
  ├─ SIGNALS_CORRELATED (2 signals joined)
  ├─ Evidence pack includes both PRs
  ├─ Patch generation uses combined context
  └─ Single Slack message sent (references both PRs)
```

**Slack message:**

```
🔄 Documentation Drift Detected

Sources:
  • PR #1234 - "Add Helm chart"
  • PR #1235 - "Remove kubectl deployment files"

Repo: acme/api-service
Doc: Deployment Runbook (Confluence)
Confidence: 95%

Proposed changes (12 lines):
───────────────────────────────────────
[Combined diff from both PRs]
───────────────────────────────────────

[Approve] [Edit] [Reject] [Snooze 24h]
```

**Result:** One approval updates doc with changes from both PRs

---

## FAQ

### General Questions

**Q: What happens if I reject a patch?**

A: The drift is marked as REJECTED and stored with your feedback. We use rejection reasons to improve future classifications. The doc is not updated.

**Q: Can I edit the diff before approving?**

A: Yes! Click "Edit" in Slack, modify the diff, then click "Approve" on the updated version. The state machine will re-validate the edited diff.

**Q: How does VertaAI prevent hallucinations?**

A: Multiple layers:
1. **Evidence-grounded patching** - LLM agents receive structured typed deltas from the EvidenceBundle, not raw text. Every element in the prompt is backed by deterministic evidence
2. **Typed deltas as source of truth** - The LLM can only reference artifacts that appear in the typed deltas (commands, config keys, endpoints, tools, versions). It cannot invent new content
3. **Materiality gate** - Deterministic pre-patch filter prevents low-value, ambiguous drifts from reaching the LLM at all
4. **Baseline checking** - Only propose changes if we find exact evidence in the signal
5. **Diff-only output** - LLM can't rewrite entire docs, only generate diffs
6. **Validation layer** - Code checks for secrets, size limits, scope violations
7. **Human approval** - You always review before publishing
8. **Evidence trail** - Every change links back to source signal with full typed delta provenance

**Q: What if the wrong doc is selected?**

A: You can:
1. Click "Reject" and add feedback
2. Update the doc mapping in Settings → Doc Mappings
3. Re-trigger the drift (Settings → Test → Re-process Drift)

**Q: How do I configure which repos to monitor?**

A: During GitHub OAuth, select which repos to install the VertaAI GitHub App on. You can add/remove repos anytime in GitHub Settings → Applications → VertaAI.

**Q: What's the difference between direct writeback and PR workflow?**

A:
- **Direct writeback** (Confluence, Notion): Clicking "Approve" immediately updates the doc via API
- **PR workflow** (README, Backstage, GitBook, Swagger): Clicking "Approve" creates a GitHub PR that you must manually review and merge

**Q: Can VertaAI auto-approve low-risk changes?**

A: Technically yes (set `autoApproveLowRisk: true` in workspace settings), but we **strongly recommend against it**. Human review catches edge cases and builds trust.

**Q: How much does it cost?**

A: Pricing is based on:
- Number of active repos monitored
- Number of drift notifications sent per month
- LLM API costs (passed through at cost)

Contact sales for pricing details.

---

### Technical Questions

**Q: What happens if the doc is updated between baseline fetch and writeback?**

A: **Optimistic locking** - We check the doc version before writing. If it changed, we:
1. Log a warning
2. Use the current version (not the baseline version)
3. Proceed with writeback

This prevents version conflicts while allowing updates to proceed.

**Q: How do you handle rate limits (GitHub, Confluence, Anthropic)?**

A: Exponential backoff with retries:
- Retry 1: Wait 2 seconds
- Retry 2: Wait 4 seconds
- Retry 3: Wait 8 seconds
- After 3 retries: Mark as FAILED with code RATE_LIMITED

**Q: Can I run VertaAI on-premise?**

A: Not currently. VertaAI is SaaS-only. We use Vercel (frontend) and Railway (backend) for hosting.

**Q: How do you secure OAuth tokens?**

A:
- Stored encrypted in PostgreSQL
- Never logged or exposed in API responses
- Rotated automatically when possible
- Scoped to minimum required permissions

**Q: What's the latency from PR merge to Slack notification?**

A: Typically **30-60 seconds**:
- Webhook delivery: ~1-2 seconds
- State machine processing: ~20-40 seconds (depends on LLM API latency)
- Slack API call: ~1-2 seconds

**Q: Can I use VertaAI with GitHub Enterprise?**

A: Yes! Configure the GitHub Enterprise URL in Settings → Integrations → GitHub → Advanced.

**Q: How do you handle multi-region deployments?**

A: Currently single-region (US). Multi-region support planned for Q3 2026.

**Q: Can I export drift history?**

A: Yes! Dashboard → Analytics → Export → CSV/JSON. Includes all drifts, approvals, rejections, and timestamps.

---

### Troubleshooting

**Q: Why am I not receiving Slack notifications?**

A: Check:
1. Slack app is installed (Settings → Integrations → Slack → Status)
2. Default Slack channel is configured (Settings → Workspace → Default Slack Channel)
3. Confidence threshold isn't too high (Settings → Workspace → Confidence Threshold)
4. Rate limit not exceeded (Dashboard → Analytics → Notification Rate)
5. Railway logs for errors (contact support for access)

**Q: Why is my PR not triggering drift detection?**

A: Check:
1. PR is **merged** (not just opened)
2. PR touches operational paths (deploy/, infra/, etc.) - see Eligibility Rules
3. PR doesn't have excluded labels (skip-vertaai, docs-only)
4. PR author isn't excluded (dependabot, renovate)
5. GitHub webhook is active (Settings → Integrations → GitHub → Webhook Status)

**Q: Why did the writeback fail?**

A: Common causes:
1. **Version conflict** - Doc was updated since baseline fetch (check logs)
2. **Permission denied** - OAuth token expired or lacks write permission
3. **Doc not found** - Doc ID is wrong or doc was deleted
4. **Validation failed** - Diff contains secrets, too large, or doesn't apply cleanly

Check Railway logs for specific error code.

**Q: How do I debug a specific drift?**

A:
1. Dashboard → Drifts → Search by ID
2. View state timeline (shows all state transitions)
3. View logs (shows LLM prompts, responses, errors)
4. Re-run state machine (Settings → Test → Re-process Drift)

---

## Support & Resources

- **Documentation:** https://docs.vertaai.com
- **Status Page:** https://status.vertaai.com
- **Support Email:** support@vertaai.com
- **Slack Community:** https://vertaai-community.slack.com
- **GitHub Issues:** https://github.com/vertaai/feedback

---

**Last Updated:** February 12, 2026
**Version:** 3.0
**Maintained by:** VertaAI Team

**Recent Updates (v3.0 — Evidence-Grounded Patching System)**:
- **Phase 1**: Typed deltas in ComparisonResult (key:value comparison, tool replacement detection, version mismatch detection)
- **Phase 2**: Wired EvidenceBundle to LLM agents (structured evidence contract replaces raw diff, truncation priority order)
- **Phase 3**: Materiality gate (deterministic pre-patch filter, skip reason tracking for temporal accumulation)
- **Phase 4**: Bounded context expansion (fetch up to 3 key files, 30K char budget, richer artifact extraction)
- **Phase 5**: Temporal drift accumulation (bundle small drifts over time, configurable windows and thresholds)
- Added sections 10-12: Typed Deltas & Evidence-Grounded Patching, Bounded Context Expansion, Temporal Drift Accumulation
- Updated Early Threshold Routing section with materiality gate (now section 8)
- Updated EvidenceBundle pattern with typed deltas and assessment model
- Updated state machine flow with materiality gate, typed deltas, bounded context expansion
- Updated Example 1 timeline with typed delta generation and evidence-grounded patching
- Updated FAQ anti-hallucination answer with evidence-grounding layers

**Previous Updates (v2.0)**:
- Added orthogonal coverage detection explanation
- Updated state machine flow with early threshold routing and clustering
- Added Evidence-Based Detection section (EvidenceBundle pattern)
- Added Audit Trail & Compliance section
- Added Early Threshold Routing section
- Added Cluster-First Drift Triage section
- Updated all drift type descriptions
- Reflected current system health (85%) and acceptance criteria (5/5)

