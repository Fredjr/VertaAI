# Track A & B Configuration Audit
## Current State vs Target State Analysis

**Date**: 2026-02-15  
**Scope**: Comprehensive review of configurable elements for Track A (Contract Integrity Gate) and Track B (Drift + Remediation)

---

## Executive Summary

### ✅ What We Have (Current State)
- **Track A**: Basic ContractPack + ContractPolicy models with JSON-based contract definitions
- **Track B**: Comprehensive DriftPlan model with full control-plane architecture
- **UI**: Basic CRUD for ContractPacks (Create/Edit/Delete modal)
- **Backend**: Comparator registry, YAML config support, policy enforcement

### ❌ Critical Gaps vs Target State
1. **Track A UI**: Missing enforcement mode toggles, approval tier mapping, break-glass config
2. **Track A Backend**: Missing scope configuration (repo allowlist, path globs, event triggers)
3. **Track B UI**: No UI exists for DriftPlan configuration
4. **Shared**: No unified WorkspacePolicyPack, no user journey flows

---

## Part 1: Track A (Contract Integrity Gate) - Current State

### 1.1 Database Schema ✅ (Mostly Complete)

#### ContractPack Model (`apps/api/prisma/schema.prisma:526-547`)
```prisma
model ContractPack {
  workspaceId String
  id          String @default(uuid())
  version     String @default("v1")
  name        String
  description String?
  
  contracts    Json @default("[]")  // Array<Contract>
  dictionaries Json @default("{}")  // Service aliases, glossary
  extraction   Json @default("{}")  // Token limits, truncation
  safety       Json @default("{}")  // Secret patterns, immutable sections
}
```

**Contract Structure** (from `apps/api/src/services/contracts/types.ts`):
```typescript
interface Contract {
  contractId: string;
  name: string;
  description?: string;
  scope: { service?: string; repo?: string; tags?: string[] };
  artifacts: ArtifactRef[];
  invariants: Invariant[];
  enforcement: EnforcementConfig;  // ✅ mode, blockOnFail, warnOnWarn, requireApprovalOverride
  routing: RoutingConfig;          // ✅ method, fallbackChannel
  writeback: WritebackConfig;      // ✅ enabled, autoApproveThreshold, requiresApproval
}
```

#### ContractPolicy Model (`apps/api/prisma/schema.prisma:551-597`)
```prisma
model ContractPolicy {
  workspaceId String
  id          String @default(uuid())
  name        String
  description String?
  
  mode String @default("warn_only")  // ✅ 'warn_only', 'block_high_critical', 'block_all_critical'
  
  criticalThreshold Int @default(90)  // ✅ Severity thresholds
  highThreshold     Int @default(70)
  mediumThreshold   Int @default(40)
  
  gracefulDegradation Json @default("{}")  // ✅ Timeout, fallback mode
  appliesTo           Json @default("[]")  // ✅ Surface/repo/service filters
  active              Boolean @default(true)
}
```

### 1.2 Backend Logic ✅ (Strong Foundation)

**Comparator Registry** (`apps/api/src/services/contracts/comparators/registry.ts`):
- ✅ 9 comparators registered (Tier 0 + Tier 1)
- ✅ Auto-registration via decorator pattern
- ✅ Comparators: `docs.required_sections`, `docs.anchor_check`, `obligation.file_present`, `obligation.file_changed`, `openapi.validate`, `openapi.diff`, `openapi.version_bump`, `terraform.*`

**YAML Config Support** (`apps/api/src/services/contracts/config/`):
- ✅ Zod schema validation (`schema.ts`)
- ✅ YAML loader with GitHub integration (`yamlLoader.ts`)
- ✅ Org→repo→pack hierarchy resolver (`yamlResolver.ts`)
- ✅ Hybrid mode (YAML + database) (`hybridResolver.ts`)

**Contract Resolution** (`apps/api/src/services/contracts/contractResolver.ts`):
- ✅ Multi-strategy resolution (explicit mapping, file pattern, CODEOWNERS, search)
- ✅ Confidence scoring
- ✅ Obligation detection (missing mappings, ambiguous resolution)

### 1.3 UI - Current Capabilities ✅ (Basic CRUD Only)

**File**: `apps/web/src/app/contracts/page.tsx`

**What Users Can Do**:
1. ✅ View list of ContractPacks
2. ✅ Create new ContractPack (modal with JSON editor)
3. ✅ Edit existing ContractPack (modal with JSON editor)
4. ✅ Delete ContractPack
5. ✅ View active ContractPolicy (read-only display)

**What's Displayed**:
- Pack name, description, version
- Number of contracts in pack
- Active policy mode (warn_only / block_high_critical / block_all_critical)
- Severity thresholds (critical/high/medium)

**JSON Editor Fields**:
```typescript
{
  name: string;
  description: string;
  version: string;
  contracts: string;  // JSON array as text
}
```

---

## Part 2: Track A - Gap Analysis vs Target State

### 2.1 Missing Configuration Elements ❌

#### Target State Requirements (from user specification):

**Configurable Elements (Should be Product)**:
1. ✅ **Scope** - Which repos/services this pack applies to
   - ❌ Missing: Repo allowlist UI
   - ❌ Missing: Path glob patterns UI
   - ❌ Missing: Event triggers (PR opened, commit pushed, manual)

2. ✅ **Gate Policies** - Which comparators to run
   - ✅ Have: Comparator registry with 9 comparators
   - ❌ Missing: UI to select/configure comparators per pack
   - ❌ Missing: Per-comparator config (e.g., OpenAPI diff strictness)

