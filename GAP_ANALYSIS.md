# VertaAI Gap Analysis: From Docs Bot → Control-Plane + Truth-Making System

## Executive Summary

VertaAI today is a **well-engineered drift-detection pipeline** with an 18-state deterministic state machine, multi-source signal ingestion, evidence-based patch generation, and a human-in-the-loop approval workflow. The codebase already contains significant infrastructure that maps to the target vision—domain impact scores, drift classification, baseline pattern matching, deduplication fingerprinting, and workspace-scoped configuration.

However, the product is positioned as a **"doc update bot"** when the real value proposition is a **control-plane for documentation health with deterministic truth-making**. The gap is not in capability—it's in **framing, surfacing, and formalizing** what already exists.

**Core finding:** ~60% of the recommended capabilities have partial or foundational implementations already in place. The work is primarily about:
1. **Elevating existing logic** into explicit, named, surfaced concepts (DriftPlan, Impact Band, Audit Bundle)
2. **Adding a thin deterministic layer** (Impact Engine with rule-based consequence templates)
3. **Reshaping the UX** (Slack messages reframed from "review diff" → "verify reality")
4. **Clustering notifications** to reduce fatigue and increase signal quality

**Estimated effort to reach target state:** 6-8 weeks for a 2-person team (1 backend, 1 frontend).

---

## Current State Assessment

### Architecture Strengths (What's Working)

| Capability | Implementation | Quality |
|---|---|---|
| **18-state deterministic pipeline** | `transitions.ts` — full state machine with bounded loops (MAX_TRANSITIONS = 5), distributed locking, retry | ✅ Production-ready |
| **5 drift types** | instruction, process, ownership, coverage, environment_tooling | ✅ Complete |
| **Evidence-based scoring** | `scoring/index.ts` — additive evidence signals, domain impact scores, drift_score = confidence × impact | ✅ Solid foundation |
| **Baseline pattern matching** | `evidencePack.ts` + `patterns.ts` — deterministic extraction before any LLM call | ✅ Key differentiator |
| **15 validators** | `validators/index.ts` — secrets, managed regions, evidence binding, owner scope, revision checks | ✅ Comprehensive |
| **Deduplication** | `fingerprint.ts` — SHA-256 fingerprint on (workspace + service + drift_type + domains + doc + tokens) | ✅ Works |
| **Multi-source adapters** | Confluence, Notion, GitHub README, Backstage, GitBook, Swagger (behind feature flags) | ✅ Extensible |
| **Feature flag system** | `featureFlags.ts` — env var overrides, starter mode, per-workspace future support | ✅ Clean |
| **Workspace-scoped config** | Prisma schema: confidence thresholds, ownership ranking, workflow preferences JSON | ⚠️ Partial — no DriftPlan concept |
| **Notification routing** | `policy.ts` — P0/P1/P2 confidence-based routing with escalation logic | ⚠️ Per-drift, not clustered |
| **Audit trail** | AuditEvent model (entity_type, entity_id, event_type, payload blob) | ⚠️ Lightweight — not reproducible |
| **Question clustering** | `questionClusterer.ts` — greedy Jaccard similarity, topic inference | ⚠️ Only for Slack questions, not drift notifications |

### Key Data Model Fields (DriftCandidate)

The DriftCandidate already stores rich context that the recommendations need:
- `driftVerdict` (JSON) — comparison-based verdict with hasMatch, confidence, source, evidence
- `docsResolution` (JSON) — full resolution result blob for debugging
- `docContext` (JSON) — snapshot for LLM reproducibility
- `docContextSha256` — stable fingerprint of context slice
- `baseRevision` — Confluence version at fetch time
- `confidence`, `driftScore`, `riskLevel`, `recommendedAction`
- `fingerprint` — deduplication hash
- `driftDomains[]` — impacted domain list
- `baselineFindings` (JSON) — pattern match results

**What's NOT stored:** plan_version_hash, prompt_hash, model_id, impact_band, fired_rules[], consequence_text, cluster_id, audit_bundle_hash.

---

## Gap Inventory

### 1A) DriftPlan + Coverage Health — "Control-Plane as the Product"

**Recommendation:** Each workspace defines a DriftPlan per service/repo/doc-class specifying which sources are enabled, what patch styles are allowed, confidence thresholds, and which doc mappings are required. Coverage Health shows % services mapped, % PRs evaluated, blocked reasons.

#### What Exists Today

| Component | Current State | Gap |
|---|---|---|
| **Workspace config** | `Workspace` model has `highConfidenceThreshold`, `mediumConfidenceThreshold`, `primaryDocRequired`, `allowedConfluenceSpaces[]`, `workflowPreferences` JSON | ✅ Foundation exists |
| **Workflow preferences** | JSON blob in Workspace — `enabledDriftTypes`, `enabledInputSources`, `enabledOutputTargets`, `outputTargetPriority` | ⚠️ Flat, not per-service/repo |
| **DocMappingV2** | `isPrimary`, `hasManagedRegion`, `docSystem`, `service`, `repo` fields | ✅ Mapping primitives exist |
| **Feature flags** | Starter mode controls which sources/adapters are active | ✅ Exists but global, not plan-level |
| **Settings UI** | `apps/web/src/app/settings/page.tsx` — toggles for drift types, sources, targets, thresholds | ⚠️ Global toggles, not per-service plans |
| **Drift matrix** | `driftMatrix.ts` — maps (drift_type × source) → patch_style, confidence range | ✅ Decision table exists |

#### What's Missing

1. **`DriftPlan` model** — No Prisma model to represent a versioned, per-service/repo/doc-class plan. Today everything is workspace-global.
   - Need: `DriftPlan { id, workspaceId, name, servicePattern, repoPattern, docClass, enabledSources[], enabledDriftTypes[], allowedPatchStyles[], confidenceOverrides, version, hash, isActive, createdAt }`
   - This is the **single most important new model** for the control-plane positioning.

2. **Coverage Health metrics** — No API or UI to answer:
   - "What % of services have a primary runbook mapping?"
   - "What % of merged PRs in the last 7 days were evaluated?"
   - "What signals were blocked and why?"
   - Current: `MetricsSnapshot` exists in legacy models but only tracks proposal counts, not coverage.

3. **Plan versioning and hash** — No way to say "this drift was evaluated under plan v3 with hash abc123". Needed for reproducibility.

4. **Per-service threshold overrides** — `Workspace` has global thresholds. No way to say "payment-service needs 0.85 auto-approve but frontend-app can use 0.70".

#### Implementation Effort: **Medium** (2-3 weeks)


---

### 1B) Reproducibility as Trust Primitive — "Audit Bundle"

**Recommendation:** Every drift decision should be fully reproducible. Bundle: plan_version_hash + signal_event_id + evidence_snippet_ids + doc_revision_id + baseline_extraction_hash + comparator_rule_ids + prompt_hash + model_id + validator_report_hash. Two engineers seeing the same bundle must reach the same conclusion.

#### What Exists Today

| Component | Current State | Gap |
|---|---|---|
| **Signal linkage** | `DriftCandidate.signalEventId` → links back to SignalEvent | ✅ Exists |
| **Doc context snapshot** | `docContext` JSON, `docContextSha256` hash | ✅ Context is captured |
| **Base revision** | `baseRevision` field (Confluence version at fetch) | ✅ Exists |
| **Evidence summary** | `evidenceSummary` text field | ⚠️ Free text, not structured IDs |
| **Drift verdict** | `driftVerdict` JSON with hasMatch, confidence, source, evidence | ⚠️ Stored but not as formal audit chain |
| **Baseline findings** | `baselineFindings` JSON | ✅ Deterministic pattern results stored |
| **Resolution debug blob** | `docsResolution` JSON — full resolution steps | ✅ Debugging exists |
| **Approval audit log** | `Approval` model (append-only) + `AuditEvent` model | ⚠️ Lightweight: entity_type + event_type + JSON payload |
| **Validator results** | 15 validators run, results aggregated | ❌ Results not persisted per-drift |
| **LLM call tracking** | Claude called via `callClaude()` in agents | ❌ No prompt_hash, model_id stored per call |

#### What's Missing

1. **Formal `AuditBundle` assembly** — The pieces exist scattered across DriftCandidate fields, but there's no single function that assembles them into a coherent, hashable, reproducible bundle. Need:
   ```
   AuditBundle { plan_version_hash, signal_event_id, evidence_pack_hash,
                 doc_revision_id, baseline_findings_hash, comparator_rule_ids[],
                 prompt_hash?, model_id?, validator_report: ValidatorReportSnapshot,
                 bundle_hash (SHA-256 of all above) }
   ```

2. **Prompt hash + model tracking** — `callClaude()` in `lib/claude.ts` doesn't store the prompt hash or model version used. Critical for "same inputs → same outputs" reproducibility claim.

3. **Validator report persistence** — `runAllValidators()` returns a `ValidationResult` with errors/warnings but it's consumed inline and not stored alongside the drift record.

4. **Bundle hash endpoint** — No API endpoint to retrieve or compare audit bundles. Needed for customer-facing "here's exactly why we made this decision" trust narrative.

#### Implementation Effort: **Low-Medium** (1-2 weeks)
- Most fields already exist; main work is assembly function + storage + API endpoint
- Prompt hashing requires a small change to `callClaude()` wrapper

---

### 1C) Cluster-First Fatigue Reduction

**Recommendation:** Instead of sending N individual Slack DMs per drift, cluster related drifts by (service/repo, docRef, drift_type, domain, 7-day window) and send ONE cluster notification with exemplar PR, count, and bulk actions.

#### What Exists Today

| Component | Current State | Gap |
|---|---|---|
| **Question clustering** | `questionClusterer.ts` — greedy Jaccard similarity, topic inference, min_cluster_size=3 | ✅ Algorithm exists but only for Slack questions |
| **SlackQuestionCluster model** | Prisma model: channel, representative question, message count, unique askers | ✅ Cluster storage exists |
| **Deduplication** | `fingerprint.ts` — exact match on SHA-256 hash, prevents exact duplicates | ⚠️ Dedup ≠ clustering |
| **Notification routing** | `policy.ts` — per-drift P0/P1/P2 routing, no aggregation | ❌ One notification per drift |
| **Rate limiting** | `delayMinutes` in NotificationDecision, `shouldEscalate()` for critical domains | ⚠️ Reactive throttling only |

#### What's Missing

1. **`DriftCluster` model** — No Prisma model for notification clusters. Need:
   ```
   DriftCluster { id, workspaceId, clusterKey, driftIds[], exemplarDriftId,
                  count, windowStart, windowEnd, status, notifiedAt }
   ```

2. **Cluster aggregation service** — Before `handleOwnerResolved` sends to Slack, check if drift belongs to existing cluster. Update count; send one cluster notification when threshold reached.

3. **Cluster Slack UX** — Message format: "🔔 3 drifts for `payment-service` runbook in 5 days. Exemplar: PR #423. [View All] [Ack All] [Snooze 7d]"

4. **Bulk actions** — Approve/reject/snooze at cluster level, propagating to all member drifts.

#### Implementation Effort: **Medium** (2 weeks)

---

### 1D) Deterministic Comparator as "Truth Engine"

**Recommendation:** The comparator should produce deterministic outcome enums: NOT_APPLICABLE, BLOCKED_NEEDS_MAPPING, WATCH, SIGNAL, CRITICAL. LLM only enters when outcome ≥ SIGNAL. Every outcome below SIGNAL is 100% explainable, zero hallucination.

#### What Exists Today

| Component | Current State | Gap |
|---|---|---|
| **Drift verdict** | `driftVerdict` JSON: `{ hasMatch, confidence, source, evidence[], comparisonType }` | ⚠️ Boolean hasMatch, not enumerated outcome |
| **Recommended action** | `recommendedAction` field: `generate_patch`, `annotate_only`, `review_queue`, `ignore` | ⚠️ Action-oriented, not outcome-oriented |
| **Risk level** | `riskLevel`: `low`, `medium`, `high` | ⚠️ Severity, not deterministic outcome |
| **Baseline checking** | `handleBaselineChecked()` runs pattern matching before LLM | ✅ Deterministic gate exists |
| **Eligibility checking** | `handleEligibilityChecked()` filters non-doc-impacting PRs | ✅ Deterministic filtering |
| **Doc resolution status** | `docsResolutionStatus`: `mapped`, `explicit_link`, `search_candidate`, `needs_mapping`, `ignored` | ⚠️ Resolution status, not outcome enum |

#### What's Missing

1. **Formal `ComparatorOutcome` enum** — Need an explicit, deterministic outcome type:
   ```
   NOT_APPLICABLE    — Signal doesn't match any plan rule (deterministic)
   BLOCKED           — Matches but missing doc mapping or managed region (deterministic)
   WATCH             — Low confidence, log only (deterministic, no LLM)
   SIGNAL            — Medium confidence, notify + offer patch (LLM enters here)
   CRITICAL          — High confidence + risky domain, escalate immediately (LLM + validators)
   ```

2. **Outcome stored on DriftCandidate** — New `comparatorOutcome` field replacing the ambiguous `recommendedAction`.

3. **LLM boundary enforcement** — Currently the LLM (drift-triage agent) runs for ALL drifts that pass eligibility. Need to gate: only invoke LLM when comparator outcome ≥ SIGNAL.

4. **Outcome explanation** — For outcomes below SIGNAL, provide human-readable explanation of which deterministic rules fired and why, without any LLM involvement.

#### Implementation Effort: **Low** (1 week)
- Primarily a refactoring of existing logic into explicit enum + gating logic
- `handleBaselineChecked` and `handleEligibilityChecked` already contain most of the needed deterministic logic

---

### 2) Deterministic Impact / Consequence Engine

**Recommendation:** Introduce a 100% deterministic Impact Model with: (A) Impact bands based on fired rules, (B) Consequence templates per drift_type × domain, (C) "What breaks" blast radius mapping, (D) "Verify Reality" framing instead of "Review doc diff."

#### What Exists Today

| Component | Current State | Gap |
|---|---|---|
| **Domain impact scores** | `DOMAIN_IMPACT_SCORES` in `scoring/index.ts`: rollback=0.9, auth=0.9, deployment=0.8, etc. | ✅ Numeric scores exist |
| **Impact calculation** | `calculateImpactScore()` — takes max of domain scores | ✅ Logic exists |
| **Drift score** | `calculateDriftScore()` = confidence × impact_score | ✅ Calculation exists |
| **Risky domains** | `RISKY_DOMAINS` = [rollback, auth, data_migrations] | ✅ Critical domains identified |
| **Evidence signal scores** | `EVIDENCE_SIGNAL_SCORES`: pr_explicit_change=0.50, owner_mismatch=0.60, etc. | ✅ Signal weights exist |
| **Drift matrix** | `driftMatrix.ts` — (drift_type × source) → patch_style + confidence range | ✅ Decision table exists |
| **Breaking change detection** | `validateNoBreakingChanges()` — pattern matching for deprecations, removals | ⚠️ Validator only, not impact model |
| **Tool migration detection** | `detectToolMigrations()` in evidencePack — detects helm→kustomize, etc. | ✅ Deterministic tool detection |

#### What's Missing

1. **Impact Band classification** — No formal banding of the numeric impact score:
   ```
   LOW      = impact < 0.4
   MEDIUM   = 0.4 ≤ impact < 0.7
   HIGH     = 0.7 ≤ impact < 0.9
   CRITICAL = impact ≥ 0.9
   ```
   Currently `calculateImpactScore()` returns a float, but nothing classifies it into a named band with specific behavioral implications.

2. **`fired_rules[]` tracking** — When evidence is evaluated, which rules matched should be stored. Today, `baselineFindings` stores some pattern results, but there's no explicit list of rule IDs that contributed to the final score.

3. **Consequence Templates** — No deterministic text generation for "what this means":
   ```
   drift_type=instruction + domain=deployment →
     "If engineers follow the current runbook step 3, they will execute {old_command}
      instead of {new_command}. This affects {N} deploys/week."

   drift_type=ownership + domain=auth →
     "Escalation will route to {old_owner} instead of {new_owner}.
      Mean-time-to-engage may increase by {estimated_minutes}."
   ```
   These are fill-in-the-blank templates with variables from the evidence pack — zero LLM needed.

4. **"What Breaks" registry** — No mapping from service → dependent services/runbooks. Need:
   ```
   WhatBreaksEntry { service, dependsOn[], usedByRunbooks[], blastRadiusHint }
   ```
   This enables "if payment-service auth changes, these 3 runbooks reference it."

5. **Impact fields on DriftCandidate** — Need new fields: `impactBand`, `firedRules` (JSON array), `consequenceText` (deterministic template output).

#### Implementation Effort: **Medium** (2 weeks)
- Impact banding: trivial classification function over existing scores
- Fired rules: instrument existing scoring/baseline code to emit rule IDs
- Consequence templates: new config file with ~20 templates + fill logic
- "What breaks" registry: new lightweight model or config, populated from doc mappings

---

### 3) "Verify Reality" Slack UX

**Recommendation:** Reframe Slack messages from "here's a doc diff to approve" to "here's a claim about reality—verify it." Three-column layout: CLAIM (what we think changed) | EVIDENCE (PR diff, alert, question cluster) | CONSEQUENCE (deterministic "what breaks" text). Primary CTA: "✅ Mark as Verified" (not "Approve").

#### What Exists Today

| Component | Current State | Gap |
|---|---|---|
| **Slack composer** | `slack-composer.ts` — LLM-composed Block Kit messages with diff preview | ⚠️ Diff-centric, not claim/evidence/consequence |
| **Fallback message** | `buildFallbackSlackMessage()` — hardcoded blocks: Header → Trigger → Summary → Diff → Buttons | ⚠️ Same diff-centric layout |
| **Buttons** | ✅ Approve, ✏️ Edit, ❌ Reject, 💤 Snooze 48h | ⚠️ "Approve" framing, not "Verify" |
| **Interaction handler** | `slack-interactions.ts` — handles button clicks, opens modals for edit/reject | ✅ Plumbing is solid |
| **Confidence display** | Confidence % shown in message | ✅ Exists |
| **Source references** | `sources_used` from patch generator passed to composer | ⚠️ Listed but not structured as evidence column |

#### What's Missing

1. **Three-column Slack layout** — Replace current diff-centric layout:
   ```
   Current:  Header → Trigger → Summary → Diff Preview → [Approve/Edit/Reject/Snooze]

   Target:   Header ("⚡ Reality check needed")
             → CLAIM block ("PR #423 changed auth flow in payment-service")
             → EVIDENCE block (PR diff excerpt, linked files, tool mentions)
             → CONSEQUENCE block (deterministic: "If not updated, runbook step 3
               still says `helm install auth-v1` but code now uses `auth-v2`")
             → IMPACT BAND badge (🔴 CRITICAL / 🟠 HIGH / 🟡 MEDIUM / 🟢 LOW)
             → [✅ Mark Verified] [📝 Edit & Verify] [❌ Dispute] [💤 Snooze 7d]
   ```

2. **Button text changes** — "Approve" → "Mark as Verified", "Reject" → "Dispute" (with reason), "Snooze 48h" → "Snooze 7d" (longer default aligning with cluster window).

3. **Consequence text in message** — Currently no consequence/impact text. Need to source from Impact Engine output (see Section 2).

4. **SlackComposer prompt update** — Update the system prompt for Agent E to produce the new layout. Alternatively, use deterministic message building (extending `buildFallbackSlackMessage`) for the structured parts and only use LLM for the summary line.

#### Implementation Effort: **Low** (1 week)
- Mostly Slack Block Kit formatting changes in `buildFallbackSlackMessage()`
- Button value changes require updates in `slack-interactions.ts` action routing
- Consequence text comes from Impact Engine (dependency on Section 2)

---

### 4) USP Strength Assessment

The recommendations define 6 crisp USP bullets. Here's how each maps to current state:

| USP Bullet | Current State | Gap to "Crisp" |
|---|---|---|
| **Cross-tool delta sync** — "We sync the delta between code, infra, and docs" | ✅ Multi-source signal ingestion (GitHub PR, PagerDuty, Slack, Datadog, IaC). Evidence pack extraction from PR diffs. | ⚠️ Marketing only — the capability exists but isn't surfaced as "delta syncing." Need Coverage Health UI to prove it. |
| **Coverage guarantee** — "We guarantee mapping coverage" | ⚠️ `primaryDocRequired` flag + `DocMappingV2.isPrimary` exist. Doc resolution tracks `needs_mapping`. | ❌ No coverage metric, no guarantee enforcement, no UI showing coverage %. Need DriftPlan + Coverage Health. |
| **Reproducible decisions** — "Every decision is reproducible" | ⚠️ Many pieces exist (docContextSha256, baseRevision, docsResolution blob, baselineFindings). | ❌ Not assembled into formal AuditBundle. No bundle hash endpoint. Can't hand a customer a single hash. |
| **Cluster-first triage** — "We cluster before we notify" | ⚠️ Question clustering exists for Slack. Dedup prevents exact duplicate notifications. | ❌ No drift notification clustering. Every drift = separate Slack DM. |
| **Deterministic safety rails** — "LLM never touches without deterministic proof" | ✅ Baseline checking runs before LLM. 15 validators gate writeback. Evidence binding for auto-approve. | ⚠️ LLM still runs for ALL eligible drifts. Need ComparatorOutcome enum to formally gate LLM invocation. |
| **Impact scoring** — "We score blast radius deterministically" | ✅ Domain impact scores exist. Risky domain escalation exists. | ❌ No impact bands, no consequence templates, no "what breaks" text in notifications. |

**Summary:** 2/6 USPs are strong today, 3/6 have foundations but need surfacing, 1/6 (cluster-first) needs new implementation.

---

### 5) Configuration vs. Custom Code (Avoiding Bespoke Consulting)

**Recommendation:** Everything customer-specific should be configuration, not code. DriftPlans and consequence templates are config packs. The engine, validators, and pipeline are productized code.

#### What's Currently Configurable

| Config Surface | Mechanism | Scope |
|---|---|---|
| Confidence thresholds | `Workspace` model fields | Per-workspace |
| Enabled drift types | `workflowPreferences` JSON | Per-workspace |
| Enabled input sources | `workflowPreferences` JSON | Per-workspace |
| Enabled output targets | `workflowPreferences` JSON | Per-workspace |
| Ownership source ranking | `ownershipSourceRanking[]` | Per-workspace |
| Feature flags | `featureFlags.ts` + env vars | Global + per-env |
| Confluence space allowlist | `allowedConfluenceSpaces[]` | Per-workspace |
| Doc system section priorities | `docTargeting.ts` config | Global (code) |
| Drift matrix | `driftMatrix.ts` config | Global (code) |
| Scoring weights | `scoringWeights.ts` config | Global (code) |

#### What Needs to Become Configurable (Currently Hardcoded)

| Component | Current Location | Target |
|---|---|---|
| **Per-service thresholds** | Global `Workspace` thresholds | DriftPlan per service/repo |
| **Consequence templates** | Does not exist | Config file (JSON/YAML) per workspace |
| **Impact score overrides** | Hardcoded `DOMAIN_IMPACT_SCORES` | DriftPlan overrides |
| **Drift matrix overrides** | Hardcoded `DRIFT_MATRIX` | DriftPlan can override confidence ranges |
| **Clustering window** | Does not exist | Workspace config (default 7 days) |
| **Cluster threshold** | Does not exist | Workspace config (default 3 drifts) |
| **"What breaks" registry** | Does not exist | Config populated from doc mappings + manual entries |

**Key principle:** The engine (state machine, comparator, validators, scoring) stays productized. DriftPlans, templates, and thresholds become the config layer that makes it customer-specific without custom code.


---

## Implementation Roadmap

### Phase 1: Quick Wins (Weeks 1-2) — "Prove the Reframe"

**Goal:** Ship the UX reframe and impact visibility with minimal backend changes.

| Task | Effort | Files Changed | Dependencies |
|---|---|---|---|
| **1.1 Impact Band classification** | 2 days | `scoring/index.ts` — add `classifyImpactBand()` function | None |
| **1.2 Add impact fields to DriftCandidate** | 1 day | `schema.prisma` — add `impactBand`, `firedRules` JSON, `consequenceText` | Migration |
| **1.3 Consequence template config** | 3 days | New `config/consequenceTemplates.ts` with 15-20 templates + fill logic | Impact bands |
| **1.4 "Verify Reality" Slack UX** | 3 days | `slack-composer.ts`, `buildFallbackSlackMessage()` — new Block Kit layout | Consequence templates |
| **1.5 Button text changes** | 1 day | `slack-interactions.ts` — "Approve" → "Mark Verified", "Reject" → "Dispute" | None |

**Deliverable:** Slack messages now show CLAIM / EVIDENCE / CONSEQUENCE with impact band badges. Buttons say "Mark as Verified" instead of "Approve."

**Value:** Immediate positioning shift from "doc bot" to "truth verification system." No backend pipeline changes required.

---

### Phase 2: Control-Plane Foundation (Weeks 3-4) — "DriftPlan + Coverage Health"

**Goal:** Introduce DriftPlan model and basic coverage metrics API.

| Task | Effort | Files Changed | Dependencies |
|---|---|---|---|
| **2.1 DriftPlan Prisma model** | 2 days | `schema.prisma` — new DriftPlan model with service pattern, enabled sources, thresholds, version hash | Migration |
| **2.2 Plan resolution service** | 3 days | New `services/plans/resolver.ts` — given (workspace, service, repo), resolve active DriftPlan | DriftPlan model |
| **2.3 Attach plan_version_hash to drifts** | 1 day | `transitions.ts` — in `handleIngested`, resolve plan and store hash on DriftCandidate | Plan resolver |
| **2.4 Coverage Health API** | 4 days | New `routes/coverage-health.ts` — compute % services mapped, % PRs evaluated, blocked reasons | DriftPlan, DocMappingV2 |
| **2.5 Coverage Health UI (basic)** | 3 days | New `apps/web/src/app/coverage/page.tsx` — dashboard showing coverage metrics | Coverage API |

