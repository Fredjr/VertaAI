# Phase 3 & 4: Comprehensive Implementation Plan
**Senior Architect Assessment**  
**Date**: 2026-02-19  
**Current Compliance**: 44/166 (27%)  
**Target Compliance**: 166/166 (100%)

---

## 🎯 Executive Summary

This document provides a thorough senior architect assessment of all 4 phases required to achieve 100% compliance with the canonical YAML specification. Each phase includes:
- **Detailed technical analysis** of what exists vs. what's needed
- **Integration points** with existing codebase
- **Implementation strategy** with code examples
- **Effort estimates** based on codebase complexity
- **Risk assessment** and mitigation strategies

---

## 📊 Current State Analysis

### What We Have (Strong Foundation)
1. ✅ **Multi-Pack Infrastructure** (62.5% complete)
   - Pack selection returns ALL applicable packs
   - Precedence implemented (repo > service > workspace)
   - Decision aggregation with "most_restrictive" default
   - Database schema supports priority + merge strategy

2. ✅ **Hybrid Comparator/Fact-Based System** (100% complete)
   - 19 facts across 3 categories (Universal, PR, Diff)
   - 12 comparison operators + AND/OR/NOT composition
   - Auto-enhancement of packs with fact-based conditions
   - Translation of 5 comparators to fact-based conditions

3. ✅ **Existing OpenAPI Infrastructure**
   - `openapiBreakingChanges.ts` - Breaking change detection
   - `openapiValidate.ts` - OpenAPI validation comparator
   - `openapiDiff.ts` - OpenAPI diff comparator
   - `openApiParser.ts` - YAML/JSON parsing

4. ✅ **UI Components** (27% complete)
   - Pack list with name, scope, status, version
   - RuleBuilder, RuleEditor, ConditionBuilder
   - TemplateGallery, PackPreview, PackDiffViewer

### What's Missing (Critical Gaps)
1. ❌ **Merge Strategy Logic** - Field exists but not used
2. ❌ **Priority-Based Selection** - Field exists but ignored
3. ❌ **Effective Policy View** - No UI to see merged rules
4. ❌ **49 Additional Facts** - OpenAPI, Terraform, SBOM, Drift, Gate Status
5. ❌ **13 Specific Templates** - OpenAPI, SBOM, Deploy, Drift templates
6. ❌ **Conflict Detection UX** - No conflict visualization

---

## 🔧 PHASE 3A: Fix Part A Gaps (5-8 hours)

### **Task 3A.1: Implement Merge Strategy Support** (P0 - 2-3 hours)

#### Current State
- ✅ Database field: `scopeMergeStrategy` (MergeStrategy enum)
- ✅ TypeScript types: `MergeStrategy = 'MOST_RESTRICTIVE' | 'HIGHEST_PRIORITY' | 'EXPLICIT'`
- ❌ Logic: Always uses "most_restrictive" (hardcoded in `computeGlobalDecision()`)

#### Integration Points
**File**: `apps/api/src/services/gatekeeper/yaml-dsl/yamlGatekeeperIntegration.ts`
- Lines 182-199: `computeGlobalDecision()` function
- Lines 76-151: Pack evaluation loop (where we collect `packResults`)

#### Implementation Strategy

**Step 1**: Extract merge strategy from packs (5 min)
```typescript
// In yamlGatekeeperIntegration.ts, line 154
const mergeStrategies = new Set(
  packResults.map(pr => pr.pack.metadata.scopeMergeStrategy || 'MOST_RESTRICTIVE')
);
```

**Step 2**: Validate merge strategy consistency (10 min)
```typescript
// Check for conflicts
if (mergeStrategies.size > 1) {
  // If any pack uses EXPLICIT, require all to use same strategy
  if (mergeStrategies.has('EXPLICIT')) {
    throw new Error(
      `Conflicting merge strategies detected. ` +
      `When using EXPLICIT mode, all packs must use the same strategy. ` +
      `Found: ${Array.from(mergeStrategies).join(', ')}`
    );
  }
  // Otherwise, use MOST_RESTRICTIVE as fallback
  console.warn(
    `[YAMLGatekeeper] Multiple merge strategies detected, using MOST_RESTRICTIVE`
  );
}
```

**Step 3**: Implement strategy-specific aggregation (60-90 min)
```typescript
function computeGlobalDecision(packResults: PackResult[]): 'pass' | 'warn' | 'block' {
  if (packResults.length === 0) return 'pass';
  
  // Get merge strategy (validated to be consistent)
  const strategy = packResults[0].pack.metadata.scopeMergeStrategy || 'MOST_RESTRICTIVE';
  
  switch (strategy) {
    case 'MOST_RESTRICTIVE':
      return computeMostRestrictive(packResults);
    
    case 'HIGHEST_PRIORITY':
      return computeHighestPriority(packResults);
    
    case 'EXPLICIT':
      return computeExplicit(packResults);
    
    default:
      return computeMostRestrictive(packResults);
  }
}

function computeMostRestrictive(packResults: PackResult[]): 'pass' | 'warn' | 'block' {
  // Current logic - any BLOCK → BLOCK, else any WARN → WARN, else PASS
  for (const pr of packResults) {
    if (pr.result.decision === 'block') return 'block';
  }
  for (const pr of packResults) {
    if (pr.result.decision === 'warn') return 'warn';
  }
  return 'pass';
}

function computeHighestPriority(packResults: PackResult[]): 'pass' | 'warn' | 'block' {
  // Sort by priority (highest first)
  const sorted = [...packResults].sort((a, b) => {
    const priorityA = a.pack.metadata.scopePriority || 50;
    const priorityB = b.pack.metadata.scopePriority || 50;
    return priorityB - priorityA;
  });
  
  // Return decision from highest priority pack
  return sorted[0].result.decision;
}

function computeExplicit(packResults: PackResult[]): 'pass' | 'warn' | 'block' {
  // Check for conflicts (different decisions from different packs)
  const decisions = new Set(packResults.map(pr => pr.result.decision));
  
  if (decisions.size > 1) {
    // Conflict detected - require explicit resolution
    throw new Error(
      `Explicit conflict resolution required. ` +
      `Multiple packs returned different decisions: ${Array.from(decisions).join(', ')}. ` +
      `Please adjust pack priorities or narrow pack scopes to resolve conflict.`
    );
  }
  
  // All packs agree - return the decision
  return packResults[0].result.decision;
}
```

**Step 4**: Add tests (30-45 min)
```typescript
// apps/api/src/__tests__/yaml-dsl/merge-strategy.test.ts
describe('Merge Strategy Support', () => {
  it('should use MOST_RESTRICTIVE by default', () => {
    const packResults = [
      createPackResult('Pack A', 'pass', 'MOST_RESTRICTIVE'),
      createPackResult('Pack B', 'warn', 'MOST_RESTRICTIVE'),
    ];
    expect(computeGlobalDecision(packResults)).toBe('warn');
  });
  
  it('should use HIGHEST_PRIORITY when specified', () => {
    const packResults = [
      createPackResult('Pack A', 'block', 'HIGHEST_PRIORITY', 100),
      createPackResult('Pack B', 'pass', 'HIGHEST_PRIORITY', 50),
    ];
    expect(computeGlobalDecision(packResults)).toBe('block');
  });
  
  it('should throw on EXPLICIT conflicts', () => {
    const packResults = [
      createPackResult('Pack A', 'block', 'EXPLICIT'),
      createPackResult('Pack B', 'pass', 'EXPLICIT'),
    ];
    expect(() => computeGlobalDecision(packResults)).toThrow('Explicit conflict');
  });
});
```

#### Effort Breakdown
- Strategy extraction & validation: 15 min
- MOST_RESTRICTIVE (already exists): 0 min
- HIGHEST_PRIORITY implementation: 60 min
- EXPLICIT implementation: 30 min
- Tests: 45 min
- **Total: 2.5 hours**

#### Risk Assessment
- **Low Risk**: Logic is isolated to decision aggregation
- **Mitigation**: Comprehensive tests for all 3 strategies
- **Rollback**: Easy - just revert to hardcoded MOST_RESTRICTIVE

---

### **Task 3A.2: Implement Priority-Based Selection** (P1 - 1-2 hours)

#### Current State
- ✅ Database field: `scopePriority` (integer, default 50)
- ✅ PackMatcher service: Sorts by priority (lines 37-40)
- ❌ PackSelector service: Ignores priority, only uses scope type precedence

#### Integration Points
**File**: `apps/api/src/services/gatekeeper/yaml-dsl/packSelector.ts`
- Lines 107-128: Pack aggregation logic (currently only uses scope type)
- Lines 172-189: `sortPacksByVersion()` function (needs priority sorting)

**File**: `apps/api/src/services/gatekeeper/yaml-dsl/packMatcher.ts`
- Lines 29-43: `findApplicablePacks()` - Already implements priority sorting ✅

#### Implementation Strategy

**Step 1**: Replace packSelector with packMatcher (30-45 min)

The good news: **PackMatcher already implements priority-based selection correctly!** We just need to integrate it.

