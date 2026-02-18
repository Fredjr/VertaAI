# YAML DSL UI FIELD MAPPING

**Document Version**: 1.0
**Date**: 2026-02-18
**Purpose**: Define exact mapping between YAML Pack fields and UI screen sections

---

## 🎯 DESIGN PHILOSOPHY

**Primary Interface**: Guided Builder (80% of users)
**Secondary Interface**: Advanced YAML Editor (20% power users)
**Approach**: Builder-first with YAML escape hatch

---

## 📐 UI WIZARD STRUCTURE (5 Steps)

### **Step 1: Overview & Identity**
### **Step 2: Scope Configuration**
### **Step 3: Policy Authoring** (Builder-first)
### **Step 4: Drift Remediation** (Track B)
### **Step 5: Approval & Routing**

---

## STEP 1: OVERVIEW & IDENTITY

### UI Section: "Pack Identity"

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Pack Name** | `metadata.name` | text | ✅ | - | Display name |
| **Pack ID** | `metadata.id` | text | ✅ | auto-generated | Immutable after publish |
| **Version** | `metadata.version` | semver | ✅ | "1.0.0" | Semver format |
| **Description** | `metadata.description` | textarea | ❌ | - | 1-2 sentences |
| **Owner** | `metadata.owner` | text | ❌ | - | Team/person responsible |
| **Tags** | `metadata.tags[]` | tag-input | ❌ | [] | Searchable tags |

### UI Section: "Pack Behavior"

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Pack Mode** | `metadata.packMode` | radio | ❌ | 'enforce' | observe \| enforce |
| **Strictness** | `metadata.strictness` | radio | ❌ | 'balanced' | permissive \| balanced \| strict |
| **Defaults Reference** | `metadata.defaultsRef` | select | ❌ | - | Link to workspace defaults |

### UI Section: "Rollout Strategy"

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Status** | DB: `packStatus` | radio | ✅ | 'draft' | draft \| published |
| **Rollout Mode** | Derived from `packMode` | radio | ✅ | 'monitor' | monitor \| warn \| block |
| **Pilot Repos** | `scope.repos.include[]` | multi-select | ❌ | [] | Subset for testing |

**Logic**:
- `packMode: 'observe'` → Rollout Mode = "monitor"
- `packMode: 'enforce'` + `metadata.strictness: 'permissive'` → "warn"
- `packMode: 'enforce'` + `metadata.strictness: 'balanced'` → "warn" (default)
- `packMode: 'enforce'` + `metadata.strictness: 'strict'` → "block"

---

## STEP 2: SCOPE CONFIGURATION

### UI Section: "Scope Type"

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Scope Type** | `scope.type` | radio | ✅ | 'workspace' | workspace \| service \| repo |
| **Scope Reference** | `scope.ref` | text | Conditional | - | Required if service/repo |

**Conditional Logic**:
- If `scope.type === 'repo'` → `scope.ref` format: "owner/repo"
- If `scope.type === 'service'` → `scope.ref` format: "service-name"
- If `scope.type === 'workspace'` → `scope.ref` is null

### UI Section: "Repository Filters"

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Include Repos** | `scope.repos.include[]` | tag-input | ❌ | [] | Glob patterns |
| **Exclude Repos** | `scope.repos.exclude[]` | tag-input | ❌ | [] | Glob patterns |

**Examples**: `["org/*"]`, `["org/legacy-*"]`

### UI Section: "Branch Filters"

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Include Branches** | `scope.branches.include[]` | tag-input | ❌ | [] | Glob patterns |
| **Exclude Branches** | `scope.branches.exclude[]` | tag-input | ❌ | [] | Glob patterns |

**Examples**: `["main", "release/*"]`, `["feature/*"]`

### UI Section: "Path Filters"

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Path Globs** | DB: `pathGlobs[]` | tag-input | ❌ | [] | DEPRECATED: Use rules instead |

