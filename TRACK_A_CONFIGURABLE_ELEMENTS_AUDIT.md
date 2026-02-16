# Track A Configurable Elements - Complete Audit

**Date:** 2026-02-16  
**Purpose:** Ensure ALL configurable elements are surfaced in the UI before implementing P2 Unified WorkspacePolicyPack

---

## 📋 **Configurable Elements Inventory**

### **1. ContractPack Model** (`apps/api/prisma/schema.prisma:526-547`)

| Field | Type | Current UI | Status | Notes |
|-------|------|-----------|--------|-------|
| `name` | String | ✅ Step 1 | COMPLETE | Basic info |
| `description` | String? | ✅ Step 1 | COMPLETE | Basic info |
| `version` | String | ✅ Step 1 | COMPLETE | Basic info |
| `contracts` | Json | ⚠️ Partial | **INCOMPLETE** | Only comparators shown, missing full contract structure |
| `dictionaries` | Json | ❌ Missing | **MISSING** | Service aliases, glossary |
| `extraction` | Json | ❌ Missing | **MISSING** | Token limits, truncation |
| `safety` | Json | ❌ Missing | **MISSING** | Secret patterns, immutable sections |

### **2. Contract JSON Structure** (`apps/api/src/services/contracts/types.ts:71-85`)

| Field | Type | Current UI | Status | Notes |
|-------|------|-----------|--------|-------|
| `contractId` | string | ❌ Missing | **MISSING** | Auto-generated, should be editable |
| `name` | string | ❌ Missing | **MISSING** | Contract name |
| `description` | string? | ❌ Missing | **MISSING** | Contract description |
| `scope.service` | string? | ⚠️ Partial | **INCOMPLETE** | Only scopeType shown, not per-contract scope |
| `scope.repo` | string? | ⚠️ Partial | **INCOMPLETE** | Only scopeType shown, not per-contract scope |
| `scope.tags` | string[]? | ❌ Missing | **MISSING** | Contract tags |
| `artifacts` | ArtifactRef[] | ❌ Missing | **MISSING** | Required artifacts |
| `invariants` | Invariant[] | ⚠️ Partial | **INCOMPLETE** | Only comparatorType shown, missing full invariant config |
| `enforcement.mode` | string | ✅ Step 2 | COMPLETE | pr_gate, async_notify, both |
| `enforcement.blockOnFail` | boolean | ⚠️ Partial | **INCOMPLETE** | Derived from enforcementMode, not explicit |
| `enforcement.warnOnWarn` | boolean | ❌ Missing | **MISSING** | Warn on warn-level findings |
| `enforcement.requireApprovalOverride` | boolean | ❌ Missing | **MISSING** | Require approval to override blocks |
| `routing.method` | string | ❌ Missing | **MISSING** | contract, codeowners, service_owner, fallback |
| `routing.fallbackChannel` | string? | ❌ Missing | **MISSING** | Slack channel for fallback |
| `writeback.enabled` | boolean | ❌ Missing | **MISSING** | Enable writeback |
| `writeback.autoApproveThreshold` | number? | ❌ Missing | **MISSING** | Auto-approve threshold |
| `writeback.requiresApproval` | boolean | ❌ Missing | **MISSING** | Requires approval |
| `writeback.targetArtifacts` | ArtifactType[] | ❌ Missing | **MISSING** | Target artifacts for writeback |

### **3. ArtifactRef Structure** (`apps/api/src/services/contracts/types.ts:26-40`)

| Field | Type | Current UI | Status | Notes |
|-------|------|-----------|--------|-------|
| `system` | ArtifactSystem | ❌ Missing | **MISSING** | github, confluence, notion, grafana, datadog |
| `type` | ArtifactType | ❌ Missing | **MISSING** | openapi, terraform, readme, confluence_page, etc. |
| `locator.repo` | string? | ❌ Missing | **MISSING** | Repository |
| `locator.path` | string? | ❌ Missing | **MISSING** | File path |
| `locator.ref` | string? | ❌ Missing | **MISSING** | Git ref |
| `locator.pageId` | string? | ❌ Missing | **MISSING** | Confluence page ID |
| `locator.dashboardUid` | string? | ❌ Missing | **MISSING** | Grafana dashboard UID |
| `locator.url` | string? | ❌ Missing | **MISSING** | Direct URL |
| `role` | ArtifactRole | ❌ Missing | **MISSING** | primary, secondary, reference |
| `required` | boolean | ❌ Missing | **MISSING** | Is artifact required? |
| `freshnessSlaHours` | number? | ❌ Missing | **MISSING** | Freshness SLA |

### **4. Invariant Structure** (`apps/api/src/services/contracts/types.ts:42-50`)

