# P2: Unified WorkspacePolicyPack - Architectural Plan

**Date:** 2026-02-16  
**Phase:** P2 (Week 7-10)  
**Status:** 🏗️ PLANNING

---

## 🎯 Executive Summary

### The Problem
We currently have **two separate configuration systems**:
- **ContractPack** (Track A) - Contract integrity gate configuration
- **DriftPlan** (Track B) - Drift remediation configuration

This creates:
- ❌ **Duplicate fields** (scope, enforcement, approval)
- ❌ **Inconsistent UX** (two separate UIs)
- ❌ **Cognitive overhead** (users must understand both systems)
- ❌ **No shared approval tiers** (can't reuse approval groups)

### The Solution
Create a **unified WorkspacePolicyPack** that:
- ✅ **Single configuration model** for both Track A and Track B
- ✅ **Shared approval tiers** and routing configuration
- ✅ **Consistent scope definition** (workspace/service/repo)
- ✅ **Test mode (dry-run)** for both tracks
- ✅ **Unified UI** with tabbed interface

### Success Criteria
1. Users can configure both Track A and Track B in one place
2. Approval tiers are shared across both tracks
3. Test mode allows previewing findings without enforcement
4. Migration from existing ContractPack + DriftPlan is seamless
5. Backward compatibility maintained during transition

---

## 📊 Current State Analysis

### Existing Models

#### ContractPack (Track A)
```prisma
model ContractPack {
  workspaceId String
  id          String @default(uuid())
  version     String @default("v1")
  name        String
  description String?
  
  contracts    Json @default("[]")  // Array<Contract>
  dictionaries Json @default("{}")
  extraction   Json @default("{}")
  safety       Json @default("{}")
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Key Fields**:
- `contracts`: Array of contract definitions with comparators, enforcement, artifacts
- No scope configuration (missing repo allowlist, path globs)
- No approval tier mapping
- No test mode

#### DriftPlan (Track B)
```prisma
model DriftPlan {
  workspaceId String
  id          String @default(uuid())
  
  name        String
  description String?
  status      String @default("active")
  
  scopeType String  // 'workspace', 'service', 'repo'
  scopeRef  String?
  
  primaryDocId     String?
  primaryDocSystem String?
  docClass         String?
  
  inputSources   String[] @default([])
  driftTypes     String[] @default([])
  allowedOutputs String[] @default([])
  
  thresholds     Json @default("{}")
  eligibility    Json @default("{}")
  sectionTargets Json @default("{}")
  impactRules    Json @default("{}")
  writeback      Json @default("{}")
  
  // ... more fields
}
```

**Key Fields**:
- ✅ Scope configuration (scopeType, scopeRef)
- ✅ Primary doc targeting
- ✅ Materiality thresholds
- ❌ No approval tier mapping
- ❌ No test mode

### Overlap Analysis

| Feature | ContractPack | DriftPlan | Unified |
|---------|-------------|-----------|---------|
| Scope (workspace/service/repo) | ❌ | ✅ | ✅ |
| Repo allowlist | ❌ | ❌ | ✅ |
| Path globs | ❌ | ❌ | ✅ |
| Approval tiers | ❌ | ❌ | ✅ |
| Test mode | ❌ | ❌ | ✅ |
| Enforcement mode | ✅ (in JSON) | ❌ | ✅ |
| Comparators | ✅ | N/A | ✅ |
| Materiality thresholds | N/A | ✅ | ✅ |
| Primary doc | N/A | ✅ | ✅ |

---

## 🏗️ Proposed Architecture

### Option A: Single Unified Model (RECOMMENDED)

**Approach**: Create new `WorkspacePolicyPack` model that combines both tracks

**Pros**:
- ✅ Clean separation of concerns
- ✅ Easier to understand for users
- ✅ Shared approval tiers and routing
- ✅ Single UI for configuration

**Cons**:
- ⚠️ Requires data migration
- ⚠️ More complex initial implementation

### Option B: Keep Separate Models + Add Shared Config

**Approach**: Keep ContractPack + DriftPlan, add new `PolicyConfig` model for shared settings

**Pros**:
- ✅ No data migration needed
- ✅ Backward compatible

**Cons**:
- ❌ Still two separate UIs
- ❌ Cognitive overhead remains
- ❌ Duplicate fields

### Decision: **Option A (Single Unified Model)**

**Rationale**:
- Better long-term architecture
- Cleaner user experience
- Migration can be done incrementally with feature flags
- Backward compatibility via API adapters

---

## 📐 Unified Schema Design

### WorkspacePolicyPack Model

```prisma
model WorkspacePolicyPack {
  workspaceId String @map("workspace_id")
  id          String @default(uuid())

  // Metadata
  name        String
  description String?
  status      String @default("active")  // 'active', 'draft', 'archived'

  // Scope (shared by both tracks)
  scopeType String   // 'workspace', 'service', 'repo'
  scopeRef  String?  // service ID or repo full name
  
  // Scope filters
  repoAllowlist String[] @default([]) @map("repo_allowlist")  // ['owner/repo1', 'owner/repo2']
  pathGlobs     String[] @default([]) @map("path_globs")      // ['openapi.yaml', 'src/**/*.ts']

  // Track A: Contract Integrity Gate
  trackAEnabled Boolean @default(false) @map("track_a_enabled")
  trackAConfig  Json @default("{}") @map("track_a_config")
  // Structure: {
  //   surfaces: ['api', 'infra', 'docs'],
  //   comparators: [{ type: 'openapi.diff', enabled: true, severity: 'high', config: {} }],
  //   enforcement: { mode: 'warn', criticalThreshold: 90, highThreshold: 70, mediumThreshold: 40 },
  //   artifacts: [{ type: 'openapi_spec', path: 'openapi/openapi.yaml' }]
  // }

  // Track B: Drift + Remediation
  trackBEnabled Boolean @default(false) @map("track_b_enabled")
  trackBConfig  Json @default("{}") @map("track_b_config")
  // Structure: {
  //   primaryDoc: { system: 'confluence', id: '123', title: 'Runbook', class: 'runbook' },
  //   inputSources: [{ type: 'github_pr', enabled: true, config: {} }],
  //   driftTypes: [{ type: 'instruction', enabled: true, sectionTarget: 'Deployment Steps' }],
  //   materiality: { autoApprove: 0.98, slackNotify: 0.40, digestOnly: 0.30, ignore: 0.20 },
  //   docTargeting: { strategy: 'primary_first', maxDocsPerDrift: 3 },
  //   noiseControls: { ignorePatterns: [], ignorePaths: [], temporalAccumulation: { enabled: true, windowDays: 7 } }
  // }

  // Shared: Approval & Routing
  approvalTiers Json @default("{}") @map("approval_tiers")
  // Structure: {
  //   tier1: { name: 'Team Lead', users: ['alice@example.com'], teams: ['@acme/team-leads'] },
  //   tier2: { name: 'Director', users: ['bob@example.com'], teams: ['@acme/directors'] },
  //   tier3: { name: 'CTO', users: ['cto@example.com'], teams: ['@acme/executives'] }
  // }

  routing Json @default("{}") @map("routing")
  // Structure: {
  //   slackChannel: '#platform',
  //   emailList: ['team@example.com'],
  //   pagerDutyService: 'P123456'
  // }

  // Shared: Test Mode
  testMode Boolean @default(false) @map("test_mode")
  testModeConfig Json @default("{}") @map("test_mode_config")
  // Structure: {
  //   enabled: true,
  //   dryRun: true,
  //   previewFindings: true,
  //   notifyOnTest: false
  // }

  // Versioning
  version     Int    @default(1)
  versionHash String @map("version_hash")
  parentId    String? @map("parent_id")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  createdBy String? @map("created_by")
  updatedBy String? @map("updated_by")

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@id([workspaceId, id])
  @@index([workspaceId])
  @@index([status])
  @@map("workspace_policy_packs")
}
```

---

## 🚀 Implementation Plan (4 Weeks)

### Week 7: Backend Foundation

#### Day 1-2: Schema Design & Migration
**Tasks**:
1. ✅ Finalize `WorkspacePolicyPack` Prisma schema
2. Create Prisma migration
3. Add database indexes for performance
4. Test migration on development database

**Deliverables**:
- `apps/api/prisma/migrations/XXX_create_workspace_policy_pack/migration.sql`
- Updated `schema.prisma`

#### Day 3-4: Data Migration Scripts
**Tasks**:
1. Create migration script: `ContractPack` → `WorkspacePolicyPack`
   - Map `contracts` JSON to `trackAConfig`
   - Set `trackAEnabled = true`
   - Generate `versionHash` from content
2. Create migration script: `DriftPlan` → `WorkspacePolicyPack`
   - Map all fields to `trackBConfig`
   - Set `trackBEnabled = true`
   - Preserve `scopeType`, `scopeRef`
3. Create rollback scripts
4. Test migration with sample data

**Deliverables**:
- `apps/api/src/scripts/migrate-contract-packs.ts`
- `apps/api/src/scripts/migrate-drift-plans.ts`
- `apps/api/src/scripts/rollback-policy-packs.ts`

#### Day 5: API Endpoints
**Tasks**:
1. Create CRUD endpoints for `WorkspacePolicyPack`
   - `GET /api/workspaces/:id/policy-packs`
   - `POST /api/workspaces/:id/policy-packs`
   - `GET /api/workspaces/:id/policy-packs/:packId`
   - `PUT /api/workspaces/:id/policy-packs/:packId`
   - `DELETE /api/workspaces/:id/policy-packs/:packId`
2. Add validation for `trackAConfig` and `trackBConfig` JSON
3. Add version hash generation
4. Add test mode endpoints:
   - `POST /api/workspaces/:id/policy-packs/:packId/test-run`

**Deliverables**:
- `apps/api/src/routes/policyPacks.ts`
- `apps/api/src/services/policyPacks/index.ts`
- `apps/api/src/services/policyPacks/validation.ts`

---

### Week 8: Backend Integration & Backward Compatibility

#### Day 1-2: Adapter Layer
**Tasks**:
1. Create adapter: `WorkspacePolicyPack` → `ContractPack` (for backward compatibility)
2. Create adapter: `WorkspacePolicyPack` → `DriftPlan` (for backward compatibility)
3. Update existing Track A logic to read from `WorkspacePolicyPack`
4. Update existing Track B logic to read from `WorkspacePolicyPack`
5. Add feature flag: `ENABLE_UNIFIED_POLICY_PACKS`

**Deliverables**:
- `apps/api/src/services/policyPacks/adapters.ts`
- Updated `apps/api/src/services/contracts/contractResolver.ts`
- Updated `apps/api/src/services/plans/index.ts`

#### Day 3-4: Test Mode Implementation
**Tasks**:
1. Implement dry-run mode for Track A:
   - Run comparators without creating GitHub Check
   - Return preview of findings
2. Implement dry-run mode for Track B:
   - Simulate drift detection without creating patches
   - Return preview of patches
3. Add test mode UI endpoint:
   - `GET /api/workspaces/:id/policy-packs/:packId/test-results`

**Deliverables**:
- `apps/api/src/services/policyPacks/testMode.ts`
- Updated comparator runner to support dry-run
- Updated drift detector to support dry-run

#### Day 5: Testing & Documentation
**Tasks**:
1. Write unit tests for all new endpoints
2. Write integration tests for migration scripts
3. Write API documentation
4. Create migration guide for users

**Deliverables**:
- `apps/api/src/routes/__tests__/policyPacks.test.ts`
- `apps/api/src/scripts/__tests__/migration.test.ts`
- `MIGRATION_GUIDE.md`

---

### Week 9: Frontend - Unified Configuration UI

#### Day 1-2: Page Structure & Navigation
**Tasks**:
1. Create new page: `apps/web/src/app/policy-packs/page.tsx`
2. Implement tabbed interface:
   - Tab 1: Overview (name, description, scope)
   - Tab 2: Track A (Contract Integrity)
   - Tab 3: Track B (Drift Remediation)
   - Tab 4: Approval Tiers
   - Tab 5: Test Mode
3. Add navigation from existing pages
4. Implement list view with filters (Track A only, Track B only, Both)

**Deliverables**:
- `apps/web/src/app/policy-packs/page.tsx` (basic structure)
- List view with create/edit/delete buttons

#### Day 3: Track A Configuration Tab
**Tasks**:
1. Reuse components from `apps/web/src/app/contracts/page.tsx`:
   - Enforcement mode toggle
   - Comparator selection UI
   - Scope configuration UI
2. Adapt to work with `trackAConfig` JSON structure
3. Add surface type checkboxes
4. Add artifact configuration

**Deliverables**:
- Track A tab fully functional
- All P1 features integrated

#### Day 4: Track B Configuration Tab
**Tasks**:
1. Reuse components from `apps/web/src/app/plans/page.tsx`:
   - Primary doc picker
   - Materiality threshold sliders
   - Input source checkboxes
   - Drift type checkboxes
2. Adapt to work with `trackBConfig` JSON structure
3. Add doc targeting strategy selector
4. Add noise controls configuration

**Deliverables**:
- Track B tab fully functional
- All Track B MVP features integrated

#### Day 5: Approval Tiers & Test Mode Tabs
**Tasks**:
1. **Approval Tiers Tab**:
   - Add tier configuration UI (Tier 1, Tier 2, Tier 3)
   - User/team selector for each tier
   - Severity → tier mapping
   - Visual tier hierarchy display
2. **Test Mode Tab**:
   - Toggle for test mode
   - "Run Test" button
   - Preview findings display
   - Test results history

**Deliverables**:
- Approval Tiers tab complete
- Test Mode tab complete

---

### Week 10: Migration, Testing & Deployment

#### Day 1-2: Data Migration Execution
**Tasks**:
1. Run migration scripts on staging database
2. Verify data integrity
3. Test backward compatibility
4. Fix any migration issues
5. Create migration rollback plan

**Deliverables**:
- All existing ContractPacks migrated to WorkspacePolicyPack
- All existing DriftPlans migrated to WorkspacePolicyPack
- Migration verification report

#### Day 3: End-to-End Testing
**Tasks**:
1. Test Track A flow with unified policy pack
2. Test Track B flow with unified policy pack
3. Test approval tier mapping
4. Test test mode (dry-run)
5. Test backward compatibility (old endpoints still work)
6. Performance testing

**Deliverables**:
- E2E test suite passing
- Performance benchmarks met

#### Day 4: User Acceptance Testing
**Tasks**:
1. Deploy to staging environment
2. Conduct user testing with beta users
3. Gather feedback
4. Fix critical issues
5. Update documentation

**Deliverables**:
- UAT feedback report
- Critical issues fixed
- User documentation updated

#### Day 5: Production Deployment
**Tasks**:
1. Deploy to production with feature flag disabled
2. Run migration scripts on production database
3. Enable feature flag for 10% of workspaces
4. Monitor metrics (latency, error rate, adoption)
5. Gradually roll out to 100%

**Deliverables**:
- Production deployment complete
- Monitoring dashboards set up
- Rollback plan documented

---

## 🎨 UI Design Specifications

### Unified Policy Pack List View

```
┌─────────────────────────────────────────────────────────────────┐
│ Policy Packs                                    [+ New Pack]    │
├─────────────────────────────────────────────────────────────────┤
│ Filters: [All ▼] [Track A ▼] [Track B ▼] [Active ▼]           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ Payment Service Policy                                  │   │
│ │ Scope: Service (payment-service)                        │   │
│ │ ✓ Track A: Contract Integrity (9 comparators)           │   │
│ │ ✓ Track B: Drift Remediation (Primary: Confluence)      │   │
│ │ Approval Tiers: 3 configured                            │   │
│ │ Status: Active                                          │   │
│ │                                    [Edit] [Delete] [Test]│   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ Infrastructure Policy                                   │   │
│ │ Scope: Workspace-wide                                   │   │
│ │ ✓ Track A: Contract Integrity (5 comparators)           │   │
│ │ ✗ Track B: Disabled                                     │   │
│ │ Approval Tiers: 2 configured                            │   │
│ │ Status: Active                                          │   │
│ │                                    [Edit] [Delete] [Test]│   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Unified Policy Pack Edit Modal (Tabbed Interface)

```
┌─────────────────────────────────────────────────────────────────┐
│ Edit Policy Pack: Payment Service Policy                       │
├─────────────────────────────────────────────────────────────────┤
│ [Overview] [Track A] [Track B] [Approval Tiers] [Test Mode]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Overview Tab:                                                   │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ Name: [Payment Service Policy                        ]  │   │
│ │ Description: [Optional description                   ]  │   │
│ │                                                         │   │
│ │ Scope:                                                  │   │
│ │ ● Service: [payment-service ▼]                         │   │
│ │ ○ Workspace-wide                                        │   │
│ │ ○ Repository: [Select repo ▼]                          │   │
│ │                                                         │   │
│ │ Repo Allowlist (optional):                              │   │
│ │ [acme/payment-api ×] [acme/payment-worker ×] [+ Add]   │   │
│ │                                                         │   │
│ │ Path Globs (optional):                                  │   │
│ │ [openapi.yaml ×] [src/**/*.ts ×] [+ Add]               │   │
│ │                                                         │   │
│ │ Status: [Active ▼]                                      │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                                    [Cancel] [Save Changes]     │
└─────────────────────────────────────────────────────────────────┘
```

### Approval Tiers Tab

```
┌─────────────────────────────────────────────────────────────────┐
│ Approval Tiers Configuration                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ Tier 1: Team Lead                                       │   │
│ │ Users: [alice@example.com ×] [bob@example.com ×]       │   │
│ │ Teams: [@acme/team-leads ×]                             │   │
│ │ Required for: Medium, High, Critical findings           │   │
│ │                                              [Configure] │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ Tier 2: Director                                        │   │
│ │ Users: [director@example.com ×]                         │   │
│ │ Teams: [@acme/directors ×]                              │   │
│ │ Required for: High, Critical findings                   │   │
│ │                                              [Configure] │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ Tier 3: CTO                                             │   │
│ │ Users: [cto@example.com ×]                              │   │
│ │ Teams: [@acme/executives ×]                             │   │
│ │ Required for: Critical findings only                    │   │
│ │                                              [Configure] │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│ Severity → Tier Mapping:                                        │
│ Critical: Tier 3 (CTO) ✓                                       │
│ High:     Tier 2 (Director) ✓                                  │
│ Medium:   Tier 1 (Team Lead) ✓                                 │
│ Low:      No approval required                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Test Mode Tab

```
┌─────────────────────────────────────────────────────────────────┐
│ Test Mode (Dry-Run)                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ☑ Enable Test Mode                                             │
│   Run checks without enforcement or creating patches            │
│                                                                 │
│ Test Configuration:                                             │
│ ☑ Preview findings without blocking PRs                        │
│ ☑ Simulate drift patches without applying                      │
│ ☐ Notify on test runs (Slack/email)                            │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ Run Test on Recent Activity                             │   │
│ │                                                         │   │
│ │ Test Track A on:                                        │   │
│ │ ○ Last 10 PRs                                           │   │
│ │ ● Specific PR: [#1234                ]  [Run Test]     │   │
│ │                                                         │   │
│ │ Test Track B on:                                        │   │
│ │ ○ Last 10 drift signals                                 │   │
│ │ ● Specific signal: [Select signal ▼]  [Run Test]      │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│ Test Results:                                                   │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ Last Test: 2026-02-16 10:30 AM                          │   │
│ │ PR #1234: "Add new payment endpoint"                    │   │
│ │                                                         │   │
│ │ Findings Preview:                                       │   │
│ │ • 🔴 Critical: OpenAPI breaking change detected         │   │
│ │ • 🟠 High: Version bump required                        │   │
│ │ • 🟡 Medium: CHANGELOG not updated                      │   │
│ │                                                         │   │
│ │ Would have: BLOCKED (enforcement mode: block)           │   │
│ │ Required approvals: Tier 3 (CTO)                        │   │
│ │                                                         │   │
│ │                                    [View Full Report]   │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Migration Strategy

### Phase 1: Parallel Operation (Week 7-8)
- ✅ New `WorkspacePolicyPack` model created
- ✅ Old `ContractPack` and `DriftPlan` models remain
- ✅ Feature flag: `ENABLE_UNIFIED_POLICY_PACKS` (default: false)
- ✅ Both systems operational

### Phase 2: Data Migration (Week 9)
- ✅ Run migration scripts to copy data
- ✅ Verify data integrity
- ✅ Test backward compatibility
- ✅ Feature flag enabled for 10% of workspaces

### Phase 3: Gradual Rollout (Week 10)
- ✅ Monitor metrics (latency, error rate, adoption)
- ✅ Gradually increase to 50%, then 100%
- ✅ Deprecate old endpoints (but keep functional)
- ✅ Update documentation

### Phase 4: Cleanup (Week 11+)
- ✅ Remove old `ContractPack` and `DriftPlan` models
- ✅ Remove adapter layer
- ✅ Remove feature flag
- ✅ Archive old endpoints

---

## ✅ Success Metrics

### Technical Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Migration success rate | 100% | All existing packs migrated without data loss |
| API latency (p95) | < 200ms | Performance logs |
| Error rate | < 0.1% | Error logs |
| Test coverage | > 80% | Jest coverage report |

### User Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Adoption rate | > 50% | % of workspaces using unified packs |
| User satisfaction | > 8/10 | Surveys |
| Time to configure | < 5 min | User testing |
| Test mode usage | > 30% | Usage logs |

### Business Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Reduced configuration time | 50% | Before/after comparison |
| Approval tier reuse | > 70% | % of packs sharing approval tiers |
| Test mode prevents issues | > 20 | # of issues caught in test mode |

---

## 🚨 Risk Mitigation

### Risk 1: Data Migration Failures
**Mitigation**:
- ✅ Comprehensive testing on staging
- ✅ Rollback scripts ready
- ✅ Backup before migration
- ✅ Gradual rollout with feature flag

### Risk 2: Performance Regression
**Mitigation**:
- ✅ Performance testing before deployment
- ✅ Database indexes on key fields
- ✅ Caching for frequently accessed packs
- ✅ Monitor latency metrics

### Risk 3: User Confusion
**Mitigation**:
- ✅ Clear migration guide
- ✅ In-app tooltips and help text
- ✅ Video tutorials
- ✅ Support team training

### Risk 4: Backward Compatibility Issues
**Mitigation**:
- ✅ Adapter layer for old endpoints
- ✅ Comprehensive integration tests
- ✅ Feature flag for gradual rollout
- ✅ Monitoring for errors

---

## 📝 Next Steps

### Immediate Actions (This Week)
1. ✅ Review this architectural plan
2. ✅ Get approval from team
3. ✅ Set up project tracking
4. ✅ Assign engineers to Week 7 tasks

### Week 7 Kickoff
1. Create Prisma migration
2. Implement data migration scripts
3. Create API endpoints
4. Daily standups to track progress

### Decision Points
- **Week 7 End**: Schema migration complete? If yes → proceed to Week 8
- **Week 8 End**: Backend integration complete? If yes → proceed to Week 9
- **Week 9 End**: UI complete? If yes → proceed to Week 10
- **Week 10 End**: Migration successful? If yes → gradual rollout

---

**END OF ARCHITECTURAL PLAN**

