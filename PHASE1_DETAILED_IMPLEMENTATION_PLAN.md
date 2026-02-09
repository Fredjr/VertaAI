# Phase 1: Critical Determinism Fixes - Detailed Implementation Plan

## Executive Summary

Phase 1 fixes the 3 highest-priority gaps to enable **deterministic drift detection across all 30 combinations** (6 sources × 5 drift types). This plan uses a **matrix-based approach** to ensure no combination is missed.

## Current State: Only 1/30 Combinations Work

### Drift Type × Source Type Matrix (Current)

| Drift Type | GitHub PR | PagerDuty | Slack | Datadog | Grafana | IaC | CODEOWNERS |
|------------|-----------|-----------|-------|---------|---------|-----|------------|
| **Instruction** | ✅ WORKS | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Process** | ⚠️ LLM | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Ownership** | ⚠️ LLM | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Coverage** | ⚠️ BROKEN | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Environment** | ⚠️ LLM | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |

**Status**: 1/35 combinations (2.9%) work deterministically

### What EXISTS Today ✅

**Source Evidence Builders** (apps/api/src/services/evidence/sourceBuilders.ts):
- ✅ `buildGitHubPRArtifacts()` - PR diff, files changed, line counts
- ✅ `buildPagerDutyArtifacts()` - Incident timeline, severity, responders
- ✅ `buildSlackArtifacts()` - Message excerpts, themes, user count
- ✅ `buildAlertArtifacts()` - Alert type, severity, affected services (Datadog/Grafana)
- ✅ `buildIaCArtiacts()` - Resource changes, change types
- ✅ `buildCodeownersArtifacts()` - Path changes, owner additions/removals

**Drift Comparison Logic** (apps/api/src/services/orchestrator/transitions.ts):
- ✅ `handleBaselineChecked()` - Instruction drift comparison for GitHub PR only (lines 1335-1600)
- ✅ Artifact extraction: commands, config keys, endpoints (lines 900-1050)
- ✅ Conflict detection + new content detection (lines 1000-1040)

**Baseline Patterns** (apps/api/src/services/baseline/patterns.ts):
- ✅ `checkInstructionBaseline()` - Instruction drift patterns
- ✅ `checkProcessBaseline()` - Process drift patterns
- ✅ `checkOwnershipBaseline()` - Ownership drift patterns
- ✅ `checkCoverageBaseline()` - Coverage drift patterns
- ✅ `checkEnvironmentBaseline()` - Environment drift patterns

### What's MISSING ❌

**Comparison Logic for Non-GitHub Sources**:
- ❌ No comparison logic for PagerDuty incidents
- ❌ No comparison logic for Slack clusters
- ❌ No comparison logic for Datadog/Grafana alerts
- ❌ No comparison logic for IaC changes
- ❌ No comparison logic for CODEOWNERS changes

**Artifact Extraction for Non-GitHub Sources**:
- ❌ No artifact extraction from PagerDuty incidents (commands, tools, config)
- ❌ No artifact extraction from Slack messages (tools, errors, patterns)
- ❌ No artifact extraction from Datadog/Grafana alerts (metrics, thresholds, services)
- ❌ No artifact extraction from IaC changes (resources, configs, endpoints)
- ❌ No artifact extraction from CODEOWNERS (teams, paths, ownership patterns)

**Coverage Gap Detection**:
- ⚠️ Coverage is a separate drift type, not orthogonal
- ❌ No coverage gap detection for process/ownership/environment drifts

## Target State: 35/35 Combinations Work

### Drift Type × Source Type Matrix (Target)

| Drift Type | GitHub PR | PagerDuty | Slack | Datadog | Grafana | IaC | CODEOWNERS |
|------------|-----------|-----------|-------|---------|---------|-----|------------|
| **Instruction** | ✅ WORKS | ✅ NEW | ✅ NEW | ✅ NEW | ✅ NEW | ✅ NEW | ✅ NEW |
| **Process** | ✅ NEW | ✅ NEW | ✅ NEW | ✅ NEW | ✅ NEW | ✅ NEW | ✅ NEW |
| **Ownership** | ✅ NEW | ✅ NEW | ✅ NEW | ✅ NEW | ✅ NEW | ✅ NEW | ✅ NEW |
| **Coverage** | ✅ NEW | ✅ NEW | ✅ NEW | ✅ NEW | ✅ NEW | ✅ NEW | ✅ NEW |
| **Environment** | ✅ NEW | ✅ NEW | ✅ NEW | ✅ NEW | ✅ NEW | ✅ NEW | ✅ NEW |

**Status**: 35/35 combinations (100%) work deterministically

## Implementation Strategy

### Approach: Matrix-Based Development

Instead of implementing source-by-source or drift-type-by-drift-type, we'll use a **matrix-based approach**:

1. **Define artifact types** for each source type
2. **Define comparison logic** for each drift type
3. **Implement comparison functions** that work across all sources
4. **Test systematically** using a 7×5 test matrix

This ensures:
- ✅ No combinations are missed
- ✅ Consistent quality across all combinations
- ✅ Reusable comparison logic
- ✅ Systematic testing

---

## Day 1-2: Gap 1 - Invert LLM Classification and Comparison Order

### Current Flow (WRONG)
```
ELIGIBILITY_CHECKED 
  → DRIFT_CLASSIFIED (LLM classifies drift type)
  → BASELINE_CHECKED (comparison validates)
```

**Problem**: If LLM misclassifies, comparison won't work correctly.

### Correct Flow
```
ELIGIBILITY_CHECKED 
  → BASELINE_CHECKED (comparison detects drift type deterministically)
  → DRIFT_CLASSIFIED (LLM fallback only if ambiguous)
```

### Implementation Tasks

#### Task 1.1: Define Artifact Types for All Sources (2 hours)

Create `apps/api/src/services/baseline/types.ts`:

