# Track A Output Gap Analysis & Implementation Plan

**Date**: 2026-02-24  
**Status**: CRITICAL - Output quality determines product differentiation vs GitHub bots

---

## Executive Summary

**JTBD**: "Make contract integrity enforcement explainable, trustworthy, and action-guiding—beyond what a GitHub bot can do."

**Current State**: Track A outputs check results but lacks narrative, context, and actionability.  
**Target State**: 3-layer output (Decision Card → Evaluation Narrative → Structured Payload) that tells a story.  
**Gap Severity**: 🔴 **CRITICAL** - Current output is bot-level, not product-level.

---

## 1. CHECKRUNS_PASSED Issue (Immediate Fix Required)

### Root Cause
The baseline pack YAML has incorrect params for `CHECKRUNS_PASSED` comparator:

**Current (WRONG)**:
```yaml
params:
  checkRunName: VertaAI / Baseline Contract Integrity
  allowPartialEvidence: true
```

**Expected**:
```yaml
params:
  requiredChecks:
    - VertaAI / Baseline Contract Integrity
```

### Fix
Update the baseline pack YAML to use `requiredChecks` array instead of `checkRunName` string.

---

## 2. Gap Analysis: Current vs Target Output

### 2.1 Current Output Structure

```
⚠️ 3 warning(s) found across 1 pack
Enforcement Mode: ENFORCING
Global Decision: WARN

Blocks: 0 | Warnings: 3 | Pass: 0
Coverage: 3/4 evaluable (1 not evaluable)
Packs: 1 (0 block, 1 warn, 0 pass)
Total Rules Triggered: 4
Total Evaluation Time: 12ms

Pack Results
⚠️ Test v1.0.0 (repo): WARN
Checks: 4, Coverage: 3/4, Time: 12ms

Details
Test v1.0.0
⚠️ Warnings
CODEOWNERS File Required in Every Repository
Reason: Required artifact not found. Expected one of: CODEOWNERS, .github/CODEOWNERS, docs/CODEOWNERS
Code: ARTIFACT_MISSING

❓ Unable to Evaluate
Check-Run Must Always Be Posted (Even With Partial Evidence)
Reason: No required checks specified
Code: NOT_EVALUABLE
```

### 2.2 What's Missing (Critical Gaps)

| Gap | Current | Target | Impact | Priority |
|-----|---------|--------|--------|----------|
| **Merge Impact Semantics** | Shows "WARN" but unclear if merge blocked | "Merge allowed? YES (with risk)" | Users don't know if they can merge | 🔴 P0 |
| **Change Surfaces** | Not shown | "API changed (high confidence) - paths: api/openapi.yaml" | No context for WHY rules triggered | 🔴 P0 |
| **Obligation Mapping** | Rules shown as independent checks | "API surface → requires OpenAPI spec update" | Can't understand contract model | 🔴 P0 |
| **Actionable Remediation** | Generic "add file" | "Add CODEOWNERS at root with @team-platform" | Users don't know HOW to fix | 🔴 P0 |
| **Risk Explanation** | Not shown | "Risk: Consumers may break; rollback slower" | Users don't understand IMPACT | 🟡 P1 |
| **Confidence Score** | Coverage shown but no confidence | "Confidence: Medium (1 not-evaluable, 0 external deps missing)" | Users don't know how much to trust result | 🟡 P1 |
| **Evidence Paths** | Not shown | "Triggered by: TEST_PR_27.md" | Can't verify detection logic | 🟡 P1 |
| **Structured Payload** | Text-only output | JSON with stable schema | Can't build rich UI or integrations | 🟢 P2 |

---

## 3. Target Output Structure (3-Layer Model)

### Layer 1: Decision Card (Human-First, One Screen)

```
╔══════════════════════════════════════════════════════════════╗
║  POLICY EVALUATION RESULT                                    ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Decision: ⚠️ WARN                                           ║
║  Merge Impact: ✅ Allowed with risk                          ║
║  Confidence: 🟡 Medium (3/4 evaluated, 1 config missing)     ║
║                                                              ║
║  Reason: Baseline contract requirements not met:            ║
║  3 required artifacts missing (CODEOWNERS, service catalog,  ║
║  runbook). 1 check not configured.                           ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  WHAT CHANGED                                                ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  📚 Documentation (high confidence)                          ║
║     • TEST_PR_27.md                                          ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  CONTRACTS TRIGGERED                                         ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Required Artifacts Not Satisfied (3):                       ║
║  ❌ CODEOWNERS file missing                                  ║
║  ❌ Service catalog entry missing                            ║
║  ❌ Runbook missing                                          ║
║                                                              ║
║  Configuration Issues (1):                                   ║
║  ⚙️ Check-run validation not configured                      ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  RECOMMENDED ACTIONS (fastest to green)                      ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  1. Add CODEOWNERS file                                      ║
║     Location: /CODEOWNERS or /.github/CODEOWNERS            ║
║     Owner: @team-platform                                    ║
║     Template: https://docs.github.com/codeowners             ║
║                                                              ║
║  2. Add service catalog entry                                ║
║     Location: /catalog-info.yaml                             ║
║     Owner: Service owner                                     ║
║     Template: [Show Backstage template]                      ║
║                                                              ║
║  3. Add runbook                                              ║
║     Location: /RUNBOOK.md or /docs/runbook/                  ║
║     Owner: Service owner                                     ║
║     Template: [Show runbook template]                        ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  RISK IF YOU MERGE ANYWAY                                    ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  • Code ownership unclear → slower reviews, unclear routing  ║
║  • Service ownership unknown → incidents harder to route     ║
║  • No runbook → slower incident response                     ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

### Layer 2: Evaluation Narrative (The Story)

This is the detailed explanation that differentiates Track A from bots. It tells a **story** with structured evidence.

#### Section 1: Scope & Policy Packs

```
Policy Packs Evaluated
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Pack: Test v1.0.0 (Baseline Contract Integrity)
Scope: Repository-level (vertaai-e2e-test)
Applied because: Base branch 'main' matches pack scope
Enforcement mode: ENFORCING