| Field | Type | Current UI | Status | Notes |
|-------|------|-----------|--------|-------|
| `invariantId` | string | ❌ Missing | **MISSING** | Auto-generated, should be editable |
| `name` | string | ❌ Missing | **MISSING** | Invariant name |
| `description` | string? | ❌ Missing | **MISSING** | Invariant description |
| `enabled` | boolean | ⚠️ Partial | **INCOMPLETE** | Comparator enabled checkbox exists |
| `severity` | string | ✅ Step 3 | COMPLETE | Severity dropdown |
| `comparatorType` | string | ✅ Step 3 | COMPLETE | Comparator type selection |
| `config` | Record<string, any>? | ❌ Missing | **MISSING** | Per-comparator configuration |

### **5. ContractPolicy Model** (`apps/api/prisma/schema.prisma:551-597`)

| Field | Type | Current UI | Status | Notes |
|-------|------|-----------|--------|-------|
| `name` | String | ❌ Missing | **MISSING** | Policy name |
| `description` | String? | ❌ Missing | **MISSING** | Policy description |
| `mode` | String | ✅ Step 2 | COMPLETE | warn_only, block_high_critical, block_all_critical |
| `criticalThreshold` | Int | ❌ Missing | **MISSING** | Critical threshold (0-100) |
| `highThreshold` | Int | ❌ Missing | **MISSING** | High threshold (0-100) |
| `mediumThreshold` | Int | ❌ Missing | **MISSING** | Medium threshold (0-100) |
| `gracefulDegradation` | Json | ❌ Missing | **MISSING** | Timeout, fallback mode |
| `appliesTo` | Json | ❌ Missing | **MISSING** | Surface/repo/service filters |
| `active` | Boolean | ❌ Missing | **MISSING** | Active status |

### **6. Scope Configuration** (P1 Implementation)

| Field | Type | Current UI | Status | Notes |
|-------|------|-----------|--------|-------|
| `scopeType` | string | ✅ Step 4 | COMPLETE | workspace, service, repo |
| `scopeRef` | string? | ✅ Step 4 | COMPLETE | Service ID or repo name |
| `repoAllowlist` | string[] | ✅ Step 4 | COMPLETE | Repo allowlist |
| `pathGlobs` | string[] | ✅ Step 4 | COMPLETE | Path globs |

---

## 📊 **Summary**

### **Coverage Statistics**

| Category | Total Fields | Implemented | Partial | Missing |
|----------|-------------|-------------|---------|---------|
| ContractPack Model | 7 | 3 (43%) | 1 (14%) | 3 (43%) |
| Contract Structure | 18 | 1 (6%) | 3 (17%) | 14 (78%) |
| ArtifactRef Structure | 11 | 0 (0%) | 0 (0%) | 11 (100%) |
| Invariant Structure | 7 | 2 (29%) | 1 (14%) | 4 (57%) |
| ContractPolicy Model | 9 | 1 (11%) | 0 (0%) | 8 (89%) |
| Scope Configuration | 4 | 4 (100%) | 0 (0%) | 0 (0%) |
| **TOTAL** | **56** | **11 (20%)** | **5 (9%)** | **40 (71%)** |

### **Critical Missing Elements**

1. **Artifacts Configuration** (11 fields) - 100% missing
2. **Contract Structure** (14 fields) - 78% missing
3. **ContractPolicy Thresholds** (8 fields) - 89% missing
4. **Dictionaries, Extraction, Safety** (3 fields) - 100% missing

---

## ✅ **Recommendation**

**For P2 Unified WorkspacePolicyPack**, we should:

1. **Include ALL configurable elements** in the unified `trackAConfig` JSON structure
2. **Build comprehensive UI** with proper form controls for each element
3. **Provide sensible defaults** for complex configurations
4. **Add validation** for required fields and relationships

This will ensure users have full control over Track A configuration without needing to edit JSON manually.

---

## 📝 **Implementation Progress**

### **Week 7: Backend Foundation** (IN PROGRESS)

#### **Day 1-2: Schema Design & Migration** ✅ COMPLETE

**Completed:**
1. ✅ Created `WorkspacePolicyPack` Prisma schema (lines 554-641 in `apps/api/prisma/schema.prisma`)
2. ✅ Added relation to `Workspace` model (line 68: `policyPacks WorkspacePolicyPack[]`)
3. ✅ Fixed failed migration `20260210140000_gap6_part2_control_plane_fields` with conditional table checks
4. ✅ Created migration `20260216085556_create_workspace_policy_pack`
5. ✅ Applied migration successfully to database

**Schema Highlights:**
- **Shared Scope**: `scopeType`, `scopeRef`, `repoAllowlist`, `pathGlobs`
- **Track A Config**: JSON blob containing ALL 56 configurable elements
  - `surfaces`, `contracts`, `dictionaries`, `extraction`, `safety`
  - `enforcement`, `gracefulDegradation`, `appliesTo`
