# VertaAI Product Guide

**Version:** 2.0
**Last Updated:** February 11, 2026
**Audience:** New developers, customers, and technical stakeholders

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

**VertaAI** is an **AI-powered documentation maintenance agent** that automatically keeps your operational documentation (runbooks, onboarding guides, decision docs) in sync with reality.

### One-Liner
> "We keep runbooks and onboarding docs correct by automatically proposing PR-style updates from incidents, PRs, and Slack — with owner routing and approvals."

### Core Value Proposition
When your infrastructure changes, your deployment process evolves, or your team structure shifts, **VertaAI detects the drift** between what your documentation says and what actually happens, then **proposes precise fixes** for human approval.

---

## The Problem We Solve

### The Documentation Drift Problem

Every engineering team faces this cycle:

```
Code Changes → Docs Become Stale → Engineers Waste Time → Incidents Happen → Docs Updated (Maybe)
```

**Specific pain points:**

1. **Runbooks lie**: "Deploy with kubectl" but you switched to Helm 6 months ago
2. **Ownership is wrong**: Slack channel moved, on-call rotation changed, CODEOWNERS outdated
3. **Missing scenarios**: New failure modes aren't documented after incidents
4. **Process drift**: Deployment steps changed but runbook wasn't updated
5. **Tool migrations**: Switched from Jenkins to GitHub Actions, docs still reference old tools

### Why Traditional Solutions Fail

| Approach | Why It Fails |
|----------|--------------|
| **Manual updates** | Humans forget, especially during incidents |
| **Linters** | Can't detect semantic drift (wrong commands that are syntactically valid) |
| **Search tools** | Help you find docs, don't keep them correct |
| **Wikis with "last updated"** | Timestamp doesn't mean content is accurate |
| **"Living documentation"** | Requires discipline that doesn't scale |

---

## How VertaAI Works

### The VertaAI Approach: Detect → Cluster → Propose → Approve → Update

```
┌─────────────────────────────────────────────────────────────────┐
│  1. DETECT DRIFT (Deterministic)                                 │
│  ├─ GitHub PR merged (changed deployment scripts)                │
│  ├─ PagerDuty incident resolved (new failure scenario)           │
│  └─ Slack questions clustered (knowledge gap detected)           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. ANALYZE & CLASSIFY (Deterministic Comparison)                │
│  ├─ Extract artifacts from source (commands, URLs, steps)        │
│  ├─ Extract artifacts from docs (current state)                  │
│  ├─ Compare artifacts to detect drift type                       │
│  ├─ Detect coverage gaps (orthogonal dimension)                  │
│  └─ Confidence score (0-100%) based on artifact overlap          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. EARLY THRESHOLD ROUTING (Filter Low-Confidence)              │
│  ├─ Check confidence against ignore threshold                    │
│  ├─ If below threshold → Skip patch generation (save LLM calls)  │
│  └─ If above threshold → Continue to patch generation            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. GENERATE PATCH (NOT FULL REWRITE)                            │
│  ├─ Fetch current doc content                                    │
│  ├─ Compare with evidence from signal                            │
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

1. **Deterministic detection**: 100% reproducible artifact comparison (no LLM randomness)
2. **Cluster-first triage**: Groups similar drifts for bulk actions (80-90% notification reduction)
3. **Orthogonal coverage**: Detects both incorrect AND missing documentation
4. **Early threshold routing**: Filters low-confidence drifts before patch generation (30-40% LLM call reduction)
5. **Diff-based, not rewrites**: We propose surgical changes, not full document regeneration
6. **Evidence-driven**: Every change is backed by a real signal (PR, incident, etc.)
7. **Human-in-the-loop**: No autonomous publishing - you always approve
8. **Multi-source correlation**: Combines GitHub + PagerDuty + Slack signals
9. **Ownership-aware**: Routes to the right person based on CODEOWNERS, mappings, on-call
10. **Complete audit trail**: Full observability with PlanRun tracking and EvidenceBundle pattern

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

VertaAI is built as a **multi-tenant, event-driven system** with a **deterministic state machine** at its core.

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
│  │  • Create DriftCandidate with state=INGESTED                         │     │
│  └────────────────────────────┬────────────────────────────────────────┘     │
│                               │                                              │
│                               ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │                   STATE MACHINE ORCHESTRATOR                         │     │
│  │  • QStash job queue (Vercel-compatible)                              │     │
│  │  • Bounded loop: MAX_TRANSITIONS_PER_INVOCATION = 5                  │     │
│  │  • Distributed locking (30s TTL)                                     │     │
│  │  • Retry logic with exponential backoff                              │     │
│  └────────────────────────────┬────────────────────────────────────────┘     │
│                               │                                              │
│         ┌─────────────────────┼─────────────────────────┐                   │
│         ▼                     ▼                         ▼                   │
│  ┌─────────────┐      ┌─────────────┐         ┌─────────────┐               │
│  │ LLM AGENTS  │      │ DOC SERVICE │         │  SLACK APP  │               │
│  │             │      │             │         │             │               │
│  │ • Triage    │      │ • Adapters  │         │ • Composer  │               │
│  │ • Planner   │      │ • Fetch     │         │ • Buttons   │               │
│  │ • Generator │      │ • Writeback │         │ • Routing   │               │
│  │             │      │ • Versioning│         │             │               │
│  │ (Stateless) │      │             │         │             │               │
│  └─────────────┘      └─────────────┘         └─────────────┘               │
│                               │                                              │
│                               ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │                    DATABASE (PostgreSQL)                             │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │     │
│  │  │  Workspace   │  │ SignalEvent  │  │DriftCandidate│               │     │
│  │  │ (tenant)     │  │ (normalized) │  │ (state)      │               │     │
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
```

