# VertaAI Architecture Diagrams

**Date:** 2026-02-16  
**Version:** 1.0  
**Status:** ✅ Complete

---

## Table of Contents

1. [P2 Unified Policy Pack Architecture](#1-p2-unified-policy-pack-architecture)
2. [Track A: Contract Integrity Gate Flow](#2-track-a-contract-integrity-gate-flow)
3. [Track B: Drift Remediation Flow](#3-track-b-drift-remediation-flow)
4. [End-to-End PR Processing Flow](#4-end-to-end-pr-processing-flow)
5. [Data Model Architecture](#5-data-model-architecture)
6. [Service Layer Architecture](#6-service-layer-architecture)

---

## 1. P2 Unified Policy Pack Architecture

### 1.1 System Overview

```mermaid
graph TB
    subgraph "Frontend Layer"
        UI[Policy Pack UI<br/>List/Create/Edit/Delete]
    end

    subgraph "API Layer - Unified (P2)"
        API["/api/workspaces/:id/policy-packs<br/>POST, GET, PUT, DELETE"]
    end

    subgraph "Storage Layer - Unified"
        DB[(WorkspacePolicyPack Table<br/>trackAEnabled + trackAConfig<br/>trackBEnabled + trackBConfig)]
    end

    subgraph "Adapter Layer - Backward Compatibility"
        AdapterA[ContractPack Adapter<br/>Transform to Legacy Format]
        AdapterB[DriftPlan Adapter<br/>Transform to Legacy Format]
    end

    subgraph "Service Layer - Track A"
        ServiceA1[Contract Validation]
        ServiceA2[Invariant Checking]
        ServiceA3[Artifact Resolution]
    end

    subgraph "Service Layer - Track B"
        ServiceB1[Drift Detection]
        ServiceB2[Plan Resolution]
        ServiceB3[Threshold Calculation]
    end

    subgraph "Legacy Layer - Deprecated"
        LegacyA["/api/workspaces/:id/contract-packs"]
        LegacyB["/api/workspaces/:id/drift-plans"]
        LegacyDBA[(ContractPack Table)]
        LegacyDBB[(DriftPlan Table)]
    end

    UI -->|Create/Edit| API
    API -->|Write| DB
    DB -->|Read| AdapterA
    DB -->|Read| AdapterB
    AdapterA -->|Legacy Format| ServiceA1
    AdapterA -->|Legacy Format| ServiceA2
    AdapterA -->|Legacy Format| ServiceA3
    AdapterB -->|Legacy Format| ServiceB1
    AdapterB -->|Legacy Format| ServiceB2
    AdapterB -->|Legacy Format| ServiceB3

    LegacyA -.->|Deprecated| LegacyDBA
    LegacyB -.->|Deprecated| LegacyDBB

    style UI fill:#4CAF50,stroke:#2E7D32,color:#fff
    style API fill:#2196F3,stroke:#1565C0,color:#fff
    style DB fill:#FF9800,stroke:#E65100,color:#fff
    style AdapterA fill:#9C27B0,stroke:#6A1B9A,color:#fff
    style AdapterB fill:#9C27B0,stroke:#6A1B9A,color:#fff
    style ServiceA1 fill:#00BCD4,stroke:#006064,color:#fff
    style ServiceA2 fill:#00BCD4,stroke:#006064,color:#fff
    style ServiceA3 fill:#00BCD4,stroke:#006064,color:#fff
    style ServiceB1 fill:#00BCD4,stroke:#006064,color:#fff
    style ServiceB2 fill:#00BCD4,stroke:#006064,color:#fff
    style ServiceB3 fill:#00BCD4,stroke:#006064,color:#fff
    style LegacyA fill:#757575,stroke:#424242,color:#fff
    style LegacyB fill:#757575,stroke:#424242,color:#fff
    style LegacyDBA fill:#757575,stroke:#424242,color:#fff
    style LegacyDBB fill:#757575,stroke:#424242,color:#fff
```

### 1.2 Migration Status

| Component | Status | Description |
|-----------|--------|-------------|
| ✅ Unified Storage | Complete | `WorkspacePolicyPack` table stores both Track A and Track B |
| ✅ Unified API | Complete | `/api/workspaces/:id/policy-packs` CRUD endpoints |
| ✅ Unified UI | Complete | `/policy-packs` page with multi-step wizard |
| ✅ Adapter Layer | Complete | Transforms unified model to legacy formats |
| ⏳ Legacy Deprecation | In Progress | Legacy routes functional but deprecated |
| 🔜 Legacy Removal | Planned | Remove `ContractPack` and `DriftPlan` tables |

---

## 2. Track A: Contract Integrity Gate Flow

### 2.1 Functional Flow

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant GH as GitHub
    participant WH as Webhook Handler
    participant SC as Surface Classifier
    participant CR as Contract Resolver
    participant CV as Contract Validator
    participant FR as Finding Repository
    participant Slack as Slack

    Dev->>GH: Opens PR
    GH->>WH: PR webhook event
    WH->>SC: Classify surfaces touched
    SC-->>WH: Surfaces: [api, docs]
    
    WH->>CR: Resolve contracts for surfaces
    CR->>DB: Query WorkspacePolicyPack (trackAEnabled=true)
    DB-->>CR: Policy pack with contracts
    CR-->>WH: Contracts: [PublicAPI, Docs]
    
    WH->>CV: Validate contracts
    loop For each contract
        CV->>CV: Fetch artifacts (OpenAPI, README)
        CV->>CV: Run invariants (diff, validate)
        CV->>FR: Store findings
    end
    CV-->>WH: Findings: [BREAKING_CHANGE]
    
    WH->>GH: Post PR comment with findings
    WH->>Slack: Notify #engineering
    WH-->>Dev: PR blocked (if enforcement=block)
```

### 2.2 Technical Architecture

```mermaid
graph LR
    subgraph "Input"
        PR[PR Event<br/>Changed Files]
    end

    subgraph "Surface Classification"
        SC[Surface Classifier<br/>Regex + CODEOWNERS]
        SC -->|api| SurfaceAPI[API Surface]
        SC -->|docs| SurfaceDocs[Docs Surface]
        SC -->|infra| SurfaceInfra[Infra Surface]
    end

    subgraph "Contract Resolution"
        CPR[Contract Pack Resolver]
        CPR -->|Filter by surface| Contracts[Applicable Contracts]
    end

    subgraph "Validation"
        CV[Contract Validator]
        CV -->|For each contract| Comparators[Comparators<br/>openapi_diff, semver, etc.]
    end

    subgraph "Output"
        Findings[Integrity Findings]
        Findings -->|Severity: HIGH| Block[Block PR]
        Findings -->|Severity: MEDIUM| Warn[Warn PR]
        Findings -->|Severity: LOW| Pass[Pass PR]
    end

    PR --> SC
    SC --> CPR
    CPR --> CV
    CV --> Findings

    style PR fill:#E3F2FD,stroke:#1976D2
    style SC fill:#FFF3E0,stroke:#F57C00
    style CPR fill:#F3E5F5,stroke:#7B1FA2
    style CV fill:#E8F5E9,stroke:#388E3C
    style Findings fill:#FFEBEE,stroke:#C62828
```

---

## 3. Track B: Drift Remediation Flow

### 3.1 Functional Flow

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant GH as GitHub
    participant WH as Webhook Handler
    participant DD as Drift Detector
    participant PR as Plan Resolver
    participant AI as AI Agent
    participant WB as Writeback Service
    participant Slack as Slack

    Dev->>GH: Opens PR with code changes
    GH->>WH: PR webhook event
    WH->>DD: Detect drift candidates
    DD-->>WH: Drift: [new_endpoint, config_change]
    
    WH->>PR: Resolve active drift plan
    PR->>DB: Query WorkspacePolicyPack (trackBEnabled=true)
    DB-->>PR: Policy pack with drift config
    PR-->>WH: Plan: materiality thresholds, input sources
    
    WH->>AI: Generate doc updates
    AI->>AI: Analyze PR diff
    AI->>AI: Generate README section
    AI-->>WH: Suggestion: "Add API endpoint docs"
    
    WH->>WB: Evaluate writeback eligibility
    WB->>WB: Check confidence > 0.8
    WB->>WB: Check auto-approve threshold
    alt Auto-approve
        WB->>GH: Create commit to PR
        WB->>Slack: Notify: "Auto-updated README"
    else Requires approval
        WB->>GH: Post PR comment with suggestion
        WB->>Slack: Request approval
    end
```

### 3.2 Technical Architecture

```mermaid
graph LR
    subgraph "Input"
        PR[PR Event<br/>Code Changes]
    end

    subgraph "Drift Detection"
        DD[Drift Detector]
        DD -->|new_endpoint| DT1[New Endpoint]
        DD -->|breaking_change| DT2[Breaking Change]
        DD -->|config_change| DT3[Config Change]
        DD -->|deprecation| DT4[Deprecation]
        DD -->|new_feature| DT5[New Feature]
    end

    subgraph "Plan Resolution - 5-Step Fallback"
        PR1[Step 1: Exact Match<br/>repo + docClass]
        PR2[Step 2: Repo Match<br/>any docClass]
        PR3[Step 3: Service Match]
        PR4[Step 4: Workspace Default]
        PR5[Step 5: No Plan]

        PR1 -->|Not found| PR2
        PR2 -->|Not found| PR3
        PR3 -->|Not found| PR4
        PR4 -->|Not found| PR5
    end

    subgraph "AI Generation"
        AI[AI Agent<br/>GPT-4]
        AI -->|Input| Sources[Input Sources<br/>PR diff, comments, OpenAPI]
        AI -->|Output| Suggestions[Doc Suggestions<br/>README, API docs]
    end

    subgraph "Writeback Evaluation"
        WB[Writeback Service]
        WB -->|confidence >= 0.8| AutoApprove[Auto-commit to PR]
        WB -->|confidence < 0.8| ManualReview[PR comment + Slack]
    end

    subgraph "Output"
        GH[GitHub PR]
        Slack[Slack Notification]
    end

    PR --> DD
    DD --> PR1
    PR1 --> AI
    AI --> WB
    WB --> GH
    WB --> Slack

    style PR fill:#E3F2FD,stroke:#1976D2
    style DD fill:#FFF3E0,stroke:#F57C00
    style PR1 fill:#F3E5F5,stroke:#7B1FA2
    style AI fill:#E8F5E9,stroke:#388E3C
    style WB fill:#FCE4EC,stroke:#C2185B
    style GH fill:#E0F2F1,stroke:#00796B
    style Slack fill:#FFF9C4,stroke:#F57F17
```

---

## 4. End-to-End PR Processing Flow

### 4.1 Combined Track A + Track B Processing

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant GH as GitHub
    participant WH as Webhook Handler
    participant TrackA as Track A Pipeline
    participant TrackB as Track B Pipeline
    participant Agg as Aggregator
    participant Output as Output Handler

    Dev->>GH: Opens PR
    GH->>WH: PR webhook event

    par Track A Processing
        WH->>TrackA: Validate contracts
        TrackA->>TrackA: Classify surfaces
        TrackA->>TrackA: Resolve contracts
        TrackA->>TrackA: Run comparators
        TrackA-->>Agg: Findings: [BREAKING_CHANGE]
    and Track B Processing
        WH->>TrackB: Detect drift
        TrackB->>TrackB: Detect drift candidates
        TrackB->>TrackB: Resolve drift plan
        TrackB->>TrackB: Generate suggestions
        TrackB-->>Agg: Suggestions: [Update README]
    end

    Agg->>Agg: Combine findings + suggestions
    Agg->>Agg: Calculate overall severity
    Agg->>Output: Combined results

    alt High Severity (Track A)
        Output->>GH: Block PR + Post comment
        Output->>Slack: Alert #engineering
    else Medium Severity
        Output->>GH: Warn PR + Post comment
        Output->>Slack: Notify #engineering
    else Low Severity + Drift Suggestions
        Output->>GH: Post suggestions
        Output->>Slack: Notify #docs
    end

    Output-->>Dev: PR status updated
```

### 4.2 Decision Matrix

| Track A Severity | Track B Confidence | Action | Output |
|------------------|-------------------|--------|--------|
| HIGH (blocking) | Any | Block PR | PR comment + Slack alert |
| MEDIUM (warn) | >= 0.8 | Warn + Auto-update | PR comment + Auto-commit |
| MEDIUM (warn) | < 0.8 | Warn + Suggest | PR comment + Slack notify |
| LOW | >= 0.8 | Pass + Auto-update | Auto-commit + Slack notify |
| LOW | < 0.8 | Pass + Suggest | PR comment |
| NONE | >= 0.8 | Auto-update only | Auto-commit |
| NONE | < 0.8 | Suggest only | PR comment |

---

## 5. Data Model Architecture

### 5.1 Entity Relationship Diagram

```mermaid
erDiagram
    Workspace ||--o{ WorkspacePolicyPack : has
    WorkspacePolicyPack ||--o{ WorkspacePolicyPack : "parent (versioning)"

    Workspace {
        string id PK
        string name
        string orgId
        timestamp createdAt
    }

    WorkspacePolicyPack {
        string id PK
        string workspaceId FK
        string name
        string description
        string scopeType "workspace|service|repo"
        string scopeRef
        json repoAllowlist
        json pathGlobs
        boolean trackAEnabled
        json trackAConfig "56 fields"
        boolean trackBEnabled
        json trackBConfig "23 fields"
        json approvalTiers
        string status "active|archived|draft"
        int version
        string versionHash
        string parentId FK
        timestamp createdAt
        timestamp updatedAt
    }

    WorkspacePolicyPack ||--o{ IntegrityFinding : generates
    WorkspacePolicyPack ||--o{ DriftCandidate : generates

    IntegrityFinding {
        string id PK
        string workspaceId FK
        string contractPackId FK
        string prNumber
        string severity "low|medium|high|critical"
        string findingType
        json details
        timestamp createdAt
    }

    DriftCandidate {
        string id PK
        string workspaceId FK
        string planId FK
        string prNumber
        string driftType
        float confidence
        json suggestion
        string status "pending|approved|rejected"
        timestamp createdAt
    }
```

### 5.2 Track A Config Schema (56 Fields)

```typescript
interface TrackAConfig {
  // Contract Pack Model (7 fields)
  surfaces: string[];                    // ['api', 'docs', 'infra']
  enforcementMode: 'off' | 'warn' | 'block';
  scopeType: 'workspace' | 'service' | 'repo';
  scopeRef?: string;
  repoAllowlist?: string[];
  pathGlobs?: string[];

  // Contracts (18 fields per contract)
  contracts: Array<{
    contractId: string;
    name: string;
    description?: string;
    scope: {
      repos: string[];
      paths: string[];
    };

    // Artifacts (11 fields per artifact)
    artifacts: Array<{
      system: 'github' | 'confluence' | 'notion';
      type: 'openapi_spec' | 'readme' | 'schema';
      locator: {
        repo?: string;
        path?: string;
        ref?: string;
      };
      role: 'primary' | 'reference';
      required: boolean;
      freshnessSlaHours?: number;
    }>;

    // Invariants (7 fields per invariant)
    invariants: Array<{
      invariantId: string;
      comparatorType: string;
      description?: string;
      config: any;
      severity: 'low' | 'medium' | 'high' | 'critical';
      enforcement: 'off' | 'warn' | 'block';
    }>;
  }>;

  // Contract Policy (9 fields)
  policy: {
    mode: 'off' | 'warn' | 'block';
    criticalThreshold: number;
    highThreshold: number;
    mediumThreshold: number;
    lowThreshold: number;
    active: boolean;
  };
}
```

### 5.3 Track B Config Schema (23 Fields)

```typescript
interface TrackBConfig {
  // Primary Doc (3 fields)
  primaryDoc: {
    id: string;
    system: 'github' | 'confluence' | 'notion';
    class: 'readme' | 'runbook' | 'api_contract';
  };

  // Input Sources (5 types)
  inputSources: Array<{
    type: 'github_pr' | 'code_comments' | 'openapi_spec' | 'slack' | 'jira';
    enabled: boolean;
    weight: number;
  }>;

  // Drift Types (5 types)
  driftTypes: Array<{
    type: 'new_endpoint' | 'breaking_change' | 'config_change' | 'deprecation' | 'new_feature';
    enabled: boolean;
    defaultSeverity: 'low' | 'medium' | 'high';
  }>;

  // Materiality Thresholds (4 sliders)
  materiality: {
    autoApprove: number;      // 0.0 - 1.0
    slackNotify: number;      // 0.0 - 1.0
    digestOnly: number;       // 0.0 - 1.0
    ignore: number;           // 0.0 - 1.0
  };

  // Doc Targeting (3 fields)
  docTargeting: {
    mode: 'explicit' | 'auto_discover';
    primaryDocId?: string;
    fallbackStrategy: 'workspace_default' | 'service_default';
  };

  // Noise Controls (7 fields)
  noiseControls: {
    minConfidence: number;
    maxSuggestionsPerPr: number;
    deduplicationWindow: number;
    ignorePatterns: string[];
  };

  // Budgets (3 fields)
  budgets: {
    maxTokensPerSuggestion: number;
    maxSuggestionsPerDay: number;
  };

  // Writeback (3 fields)
  writeback: {
    enabled: boolean;
    autoApproveThreshold: number;
    requiresApproval: boolean;
  };
}
```

---

## 6. Service Layer Architecture

### 6.1 Component Diagram

```mermaid
graph TB
    subgraph "API Routes Layer"
        R1["/api/workspaces/:id/policy-packs"]
        R2["/api/workspaces/:id/contract-packs (deprecated)"]
        R3["/api/workspaces/:id/drift-plans (deprecated)"]
        R4["/api/webhooks/github"]
    end

    subgraph "Service Layer - Policy Packs"
        S1[PolicyPackService<br/>CRUD operations]
        S2[PolicyPackValidator<br/>Zod validation]
        S3[VersionManager<br/>SHA-256 hashing]
    end

    subgraph "Adapter Layer"
        A1[ContractPackAdapter<br/>Transform to legacy]
        A2[DriftPlanAdapter<br/>Transform to legacy]
    end

    subgraph "Service Layer - Track A"
        SA1[SurfaceClassifier<br/>Regex + CODEOWNERS]
        SA2[ContractResolver<br/>Multi-strategy]
        SA3[ContractValidator<br/>Run comparators]
        SA4[FindingRepository<br/>Store results]
    end

    subgraph "Service Layer - Track B"
        SB1[DriftDetector<br/>Analyze PR changes]
        SB2[PlanResolver<br/>5-step fallback]
        SB3[AIAgent<br/>Generate suggestions]
        SB4[WritebackService<br/>Evaluate eligibility]
    end

    subgraph "Data Layer"
        DB[(PostgreSQL<br/>Prisma ORM)]
    end

    subgraph "External Services"
        E1[GitHub API]
        E2[Slack API]
        E3[OpenAI API]
    end

    R1 --> S1
    R2 --> A1
    R3 --> A2
    R4 --> SA1
    R4 --> SB1

    S1 --> S2
    S1 --> S3
    S1 --> DB

    A1 --> DB
    A2 --> DB

    SA1 --> SA2
    SA2 --> SA3
    SA3 --> SA4
    SA4 --> DB
    SA3 --> E1

    SB1 --> SB2
    SB2 --> SB3
    SB3 --> SB4
    SB4 --> DB
    SB3 --> E3
    SB4 --> E1
    SB4 --> E2

    style R1 fill:#4CAF50,stroke:#2E7D32,color:#fff
    style R2 fill:#757575,stroke:#424242,color:#fff
    style R3 fill:#757575,stroke:#424242,color:#fff
    style R4 fill:#2196F3,stroke:#1565C0,color:#fff
    style S1 fill:#FF9800,stroke:#E65100,color:#fff
    style S2 fill:#FF9800,stroke:#E65100,color:#fff
    style S3 fill:#FF9800,stroke:#E65100,color:#fff
    style A1 fill:#9C27B0,stroke:#6A1B9A,color:#fff
    style A2 fill:#9C27B0,stroke:#6A1B9A,color:#fff
    style SA1 fill:#00BCD4,stroke:#006064,color:#fff
    style SA2 fill:#00BCD4,stroke:#006064,color:#fff
    style SA3 fill:#00BCD4,stroke:#006064,color:#fff
    style SA4 fill:#00BCD4,stroke:#006064,color:#fff
    style SB1 fill:#00BCD4,stroke:#006064,color:#fff
    style SB2 fill:#00BCD4,stroke:#006064,color:#fff
    style SB3 fill:#00BCD4,stroke:#006064,color:#fff
    style SB4 fill:#00BCD4,stroke:#006064,color:#fff
    style DB fill:#FF5722,stroke:#BF360C,color:#fff
    style E1 fill:#607D8B,stroke:#37474F,color:#fff
    style E2 fill:#607D8B,stroke:#37474F,color:#fff
    style E3 fill:#607D8B,stroke:#37474F,color:#fff
```

### 6.2 Key Service Responsibilities

| Service | Responsibility | Input | Output |
|---------|---------------|-------|--------|
| **PolicyPackService** | CRUD for unified policy packs | API requests | WorkspacePolicyPack records |
| **ContractPackAdapter** | Transform unified → legacy Track A | WorkspacePolicyPack | ContractPack format |
| **DriftPlanAdapter** | Transform unified → legacy Track B | WorkspacePolicyPack | DriftPlan format |
| **SurfaceClassifier** | Identify surfaces touched by PR | PR file list | Surface tags |
| **ContractResolver** | Find applicable contracts | Surfaces + workspace | Contract list |
| **ContractValidator** | Run comparators on contracts | Contracts + artifacts | Integrity findings |
| **DriftDetector** | Detect drift candidates | PR diff | Drift candidates |
| **PlanResolver** | Find applicable drift plan | Workspace + repo + docClass | DriftPlan |
| **AIAgent** | Generate doc suggestions | Drift candidates + plan | Doc suggestions |
| **WritebackService** | Evaluate and execute writeback | Suggestions + thresholds | GitHub commit or PR comment |

---

## 7. Summary

### 7.1 Architecture Highlights

✅ **Unified Storage**: Single `WorkspacePolicyPack` table for both Track A and Track B
✅ **Backward Compatibility**: Adapter layer transforms unified model to legacy formats
✅ **Parallel Processing**: Track A and Track B run independently and aggregate results
✅ **5-Step Fallback**: Drift plan resolution with workspace → service → repo hierarchy
✅ **Confidence-Based Writeback**: Auto-commit high-confidence suggestions, manual review for low-confidence
✅ **Multi-Surface Support**: API, docs, infra surfaces with different contract requirements

### 7.2 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Unified `WorkspacePolicyPack` model | Reduces duplication, shared approval tiers, consistent UX |
| Adapter layer for backward compatibility | Allows gradual migration without breaking existing services |
| JSON blobs for Track A/B configs | Flexibility for 56 + 23 configurable fields without schema changes |
| SHA-256 version hashing | Deterministic versioning based on content |
| Soft delete with `status` field | Audit trail and ability to restore archived packs |
| 5-step plan resolution fallback | Graceful degradation from specific to general |

---

**End of Architecture Diagrams Document**