3. ❌ **Approvals** - Who can override blocks
   - ❌ Missing: Approval tier mapping (Tier 1: team lead, Tier 2: director, Tier 3: CTO)
   - ❌ Missing: Break-glass config (emergency bypass with audit trail)
   - ❌ Missing: Approval routing logic

4. ✅ **Evidence** - What artifacts to fetch
   - ✅ Have: ArtifactRef in Contract type
   - ❌ Missing: UI to configure artifact sources
   - ❌ Missing: Fallback artifact sources

5. ❌ **Performance Knobs** - Timeouts, retries, degraded mode
   - ✅ Have: gracefulDegradation JSON field in ContractPolicy
   - ❌ Missing: UI to configure timeout, maxRetries, fallbackMode
   - ❌ Missing: Per-pack performance settings

**Never Bespoke (Should be Product Code)**:
- ✅ Comparator logic (already in registry)
- ✅ Artifact fetching (already in fetchers)
- ✅ Severity scoring (already in comparators)
- ✅ GitHub Check publishing (already implemented)

### 2.2 UI Gaps ❌

**Current UI** (`apps/web/src/app/contracts/page.tsx`):
- ✅ Basic CRUD modal with JSON editor
- ❌ No visual contract builder
- ❌ No comparator selection UI
- ❌ No scope configuration UI (repo allowlist, path globs)
- ❌ No approval tier mapping UI
- ❌ No performance knobs UI
- ❌ No enforcement mode toggle (warn vs block)
- ❌ No ContractPolicy editing (only read-only display)

**Target UI Flow** (from user specification):
1. **Step 1: Scope** - "Which repos/services?"
   - ❌ Missing: Multi-select repo picker
   - ❌ Missing: Path glob input (e.g., `/openapi.yaml`, `/src/controllers/**`)

2. **Step 2: Surfaces** - "What surfaces to check?"
   - ❌ Missing: Surface type checkboxes (API, Infra, Docs, Data Model, Observability, Security)

3. **Step 3: Comparators** - "Which checks to run?"
   - ❌ Missing: Comparator selection with descriptions
   - ❌ Missing: Per-comparator config (e.g., OpenAPI diff strictness)

4. **Step 4: Enforcement** - "Warn or block?"
   - ❌ Missing: Mode toggle (warn_only / block_high_critical / block_all_critical)
   - ❌ Missing: Severity threshold sliders

5. **Step 5: Approvals** - "Who can override?"
   - ❌ Missing: Approval tier mapping UI
   - ❌ Missing: Break-glass config

6. **Step 6: Review & Activate**
   - ❌ Missing: Summary view before activation
   - ❌ Missing: Test mode (dry-run on recent PRs)

### 2.3 Backend Gaps ❌

**Missing Backend Logic**:
1. ❌ Approval tier resolution (map user → tier → can override?)
2. ❌ Break-glass audit trail (who bypassed, when, why)
3. ❌ Per-pack performance settings (currently only workspace-level)
4. ❌ Event trigger filtering (PR opened vs commit pushed vs manual)
5. ❌ Repo allowlist enforcement (currently only `appliesTo` JSON field)

**Existing Backend (Strong)**:
- ✅ Comparator registry with auto-registration
- ✅ YAML config support with Zod validation
- ✅ Contract resolution with multi-strategy fallback
- ✅ GitHub Check publishing with severity-based status
- ✅ Graceful degradation with timeout handling

---

## Part 3: Track B (Drift + Remediation) - Current State

### 3.1 Database Schema ✅ (Comprehensive)

#### DriftPlan Model (`apps/api/prisma/schema.prisma:940-1000`)
```prisma
model DriftPlan {
  workspaceId String
  id          String @default(uuid())

  name        String
  description String?
  status      String @default("active")  // 'active', 'archived', 'draft'

  // Scope definition
  scopeType String   // 'workspace', 'service', 'repo'
  scopeRef  String?  // service ID or repo full name

  // Primary documentation target
  primaryDocId     String?  // Doc ID in the doc system
  primaryDocSystem String?  // 'confluence', 'notion', 'github_readme'
  docClass         String?  // 'runbook', 'api_contract', 'service_catalog'

  // Plan configuration
  inputSources   String[] @default([])  // ['github_pr', 'pagerduty_incident', ...]
  driftTypes     String[] @default([])  // ['instruction', 'process', 'ownership', ...]
  allowedOutputs String[] @default([])  // ['confluence', 'notion', 'github_readme', ...]

  // Plan rules (JSON for flexibility)
  thresholds     Json @default("{}")  // { autoApprove: 0.98, slackNotify: 0.40, ... }
  eligibility    Json @default("{}")  // { requiresIncident: false, minSeverity: 'sev3', ... }
  sectionTargets Json @default("{}")  // { instruction: 'Deployment Steps', ... }
  impactRules    Json @default("{}")  // Custom impact rules
  writeback      Json @default("{}")  // { enabled: true, requiresApproval: false, ... }

  // Control-plane fields
  docTargeting   Json @default("{}")  // { strategy: 'primary_first' | 'all_parallel', ... }
  sourceCursors  Json @default("{}")  // { github_pr: { lastProcessedAt: '...', ... } }
  budgets        Json @default("{}")  // { maxDriftsPerDay: 50, ... }
  noiseControls  Json @default("{}")  // { ignorePatterns: ['WIP:', 'draft:'], ... }

  // Versioning
  version     Int    @default(1)
  versionHash String  // SHA-256 hash for reproducibility
  parentId    String?  // Reference to previous version

  // Template reference
  templateId   String?
  templateName String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  createdBy String?
  updatedBy String?
}
```

