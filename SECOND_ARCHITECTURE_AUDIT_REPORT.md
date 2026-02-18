# SECOND ARCHITECTURE AUDIT REPORT
## Comprehensive Verification of All 10 Critical Requirements

**Date**: 2026-02-18  
**Status**: 🔴 **4 CRITICAL GAPS FOUND** - NOT PRODUCTION-READY

---

## Executive Summary

After a detailed architecture audit against the "architect critic" requirements, **4 out of 10 critical requirements are NOT met**. The system requires additional work before it can be considered production-ready.

### Critical Gaps Summary

| # | Requirement | Status | Blocker? |
|---|-------------|--------|----------|
| 1 | Engine fingerprint for determinism over time | ❌ **NOT IMPLEMENTED** | **YES** |
| 2 | Per-comparator AbortController | ❌ **NOT IMPLEMENTED** | **YES** |
| 3 | WARN + Branch Protection semantics | ⚠️ **PARTIALLY IMPLEMENTED** | **YES** |
| 4 | Trigger composition (allOf before anyOf) | ❌ **NOT IMPLEMENTED** | **YES** |
| 5 | excludePaths before trigger evaluation | ❌ **NOT IMPLEMENTED** | **MEDIUM** |
| 6 | Artifact resolution correctness | ✅ VERIFIED | No |
| 7 | Pack selection version tie-breakers | ✅ FIXED | No |
| 8 | Draft/publish schema consistency | ✅ VERIFIED | No |
| 9 | ReDoS protection | ✅ FIXED | No |
| 10 | Track B spawn grouping | ⚠️ **DOCUMENTED ONLY** | **MEDIUM** |

---

## Detailed Findings

### ❌ **CRITICAL GAP #1: Engine Fingerprint NOT Implemented**

**Requirement**: Emit engine fingerprint with every evaluation for determinism over time

**Status**: ❌ **NOT IMPLEMENTED** - Only documented in YAML_DSL_MIGRATION_PLAN.md

**Evidence**:
- ✅ `EngineFingerprint` interface documented in migration plan
- ✅ `comparatorRegistry.getAllVersions()` method exists
- ❌ `PackEvaluationResult` does NOT include `engineFingerprint` field
- ❌ Pack evaluator does NOT build or emit fingerprint
- ❌ GitHub Check does NOT include fingerprint in summary

**Current PackEvaluationResult**:
```typescript
export interface PackEvaluationResult {
  decision: 'pass' | 'warn' | 'block';
  findings: Finding[];
  triggeredRules: string[];
  packHash: string;
  packSource: string;
  evaluationTimeMs: number;
  budgetExhausted: boolean;
  // ❌ NO engineFingerprint field
}
```

**Impact**: Same pack + same PR can yield different decisions over time if comparator logic changes. Audit story is incomplete.

**Fix Required**:
1. Add `engineFingerprint: EngineFingerprint` to `PackEvaluationResult`
2. Build fingerprint in `PackEvaluator.evaluate()`:
   ```typescript
   const usedComparators = new Set<ComparatorId>();
   // ... collect during evaluation
   const engineFingerprint = {
     evaluatorVersion: process.env.GIT_SHA || 'dev',
     comparatorVersions: Object.fromEntries(
       Array.from(usedComparators).map(id => [id, comparatorRegistry.getVersion(id)])
     ),
     timestamp: new Date().toISOString(),
   };
   ```
3. Include in GitHub Check summary
4. Store in evidence bundle

---

### ❌ **CRITICAL GAP #2: AbortController is Per-PR, Not Per-Comparator**

**Requirement**: Create fresh AbortController per comparator to prevent cascading aborts

**Status**: ❌ **NOT IMPLEMENTED** - Single AbortController created per PR

**Evidence**:
```typescript
// yamlGatekeeperIntegration.ts line 57
const abortController = new AbortController();  // ❌ Created once per PR

// comparatorRegistry.ts lines 46-51
const result = await Promise.race([
  comparator.evaluate(context, params),  // ❌ Uses same abortController for all
  new Promise<ComparatorResult>((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), timeoutMs)
  ),
]);
```