```typescript
// In packSelector.ts, add import
import { PackMatcher, PackMatchContext } from './packMatcher.js';

// Replace selectApplicablePacks() implementation
export async function selectApplicablePacks(
  prisma: PrismaClient,
  workspaceId: string,
  owner: string,
  repo: string,
  branch: string
): Promise<SelectedPack[]> {
  const fullRepo = `${owner}/${repo}`;

  // 1. Find all published packs for this workspace
  const allPacks = await prisma.workspacePolicyPack.findMany({
    where: {
      workspaceId,
      packStatus: 'published',
      trackAEnabled: true,
      trackAConfigYamlPublished: { not: null },
    },
  });

  if (allPacks.length === 0) {
    return [];
  }

  // 2. Parse YAML packs
  const yaml = require('yaml');
  const parsedPacks: Array<{ pack: PackYAML; dbPack: any }> = [];

  for (const dbPack of allPacks) {
    try {
      let pack: PackYAML = yaml.parse(dbPack.trackAConfigYamlPublished!);
      pack = enhancePackWithConditions(pack);
      parsedPacks.push({ pack, dbPack });
    } catch (error) {
      console.error(`[PackSelector] Failed to parse pack ${dbPack.id}:`, error);
    }
  }

  // 3. Use PackMatcher to find applicable packs (priority-based)
  const matcher = new PackMatcher();
  const context: PackMatchContext = {
    repository: fullRepo,
    branch,
  };

  const applicablePacks = matcher.findApplicablePacks(
    parsedPacks.map(p => p.pack),
    context
  );

  // 4. Map back to SelectedPack format
  const result: SelectedPack[] = applicablePacks.map(ap => {
    const dbPack = parsedPacks.find(p => p.pack === ap.pack)!.dbPack;
    return {
      pack: ap.pack,
      packHash: dbPack.trackAPackHashPublished!,
      dbId: dbPack.id,
      publishedAt: dbPack.publishedAt,
      source: ap.pack.scope.type as 'repo' | 'service' | 'workspace',
    };
  });

  return result;
}
```

**Step 2**: Update tests (30 min)
```typescript
// apps/api/src/__tests__/yaml-dsl/priority-selection.test.ts
describe('Priority-Based Pack Selection', () => {
  it('should select high-priority workspace pack over low-priority repo pack', async () => {
    // Create workspace pack with priority 100
    await createPack({
      scopeType: 'workspace',
      scopePriority: 100,
      name: 'High Priority Workspace',
    });

    // Create repo pack with priority 30
    await createPack({
      scopeType: 'repo',
      scopeRef: 'owner/repo',
      scopePriority: 30,
      name: 'Low Priority Repo',
    });

    const packs = await selectApplicablePacks(prisma, workspaceId, 'owner', 'repo', 'main');

    // High-priority workspace pack should come first
    expect(packs[0].pack.metadata.name).toBe('High Priority Workspace');
    expect(packs[1].pack.metadata.name).toBe('Low Priority Repo');
  });

  it('should use priority as tie-breaker within same scope type', async () => {
    // Create two workspace packs with different priorities
    await createPack({ scopeType: 'workspace', scopePriority: 80, name: 'Pack A' });
    await createPack({ scopeType: 'workspace', scopePriority: 60, name: 'Pack B' });

    const packs = await selectApplicablePacks(prisma, workspaceId, 'owner', 'repo', 'main');

    expect(packs[0].pack.metadata.name).toBe('Pack A'); // Higher priority first
  });
});
```

#### Effort Breakdown
- Replace packSelector with packMatcher: 45 min
- Update tests: 30 min
- Integration testing: 15 min
- **Total: 1.5 hours**

#### Risk Assessment
- **Medium Risk**: Changes core pack selection logic
- **Mitigation**: PackMatcher is already tested, just integrating it
- **Rollback**: Revert to old packSelector logic

---

### **Task 3A.3: Integrate PackMatcher Service** (P2 - 2-3 hours)

#### Current State
- ✅ PackMatcher service exists (163 lines, fully implemented)
- ❌ Not used in main evaluation flow
- ❌ Code duplication between packSelector and packMatcher

#### Integration Points
This task is **already completed** by Task 3A.2! By replacing packSelector with packMatcher, we eliminate the code duplication.

**Additional cleanup needed**:
1. Remove duplicate logic from packSelector.ts (lines 133-155)
2. Update documentation to reference packMatcher as canonical
3. Add integration tests

#### Implementation Strategy

**Step 1**: Clean up packSelector.ts (15 min)
```typescript
// Remove packApplies() function (lines 133-155)
// It's now handled by PackMatcher.matchesPack()

// Keep only:
// - selectApplicablePack() - for backward compatibility
// - selectApplicablePacks() - now delegates to PackMatcher
```

**Step 2**: Update documentation (15 min)
```markdown
# Pack Selection Architecture

## PackMatcher (Canonical)
- **File**: `packMatcher.ts`
- **Purpose**: Find applicable packs using priority + scope matching
- **Used by**: `packSelector.ts`, future UI components

## PackSelector (Adapter)
- **File**: `packSelector.ts`
- **Purpose**: Database query + PackMatcher integration
- **Used by**: `yamlGatekeeperIntegration.ts`
```

**Step 3**: Add integration tests (60 min)
```typescript
// apps/api/src/__tests__/yaml-dsl/pack-matcher-integration.test.ts
describe('PackMatcher Integration', () => {
  it('should match workspace packs to all repos', () => {
    const pack = createWorkspacePack({ priority: 50 });
    const context = { repository: 'owner/repo', branch: 'main' };

    const matches = packMatcher.findApplicablePacks([pack], context);
    expect(matches).toHaveLength(1);
  });

  it('should filter by branch patterns', () => {
    const pack = createWorkspacePack({
      branches: { include: ['main', 'release/*'] }
    });

    expect(packMatcher.findApplicablePacks([pack], { repository: 'owner/repo', branch: 'main' }))
      .toHaveLength(1);
    expect(packMatcher.findApplicablePacks([pack], { repository: 'owner/repo', branch: 'feature/xyz' }))
      .toHaveLength(0);
  });

  it('should filter by repo patterns', () => {
    const pack = createWorkspacePack({
      repos: { include: ['owner/*'], exclude: ['owner/internal-*'] }
    });

    expect(packMatcher.findApplicablePacks([pack], { repository: 'owner/public', branch: 'main' }))
      .toHaveLength(1);
    expect(packMatcher.findApplicablePacks([pack], { repository: 'owner/internal-api', branch: 'main' }))
      .toHaveLength(0);
  });
});
```

#### Effort Breakdown
- Code cleanup: 15 min
- Documentation: 15 min
- Integration tests: 60 min
- **Total: 1.5 hours**

#### Risk Assessment
- **Low Risk**: Cleanup only, no new logic
- **Mitigation**: Tests ensure PackMatcher works correctly
- **Rollback**: N/A (cleanup is safe)

---

## 📊 PHASE 3A Summary

| Task | Priority | Effort | Risk | Status |
|------|----------|--------|------|--------|
| 3A.1: Merge Strategy | P0 | 2.5h | Low | Not Started |
| 3A.2: Priority Selection | P1 | 1.5h | Medium | Not Started |
| 3A.3: PackMatcher Integration | P2 | 1.5h | Low | Not Started |
| **TOTAL** | - | **5.5h** | - | - |

**Dependencies**: None (can start immediately)
**Outcome**: Multi-pack infrastructure 100% complete (8/8 requirements)

---

## 🎯 PHASE 3B: Critical Part B Gaps (16-23 hours)

### **Task 3B.1: Implement Effective Policy View** (P0 - 8-12 hours)

This is the **#1 enterprise trust feature**. Organizations need to see:
1. Which packs apply to a specific repo/branch
2. What the merged/aggregated rules are
3. Why a decision was made (pack priority + merge strategy + rule overrides)

#### Current State
- ✅ Backend: Pack selection logic exists
- ✅ Backend: Decision aggregation exists
- ❌ UI: No way to preview effective policy
- ❌ Backend: No API endpoint for effective policy calculation

#### Integration Points

**New Backend Endpoint**: `apps/api/src/routes/policyPacks.ts`
```typescript
// POST /api/workspaces/:workspaceId/policy-packs/effective-policy
router.post('/:workspaceId/policy-packs/effective-policy', async (req, res) => {
  const { workspaceId } = req.params;
  const { repository, branch } = req.body;

  // Use existing pack selection logic
  const [owner, repo] = repository.split('/');
  const packs = await selectApplicablePacks(prisma, workspaceId, owner, repo, branch);

  // Compute effective policy
  const effectivePolicy = computeEffectivePolicy(packs);

  res.json(effectivePolicy);
});
```

**New UI Component**: `apps/web/src/components/policyPacks/EffectivePolicyView.tsx`

#### Implementation Strategy

**Step 1**: Create backend service (2-3 hours)