**Deliverable:** DriftPlan model exists. Every drift links to a plan version. Coverage Health dashboard shows mapping gaps.

**Value:** "Control-plane as product" positioning becomes real. Customers can see coverage guarantees.

---

### Phase 3: Audit Bundle + Reproducibility (Weeks 5-6) — "Trust Primitive"

**Goal:** Formalize audit bundles and make every decision reproducible.

| Task | Effort | Files Changed | Dependencies |
|---|---|---|---|
| **3.1 Prompt hash tracking** | 2 days | `lib/claude.ts` — compute SHA-256 of (systemPrompt + userPrompt), store in response metadata | None |
| **3.2 Validator report persistence** | 2 days | `validators/index.ts` — return structured report; `transitions.ts` stores it on DriftCandidate | Schema change |
| **3.3 AuditBundle assembly service** | 3 days | New `services/audit/bundleAssembler.ts` — assemble bundle from DriftCandidate fields, compute bundle_hash | Prompt hash, validator report |
| **3.4 AuditBundle API endpoint** | 2 days | New `routes/audit-bundle.ts` — GET /api/drifts/:id/audit-bundle returns full bundle | Bundle assembler |
| **3.5 Add auditBundleHash to DriftCandidate** | 1 day | `schema.prisma` — new field; `transitions.ts` computes and stores after PATCH_VALIDATED | Bundle assembler |

**Deliverable:** Every drift has a reproducible audit bundle. API endpoint returns bundle hash + all inputs. Two engineers with same bundle reach same conclusion.

**Value:** "Reproducibility as trust primitive" becomes demonstrable. Sales can show audit trail to enterprise customers.

---

### Phase 4: Cluster-First Notifications (Weeks 7-8) — "Fatigue Reduction"

**Goal:** Aggregate related drifts into clusters before notifying.

| Task | Effort | Files Changed | Dependencies |
|---|---|---|---|
| **4.1 DriftCluster Prisma model** | 1 day | `schema.prisma` — new DriftCluster model with clusterKey, driftIds[], exemplar, status | Migration |
| **4.2 Cluster aggregation service** | 4 days | New `services/clustering/driftClusterer.ts` — reuse question clustering algorithm for drifts | DriftCluster model |
| **4.3 Cluster check in transition** | 2 days | `transitions.ts` — in `handleOwnerResolved`, check if drift belongs to cluster before sending Slack | Cluster service |
| **4.4 Cluster Slack message format** | 2 days | `slack-composer.ts` — new cluster message template with count, exemplar, bulk actions | None |
| **4.5 Cluster bulk action handlers** | 3 days | `slack-interactions.ts` — handle acknowledge_cluster, snooze_cluster, approve_cluster actions | Cluster model |

**Deliverable:** Related drifts (same service + doc + drift_type + 7-day window) aggregate into one cluster notification. Bulk actions work.

**Value:** "Cluster-first triage" USP becomes real. Reduces notification fatigue by 60-80% in typical workloads.

---

### Phase 5: Deterministic Comparator Outcomes (Week 9) — "Truth Engine"

**Goal:** Formalize comparator outcomes and gate LLM invocation.

| Task | Effort | Files Changed | Dependencies |
|---|---|---|---|
| **5.1 ComparatorOutcome enum** | 1 day | New `types/comparator.ts` — define NOT_APPLICABLE, BLOCKED, WATCH, SIGNAL, CRITICAL | None |
| **5.2 Outcome determination logic** | 3 days | `transitions.ts` — in `handleBaselineChecked`, compute outcome based on baseline findings + plan rules | ComparatorOutcome enum |
| **5.3 LLM gating** | 2 days | `transitions.ts` — in `handleDriftClassified`, only invoke drift-triage agent if outcome ≥ SIGNAL | Outcome logic |
| **5.4 Add comparatorOutcome to DriftCandidate** | 1 day | `schema.prisma` — new field; store outcome after baseline check | Migration |

**Deliverable:** Every drift has a deterministic outcome. LLM only runs for SIGNAL/CRITICAL outcomes. All other outcomes are 100% explainable.

**Value:** "Deterministic safety rails" USP becomes provable. Reduces LLM costs by 40-60% and eliminates hallucination risk for low-confidence cases.

---

### Phase 6: Polish + "What Breaks" Registry (Week 10) — "Blast Radius"

**Goal:** Add blast radius hints and finalize consequence templates.

| Task | Effort | Files Changed | Dependencies |
|---|---|---|---|
| **6.1 WhatBreaks config model** | 2 days | New `config/whatBreaks.ts` or lightweight Prisma model — service → dependsOn[], usedByRunbooks[] | None |
| **6.2 Populate from doc mappings** | 2 days | Script to infer dependencies from DocMappingV2 cross-references | WhatBreaks model |
| **6.3 Integrate into consequence templates** | 2 days | `consequenceTemplates.ts` — add blast radius hints to template output | WhatBreaks config |
| **6.4 DriftPlan management UI** | 4 days | New `apps/web/src/app/plans/page.tsx` — CRUD for DriftPlans per service | DriftPlan API |

**Deliverable:** Consequence text includes "affects 3 downstream runbooks" hints. DriftPlan management UI allows per-service configuration.

**Value:** "Impact scoring" USP is complete. Customers can see and configure blast radius.

---

## Effort Summary

| Phase | Duration | Team Size | Key Deliverable |
|---|---|---|---|
| Phase 1: Quick Wins | 2 weeks | 1 backend + 1 frontend | "Verify Reality" Slack UX live |
| Phase 2: Control-Plane | 2 weeks | 1 backend + 1 frontend | DriftPlan + Coverage Health dashboard |
| Phase 3: Audit Bundle | 2 weeks | 1 backend | Reproducible audit bundles with hash |
| Phase 4: Clustering | 2 weeks | 1 backend + 1 frontend | Cluster-first notifications |
| Phase 5: Comparator | 1 week | 1 backend | Deterministic outcome gating |
| Phase 6: Polish | 1 week | 1 backend + 1 frontend | Blast radius + DriftPlan UI |
| **Total** | **10 weeks** | **2 engineers** | **All 6 USPs delivered** |

**Critical path:** Phase 1 → Phase 2 → Phase 3 can run in parallel with Phase 4. Phase 5 can start after Phase 2. Phase 6 depends on all others.

**MVP cutline:** Phases 1-3 deliver the core repositioning (6 weeks). Phases 4-6 add operational polish.


---

## Strategic Architecture Patterns: Transferable Lessons

The following analysis maps architectural patterns from high-trust, high-stakes systems to VertaAI's drift detection domain. While VertaAI's "haystack" is smaller than large-scale data systems, the transferable value lies in **control-plane + reproducibility + coverage accounting + cluster-first fatigue reduction + deterministic comparator**. These patterns directly strengthen drift detection between **input source ↔ output target** without increasing hallucination risk.

---

### What's Directly Applicable to VertaAI

#### 1) "SurveillancePlan" → **DriftPlan** (per workspace × service/repo × doc target)

This is the single most useful architectural pattern.

**Why it matters for VertaAI**

Without a first-class plan object, you get:
* Ad hoc doc resolution ("which page do we compare?")
* Non-reproducible results (hard to debug + no trust)
* Cost/noise blowups (searching too many pages)
* Unclear "coverage" (did we even check the right docs?)

**Your DriftPlan should contain (deterministic + versioned)**

* `workspace_id`
* `scope`: repo/service identifier(s)
* `input_sources_enabled`: github_pr, pagerduty, slack, datadog…
* `output_targets_enabled`: confluence, notion, gitbook, etc.
* **Doc targeting rules** (the critical part):
  * `primary_doc_mapping`: explicit docRef(s)
  * `secondary_doc_candidates`: optional list of docRefs
  * `resolution_strategy`: mapping_only | mapping_then_search | search_only
  * `max_docs_per_run`: e.g. 1–5
  * `allowed_doc_classes`: runbook, api_doc, onboarding, ownership
* `cursors` per source (last PR processed, last Slack window, last incident time)
* `budgets`: max LLM calls, max tokens, max clusters per run
* `noise controls`: rate limits, cooldowns, min cluster size, confidence thresholds
* `audit`: plan version hash attached to every run

**Net effect:** You "productize" doc targeting and prevent the biggest failure mode in your system: **wrong page selection**.

**Current gap:** Today, doc resolution is scattered across `DocMappingV2`, `workflowPreferences`, and `docsResolution` JSON blobs. No single versioned plan object that can be audited, compared, or rolled back.

---

#### 2) EvidenceItem / IngestEvent → **SignalEvent as immutable evidence**

You already have `SignalEvent`. The improvement is to treat it as an immutable "EvidenceItem" with:
* Stable dedupe key
* Provenance (links + extracted snippets)
* Normalization version hash

This makes every drift reproducible: "what did we see, exactly?"

**Current state:** `SignalEvent` exists and is mostly immutable, but lacks:
* Explicit normalization version tracking
* Structured snippet extraction (currently in `evidenceSummary` free text)
* Provenance chain (which webhook → which parser → which version)

**Enhancement needed:** Add `normalizationVersion`, `extractedSnippets` JSON array, `parserVersion` fields to SignalEvent.

---

#### 3) Two-stage retrieval + rerank → **Two-stage Doc Resolution**

This maps cleanly to your "needle in haystack" problem (finding the right Confluence page) and is **high leverage**.

**Stage 1 (cheap, deterministic high recall)**

Given a PR/incident/cluster:
* Use mapping table first
* Then deterministic search using:
  * Repo/service name
  * Tags/labels/domains (deployment/auth/api)
  * Known Confluence space keys
  * Keyword packs from your drift domains
* Return top N doc candidates (N small, like 10–30)

**Stage 2 (expensive, bounded rerank + extraction)**

* Embed only titles + short snippets + headings (not whole docs)
* Rerank top N → select top K (K ≤ 3–5)
* Only then fetch full doc content for those K

**Why this matters**

* Keeps costs bounded
* Improves doc targeting accuracy
* Reduces hallucinations because you feed the LLM only a *small*, relevant doc slice

**Current gap:** Today, `handleDocsResolved` does mapping-first, then search, but doesn't have explicit two-stage bounded retrieval with reranking. The search can return many candidates and all get fetched in `handleDocsFetched`.

**Implementation:** Add `DOCS_SHORTLISTED` state between `DOCS_RESOLVED` and `DOCS_FETCHED`, or enrich `docsResolution` metadata to track candidate scoring and selection justification.

---

#### 4) Cluster-first UX → **Cluster-first drift triage (anti-fatigue)**

This is very transferable and addresses a critical UX problem.

Instead of emitting one Slack message per detected drift, create:
* `DriftCluster`: (service + drift_type + domain + time window + docRef)
* Show:
  * Counts ("7 PRs touched deploy pipeline this week")
  * Exemplar evidence (1–2 PRs)
  * Consolidated recommended action

**Benefit**

* Drastically reduces reviewer fatigue
* Makes your product feel like **risk observability**, not "doc chores"

**Current gap:** Question clustering exists for Slack questions, but drift notifications are one-per-drift. This is the #1 fatigue driver in production.

**Implementation:** See Phase 4 of roadmap. Reuse `questionClusterer.ts` algorithm pattern for drift clustering.

---

#### 5) Baseline / Claim Registry → **Doc Baseline Registry (per docRef + revision)**

In VertaAI, "baseline" is the doc's current asserted truth + structure, not a medical claim.

**Baseline objects you want**

* `DocBaseline`:
  * docRef, revision, extracted structure (headings, owner block, steps lists, key command tokens)
  * last_verified_at, verified_by (human)
  * managed-region offsets + hashes
* `BaselineFacts` (optional but powerful):
  * Canonical owner/team/channel
  * Canonical endpoints/ports/config keys referenced in the doc
  * Canonical "process skeleton" (for process drift)

**Why it matters**

* Makes drift detection less "regex and vibes"
* Gives deterministic comparison anchors per drift type

**Current state:** Baseline checking exists in `handleBaselineChecked()` with pattern matching, but results are ephemeral (stored in `baselineFindings` JSON per drift, not as a reusable baseline registry).

**Enhancement:** Create `DocBaseline` model that persists extracted structure per (docRef, revision). Reuse across multiple drifts targeting the same doc.

---

#### 6) Deterministic Comparator + Policy Engine → **Deterministic drift verdict engine**

This is the "truth-making" concept and is exactly aligned with your "LLM must not decide band" principle.

Your comparator should produce **standard outcomes** like:

* `NOT_APPLICABLE` (wrong doc class/target)
* `BLOCKED` (no mapping / no managed region / doc too large)
* `WATCH` (drift likely but not enough evidence)
* `SIGNAL` (high confidence + high impact + baseline mismatch)
* `CRITICAL` (risky domain + high confidence)

**Rule:** Do not mint "writeback-ready patch" unless:
* docRef resolved deterministically (primary mapping)
* Baseline extracted and mismatch proven
* Validators pass
* Budget + thresholds allow

This gives you enterprise-grade trust *without* enterprise features.

**Current gap:** Today, `driftVerdict` has boolean `hasMatch` and `recommendedAction` strings, but no formal outcome enum. LLM runs for all eligible drifts instead of being gated by deterministic outcome.

**Implementation:** See Phase 5 of roadmap. Add `ComparatorOutcome` enum and gate LLM invocation.

---

#### 7) Coverage accounting → **Coverage Health for drift monitoring**

This is underrated and very useful commercially and operationally.

**Examples:**

* "% of critical services with a primary runbook mapping"
* "% of PRs in infra paths evaluated"
* "Slack drift coverage: channels monitored vs total"
* "PagerDuty coverage: services connected vs total"

If required sources aren't healthy, you generate an **obligation** (not a drift):
* `NEEDS_MAPPING`
* `SOURCE_STALE`
* `INTEGRATION_MISCONFIGURED`

This prevents silent failure and gives you a strong "insurance" narrative.

**Current gap:** No coverage metrics exist. Customers can't see "are we actually monitoring everything we should be?"

**Implementation:** See Phase 2 of roadmap. Coverage Health API + UI dashboard.


---

### What's Not Necessary for MVP (Overkill)

The following patterns from large-scale systems are **not applicable** to VertaAI's current scope:

* **Denominator/exposure service** — Not your domain (medtech-specific)
* **Market-scoped baseline claims** — Medtech regulatory concept, not relevant to doc drift
* **Heavy multi-source ontologies** — You can use lightweight domain packs instead of complex ontology systems

**But you DO want:** plan/versioning, two-stage resolution, cluster-first, baseline registry, deterministic comparator, audit chain.

---

### Concrete Architecture Changes for VertaAI (Minimal, High Impact)

#### A) Add a control plane: `DriftPlan` + `PlanRun`

You likely already have `Workspace` + mappings. Formalize this into a first-class control-plane.

**New tables**

```prisma
model DriftPlan {
  id                    String   @id @default(cuid())
  workspaceId           String
  workspace             Workspace @relation(fields: [workspaceId], references: [id])

  // Scope
  servicePattern        String   // regex or exact match for service/repo names

  // Enabled sources/targets
  inputSourcesEnabled   String[] // subset of: github_pr, pagerduty, slack, datadog, etc.
  outputTargetsEnabled  String[] // subset of: confluence, notion, github_readme, etc.

  // Doc targeting rules
  primaryDocMappings    Json     // { "service-name": "docRef", ... }
  secondaryDocCandidates Json    // { "service-name": ["docRef1", "docRef2"], ... }
  resolutionStrategy    String   // mapping_only | mapping_then_search | search_only
  maxDocsPerRun         Int      @default(3)
  allowedDocClasses     String[] // runbook, api_doc, onboarding, ownership

  // Cursors (last processed positions per source)
  cursors               Json     // { "github_pr": "2024-02-08T10:00:00Z", "pagerduty": "incident_123", ... }

  // Budgets and noise controls
  maxLLMCallsPerRun     Int      @default(50)
  maxTokensPerRun       Int      @default(100000)
  minClusterSize        Int      @default(3)
  clusterWindowDays     Int      @default(7)

  // Thresholds (can override workspace defaults)
  confidenceThresholds  Json?    // { "auto_approve": 0.85, "notify": 0.60, ... }

  // Audit
  planVersionHash       String   // SHA-256 of plan config
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  isActive              Boolean  @default(true)

  @@index([workspaceId, isActive])
  @@index([planVersionHash])
}

model PlanRun {
  id                    String   @id @default(cuid())
  planId                String
  plan                  DriftPlan @relation(fields: [planId], references: [id])

  runStartedAt          DateTime @default(now())
  runCompletedAt        DateTime?
  status                String   // running | completed | failed

  // Metrics
  signalsProcessed      Int      @default(0)
  driftsDetected        Int      @default(0)
  llmCallsUsed          Int      @default(0)
  tokensUsed            Int      @default(0)

  // Coverage
  coverageMetrics       Json     // { "services_evaluated": 5, "docs_checked": 12, ... }

  @@index([planId, runStartedAt])
}
```

**Integration point:** In `handleIngested`, resolve the active DriftPlan for the signal's service/repo and attach `plan_version_hash` to the DriftCandidate.

---

#### B) Split "doc resolution" into a two-stage bounded pipeline

**State-machine enhancement:**

Option 1: Add new state `DOCS_SHORTLISTED` between `DRIFT_CLASSIFIED` and `DOCS_FETCHED`:
```
DRIFT_CLASSIFIED → DOCS_SHORTLISTED → DOCS_RESOLVED → DOCS_FETCHED
```

Option 2: Enrich `docsResolution` metadata in existing `DOCS_RESOLVED` state to include:
```typescript
{
  resolution_method: 'mapping' | 'search' | 'rerank',
  candidate_docs: [
    { docRef: 'CONF-123', score: 0.85, reason: 'primary_mapping' },
    { docRef: 'CONF-456', score: 0.72, reason: 'keyword_match_deployment' },
    ...
  ],
  selected_docs: [
    { docRef: 'CONF-123', justification: 'primary mapping + highest score' }
  ],
  shortlist_count: 10,
  selected_count: 1
}
```

**Implementation:** In `handleDocsResolved`, run Stage 1 (cheap search/mapping) to get top N candidates, then Stage 2 (rerank) to select top K. Only fetch those K in `handleDocsFetched`.

---

#### C) Add `DocBaseline` extraction (once per doc revision)

**New table:**

```prisma
model DocBaseline {
  id                    String   @id @default(cuid())
  workspaceId           String
  workspace             Workspace @relation(fields: [workspaceId], references: [id])

  docRef                String   // e.g., "CONF-123456"
  docSystem             String   // confluence, notion, github_readme, etc.
  revision              String   // Confluence version, GitHub commit SHA, etc.

  // Extracted structure
  headings              Json     // ["Introduction", "Prerequisites", "Deployment Steps", ...]
  ownerBlock            Json?    // { team: "platform", slack: "#platform-oncall", ... }
  processSteps          Json?    // [{ step: 1, text: "Run helm install...", commands: [...] }, ...]
  keyTokens             Json     // { commands: [...], endpoints: [...], ports: [...], flags: [...] }

  // Managed regions
  managedRegions        Json     // [{ start_offset: 100, end_offset: 500, hash: "abc123" }, ...]

  // Verification
  lastVerifiedAt        DateTime?
  verifiedBy            String?  // user ID who verified

  // Metadata
  extractedAt           DateTime @default(now())
  baselineHash          String   // SHA-256 of extracted structure

  @@unique([workspaceId, docRef, revision])
  @@index([workspaceId, docRef])
  @@index([baselineHash])
}
```

**Integration:** In `handleDocsFetched`, after fetching doc content, check if a DocBaseline exists for this (docRef, revision). If not, extract and persist. In `handleBaselineChecked`, load the DocBaseline and compare against evidence.

---

#### D) Add cluster-first triage (especially for Slack + repeated PR patterns)

Instead of spamming Slack per event, aggregate:
* Per docRef per week
* Per drift type per domain

**Implementation:** See Phase 4 of roadmap. Key change is in `handleOwnerResolved`:

```typescript
// Before sending to Slack, check for existing cluster
const clusterKey = computeClusterKey(drift); // (service + docRef + driftType + domain)
const existingCluster = await findOrCreateCluster(clusterKey, drift);

if (existingCluster.count >= MIN_CLUSTER_SIZE && !existingCluster.notifiedAt) {
  // Send ONE cluster notification
  await sendClusterNotification(existingCluster);
} else if (drift.impactBand === 'CRITICAL') {
  // Critical drifts bypass clustering
  await sendIndividualNotification(drift);
} else {
  // Add to cluster, don't notify yet
  await addToCluster(existingCluster, drift);
}
```

---

### How This Strengthens Drift Detection Across Your 5 Drift Types

Here's the "input ↔ output" comparison logic made explicit with the new architecture:

#### 1) Instruction Drift

**Input evidence:** PR diff shows changed command/flag/port/endpoint (or incident notes)

**Output baseline:** `DocBaseline.keyTokens.commands` extracted from managed region

**Comparator logic:**
```typescript
const evidenceCommands = extractCommandsFromPR(signalEvent);
const baselineCommands = docBaseline.keyTokens.commands;

const oldPresent = baselineCommands.filter(cmd => !evidenceCommands.includes(cmd));
const newIndicated = evidenceCommands.filter(cmd => !baselineCommands.includes(cmd));

if (oldPresent.length > 0 && newIndicated.length > 0) {
  outcome = 'SIGNAL'; // Token mismatch detected
  consequenceText = fillTemplate('instruction_deployment', {
    old_command: oldPresent[0],
    new_command: newIndicated[0],
    step_number: findStepNumber(docBaseline, oldPresent[0])
  });
}
```

**Patch:** Replace steps only when evidence is explicit; else note-only.

---

#### 2) Process Drift

**Input evidence:** PR changes workflow gates/order; incident timeline reveals new gates

**Output baseline:** `DocBaseline.processSteps` — ordered steps + decision branches

**Comparator logic:**
```typescript
const evidenceGates = extractGatesFromPR(signalEvent); // ["approval required", "security scan"]
const baselineSteps = docBaseline.processSteps.map(s => s.text);

const missingGates = evidenceGates.filter(gate =>
  !baselineSteps.some(step => step.includes(gate))
);

if (missingGates.length > 0) {
  outcome = 'WATCH'; // High confidence if multiple sources
  consequenceText = fillTemplate('process_missing_gate', {
    missing_gates: missingGates.join(', '),
    process_name: docBaseline.headings[0]
  });
}
```

**Patch:** Usually note-only; reorder only if skeleton is clean + evidence strong.

---

#### 3) Ownership Drift

**Input evidence:** CODEOWNERS, Backstage owner, PagerDuty service owner

**Output baseline:** `DocBaseline.ownerBlock` — extracted owner metadata

**Comparator logic:**
```typescript
const evidenceOwner = extractOwnerFromSignal(signalEvent); // { team: "payments", slack: "#payments" }
const baselineOwner = docBaseline.ownerBlock;

if (evidenceOwner.team !== baselineOwner.team ||
    evidenceOwner.slack !== baselineOwner.slack) {
  outcome = 'SIGNAL'; // Authoritative mismatch
  consequenceText = fillTemplate('ownership_mismatch', {
    old_owner: baselineOwner.team,
    new_owner: evidenceOwner.team,
    escalation_channel: baselineOwner.slack
  });
}
```

**Patch:** Owner block only (tight scope).

---

#### 4) Coverage Drift

**Input evidence:** Slack clusters / repeated incidents

**Output baseline:** Missing scenario keywords/sections in `DocBaseline.headings` or `processSteps`

**Comparator logic:**
```typescript
const clusterKeywords = extractKeywordsFromCluster(slackCluster); // ["timeout", "retry", "connection"]
const baselineHeadings = docBaseline.headings.map(h => h.toLowerCase());

const missingCoverage = clusterKeywords.filter(kw =>
  !baselineHeadings.some(h => h.includes(kw))
);

if (slackCluster.count >= 3 && missingCoverage.length > 0) {
  outcome = 'WATCH'; // Repetition threshold met
  consequenceText = fillTemplate('coverage_gap', {
    question_count: slackCluster.count,
    missing_topics: missingCoverage.join(', '),
    doc_name: docBaseline.headings[0]
  });
}
```

**Patch:** Add FAQ/troubleshooting stub, not huge sections.

---

#### 5) Environment/Tooling Drift

**Input evidence:** CI system replaced; infra toolchain change; alerting platform change

**Output baseline:** `DocBaseline.keyTokens.tools` — doc references tool A

**Comparator logic:**
```typescript
const evidenceTools = detectToolMigrations(signalEvent); // [{ from: "helm", to: "kustomize" }]
const baselineTools = docBaseline.keyTokens.tools; // ["helm", "kubectl"]

const obsoleteTools = evidenceTools.filter(migration =>
  baselineTools.includes(migration.from) && !baselineTools.includes(migration.to)
);

if (obsoleteTools.length > 0) {
  outcome = 'SIGNAL'; // Tool A removed/obsolete
  consequenceText = fillTemplate('tooling_migration', {
    old_tool: obsoleteTools[0].from,
    new_tool: obsoleteTools[0].to,
    affected_steps: findStepsWithTool(docBaseline, obsoleteTools[0].from).length
  });
}
```

**Patch:** Update tool references in constrained sections.

---

### The Key Lesson: Build "Truth" from a Deterministic Chain

What's valuable from high-trust system architectures is the **mindset**:

