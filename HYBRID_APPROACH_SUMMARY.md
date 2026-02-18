# Hybrid Comparator/Fact-Based Approach - Summary

## Decision: Hybrid Approach ✅

After careful analysis, we're implementing a **hybrid approach** that combines:
- **Comparators** (existing) - Type-safe, beginner-friendly building blocks
- **Fact-Based Conditions** (new) - Flexible, composable expressions for power users

---

## Why Hybrid?

### Comparators Strengths
✅ Strong TypeScript type safety  
✅ Self-contained logic  
✅ Plugin architecture  
✅ Great for beginners  
✅ Compile-time validation  

### Fact-Based Strengths
✅ Highly flexible  
✅ Easy to template  
✅ Composable (AND/OR/NOT)  
✅ Great for power users  
✅ Declarative and readable  

### Hybrid = Best of Both Worlds
🎯 Backward compatible with existing comparators  
🎯 Adds flexibility for complex conditions  
🎯 UI can offer both "Builder" and "Advanced" modes  
🎯 Comparators can auto-translate to fact-based  

---

## Example: Same Rule, Two Ways

### Option 1: Comparator (Simple, Type-Safe)
```yaml
obligations:
  - comparator: "hasMinApprovals"
    params: 
      minCount: 2
      groups: ["security"]
    severity: "high"
    decisionOnFail: "block"
```

### Option 2: Fact-Based (Flexible, Composable)
```yaml
conditions:
  all:
    - fact: "pr.approvals.count"
      op: ">="
      value: 2
    - fact: "pr.approvals.groupsSatisfied"
      op: "contains"
      value: "security"
decision:
  onFail: block
  severity: high
```

---

## Implementation Strategy

### Backend
Each comparator exposes its fact-based equivalent:

```typescript
class HasMinApprovalsComparator {
  // Existing comparator logic
  async evaluate(context: EvaluationContext): Promise<boolean> {
    // ... existing code
  }
  
  // NEW: Expose as fact-based conditions
  toFactConditions(params: HasMinApprovalsParams): Condition[] {
    return [
      {
        fact: "pr.approvals.count",
        op: ">=",
        value: params.minCount
      },
      {
        fact: "pr.approvals.groupsSatisfied",
        op: "containsAll",
        value: params.groups
      }
    ];
  }
}
```

### Frontend
Two modes in the UI:

```typescript
// Builder mode: Show comparators (beginner-friendly)
<ComparatorSelector 
  comparators={comparatorRegistry.getAll()}
  onSelect={handleComparatorSelect}
/>

// Advanced mode: Show fact-based builder (power users)
<ConditionBuilder
  facts={factCatalog.getAll()}
  operators={["==", "!=", ">", ">=", "<", "<=", "in", "contains"]}
  onConditionChange={handleConditionChange}
/>
```

---

## Critical Additions from Assessment

### 1. NOT Support (CRITICAL)
```yaml
conditions:
  not:
    - fact: "pr.isDraft"
      op: "=="
      value: true
```

**Why:** Essential for expressing negation of complex conditions

**Effort:** 2-4 hours

---

### 2. Fact Catalog Versioning (HIGH PRIORITY)
```yaml
metadata:
  factCatalogVersion: "v1.0.0"
```

**Why:** 
- Facts can change over time (renamed, deprecated)
- Packs need to pin to stable fact set
- Prevents breaking changes

**Effort:** 4-8 hours

---

## Fact Catalog v1.0 (Core Facts)

### Universal Facts
- `scope.workspace`, `scope.repository`, `scope.branch`, `scope.environment`
- `event.type`, `time.utc`, `actor.user`, `actor.team`
- `pack.packId`, `pack.priority`

### PR Metadata Facts
- `pr.id`, `pr.title`, `pr.labels`, `pr.author`
- `pr.approvals.count`, `pr.approvals.groupsSatisfied`
- `pr.filesChanged.count`, `pr.isDraft`, `pr.targetBranch`

### Diff Facts
- `diff.pathsChanged`, `diff.filesChanged.count`
- `diff.linesAdded`, `diff.linesDeleted`
- `diff.hasRenames`, `diff.hasDeletes`
- `diff.riskScore`, `diff.sensitivePathsTouched`

### OpenAPI Facts (High Priority)
- `openapi.changed`, `openapi.version.from`, `openapi.version.to`
- `openapi.breakingChanges.count`, `openapi.breakingChanges.items`
- `openapi.nonBreakingChanges.count`
- `openapi.addedEndpoints.count`, `openapi.removedEndpoints.count`