```typescript
// apps/api/src/services/gatekeeper/yaml-dsl/effectivePolicyComputer.ts

export interface EffectivePolicy {
  applicablePacks: Array<{
    packId: string;
    packName: string;
    priority: number;
    scopeType: 'workspace' | 'service' | 'repo';
    mergeStrategy: MergeStrategy;
  }>;
  mergedRules: Array<{
    ruleId: string;
    ruleName: string;
    sourcePacks: string[]; // Pack names that contributed this rule
    trigger: any;
    obligations: any[];
    effectiveDecision: 'pass' | 'warn' | 'block';
    conflictResolution?: string; // How conflicts were resolved
  }>;
  mergeStrategy: MergeStrategy;
  explanation: {
    packSelectionReason: string;
    mergeStrategyUsed: string;
    conflictsDetected: Array<{
      ruleId: string;
      conflictingPacks: string[];
      resolution: string;
    }>;
  };
}

export function computeEffectivePolicy(packs: SelectedPack[]): EffectivePolicy {
  const applicablePacks = packs.map(p => ({
    packId: p.dbId,
    packName: p.pack.metadata.name,
    priority: p.pack.metadata.scopePriority || 50,
    scopeType: p.pack.scope.type,
    mergeStrategy: p.pack.metadata.scopeMergeStrategy || 'MOST_RESTRICTIVE',
  }));

  // Get merge strategy (validated to be consistent)
  const mergeStrategy = packs[0]?.pack.metadata.scopeMergeStrategy || 'MOST_RESTRICTIVE';

  // Merge rules from all packs
  const mergedRules = mergeRules(packs, mergeStrategy);

  // Build explanation
  const explanation = buildExplanation(packs, mergedRules, mergeStrategy);

  return {
    applicablePacks,
    mergedRules,
    mergeStrategy,
    explanation,
  };
}

function mergeRules(packs: SelectedPack[], strategy: MergeStrategy): any[] {
  const ruleMap = new Map<string, any>();

  for (const pack of packs) {
    for (const rule of pack.pack.rules) {
      const ruleId = rule.id;

      if (!ruleMap.has(ruleId)) {
        // First time seeing this rule
        ruleMap.set(ruleId, {
          ruleId: rule.id,
          ruleName: rule.name,
          sourcePacks: [pack.pack.metadata.name],
          trigger: rule.trigger,
          obligations: rule.obligations,
          effectiveDecision: computeRuleDecision(rule),
        });
      } else {
        // Rule exists in multiple packs - handle conflict
        const existing = ruleMap.get(ruleId)!;
        existing.sourcePacks.push(pack.pack.metadata.name);

        // Merge based on strategy
        if (strategy === 'MOST_RESTRICTIVE') {
          const newDecision = computeRuleDecision(rule);
          if (isMoreRestrictive(newDecision, existing.effectiveDecision)) {
            existing.effectiveDecision = newDecision;
            existing.conflictResolution = `Used more restrictive decision from ${pack.pack.metadata.name}`;
          }
        } else if (strategy === 'HIGHEST_PRIORITY') {
          // First pack wins (already sorted by priority)
          existing.conflictResolution = `Used decision from highest priority pack: ${existing.sourcePacks[0]}`;
        } else if (strategy === 'EXPLICIT') {
          // Check for conflicts
          const newDecision = computeRuleDecision(rule);
          if (newDecision !== existing.effectiveDecision) {
            throw new Error(
              `Explicit conflict: Rule ${ruleId} has different decisions in packs: ${existing.sourcePacks.join(', ')}`
            );
          }
        }
      }
    }
  }

  return Array.from(ruleMap.values());
}

function computeRuleDecision(rule: any): 'pass' | 'warn' | 'block' {
  // Compute most restrictive decision from all obligations
  let decision: 'pass' | 'warn' | 'block' = 'pass';

  for (const obl of rule.obligations) {
    const failDecision = obl.decisionOnFail || 'warn';
    if (failDecision === 'block') {
      decision = 'block';
    } else if (failDecision === 'warn' && decision !== 'block') {
      decision = 'warn';
    }
  }

  return decision;
}

function isMoreRestrictive(a: string, b: string): boolean {
  const order = { block: 3, warn: 2, pass: 1 };
  return order[a as keyof typeof order] > order[b as keyof typeof order];
}

function buildExplanation(packs: SelectedPack[], rules: any[], strategy: MergeStrategy): any {
  return {
    packSelectionReason: `Selected ${packs.length} applicable pack(s) based on scope matching and priority`,
    mergeStrategyUsed: strategy,
    conflictsDetected: rules
      .filter(r => r.conflictResolution)
      .map(r => ({
        ruleId: r.ruleId,
        conflictingPacks: r.sourcePacks,
        resolution: r.conflictResolution,
      })),
  };
}
```

**Step 2**: Create API endpoint (1 hour)

```typescript
// apps/api/src/routes/policyPacks.ts

import { computeEffectivePolicy } from '../services/gatekeeper/yaml-dsl/effectivePolicyComputer.js';

router.post('/:workspaceId/policy-packs/effective-policy', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { repository, branch } = req.body;

    // Validate input
    if (!repository || !branch) {
      return res.status(400).json({ error: 'repository and branch are required' });
    }

    const [owner, repo] = repository.split('/');
    if (!owner || !repo) {
      return res.status(400).json({ error: 'repository must be in format owner/repo' });
    }

    // Get applicable packs
    const packs = await selectApplicablePacks(prisma, workspaceId, owner, repo, branch);

    // Compute effective policy
    const effectivePolicy = computeEffectivePolicy(packs);

    res.json(effectivePolicy);
  } catch (error: any) {
    console.error('[EffectivePolicy] Error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

**Step 3**: Create UI component (4-6 hours)

```typescript
// apps/web/src/components/policyPacks/EffectivePolicyView.tsx

import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Info, Shield } from 'lucide-react';

interface EffectivePolicyViewProps {
  workspaceId: string;
}

export function EffectivePolicyView({ workspaceId }: EffectivePolicyViewProps) {
  const [repository, setRepository] = useState('');
  const [branch, setBranch] = useState('main');
  const [effectivePolicy, setEffectivePolicy] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEffectivePolicy = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/policy-packs/effective-policy`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repository, branch }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch effective policy');
      }

      const data = await response.json();
      setEffectivePolicy(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Input Form */}
      <div className="bg-white p-6 rounded-lg border">
        <h3 className="text-lg font-semibold mb-4">Preview Effective Policy</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Repository</label>
            <input
              type="text"
              value={repository}
              onChange={(e) => setRepository(e.target.value)}
              placeholder="owner/repo"
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Branch</label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="w-full px-3 py-2 border rounded"
            />
          </div>
        </div>
        <button
          onClick={fetchEffectivePolicy}
          disabled={!repository || loading}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Preview Policy'}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
          <div>
            <p className="font-medium text-red-900">Error</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Effective Policy Display */}
      {effectivePolicy && (
        <div className="space-y-6">
          {/* Applicable Packs */}
          <div className="bg-white p-6 rounded-lg border">
            <h4 className="text-md font-semibold mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Applicable Packs ({effectivePolicy.applicablePacks.length})
            </h4>
            <div className="space-y-3">
              {effectivePolicy.applicablePacks.map((pack: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <div>
                    <p className="font-medium">{pack.packName}</p>
                    <p className="text-sm text-gray-600">
                      {pack.scopeType} • Priority: {pack.priority}
                    </p>
                  </div>
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                    {pack.mergeStrategy}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Merged Rules */}
          <div className="bg-white p-6 rounded-lg border">
            <h4 className="text-md font-semibold mb-4">
              Merged Rules ({effectivePolicy.mergedRules.length})
            </h4>
            <div className="space-y-4">
              {effectivePolicy.mergedRules.map((rule: any, idx: number) => (
                <div key={idx} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium">{rule.ruleName}</p>
                      <p className="text-sm text-gray-600">
                        From: {rule.sourcePacks.join(', ')}
                      </p>
                    </div>
                    <DecisionBadge decision={rule.effectiveDecision} />
                  </div>
                  {rule.conflictResolution && (
                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                      <Info className="w-4 h-4 inline mr-1" />
                      {rule.conflictResolution}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Explanation */}
          <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
            <h4 className="text-md font-semibold mb-3">How This Policy Was Computed</h4>
            <div className="space-y-2 text-sm">
              <p><strong>Pack Selection:</strong> {effectivePolicy.explanation.packSelectionReason}</p>
              <p><strong>Merge Strategy:</strong> {effectivePolicy.explanation.mergeStrategyUsed}</p>
              {effectivePolicy.explanation.conflictsDetected.length > 0 && (
                <div className="mt-3">
                  <p className="font-medium">Conflicts Resolved:</p>
                  <ul className="list-disc list-inside ml-2 mt-1">
                    {effectivePolicy.explanation.conflictsDetected.map((c: any, idx: number) => (
                      <li key={idx}>{c.resolution}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DecisionBadge({ decision }: { decision: 'pass' | 'warn' | 'block' }) {
  const styles = {
    pass: 'bg-green-100 text-green-800',
    warn: 'bg-yellow-100 text-yellow-800',
    block: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded ${styles[decision]}`}>
      {decision.toUpperCase()}
    </span>
  );
}
```

#### Effort Breakdown
- Backend service (effectivePolicyComputer.ts): 2-3 hours
- API endpoint: 1 hour
- UI component: 4-6 hours
- Integration testing: 1-2 hours
- **Total: 8-12 hours**

#### Risk Assessment
- **Medium Risk**: Complex logic for rule merging
- **Mitigation**: Comprehensive tests for all merge strategies
- **Rollback**: Feature is additive, can be disabled

---

### **Task 3B.2: Add OpenAPI Diff Facts + Comparators** (P0 - 6-8 hours)

#### Current State
- ✅ OpenAPI infrastructure exists:
  - `openapiBreakingChanges.ts` - Breaking change detection
  - `openapiValidate.ts` - OpenAPI validation comparator
  - `openapiDiff.ts` - OpenAPI diff comparator
  - `openApiParser.ts` - YAML/JSON parsing
- ✅ Fact catalog pattern exists (19 facts registered)
- ❌ Missing 12 OpenAPI facts from canonical spec

#### Missing Facts (from canonical spec D2)
```typescript
// D2: OpenAPI Diff Facts (12 facts)
'openapi.changed'                    // boolean
'openapi.breakingChanges.count'      // number
'openapi.breakingChanges.types'      // string[]
'openapi.nonBreakingChanges.count'   // number
'openapi.endpointsAdded.count'       // number
'openapi.endpointsRemoved.count'     // number
'openapi.endpointsModified.count'    // number
'openapi.schemasAdded.count'         // number
'openapi.schemasRemoved.count'       // number
'openapi.version.before'             // string
'openapi.version.after'              // string
'openapi.versionBumpRequired'        // 'major' | 'minor' | 'patch' | 'none'
```

#### Integration Points
**File**: `apps/api/src/services/gatekeeper/yaml-dsl/facts/catalog.ts`
- Lines 50-348: Fact catalog with registration
- Need to add OpenAPI category

**File**: `apps/api/src/services/gatekeeper/yaml-dsl/facts/resolver.ts`
- Lines 40-150: Fact resolution logic
- Need to add OpenAPI fact resolvers

#### Implementation Strategy

**Step 1**: Add OpenAPI facts to catalog (1-2 hours)

```typescript
// In catalog.ts, add OpenAPI category