Effective Policy After Overlays:
• Core baseline requirements (CODEOWNERS, service catalog, runbook)
• Check-run validation (requires configuration)
• No service-specific overlays applied
```

#### Section 2: Surface Detection

```
Change Surface Detection
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📚 Documentation Surface (HIGH CONFIDENCE)
   Evidence:
   • TEST_PR_27.md (added)

   Detection heuristic: File matches docs/** or *.md patterns

   Triggered contracts:
   • Baseline repository requirements (always active)
```

#### Section 3: Obligation Evaluation

```
Contract Obligations
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Obligation 1: CODEOWNERS File Required
  Surface: All repositories (baseline)
  Status: ❌ NOT SATISFIED

  Expected: One of [CODEOWNERS, .github/CODEOWNERS, docs/CODEOWNERS]
  Observed: No matching files found in PR

  Evidence:
  • Checked 1 file in PR: TEST_PR_27.md
  • No CODEOWNERS patterns matched

  Decision: WARN (baseline requirement)

Obligation 2: Service Catalog Entry Required
  Surface: All repositories (baseline)
  Status: ❌ NOT SATISFIED

  Expected: One of [**/catalog-info.yaml, **/backstage.yaml, **/service.yaml]
  Observed: No matching files found in PR

  Evidence:
  • Checked 1 file in PR: TEST_PR_27.md
  • No service catalog patterns matched

  Decision: WARN (baseline requirement)

Obligation 3: Runbook Required
  Surface: All repositories (baseline)
  Status: ❌ NOT SATISFIED

  Expected: One of [RUNBOOK.md, runbook.md, /docs/runbook/, /runbooks/]
  Observed: No matching files found in PR

  Evidence:
  • Checked 1 file in PR: TEST_PR_27.md
  • No runbook patterns matched

  Decision: WARN (baseline requirement)

Obligation 4: Check-Run Validation
  Surface: All repositories (baseline)
  Status: ⚙️ NOT EVALUABLE

  Expected: Required checks configuration
  Observed: No requiredChecks parameter specified

  Reason: Pack YAML uses 'checkRunName' instead of 'requiredChecks' array
  Fix: Update pack YAML params to use requiredChecks: ["VertaAI / Baseline Contract Integrity"]

  Decision: NOT_EVALUABLE (configuration error)
```

#### Section 4: Invariant Evaluation

```
Invariant Checks
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No invariant checks configured in this pack.

Future invariants (when implemented):
• CODEOWNERS ↔ Service Catalog parity
• Alert routing ↔ Ownership parity
• API spec ↔ Implementation parity
```

#### Section 5: Coverage & Assumptions

```
Evaluation Coverage
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Coverage: 3/4 evaluable (75%)

Evaluated Successfully (3):
✅ CODEOWNERS requirement
✅ Service catalog requirement
✅ Runbook requirement

Not Evaluable (1):
❌ Check-run validation
   Reason: Configuration error in pack YAML
   Impact on confidence: MEDIUM
   Fallback behavior: Treated as WARN
   How to fix: Update pack YAML to use requiredChecks array

Assumptions:
• Surface detection based on file patterns only (no semantic analysis)
• No external dependencies required (all checks are local artifact checks)
• No CI evidence required (check-run validation not configured)

Confidence Score: MEDIUM
• 75% coverage (3/4 checks evaluated)
• 1 configuration error (reduces confidence)
• 0 external dependencies missing
• High confidence in surface detection (simple file pattern match)
```

#### Section 6: Remediation

```
Remediation Steps
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Priority 1: Add CODEOWNERS file
  What: Create CODEOWNERS file to define code ownership
  Who: Repository admin or team lead
  Where: /CODEOWNERS or /.github/CODEOWNERS
  How:
    1. Create file at repository root or .github/ directory
    2. Add ownership rules (e.g., * @team-platform)
    3. Commit and push

  Template:
    # Default owners for everything in the repo
    * @team-platform

    # Specific ownership for docs
    /docs/ @team-docs

  Docs: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners

Priority 2: Add service catalog entry
  What: Create Backstage service catalog entry
  Who: Service owner
  Where: /catalog-info.yaml
  How:
    1. Create catalog-info.yaml at repository root
    2. Define service metadata (name, owner, type, lifecycle)
    3. Commit and push

  Template:
    apiVersion: backstage.io/v1alpha1
    kind: Component
    metadata:
      name: vertaai-e2e-test
      description: VertaAI E2E Test Repository
    spec:
      type: service
      lifecycle: production
      owner: team-platform

  Docs: https://backstage.io/docs/features/software-catalog/descriptor-format

Priority 3: Add runbook
  What: Create operational runbook for service
  Who: Service owner or on-call engineer
  Where: /RUNBOOK.md or /docs/runbook/
  How:
    1. Create RUNBOOK.md at repository root or docs/runbook/ directory
    2. Document common operations, troubleshooting, escalation
    3. Commit and push

  Template:
    # Runbook: [Service Name]

    ## Service Overview
    [Brief description]

    ## Common Operations
    - How to deploy
    - How to rollback
    - How to scale

    ## Troubleshooting
    - Common issues and fixes

    ## Escalation
    - On-call: @team-platform
    - Slack: #team-platform

  Docs: [Internal runbook template]