**Note**: Path filtering should be done at rule level via `trigger.anyChangedPaths`

### UI Section: "Event Triggers"

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **PR Events** | `scope.prEvents[]` | checkbox-group | ❌ | ['opened', 'synchronize'] | opened \| synchronize \| reopened \| labeled |

### UI Section: "Actor Signals"

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Detect Agent Authorship** | `scope.actorSignals.detectAgentAuthorship` | toggle | ❌ | false | Enable agent detection |
| **Agent Patterns** | `scope.actorSignals.agentPatterns[]` | tag-input | ❌ | [] | Regex patterns |
| **Bot Users** | `scope.actorSignals.botUsers[]` | tag-input | ❌ | [] | Exact usernames |

---

## STEP 3: POLICY AUTHORING (Builder-First)

### UI Section: "Template Gallery"

**Purpose**: Start from pre-built templates instead of blank YAML

| UI Element | Action | Result |
|------------|--------|--------|
| **Template Card** | Click | Load template YAML into builder |
| **Preview Button** | Click | Show template YAML in modal |
| **Customize Button** | Click | Load template into rule builder |

**Templates Available**:
1. Observe Core Pack
2. Enforce Core Pack
3. Big Microservices Pack
4. Security-Focused Pack
5. Documentation Pack
6. Infrastructure Pack

### UI Section: "Rule List"

**Display**: Table with columns: Name, Trigger, Decision, Severity, Enabled

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Rule Name** | `rules[i].name` | text | ✅ | - | Display name |
| **Rule ID** | `rules[i].id` | text | ✅ | auto-generated | Stable identifier |
| **Enabled** | `rules[i].enabled` | toggle | ❌ | true | Can disable without deleting |
| **Description** | `rules[i].description` | textarea | ❌ | - | What this rule checks |

### UI Section: "Rule Editor" (Modal/Drawer)

#### Subsection: "Trigger Configuration"

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Always Trigger** | `rules[i].trigger.always` | toggle | ❌ | false | Runs on every PR |
| **Changed Paths** | `rules[i].trigger.anyChangedPaths[]` | tag-input | ❌ | [] | Glob patterns |
| **Changed Paths Ref** | `rules[i].trigger.anyChangedPathsRef` | select | ❌ | - | Reference to workspace defaults |
| **File Extensions** | `rules[i].trigger.anyFileExtensions[]` | tag-input | ❌ | [] | e.g., [".ts", ".js"] |

**Advanced**: `allOf`, `anyOf` composition (show in YAML mode only)

#### Subsection: "Obligations" (Checks to Run)

**Display**: List of obligations with add/remove buttons

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Comparator** | `rules[i].obligations[j].comparator` | select | ✅ | - | Enum dropdown (23 options) |
| **Parameters** | `rules[i].obligations[j].params` | dynamic-form | ❌ | {} | Based on comparator type |
| **Severity** | `rules[i].obligations[j].severity` | select | ❌ | 'medium' | low \| medium \| high \| critical |
| **Decision on Fail** | `rules[i].obligations[j].decisionOnFail` | radio | ✅ | 'warn' | pass \| warn \| block |
| **Decision on Unknown** | `rules[i].obligations[j].decisionOnUnknown` | radio | ❌ | 'warn' | pass \| warn \| block |
| **Custom Message** | `rules[i].obligations[j].message` | text | ❌ | - | Override default message |

**Comparator Dropdown Options** (from `ComparatorId` enum):
```
Artifact Comparators:
- ARTIFACT_PRESENT
- ARTIFACT_UPDATED
- ARTIFACT_VALID_SCHEMA
- OPENAPI_VALID
- BACKSTAGE_VALID

Evidence Comparators:
- PR_TEMPLATE_FIELD_PRESENT
- CHECKRUNS_PASSED
- CHECKRUNS_REQUIRED

Governance Comparators:
- MIN_APPROVALS
- HUMAN_APPROVAL_PRESENT
- SENSITIVE_PATH_REQUIRES_APPROVAL
- APPROVER_IN_ALLOWED_SET

Safety Comparators:
- NO_SECRETS_IN_DIFF
- NO_HARDCODED_URLS
- NO_COMMENTED_CODE

... (23 total)
```

