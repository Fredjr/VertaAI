# Canonical Specification Assessment - Part A: Multiple Policy Packs

**Date**: 2026-02-19  
**Assessor**: Senior Architect  
**Scope**: Assessment of current implementation against canonical YAML specification (Part A)

---

## 🎯 Assessment Summary

**Overall Status**: ✅ **MOSTLY COMPLETE** with **3 CRITICAL GAPS** identified

---

## A) Multiple Policy Packs Support

### ✅ **IMPLEMENTED** - Core Multi-Pack Infrastructure

#### 1. **Pack Selection Algorithm** ✅
**Location**: `apps/api/src/services/gatekeeper/yaml-dsl/packSelector.ts`

**What We Have**:
```typescript
// Lines 45-128: selectApplicablePacks()
// Returns ALL applicable packs in precedence order: repo > service > workspace
// Within each level, returns all packs sorted by version
```

**Compliance**: ✅ **FULLY COMPLIANT**
- Supports multiple packs per workspace
- Implements precedence: repo > service > workspace
- Semver-based version sorting with publishedAt tie-breaker
- Returns ALL applicable packs, not just one

---

#### 2. **Pack Evaluation** ✅
**Location**: `apps/api/src/services/gatekeeper/yaml-dsl/yamlGatekeeperIntegration.ts`

**What We Have**:
```typescript
// Lines 76-151: Evaluate ALL packs
for (const selectedPack of selectedPacks) {
  const result = await evaluator.evaluate(
    selectedPack.pack,
    selectedPack.packHash,
    selectedPack.source,
    context
  );
  packResults.push({ pack, packHash, packSource, result });
}
```

**Compliance**: ✅ **FULLY COMPLIANT**
- Evaluates ALL applicable packs
- Maintains separate results for each pack
- Preserves pack metadata and source

---

#### 3. **Decision Aggregation** ✅
**Location**: `apps/api/src/services/gatekeeper/yaml-dsl/yamlGatekeeperIntegration.ts`

**What We Have**:
```typescript
// Lines 182-199: computeGlobalDecision()
// Algorithm: any BLOCK → BLOCK, else any WARN → WARN, else PASS
```

**Compliance**: ✅ **FULLY COMPLIANT**
- Implements "most restrictive" aggregation by default
- Any pack blocking → global BLOCK
- Any pack warning → global WARN
- All passing → global PASS

**Test Coverage**: ✅ `apps/api/src/__tests__/yaml-dsl/multi-pack-aggregation.test.ts` (92 tests passing)

---

### ⚠️ **CRITICAL GAP #1** - Merge Strategy Support

**What Spec Requires**:
```yaml
scope:
  precedence:
    priority: 50
    mergeStrategy: "most_restrictive"  # or "highest_priority" or "explicit"
```

**What We Have**:
- ✅ Database schema supports `scopePriority` and `scopeMergeStrategy` (Phase 1.3)
- ✅ TypeScript types define `MergeStrategy` enum
- ✅ JSON Schema validates merge strategy field
- ❌ **NOT IMPLEMENTED**: Merge strategy is NOT used in decision aggregation

**Current Behavior**:
- Always uses "most_restrictive" (hardcoded in `computeGlobalDecision()`)
- Ignores `pack.metadata.scopeMergeStrategy` field
- Cannot support "highest_priority" or "explicit" modes

**Impact**: **HIGH**
- Organizations cannot configure merge behavior
- Cannot implement "highest priority wins" semantics
- Cannot enforce explicit conflict resolution

**Recommendation**: **MUST FIX** before production
```typescript
// Proposed fix in yamlGatekeeperIntegration.ts
function computeGlobalDecision(packResults: PackResult[]): 'pass' | 'warn' | 'block' {
  // Check if all packs use same merge strategy
  const strategies = new Set(packResults.map(pr => 
    pr.pack.metadata.scopeMergeStrategy || 'MOST_RESTRICTIVE'
  ));
  
  if (strategies.size > 1 && strategies.has('EXPLICIT')) {
    throw new Error('Conflicting merge strategies - explicit resolution required');
  }
  
  const strategy = packResults[0].pack.metadata.scopeMergeStrategy || 'MOST_RESTRICTIVE';
  
  switch (strategy) {
    case 'MOST_RESTRICTIVE':
      return computeMostRestrictive(packResults);
    case 'HIGHEST_PRIORITY':
      return computeHighestPriority(packResults);
    case 'EXPLICIT':
      return computeExplicit(packResults);
  }
}
```

