# 📋 Week 5-6: Comparators & IntegrityFinding - Detailed Implementation Plan

**Date**: 2026-02-14  
**Phase**: Contract Integrity & Readiness - Week 5-6  
**Estimated Duration**: 2 weeks (10 working days)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Step 1: Comparator Interface & Base Class](#step-1-comparator-interface--base-class)
3. [Step 2: OpenAPI Comparator](#step-2-openapi-comparator)
4. [Step 3: Terraform ↔ Runbook Comparator](#step-3-terraform--runbook-comparator)
5. [Step 4: IntegrityFinding Generation](#step-4-integrityfinding-generation)
6. [Step 5: Comparison Telemetry](#step-5-comparison-telemetry)
7. [Integration Points](#integration-points)
8. [Testing Strategy](#testing-strategy)
9. [Success Criteria](#success-criteria)

---

## Architecture Overview

### **Core Principle: Deterministic Comparison**

Comparators are **deterministic, fast, and LLM-free**. They:
- ✅ Compare artifact snapshots (not raw content)
- ✅ Generate structured findings (not prose)
- ✅ Run in < 5 seconds (not minutes)
- ✅ Produce reproducible results (same input → same output)

### **Separation of Concerns**

```
┌─────────────────────────────────────────────────────────────┐
│  CONTRACT VALIDATION (Fast, Deterministic)                  │
│  ├─ ArtifactFetcher: Fetch versioned snapshots              │
│  ├─ Comparators: Compare snapshots (< 5s)                   │
│  ├─ IntegrityFinding: Structured findings                   │
│  └─ GitHub Check: Pass/Warn/Fail (< 30s total)              │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ (Optional: Create DriftCandidate)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  DRIFT REMEDIATION (Thorough, LLM-Assisted)                 │
│  ├─ DriftCandidate: 18-state machine                        │
│  ├─ LLM Agents: Generate patches (minutes)                  │
│  ├─ Slack Approval: Human review                            │
│  └─ Writeback: Update docs                                  │
└─────────────────────────────────────────────────────────────┘
```

### **Key Design Decisions**

| Decision | Rationale |
|----------|-----------|
| **Comparators are stateless** | Easy to test, no side effects |
| **Comparators don't fetch artifacts** | ArtifactFetcher handles that |
| **Comparators don't create DriftCandidates** | Orchestrator decides |
| **Comparators return structured findings** | Not prose or diffs |
| **Comparators are pluggable** | Easy to add new comparators |

---

## Step 1: Comparator Interface & Base Class

**Duration**: 1 day  
**Files**: `apps/api/src/services/contracts/comparators/base.ts`

### **1.1 Target Architecture**

```typescript
// Base interface that all comparators implement
export interface IComparator {
  // Metadata
  readonly comparatorType: string;
  readonly supportedArtifactTypes: string[];
  readonly version: string;
  
  // Core comparison method
  compare(input: ComparatorInput): Promise<ComparatorResult>;
  
  // Applicability check
  canCompare(invariant: Invariant, snapshots: ArtifactSnapshot[]): boolean;
}

// Abstract base class with common logic
export abstract class BaseComparator implements IComparator {
  abstract readonly comparatorType: string;
  abstract readonly supportedArtifactTypes: string[];
  readonly version: string = '1.0.0';
  
  // Template method pattern
  async compare(input: ComparatorInput): Promise<ComparatorResult> {
    // 1. Validate input
    this.validateInput(input);
    
    // 2. Check applicability
    if (!this.canCompare(input.invariant, [input.leftSnapshot, input.rightSnapshot])) {
      return this.createSkippedResult(input.invariant.invariantId, 'not_applicable');
    }
    
    // 3. Extract structured data from snapshots
    const leftData = this.extractData(input.leftSnapshot);
    const rightData = this.extractData(input.rightSnapshot);
    
    // 4. Perform comparison (implemented by subclass)
    const findings = await this.performComparison(leftData, rightData, input);
    
    // 5. Calculate coverage
    const coverage = this.calculateCoverage(input, findings);
    
    // 6. Return result
    return {
      invariantId: input.invariant.invariantId,
      evaluated: true,
      findings,
      coverage,
    };
  }
  
  // Abstract methods (must be implemented by subclasses)
  abstract canCompare(invariant: Invariant, snapshots: ArtifactSnapshot[]): boolean;
  abstract extractData(snapshot: ArtifactSnapshot): any;
  abstract performComparison(left: any, right: any, input: ComparatorInput): Promise<IntegrityFinding[]>;
  
  // Helper methods (shared by all comparators)
  protected validateInput(input: ComparatorInput): void { /* ... */ }
  protected createSkippedResult(invariantId: string, reason: string): ComparatorResult { /* ... */ }
  protected calculateCoverage(input: ComparatorInput, findings: IntegrityFinding[]): any { /* ... */ }
  protected createFinding(params: CreateFindingParams): IntegrityFinding { /* ... */ }
}
```

### **1.2 Logic Flow**

```
Input: ComparatorInput
  ├─ invariant: Invariant (what to check)
  ├─ leftSnapshot: ArtifactSnapshot (e.g., OpenAPI spec)
  ├─ rightSnapshot: ArtifactSnapshot (e.g., Confluence doc)
  └─ context: { workspaceId, contractId, signalEventId, service, repo }

Step 1: Validate Input
  ├─ Check invariant is enabled
  ├─ Check snapshots are not null
  └─ Check snapshots match supported types

Step 2: Check Applicability
  ├─ Does invariant.comparatorType match this comparator?
  ├─ Do snapshot types match supportedArtifactTypes?
  └─ If not applicable → return skipped result

Step 3: Extract Structured Data
  ├─ leftSnapshot.extract → leftData (e.g., { endpoints: [...], schemas: [...] })
  └─ rightSnapshot.extract → rightData (e.g., { endpoints: [...], examples: [...] })

Step 4: Perform Comparison (subclass-specific)
  ├─ Compare leftData vs rightData
  ├─ Detect inconsistencies
  └─ Generate IntegrityFinding[] (0 or more findings)

Step 5: Calculate Coverage
  ├─ How many artifacts were checked?
  ├─ How many were skipped?
  └─ Completeness score (0-1)

Output: ComparatorResult
  ├─ invariantId: string
  ├─ evaluated: boolean
  ├─ findings: IntegrityFinding[]
  └─ coverage: { artifactsChecked, artifactsSkipped, completeness }
```

### **1.3 Implementation Details**

**File**: `apps/api/src/services/contracts/comparators/base.ts`

**Key Methods**:

1. **`validateInput()`**: Check input is well-formed
   - Invariant is enabled
   - Snapshots are not null
   - Context has required fields

2. **`canCompare()`**: Check if this comparator can handle this invariant
   - Match comparatorType
   - Match artifact types
   - Check invariant config

3. **`extractData()`**: Extract structured data from snapshot
   - Parse snapshot.extract (JSON)
   - Validate schema version
   - Return typed data

4. **`performComparison()`**: Core comparison logic (abstract)
   - Implemented by subclasses
   - Returns IntegrityFinding[]

5. **`calculateCoverage()`**: Calculate coverage metrics
   - Count artifacts checked
   - Count artifacts skipped
   - Calculate completeness (0-1)

6. **`createFinding()`**: Helper to create IntegrityFinding
   - Generate UUID
   - Set timestamps
   - Calculate confidence/impact
   - Determine band (pass/warn/fail)

**Dependencies**:
- `apps/api/src/services/contracts/types.ts` (ComparatorInput, ComparatorResult, IntegrityFinding)
- `apps/api/prisma/schema.prisma` (IntegrityFinding model)

**Testing**:
- Unit tests for BaseComparator methods
- Mock subclass for testing template method pattern
- Test all edge cases (null snapshots, disabled invariants, etc.)

---

## Step 2: OpenAPI Comparator

**Duration**: 2 days  
**Files**: `apps/api/src/services/contracts/comparators/openapi.ts`

### **2.1 Target Architecture**

```typescript
export class OpenApiComparator extends BaseComparator {
  readonly comparatorType = 'openapi_docs_endpoint_parity';
  readonly supportedArtifactTypes = ['openapi', 'confluence_page', 'notion_page', 'github_readme'];
  
  canCompare(invariant: Invariant, snapshots: ArtifactSnapshot[]): boolean {
    // Check if invariant is for OpenAPI comparison
    if (invariant.comparatorType !== this.comparatorType) {
      return false;
    }
    
    // Check if we have one OpenAPI snapshot and one doc snapshot
    const hasOpenApi = snapshots.some(s => s.artifactType === 'openapi');
    const hasDoc = snapshots.some(s => ['confluence_page', 'notion_page', 'github_readme'].includes(s.artifactType));
    
    return hasOpenApi && hasDoc;
  }
  
  extractData(snapshot: ArtifactSnapshot): OpenApiData | DocData {
    if (snapshot.artifactType === 'openapi') {
      return this.extractOpenApiData(snapshot);
    } else {
      return this.extractDocData(snapshot);
    }
  }
  
  async performComparison(
    left: OpenApiData,
    right: DocData,
    input: ComparatorInput
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];
    
    // 1. Check endpoint parity
    const endpointFindings = this.compareEndpoints(left.endpoints, right.endpoints, input);
    findings.push(...endpointFindings);
    
    // 2. Check schema parity
    const schemaFindings = this.compareSchemas(left.schemas, right.schemas, input);
    findings.push(...schemaFindings);
    
    // 3. Check example parity
    const exampleFindings = this.compareExamples(left.examples, right.examples, input);
    findings.push(...exampleFindings);
    
    return findings;
  }
}
```

### **2.2 Logic Flow**

```
Input:
  ├─ leftSnapshot: OpenAPI spec (extract: { endpoints, schemas, examples })
  └─ rightSnapshot: Confluence doc (extract: { endpoints, examples, codeBlocks })

Step 1: Extract OpenAPI Data
  ├─ Parse leftSnapshot.extract
  ├─ Extract endpoints: [{ method, path, summary, parameters, responses }]
  ├─ Extract schemas: [{ name, properties, required }]
  └─ Extract examples: [{ endpoint, example }]

Step 2: Extract Doc Data
  ├─ Parse rightSnapshot.extract
  ├─ Extract documented endpoints: [{ method, path, description }]
  ├─ Extract code examples: [{ language, code }]
  └─ Extract API references: [{ endpoint, description }]

Step 3: Compare Endpoints
  ├─ For each OpenAPI endpoint:
  │   ├─ Is it documented in the doc?
  │   ├─ Does the description match?
  │   └─ Are parameters documented?
  ├─ For each documented endpoint:
  │   ├─ Does it exist in OpenAPI?
  │   └─ Is it deprecated?
  └─ Generate findings for mismatches

Step 4: Compare Schemas
  ├─ For each OpenAPI schema:
  │   ├─ Is it documented?
  │   └─ Are properties documented?
  └─ Generate findings for missing schemas

Step 5: Compare Examples
  ├─ For each OpenAPI example:
  │   ├─ Is there a matching code example in doc?
  │   └─ Does the example match the schema?
  └─ Generate findings for outdated examples

Output: IntegrityFinding[]
  ├─ Finding 1: "Endpoint POST /api/users not documented"
  ├─ Finding 2: "Documented endpoint GET /api/old-users no longer exists in OpenAPI"
  └─ Finding 3: "Example for GET /api/users uses old schema"
```

### **2.3 Implementation Details**

**Comparison Types**:

1. **Endpoint Parity**:
   - Missing endpoints (in OpenAPI but not in docs)
   - Deprecated endpoints (in docs but not in OpenAPI)
   - Parameter mismatches
   - Response schema mismatches

2. **Schema Parity**:
   - Missing schemas
   - Property mismatches
   - Required field mismatches

3. **Example Parity**:
   - Outdated examples
   - Missing examples
   - Invalid examples (don't match schema)

**Evidence Structure**:
```typescript
{
  kind: 'endpoint_missing',
  leftValue: { method: 'POST', path: '/api/users', summary: 'Create user' },
  rightValue: null,
  pointers: {
    left: '/paths/~1api~1users/post',
    right: null
  }
}
```

**Severity Calculation**:
- **Critical**: Breaking changes (removed endpoints, changed required fields)
- **High**: Missing documentation for new endpoints
- **Medium**: Outdated examples, missing optional parameters
- **Low**: Description mismatches, formatting issues

**Confidence Calculation**:
- Exact match: 1.0
- Fuzzy match (similar path): 0.8
- Inferred (from examples): 0.6

---

## Step 3: Terraform ↔ Runbook Comparator

**Duration**: 2 days  
**Files**: `apps/api/src/services/contracts/comparators/terraform.ts`

### **3.1 Target Architecture**

```typescript
export class TerraformRunbookComparator extends BaseComparator {
  readonly comparatorType = 'terraform_runbook_parity';
  readonly supportedArtifactTypes = ['terraform', 'confluence_page', 'notion_page', 'github_readme'];
  
  canCompare(invariant: Invariant, snapshots: ArtifactSnapshot[]): boolean {
    const hasTerraform = snapshots.some(s => s.artifactType === 'terraform');
    const hasRunbook = snapshots.some(s => ['confluence_page', 'notion_page', 'github_readme'].includes(s.artifactType));
    
    return hasTerraform && hasRunbook && invariant.comparatorType === this.comparatorType;
  }
  
  extractData(snapshot: ArtifactSnapshot): TerraformData | RunbookData {
    if (snapshot.artifactType === 'terraform') {
      return this.extractTerraformData(snapshot);
    } else {
      return this.extractRunbookData(snapshot);
    }
  }
  
  async performComparison(
    left: TerraformData,
    right: RunbookData,
    input: ComparatorInput
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];
    
    // 1. Check resource parity
    const resourceFindings = this.compareResources(left.resources, right.resources, input);
    findings.push(...resourceFindings);
    
    // 2. Check variable parity
    const variableFindings = this.compareVariables(left.variables, right.variables, input);
    findings.push(...variableFindings);
    
    // 3. Check deployment steps
    const deploymentFindings = this.compareDeploymentSteps(left.outputs, right.deploymentSteps, input);
    findings.push(...deploymentFindings);
    
    return findings;
  }
}
```

### **3.2 Logic Flow**

```
Input:
  ├─ leftSnapshot: Terraform config (extract: { resources, variables, outputs })
  └─ rightSnapshot: Runbook (extract: { resources, deploymentSteps, variables })

Step 1: Extract Terraform Data
  ├─ Parse leftSnapshot.extract
  ├─ Extract resources: [{ type, name, config }]
  ├─ Extract variables: [{ name, type, default, description }]
  └─ Extract outputs: [{ name, value, description }]

Step 2: Extract Runbook Data
  ├─ Parse rightSnapshot.extract
  ├─ Extract documented resources: [{ type, name, description }]
  ├─ Extract deployment steps: [{ step, command, description }]
  └─ Extract documented variables: [{ name, description }]

Step 3: Compare Resources
  ├─ For each Terraform resource:
  │   ├─ Is it documented in runbook?
  │   ├─ Does the description match?
  │   └─ Are critical config values documented?
  ├─ For each documented resource:
  │   ├─ Does it exist in Terraform?
  │   └─ Is it deprecated?
  └─ Generate findings for mismatches

Step 4: Compare Variables
  ├─ For each Terraform variable:
  │   ├─ Is it documented?
  │   └─ Does the description match?
  └─ Generate findings for undocumented variables

Step 5: Compare Deployment Steps
  ├─ For each Terraform output:
  │   ├─ Is it referenced in deployment steps?
  │   └─ Are the values correct?
  └─ Generate findings for missing/outdated steps

Output: IntegrityFinding[]
  ├─ Finding 1: "Resource aws_instance.web not documented in runbook"
  ├─ Finding 2: "Documented resource aws_rds_instance.db no longer exists in Terraform"
  └─ Finding 3: "Deployment step references old variable DATABASE_URL"
```

### **3.3 Implementation Details**

**Comparison Types**:

1. **Resource Parity**:
   - Missing resources (in Terraform but not in runbook)
   - Deprecated resources (in runbook but not in Terraform)
   - Configuration mismatches

2. **Variable Parity**:
   - Undocumented variables
   - Outdated variable descriptions
   - Missing default values

3. **Deployment Step Parity**:
   - Outdated commands
   - Missing steps
   - Incorrect variable references

**Evidence Structure**:
```typescript
{
  kind: 'resource_missing',
  leftValue: { type: 'aws_instance', name: 'web', config: { instance_type: 't2.micro' } },
  rightValue: null,
  pointers: {
    left: 'resource.aws_instance.web',
    right: null
  }
}
```

**Severity Calculation**:
- **Critical**: Missing critical resources (databases, load balancers)
- **High**: Missing deployment steps, incorrect variable references
- **Medium**: Outdated descriptions, missing optional variables
- **Low**: Formatting issues, minor description mismatches

---

## Step 4: IntegrityFinding Generation

**Duration**: 2 days  
**Files**: `apps/api/src/services/contracts/findingGenerator.ts`

### **4.1 Target Architecture**

```typescript
export class FindingGenerator {
  /**
   * Create an IntegrityFinding from comparison evidence
   */
  createFinding(params: CreateFindingParams): IntegrityFinding {
    const {
      workspaceId,
      contractId,
      invariantId,
      driftType,
      severity,
      compared,
      evidence,
      context,
    } = params;
    
    // 1. Calculate confidence
    const confidence = this.calculateConfidence(evidence);
    
    // 2. Calculate impact
    const impact = this.calculateImpact(severity, evidence);
    
    // 3. Determine band
    const band = this.determineBand(confidence, impact, severity);
    
    // 4. Determine recommended action
    const recommendedAction = this.determineRecommendedAction(band, severity);
    
    // 5. Route to owners
    const ownerRouting = this.routeToOwners(context);
    
    // 6. Create finding
    return {
      workspaceId,
      id: generateUUID(),
      contractId,
      invariantId,
      driftType,
      domains: this.extractDomains(evidence),
      severity,
      compared,
      evidence,
      confidence,
      impact,
      band,
      recommendedAction,
      ownerRouting,
      createdAt: new Date(),
    };
  }
  
  /**
   * Calculate confidence based on evidence quality
   */
  private calculateConfidence(evidence: EvidenceItem[]): number {
    // Exact matches: 1.0
    // Fuzzy matches: 0.8
    // Inferred: 0.6
    // Heuristic: 0.4
  }
  
  /**
   * Calculate impact based on severity and evidence
   */
  private calculateImpact(severity: Severity, evidence: EvidenceItem[]): number {
    // Critical severity + breaking change: 1.0
    // High severity + multiple findings: 0.8
    // Medium severity: 0.5
    // Low severity: 0.2
  }
  
  /**
   * Determine band (pass/warn/fail)
   */
  private determineBand(confidence: number, impact: number, severity: Severity): Band {
    // fail: confidence >= 0.8 && (severity === 'critical' || impact >= 0.8)
    // warn: confidence >= 0.6 && (severity === 'high' || impact >= 0.5)
    // pass: otherwise
  }
  
  /**
   * Determine recommended action
   */
  private determineRecommendedAction(band: Band, severity: Severity): RecommendedAction {
    // block_merge: band === 'fail' && severity === 'critical'
    // create_patch_candidate: band === 'fail' || band === 'warn'
    // notify: band === 'warn' && severity === 'low'
    // no_action: band === 'pass'
  }
}
```

### **4.2 Logic Flow**

```
Input: CreateFindingParams
  ├─ workspaceId, contractId, invariantId
  ├─ driftType: 'instruction' | 'process' | 'ownership' | 'coverage' | 'environment_tooling'
  ├─ severity: 'low' | 'medium' | 'high' | 'critical'
  ├─ compared: { left: {...}, right: {...} }
  ├─ evidence: [{ kind, leftValue, rightValue, pointers }]
  └─ context: { service, repo, signalEventId }

Step 1: Calculate Confidence
  ├─ Count exact matches (confidence += 0.2 per match)
  ├─ Count fuzzy matches (confidence += 0.1 per match)
  ├─ Count inferred matches (confidence += 0.05 per match)
  └─ Clamp to [0, 1]

Step 2: Calculate Impact
  ├─ Base impact from severity:
  │   ├─ critical: 1.0
  │   ├─ high: 0.8
  │   ├─ medium: 0.5
  │   └─ low: 0.2
  ├─ Adjust for evidence count (more evidence = higher impact)
  └─ Adjust for breaking changes (breaking = +0.2)

Step 3: Determine Band
  ├─ fail: confidence >= 0.8 && (severity === 'critical' || impact >= 0.8)
  ├─ warn: confidence >= 0.6 && (severity === 'high' || impact >= 0.5)
  └─ pass: otherwise

Step 4: Determine Recommended Action
  ├─ block_merge: band === 'fail' && severity === 'critical'
  ├─ create_patch_candidate: band === 'fail' || (band === 'warn' && severity === 'high')
  ├─ notify: band === 'warn' && severity !== 'high'
  └─ no_action: band === 'pass'

Step 5: Route to Owners
  ├─ Use context.service to find owner
  ├─ Use context.repo to find CODEOWNERS
  └─ Fallback to contract routing config

Output: IntegrityFinding
  ├─ id, workspaceId, contractId, invariantId
  ├─ driftType, domains, severity
  ├─ compared, evidence
  ├─ confidence, impact, band
  ├─ recommendedAction, ownerRouting
  └─ createdAt
```

### **4.3 Implementation Details**

**Confidence Calculation**:
```typescript
private calculateConfidence(evidence: EvidenceItem[]): number {
  let confidence = 0;
  
  for (const item of evidence) {
    if (item.kind.includes('exact')) {
      confidence += 0.2;
    } else if (item.kind.includes('fuzzy')) {
      confidence += 0.1;
    } else if (item.kind.includes('inferred')) {
      confidence += 0.05;
    }
  }
  
  return Math.min(1.0, confidence);
}
```

**Impact Calculation**:
```typescript
private calculateImpact(severity: Severity, evidence: EvidenceItem[]): number {
  const baseImpact = {
    critical: 1.0,
    high: 0.8,
    medium: 0.5,
    low: 0.2,
  }[severity];
  
  // Adjust for evidence count
  const evidenceBoost = Math.min(0.2, evidence.length * 0.05);
  
  // Adjust for breaking changes
  const hasBreakingChange = evidence.some(e => e.kind.includes('breaking'));
  const breakingBoost = hasBreakingChange ? 0.2 : 0;
  
  return Math.min(1.0, baseImpact + evidenceBoost + breakingBoost);
}
```

**Band Determination**:
```typescript
private determineBand(confidence: number, impact: number, severity: Severity): Band {
  if (confidence >= 0.8 && (severity === 'critical' || impact >= 0.8)) {
    return 'fail';
  }
  
  if (confidence >= 0.6 && (severity === 'high' || impact >= 0.5)) {
    return 'warn';
  }
  
  return 'pass';
}
```

---

## Step 5: Comparison Telemetry

**Duration**: 1 day  
**Files**: `apps/api/src/services/contracts/comparisonTelemetry.ts`

### **5.1 Target Architecture**

```typescript
export interface ComparisonMetrics {
  workspaceId: string;
  contractId: string;
  signalEventId: string;
  
  // Timing
  comparisonTimeMs: number;
  comparatorsRun: number;
  
  // Results
  findingsGenerated: number;
  findingsBySeverity: Record<Severity, number>;
  findingsByBand: Record<Band, number>;
  
  // Coverage
  invariantsEvaluated: number;
  invariantsSkipped: number;
  skipReasons: Record<string, number>;
  
  // Performance
  avgConfidence: number;
  avgImpact: number;
  
  // Breakdown
  metricsByComparator: Record<string, ComparatorMetrics>;
}

export function calculateComparisonMetrics(
  workspaceId: string,
  contractId: string,
  signalEventId: string,
  results: ComparatorResult[],
  comparisonTimeMs: number
): ComparisonMetrics {
  // Calculate metrics from results
}

export function logComparisonMetrics(metrics: ComparisonMetrics): void {
  // Log structured JSON
  console.log('[ComparisonTelemetry] Metrics:', JSON.stringify(metrics, null, 2));
}

export function logSummaryStats(metrics: ComparisonMetrics): void {
  // Log human-readable summary
  console.log('[ComparisonTelemetry] Summary:');
  console.log(`  Comparators run: ${metrics.comparatorsRun}`);
  console.log(`  Findings generated: ${metrics.findingsGenerated}`);
  console.log(`  Avg confidence: ${(metrics.avgConfidence * 100).toFixed(1)}%`);
  console.log(`  Comparison time: ${metrics.comparisonTimeMs}ms`);
}
```

### **5.2 Logic Flow**

```
Input:
  ├─ workspaceId, contractId, signalEventId
  ├─ results: ComparatorResult[]
  └─ comparisonTimeMs: number

Step 1: Aggregate Findings
  ├─ Count total findings
  ├─ Group by severity (low, medium, high, critical)
  ├─ Group by band (pass, warn, fail)
  └─ Calculate avg confidence and impact

Step 2: Aggregate Coverage
  ├─ Count invariants evaluated
  ├─ Count invariants skipped
  └─ Group skip reasons

Step 3: Aggregate Performance
  ├─ Calculate avg comparison time per comparator
  ├─ Identify slowest comparator
  └─ Calculate throughput (findings/second)

Step 4: Create Metrics Object
  └─ Combine all aggregated data

Step 5: Log Metrics
  ├─ Structured JSON (for monitoring)
  └─ Human-readable summary (for debugging)

Output: ComparisonMetrics
```

### **5.3 Implementation Details**

**Metrics Tracked**:
- Total findings generated
- Findings by severity (low, medium, high, critical)
- Findings by band (pass, warn, fail)
- Invariants evaluated vs skipped
- Skip reasons (not_applicable, artifacts_missing, low_confidence, disabled)
- Avg confidence and impact
- Comparison time (total and per comparator)

**Logging Format**:
```json
{
  "workspaceId": "workspace-123",
  "contractId": "api-docs-contract",
  "signalEventId": "signal-456",
  "comparisonTimeMs": 1234,
  "comparatorsRun": 2,
  "findingsGenerated": 5,
  "findingsBySeverity": {
    "critical": 1,
    "high": 2,
    "medium": 1,
    "low": 1
  },
  "findingsByBand": {
    "fail": 1,
    "warn": 2,
    "pass": 2
  },
  "invariantsEvaluated": 3,
  "invariantsSkipped": 1,
  "skipReasons": {
    "not_applicable": 1
  },
  "avgConfidence": 0.85,
  "avgImpact": 0.72,
  "metricsByComparator": {
    "openapi_docs_endpoint_parity": {
      "comparisonTimeMs": 456,
      "findingsGenerated": 3
    },
    "terraform_runbook_parity": {
      "comparisonTimeMs": 778,
      "findingsGenerated": 2
    }
  }
}
```

---

## Integration Points

### **Where Comparators Are Called**

**Option 1: Webhook Handler** (Recommended)
```typescript
// apps/api/src/routes/webhooks.ts (after artifact fetching)

// PHASE 1 WEEK 5-6: Comparison & IntegrityFinding Generation
if (snapshots.length > 0) {
  try {
    const { ComparisonOrchestrator } = await import('../services/contracts/comparisonOrchestrator.js');
    const orchestrator = new ComparisonOrchestrator(workspaceId);
    
    const comparisonResult = await orchestrator.runComparisons({
      contractId: contract.contractId,
      invariants: contract.invariants,
      snapshots,
      context: {
        workspaceId,
        contractId: contract.contractId,
        signalEventId: signalEvent.id,
        service: prInfo?.service,
        repo: prInfo?.repo,
      },
    });
    
    console.log(`[Webhook] [V2] Generated ${comparisonResult.findings.length} integrity findings`);
    
    // Optionally: Create DriftCandidates for high-severity findings
    if (comparisonResult.findings.some(f => f.band === 'fail')) {
      // Create DriftCandidate for remediation
    }
  } catch (comparisonError) {
    console.error('[Webhook] [V2] Comparison failed (non-blocking):', comparisonError);
  }
}
```

**Option 2: Scheduled Job** (For periodic checks)
```typescript
// apps/api/src/routes/jobs.ts

router.post('/contract-validation', async (req, res) => {
  // Run comparisons for all contracts
  // Generate IntegrityFindings
  // Create GitHub Checks
});
```

### **Database Persistence**

```typescript
// After comparison, persist findings to database
await prisma.integrityFinding.createMany({
  data: findings.map(f => ({
    workspaceId: f.workspaceId,
    id: f.id,
    contractId: f.contractId,
    invariantId: f.invariantId,
    driftType: f.driftType,
    domains: f.domains,
    severity: f.severity,
    compared: f.compared as any,
    evidence: f.evidence as any,
    confidence: f.confidence,
    impact: f.impact,
    band: f.band,
    recommendedAction: f.recommendedAction,
    ownerRouting: f.ownerRouting as any,
    createdAt: f.createdAt,
  })),
});
```

---

## Testing Strategy

### **Unit Tests**

1. **BaseComparator Tests** (`comparators/base.test.ts`):
   - Test template method pattern
   - Test input validation
   - Test coverage calculation
   - Test finding creation

2. **OpenApiComparator Tests** (`comparators/openapi.test.ts`):
   - Test endpoint parity detection
   - Test schema parity detection
   - Test example parity detection
   - Test severity calculation

3. **TerraformRunbookComparator Tests** (`comparators/terraform.test.ts`):
   - Test resource parity detection
   - Test variable parity detection
   - Test deployment step parity detection

4. **FindingGenerator Tests** (`findingGenerator.test.ts`):
   - Test confidence calculation
   - Test impact calculation
   - Test band determination
   - Test recommended action determination

5. **ComparisonTelemetry Tests** (`comparisonTelemetry.test.ts`):
   - Test metrics calculation
   - Test logging format

### **Integration Tests**

1. **End-to-End Comparison Test** (`scripts/test-comparison-e2e.ts`):
   - Create contract pack with invariants
   - Fetch artifact snapshots
   - Run comparisons
   - Verify findings are generated
   - Verify findings are persisted

2. **Webhook Integration Test**:
   - Simulate PR webhook
   - Verify contract resolution
   - Verify artifact fetching
   - Verify comparison runs
   - Verify findings are created

### **Test Data**

Create realistic test fixtures:
- OpenAPI specs (with endpoints, schemas, examples)
- Confluence pages (with API documentation)
- Terraform configs (with resources, variables, outputs)
- Runbooks (with deployment steps, resource descriptions)

---

## Success Criteria

### **Functional Requirements**

- ✅ All 5 steps implemented and tested
- ✅ Comparators are deterministic (same input → same output)
- ✅ Comparators run in < 5 seconds
- ✅ IntegrityFindings are persisted to database
- ✅ Telemetry is comprehensive and actionable

### **Quality Requirements**

- ✅ 100% type safety (no `any` types)
- ✅ 90%+ test coverage
- ✅ All tests pass
- ✅ No TypeScript errors
- ✅ No ESLint warnings

### **Performance Requirements**

- ✅ Comparison time < 5 seconds (for 2 snapshots)
- ✅ Memory usage < 100MB
- ✅ No memory leaks

### **Integration Requirements**

- ✅ Comparators are called from webhook handler
- ✅ Findings are persisted to database
- ✅ Telemetry is logged
- ✅ Non-blocking (failures don't block drift detection)

---

**End of Detailed Plan**