Priority 4: Fix check-run validation configuration
  What: Update pack YAML to use correct parameter format
  Who: Policy pack admin
  Where: Policy pack YAML editor (UI or API)
  How:
    1. Edit pack YAML
    2. Change checkRunName to requiredChecks array
    3. Re-publish pack

  Change:
    # From:
    params:
      checkRunName: VertaAI / Baseline Contract Integrity

    # To:
    params:
      requiredChecks:
        - VertaAI / Baseline Contract Integrity
```

### Layer 3: Structured Payload (Machine-Readable)

This is the stable JSON schema that powers the UI and future integrations.

```json
{
  "global": {
    "decision": "warn",
    "merge_gate": "allowed_with_risk",
    "confidence_score": 0.75,
    "coverage": {
      "evaluated_count": 3,
      "total_count": 4,
      "not_evaluable_count": 1,
      "percentage": 75
    },
    "runtime_ms": 12,
    "evaluation_timestamp": "2026-02-24T10:30:00Z"
  },

  "change_surfaces": [
    {
      "surface_id": "docs",
      "surface_type": "documentation",
      "confidence": "high",
      "evidence": {
        "files_changed": ["TEST_PR_27.md"],
        "detection_heuristic": "file_pattern_match",
        "patterns_matched": ["*.md"]
      },
      "triggered_contracts": ["baseline_repository_requirements"]
    }
  ],

  "packs": [
    {
      "pack_id": "07390d20-251d-4607-95d2-259d69bc21c3",
      "pack_name": "Test",
      "pack_version": "1.0.0",
      "pack_scope": "repository",
      "pack_decision": "warn",
      "enforcement_mode": "ENFORCING",
      "findings_count": {
        "block": 0,
        "warn": 3,
        "pass": 0,
        "not_evaluable": 1
      },
      "evaluation_time_ms": 12,
      "findings": [
        {
          "finding_id": "codeowners-required-001",
          "rule_id": "codeowners-required",
          "rule_name": "CODEOWNERS File Required in Every Repository",
          "type": "obligation_missing",
          "severity": "warn",
          "surface": "baseline",
          "contract": "codeowners_file_present",
          "status": "fail",
          "expected": {
            "artifact_type": "file",
            "patterns": ["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"],
            "match_type": "anyOf"
          },
          "observed": {
            "files_checked": ["TEST_PR_27.md"],
            "matches_found": []
          },
          "evidence": {
            "type": "local_artifact_check",
            "files_in_pr": ["TEST_PR_27.md"],
            "patterns_checked": ["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"]
          },
          "remediation": {
            "priority": 1,
            "action": "Add CODEOWNERS file",
            "owner": "Repository admin or team lead",
            "location": "/CODEOWNERS or /.github/CODEOWNERS",
            "template_url": "https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners",
            "estimated_effort_minutes": 5
          },
          "risk_if_ignored": "Code ownership unclear → slower reviews, unclear routing"
        },
        {
          "finding_id": "service-catalog-required-001",
          "rule_id": "service-catalog-required",
          "rule_name": "Service Owner Must Be Declared in Service Catalog",
          "type": "obligation_missing",
          "severity": "warn",
          "surface": "baseline",
          "contract": "service_catalog_entry_present",
          "status": "fail",
          "expected": {
            "artifact_type": "file",
            "patterns": ["**/catalog-info.yaml", "**/backstage.yaml", "**/service.yaml"],
            "match_type": "anyOf"
          },
          "observed": {
            "files_checked": ["TEST_PR_27.md"],
            "matches_found": []
          },
          "evidence": {
            "type": "local_artifact_check",
            "files_in_pr": ["TEST_PR_27.md"],
            "patterns_checked": ["**/catalog-info.yaml", "**/backstage.yaml", "**/service.yaml"]
          },
          "remediation": {
            "priority": 2,
            "action": "Add service catalog entry",
            "owner": "Service owner",
            "location": "/catalog-info.yaml",
            "template_url": "https://backstage.io/docs/features/software-catalog/descriptor-format",
            "estimated_effort_minutes": 10
          },
          "risk_if_ignored": "Service ownership unknown → incidents harder to route"
        },
        {
          "finding_id": "runbook-required-001",
          "rule_id": "runbook-required",
          "rule_name": "Runbook Required for Tier-1 Services",
          "type": "obligation_missing",
          "severity": "warn",
          "surface": "baseline",
          "contract": "runbook_present",
          "status": "fail",
          "expected": {
            "artifact_type": "file",
            "patterns": ["RUNBOOK.md", "runbook.md", "/docs/runbook/", "/runbooks/"],
            "match_type": "anyOf"
          },
          "observed": {
            "files_checked": ["TEST_PR_27.md"],
            "matches_found": []
          },
          "evidence": {
            "type": "local_artifact_check",
            "files_in_pr": ["TEST_PR_27.md"],
            "patterns_checked": ["RUNBOOK.md", "runbook.md", "/docs/runbook/", "/runbooks/"]
          },
          "remediation": {
            "priority": 3,
            "action": "Add runbook",
            "owner": "Service owner or on-call engineer",
            "location": "/RUNBOOK.md or /docs/runbook/",
            "template_url": "[Internal runbook template]",
            "estimated_effort_minutes": 30
          },
          "risk_if_ignored": "No runbook → slower incident response"
        },
        {
          "finding_id": "checkrun-always-001",
          "rule_id": "checkrun-always",
          "rule_name": "Check-Run Must Always Be Posted (Even With Partial Evidence)",
          "type": "not_evaluable",
          "severity": "not_evaluable",
          "surface": "baseline",
          "contract": "checkrun_validation",
          "status": "not_evaluable",
          "reason": "No required checks specified",
          "reason_code": "NOT_EVALUABLE",
          "root_cause": "Configuration error in pack YAML",
          "expected": {
            "param": "requiredChecks",
            "type": "array"
          },
          "observed": {
            "param": "checkRunName",
            "type": "string"
          },
          "remediation": {
            "priority": 4,
            "action": "Fix pack YAML configuration",
            "owner": "Policy pack admin",
            "location": "Policy pack YAML editor",
            "fix": "Change 'checkRunName' to 'requiredChecks' array",
            "estimated_effort_minutes": 2
          },
          "impact_on_confidence": "medium",
          "fallback_behavior": "Treated as WARN"
        }
      ]
    }
  ],

  "provenance": {
    "policy_pack_hash": "sha256:abc123...",
    "config_sources": [
      {
        "type": "pack_yaml",
        "pack_id": "07390d20-251d-4607-95d2-259d69bc21c3",
        "version": "1.0.0"
      }
    ],
    "evaluation_inputs": {
      "pr_number": 27,
      "head_sha": "4086a31",
      "base_sha": "91328e2",
      "repo": "Fredjr/vertaai-e2e-test",
      "base_branch": "main",
      "head_branch": "test-pr-27-baseline-pack",
      "files_changed": ["TEST_PR_27.md"]
    },
    "engine_version": "1.0.0",
    "fact_catalog_version": "1.0.0"
  }
}
```

---

## 4. Implementation Plan: "Policy Evaluation Graph" Architecture

### Step 1: Introduce Policy Evaluation Graph

**Goal**: Model the flow as **Inputs → Surfaces → Obligations → Evidence → Invariants → Decision**

**Implementation**:

1. **Create typed structures** in `packEvaluator.ts`:

```typescript
interface DetectedSurface {
  surfaceId: string;
  surfaceType: 'api' | 'db' | 'infra' | 'observability' | 'ownership' | 'docs';
  confidence: 'high' | 'medium' | 'low';
  evidence: {
    filesChanged: string[];
    detectionHeuristic: string;
    patternsMatched: string[];
  };
}