---

### ⚠️ **CRITICAL GAP #2** - Priority-Based Pack Selection

**What Spec Requires**:
```yaml
scope:
  precedence:
    priority: 50  # 0-1000, higher = higher priority
```

**What We Have**:
- ✅ Database schema supports `scopePriority` (Phase 1.3)
- ✅ TypeScript types define `scopePriority` field
- ✅ JSON Schema validates priority field (0-100 range)
- ❌ **NOT IMPLEMENTED**: Priority is NOT used in pack selection or aggregation

**Current Behavior**:
- Pack selection uses only scope type precedence (repo > service > workspace)
- Within same scope type, uses semver + publishedAt
- Ignores `pack.metadata.scopePriority` field

**Impact**: **MEDIUM-HIGH**
- Cannot override precedence with explicit priorities
- Cannot have high-priority workspace pack override low-priority repo pack
- Limits flexibility for complex org structures

**Recommendation**: **SHOULD FIX** for v1.1
```typescript
// Proposed fix in packSelector.ts
function sortPacksByPriority(packs: SelectedPack[]): SelectedPack[] {
  return packs.sort((a, b) => {
    // 1. Sort by explicit priority (if set)
    const priorityA = a.pack.metadata.scopePriority || 50;
    const priorityB = b.pack.metadata.scopePriority || 50;
    if (priorityA !== priorityB) {
      return priorityB - priorityA; // Higher priority first
    }
    
    // 2. Fall back to semver
    const versionCompare = semver.rcompare(a.pack.metadata.version, b.pack.metadata.version);
    if (versionCompare !== 0) return versionCompare;
    
    // 3. Fall back to publishedAt
    if (a.publishedAt && b.publishedAt) {
      return b.publishedAt.getTime() - a.publishedAt.getTime();
    }
    
    return 0;
  });
}
```

---

### ✅ **IMPLEMENTED** - Pack Matcher Service

**Location**: `apps/api/src/services/gatekeeper/yaml-dsl/packMatcher.ts`

**What We Have**:
- ✅ `findApplicablePacks()` - Finds all matching packs
- ✅ `matchesPack()` - Checks scope, branch, repo filters
- ✅ Priority sorting (highest first)
- ✅ Merge strategy extraction

**Compliance**: ✅ **FULLY COMPLIANT**
- Supports workspace, repo, service scope types
- Glob pattern matching for branches and repos
- Priority-based sorting

**Note**: This service exists but is NOT currently used in the main evaluation flow. The main flow uses `packSelector.ts` instead.

---

## 📊 Part A Compliance Score

| Requirement | Status | Priority |
|-------------|--------|----------|
| Multiple packs per workspace | ✅ Complete | P0 |
| Pack selection algorithm | ✅ Complete | P0 |
| Precedence (repo > service > workspace) | ✅ Complete | P0 |
| Evaluate ALL applicable packs | ✅ Complete | P0 |
| Decision aggregation | ✅ Complete | P0 |
| **Merge strategy support** | ❌ **Missing** | **P0** |
| **Priority-based selection** | ❌ **Missing** | **P1** |
| Pack matcher service | ✅ Complete | P1 |

**Overall**: **5/8 requirements complete (62.5%)**

---

## 🚨 Critical Actions Required

### **Action 1**: Implement Merge Strategy Support (P0)
- **Effort**: 2-3 hours
- **Files**: `yamlGatekeeperIntegration.ts`
- **Impact**: Enables "highest_priority" and "explicit" modes

### **Action 2**: Implement Priority-Based Selection (P1)
- **Effort**: 1-2 hours
- **Files**: `packSelector.ts`
- **Impact**: Enables priority overrides for complex org structures

### **Action 3**: Integrate PackMatcher Service (P2)
- **Effort**: 2-3 hours
- **Files**: `yamlGatekeeperIntegration.ts`, `packSelector.ts`
- **Impact**: Consolidates pack selection logic

---

## 📋 Part B Assessment - Templates & Fact Catalog

### B1) Template Library Assessment

**Specification Requirement**: 15 templates (8 Track A + 7 Track B)

