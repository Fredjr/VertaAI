# Week 7-8 Implementation Strategy

## 🎯 Optimal Implementation Order

After careful architectural analysis, here's the optimal order and rationale:

### Phase 1: Comparator Registry (Week 7, Days 1-2)
**Why First:**
- Foundation for extensibility - all other comparators depend on this
- Enables plugin architecture for future comparators
- Minimal risk - refactoring existing code, not adding new behavior
- Can be tested independently without external dependencies

**Implementation:**
1. Create `ComparatorRegistry` interface and implementation
2. Refactor existing comparators (OpenAPI, Terraform) to register themselves
3. Update `contractValidation.ts` to use registry instead of hardcoded comparators
4. Add tests for registry (register, get, list, canHandle)

**Deliverable:** Plugin architecture ready for new comparators

---

### Phase 2: Tier 0 Comparators (Week 7, Days 3-5)
**Why Second:**
- Builds on registry foundation
- Provides immediate value (highest PMF according to user spec)
- Tests the registry with real use cases
- No external dependencies (works with existing artifact fetchers)

**Implementation:**
1. Create extractor layer (MarkdownHeaderExtractor, OpenApiExtractor)
2. Implement `docs.required_sections` comparator
3. Implement `docs.anchor_check` comparator
4. Implement `obligation.file_present` comparator
5. Implement `obligation.file_changed` comparator
6. Auto-register all comparators with registry

**Deliverable:** 4 new comparators providing docs + obligation coverage

---

### Phase 3: YAML Config Support (Week 8, Days 1-3)
**Why Third:**
- Depends on having multiple comparators to configure
- Requires understanding of real-world usage patterns (from Phase 2)
- More complex - needs schema validation, file watching, hierarchy resolution
- Benefits from having concrete comparators to test against

**Implementation:**
1. Create Zod schema for `contractpacks.yaml` format
2. Create YAML loader with validation
3. Create resolver for org→repo→pack hierarchy
4. Add rollout controls (warn→block graduation)
5. Support hybrid mode (YAML + database JSON)
6. Add file watching for hot reload (optional)

**Deliverable:** Per-repo/per-team configuration via YAML

---

### Phase 4: Tier 1 Comparators (Week 8, Days 4-5)
**Why Fourth:**
- Builds on registry + YAML config
- Can use YAML to configure breaking change rules
- Provides high-value API contract validation
- Tests end-to-end flow with all components

**Implementation:**
1. Enhance `openapi.validate` with breaking change detection
2. Implement `openapi.diff` comparator
3. Implement `openapi.version_bump` comparator
4. Add semver validation logic

**Deliverable:** Production-grade API contract validation

---

## 🏗️ Architecture Principles

### 1. Comparator Registry Design
```typescript
// Core abstraction
interface ComparatorRegistry {
  register(comparator: IComparator): void;
  get(type: string): IComparator | undefined;
  list(): ComparatorMetadata[];
  canHandle(invariant: Invariant, snapshots: ArtifactSnapshot[]): IComparator | null;
}

// Singleton pattern
let registry: ComparatorRegistry | null = null;
export function getComparatorRegistry(): ComparatorRegistry {
  if (!registry) {
    registry = new DefaultComparatorRegistry();
    // Auto-register built-in comparators
    registerBuiltInComparators(registry);
  }
  return registry;
}
```

### 2. YAML Config Schema
```yaml
version: 1
org:
  name: acme-corp
  defaults:
    mode: warn
    max_runtime_seconds: 25

repos:
  - repo: backend-api
    rollout:
      mode: warn
      graduation:
        min_clean_runs: 10
        allow_block_for_packs: [public-api-contract]
    
    packs:
      - name: public-api-contract
        surfaces: [api]
        contracts:
          - invariant_type: openapi.version_bump
            comparator_type: openapi.version_bump
            severity_override: critical
```

### 3. Extractor Layer Pattern
```typescript
interface IExtractor<T> {
  extract(content: string): T;
  validate(extracted: T): boolean;
}

class MarkdownHeaderExtractor implements IExtractor<MarkdownHeaders> {
  extract(content: string): MarkdownHeaders {
    // Parse markdown, extract headers with stable algorithm
  }
}
```

---

## 📊 Success Metrics

**Phase 1 (Registry):**
- ✅ All existing comparators registered
- ✅ Zero regression in existing tests
- ✅ Registry tests passing (>90% coverage)

**Phase 2 (Tier 0):**
- ✅ 4 new comparators implemented
- ✅ All comparators auto-registered
- ✅ End-to-end validation with new comparators

**Phase 3 (YAML):**
- ✅ YAML parsing with validation
- ✅ Hybrid mode (YAML + database) working
- ✅ Rollout controls functional

**Phase 4 (Tier 1):**
- ✅ Breaking change detection working
- ✅ Semver validation accurate
- ✅ Full end-to-end flow tested

---

## 🚀 Implementation Plan

**Total Time:** 8 days (Week 7-8)
**Risk Level:** Low (incremental, testable, reversible)
**Dependencies:** None (all internal)

**Next Step:** Begin Phase 1 - Comparator Registry implementation