**Why:** Ensures complete data isolation between customers.

#### 2. Deterministic State Machine

18 states with explicit transition handlers:

```typescript
const TRANSITION_HANDLERS: Record<DriftState, TransitionHandler> = {
  [DriftState.INGESTED]: handleIngested,
  [DriftState.ELIGIBILITY_CHECKED]: handleEligibilityChecked,
  // ... 16 more states
};
```

**Why:** Predictable, debuggable, resumable processing.

#### 3. Adapter Pattern for Documentation Systems

Unified interface for different doc platforms:

```typescript
interface DocAdapter {
  fetch(doc: DocRef): Promise<FetchResult>;
  writePatch(params: WritePatchParams): Promise<WriteResult>;
  supportsDirectWriteback(): boolean;
  getDocUrl(docId: string): string;
}
```

**Why:** Easy to add new doc systems without changing core logic.

#### 4. Bounded Loop Pattern

```typescript
const MAX_TRANSITIONS_PER_INVOCATION = 5;
```

**Why:** Prevents infinite loops, keeps job execution time predictable.

#### 5. Evidence-Based Patch Generation

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
SIGNALS_CORRELATED ─────→ (join multiple signals for same drift)
  ↓
DOCS_RESOLVED ──────────→ (deterministic doc targeting, no LLM)
  ↓
DOCS_FETCHED ───────────→ (fetch current doc content)
  ↓
DOC_CONTEXT_EXTRACTED ──→ (extract relevant sections)
  ↓
EVIDENCE_EXTRACTED ─────→ (deterministic comparison: drift type + coverage gap)
  ↓
BASELINE_CHECKED ───────→ (early threshold routing: filter low-confidence)
  ↓
PATCH_PLANNED ──────────→ (LLM: which sections to change?)
  ↓