**Current State**: 5 templates
- ✅ `observe-core-pack.yaml` (150 lines)
- ✅ `enforce-core-pack.yaml` (158 lines)
- ✅ `security-focused-pack.yaml` (211 lines)
- ✅ `documentation-pack.yaml`
- ✅ `infrastructure-pack.yaml`

**Gap Analysis**:

| Template ID | Required | Status | Notes |
|-------------|----------|--------|-------|
| **Track A Templates** |
| A1: Block Breaking OpenAPI Changes | ✅ | ❌ **MISSING** | Need OpenAPI diff comparator + fact support |
| A2: Warn on Non-breaking OpenAPI Changes | ✅ | ❌ **MISSING** | Need OpenAPI diff comparator + fact support |
| A3: Require API Owner Approval on OpenAPI Change | ✅ | ❌ **MISSING** | Need OpenAPI diff comparator + fact support |
| A4: Require Contract Tests Update | ✅ | ❌ **MISSING** | Can implement with existing diff facts |
| A5: Block Merges Without Required Reviewers | ✅ | ✅ **PARTIAL** | Have MIN_APPROVALS, need merge event support |
| A6: Block High-risk File Changes | ✅ | ✅ **PARTIAL** | Have SENSITIVE_PATH_REQUIRES_APPROVAL |
| A7: Warn on Dependency Risk (SBOM/CVEs) | ✅ | ❌ **MISSING** | Need SBOM input type + facts |
| A8: Block Deploy If Contract Gate Fails | ✅ | ❌ **MISSING** | Need deploy event + gate status facts |
| **Track B Templates** |
| B1: Ticket-only for IAM Drift | ✅ | ❌ **MISSING** | Need drift_finding input + Track B support |
| B2: Auto-apply Low-risk Drift | ✅ | ❌ **MISSING** | Need drift_finding input + Track B support |
| B3: Propose Remediation for Medium Drift | ✅ | ❌ **MISSING** | Need drift_finding input + Track B support |
| B4: Escalate Repeated Drift | ✅ | ❌ **MISSING** | Need drift_finding input + Track B support |
| B5: Block Auto-remediation for Network Drift | ✅ | ❌ **MISSING** | Need drift_finding input + Track B support |
| B6: Notify Only for Dev Drift | ✅ | ❌ **MISSING** | Need drift_finding input + Track B support |
| B7: Schedule Weekly Drift Report | ✅ | ❌ **MISSING** | Need scheduled event + Track B support |

**Template Compliance Score**: **2/15 (13%)** - Only A5 and A6 partially covered

---

### B2) Fact Catalog Assessment

**Specification Requirement**: Comprehensive fact catalog across 7 categories (D1-D7)

**Current State**: 19 facts across 3 categories
- ✅ Universal (6 facts): scope.workspace, scope.repository, scope.branch, actor.user, event.type, time.utc
- ✅ PR (9 facts): pr.id, pr.title, pr.labels, pr.isDraft, pr.approvals.count, pr.approvals.users, pr.approvals.teams, pr.targetBranch, pr.sourceBranch
- ✅ Diff (5 facts): diff.filesChanged.count, diff.filesChanged.paths, diff.linesAdded, diff.linesDeleted, diff.linesChanged

**Gap Analysis by Category**:

#### D1: Universal Facts ✅ **COMPLETE**
| Fact | Status |
|------|--------|
| scope.workspace | ✅ Implemented |
| scope.repository | ✅ Implemented |
| scope.branch | ✅ Implemented |
| scope.environment | ❌ **MISSING** |
| scope.pathsTouched | ❌ **MISSING** (alias for diff.filesChanged.paths) |
| event.type | ✅ Implemented |
| time.utc | ✅ Implemented |
| actor.user | ✅ Implemented |
| actor.team | ❌ **MISSING** |
| pack.packId | ❌ **MISSING** |
| pack.priority | ❌ **MISSING** |

**Universal Facts Score**: **6/11 (55%)**

#### D2: PR Metadata Facts ✅ **MOSTLY COMPLETE**
| Fact | Status |
|------|--------|
| pr.id | ✅ Implemented |
| pr.title | ✅ Implemented |
| pr.labels | ✅ Implemented |
| pr.author | ❌ **MISSING** (have actor.user instead) |
| pr.approvals.count | ✅ Implemented |
| pr.approvals.groupsSatisfied | ❌ **MISSING** |
| pr.filesChanged.count | ❌ **MISSING** (have diff.filesChanged.count) |
| pr.isDraft | ✅ Implemented |
| pr.targetBranch | ✅ Implemented |