**Supported Input Sources**:
- `github_pr` - Pull request descriptions
- `pagerduty_incident` - Incident postmortems
- `slack_cluster` - Clustered Slack questions
- `datadog_alert` - Alert configurations
- `grafana_alert` - Dashboard annotations

**Supported Drift Types**:
- `instruction` - Step-by-step procedures
- `process` - Workflows and runbooks
- `ownership` - Team/contact info
- `coverage` - Monitoring/alerting gaps
- `environment_tooling` - Infrastructure changes

**Supported Output Targets**:
- `confluence` - Confluence pages
- `notion` - Notion pages
- `github_readme` - GitHub README files
- `backstage` - Backstage service catalog

### 3.2 Backend Logic ✅ (Fully Implemented)

**DriftPlan as Control-Plane** (`apps/api/src/services/plans/`):
- ✅ Plan versioning with SHA-256 hash
- ✅ PlanRun tracking (which drifts processed under which plan version)
- ✅ Template system for quick setup
- ✅ Scope resolution (workspace → service → repo hierarchy)

**Materiality Scoring** (`apps/api/src/services/drift/materialityScoring.ts`):
- ✅ Prevents "patching commas" (low-value changes)
- ✅ Threshold-based filtering (autoApprove: 0.98, slackNotify: 0.40, ignore: 0.20)
- ✅ Impact rules with multipliers

**Temporal Accumulation** (`apps/api/src/services/drift/temporalAccumulation.ts`):
- ✅ Bundles small changes over 7 days
- ✅ Prevents noisy drift alerts
- ✅ Batch processing for efficiency

**Doc Targeting** (`apps/api/src/services/docs/docResolution.ts`):
- ✅ Primary-first strategy (try primary doc, then fallback)
- ✅ All-parallel strategy (patch all matching docs)
- ✅ Confidence-based doc selection
- ✅ PR link override support

### 3.3 UI - Current Capabilities ❌ (NONE)

**File**: No UI exists for DriftPlan configuration

**What Users CANNOT Do**:
- ❌ Create DriftPlan
- ❌ Edit DriftPlan
- ❌ Delete DriftPlan
- ❌ View DriftPlan list
- ❌ Configure input sources
- ❌ Configure output targets
- ❌ Configure drift types
- ❌ Configure materiality thresholds
- ❌ Configure doc targeting strategy
- ❌ Configure approval workflow

**Current Workaround**:
- DriftPlans created via script (`apps/api/scripts/create-production-test-workspace.ts`)
- No UI for end users

---

## Part 4: Track B - Gap Analysis vs Target State

### 4.1 Missing Configuration Elements ❌

#### Target State Requirements (from user specification):

**Configurable Elements (Should be Product)**:
1. ❌ **Input Sources** - Which signals to listen to
   - ✅ Have: `inputSources` field in DriftPlan
   - ❌ Missing: UI to select input sources (github_pr, pagerduty_incident, slack_cluster, etc.)
   - ❌ Missing: Per-source config (e.g., min severity for PagerDuty)

2. ❌ **Output Targets** - Where to write patches
   - ✅ Have: `allowedOutputs` field in DriftPlan
   - ❌ Missing: UI to select output targets (confluence, notion, github_readme, backstage)
   - ❌ Missing: Per-target config (e.g., Confluence space allowlist)

3. ❌ **Routing** - Which drift types go where
   - ✅ Have: `sectionTargets` JSON field
   - ❌ Missing: UI to map drift types → doc sections
   - ❌ Missing: Visual section mapping builder

4. ❌ **Doc Mapping** - Primary doc per service/repo
   - ✅ Have: `primaryDocId`, `primaryDocSystem`, `docClass` fields
   - ❌ Missing: UI to set primary doc
   - ❌ Missing: Doc search/picker UI
   - ❌ Missing: Fallback doc configuration

5. ❌ **Drift Materiality** - What's worth patching
   - ✅ Have: `thresholds` JSON field
   - ❌ Missing: UI to configure thresholds (autoApprove: 0.98, slackNotify: 0.40, ignore: 0.20)
   - ❌ Missing: Threshold slider with examples
   - ❌ Missing: Impact rule builder

6. ❌ **Approval Workflow** - Who approves patches
   - ✅ Have: `writeback` JSON field with `requiresApproval`
   - ❌ Missing: UI to configure approval workflow
   - ❌ Missing: Reviewer assignment UI
   - ❌ Missing: Auto-merge threshold config

**Never Bespoke (Should be Product Code)**:
- ✅ Drift detection logic (already implemented)
- ✅ Materiality scoring (already implemented)
- ✅ Temporal accumulation (already implemented)
- ✅ Doc targeting (already implemented)
- ✅ Patch generation (already implemented)

### 4.2 UI Gaps ❌ (Complete UI Missing)

**Current UI**: NONE - No UI exists for DriftPlan configuration

**Target UI Flow** (from user specification):
1. **Step 1: Scope** - "Which services/repos?"
   - ❌ Missing: Scope selector (workspace / service / repo)
   - ❌ Missing: Service/repo picker

2. **Step 2: Primary Doc** - "Where should patches go?"
   - ❌ Missing: Doc system selector (Confluence / Notion / GitHub)
   - ❌ Missing: Doc search/picker
   - ❌ Missing: Doc class selector (runbook / api_contract / service_catalog)