**Problem**: Once first comparator times out and calls `abort()`, ALL subsequent comparators see `signal.aborted = true` and fail immediately.

**Impact**: Cascading failures after first timeout. Cannot evaluate remaining comparators.

**Fix Required**:
1. Create fresh `AbortController` per comparator in `comparatorRegistry.evaluate()`:
   ```typescript
   async evaluate(comparatorId: ComparatorId, context: PRContext, params: any): Promise<ComparatorResult> {
     // CRITICAL: Create fresh AbortController per comparator
     const comparatorAbortController = new AbortController();
     const scopedContext = { ...context, abortController: comparatorAbortController };
     
     const timeoutMs = context.budgets.perComparatorTimeoutMs;
     const timeoutId = setTimeout(() => comparatorAbortController.abort(), timeoutMs);
     
     try {
       return await comparator.evaluate(scopedContext, params);
     } finally {
       clearTimeout(timeoutId);
     }
   }
   ```

---

### ⚠️ **CRITICAL GAP #3: WARN Conclusion Mapping Inconsistent**

**Requirement**: Explicitly define GitHub Check conclusions for WARN under branch protection

**Status**: ⚠️ **PARTIALLY IMPLEMENTED** - Schema has mapping, but implementation uses hardcoded values

**Evidence**:
- ✅ Schema has `conclusionMapping` in `routing.github` (packValidator.ts lines 88-92)
- ❌ GitHub Check creator uses hardcoded mapping (githubCheckCreator.ts lines 27-30):
  ```typescript
  const conclusionMap = {
    pass: 'success' as const,
    warn: 'neutral' as const,  // ❌ Hardcoded, ignores pack config
    block: 'failure' as const,
  };
  ```
- ❌ Pack's `conclusionMapping` is NOT read or used

**Problem**: Users configure `warn: 'success'` in pack YAML but system always uses `'neutral'`. Branch protection behavior is unpredictable.

**Impact**: Beta customers may think WARN blocks merges (if they set required checks) or allows merges when it shouldn't.

**Fix Required**:
1. Read `pack.routing?.github?.conclusionMapping` in `createYAMLGatekeeperCheck()`
2. Use configured mapping or fall back to defaults:
   ```typescript
   const conclusionMapping = pack.routing?.github?.conclusionMapping || {
     pass: 'success',
     warn: 'success',  // Default: WARN doesn't block
     block: 'failure',
   };
   const conclusion = conclusionMapping[result.decision];
   ```
3. Document and test branch protection behavior

---

### ❌ **CRITICAL GAP #4: Trigger Composition is Broken**

**Requirement**: Implement composable trigger semantics - evaluate allOf BEFORE anyOf

**Status**: ❌ **NOT IMPLEMENTED** - Current logic returns early on first anyOf match

**Evidence**:
```typescript
// packEvaluator.ts lines 164-191
function evaluateTrigger(trigger: any, context: PRContext): boolean {
  // anyChangedPaths (OR semantics)
  if (trigger.anyChangedPaths && trigger.anyChangedPaths.length > 0) {
    const matches = context.files.some(file => ...);
    if (matches) return true;  // ❌ EARLY RETURN - doesn't check allOf!
  }
  
  // allChangedPaths (AND semantics)
  if (trigger.allChangedPaths && trigger.allChangedPaths.length > 0) {
    const allMatch = trigger.allChangedPaths.every(...);
    if (allMatch) return true;  // ❌ EARLY RETURN
  }
  
  // anyFileExtensions
  if (trigger.anyFileExtensions && trigger.anyFileExtensions.length > 0) {
    const matches = context.files.some(...);
    if (matches) return true;  // ❌ EARLY RETURN
  }
  
  return false;
}
```

**Problem**: If rule defines both `anyChangedPaths` AND `allOf`, the `anyChangedPaths` match returns `true` before `allOf` is checked. This is NOT composable.