- **Track B Config**: JSON blob containing drift remediation settings
  - `primaryDoc`, `inputSources`, `driftTypes`, `materiality`
  - `docTargeting`, `noiseControls`, `allowedOutputs`
- **Shared Approval Tiers**: `tier1`, `tier2`, `tier3` with users/teams
- **Shared Routing**: Slack, email, PagerDuty
- **Test Mode**: Dry-run configuration
- **Versioning**: `version`, `versionHash`, `parentId` for audit trail

**Next Steps:**
- Day 3-4: Data migration scripts (ContractPack → WorkspacePolicyPack, DriftPlan → WorkspacePolicyPack)
- Day 5: API endpoints for CRUD operations

#### **Day 3-4: Data Migration Scripts** ✅ COMPLETE

**Completed:**
1. ✅ Created `migrate-contract-packs.ts` (260 lines)
   - Transforms ContractPack → WorkspacePolicyPack with trackAEnabled
   - Preserves ALL 56 configurable elements in trackAConfig JSON
   - Generates version hash for audit trail
   - Supports dry-run mode and workspace filtering
   - Usage: `npm run migrate:contract-packs [--dry-run] [--workspace=<id>]`

2. ✅ Created `migrate-drift-plans.ts` (257 lines)
   - Transforms DriftPlan → WorkspacePolicyPack with trackBEnabled
   - Preserves all drift remediation configuration
   - Maintains scope, versioning, and metadata
   - Supports dry-run mode and workspace filtering
   - Usage: `npm run migrate:drift-plans [--dry-run] [--workspace=<id>]`

3. ✅ Created `rollback-policy-packs.ts` (203 lines)
   - Emergency rollback: WorkspacePolicyPack → ContractPack/DriftPlan
   - Detects track type and rolls back appropriately
   - Preserves all original configuration
   - Supports dry-run mode and workspace filtering
   - Usage: `npm run rollback:policy-packs [--dry-run] [--workspace=<id>]`

4. ✅ Added npm scripts to `package.json`
   - `migrate:contract-packs` - Run ContractPack migration
   - `migrate:drift-plans` - Run DriftPlan migration
   - `rollback:policy-packs` - Emergency rollback

**Migration Features:**
- **Dry-run mode**: Test migrations without making changes
- **Workspace filtering**: Migrate specific workspaces only
- **Version hashing**: SHA-256 hash for change detection
- **Comprehensive logging**: Success/error counts and summaries
- **Type-safe**: Full TypeScript compilation with Prisma types

**Next Steps:**
- Day 5: API endpoints for CRUD operations

#### **Day 5: API Endpoints** ✅ COMPLETE

**Completed:**
1. ✅ Created `apps/api/src/routes/policyPacks.ts` (405 lines)
   - Comprehensive CRUD endpoints for WorkspacePolicyPack
   - Zod validation schemas for Track A and Track B configs
   - Version hash generation (SHA-256)
   - Soft delete support (archive vs hard delete)
   - Test mode endpoint for dry-run execution

2. ✅ Validation Schemas
   - **TrackAConfigSchema**: Validates ALL 56 configurable elements
     * Surfaces (6 types)
     * Contracts (18 fields per contract)
     * Artifacts (11 fields each)
     * Invariants (7 fields each)
     * Enforcement, Routing, Writeback
     * Dictionaries, Extraction, Safety
     * ContractPolicy thresholds
   - **TrackBConfigSchema**: Validates all drift remediation config
     * Primary doc (5 fields)
     * Input sources (5 types)
     * Drift types (5 types)
     * Materiality thresholds (4 levels)
     * Doc targeting, noise controls, budgets

3. ✅ API Endpoints Implemented
   - `GET /api/workspaces/:workspaceId/policy-packs` - List all policy packs
   - `GET /api/workspaces/:workspaceId/policy-packs/:id` - Get specific policy pack
   - `POST /api/workspaces/:workspaceId/policy-packs` - Create new policy pack
   - `PUT /api/workspaces/:workspaceId/policy-packs/:id` - Update policy pack (creates new version)
   - `DELETE /api/workspaces/:workspaceId/policy-packs/:id` - Delete policy pack (soft delete)
   - `POST /api/workspaces/:workspaceId/policy-packs/:id/test` - Test mode (dry-run)

4. ✅ Features
   - Query filtering (status, trackAEnabled, trackBEnabled)
   - Automatic version incrementing on updates
   - Version hash generation for change detection
   - User tracking (createdBy, updatedBy via x-user-id header)
   - Soft delete (status='archived') vs hard delete
   - Test mode for dry-run execution

5. ✅ Registered routes in `apps/api/src/index.ts`
   - Imported policyPacksRouter
   - Registered at `/api` prefix

**Next Steps:**
- Week 8: Backend Integration & Backward Compatibility
- Week 9: Frontend - Unified Configuration UI
- Week 10: Migration, Testing & Deployment