```typescript
// Artifact types that can be extracted from any source
export interface BaselineArtifacts {
  // Instruction drift artifacts
  commands?: string[];           // CLI commands, scripts
  configKeys?: string[];         // Config keys, env vars
  endpoints?: string[];          // API endpoints, URLs
  tools?: string[];              // Tool names, versions
  
  // Process drift artifacts
  steps?: string[];              // Process steps, procedures
  decisions?: string[];          // Decision points, gates
  sequences?: string[];          // Ordered sequences
  
  // Ownership drift artifacts
  teams?: string[];              // Team names, groups
  owners?: string[];             // Owner names, emails
  paths?: string[];              // File paths, directories
  channels?: string[];           // Slack channels, contact points
  
  // Environment drift artifacts
  platforms?: string[];          // Platforms, OSes
  versions?: string[];           // Version numbers
  dependencies?: string[];       // Dependencies, libraries
  
  // Coverage drift artifacts
  scenarios?: string[];          // New scenarios, use cases
  features?: string[];           // New features, capabilities
  errors?: string[];             // Error codes, failure modes
}
```

#### Task 1.2: Implement Artifact Extraction for All Sources (6 hours)

Create `apps/api/src/services/baseline/artifactExtractor.ts`:

```typescript
/**
 * Extract baseline artifacts from any source type
 * This is the universal artifact extractor that works across all sources
 */
export function extractArtifacts(args: {
  sourceType: string;
  sourceEvidence: SourceEvidence;
  driftType?: string; // Optional hint for focused extraction
}): BaselineArtifacts {
  const { sourceType, sourceEvidence } = args;
  
  switch (sourceType) {
    case 'github_pr':
      return extractGitHubPRArtifacts(sourceEvidence);
    case 'pagerduty_incident':
      return extractPagerDutyArtifacts(sourceEvidence);
    case 'slack_cluster':
      return extractSlackArtifacts(sourceEvidence);
    case 'datadog_alert':
    case 'grafana_alert':
      return extractAlertArtifacts(sourceEvidence);
    case 'github_iac':
      return extractIaCArtifacts(sourceEvidence);
    case 'github_codeowners':
      return extractCodeownersArtifacts(sourceEvidence);
    default:
      return {};
  }
}
```

**Deliverables**:
- [ ] `apps/api/src/services/baseline/types.ts` - Artifact type definitions
- [ ] `apps/api/src/services/baseline/artifactExtractor.ts` - Universal artifact extractor
- [ ] 6 source-specific extraction functions
- [ ] Unit tests for each extractor (90%+ coverage)

**Source-Specific Extraction Specifications**:

**1. GitHub PR** (already exists, enhance):
```typescript
function extractGitHubPRArtifacts(evidence: SourceEvidence): BaselineArtifacts {
  const prDiff = evidence.artifacts?.prDiff;
  const diffText = prDiff?.excerpt || '';

  return {
    // Instruction artifacts
    commands: extractCommands(diffText),
    configKeys: extractConfigKeys(diffText),
    endpoints: extractEndpoints(diffText),
    tools: extractTools(diffText),

    // Process artifacts
    steps: extractSteps(diffText),
    decisions: extractDecisions(diffText),

    // Ownership artifacts
    teams: extractTeams(diffText),
    owners: extractOwners(diffText),
    paths: prDiff?.filesChanged || [],

    // Environment artifacts
    platforms: extractPlatforms(diffText),
    versions: extractVersions(diffText),
    dependencies: extractDependencies(diffText),

    // Coverage artifacts
    scenarios: extractScenarios(diffText),
    features: extractFeatures(diffText),
    errors: extractErrors(diffText),
  };
}
```

**2. PagerDuty Incident**:
```typescript
function extractPagerDutyArtifacts(evidence: SourceEvidence): BaselineArtifacts {
  const incident = evidence.artifacts?.incidentTimeline;
  const timeline = incident?.excerpt || '';
  const responders = incident?.responders || [];

  return {
    // Instruction artifacts (from resolution steps)
    commands: extractCommandsFromTimeline(timeline),
    tools: extractToolsFromTimeline(timeline),
    configKeys: extractConfigFromTimeline(timeline),
    endpoints: extractEndpointsFromTimeline(timeline),

    // Process artifacts (from incident flow)
    steps: extractIncidentSteps(timeline),
    decisions: extractEscalationDecisions(timeline),

    // Ownership artifacts
    teams: responders.map(r => r.team).filter(Boolean),
    owners: responders.map(r => r.name).filter(Boolean),
    channels: extractChannelsFromTimeline(timeline),

    // Environment artifacts
    platforms: extractPlatformsFromIncident(timeline),
    versions: extractVersionsFromIncident(timeline),

    // Coverage artifacts (new failure modes)
    scenarios: extractNewScenarios(timeline),
    errors: extractErrorCodes(timeline),
  };
}
```

**3. Slack Cluster**:
```typescript
function extractSlackArtifacts(evidence: SourceEvidence): BaselineArtifacts {
  const cluster = evidence.artifacts?.slackCluster;
  const messages = cluster?.excerpt || '';
  const themes = cluster?.themes || [];

  return {
    // Instruction artifacts (from messages)
    commands: extractCommandsFromMessages(messages),
    tools: extractToolMentions(messages),
    endpoints: extractURLsFromMessages(messages),

    // Process artifacts (from conversation flow)
    steps: extractStepsFromConversation(messages),

    // Ownership artifacts
    channels: [cluster?.channelId].filter(Boolean),
    teams: extractTeamsFromMessages(messages),

    // Coverage artifacts (new questions/issues)
    scenarios: themes,
    errors: extractErrorsFromMessages(messages),
  };
}
```

**4. Datadog/Grafana Alert**:
```typescript
function extractAlertArtifacts(evidence: SourceEvidence): BaselineArtifacts {
  const alert = evidence.artifacts?.alertData;
  const alertText = alert?.excerpt || '';
  const severity = alert?.severity;
  const services = alert?.affectedServices || [];

  return {
    // Instruction artifacts (from alert config)
    endpoints: extractEndpointsFromAlert(alertText),
    tools: extractMonitoringTools(alertText),
    configKeys: extractMetricNames(alertText),

    // Process artifacts (from alert rules)
    steps: extractAlertSteps(alertText),
    decisions: extractThresholds(alertText),

    // Ownership artifacts
    teams: services.map(s => s.team).filter(Boolean),

    // Environment artifacts
    platforms: services.map(s => s.platform).filter(Boolean),
    versions: extractVersionsFromAlert(alertText),

    // Coverage artifacts
    scenarios: extractAlertScenarios(alertText),
  };
}
```