#### Subsection: "Skip Conditions"

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Skip if Labels** | `rules[i].skipIf.labels[]` | tag-input | ❌ | [] | e.g., ["skip-validation"] |
| **Skip if All Paths** | `rules[i].skipIf.allChangedPaths[]` | tag-input | ❌ | [] | Glob patterns |
| **Skip if PR Body Contains** | `rules[i].skipIf.prBodyContains[]` | tag-input | ❌ | [] | Text patterns |

#### Subsection: "Exclude Paths"

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Exclude Paths** | `rules[i].excludePaths[]` | tag-input | ❌ | [] | Files to ignore for this rule |

### UI Section: "Artifacts Configuration"

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Required Artifact Types** | `artifacts.requiredTypes[]` | checkbox-group | ❌ | [] | openapi \| readme \| runbook \| backstage \| dashboard \| terraform |
| **Artifact Definitions** | `artifacts.definitions[]` | list-builder | ❌ | [] | Define artifact locations |

**Artifact Definition Fields**:

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Artifact ID** | `artifacts.definitions[i].id` | text | ✅ | - | Unique identifier |
| **Kind** | `artifacts.definitions[i].kind` | select | ✅ | - | Enum: openapi \| readme \| runbook \| etc. |
| **Match Pattern** | `artifacts.definitions[i].matchAny[]` | tag-input | ✅ | [] | Glob patterns |
| **Service Scope** | `artifacts.definitions[i].serviceScope` | text | ❌ | - | Service name for multi-service repos |

### UI Section: "Evaluation Configuration"

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **External Dependency Mode** | `evaluation.externalDependencyMode` | radio | ❌ | 'soft_fail' | soft_fail \| hard_fail |
| **Unknown Artifact Mode** | `evaluation.unknownArtifactMode` | radio | ❌ | 'soft_fail' | soft_fail \| hard_fail |
| **Max Findings** | `evaluation.maxFindings` | number | ❌ | 100 | Stop after N findings |
| **Max Evidence Snippets** | `evaluation.maxEvidenceSnippetsPerFinding` | number | ❌ | 3 | Limit evidence size |

**Budget Configuration**:

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Total Timeout (seconds)** | `evaluation.budgets.totalTimeoutSeconds` | number | ❌ | 120 | Max evaluation time |
| **Per-Comparator Timeout** | `evaluation.budgets.perComparatorTimeoutSeconds` | number | ❌ | 30 | Max time per check |
| **Max API Calls** | `evaluation.budgets.maxApiCalls` | number | ❌ | 50 | Rate limit protection |

### UI Section: "Advanced YAML Editor"

**Purpose**: Escape hatch for power users

| UI Element | Action | Result |
|------------|--------|--------|
| **Switch to YAML** | Toggle | Show Monaco editor with full YAML |
| **Format YAML** | Button | Auto-format with prettier |
| **Validate** | Button | Run Zod schema validation |
| **Preview** | Button | Show parsed pack structure |
| **Import YAML** | Upload | Load YAML from file |
| **Export YAML** | Download | Save YAML to file |

**Features**:
- ✅ Syntax highlighting (Monaco Editor)
- ✅ Real-time validation with error highlighting
- ✅ Auto-complete for comparator IDs
- ✅ Side-by-side builder ↔ YAML view
- ✅ Diff view (draft vs published)

---

## STEP 4: DRIFT REMEDIATION (Track B)

### UI Section: "Enable Track B"

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Enable Drift Remediation** | `spawnTrackB.enabled` | toggle | ❌ | false | Enable Track B |