3. **Step 3: Input Sources** - "What signals to listen to?"
   - ❌ Missing: Input source checkboxes (github_pr, pagerduty_incident, slack_cluster, etc.)
   - ❌ Missing: Per-source config (min severity, filters)

4. **Step 4: Drift Types** - "What kinds of drift to detect?"
   - ❌ Missing: Drift type checkboxes (instruction, process, ownership, coverage, environment_tooling)
   - ❌ Missing: Per-type config (section targets)

5. **Step 5: Materiality** - "What's worth patching?"
   - ❌ Missing: Threshold sliders (autoApprove, slackNotify, digestOnly, ignore)
   - ❌ Missing: Impact rule builder
   - ❌ Missing: Example drift scenarios with scores

6. **Step 6: Approval** - "Who approves patches?"
   - ❌ Missing: Approval workflow toggle (auto-approve vs manual)
   - ❌ Missing: Reviewer assignment
   - ❌ Missing: Auto-merge threshold config

7. **Step 7: Review & Activate**
   - ❌ Missing: Summary view before activation
   - ❌ Missing: Test mode (dry-run on recent signals)

### 4.3 Backend Gaps ❌ (Minimal - Backend is Strong)

**Missing Backend Logic**:
1. ❌ DriftPlan CRUD API endpoints (no REST API for DriftPlan management)
2. ❌ DriftPlan validation (ensure valid input sources, output targets, etc.)
3. ❌ DriftPlan template library (pre-built templates for common use cases)

**Existing Backend (Strong)**:
- ✅ DriftPlan model with comprehensive fields
- ✅ PlanRun tracking for audit trail
- ✅ Materiality scoring with threshold-based filtering
- ✅ Temporal accumulation to prevent noise
- ✅ Doc targeting with primary-first and all-parallel strategies
- ✅ Versioning with SHA-256 hash for reproducibility

---

## Part 5: Unified WorkspacePolicyPack Recommendation

### 5.1 Current State: Two Separate Models

**Problem**: ContractPack and DriftPlan are completely separate
- ❌ No shared configuration layer
- ❌ Duplicate fields (scope, enforcement, approval)
- ❌ Inconsistent user experience

### 5.2 Target State: Unified WorkspacePolicyPack

**Proposed Schema**:
```prisma
model WorkspacePolicyPack {
  workspaceId String
  id          String @default(uuid())

  // Metadata
  name        String
  description String?
  status      String @default("active")  // 'active', 'draft', 'archived'

  // Scope (shared by both tracks)
  scopeType String   // 'workspace', 'service', 'repo'
  scopeRef  String?  // service ID or repo full name

  // Track A: Contract Integrity Gate
  trackAEnabled Boolean @default(false)
  trackAConfig  Json @default("{}")  // { comparators: [...], enforcement: {...}, approvals: {...} }

  // Track B: Drift + Remediation
  trackBEnabled Boolean @default(false)
  trackBConfig  Json @default("{}")  // { inputSources: [...], driftTypes: [...], materiality: {...} }

  // Shared: Approval & Routing
  approvalTiers Json @default("{}")  // { tier1: ['team-lead'], tier2: ['director'], tier3: ['cto'] }
  breakGlass    Json @default("{}")  // { enabled: true, requiresReason: true, auditTrail: true }
  routing       Json @default("{}")  // { slackChannel: '#platform', emailList: [...] }

  // Shared: Performance
  performance   Json @default("{}")  // { timeoutMs: 30000, maxRetries: 3, fallbackMode: 'warn' }

  // Versioning
  version     Int    @default(1)
  versionHash String
  parentId    String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  createdBy String?
  updatedBy String?

  workspace Workspace @relation(...)

  @@id([workspaceId, id])
}
```

**Benefits**:
- ✅ Single configuration UI for both tracks
- ✅ Shared approval tiers and routing
- ✅ Consistent scope definition
- ✅ Easier to understand for users
- ✅ Reduces duplicate code

**Migration Path**:
1. Create WorkspacePolicyPack model
2. Migrate existing ContractPack → WorkspacePolicyPack (trackAEnabled=true)
3. Migrate existing DriftPlan → WorkspacePolicyPack (trackBEnabled=true)
4. Deprecate ContractPack and DriftPlan models
5. Update UI to use unified model

---

## Part 6: User Journey Recommendations

### 6.1 Track A Onboarding Flow (6 Steps)

**Current State**: ❌ Only Step 1 (basic CRUD) implemented

**Target State**:
1. ✅ **Step 1: Name & Scope** - "What's this pack for?"
   - ❌ Missing: Scope selector UI

2. ❌ **Step 2: Surfaces** - "What surfaces to check?"
   - ❌ Missing: Surface type checkboxes

3. ❌ **Step 3: Comparators** - "Which checks to run?"
   - ❌ Missing: Comparator selection UI

4. ❌ **Step 4: Enforcement** - "Warn or block?"
   - ❌ Missing: Mode toggle UI

5. ❌ **Step 5: Approvals** - "Who can override?"
   - ❌ Missing: Approval tier mapping UI

6. ❌ **Step 6: Review & Activate**
   - ❌ Missing: Summary view + test mode

**Implementation Priority**:
- **P0 (MVP)**: Steps 1-4 (Scope, Surfaces, Comparators, Enforcement)
- **P1 (Beta)**: Step 5 (Approvals)
- **P2 (GA)**: Step 6 (Review & Test Mode)