**5. IaC Changes**:
```typescript
function extractIaCArtifacts(evidence: SourceEvidence): BaselineArtifacts {
  const iac = evidence.artifacts?.iacChanges;
  const changes = iac?.excerpt || '';
  const resources = iac?.resourcesChanged || [];

  return {
    // Instruction artifacts (from resource configs)
    endpoints: extractEndpointsFromIaC(changes),
    configKeys: extractIaCConfigKeys(changes),
    tools: extractIaCTools(changes),

    // Process artifacts
    steps: extractDeploymentSteps(changes),

    // Ownership artifacts
    paths: resources,

    // Environment artifacts
    platforms: extractPlatformsFromIaC(changes),
    versions: extractVersionsFromIaC(changes),
    dependencies: extractDependenciesFromIaC(changes),

    // Coverage artifacts
    scenarios: extractNewInfraScenarios(changes),
  };
}
```

**6. CODEOWNERS Changes**:
```typescript
function extractCodeownersArtifacts(evidence: SourceEvidence): BaselineArtifacts {
  const codeowners = evidence.artifacts?.codeownersDiff;
  const changes = codeowners?.excerpt || '';
  const pathsAdded = codeowners?.pathsAdded || [];
  const ownersAdded = codeowners?.ownersAdded || [];

  return {
    // Ownership artifacts (primary focus)
    paths: pathsAdded,
    owners: ownersAdded,
    teams: extractTeamsFromOwners(ownersAdded),

    // Coverage artifacts (new ownership areas)
    scenarios: pathsAdded.map(p => `New ownership for ${p}`),
  };
}
```

#### Task 1.3: Implement Deterministic Drift Type Detection (4 hours)

Create `apps/api/src/services/baseline/comparison.ts`:

```typescript
/**
 * Compare source artifacts against doc artifacts to detect drift
 * This is deterministic - same input always produces same output
 */
export function compareArtifacts(args: {
  sourceArtifacts: BaselineArtifacts;
  docArtifacts: BaselineArtifacts;
  sourceType: string;
}): ComparisonResult {
  const { sourceArtifacts, docArtifacts } = args;

  // Detect all drift types simultaneously
  const instructionDrift = detectInstructionDrift(sourceArtifacts, docArtifacts);
  const processDrift = detectProcessDrift(sourceArtifacts, docArtifacts);
  const ownershipDrift = detectOwnershipDrift(sourceArtifacts, docArtifacts);
  const environmentDrift = detectEnvironmentDrift(sourceArtifacts, docArtifacts);
  const coverageGaps = detectCoverageGaps(sourceArtifacts, docArtifacts);

  // Determine primary drift type (highest confidence)
  const driftTypes = [
    { type: 'instruction', ...instructionDrift },
    { type: 'process', ...processDrift },
    { type: 'ownership', ...ownershipDrift },
    { type: 'environment', ...environmentDrift },
  ].filter(d => d.hasDrift);

  // Sort by confidence and evidence count
  driftTypes.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.evidenceCount - a.evidenceCount;
  });

  const primaryDrift = driftTypes[0];

  return {
    driftType: primaryDrift?.type || 'instruction',
    confidence: primaryDrift?.confidence || 0,
    hasDrift: driftTypes.length > 0,
    hasCoverageGap: coverageGaps.hasGap,
    allDriftTypes: driftTypes.map(d => d.type),
    conflicts: primaryDrift?.conflicts || [],
    newContent: primaryDrift?.newContent || [],
    coverageGaps: coverageGaps.gaps || [],
    recommendation: determineRecommendation(primaryDrift, coverageGaps),
  };
}
```

**Drift Detection Functions**:

```typescript
function detectInstructionDrift(
  source: BaselineArtifacts,
  doc: BaselineArtifacts
): DriftDetectionResult {
  const conflicts: string[] = [];
  const newContent: string[] = [];

  // Compare commands
  const docCommands = new Set(doc.commands || []);
  const sourceCommands = source.commands || [];
  for (const cmd of sourceCommands) {
    if (!docCommands.has(cmd)) {
      newContent.push(`New command: ${cmd}`);
    }
  }

  // Compare config keys
  const docConfigKeys = new Set(doc.configKeys || []);
  const sourceConfigKeys = source.configKeys || [];
  for (const key of sourceConfigKeys) {
    if (!docConfigKeys.has(key)) {
      newContent.push(`New config key: ${key}`);
    }
  }

  // Compare endpoints
  const docEndpoints = new Set(doc.endpoints || []);
  const sourceEndpoints = source.endpoints || [];
  for (const endpoint of sourceEndpoints) {
    if (!docEndpoints.has(endpoint)) {
      newContent.push(`New endpoint: ${endpoint}`);
    }
  }

  // Compare tools
  const docTools = new Set(doc.tools || []);
  const sourceTools = source.tools || [];
  for (const tool of sourceTools) {
    if (!docTools.has(tool)) {
      newContent.push(`New tool: ${tool}`);
    }
  }

  const evidenceCount = conflicts.length + newContent.length;
  const confidence = evidenceCount >= 3 ? 0.9 : evidenceCount >= 1 ? 0.7 : 0.5;

  return {
    hasDrift: evidenceCount > 0,
    confidence,
    evidenceCount,
    conflicts,
    newContent,
  };
}

function detectProcessDrift(
  source: BaselineArtifacts,
  doc: BaselineArtifacts
): DriftDetectionResult {
  const conflicts: string[] = [];
  const newContent: string[] = [];

  // Compare steps
  const docSteps = new Set(doc.steps || []);
  const sourceSteps = source.steps || [];
  for (const step of sourceSteps) {
    if (!docSteps.has(step)) {
      newContent.push(`New step: ${step}`);
    }
  }

  // Compare decisions
  const docDecisions = new Set(doc.decisions || []);
  const sourceDecisions = source.decisions || [];
  for (const decision of sourceDecisions) {
    if (!docDecisions.has(decision)) {
      newContent.push(`New decision point: ${decision}`);
    }
  }

  const evidenceCount = conflicts.length + newContent.length;
  const confidence = evidenceCount >= 2 ? 0.85 : evidenceCount >= 1 ? 0.65 : 0.5;

  return {
    hasDrift: evidenceCount > 0,
    confidence,
    evidenceCount,
    conflicts,
    newContent,
  };
}

function detectOwnershipDrift(
  source: BaselineArtifacts,
  doc: BaselineArtifacts
): DriftDetectionResult {
  const conflicts: string[] = [];
  const newContent: string[] = [];

  // Compare teams
  const docTeams = new Set(doc.teams || []);
  const sourceTeams = source.teams || [];
  for (const team of sourceTeams) {
    if (!docTeams.has(team)) {
      newContent.push(`New team: ${team}`);
    }
  }

  // Compare owners
  const docOwners = new Set(doc.owners || []);
  const sourceOwners = source.owners || [];
  for (const owner of sourceOwners) {
    if (!docOwners.has(owner)) {
      newContent.push(`New owner: ${owner}`);
    }
  }

  // Compare paths
  const docPaths = new Set(doc.paths || []);
  const sourcePaths = source.paths || [];
  for (const path of sourcePaths) {
    if (!docPaths.has(path)) {
      newContent.push(`New path: ${path}`);
    }
  }

  const evidenceCount = conflicts.length + newContent.length;
  const confidence = evidenceCount >= 2 ? 0.9 : evidenceCount >= 1 ? 0.7 : 0.5;

  return {
    hasDrift: evidenceCount > 0,
    confidence,
    evidenceCount,
    conflicts,
    newContent,
  };
}

function detectEnvironmentDrift(
  source: BaselineArtifacts,
  doc: BaselineArtifacts
): DriftDetectionResult {
  const conflicts: string[] = [];
  const newContent: string[] = [];

  // Compare platforms
  const docPlatforms = new Set(doc.platforms || []);
  const sourcePlatforms = source.platforms || [];
  for (const platform of sourcePlatforms) {
    if (!docPlatforms.has(platform)) {
      newContent.push(`New platform: ${platform}`);
    }
  }

  // Compare versions
  const docVersions = new Set(doc.versions || []);
  const sourceVersions = source.versions || [];
  for (const version of sourceVersions) {
    if (!docVersions.has(version)) {
      newContent.push(`New version: ${version}`);
    }
  }

  // Compare dependencies
  const docDeps = new Set(doc.dependencies || []);
  const sourceDeps = source.dependencies || [];
  for (const dep of sourceDeps) {
    if (!docDeps.has(dep)) {
      newContent.push(`New dependency: ${dep}`);
    }
  }

  const evidenceCount = conflicts.length + newContent.length;
  const confidence = evidenceCount >= 2 ? 0.85 : evidenceCount >= 1 ? 0.65 : 0.5;

  return {
    hasDrift: evidenceCount > 0,
    confidence,
    evidenceCount,
    conflicts,
    newContent,
  };
}

function detectCoverageGaps(
  source: BaselineArtifacts,
  doc: BaselineArtifacts
): CoverageGapResult {
  const gaps: string[] = [];

  // Check for new scenarios
  const docScenarios = new Set(doc.scenarios || []);
  const sourceScenarios = source.scenarios || [];
  for (const scenario of sourceScenarios) {
    if (!docScenarios.has(scenario)) {
      gaps.push(`New scenario: ${scenario}`);
    }
  }

  // Check for new features
  const docFeatures = new Set(doc.features || []);
  const sourceFeatures = source.features || [];
  for (const feature of sourceFeatures) {
    if (!docFeatures.has(feature)) {
      gaps.push(`New feature: ${feature}`);
    }
  }

  // Check for new errors
  const docErrors = new Set(doc.errors || []);
  const sourceErrors = source.errors || [];
  for (const error of sourceErrors) {
    if (!docErrors.has(error)) {
      gaps.push(`New error: ${error}`);
    }
  }

  return {
    hasGap: gaps.length > 0,
    gapCount: gaps.length,
    gaps,
  };
}
```

#### Task 1.4: Make LLM Classification Conditional (2 hours)

Update `apps/api/src/services/orchestrator/transitions.ts`:

```typescript
async function handleBaselineChecked(drift: any): Promise<TransitionResult> {
  // Extract artifacts from source and doc
  const sourceArtifacts = extractArtifacts({
    sourceType: drift.sourceType,
    sourceEvidence: drift.evidenceBundle?.source,
  });

  const docArtifacts = extractArtifacts({
    sourceType: 'doc', // Special handling for doc extraction
    sourceEvidence: drift.evidenceBundle?.target,
  });

  // Deterministic comparison
  const comparison = compareArtifacts({
    sourceArtifacts,
    docArtifacts,
    sourceType: drift.sourceType,
  });

  // Update drift candidate with comparison results
  await prisma.driftCandidate.update({
    where: { workspaceId_id: { workspaceId: drift.workspaceId, id: drift.id } },
    data: {
      driftType: comparison.driftType,
      hasCoverageGap: comparison.hasCoverageGap,
      baselineFindings: {
        ...drift.baselineFindings,
        comparison: comparison,
        deterministic: true,
        confidence: comparison.confidence,
      },
    },
  });

  // Only use LLM if comparison is ambiguous (confidence < 0.6)
  if (comparison.confidence < 0.6) {
    console.log(`[Transitions] Low confidence (${comparison.confidence}), using LLM fallback`);
    // Call existing LLM classification logic
    const llmResult = await classifyDriftWithLLM(drift);
    // Update with LLM result if it has higher confidence
  } else {
    console.log(`[Transitions] High confidence (${comparison.confidence}), skipping LLM`);
  }

  // Proceed to next state
  return {
    state: DriftState.PATCH_PLANNED,
    enqueueNext: true,
  };
}
```