1. **Plans make runs reproducible and bounded** — Every drift decision traces back to a versioned DriftPlan
2. **Evidence is immutable and attributable** — SignalEvent is the source of truth, never modified
3. **Comparator is deterministic** — LLM only assists extraction/formatting, not decision-making
4. **Clusters reduce fatigue** — Aggregate before notifying, show patterns not noise
5. **Coverage health prevents silent failures** — Know what you're NOT monitoring

**This is exactly how you keep VertaAI trustworthy and scalable across customers *without* turning it into bespoke consulting.**

The engine (state machine, comparator, validators, scoring) stays productized. DriftPlans, consequence templates, and baselines become the config layer that makes it customer-specific without custom code.

---

---

## Deep-Dive Technical Specification: Top 3 High-Leverage Improvements

The following section provides **implementation-level detail** for the three highest-impact changes that transform VertaAI from event-driven drift detection into a deterministic control-plane system. These build on the strategic patterns above with concrete schemas, algorithms, state machine changes, and UI specifications.

---

### Deep-Dive 1: DriftPlan + Coverage Health UI (Control Plane)

#### Why This Matters Technically

Current state: Events flow through a state machine. This works operationally but fails to prove:
* **You're not blind** (coverage accountability)
* **You're reproducible** (plan versioning)
* **You're not bespoke** (config-driven, not custom code per client)

Solution: Introduce a first-class, versioned **DriftPlan** that governs detection, routing, and policy—making the control-plane the product.

---

#### Data Model Changes (Minimal Additions)

**A) DriftPlan Model**

One plan per **workspace × service/repo × doc class** (or per repo for early customers).

```prisma
model DriftPlan {
  id             String   @id @default(uuid())
  workspaceId    String   @index
  workspace      Workspace @relation(fields: [workspaceId], references: [id])

  name           String
  status         String   @default("active") // active|paused|archived

  // Scope definition
  scopeType      String   // repo|service
  scopeRef       String   // repo full_name OR service_id

  // Primary doc mapping (required for writeback)
  primaryDocId   String?  // can exist as "read-only plan" if null
  primaryDocSystem String? // confluence|notion|github_readme|...
  docClass       String   // Operational_Runbook|API_Docs|Onboarding|...

  // Configuration knobs (deterministic)
  inputSources   String[] // github_pr, pagerduty_incident, slack_cluster, datadog_alert...
  driftTypes     String[] // instruction, process, ownership, coverage, environment_tooling
  allowedOutputs String[] // confluence, notion, github_readme...

  // Policy configuration (JSON for flexibility)
  thresholds     Json     // source-specific thresholds (notify/digest/ignore)
  eligibility    Json     // source-specific eligibility filters
  sectionTargets Json     // per output system section patterns
  impactRules    Json     // deterministic impact rules config (see Deep-Dive 2)
  writeback      Json     // managed region markers, max patch lines, etc.

  // Versioning (critical for reproducibility)
  version        Int      @default(1)
  versionHash    String   // SHA-256(stable JSON serialization of config)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([workspaceId, status])
  @@index([versionHash])
  @@unique([workspaceId, scopeType, scopeRef, docClass])
}
```

**B) CoverageSnapshot Model (Periodic Computed Rollup)**

Prevents "hand-wavy" metrics and enables coverage obligations.

```prisma
model CoverageSnapshot {
  id            String   @id @default(uuid())
  workspaceId   String   @index
  workspace     Workspace @relation(fields: [workspaceId], references: [id])
  computedAt    DateTime @default(now())

  // Mapping coverage
  reposTotal              Int
  reposWithPlan           Int
  reposWithPrimaryDoc     Int
  docsWithManagedRegion   Int

  // Processing coverage (7-day window)
  eligibleSignals7d           Int
  processedSignals7d          Int
  blockedNeedsMapping7d       Int
  blockedNoManagedRegion7d    Int
  notifiedSlack7d             Int
  actionedSlack7d             Int

  // Freshness/health per source
  sourceHealth   Json   // { github_pr: { lastSeenAt, failures, stale }, ... }

  @@index([workspaceId, computedAt])
}
```

**C) DriftCandidate Additions (Reproducibility Anchors)**

Add these fields to existing DriftCandidate model:

```prisma
// Add to DriftCandidate model
planId          String?
planVersion     Int?
planVersionHash String?
coverageFlags   String[] @default([]) // e.g., ["BLOCKED_NEEDS_MAPPING", "NO_MANAGED_REGION"]
```

---

#### Plan Resolution Algorithm (Deterministic Selection)

When a SignalEvent is ingested, resolve the governing DriftPlan:

**Resolution order (deterministic, first match wins):**

1. `workspace` + exact `scopeType=repo` + `scopeRef=repoFullName` + `docClass` (if known from signal)
2. `workspace` + `scopeType=repo` + `scopeRef=repoFullName` + any `docClass`
3. `workspace` + `scopeType=service` + service mapping (if service catalog exists)
4. Fallback: workspace default plan (if configured)
5. Else: **BLOCKED_NEEDS_PLAN** (coverage flag set, no processing)

**Implementation location:** `services/plans/resolver.ts`

```typescript
export async function resolveDriftPlan(
  workspaceId: string,
  signal: SignalEvent
): Promise<{ plan: DriftPlan | null; coverageFlags: string[] }> {
  const coverageFlags: string[] = [];

  // Extract scope from signal
  const { repoFullName, serviceId, docClass } = extractScopeFromSignal(signal);

  // Try exact match: workspace + repo + docClass
  if (repoFullName && docClass) {
    const plan = await prisma.driftPlan.findUnique({
      where: {
        workspaceId_scopeType_scopeRef_docClass: {
          workspaceId,
          scopeType: 'repo',
          scopeRef: repoFullName,
          docClass
        },
        status: 'active'
      }
    });
    if (plan) return { plan, coverageFlags };
  }

  // Try repo-level match (any docClass)
  if (repoFullName) {
    const plan = await prisma.driftPlan.findFirst({
      where: {
        workspaceId,
        scopeType: 'repo',
        scopeRef: repoFullName,
        status: 'active'
      }
    });
    if (plan) return { plan, coverageFlags };
  }

  // Try service-level match
  if (serviceId) {
    const plan = await prisma.driftPlan.findFirst({
      where: {
        workspaceId,
        scopeType: 'service',
        scopeRef: serviceId,
        status: 'active'
      }
    });
    if (plan) return { plan, coverageFlags };
  }

  // Fallback to workspace default
  const defaultPlan = await prisma.driftPlan.findFirst({
    where: {
      workspaceId,
      scopeType: 'workspace',
      status: 'active'
    }
  });

  if (defaultPlan) return { plan: defaultPlan, coverageFlags };

  // No plan found - coverage gap
  coverageFlags.push('BLOCKED_NEEDS_PLAN');
  return { plan: null, coverageFlags };
}
```

---

#### Coverage Health Computation (Deterministic)

Run via QStash cron (daily at 00:00 UTC + weekly on Monday):

**Computation logic:**

```typescript
export async function computeCoverageSnapshot(workspaceId: string) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Mapping coverage
  const reposTotal = await countUniqueRepos(workspaceId);
  const reposWithPlan = await prisma.driftPlan.count({
    where: { workspaceId, status: 'active' }
  });
  const reposWithPrimaryDoc = await prisma.driftPlan.count({
    where: { workspaceId, status: 'active', primaryDocId: { not: null } }
  });
  const docsWithManagedRegion = await countDocsWithManagedRegions(workspaceId);

  // Processing coverage (7-day window)
  const eligibleSignals7d = await prisma.signalEvent.count({
    where: { workspaceId, createdAt: { gte: sevenDaysAgo } }
  });
  const processedSignals7d = await prisma.driftCandidate.count({
    where: {
      workspaceId,
      createdAt: { gte: sevenDaysAgo },
      state: { not: 'FAILED' }
    }
  });
  const blockedNeedsMapping7d = await prisma.driftCandidate.count({
    where: {
      workspaceId,
      createdAt: { gte: sevenDaysAgo },
      coverageFlags: { has: 'BLOCKED_NEEDS_MAPPING' }
    }
  });
  const blockedNoManagedRegion7d = await prisma.driftCandidate.count({
    where: {
      workspaceId,
      createdAt: { gte: sevenDaysAgo },
      coverageFlags: { has: 'NO_MANAGED_REGION' }
    }
  });

  // Notification/action coverage
  const notifiedSlack7d = await prisma.driftCandidate.count({
    where: {
      workspaceId,
      createdAt: { gte: sevenDaysAgo },
      slackMessageId: { not: null }
    }
  });
  const actionedSlack7d = await prisma.approval.count({
    where: {
      workspaceId,
      createdAt: { gte: sevenDaysAgo }
    }
  });

  // Source health
  const sourceHealth = await computeSourceHealth(workspaceId);

  return await prisma.coverageSnapshot.create({
    data: {
      workspaceId,
      reposTotal,
      reposWithPlan,
      reposWithPrimaryDoc,
      docsWithManagedRegion,
      eligibleSignals7d,
      processedSignals7d,
      blockedNeedsMapping7d,
      blockedNoManagedRegion7d,
      notifiedSlack7d,
      actionedSlack7d,
      sourceHealth
    }
  });
}
```

**Critical: Coverage Obligations**

If coverage metrics fall below thresholds, generate internal obligations:

```typescript
if (reposWithPrimaryDoc / reposTotal < 0.70) {
  createObligation({
    type: 'COVERAGE_GAP',
    severity: 'high',
    message: `You are blind on ${reposTotal - reposWithPrimaryDoc} repos (no primary doc mapping).`
  });
}

if (blockedNeedsMapping7d > 10) {
  createObligation({
    type: 'MAPPING_BACKLOG',
    severity: 'medium',
    message: `${blockedNeedsMapping7d} drifts blocked in last 7 days due to missing mappings.`
  });
}
```

This is a **huge value prop** that internal scripts cannot easily replicate.


---

#### UI / Product Surfaces

You don't need complicated UI now; you need **control + trust**.

**Required Pages:**

1. **`/plans`** — List all DriftPlans (active/paused/archived)
   - Table: Name, Scope (repo/service), Primary Doc, Status, Last Run, Drifts (7d)
   - Actions: Create Plan, Edit, Pause, Archive

2. **`/plans/[id]`** — Plan details
   - Scope configuration
   - Input sources enabled
   - Drift types monitored
   - Primary doc mapping + managed regions
   - Thresholds and eligibility rules
   - Recent drifts for this plan
   - Plan version history (with version hash)

3. **`/coverage`** — Coverage Health Dashboard
   - Hero metrics: Mapping Coverage %, Processing Coverage %, Action Rate %
   - Blocked reasons breakdown (needs mapping, no managed region, stale source)
   - Source health status (last webhook seen, failure count, stale flag)
   - Coverage obligations (alerts for gaps)
   - Top unmapped repos (call-to-action)

**Must-Have Widgets:**

| Widget | Metric | Threshold | Action |
|---|---|---|---|
| **Mapping Coverage** | `reposWithPrimaryDoc / reposTotal` | < 70% = warning | "Map repos" CTA |
| **Processing Coverage** | `processedSignals7d / eligibleSignals7d` | < 80% = warning | "Review blocked" |
| **Blocked Reasons** | Count by coverage flag | > 10 in 7d = alert | "Fix mappings" |
| **Source Health** | Last webhook timestamp per source | > 24h = stale | "Check integration" |
| **Action Rate** | `actionedSlack7d / notifiedSlack7d` | < 30% = fatigue | "Review UX/thresholds" |

**Implementation:** Next.js pages in `apps/web/src/app/` with API routes in `apps/api/src/routes/coverage-health.ts` and `apps/api/src/routes/plans.ts`.

---

### Deep-Dive 2: Impact Engine (Deterministic Consequence Scoring)

#### Goal

You already detect **drift**. Now compute **impact** without LLM hallucination.

**Output per drift:**
- `impact_band`: low | medium | high | critical
- `impact_score`: 0.0 to 1.0
- `impact_reasons`: list of fired rules (human-readable)
- `consequence_text`: deterministic template-filled text

This transforms positioning from "doc maintenance" to "insurance/performance tool."

---

#### Schema Changes

**ImpactAssessment Type**

Attach to DriftCandidate and PatchProposal as JSON field.

```typescript
type ImpactBand = "low" | "medium" | "high" | "critical";

interface ImpactReason {
  ruleId: string;
  message: string;
  weight: number;
}

interface ImpactAssessment {
  impactScore: number;           // 0.0 to 1.0
  impactBand: ImpactBand;
  reasons: ImpactReason[];
  consequenceText: string;       // deterministic templated text
  blastRadius: "service" | "repo" | "org";
  computedAt: string;            // ISO timestamp
}
```

**Database Fields (add to DriftCandidate and PatchProposal):**

```prisma
// Add to DriftCandidate model
impactJson      Json?    // ImpactAssessment object

// Add to PatchProposal model
impactJson      Json?    // ImpactAssessment object (copied from drift or recomputed)
```

---

#### Deterministic Inputs to Impact (No LLM)

Use only non-hallucinated signals already available:

**Available Inputs:**
- `drift_type`: instruction | process | ownership | coverage | environment_tooling
- `domains[]`: rollback, auth, deploy, infra, config, api, observability, data_migrations, etc.
- `doc_class`: Operational_Runbook | API_Docs | Onboarding | Architecture | ...
- `evidence_strength`: from existing scoring system
- `source_type`: github_pr | pagerduty_incident | slack_cluster | datadog_alert | ...
- **PR metadata**: paths changed, breaking keywords detected
- **Baseline findings**: matches of old tokens/sections in doc (from `baselineFindings` JSON)
- **Managed region present?**: boolean from doc fetch
- **Primary doc mapped?**: boolean from plan resolution

**No LLM needed** — all inputs are deterministic.

---

#### Impact Rules Registry (Config-Driven)

Implement as a rule registry in `config/impactRules.ts`:

```typescript
interface ImpactRuleCondition {
  driftType?: string[];
  domainsAny?: string[];
  docClassAny?: string[];
  sourceTypeAny?: string[];
  prPathsAny?: string[];        // regex patterns
  keywordsAny?: string[];       // from evidence extraction
  baselineMatchAny?: string[];  // baseline pattern IDs
  evidenceStrength?: { min?: number; max?: number };
}

interface ImpactRule {
  id: string;
  when: ImpactRuleCondition;
  weight: number;               // additive contribution to impact score
  message: string;              // human-readable reason
}

export const IMPACT_RULES: ImpactRule[] = [
  // Critical domain rules
  {
    id: 'DOMAIN_ROLLBACK',
    when: { domainsAny: ['rollback'] },
    weight: 0.25,
    message: 'Affects rollback procedures (high-risk domain)'
  },
  {
    id: 'DOMAIN_AUTH',
    when: { domainsAny: ['auth', 'authentication', 'authorization'] },
    weight: 0.25,
    message: 'Affects authentication/authorization (security-critical)'
  },
  {
    id: 'DOMAIN_DATA_MIGRATIONS',
    when: { domainsAny: ['data_migrations', 'schema_changes'] },
    weight: 0.25,
    message: 'Affects data migrations (irreversible operations)'
  },

  // Drift type + doc class combinations
  {
    id: 'INSTRUCTION_RUNBOOK',
    when: {
      driftType: ['instruction'],
      docClassAny: ['Operational_Runbook']
    },
    weight: 0.20,
    message: 'Instruction drift in operational runbook (responder confusion risk)'
  },
  {
    id: 'OWNERSHIP_RUNBOOK',
    when: {
      driftType: ['ownership'],
      docClassAny: ['Operational_Runbook']
    },
    weight: 0.18,
    message: 'Ownership drift in runbook (escalation routing risk)'
  },

  // Infrastructure path changes
  {
    id: 'INFRA_PATH_CHANGE',
    when: {
      prPathsAny: [
        '\\.github/workflows/.*',
        'deploy/.*',
        'terraform/.*',
        'k8s/.*',
        'infrastructure/.*'
      ]
    },
    weight: 0.15,
    message: 'Infrastructure/deployment path changed'
  },

  // Baseline match (doc definitely contains old reference)
  {
    id: 'BASELINE_MATCH_FOUND',
    when: { baselineMatchAny: ['command_match', 'endpoint_match', 'port_match'] },
    weight: 0.20,
    message: 'Doc contains outdated reference confirmed by baseline check'
  },

  // High-severity incident source
  {
    id: 'PAGERDUTY_HIGH_SEVERITY',
    when: {
      sourceTypeAny: ['pagerduty_incident'],
      // Additional check in code: incident.severity in ['P0', 'P1', 'P2']
    },
    weight: 0.20,
    message: 'Triggered by high-severity incident (P0-P2)'
  },

  // Slack cluster with high volume
  {
    id: 'SLACK_CLUSTER_HIGH_VOLUME',
    when: {
      sourceTypeAny: ['slack_cluster'],
      // Additional check in code: cluster.messageCount >= 5 && cluster.uniqueAskers >= 3
    },
    weight: 0.10,
    message: 'Repeated questions from multiple engineers (coverage gap)'
  },

  // Breaking change keywords
  {
    id: 'BREAKING_CHANGE_KEYWORDS',
    when: {
      keywordsAny: ['breaking', 'deprecated', 'removed', 'replaced', 'migration required']
    },
    weight: 0.15,
    message: 'Breaking change detected in evidence'
  },

  // Process drift with workflow changes
  {
    id: 'PROCESS_WORKFLOW_CHANGE',
    when: {
      driftType: ['process'],
      prPathsAny: ['\\.github/workflows/.*', 'Jenkinsfile', '\\.gitlab-ci\\.yml']
    },
    weight: 0.18,
    message: 'Process drift with CI/CD workflow changes'
  }
];
```

---

#### Impact Computation Algorithm

```typescript
export function computeImpact(
  drift: DriftCandidate,
  signal: SignalEvent,
  baseline: BaselineFindings | null
): ImpactAssessment {
  const reasons: ImpactReason[] = [];
  let totalWeight = 0;

  // Evaluate each rule
  for (const rule of IMPACT_RULES) {
    if (ruleMatches(rule.when, drift, signal, baseline)) {
      reasons.push({
        ruleId: rule.id,
        message: rule.message,
        weight: rule.weight
      });
      totalWeight += rule.weight;
    }
  }

  // Clamp score to [0, 0.95] (never 1.0 to indicate some uncertainty)
  const impactScore = Math.min(totalWeight, 0.95);

  // Classify into band
  const impactBand: ImpactBand =
    impactScore >= 0.75 ? 'critical' :
    impactScore >= 0.55 ? 'high' :
    impactScore >= 0.35 ? 'medium' : 'low';

  // Determine blast radius
  const blastRadius = determineBlastRadius(drift, signal);

  // Generate consequence text (deterministic template)
  const consequenceText = generateConsequenceText(
    drift.driftType,
    impactBand,
    drift.driftDomains,
    signal,
    baseline
  );

  return {
    impactScore,
    impactBand,
    reasons,
    consequenceText,
    blastRadius,
    computedAt: new Date().toISOString()
  };
}

function ruleMatches(
  condition: ImpactRuleCondition,
  drift: DriftCandidate,
  signal: SignalEvent,
  baseline: BaselineFindings | null
): boolean {
  // Drift type check
  if (condition.driftType && !condition.driftType.includes(drift.driftType)) {
    return false;
  }

  // Domain check (any match)
  if (condition.domainsAny) {
    const hasMatch = condition.domainsAny.some(domain =>
      drift.driftDomains.includes(domain)
    );
    if (!hasMatch) return false;
  }

  // Doc class check
  if (condition.docClassAny) {
    const docClass = extractDocClass(drift);
    if (!condition.docClassAny.includes(docClass)) return false;
  }

  // Source type check
  if (condition.sourceTypeAny && !condition.sourceTypeAny.includes(signal.sourceType)) {
    return false;
  }

  // PR paths check (regex match)
  if (condition.prPathsAny && signal.sourceType === 'github_pr') {
    const prData = signal.normalizedData as GitHubPRData;
    const hasMatch = condition.prPathsAny.some(pattern => {
      const regex = new RegExp(pattern);
      return prData.filesChanged?.some(file => regex.test(file.path));
    });
    if (!hasMatch) return false;
  }

  // Keywords check (from evidence extraction)
  if (condition.keywordsAny) {
    const evidenceText = drift.evidenceSummary?.toLowerCase() || '';
    const hasMatch = condition.keywordsAny.some(keyword =>
      evidenceText.includes(keyword.toLowerCase())
    );
    if (!hasMatch) return false;
  }

  // Baseline match check
  if (condition.baselineMatchAny && baseline) {
    const hasMatch = condition.baselineMatchAny.some(patternId =>
      baseline.matches?.some(m => m.patternId === patternId)
    );
    if (!hasMatch) return false;
  }

  // Evidence strength check
  if (condition.evidenceStrength) {
    const strength = drift.confidence || 0;
    if (condition.evidenceStrength.min && strength < condition.evidenceStrength.min) {
      return false;
    }
    if (condition.evidenceStrength.max && strength > condition.evidenceStrength.max) {
      return false;
    }
  }

  return true;
}
```

---

#### Consequence Templates (No LLM)

Based on `drift_type` + `impact_band`, generate deterministic text:

```typescript
const CONSEQUENCE_TEMPLATES: Record<string, Record<ImpactBand, string>> = {
  instruction: {
    critical: "CRITICAL: Runbook instructions are likely incorrect. During an incident, responders may execute invalid commands/config, causing service degradation or data loss. Fix required before next on-call rotation.",
    high: "HIGH: Runbook instructions likely outdated. Responders may lose time following incorrect steps during incidents, increasing MTTR.",
    medium: "MEDIUM: Runbook may contain outdated instructions. Review recommended to prevent responder confusion.",
    low: "LOW: Minor instruction drift detected. Low risk but should be reviewed for accuracy."
  },

  ownership: {
    critical: "CRITICAL: Ownership/escalation routing is incorrect. High-severity incidents may be routed to wrong team, significantly increasing MTTA.",
    high: "HIGH: Ownership information is outdated. Escalations may route to incorrect team, increasing mean-time-to-acknowledge.",
    medium: "MEDIUM: Ownership drift detected. May cause minor delays in incident escalation.",
    low: "LOW: Ownership information may be outdated. Low impact on escalation flow."
  },

  process: {
    critical: "CRITICAL: Runbook procedure order diverges from current workflow gates. Following documented process may bypass required approvals or checks.",
    high: "HIGH: Process drift detected. Documented workflow may not match current gates/approvals, increasing MTTR and compliance risk.",
    medium: "MEDIUM: Process documentation may be outdated. Review recommended to align with current workflow.",
    low: "LOW: Minor process drift. Low risk but should be reviewed."
  },

  coverage: {
    critical: "CRITICAL: Recurring high-severity scenario lacks documented guidance. Repeated incidents causing significant responder interruption.",
    high: "HIGH: Repeated questions/incidents indicate missing documentation. Causes ongoing responder interruption and knowledge loss.",
    medium: "MEDIUM: Coverage gap detected. Multiple engineers asking similar questions, indicating documentation need.",
    low: "LOW: Potential coverage gap. Monitor for recurrence."
  },

  environment_tooling: {
    critical: "CRITICAL: Docs reference replaced/deprecated tooling. Responders following runbook will use wrong tools, causing failures.",
    high: "HIGH: Tooling drift detected. Documentation references outdated tools/commands, increasing error risk.",
    medium: "MEDIUM: Environment/tooling may have changed. Review docs for outdated tool references.",
    low: "LOW: Minor tooling drift. Low risk but should be reviewed."
  }
};

function generateConsequenceText(
  driftType: string,
  impactBand: ImpactBand,
  domains: string[],
  signal: SignalEvent,
  baseline: BaselineFindings | null
): string {
  // Get base template
  const baseText = CONSEQUENCE_TEMPLATES[driftType]?.[impactBand] ||
    `${impactBand.toUpperCase()}: Documentation drift detected.`;

  // Optionally enrich with deterministic specifics from evidence
  const enrichments: string[] = [];

  // Add specific command/port/endpoint changes if detected
  if (baseline?.matches) {
    const commandMatch = baseline.matches.find(m => m.patternId === 'command_match');
    if (commandMatch && signal.sourceType === 'github_pr') {
      const prData = signal.normalizedData as any;
      const newCommand = extractNewCommand(prData);
      if (newCommand) {
        enrichments.push(`Detected change: ${commandMatch.oldValue} → ${newCommand}`);
      }
    }
  }

  // Add affected domains
  if (domains.length > 0) {
    enrichments.push(`Affected areas: ${domains.join(', ')}`);
  }

  return enrichments.length > 0
    ? `${baseText}\n\n${enrichments.join('\n')}`
    : baseText;
}
```


---

#### State Machine Integration

Add `IMPACT_ASSESSED` state after baseline check, before patch planning:

**Current flow:**
```
BASELINE_CHECKED → PATCH_PLANNED → PATCH_GENERATED
```

**New flow:**
```
BASELINE_CHECKED → IMPACT_ASSESSED → PATCH_PLANNED → PATCH_GENERATED
```

Or for alert-only mode:
```
BASELINE_CHECKED → IMPACT_ASSESSED → OWNER_RESOLVED → SLACK_SENT
```

**Implementation in `transitions.ts`:**

