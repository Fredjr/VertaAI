# Phase 4: Obligation DSL - Implementation Strategy

## 🎯 Objective

Enable policy packs (comparators) to produce **structured IR directly** instead of raw findings, eliminating the need for the normalizer to "guess" intent from unstructured data.

---

## 📊 Current State Analysis

### **How Comparators Work Today**

```typescript
// Current: Comparators return unstructured findings
export const artifactPresentComparator: Comparator = {
  id: ComparatorId.ARTIFACT_PRESENT,
  version: '1.0.0',
  
  async evaluate(context: PRContext, params: any): Promise<ComparatorResult> {
    // ... check if artifact exists ...
    
    return {
      comparatorId: this.id,
      status: 'pass' | 'fail' | 'unknown',
      reasonCode: FindingCode.ARTIFACT_MISSING,
      message: 'Missing openapi.yaml artifacts: ...',
      evidence: [
        { type: 'file', path: 'openapi.yaml', snippet: '...' }
      ],
      metadata: {
        evidenceSearch: { searchedPaths, matchedPaths, closestMatches }
      }
    };
  }
};
```

### **Problem: Normalizer Must "Guess" Intent**

The normalizer receives raw `ComparatorResult` and must:
1. Parse the `message` string to extract meaning
2. Infer severity from `reasonCode`
3. Guess remediation steps from context
4. Estimate risk scores heuristically
5. Reconstruct structured evidence from metadata

**This is fragile and error-prone.**

---

## 🎯 Desired State: Structured IR Output

### **New: Comparators Return Structured ObligationResult**

```typescript
// NEW: Comparators return structured IR
export const artifactPresentComparator: Comparator = {
  id: ComparatorId.ARTIFACT_PRESENT,
  version: '2.0.0',
  
  async evaluate(context: PRContext, params: any): Promise<ObligationResult> {
    // ... check if artifact exists ...
    
    return {
      id: 'artifact-present-openapi',
      title: 'OpenAPI Specification Present',
      controlObjective: 'Ensure API contracts are documented and versioned',
      scope: 'repo_invariant',
      decisionOnFail: 'block',
      status: 'FAIL',
      reasonCode: 'ARTIFACT_MISSING',
      reasonHuman: 'OpenAPI specification not found in expected locations',
      evidence: [
        {
          location: 'openapi.yaml',
          found: false,
          value: null,
          context: 'Searched in: openapi.yaml, docs/openapi.yaml, api/openapi.yaml'
        }
      ],
      evidenceSearch: {
        locationsSearched: ['openapi.yaml', 'docs/openapi.yaml', 'api/openapi.yaml'],
        strategy: 'file_presence',
        confidence: 1.0
      },
      remediation: {
        minimumToPass: [
          'Add OpenAPI specification file (openapi.yaml)',
          'Document all API endpoints with request/response schemas'
        ],
        patch: null,
        links: ['https://spec.openapis.org/oas/latest.html'],
        owner: 'api-platform-team'
      },
      risk: {
        total: 75,
        breakdown: {
          blastRadius: 30,
          criticality: 25,
          immediacy: 10,
          dependency: 10
        },
        reasons: {
          blastRadius: 'API changes affect all consumers',
          criticality: 'Breaking changes can cause production incidents',
          immediacy: 'No immediate impact (repo invariant)',
          dependency: 'API consumers depend on contract stability'
        }
      },
      confidence: {
        applicability: 1.0,
        evidence: 1.0,
        overall: 1.0
      }
    };
  }
};
```

---

## 🔄 Migration Strategy: Dual-Format Support

### **Phase 4.1: Create Obligation DSL Helpers**

Create helper functions that make it easy for comparators to produce structured IR:

```typescript
// apps/api/src/services/gatekeeper/yaml-dsl/ir/obligationDSL.ts

export function createObligation(params: {
  id: string;
  title: string;
  controlObjective: string;
  scope: 'repo_invariant' | 'diff_derived' | 'environment_gate';
  decisionOnFail: 'block' | 'warn' | 'pass';
}): ObligationBuilder {
  return new ObligationBuilder(params);
}

class ObligationBuilder {
  private obligation: Partial<ObligationResult>;
  
  constructor(params) {
    this.obligation = { ...params };
  }
  
  pass(reason: string): ObligationResult {
    return {
      ...this.obligation,
      status: 'PASS',
      reasonCode: 'PASS',
      reasonHuman: reason,
      evidence: [],
      // ... defaults
    } as ObligationResult;
  }
  
  fail(params: {
    reasonCode: ReasonCode;
    reasonHuman: string;
    evidence: EvidenceItem[];
    remediation: Remediation;
    risk: RiskScore;
  }): ObligationResult {
    return {
      ...this.obligation,
      status: 'FAIL',
      ...params,
      // ... defaults
    } as ObligationResult;
  }
  
  notEvaluable(reason: string): ObligationResult {
    return {
      ...this.obligation,
      status: 'NOT_EVALUABLE',
      reasonCode: 'NOT_EVALUABLE',
      reasonHuman: reason,
      // ... defaults
    } as ObligationResult;
  }
}
```