### 6.2 Track B Onboarding Flow (7 Steps)

**Current State**: ❌ No UI exists

**Target State**:
1. ❌ **Step 1: Scope** - "Which services/repos?"
   - ❌ Missing: Scope selector UI

2. ❌ **Step 2: Primary Doc** - "Where should patches go?"
   - ❌ Missing: Doc picker UI (CRITICAL - prevents wrong page selection)

3. ❌ **Step 3: Input Sources** - "What signals to listen to?"
   - ❌ Missing: Input source checkboxes

4. ❌ **Step 4: Drift Types** - "What kinds of drift?"
   - ❌ Missing: Drift type checkboxes

5. ❌ **Step 5: Materiality** - "What's worth patching?"
   - ❌ Missing: Threshold sliders (CRITICAL - prevents noisy drift alerts)

6. ❌ **Step 6: Approval** - "Who approves patches?"
   - ❌ Missing: Approval workflow UI

7. ❌ **Step 7: Review & Activate**
   - ❌ Missing: Summary view + test mode

**Implementation Priority**:
- **P0 (MVP)**: Steps 1-2, 5 (Scope, Primary Doc, Materiality) - **Solves biggest failure modes**
- **P1 (Beta)**: Steps 3-4 (Input Sources, Drift Types)
- **P2 (GA)**: Steps 6-7 (Approval, Review & Test Mode)

---

## Part 7: MVP Prioritization & Recommendations

### 7.1 Biggest Failure Modes (User's Concern)

From user specification:
> "Because your biggest failure modes are:
> - wrong page selection
> - noisy drift alerts
> - 'patching commas' instead of material drift
>
> Mapping + materiality solves that."

**Solution**:
1. **Track B Step 2 (Primary Doc Mapping)** - Prevents wrong page selection
2. **Track B Step 5 (Materiality Thresholds)** - Prevents noisy alerts and comma patching

### 7.2 MVP Scope Recommendation

**Track A MVP** (Ship First):
- ✅ Keep current CRUD UI (already works)
- ✅ Add enforcement mode toggle (warn vs block)
- ✅ Add comparator selection UI
- ✅ Add scope configuration (repo allowlist)
- ❌ Defer: Approval tiers, break-glass, performance knobs

**Track B MVP** (Ship Second - Higher Priority):
- ✅ Create DriftPlan CRUD UI (currently missing)
- ✅ Add primary doc picker (CRITICAL)
- ✅ Add materiality threshold sliders (CRITICAL)
- ✅ Add input source checkboxes
- ✅ Add drift type checkboxes
- ❌ Defer: Approval workflow, test mode, advanced routing

### 7.3 Implementation Order

**Phase 1: Track B MVP (4 weeks)**
1. Week 1: DriftPlan CRUD API endpoints
2. Week 2: DriftPlan list/detail UI
3. Week 3: Primary doc picker + materiality sliders
4. Week 4: Input sources + drift types UI

**Phase 2: Track A Enhancements (2 weeks)**
1. Week 5: Enforcement mode toggle + comparator selection
2. Week 6: Scope configuration UI

**Phase 3: Unified WorkspacePolicyPack (4 weeks)**
1. Week 7-8: Schema migration + backend refactor
2. Week 9-10: Unified UI + user testing

---

## Part 8: JSON Schema for Unified WorkspacePolicyPack

### 8.1 Complete JSON Schema