```typescript
async function handleBaselineChecked(drift: DriftCandidate): Promise<StateTransition> {
  // ... existing baseline check logic ...

  // Transition to impact assessment
  return {
    nextState: 'IMPACT_ASSESSED',
    updates: { baselineFindings: findings }
  };
}

async function handleImpactAssessed(drift: DriftCandidate): Promise<StateTransition> {
  // Load signal and baseline
  const signal = await prisma.signalEvent.findUnique({
    where: { id: drift.signalEventId }
  });
  const baseline = drift.baselineFindings as BaselineFindings | null;

  // Compute impact (deterministic, no LLM)
  const impactAssessment = computeImpact(drift, signal, baseline);

  // Store impact
  await prisma.driftCandidate.update({
    where: { id: drift.id },
    data: { impactJson: impactAssessment }
  });

  // Decide next state based on impact band and plan config
  const plan = await resolveDriftPlan(drift.workspaceId, signal);

  if (impactAssessment.impactBand === 'critical' ||
      (impactAssessment.impactBand === 'high' && plan?.writeback?.enabled)) {
    // High/critical impact → proceed to patch planning
    return { nextState: 'PATCH_PLANNED', updates: { impactJson: impactAssessment } };
  } else {
    // Medium/low impact → skip to notification (verify reality UX)
    return { nextState: 'OWNER_RESOLVED', updates: { impactJson: impactAssessment } };
  }
}
```

---

### Deep-Dive 3: Slack UX — "Verify Reality" (Instead of "Review Doc Diff")

#### The Intent

Reduce fatigue and reframe from "documentation chore" to "risk verification."

You still can support patch diffs later, but the default Slack interaction is:

**Claim → Evidence → Impact → Action**

Engineers don't need to read a unified diff. They just confirm:
* "Yes, doc is wrong" or "No, not applicable"

Only if they click "Generate patch" do you spawn patch generation.

This aligns with the critique about "doc PR fatigue."

---

#### Slack Message Structure (Deterministic Blocks)

**Block Layout:**

1. **Header**: "⚡ Potential Drift Detected (High Impact)"
2. **Claim** (from doc baseline extraction):
   - "Runbook says: DB port = 5432"
3. **Evidence** (from PR / incident / cluster):
   - "PR #542 changed: DB port = 5433"
4. **Consequence** (from Impact Engine):
   - "HIGH: Recovery script may fail during failover"
5. **Actions**:
   - ✅ "Verified: update needed"
   - ❌ "False positive"
   - 🧭 "Needs mapping" (if blocked)
   - 📝 "Generate patch" (optional)
   - 💤 "Snooze 7d"

**Implementation in `slack-composer.ts`:**

```typescript
export function buildVerifyRealityMessage(
  drift: DriftCandidate,
  signal: SignalEvent,
  impact: ImpactAssessment,
  baseline: BaselineFindings | null
): SlackMessageBlocks {
  const blocks: Block[] = [];

  // 1. Header with impact band
  const impactEmoji = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢'
  }[impact.impactBand];

  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `${impactEmoji} Potential Drift Detected (${impact.impactBand.toUpperCase()} Impact)`
    }
  });

  // 2. Claim section (what doc currently says)
  const claim = extractClaimFromBaseline(baseline, drift);
  if (claim) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*📄 Current Documentation Claims:*\n${claim}`
      }
    });
  }

  // 3. Evidence section (what changed in reality)
  const evidence = extractEvidenceFromSignal(signal, drift);
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*🔍 Evidence from ${formatSourceType(signal.sourceType)}:*\n${evidence}`
    }
  });

  // 4. Consequence section (deterministic impact text)
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*⚠️ Consequence:*\n${impact.consequenceText}`
    }
  });

  // 5. Impact reasons (fired rules)
  if (impact.reasons.length > 0) {
    const reasonsText = impact.reasons
      .map(r => `• ${r.message} (+${(r.weight * 100).toFixed(0)}%)`)
      .join('\n');
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `*Impact factors:*\n${reasonsText}`
      }]
    });
  }

  blocks.push({ type: 'divider' });

  // 6. Action buttons
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '✅ Verified: Update Needed' },
        style: 'primary',
        value: JSON.stringify({ action: 'verify_true', driftId: drift.id })
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '❌ False Positive' },
        style: 'danger',
        value: JSON.stringify({ action: 'verify_false', driftId: drift.id })
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '📝 Generate Patch' },
        value: JSON.stringify({ action: 'generate_patch', driftId: drift.id })
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '💤 Snooze 7d' },
        value: JSON.stringify({ action: 'snooze', driftId: drift.id, days: 7 })
      }
    ]
  });

  // 7. Context footer
  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `Drift ID: ${drift.id.slice(0, 8)} | Confidence: ${(drift.confidence * 100).toFixed(0)}% | Impact Score: ${(impact.impactScore * 100).toFixed(0)}%`
    }]
  });

  return { blocks };
}

function extractClaimFromBaseline(
  baseline: BaselineFindings | null,
  drift: DriftCandidate
): string | null {
  if (!baseline?.matches || baseline.matches.length === 0) {
    return null;
  }

  // Extract specific claims based on drift type
  const claims: string[] = [];

  for (const match of baseline.matches) {
    if (match.patternId === 'command_match') {
      claims.push(`Command: \`${match.oldValue}\``);
    } else if (match.patternId === 'endpoint_match') {
      claims.push(`Endpoint: \`${match.oldValue}\``);
    } else if (match.patternId === 'port_match') {
      claims.push(`Port: \`${match.oldValue}\``);
    } else if (match.patternId === 'owner_match') {
      claims.push(`Owner: ${match.oldValue}`);
    }
  }

  return claims.length > 0 ? claims.join('\n') : null;
}

function extractEvidenceFromSignal(
  signal: SignalEvent,
  drift: DriftCandidate
): string {
  const evidence: string[] = [];

  if (signal.sourceType === 'github_pr') {
    const prData = signal.normalizedData as any;
    evidence.push(`PR #${prData.number}: ${prData.title}`);
    evidence.push(`Author: @${prData.author}`);

    // Extract specific changes
    if (drift.evidenceSummary) {
      evidence.push(`\nChanges detected:\n${drift.evidenceSummary}`);
    }

    evidence.push(`\n<${prData.url}|View PR>`);
  } else if (signal.sourceType === 'pagerduty_incident') {
    const incidentData = signal.normalizedData as any;
    evidence.push(`Incident: ${incidentData.title}`);
    evidence.push(`Severity: ${incidentData.severity}`);
    evidence.push(`\n<${incidentData.url}|View Incident>`);
  } else if (signal.sourceType === 'slack_cluster') {
    const clusterData = signal.normalizedData as any;
    evidence.push(`${clusterData.messageCount} questions from ${clusterData.uniqueAskers} engineers`);
    evidence.push(`Representative: "${clusterData.representativeQuestion}"`);
  }

  return evidence.join('\n');
}
```

---

#### Slack Action Handling (State Updates)

Add new states for reality verification:

**New states:**
- `AWAITING_VERIFICATION` (after Slack sent)
- `VERIFIED_TRUE` (user confirmed drift is real)
- `VERIFIED_FALSE` (user marked as false positive)
- `PATCH_REQUESTED` (user clicked "Generate patch")

**State transitions:**

```
SLACK_SENT → AWAITING_VERIFICATION

User clicks:
  "Verified: update needed" → VERIFIED_TRUE
  "False positive" → VERIFIED_FALSE
  "Generate patch" → PATCH_REQUESTED
  "Snooze 7d" → SNOOZED (existing)
```

Then:
```
PATCH_REQUESTED → PATCH_PLANNED → PATCH_GENERATED → PATCH_VALIDATED
VERIFIED_TRUE → (create obligation/ticket if no writeback enabled)
VERIFIED_FALSE → COMPLETED (with reason logged)
```

**Implementation in `slack-interactions.ts`:**

```typescript
export async function handleSlackAction(payload: SlackActionPayload) {
  const { action, driftId } = JSON.parse(payload.actions[0].value);

  const drift = await prisma.driftCandidate.findUnique({
    where: { id: driftId }
  });

  if (!drift) {
    return { error: 'Drift not found' };
  }

  switch (action) {
    case 'verify_true':
      await prisma.driftCandidate.update({
        where: { id: driftId },
        data: {
          state: 'VERIFIED_TRUE',
          verifiedBy: payload.user.id,
          verifiedAt: new Date()
        }
      });

      // Log approval
      await prisma.approval.create({
        data: {
          workspaceId: drift.workspaceId,
          driftCandidateId: driftId,
          approvedBy: payload.user.id,
          decision: 'verified_true',
          reason: 'User confirmed drift is real'
        }
      });

      // Update Slack message
      await updateSlackMessage(drift.slackMessageId, {
        text: '✅ Verified as real drift. Obligation created.'
      });

      // Create obligation if writeback not enabled
      const plan = await resolveDriftPlan(drift.workspaceId, drift.signalEventId);
      if (!plan?.writeback?.enabled) {
        await createObligation({
          type: 'VERIFIED_DRIFT',
          driftId,
          severity: drift.impactJson?.impactBand || 'medium',
          message: `Verified drift requires manual doc update: ${drift.docRef}`
        });
      }
      break;

    case 'verify_false':
      await prisma.driftCandidate.update({
        where: { id: driftId },
        data: {
          state: 'VERIFIED_FALSE',
          verifiedBy: payload.user.id,
          verifiedAt: new Date()
        }
      });

      await prisma.approval.create({
        data: {
          workspaceId: drift.workspaceId,
          driftCandidateId: driftId,
          approvedBy: payload.user.id,
          decision: 'false_positive',
          reason: 'User marked as false positive'
        }
      });

      await updateSlackMessage(drift.slackMessageId, {
        text: '❌ Marked as false positive. No action needed.'
      });
      break;

    case 'generate_patch':
      await prisma.driftCandidate.update({
        where: { id: driftId },
        data: {
          state: 'PATCH_REQUESTED',
          patchRequestedBy: payload.user.id,
          patchRequestedAt: new Date()
        }
      });

      // Trigger patch generation workflow
      await queueStateTransition(driftId);

      await updateSlackMessage(drift.slackMessageId, {
        text: '📝 Patch generation requested. Will notify when ready for review.'
      });
      break;

    case 'snooze':
      const snoozeDays = JSON.parse(payload.actions[0].value).days || 7;
      const snoozeUntil = new Date();
      snoozeUntil.setDate(snoozeUntil.getDate() + snoozeDays);

      await prisma.driftCandidate.update({
        where: { id: driftId },
        data: {
          state: 'SNOOZED',
          snoozedUntil: snoozeUntil,
          snoozedBy: payload.user.id
        }
      });

      await updateSlackMessage(drift.slackMessageId, {
        text: `💤 Snoozed for ${snoozeDays} days. Will re-notify on ${snoozeUntil.toLocaleDateString()}.`
      });
      break;
  }

  return { ok: true };
}
```

---

#### Token Use Reduction (and Hallucination Reduction)

With "verify reality first", you avoid LLM patching for most events.

**LLM calls become conditional:**

| Stage | Current Behavior | New Behavior | Token Savings |
|---|---|---|---|
| **Drift classification** | LLM for all eligible drifts | Can be partially replaced by deterministic parsers | ~30-40% |
| **Patch planning** | LLM for all drifts | Only on "Generate patch" click OR high/critical impact | ~60-70% |
| **Patch generation** | LLM for all patches | Only on explicit user request | ~60-70% |

**Overall token reduction: 40-60%** while **eliminating hallucination risk for low-confidence cases**.

---

### How These 3 Strengthen "Input ↔ Output Comparison" Deterministically

**Current perception risk:**
> "LLM thinks docs are outdated."

**With these upgrades:**

1. **Plan says we monitor X** (DriftPlan with version hash)
2. **Baseline extraction found doc claim A** (deterministic pattern matching)
3. **Evidence from source says B** (immutable SignalEvent)
4. **Comparator says mismatch** (deterministic rule evaluation)
5. **Impact engine says consequence high** (fired rules + template)
6. **Slack asks to verify reality** (claim/evidence/consequence UX)
7. **Optional: patch only after verification** (gated LLM invocation)

This is a **robust "truth pipeline"** and a strong rebuttal to:

> "We already built an internal LLM for this."

They probably did NOT build:
- Coverage obligations
- Reproducible plan versioning
- Deterministic impact scoring with fired rules
- Verification-first UX with gated patching

---

### Minimal Architecture Delta Summary (What You Actually Need to Change)

#### Add/Extend Database Objects

| Object | Type | Purpose |
|---|---|---|
| **DriftPlan** | New table | Control-plane config per workspace × scope |
| **CoverageSnapshot** | New table | Periodic coverage metrics rollup |
| **DriftCandidate** | Add fields | `planId`, `planVersionHash`, `coverageFlags[]`, `impactJson`, `verifiedBy`, `verifiedAt` |
| **PatchProposal** | Add field | `impactJson` (copied from drift) |

#### Add One State

**`IMPACT_ASSESSED`** — Compute impact after baseline check, before patch planning

Or compute inside `BASELINE_CHECKED` and store in `impactJson` field.

#### Change Slack Behavior

| Current | New |
|---|---|
| Default message = diff preview + approve/reject | Default message = claim/evidence/consequence + verify/false-positive/generate-patch |
| Patch generation always triggered | Patch generation triggered by user action OR high/critical impact |
| "Approve" button | "Verified: update needed" button |
| "Reject" button | "False positive" button |
| Snooze 48h | Snooze 7d (aligns with cluster window) |

#### Add Services/Config

| File | Purpose |
|---|---|
| `services/plans/resolver.ts` | Deterministic plan resolution algorithm |
| `services/coverage/snapshot.ts` | Coverage metrics computation |
| `config/impactRules.ts` | Impact rule registry (config-driven) |
| `services/impact/engine.ts` | Impact computation algorithm |
| `config/consequenceTemplates.ts` | Deterministic consequence text templates |

#### UI Pages

| Route | Purpose |
|---|---|
| `/plans` | List DriftPlans |
| `/plans/[id]` | Plan details + version history |
| `/coverage` | Coverage Health dashboard |

---

## Conclusion

VertaAI has **strong foundations** for becoming a control-plane + truth-making system. The 18-state machine, evidence extraction, baseline checking, and validators are solid primitives. The gaps are primarily in:

1. **Formalization** — DriftPlan, ComparatorOutcome, AuditBundle, DriftCluster as first-class models
2. **Surfacing** — Coverage Health UI, impact bands, consequence templates visible to users
3. **Aggregation** — Cluster-first notifications to reduce fatigue
4. **Gating** — LLM invocation only for SIGNAL/CRITICAL outcomes or explicit user request

The **3 deep-dive improvements** (DriftPlan + Coverage Health, Impact Engine, Verify Reality UX) deliver the highest leverage with minimal architecture changes:

**Effort estimate:**
- **DriftPlan + Coverage Health**: 2 weeks (1 backend + 1 frontend)
- **Impact Engine**: 1.5 weeks (1 backend)
- **Verify Reality Slack UX**: 1 week (1 backend)
- **Total: 4-5 weeks** for core transformation

**MVP cutline:** All 3 improvements are essential and should ship together. They form a cohesive "truth verification system" narrative.

The 10-week roadmap from earlier sections delivers all 6 USPs with additional polish:
* **Weeks 1-2:** UX reframe (immediate positioning shift)
* **Weeks 3-4:** Control-plane foundation (DriftPlan + Coverage Health)
* **Weeks 5-6:** Reproducibility (AuditBundle)
* **Weeks 7-8:** Fatigue reduction (clustering)
* **Weeks 9-10:** Truth engine + blast radius

The strategic architecture patterns from high-trust systems map cleanly to VertaAI's drift detection domain and provide a proven blueprint for building enterprise-grade trust without enterprise complexity.


---

## Appendix A: Implementation-Level Detail (Part 2)

This section provides production-ready code specifications for the 3 core improvements, including exact state machine changes, Slack Bolt integration, and build order.

---

### A.1 State Machine Changes (Minimal Delta)

#### New States

Add these states to the existing 18-state machine (or fold into existing with explicit status fields):

| State | Purpose | Terminal? |
|---|---|---|
| `IMPACT_ASSESSED` | Impact engine has computed impact band + consequence | No |
| `SLACK_SENT_VERIFY` | Verify reality message sent to Slack | No |
| `AWAITING_VERIFICATION` | Waiting for user to verify/reject/snooze | No |
| `VERIFIED_TRUE` | User confirmed drift is real | No |
| `VERIFIED_FALSE` | User marked as false positive | Yes |
| `PATCH_REQUESTED` | User clicked "Generate patch" button | No |

**Existing states remain:**
- `PATCH_GENERATED`, `PATCH_VALIDATED`, `WRITEBACK_VALIDATED`, `WRITTEN_BACK` (existing patch flow)

#### New Transitions

**Primary flow (verify-first mode):**
```
BASELINE_CHECKED → IMPACT_ASSESSED → SLACK_SENT_VERIFY → AWAITING_VERIFICATION
```

**User actions from AWAITING_VERIFICATION:**
```
User clicks "Verified: update needed" → VERIFIED_TRUE → (optional) PATCH_REQUESTED
User clicks "False positive" → VERIFIED_FALSE → COMPLETED
User clicks "Generate patch" → PATCH_REQUESTED → PATCH_PLANNED → PATCH_GENERATED
User clicks "Snooze 7d" → SNOOZED (existing)
```

**Auto-patch flow (high/critical impact):**
```
IMPACT_ASSESSED → PATCH_PLANNED (if impactBand === 'critical' || 'high')
```

#### Implementation in `transitions.ts`

**Update existing baseline handler:**

```typescript
async function handleBaselineChecked(ctx: TransitionContext): Promise<StateTransition> {
  // ... existing baseline check logic ...

  const baselineFindings = await runBaselineChecks(ctx.drift, ctx.docContent);

  // Transition to impact assessment (new state)
  return {
    nextState: 'IMPACT_ASSESSED',
    updates: {
      baselineFindings: baselineFindings as any,
      baselineCheckedAt: new Date()
    }
  };
}
```

**Add new impact assessment handler:**

```typescript
async function handleImpactAssessed(ctx: TransitionContext): Promise<StateTransition> {
  // Load dependencies
  const signal = await prisma.signalEvent.findUnique({
    where: { id: ctx.drift.signalEventId }
  });

  const baseline = ctx.drift.baselineFindings as BaselineFindings | null;
  const plan = await resolveDriftPlan(ctx.drift.workspaceId, signal);

  // Compute impact (deterministic, no LLM)
  const impactInputs = buildImpactInputs({
    drift: ctx.drift,
    signal,
    baseline,
    plan
  });

  const impact = computeImpact(impactInputs);

  // Store impact assessment
  await prisma.driftCandidate.update({
    where: { id: ctx.drift.id },
    data: {
      impactScore: impact.impactScore,
      impactBand: impact.impactBand,
      impactJson: impact as any,
      consequenceText: impact.consequenceText,
      impactAssessedAt: new Date()
    }
  });

  // Decision: verify-first vs auto-patch
  const writebackMode = plan?.writeback?.mode || 'verify_first';

  if (writebackMode === 'verify_first') {
    // Default: send verify reality message
    return {
      nextState: 'SLACK_SENT_VERIFY',
      updates: { impactJson: impact as any }
    };
  } else if (impact.impactBand === 'critical' ||
             (impact.impactBand === 'high' && plan?.writeback?.enabled)) {
    // High/critical impact with auto-patch enabled
    return {
      nextState: 'PATCH_PLANNED',
      updates: { impactJson: impact as any }
    };
  } else {
    // Medium/low impact: notify only
    return {
      nextState: 'OWNER_RESOLVED',
      updates: { impactJson: impact as any }
    };
  }
}
```

**Add verify message sender:**

```typescript
async function handleSlackSentVerify(ctx: TransitionContext): Promise<StateTransition> {
  const signal = await prisma.signalEvent.findUnique({
    where: { id: ctx.drift.signalEventId }
  });

  const impact = ctx.drift.impactJson as ImpactAssessment;
  const baseline = ctx.drift.baselineFindings as BaselineFindings | null;

  // Build verify reality message blocks
  const blocks = buildVerifyRealityBlocks({
    driftId: ctx.drift.id,
    workspaceId: ctx.drift.workspaceId,
    title: 'Potential Drift Detected',
    prUrl: signal.sourceType === 'github_pr' ? signal.normalizedData.url : undefined,
    docUrl: ctx.drift.docRef,
    driftType: ctx.drift.driftType,
    domains: ctx.drift.driftDomains,
    impactBand: impact.impactBand,
    impactScore: impact.impactScore,
    docClaim: extractDocClaim(baseline, ctx.drift),
    evidence: extractEvidence(signal, ctx.drift),
    consequenceText: impact.consequenceText
  });

  // Send to Slack
  const slackResult = await sendSlackMessage({
    workspaceId: ctx.drift.workspaceId,
    channel: ctx.drift.notificationChannel,
    blocks
  });

  return {
    nextState: 'AWAITING_VERIFICATION',
    updates: {
      slackMessageId: slackResult.ts,
      slackChannelId: slackResult.channel,
      slackSentAt: new Date()
    }
  };
}
```

---

### A.2 Slack Blocks JSON (Bolt-Ready)

This message is **deterministic**: it uses baseline extraction + parser evidence + impact engine output.

#### Data Inputs

```typescript
interface VerifyRealityInput {
  driftId: string;
  workspaceId: string;
  title: string;              // "Potential Drift Detected"
  prUrl?: string;
  docUrl?: string;
  driftType: string;
  domains: string[];
  impactBand: 'low' | 'medium' | 'high' | 'critical';
  impactScore: number;
  docClaim: { label: string; snippet: string };
  evidence: { label: string; snippet: string; sourceUrl?: string };
  consequenceText: string;
}
```

#### Message Block Builder

```typescript
export function buildVerifyRealityBlocks(input: VerifyRealityInput) {
  const impactEmoji =
    input.impactBand === "critical" ? "🛑" :
    input.impactBand === "high" ? "⚠️" :
    input.impactBand === "medium" ? "🟡" : "🟢";

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${impactEmoji} Verify Reality: ${input.driftType} drift (${input.impactBand})`
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Domains:* ${input.domains.join(", ")}\n*Impact score:* ${input.impactScore.toFixed(2)}`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Doc says:* ${input.docClaim.label}\n>${input.docClaim.snippet}`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Reality changed:* ${input.evidence.label}\n>${input.evidence.snippet}`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Consequence:* ${input.consequenceText}`
      }
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: input.prUrl ? `*PR:* ${input.prUrl}` : "*PR:* n/a" },
        { type: "mrkdwn", text: input.docUrl ? `*Doc:* ${input.docUrl}` : "*Doc:* n/a" },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "✅ Verified (update needed)" },
          style: "primary",
          action_id: "verta_verify_true",
          value: JSON.stringify({ driftId: input.driftId, workspaceId: input.workspaceId })
        },
        {
          type: "button",
          text: { type: "plain_text", text: "❌ False positive" },
          style: "danger",
          action_id: "verta_verify_false",
          value: JSON.stringify({ driftId: input.driftId, workspaceId: input.workspaceId })
        },
        {
          type: "button",
          text: { type: "plain_text", text: "📝 Generate patch" },
          action_id: "verta_generate_patch",
          value: JSON.stringify({ driftId: input.driftId, workspaceId: input.workspaceId })
        },
        {
          type: "button",
          text: { type: "plain_text", text: "💤 Snooze 7d" },
          action_id: "verta_snooze_7d",
          value: JSON.stringify({ driftId: input.driftId, workspaceId: input.workspaceId })
        }
      ],
    }
  ];
}
```

**Key point:** You can omit "Generate patch" button if policy says "alert-only" by filtering the `elements` array based on plan configuration.

#### Helper Functions for Data Extraction

```typescript
function extractDocClaim(
  baseline: BaselineFindings | null,
  drift: DriftCandidate
): { label: string; snippet: string } {
  if (!baseline?.matches || baseline.matches.length === 0) {
    return { label: 'Current documentation', snippet: '(No specific claim extracted)' };
  }

  const match = baseline.matches[0]; // Use first/strongest match

  if (match.patternId === 'command_match') {
    return {
      label: 'Command in runbook',
      snippet: match.oldValue
    };
  } else if (match.patternId === 'endpoint_match') {
    return {
      label: 'API endpoint',
      snippet: match.oldValue
    };
  } else if (match.patternId === 'port_match') {
    return {
      label: 'Port configuration',
      snippet: match.oldValue
    };
  } else if (match.patternId === 'owner_match') {
    return {
      label: 'Owner/team',
      snippet: match.oldValue
    };
  }

  return {
    label: 'Documentation claim',
    snippet: match.oldValue || '(See doc for details)'
  };
}

function extractEvidence(
  signal: SignalEvent,
  drift: DriftCandidate
): { label: string; snippet: string; sourceUrl?: string } {
  if (signal.sourceType === 'github_pr') {
    const prData = signal.normalizedData as any;
    return {
      label: `PR #${prData.number}`,
      snippet: drift.evidenceSummary || prData.title,
      sourceUrl: prData.url
    };
  } else if (signal.sourceType === 'pagerduty_incident') {
    const incidentData = signal.normalizedData as any;
    return {
      label: `Incident (${incidentData.severity})`,
      snippet: incidentData.title,
      sourceUrl: incidentData.url
    };
  } else if (signal.sourceType === 'slack_cluster') {
    const clusterData = signal.normalizedData as any;
    return {
      label: `${clusterData.messageCount} questions from ${clusterData.uniqueAskers} engineers`,
      snippet: clusterData.representativeQuestion
    };
  } else if (signal.sourceType === 'github_iac') {
    const iacData = signal.normalizedData as any;
    return {
      label: 'Infrastructure change',
      snippet: drift.evidenceSummary || iacData.summary,
      sourceUrl: iacData.url
    };
  }

  return {
    label: signal.sourceType,
    snippet: drift.evidenceSummary || '(See signal for details)'
  };
}
```


---

### A.3 Slack Action Handlers (Deterministic)

Implement these handlers in your Slack Bolt app (typically in `apps/api/src/routes/slack-interactions.ts` or a dedicated Bolt app file).

#### Action: Verify True

```typescript
app.action("verta_verify_true", async ({ body, ack, client }) => {
  await ack();

  const payload = JSON.parse((body as any).actions[0].value);
  const { driftId, workspaceId } = payload;
  const userId = (body as any).user.id;

  // 1) Mark drift as VERIFIED_TRUE
  await prisma.driftCandidate.update({
    where: { id: driftId },
    data: {
      state: "VERIFIED_TRUE",
      verifiedAt: new Date(),
      verifiedBy: userId
    }
  });

  // 2) Log approval in audit trail
  await prisma.approval.create({
    data: {
      workspaceId,
      driftCandidateId: driftId,
      approvedBy: userId,
      decision: 'verified_true',
      reason: 'User confirmed drift is real via Slack',
      approvedAt: new Date()
    }
  });

  // 3) Option A: Immediately enqueue patch job (if auto-patch enabled)
  const drift = await prisma.driftCandidate.findUnique({
    where: { id: driftId },
    include: { workspace: true }
  });

  const plan = await resolveDriftPlan(workspaceId, drift.signalEventId);

  if (plan?.writeback?.enabled) {
    await enqueueStateTransition(driftId, "PATCH_REQUESTED");
  } else {
    // Create obligation for manual update
    await createObligation({
      type: 'VERIFIED_DRIFT',
      driftId,
      workspaceId,
      severity: drift.impactJson?.impactBand || 'medium',
      message: `Verified drift requires manual doc update: ${drift.docRef}`
    });
  }

  // 4) Update Slack message
  await client.chat.update({
    channel: (body as any).channel.id,
    ts: (body as any).message.ts,
    text: "✅ Verified as real drift. " +
          (plan?.writeback?.enabled ? "Patch generation queued." : "Obligation created for manual update."),
    blocks: [] // Clear blocks to show simple confirmation
  });
});
```

#### Action: Verify False (False Positive)

```typescript
app.action("verta_verify_false", async ({ body, ack, client }) => {
  await ack();

  const payload = JSON.parse((body as any).actions[0].value);
  const { driftId, workspaceId } = payload;
  const userId = (body as any).user.id;

  // 1) Mark drift as VERIFIED_FALSE
  await prisma.driftCandidate.update({
    where: { id: driftId },
    data: {
      state: "VERIFIED_FALSE",
      verifiedAt: new Date(),
      verifiedBy: userId
    }
  });

  // 2) Log as false positive
  await prisma.approval.create({
    data: {
      workspaceId,
      driftCandidateId: driftId,
      approvedBy: userId,
      decision: 'false_positive',
      reason: 'User marked as false positive via Slack',
      approvedAt: new Date()
    }
  });

  // 3) Set cooldown/fingerprint penalty to reduce spam
  // This prevents similar drifts from being surfaced for a period
  await markFingerprintRejected(driftId);

  // 4) Update Slack message
  await client.chat.update({
    channel: (body as any).channel.id,
    ts: (body as any).message.ts,
    text: "❌ Marked as false positive. We'll suppress similar alerts for a while.",
    blocks: []
  });
});