#### Task 1.5: Update State Machine Transitions (2 hours)

**Changes Required**:
1. Move comparison logic from `handleBaselineChecked()` to run BEFORE `handleDriftClassified()`
2. Make `handleDriftClassified()` conditional (only run if comparison confidence < 0.6)
3. Update state flow to support deterministic classification

**Files to modify**:
- `apps/api/src/services/orchestrator/transitions.ts` (lines 60-80, 1335-1600)
- `apps/api/src/types/drift.ts` (add new fields to DriftCandidate type)

#### Task 1.6: Comprehensive Testing (4 hours)

Create test suite for all 35 combinations:

**Test Matrix**:

| Test ID | Source Type | Drift Type | Test Case | Expected Result |
|---------|-------------|------------|-----------|-----------------|
| T1.1 | GitHub PR | Instruction | New endpoint in PR, not in doc | ✅ Detect instruction drift |
| T1.2 | GitHub PR | Process | New step in PR, not in doc | ✅ Detect process drift |
| T1.3 | GitHub PR | Ownership | New team in PR, not in doc | ✅ Detect ownership drift |
| T1.4 | GitHub PR | Environment | New dependency in PR, not in doc | ✅ Detect environment drift |
| T1.5 | GitHub PR | Coverage | New scenario in PR, not in doc | ✅ Detect coverage gap |
| T2.1 | PagerDuty | Instruction | New command in incident, not in runbook | ✅ Detect instruction drift |
| T2.2 | PagerDuty | Process | New escalation step, not in runbook | ✅ Detect process drift |
| T2.3 | PagerDuty | Ownership | New responder team, not in runbook | ✅ Detect ownership drift |
| T2.4 | PagerDuty | Environment | New platform in incident, not in runbook | ✅ Detect environment drift |
| T2.5 | PagerDuty | Coverage | New failure mode, not in runbook | ✅ Detect coverage gap |
| ... | ... | ... | ... | ... |
| T7.5 | CODEOWNERS | Coverage | New ownership area, not in docs | ✅ Detect coverage gap |

**Total**: 35 test cases (7 sources × 5 drift types)

**Test Implementation**:

```typescript
describe('Deterministic Drift Detection - All Combinations', () => {
  describe('GitHub PR Source', () => {
    it('T1.1: Detects instruction drift (new endpoint)', async () => {
      const sourceArtifacts = {
        endpoints: ['/api/health', '/api/metrics'], // New endpoints
      };
      const docArtifacts = {
        endpoints: [], // Empty doc
      };

      const result = compareArtifacts({
        sourceArtifacts,
        docArtifacts,
        sourceType: 'github_pr',
      });

      expect(result.driftType).toBe('instruction');
      expect(result.hasDrift).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.newContent).toContain('New endpoint: /api/health');
    });

    // ... T1.2 through T1.5
  });

  describe('PagerDuty Source', () => {
    it('T2.1: Detects instruction drift (new command)', async () => {
      const sourceArtifacts = {
        commands: ['kubectl rollback deployment'], // New command from incident
      };
      const docArtifacts = {
        commands: [], // Not in runbook
      };

      const result = compareArtifacts({
        sourceArtifacts,
        docArtifacts,
        sourceType: 'pagerduty_incident',
      });

      expect(result.driftType).toBe('instruction');
      expect(result.hasDrift).toBe(true);
      expect(result.newContent).toContain('New command: kubectl rollback deployment');
    });

    // ... T2.2 through T2.5
  });

  // ... Slack, Datadog, Grafana, IaC, CODEOWNERS
});
```

**Deliverables**:
- [ ] 35 test cases covering all combinations
- [ ] 90%+ test coverage for comparison logic
- [ ] Integration tests for state machine transitions
- [ ] Performance tests (comparison should complete in <100ms)

---

## Day 3: Gap 2 - Make Coverage Drift Orthogonal

### Current Problem

Coverage is treated as a separate drift type (one of 5), but it should be **orthogonal** - every drift can have coverage gaps.

**Example**: A PR adds a new endpoint (`/api/health`) that's not documented:
- **Current**: Classified as either "instruction drift" OR "coverage drift"
- **Correct**: Classified as "instruction drift" WITH "coverage gap"

### Implementation Tasks

#### Task 2.1: Add `hasCoverageGap` Field to Schema (1 hour)

Update `apps/api/prisma/schema.prisma`:

```prisma
model DriftCandidate {
  // ... existing fields

  driftType         String?           // instruction, process, ownership, environment
  hasCoverageGap    Boolean @default(false)  // NEW: Orthogonal coverage flag
  coverageGaps      Json?             // NEW: Array of coverage gap details

  // ... rest of fields
}
```

Run migration:
```bash
npx prisma migrate dev --name add_coverage_gap_field
```

#### Task 2.2: Update Comparison Logic (2 hours)

Modify `apps/api/src/services/baseline/comparison.ts` to always check for coverage gaps:

```typescript
export function compareArtifacts(args: {
  sourceArtifacts: BaselineArtifacts;
  docArtifacts: BaselineArtifacts;
  sourceType: string;
}): ComparisonResult {
  // ... existing drift type detection

  // ALWAYS check for coverage gaps (orthogonal to drift type)
  const coverageGaps = detectCoverageGaps(sourceArtifacts, docArtifacts);

  return {
    driftType: primaryDrift?.type || 'instruction',
    confidence: primaryDrift?.confidence || 0,
    hasDrift: driftTypes.length > 0,
    hasCoverageGap: coverageGaps.hasGap,  // NEW: Always populated
    allDriftTypes: driftTypes.map(d => d.type),
    conflicts: primaryDrift?.conflicts || [],
    newContent: primaryDrift?.newContent || [],
    coverageGaps: coverageGaps.gaps || [],  // NEW: Detailed gap list
    recommendation: determineRecommendation(primaryDrift, coverageGaps),
  };
}
```