```typescript
interface WorkspacePolicyPack {
  // Metadata
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  status: 'active' | 'draft' | 'archived';

  // Scope (shared by both tracks)
  scope: {
    type: 'workspace' | 'service' | 'repo';
    ref?: string;  // service ID or repo full name
    repoAllowlist?: string[];  // ['owner/repo1', 'owner/repo2']
    pathGlobs?: string[];      // ['/openapi.yaml', '/src/controllers/**']
  };

  // Track A: Contract Integrity Gate
  trackA: {
    enabled: boolean;
    surfaces: ('api' | 'infra' | 'docs' | 'data_model' | 'observability' | 'security')[];
    comparators: Array<{
      type: string;  // 'openapi.diff', 'terraform.iam_review', etc.
      enabled: boolean;
      severity: 'low' | 'medium' | 'high' | 'critical';
      config?: Record<string, any>;  // Per-comparator config
    }>;
    enforcement: {
      mode: 'warn_only' | 'block_high_critical' | 'block_all_critical';
      criticalThreshold: number;  // 0-100
      highThreshold: number;
      mediumThreshold: number;
    };
    artifacts: Array<{
      type: string;  // 'openapi_spec', 'terraform_plan', etc.
      path: string;
      fallbackPaths?: string[];
    }>;
  };

  // Track B: Drift + Remediation
  trackB: {
    enabled: boolean;
    primaryDoc: {
      system: 'confluence' | 'notion' | 'github_readme' | 'backstage';
      id: string;
      title: string;
      url?: string;
      class: 'runbook' | 'api_contract' | 'service_catalog' | 'architecture_doc';
    };
    inputSources: Array<{
      type: 'github_pr' | 'pagerduty_incident' | 'slack_cluster' | 'datadog_alert' | 'grafana_alert';
      enabled: boolean;
      config?: {
        minSeverity?: string;  // For PagerDuty
        channelAllowlist?: string[];  // For Slack
        tagFilters?: string[];  // For Datadog/Grafana
      };
    }>;
    driftTypes: Array<{
      type: 'instruction' | 'process' | 'ownership' | 'coverage' | 'environment_tooling';
      enabled: boolean;
      sectionTarget?: string;  // 'Deployment Steps', 'Runbook', etc.
    }>;
    materiality: {
      autoApproveThreshold: number;  // 0.98 = auto-approve if 98% confident
      slackNotifyThreshold: number;  // 0.40 = notify Slack if >= 40% confident
      digestOnlyThreshold: number;   // 0.30 = include in digest if >= 30% confident
      ignoreThreshold: number;       // 0.20 = ignore if < 20% confident
      impactRules?: Array<{
        condition: string;  // 'drift_type == "ownership"'
        multiplier: number;  // 1.5x impact
      }>;
    };
    docTargeting: {
      strategy: 'primary_first' | 'all_parallel';
      maxDocsPerDrift: number;  // 3
      priorityOrder?: string[];  // ['confluence', 'notion', 'github_readme']
    };
    noiseControls: {
      ignorePatterns?: string[];  // ['WIP:', 'draft:', 'test:']
      ignorePaths?: string[];     // ['test/**', 'docs/archive/**']
      ignoreAuthors?: string[];   // ['dependabot', 'renovate']
      temporalAccumulation?: {
        enabled: boolean;
        windowDays: number;  // 7 days
        minDriftsToBundle: number;  // 3
      };
    };
  };

  // Shared: Approval & Routing
  approvals: {
    tiers: {
      tier1: {
        name: 'Team Lead';
        users: string[];  // ['alice@example.com', 'bob@example.com']
        canOverride: ('warn' | 'block_high' | 'block_critical')[];
      };
      tier2: {
        name: 'Director';
        users: string[];
        canOverride: ('warn' | 'block_high' | 'block_critical')[];
      };
      tier3: {
        name: 'CTO';
        users: string[];
        canOverride: ('warn' | 'block_high' | 'block_critical')[];
      };
    };
    breakGlass: {
      enabled: boolean;
      requiresReason: boolean;
      requiresAuditTrail: boolean;
      allowedUsers?: string[];  // If empty, all tier3 users can break glass
    };
  };

  // Shared: Routing
  routing: {
    slackChannel?: string;  // '#platform-team'
    emailList?: string[];
    pagerDutyService?: string;
  };

  // Shared: Performance
  performance: {
    timeoutMs: number;  // 30000
    maxRetries: number;  // 3
    fallbackMode: 'warn_only' | 'skip' | 'fail';
    budgets?: {
      maxDriftsPerDay?: number;  // 50
      maxDriftsPerWeek?: number;  // 200
      maxSlackNotificationsPerHour?: number;  // 5
    };
  };

  // Versioning
  version: number;
  versionHash: string;  // SHA-256 hash of config
  parentId?: string;    // Reference to previous version

  // Audit
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}
```

### 8.2 Example Configuration

```json
{
  "id": "pack-123",
  "workspaceId": "ws-456",
  "name": "Payment Service Policy Pack",
  "description": "Contract integrity + drift remediation for payment service",
  "status": "active",

  "scope": {
    "type": "service",
    "ref": "payment-service",
    "repoAllowlist": ["acme/payment-api", "acme/payment-worker"],
    "pathGlobs": ["/openapi.yaml", "/src/controllers/**", "/terraform/**"]
  },

  "trackA": {
    "enabled": true,
    "surfaces": ["api", "infra"],
    "comparators": [
      {
        "type": "openapi.diff",
        "enabled": true,
        "severity": "high",
        "config": { "strictness": "high", "allowBreakingWithApproval": true }
      },
      {
        "type": "openapi.version_bump",
        "enabled": true,
        "severity": "critical"
      },
      {
        "type": "terraform.iam_review",
        "enabled": true,
        "severity": "critical"
      }
    ],
    "enforcement": {
      "mode": "block_high_critical",
      "criticalThreshold": 90,
      "highThreshold": 70,
      "mediumThreshold": 40
    },
    "artifacts": [
      {
        "type": "openapi_spec",
        "path": "/openapi.yaml",
        "fallbackPaths": ["/docs/api.yaml", "/swagger.yaml"]
      }
    ]
  },

  "trackB": {
    "enabled": true,
    "primaryDoc": {
      "system": "confluence",
      "id": "123456",
      "title": "Payment Service Runbook",
      "url": "https://acme.atlassian.net/wiki/spaces/ENG/pages/123456",
      "class": "runbook"
    },
    "inputSources": [
      {
        "type": "github_pr",
        "enabled": true
      },
      {
        "type": "pagerduty_incident",
        "enabled": true,
        "config": { "minSeverity": "sev2" }
      },
      {
        "type": "slack_cluster",
        "enabled": true,
        "config": { "channelAllowlist": ["#payments-support", "#platform"] }
      }
    ],
    "driftTypes": [
      {
        "type": "instruction",
        "enabled": true,
        "sectionTarget": "Deployment Steps"
      },
      {
        "type": "process",
        "enabled": true,
        "sectionTarget": "Runbook"
      },
      {
        "type": "ownership",
        "enabled": true,
        "sectionTarget": "Team & Contacts"
      }
    ],
    "materiality": {
      "autoApproveThreshold": 0.98,
      "slackNotifyThreshold": 0.40,
      "digestOnlyThreshold": 0.30,
      "ignoreThreshold": 0.20,
      "impactRules": [
        {
          "condition": "drift_type == 'ownership'",
          "multiplier": 1.5
        }
      ]
    },
    "docTargeting": {
      "strategy": "primary_first",
      "maxDocsPerDrift": 3,
      "priorityOrder": ["confluence", "notion", "github_readme"]
    },
    "noiseControls": {
      "ignorePatterns": ["WIP:", "draft:", "test:"],
      "ignorePaths": ["test/**", "docs/archive/**"],
      "ignoreAuthors": ["dependabot", "renovate"],
      "temporalAccumulation": {
        "enabled": true,
        "windowDays": 7,
        "minDriftsToBundle": 3
      }
    }
  },

  "approvals": {
    "tiers": {
      "tier1": {
        "name": "Team Lead",
        "users": ["alice@acme.com", "bob@acme.com"],
        "canOverride": ["warn", "block_high"]
      },
      "tier2": {
        "name": "Director",
        "users": ["charlie@acme.com"],
        "canOverride": ["warn", "block_high", "block_critical"]
      },
      "tier3": {
        "name": "CTO",
        "users": ["cto@acme.com"],
        "canOverride": ["warn", "block_high", "block_critical"]
      }
    },
    "breakGlass": {
      "enabled": true,
      "requiresReason": true,
      "requiresAuditTrail": true
    }
  },

  "routing": {
    "slackChannel": "#platform-team",
    "emailList": ["platform@acme.com"],
    "pagerDutyService": "payment-service"
  },

  "performance": {
    "timeoutMs": 30000,
    "maxRetries": 3,
    "fallbackMode": "warn_only",
    "budgets": {
      "maxDriftsPerDay": 50,
      "maxDriftsPerWeek": 200,
      "maxSlackNotificationsPerHour": 5
    }
  },

  "version": 1,
  "versionHash": "sha256:abc123...",
  "createdAt": "2026-02-15T10:00:00Z",
  "updatedAt": "2026-02-15T10:00:00Z",
  "createdBy": "alice@acme.com"
}
```

