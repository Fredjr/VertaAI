# Phase 4: Tier 1 Comparators - Architectural Review

**Date:** 2026-02-15  
**Phase:** Week 8, Days 4-5  
**Status:** 🏗️ **IN PROGRESS**  

---

## 🎯 Objectives

Implement **3 Tier 1 Comparators** for production-grade API contract validation:

1. **`openapi.validate`** - Validate OpenAPI spec structure + detect breaking changes
2. **`openapi.diff`** - Compare two OpenAPI specs, identify all changes (breaking + non-breaking)
3. **`openapi.version_bump`** - Ensure version follows semver rules based on detected changes

---

## 📋 Review of Existing Architecture

### What We Have (Phases 1-3)

✅ **Phase 1: Comparator Registry**
- Plugin architecture with auto-registration
- `getComparatorRegistry()` singleton
- `canHandle()` for dynamic lookup
- 17 tests passing

✅ **Phase 2: Tier 0 Comparators**
- 4 comparators: `docs.required_sections`, `docs.anchor_check`, `obligation.file_present`, `obligation.file_changed`
- Markdown extractor layer (`markdownExtractor.ts`)
- All auto-registered
- 26 tests passing

✅ **Phase 3: YAML Config Support**
- Zod schema validation
- YAML loader with GitHub integration
- Org→repo→pack hierarchy
- Hybrid resolver (YAML + database)

### Existing OpenAPI Infrastructure

✅ **`OpenApiComparator`** (`openapi.ts` - 422 lines)
- **Type:** `openapi_docs_endpoint_parity`
- **Purpose:** Compare OpenAPI spec against documentation
- **Checks:** Endpoint parity, schema parity, example parity
- **Data Structures:**
  - `OpenApiEndpoint` - method, path, parameters, responses, deprecated
  - `OpenApiSchema` - name, type, properties, required
  - `OpenApiExample` - endpoint, example, description
  - `OpenApiData` - endpoints[], schemas[], examples[]

✅ **`BaseComparator`** (`base.ts` - 404 lines)
- Template Method pattern
- `compare()` orchestrates workflow
- `extractData()` - abstract method for data extraction
- `performComparison()` - abstract method for comparison logic
- `createFinding()` - helper to create IntegrityFinding with confidence/impact/band
- `calculateConfidence()` - based on evidence quality (exact: 0.2, fuzzy: 0.1, inferred: 0.05)
- `calculateImpact()` - based on severity + evidence count + breaking changes
- `determineBand()` - fail/warn/pass based on confidence + impact + severity
- `determineRecommendedAction()` - block_merge/create_patch_candidate/notify/no_action

---

## 🏗️ Phase 4 Architecture

### Design Principles (Track A Requirements)

1. **Deterministic:** No LLM calls, pure comparison logic
2. **Fast:** Complete in < 5 seconds per comparator
3. **Stateless:** No side effects, easy to test
4. **Reusable:** Leverage existing `OpenApiData` structures
5. **Auto-registered:** Register with comparator registry on import

### Comparator Breakdown

#### 1. `openapi.validate` - OpenAPI Spec Validation + Breaking Change Detection

**Purpose:** Validate OpenAPI spec structure and detect breaking changes

**Input:** Two OpenAPI snapshots (left = baseline, right = current)

**Checks:**
- ✅ Valid OpenAPI structure (version, paths, components)
- ✅ Breaking changes:
  - Removed endpoints
  - Removed required parameters
  - Changed parameter types (incompatible)
  - Removed response fields
  - Changed response types (incompatible)
  - Removed schemas
  - Changed required fields in schemas

**Output:** IntegrityFindings with severity based on change type

**Severity Mapping:**
- `critical`: Removed endpoints, removed required parameters
- `high`: Changed parameter types, removed response fields
- `medium`: Changed response types, removed schemas
- `low`: Non-breaking changes

---

#### 2. `openapi.diff` - OpenAPI Spec Diff

**Purpose:** Compare two OpenAPI specs and identify ALL changes (breaking + non-breaking)

**Input:** Two OpenAPI snapshots (left = baseline, right = current)

