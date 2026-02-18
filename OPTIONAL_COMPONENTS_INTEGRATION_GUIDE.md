# Optional Components Integration Guide

**Date**: 2026-02-18  
**Status**: ✅ **ALL 3 OPTIONAL COMPONENTS COMPLETE**

---

## 📋 COMPONENTS CREATED

### 1. ✅ **GlobPatternTester** (202 lines)
**File**: `apps/web/src/components/policyPacks/GlobPatternTester.tsx`

**Purpose**: Test glob patterns in real-time against file paths to ensure rules trigger correctly

**Integration Points**:
- ✅ Uses `minimatch` library (same as backend)
- ✅ Uses same options as backend: `{ dot: true }`
- ✅ Matches backend glob logic in `packEvaluator.ts`, `noiseFiltering.ts`, `codeownersParser.ts`

**Key Features**:
- Real-time pattern testing with visual feedback
- Add/remove test file paths
- Add/remove patterns (if not read-only)
- Shows which patterns match each file
- Pattern syntax help with examples
- Green/red visual indicators for matches
- Dark mode support

**Props**:
```typescript
interface GlobPatternTesterProps {
  patterns: string[];              // Array of glob patterns to test
  onPatternsChange?: (patterns: string[]) => void;  // Optional callback for pattern changes
  readOnly?: boolean;              // If true, patterns cannot be modified
}
```

**Usage Example 1: In RuleEditor Modal**
```typescript
// In RuleEditor.tsx - for testing trigger paths
import GlobPatternTester from './GlobPatternTester';

// Inside the Trigger Configuration section
<div className="mt-4">
  <GlobPatternTester
    patterns={editedRule.trigger.anyChangedPaths || []}
    onPatternsChange={(patterns) => setEditedRule({
      ...editedRule,
      trigger: { ...editedRule.trigger, anyChangedPaths: patterns }
    })}
  />
</div>
```

**Usage Example 2: In ScopeForm for Branch Filters**
```typescript
// In ScopeForm.tsx - for testing branch patterns
<GlobPatternTester
  patterns={formData.scopeBranchesInclude || []}
  onPatternsChange={(patterns) => setFormData({
    ...formData,
    scopeBranchesInclude: patterns
  })}
  readOnly={false}
/>
```

**Usage Example 3: Read-Only Preview**
```typescript
// Show patterns without allowing edits
<GlobPatternTester
  patterns={rule.excludePaths || []}
  readOnly={true}
/>
```

---

### 2. ✅ **PackPreview** (316 lines)
**File**: `apps/web/src/components/policyPacks/PackPreview.tsx`

**Purpose**: Preview and validate policy pack YAML before publishing

**Integration Points**:
- ✅ Uses existing `/api/workspaces/:workspaceId/policy-packs/:id/validate` endpoint
- ✅ Uses `js-yaml` library for local parsing (same as backend)
- ✅ Integrates with existing `validatePackYAML()` function
- ✅ Shows pack hash from `computePackHashFull()`

**Key Features**:
- Real-time YAML validation with backend
- Visual validation status (green/red)
- Pack metadata display (name, version, mode, strictness, hash)
- Scope configuration display
- Rules summary (total, enabled, disabled)
- Evaluation settings display
- Detailed rules list with obligations count
- Loading states and error handling
- Dark mode support

**Props**:
```typescript
interface PackPreviewProps {
  yamlContent: string;             // YAML content to preview
  workspaceId: string;             // Workspace ID for API calls
  onValidate?: (isValid: boolean) => void;  // Optional callback when validation completes
}
```

**Usage Example 1: In TrackAFormYAML - YAML Tab**
```typescript
// In TrackAFormYAML.tsx - add preview tab
import PackPreview from '@/components/policyPacks/PackPreview';

const [activeTab, setActiveTab] = useState<'templates' | 'builder' | 'yaml' | 'preview'>('templates');

{/* Preview Tab */}
{activeTab === 'preview' && (
  <div className="space-y-4">
    <PackPreview
      yamlContent={yamlContent}
      workspaceId={workspaceId}
      onValidate={(isValid) => {
        // Update form validation state
        setIsValid(isValid);
      }}
    />
  </div>
)}
```

**Usage Example 2: Before Publishing**
```typescript
// In publish confirmation modal
<div className="mb-4">
  <h3 className="text-lg font-medium mb-2">Pack Preview</h3>
  <PackPreview
    yamlContent={formData.trackAConfigYamlDraft}
    workspaceId={workspaceId}
  />
</div>
```

**Usage Example 3: In Template Gallery Preview**
```typescript
// Show template preview before selection
<PackPreview
  yamlContent={templateYaml}
  workspaceId={workspaceId}
/>
```

---

### 3. ✅ **PackDiffViewer** (366 lines)
**File**: `apps/web/src/components/policyPacks/PackDiffViewer.tsx`

**Purpose**: Compare two policy pack versions to see what changed

**Integration Points**:
- ✅ Uses `js-yaml` library for parsing (same as backend)
- ✅ Follows same versioning pattern as `versioning.ts` (plans)
- ✅ Compatible with pack hash comparison logic
- ✅ Matches audit trail change tracking pattern

**Key Features**:
- Side-by-side comparison of two YAML versions
- Detects added, removed, and modified changes
- Compares metadata (name, version, packMode, strictness)
- Compares scope (type, ref, branches)
- Compares rules (added, removed, modified, enabled/disabled)
- Compares evaluation settings
- Visual change indicators (green/red/blue)
- Change statistics summary
- Shows before/after values for modifications
- Dark mode support