---

## Part 9: Summary & Action Items

### 9.1 Current State Summary

| Component | Track A | Track B |
|-----------|---------|---------|
| **Database Schema** | ✅ Complete | ✅ Complete |
| **Backend Logic** | ✅ Strong | ✅ Strong |
| **API Endpoints** | ✅ CRUD exists | ❌ No CRUD API |
| **UI - List/Detail** | ✅ Implemented | ❌ Missing |
| **UI - Create/Edit** | ✅ Basic JSON editor | ❌ Missing |
| **UI - Configuration** | ❌ Missing visual builder | ❌ Missing entirely |

### 9.2 Critical Gaps

**Track A**:
1. ❌ No visual contract builder (currently JSON editor only)
2. ❌ No enforcement mode toggle UI
3. ❌ No comparator selection UI
4. ❌ No approval tier mapping UI
5. ❌ No scope configuration UI (repo allowlist, path globs)

**Track B**:
1. ❌ No UI exists at all
2. ❌ No DriftPlan CRUD API endpoints
3. ❌ No primary doc picker (CRITICAL - prevents wrong page selection)
4. ❌ No materiality threshold sliders (CRITICAL - prevents noisy alerts)

### 9.3 Recommended Action Items

**Immediate (Next 2 Weeks)**:
1. ✅ Create DriftPlan CRUD API endpoints (`/api/workspaces/:id/drift-plans`)
2. ✅ Create DriftPlan list/detail UI page (`apps/web/src/app/drift-plans/page.tsx`)
3. ✅ Add primary doc picker component (solves "wrong page selection")
4. ✅ Add materiality threshold sliders (solves "noisy drift alerts")

**Short-Term (Next 4 Weeks)**:
1. ✅ Add input source checkboxes to DriftPlan UI
2. ✅ Add drift type checkboxes to DriftPlan UI
3. ✅ Add enforcement mode toggle to ContractPack UI
4. ✅ Add comparator selection to ContractPack UI

**Medium-Term (Next 8 Weeks)**:
1. ✅ Design unified WorkspacePolicyPack schema
2. ✅ Migrate ContractPack + DriftPlan to unified model
3. ✅ Build unified configuration UI
4. ✅ Add approval tier mapping UI
5. ✅ Add test mode (dry-run on recent PRs/signals)

### 9.4 Success Metrics

**Track A**:
- ✅ Users can create contract packs without editing JSON
- ✅ Users can toggle enforcement mode (warn vs block)
- ✅ Users can select comparators visually
- ✅ Contract violations are surfaced in GitHub Checks

**Track B**:
- ✅ Users can create drift plans via UI
- ✅ Users can set primary doc (prevents wrong page selection)
- ✅ Users can configure materiality thresholds (prevents noisy alerts)
- ✅ Drift patches target correct docs 95%+ of the time
- ✅ Drift alert noise reduced by 80%+

---

## Appendix A: UI Wireframe Recommendations

### A.1 Track A - Contract Pack Builder

**Step 1: Scope**
```
┌─────────────────────────────────────────┐
│ Create Contract Pack                    │
├─────────────────────────────────────────┤
│ Name: [Payment Service Contracts     ]  │
│ Description: [Optional description   ]  │
│                                         │
│ Scope:                                  │
│ ○ Workspace-wide                        │
│ ● Service: [payment-service ▼]         │
│ ○ Repository: [Select repo ▼]          │
│                                         │
│ Repo Allowlist (optional):              │
│ [+ Add repo]                            │
│ ✓ acme/payment-api        [Remove]      │
│ ✓ acme/payment-worker     [Remove]      │
│                                         │
│ Path Globs (optional):                  │
│ [+ Add pattern]                         │
│ ✓ /openapi.yaml           [Remove]      │
│ ✓ /src/controllers/**     [Remove]      │
│                                         │
│         [Cancel]  [Next: Surfaces →]    │
└─────────────────────────────────────────┘
```