interface ActivatedContract {
  contractId: string;
  surface: string;
  obligations: ObligationResult[];
  invariants: InvariantResult[];
}

interface ObligationResult {
  obligationId: string;
  satisfied: boolean;
  expected: any;
  observed: any;
  evidence: any[];
  remediation: RemediationStep;
}

interface InvariantResult {
  invariantId: string;
  passed: boolean;
  expected: any;
  observed: any;
  evidence: any[];
  remediation: RemediationStep;
}

interface RemediationStep {
  priority: number;
  action: string;
  owner: string;
  location: string;
  template?: string;
  docsLink?: string;
  estimatedEffortMinutes?: number;
}
```

2. **Build evaluation graph** in pack evaluator:

```typescript
// Step 1: Detect surfaces
const surfaces = detectChangeSurfaces(context);

// Step 2: Activate contracts based on surfaces
const contracts = activateContracts(pack, surfaces);

// Step 3: Evaluate obligations
const obligationResults = await evaluateObligations(contracts, context);

// Step 4: Evaluate invariants
const invariantResults = await evaluateInvariants(contracts, context);

// Step 5: Compute decision
const decision = computeDecisionFromGraph(obligationResults, invariantResults);

// Step 6: Compute confidence
const confidence = computeConfidence(obligationResults, invariantResults, surfaces);
```

3. **Surface detection logic**:

```typescript
function detectChangeSurfaces(context: PRContext): DetectedSurface[] {
  const surfaces: DetectedSurface[] = [];

  // API surface detection
  const apiFiles = context.files.filter(f =>
    f.filename.match(/openapi|swagger|graphql|proto/) ||
    f.filename.includes('/api/') ||
    f.filename.includes('/routes/')
  );
  if (apiFiles.length > 0) {
    surfaces.push({
      surfaceId: 'api',
      surfaceType: 'api',
      confidence: 'high',
      evidence: {
        filesChanged: apiFiles.map(f => f.filename),
        detectionHeuristic: 'file_pattern_match',
        patternsMatched: ['openapi', 'swagger', 'graphql', 'proto', '/api/', '/routes/']
      }
    });
  }

  // DB surface detection
  const dbFiles = context.files.filter(f =>
    f.filename.includes('/migrations/') ||
    f.filename.includes('/schema/') ||
    f.filename.match(/\.sql$/)
  );
  if (dbFiles.length > 0) {
    surfaces.push({
      surfaceId: 'db',
      surfaceType: 'db',
      confidence: 'high',
      evidence: {
        filesChanged: dbFiles.map(f => f.filename),
        detectionHeuristic: 'file_pattern_match',
        patternsMatched: ['/migrations/', '/schema/', '.sql']
      }
    });
  }

  // Docs surface detection
  const docsFiles = context.files.filter(f =>
    f.filename.match(/\.md$/) ||
    f.filename.includes('/docs/')
  );
  if (docsFiles.length > 0) {
    surfaces.push({
      surfaceId: 'docs',
      surfaceType: 'docs',
      confidence: 'high',
      evidence: {
        filesChanged: docsFiles.map(f => f.filename),
        detectionHeuristic: 'file_pattern_match',
        patternsMatched: ['.md', '/docs/']
      }
    });
  }

  return surfaces;
}
```

**Files to modify**:
- `apps/api/src/services/gatekeeper/yaml-dsl/packEvaluator.ts`
- `apps/api/src/services/gatekeeper/yaml-dsl/types.ts` (add new interfaces)

---

### Step 2: Make NOT_EVALUABLE a First-Class Coverage Concept

**Goal**: Define deterministic behavior for missing configuration or external data

**Implementation**:

1. **Add to YAML DSL**:

```yaml
evaluation:
  coverage_policy:
    on_missing_config: warn  # or block, skip_with_ack
    on_missing_external_data: warn  # or block, skip_with_ack
    require_manual_ack_for_not_evaluable: true