**Props**:
```typescript
interface PackDiffViewerProps {
  leftYaml: string;                // Previous version YAML
  rightYaml: string;               // Current version YAML
  leftLabel?: string;              // Label for left side (default: "Previous Version")
  rightLabel?: string;             // Label for right side (default: "Current Version")
}
```

**Usage Example 1: Compare Draft vs Published**
```typescript
// In policy pack edit page
import PackDiffViewer from '@/components/policyPacks/PackDiffViewer';

<PackDiffViewer
  leftYaml={pack.trackAConfigYamlPublished || ''}
  rightYaml={pack.trackAConfigYamlDraft || ''}
  leftLabel="Published Version"
  rightLabel="Draft Version"
/>
```

**Usage Example 2: Version History Comparison**
```typescript
// Compare two historical versions
<PackDiffViewer
  leftYaml={version1.yaml}
  rightYaml={version2.yaml}
  leftLabel={`v${version1.metadata.version}`}
  rightLabel={`v${version2.metadata.version}`}
/>
```

**Usage Example 3: Before Publishing Confirmation**
```typescript
// Show changes before publishing
<div className="mb-6">
  <h3 className="text-lg font-medium mb-4">Review Changes</h3>
  <PackDiffViewer
    leftYaml={currentPublishedYaml}
    rightYaml={draftYaml}
    leftLabel="Current Published"
    rightLabel="New Version"
  />
</div>
```

---

## 🔗 INTEGRATION RECOMMENDATIONS

### **Recommended Integration Points**

#### 1. **GlobPatternTester**

**Where to integrate**:
- ✅ **RuleEditor Modal** - Test trigger paths and exclude paths
- ✅ **ScopeForm** - Test branch include/exclude patterns
- ✅ **Workspace Defaults Editor** - Test path patterns

**How to integrate**:
```typescript
// Add as collapsible section in RuleEditor
<details className="mt-4">
  <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
    Test Patterns
  </summary>
  <div className="mt-3">
    <GlobPatternTester
      patterns={editedRule.trigger.anyChangedPaths || []}
      onPatternsChange={(patterns) => setEditedRule({
        ...editedRule,
        trigger: { ...editedRule.trigger, anyChangedPaths: patterns }
      })}
    />
  </div>
</details>
```

#### 2. **PackPreview**

**Where to integrate**:
- ✅ **TrackAFormYAML** - Add "Preview" tab alongside Templates/Builder/YAML
- ✅ **Publish Confirmation Modal** - Show preview before publishing
- ✅ **Template Gallery** - Preview templates before selection

**How to integrate**:
```typescript
// Add preview tab to TrackAFormYAML
const tabs = ['templates', 'builder', 'yaml', 'preview'];

{activeTab === 'preview' && (
  <PackPreview
    yamlContent={yamlContent}
    workspaceId={workspaceId}
    onValidate={setIsValid}
  />
)}
```

#### 3. **PackDiffViewer**

**Where to integrate**:
- ✅ **Policy Pack Edit Page** - Compare draft vs published
- ✅ **Publish Confirmation Modal** - Review changes before publishing
- ✅ **Version History Page** - Compare any two versions
- ✅ **Audit Trail** - Show what changed in each version

**How to integrate**:
```typescript
// Add to publish confirmation modal
<Modal isOpen={showPublishModal}>
  <h2>Publish Policy Pack</h2>
  <p>Review the changes before publishing:</p>
  <PackDiffViewer
    leftYaml={pack.trackAConfigYamlPublished || ''}
    rightYaml={pack.trackAConfigYamlDraft || ''}
  />
  <button onClick={handlePublish}>Publish</button>
</Modal>
```

---

## 📊 INTEGRATION STATUS

| Component | Status | Lines | Integration Points | Recommended Usage |
|-----------|--------|-------|-------------------|-------------------|
| **GlobPatternTester** | ✅ COMPLETE | 202 | RuleEditor, ScopeForm | Test patterns in real-time |
| **PackPreview** | ✅ COMPLETE | 316 | TrackAFormYAML, Publish Modal | Validate before publishing |
| **PackDiffViewer** | ✅ COMPLETE | 366 | Edit Page, Version History | Compare versions |

---

## 🎯 NEXT STEPS

### **Immediate Integration Tasks**

1. **Add Preview Tab to TrackAFormYAML**
   - Modify `TrackAFormYAML.tsx` to add 4th tab: "Preview"
   - Integrate PackPreview component
   - Wire up validation callback

2. **Add GlobPatternTester to RuleEditor**
   - Add collapsible section in Trigger Configuration
   - Add collapsible section in Exclude Paths
   - Wire up pattern changes

3. **Add PackDiffViewer to Publish Flow**
   - Create publish confirmation modal
   - Show diff before publishing
   - Add "Review Changes" step

### **Optional Enhancements**

1. **GlobPatternTester**
   - Add "Import from PR" button to load actual PR file paths
   - Add pattern suggestions based on common patterns
   - Add pattern validation (invalid regex detection)

2. **PackPreview**
   - Add "Test on PR" button to run dry-run evaluation
   - Add comparator version display
   - Add artifact definitions preview

3. **PackDiffViewer**
   - Add line-by-line YAML diff view
   - Add "Revert Change" button for individual changes
   - Add export diff as markdown

---

## ✅ VERIFICATION CHECKLIST

- [x] All components use existing backend patterns
- [x] All components use same libraries as backend (minimatch, js-yaml)
- [x] All components integrate with existing API endpoints
- [x] All components support dark mode
- [x] All components have TypeScript interfaces
- [x] All components handle loading and error states
- [x] All components are responsive
- [x] No duplicate code or logic
- [x] No new dependencies added

**Status**: ✅ **READY FOR INTEGRATION**