### UI Section: "Spawn Conditions"

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **When to Spawn** | `spawnTrackB.when` | select | ❌ | 'on_warn_or_block' | always \| on_warn_or_block \| on_block_only |

### UI Section: "Remediation Configuration"

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Create Remediation Case** | `spawnTrackB.createRemediationCase` | toggle | ❌ | true | Create DB record |
| **Target Systems** | `spawnTrackB.remediationDefaults.targetSystems[]` | checkbox-group | ❌ | [] | github_readme \| confluence \| notion |
| **Approval Channel** | `spawnTrackB.remediationDefaults.approvalChannelRef` | select | ❌ | - | Slack channel for approvals |
| **Auto-Apply Threshold** | `spawnTrackB.remediationDefaults.autoApplyThreshold` | select | ❌ | 'never' | never \| low \| medium \| high |

### UI Section: "Grouping & Batching"

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Group by Service** | `spawnTrackB.grouping.byService` | toggle | ❌ | true | Group drifts by service |
| **Group by Drift Type** | `spawnTrackB.grouping.byDriftType` | toggle | ❌ | false | Group by drift category |
| **Max Drifts per Batch** | `spawnTrackB.grouping.maxDriftsPerBatch` | number | ❌ | 10 | Batch size limit |

---

## STEP 5: APPROVAL & ROUTING

### UI Section: "GitHub Check Configuration"

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **Check Run Name** | `routing.github.checkRunName` | text | ❌ | 'VertaAI Policy Gate' | Display name in GitHub |
| **Post Summary Comment** | `routing.github.postSummaryComment` | toggle | ❌ | false | Add PR comment |
| **Annotate Files** | `routing.github.annotateFiles` | toggle | ❌ | true | Add inline annotations |

**Conclusion Mapping**:

| UI Field | YAML Path | Type | Required | Default | Notes |
|----------|-----------|------|----------|---------|-------|
| **On Pass** | `routing.github.conclusionMapping.pass` | select | ❌ | 'success' | success \| neutral |
| **On Warn** | `routing.github.conclusionMapping.warn` | select | ❌ | 'neutral' | success \| neutral \| failure |
| **On Block** | `routing.github.conclusionMapping.block` | select | ❌ | 'failure' | neutral \| failure \| action_required |

### UI Section: "Approval Tiers" (DB-level, not YAML)

**Note**: Approval tiers are stored in DB `approvalTiers` field, NOT in YAML pack

| UI Field | DB Path | Type | Required | Default | Notes |
|----------|---------|------|----------|---------|-------|
| **Tier 1 Approvers** | `approvalTiers.tier1.approvers[]` | tag-input | ❌ | [] | Team slugs or usernames |
| **Tier 1 Min Approvals** | `approvalTiers.tier1.minApprovals` | number | ❌ | 1 | Required approvals |
| **Tier 2 Approvers** | `approvalTiers.tier2.approvers[]` | tag-input | ❌ | [] | Team slugs or usernames |
| **Tier 2 Min Approvals** | `approvalTiers.tier2.minApprovals` | number | ❌ | 1 | Required approvals |

### UI Section: "Routing Configuration" (DB-level, not YAML)

**Note**: Routing config is stored in DB `routing` field, NOT in YAML pack

| UI Field | DB Path | Type | Required | Default | Notes |
|----------|---------|------|----------|---------|-------|
| **Routing Method** | `routing.method` | select | ❌ | 'codeowners' | codeowners \| manual \| auto |
| **Slack Channel** | `routing.slackChannel` | text | ❌ | - | Notification channel |
| **Email Notifications** | `routing.emailNotifications` | toggle | ❌ | false | Send email alerts |

---


## UI COMPONENT SPECIFICATIONS

### Component: `TemplateGallery`

**Location**: `apps/web/src/components/policyPacks/TemplateGallery.tsx`

**Props**:
```typescript
interface TemplateGalleryProps {
  onSelectTemplate: (templateYaml: string) => void;
  currentYaml?: string;
}
```