```

2. **Update comparator results** to include remediation:

```typescript
interface ComparatorResult {
  comparatorId: ComparatorId;
  status: 'pass' | 'fail' | 'unknown';
  reasonCode: FindingCode;
  evidence: any[];
  message: string;

  // NEW: Remediation for NOT_EVALUABLE
  remediation?: {
    rootCause: string;
    fix: string;
    configLocation: string;
    impactOnConfidence: 'high' | 'medium' | 'low';
    fallbackBehavior: string;
  };
}
```

3. **Update NOT_EVALUABLE handling** in pack evaluator:

```typescript
if (result.status === 'unknown') {
  const coveragePolicy = pack.evaluation?.coverage_policy || {
    on_missing_config: 'warn',
    on_missing_external_data: 'warn'
  };

  // Determine if this is config missing or external data missing
  const isConfigMissing = result.reasonCode === FindingCode.NOT_EVALUABLE;
  const decision = isConfigMissing
    ? coveragePolicy.on_missing_config
    : coveragePolicy.on_missing_external_data;

  findings.push({
    ...finding,
    decisionOnUnknown: decision,
    evaluationStatus: 'not_evaluable',
    remediation: result.remediation
  });
}
```

**Files to modify**:
- `apps/api/src/services/gatekeeper/yaml-dsl/types.ts`
- `apps/api/src/services/gatekeeper/yaml-dsl/packEvaluator.ts`
- All comparators to include remediation in NOT_EVALUABLE results

---

### Step 3: Add Remediation Generator

**Goal**: Every finding includes actionable remediation steps

**Implementation**:

1. **Create remediation catalog**:

```typescript
// apps/api/src/services/gatekeeper/yaml-dsl/remediationCatalog.ts

export const remediationCatalog: Record<string, RemediationTemplate> = {
  ARTIFACT_MISSING_CODEOWNERS: {
    action: 'Add CODEOWNERS file',
    owner: 'Repository admin or team lead',
    location: '/CODEOWNERS or /.github/CODEOWNERS',
    template: `# Default owners for everything in the repo\n* @team-platform\n\n# Specific ownership for docs\n/docs/ @team-docs`,
    docsLink: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners',
    estimatedEffortMinutes: 5
  },

  ARTIFACT_MISSING_SERVICE_CATALOG: {
    action: 'Add service catalog entry',
    owner: 'Service owner',
    location: '/catalog-info.yaml',
    template: `apiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n  name: {{SERVICE_NAME}}\n  description: {{SERVICE_DESCRIPTION}}\nspec:\n  type: service\n  lifecycle: production\n  owner: {{TEAM_NAME}}`,
    docsLink: 'https://backstage.io/docs/features/software-catalog/descriptor-format',
    estimatedEffortMinutes: 10
  },

  // ... more remediation templates
};
```

2. **Generate remediation** in comparators:

```typescript
// In localArtifactPresent.ts comparator
if (!found) {
  const remediationKey = `ARTIFACT_MISSING_${params.artifactType?.toUpperCase()}`;
  const remediation = remediationCatalog[remediationKey] || {
    action: `Add ${params.patterns.join(' or ')}`,
    owner: 'Repository owner',
    location: params.patterns[0]
  };

  return {
    comparatorId: this.id,
    status: 'fail',
    reasonCode: FindingCode.ARTIFACT_MISSING,
    evidence: [],
    message: `Required artifact not found. Expected one of: ${params.patterns.join(', ')}`,
    remediation
  };
}
```

**Files to create**:
- `apps/api/src/services/gatekeeper/yaml-dsl/remediationCatalog.ts`

**Files to modify**:
- All comparators to include remediation in results

---

### Step 4: Produce 3-Layer Output

**Goal**: Render Decision Card → Narrative → Payload

**Implementation**:

1. **Create output renderer**:

```typescript
// apps/api/src/services/gatekeeper/yaml-dsl/outputRenderer.ts

export class OutputRenderer {
  renderDecisionCard(result: PackEvaluationResult, surfaces: DetectedSurface[]): string {
    // Render Layer 1: Decision Card
    // ... (see target output example above)
  }

  renderNarrative(result: PackEvaluationResult, surfaces: DetectedSurface[]): string {
    // Render Layer 2: Evaluation Narrative
    // ... (see target output example above)
  }

  renderStructuredPayload(result: PackEvaluationResult, surfaces: DetectedSurface[]): object {
    // Render Layer 3: Structured Payload
    // ... (see target output example above)
  }
}
```

2. **Update GitHub check output** to use new renderer:

```typescript
// In yamlGatekeeperIntegration.ts
const renderer = new OutputRenderer();
const decisionCard = renderer.renderDecisionCard(result, surfaces);
const narrative = renderer.renderNarrative(result, surfaces);
const payload = renderer.renderStructuredPayload(result, surfaces);