/**
 * Helper: Mark fingerprint as rejected to prevent similar alerts
 */
async function markFingerprintRejected(driftId: string) {
  const drift = await prisma.driftCandidate.findUnique({
    where: { id: driftId }
  });

  if (!drift?.fingerprint) return;

  // Store rejection in a FingerprintRejection table (or add to DriftCandidate)
  await prisma.fingerprintRejection.create({
    data: {
      fingerprint: drift.fingerprint,
      workspaceId: drift.workspaceId,
      rejectedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    }
  });
}
```

#### Action: Generate Patch

```typescript
app.action("verta_generate_patch", async ({ body, ack, client }) => {
  await ack();

  const payload = JSON.parse((body as any).actions[0].value);
  const { driftId, workspaceId } = payload;
  const userId = (body as any).user.id;

  // 1) Mark drift as PATCH_REQUESTED
  await prisma.driftCandidate.update({
    where: { id: driftId },
    data: {
      state: "PATCH_REQUESTED",
      patchRequestedAt: new Date(),
      patchRequestedBy: userId
    }
  });

  // 2) Log action
  await prisma.auditEvent.create({
    data: {
      workspaceId,
      eventType: 'patch_requested',
      entityType: 'drift_candidate',
      entityId: driftId,
      actorId: userId,
      metadata: { source: 'slack_button' }
    }
  });

  // 3) Enqueue state machine transition to PATCH_PLANNED
  await enqueueStateTransition(driftId, "PATCH_REQUESTED");

  // 4) Update Slack message
  await client.chat.update({
    channel: (body as any).channel.id,
    ts: (body as any).message.ts,
    text: "📝 Patch generation queued. You'll be notified when ready for review.",
    blocks: []
  });
});
```

#### Action: Snooze 7 Days

```typescript
app.action("verta_snooze_7d", async ({ body, ack, client }) => {
  await ack();

  const payload = JSON.parse((body as any).actions[0].value);
  const { driftId, workspaceId } = payload;
  const userId = (body as any).user.id;

  const snoozeUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // 1) Mark drift as SNOOZED
  await prisma.driftCandidate.update({
    where: { id: driftId },
    data: {
      state: "SNOOZED",
      snoozedUntil: snoozeUntil,
      snoozedBy: userId,
      snoozedAt: new Date()
    }
  });

  // 2) Log snooze action
  await prisma.auditEvent.create({
    data: {
      workspaceId,
      eventType: 'drift_snoozed',
      entityType: 'drift_candidate',
      entityId: driftId,
      actorId: userId,
      metadata: { snoozeDays: 7, snoozeUntil: snoozeUntil.toISOString() }
    }
  });

  // 3) Update Slack message
  await client.chat.update({
    channel: (body as any).channel.id,
    ts: (body as any).message.ts,
    text: `💤 Snoozed for 7 days. Will re-notify on ${snoozeUntil.toLocaleDateString()}.`,
    blocks: []
  });
});
```

#### Helper: Enqueue State Transition

```typescript
/**
 * Enqueue a state machine transition via QStash
 */
async function enqueueStateTransition(driftId: string, targetState?: string) {
  const qstashClient = new Client({ token: process.env.QSTASH_TOKEN });

  await qstashClient.publishJSON({
    url: `${process.env.API_BASE_URL}/api/orchestrator/process`,
    body: {
      driftId,
      targetState // Optional: force specific state
    }
  });
}
```

---

### A.4 How This Reduces Hallucinations + Cost

With "verify reality first", you avoid LLM patching for most events.

**LLM calls become conditional:**

| Stage | Current Behavior | New Behavior | Token Savings | Hallucination Risk |
|---|---|---|---|---|
| **Drift classification** | LLM for all eligible drifts | Can be partially replaced by deterministic parsers (baseline + impact rules) | ~30-40% | Reduced |
| **Patch planning** | LLM for all drifts | Only on "Generate patch" click OR high/critical impact | ~60-70% | Eliminated for low-confidence |
| **Patch generation** | LLM for all patches | Only on explicit user request or auto-patch policy | ~60-70% | Eliminated for false positives |

**Overall impact:**
- **Token reduction: 40-60%** across the pipeline
- **Hallucination elimination:** Low-confidence drifts never reach LLM
- **User trust:** Humans verify reality before any LLM-generated content
- **Cost reduction:** Fewer Claude API calls, especially for false positives

**Example scenario:**
- 100 signals ingested
- 60 pass eligibility → DRIFT_CLASSIFIED
- 40 reach BASELINE_CHECKED
- **Current:** All 40 trigger patch generation (40 LLM calls)
- **New:**
  - 40 get impact assessment (deterministic, 0 LLM calls)
  - 30 sent to Slack for verification
  - 10 auto-patch (high/critical impact)
  - 5 users click "Generate patch"
  - **Total LLM calls: 15** (62.5% reduction)

---

### A.5 How These 3 Tie Into "Control-Plane + Reproducibility + Coverage Accounting" Narrative

This is how you answer the objection:

> **"What's your USP vs our internal LLM or deterministic script?"**

#### Your Answer (Technical + Product)

**1. Plans are versioned**
- Every drift decision is reproducible with `planVersionHash`
- Audit trail shows exactly which plan version was active when drift was detected
- Can replay historical decisions with same inputs + plan version

**2. Coverage is accounted**
- You can quantify blind spots and missing mappings
- Coverage Health dashboard shows: mapping coverage %, processing coverage %, blocked reasons
- Obligations created when coverage gaps are detected
- Proactive alerts when repos/services lack primary doc mappings

**3. Impact is deterministic**
- Consequence scoring is a rule engine with fired rules (not LLM opinion)
- Impact reasons are traceable: "DOMAIN_ROLLBACK (+25%), BASELINE_MATCH_FOUND (+20%)"
- Consequence templates are fill-in-the-blank, zero hallucination
- Impact bands (low/medium/high/critical) drive routing and urgency

**4. Humans verify reality**
- You don't force doc PR review; you confirm key mismatches first
- "Claim → Evidence → Consequence → Action" flow reduces cognitive load
- False positives are marked and suppressed (fingerprint rejection)
- Patch generation is gated by verification or high-impact threshold

**5. Audit-ready chain**
- Complete provenance: "doc claim → evidence → comparator → impact → decision"
- AuditBundle captures: plan version, signal event, evidence pack, baseline findings, comparator rules, prompt hash, model ID, validator report
- Every decision is reproducible and explainable

#### What Internal Scripts Usually Lack

Internal scripts and LLM experiments typically:

- ❌ **Don't track coverage obligations** (silent failures when repos aren't mapped)
- ❌ **Don't produce deterministic impact reasoning** (just "LLM says update this")
- ❌ **Don't have closed-loop verification workflows** (no feedback on false positives)
- ❌ **Are not consistent across teams** (each team builds their own variant)
- ❌ **Lack reproducibility** (can't replay decisions with same inputs)
- ❌ **Don't account for blast radius** (treat all drifts equally)

**VertaAI provides:**
- ✅ **Control-plane** (DriftPlan with versioning)
- ✅ **Truth-making** (deterministic comparator + impact engine)
- ✅ **Coverage accounting** (obligations, health metrics)
- ✅ **Fatigue reduction** (clustering, verification-first)
- ✅ **Reproducibility** (AuditBundle with version hashes)
- ✅ **Enterprise consistency** (one system, configurable per team)


---

### A.6 Exact Wiring Into Existing Orchestrator (`transitions.ts`) — Minimal Deltas

#### Where to Call Impact Engine

After baseline checks (since baseline findings are a strong impact booster):

**Existing flow:**
```
DOCS_FETCHED → BASELINE_CHECKED → PATCH_PLANNED
```

**New flow:**
```
DOCS_FETCHED → BASELINE_CHECKED → IMPACT_ASSESSED → SLACK_SENT_VERIFY (or PATCH_PLANNED)
```

#### Pseudo-Code Integration

```typescript
// In apps/api/src/services/orchestrator/transitions.ts

async function handleBaselineChecked(ctx: TransitionContext): Promise<StateTransition> {
  // Existing baseline checks...
  const baselineFindings = await runBaselineChecks(ctx.drift, ctx.docContent);

  // Store baseline findings
  await prisma.driftCandidate.update({
    where: { id: ctx.drift.id },
    data: { baselineFindings: baselineFindings as any }
  });

  // NEW: Transition to impact assessment instead of patch planning
  return {
    nextState: 'IMPACT_ASSESSED',
    updates: { baselineFindings: baselineFindings as any }
  };
}

async function handleImpactAssessed(ctx: TransitionContext): Promise<StateTransition> {
  // Load dependencies
  const signal = await prisma.signalEvent.findUnique({
    where: { id: ctx.drift.signalEventId }
  });

  const baseline = ctx.drift.baselineFindings as BaselineFindings | null;
  const plan = await resolveDriftPlan(ctx.drift.workspaceId, signal);

  // Compute impact (deterministic, no LLM)
  const impactInputs = buildImpactInputs({
    drift: ctx.drift,
    signal,
    baseline,
    plan
  });

  const impact = computeImpact(impactInputs);

  // Store impact assessment
  await prisma.driftCandidate.update({
    where: { id: ctx.drift.id },
    data: {
      impactScore: impact.impactScore,
      impactBand: impact.impactBand,
      impactJson: impact as any,
      consequenceText: impact.consequenceText
    }
  });

  // Decision logic based on plan policy
  const writebackMode = plan?.writeback?.mode || 'verify_first';

  if (writebackMode === 'verify_first') {
    // Default: send verify reality message
    return {
      nextState: 'SLACK_SENT_VERIFY',
      updates: { impactJson: impact as any }
    };
  } else if (impact.impactBand === 'critical' ||
             (impact.impactBand === 'high' && plan?.writeback?.enabled)) {
    // High/critical impact with auto-patch enabled
    return {
      nextState: 'PATCH_PLANNED',
      updates: { impactJson: impact as any }
    };
  } else {
    // Medium/low impact: notify only (skip to owner resolution)
    return {
      nextState: 'OWNER_RESOLVED',
      updates: { impactJson: impact as any }
    };
  }
}
```

#### Register New Handlers

```typescript
// Add to TRANSITION_HANDLERS map in transitions.ts

export const TRANSITION_HANDLERS: Record<DriftState, TransitionHandler> = {
  // ... existing handlers ...
  BASELINE_CHECKED: handleBaselineChecked,
  IMPACT_ASSESSED: handleImpactAssessed,      // NEW
  SLACK_SENT_VERIFY: handleSlackSentVerify,   // NEW
  AWAITING_VERIFICATION: handleAwaitingVerification, // NEW (no-op, waits for user action)
  VERIFIED_TRUE: handleVerifiedTrue,          // NEW
  VERIFIED_FALSE: handleVerifiedFalse,        // NEW
  PATCH_REQUESTED: handlePatchRequested,      // NEW (or reuse existing PATCH_PLANNED)
  // ... existing handlers ...
};
```

---

### A.7 Minimal APIs for These Features (Vercel-Ready)

#### Plans API

**List plans:**
```typescript
// GET /api/plans?workspaceId=xxx
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get('workspaceId');

  const plans = await prisma.driftPlan.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: 'desc' }
  });

  return Response.json({ plans });
}
```

**Create plan:**
```typescript
// POST /api/plans
export async function POST(req: Request) {
  const body = await req.json();
  const { workspaceId, name, scopeType, scopeRef, docClass, ...config } = body;

  // Compute version hash
  const versionHash = computePlanVersionHash({
    scopeType,
    scopeRef,
    docClass,
    inputSources: config.inputSources,
    driftTypes: config.driftTypes,
    thresholds: config.thresholds,
    eligibility: config.eligibility,
    impactRules: config.impactRules,
    writeback: config.writeback
  });

  const plan = await prisma.driftPlan.create({
    data: {
      workspaceId,
      name,
      scopeType,
      scopeRef,
      docClass,
      primaryDocId: config.primaryDocId,
      primaryDocSystem: config.primaryDocSystem,
      inputSources: config.inputSources,
      driftTypes: config.driftTypes,
      allowedOutputs: config.allowedOutputs,
      thresholds: config.thresholds,
      eligibility: config.eligibility,
      sectionTargets: config.sectionTargets,
      impactRules: config.impactRules,
      writeback: config.writeback,
      version: 1,
      versionHash
    }
  });

  return Response.json({ plan }, { status: 201 });
}
```

**Update plan (with version bump):**
```typescript
// PATCH /api/plans/:id
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { id } = params;

  const existingPlan = await prisma.driftPlan.findUnique({ where: { id } });
  if (!existingPlan) {
    return Response.json({ error: 'Plan not found' }, { status: 404 });
  }

  // Compute new version hash
  const newVersionHash = computePlanVersionHash({
    scopeType: body.scopeType || existingPlan.scopeType,
    scopeRef: body.scopeRef || existingPlan.scopeRef,
    docClass: body.docClass || existingPlan.docClass,
    inputSources: body.inputSources || existingPlan.inputSources,
    driftTypes: body.driftTypes || existingPlan.driftTypes,
    thresholds: body.thresholds || existingPlan.thresholds,
    eligibility: body.eligibility || existingPlan.eligibility,
    impactRules: body.impactRules || existingPlan.impactRules,
    writeback: body.writeback || existingPlan.writeback
  });

  // Bump version if config changed
  const version = newVersionHash !== existingPlan.versionHash
    ? existingPlan.version + 1
    : existingPlan.version;

  const updatedPlan = await prisma.driftPlan.update({
    where: { id },
    data: {
      ...body,
      version,
      versionHash: newVersionHash
    }
  });

  return Response.json({ plan: updatedPlan });
}
```

#### Coverage API

**Trigger coverage snapshot (cron job):**
```typescript
// POST /api/jobs/coverage-snapshot
export async function POST(req: Request) {
  const { workspaceId } = await req.json();

  const snapshot = await computeCoverageSnapshot(workspaceId);

  await prisma.coverageSnapshot.create({
    data: {
      workspaceId,
      snapshotDate: new Date(),
      mappingCoverage: snapshot.mappingCoverage,
      processingCoverage: snapshot.processingCoverage,
      sourceHealth: snapshot.sourceHealth,
      blockedReasons: snapshot.blockedReasons,
      obligations: snapshot.obligations
    }
  });

  return Response.json({ snapshot });
}
```

**Get latest coverage:**
```typescript
// GET /api/coverage/latest?workspaceId=xxx
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get('workspaceId');

  const snapshot = await prisma.coverageSnapshot.findFirst({
    where: { workspaceId },
    orderBy: { snapshotDate: 'desc' }
  });

  return Response.json({ snapshot });
}
```

#### Drift Verification API

**Get drift details (for Slack or UI):**
```typescript
// GET /api/drifts/:id
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;

  const drift = await prisma.driftCandidate.findUnique({
    where: { id },
    include: {
      signalEvent: true,
      patchProposal: true,
      approvals: true
    }
  });

  if (!drift) {
    return Response.json({ error: 'Drift not found' }, { status: 404 });
  }

  return Response.json({
    drift,
    impact: drift.impactJson,
    baseline: drift.baselineFindings,
    evidence: drift.evidenceSummary
  });
}
```

---

### A.8 Recommended Plan Defaults (So You Don't Become Bespoke Consulting)

Your DriftPlan should be mostly **config, not custom code**. For MVP, ship **2 templates** that customers can clone and customize:

#### Template 1: On-Call Runbooks (SRE)

```typescript
export const RUNBOOK_PLAN_TEMPLATE: Partial<DriftPlan> = {
  name: 'On-Call Runbooks (SRE)',
  docClass: 'Operational_Runbook',

  inputSources: [
    'github_pr',
    'pagerduty_incident',
    'github_iac',
    'datadog_alert'
  ],

  driftTypes: [
    'instruction',
    'process',
    'ownership',
    'environment_tooling'
  ],

  allowedOutputs: [
    'confluence',
    'notion',
    'github_readme'
  ],

  thresholds: {
    minConfidence: 0.65,        // Higher threshold for runbooks
    minImpactScore: 0.50,       // Only notify on medium+ impact
    notifyBands: ['high', 'critical'],
    autoPatchBands: []          // Never auto-patch runbooks (too risky)
  },

  eligibility: {
    requireManagedRegion: true,
    requireOwnerMatch: false,
    allowedDomains: [
      'rollback',
      'deployment',
      'auth',
      'infra',
      'observability',
      'data_migrations'
    ]
  },

  sectionTargets: {
    preferredSections: [
      'Rollback Procedure',
      'Escalation',
      'Prerequisites',
      'Steps',
      'Troubleshooting'
    ]
  },

  impactRules: {
    // Use default impact rules from config/impactRules.ts
    // Can override specific rules here if needed
  },

  writeback: {
    enabled: false,             // Verify-first only for runbooks
    mode: 'verify_first',
    requireApproval: true,
    approvalThreshold: 1
  }
};
```

#### Template 2: API Docs (OpenAPI)

```typescript
export const API_DOCS_PLAN_TEMPLATE: Partial<DriftPlan> = {
  name: 'API Documentation (OpenAPI)',
  docClass: 'API_Docs',

  inputSources: [
    'github_pr',
    'github_swagger',
    'slack_cluster'
  ],

  driftTypes: [
    'instruction',
    'coverage'
  ],

  allowedOutputs: [
    'github_swagger',
    'confluence',
    'gitbook'
  ],

  thresholds: {
    minConfidence: 0.55,        // Lower threshold for API docs (less risky)
    minImpactScore: 0.35,       // Notify on low+ impact
    notifyBands: ['medium', 'high', 'critical'],
    autoPatchBands: ['high', 'critical']  // Auto-patch for high-confidence API changes
  },

  eligibility: {
    requireManagedRegion: true,
    requireOwnerMatch: false,
    allowedDomains: [
      'api',
      'endpoints',
      'schema',
      'authentication'
    ]
  },

  sectionTargets: {
    preferredSections: [
      'Endpoints',
      'Request Schema',
      'Response Schema',
      'Authentication',
      'Rate Limits'
    ]
  },

  impactRules: {
    // Use default impact rules
  },

  writeback: {
    enabled: true,              // Auto-patch enabled for API docs
    mode: 'auto_patch_high',    // Auto-patch for high/critical, verify for medium/low
    requireApproval: true,
    approvalThreshold: 1
  }
};
```

#### Template Cloning API

```typescript
// POST /api/plans/from-template
export async function POST(req: Request) {
  const { workspaceId, templateId, scopeType, scopeRef, primaryDocId } = await req.json();

  const template = templateId === 'runbook'
    ? RUNBOOK_PLAN_TEMPLATE
    : API_DOCS_PLAN_TEMPLATE;

  const plan = await prisma.driftPlan.create({
    data: {
      ...template,
      workspaceId,
      scopeType,
      scopeRef,
      primaryDocId,
      version: 1,
      versionHash: computePlanVersionHash(template)
    }
  });

  return Response.json({ plan }, { status: 201 });
}
```

---

### A.9 Quick "Build Order" (Fastest Path to Value)

This is the recommended implementation sequence to maximize value delivery while minimizing risk:

#### Week 1: Impact Engine + Verify Reality UX

**Goal:** Ship deterministic impact scoring and new Slack UX

**Tasks:**
1. ✅ Implement `config/impactRules.ts` with rule registry (1 day)
2. ✅ Implement `services/impact/engine.ts` with `computeImpact()` (1 day)
3. ✅ Add `impactJson` field to DriftCandidate schema (0.5 day)
4. ✅ Add `IMPACT_ASSESSED` state to state machine (0.5 day)
5. ✅ Implement `buildVerifyRealityBlocks()` in slack-composer (1 day)
6. ✅ Implement Slack action handlers (verify/false/patch/snooze) (1 day)
7. ✅ Test end-to-end with sample drifts (1 day)

**Deliverable:** Drifts now show impact bands + consequence text, Slack messages use verify-first UX

**Value:** Immediate reduction in doc PR fatigue, deterministic impact reasoning

---

#### Week 2: DriftPlan Object + Plan Resolver

**Goal:** Formalize workspace config into versioned plans

**Tasks:**
1. ✅ Add DriftPlan table to Prisma schema (0.5 day)
2. ✅ Implement `services/plans/resolver.ts` with plan resolution algorithm (1 day)
3. ✅ Create plan templates (runbook + API docs) (0.5 day)
4. ✅ Implement Plans API (GET/POST/PATCH) (1 day)
5. ✅ Build `/plans` UI page (list + create from template) (1.5 days)
6. ✅ Build `/plans/[id]` UI page (details + edit) (1.5 days)

**Deliverable:** Customers can create and manage DriftPlans via UI

**Value:** Control-plane narrative, reproducibility via version hashing

---

#### Week 3: Coverage Health Dashboard

**Goal:** Surface coverage gaps and obligations

**Tasks:**
1. ✅ Add CoverageSnapshot table to Prisma schema (0.5 day)
2. ✅ Implement `services/coverage/snapshot.ts` with coverage computation (1.5 days)
3. ✅ Create cron job for daily coverage snapshots (0.5 day)
4. ✅ Implement Coverage API (GET latest snapshot) (0.5 day)
5. ✅ Build `/coverage` UI page with hero metrics + widgets (2 days)

**Deliverable:** Coverage Health dashboard showing mapping %, processing %, blocked reasons

**Value:** Proactive gap detection, prevents silent failures

---

#### Week 4: Polish + Integration Testing

**Goal:** End-to-end testing and refinement

**Tasks:**
1. ✅ Integration testing with real customer data (2 days)
2. ✅ Refine impact rules based on feedback (1 day)
3. ✅ Add fingerprint rejection for false positives (0.5 day)
4. ✅ Documentation and onboarding guides (1 day)
5. ✅ Performance optimization (0.5 day)

**Deliverable:** Production-ready system with all 3 core improvements

**Value:** Complete transformation to control-plane + truth-making system

---

### Summary: Build Order Priorities

| Priority | Feature | Effort | Value | Dependencies |
|---|---|---|---|---|
| **P0** | Impact Engine | 1 week | High | None |
| **P0** | Verify Reality UX | 1 week | High | Impact Engine |
| **P1** | DriftPlan Object | 1 week | High | None |
| **P1** | Plan Resolver | 0.5 week | High | DriftPlan Object |
| **P2** | Coverage Health | 1 week | Medium | DriftPlan Object |
| **P3** | Clustering | 1 week | Medium | None (can be parallel) |
| **P3** | AuditBundle | 0.5 week | Low (nice-to-have) | DriftPlan Object |

**Critical path:** Impact Engine → Verify Reality UX → DriftPlan → Coverage Health

**Total effort:** 4-5 weeks for P0-P2 (core transformation)

**MVP cutline:** All P0-P1 features (3 weeks) deliver the core narrative shift

---

## Appendix B: Database Schema Changes Summary

For quick reference, here are all the schema changes needed:

### New Tables

```prisma
model DriftPlan {
  id               String   @id @default(uuid())
  workspaceId      String   @index
  workspace        Workspace @relation(fields: [workspaceId], references: [id])

  name             String
  status           String   @default("active")

  scopeType        String
  scopeRef         String

  primaryDocId     String?
  primaryDocSystem String?
  docClass         String

  inputSources     String[]
  driftTypes       String[]
  allowedOutputs   String[]

  thresholds       Json
  eligibility      Json
  sectionTargets   Json
  impactRules      Json
  writeback        Json

  version          Int      @default(1)
  versionHash      String

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([workspaceId, scopeType, scopeRef])
  @@index([workspaceId, docClass])
}

