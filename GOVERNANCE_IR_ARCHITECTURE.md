# Governance IR (Intermediate Representation) Architecture

## Overview

This document defines the **canonical Evaluation IR** that every policy pack evaluation must produce, regardless of YAML shape, pack composition, or use case.

**Core Principle:** Packs produce data (IR), never formatting. Rendering is deterministic and adaptive based on IR.

---

## 1. Core IR Entities (Non-Negotiable)

### 1.1 RunContext

**Purpose:** Captures the complete context of a single evaluation run.

```typescript
interface RunContext {
  // Repository identifiers
  repo: {
    owner: string;
    name: string;
    fullName: string; // "owner/repo"
  };
  
  // PR/Branch context
  pr: {
    number: number;
    title: string;
    branch: string;
    baseBranch: string;
    headSha: string;
    baseSha: string;
    author: string;
    isDraft: boolean;
  };
  
  // Detected signals (classification/applicability)
  signals: DetectedSignals;
  
  // Confidence breakdown
  confidence: ConfidenceBreakdown;
  
  // Timestamp
  evaluatedAt: string; // ISO 8601
}

interface DetectedSignals {
  // File-based signals
  filesPresent: string[]; // e.g., ["package.json", "openapi.yaml"]
  manifestTypes: string[]; // e.g., ["npm", "openapi"]
  
  // Language/framework signals
  languages: { language: string; percentage: number }[];
  frameworks: string[]; // e.g., ["express", "react"]
  
  // Service catalog signals
  serviceCatalog?: {
    name: string;
    tier: 'tier-1' | 'tier-2' | 'tier-3';
    owner: string;
    source: 'catalog-info.yaml' | 'service.yaml' | 'inferred';
  };
  
  // Operational signals
  hasRunbook: boolean;
  hasSLO: boolean;
  hasAlerts: boolean;
  
  // Build system signals
  buildSystem?: 'npm' | 'maven' | 'gradle' | 'cargo' | 'go' | 'unknown';
}

interface ConfidenceBreakdown {
  // Classification confidence (repo type)
  classification: {
    repoType: 'service' | 'library' | 'docs' | 'monorepo' | 'unknown';
    confidence: number; // 0-1
    source: 'explicit' | 'inferred';
    evidence: string[]; // e.g., ["Found service catalog", "Has API endpoints"]
  };
  
  // Tier confidence (service tier)
  tier?: {
    tier: 'tier-1' | 'tier-2' | 'tier-3' | 'unknown';
    confidence: number; // 0-1
    source: 'catalog' | 'slo' | 'inferred';
    evidence: string[];
  };
  
  // Decision confidence (evidence quality)
  decision: {
    confidence: number; // 0-1
    basis: 'deterministic_baseline' | 'diff_analysis' | 'heuristic';
    degradationReasons: string[]; // e.g., ["Missing artifact registry"]
  };
}
```

---

### 1.2 PolicyPlan

**Purpose:** Records which packs/overlays were selected and why.

```typescript
interface PolicyPlan {
  // Base pack(s)
  basePacks: PackActivation[];
  
  // Overlays (activated or suppressed)
  overlays: OverlayActivation[];
  
  // Obligations partitioned by status
  obligations: {
    enforced: string[]; // obligation IDs
    suppressed: string[]; // obligation IDs
    informational: string[]; // obligation IDs
    notEvaluable: string[]; // obligation IDs
  };
  
  // Activation ledger (source of truth)
  activationLedger: ActivationRecord[];
}

interface PackActivation {
  packId: string;
  packName: string;
  version: string;
  reason: string; // "Base governance pack for all repos"
}

interface OverlayActivation {
  overlayId: string;
  overlayName: string;
  status: 'activated' | 'suppressed';
  reason: string; // "Detected OpenAPI schema" | "Not a service repo"
  howToActivate?: string; // For suppressed overlays
}

interface ActivationRecord {
  packOrOverlayId: string;
  status: 'activated' | 'suppressed';
  reason: string;
  timestamp: string;
}
```

---

### 1.3 ObligationResult

**Purpose:** Captures the result of evaluating a single obligation.

```typescript
interface ObligationResult {
  // Identity
  id: string;
  title: string;
  controlObjective: string; // "Ensure API changes are documented"
  
  // Scope
  scope: 'repo_invariant' | 'diff_derived' | 'environment_gate';
  
  // Decision
  decisionOnFail: 'block' | 'warn' | 'pass';
  status: 'PASS' | 'FAIL' | 'SUPPRESSED' | 'NOT_EVALUABLE' | 'INFO';
  
  // Reason (structured)
  reasonCode: ReasonCode; // Enumerated
  reasonHuman: string; // Human-readable
  
  // Evidence (typed)
  evidence: EvidenceItem[];
  evidenceSearch?: {
    locationsSearched: string[];
    patternsUsed: string[];
    closestMatches?: string[];
  };
  
  // Remediation (structured)
  remediation: {
    minimumToPass: string[]; // Step-by-step
    patch?: string; // Copy-pasteable
    links?: string[]; // Documentation
    owner?: { team: string; contact: string };
  };
  
  // Risk (structured breakdown)
  risk: RiskScore;
  
  // Confidence (per obligation)
  confidence: {
    applicability: number; // 0-1 (should this run?)
    evidence: number; // 0-1 (did we find what we looked for?)
    overall: number; // 0-1 (combined)
  };
}
```