// D2: OpenAPI Diff Facts (12 facts)
registerFact({
  id: 'openapi.changed',
  category: 'openapi',
  type: 'boolean',
  description: 'Whether any OpenAPI spec file was changed in this PR',
  version: '1.0.0',
});

registerFact({
  id: 'openapi.breakingChanges.count',
  category: 'openapi',
  type: 'number',
  description: 'Number of breaking changes detected in OpenAPI spec',
  version: '1.0.0',
});

registerFact({
  id: 'openapi.breakingChanges.types',
  category: 'openapi',
  type: 'array',
  description: 'Types of breaking changes (e.g., endpoint_removed, parameter_type_changed)',
  version: '1.0.0',
});

registerFact({
  id: 'openapi.nonBreakingChanges.count',
  category: 'openapi',
  type: 'number',
  description: 'Number of non-breaking changes detected in OpenAPI spec',
  version: '1.0.0',
});

registerFact({
  id: 'openapi.endpointsAdded.count',
  category: 'openapi',
  type: 'number',
  description: 'Number of endpoints added',
  version: '1.0.0',
});

registerFact({
  id: 'openapi.endpointsRemoved.count',
  category: 'openapi',
  type: 'number',
  description: 'Number of endpoints removed',
  version: '1.0.0',
});

registerFact({
  id: 'openapi.endpointsModified.count',
  category: 'openapi',
  type: 'number',
  description: 'Number of endpoints modified',
  version: '1.0.0',
});

registerFact({
  id: 'openapi.schemasAdded.count',
  category: 'openapi',
  type: 'number',
  description: 'Number of schemas added',
  version: '1.0.0',
});

registerFact({
  id: 'openapi.schemasRemoved.count',
  category: 'openapi',
  type: 'number',
  description: 'Number of schemas removed',
  version: '1.0.0',
});

registerFact({
  id: 'openapi.version.before',
  category: 'openapi',
  type: 'string',
  description: 'OpenAPI spec version before changes',
  version: '1.0.0',
});

registerFact({
  id: 'openapi.version.after',
  category: 'openapi',
  type: 'string',
  description: 'OpenAPI spec version after changes',
  version: '1.0.0',
});

registerFact({
  id: 'openapi.versionBumpRequired',
  category: 'openapi',
  type: 'string',
  description: 'Required version bump based on changes (major, minor, patch, none)',
  version: '1.0.0',
});
```

**Step 2**: Implement OpenAPI fact resolvers (3-4 hours)

```typescript
// In resolver.ts, add OpenAPI resolution logic

import { detectBreakingChanges, detectNonBreakingChanges } from '../comparators/openapi/openapiBreakingChanges.js';
import { parseOpenApiSpec } from '../../../../signals/openApiParser.js';
import { determineRequiredBump } from '../../../contracts/comparators/semverUtils.js';

async function resolveOpenAPIFacts(context: PRContext): Promise<Map<string, any>> {
  const facts = new Map<string, any>();

  // Find OpenAPI files in changed files
  const openApiFiles = context.files.filter(f =>
    f.filename.includes('openapi') ||
    f.filename.endsWith('.openapi.yaml') ||
    f.filename.endsWith('.openapi.json') ||
    f.filename === 'openapi.yaml' ||
    f.filename === 'openapi.json'
  );

  // openapi.changed
  facts.set('openapi.changed', openApiFiles.length > 0);

  if (openApiFiles.length === 0) {
    // No OpenAPI changes - set all counts to 0
    facts.set('openapi.breakingChanges.count', 0);
    facts.set('openapi.breakingChanges.types', []);
    facts.set('openapi.nonBreakingChanges.count', 0);
    facts.set('openapi.endpointsAdded.count', 0);
    facts.set('openapi.endpointsRemoved.count', 0);
    facts.set('openapi.endpointsModified.count', 0);
    facts.set('openapi.schemasAdded.count', 0);
    facts.set('openapi.schemasRemoved.count', 0);
    facts.set('openapi.version.before', null);
    facts.set('openapi.version.after', null);
    facts.set('openapi.versionBumpRequired', 'none');
    return facts;
  }

  // Fetch base and head versions of first OpenAPI file
  const file = openApiFiles[0];

  try {
    // Fetch base version
    const baseResponse = await context.github.rest.repos.getContent({
      owner: context.owner,
      repo: context.repo,
      path: file.filename,
      ref: context.baseSha,
    });

    // Fetch head version
    const headResponse = await context.github.rest.repos.getContent({
      owner: context.owner,
      repo: context.repo,
      path: file.filename,
      ref: context.headSha,
    });

    if ('content' in baseResponse.data && 'content' in headResponse.data) {
      const baseContent = Buffer.from(baseResponse.data.content, 'base64').toString('utf-8');
      const headContent = Buffer.from(headResponse.data.content, 'base64').toString('utf-8');

      const baseSpec = parseOpenApiSpec(baseContent);
      const headSpec = parseOpenApiSpec(headContent);

      if (baseSpec && headSpec) {
        // Extract OpenApiData format
        const baseData = extractOpenApiData(baseSpec);
        const headData = extractOpenApiData(headSpec);

        // Detect changes
        const breakingChanges = detectBreakingChanges(baseData, headData);
        const nonBreakingChanges = detectNonBreakingChanges(baseData, headData);

        // Set facts
        facts.set('openapi.breakingChanges.count', breakingChanges.length);
        facts.set('openapi.breakingChanges.types', [...new Set(breakingChanges.map(c => c.type))]);
        facts.set('openapi.nonBreakingChanges.count', nonBreakingChanges.length);

        // Count endpoint changes
        const endpointsAdded = breakingChanges.filter(c => c.type === 'endpoint_added').length +
                               nonBreakingChanges.filter(c => c.type === 'endpoint_added').length;
        const endpointsRemoved = breakingChanges.filter(c => c.type === 'endpoint_removed').length;
        const endpointsModified = breakingChanges.filter(c => c.type.includes('parameter')).length +
                                  nonBreakingChanges.filter(c => c.type.includes('parameter')).length;

        facts.set('openapi.endpointsAdded.count', endpointsAdded);
        facts.set('openapi.endpointsRemoved.count', endpointsRemoved);
        facts.set('openapi.endpointsModified.count', endpointsModified);

        // Count schema changes
        const schemasAdded = nonBreakingChanges.filter(c => c.type === 'schema_added').length;
        const schemasRemoved = breakingChanges.filter(c => c.type === 'schema_removed').length;

        facts.set('openapi.schemasAdded.count', schemasAdded);
        facts.set('openapi.schemasRemoved.count', schemasRemoved);

        // Version info
        facts.set('openapi.version.before', baseSpec.info?.version || null);
        facts.set('openapi.version.after', headSpec.info?.version || null);

        // Determine required version bump
        const allChanges = [...breakingChanges, ...nonBreakingChanges];
        const requiredBump = determineRequiredBump(allChanges);
        facts.set('openapi.versionBumpRequired', requiredBump);
      }
    }
  } catch (error) {
    console.error('[FactResolver] Failed to resolve OpenAPI facts:', error);
    // Set default values on error
    facts.set('openapi.breakingChanges.count', 0);
    facts.set('openapi.breakingChanges.types', []);
    facts.set('openapi.nonBreakingChanges.count', 0);
    facts.set('openapi.endpointsAdded.count', 0);
    facts.set('openapi.endpointsRemoved.count', 0);
    facts.set('openapi.endpointsModified.count', 0);
    facts.set('openapi.schemasAdded.count', 0);
    facts.set('openapi.schemasRemoved.count', 0);
    facts.set('openapi.version.before', null);
    facts.set('openapi.version.after', null);
    facts.set('openapi.versionBumpRequired', 'none');
  }

  return facts;
}

