# VertaAI Multi-Source Implementation Plan

## Executive Summary

This document outlines the comprehensive plan to extend VertaAI's drift detection capabilities from the current single-source architecture (GitHub PR → Confluence) to a multi-source architecture supporting diverse input signals and output documentation systems.

**Goal:** Enable VertaAI to detect all 5 drift types by ingesting signals from multiple sources and comparing against the appropriate documentation systems for each drift type.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Target Architecture](#2-target-architecture)
3. [Data Source Analysis](#3-data-source-analysis)
4. [Drift Type × Source Mapping](#4-drift-type--source-mapping)
5. [Data Model Extensions](#5-data-model-extensions)
6. [Phase 1: Enhance Current Sources](#6-phase-1-enhance-current-sources-weeks-1-2)
7. [Phase 2: API Documentation](#7-phase-2-api-documentation-weeks-3-4)
8. [Phase 3: Incident-Based Signals](#8-phase-3-incident-based-signals-weeks-5-6)
9. [Phase 4: Knowledge Gap Detection](#9-phase-4-knowledge-gap-detection-weeks-7-8)
10. [Integration Architecture](#10-integration-architecture)
11. [Testing Strategy](#11-testing-strategy)
12. [Rollout Plan](#12-rollout-plan)

---

## 1. Current State Assessment

### 1.1 Implemented Components

| Component | Status | Location |
|-----------|--------|----------|
| **GitHub PR Webhook** | ✅ Done | `apps/api/src/routes/webhooks.ts` |
| **Confluence OAuth** | ✅ Done | `apps/api/src/routes/confluence-oauth.ts` |
| **Confluence Adapter** | ✅ Done | `apps/api/src/services/confluence-client.ts` |
| **Notion OAuth** | ✅ Done | `apps/api/src/routes/notion-oauth.ts` |
| **Notion Adapter** | ✅ Done | `apps/api/src/services/docs/adapters/notionAdapter.ts` |
| **Drift Triage (Agent A)** | ✅ Done | `apps/api/src/agents/drift-triage.ts` |
| **Doc Resolution** | ✅ Done | `apps/api/src/services/docs/docResolution.ts` |
| **Slack Notifications** | ✅ Done | `apps/api/src/services/slack-client.ts` |
| **State Machine** | ✅ Done | `apps/api/src/services/orchestrator/transitions.ts` |

### 1.2 Current Data Flow

```
GitHub PR (merged) 
    → Webhook `/webhooks/github/app`
    → SignalEvent created
    → DriftCandidate created (state: INGESTED)
    → Agent A: Drift Triage
    → Doc Resolution (Confluence/Notion)
    → Agent C: Patch Planner
    → Agent D: Patch Generator
    → Agent E: Slack Composer
    → Slack Notification
    → Human Approval
    → Writeback to Confluence/Notion
```

### 1.3 Current Limitations

| Limitation | Impact |
|------------|--------|
| Only GitHub PR as input | Cannot detect process drift from incidents |
| Only Confluence/Notion as output | Cannot update README.md, Swagger, or code comments |
| No CODEOWNERS parsing | Cannot detect ownership drift |
| No incident correlation | Cannot detect process drift from PagerDuty |
| No Slack message clustering | Cannot detect coverage gaps |

---

## 2. Target Architecture

### 2.1 Multi-Source Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INPUT SOURCES (Change Signals)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  GitHub PR   │  │  PagerDuty   │  │    Slack     │  │  Terraform   │     │
│  │  (existing)  │  │  Incidents   │  │  Questions   │  │  IaC Changes │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                 │                 │             │
│         ▼                 ▼                 ▼                 ▼             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Signal Normalizer Layer                          │    │
│  │  - Extracts: title, summary, keywords, service, severity            │    │
│  │  - Creates: SignalEvent with source_type                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DRIFT DETECTION ENGINE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │  Agent A:       │    │  Doc Resolution │    │  Source-Aware   │          │
│  │  Drift Triage   │───▶│  (Multi-System) │───▶│  Patch Routing  │          │
│  │  (5 drift types)│    │                 │    │                 │          │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        OUTPUT SOURCES (Documentation)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    FUNCTIONAL DOCS                                   │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                     │    │
│  │  │ Confluence │  │   Notion   │  │  GitBook   │                     │    │
│  │  │ (existing) │  │ (existing) │  │  (Phase 1) │                     │    │
│  │  └────────────┘  └────────────┘  └────────────┘                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    DEVELOPER DOCS                                    │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐     │    │
│  │  │  Swagger/  │  │  README.md │  │  JSDoc/    │  │  Postman   │     │    │
│  │  │  OpenAPI   │  │  (Phase 1) │  │  TSDoc     │  │ Collections│     │    │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    OPERATIONAL DOCS                                  │    │
│  │  ┌────────────┐  ┌────────────┐                                     │    │
│  │  │ Backstage  │  │  Grafana   │                                     │    │
│  │  │ (Phase 2)  │  │ Dashboards │                                     │    │
│  │  └────────────┘  └────────────┘                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Source Analysis

### 3.1 INPUT SOURCES (Change Signals)

#### Priority P0 - Already Implemented

| Source | Detects | Implementation | ROI |
|--------|---------|----------------|-----|
| **GitHub PR** | Instruction, Environment | ✅ Webhook + diff parsing | High |

#### Priority P1 - High Value, Low Complexity

| Source | Detects | Implementation | ROI |
|--------|---------|----------------|-----|
| **CODEOWNERS Changes** | Ownership | Parse CODEOWNERS in PR webhook | High |
| **Terraform/Pulumi IaC** | Environment, Instruction | Parse HCL/YAML in PR diff | High |

#### Priority P2 - Medium Value, Medium Complexity

| Source | Detects | Implementation | ROI |
|--------|---------|----------------|-----|
| **PagerDuty Incidents** | Process, Ownership | Webhook + API integration | Medium |
| **Slack Repeated Questions** | Coverage | NLP clustering + pattern detection | Medium |

#### Priority P3 - Lower Priority

| Source | Detects | Implementation | ROI |
|--------|---------|----------------|-----|
| **Datadog/Grafana Alerts** | Environment | Webhook integration | Low |
| **Jira Tickets** | Coverage | API polling | Low |

### 3.2 OUTPUT SOURCES (Documentation)

#### Functional Documentation (Product/Ops Teams)

| Priority | Source | Best For | Writeback | Complexity |
|----------|--------|----------|-----------|------------|
| **P0** | **Confluence** | Runbooks, Onboarding | ✅ ADF API | ✅ Done |
| **P0** | **Notion** | Guides, Procedures | ✅ Block API | ✅ Done |
| **P1** | **GitBook** | Product Guides | Git-based | Medium |

#### Developer Documentation (Engineers)

| Priority | Source | Best For | Writeback | Complexity |
|----------|--------|----------|-----------|------------|
| **P1** | **Swagger/OpenAPI** | API Contract Drift | Spec file PR | Medium |
| **P1** | **README.md** | Setup, Local Dev | Git PR | Low |
| **P2** | **JSDoc/TSDoc** | Code-level docs | Git PR | Medium |
| **P2** | **Postman Collections** | API Examples | Postman API | Medium |

#### Operational Documentation

| Priority | Source | Best For | Writeback | Complexity |
|----------|--------|----------|-----------|------------|
| **P1** | **Backstage** | Service Catalog | YAML PR | Medium |
| **P2** | **Grafana Dashboards** | Monitoring Docs | Limited | High |

---

## 4. Drift Type × Source Mapping

### 4.1 Optimal Source Combinations

| Drift Type | Best INPUT Sources | Best OUTPUT Sources | Reasoning |
|------------|-------------------|---------------------|-----------|
| **🔧 Instruction** | GitHub PR, IaC changes | Swagger/OpenAPI, README.md, Confluence | Commands/configs change in code → API docs and setup guides become stale |
| **📋 Process** | PagerDuty incidents, Slack clusters | Confluence Runbooks, Notion | Incident timelines reveal outdated procedures |
| **👤 Ownership** | CODEOWNERS, PagerDuty on-call | Confluence (owner sections), Backstage | Authoritative sources for team ownership |
| **📚 Coverage** | Slack repeated questions | Confluence FAQ, Notion | Questions signal undocumented scenarios |
| **⚙️ Environment** | GitHub PR (CI files), IaC | README.md, Code comments | Platform changes affect setup/deployment docs |

### 4.2 Detection Confidence by Source

| Drift Type | GitHub PR | PagerDuty | Slack | CODEOWNERS |
|------------|-----------|-----------|-------|------------|
| Instruction | 0.75-0.95 | 0.40-0.60 | 0.55-0.75 | N/A |
| Process | 0.50-0.70 | 0.60-0.85 | 0.55-0.75 | N/A |
| Ownership | 0.60-0.80 | 0.80-0.95 | N/A | 0.90-0.98 |
| Coverage | 0.30-0.50 | 0.50-0.70 | 0.60-0.80 | N/A |
| Environment | 0.70-0.90 | 0.40-0.60 | 0.40-0.60 | N/A |

### 4.3 Two Documentation "Worlds"

VertaAI must recognize that documentation serves different audiences:

| World | Audience | Primary Sources | Drift Types |
|-------|----------|-----------------|-------------|
| **Functional Docs** | Product/Ops teams | Confluence, Notion | Process, Ownership, Coverage |
| **Developer Docs** | Engineers | Swagger, README, Code | Instruction, Environment |

**Implementation:** Add `docCategory: 'functional' | 'developer' | 'operational'` to `DocMappingV2` to route drift detection appropriately.

---

## 5. Data Model Extensions

### 5.1 New Enums

```typescript
// packages/shared/src/types/sources.ts

// Input source types (signals)
export const INPUT_SOURCE_TYPES = [
  'github_pr',           // Existing
  'github_codeowners',   // New: CODEOWNERS file changes
  'github_iac',          // New: Terraform/Pulumi changes
  'pagerduty_incident',  // New: PagerDuty incidents
  'slack_cluster',       // New: Slack question clusters
  'datadog_alert',       // Future: Datadog alert changes
] as const;

// Output source types (documentation systems)
export const OUTPUT_SOURCE_TYPES = [
  'confluence',          // Existing
  'notion',              // Existing
  'github_readme',       // New: README.md files
  'github_swagger',      // New: OpenAPI/Swagger specs
  'github_jsdoc',        // New: Code comments
  'backstage',           // New: Service catalog
  'postman',             // Future: Postman collections
  'gitbook',             // Future: GitBook
] as const;

// Documentation categories
export const DOC_CATEGORIES = [
  'functional',          // Runbooks, onboarding, procedures
  'developer',           // API docs, README, code comments
  'operational',         // Service catalog, dashboards
] as const;
```

### 5.2 Prisma Schema Extensions

```prisma
// apps/api/prisma/schema.prisma

// Extend Integration model for new sources
model Integration {
  // ... existing fields ...

  // New: Source category for routing
  sourceCategory String? @map("source_category") // 'input' | 'output'

  // New: For GitHub-based outputs (README, Swagger)
  targetRepo     String? @map("target_repo")     // e.g., "owner/repo"
  targetPath     String? @map("target_path")     // e.g., "docs/api.yaml"
}

// Extend DocMappingV2 for multi-source
model DocMappingV2 {
  // ... existing fields ...

  // New: Documentation category
  docCategory    String? @map("doc_category")    // 'functional' | 'developer' | 'operational'

  // New: For GitHub-based docs
  filePath       String? @map("file_path")       // e.g., "README.md" or "docs/api.yaml"

  // New: Drift type affinity (which drift types this doc is relevant for)
  driftTypeAffinity String[] @map("drift_type_affinity") // ['instruction', 'environment']
}

// Extend SignalEvent for new source types
model SignalEvent {
  // ... existing fields ...

  // New: For incident-based signals
  incidentId     String? @map("incident_id")
  incidentUrl    String? @map("incident_url")
  responders     String[] @default([])

  // New: For Slack-based signals
  slackClusterId String? @map("slack_cluster_id")
  messageCount   Int?    @map("message_count")
}

// New: Slack Question Clusters
model SlackQuestionCluster {
  workspaceId    String   @map("workspace_id")
  id             String   @default(uuid())
  channelId      String   @map("channel_id")
  channelName    String   @map("channel_name")

  // Cluster metadata
  representativeQuestion String @map("representative_question")
  messageCount   Int      @map("message_count")
  uniqueAskers   Int      @map("unique_askers")
  firstSeen      DateTime @map("first_seen")
  lastSeen       DateTime @map("last_seen")

  // Processing state
  processedAt    DateTime? @map("processed_at")
  signalEventId  String?   @map("signal_event_id")

  // Raw data
  sampleMessages Json     @map("sample_messages")

  workspace      Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@id([workspaceId, id])
  @@index([workspaceId, lastSeen(sort: Desc)])
  @@map("slack_question_clusters")
}
```

### 5.3 New Adapter Interface

```typescript
// apps/api/src/services/docs/adapters/types.ts

export interface DocAdapter {
  system: string;  // 'confluence' | 'notion' | 'github_readme' | 'swagger' | etc.
  category: 'functional' | 'developer' | 'operational';

  // Fetch document content
  fetch(doc: DocRef): Promise<DocFetchResult>;

  // Write patch back to document
  writePatch(params: WritePatchParams): Promise<WriteResult>;

  // Check if adapter supports writeback
  supportsWriteback(): boolean;

  // Get document URL for Slack messages
  getDocUrl(doc: DocRef): string;
}

export interface GitHubDocAdapter extends DocAdapter {
  // Create PR with changes instead of direct write
  createPatchPR(params: CreatePRParams): Promise<PRResult>;
}
```

---

## 6. Phase 1: Enhance Current Sources (Weeks 1-2)

### 6.1 Objectives

1. **README.md as output** — Detect drift in repo README files, create PRs for fixes
2. **CODEOWNERS parsing** — Detect ownership drift from PR changes to CODEOWNERS
3. **Notion completion** — Ensure full Notion OAuth + writeback works end-to-end

### 6.2 Task Breakdown

#### 6.2.1 README.md Adapter (Week 1)

**Files to Create:**
- `apps/api/src/services/docs/adapters/readmeAdapter.ts`

**Files to Modify:**
- `apps/api/src/services/docs/docResolution.ts` — Add README resolution
- `apps/api/prisma/schema.prisma` — Add `filePath` to DocMappingV2

**Implementation Steps:**

```typescript
// apps/api/src/services/docs/adapters/readmeAdapter.ts

import { Octokit } from '@octokit/rest';

export interface ReadmeAdapter {
  system: 'github_readme';
  category: 'developer';

  fetch(params: {
    owner: string;
    repo: string;
    path?: string;  // Default: 'README.md'
    ref?: string;   // Branch, default: main
  }): Promise<{
    content: string;
    sha: string;      // For optimistic locking
    encoding: string;
  }>;

  createPatchPR(params: {
    owner: string;
    repo: string;
    path: string;
    baseSha: string;
    newContent: string;
    title: string;
    body: string;
    branchName: string;
  }): Promise<{
    prNumber: number;
    prUrl: string;
  }>;
}

export function createReadmeAdapter(installationId: number): ReadmeAdapter {
  // Use GitHub App installation token
  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey, installationId },
  });

  return {
    system: 'github_readme',
    category: 'developer',

    async fetch({ owner, repo, path = 'README.md', ref }) {
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      const file = response.data as { content: string; sha: string; encoding: string };
      const content = Buffer.from(file.content, 'base64').toString('utf-8');

      return { content, sha: file.sha, encoding: file.encoding };
    },

    async createPatchPR({ owner, repo, path, baseSha, newContent, title, body, branchName }) {
      // 1. Get default branch
      const { data: repoData } = await octokit.repos.get({ owner, repo });
      const defaultBranch = repoData.default_branch;

      // 2. Get latest commit SHA
      const { data: ref } = await octokit.git.getRef({
        owner, repo, ref: `heads/${defaultBranch}`,
      });

      // 3. Create new branch
      await octokit.git.createRef({
        owner, repo,
        ref: `refs/heads/${branchName}`,
        sha: ref.object.sha,
      });

      // 4. Update file on new branch
      await octokit.repos.createOrUpdateFileContents({
        owner, repo, path,
        message: title,
        content: Buffer.from(newContent).toString('base64'),
        sha: baseSha,
        branch: branchName,
      });

      // 5. Create PR
      const { data: pr } = await octokit.pulls.create({
        owner, repo,
        title,
        body,
        head: branchName,
        base: defaultBranch,
      });

      return { prNumber: pr.number, prUrl: pr.html_url };
    },
  };
}
```

#### 6.2.2 CODEOWNERS Parsing (Week 1)

**Files to Modify:**
- `apps/api/src/routes/webhooks.ts` — Detect CODEOWNERS changes in PR
- `apps/api/src/agents/drift-triage.ts` — Add ownership drift detection

**Implementation Steps:**

```typescript
// apps/api/src/services/signals/codeownersParser.ts

export interface CodeownersChange {
  path: string;
  oldOwners: string[];
  newOwners: string[];
  changeType: 'added' | 'removed' | 'modified';
}

export function parseCodeownersChanges(diff: string): CodeownersChange[] {
  const changes: CodeownersChange[] = [];
  const lines = diff.split('\n');

  let currentPath: string | null = null;
  let oldOwners: string[] = [];
  let newOwners: string[] = [];

  for (const line of lines) {
    if (line.startsWith('-') && !line.startsWith('---')) {
      // Removed line
      const match = line.slice(1).trim().match(/^(\S+)\s+(.+)$/);
      if (match) {
        currentPath = match[1];
        oldOwners = match[2].split(/\s+/).filter(o => o.startsWith('@'));
      }
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      // Added line
      const match = line.slice(1).trim().match(/^(\S+)\s+(.+)$/);
      if (match) {
        const path = match[1];
        newOwners = match[2].split(/\s+/).filter(o => o.startsWith('@'));

        if (path === currentPath) {
          changes.push({ path, oldOwners, newOwners, changeType: 'modified' });
        } else {
          changes.push({ path, oldOwners: [], newOwners, changeType: 'added' });
        }
        currentPath = null;
        oldOwners = [];
        newOwners = [];
      }
    }
  }

  // Handle pure removals
  if (currentPath && oldOwners.length > 0) {
    changes.push({ path: currentPath, oldOwners, newOwners: [], changeType: 'removed' });
  }

  return changes;
}

// In webhooks.ts, detect CODEOWNERS changes
function detectCodeownersChanges(changedFiles: string[], diff: string): boolean {
  const codeownersFiles = ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS'];
  return changedFiles.some(f => codeownersFiles.includes(f));
}
```

#### 6.2.3 Notion Completion (Week 2)

**Files to Verify/Fix:**
- `apps/api/src/services/docs/adapters/notionAdapter.ts` — Ensure writeback works
- `apps/api/src/routes/notion-oauth.ts` — Verify OAuth flow

**Testing Checklist:**
- [ ] OAuth flow completes successfully
- [ ] Can fetch page content
- [ ] Can convert blocks to markdown
- [ ] Can write patch back
- [ ] Optimistic locking works (revision check)

### 6.3 Phase 1 Deliverables

| Deliverable | Description | Acceptance Criteria |
|-------------|-------------|---------------------|
| README Adapter | Fetch/write README.md via GitHub API | Can create PR with doc changes |
| CODEOWNERS Parser | Detect ownership changes in PRs | Ownership drift detected with 0.90+ confidence |
| Notion E2E | Full Notion integration working | Can fetch, patch, and writeback to Notion |
| Doc Category | `docCategory` field on DocMappingV2 | Routing works by category |

---

## 7. Phase 2: API Documentation (Weeks 3-4)

### 7.1 Objectives

1. **Swagger/OpenAPI detection** — Parse spec files, compare against Confluence API docs
2. **Postman integration** — Optional sync with Postman collections
3. **Backstage service catalog** — Update service metadata

### 7.2 Task Breakdown

#### 7.2.1 Swagger/OpenAPI Adapter (Week 3)

**Files to Create:**
- `apps/api/src/services/docs/adapters/swaggerAdapter.ts`
- `apps/api/src/services/signals/openApiParser.ts`

**Implementation:**

```typescript
// apps/api/src/services/signals/openApiParser.ts

import SwaggerParser from '@apidevtools/swagger-parser';

export interface ApiEndpointChange {
  path: string;
  method: string;
  changeType: 'added' | 'removed' | 'modified';
  oldSpec?: any;
  newSpec?: any;
  breakingChange: boolean;
}

export async function parseOpenApiChanges(
  oldSpecContent: string,
  newSpecContent: string
): Promise<ApiEndpointChange[]> {
  const oldSpec = await SwaggerParser.parse(JSON.parse(oldSpecContent));
  const newSpec = await SwaggerParser.parse(JSON.parse(newSpecContent));

  const changes: ApiEndpointChange[] = [];

  // Compare paths
  const oldPaths = Object.keys(oldSpec.paths || {});
  const newPaths = Object.keys(newSpec.paths || {});

  // Detect removed endpoints (breaking)
  for (const path of oldPaths) {
    if (!newPaths.includes(path)) {
      for (const method of Object.keys(oldSpec.paths[path])) {
        changes.push({
          path, method,
          changeType: 'removed',
          oldSpec: oldSpec.paths[path][method],
          breakingChange: true,
        });
      }
    }
  }

  // Detect added endpoints
  for (const path of newPaths) {
    if (!oldPaths.includes(path)) {
      for (const method of Object.keys(newSpec.paths[path])) {
        changes.push({
          path, method,
          changeType: 'added',
          newSpec: newSpec.paths[path][method],
          breakingChange: false,
        });
      }
    }
  }

  // Detect modified endpoints
  for (const path of oldPaths.filter(p => newPaths.includes(p))) {
    const oldMethods = Object.keys(oldSpec.paths[path]);
    const newMethods = Object.keys(newSpec.paths[path]);

    for (const method of oldMethods.filter(m => newMethods.includes(m))) {
      const oldEndpoint = oldSpec.paths[path][method];
      const newEndpoint = newSpec.paths[path][method];

      if (JSON.stringify(oldEndpoint) !== JSON.stringify(newEndpoint)) {
        // Check for breaking changes
        const breakingChange = detectBreakingChange(oldEndpoint, newEndpoint);

        changes.push({
          path, method,
          changeType: 'modified',
          oldSpec: oldEndpoint,
          newSpec: newEndpoint,
          breakingChange,
        });
      }
    }
  }

  return changes;
}

function detectBreakingChange(oldEndpoint: any, newEndpoint: any): boolean {
  // Breaking: required parameter added
  const oldRequired = (oldEndpoint.parameters || [])
    .filter((p: any) => p.required)
    .map((p: any) => p.name);
  const newRequired = (newEndpoint.parameters || [])
    .filter((p: any) => p.required)
    .map((p: any) => p.name);

  const addedRequired = newRequired.filter((p: string) => !oldRequired.includes(p));
  if (addedRequired.length > 0) return true;

  // Breaking: response schema changed
  // (simplified check)
  const oldResponse = JSON.stringify(oldEndpoint.responses?.['200']);
  const newResponse = JSON.stringify(newEndpoint.responses?.['200']);
  if (oldResponse !== newResponse) return true;

  return false;
}
```

#### 7.2.2 API Drift Detection Flow

```
PR merged with changes to openapi.yaml
    → Webhook detects spec file change
    → Parse old vs new spec
    → Identify endpoint changes
    → For each change:
        → Find corresponding Confluence API doc
        → Generate patch for doc
        → Send Slack notification
```

### 7.3 Phase 2 Deliverables

| Deliverable | Description | Acceptance Criteria |
|-------------|-------------|---------------------|
| OpenAPI Parser | Parse and diff OpenAPI specs | Detects added/removed/modified endpoints |
| Swagger Adapter | Fetch/update OpenAPI specs | Can create PR with spec changes |
| API Drift Detection | End-to-end API drift flow | Detects breaking changes with 0.85+ confidence |
| Backstage Integration | Update service catalog | Can update catalog-info.yaml |

---

## 8. Phase 3: Incident-Based Signals (Weeks 5-6)

### 8.1 Objectives

1. **PagerDuty webhook** — Ingest incidents, correlate with runbooks
2. **Process drift detection** — Compare incident timeline with documented steps
3. **Ownership drift from on-call** — Detect when on-call differs from doc owner

### 8.2 Task Breakdown

#### 8.2.1 PagerDuty Integration (Week 5)

**Files to Create:**
- `apps/api/src/routes/pagerduty-webhook.ts`
- `apps/api/src/services/signals/pagerdutyNormalizer.ts`

**Files to Modify:**
- `apps/api/src/routes/pagerduty.ts` — Enhance OAuth flow
- `apps/api/prisma/schema.prisma` — Add incident fields to SignalEvent

**Implementation:**

```typescript
// apps/api/src/routes/pagerduty-webhook.ts

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/db.js';
import { normalizeIncident } from '../services/signals/pagerdutyNormalizer.js';
import { enqueueJob } from '../services/queue/qstash.js';

const router = Router();

router.post('/webhook', async (req: Request, res: Response) => {
  const event = req.body;

  // Verify webhook signature
  const signature = req.headers['x-pagerduty-signature'];
  if (!verifyPagerDutySignature(signature, req.body)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Only process resolved incidents (post-mortem trigger)
  if (event.event?.event_type !== 'incident.resolved') {
    return res.status(200).json({ status: 'ignored', reason: 'Not a resolved incident' });
  }

  const incident = event.event?.data;

  // Find workspace by PagerDuty service ID
  const integration = await prisma.integration.findFirst({
    where: {
      type: 'pagerduty',
      status: 'connected',
      config: { path: ['serviceIds'], array_contains: incident.service?.id },
    },
  });

  if (!integration) {
    return res.status(200).json({ status: 'ignored', reason: 'No matching workspace' });
  }

  // Normalize incident to SignalEvent
  const signalEvent = normalizeIncident(incident, integration.workspaceId);

  // Create SignalEvent
  await prisma.signalEvent.create({
    data: signalEvent,
  });

  // Create DriftCandidate
  const driftCandidate = await prisma.driftCandidate.create({
    data: {
      workspaceId: integration.workspaceId,
      signalEventId: signalEvent.id,
      sourceType: 'pagerduty_incident',
      service: signalEvent.service,
      state: 'INGESTED',
    },
  });

  // Enqueue for processing
  await enqueueJob({
    workspaceId: integration.workspaceId,
    driftId: driftCandidate.id,
  });

  res.status(200).json({ status: 'accepted', driftId: driftCandidate.id });
});

export default router;
```

```typescript
// apps/api/src/services/signals/pagerdutyNormalizer.ts

export interface PagerDutyIncident {
  id: string;
  incident_number: number;
  title: string;
  description?: string;
  status: string;
  urgency: string;
  service: { id: string; name: string };
  created_at: string;
  resolved_at?: string;
  assignments: Array<{ assignee: { id: string; name: string; email: string } }>;
  acknowledgements: Array<{ at: string; acknowledger: { name: string } }>;
  last_status_change_at: string;
  escalation_policy: { id: string; name: string };
  teams: Array<{ id: string; name: string }>;
  priority?: { id: string; name: string };
  html_url: string;
}

export function normalizeIncident(incident: PagerDutyIncident, workspaceId: string) {
  // Map PagerDuty urgency to severity
  const severityMap: Record<string, string> = {
    high: 'sev1',
    low: 'sev3',
  };

  // Extract responders
  const responders = incident.assignments.map(a => a.assignee.email);

  // Extract timeline for process drift detection
  const timeline = [
    { event: 'created', at: incident.created_at },
    ...incident.acknowledgements.map(a => ({ event: 'acknowledged', at: a.at, by: a.acknowledger.name })),
    { event: 'resolved', at: incident.resolved_at },
  ].filter(t => t.at);

  return {
    workspaceId,
    id: `pd_${incident.id}`,
    sourceType: 'pagerduty_incident',
    occurredAt: new Date(incident.created_at),
    service: incident.service.name.toLowerCase().replace(/\s+/g, '-'),
    severity: severityMap[incident.urgency] || 'sev2',
    extracted: {
      title: incident.title,
      summary: incident.description || incident.title,
      keywords: extractKeywords(incident.title + ' ' + (incident.description || '')),
      responders,
      timeline,
      escalationPolicy: incident.escalation_policy.name,
      teams: incident.teams.map(t => t.name),
    },
    rawPayload: incident,
    incidentId: incident.id,
    incidentUrl: incident.html_url,
    responders,
  };
}

function extractKeywords(text: string): string[] {
  // Extract meaningful keywords for doc matching
  const stopWords = ['the', 'a', 'an', 'is', 'was', 'were', 'been', 'being'];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.includes(w))
    .slice(0, 10);
}
```

#### 8.2.2 Process Drift Detection (Week 6)

**Files to Create:**
- `apps/api/src/agents/process-drift-detector.ts`

**Implementation:**

```typescript
// apps/api/src/agents/process-drift-detector.ts

import { callClaude } from '../lib/claude.js';

const SYSTEM_PROMPT = `You are ProcessDriftDetector, analyzing incident timelines against documented runbooks.

Your job is to identify when the actual incident response steps differ from documented procedures.

## What to look for:
1. Steps performed in different order than documented
2. Steps that were skipped
3. Steps that were added (not in docs)
4. Escalation paths that differ from documented
5. Tools/commands used that differ from documented

## Output JSON:
{
  "process_drift_detected": boolean,
  "confidence": number (0-1),
  "drift_details": [
    {
      "type": "order_mismatch" | "step_skipped" | "step_added" | "tool_changed",
      "documented_step": string,
      "actual_step": string,
      "evidence": string
    }
  ],
  "suggested_doc_updates": string[],
  "notes": string
}`;

export interface ProcessDriftInput {
  incidentTitle: string;
  incidentTimeline: Array<{ event: string; at: string; by?: string }>;
  runbookContent: string;
  runbookTitle: string;
}

export async function detectProcessDrift(input: ProcessDriftInput) {
  const userPrompt = JSON.stringify({
    incident: {
      title: input.incidentTitle,
      timeline: input.incidentTimeline,
    },
    runbook: {
      title: input.runbookTitle,
      content: input.runbookContent.substring(0, 10000), // Truncate
    },
  });

  return callClaude({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.3,
  });
}
```

### 8.3 Phase 3 Deliverables

| Deliverable | Description | Acceptance Criteria |
|-------------|-------------|---------------------|
| PagerDuty Webhook | Ingest resolved incidents | Incidents create SignalEvents |
| Incident Normalizer | Extract timeline, responders | Normalized data for drift detection |
| Process Drift Detector | Compare timeline vs runbook | Detects order/step mismatches |
| Ownership from On-Call | Compare on-call vs doc owner | Detects ownership drift |

---

## 9. Phase 4: Knowledge Gap Detection (Weeks 7-8)

### 9.1 Objectives

1. **Slack message clustering** — NLP to identify repeated questions
2. **Coverage drift** — Auto-suggest FAQ additions to docs
3. **Question-to-doc mapping** — Link questions to relevant docs

### 9.2 Task Breakdown

#### 9.2.1 Slack Message Ingestion (Week 7)

**Files to Create:**
- `apps/api/src/services/signals/slackMessageIngester.ts`
- `apps/api/src/services/signals/questionClusterer.ts`

**Implementation:**

```typescript
// apps/api/src/services/signals/slackMessageIngester.ts

import { WebClient } from '@slack/web-api';
import { prisma } from '../../lib/db.js';

export interface SlackMessage {
  ts: string;
  text: string;
  user: string;
  channel: string;
  thread_ts?: string;
  reactions?: Array<{ name: string; count: number }>;
}

export async function ingestRecentMessages(
  workspaceId: string,
  botToken: string,
  channelIds: string[],
  lookbackHours: number = 168 // 1 week
): Promise<SlackMessage[]> {
  const client = new WebClient(botToken);
  const messages: SlackMessage[] = [];

  const oldest = Math.floor((Date.now() - lookbackHours * 60 * 60 * 1000) / 1000);

  for (const channelId of channelIds) {
    try {
      const result = await client.conversations.history({
        channel: channelId,
        oldest: oldest.toString(),
        limit: 500,
      });

      for (const msg of result.messages || []) {
        // Filter for questions (heuristic)
        if (isLikelyQuestion(msg.text || '')) {
          messages.push({
            ts: msg.ts!,
            text: msg.text || '',
            user: msg.user || '',
            channel: channelId,
            thread_ts: msg.thread_ts,
            reactions: msg.reactions,
          });
        }
      }
    } catch (err) {
      console.error(`[SlackIngester] Failed to fetch channel ${channelId}:`, err);
    }
  }

  return messages;
}

function isLikelyQuestion(text: string): boolean {
  const questionIndicators = [
    /\?$/,                          // Ends with ?
    /^(how|what|where|when|why|who|which|can|could|would|should|is|are|do|does)/i,
    /anyone know/i,
    /help with/i,
    /struggling with/i,
    /not sure how/i,
  ];

  return questionIndicators.some(pattern => pattern.test(text.trim()));
}
```

#### 9.2.2 Question Clustering (Week 7-8)

**Files to Create:**
- `apps/api/src/services/signals/questionClusterer.ts`

**Implementation:**

```typescript
// apps/api/src/services/signals/questionClusterer.ts

import { callClaude } from '../../lib/claude.js';

const CLUSTERING_PROMPT = `You are QuestionClusterer, grouping similar questions to identify documentation gaps.

Given a list of questions from Slack, group them by topic/intent.

## Output JSON:
{
  "clusters": [
    {
      "id": string,
      "representative_question": string,
      "topic": string,
      "questions": string[],
      "frequency": number,
      "suggested_doc_section": string,
      "urgency": "high" | "medium" | "low"
    }
  ],
  "unclustered": string[]
}

## Urgency rules:
- high: 5+ similar questions, or questions about critical paths (deployment, auth, data)
- medium: 3-4 similar questions
- low: 2 similar questions`;

export interface QuestionCluster {
  id: string;
  representativeQuestion: string;
  topic: string;
  questions: string[];
  frequency: number;
  suggestedDocSection: string;
  urgency: 'high' | 'medium' | 'low';
}

export async function clusterQuestions(questions: string[]): Promise<QuestionCluster[]> {
  if (questions.length < 3) {
    return []; // Not enough questions to cluster
  }

  const result = await callClaude({
    systemPrompt: CLUSTERING_PROMPT,
    userPrompt: JSON.stringify({ questions: questions.slice(0, 100) }), // Limit
    temperature: 0.2,
  });

  if (!result.success || !result.data) {
    return [];
  }

  return result.data.clusters.map((c: any) => ({
    id: c.id,
    representativeQuestion: c.representative_question,
    topic: c.topic,
    questions: c.questions,
    frequency: c.frequency,
    suggestedDocSection: c.suggested_doc_section,
    urgency: c.urgency,
  }));
}
```

#### 9.2.3 Coverage Drift Detection (Week 8)

**Files to Create:**
- `apps/api/src/agents/coverage-drift-detector.ts`

**Implementation:**

```typescript
// apps/api/src/agents/coverage-drift-detector.ts

import { callClaude } from '../lib/claude.js';
import { QuestionCluster } from '../services/signals/questionClusterer.js';

const SYSTEM_PROMPT = `You are CoverageDriftDetector, identifying documentation gaps from repeated questions.

Given a cluster of similar questions and existing documentation, determine if the docs are missing coverage.

## Output JSON:
{
  "coverage_gap_detected": boolean,
  "confidence": number (0-1),
  "gap_type": "missing_section" | "incomplete_section" | "outdated_section" | "unclear_section",
  "existing_doc_section": string | null,
  "suggested_addition": {
    "section_title": string,
    "content_outline": string[],
    "placement": "new_section" | "append_to_existing" | "faq_entry"
  },
  "evidence": string
}`;

export interface CoverageDriftInput {
  cluster: QuestionCluster;
  docContent: string;
  docTitle: string;
}

export async function detectCoverageDrift(input: CoverageDriftInput) {
  const userPrompt = JSON.stringify({
    question_cluster: {
      representative: input.cluster.representativeQuestion,
      frequency: input.cluster.frequency,
      topic: input.cluster.topic,
      sample_questions: input.cluster.questions.slice(0, 5),
    },
    documentation: {
      title: input.docTitle,
      content: input.docContent.substring(0, 8000),
    },
  });

  return callClaude({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.3,
  });
}
```

### 9.3 Phase 4 Deliverables

| Deliverable | Description | Acceptance Criteria |
|-------------|-------------|---------------------|
| Slack Ingester | Fetch questions from channels | Ingests 1 week of messages |
| Question Clusterer | Group similar questions | Clusters with 0.7+ similarity |
| Coverage Drift Detector | Identify doc gaps | Suggests FAQ additions |
| Scheduled Job | Weekly question analysis | Runs automatically |

---

## 10. Integration Architecture

### 10.1 Unified Signal Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SIGNAL INGESTION LAYER                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   GitHub     │  │  PagerDuty   │  │    Slack     │  │   Datadog    │     │
│  │   Webhook    │  │   Webhook    │  │  Scheduled   │  │   Webhook    │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                 │                 │             │
│         ▼                 ▼                 ▼                 ▼             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Signal Normalizer                                 │    │
│  │  - Validates webhook signature                                       │    │
│  │  - Extracts: title, summary, keywords, service                       │    │
│  │  - Creates: SignalEvent with source_type                             │    │
│  │  - Determines: drift_type_hints based on source                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
└──────────────────────────────────────┼───────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DRIFT DETECTION ENGINE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  State Machine (DriftCandidate)                                      │    │
│  │                                                                       │    │
│  │  INGESTED → ELIGIBILITY_CHECKED → DRIFT_CLASSIFIED → DOCS_RESOLVED   │    │
│  │      → DOCS_FETCHED → PATCH_PLANNED → PATCH_GENERATED → SLACK_SENT   │    │
│  │      → AWAITING_HUMAN → APPROVED/REJECTED → WRITTEN_BACK             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │  Agent A:       │    │  Source-Aware   │    │  Agent C/D:     │          │
│  │  Drift Triage   │───▶│  Doc Resolution │───▶│  Patch Gen      │          │
│  │  (5 drift types)│    │  (Multi-System) │    │  (Style Matrix) │          │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DOC ADAPTER LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Adapter Registry                                                    │    │
│  │                                                                       │    │
│  │  getAdapter(docSystem: string): DocAdapter                           │    │
│  │                                                                       │    │
│  │  Registered Adapters:                                                │    │
│  │  - confluence: ConfluenceAdapter (ADF writeback)                     │    │
│  │  - notion: NotionAdapter (Block API writeback)                       │    │
│  │  - github_readme: ReadmeAdapter (PR creation)                        │    │
│  │  - github_swagger: SwaggerAdapter (PR creation)                      │    │
│  │  - backstage: BackstageAdapter (YAML PR creation)                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Source-Aware Doc Resolution

```typescript
// apps/api/src/services/docs/docResolution.ts (enhanced)

export interface DocResolutionInput {
  workspaceId: string;
  sourceType: string;           // 'github_pr' | 'pagerduty_incident' | 'slack_cluster'
  driftTypeHints: string[];     // ['instruction', 'environment']
  service?: string;
  repo?: string;
  keywords: string[];
}

export async function resolveDocsForSignal(input: DocResolutionInput): Promise<DocCandidate[]> {
  const candidates: DocCandidate[] = [];

  // 1. Get doc category based on drift type hints
  const docCategories = getDocCategoriesForDriftTypes(input.driftTypeHints);

  // 2. Query DocMappingV2 with category filter
  const mappings = await prisma.docMappingV2.findMany({
    where: {
      workspaceId: input.workspaceId,
      OR: [
        { service: input.service },
        { repo: input.repo },
        { service: null, repo: null }, // Catch-all
      ],
      docCategory: { in: docCategories },
    },
    orderBy: { isPrimary: 'desc' },
  });

  // 3. For each mapping, check drift type affinity
  for (const mapping of mappings) {
    const affinity = mapping.driftTypeAffinity || [];
    const hasAffinity = affinity.length === 0 ||
      affinity.some(t => input.driftTypeHints.includes(t));

    if (hasAffinity) {
      candidates.push({
        docId: mapping.docId,
        docSystem: mapping.docSystem,
        docTitle: mapping.docTitle,
        docUrl: mapping.docUrl,
        docCategory: mapping.docCategory,
        isPrimary: mapping.isPrimary,
        confidence: mapping.isPrimary ? 0.85 : 0.70,
      });
    }
  }

  // 4. Fallback: Search by keywords if no mappings
  if (candidates.length === 0) {
    const searchCandidates = await searchDocsAcrossSystems(
      input.workspaceId,
      input.keywords,
      docCategories
    );
    candidates.push(...searchCandidates);
  }

  return candidates;
}

function getDocCategoriesForDriftTypes(driftTypes: string[]): string[] {
  const categoryMap: Record<string, string[]> = {
    instruction: ['developer', 'functional'],
    process: ['functional', 'operational'],
    ownership: ['operational', 'functional'],
    coverage: ['functional'],
    environment: ['developer', 'operational'],
  };

  const categories = new Set<string>();
  for (const dt of driftTypes) {
    for (const cat of categoryMap[dt] || []) {
      categories.add(cat);
    }
  }

  return Array.from(categories);
}
```

### 10.3 Adapter Registry Pattern

```typescript
// apps/api/src/services/docs/adapters/registry.ts

import { createConfluenceAdapter } from './confluenceAdapter.js';
import { createNotionAdapter } from './notionAdapter.js';
import { createReadmeAdapter } from './readmeAdapter.js';
import { createSwaggerAdapter } from './swaggerAdapter.js';

export interface DocAdapter {
  system: string;
  category: 'functional' | 'developer' | 'operational';
  fetch(doc: DocRef): Promise<DocFetchResult>;
  writePatch(params: WritePatchParams): Promise<WriteResult>;
  supportsWriteback(): boolean;
  getDocUrl(doc: DocRef): string;
}

const adapterFactories: Record<string, (config: any) => DocAdapter> = {
  confluence: createConfluenceAdapter,
  notion: createNotionAdapter,
  github_readme: createReadmeAdapter,
  github_swagger: createSwaggerAdapter,
};

export async function getAdapter(
  workspaceId: string,
  docSystem: string
): Promise<DocAdapter | null> {
  // Get integration config for this doc system
  const integration = await prisma.integration.findUnique({
    where: {
      workspaceId_type: {
        workspaceId,
        type: docSystemToIntegrationType(docSystem),
      },
    },
  });

  if (!integration || integration.status !== 'connected') {
    return null;
  }

  const factory = adapterFactories[docSystem];
  if (!factory) {
    console.warn(`[AdapterRegistry] No adapter for doc system: ${docSystem}`);
    return null;
  }

  return factory(integration.config);
}

function docSystemToIntegrationType(docSystem: string): string {
  const mapping: Record<string, string> = {
    confluence: 'confluence',
    notion: 'notion',
    github_readme: 'github',
    github_swagger: 'github',
    backstage: 'github', // Backstage uses GitHub for catalog-info.yaml
  };
  return mapping[docSystem] || docSystem;
}
```

### 10.4 Writeback Strategy by Doc System

| Doc System | Writeback Method | Human Approval | Notes |
|------------|------------------|----------------|-------|
| Confluence | Direct API (ADF) | ✅ Required | Uses managed region |
| Notion | Direct API (Blocks) | ✅ Required | Optimistic locking |
| GitHub README | Create PR | ✅ PR Review | Branch + PR workflow |
| GitHub Swagger | Create PR | ✅ PR Review | May need CI validation |
| Backstage | Create PR | ✅ PR Review | Updates catalog-info.yaml |

---

## 11. Testing Strategy

### 11.1 Unit Tests

```typescript
// apps/api/src/__tests__/adapters/readmeAdapter.test.ts

describe('ReadmeAdapter', () => {
  describe('fetch', () => {
    it('should fetch README.md content', async () => {
      const adapter = createReadmeAdapter(mockInstallationId);
      const result = await adapter.fetch({
        owner: 'test-org',
        repo: 'test-repo',
        path: 'README.md',
      });

      expect(result.content).toContain('# Test Repo');
      expect(result.sha).toBeDefined();
    });
  });

  describe('createPatchPR', () => {
    it('should create PR with updated content', async () => {
      const adapter = createReadmeAdapter(mockInstallationId);
      const result = await adapter.createPatchPR({
        owner: 'test-org',
        repo: 'test-repo',
        path: 'README.md',
        baseSha: 'abc123',
        newContent: '# Updated README',
        title: 'docs: Update README',
        body: 'Auto-generated by VertaAI',
        branchName: 'vertaai/update-readme-123',
      });

      expect(result.prNumber).toBeGreaterThan(0);
      expect(result.prUrl).toContain('github.com');
    });
  });
});
```

### 11.2 Integration Tests

```typescript
// apps/api/src/__tests__/integration/pagerduty-webhook.test.ts

describe('PagerDuty Webhook Integration', () => {
  it('should create DriftCandidate from resolved incident', async () => {
    const webhook = createMockPagerDutyWebhook({
      event_type: 'incident.resolved',
      service: { id: 'P123', name: 'checkout-api' },
    });

    const response = await request(app)
      .post('/webhooks/pagerduty')
      .set('X-PagerDuty-Signature', signWebhook(webhook))
      .send(webhook);

    expect(response.status).toBe(200);
    expect(response.body.driftId).toBeDefined();

    // Verify DriftCandidate created
    const drift = await prisma.driftCandidate.findFirst({
      where: { id: response.body.driftId },
    });
    expect(drift?.sourceType).toBe('pagerduty_incident');
    expect(drift?.service).toBe('checkout-api');
  });
});
```

### 11.3 E2E Tests

| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| README drift | PR changes setup command | PR created to update README |
| CODEOWNERS drift | PR changes CODEOWNERS | Ownership drift detected |
| API drift | PR changes openapi.yaml | Confluence API doc patch proposed |
| Process drift | PagerDuty incident resolved | Runbook update suggested |
| Coverage drift | 5+ similar Slack questions | FAQ addition proposed |

---

## 12. Rollout Plan

### 12.1 Feature Flags

```typescript
// apps/api/src/config/featureFlags.ts

export const FEATURE_FLAGS = {
  // Phase 1
  ENABLE_README_ADAPTER: false,
  ENABLE_CODEOWNERS_DETECTION: false,

  // Phase 2
  ENABLE_SWAGGER_ADAPTER: false,
  ENABLE_BACKSTAGE_ADAPTER: false,

  // Phase 3
  ENABLE_PAGERDUTY_WEBHOOK: false,
  ENABLE_PROCESS_DRIFT: false,

  // Phase 4
  ENABLE_SLACK_CLUSTERING: false,
  ENABLE_COVERAGE_DRIFT: false,
};

export function isFeatureEnabled(flag: keyof typeof FEATURE_FLAGS): boolean {
  // Check environment variable override
  const envKey = `FF_${flag}`;
  if (process.env[envKey] !== undefined) {
    return process.env[envKey] === 'true';
  }
  return FEATURE_FLAGS[flag];
}
```

### 12.2 Rollout Schedule

| Week | Phase | Features Enabled | Workspaces |
|------|-------|------------------|------------|
| 1-2 | Phase 1 | README, CODEOWNERS | Internal only |
| 3 | Phase 1 | README, CODEOWNERS | 10% of workspaces |
| 4 | Phase 1 + 2 | + Swagger | Internal only |
| 5 | Phase 2 | Swagger, Backstage | 10% of workspaces |
| 6 | Phase 3 | PagerDuty | Internal only |
| 7 | Phase 3 | PagerDuty | 10% of workspaces |
| 8 | Phase 4 | Slack clustering | Internal only |
| 9 | Phase 4 | Slack clustering | 10% of workspaces |
| 10 | All | All features | 50% of workspaces |
| 11 | All | All features | 100% of workspaces |

### 12.3 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Drift Detection Rate** | +50% | Drifts detected per week |
| **Coverage by Drift Type** | 100% | All 5 types detectable |
| **Approval Rate** | ≥40% | Patches approved / proposed |
| **Time to Detection** | <24h | Signal → Notification |
| **False Positive Rate** | <20% | Rejected as irrelevant |

### 12.4 Monitoring & Alerts

```typescript
// Metrics to track
const METRICS = {
  // Volume
  'signals.ingested': Counter,           // By source_type
  'drift_candidates.created': Counter,   // By drift_type
  'patches.proposed': Counter,           // By doc_system
  'patches.approved': Counter,
  'patches.rejected': Counter,

  // Latency
  'pipeline.duration_ms': Histogram,     // End-to-end
  'adapter.fetch_ms': Histogram,         // By doc_system
  'adapter.write_ms': Histogram,

  // Errors
  'webhook.errors': Counter,             // By source
  'adapter.errors': Counter,             // By doc_system
  'llm.errors': Counter,                 // By agent
};

// Alerts
const ALERTS = [
  {
    name: 'HighFalsePositiveRate',
    condition: 'patches.rejected / patches.proposed > 0.3',
    severity: 'warning',
  },
  {
    name: 'WebhookIngestionFailure',
    condition: 'webhook.errors > 10 in 5m',
    severity: 'critical',
  },
  {
    name: 'AdapterWritebackFailure',
    condition: 'adapter.errors{operation="write"} > 5 in 1h',
    severity: 'warning',
  },
];
```

---

## Appendix A: File Changes Summary

### New Files to Create

| Phase | File | Purpose |
|-------|------|---------|
| 1 | `apps/api/src/services/docs/adapters/readmeAdapter.ts` | README.md fetch/PR |
| 1 | `apps/api/src/services/signals/codeownersParser.ts` | Parse CODEOWNERS changes |
| 2 | `apps/api/src/services/docs/adapters/swaggerAdapter.ts` | OpenAPI fetch/PR |
| 2 | `apps/api/src/services/signals/openApiParser.ts` | Parse OpenAPI diffs |
| 3 | `apps/api/src/routes/pagerduty-webhook.ts` | PagerDuty webhook handler |
| 3 | `apps/api/src/services/signals/pagerdutyNormalizer.ts` | Normalize incidents |
| 3 | `apps/api/src/agents/process-drift-detector.ts` | Process drift LLM |
| 4 | `apps/api/src/services/signals/slackMessageIngester.ts` | Fetch Slack messages |
| 4 | `apps/api/src/services/signals/questionClusterer.ts` | Cluster questions |
| 4 | `apps/api/src/agents/coverage-drift-detector.ts` | Coverage drift LLM |
| All | `apps/api/src/services/docs/adapters/registry.ts` | Adapter registry |
| All | `apps/api/src/config/featureFlags.ts` | Feature flag config |

### Files to Modify

| Phase | File | Changes |
|-------|------|---------|
| 1 | `apps/api/prisma/schema.prisma` | Add docCategory, filePath, driftTypeAffinity |
| 1 | `apps/api/src/services/docs/docResolution.ts` | Add category-aware resolution |
| 1 | `apps/api/src/routes/webhooks.ts` | Add CODEOWNERS detection |
| 2 | `apps/api/src/agents/drift-triage.ts` | Add API drift detection |
| 3 | `apps/api/src/index.ts` | Register PagerDuty webhook route |
| 4 | `apps/api/src/index.ts` | Add scheduled job for Slack clustering |

---

## Appendix B: Environment Variables

```bash
# Phase 1
# (No new env vars - uses existing GitHub App)

# Phase 2
# (No new env vars - uses existing GitHub App)

# Phase 3
PAGERDUTY_API_KEY=           # For fetching incident details
PAGERDUTY_WEBHOOK_SECRET=    # For verifying webhooks

# Phase 4
# (No new env vars - uses existing Slack bot token)

# Feature Flags (optional overrides)
FF_ENABLE_README_ADAPTER=true
FF_ENABLE_CODEOWNERS_DETECTION=true
FF_ENABLE_SWAGGER_ADAPTER=true
FF_ENABLE_PAGERDUTY_WEBHOOK=true
FF_ENABLE_SLACK_CLUSTERING=true
```

---

## Appendix C: Migration Scripts

```sql
-- Migration: add_multi_source_fields
-- Run after Phase 1 code is deployed

-- Add doc category to DocMappingV2
ALTER TABLE "doc_mappings_v2" ADD COLUMN "doc_category" TEXT;
ALTER TABLE "doc_mappings_v2" ADD COLUMN "file_path" TEXT;
ALTER TABLE "doc_mappings_v2" ADD COLUMN "drift_type_affinity" TEXT[];

-- Add incident fields to SignalEvent
ALTER TABLE "signal_events" ADD COLUMN "incident_id" TEXT;
ALTER TABLE "signal_events" ADD COLUMN "incident_url" TEXT;
ALTER TABLE "signal_events" ADD COLUMN "responders" TEXT[];

-- Create SlackQuestionCluster table
CREATE TABLE "slack_question_clusters" (
  "workspace_id" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "channel_name" TEXT NOT NULL,
  "representative_question" TEXT NOT NULL,
  "message_count" INTEGER NOT NULL,
  "unique_askers" INTEGER NOT NULL,
  "first_seen" TIMESTAMP NOT NULL,
  "last_seen" TIMESTAMP NOT NULL,
  "processed_at" TIMESTAMP,
  "signal_event_id" TEXT,
  "sample_messages" JSONB NOT NULL,
  PRIMARY KEY ("workspace_id", "id")
);

CREATE INDEX "idx_slack_clusters_last_seen" ON "slack_question_clusters" ("workspace_id", "last_seen" DESC);

-- Set default doc_category for existing mappings
UPDATE "doc_mappings_v2" SET "doc_category" = 'functional' WHERE "doc_system" IN ('confluence', 'notion');
```

---

*Document Version: 1.0*
*Last Updated: 2026-01-31*
*Author: VertaAI Engineering*