model CoverageSnapshot {
  id                 String   @id @default(uuid())
  workspaceId        String   @index
  workspace          Workspace @relation(fields: [workspaceId], references: [id])

  snapshotDate       DateTime @default(now())

  mappingCoverage    Json
  processingCoverage Json
  sourceHealth       Json
  blockedReasons     Json
  obligations        Json

  createdAt          DateTime @default(now())

  @@index([workspaceId, snapshotDate])
}

model FingerprintRejection {
  id          String   @id @default(uuid())
  workspaceId String   @index
  workspace   Workspace @relation(fields: [workspaceId], references: [id])

  fingerprint String   @index
  rejectedAt  DateTime @default(now())
  expiresAt   DateTime

  @@index([fingerprint, expiresAt])
}
```

### Modified Tables

```prisma
model DriftCandidate {
  // ... existing fields ...

  // NEW: Plan tracking
  planId           String?
  planVersionHash  String?
  coverageFlags    String[]

  // NEW: Impact assessment
  impactScore      Float?
  impactBand       String?
  impactJson       Json?
  consequenceText  String?
  impactAssessedAt DateTime?

  // NEW: Verification tracking
  verifiedBy       String?
  verifiedAt       DateTime?
  patchRequestedBy String?
  patchRequestedAt DateTime?
  snoozedBy        String?
  snoozedAt        DateTime?
  snoozedUntil     DateTime?

  // ... existing fields ...
}
```

---



---

## Appendix C: Multi-Source/Multi-Target Impact Assessment (Part 3)

This section provides build-ready specifications for handling **multiple input source types** and **multiple output targets** in the impact assessment system. This is critical for accurate, deterministic impact scoring across VertaAI's diverse signal sources and documentation systems.

---

### C.1 Why Multi-Source/Multi-Target Awareness Matters

Impact depends on two dimensions:

**1. Input Source (Signal Type):**
- **GitHub PR** → Code changes with file paths, keywords, line counts
- **PagerDuty Incident** → Severity, duration, responder count, escalations
- **Slack Cluster** → Question volume, unique askers, time span
- **Datadog/Grafana Alert** → Severity, occurrences, recovery status
- **GitHub IaC** → Infrastructure changes with resource types
- **GitHub CODEOWNERS** → Ownership changes with old/new owners
- **OpenAPI Changes** → Breaking changes, removed endpoints, new required params

**2. Output Target (Doc System):**
- **Runbook** (Confluence/Notion) → High-risk, insurance-critical
- **API Contract** (Swagger) → Revenue-critical, breaking changes costly
- **Service Catalog** (Backstage) → Ownership routing, discovery
- **Developer Docs** (README/GitBook) → Onboarding, productivity
- **Code Comments** → Implementation guidance, low-risk

**Impact scoring must account for both:**
- High-severity incident + runbook = CRITICAL
- Breaking API change + Swagger = HIGH
- Slack cluster + missing coverage = MEDIUM
- PR with minor change + README = LOW

---

### C.2 Canonical Type Definitions

Create: `apps/api/src/services/impact/types.ts`

```typescript
export type InputSourceType =
  | "github_pr"
  | "github_codeowners"
  | "github_iac"
  | "pagerduty_incident"
  | "slack_cluster"
  | "datadog_alert"
  | "grafana_alert";

export type DocSystem =
  | "confluence"
  | "notion"
  | "gitbook"
  | "github_readme"
  | "github_swagger"
  | "github_code_comments"
  | "backstage";

export type DriftType =
  | "instruction"
  | "process"
  | "ownership"
  | "coverage"
  | "environment_tooling";

export type DriftDomain =
  | "rollback"
  | "auth"
  | "data_migrations"
  | "deployment"
  | "infra"
  | "config"
  | "api"
  | "observability"
  | "onboarding"
  | "ownership_routing";

export type ImpactInputs = {
  sourceType: InputSourceType;
  driftType: DriftType;
  domains: DriftDomain[];

  docSystem?: DocSystem;
  docClass?: string;     // e.g. Operational_Runbook, API_Docs
  docCategory?: string;  // developer|functional|operational

  confidence: number; // computed earlier, deterministic scoring output

  // GitHub PR evidence
  github?: {
    repo?: string;
    prNumber?: number;
    merged?: boolean;
    pathsChanged?: string[];
    keywords?: string[];
    changedLines?: number;
  };

  openApi?: {
    removedEndpoints?: number;
    addedRequiredParams?: number;
    breakingChanges?: number;
  };

  codeowners?: {
    ownerChanged?: boolean;
    ownerMismatch?: boolean;
    oldOwners?: string[];
    newOwners?: string[];
  };

  iac?: {
    changedResources?: number;
    changedModules?: number;
    riskyKinds?: string[]; // e.g. ["db", "network", "iam"]
  };

  pagerduty?: {
    severity?: "P1" | "P2" | "P3" | "P4" | string;
    durationMinutes?: number;
    responders?: number;
    escalations?: number;
    hasPostmortemLink?: boolean;
  };

  slack?: {
    messageCount?: number;
    uniqueAskers?: number;
    daysSpan?: number;
    channelName?: string;
  };

  alert?: {
    severity?: "critical" | "warning" | string;
    occurrences?: number;
    recovered?: boolean;
    monitorTags?: string[];
  };

  // Baseline evidence from doc (deterministic extraction)
  baseline?: {
    matchedPatternIds?: string[];
    matchedTokens?: string[];
    matchedHeadings?: string[];
    managedRegionPresent?: boolean;
  };

  // Target-aware "surface"
  targetSurface?: {
    artifactType:
      | "runbook"
      | "api_contract"
      | "service_catalog"
      | "developer_doc"
      | "code_doc"
      | "knowledge_base";
    writebackMode?: "direct" | "pr_only" | "none"; // how risky
  };
};
```

---

### C.3 Target Surface Classification (Output-Target Aware)

Create: `apps/api/src/services/impact/targetSurface.ts`

```typescript
import { DocSystem } from "./types";

export function getTargetSurface(docSystem: DocSystem, docClass?: string) {
  // Deterministic mapping from doc system to artifact type + writeback risk

  if (docSystem === "github_swagger") {
    return {
      artifactType: "api_contract" as const,
      writebackMode: "pr_only" as const
    };
  }

  if (docSystem === "backstage") {
    return {
      artifactType: "service_catalog" as const,
      writebackMode: "pr_only" as const
    };
  }

  if (docSystem === "github_code_comments") {
    return {
      artifactType: "code_doc" as const,
      writebackMode: "pr_only" as const
    };
  }

  if (docSystem === "github_readme") {
    return {
      artifactType: "developer_doc" as const,
      writebackMode: "pr_only" as const
    };
  }

  if (docSystem === "gitbook") {
    return {
      artifactType: "knowledge_base" as const,
      writebackMode: "pr_only" as const
    };
  }

  // Confluence / Notion
  const isRunbook = [
    "Operational_Runbook",
    "Incident_Playbook",
    "Release_Runbook"
  ].includes(docClass ?? "");

  return {
    artifactType: isRunbook ? ("runbook" as const) : ("knowledge_base" as const),
    writebackMode: "direct" as const,
  };
}
```

**Usage in impact rules:**
- Runbooks → insurance-critical, high impact weight
- API contracts → revenue-critical, breaking changes = high impact
- Service catalog → ownership routing, medium impact
- Developer docs → productivity, lower impact
- Code comments → implementation guidance, lowest impact

---

### C.4 `buildImpactInputs()` — Per Source Type Adapters

Create: `apps/api/src/services/impact/buildImpactInputs.ts`

```typescript
import { ImpactInputs } from "./types";
import { getTargetSurface } from "./targetSurface";

export function buildImpactInputs(args: {
  driftCandidate: any; // Prisma DriftCandidate type
  signalEvent: any;    // Prisma SignalEvent
  docContext?: any;    // DocContext (managed region presence, baseline findings)
  parserArtifacts?: {
    openApiDiff?: any;
    codeownersDiff?: any;
    iacSummary?: any;
    pagerdutyNormalized?: any;
    slackCluster?: any;
    alertNormalized?: any;
  };
}): ImpactInputs {
  const dc = args.driftCandidate;
  const se = args.signalEvent;

  const docSystem = dc.docSystem ?? dc.targetDocSystem ?? undefined;
  const docClass = dc.docClass ?? undefined;
  const docCategory = dc.docCategory ?? undefined;

  const targetSurface = docSystem ? getTargetSurface(docSystem, docClass) : undefined;

  const baseline = args.docContext?.baseline
    ? {
        matchedPatternIds: args.docContext.baseline.matchedPatternIds ?? [],
        matchedTokens: args.docContext.baseline.matchedTokens ?? [],
        matchedHeadings: args.docContext.baseline.matchedHeadings ?? [],
        managedRegionPresent: !!args.docContext.managedRegion?.present,
      }
    : undefined;

  const inputs: ImpactInputs = {
    sourceType: se.sourceType,
    driftType: dc.driftType,
    domains: dc.driftDomains ?? [],
    docSystem,
    docClass,
    docCategory,
    confidence: dc.confidence ?? 0,
    baseline,
    targetSurface,
  };

  // Source-specific enrichment
  switch (se.sourceType) {
    case "github_pr":
      inputs.github = {
        repo: se.repo,
        prNumber: se.prNumber,
        merged: se.merged,
        pathsChanged: se.pathsChanged ?? [],
        keywords: se.keywords ?? [],
        changedLines: se.changedLines ?? undefined,
      };

      // Attach OpenAPI diff if relevant
      if (args.parserArtifacts?.openApiDiff) {
        inputs.openApi = normalizeOpenApiDiff(args.parserArtifacts.openApiDiff);
      }

      // Attach IaC summary if relevant
      if (args.parserArtifacts?.iacSummary) {
        inputs.iac = normalizeIacSummary(args.parserArtifacts.iacSummary);
      }
      break;

    case "github_codeowners":
      inputs.github = {
        repo: se.repo,
        prNumber: se.prNumber,
        merged: se.merged,
        pathsChanged: se.pathsChanged ?? [],
        keywords: se.keywords ?? [],
      };

      if (args.parserArtifacts?.codeownersDiff) {
        inputs.codeowners = normalizeCodeownersDiff(args.parserArtifacts.codeownersDiff);
      }
      break;

    case "github_iac":
      inputs.github = {
        repo: se.repo,
        prNumber: se.prNumber,
        merged: se.merged,
        pathsChanged: se.pathsChanged ?? [],
        keywords: se.keywords ?? [],
      };

      if (args.parserArtifacts?.iacSummary) {
        inputs.iac = normalizeIacSummary(args.parserArtifacts.iacSummary);
      }
      break;

    case "pagerduty_incident":
      if (args.parserArtifacts?.pagerdutyNormalized) {
        inputs.pagerduty = normalizePagerduty(args.parserArtifacts.pagerdutyNormalized);
      }
      break;

    case "slack_cluster":
      if (args.parserArtifacts?.slackCluster) {
        inputs.slack = normalizeSlackCluster(args.parserArtifacts.slackCluster);
      }
      break;

    case "datadog_alert":
    case "grafana_alert":
      if (args.parserArtifacts?.alertNormalized) {
        inputs.alert = normalizeAlert(args.parserArtifacts.alertNormalized);
      }
      break;
  }

  return inputs;
}

// --- Normalizers (keep deterministic) ---

function normalizeOpenApiDiff(d: any) {
  return {
    removedEndpoints: d.removedEndpoints ?? d.removed?.length ?? 0,
    addedRequiredParams: d.addedRequiredParams ?? 0,
    breakingChanges: d.breakingChanges ?? d.breaking?.length ?? 0,
  };
}

function normalizeCodeownersDiff(d: any) {
  return {
    ownerChanged: !!d.ownerChanged,
    ownerMismatch: !!d.ownerMismatch,
    oldOwners: d.oldOwners ?? [],
    newOwners: d.newOwners ?? [],
  };
}

function normalizeIacSummary(s: any) {
  return {
    changedResources: s.changedResources ?? 0,
    changedModules: s.changedModules ?? 0,
    riskyKinds: s.riskyKinds ?? [],
  };
}

function normalizePagerduty(p: any) {
  return {
    severity: p.severity,
    durationMinutes: p.durationMinutes,
    responders: p.responders?.length ?? p.responderCount ?? 0,
    escalations: p.escalationCount ?? 0,
    hasPostmortemLink: !!p.postmortemUrl,
  };
}

function normalizeSlackCluster(c: any) {
  const daysSpan =
    c.firstSeen && c.lastSeen
      ? Math.max(
          1,
          Math.ceil(
            (new Date(c.lastSeen).getTime() - new Date(c.firstSeen).getTime()) /
            (24 * 3600 * 1000)
          )
        )
      : undefined;

  return {
    messageCount: c.messageCount ?? 0,
    uniqueAskers: c.uniqueAskers ?? 0,
    daysSpan,
    channelName: c.channelName,
  };
}

function normalizeAlert(a: any) {
  return {
    severity: a.severity,
    occurrences: a.occurrences ?? 1,
    recovered: a.recovered ?? false,
    monitorTags: a.tags ?? [],
  };
}
```

**Where it's called:**

Call `buildImpactInputs()` **right after BASELINE_CHECKED** and before computing impact:

```typescript
async function handleImpactAssessed(ctx: TransitionContext): Promise<StateTransition> {
  const signal = await prisma.signalEvent.findUnique({
    where: { id: ctx.drift.signalEventId }
  });

  const baseline = ctx.drift.baselineFindings as BaselineFindings | null;

  // NEW: Build comprehensive impact inputs with source + target awareness
  const impactInputs = buildImpactInputs({
    driftCandidate: ctx.drift,
    signalEvent: signal,
    docContext: {
      baseline: baseline,
      managedRegion: ctx.drift.managedRegion
    },
    parserArtifacts: {
      openApiDiff: signal.openApiDiff,
      codeownersDiff: signal.codeownersDiff,
      iacSummary: signal.iacSummary,
      pagerdutyNormalized: signal.normalizedData,
      slackCluster: signal.normalizedData,
      alertNormalized: signal.normalizedData
    }
  });

  const impact = computeImpact(impactInputs);

  // ... rest of handler
}
```


---

### C.5 DocClaim Extraction (Baseline → "Doc Says...") with Multi-Output Targets

You want a deterministic "Doc says X" snippet used in Slack for **verify reality**. This must support all doc systems:

- Confluence/Notion/GitBook (markdown-like bodies)
- README (markdown)
- Swagger (YAML/JSON text)
- Backstage (`catalog-info.yaml`)
- Code comments (TS/JS docstrings)

#### Canonical Output Format

Create: `apps/api/src/services/docs/docClaimExtractor.ts`

```typescript
export type DocClaim = {
  claimType:
    | "instruction_token"
    | "process_step"
    | "owner_block"
    | "missing_coverage"
    | "tool_reference"
    | "api_contract_snippet";
  label: string;     // short description
  snippet: string;   // quoted excerpt from doc
  headingPath?: string[];
  location?: { startLine: number; endLine: number };
  matchedTokens?: string[];
  patternId?: string;
};

export type DocClaimResult = {
  ok: boolean;
  claims: DocClaim[];
  primaryClaim?: DocClaim;
};
```

#### Extraction Strategy (Deterministic, Output-Specific)

**General approach:**

1. Use `DocContext.managedRegionText` if present; else use `DocContext.fullText`
2. Use drift-type-specific extraction
3. Pick **one** `primaryClaim` using deterministic priority rules:
   - ownership drift → owner_block claim
   - OpenAPI target → api_contract_snippet claim
   - instruction drift → instruction_token claim
   - process drift → process_step claim
   - environment drift → tool_reference claim
   - coverage drift → missing_coverage claim

**Per doc system logic:**

- **Confluence/Notion/GitBook/README**: treat as text with headings/lists
- **Swagger**: treat as parsed OpenAPI with paths/operations
- **Backstage**: parse YAML, extract `spec.owner` / `metadata.description` references
- **Code comments**: locate relevant docstrings by file path + symbol

#### Implementation Skeleton

```typescript
import { DocClaimResult, DocClaim } from "./types";
import { DriftType, DocSystem } from "../impact/types";

export function extractDocClaims(args: {
  docSystem: DocSystem;
  driftType: DriftType;
  docText: string;
  baselineFindings?: any; // your baseline structure
  hints?: {
    matchedTokens?: string[];
    headings?: string[];
    openApiPointers?: { path?: string; method?: string };
    ownerBlockPatterns?: string[];
  };
}): DocClaimResult {
  const { docSystem, driftType } = args;

  if (docSystem === "github_swagger") {
    return extractSwaggerClaims(args);
  }
  if (docSystem === "backstage") {
    return extractBackstageClaims(args);
  }
  if (docSystem === "github_code_comments") {
    return extractCodeCommentClaims(args);
  }

  // Text-like targets (Confluence, Notion, GitBook, README)
  switch (driftType) {
    case "ownership":
      return extractOwnerBlockClaims(args);
    case "process":
      return extractProcessClaims(args);
    case "instruction":
      return extractInstructionClaims(args);
    case "environment_tooling":
      return extractToolReferenceClaims(args);
    case "coverage":
      return extractCoverageClaims(args);
  }
}
```

#### Instruction Drift Claim Extraction (Text Targets)

Deterministic: find the exact token(s) you matched in baseline (e.g., "5432", "kubectl apply", "CircleCI") and return small window.

```typescript
function extractInstructionClaims(args: any): DocClaimResult {
  const tokens: string[] = args.hints?.matchedTokens ?? args.baselineFindings?.matchedTokens ?? [];
  const claims: DocClaim[] = [];

  for (const t of tokens.slice(0, 3)) {
    const loc = findTokenWindow(args.docText, t, 3); // ±3 lines
    if (loc) {
      claims.push({
        claimType: "instruction_token",
        label: `Doc references "${t}"`,
        snippet: loc.snippet,
        location: { startLine: loc.startLine, endLine: loc.endLine },
        matchedTokens: [t],
      });
    }
  }

  return { ok: claims.length > 0, claims, primaryClaim: claims[0] };
}

/**
 * Helper: Find a token in text and return surrounding lines
 */
function findTokenWindow(
  text: string,
  token: string,
  contextLines: number
): { snippet: string; startLine: number; endLine: number } | null {
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(token)) {
      const start = Math.max(0, i - contextLines);
      const end = Math.min(lines.length - 1, i + contextLines);

      const snippet = lines.slice(start, end + 1).join('\n');

      return {
        snippet,
        startLine: start + 1,
        endLine: end + 1
      };
    }
  }

  return null;
}
```

#### Process Drift Claim Extraction (Text Targets)

Deterministic: find numbered steps or "First/Then/Finally" in target section.

```typescript
function extractProcessClaims(args: any): DocClaimResult {
  const stepList = extractStepSkeleton(args.docText);
  const claims: DocClaim[] = [];

  if (stepList.steps.length > 0) {
    claims.push({
      claimType: "process_step",
      label: `Doc process step order (first ${Math.min(3, stepList.steps.length)})`,
      snippet: stepList.preview,
      location: { startLine: stepList.startLine, endLine: stepList.endLine },
    });
  }

  return { ok: claims.length > 0, claims, primaryClaim: claims[0] };
}

/**
 * Helper: Extract numbered steps or sequential markers
 */
function extractStepSkeleton(text: string): {
  steps: string[];
  preview: string;
  startLine: number;
  endLine: number;
} {
  const lines = text.split('\n');
  const steps: string[] = [];
  let startLine = -1;
  let endLine = -1;

  // Pattern: numbered lists (1., 2., 3.) or sequential markers
  const stepPattern = /^\s*(\d+\.|Step \d+|First|Then|Next|Finally)/i;

  for (let i = 0; i < lines.length; i++) {
    if (stepPattern.test(lines[i])) {
      if (startLine === -1) startLine = i;
      endLine = i;
      steps.push(lines[i].trim());
    }
  }

  const preview = steps.slice(0, 3).join('\n');

  return {
    steps,
    preview,
    startLine: startLine + 1,
    endLine: endLine + 1
  };
}
```

#### Ownership Drift Claim Extraction

Deterministic: search for owner patterns you already have.

```typescript
function extractOwnerBlockClaims(args: any): DocClaimResult {
  const patterns = args.hints?.ownerBlockPatterns ?? [
    /(^|\n)\s*(Owner|Owners|Team|Maintainer|Contact)\s*[:\-]/i,
    /(#|@)[a-z0-9_\-]+/i,
  ];

  const block = extractBlockAroundPatterns(args.docText, patterns, 12);
  if (!block) return { ok: false, claims: [] };

  const claim: DocClaim = {
    claimType: "owner_block",
    label: "Doc ownership/contact block",
    snippet: block.snippet,
    location: { startLine: block.startLine, endLine: block.endLine },
  };

  return { ok: true, claims: [claim], primaryClaim: claim };
}

/**
 * Helper: Extract block of text around pattern matches
 */
function extractBlockAroundPatterns(
  text: string,
  patterns: RegExp[],
  maxLines: number
): { snippet: string; startLine: number; endLine: number } | null {
  const lines = text.split('\n');

  for (const pattern of patterns) {
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        const start = i;
        const end = Math.min(lines.length - 1, i + maxLines);

        const snippet = lines.slice(start, end + 1).join('\n');

        return {
          snippet,
          startLine: start + 1,
          endLine: end + 1
        };
      }
    }
  }

  return null;
}
```

#### Swagger (github_swagger) Claim Extraction

Deterministic: use the OpenAPI diff pointers (path/method) and return the previous snippet.

```typescript
function extractSwaggerClaims(args: any): DocClaimResult {
  // If you already parsed OpenAPI, pass structured object;
  // otherwise minimal text excerpt around path.
  const ptr = args.hints?.openApiPointers;

  if (ptr?.path) {
    const loc = findTokenWindow(args.docText, ptr.path, 6);
    if (loc) {
      const claim: DocClaim = {
        claimType: "api_contract_snippet",
        label: `OpenAPI mentions ${ptr.method?.toUpperCase() ?? ""} ${ptr.path}`.trim(),
        snippet: loc.snippet,
        location: { startLine: loc.startLine, endLine: loc.endLine },
        matchedTokens: [ptr.path],
      };
      return { ok: true, claims: [claim], primaryClaim: claim };
    }
  }

  return { ok: false, claims: [] };
}
```

#### Backstage (catalog-info.yaml) Claim Extraction

```typescript
function extractBackstageClaims(args: any): DocClaimResult {
  // Parse YAML and extract owner field
  try {
    const yaml = require('yaml');
    const doc = yaml.parse(args.docText);

    const owner = doc?.spec?.owner;
    if (owner) {
      const loc = findTokenWindow(args.docText, owner, 3);
      if (loc) {
        const claim: DocClaim = {
          claimType: "owner_block",
          label: `Backstage catalog owner`,
          snippet: loc.snippet,
          location: { startLine: loc.startLine, endLine: loc.endLine },
          matchedTokens: [owner],
        };
        return { ok: true, claims: [claim], primaryClaim: claim };
      }
    }
  } catch (e) {
    // Fall back to text search
  }

  return { ok: false, claims: [] };
}
```

#### Code Comments Claim Extraction

```typescript
function extractCodeCommentClaims(args: any): DocClaimResult {
  // Locate relevant docstrings by file path + symbol if you have it
  // Else regex for /** ... */ or /// comments

  const docstringPattern = /\/\*\*[\s\S]*?\*\//g;
  const matches = args.docText.match(docstringPattern);

  if (matches && matches.length > 0) {
    const firstDocstring = matches[0];
    const loc = findTokenWindow(args.docText, firstDocstring.substring(0, 20), 0);

    if (loc) {
      const claim: DocClaim = {
        claimType: "instruction_token",
        label: "Code documentation comment",
        snippet: firstDocstring.substring(0, 200), // Truncate long docstrings
        location: { startLine: loc.startLine, endLine: loc.endLine },
      };
      return { ok: true, claims: [claim], primaryClaim: claim };
    }
  }

  return { ok: false, claims: [] };
}
```

#### Tool Reference Claim Extraction (Environment/Tooling Drift)

```typescript
function extractToolReferenceClaims(args: any): DocClaimResult {
  const tokens: string[] = args.hints?.matchedTokens ?? args.baselineFindings?.matchedTokens ?? [];
  const claims: DocClaim[] = [];

  // Look for tool names (kubectl, docker, npm, etc.)
  for (const t of tokens.slice(0, 3)) {
    const loc = findTokenWindow(args.docText, t, 3);
    if (loc) {
      claims.push({
        claimType: "tool_reference",
        label: `Doc references tool "${t}"`,
        snippet: loc.snippet,
        location: { startLine: loc.startLine, endLine: loc.endLine },
        matchedTokens: [t],
      });
    }
  }

  return { ok: claims.length > 0, claims, primaryClaim: claims[0] };
}
```

#### Coverage Drift Claim Extraction

```typescript
function extractCoverageClaims(args: any): DocClaimResult {
  // Coverage drift means doc DOESN'T mention something
  // So we return a "missing coverage" claim

  const claim: DocClaim = {
    claimType: "missing_coverage",
    label: "Doc does not mention this scenario",
    snippet: "(No existing documentation found for this topic)",
    location: { startLine: 0, endLine: 0 },
  };

  return { ok: true, claims: [claim], primaryClaim: claim };
}
```

---

### C.6 Integration with Verify Reality Slack Message

Update the `buildVerifyRealityBlocks()` function to use `extractDocClaims()`:

```typescript
export function buildVerifyRealityBlocks(input: VerifyRealityInput) {
  // ... existing code ...

  // Extract doc claim using deterministic extraction
  const docClaimResult = extractDocClaims({
    docSystem: input.docSystem,
    driftType: input.driftType,
    docText: input.docText,
    baselineFindings: input.baseline,
    hints: {
      matchedTokens: input.baseline?.matchedTokens,
      headings: input.baseline?.matchedHeadings,
      openApiPointers: input.openApiPointers,
      ownerBlockPatterns: input.ownerBlockPatterns
    }
  });

  const docClaim = docClaimResult.primaryClaim ?? {
    label: 'Current documentation',
    snippet: '(No specific claim extracted)'
  };

  // ... rest of block building with docClaim ...
}
```

This ensures that the "Doc says..." section in Slack messages is:
- **Deterministic** (no LLM hallucination)
- **Source-specific** (handles all doc systems)
- **Drift-type aware** (extracts relevant claim type)
- **Concise** (small snippet, not full doc)

---

### C.7 Enhanced Extractors (Additional Implementations)

#### Improved Backstage Claim Extraction

Deterministic: parse YAML; extract `spec.owner` and show it.

```typescript
function extractBackstageClaims(args: any): DocClaimResult {
  const ownerLine = findTokenWindow(args.docText, "owner:", 4);
  if (!ownerLine) return { ok: false, claims: [] };

  const claim: DocClaim = {
    claimType: "owner_block",
    label: "Backstage owner field",
    snippet: ownerLine.snippet,
    location: { startLine: ownerLine.startLine, endLine: ownerLine.endLine },
  };

  return { ok: true, claims: [claim], primaryClaim: claim };
}
```

#### Enhanced Coverage Drift Claim Extraction

Often "Doc does not mention X" is the reality. That's okay—still deterministic: you prove absence by deterministic keyword scan in relevant sections.

```typescript
function extractCoverageClaims(args: any): DocClaimResult {
  const missing = args.baselineFindings?.missingCoverageTokens ?? args.hints?.matchedTokens ?? [];
  if (missing.length === 0) return { ok: false, claims: [] };

  const token = missing[0];
  const exists = tokenExists(args.docText, token);

  const claim: DocClaim = exists
    ? {
        claimType: "missing_coverage",
        label: `Doc mentions "${token}" (may be incomplete)`,
        snippet: findTokenWindow(args.docText, token, 4)?.snippet ?? "",
        matchedTokens: [token],
      }
    : {
        claimType: "missing_coverage",
        label: `Doc does not mention "${token}"`,
        snippet: "(no match found in target sections)",
        matchedTokens: [token],
      };

  return { ok: true, claims: [claim], primaryClaim: claim };
}