**Features**:
- Grid layout with template cards
- Preview modal with YAML content
- "Use Template" button loads YAML into editor
- Search/filter by tags

### Component: `RuleBuilder`

**Location**: `apps/web/src/components/policyPacks/RuleBuilder.tsx`

**Props**:
```typescript
interface RuleBuilderProps {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  workspaceDefaults: WorkspaceDefaults;
}
```

**Features**:
- Add/remove/reorder rules
- Inline editing with modal for details
- Comparator dropdown with 23 options
- Dynamic parameter forms based on comparator type
- Trigger configuration with glob pattern tester
- Skip conditions builder

### Component: `ComparatorSelector`

**Location**: `apps/web/src/components/policyPacks/ComparatorSelector.tsx`

**Props**:
```typescript
interface ComparatorSelectorProps {
  value: ComparatorId;
  onChange: (comparatorId: ComparatorId) => void;
  showDescription?: boolean;
}
```

**Features**:
- Dropdown with all 23 comparators
- Grouped by category (Artifact, Evidence, Governance, Safety, etc.)
- Description tooltip on hover
- Search/filter

### Component: `YAMLEditor`

**Location**: `apps/web/src/components/policyPacks/YAMLEditor.tsx`

**Props**:
```typescript
interface YAMLEditorProps {
  value: string;
  onChange: (value: string) => void;
  onValidate?: (errors: ValidationError[]) => void;
  showDiff?: boolean;
  compareWith?: string;
}
```

**Features**:
- Monaco Editor with YAML syntax highlighting
- Real-time Zod validation
- Error highlighting with line numbers
- Diff view (draft vs published)
- Format button
- Import/export buttons

---

## VALIDATION & PREVIEW LOGIC

### Validation Triggers

| Action | Validation Type | Feedback |
|--------|----------------|----------|
| **Field blur** | Field-level validation | Inline error message |
| **Save draft** | Schema validation | Error list modal |
| **Publish** | Full validation + preview | Blocking errors + warnings |

### Preview Features

| Preview Type | Action | Result |
|--------------|--------|--------|
| **Matched Repos** | Button: "Show matched repos" | Modal with list of repos matching scope filters |
| **Matched Branches** | Button: "Show matched branches" | Modal with list of branches matching filters |
| **Matched Paths** | Button: "Test glob patterns" | Input file path, see if it matches |
| **Simulate on PR** | Button: "Simulate on PR" | Select PR, run pack evaluation (dry-run) |

### Validation Rules

1. **Pack ID**: Must be unique within workspace
2. **Scope**: If type='repo', ref must be valid repo format
3. **Rules**: At least one rule required
4. **Obligations**: Each rule must have at least one obligation
5. **Comparator**: Must be valid ComparatorId enum value
6. **Trigger**: Must have at least one trigger condition (or `always: true`)
7. **YAML**: Must parse successfully with Zod schema

---

## VERSIONING & DIFF DISPLAY

### Draft/Publish Workflow

| State | DB Field | UI Display | Actions Available |
|-------|----------|------------|-------------------|
| **Draft** | `packStatus: 'draft'` | Yellow badge "DRAFT" | Edit, Validate, Publish, Delete |
| **Published** | `packStatus: 'published'` | Green badge "PUBLISHED" | View, Clone, Archive |
| **Archived** | `packStatus: 'archived'` | Gray badge "ARCHIVED" | View, Restore |

### Version Fields

| UI Field | DB Path | Type | Notes |
|----------|---------|------|-------|
| **Version** | `version` | integer | Auto-incremented on publish |
| **Version Hash** | `versionHash` | string | SHA-256 of YAML content |
| **Published At** | `publishedAt` | timestamp | When published |
| **Published By** | `publishedBy` | string | User who published |

### Diff View

**Location**: Modal or side-by-side view