### Terraform Facts (Medium Priority)
- `tf.plan.resourceChanges.count`
- `tf.plan.create.count`, `tf.plan.update.count`, `tf.plan.delete.count`
- `tf.plan.hasDestroy`, `tf.plan.resourceTypes`
- `tf.plan.riskScore`

### SBOM Facts (Medium Priority)
- `sbom.packages.count`, `sbom.licenses.denied.count`
- `sbom.cves.critical.count`, `sbom.cves.high.count`

### Drift Facts (Future - Track B)
- `drift.detected`, `drift.resourceType`, `drift.severity`
- `drift.repeatCount.24h`, `drift.repeatCount.7d`
- `drift.remediation.possible`, `drift.remediation.riskScore`

---

## Template Library (15 Templates)

### Track A Templates (8)
1. ✅ **A1:** Block Breaking OpenAPI Changes (CRITICAL)
2. ✅ **A2:** Warn on Non-breaking OpenAPI Changes
3. ✅ **A3:** Require API Owner Approval (CRITICAL)
4. ✅ **A4:** Require Contract Tests Update (CRITICAL)
5. ✅ **A5:** Block Merge Without Required Reviewers
6. ✅ **A6:** Sensitive Paths Security Approval (CRITICAL)
7. ⚠️ **A7:** Warn on CVEs (needs SBOM integration)
8. ⚠️ **A8:** Block Deploy on Gate Fail (needs deploy integration)

### Track B Templates (7) - Future
1. **B1:** IAM Drift Ticket (CRITICAL)
2. **B2:** Auto-apply Low Risk Drift
3. **B3:** Propose Medium Drift Remediation
4. **B4:** Escalate Repeated Drift (CRITICAL)
5. **B5:** Block Network Drift Auto-remediation (CRITICAL)
6. **B6:** Dev Drift Notify Only
7. **B7:** Weekly Drift Report

---

## Migration Path

### For Existing Comparators
Auto-generate fact-based equivalents:

```typescript
comparatorRegistry.getAll().forEach(comparator => {
  const factConditions = comparator.toFactConditions();
  factCatalog.registerComparatorMapping(comparator.id, factConditions);
});
```

### For Existing Packs
Both formats supported:

```yaml
# Old format (still works):
obligations:
  - comparator: "hasMinApprovals"
    params: { minCount: 2 }

# New format (auto-converted):
conditions:
  all:
    - fact: "pr.approvals.count"
      op: ">="
      value: 2
```

---

## Complete Roadmap

### Phase 0: Planning (2-4 hours) - DONE ✅
- JSON Schema design
- Fact Catalog design
- Migration strategy
- Implementation checklist

### Phase 1: Foundation (Week 1: 16-24 hours) - NEXT
- **1.1:** JSON Schema validation (4-6h)
- **1.2:** Metadata fields (3-4h)
- **1.3:** Scope precedence (4-6h)
- **1.4:** Pack-level defaults (4-6h)

### Phase 2: Hybrid Implementation (Week 2: 16-24 hours)
- Fact catalog v1.0
- Fact-based condition evaluator
- NOT support
- UI for fact-based builder
- Comparator → fact translation

### Phase 3: Template Library (Week 3: 12-16 hours)
- Implement 8 Track A templates
- Template loading system
- Template preview UI
- Template customization

### Phase 4: Multi-Pack Engine (Week 4: 16-24 hours)
- Pack discovery and matching
- Conflict resolution
- "Effective policy" view
- Pack conflict detection UI

---

## Success Criteria

### Phase 1
- [ ] All existing packs validate against new schema
- [ ] New metadata fields work in UI
- [ ] Pack precedence can be set
- [ ] Multiple packs can coexist
- [ ] No breaking changes

### Phase 2
- [ ] Fact-based conditions evaluate correctly
- [ ] NOT support works
- [ ] UI offers Builder + Advanced modes
- [ ] Comparators auto-translate to facts

### Phase 3
- [ ] 8 templates available in gallery
- [ ] Templates can be customized
- [ ] Templates validate correctly

### Phase 4
- [ ] Multiple packs evaluate for single PR
- [ ] Conflicts detected and resolved
- [ ] "Effective policy" view shows merged rules

---

## Next Immediate Steps

1. Review `PHASE_1_IMPLEMENTATION_PLAN.md` for detailed tasks
2. Confirm approach and priorities
3. Begin Phase 1.1 (JSON Schema implementation)
4. Install dependencies (`ajv`, `ajv-formats`)
5. Create schema file and validator service