#### Task 2.3: Update Slack Message Builder (2 hours)

Modify `apps/api/src/services/evidence/slackMessageBuilder.ts` to show both dimensions:

```typescript
export function buildSlackMessageFromEvidence(
  bundle: EvidenceBundle,
  patchId: string,
  targetChannel: string,
  ownerName: string
): SlackMessageBlocks {
  const blocks: any[] = [];

  // Header with drift type AND coverage gap indicator
  const driftType = bundle.driftType || 'instruction';
  const hasCoverageGap = bundle.hasCoverageGap || false;
  const impactEmoji = getImpactEmoji(bundle.assessment.impactBand);

  let headerText = `${impactEmoji} ${driftType.toUpperCase()} Drift Detected`;
  if (hasCoverageGap) {
    headerText += ` + Coverage Gap`;
  }

  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: headerText },
  });

  // ... existing sections

  // NEW: Coverage gaps section (if any)
  if (hasCoverageGap && bundle.coverageGaps && bundle.coverageGaps.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*📋 Coverage Gaps*\n${bundle.coverageGaps.slice(0, 5).map(g => `• ${g}`).join('\n')}`,
      },
    });
  }

  // ... rest of message
}
```

#### Task 2.4: Update Tests (1 hour)

Add tests for orthogonal coverage detection:

```typescript
describe('Orthogonal Coverage Detection', () => {
  it('Detects instruction drift WITH coverage gap', async () => {
    const sourceArtifacts = {
      endpoints: ['/api/health'],  // New endpoint
      scenarios: ['Health check endpoint'],  // New scenario
    };
    const docArtifacts = {
      endpoints: [],
      scenarios: [],
    };

    const result = compareArtifacts({
      sourceArtifacts,
      docArtifacts,
      sourceType: 'github_pr',
    });

    expect(result.driftType).toBe('instruction');
    expect(result.hasDrift).toBe(true);
    expect(result.hasCoverageGap).toBe(true);  // Both dimensions
    expect(result.newContent).toContain('New endpoint: /api/health');
    expect(result.coverageGaps).toContain('New scenario: Health check endpoint');
  });

  it('Detects process drift WITHOUT coverage gap', async () => {
    const sourceArtifacts = {
      steps: ['Step 1', 'Step 2'],  // New steps
      scenarios: [],  // No new scenarios
    };
    const docArtifacts = {
      steps: [],
      scenarios: [],
    };

    const result = compareArtifacts({
      sourceArtifacts,
      docArtifacts,
      sourceType: 'github_pr',
    });

    expect(result.driftType).toBe('process');
    expect(result.hasDrift).toBe(true);
    expect(result.hasCoverageGap).toBe(false);  // No coverage gap
  });
});
```

**Deliverables**:
- [ ] Database migration adding `hasCoverageGap` and `coverageGaps` fields
- [ ] Updated comparison logic to always check coverage
- [ ] Updated Slack message builder to show both dimensions
- [ ] Tests for orthogonal coverage detection

---

## Day 4-5: Gap 3 - Multi-Source Drift Comparison

### Objective

Implement comparison logic for all 6 non-GitHub sources, ensuring **same quality** as GitHub PR comparison.

### Implementation Strategy

**Matrix-Based Approach**:
1. Implement artifact extraction for each source (6 sources)
2. Implement comparison logic for each drift type (5 types)
3. Test all 30 combinations (6 sources × 5 types)
4. Ensure same quality metrics across all combinations

### Task 3.1: Implement PagerDuty Comparison (3 hours)

Create `apps/api/src/services/baseline/extractors/pagerduty.ts`:

```typescript
/**
 * Extract artifacts from PagerDuty incident timeline
 */
export function extractPagerDutyArtifacts(evidence: SourceEvidence): BaselineArtifacts {
  const incident = evidence.artifacts?.incidentTimeline;
  const timeline = incident?.excerpt || '';
  const responders = incident?.responders || [];

  return {
    // Instruction artifacts
    commands: extractCommandsFromTimeline(timeline),
    tools: extractToolsFromTimeline(timeline),
    configKeys: extractConfigFromTimeline(timeline),
    endpoints: extractEndpointsFromTimeline(timeline),

    // Process artifacts
    steps: extractIncidentSteps(timeline),
    decisions: extractEscalationDecisions(timeline),

    // Ownership artifacts
    teams: responders.map(r => r.team).filter(Boolean),
    owners: responders.map(r => r.name).filter(Boolean),
    channels: extractChannelsFromTimeline(timeline),

    // Environment artifacts
    platforms: extractPlatformsFromIncident(timeline),
    versions: extractVersionsFromIncident(timeline),

    // Coverage artifacts
    scenarios: extractNewScenarios(timeline),
    errors: extractErrorCodes(timeline),
  };
}

// Helper functions
function extractCommandsFromTimeline(timeline: string): string[] {
  const commands: string[] = [];
  const patterns = [
    /`([^`]+)`/g,  // Backtick commands
    /ran\s+([a-z0-9-]+\s+[a-z0-9-]+)/gi,  // "ran kubectl restart"
    /executed\s+([a-z0-9-]+\s+[a-z0-9-]+)/gi,  // "executed docker ps"
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(timeline)) !== null) {
      commands.push(match[1].trim().toLowerCase());
    }
  }

  return [...new Set(commands)].slice(0, 20);
}

function extractIncidentSteps(timeline: string): string[] {
  const steps: string[] = [];
  const lines = timeline.split('\n');

  for (const line of lines) {
    // Look for numbered steps or bullet points
    if (/^\d+\.|^[-*]\s/.test(line.trim())) {
      steps.push(line.trim());
    }
  }

  return steps.slice(0, 15);
}

// ... more helper functions
```

