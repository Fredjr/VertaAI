# Architectural Analysis: Drift Detection Reliability Across All Types & Sources

**Date**: 2026-02-09  
**Status**: 🔴 CRITICAL GAPS IDENTIFIED  
**Scope**: Complete audit of drift detection determinism, coverage, and reliability

---

## Executive Summary

### Critical Finding
**The current drift detection system has a fundamental architectural flaw**: It relies on **LLM classification BEFORE comparison**, making it **probabilistic rather than deterministic**. This violates the core principle of "truth-making" and creates systematic blind spots.

### Impact
- ✅ **Instruction drift**: NOW WORKS (after today's fixes for coverage gaps + endpoint extraction)
- ⚠️ **Process drift**: PARTIALLY WORKS (LLM-dependent, not fully deterministic)
- ⚠️ **Ownership drift**: PARTIALLY WORKS (relies on LLM to extract owner from PR)
- ❌ **Coverage drift**: BROKEN (separate drift type, not integrated with instruction drift)
- ⚠️ **Environment drift**: PARTIALLY WORKS (tool migration detection works, but LLM-dependent)

### Root Cause
**Current Flow** (WRONG):
```
ELIGIBILITY_CHECKED
  → DRIFT_CLASSIFIED (LLM decides drift type + confidence) ❌ PROBABILISTIC
  → DOCS_RESOLVED (find docs based on LLM classification)
  → EVIDENCE_EXTRACTED (extract evidence)
  → BASELINE_CHECKED (compare evidence vs doc) ✅ DETERMINISTIC
```

**Correct Flow** (SHOULD BE):
```
ELIGIBILITY_CHECKED
  → DOCS_RESOLVED (find docs based on repo/service mapping)
  → EVIDENCE_EXTRACTED (extract ALL evidence types)
  → BASELINE_CHECKED (compare ALL evidence types vs doc) ✅ DETERMINISTIC
  → DRIFT_CLASSIFIED (LLM only if comparison is ambiguous) ✅ FALLBACK ONLY
```

---

## Part 1: Drift Type Detection Analysis

### 1.1 Instruction Drift (Commands/Config/Endpoints)

**Status**: ✅ **NOW WORKS** (after today's fixes)

**What Changed Today**:
1. Enhanced comparison logic to detect **both conflicts AND new content** (coverage gaps)
2. Enhanced endpoint extraction patterns to detect route definitions (`router.get('/path')`)

**Current Implementation**:
```typescript
// transitions.ts:929-1041
if (driftType === 'instruction') {
  const prCommands = evidencePack.extracted.commands;
  const prEndpoints = evidencePack.extracted.endpoints;
  const docCommands = baselineAnchors.commands;
  const docEndpoints = baselineAnchors.endpoints;
  
  const conflicts: string[] = [];
  const newContent: string[] = [];  // NEW: Track coverage gaps
  
  // Check for conflicts (PR changed existing command)
  for (const prCmd of prCommands) {
    let foundInDoc = false;
    for (const docCmd of docCommands) {
      if (prCmd.split(' ')[0] === docCmd.split(' ')[0]) {
        foundInDoc = true;
        if (prCmd !== docCmd) {
          conflicts.push(`Command conflict: PR="${prCmd}" vs Doc="${docCmd}"`);
        }
      }
    }
    // NEW: If command not found in doc, it's new content
    if (!foundInDoc && prCmd.trim()) {
      newContent.push(`New command: ${prCmd}`);
    }
  }
  
  // Similar logic for endpoints and config keys...
  
  const hasDrift = conflicts.length > 0 || newContent.length > 0;
}
```

**Strengths**:
- ✅ Deterministic extraction (regex patterns)
- ✅ Deterministic comparison (string matching)
- ✅ Detects both conflicts AND coverage gaps
- ✅ Works for GitHub PR source

**Gaps**:
- ❌ Only works for GitHub PR source (not PagerDuty, Slack, Datadog, etc.)
- ❌ Endpoint patterns may miss some route definition styles
- ❌ No support for GraphQL endpoints, gRPC services, etc.

---

### 1.2 Process Drift (Sequence/Logic Changes)

**Status**: ⚠️ **PARTIALLY WORKS** (LLM-dependent)

**Current Implementation**:
```typescript
// transitions.ts:1043-1103
else if (driftType === 'process') {
  // Use detailed process baseline checker
  const processResult = await checkProcessBaselineDetailed({
    prDiff: evidencePack.pr.diff_excerpt,
    prTitle: evidencePack.pr.title,
    docText: docContext?.rawText || '',
    docStepMarkers: baselineAnchors.step_markers,
    docDecisionMarkers: baselineAnchors.decision_markers,
  });
  
  baselineResult = {
    driftType,
    hasMatch: processResult.detected,
    matchCount: processResult.findings.length,
    evidence: processResult.findings.map(f => f.kind),
    processResult,
  };
}
```

**Problem**: `checkProcessBaselineDetailed()` uses **LLM to extract process flow** from PR diff:
```typescript
// baseline/patterns.ts:checkProcessBaselineDetailed()
const prFlowResult = await extractProcessFlow(prDiff, prTitle);  // ❌ LLM CALL
const docFlowResult = await extractProcessFlow(docText, '');     // ❌ LLM CALL
```

**Strengths**:
- ✅ Compares process flows deterministically (after extraction)
- ✅ Detects reordering, additions, removals

**Gaps**:
- ❌ **LLM-dependent extraction** (not deterministic)
- ❌ Only works for GitHub PR source
- ❌ No support for PagerDuty incident timelines, Slack conversation flows, etc.

---

### 1.3 Ownership Drift (Owner/Team Changes)

**Status**: ⚠️ **PARTIALLY WORKS** (LLM-dependent)

**Current Implementation**:
```typescript
// transitions.ts:1105-1142
else if (driftType === 'ownership') {
  // Resolve authoritative owner from PR
  const ownerResult = await resolveOwner({
    workspaceId: drift.workspaceId,
    repo: extracted.repo || '',
    service: extracted.service || '',
    prAuthor: extracted.prAuthor || '',
    changedFiles: evidencePack.pr.files_changed,
  });
  
  const authoritativeOwner = ownerResult.primary;
  const ownerSource = ownerResult.source;  // 'codeowners' | 'backstage' | 'pr_author'
  
  // Compare with doc owner refs
  const docOwnerRefs = baselineAnchors.owner_refs;
  const ownerMismatch = authoritativeOwner && !docOwnerRefs.some(ref => 
    ref.toLowerCase().includes(authoritativeOwner.toLowerCase())
  );
}
```

**Problem**: `resolveOwner()` may use **LLM to extract owner** from PR body/title if CODEOWNERS/Backstage not available.

**Strengths**:
- ✅ Deterministic comparison (string matching)
- ✅ Multi-source owner resolution (CODEOWNERS > Backstage > PR author)

**Gaps**:
- ❌ **LLM fallback** for owner extraction (not deterministic)
- ❌ Only works for GitHub PR source
- ❌ No support for PagerDuty responders, Slack participants, etc.

---

### 1.4 Coverage Drift (Missing Scenarios)

**Status**: ❌ **BROKEN** (separate drift type, not integrated)

**Current Implementation**:
```typescript
// transitions.ts:1144-1179
else if (driftType === 'coverage') {
  // Extract scenario keywords from PR
  const prScenarios = extractScenarioKeywords(
    extracted.prTitle || prData.title || '',
    extracted.prBody || prData.body || null,
    extracted.diff || ''
  );
  
  // Get scenarios already covered in doc
  const docScenarios = baselineAnchors.coverage_keywords_present;
  
  // Find scenarios in PR that are NOT in doc
  const missingScenarios = prScenarios.filter(scenario => {
    return !docScenarios.some((docScenario: string) => {
      return docScenario.toLowerCase().includes(scenario.toLowerCase());
    });
  });
  
  const hasCoverageGap = missingScenarios.length > 0;
}
```

**Problem**: Coverage drift is a **separate drift type** that only triggers if LLM classifies the PR as "coverage" drift. But **coverage gaps can exist in ANY drift type**!

**Example**: Today's PR #6 was classified as "instruction" drift, but it had a coverage gap (new endpoints not documented). The fix was to add `newContent` tracking to instruction drift, but this is a **band-aid**, not a proper solution.

**Correct Architecture**:
- Coverage drift should be **orthogonal** to other drift types
- Every drift should check for coverage gaps in addition to conflicts
- Coverage gaps should be tracked separately from drift type

**Gaps**:
- ❌ **Coverage drift is a separate type** (should be orthogonal)
- ❌ Only works if LLM classifies as "coverage" drift
- ❌ Scenario keyword matching is too simplistic (misses many scenarios)

---

### 1.5 Environment Drift (Tool Migration)

**Status**: ⚠️ **PARTIALLY WORKS** (deterministic migration detection, but LLM-dependent classification)

**Current Implementation**:
```typescript
// transitions.ts:1181-1258
else if (driftType === 'environment') {
  // Detect tool migrations from file changes
  const changedFilesWithStatus = (rawPayload.files || []).map((f: any) => ({
    filename: f.filename || '',
    status: f.status || 'modified',
  }));
  
  const migrations = detectToolMigrations(changedFilesWithStatus);  // ✅ DETERMINISTIC
  
  // Compare PR tools vs doc tools
  const prTools = evidencePack.extracted.tool_mentions;
  const docTools = baselineAnchors.tool_mentions;
  
  // Find tool conflicts (doc mentions old tool, PR uses new tool)
  const toolConflicts: string[] = [];
  for (const migration of migrations) {
    if (docTools.includes(migration.oldTool) && prTools.includes(migration.newTool)) {
      toolConflicts.push(`Doc references ${migration.oldTool}, PR migrated to ${migration.newTool}`);
    }
  }
}
```

**Strengths**:
- ✅ Deterministic tool migration detection (file pattern matching)
- ✅ Deterministic comparison (tool mention matching)

**Gaps**:
- ❌ Only works if LLM classifies as "environment" drift
- ❌ Only works for GitHub PR source
- ❌ Tool migration patterns are hardcoded (CircleCI→GitHub Actions, etc.)
- ❌ No support for platform migrations (AWS→GCP, etc.)

---

## Part 2: Input Source Coverage Analysis

### 2.1 GitHub PR (Primary Source)

**Status**: ✅ **FULLY SUPPORTED**

**Evidence Extraction**: `apps/api/src/services/baseline/evidencePack.ts`
```typescript
export function extractEvidencePack(input: {
  prTitle: string;
  prBody: string | null;
  changedFiles: string[];
  diff: string;
  ruleHits?: string[];
}): EvidencePack {
  // Extract commands, config keys, endpoints, tool mentions, keywords
  const commands = extractMatches(diff, COMMAND_PATTERNS);
  const configKeys = extractMatches(allText, CONFIG_KEY_PATTERNS);
  const endpoints = extractMatches(allText, ENDPOINT_PATTERNS);
  const toolMentions = extractMatches(allText, TOOL_PATTERNS);
  const keywords = extractKeywords(prTitle, prBody || '');
  
  return {
    pr: { title, body, files_changed, diff_excerpt },
    extracted: { keywords, tool_mentions, commands, config_keys, endpoints },
    rule_hits: ruleHits,
  };
}
```

**Strengths**:
- ✅ Deterministic extraction (regex patterns)
- ✅ Comprehensive artifact extraction
- ✅ Works for all 5 drift types

**Gaps**:
- ❌ Endpoint patterns may miss some route styles (partially fixed today)
- ❌ No GraphQL/gRPC endpoint extraction
- ❌ No database schema change extraction

---

### 2.2 PagerDuty Incidents

**Status**: ⚠️ **PARTIALLY SUPPORTED** (evidence extraction exists, but no drift comparison logic)

**Evidence Extraction**: `apps/api/src/services/evidence/sourceBuilders.ts`
```typescript
function buildPagerDutyArtifacts(signalEvent: any, parserArtifacts?: any): SourceArtifacts {
  const incident = rawPayload.incident || {};
  const timelineText = buildIncidentTimeline(incident, extracted, pagerdutyNormalized);
  
  return {
    incidentTimeline: {
      excerpt: timelineText,
      severity: pagerdutyNormalized.severity || 'unknown',
      duration: extracted.duration || 'unknown',
      responders: pagerdutyNormalized.responders || [],
    }
  };
}
```

**Strengths**:
- ✅ Evidence extraction implemented
- ✅ Deterministic excerpt creation

**Gaps**:
- ❌ **NO DRIFT COMPARISON LOGIC** for PagerDuty incidents
- ❌ No extraction of commands/endpoints from incident notes
- ❌ No comparison of incident timeline vs runbook steps
- ❌ No ownership drift detection (responders vs doc owners)

---

### 2.3 Slack Threads

**Status**: ⚠️ **PARTIALLY SUPPORTED** (evidence extraction exists, but no drift comparison logic)

**Evidence Extraction**: `apps/api/src/services/evidence/sourceBuilders.ts`
```typescript
function buildSlackArtifacts(signalEvent: any, parserArtifacts?: any): SourceArtifacts {
  const messages = slackCluster.messages || rawPayload.messages || [];
  const messagesText = messages.map((m: any) => `${m.user}: ${m.text}`).join('\n');
  
  return {
    slackMessages: {
      excerpt: messagesText,
      messageCount: messages.length,
      participants: extracted.participants || [],
      theme: slackCluster.theme,
    }
  };
}
```

**Strengths**:
- ✅ Evidence extraction implemented
- ✅ Deterministic excerpt creation

**Gaps**:
- ❌ **NO DRIFT COMPARISON LOGIC** for Slack threads
- ❌ No extraction of commands/endpoints from Slack messages
- ❌ No comparison of conversation flow vs process steps
- ❌ No ownership drift detection (participants vs doc owners)

---

### 2.4 Datadog/Grafana Alerts

**Status**: ⚠️ **PARTIALLY SUPPORTED** (evidence extraction exists, but no drift comparison logic)

**Evidence Extraction**: `apps/api/src/services/evidence/sourceBuilders.ts`
```typescript
function buildAlertArtifacts(signalEvent: any, parserArtifacts?: any): SourceArtifacts {
  const alertText = buildAlertSummary(rawPayload, extracted, alertNormalized);
  
  return {
    alertData: {
      excerpt: alertText,
      alertType: alertNormalized.alertType || 'unknown',
      severity: alertNormalized.severity || 'unknown',
      affectedServices: alertNormalized.affectedServices || [],
    }
  };
}
```

**Strengths**:
- ✅ Evidence extraction implemented
- ✅ Deterministic excerpt creation

**Gaps**:
- ❌ **NO DRIFT COMPARISON LOGIC** for alerts
- ❌ No extraction of thresholds/metrics from alert config
- ❌ No comparison of alert config vs runbook thresholds
- ❌ No environment drift detection (monitoring tool changes)

---

### 2.5 IaC Changes (Terraform/CloudFormation)

**Status**: ⚠️ **PARTIALLY SUPPORTED** (evidence extraction exists, but no drift comparison logic)

**Evidence Extraction**: `apps/api/src/services/evidence/sourceBuilders.ts`
```typescript
function buildIaCArtiacts(signalEvent: any, parserArtifacts?: any): SourceArtifacts {
  const changesText = buildIaCChangesText(extracted, iacSummary);
  
  return {
    iacChanges: {
      excerpt: changesText,
      resourcesChanged: extracted.resourcesChanged || [],
      changeType: extracted.changeType || 'update',
      resourcesAdded: iacSummary.resourcesAdded || [],
      resourcesModified: iacSummary.resourcesModified || [],
      resourcesDeleted: iacSummary.resourcesDeleted || [],
    }
  };
}
```

**Strengths**:
- ✅ Evidence extraction implemented
- ✅ Deterministic excerpt creation

**Gaps**:
- ❌ **NO DRIFT COMPARISON LOGIC** for IaC changes
- ❌ No extraction of resource configs (ports, env vars, etc.)
- ❌ No comparison of IaC config vs deployment docs
- ❌ No environment drift detection (infrastructure changes)

---

### 2.6 CODEOWNERS Changes

**Status**: ⚠️ **PARTIALLY SUPPORTED** (evidence extraction exists, but no drift comparison logic)

**Evidence Extraction**: `apps/api/src/services/evidence/sourceBuilders.ts`
```typescript
function buildCodeownersArtifacts(signalEvent: any, parserArtifacts?: any): SourceArtifacts {
  const ownershipText = buildOwnershipChangesText(extracted, codeownersDiff);
  
  return {
    ownershipChanges: {
      excerpt: ownershipText,
      pathsChanged: extracted.pathsChanged || [],
      ownersAdded: codeownersDiff.ownersAdded || [],
      ownersRemoved: codeownersDiff.ownersRemoved || [],
    }
  };
}
```

**Strengths**:
- ✅ Evidence extraction implemented
- ✅ Deterministic excerpt creation

**Gaps**:
- ❌ **NO DRIFT COMPARISON LOGIC** for CODEOWNERS changes
- ❌ No comparison of CODEOWNERS vs doc owner blocks
- ❌ No ownership drift detection (CODEOWNERS vs Backstage vs docs)

---

## Part 3: Output Target Coverage Analysis

### 3.1 Confluence (Direct Writeback)

**Status**: ✅ **FULLY SUPPORTED**

**Adapter**: `apps/api/src/services/docs/adapters/confluenceAdapter.ts`
```typescript
async writePatch(params: WritePatchParams): Promise<WriteResult> {
  const { doc, baseRevision, newContent } = params;
  
  // Fetch current page to check for conflicts
  const currentPage = await getPage(workspaceId, doc.docId);
  
  // Optimistic locking - check revision
  if (currentPage.version.number.toString() !== baseRevision) {
    return { success: false, error: 'Revision conflict' };
  }
  
  // Update page with new content
  const result = await updatePage(workspaceId, doc.docId, {
    version: { number: parseInt(baseRevision) + 1 },
    body: { storage: { value: newContent, representation: 'storage' } },
  });
  
  return { success: true, newRevision: result.version.number.toString() };
}
```

**Strengths**:
- ✅ Direct writeback (immediate update)
- ✅ Optimistic locking (revision conflict detection)
- ✅ Full CRUD operations (fetch, write, search)

**Gaps**:
- ❌ No validation of Confluence storage format before writeback
- ❌ No rollback mechanism if writeback fails

---

### 3.2 Notion (Direct Writeback)

**Status**: ✅ **FULLY SUPPORTED**

**Adapter**: `apps/api/src/services/docs/adapters/notionAdapter.ts`
```typescript
async writePatch(params: WritePatchParams): Promise<WriteResult> {
  const { doc, baseRevision, newContent } = params;
  
  // Fetch current page to check revision
  const currentPage = await notion.pages.retrieve({ page_id: doc.docId });
  
  // Optimistic locking
  if (currentPage.last_edited_time !== baseRevision) {
    return { success: false, error: 'Revision conflict' };
  }
  
  // Convert markdown to Notion blocks
  const blocks = markdownToNotionBlocks(newContent);
  
  // Update page
  await notion.blocks.children.append({
    block_id: doc.docId,
    children: blocks,
  });
  
  return { success: true, newRevision: new Date().toISOString() };
}
```

**Strengths**:
- ✅ Direct writeback (immediate update)
- ✅ Optimistic locking (revision conflict detection)
- ✅ Markdown to Notion blocks conversion

**Gaps**:
- ❌ No validation of Notion block structure before writeback
- ❌ No rollback mechanism if writeback fails

---

### 3.3 GitHub README (PR Workflow)

**Status**: ✅ **FULLY SUPPORTED**

**Adapter**: `apps/api/src/services/docs/adapters/readmeAdapter.ts`
```typescript
async writePatch(_params: WritePatchParams): Promise<WriteResult> {
  // README should use PR workflow, not direct write
  return {
    success: false,
    error: 'Direct writeback not supported for README. Use createPatchPR instead.',
  };
}

async createPatchPR(params: CreatePRParams): Promise<PRResult> {
  // Create branch
  const branchName = `verta-ai/drift-fix-${Date.now()}`;
  await octokit.git.createRef({
    owner, repo,
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  });
  
  // Commit changes
  await octokit.repos.createOrUpdateFileContents({
    owner, repo,
    path: params.filePath,
    message: params.commitMessage,
    content: Buffer.from(params.newContent).toString('base64'),
    branch: branchName,
  });
  
  // Create PR
  const pr = await octokit.pulls.create({
    owner, repo,
    title: params.prTitle,
    body: params.prBody,
    head: branchName,
    base: params.baseBranch || 'main',
  });
  
  return { success: true, prNumber: pr.data.number, prUrl: pr.data.html_url };
}
```

**Strengths**:
- ✅ PR workflow (manual review before merge)
- ✅ Full GitHub API integration
- ✅ Supports multiple file updates in single PR

**Gaps**:
- ❌ No validation of markdown structure before PR creation
- ❌ No automatic PR approval/merge (requires human review)

---

### 3.4 Swagger/OpenAPI (PR Workflow)

**Status**: ✅ **FULLY SUPPORTED**

**Adapter**: `apps/api/src/services/docs/adapters/swaggerAdapter.ts`
**Validator**: `apps/api/src/config/outputValidators.ts`

```typescript
function validateOpenAPISchema(content: string): ValidationResult {
  const errors: string[] = [];
  
  try {
    const schema = yaml.load(content) as any;
    
    // Check required OpenAPI fields
    if (!schema.openapi && !schema.swagger) {
      errors.push('Missing openapi or swagger version field');
    }
    
    if (!schema.info) {
      errors.push('Missing info object');
    }
    
    if (!schema.paths && !schema.components) {
      errors.push('Must have either paths or components');
    }
    
    // Validate paths structure
    if (schema.paths) {
      for (const [path, methods] of Object.entries(schema.paths)) {
        if (!path.startsWith('/')) {
          errors.push(`Path "${path}" must start with /`);
        }
      }
    }
  } catch (err: any) {
    errors.push(`YAML parse error: ${err.message}`);
  }
  
  return { valid: errors.length === 0, errors };
}
```

**Strengths**:
- ✅ PR workflow (manual review before merge)
- ✅ OpenAPI schema validation before PR creation
- ✅ YAML parsing and structure validation

**Gaps**:
- ❌ No semantic validation (e.g., endpoint path conflicts)
- ❌ No automatic PR approval/merge (requires human review)

---

### 3.5 Backstage catalog-info.yaml (PR Workflow)

**Status**: ✅ **FULLY SUPPORTED**

**Adapter**: `apps/api/src/services/docs/adapters/backstageAdapter.ts`
**Validator**: `apps/api/src/config/outputValidators.ts`

```typescript
function validateBackstageYAML(content: string): ValidationResult {
  const errors: string[] = [];
  
  try {
    const catalog = yaml.load(content) as any;
    
    // Check required Backstage fields
    if (!catalog.apiVersion) {
      errors.push('Missing apiVersion field');
    }
    
    if (!catalog.kind) {
      errors.push('Missing kind field');
    }
    
    if (!catalog.metadata) {
      errors.push('Missing metadata object');
    } else {
      if (!catalog.metadata.name) {
        errors.push('Missing metadata.name');
      }
    }
    
    if (!catalog.spec) {
      errors.push('Missing spec object');
    } else {
      // Validate spec based on kind
      if (catalog.kind === 'Component' && !catalog.spec.type) {
        errors.push('Component must have spec.type');
      }
    }
  } catch (err: any) {
    errors.push(`YAML parse error: ${err.message}`);
  }
  
  return { valid: errors.length === 0, errors };
}
```

**Strengths**:
- ✅ PR workflow (manual review before merge)
- ✅ Backstage catalog schema validation before PR creation
- ✅ YAML parsing and structure validation

**Gaps**:
- ❌ No semantic validation (e.g., component dependencies)
- ❌ No automatic PR approval/merge (requires human review)

---

### 3.6 GitBook (PR Workflow)

**Status**: ✅ **FULLY SUPPORTED**

**Adapter**: `apps/api/src/services/docs/adapters/gitbookAdapter.ts`
**Validator**: `apps/api/src/config/outputValidators.ts`

```typescript
function validateGitBookMarkdown(content: string): ValidationResult {
  const errors: string[] = [];
  
  // Check for required markdown structure
  if (!content.trim().startsWith('#')) {
    errors.push('GitBook pages should start with a heading');
  }
  
  // Check for broken links
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = linkPattern.exec(content)) !== null) {
    const url = match[2];
    if (url.startsWith('http') && !url.match(/^https?:\/\/.+\..+/)) {
      errors.push(`Invalid URL: ${url}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}
```

**Strengths**:
- ✅ PR workflow (manual review before merge)
- ✅ Markdown structure validation before PR creation
- ✅ Link validation

**Gaps**:
- ❌ No GitBook-specific validation (SUMMARY.md structure, etc.)
- ❌ No automatic PR approval/merge (requires human review)

---

### 3.7 Code Comments (PR Workflow)

**Status**: ⚠️ **PARTIALLY SUPPORTED** (validator exists, but no adapter implementation)

**Validator**: `apps/api/src/config/outputValidators.ts`

```typescript
function validateJSDoc(content: string): ValidationResult {
  const errors: string[] = [];
  
  // Check for JSDoc/TSDoc structure
  if (!content.includes('/**') || !content.includes('*/')) {
    errors.push('Missing JSDoc comment block');
  }
  
  // Check for required tags
  const requiredTags = ['@param', '@returns'];
  for (const tag of requiredTags) {
    if (!content.includes(tag)) {
      errors.push(`Missing required tag: ${tag}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}
```

**Strengths**:
- ✅ JSDoc/TSDoc validation

**Gaps**:
- ❌ **NO ADAPTER IMPLEMENTATION** for code comments
- ❌ No extraction of code comments from source files
- ❌ No PR creation for code comment updates

---

## Part 4: Critical Architectural Gaps

### Gap 1: LLM Classification Before Comparison (CRITICAL)

**Problem**: The current flow runs LLM classification BEFORE comparison, making drift detection probabilistic.

**Current Flow**:
```
ELIGIBILITY_CHECKED
  → DRIFT_CLASSIFIED (LLM decides drift type) ❌ PROBABILISTIC
  → DOCS_RESOLVED
  → EVIDENCE_EXTRACTED
  → BASELINE_CHECKED (comparison happens here) ✅ DETERMINISTIC
```

**Impact**:
- If LLM misclassifies drift type, comparison logic won't run correctly
- If LLM assigns low confidence, drift may be skipped entirely
- No way to detect drift that LLM doesn't recognize

**Solution**: Invert the flow to run comparison FIRST, LLM SECOND (as fallback).

**Correct Flow**:
```
ELIGIBILITY_CHECKED
  → DOCS_RESOLVED (find docs based on repo/service mapping)
  → EVIDENCE_EXTRACTED (extract ALL evidence types)
  → BASELINE_CHECKED (run ALL comparison types) ✅ DETERMINISTIC
    → If comparison finds drift: DRIFT_VERIFIED (skip LLM)
    → If comparison is ambiguous: DRIFT_CLASSIFIED (LLM fallback)
```

---

### Gap 2: Coverage Drift is Separate Type (CRITICAL)

**Problem**: Coverage drift is a separate drift type that only triggers if LLM classifies as "coverage". But coverage gaps can exist in ANY drift type!

**Example**: Today's PR #6 was classified as "instruction" drift, but it had a coverage gap (new endpoints not documented). The fix was to add `newContent` tracking to instruction drift, but this is a band-aid.

**Solution**: Make coverage drift **orthogonal** to other drift types.

**Correct Architecture**:
```typescript
// BASELINE_CHECKED should return:
{
  driftTypes: {
    instruction: { hasConflicts: true, hasNewContent: true },
    process: { hasConflicts: false, hasNewContent: false },
    ownership: { hasConflicts: false, hasNewContent: false },
    environment: { hasConflicts: false, hasNewContent: false },
  },
  coverageGaps: {
    newCommands: ['npm run build'],
    newEndpoints: ['/api/monitoring/health'],
    newScenarios: ['health check', 'metrics'],
  },
  overallVerdict: {
    hasDrift: true,
    primaryType: 'instruction',
    secondaryTypes: ['coverage'],
    confidence: 0.95,
  }
}
```

---

### Gap 3: No Drift Comparison for Non-GitHub Sources (CRITICAL)

**Problem**: Evidence extraction exists for PagerDuty, Slack, Datadog, IaC, CODEOWNERS, but **NO drift comparison logic**.

**Current State**:
- ✅ Evidence extraction: `buildPagerDutyArtifacts()`, `buildSlackArtifacts()`, etc.
- ❌ Drift comparison: Only `extractEvidencePack()` for GitHub PR

**Impact**:
- PagerDuty incidents don't trigger drift detection
- Slack threads don't trigger drift detection
- Datadog alerts don't trigger drift detection
- IaC changes don't trigger drift detection
- CODEOWNERS changes don't trigger drift detection

**Solution**: Implement source-specific evidence extraction for each source type.

**Required Functions**:
```typescript
// For PagerDuty incidents
function extractPagerDutyEvidence(incident: any): EvidencePack {
  // Extract commands from incident notes
  // Extract responders (for ownership drift)
  // Extract timeline (for process drift)
}

// For Slack threads
function extractSlackEvidence(messages: any[]): EvidencePack {
  // Extract commands from messages
  // Extract participants (for ownership drift)
  // Extract conversation flow (for process drift)
}

// For Datadog alerts
function extractDatadogEvidence(alert: any): EvidencePack {
  // Extract thresholds/metrics (for instruction drift)
  // Extract affected services (for environment drift)
}

// For IaC changes
function extractIaCEvidence(iacChanges: any): EvidencePack {
  // Extract resource configs (ports, env vars, etc.)
  // Extract infrastructure changes (for environment drift)
}

// For CODEOWNERS changes
function extractCodeownersEvidence(codeownersDiff: any): EvidencePack {
  // Extract owner changes (for ownership drift)
}
```

---

### Gap 4: No Validation for Direct Writeback Targets (HIGH)

**Problem**: Confluence and Notion adapters support direct writeback, but **NO validation** before writing.

**Current State**:
- ✅ Validation for PR workflow targets (Swagger, Backstage, GitBook)
- ❌ No validation for direct writeback targets (Confluence, Notion)

**Impact**:
- Malformed patches can be written directly to Confluence/Notion
- No rollback mechanism if writeback fails
- No way to detect writeback errors until after the fact

**Solution**: Add pre-writeback validation for Confluence and Notion.

**Required Validators**:
```typescript
// For Confluence
function validateConfluenceStorage(content: string): ValidationResult {
  // Validate Confluence storage format (XHTML)
  // Check for broken macros
  // Check for invalid HTML tags
}

// For Notion
function validateNotionBlocks(blocks: any[]): ValidationResult {
  // Validate Notion block structure
  // Check for invalid block types
  // Check for missing required fields
}
```

---

### Gap 5: No Rollback Mechanism for Failed Writebacks (HIGH)

**Problem**: If writeback fails after partial update, there's no way to rollback.

**Current State**:
- ✅ Optimistic locking (revision conflict detection)
- ❌ No rollback mechanism

**Impact**:
- Partial updates can leave docs in inconsistent state
- No way to recover from failed writebacks

**Solution**: Implement rollback mechanism for direct writeback targets.

**Required Functions**:
```typescript
// For Confluence
async function rollbackConfluencePage(
  workspaceId: string,
  docId: string,
  targetRevision: string
): Promise<void> {
  // Fetch page history
  // Restore to target revision
}

// For Notion
async function rollbackNotionPage(
  pageId: string,
  targetRevision: string
): Promise<void> {
  // Notion doesn't support rollback via API
  // Need to implement manual rollback (delete blocks, re-add old blocks)
}
```

---

## Part 5: Recommendations

### Priority 1: Fix LLM Classification Before Comparison (CRITICAL)

**Effort**: 2-3 days  
**Impact**: Eliminates probabilistic drift detection

**Changes Required**:
1. Move `DRIFT_CLASSIFIED` state AFTER `BASELINE_CHECKED`
2. Run ALL comparison types in `BASELINE_CHECKED` (not just one)
3. Use comparison results to determine drift type (not LLM)
4. Only call LLM if comparison is ambiguous (confidence < 0.7)

---

### Priority 2: Make Coverage Drift Orthogonal (CRITICAL)

**Effort**: 1-2 days  
**Impact**: Detects coverage gaps in all drift types

**Changes Required**:
1. Remove "coverage" as a separate drift type
2. Add `coverageGaps` field to baseline result
3. Track new content separately from conflicts in all drift types
4. Update patch generation to handle coverage gaps

---

### Priority 3: Implement Drift Comparison for Non-GitHub Sources (CRITICAL)

**Effort**: 3-5 days  
**Impact**: Enables drift detection for PagerDuty, Slack, Datadog, IaC, CODEOWNERS

**Changes Required**:
1. Implement `extractPagerDutyEvidence()` function
2. Implement `extractSlackEvidence()` function
3. Implement `extractDatadogEvidence()` function
4. Implement `extractIaCEvidence()` function
5. Implement `extractCodeownersEvidence()` function
6. Update `BASELINE_CHECKED` handler to support all source types

---

### Priority 4: Add Validation for Direct Writeback Targets (HIGH)

**Effort**: 1-2 days  
**Impact**: Prevents malformed patches from being written to Confluence/Notion

**Changes Required**:
1. Implement `validateConfluenceStorage()` function
2. Implement `validateNotionBlocks()` function
3. Add validation step before writeback in `handleWrittenBack()`

---

### Priority 5: Implement Rollback Mechanism (HIGH)

**Effort**: 2-3 days  
**Impact**: Enables recovery from failed writebacks

**Changes Required**:
1. Implement `rollbackConfluencePage()` function
2. Implement `rollbackNotionPage()` function (manual rollback)
3. Add rollback logic to `handleWrittenBack()` error handling

---

## Conclusion

The VertaAI drift detection system has **strong foundations** (evidence extraction, comparison logic, multi-source support), but **critical architectural flaws** that make it probabilistic rather than deterministic:

1. **LLM classification before comparison** (should be inverted)
2. **Coverage drift as separate type** (should be orthogonal)
3. **No drift comparison for non-GitHub sources** (evidence extraction exists, but no comparison)
4. **No validation for direct writeback** (Confluence/Notion)
5. **No rollback mechanism** (for failed writebacks)

**Immediate Action Required**: Fix Priority 1 (LLM classification) and Priority 2 (coverage drift) to make the system deterministic and reliable.

**Next Steps**: Implement Priority 3 (non-GitHub sources) to enable full multi-source drift detection as per the architecture documents.