**Impact**: Rules with complex trigger logic (e.g., "path matches infra AND branch is main") cannot be expressed correctly.

**Fix Required**: Implement documented composition model from YAML_DSL_MIGRATION_PLAN.md lines 2729-2819:
```typescript
function evaluateTrigger(trigger: any, context: PRContext): boolean {
  // Step 1: Evaluate ALL required conditions (AND preconditions)
  if (trigger.allChangedPaths) {
    const allMatch = trigger.allChangedPaths.every(...);
    if (!allMatch) return false;  // Precondition failed
  }
  
  // Step 2: Evaluate allOf comparators (AND semantics)
  if (trigger.allOf) {
    for (const comp of trigger.allOf) {
      const result = await comparatorRegistry.evaluate(...);
      if (result.status !== 'pass') return false;  // ALL must pass
    }
  }
  
  // Step 3: Evaluate ANY conditions (OR semantics)
  const anyConditions: boolean[] = [];
  if (trigger.anyChangedPaths) anyConditions.push(...);
  if (trigger.anyFileExtensions) anyConditions.push(...);
  if (trigger.anyOf) anyConditions.push(...);
  
  // Final: if any OR conditions defined, at least one must be true
  return anyConditions.length > 0 ? anyConditions.some(c => c) : true;
}
```

---

### ❌ **CRITICAL GAP #5: excludePaths NOT Applied Before Trigger Evaluation**

**Requirement**: Apply `excludePaths` BEFORE trigger evaluation to prevent rules from triggering on excluded files

**Status**: ❌ **NOT IMPLEMENTED** - Only documented in migration plan

**Evidence**:
```typescript
// packEvaluator.ts lines 65-77
for (const rule of pack.rules) {
  // Check if rule should be skipped
  if (rule.skipIf && shouldSkipRule(rule.skipIf, context)) {
    continue;
  }

  // Evaluate trigger
  if (!evaluateTrigger(rule.trigger, context)) {  // ❌ Uses full context, not filtered
    continue;
  }

  triggeredRules.push(rule.id);
  // ... evaluate obligations
}
```

**Problem**: `excludePaths` is NOT checked or applied. Trigger evaluation sees ALL files, including excluded ones.

**Impact**: Rules trigger on files they should ignore (e.g., `*.test.ts` when `excludePaths: ['**/*.test.ts']`).

**Fix Required**: Implement documented pattern from YAML_DSL_MIGRATION_PLAN.md lines 2556-2560:
```typescript
for (const rule of pack.rules) {
  // FIXED: Apply excludePaths BEFORE trigger evaluation
  let effectiveContext = context;
  if (rule.excludePaths && hasExcludedFiles(context.files, rule.excludePaths)) {
    effectiveContext = filterExcludedFiles(context, rule.excludePaths);
  }

  // Evaluate trigger (using filtered context)
  if (!evaluateTrigger(rule.trigger, effectiveContext)) {
    continue;
  }

  // Evaluate obligations (using same filtered context)
  for (const obligation of rule.obligations) {
    const result = await comparatorRegistry.evaluate(obligation.comparatorId, effectiveContext, obligation.params);
    // ...
  }
}

function filterExcludedFiles(context: PRContext, excludePaths: string[]): PRContext {
  return {
    ...context,
    files: context.files.filter(file =>
      !excludePaths.some(glob => minimatch(file.filename, glob, { dot: true }))
    ),
  };
}
```

---

### ✅ **REQUIREMENT #6: Artifact Resolution Correctness**

**Requirement**: Service-aware artifact resolution prevents false positives in microservices organizations

**Status**: ✅ **VERIFIED** - Correctly implemented

**Evidence**:
- ✅ `artifactResolver.ts` implements service-aware resolution
- ✅ `resolveArtifactPath()` checks `serviceScope.includePaths` and `excludePaths`
- ✅ `isServiceAffected()` correctly determines if changes affect service
- ✅ Path normalization uses `minimatch` with `{ dot: true }`