---

## 2. Governance Output Contract (GOC)

**Purpose:** Strict schema for rendered output that must be validated before posting.

### 2.1 Contract Invariants

```typescript
interface GovernanceOutputContract {
  // INVARIANT 1: Counting Consistency
  counts: {
    considered: number;
    enforced: number;
    suppressed: number;
    notEvaluable: number;
    informational: number;
  };
  // RULE: considered = enforced + suppressed + notEvaluable + informational
  
  // INVARIANT 2: Decision Basis
  decision: {
    global: 'PASS' | 'WARN' | 'BLOCK';
    basis: 'enforced_obligations_only'; // Never includes suppressed
    robustness: 'deterministic_baseline' | 'diff_analysis' | 'heuristic';
  };
  
  // INVARIANT 3: Confidence Display
  confidence: {
    decision: number; // 0-1 (evidence quality)
    classification: number; // 0-1 (repo type certainty)
    // RULE: Never compute "Overall Confidence" unless justified
  };
  
  // INVARIANT 4: Evidence Completeness
  // RULE: Every FAIL/WARN must include:
  failedObligations: Array<{
    reasonCode: ReasonCode;
    evidenceLocationsSearched: string[];
    minimumToPassSteps: string[];
  }>;
  
  // INVARIANT 5: Scope Consistency
  // RULE: If only repo_invariant exists → suppress "Change Surface Summary"
  scopes: {
    hasRepoInvariant: boolean;
    hasDiffDerived: boolean;
    hasEnvironmentGate: boolean;
  };
}
```

---

## 3. Obligation DSL (Standardized Pack Format)

**Purpose:** Every rule in every pack conforms to this structure.

```typescript
interface ObligationDSL {
  // Activation
  activation: {
    when: string[]; // Signals required (e.g., ["openapi_present", "service_repo"])
    unless: string[]; // Signals that suppress (e.g., ["docs_repo"])
  };
  
  // Scope
  scope: 'repo_invariant' | 'diff_derived' | 'environment_gate';
  
  // Evidence query
  evidenceQuery: {
    type: 'file_present' | 'file_content' | 'checkrun' | 'approval' | 'artifact';
    locations: string[]; // Where to search
    patterns?: string[]; // What to match
  };
  
  // Decision
  decisionOnFail: 'block' | 'warn' | 'pass';
  controlObjective: string;
  
  // Risk model
  riskModel: {
    blastRadius: number; // 0-30
    criticality: number; // 0-30
    immediacy: number; // 0-20
    dependency: number; // 0-20
  };
  
  // Remediation template
  remediationTemplate: {
    steps: string[]; // Placeholders allowed: {{repo_type}}, {{file_path}}
    patch?: string; // Template with placeholders
    links?: string[];
  };
  
  // Explain template
  explainTemplate: {
    whyItMatters: string; // Placeholders: {{repo_type}}, {{tier}}
    governanceImpact: string;
  };
}
```

---

## 4. Implementation Phases

### Phase 1: IR + Normalizer (Week 1-2) 🎯
- [ ] Implement IR structs (`RunContext`, `PolicyPlan`, `ObligationResult`)
- [ ] Map existing outputs into IR
- [ ] Normalize + validate counts/decision/confidence
- [ ] Render from IR (not from pack strings)

### Phase 2: Obligation DSL (Week 2-3)
- [ ] Refactor packs to produce obligations in DSL
- [ ] Unify remediation + evidence trace
- [ ] Remove all output strings from YAML

### Phase 3: Adaptive Renderer + UI Parity (Week 3-4)
- [ ] Same IR powers GitHub PR output, workspace UI, audit log
- [ ] Renderer chooses sections based on IR (not fixed templates)
- [ ] Validate GOC before every render

---

## 5. Success Criteria

**You know you've succeeded when:**
1. ✅ Any pack/overlay/surface combination produces the same IR structure
2. ✅ GOC validation catches inconsistencies before they reach users
3. ✅ Packs never write output strings (only data)
4. ✅ Rendering is deterministic and adaptive
5. ✅ UI/output parity across GitHub, workspace, audit log

---

## Next Steps

See `GOVERNANCE_IR_IMPLEMENTATION_PLAN.md` for detailed implementation roadmap.