function extractOpenApiData(spec: any): OpenApiData {
  // Convert OpenAPI spec to OpenApiData format
  const endpoints: OpenApiEndpoint[] = [];
  const schemas: OpenApiSchema[] = [];

  // Extract endpoints from paths
  if (spec.paths) {
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(pathItem as any)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          endpoints.push({
            path,
            method: method.toUpperCase(),
            operationId: operation.operationId,
            parameters: operation.parameters || [],
            deprecated: operation.deprecated || false,
          });
        }
      }
    }
  }

  // Extract schemas from components
  if (spec.components?.schemas) {
    for (const [name, schema] of Object.entries(spec.components.schemas)) {
      schemas.push({
        name,
        type: (schema as any).type,
        required: (schema as any).required || [],
        properties: (schema as any).properties || {},
      });
    }
  }

  return { endpoints, schemas, examples: [] };
}
```

**Step 3**: Add tests (1-2 hours)

```typescript
// apps/api/src/__tests__/yaml-dsl/openapi-facts.test.ts
describe('OpenAPI Facts', () => {
  it('should detect OpenAPI changes', async () => {
    const context = createPRContext({
      files: [{ filename: 'openapi.yaml', status: 'modified' }],
    });

    const facts = await resolveAllFacts(context);
    expect(facts.get('openapi.changed')).toBe(true);
  });

  it('should count breaking changes', async () => {
    // Mock GitHub API to return base and head OpenAPI specs
    mockGitHubContent('openapi.yaml', baseSpec, headSpec);

    const context = createPRContext({
      files: [{ filename: 'openapi.yaml', status: 'modified' }],
    });

    const facts = await resolveAllFacts(context);
    expect(facts.get('openapi.breakingChanges.count')).toBeGreaterThan(0);
  });

  it('should determine required version bump', async () => {
    mockGitHubContent('openapi.yaml', baseSpec, headSpecWithBreaking);

    const context = createPRContext({
      files: [{ filename: 'openapi.yaml', status: 'modified' }],
    });

    const facts = await resolveAllFacts(context);
    expect(facts.get('openapi.versionBumpRequired')).toBe('major');
  });
});
```

#### Effort Breakdown
- Add facts to catalog: 1 hour
- Implement resolvers: 3-4 hours
- Tests: 1-2 hours
- Integration: 1 hour
- **Total: 6-8 hours**

#### Risk Assessment
- **Medium Risk**: Depends on GitHub API for file fetching
- **Mitigation**: Graceful error handling, default values on failure
- **Rollback**: Facts are additive, can be disabled

---

### **Task 3B.3: Add Missing Universal/PR Facts** (P1 - 2-3 hours)

#### Missing Facts (from canonical spec D1)
```typescript
// D1: Universal Facts - Missing 2
'time.dayOfWeek'     // string (Monday, Tuesday, etc.)
'time.hour'          // number (0-23)

// D1: PR Facts - Missing 3
'pr.reviewers.count'        // number
'pr.reviewers.users'        // string[]
'pr.comments.count'         // number
```

#### Implementation Strategy

This is straightforward - just add 5 more facts to the catalog and implement simple resolvers.

```typescript
// In catalog.ts
registerFact({
  id: 'time.dayOfWeek',
  category: 'universal',
  type: 'string',
  description: 'Day of week when PR was created (Monday, Tuesday, etc.)',
  version: '1.0.0',
});

registerFact({
  id: 'time.hour',
  category: 'universal',
  type: 'number',
  description: 'Hour of day when PR was created (0-23)',
  version: '1.0.0',
});

// ... similar for pr.reviewers.count, pr.reviewers.users, pr.comments.count
```

```typescript
// In resolver.ts
function resolveUniversalFacts(context: PRContext): Map<string, any> {
  const facts = new Map<string, any>();

  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  facts.set('time.dayOfWeek', days[now.getDay()]);
  facts.set('time.hour', now.getHours());

  return facts;
}

async function resolvePRFacts(context: PRContext): Promise<Map<string, any>> {
  const facts = new Map<string, any>();

  // Fetch PR details from GitHub API
  const pr = await context.github.rest.pulls.get({
    owner: context.owner,
    repo: context.repo,
    pull_number: context.prNumber,
  });

  facts.set('pr.reviewers.count', pr.data.requested_reviewers?.length || 0);
  facts.set('pr.reviewers.users', pr.data.requested_reviewers?.map(r => r.login) || []);

  // Fetch comments
  const comments = await context.github.rest.issues.listComments({
    owner: context.owner,
    repo: context.repo,
    issue_number: context.prNumber,
  });

  facts.set('pr.comments.count', comments.data.length);

  return facts;
}
```

#### Effort Breakdown
- Add facts to catalog: 30 min
- Implement resolvers: 1 hour
- Tests: 1 hour
- **Total: 2.5 hours**

---

## 📊 PHASE 3B Summary

| Task | Priority | Effort | Risk | Status |
|------|----------|--------|------|--------|
| 3B.1: Effective Policy View | P0 | 8-12h | Medium | Not Started |
| 3B.2: OpenAPI Facts | P0 | 6-8h | Medium | Not Started |
| 3B.3: Universal/PR Facts | P1 | 2-3h | Low | Not Started |
| **TOTAL** | - | **16-23h** | - | - |

**Dependencies**: Phase 3A (merge strategy needed for effective policy view)
**Outcome**: Critical Part B gaps closed, fact catalog at 36/68 (53%)

---

## 🔧 PHASE 3C: Extended Part B (12-17 hours)

### **Task 3C.1: Add SBOM/CVE Facts + Template A7** (P1 - 4-6 hours)

#### Missing Facts (from canonical spec D5)
```typescript
// D5: SBOM Facts (6 facts)
'sbom.packages.count'           // number
'sbom.packages.added.count'     // number
'sbom.packages.removed.count'   // number
'sbom.cves.critical.count'      // number
'sbom.cves.high.count'          // number
'sbom.licenses.nonCompliant'    // string[]
```

#### Implementation Strategy

**Step 1**: Add SBOM facts to catalog (1 hour)
```typescript
// In catalog.ts
registerFact({
  id: 'sbom.packages.count',
  category: 'sbom',
  type: 'number',
  description: 'Total number of packages in SBOM',
  version: '1.0.0',
});

// ... similar for other 5 facts
```

**Step 2**: Implement SBOM parser and resolver (2-3 hours)
```typescript
// apps/api/src/services/gatekeeper/yaml-dsl/facts/sbomParser.ts

export interface SBOMPackage {
  name: string;
  version: string;
  license?: string;
  cves?: Array<{ id: string; severity: string }>;
}

export function parseSBOM(content: string): SBOMPackage[] {
  // Support CycloneDX and SPDX formats
  try {
    const data = JSON.parse(content);

    if (data.bomFormat === 'CycloneDX') {
      return parseCycloneDX(data);
    } else if (data.spdxVersion) {
      return parseSPDX(data);
    }
  } catch (error) {
    console.error('[SBOMParser] Failed to parse SBOM:', error);
  }

  return [];
}

function parseCycloneDX(data: any): SBOMPackage[] {
  return (data.components || []).map((c: any) => ({
    name: c.name,
    version: c.version,
    license: c.licenses?.[0]?.license?.id,
    cves: (c.vulnerabilities || []).map((v: any) => ({
      id: v.id,
      severity: v.ratings?.[0]?.severity || 'unknown',
    })),
  }));
}

function parseSPDX(data: any): SBOMPackage[] {
  return (data.packages || []).map((p: any) => ({
    name: p.name,
    version: p.versionInfo,
    license: p.licenseConcluded,
    cves: [], // SPDX doesn't include CVEs by default
  }));
}
```

**Step 3**: Create Template A7 (1 hour)
```yaml
# apps/api/src/services/gatekeeper/yaml-dsl/templates/sbom-cve-pack.yaml
metadata:
  id: sbom-cve-pack
  name: SBOM & CVE Enforcement
  version: 1.0.0
  description: Block PRs with critical CVEs or non-compliant licenses