**Features**:
- Monaco diff editor
- Left: Published YAML (`trackAConfigYamlPublished`)
- Right: Draft YAML (`trackAConfigYamlDraft`)
- Highlight added/removed/changed lines
- "Publish Changes" button (if user has permission)

**Trigger**:
- Button: "View Changes" (only shown if draft differs from published)
- Auto-show before publish action

---

## WHAT TO CHANGE IN CURRENT UI

### Files to Modify

1. **`apps/web/src/app/policy-packs/new/page.tsx`**
   - Change from 4 steps to 5 steps
   - Add "Owners" field to Step 1
   - Add "Rollout Mode" radio to Step 1
   - Add "Branch Filters" to Step 2

2. **`apps/web/src/app/policy-packs/new/sections/OverviewForm.tsx`**
   - Add `metadata.owner` field
   - Add `metadata.packMode` radio (observe/enforce)
   - Add `metadata.strictness` radio (permissive/balanced/strict)
   - Add derived "Rollout Mode" display

3. **`apps/web/src/app/policy-packs/new/sections/TrackAForm.tsx`**
   - **REPLACE** with `TrackAFormYAML.tsx` (already exists!)
   - Add Template Gallery as primary entry point
   - Add Rule Builder UI (not just YAML editor)
   - Move YAML editor to "Advanced" tab

4. **`apps/web/src/app/policy-packs/new/sections/TrackAFormYAML.tsx`**
   - Already has YAML editor ✅
   - Add Template Gallery component
   - Add Rule Builder component
   - Add side-by-side builder ↔ YAML view
   - Add validation + preview buttons

5. **`apps/web/src/app/policy-packs/new/sections/ApprovalTiersForm.tsx`**
   - Split into two sections: "Approval Tiers" and "Routing"
   - Add GitHub Check configuration fields
   - Add conclusion mapping fields

### New Components to Create

1. **`apps/web/src/components/policyPacks/TemplateGallery.tsx`**
2. **`apps/web/src/components/policyPacks/RuleBuilder.tsx`**
3. **`apps/web/src/components/policyPacks/RuleEditor.tsx`** (modal)
4. **`apps/web/src/components/policyPacks/ComparatorSelector.tsx`**
5. **`apps/web/src/components/policyPacks/TriggerBuilder.tsx`**
6. **`apps/web/src/components/policyPacks/ObligationBuilder.tsx`**
7. **`apps/web/src/components/policyPacks/GlobPatternTester.tsx`**
8. **`apps/web/src/components/policyPacks/PackPreview.tsx`**
9. **`apps/web/src/components/policyPacks/PackDiffViewer.tsx`**

---

## SUMMARY: BUILDER-FIRST APPROACH

### 80% Use Case: Guided Builder

1. **Start**: Template Gallery → Select starter pack
2. **Customize**: Rule Builder → Edit rules, add/remove obligations
3. **Configure**: Scope filters, branch filters, event triggers
4. **Preview**: "Show matched repos", "Simulate on PR"
5. **Publish**: Validate → Diff view → Publish

### 20% Use Case: YAML Power Users

1. **Start**: Click "Advanced YAML Editor"
2. **Edit**: Monaco editor with syntax highlighting
3. **Validate**: Real-time Zod validation
4. **Publish**: Same validation + diff flow

### Key Principle

**Builder and YAML are always in sync**:
- Edit in builder → YAML updates automatically
- Edit in YAML → Builder updates automatically (if valid)
- Invalid YAML → Show error, keep builder state

---

## NEXT STEPS

1. ✅ **UI Field Mapping** - COMPLETE (this document)
2. ⏳ **Create Starter Packs** - Create 5 additional YAML templates
3. ⏳ **Implement UI Components** - Build React components
4. ⏳ **Update Wizard Flow** - Modify existing pages
5. ⏳ **Add Validation** - Implement preview and validation logic
6. ⏳ **Add Versioning** - Implement draft/publish workflow

---