**Key Implementation** (artifactResolver.ts lines 127-140):
```typescript
// If excludePaths defined, check if ALL changes are excluded
if (serviceConfig.serviceScope?.excludePaths) {
  const allExcluded = Array.from(changedPaths).every(path =>
    serviceConfig.serviceScope.excludePaths.some((pattern: string) =>
      minimatch(path, pattern, { dot: true })
    )
  );
  if (allExcluded) return false;
}
```

**Verification**: ✅ Artifact resolution correctly handles:
- Service-scoped paths
- Include/exclude patterns
- Monorepo scenarios
- Path normalization

---

### ✅ **REQUIREMENT #7: Pack Selection Version Tie-Breakers**

**Requirement**: Use `publishedAt` timestamp for deterministic tie-breaking, not `packHash`

**Status**: ✅ **FIXED** in first audit (commit b2c3141)

**Evidence**:
```typescript
// packSelector.ts lines 130-151 (AFTER FIX)
function selectBestPack(packs: PackData[]): PackData {
  if (packs.length === 0) throw new Error('No packs to select from');
  if (packs.length === 1) return packs[0];

  // Sort by version (descending), then publishedAt (descending)
  const sorted = packs.sort((a, b) => {
    const versionCompare = semver.rcompare(a.version, b.version);
    if (versionCompare !== 0) return versionCompare;

    // CRITICAL FIX: Use publishedAt for tie-breaking (deterministic)
    const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bTime - aTime;  // ✅ Most recent first
  });

  return sorted[0];
}
```

**Verification**: ✅ Tie-breaker is deterministic and uses `publishedAt` timestamp

---

### ✅ **REQUIREMENT #8: Draft/Publish Schema Consistency**

**Requirement**: Verify draft/publish fields are consistent across schema, API, and documentation

**Status**: ✅ **VERIFIED** - Schema is consistent

**Evidence**:
- ✅ Schema has `trackAConfigYamlDraft` (TEXT) and `trackAConfigYamlPublished` (TEXT)
- ✅ Schema has `trackAPackHashPublished` (VARCHAR 64 chars)
- ✅ Schema has `packStatus` ('draft' | 'published')
- ✅ Schema has `publishedAt` (DateTime) and `publishedBy` (String)
- ✅ Denormalized metadata: `packMetadataId`, `packMetadataVersion`, `packMetadataName`
- ✅ Unique constraint on `[workspaceId, scopeType, scopeRef, packMetadataId, packMetadataVersion]`

**Verification** (schema.prisma lines 576-664):
```prisma
model WorkspacePolicyPack {
  // ... other fields

  trackAConfigYamlDraft      String?   @db.Text
  trackAConfigYamlPublished  String?   @db.Text
  trackAPackHashPublished    String?   @db.VarChar(64)  // Full SHA-256
  packStatus                 String?   @db.VarChar(20)  // 'draft' | 'published'
  publishedAt                DateTime?
  publishedBy                String?

  // Denormalized metadata for DB-level uniqueness checks
  packMetadataId             String?   @db.VarChar(255)
  packMetadataVersion        String?   @db.VarChar(50)
  packMetadataName           String?   @db.VarChar(255)

  @@unique([workspaceId, scopeType, scopeRef, packMetadataId, packMetadataVersion])
}
```

**API Verification**: ✅ Publish endpoint correctly populates all fields (policyPacks.ts)

---

### ✅ **REQUIREMENT #9: ReDoS Protection**

**Requirement**: Use RE2 engine for user-provided regex patterns to prevent ReDoS attacks

**Status**: ✅ **FIXED** in first audit (commit b2c3141)

**Evidence**:
```typescript
// noSecretsInDiff.ts lines 33-42 (AFTER FIX)
import RE2 from 're2';

// CRITICAL FIX: Use RE2 for user-provided patterns to prevent ReDoS
const customRE2Patterns: RE2[] = [];
for (const pattern of customPatterns) {
  try {
    customRE2Patterns.push(new RE2(pattern, 'i'));  // ✅ RE2 - ReDoS-safe
  } catch (error) {
    console.error(`[NO_SECRETS_IN_DIFF] Invalid regex pattern: ${pattern}`, error);
  }
}
```

