# Phase 2: Hybrid Comparator/Fact-Based Conditions - Implementation Plan

**Date:** 2026-02-18  
**Status:** 🚀 READY TO START  
**Estimated Duration:** 16-24 hours (Week 2)

---

## 🎯 Executive Summary

### What is Phase 2?

Phase 2 implements a **hybrid approach** that combines:
- **Comparators** (existing) - Type-safe, beginner-friendly building blocks
- **Fact-Based Conditions** (new) - Flexible, composable expressions for power users

### Why Hybrid?

**Comparators** are great for beginners but limited in flexibility.  
**Fact-based conditions** are powerful but require more expertise.  
**Hybrid** gives users both options - use what fits their needs.

### Success Criteria

- [ ] Fact catalog v1.0 implemented with core facts
- [ ] Fact-based condition evaluator works correctly
- [ ] NOT support for negation
- [ ] UI offers both Builder and Advanced modes
- [ ] Comparators can auto-translate to fact-based
- [ ] Backward compatibility maintained
- [ ] All tests passing

---

## 📊 Current State

### ✅ Already Complete (Phase 1)
- JSON Schema validation
- Enhanced metadata (status, owners, labels)
- Scope precedence (priority, merge strategies)
- Pack-level defaults
- Multi-pack evaluation engine
- WorkspacePolicyPack database model
- UI wizard (6 steps)
- Comprehensive documentation

### ⏳ Phase 2 Scope
- Fact catalog implementation
- Fact-based condition evaluator
- NOT/AND/OR condition composition
- Fact catalog versioning
- UI for fact-based builder
- Comparator → fact translation

---

## 🏗️ Implementation Plan

### Phase 2.1: Fact Catalog Foundation (4-6 hours)

#### Tasks
1. Create fact catalog service
2. Define core fact types (Universal, PR, Diff, OpenAPI, Terraform)
3. Implement fact resolver (extract facts from PRContext)
4. Add fact catalog versioning
5. Create fact registry pattern (similar to comparator registry)

#### Deliverables
- `apps/api/src/services/gatekeeper/yaml-dsl/facts/catalog.ts` (150 lines)
- `apps/api/src/services/gatekeeper/yaml-dsl/facts/resolver.ts` (200 lines)
- `apps/api/src/services/gatekeeper/yaml-dsl/facts/types.ts` (100 lines)
- Tests: `catalog.test.ts`, `resolver.test.ts`

---

### Phase 2.2: Condition Evaluator (4-6 hours)

#### Tasks
1. Create condition evaluator service
2. Implement operators (==, !=, >, >=, <, <=, in, contains, containsAll)
3. Implement AND/OR/NOT composition
4. Add condition validation
5. Integrate with pack evaluator

#### Deliverables
- `apps/api/src/services/gatekeeper/yaml-dsl/conditions/evaluator.ts` (250 lines)
- `apps/api/src/services/gatekeeper/yaml-dsl/conditions/operators.ts` (150 lines)
- `apps/api/src/services/gatekeeper/yaml-dsl/conditions/types.ts` (80 lines)
- Tests: `evaluator.test.ts`, `operators.test.ts`

---

### Phase 2.3: Comparator → Fact Translation (3-4 hours)

#### Tasks
1. Add `toFactConditions()` method to comparator base class
2. Implement translation for existing comparators
3. Create auto-translation service
4. Add translation tests

#### Deliverables
- Updated comparator base class
- Translation implementations for 9 existing comparators
- `apps/api/src/services/gatekeeper/yaml-dsl/translation/comparatorToFact.ts` (100 lines)
- Tests: `translation.test.ts`

---

### Phase 2.4: UI - Fact-Based Builder (5-8 hours)

#### Tasks
1. Create ConditionBuilder component (Advanced mode)
2. Create FactSelector component
3. Create OperatorSelector component
4. Add mode toggle (Builder vs Advanced)
5. Integrate with RuleEditor modal
6. Add YAML preview for fact-based conditions

#### Deliverables
- `apps/web/src/components/policy-packs/ConditionBuilder.tsx` (300 lines)
- `apps/web/src/components/policy-packs/FactSelector.tsx` (150 lines)
- `apps/web/src/components/policy-packs/OperatorSelector.tsx` (100 lines)
- Updated `RuleEditor.tsx` with mode toggle

---

## 📐 Technical Design

### Fact Catalog Structure

```typescript
interface Fact {
  id: string;                    // e.g., "pr.approvals.count"
  name: string;                  // e.g., "PR Approval Count"
  description: string;
  category: FactCategory;        // 'universal' | 'pr' | 'diff' | 'openapi' | 'terraform'
  valueType: 'string' | 'number' | 'boolean' | 'array';
  resolver: (context: PRContext) => any;
  version: string;               // e.g., "v1.0.0"
}
```

### Condition Structure

```yaml
# Simple condition
conditions:
  - fact: "pr.approvals.count"
    op: ">="
    value: 2

# AND composition
conditions:
  all:
    - fact: "pr.approvals.count"
      op: ">="
      value: 2
    - fact: "pr.isDraft"
      op: "=="
      value: false

# OR composition
conditions:
  any:
    - fact: "pr.labels"
      op: "contains"
      value: "security"
    - fact: "pr.author"
      op: "in"
      value: ["@security-team"]

# NOT composition
conditions:
  not:
    - fact: "pr.isDraft"
      op: "=="
      value: true
```

---

## 🎯 Next Steps

**Ready to start Phase 2.1: Fact Catalog Foundation**

Would you like me to proceed with implementation?