await github.rest.checks.create({
  ...checkParams,
  output: {
    title: decisionCard.split('\n')[0],
    summary: decisionCard,
    text: narrative
  }
});

// Also store payload in database for UI
await prisma.policyPackEvaluation.create({
  data: {
    ...evaluationData,
    structuredPayload: payload
  }
});
```

**Files to create**:
- `apps/api/src/services/gatekeeper/yaml-dsl/outputRenderer.ts`

**Files to modify**:
- `apps/api/src/services/gatekeeper/yaml-dsl/yamlGatekeeperIntegration.ts`
- Database schema to add `structuredPayload` JSON field

---

### Step 5: UI Mapping Updates

**Goal**: UI reflects the new 3-layer output model

**Implementation**:

1. **Update PR check display** to show Decision Card:

```typescript
// apps/web/src/components/PolicyPackEvaluation.tsx

export function PolicyPackEvaluation({ evaluation }) {
  const { decisionCard, narrative, payload } = evaluation;

  return (
    <div>
      {/* Layer 1: Decision Card (always visible) */}
      <DecisionCard data={payload.global} surfaces={payload.change_surfaces} />

      {/* Layer 2: Evaluation Narrative (expandable) */}
      <Collapsible title="Detailed Evaluation">
        <EvaluationNarrative narrative={narrative} />
      </Collapsible>

      {/* Layer 3: Structured Payload (for debugging) */}
      <Collapsible title="Raw Data (JSON)">
        <pre>{JSON.stringify(payload, null, 2)}</pre>
      </Collapsible>
    </div>
  );
}
```

2. **Add surface detection display**:

```typescript
function DecisionCard({ data, surfaces }) {
  return (
    <Card>
      <Section title="Decision">
        <DecisionBadge decision={data.decision} />
        <MergeImpact gate={data.merge_gate} />
        <ConfidenceScore score={data.confidence_score} />
      </Section>

      <Section title="What Changed">
        {surfaces.map(surface => (
          <SurfaceCard key={surface.surface_id} surface={surface} />
        ))}
      </Section>

      <Section title="Contracts Triggered">
        <ObligationsList obligations={...} />
        <InvariantsList invariants={...} />
      </Section>

      <Section title="Recommended Actions">
        <RemediationSteps steps={...} />
      </Section>

      <Section title="Risk If You Merge Anyway">
        <RiskExplanation risks={...} />
      </Section>
    </Card>
  );
}
```

**Files to modify**:
- `apps/web/src/components/PolicyPackEvaluation.tsx` (or create new component)
- `apps/web/src/pages/pr/[number].tsx` (to use new component)

---

### Step 6: Multi-Pack Strategy Display

**Goal**: Show which packs applied and why

**Implementation**:

1. **Add pack resolution step** in pack selector:

```typescript
// In packSelector.ts
export interface PackResolutionResult {
  appliedPacks: {
    packId: string;
    packName: string;
    packVersion: string;
    packScope: string;
    reason: string; // "Base branch 'main' matches pack scope"
  }[];
  effectivePolicy: {
    rules: Rule[];
    overlays: string[]; // Pack IDs that were merged
    precedence: string[]; // Order of precedence
  };
  policyHash: string; // For reproducibility
}
```

2. **Display in output**:

```typescript
// In narrative section
function renderPacksEvaluated(resolution: PackResolutionResult): string {
  return `
Policy Packs Evaluated
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${resolution.appliedPacks.map(pack => `
Pack: ${pack.packName} v${pack.packVersion} (${pack.packScope})
Applied because: ${pack.reason}
`).join('\n')}

Effective Policy After Overlays:
${resolution.effectivePolicy.overlays.length > 0
  ? `• Merged ${resolution.effectivePolicy.overlays.length} overlay pack(s)`
  : '• No overlays applied'}
• Total rules: ${resolution.effectivePolicy.rules.length}
• Policy hash: ${resolution.policyHash}
  `;
}
```

**Files to modify**:
- `apps/api/src/services/gatekeeper/yaml-dsl/packSelector.ts`
- `apps/api/src/services/gatekeeper/yaml-dsl/outputRenderer.ts`

---

## 5. Quick Wins (Immediate Improvements)

These can be implemented **before** the full graph refactor to materially improve output quality:

### Quick Win #1: Add Merge Impact Line

**Effort**: 30 minutes
**Impact**: HIGH - Users immediately know if they can merge

```typescript
// In computeDecision()
function computeMergeImpact(decision: 'pass' | 'warn' | 'block', enforcementMode: string): string {
  if (decision === 'block') return 'blocked';
  if (decision === 'warn' && enforcementMode === 'ENFORCING') return 'allowed_with_risk';
  return 'allowed';
}

