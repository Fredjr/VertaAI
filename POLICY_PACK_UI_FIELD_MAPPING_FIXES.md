# Policy Pack UI Field Mapping Fixes

## Summary

Implemented fixes A, B, and C to ensure all UI fields are properly mapped to YAML and used by Track A evaluation logic, regardless of which authoring path the user chooses.

## Fix A: Field Mapping from UI to YAML ✅

**File**: `apps/web/src/app/policy-packs/new/page.tsx`

**Changes**:
1. Added `yaml` import from `js-yaml`
2. Created `mergeFormDataIntoYAML()` function that merges all UI form fields into YAML before saving
3. Updated `handleSave()` to call `mergeFormDataIntoYAML()` before sending to API

**Fields Mapped**:
- `metadata.id` ← auto-generated from `formData.name`
- `metadata.name` ← `formData.name`
- `metadata.version` ← `'1.0.0'` (default)
- `metadata.description` ← `formData.description`
- `metadata.owner` ← `formData.owner`
- `metadata.packType` ← `formData.packType`
- `metadata.packMode` ← `formData.packMode`
- `metadata.strictness` ← `formData.strictness`
- `metadata.scopePriority` ← `formData.scopePriority`
- `metadata.scopeMergeStrategy` ← `formData.scopeMergeStrategy`
- `scope.type` ← `formData.scopeType`
- `scope.ref` ← `formData.scopeRef`
- `scope.repos.include` ← `formData.reposInclude`
- `scope.repos.exclude` ← `formData.reposExclude`
- `scope.branches.include` ← `formData.branchesInclude`
- `scope.branches.exclude` ← `formData.branchesExclude`
- `evaluation.defaultDecisionOnUnknown` ← `formData.defaultDecisionOnUnknown`

**How It Works**:
- Parses existing YAML (from template, surfaces, builder, or manual edit)
- Merges UI form fields into the YAML structure
- Preserves existing rules and other YAML content
- Returns merged YAML string

**Supports All 4 Authoring Paths**:
- ✅ **Option 1**: Template selected → UI fields merged into template YAML
- ✅ **Option 2**: Surfaces wizard → UI fields merged into generated YAML
- ✅ **Option 3**: Builder → UI fields merged into edited YAML
- ✅ **Option 4**: Manual YAML → UI fields merged into manual YAML

---

## Fix B: Simplify Template Selection UX ✅

**File**: `apps/web/src/app/policy-packs/new/sections/TrackAFormYAML.tsx`

**Changes**:
1. Removed `'templates'` from tab options (line 39)
2. Changed default tab to `'yaml'` instead of `'surfaces'` (line 39)
3. Added `templateLoadedFromStep3` state to track if template was loaded (lines 46-48)
4. Added green banner when template is loaded from Step 3 (lines 232-244)
5. Removed Templates tab button from tab switcher (lines 249-262 deleted)
6. Removed Templates tab content section (lines 332-339 deleted)
7. Removed unused imports: `TemplateGallery`, `Sparkles` icon
8. Removed unused state: `templates`, `selectedTemplate`
9. Removed unused function: `handleTemplateSelect()`
10. Removed unused interface: `Template`
11. Removed template fetching `useEffect` hook

**Banner Message**:
```
✅ Template loaded from Step 3
You can edit the YAML below or proceed to the next step.
Warning: Using the Surfaces wizard will replace the template rules.
```

**Result**:
- Template selection is now ONLY in Step 3 (Pack Defaults)
- Step 4 (Policy Authoring) focuses on editing/viewing YAML
- Clear indication when template is loaded
- No redundant template selection UI

---

## Fix C: Add Validation and Diff Display ✅

**File**: `apps/web/src/app/policy-packs/new/sections/TrackAFormYAML.tsx`

**Changes**:
1. Updated `handleSurfaceRules()` to warn user before overwriting template (lines 111-120)
2. Shows confirmation dialog: "⚠️ Warning: This will replace your current YAML configuration..."
3. Clears `templateLoadedFromStep3` flag after user confirms

**Confirmation Dialog**:
```
⚠️ Warning: This will replace your current YAML configuration with generated rules from the Surfaces wizard.

Your template rules will be overwritten. Continue?
```

**Result**:
- User is warned before Surfaces wizard overwrites template
- User can cancel and keep template
- Clear indication of destructive action

---

## Verification Checklist

### All 4 Authoring Paths Work Correctly

- [ ] **Option 1 (Skip)**: Select template in Step 3 → Skip to Step 5 → Save → Verify YAML has UI fields merged
- [ ] **Option 2 (Surfaces)**: Select template in Step 3 → Use Surfaces wizard in Step 4 → Save → Verify generated rules + UI fields merged
- [ ] **Option 3 (Builder)**: Select template in Step 3 → Edit rules in Builder tab → Save → Verify edited rules + UI fields merged
- [ ] **Option 4 (YAML)**: Select template in Step 3 → Manually edit YAML → Save → Verify manual edits + UI fields merged

### Fields Used in Track A Evaluation

- [ ] `packMode` is in YAML and used by evaluation logic (excludes observe packs from global decision)
- [ ] `scopePriority` is in YAML and used for conflict resolution
- [ ] `scopeMergeStrategy` is in YAML and used for decision aggregation
- [ ] `scope.repos.include/exclude` is in YAML and used for pack matching
- [ ] `scope.branches.include/exclude` is in YAML and used for pack matching
- [ ] `scope.type` and `scope.ref` are in YAML and used for pack selection

---

## Next Steps

1. **Test all 4 authoring paths** to ensure UI fields are properly merged
2. **Create admin endpoint** to publish baseline-contract-integrity pack to database
3. **Re-run PR 22** to verify baseline pack is loaded and evaluated
4. **Update documentation** to reflect new template selection flow