### **Phase 4.2: Update Comparator Interface**

Add optional `evaluateStructured` method to comparator interface:

```typescript
export interface Comparator {
  id: ComparatorId;
  version: string;
  
  // Legacy method (still supported)
  evaluate(context: PRContext, params: any): Promise<ComparatorResult>;
  
  // NEW: Structured IR method (optional)
  evaluateStructured?(context: PRContext, params: any): Promise<ObligationResult>;
}
```

### **Phase 4.3: Migrate 3 Pilot Comparators**

Migrate these comparators to use the new DSL:
1. **ARTIFACT_PRESENT** (simple, file-based)
2. **ARTIFACT_UPDATED** (diff-based)
3. **OPENAPI_SCHEMA_VALID** (schema validation)

### **Phase 4.4: Update Normalizer to Prefer Structured Output**

```typescript
// evaluationNormalizer.ts

async function normalizeComparatorResult(
  result: ComparatorResult | ObligationResult,
  context: PRContext
): Promise<NormalizedObligation> {
  // NEW: If result is already structured IR, use it directly
  if ('controlObjective' in result) {
    return result as ObligationResult;
  }
  
  // LEGACY: Parse unstructured result (existing logic)
  return parseUnstructuredResult(result, context);
}
```

---

## 📝 Implementation Plan

### **Step 1: Create Obligation DSL Helpers** (1 file)
- `apps/api/src/services/gatekeeper/yaml-dsl/ir/obligationDSL.ts`
- Helper functions for creating structured obligations
- Builder pattern for fluent API

### **Step 2: Update Comparator Interface** (1 file)
- `apps/api/src/services/gatekeeper/yaml-dsl/comparators/types.ts`
- Add `evaluateStructured` optional method
- Maintain backward compatibility

### **Step 3: Migrate ARTIFACT_PRESENT** (1 file)
- `apps/api/src/services/gatekeeper/yaml-dsl/comparators/artifact/artifactPresent.ts`
- Add `evaluateStructured` implementation
- Keep `evaluate` for backward compatibility

### **Step 4: Migrate ARTIFACT_UPDATED** (1 file)
- `apps/api/src/services/gatekeeper/yaml-dsl/comparators/artifact/artifactUpdated.ts`
- Add `evaluateStructured` implementation

### **Step 5: Migrate OPENAPI_SCHEMA_VALID** (1 file)
- `apps/api/src/services/gatekeeper/yaml-dsl/comparators/schema/openapiSchemaValid.ts`
- Add `evaluateStructured` implementation

### **Step 6: Update Normalizer** (1 file)
- `apps/api/src/services/gatekeeper/yaml-dsl/evaluationNormalizer.ts`
- Prefer structured output when available
- Fall back to legacy parsing

### **Step 7: Test & Verify**
- Run existing tests
- Compare output with/without structured IR
- Ensure zero regressions

---

## ✅ Success Criteria

1. ✅ Obligation DSL helpers created
2. ✅ Comparator interface updated (backward compatible)
3. ✅ 3 comparators migrated to structured output
4. ✅ Normalizer prefers structured output
5. ✅ All existing tests pass
6. ✅ Zero output regressions
7. ✅ Legacy comparators still work

---

## 🎯 Benefits

1. **Eliminates Normalizer Guessing** - Comparators explicitly state intent
2. **Compile-Time Validation** - TypeScript ensures correct structure
3. **Richer Context** - Structured evidence, remediation, risk scores
4. **Standardized Obligations** - Consistent format across all packs
5. **Easier Testing** - Structured data is easier to assert against
6. **Better Observability** - Structured logs and metrics

---

## 🚀 Next Steps

1. Create Obligation DSL helpers
2. Update comparator interface
3. Migrate 3 pilot comparators
4. Update normalizer
5. Test for regressions
6. Gradually migrate remaining comparators