// In output
const mergeImpact = computeMergeImpact(result.decision, pack.enforcementMode);
console.log(`Merge Impact: ${mergeImpact === 'blocked' ? '⛔ Blocked' : mergeImpact === 'allowed_with_risk' ? '⚠️ Allowed with risk' : '✅ Allowed'}`);
```

### Quick Win #2: Add Coverage/Confidence Summary

**Effort**: 1 hour
**Impact**: HIGH - Users know how much to trust the result

```typescript
function computeConfidenceSummary(findings: Finding[]): string {
  const total = findings.length;
  const evaluated = findings.filter(f => f.evaluationStatus === 'evaluated').length;
  const notEvaluable = findings.filter(f => f.evaluationStatus === 'not_evaluable').length;

  const confidence = notEvaluable === 0 ? 'high' : notEvaluable <= total * 0.25 ? 'medium' : 'low';

  return `Confidence: ${confidence} (${evaluated}/${total} evaluated, ${notEvaluable} config missing)`;
}
```

### Quick Win #3: Add Trigger Evidence

**Effort**: 30 minutes
**Impact**: MEDIUM - Users can verify detection logic

```typescript
// In output
console.log(`Triggered by: ${context.files.map(f => f.filename).join(', ')}`);
```

### Quick Win #4: Add Action List

**Effort**: 2 hours
**Impact**: HIGH - Users know exactly what to do

```typescript
function generateActionList(findings: Finding[]): string[] {
  const actions: string[] = [];

  findings
    .filter(f => f.comparatorResult?.status === 'fail')
    .forEach((f, i) => {
      const remediation = f.comparatorResult?.remediation;
      if (remediation) {
        actions.push(`(${i + 1}) ${remediation.action} at ${remediation.location}`);
      }
    });

  findings
    .filter(f => f.evaluationStatus === 'not_evaluable')
    .forEach((f, i) => {
      const remediation = f.comparatorResult?.remediation;
      if (remediation) {
        actions.push(`(${actions.length + 1}) ${remediation.fix} at ${remediation.configLocation}`);
      }
    });

  return actions;
}