**Test Cases for PagerDuty**:
```typescript
describe('PagerDuty Artifact Extraction', () => {
  it('Extracts commands from incident timeline', () => {
    const evidence = {
      artifacts: {
        incidentTimeline: {
          excerpt: 'Responder ran `kubectl rollback deployment/api` to fix the issue',
        },
      },
    };

    const artifacts = extractPagerDutyArtifacts(evidence);
    expect(artifacts.commands).toContain('kubectl rollback deployment/api');
  });

  it('Extracts escalation steps', () => {
    const evidence = {
      artifacts: {
        incidentTimeline: {
          excerpt: '1. Check logs\n2. Restart service\n3. Escalate to platform team',
        },
      },
    };

    const artifacts = extractPagerDutyArtifacts(evidence);
    expect(artifacts.steps).toHaveLength(3);
  });
});
```

### Task 3.2: Implement Slack Comparison (3 hours)

Create `apps/api/src/services/baseline/extractors/slack.ts`:

```typescript
/**
 * Extract artifacts from Slack message cluster
 */
export function extractSlackArtifacts(evidence: SourceEvidence): BaselineArtifacts {
  const cluster = evidence.artifacts?.slackCluster;
  const messages = cluster?.excerpt || '';
  const themes = cluster?.themes || [];

  return {
    // Instruction artifacts
    commands: extractCommandsFromMessages(messages),
    tools: extractToolMentions(messages),
    endpoints: extractURLsFromMessages(messages),

    // Process artifacts
    steps: extractStepsFromConversation(messages),

    // Ownership artifacts
    channels: [cluster?.channelId].filter(Boolean),
    teams: extractTeamsFromMessages(messages),

    // Coverage artifacts
    scenarios: themes,
    errors: extractErrorsFromMessages(messages),
  };
}

function extractToolMentions(messages: string): string[] {
  const tools: string[] = [];
  const toolPatterns = [
    /\b(kubectl|docker|terraform|ansible|jenkins|github|datadog|grafana|prometheus)\b/gi,
    /@([a-z0-9-]+)/gi,  // @mentions might be tools
  ];

  for (const pattern of toolPatterns) {
    let match;
    while ((match = pattern.exec(messages)) !== null) {
      tools.push(match[1].toLowerCase());
    }
  }

  return [...new Set(tools)].slice(0, 15);
}

function extractErrorsFromMessages(messages: string): string[] {
  const errors: string[] = [];
  const errorPatterns = [
    /error:\s*([^\n]+)/gi,
    /exception:\s*([^\n]+)/gi,
    /failed:\s*([^\n]+)/gi,
    /\b(500|502|503|504)\b/g,  // HTTP error codes
  ];

  for (const pattern of errorPatterns) {
    let match;
    while ((match = pattern.exec(messages)) !== null) {
      errors.push(match[1] || match[0]);
    }
  }

  return [...new Set(errors)].slice(0, 10);
}
```

### Task 3.3: Implement Datadog/Grafana Comparison (2 hours)

Create `apps/api/src/services/baseline/extractors/alerts.ts`:

```typescript
/**
 * Extract artifacts from Datadog/Grafana alerts
 */
export function extractAlertArtifacts(evidence: SourceEvidence): BaselineArtifacts {
  const alert = evidence.artifacts?.alertData;
  const alertText = alert?.excerpt || '';
  const services = alert?.affectedServices || [];

  return {
    // Instruction artifacts
    endpoints: extractEndpointsFromAlert(alertText),
    tools: extractMonitoringTools(alertText),
    configKeys: extractMetricNames(alertText),

    // Process artifacts
    steps: extractAlertSteps(alertText),
    decisions: extractThresholds(alertText),

    // Ownership artifacts
    teams: services.map(s => s.team).filter(Boolean),

    // Environment artifacts
    platforms: services.map(s => s.platform).filter(Boolean),
    versions: extractVersionsFromAlert(alertText),

    // Coverage artifacts
    scenarios: extractAlertScenarios(alertText),
  };
}

function extractMetricNames(alertText: string): string[] {
  const metrics: string[] = [];
  const patterns = [
    /metric:\s*([a-z0-9_.]+)/gi,
    /\b([a-z0-9_]+\.(count|rate|gauge|histogram))\b/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(alertText)) !== null) {
      metrics.push(match[1].toLowerCase());
    }
  }

  return [...new Set(metrics)].slice(0, 15);
}

function extractThresholds(alertText: string): string[] {
  const thresholds: string[] = [];
  const patterns = [
    /threshold:\s*([^\n]+)/gi,
    />\s*(\d+)/g,
    /<\s*(\d+)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(alertText)) !== null) {
      thresholds.push(match[1]);
    }
  }

  return [...new Set(thresholds)].slice(0, 10);
}
```

### Task 3.4: Implement IaC Comparison (2 hours)

Create `apps/api/src/services/baseline/extractors/iac.ts`:

```typescript
/**
 * Extract artifacts from IaC changes
 */
export function extractIaCArtifacts(evidence: SourceEvidence): BaselineArtifacts {
  const iac = evidence.artifacts?.iacChanges;
  const changes = iac?.excerpt || '';
  const resources = iac?.resourcesChanged || [];

  return {
    // Instruction artifacts
    endpoints: extractEndpointsFromIaC(changes),
    configKeys: extractIaCConfigKeys(changes),
    tools: extractIaCTools(changes),

    // Process artifacts
    steps: extractDeploymentSteps(changes),

    // Ownership artifacts
    paths: resources,

    // Environment artifacts
    platforms: extractPlatformsFromIaC(changes),
    versions: extractVersionsFromIaC(changes),
    dependencies: extractDependenciesFromIaC(changes),

    // Coverage artifacts
    scenarios: extractNewInfraScenarios(changes),
  };
}
```

### Task 3.5: Implement CODEOWNERS Comparison (1 hour)

Create `apps/api/src/services/baseline/extractors/codeowners.ts`:

```typescript
/**
 * Extract artifacts from CODEOWNERS changes
 */
export function extractCodeownersArtifacts(evidence: SourceEvidence): BaselineArtifacts {
  const codeowners = evidence.artifacts?.codeownersDiff;
  const pathsAdded = codeowners?.pathsAdded || [];
  const ownersAdded = codeowners?.ownersAdded || [];

  return {
    // Ownership artifacts (primary focus)
    paths: pathsAdded,
    owners: ownersAdded,
    teams: extractTeamsFromOwners(ownersAdded),

    // Coverage artifacts
    scenarios: pathsAdded.map(p => `New ownership for ${p}`),
  };
}
```