/**
 * Helper: Check if token exists in text
 */
function tokenExists(text: string, token: string): boolean {
  return text.toLowerCase().includes(token.toLowerCase());
}
```

#### Shared Helper Functions

Deterministic line-based utilities (no LLM):

```typescript
/**
 * Find a token in text and return surrounding lines
 * (Already implemented in C.5, included here for completeness)
 */
function findTokenWindow(
  text: string,
  token: string,
  windowLines: number
): { snippet: string; startLine: number; endLine: number } | null {
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(token)) {
      const start = Math.max(0, i - windowLines);
      const end = Math.min(lines.length - 1, i + windowLines);

      const snippet = lines.slice(start, end + 1).join('\n');

      return {
        snippet,
        startLine: start + 1,
        endLine: end + 1
      };
    }
  }

  return null;
}

/**
 * Extract numbered steps or sequential markers
 * (Already implemented in C.5, included here for completeness)
 */
function extractStepSkeleton(text: string): {
  steps: string[];
  preview: string;
  startLine: number;
  endLine: number;
} {
  // Implementation in C.5
}

/**
 * Extract block of text around pattern matches
 * (Already implemented in C.5, included here for completeness)
 */
function extractBlockAroundPatterns(
  text: string,
  patterns: RegExp[],
  maxLines: number
): { snippet: string; startLine: number; endLine: number } | null {
  // Implementation in C.5
}
```

---

### C.8 Deterministic Feedback Loop (Fingerprints + Cooldowns + Suppressions)

This section implements a **deterministic learning loop** that improves accuracy **without ML** and without hallucination risk.

#### The Core Idea

Every Slack verification yields one of:

- **Verified true** (good): increase priority & allow patch
- **False positive**: suppress similar cases for (doc, drift type, token, source)
- **Snooze**: temporarily suppress

**This is not ML. It's rule + store.**

#### Fingerprint Key Format (Stable and Specific)

Generate multiple keys per drift for different suppression levels:

**A) Strict fingerprint** (same doc + same token + same drift type + same source)

```typescript
const strict = sha256(
  workspaceId + "|" + docSystem + "|" + docId + "|" +
  sourceType + "|" + driftType + "|" +
  normalizedKeyToken
);
```

**B) Medium fingerprint** (same doc + drift type + domain)

```typescript
const medium = sha256(
  workspaceId + "|" + docSystem + "|" + docId + "|" +
  driftType + "|" + domainTop
);
```

**C) Broad fingerprint** (workspace + driftType + token)

```typescript
const broad = sha256(
  workspaceId + "|" + driftType + "|" + normalizedKeyToken
);
```

Store all three. On false positives, suppress at strict, sometimes medium, rarely broad.

#### Token Normalization (Critical)

Normalize the "key token" deterministically to avoid fragmentation:

- Ports: `5432`
- Endpoints: normalize `/v1/users/{id}` → `/v1/users/*`
- Tool names: lowercase `circleci`
- Remove whitespace and punctuation

**Implementation:**

Create: `apps/api/src/services/fingerprints/normalize.ts`

```typescript
export function normalizeKeyToken(t: string): string {
  return t
    .trim()
    .toLowerCase()
    .replace(/\{[^}]+\}/g, "*")           // {id} → *
    .replace(/[^\w/*\-.:]/g, "");         // remove special chars
}
```

#### Database Schema for Suppressions

Add to `apps/api/prisma/schema.prisma`:

```prisma
model DriftSuppression {
  id          String   @id @default(uuid())
  workspaceId String   @map("workspace_id")
  fingerprint String
  level       String   // strict|medium|broad
  reason      String   // false_positive|snooze|rate_limit
  createdAt   DateTime @default(now()) @map("created_at")
  expiresAt   DateTime? @map("expires_at")

  count       Int      @default(1)
  lastSeenAt  DateTime @default(now()) @map("last_seen_at")

  @@unique([workspaceId, fingerprint])
  @@index([workspaceId, expiresAt])
  @@map("drift_suppressions")
}
```


#### Deterministic Suppression Check (Early in State Machine)

At `ELIGIBILITY_CHECKED` (or immediately after candidate creation):

Create: `apps/api/src/services/fingerprints/suppressionCheck.ts`

```typescript
import { db } from '../db';

export async function isSuppressed(args: {
  workspaceId: string;
  fingerprints: { strict: string; medium: string; broad: string };
}): Promise<{ suppressed: boolean; level?: string; reason?: string }> {
  const now = new Date();

  const hits = await db.driftSuppression.findMany({
    where: {
      workspaceId: args.workspaceId,
      fingerprint: {
        in: [
          args.fingerprints.strict,
          args.fingerprints.medium,
          args.fingerprints.broad
        ]
      },
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: now } }
      ],
    },
  });

  if (hits.length === 0) return { suppressed: false };

  // Choose most specific hit deterministically
  const order = ["strict", "medium", "broad"];
  hits.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));

  return {
    suppressed: true,
    level: hits[0].level,
    reason: hits[0].reason
  };
}
```

**If suppressed ⇒ mark drift candidate as `SUPPRESSED` and exit.**

#### Update Suppressions Based on Slack Outcomes

Create: `apps/api/src/services/fingerprints/recordOutcome.ts`

**False Positive Handler:**

- Add/extend strict suppression (14–30 days)
- If repeated false positives, upgrade to medium (30–90 days)
- Never auto broad unless extreme spam

```typescript
import { db } from '../db';
import { addDays } from 'date-fns';

export async function recordFalsePositive(args: {
  workspaceId: string;
  fingerprints: { strict: string; medium: string; broad: string };
}) {
  const now = new Date();

  // Add/extend strict suppression for 21 days
  await upsertSuppression(
    args.workspaceId,
    args.fingerprints.strict,
    "strict",
    "false_positive",
    addDays(now, 21)
  );

  // Escalate if strict count > 3
  const strict = await db.driftSuppression.findUnique({
    where: {
      workspaceId_fingerprint: {
        workspaceId: args.workspaceId,
        fingerprint: args.fingerprints.strict
      }
    },
  });

  if ((strict?.count ?? 0) >= 3) {
    await upsertSuppression(
      args.workspaceId,
      args.fingerprints.medium,
      "medium",
      "false_positive",
      addDays(now, 60)
    );
  }
}

async function upsertSuppression(
  workspaceId: string,
  fingerprint: string,
  level: string,
  reason: string,
  expiresAt: Date
) {
  await db.driftSuppression.upsert({
    where: {
      workspaceId_fingerprint: { workspaceId, fingerprint }
    },
    create: {
      workspaceId,
      fingerprint,
      level,
      reason,
      expiresAt,
      count: 1,
      lastSeenAt: new Date()
    },
    update: {
      count: { increment: 1 },
      lastSeenAt: new Date(),
      expiresAt: expiresAt
    }
  });
}
```

**Snooze Handler:**

- Strict suppression for 7 days

```typescript
export async function recordSnooze(args: {
  workspaceId: string;
  fingerprints: { strict: string; medium: string; broad: string };
  days?: number;
}) {
  const now = new Date();
  const snoozeDays = args.days ?? 7;

  await upsertSuppression(
    args.workspaceId,
    args.fingerprints.strict,
    "strict",
    "snooze",
    addDays(now, snoozeDays)
  );
}
```

**Verified True Handler:**

- Optionally *reduce* suppression if exists (or just no-op)
- Record positive outcome for metrics

```typescript
export async function recordVerifiedTrue(args: {
  workspaceId: string;
  fingerprints: { strict: string; medium: string; broad: string };
}) {
  // Optional: remove suppression if it exists
  await db.driftSuppression.deleteMany({
    where: {
      workspaceId: args.workspaceId,
      fingerprint: { in: [args.fingerprints.strict] },
      reason: "snooze" // Only remove snoozes, keep false_positive suppressions
    }
  });

  // Record positive outcome for metrics (optional)
  // Could increment a "verified_true_count" metric
}
```

#### How This Stays "Trustworthy"

- **No hidden model training** - All rules are explicit and configurable
- **Everything is transparent** - You can show "suppressed because false positive on Feb 1"
- **Every decision is reproducible** - Suppression keys are deterministic
- **User-controlled** - Users can view and clear suppressions via UI
- **Auditable** - All suppression events are logged with timestamps and reasons

---

### C.9 Multi-Output Target Awareness in Slack "Verify Reality"

Your Slack message must show **which output target** is being verified.

**Example message structure:**

```
📋 Verify Reality: Deployment Runbook Drift

Doc says...
  From: Confluence > "Production Deployment Runbook"
  Claim: Doc references port "5432"

Reality changed...
  Source: GitHub PR #1234 merged
  Change: Port changed from 5432 → 5433 in docker-compose.yml

Consequence...
  Impact: HIGH
  If not updated: Deployment instructions will fail, causing rollback delays

Target: Confluence Operational_Runbook (direct writeback)

[Verified: Update Needed] [False Positive] [Generate Patch] [Snooze 7d]
```

**Updated Slack block builder:**

```typescript
export function buildVerifyRealityBlocks(input: {
  docSystem: DocSystem;
  docTitle: string;
  docUrl: string;
  docClass?: string;
  driftType: DriftType;
  sourceType: InputSourceType;
  sourceDescription: string;
  impactBand: string;
  consequenceText: string;
  docClaim: DocClaim;
  targetSurface: { artifactType: string; writebackMode: string };
}) {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📋 Verify Reality: ${formatDriftType(input.driftType)} Drift`,
        emoji: true
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Doc says...*\n` +
              `  From: ${formatDocSystem(input.docSystem)} > "${input.docTitle}"\n` +
              `  Claim: ${input.docClaim.label}\n` +
              `\`\`\`\n${input.docClaim.snippet}\n\`\`\``
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Reality changed...*\n` +
              `  Source: ${formatSourceType(input.sourceType)}\n` +
              `  Change: ${input.sourceDescription}`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Consequence...*\n` +
              `  Impact: ${input.impactBand.toUpperCase()}\n` +
              `  If not updated: ${input.consequenceText}`
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Target: ${formatDocSystem(input.docSystem)} ${input.docClass ?? input.targetSurface.artifactType} ` +
                `(${input.targetSurface.writebackMode} writeback) | <${input.docUrl}|View Doc>`
        }
      ]
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "✅ Verified: Update Needed" },
          style: "primary",
          action_id: "verta_verify_true"
        },
        {
          type: "button",
          text: { type: "plain_text", text: "❌ False Positive" },
          style: "danger",
          action_id: "verta_verify_false"
        },
        {
          type: "button",
          text: { type: "plain_text", text: "🔧 Generate Patch" },
          action_id: "verta_generate_patch"
        },
        {
          type: "button",
          text: { type: "plain_text", text: "⏰ Snooze 7d" },
          action_id: "verta_snooze_7d"
        }
      ]
    }
  ];
}
```

---

### C.10 State Machine Integration (Exact Decision Logic)

#### New/Updated Steps (Minimal Delta)

**After DOCS_FETCHED and BASELINE_CHECKED:**

1. **Extract doc claim** (target-specific) using `extractDocClaims()`
2. **Build impact inputs** (source+target aware) using `buildImpactInputs()`
3. **Compute impact** (deterministic rules) using `computeImpact()`
4. **Check suppression** using `isSuppressed()`
5. **Decide routing:**
   - Send **Verify Reality** Slack
   - Or directly queue patch generation (only if very high confidence + low risk)
   - Or digest-only

#### Deterministic Routing Rule

Use a simple deterministic policy:

```typescript
async function handleImpactAssessed(ctx: TransitionContext): Promise<StateTransition> {
  const signal = await prisma.signalEvent.findUnique({
    where: { id: ctx.drift.signalEventId }
  });

  // 1. Build impact inputs
  const impactInputs = buildImpactInputs({
    driftCandidate: ctx.drift,
    signalEvent: signal,
    docContext: {
      baseline: ctx.drift.baselineFindings,
      managedRegion: ctx.drift.managedRegion
    },
    parserArtifacts: {
      openApiDiff: signal.openApiDiff,
      codeownersDiff: signal.codeownersDiff,
      iacSummary: signal.iacSummary,
      pagerdutyNormalized: signal.normalizedData,
      slackCluster: signal.normalizedData,
      alertNormalized: signal.normalizedData
    }
  });

  // 2. Compute impact
  const impact = computeImpact(impactInputs);

  // 3. Generate fingerprints
  const fingerprints = generateFingerprints({
    workspaceId: ctx.drift.workspaceId,
    docSystem: impactInputs.docSystem,
    docId: ctx.drift.docId,
    sourceType: impactInputs.sourceType,
    driftType: impactInputs.driftType,
    domains: impactInputs.domains,
    keyToken: impactInputs.baseline?.matchedTokens?.[0]
  });

  // 4. Check suppression
  const suppression = await isSuppressed({
    workspaceId: ctx.drift.workspaceId,
    fingerprints
  });

  if (suppression.suppressed) {
    await prisma.driftCandidate.update({
      where: { id: ctx.drift.id },
      data: {
        state: "SUPPRESSED",
        suppressionReason: suppression.reason,
        suppressionLevel: suppression.level
      }
    });
    return { nextState: "SUPPRESSED", shouldContinue: false };
  }

  // 5. Store impact assessment
  await prisma.driftCandidate.update({
    where: { id: ctx.drift.id },
    data: {
      impactScore: impact.impactScore,
      impactBand: impact.impactBand,
      impactJson: impact,
      consequenceText: impact.consequenceText,
      impactAssessedAt: new Date()
    }
  });

  // 6. Deterministic routing decision
  const plan = await resolvePlan(ctx.drift);

  // HIGH/CRITICAL impact → always verify first
  if (impact.impactBand === "high" || impact.impactBand === "critical") {
    return { nextState: "SLACK_SENT_VERIFY", shouldContinue: true };
  }

  // Auto-patch if: confidence high + pr_only writeback + plan allows
  const autoPatchThreshold = plan?.thresholds?.autoPatch ?? 0.85;
  const allowAutoPatch = plan?.writeback?.allowAutoPatch ?? false;

  if (
    allowAutoPatch &&
    impactInputs.confidence >= autoPatchThreshold &&
    impactInputs.targetSurface?.writebackMode === "pr_only"
  ) {
    return { nextState: "PATCH_PLANNED", shouldContinue: true };
  }

  // Default: verify reality
  return { nextState: "SLACK_SENT_VERIFY", shouldContinue: true };
}
```


---

### C.11 Implementation Recommendations (Highest Leverage)

If you do nothing else, implement these **3 components** in this exact order:

#### 1. DocClaim Extraction (Week 1, Priority P0)

**Why first:** Enables verify-reality UX across all output targets

**Deliverables:**
- `apps/api/src/services/docs/docClaimExtractor.ts` with all extractors
- Helper functions: `findTokenWindow()`, `extractStepSkeleton()`, `extractBlockAroundPatterns()`
- Unit tests for each doc system (Confluence, Swagger, Backstage, README, Code Comments)

**Effort:** 3-4 days

**Value:** Eliminates LLM hallucination in "Doc says..." section, enables deterministic claim extraction

---

#### 2. Impact Inputs + Impact Engine (Week 1-2, Priority P0)

**Why second:** Creates "insurance/performance" narrative with deterministic consequence scoring

**Deliverables:**
- `apps/api/src/services/impact/types.ts` - Complete type definitions
- `apps/api/src/services/impact/targetSurface.ts` - Target classification
- `apps/api/src/services/impact/buildImpactInputs.ts` - Source-specific adapters
- Update `apps/api/src/services/impact/engine.ts` to use new inputs
- Add impact rules for multi-source/multi-target combinations

**Effort:** 4-5 days

**Value:** Accurate impact scoring across all source types and output targets, enables consequence-driven prioritization

---

#### 3. Suppression Store + Fingerprints (Week 2, Priority P1)

**Why third:** Prevents reviewer fatigue death spiral through deterministic learning

**Deliverables:**
- Database migration for `DriftSuppression` table
- `apps/api/src/services/fingerprints/normalize.ts` - Token normalization
- `apps/api/src/services/fingerprints/suppressionCheck.ts` - Suppression checking
- `apps/api/src/services/fingerprints/recordOutcome.ts` - Outcome handlers
- Update Slack action handlers to record outcomes
- Add suppression check to state machine (ELIGIBILITY_CHECKED)

**Effort:** 3-4 days

**Value:** Reduces false positive fatigue, improves accuracy over time without ML, provides transparent feedback loop

---

### C.12 What This Achieves (Deterministic Comparator Narrative)

Once these 3 components are implemented, your **"deterministic comparator narrative"** becomes very real:

**You're not "writing docs"** - You're reconciling claims across systems

**You have reproducible evidence:**
- Source evidence (PR, incident, alert, Slack cluster)
- Target evidence (doc claim extraction)
- Impact assessment (fired rules + consequence)
- Suppression history (false positives, snoozes)

**You have controlled workflows:**
- Verify-first for high-impact changes
- Auto-patch only for low-risk targets (pr_only writeback)
- Suppression prevents fatigue
- All decisions are auditable

**You differentiate from internal scripts:**
- **Control-plane** (DriftPlan) vs ad-hoc scripts
- **Truth-making** (deterministic comparator) vs LLM guessing
- **Coverage accounting** (CoverageSnapshot) vs silent failures
- **Fatigue reduction** (clustering + suppression) vs alert spam
- **Reproducibility** (Audit Bundle) vs one-off runs
- **Enterprise consistency** (plan templates) vs bespoke per-team

---

### C.13 Summary: Multi-Source/Multi-Target Impact Assessment

This appendix provides **production-ready specifications** for:

**C.1-C.3:** Why multi-source/multi-target matters + type definitions + target classification

**C.4:** `buildImpactInputs()` with 7 source-specific adapters and normalizers

**C.5-C.7:** DocClaim extraction with 8 drift-type and doc-system-specific extractors

**C.8:** Deterministic feedback loop with fingerprints, suppressions, and outcome handlers

**C.9:** Multi-output target awareness in Slack "Verify Reality" messages

**C.10:** State machine integration with exact decision logic

**C.11:** Implementation recommendations (3 components, 10-12 days total)

**C.12:** Deterministic comparator narrative and competitive differentiation

**Key Benefits:**

✅ **Zero LLM hallucination** in doc claim extraction
✅ **Source-aware impact scoring** (PR vs incident vs alert)
✅ **Target-aware risk assessment** (runbook vs API contract vs README)
✅ **Deterministic learning** (suppressions improve accuracy without ML)
✅ **Transparent decisions** (all rules are auditable and reproducible)
✅ **Fatigue reduction** (fingerprints prevent repeated false positives)
✅ **Production-ready code** (15+ TypeScript functions with complete implementations)



---

### C.14 EvidenceBundle Pattern (Reproducible Evidence Artifacts)

This section introduces the **EvidenceBundle** pattern - a critical component that makes all evidence **reproducible, auditable, and LLM-independent**.

#### The Core Problem

Currently, evidence is scattered across:
- `SignalEvent` (PR diffs, incident data, Slack messages)
- `DocContext` (fetched doc text, baseline findings)
- Parser outputs (OpenAPI diffs, CODEOWNERS changes, IaC summaries)

**This creates:**
- Reproducibility gaps (can't replay decisions)
- Debugging difficulty (evidence not in one place)
- LLM dependency (no deterministic excerpts for Slack)

#### The Solution: EvidenceBundle

Create a **single, immutable, deterministic artifact** that contains all evidence needed to:
1. Display in Slack (verify reality message)
2. Feed to LLM (classifier, planner, generator)
3. Audit decisions (reproduce any drift assessment)
4. Debug false positives (see exactly what was compared)

---

### C.15 EvidenceBundle Type Definition

Create: `apps/api/src/services/evidence/types.ts`

```typescript
export type EvidenceBundle = {
  // Metadata
  bundleVersion: string;  // "1.0" for schema versioning
  createdAt: string;      // ISO timestamp
  workspaceId: string;
  driftCandidateId: string;

  // Source evidence (what changed in reality)
  source: {
    type: InputSourceType;

    // GitHub PR evidence
    github?: {
      repo: string;
      prNumber: number;
      prTitle: string;
      merged: boolean;
      mergedAt?: string;
      author: string;
      diffExcerpt: string;        // Deterministic excerpt (max 500 chars)
      pathsChanged: string[];
      keywords: string[];
      changedLines: number;
    };

    // OpenAPI diff evidence
    openApi?: {
      diffSummary: string;        // "3 endpoints removed, 2 breaking changes"
      removedEndpoints: Array<{ method: string; path: string }>;
      addedRequiredParams: Array<{ endpoint: string; param: string }>;
      breakingChanges: Array<{ type: string; description: string }>;
      diffExcerpt: string;        // YAML/JSON diff excerpt
    };

    // CODEOWNERS diff evidence
    codeowners?: {
      diffSummary: string;        // "Owner changed for /services/api"
      ownerChanged: boolean;
      ownerMismatch: boolean;
      changes: Array<{
        path: string;
        oldOwners: string[];
        newOwners: string[];
      }>;
      diffExcerpt: string;
    };

    // IaC evidence
    iac?: {
      diffSummary: string;        // "5 resources changed, 2 risky kinds"
      changedResources: number;
      changedModules: number;
      riskyKinds: string[];       // ["db", "network"]
      changes: Array<{
        resourceType: string;
        resourceName: string;
        changeType: "create" | "update" | "delete";
      }>;
      diffExcerpt: string;
    };

    // PagerDuty incident evidence
    pagerduty?: {
      incidentId: string;
      title: string;
      severity: string;
      durationMinutes: number;
      responders: string[];
      escalations: number;
      timelineExcerpt: string;    // First 3 timeline entries
      postmortemUrl?: string;
      hasPostmortem: boolean;
    };

    // Slack cluster evidence
    slack?: {
      channelName: string;
      messageCount: number;
      uniqueAskers: string[];
      daysSpan: number;
      firstSeen: string;
      lastSeen: string;
      messagesExcerpt: string;    // First 3 messages (anonymized)
      topKeywords: string[];
    };

    // Alert evidence (Datadog/Grafana)
    alert?: {
      alertName: string;
      severity: string;
      occurrences: number;
      recovered: boolean;
      monitorTags: string[];
      descriptionExcerpt: string;
      firstOccurrence: string;
      lastOccurrence: string;
    };
  };

  // Target evidence (what doc currently says)
  target: {
    docSystem: DocSystem;
    docId: string;
    docTitle: string;
    docUrl: string;
    docClass?: string;
    docCategory?: string;

    // Doc claim (deterministic extraction)
    claim: DocClaim;

    // Baseline findings
    baseline?: {
      matchedPatternIds: string[];
      matchedTokens: string[];
      matchedHeadings: string[];
      managedRegionPresent: boolean;
      managedRegionExcerpt?: string;  // First 300 chars of managed region
    };

    // Target surface classification
    surface: {
      artifactType: "runbook" | "api_contract" | "service_catalog" | "developer_doc" | "code_doc" | "knowledge_base";
      writebackMode: "direct" | "pr_only" | "none";
    };
  };

  // Computed assessment (deterministic)
  assessment: {
    driftType: DriftType;
    domains: DriftDomain[];
    confidence: number;
    impactScore: number;
    impactBand: "low" | "medium" | "high" | "critical";
    firedRules: string[];         // Rule IDs that fired
    consequenceText: string;      // Template-generated consequence
  };

  // Fingerprints (for suppression)
  fingerprints: {
    strict: string;
    medium: string;
    broad: string;
  };
};
```

---

### C.16 buildEvidenceBundle() Implementation

Create: `apps/api/src/services/evidence/builder.ts`

```typescript
import { EvidenceBundle } from './types';
import { extractDocClaims } from '../docs/docClaimExtractor';
import { buildImpactInputs } from '../impact/buildImpactInputs';
import { computeImpact } from '../impact/engine';
import { getTargetSurface } from '../impact/targetSurface';
import { generateFingerprints } from '../fingerprints/generate';

export async function buildEvidenceBundle(args: {
  driftCandidate: any;
  signalEvent: any;
  docContext: any;
  parserArtifacts?: {
    openApiDiff?: any;
    codeownersDiff?: any;
    iacSummary?: any;
    pagerdutyNormalized?: any;
    slackCluster?: any;
    alertNormalized?: any;
  };
}): Promise<EvidenceBundle> {
  const { driftCandidate: dc, signalEvent: se, docContext, parserArtifacts } = args;

  // 1. Build source evidence with deterministic excerpts
  const sourceEvidence = buildSourceEvidence(se, parserArtifacts);

  // 2. Extract doc claim (deterministic)
  const docClaimResult = extractDocClaims({
    docSystem: dc.docSystem,
    driftType: dc.driftType,
    docText: docContext.fullText,
    baselineFindings: docContext.baseline,
    hints: {
      matchedTokens: docContext.baseline?.matchedTokens,
      headings: docContext.baseline?.matchedHeadings,
      openApiPointers: parserArtifacts?.openApiDiff?.pointers,
      ownerBlockPatterns: docContext.baseline?.ownerPatterns
    }
  });

  const docClaim = docClaimResult.primaryClaim ?? {
    claimType: 'missing_coverage',
    label: 'No specific claim found',
    snippet: '(No documentation found)'
  };

  // 3. Get target surface
  const targetSurface = getTargetSurface(dc.docSystem, dc.docClass);

  // 4. Build impact inputs and compute impact
  const impactInputs = buildImpactInputs(args);
  const impact = computeImpact(impactInputs);

  // 5. Generate fingerprints
  const fingerprints = generateFingerprints({
    workspaceId: dc.workspaceId,
    docSystem: dc.docSystem,
    docId: dc.docId,
    sourceType: se.sourceType,
    driftType: dc.driftType,
    domains: dc.driftDomains,
    keyToken: docContext.baseline?.matchedTokens?.[0]
  });

  // 6. Assemble bundle
  const bundle: EvidenceBundle = {
    bundleVersion: '1.0',
    createdAt: new Date().toISOString(),
    workspaceId: dc.workspaceId,
    driftCandidateId: dc.id,

    source: sourceEvidence,

    target: {
      docSystem: dc.docSystem,
      docId: dc.docId,
      docTitle: docContext.title ?? 'Untitled',
      docUrl: docContext.url ?? '',
      docClass: dc.docClass,
      docCategory: dc.docCategory,
      claim: docClaim,
      baseline: docContext.baseline ? {
        matchedPatternIds: docContext.baseline.matchedPatternIds ?? [],
        matchedTokens: docContext.baseline.matchedTokens ?? [],
        matchedHeadings: docContext.baseline.matchedHeadings ?? [],
        managedRegionPresent: !!docContext.managedRegion?.present,
        managedRegionExcerpt: docContext.managedRegion?.text?.substring(0, 300)
      } : undefined,
      surface: targetSurface
    },

    assessment: {
      driftType: dc.driftType,
      domains: dc.driftDomains ?? [],
      confidence: dc.confidence ?? 0,
      impactScore: impact.impactScore,
      impactBand: impact.impactBand,
      firedRules: impact.firedRules.map(r => r.id),
      consequenceText: impact.consequenceText
    },

    fingerprints
  };

  return bundle;
}

/**
 * Build source evidence with deterministic excerpts
 */