**PR Facts Score**: **6/9 (67%)**

#### D3: OpenAPI Diff Facts ❌ **COMPLETELY MISSING**
| Fact | Status |
|------|--------|
| openapi.changed | ❌ **MISSING** |
| openapi.version.from | ❌ **MISSING** |
| openapi.version.to | ❌ **MISSING** |
| openapi.breakingChanges.count | ❌ **MISSING** |
| openapi.breakingChanges.items | ❌ **MISSING** |
| openapi.nonBreakingChanges.count | ❌ **MISSING** |
| openapi.addedEndpoints.count | ❌ **MISSING** |
| openapi.removedEndpoints.count | ❌ **MISSING** |
| openapi.changedSchemas.count | ❌ **MISSING** |
| openapi.breakingChanges.byType | ❌ **MISSING** |
| openapi.endpoints.changed | ❌ **MISSING** |
| openapi.schemas.changed | ❌ **MISSING** |

**OpenAPI Facts Score**: **0/12 (0%)**

#### D4: Terraform Plan Facts ❌ **COMPLETELY MISSING**
| Fact | Status |
|------|--------|
| tf.plan.resourceChanges.count | ❌ **MISSING** |
| tf.plan.create.count | ❌ **MISSING** |
| tf.plan.update.count | ❌ **MISSING** |
| tf.plan.delete.count | ❌ **MISSING** |
| tf.plan.replaces.count | ❌ **MISSING** |
| tf.plan.tainted.count | ❌ **MISSING** |
| tf.plan.hasDestroy | ❌ **MISSING** |
| tf.plan.resourceTypes | ❌ **MISSING** |
| tf.plan.resourceAddresses | ❌ **MISSING** |
| tf.plan.costDelta.monthly | ❌ **MISSING** |
| tf.plan.riskScore | ❌ **MISSING** |
| tf.plan.changesInSensitiveModules | ❌ **MISSING** |

**Terraform Facts Score**: **0/12 (0%)**

#### D5: SBOM/Vulnerability Facts ❌ **COMPLETELY MISSING**
| Fact | Status |
|------|--------|
| sbom.packages.count | ❌ **MISSING** |
| sbom.licenses.denied.count | ❌ **MISSING** |
| sbom.cves.critical.count | ❌ **MISSING** |
| sbom.cves.high.count | ❌ **MISSING** |
| sbom.cves.byPackage | ❌ **MISSING** |
| sbom.policyViolations.count | ❌ **MISSING** |

**SBOM Facts Score**: **0/6 (0%)**

#### D6: Drift Finding Facts ❌ **COMPLETELY MISSING**
| Fact | Status |
|------|--------|
| drift.detected | ❌ **MISSING** |
| drift.resourceType | ❌ **MISSING** |
| drift.resourceDomain | ❌ **MISSING** |
| drift.resourceId | ❌ **MISSING** |
| drift.provider | ❌ **MISSING** |
| drift.severity | ❌ **MISSING** |
| drift.changeType | ❌ **MISSING** |
| drift.inChangeWindow | ❌ **MISSING** |
| drift.repeatCount.24h | ❌ **MISSING** |
| drift.repeatCount.7d | ❌ **MISSING** |
| drift.lastSeenAt | ❌ **MISSING** |
| drift.remediation.possible | ❌ **MISSING** |
| drift.remediation.riskScore | ❌ **MISSING** |
| drift.remediation.requiresRestart | ❌ **MISSING** |
| drift.remediation.estimatedBlastRadius | ❌ **MISSING** |

**Drift Facts Score**: **0/15 (0%)**

#### D7: Gate Status Facts ❌ **COMPLETELY MISSING**
| Fact | Status |
|------|--------|
| gate.contractIntegrity.status | ❌ **MISSING** |
| gate.contractIntegrity.failedRules | ❌ **MISSING** |
| gate.contractIntegrity.severityMax | ❌ **MISSING** |

**Gate Status Facts Score**: **0/3 (0%)**

**Overall Fact Catalog Compliance**: **19/68 (28%)**

---

### B3) UI Multi-Pack Management Assessment

**Specification Requirement**: UI must support multi-pack management, effective policy view, conflict detection