scope:
  type: workspace
  branches:
    include: ["main", "release/*"]

rules:
  - id: block-critical-cves
    name: Block Critical CVEs
    description: Block PRs that introduce packages with critical CVEs
    enabled: true
    trigger:
      always: true
    obligations:
      - condition:
          fact: sbom.cves.critical.count
          operator: ">"
          value: 0
        severity: critical
        decisionOnFail: block
        message: "Critical CVEs detected in dependencies. Please update or remove affected packages."

  - id: warn-high-cves
    name: Warn on High CVEs
    description: Warn on high-severity CVEs
    enabled: true
    trigger:
      always: true
    obligations:
      - condition:
          fact: sbom.cves.high.count
          operator: ">"
          value: 0
        severity: high
        decisionOnFail: warn
        message: "High-severity CVEs detected. Consider updating dependencies."

  - id: block-non-compliant-licenses
    name: Block Non-Compliant Licenses
    description: Block packages with non-approved licenses
    enabled: true
    trigger:
      always: true
    obligations:
      - condition:
          fact: sbom.licenses.nonCompliant
          operator: "!="
          value: []
        severity: high
        decisionOnFail: block
        message: "Non-compliant licenses detected: {sbom.licenses.nonCompliant}"
```

#### Effort Breakdown
- Add facts to catalog: 1 hour
- SBOM parser: 2-3 hours
- Template A7: 1 hour
- Tests: 1 hour
- **Total: 5-6 hours**

---

### **Task 3C.2: Add Conflict Detection UX** (P1 - 6-8 hours)

#### Current State
- ❌ No conflict detection during pack activation
- ❌ No conflict visualization
- ❌ No remediation suggestions

#### Implementation Strategy

**Step 1**: Create conflict detection service (2-3 hours)
```typescript
// apps/api/src/services/gatekeeper/yaml-dsl/conflictDetector.ts

export interface PackConflict {
  type: 'rule_conflict' | 'merge_strategy_conflict' | 'priority_conflict';
  severity: 'error' | 'warning';
  affectedPacks: string[];
  affectedRules?: string[];
  description: string;
  remediation: string[];
}

export function detectConflicts(packs: PackYAML[]): PackConflict[] {
  const conflicts: PackConflict[] = [];

  // 1. Check for merge strategy conflicts
  const mergeStrategies = new Set(packs.map(p => p.metadata.scopeMergeStrategy || 'MOST_RESTRICTIVE'));
  if (mergeStrategies.size > 1 && mergeStrategies.has('EXPLICIT')) {
    conflicts.push({
      type: 'merge_strategy_conflict',
      severity: 'error',
      affectedPacks: packs.map(p => p.metadata.name),
      description: 'Conflicting merge strategies detected. EXPLICIT mode requires all packs to use the same strategy.',
      remediation: [
        'Change all packs to use EXPLICIT merge strategy',
        'Or change EXPLICIT packs to use MOST_RESTRICTIVE or HIGHEST_PRIORITY',
      ],
    });
  }

  // 2. Check for rule conflicts (same rule ID, different decisions)
  const ruleMap = new Map<string, Array<{ pack: string; decision: string }>>();

  for (const pack of packs) {
    for (const rule of pack.rules) {
      const decision = computeRuleDecision(rule);

      if (!ruleMap.has(rule.id)) {
        ruleMap.set(rule.id, []);
      }

      ruleMap.get(rule.id)!.push({
        pack: pack.metadata.name,
        decision,
      });
    }
  }

  for (const [ruleId, entries] of ruleMap.entries()) {
    if (entries.length > 1) {
      const decisions = new Set(entries.map(e => e.decision));

      if (decisions.size > 1) {
        conflicts.push({
          type: 'rule_conflict',
          severity: 'warning',
          affectedPacks: entries.map(e => e.pack),
          affectedRules: [ruleId],
          description: `Rule "${ruleId}" has different decisions in multiple packs: ${Array.from(decisions).join(', ')}`,
          remediation: [
            'Adjust pack priorities to determine which decision takes precedence',
            'Narrow pack scopes to avoid overlap',
            'Use MOST_RESTRICTIVE merge strategy to automatically resolve',
          ],
        });
      }
    }
  }

  // 3. Check for priority conflicts (same priority, overlapping scope)
  const priorityMap = new Map<number, PackYAML[]>();

  for (const pack of packs) {
    const priority = pack.metadata.scopePriority || 50;

    if (!priorityMap.has(priority)) {
      priorityMap.set(priority, []);
    }

    priorityMap.get(priority)!.push(pack);
  }

  for (const [priority, samePriorityPacks] of priorityMap.entries()) {
    if (samePriorityPacks.length > 1) {
      // Check if scopes overlap
      const hasOverlap = checkScopeOverlap(samePriorityPacks);

      if (hasOverlap) {
        conflicts.push({
          type: 'priority_conflict',
          severity: 'warning',
          affectedPacks: samePriorityPacks.map(p => p.metadata.name),
          description: `Multiple packs have the same priority (${priority}) with overlapping scopes`,
          remediation: [
            'Adjust priorities to establish clear precedence',
            'Narrow scopes to avoid overlap',
          ],
        });
      }
    }
  }

  return conflicts;
}

function checkScopeOverlap(packs: PackYAML[]): boolean {
  // Check if any two packs have overlapping scopes
  for (let i = 0; i < packs.length; i++) {
    for (let j = i + 1; j < packs.length; j++) {
      if (scopesOverlap(packs[i].scope, packs[j].scope)) {
        return true;
      }
    }
  }
  return false;
}

function scopesOverlap(scope1: PackScope, scope2: PackScope): boolean {
  // Workspace-level packs always overlap
  if (scope1.type === 'workspace' && scope2.type === 'workspace') {
    return true;
  }

  // Repo-level packs overlap if they target the same repo
  if (scope1.type === 'repo' && scope2.type === 'repo') {
    return scope1.ref === scope2.ref;
  }

  // Workspace and repo packs overlap
  if ((scope1.type === 'workspace' && scope2.type === 'repo') ||
      (scope1.type === 'repo' && scope2.type === 'workspace')) {
    return true;
  }

  return false;
}
```

**Step 2**: Create UI component (3-4 hours)
```typescript
// apps/web/src/components/policyPacks/ConflictDetectionPanel.tsx