### Task 3.6: Integration and Testing (5 hours)

**Integration Checklist**:
- [ ] All 6 extractors implemented
- [ ] All extractors follow same pattern and quality
- [ ] All extractors return BaselineArtifacts interface
- [ ] All extractors have helper functions for pattern matching
- [ ] All extractors have unit tests (90%+ coverage)

**Comprehensive Test Matrix**:

```typescript
describe('Multi-Source Drift Detection - All 30 Combinations', () => {
  const testCases = [
    // PagerDuty (5 drift types)
    { source: 'pagerduty_incident', drift: 'instruction', artifact: 'commands', value: 'kubectl rollback' },
    { source: 'pagerduty_incident', drift: 'process', artifact: 'steps', value: 'Escalate to platform team' },
    { source: 'pagerduty_incident', drift: 'ownership', artifact: 'teams', value: 'platform-team' },
    { source: 'pagerduty_incident', drift: 'environment', artifact: 'platforms', value: 'kubernetes' },
    { source: 'pagerduty_incident', drift: 'coverage', artifact: 'scenarios', value: 'Database connection timeout' },

    // Slack (5 drift types)
    { source: 'slack_cluster', drift: 'instruction', artifact: 'tools', value: 'datadog' },
    { source: 'slack_cluster', drift: 'process', artifact: 'steps', value: 'Check logs first' },
    { source: 'slack_cluster', drift: 'ownership', artifact: 'channels', value: '#platform-alerts' },
    { source: 'slack_cluster', drift: 'environment', artifact: 'platforms', value: 'aws' },
    { source: 'slack_cluster', drift: 'coverage', artifact: 'errors', value: '502 Bad Gateway' },

    // ... Datadog, Grafana, IaC, CODEOWNERS (25 more test cases)
  ];

  testCases.forEach(({ source, drift, artifact, value }) => {
    it(`${source} + ${drift}: Detects ${artifact} artifact`, async () => {
      const sourceArtifacts = { [artifact]: [value] };
      const docArtifacts = { [artifact]: [] };

      const result = compareArtifacts({
        sourceArtifacts,
        docArtifacts,
        sourceType: source,
      });

      expect(result.hasDrift).toBe(true);
      expect(result.driftType).toBe(drift === 'coverage' ? 'instruction' : drift);
      if (drift === 'coverage') {
        expect(result.hasCoverageGap).toBe(true);
      }
    });
  });
});
```

**Deliverables**:
- [ ] 6 source-specific extractors (PagerDuty, Slack, Datadog/Grafana, IaC, CODEOWNERS)
- [ ] 30 test cases covering all non-GitHub combinations
- [ ] Integration tests for state machine
- [ ] Performance benchmarks (all extractors < 50ms)
- [ ] Documentation for each extractor

---

## Success Criteria for Phase 1

### Technical Metrics
- ✅ **100% drift type detection coverage**: All 35 combinations (7 sources × 5 drift types) work deterministically
- ✅ **<5% false positive rate**: Comparison logic is accurate
- ✅ **90%+ test coverage**: All new code is thoroughly tested
- ✅ **<100ms comparison time**: Performance is acceptable
- ✅ **Zero LLM dependency**: Drift type detection is deterministic

### Quality Metrics
- ✅ **Same quality across all sources**: No source has inferior comparison logic
- ✅ **Same quality across all drift types**: No drift type has inferior detection
- ✅ **Consistent artifact extraction**: All extractors follow same patterns
- ✅ **Comprehensive error handling**: All edge cases are handled

### Business Metrics
- ✅ **Deterministic drift detection**: Same input always produces same output
- ✅ **Reproducible results**: Can debug and explain every decision
- ✅ **Cost reduction**: 90% reduction in LLM calls
- ✅ **Faster processing**: 50% faster pipeline execution

---

## Risk Mitigation

### High-Risk Items
1. **Artifact extraction quality** - Different sources have different data formats
2. **Pattern matching accuracy** - Regex patterns may miss edge cases
3. **Performance degradation** - 6 new extractors may slow down pipeline

### Mitigation Strategies
1. **Extensive testing**: 90%+ test coverage with real-world examples
2. **Incremental rollout**: Deploy one source at a time, validate before next
3. **Performance monitoring**: Add metrics for each extractor
4. **Fallback to LLM**: If extraction fails, fall back to LLM classification

---

## Next Steps After Phase 1

Once Phase 1 is complete:
1. **Validate with real data**: Test with production PRs, incidents, alerts
2. **Measure improvements**: Compare false positive rate before/after
3. **Start Phase 2**: Control-plane enhancements (PlanRun, clustering)
4. **User feedback**: Get feedback on drift detection accuracy

---

## Appendix: File Structure

```
apps/api/src/services/baseline/
├── types.ts                    # NEW: BaselineArtifacts interface
├── artifactExtractor.ts        # NEW: Universal artifact extractor
├── comparison.ts               # NEW: Deterministic comparison logic
├── extractors/
│   ├── github.ts              # ENHANCED: GitHub PR extractor
│   ├── pagerduty.ts           # NEW: PagerDuty extractor
│   ├── slack.ts               # NEW: Slack extractor
│   ├── alerts.ts              # NEW: Datadog/Grafana extractor
│   ├── iac.ts                 # NEW: IaC extractor
│   └── codeowners.ts          # NEW: CODEOWNERS extractor
├── evidencePack.ts            # EXISTING: GitHub PR evidence pack
└── patterns.ts                # EXISTING: Baseline patterns

apps/api/src/services/baseline/__tests__/
├── artifactExtractor.test.ts  # NEW: Extractor tests
├── comparison.test.ts         # NEW: Comparison tests
└── matrix.test.ts             # NEW: 35-combination matrix tests
```