PATCH_GENERATED ────────→ (LLM: generate unified diff)
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
| **SIGNALS_CORRELATED** | Join multiple signals for same drift (dedup) | Always → DOCS_RESOLVED |
| **DOCS_RESOLVED** | Deterministic doc targeting (no LLM) | Found → DOCS_FETCHED<br>Not found → FAILED_NEEDS_MAPPING |
| **DOCS_FETCHED** | Fetch current doc content via adapter | Success → DOC_CONTEXT_EXTRACTED<br>Error → FAILED |
| **DOC_CONTEXT_EXTRACTED** | Extract relevant sections (deployment, rollback, etc.) | Always → EVIDENCE_EXTRACTED |
| **EVIDENCE_EXTRACTED** | Deterministic comparison: extract artifacts, detect drift type + coverage gap | Always → BASELINE_CHECKED |
| **BASELINE_CHECKED** | Early threshold routing: filter low-confidence drifts | Above threshold → PATCH_PLANNED<br>Below threshold → COMPLETED |
| **PATCH_PLANNED** | LLM decides which sections to modify | Success → PATCH_GENERATED<br>Uncertain → COMPLETED |
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
| **GitHub PRs** | ✅ Live | Code/config changes that invalidate docs | `POST /webhooks/github/:workspaceId` |
| **PagerDuty Incidents** | ✅ Live | New failure scenarios, ownership changes | `POST /webhooks/pagerduty/:workspaceId` |
| **Slack Questions** | 🚧 Planned | Clustered questions revealing knowledge gaps | `POST /webhooks/slack/:workspaceId` |
| **Datadog/Grafana Alerts** | 🚧 Planned | Environment/tooling drift | TBD |

#### GitHub PR Signal

**Trigger conditions:**
- PR is **merged** (not just opened)
- Touches operational paths: `**/deploy/**`, `**/infra/**`, `**/terraform/**`, `**/helm/**`, `**/k8s/**`, `**/.github/workflows/**`, `**/config/**`
- OR contains keywords: `breaking`, `migrate`, `deprecate`, `rollback`, `deploy`, `helm`, `k8s`, `terraform`, `config`, `endpoint`, `auth`

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

### Output Targets (Documentation Systems)

VertaAI supports multiple documentation platforms with two update strategies:

| Doc System | Direct Writeback? | Update Method | Adapter |
|------------|-------------------|---------------|---------|
| **Confluence** | ✅ Yes | API call (immediate) | `confluenceAdapter.ts` |
| **Notion** | ✅ Yes | API call (immediate) | `notionAdapter.ts` |
| **GitHub README** | ❌ No | Create PR (manual merge) | `readmeAdapter.ts` |
| **Backstage catalog-info.yaml** | ❌ No | Create PR (manual merge) | `backstageAdapter.ts` |
| **GitBook** | ❌ No | Create PR (manual merge) | `gitbookAdapter.ts` |
| **Swagger/OpenAPI** | ❌ No | Create PR (manual merge) | `swaggerAdapter.ts` |

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

### 1. Drift Types & Orthogonal Coverage

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

### 2. Evidence-Based Detection (EvidenceBundle Pattern)

**Purpose:** Deterministic, reproducible drift detection without LLM randomness

**How it works:**
1. **Extract artifacts from source signal**:
   - Commands: `kubectl apply`, `helm install`, `docker run`
   - URLs: API endpoints, service URLs, documentation links
   - Config values: Environment variables, settings, parameters
   - Process steps: Deployment steps, runbook procedures, workflows
   - Ownership: Teams, channels, on-call rotations, CODEOWNERS
   - Environment: Tools, platforms, versions, dependencies

2. **Extract artifacts from documentation**:
   - Parse current doc content for same artifact types
   - Build structured representation of doc state