**Verification**: ✅ RE2 package installed, user patterns use RE2 engine with linear time complexity

---

### ⚠️ **REQUIREMENT #10: Track B Spawn Grouping**

**Requirement**: Implement Track B spawn with configurable grouping strategy

**Status**: ⚠️ **DOCUMENTED ONLY** - Schema exists, implementation NOT verified

**Evidence**:
- ✅ Schema has `spawnTrackB` at top-level (packValidator.ts lines 96-109)
- ✅ Grouping strategies defined: `by-drift-type-and-service`, `by-rule`, `by-finding-code`
- ❓ Implementation NOT verified (Track B integration not in scope of YAML DSL migration)

**Schema** (packValidator.ts):
```typescript
spawnTrackB: z.object({
  enabled: z.boolean(),
  when: z.array(z.object({
    onDecision: z.enum(['pass', 'warn', 'block']),
  })).optional(),
  createRemediationCase: z.boolean().optional(),
  remediationDefaults: z.object({
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  }).optional(),
  grouping: z.object({
    strategy: z.enum(['by-drift-type-and-service', 'by-rule', 'by-finding-code']),
    maxPerPR: z.number(),
  }).optional(),
}).optional(),
```

**Status**: ⚠️ Schema is correct, but Track B integration is out of scope for YAML DSL migration. This is a **MEDIUM** priority gap.

---

## Summary and Recommendations

### Critical Blockers (MUST FIX Before Production)

**4 critical gaps prevent production deployment:**

1. **Engine Fingerprint** - Add `engineFingerprint` to `PackEvaluationResult` and build during evaluation
2. **Per-Comparator AbortController** - Create fresh `AbortController` per comparator to prevent cascading failures
3. **WARN Conclusion Mapping** - Read pack's `conclusionMapping` configuration instead of hardcoded values
4. **Trigger Composition** - Implement composable trigger semantics (allOf before anyOf)

### Medium Priority (Should Fix Before Beta)

5. **excludePaths** - Apply before trigger evaluation to prevent rules from triggering on excluded files

### Verified Requirements (No Action Needed)

6. ✅ Artifact resolution correctness
7. ✅ Pack selection version tie-breakers
8. ✅ Draft/publish schema consistency
9. ✅ ReDoS protection

### Out of Scope

10. ⚠️ Track B spawn grouping (schema correct, implementation not in YAML DSL scope)

---

## Production Readiness Assessment

**Current Status**: 🔴 **NOT PRODUCTION-READY**

**Reason**: 4 critical gaps in core evaluation logic that affect:
- Determinism over time (no engine fingerprint)
- Reliability under timeout (cascading aborts)
- Branch protection behavior (hardcoded conclusions)
- Trigger expressiveness (broken composition)

**Estimated Effort to Fix**:
- Gap #1 (Engine Fingerprint): 2-3 hours
- Gap #2 (Per-Comparator AbortController): 3-4 hours
- Gap #3 (WARN Conclusion Mapping): 1-2 hours
- Gap #4 (Trigger Composition): 4-6 hours
- Gap #5 (excludePaths): 2-3 hours

**Total**: 12-18 hours of focused development + testing

---

## Next Steps

1. **Prioritize fixes** in order: #2 (AbortController), #4 (Trigger Composition), #1 (Fingerprint), #3 (Conclusion Mapping), #5 (excludePaths)
2. **Implement fixes** systematically with tests for each
3. **Re-compile and test** after each fix
4. **Create integration tests** for complex trigger scenarios
5. **Document branch protection behavior** with WARN conclusion mapping
6. **Re-audit** after all fixes are complete

---

**Report Generated**: 2026-02-18
**Audit Scope**: All 10 requirements from second architecture critique
**Auditor**: Augment Agent (Claude Sonnet 4.5)