function buildSourceEvidence(se: any, artifacts?: any): EvidenceBundle['source'] {
  const evidence: EvidenceBundle['source'] = {
    type: se.sourceType
  };

  switch (se.sourceType) {
    case 'github_pr':
      evidence.github = {
        repo: se.repo,
        prNumber: se.prNumber,
        prTitle: se.prTitle ?? `PR #${se.prNumber}`,
        merged: se.merged ?? false,
        mergedAt: se.mergedAt,
        author: se.author ?? 'unknown',
        diffExcerpt: extractDiffExcerpt(se.diff, 500),
        pathsChanged: se.pathsChanged ?? [],
        keywords: se.keywords ?? [],
        changedLines: se.changedLines ?? 0
      };

      // Add OpenAPI diff if present
      if (artifacts?.openApiDiff) {
        evidence.openApi = {
          diffSummary: buildOpenApiSummary(artifacts.openApiDiff),
          removedEndpoints: artifacts.openApiDiff.removed ?? [],
          addedRequiredParams: artifacts.openApiDiff.addedRequired ?? [],
          breakingChanges: artifacts.openApiDiff.breaking ?? [],
          diffExcerpt: extractDiffExcerpt(artifacts.openApiDiff.rawDiff, 500)
        };
      }

      // Add CODEOWNERS diff if present
      if (artifacts?.codeownersDiff) {
        evidence.codeowners = {
          diffSummary: buildCodeownersSummary(artifacts.codeownersDiff),
          ownerChanged: artifacts.codeownersDiff.ownerChanged ?? false,
          ownerMismatch: artifacts.codeownersDiff.ownerMismatch ?? false,
          changes: artifacts.codeownersDiff.changes ?? [],
          diffExcerpt: extractDiffExcerpt(artifacts.codeownersDiff.rawDiff, 300)
        };
      }

      // Add IaC summary if present
      if (artifacts?.iacSummary) {
        evidence.iac = {
          diffSummary: buildIacSummary(artifacts.iacSummary),
          changedResources: artifacts.iacSummary.changedResources ?? 0,
          changedModules: artifacts.iacSummary.changedModules ?? 0,
          riskyKinds: artifacts.iacSummary.riskyKinds ?? [],
          changes: artifacts.iacSummary.changes ?? [],
          diffExcerpt: extractDiffExcerpt(artifacts.iacSummary.rawDiff, 500)
        };
      }
      break;

    case 'pagerduty_incident':
      if (artifacts?.pagerdutyNormalized) {
        const pd = artifacts.pagerdutyNormalized;
        evidence.pagerduty = {
          incidentId: pd.incidentId ?? se.externalId,
          title: pd.title ?? 'Untitled Incident',
          severity: pd.severity ?? 'unknown',
          durationMinutes: pd.durationMinutes ?? 0,
          responders: pd.responders ?? [],
          escalations: pd.escalationCount ?? 0,
          timelineExcerpt: extractTimelineExcerpt(pd.timeline, 3),
          postmortemUrl: pd.postmortemUrl,
          hasPostmortem: !!pd.postmortemUrl
        };
      }
      break;

    case 'slack_cluster':
      if (artifacts?.slackCluster) {
        const sc = artifacts.slackCluster;
        evidence.slack = {
          channelName: sc.channelName ?? 'unknown',
          messageCount: sc.messageCount ?? 0,
          uniqueAskers: sc.uniqueAskers ?? [],
          daysSpan: sc.daysSpan ?? 0,
          firstSeen: sc.firstSeen,
          lastSeen: sc.lastSeen,
          messagesExcerpt: extractMessagesExcerpt(sc.messages, 3),
          topKeywords: sc.topKeywords ?? []
        };
      }
      break;

    case 'datadog_alert':
    case 'grafana_alert':
      if (artifacts?.alertNormalized) {
        const alert = artifacts.alertNormalized;
        evidence.alert = {
          alertName: alert.name ?? 'Untitled Alert',
          severity: alert.severity ?? 'unknown',
          occurrences: alert.occurrences ?? 1,
          recovered: alert.recovered ?? false,
          monitorTags: alert.tags ?? [],
          descriptionExcerpt: alert.description?.substring(0, 300) ?? '',
          firstOccurrence: alert.firstOccurrence,
          lastOccurrence: alert.lastOccurrence
        };
      }
      break;
  }

  return evidence;
}

/**
 * Extract deterministic diff excerpt (max N chars)
 */
function extractDiffExcerpt(diff: string | undefined, maxChars: number): string {
  if (!diff) return '(no diff available)';

  // Take first N chars, break at line boundary
  const excerpt = diff.substring(0, maxChars);
  const lastNewline = excerpt.lastIndexOf('\n');

  return lastNewline > 0
    ? excerpt.substring(0, lastNewline) + '\n...'
    : excerpt + '...';
}

/**
 * Build OpenAPI diff summary
 */
function buildOpenApiSummary(diff: any): string {
  const parts: string[] = [];

  if (diff.removed?.length > 0) {
    parts.push(`${diff.removed.length} endpoint${diff.removed.length > 1 ? 's' : ''} removed`);
  }
  if (diff.addedRequired?.length > 0) {
    parts.push(`${diff.addedRequired.length} required param${diff.addedRequired.length > 1 ? 's' : ''} added`);
  }
  if (diff.breaking?.length > 0) {
    parts.push(`${diff.breaking.length} breaking change${diff.breaking.length > 1 ? 's' : ''}`);
  }

  return parts.length > 0 ? parts.join(', ') : 'OpenAPI changes detected';
}

/**
 * Build CODEOWNERS diff summary
 */
function buildCodeownersSummary(diff: any): string {
  if (diff.ownerMismatch) {
    return `Owner mismatch detected for ${diff.changes?.length ?? 0} path(s)`;
  }
  if (diff.ownerChanged) {
    return `Owner changed for ${diff.changes?.length ?? 0} path(s)`;
  }
  return 'CODEOWNERS changes detected';
}

/**
 * Build IaC summary
 */
function buildIacSummary(summary: any): string {
  const parts: string[] = [];

  if (summary.changedResources > 0) {
    parts.push(`${summary.changedResources} resource${summary.changedResources > 1 ? 's' : ''} changed`);
  }
  if (summary.riskyKinds?.length > 0) {
    parts.push(`${summary.riskyKinds.length} risky kind${summary.riskyKinds.length > 1 ? 's' : ''}`);
  }

  return parts.length > 0 ? parts.join(', ') : 'Infrastructure changes detected';
}

/**
 * Extract timeline excerpt (first N entries)
 */
function extractTimelineExcerpt(timeline: any[] | undefined, maxEntries: number): string {
  if (!timeline || timeline.length === 0) return '(no timeline available)';

  return timeline
    .slice(0, maxEntries)
    .map(entry => `${entry.timestamp}: ${entry.message}`)
    .join('\n');
}

/**
 * Extract messages excerpt (first N messages, anonymized)
 */
function extractMessagesExcerpt(messages: any[] | undefined, maxMessages: number): string {
  if (!messages || messages.length === 0) return '(no messages available)';

  return messages
    .slice(0, maxMessages)
    .map((msg, i) => `User ${i + 1}: ${msg.text?.substring(0, 100)}`)
    .join('\n');
}
```
```

---

### C.17 State Machine Integration (Where to Plug EvidenceBundle)

#### Add/Update State Outputs (No New State Needed)

You can keep your existing states. Just add deterministic artifacts:

**After `DOCS_FETCHED` / `BASELINE_CHECKED`:**

```typescript
async function handleBaselineChecked(ctx: TransitionContext): Promise<StateTransition> {
  const signal = await prisma.signalEvent.findUnique({
    where: { id: ctx.drift.signalEventId }
  });

  const docContext = await fetchDocContext(ctx.drift.docId);

  // NEW: Build EvidenceBundle (deterministic, reproducible)
  const evidenceBundle = await buildEvidenceBundle({
    driftCandidate: ctx.drift,
    signalEvent: signal,
    docContext: docContext,
    parserArtifacts: {
      openApiDiff: signal.openApiDiff,
      codeownersDiff: signal.codeownersDiff,
      iacSummary: signal.iacSummary,
      pagerdutyNormalized: signal.normalizedData,
      slackCluster: signal.normalizedData,
      alertNormalized: signal.normalizedData
    }
  });

  // Store evidence bundle
  await prisma.driftCandidate.update({
    where: { id: ctx.drift.id },
    data: {
      evidenceBundle: evidenceBundle,
      impactScore: evidenceBundle.assessment.impactScore,
      impactBand: evidenceBundle.assessment.impactBand,
      impactJson: evidenceBundle.assessment,
      consequenceText: evidenceBundle.assessment.consequenceText,
      impactAssessedAt: new Date()
    }
  });

  // Check suppression using fingerprints from bundle
  const suppression = await isSuppressed({
    workspaceId: ctx.drift.workspaceId,
    fingerprints: evidenceBundle.fingerprints
  });

  if (suppression.suppressed) {
    await prisma.driftCandidate.update({
      where: { id: ctx.drift.id },
      data: {
        state: "SUPPRESSED",
        suppressionReason: suppression.reason,
        suppressionLevel: suppression.level
      }
    });
    return { nextState: "SUPPRESSED", shouldContinue: false };
  }

  // Continue to impact assessment / Slack verification
  return { nextState: "IMPACT_ASSESSED", shouldContinue: true };
}
```

**When sending Slack message:**

```typescript
async function handleSlackSentVerify(ctx: TransitionContext): Promise<StateTransition> {
  // Load evidence bundle (already computed)
  const bundle = ctx.drift.evidenceBundle as EvidenceBundle;

  // Build Slack message from bundle (deterministic excerpts, no LLM)
  const blocks = buildVerifyRealityBlocksFromBundle(bundle);

  // Send to Slack
  await slackClient.chat.postMessage({
    channel: ctx.drift.slackChannelId,
    blocks: blocks,
    metadata: {
      event_type: "verta_verify_reality",
      event_payload: {
        driftId: ctx.drift.id,
        fingerprints: bundle.fingerprints
      }
    }
  });

  await prisma.driftCandidate.update({
    where: { id: ctx.drift.id },
    data: {
      state: "AWAITING_VERIFICATION",
      slackSentAt: new Date()
    }
  });

  return { nextState: "AWAITING_VERIFICATION", shouldContinue: false };
}
```

**When feeding to LLM (Classifier/Planner/Generator):**

```typescript
async function generatePatch(ctx: TransitionContext): Promise<string> {
  // Load evidence bundle
  const bundle = ctx.drift.evidenceBundle as EvidenceBundle;

  // Build LLM prompt from bundle (same evidence as Slack)
  const prompt = buildPatchPromptFromBundle(bundle);

  // Call LLM
  const patch = await llm.generate({
    model: "claude-sonnet-4",
    messages: [
      { role: "system", content: PATCH_GENERATOR_SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ]
  });

  return patch;
}

function buildPatchPromptFromBundle(bundle: EvidenceBundle): string {
  return `
You are updating documentation to match reality.

**Reality changed:**
${formatSourceEvidence(bundle.source)}

**Doc currently says:**
${bundle.target.claim.snippet}

**Consequence if not updated:**
${bundle.assessment.consequenceText}

**Target doc:**
- System: ${bundle.target.docSystem}
- Title: ${bundle.target.docTitle}
- Type: ${bundle.target.surface.artifactType}

Generate a patch for the managed region that updates the doc to match reality.
`.trim();
}
```

---

### C.18 Database Schema Addition (Recommended)

Add to `apps/api/prisma/schema.prisma`:

```prisma
model DriftCandidate {
  // ... existing fields ...

  // NEW: Evidence bundle (reproducible, auditable)
  evidenceBundle Json? @map("evidence_bundle")

  // ... existing fields ...
}
```

**Alternative: Separate table for better queryability**

```prisma
model EvidenceBundle {
  id                String   @id @default(uuid())
  driftCandidateId  String   @unique @map("drift_candidate_id")
  workspaceId       String   @map("workspace_id")

  bundleVersion     String   @map("bundle_version")
  createdAt         DateTime @default(now()) @map("created_at")

  // Full bundle as JSON
  bundle            Json

  // Indexed fields for querying
  sourceType        String   @map("source_type")
  driftType         String   @map("drift_type")
  impactBand        String   @map("impact_band")

  driftCandidate    DriftCandidate @relation(fields: [driftCandidateId], references: [id], onDelete: Cascade)

  @@index([workspaceId, sourceType])
  @@index([workspaceId, impactBand])
  @@index([createdAt])
  @@map("evidence_bundles")
}
```

**Benefits of separate table:**
- Better queryability (can index on source type, impact band, etc.)
- Easier to version bundle schema
- Can add retention policies (delete old bundles after N days)
- Cleaner separation of concerns

---

### C.19 Slack Message Builder from EvidenceBundle

Create: `apps/api/src/routes/slack/buildVerifyRealityFromBundle.ts`

```typescript
import { EvidenceBundle } from '../../services/evidence/types';

export function buildVerifyRealityBlocksFromBundle(bundle: EvidenceBundle) {
  // Format source evidence (deterministic excerpts)
  const sourceDescription = formatSourceEvidence(bundle.source);

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📋 Verify Reality: ${formatDriftType(bundle.assessment.driftType)} Drift`,
        emoji: true
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Doc says...*\n` +
              `  From: ${formatDocSystem(bundle.target.docSystem)} > "${bundle.target.docTitle}"\n` +
              `  Claim: ${bundle.target.claim.label}\n` +
              `\`\`\`\n${bundle.target.claim.snippet}\n\`\`\``
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Reality changed...*\n` +
              `  Source: ${formatSourceType(bundle.source.type)}\n` +
              `  ${sourceDescription}`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Consequence...*\n` +
              `  Impact: ${bundle.assessment.impactBand.toUpperCase()}\n` +
              `  If not updated: ${bundle.assessment.consequenceText}`
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Target: ${formatDocSystem(bundle.target.docSystem)} ${bundle.target.docClass ?? bundle.target.surface.artifactType} ` +
                `(${bundle.target.surface.writebackMode} writeback) | <${bundle.target.docUrl}|View Doc>`
        }
      ]
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "✅ Verified: Update Needed" },
          style: "primary",
          action_id: "verta_verify_true",
          value: bundle.driftCandidateId
        },
        {
          type: "button",
          text: { type: "plain_text", text: "❌ False Positive" },
          style: "danger",
          action_id: "verta_verify_false",
          value: bundle.driftCandidateId
        },
        {
          type: "button",
          text: { type: "plain_text", text: "🔧 Generate Patch" },
          action_id: "verta_generate_patch",
          value: bundle.driftCandidateId
        },
        {
          type: "button",
          text: { type: "plain_text", text: "⏰ Snooze 7d" },
          action_id: "verta_snooze_7d",
          value: bundle.driftCandidateId
        }
      ]
    }
  ];
}

function formatSourceEvidence(source: EvidenceBundle['source']): string {
  switch (source.type) {
    case 'github_pr':
      if (source.github) {
        return `PR #${source.github.prNumber} merged by ${source.github.author}\n` +
               `Changed: ${source.github.pathsChanged.slice(0, 3).join(', ')}\n` +
               `\`\`\`\n${source.github.diffExcerpt}\n\`\`\``;
      }
      break;

    case 'pagerduty_incident':
      if (source.pagerduty) {
        return `Incident: ${source.pagerduty.title}\n` +
               `Severity: ${source.pagerduty.severity} | Duration: ${source.pagerduty.durationMinutes}min\n` +
               `Responders: ${source.pagerduty.responders.length}\n` +
               `\`\`\`\n${source.pagerduty.timelineExcerpt}\n\`\`\``;
      }
      break;

    case 'slack_cluster':
      if (source.slack) {
        return `${source.slack.messageCount} messages in #${source.slack.channelName}\n` +
               `${source.slack.uniqueAskers.length} unique askers over ${source.slack.daysSpan} days\n` +
               `\`\`\`\n${source.slack.messagesExcerpt}\n\`\`\``;
      }
      break;

    case 'datadog_alert':
    case 'grafana_alert':
      if (source.alert) {
        return `Alert: ${source.alert.alertName}\n` +
               `Severity: ${source.alert.severity} | Occurrences: ${source.alert.occurrences}\n` +
               `Status: ${source.alert.recovered ? 'Recovered' : 'Active'}\n` +
               `\`\`\`\n${source.alert.descriptionExcerpt}\n\`\`\``;
      }
      break;
  }

  return '(Source evidence not available)';
}
```

---

### C.20 Why This Materially Improves Trust + PMF Odds

This makes your product **feel like "insurance/performance", not "chore"**.

**Instead of:**
> "Suggested doc update"

**You can deterministically produce:**

> **Reality changed:** PR changed `DB_PORT=5433` (diff excerpt)
> **Doc says:** runbook still references `5432` (doc claim excerpt)
> **Consequence:** failover script likely fails (deterministic rule mapping)
> **Action:** verify and patch managed region

**Because evidence is deterministic excerpts, you're not asking them to "trust the AI".**

#### Key Trust Improvements

**1. Reproducibility**
- Every decision can be replayed from EvidenceBundle
- No "the AI changed its mind" scenarios
- Audit trail for compliance

**2. Transparency**
- Users see exact excerpts (source + target)
- Fired rules are listed (not black box)
- Consequence is template-based (not hallucinated)

**3. Debuggability**
- False positives can be traced to specific evidence
- Can improve rules based on bundle analysis
- Can A/B test impact scoring changes

**4. LLM Independence**
- Slack messages use zero LLM (all deterministic)
- LLM only used for patch generation (gated by user)
- 40-60% token reduction overall

**5. Fatigue Reduction**
- Suppressions prevent repeated false positives
- Clustering reduces notification volume
- High-quality excerpts reduce cognitive load

---

### C.21 Next Concrete Step (Highest Leverage Milestone)

If you want **one tight milestone** to implement:

✅ **Implement:**

1. **`EvidenceBundle` type + `buildEvidenceBundle()` for all sources** (3-4 days)
   - Complete type definition
   - Builder function with all source-specific extractors
   - Helper functions for excerpts and summaries

2. **Slack preview slicing from `EvidenceBundle` only** (1-2 days)
   - `buildVerifyRealityBlocksFromBundle()`
   - Format functions for each source type
   - Zero LLM dependency

3. **Feed same EvidenceBundle into LLM calls** (1 day)
   - Update Classifier prompt builder
   - Update Planner prompt builder
   - Update Generator prompt builder

**Total: 5-7 days**

**This is the single highest leverage anti-hallucination + anti-fatigue upgrade you can do.**

#### Benefits of This Milestone

✅ **Immediate value:**
- Slack messages become deterministic (no hallucination)
- Evidence is reproducible (audit trail)
- LLM prompts use same evidence (consistency)

✅ **Enables future work:**
- Can add more source types easily (just extend bundle builder)
- Can improve impact rules based on bundle analysis
- Can build analytics dashboard from bundles

✅ **Minimal risk:**
- No state machine changes required
- Backward compatible (bundle is optional field)
- Can roll out incrementally (one source type at a time)

---

### C.22 Summary: EvidenceBundle Pattern + State Machine Integration

This section completes the **EvidenceBundle pattern** - the final piece that ties together multi-source/multi-target impact assessment with reproducible, auditable evidence.

**What we added:**

**C.14:** EvidenceBundle pattern introduction (core problem + solution)

**C.15:** Complete `EvidenceBundle` type definition (185 lines)
- Metadata (version, timestamps, IDs)
- Source evidence (7 source types with deterministic excerpts)
- Target evidence (doc claim + baseline + surface)
- Assessment (impact + fired rules + consequence)
- Fingerprints (for suppression)

**C.16:** `buildEvidenceBundle()` implementation (305 lines)
- Main builder function
- Source-specific evidence builders
- Deterministic excerpt extractors
- Summary builders for OpenAPI, CODEOWNERS, IaC
- Timeline and message excerpt extractors

**C.17:** State machine integration (90 lines)
- Updated `handleBaselineChecked()` to build and store bundle
- Updated `handleSlackSentVerify()` to use bundle
- Updated `generatePatch()` to use bundle
- LLM prompt builder from bundle

**C.18:** Database schema additions (35 lines)
- Option 1: Add `evidenceBundle` JSON field to DriftCandidate
- Option 2: Separate `EvidenceBundle` table with indexes

**C.19:** Slack message builder from bundle (95 lines)
- `buildVerifyRealityBlocksFromBundle()` function
- Source-specific formatters
- Zero LLM dependency

**C.20:** Trust + PMF value proposition (40 lines)
- 5 key trust improvements
- Before/after comparison
- Why deterministic excerpts matter

**C.21:** Implementation milestone (30 lines)
- 3-step plan (5-7 days total)
- Benefits and minimal risk
- Highest leverage anti-hallucination upgrade

**Total new content: ~780 lines of production-ready specifications**

This completes the implementation-level detail for transforming VertaAI from a "docs bot" into a **control-plane + truth-making system** with deterministic impact analysis, reproducible audit trails, multi-source/multi-target awareness, and a feedback loop that improves accuracy without ML or hallucination risk.