3. **Deterministic comparison**:
   - Compare source artifacts vs doc artifacts
   - Detect conflicts (source says X, doc says Y)
   - Detect coverage gaps (source has X, doc doesn't mention it)
   - Calculate confidence score (0.0 to 1.0) based on overlap

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
  sourceArtifacts: Json; // Extracted from signal
  docArtifacts: Json;    // Extracted from documentation
  comparisonResult: {
    driftType: string;
    hasCoverageGap: boolean;
    confidence: number;
    conflicts: Array<{type, source, doc}>;
    gaps: Array<{type, content}>;
  };
  createdAt: DateTime;
}
```

**Why this matters:**
- **100% Reproducible**: Same input always produces same output
- **Fast**: No LLM calls needed for classification (~10x faster)
- **Transparent**: Clear explanation of what changed and why
- **Accurate**: Detects 5 types of drift across 7 source types
- **Auditable**: Full evidence trail for compliance

### 3. Patch Generation (Unified Diff)

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

### 4. Owner Resolution

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

### 5. Notification Routing

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

### 6. Managed Regions

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

### 7. Audit Trail & Compliance

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

### 8. Early Threshold Routing

**Purpose:** Filter low-confidence drifts BEFORE patch generation to save LLM calls

**How it works:**
1. At BASELINE_CHECKED state (before PATCH_PLANNED)
2. Resolve active DriftPlan and thresholds
3. Check drift confidence against ignore threshold
4. If confidence < ignore threshold → Skip to COMPLETED
5. If confidence ≥ ignore threshold → Continue to PATCH_PLANNED

**Implementation:**
```typescript
// At BASELINE_CHECKED state
const confidence = drift.confidence || 0.5;
const threshold = resolveThresholds({...});

if (confidence < threshold.ignore) {
  // Skip patch planning, mark as COMPLETED
  return { state: DriftState.COMPLETED, enqueueNext: false };
}
```

**Benefits:**
- ✅ **Cost Savings**: 30-40% reduction in unnecessary LLM calls
- ✅ **Faster Processing**: Low-confidence drifts complete immediately
- ✅ **Resource Efficiency**: Don't waste compute on drifts that will be ignored

**Example:**
- Drift confidence: 0.15
- Ignore threshold: 0.20
- Result: Skip patch generation, mark as COMPLETED (saves 2-3 LLM calls)

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

---

## Example Workflows

### Example 1: GitHub PR → Confluence Runbook Update

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
  ├─ ELIGIBILITY_CHECKED → SIGNALS_CORRELATED (no duplicates)
  ├─ SIGNALS_CORRELATED → DRIFT_CLASSIFIED (LLM: "instruction drift")
  ├─ DRIFT_CLASSIFIED → DOCS_RESOLVED (mapping: repo=acme/api → doc=164013)
  └─ DOCS_RESOLVED → DOCS_FETCHED (fetches Confluence page 164013)

10:00:15 AM - State machine runs (Job 2)
  ├─ DOCS_FETCHED → DOC_CONTEXT_EXTRACTED (extracts "Deployment" section)
  ├─ DOC_CONTEXT_EXTRACTED → EVIDENCE_EXTRACTED (finds "kubectl" → "helm" migration)
  ├─ EVIDENCE_EXTRACTED → BASELINE_CHECKED (finds "kubectl apply" in doc)
  ├─ BASELINE_CHECKED → PATCH_PLANNED (LLM: modify deployment section)
  └─ PATCH_PLANNED → PATCH_GENERATED (LLM: generates diff)

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

### Example 2: PagerDuty Incident → Ownership Doc Update

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
1. **Baseline checking** - Only propose changes if we find exact evidence in the signal
2. **Diff-only output** - LLM can't rewrite entire docs, only generate diffs
3. **Validation layer** - Code checks for secrets, size limits, scope violations
4. **Human approval** - You always review before publishing
5. **Evidence trail** - Every change links back to source signal (PR, incident, etc.)

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

**Last Updated:** February 11, 2026
**Version:** 2.0
**Maintained by:** VertaAI Team

**Recent Updates (v2.0)**:
- Added orthogonal coverage detection explanation
- Updated state machine flow with early threshold routing and clustering
- Added Evidence-Based Detection section (EvidenceBundle pattern)
- Added Audit Trail & Compliance section
- Added Early Threshold Routing section
- Added Cluster-First Drift Triage section
- Updated all drift type descriptions
- Reflected current system health (85%) and acceptance criteria (5/5)