// In output
console.log('To resolve:');
generateActionList(findings).forEach(action => console.log(`  ${action}`));
```

---

## 6. Summary & Next Steps

### Current Status
- ✅ Basic pack evaluation working
- ✅ `requires.localArtifacts` support implemented
- ✅ Proper error codes (ARTIFACT_MISSING, PASS, NOT_EVALUABLE)
- ❌ Output is bot-level, not product-level
- ❌ No change surface detection
- ❌ No obligation/invariant model
- ❌ No actionable remediation
- ❌ No structured payload

### Recommended Implementation Order

**Phase 1: Quick Wins** (1 day)
1. Add merge impact line
2. Add coverage/confidence summary
3. Add trigger evidence
4. Add action list

**Phase 2: Remediation** (2-3 days)
1. Create remediation catalog
2. Update comparators to include remediation
3. Generate action list from remediation

**Phase 3: Surface Detection** (3-5 days)
1. Implement surface detection logic
2. Display surfaces in output
3. Map surfaces to contracts

**Phase 4: Policy Evaluation Graph** (1-2 weeks)
1. Create typed structures
2. Build evaluation graph
3. Compute decision from graph
4. Compute confidence from graph

**Phase 5: 3-Layer Output** (1 week)
1. Create output renderer
2. Render Decision Card
3. Render Evaluation Narrative
4. Render Structured Payload
5. Update GitHub check output
6. Update UI

**Phase 6: Multi-Pack Strategy** (3-5 days)
1. Add pack resolution step
2. Display applied packs and why
3. Show effective policy after overlays

### Total Estimated Effort
- Quick wins: 1 day
- Full implementation: 4-6 weeks

### Success Metrics
- Users can answer "Can I merge?" in <5 seconds
- Users can answer "What do I need to fix?" in <10 seconds
- Users can answer "Why does this matter?" in <30 seconds
- Confidence score accurately reflects evaluation quality
- NOT_EVALUABLE findings include actionable remediation
- Structured payload enables rich UI and integrations

---

## 📊 Implementation Progress

### ✅ Phase 1: Immediate Fixes (COMPLETED - 2026-02-26)

**1. Fixed CHECKRUNS_PASSED NOT_EVALUABLE Issue**
- **Problem**: Baseline pack was using `checkRunName` (string) instead of `requiredChecks` (array)
- **Solution**: Updated baseline pack YAML via API with correct parameter format
- **Status**: ✅ COMPLETE - Pack published and tested on PR #27
- **Commit**: Updated via API on 2026-02-26 19:10 UTC

**2. Fixed `Code: undefined` Issue**
- **Problem**: ComparatorResult was using `findingCode` instead of `reasonCode`
- **Solution**: Updated packEvaluator.ts to use correct field names
- **Status**: ✅ COMPLETE - All findings now show proper reason codes
- **Commit**: `5c2e57f` - "fix(track-a): Use reasonCode and add comparatorId field"

### ✅ Phase 2: Quick Wins (COMPLETED - 2026-02-26)

**Implemented all 4 Quick Wins to move from "bot output" to "product output":**

**1. Merge Impact Line** ✅
- Added clear "Merge allowed? YES/NO" indicator at top of summary
- Shows context: blocking issues, warnings, or all passed
- **File**: `githubCheckCreator.ts` - `buildMultiPackCheckSummary()`
- **Impact**: Users can answer "Can I merge?" in <5 seconds

**2. Coverage/Confidence Score** ✅
- Computes confidence based on evaluable vs total checks
- Shows High/Medium/Low label with percentage
- Formula: High (≥90%), Medium (≥70%), Low (<70%)
- **File**: `githubCheckCreator.ts` - `computeConfidenceScore()`
- **Impact**: Users understand reliability of the decision

**3. Trigger Evidence** ✅
- Shows why evaluation was triggered
- Lists change surfaces, predicates, or conditions that matched
- Provides context for "why am I seeing this check?"
- **File**: `githubCheckCreator.ts` - `extractTriggerEvidence()`
- **Impact**: Users understand evaluation context

**4. Action List** ✅
- Extracts actionable items from findings
- Shows top 5 actions needed to resolve issues
- Maps reason codes to specific remediation steps
- **File**: `githubCheckCreator.ts` - `extractActionItems()`
- **Impact**: Users can answer "What do I need to fix?" in <10 seconds

**Commit**: `7b4b645` - "feat(track-a): Implement Quick Wins for output quality"

### 🚧 Phase 3: Policy Evaluation Graph (IN PROGRESS)

**Next Steps:**

1. **Step 1: Introduce Graph Structures** (Not Started)
   - Add `PolicyEvaluationGraph` type to `types.ts`
   - Add `Surface`, `Obligation`, `Evidence`, `Invariant` types
   - Update `PackEvaluationResult` to include graph

2. **Step 2: Build Graph During Evaluation** (Not Started)
   - Modify `packEvaluator.ts` to construct graph
   - Track surface detection, obligation mapping, evidence collection
   - Preserve graph in evaluation result

3. **Step 3: Implement 3-Layer Output** (Not Started)
   - Layer 1: Decision Card (merge impact, confidence, actions)
   - Layer 2: Evaluation Narrative (surfaces, obligations, invariants)
   - Layer 3: Structured Payload (machine-readable JSON)

4. **Step 4: Update GitHub Check Creator** (Not Started)
   - Use graph to generate narrative
   - Include structured payload in check output
   - Add risk explanation and remediation guidance

5. **Step 5: Add UI Support** (Not Started)
   - Create React components for graph visualization
   - Add interactive drill-down for evidence
   - Show confidence breakdown by surface

6. **Step 6: Testing & Refinement** (Not Started)
   - Test on real PRs across multiple packs
   - Gather user feedback
   - Iterate on narrative quality

### 📈 Current State vs Target State

| Feature | Current State | Target State | Status |
|---------|---------------|--------------|--------|
| Merge Impact | ✅ Implemented | "Merge allowed? YES/NO" | ✅ COMPLETE |
| Coverage/Confidence | ✅ Implemented | High/Medium/Low with % | ✅ COMPLETE |
| Trigger Evidence | ✅ Implemented | Why evaluation triggered | ✅ COMPLETE |
| Action List | ✅ Implemented | Top 5 actionable items | ✅ COMPLETE |
| **Graph Types** | ✅ Implemented | PolicyEvaluationGraph, PackEvaluationGraph | ✅ COMPLETE |
| **Graph Builder** | ✅ Implemented | Build graph during evaluation | ✅ COMPLETE |
| **Narrative Output** | ✅ Implemented | Layer 2 narrative from graph | ✅ COMPLETE |
| Surface Detection | 🟡 Partial | "Detected: API change" | 🚧 IN PROGRESS |
| Obligation Mapping | 🟡 Partial | "Contract requires..." | 🚧 IN PROGRESS |
| Evidence Collection | 🟡 Partial | "Found: OpenAPI spec" | 🚧 IN PROGRESS |
| Invariant Checks | ❌ Not implemented | "Verified: Spec ↔ Code" | 🚧 TODO |
| Risk Explanation | ❌ Not implemented | "Why this matters..." | 🚧 TODO |
| Structured Payload | 🟡 Partial | Machine-readable JSON | 🚧 IN PROGRESS |

### 🎯 Phase 3 Progress Update (2026-02-26)

**✅ COMPLETED: Step 1 - Graph Structures**
- Added `PolicyEvaluationGraph` and `PackEvaluationGraph` types to `types.ts`
- Added supporting types: `DetectedSurface`, `EvaluatedObligation`, `EvidenceItem`, `EvaluatedInvariant`
- Updated `PackEvaluationResult` to include optional `evaluationGraph` field

**✅ COMPLETED: Step 2 - Graph Builder Functions**
- Implemented `buildPolicyEvaluationGraph()` - builds graph for a single rule
- Implemented `buildPackEvaluationGraph()` - aggregates all rule graphs
- Added helper functions:
  - `extractDetectedSurfaces()` - extracts change surfaces from rule triggers
  - `extractEvaluatedObligations()` - converts findings to obligation format
  - `extractEvidence()` - collects all evidence items
  - `convertToEvidenceItem()` - normalizes evidence format
  - `computeRuleDecision()` - computes decision with causality tracking

**✅ COMPLETED: Step 3 - Integration with Evaluator**
- Wired graph building into `PackEvaluator.evaluate()` method
- Graph is now built automatically during evaluation
- Graph is attached to `PackEvaluationResult.evaluationGraph`

**✅ COMPLETED: Step 4 - Narrative Output**
- Implemented `buildEvaluationNarrative()` in `githubCheckCreator.ts`
- Integrated narrative into `buildMultiPackCheckSummary()`
- Narrative shows:
  - Detected change surfaces with confidence scores
  - Triggered rules with obligation status
  - Overall coverage and confidence metrics

### 🎯 Next Immediate Actions

1. **Test Phase 3 Implementation on PR #27** (Next)
   - Deploy changes to Railway
   - Verify evaluation graph is built correctly
   - Check that narrative appears in GitHub check output
   - Validate graph structure in JSON payload

2. **Enhance Surface Detection** (Step 2 Refinement)
   - Improve `extractDetectedSurfaces()` to use `changeSurfaceCatalog`
   - Add heuristic predicate detection
   - Include file-level evidence in surface detection

3. **Add Invariant Support** (Step 2 Extension)
   - Implement `extractEvaluatedInvariants()` logic
   - Add invariant-specific comparators
   - Show invariant checks in narrative

4. **Iterate Based on Feedback**
   - Gather user feedback on narrative quality
   - Refine graph structure based on UI needs
   - Improve evidence collection and presentation

---

**Last Updated**: 2026-02-26 20:45 UTC
**Next Review**: After Phase 3 testing on PR #27