**Step 2: Surfaces**
```
┌─────────────────────────────────────────┐
│ Select Surfaces to Check                │
├─────────────────────────────────────────┤
│ ☑ API                                   │
│   Check OpenAPI specs, REST endpoints   │
│                                         │
│ ☑ Infrastructure                        │
│   Check Terraform, K8s configs          │
│                                         │
│ ☐ Documentation                         │
│   Check README, runbooks                │
│                                         │
│ ☐ Data Model                            │
│   Check database schemas                │
│                                         │
│ ☐ Observability                         │
│   Check metrics, dashboards             │
│                                         │
│ ☐ Security                              │
│   Check IAM policies, secrets           │
│                                         │
│         [← Back]  [Next: Comparators →] │
└─────────────────────────────────────────┘
```

**Step 3: Comparators**
```
┌─────────────────────────────────────────┐
│ Select Checks to Run                    │
├─────────────────────────────────────────┤
│ API Surface:                            │
│ ☑ OpenAPI Diff (High)                   │
│   Detect breaking changes in API        │
│   [⚙ Configure]                         │
│                                         │
│ ☑ OpenAPI Version Bump (Critical)       │
│   Require version bump on changes       │
│                                         │
│ ☑ OpenAPI Validation (Medium)           │
│   Validate spec against OpenAPI 3.0     │
│                                         │
│ Infrastructure Surface:                 │
│ ☑ Terraform IAM Review (Critical)       │
│   Flag IAM policy changes               │
│   [⚙ Configure]                         │
│                                         │
│ ☐ Terraform Docs Parity (High)          │
│   Ensure resources are documented       │
│                                         │
│         [← Back]  [Next: Enforcement →] │
└─────────────────────────────────────────┘
```

### A.2 Track B - Drift Plan Builder

**Step 2: Primary Doc (CRITICAL)**
```
┌─────────────────────────────────────────┐
│ Set Primary Documentation               │
├─────────────────────────────────────────┤
│ Where should drift patches be written?  │
│                                         │
│ Doc System:                             │
│ ● Confluence                            │
│ ○ Notion                                │
│ ○ GitHub README                         │
│ ○ Backstage                             │
│                                         │
│ Search for page:                        │
│ [Payment Service Runbook          🔍]   │
│                                         │
│ Results:                                │
│ ● Payment Service Runbook               │
│   https://acme.atlassian.net/.../123456 │
│   Last updated: 2026-02-10              │
│                                         │
│ ○ Payment API Documentation             │
│   https://acme.atlassian.net/.../789012 │
│   Last updated: 2026-01-15              │
│                                         │
│ Doc Class:                              │
│ ● Runbook                               │
│ ○ API Contract                          │
│ ○ Service Catalog                       │
│ ○ Architecture Doc                      │
│                                         │
│         [← Back]  [Next: Input Sources →]│
└─────────────────────────────────────────┘
```

**Step 5: Materiality (CRITICAL)**
```
┌─────────────────────────────────────────┐
│ Configure Materiality Thresholds        │
├─────────────────────────────────────────┤
│ What's worth patching?                  │
│                                         │
│ Auto-Approve: [━━━━━━━━━━●] 98%        │
│ Patches with 98%+ confidence are        │
│ automatically approved and merged.      │
│                                         │
│ Slack Notify: [━━━━●━━━━━━] 40%        │
│ Patches with 40%+ confidence trigger    │
│ Slack notification for review.          │
│                                         │
│ Digest Only: [━━━●━━━━━━━] 30%         │
│ Patches with 30%+ confidence are        │
│ included in daily digest email.         │
│                                         │
│ Ignore: [━━●━━━━━━━━] 20%              │
│ Patches below 20% confidence are        │
│ ignored (likely noise).                 │
│                                         │
│ Example Scenarios:                      │
│ ✓ "Update deployment steps" → 95%      │
│   → Auto-approved ✅                    │
│                                         │
│ ✓ "Fix typo in runbook" → 45%          │
│   → Slack notification 📢               │
│                                         │
│ ✗ "Change comma to semicolon" → 15%    │
│   → Ignored 🚫                          │
│                                         │
│         [← Back]  [Next: Approval →]    │
└─────────────────────────────────────────┘
```

---

## Appendix B: Migration Path

### B.1 Phase 1: Track B MVP (Immediate Priority)

**Week 1-2: Backend**
- Create DriftPlan CRUD API endpoints
- Add validation for input sources, output targets, drift types
- Add DriftPlan template library

**Week 3-4: Frontend**
- Create DriftPlan list/detail page
- Add primary doc picker component
- Add materiality threshold sliders
- Add input source + drift type checkboxes

### B.2 Phase 2: Track A Enhancements

**Week 5-6: Frontend**
- Add enforcement mode toggle to ContractPack UI
- Add comparator selection UI
- Add scope configuration UI (repo allowlist, path globs)

### B.3 Phase 3: Unified WorkspacePolicyPack

**Week 7-8: Backend**
- Design unified schema
- Create migration scripts
- Update API endpoints

**Week 9-10: Frontend**
- Build unified configuration UI
- Add approval tier mapping UI
- Add test mode (dry-run)

---

**END OF AUDIT**