export function ConflictDetectionPanel({ workspaceId }: { workspaceId: string }) {
  const [conflicts, setConflicts] = useState<PackConflict[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConflicts();
  }, [workspaceId]);

  const fetchConflicts = async () => {
    const response = await fetch(`/api/workspaces/${workspaceId}/policy-packs/conflicts`);
    const data = await response.json();
    setConflicts(data.conflicts);
    setLoading(false);
  };

  if (loading) return <div>Loading...</div>;

  if (conflicts.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <CheckCircle className="w-5 h-5 text-green-600 inline mr-2" />
        <span className="text-green-900">No conflicts detected</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Pack Conflicts Detected</h3>
      {conflicts.map((conflict, idx) => (
        <div
          key={idx}
          className={`border rounded-lg p-4 ${
            conflict.severity === 'error' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className={`w-5 h-5 mt-0.5 ${
                conflict.severity === 'error' ? 'text-red-600' : 'text-yellow-600'
              }`}
            />
            <div className="flex-1">
              <p className="font-medium">{conflict.description}</p>
              <p className="text-sm mt-1">
                Affected packs: {conflict.affectedPacks.join(', ')}
              </p>
              {conflict.affectedRules && (
                <p className="text-sm">
                  Affected rules: {conflict.affectedRules.join(', ')}
                </p>
              )}
              <div className="mt-3">
                <p className="text-sm font-medium">Remediation:</p>
                <ul className="list-disc list-inside text-sm mt-1">
                  {conflict.remediation.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 3**: Add API endpoint (1 hour)
```typescript
// In policyPacks.ts routes
router.get('/:workspaceId/policy-packs/conflicts', async (req, res) => {
  const { workspaceId } = req.params;

  // Fetch all published packs
  const packs = await prisma.workspacePolicyPack.findMany({
    where: { workspaceId, packStatus: 'published', trackAEnabled: true },
  });

  // Parse YAML
  const parsedPacks = packs.map(p => yaml.parse(p.trackAConfigYamlPublished!));

  // Detect conflicts
  const conflicts = detectConflicts(parsedPacks);

  res.json({ conflicts });
});
```

#### Effort Breakdown
- Conflict detection service: 2-3 hours
- UI component: 3-4 hours
- API endpoint: 1 hour
- Tests: 1 hour
- **Total: 7-9 hours**

---

### **Task 3C.3: Add Template A4 (OpenAPI Tests Required)** (P1 - 2-3 hours)

```yaml
# apps/api/src/services/gatekeeper/yaml-dsl/templates/openapi-tests-required-pack.yaml
metadata:
  id: openapi-tests-required
  name: OpenAPI Changes Require Tests
  version: 1.0.0
  description: Require test updates when OpenAPI spec changes

scope:
  type: workspace
  branches:
    include: ["main", "develop"]

rules:
  - id: openapi-changes-require-tests
    name: OpenAPI Changes Require Tests
    description: When OpenAPI spec changes, require corresponding test updates
    enabled: true
    trigger:
      anyChangedPaths:
        - "**/*.openapi.yaml"
        - "**/*.openapi.json"
        - "**/openapi.yaml"
    obligations:
      - condition:
          operator: AND
          conditions:
            - fact: openapi.changed
              operator: "=="
              value: true
            - fact: diff.filesChanged.paths
              operator: contains
              value: "test"
        severity: high
        decisionOnFail: block
        message: "OpenAPI spec changed but no test files were updated. Please add or update tests."

  - id: breaking-changes-require-major-bump
    name: Breaking Changes Require Major Version Bump
    description: Breaking changes require major version bump
    enabled: true
    trigger:
      anyChangedPaths:
        - "**/*.openapi.yaml"
    obligations:
      - condition:
          operator: AND
          conditions:
            - fact: openapi.breakingChanges.count
              operator: ">"
              value: 0
            - fact: openapi.versionBumpRequired
              operator: "=="
              value: "major"
        severity: critical
        decisionOnFail: block
        message: "Breaking changes detected. Version bump to major required."
```

#### Effort Breakdown
- Template creation: 1 hour
- Tests: 1-2 hours
- **Total: 2-3 hours**

---

## 📊 PHASE 3C Summary

| Task | Priority | Effort | Risk | Status |
|------|----------|--------|------|--------|
| 3C.1: SBOM/CVE Facts + Template A7 | P1 | 5-6h | Medium | Not Started |
| 3C.2: Conflict Detection UX | P1 | 7-9h | Low | Not Started |
| 3C.3: Template A4 | P1 | 2-3h | Low | Not Started |
| **TOTAL** | - | **14-18h** | - | - |

**Dependencies**: Phase 3B (OpenAPI facts needed for Template A4)
**Outcome**: Extended Part B complete, fact catalog at 42/68 (62%)

---

## 🚀 PHASE 4: Track B Support (29-41 hours)

**Note**: This phase is for **async drift remediation** (Track B), which is a separate track from Track A (PR gating). This is a major feature addition.

### **Task 4.1: Implement Track B Drift Remediation** (P2 - 20-30 hours)

#### Current State
- ✅ Database schema supports Track B (`trackBEnabled`, `trackBConfig`)
- ✅ Drift detection infrastructure exists
- ❌ No YAML DSL for Track B
- ❌ No drift remediation templates
- ❌ No drift facts in fact catalog

#### What Track B Does
Track B is **async drift remediation** that:
1. Monitors input sources (GitHub PRs, Slack, PagerDuty)
2. Detects drift between source and target docs
3. Generates patch proposals
4. Routes to appropriate owners for approval
5. Writes back to docs after approval

#### Implementation Strategy

This is a **LARGE** task that requires:
1. Extending YAML DSL to support Track B configuration
2. Implementing drift detection rules
3. Adding drift facts to fact catalog
4. Creating 7 Track B templates (B1-B7)

**Step 1**: Extend YAML DSL for Track B (4-6 hours)

```yaml
# Track B YAML Structure
metadata:
  id: drift-remediation-pack
  name: Drift Remediation Pack
  version: 1.0.0

scope:
  type: workspace

# Track B Configuration
trackB:
  enabled: true

  # Primary target document
  primaryDoc:
    system: confluence  # or 'notion', 'github_readme'
    id: "123456"
    title: "Service Runbook"
    class: runbook  # or 'architecture', 'api_docs', 'deployment_guide'

  # Input sources to monitor
  inputSources:
    - type: github_pr
      enabled: true
      filters:
        repos: ["owner/repo"]
        labels: ["deployment", "infrastructure"]

    - type: slack
      enabled: true
      filters:
        channels: ["#incidents", "#deployments"]

  # Drift types to detect
  driftTypes:
    - type: instruction
      enabled: true
      sectionTarget: "Deployment Steps"

    - type: process
      enabled: true
      sectionTarget: "Runbook"

    - type: ownership
      enabled: true
      sectionTarget: "Owner Block"

  # Materiality thresholds
  materiality:
    autoApprove: 0.98    # Auto-approve patches with >98% confidence
    slackNotify: 0.40    # Send Slack notification for >40% confidence
    digestOnly: 0.30     # Include in digest for >30% confidence
    ignore: 0.20         # Ignore drifts <20% confidence

  # Doc targeting strategy
  docTargeting:
    strategy: primary_first  # or 'all_parallel'
    maxDocsPerDrift: 3
    priorityOrder: ["confluence", "notion", "github_readme"]

  # Noise controls
  noiseControls:
    ignorePatterns: ["WIP:", "draft:"]
    ignorePaths: ["test/**", "examples/**"]
    temporalAccumulation:
      enabled: true
      windowDays: 7
      threshold: 3  # Require 3 signals within 7 days
```

**Step 2**: Add drift facts to catalog (2-3 hours)

```typescript
// D6: Drift Facts (15 facts)
registerFact({
  id: 'drift.detected',
  category: 'drift',
  type: 'boolean',
  description: 'Whether drift was detected',
  version: '1.0.0',
});

registerFact({
  id: 'drift.type',
  category: 'drift',
  type: 'string',
  description: 'Type of drift (instruction, process, ownership, coverage)',
  version: '1.0.0',
});

registerFact({
  id: 'drift.confidence',
  category: 'drift',
  type: 'number',
  description: 'Confidence score (0-1)',
  version: '1.0.0',
});

registerFact({
  id: 'drift.targetDoc.system',
  category: 'drift',
  type: 'string',
  description: 'Target doc system (confluence, notion, github_readme)',
  version: '1.0.0',
});

registerFact({
  id: 'drift.targetDoc.id',
  category: 'drift',
  type: 'string',
  description: 'Target doc ID',
  version: '1.0.0',
});

registerFact({
  id: 'drift.targetDoc.class',
  category: 'drift',
  type: 'string',
  description: 'Target doc class (runbook, architecture, api_docs)',
  version: '1.0.0',
});

registerFact({
  id: 'drift.source.type',
  category: 'drift',
  type: 'string',
  description: 'Source type (github_pr, slack, pagerduty)',
  version: '1.0.0',
});

registerFact({
  id: 'drift.source.id',
  category: 'drift',
  type: 'string',
  description: 'Source ID (PR number, Slack thread ID, etc.)',
  version: '1.0.0',
});

registerFact({
  id: 'drift.patch.style',
  category: 'drift',
  type: 'string',
  description: 'Patch style (replace_steps, add_note, reorder_steps, etc.)',
  version: '1.0.0',
});

registerFact({
  id: 'drift.patch.linesChanged',
  category: 'drift',
  type: 'number',
  description: 'Number of lines changed in patch',
  version: '1.0.0',
});

registerFact({
  id: 'drift.validation.passed',
  category: 'drift',
  type: 'boolean',
  description: 'Whether patch passed validation',
  version: '1.0.0',
});

registerFact({
  id: 'drift.validation.errors',
  category: 'drift',
  type: 'array',
  description: 'Validation errors',
  version: '1.0.0',
});

registerFact({
  id: 'drift.temporalCluster.size',
  category: 'drift',
  type: 'number',
  description: 'Number of drifts in temporal cluster',
  version: '1.0.0',
});

registerFact({
  id: 'drift.temporalCluster.windowDays',
  category: 'drift',
  type: 'number',
  description: 'Temporal window in days',
  version: '1.0.0',
});

registerFact({
  id: 'drift.impactScore',
  category: 'drift',
  type: 'number',
  description: 'Impact score (0-1)',
  version: '1.0.0',
});
```

**Step 3**: Create 7 Track B templates (8-12 hours)

```yaml
# B1: Auto-Approve High-Confidence Instruction Drift
metadata:
  id: auto-approve-instruction-drift
  name: Auto-Approve High-Confidence Instruction Drift
  version: 1.0.0

trackB:
  enabled: true
  primaryDoc:
    class: runbook
  driftTypes:
    - type: instruction
      enabled: true
  materiality:
    autoApprove: 0.98

rules:
  - id: auto-approve-high-confidence
    name: Auto-Approve High-Confidence Patches
    enabled: true
    trigger:
      always: true
    obligations:
      - condition:
          operator: AND
          conditions:
            - fact: drift.type
              operator: "=="
              value: "instruction"
            - fact: drift.confidence
              operator: ">="
              value: 0.98
            - fact: drift.validation.passed
              operator: "=="
              value: true
        severity: low
        decisionOnFail: pass
        decisionOnPass: auto_approve
        message: "High-confidence instruction drift - auto-approving patch"

# B2: Slack Notify Medium-Confidence Process Drift
# B3: Digest-Only Low-Confidence Ownership Drift
# B4: Temporal Accumulation (3 signals in 7 days)
# B5: Multi-Doc Targeting (Confluence + Notion)
# B6: Validation-Gated Writeback
# B7: Service-Specific Drift Plans
```

**Step 4**: Implement Track B evaluation engine (6-9 hours)

```typescript
// apps/api/src/services/gatekeeper/yaml-dsl/trackBEvaluator.ts

export async function evaluateTrackBPack(
  pack: PackYAML,
  driftCandidate: DriftCandidate
): Promise<TrackBResult> {
  // 1. Resolve drift facts
  const facts = await resolveDriftFacts(driftCandidate);

  // 2. Evaluate rules
  const ruleResults = [];

  for (const rule of pack.rules) {
    if (!rule.enabled) continue;

    // Evaluate trigger
    if (!evaluateTrigger(rule.trigger, facts)) {
      continue;
    }

    // Evaluate obligations
    for (const obligation of rule.obligations) {
      if (obligation.condition) {
        const result = evaluateCondition(obligation.condition, facts);
        ruleResults.push({
          ruleId: rule.id,
          obligationResult: result,
          decision: result.passed ? obligation.decisionOnPass : obligation.decisionOnFail,
        });
      }
    }
  }

  // 3. Compute final decision
  const decision = computeTrackBDecision(ruleResults, pack.trackB.materiality);

  return {
    decision, // 'auto_approve' | 'slack_notify' | 'digest_only' | 'ignore'
    ruleResults,
    facts,
  };
}

function computeTrackBDecision(results: any[], materiality: any): string {
  // Check for auto-approve
  if (results.some(r => r.decision === 'auto_approve')) {
    return 'auto_approve';
  }

  // Check for slack_notify
  if (results.some(r => r.decision === 'slack_notify')) {
    return 'slack_notify';
  }

  // Check for digest_only
  if (results.some(r => r.decision === 'digest_only')) {
    return 'digest_only';
  }

  return 'ignore';
}
```

#### Effort Breakdown
- Extend YAML DSL: 4-6 hours
- Add drift facts: 2-3 hours
- Create 7 templates: 8-12 hours
- Track B evaluator: 6-9 hours
- Tests: 4-6 hours
- **Total: 24-36 hours**

---

### **Task 4.2: Add Terraform Plan Facts** (P2 - 6-8 hours)

#### Missing Facts (from canonical spec D4)
```typescript
// D4: Terraform Facts (12 facts)
'tf.plan.resourceChanges.count'
'tf.plan.resourceChanges.create'
'tf.plan.resourceChanges.update'
'tf.plan.resourceChanges.delete'
'tf.plan.resourceChanges.replace'
'tf.plan.outputChanges.count'
'tf.plan.hasDataSensitive'
'tf.plan.estimatedCost.delta'
'tf.state.resourceCount'
'tf.modules.count'
'tf.providers.list'
'tf.version'
```

#### Implementation Strategy

Similar to OpenAPI facts - parse Terraform plan JSON and extract facts.

```typescript
// apps/api/src/services/gatekeeper/yaml-dsl/facts/terraformParser.ts

export function parseTerraformPlan(content: string): TerraformPlan {
  const plan = JSON.parse(content);

  return {
    resourceChanges: plan.resource_changes || [],
    outputChanges: plan.output_changes || {},
    configuration: plan.configuration || {},
    plannedValues: plan.planned_values || {},
  };
}

export function extractTerraformFacts(plan: TerraformPlan): Map<string, any> {
  const facts = new Map<string, any>();

  // Count resource changes by action
  const changes = plan.resourceChanges;
  facts.set('tf.plan.resourceChanges.count', changes.length);
  facts.set('tf.plan.resourceChanges.create', changes.filter(c => c.change.actions.includes('create')).length);
  facts.set('tf.plan.resourceChanges.update', changes.filter(c => c.change.actions.includes('update')).length);
  facts.set('tf.plan.resourceChanges.delete', changes.filter(c => c.change.actions.includes('delete')).length);
  facts.set('tf.plan.resourceChanges.replace', changes.filter(c => c.change.actions.includes('delete') && c.change.actions.includes('create')).length);

  // Output changes
  facts.set('tf.plan.outputChanges.count', Object.keys(plan.outputChanges).length);

  // Sensitive data
  const hasSensitive = changes.some(c => c.change.after_sensitive || c.change.before_sensitive);
  facts.set('tf.plan.hasDataSensitive', hasSensitive);

  // ... other facts

  return facts;
}
```

#### Effort Breakdown
- Add facts to catalog: 1 hour
- Terraform parser: 3-4 hours
- Fact resolvers: 2-3 hours
- Tests: 1 hour
- **Total: 7-9 hours**

---

### **Task 4.3: Add Gate Status Facts + Template A8** (P2 - 3-4 hours)

#### Missing Facts (from canonical spec D7)
```typescript
// D7: Gate Status Facts (3 facts)
'gate.contractIntegrity.status'     // 'pass' | 'warn' | 'block'
'gate.contractIntegrity.findings'   // number
'gate.driftRemediation.status'      // 'pass' | 'warn' | 'block'
```

These facts allow **cross-gate dependencies** - e.g., "Block deploy if contract integrity gate failed".

#### Template A8: Deploy Gate (Depends on Contract Integrity)

```yaml
metadata:
  id: deploy-gate
  name: Deploy Gate
  version: 1.0.0
  description: Block deploys if contract integrity gate failed

scope:
  type: workspace
  branches:
    include: ["main", "release/*"]

rules:
  - id: block-deploy-if-contract-failed
    name: Block Deploy if Contract Integrity Failed
    description: Prevent deployment if contract integrity gate failed
    enabled: true
    trigger:
      anyChangedPaths:
        - "deploy/**"
        - "k8s/**"
        - "terraform/**"
    obligations:
      - condition:
          fact: gate.contractIntegrity.status
          operator: "=="
          value: "block"
        severity: critical
        decisionOnFail: block
        message: "Cannot deploy - contract integrity gate failed. Fix contract violations first."

  - id: warn-deploy-if-contract-warned
    name: Warn Deploy if Contract Integrity Warned
    enabled: true
    trigger:
      anyChangedPaths:
        - "deploy/**"
    obligations:
      - condition:
          fact: gate.contractIntegrity.status
          operator: "=="
          value: "warn"
        severity: medium
        decisionOnFail: warn
        message: "Contract integrity gate has warnings. Review before deploying."
```

#### Effort Breakdown
- Add facts to catalog: 30 min
- Implement resolvers: 1-2 hours
- Template A8: 1 hour
- Tests: 1 hour
- **Total: 3.5-4.5 hours**

---

## 📊 PHASE 4 Summary

| Task | Priority | Effort | Risk | Status |
|------|----------|--------|------|--------|
| 4.1: Track B Drift Remediation | P2 | 24-36h | High | Not Started |
| 4.2: Terraform Facts | P2 | 7-9h | Medium | Not Started |
| 4.3: Gate Status Facts + Template A8 | P2 | 3.5-4.5h | Low | Not Started |
| **TOTAL** | - | **34.5-49.5h** | - | - |

**Dependencies**: Phase 3A, 3B, 3C (foundation must be solid)
**Outcome**: Full Track B support, fact catalog at 68/68 (100%), all 15 templates complete

---

## 🎯 OVERALL SUMMARY

### Compliance Progress

| Phase | Requirements | Effort | Outcome |
|-------|-------------|--------|---------|
| **Current State** | 44/166 (27%) | - | Foundation complete |
| **After Phase 3A** | 52/166 (31%) | 5.5h | Multi-pack infrastructure 100% |
| **After Phase 3B** | 88/166 (53%) | 16-23h | Critical gaps closed |
| **After Phase 3C** | 104/166 (63%) | 14-18h | Extended features |
| **After Phase 4** | 166/166 (100%) | 34.5-49.5h | Full compliance |
| **TOTAL** | - | **70-96h** | - |

### Recommended Execution Order

1. **Phase 3A** (5.5h) - Foundation fixes, enables everything else
2. **Phase 3B** (16-23h) - Critical enterprise features
3. **Phase 3C** (14-18h) - Extended features, polish
4. **Phase 4** (34.5-49.5h) - Track B support (can be deferred if Track A is priority)

### Risk Mitigation

- **All phases are additive** - No breaking changes to existing functionality
- **Comprehensive tests** - Each task includes test implementation
- **Incremental deployment** - Can deploy after each phase
- **Rollback strategy** - Each feature can be disabled independently

---

## 🚀 Next Steps

**Immediate Action**: Start with **Phase 3A** (5.5 hours)
- Fixes critical gaps in multi-pack infrastructure
- Enables merge strategy and priority-based selection
- Low risk, high impact

**After Phase 3A**: Move to **Phase 3B** (16-23 hours)
- Implements Effective Policy View (#1 enterprise trust feature)
- Adds OpenAPI facts (critical for API-first organizations)
- Medium risk, very high impact

**Questions for User**:
1. Should we start with Phase 3A immediately?
2. Is Track B (Phase 4) a priority, or can we defer it?
3. Any specific templates or facts that are higher priority than others?