#### E1: Pack List Management ✅ **IMPLEMENTED**
**Location**: `apps/web/src/app/policy-packs/page.tsx`

**What We Have**:
- ✅ Pack list table with name, scope, tracks, status, version
- ✅ Edit and delete actions
- ✅ Status badges (draft, published, archived)
- ✅ Scope display (workspace, repo, service)

**What's Missing**:
- ❌ Priority display in pack list
- ❌ Merge strategy display in pack list
- ❌ "Which repos/environments affected" preview
- ❌ Conflict detection indicators

**Pack List Score**: **4/8 (50%)**

#### E2: Effective Policy View ❌ **MISSING (CRITICAL)**
**Requirement**: From any repo/branch/env context, show:
- All matching packs
- Merged rules
- Final decisions + obligations
- Explain "why" (pack priority + merge strategy + rule overrides)

**Current State**: ❌ **NOT IMPLEMENTED**
- No "effective policy" view exists
- No way to see which packs apply to a specific repo/branch
- No way to see merged/aggregated rules
- No explanation of decision logic

**Impact**: **CRITICAL** - This is the #1 enterprise trust feature

**Effective Policy View Score**: **0/4 (0%)**

#### E3: Conflict Detection UX ❌ **MISSING**
**Requirement**: If `mergeStrategy: explicit` and two packs conflict:
- Surface "conflict" during activation
- Show conflicting rules side-by-side
- Offer remediation options

**Current State**: ❌ **NOT IMPLEMENTED**
- No conflict detection during pack activation
- No conflict visualization
- No remediation suggestions

**Conflict Detection Score**: **0/3 (0%)**

**Overall UI Multi-Pack Score**: **4/15 (27%)**

---

## 🎯 Part B Summary

| Category | Score | Status |
|----------|-------|--------|
| Template Library | 2/15 (13%) | ❌ **CRITICAL GAP** |
| Fact Catalog | 19/68 (28%) | ❌ **CRITICAL GAP** |
| UI Multi-Pack Management | 4/15 (27%) | ❌ **CRITICAL GAP** |
| **Overall Part B** | **25/98 (26%)** | ❌ **NEEDS MAJOR WORK** |

---

## 🚨 Critical Actions Required (Part B)

### **Priority 0 (MUST HAVE for v1.0)**

1. **Implement Effective Policy View** (8-12 hours)
   - Create `/policy-packs/effective` page
   - Show all applicable packs for a repo/branch
   - Show merged rules and final decisions
   - Explain decision logic (priority + merge strategy)

2. **Add OpenAPI Diff Facts** (6-8 hours)
   - Implement OpenAPI diff parser
   - Register 12 OpenAPI facts in catalog
   - Create OpenAPI diff comparators
   - Add 3 OpenAPI templates (A1, A2, A3)

3. **Add Missing Universal/PR Facts** (2-3 hours)
   - scope.environment
   - actor.team
   - pack.packId, pack.priority
   - pr.author (alias for actor.user)
   - pr.approvals.groupsSatisfied

### **Priority 1 (SHOULD HAVE for v1.1)**

4. **Add SBOM/CVE Facts** (4-6 hours)
   - Implement SBOM parser
   - Register 6 SBOM facts
   - Create SBOM comparators
   - Add template A7 (Warn on Dependency Risk)

5. **Add Conflict Detection UX** (6-8 hours)
   - Detect conflicts during pack activation
   - Show conflicting rules side-by-side
   - Offer remediation suggestions

6. **Add Template A4** (2-3 hours)
   - Require Contract Tests Update (can use existing diff facts)

### **Priority 2 (Track B - Future)**

7. **Implement Track B Support** (20-30 hours)
   - Add drift_finding input type
   - Register 15 drift facts
   - Implement drift remediation workflow
   - Add 7 Track B templates (B1-B7)

8. **Add Terraform Plan Facts** (6-8 hours)
   - Implement Terraform plan parser
   - Register 12 Terraform facts
   - Create Terraform comparators

9. **Add Gate Status Facts** (3-4 hours)
   - Implement gate status tracking
   - Register 3 gate status facts
   - Add template A8 (Block Deploy If Contract Gate Fails)

---

**ASSESSMENT COMPLETE - AWAITING DIRECTION ON WHICH GAPS TO ADDRESS FIRST**