**Checks:**
- ✅ Added endpoints
- ✅ Removed endpoints
- ✅ Modified endpoints (parameters, responses)
- ✅ Added schemas
- ✅ Removed schemas
- ✅ Modified schemas (properties, required fields)
- ✅ Version changes

**Output:** IntegrityFindings categorized by change type

**Evidence Kinds:**
- `endpoint_added`, `endpoint_removed`, `endpoint_modified`
- `parameter_added`, `parameter_removed`, `parameter_type_changed`
- `response_added`, `response_removed`, `response_schema_changed`
- `schema_added`, `schema_removed`, `schema_property_added`, `schema_property_removed`

---

#### 3. `openapi.version_bump` - Semver Validation

**Purpose:** Ensure version follows semver rules based on detected changes

**Input:** Two OpenAPI snapshots (left = baseline, right = current)

**Logic:**
1. Extract versions from both specs
2. Parse semver (major.minor.patch)
3. Detect changes using `openapi.diff` logic
4. Determine required version bump:
   - **Breaking changes** → major bump required
   - **New features (non-breaking)** → minor bump required
   - **Bug fixes only** → patch bump required
5. Validate actual version bump matches requirements

**Output:** IntegrityFinding if version bump is incorrect

**Severity:**
- `critical`: Breaking change but no major bump
- `high`: New feature but no minor bump
- `medium`: Patch bump when minor/major required

---

## 📊 Implementation Plan

### Step 1: Create Breaking Change Detector (Shared Logic)

**File:** `apps/api/src/services/contracts/comparators/openapiBreakingChanges.ts`

**Purpose:** Shared logic for detecting breaking changes in OpenAPI specs

**Exports:**
- `detectBreakingChanges(left: OpenApiData, right: OpenApiData): BreakingChange[]`
- `detectNonBreakingChanges(left: OpenApiData, right: OpenApiData): NonBreakingChange[]`
- `categorizeChange(change: Change): 'breaking' | 'non-breaking'`

### Step 2: Create Semver Utility

**File:** `apps/api/src/services/contracts/comparators/semverUtils.ts`

**Purpose:** Semver parsing and validation

**Exports:**
- `parseSemver(version: string): { major: number; minor: number; patch: number } | null`
- `compareSemver(v1: Semver, v2: Semver): 'major' | 'minor' | 'patch' | 'none'`
- `determineRequiredBump(changes: Change[]): 'major' | 'minor' | 'patch' | 'none'`

### Step 3: Implement `openapi.validate`

**File:** `apps/api/src/services/contracts/comparators/openapiValidate.ts`

**Extends:** `BaseComparator`

**Methods:**
- `canCompare()` - Check if both snapshots are OpenAPI
- `extractData()` - Extract OpenApiData from snapshot
- `performComparison()` - Validate structure + detect breaking changes

### Step 4: Implement `openapi.diff`

**File:** `apps/api/src/services/contracts/comparators/openapiDiff.ts`

**Extends:** `BaseComparator`

**Methods:**
- `canCompare()` - Check if both snapshots are OpenAPI
- `extractData()` - Extract OpenApiData from snapshot
- `performComparison()` - Detect all changes (breaking + non-breaking)

### Step 5: Implement `openapi.version_bump`

**File:** `apps/api/src/services/contracts/comparators/openapiVersionBump.ts`

**Extends:** `BaseComparator`

**Methods:**
- `canCompare()` - Check if both snapshots are OpenAPI
- `extractData()` - Extract OpenApiData + version from snapshot
- `performComparison()` - Validate version bump matches changes

### Step 6: Create Tests

**Files:**
- `apps/api/src/__tests__/services/contracts/comparators/openapiValidate.test.ts`
- `apps/api/src/__tests__/services/contracts/comparators/openapiDiff.test.ts`
- `apps/api/src/__tests__/services/contracts/comparators/openapiVersionBump.test.ts`

---

## 🎯 Success Criteria

✅ All 3 comparators implemented and auto-registered  
✅ Breaking change detection working correctly  
✅ Semver validation accurate  
✅ All tests passing (target: 40+ tests)  
✅ Zero regressions in existing tests  
✅ Documentation complete  

---

**Ready to implement!** 🚀

