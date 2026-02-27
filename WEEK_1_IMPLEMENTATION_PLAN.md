# Week 1 Implementation Plan: Invariant Testing + Critical Comparator Fix

## Objective
Establish the foundation for systematic quality assurance by:
1. Implementing invariant tests with real data
2. Fixing the most critical comparator (`OPENAPI_SCHEMA_VALID`)
3. Validating the framework works end-to-end

---

## Task 1: Implement Invariant Tests with Real Data

### 1.1 Create Test Fixtures

**File:** `apps/api/src/__tests__/quality-assurance/fixtures/`

Create realistic test data representing different scenarios:

```typescript
// fixtures/simple-baseline-failure.ts
export const simpleBaselineFailure: PackResult[] = [
  {
    packName: 'baseline',
    result: {
      decision: 'warn',
      evaluationGraph: {
        allSurfaces: [
          { surfaceId: 'repo-root', surfaceType: 'repository', path: '/' }
        ],
        obligations: [
          {
            id: 'baseline-codeowners',
            description: 'CODEOWNERS file must be present',
            decisionOnFail: 'warn',
            result: {
              status: 'fail',
              message: 'CODEOWNERS file not found',
              evidence: [
                { type: 'file', path: 'CODEOWNERS', value: 'File not found' }
              ]
            }
          }
        ]
      }
    }
  }
];
```

**Scenarios to Create:**
- [ ] Simple baseline failure (1 failed obligation)
- [ ] Multiple pack evaluation (baseline + tier overlay)
- [ ] Mixed pass/fail/suppressed obligations
- [ ] Repo invariant only (no diff-derived)
- [ ] Complex evaluation (10+ obligations)

---

### 1.2 Implement Invariant 1: Counting Consistency

**File:** `apps/api/src/__tests__/quality-assurance/invariants.test.ts`

```typescript
describe('INVARIANT 1: Counting Consistency', () => {
  it('should have consistent counts in title, body, and metadata', () => {
    // Arrange
    const packResults = simpleBaselineFailure;
    const normalized = normalizeEvaluationResults(packResults, 'warn');
    
    // Act
    const title = buildMultiPackCheckTitleFromNormalized(normalized, 'warn');
    const body = renderUltimateOutput(normalized, 'warn');
    
    // Extract counts from title
    const titleMatch = title.match(/(\d+) obligation\(s\) considered/);
    const titleCount = titleMatch ? parseInt(titleMatch[1]) : 0;
    
    // Extract counts from metadata section
    const metadataMatch = body.match(/Obligations Considered: (\d+) total/);
    const metadataCount = metadataMatch ? parseInt(metadataMatch[1]) : 0;
    
    // Assert
    expect(titleCount).toBe(metadataCount);
    expect(titleCount).toBe(normalized.obligations.length);
  });
});
```

**Implementation Steps:**
- [ ] Create test fixtures for different scenarios
- [ ] Implement count extraction logic
- [ ] Validate counts match across title, body, metadata
- [ ] Test with 5+ different scenarios

---

### 1.3 Implement Invariant 2: Decision Determinism

```typescript
describe('INVARIANT 2: Decision Determinism', () => {
  it('should produce the same decision for the same input (run 10 times)', () => {
    const packResults = simpleBaselineFailure;
    
    const results = Array.from({ length: 10 }, () => 
      normalizeEvaluationResults(packResults, 'warn')
    );
    
    // All decisions should be identical
    const firstDecision = results[0].decision;
    results.forEach(result => {
      expect(result.decision).toEqual(firstDecision);
    });
  });
});
```

---

### 1.4 Implement Invariant 3: Confidence Bounds

```typescript
describe('INVARIANT 3: Confidence Bounds', () => {
  it('should have confidence scores between 0 and 100', () => {
    const packResults = simpleBaselineFailure;
    const normalized = normalizeEvaluationResults(packResults, 'warn');
    
    // Check all confidence scores
    expect(normalized.confidence.decision.score).toBeGreaterThanOrEqual(0);
    expect(normalized.confidence.decision.score).toBeLessThanOrEqual(100);
    
    expect(normalized.confidence.classification.score).toBeGreaterThanOrEqual(0);
    expect(normalized.confidence.classification.score).toBeLessThanOrEqual(100);
    
    expect(normalized.confidence.aggregate.score).toBeGreaterThanOrEqual(0);
    expect(normalized.confidence.aggregate.score).toBeLessThanOrEqual(100);
  });
});
```

---

### 1.5 Implement Invariant 4: Evidence Completeness

```typescript
describe('INVARIANT 4: Evidence Completeness', () => {
  it('should have at least 1 evidence item for every failed obligation', () => {
    const packResults = simpleBaselineFailure;
    const normalized = normalizeEvaluationResults(packResults, 'warn');
    
    const failedObligations = normalized.obligations.filter(
      o => o.result.status === 'fail'
    );
    
    failedObligations.forEach(obligation => {
      expect(obligation.evidence.length).toBeGreaterThan(0);
    });
  });
});
```

---

### 1.6 Implement Invariant 5: Remediation Presence

```typescript
describe('INVARIANT 5: Remediation Presence', () => {
  it('should have remediation guidance for every failed obligation', () => {
    const packResults = simpleBaselineFailure;
    const normalized = normalizeEvaluationResults(packResults, 'warn');
    const body = renderUltimateOutput(normalized, 'warn');
    
    const failedObligations = normalized.obligations.filter(
      o => o.result.status === 'fail'
    );
    
    failedObligations.forEach(obligation => {
      // Check that the body contains "How to Fix" section for this obligation
      expect(body).toContain('How to Fix');
      // Check that it's not the generic fallback
      expect(body).not.toContain('Fix the issue described above');
    });
  });
});
```

---

### 1.7 Implement Invariant 6: Semantic Consistency

```typescript
describe('INVARIANT 6: Semantic Consistency', () => {
  it('should label repo invariants as "Checks Evaluated" (not "Change Surface")', () => {
    const packResults = repoInvariantOnly; // Fixture with only baseline checks
    const normalized = normalizeEvaluationResults(packResults, 'warn');
    const body = renderUltimateOutput(normalized, 'warn');
    
    // Should use "Checks Evaluated" for repo invariants
    expect(body).toContain('Checks Evaluated');
    expect(body).not.toContain('Change Surface Summary');
  });
});
```

---

## Task 2: Fix Critical Comparator (`OPENAPI_SCHEMA_VALID`)

### 2.1 Add Remediation Template

**File:** `apps/api/src/services/gatekeeper/yaml-dsl/ultimateOutputRenderer.ts`

**Location:** In the `buildRemediationGuidance()` function (around line 100)

**Add this case:**
```typescript
if (desc.includes('openapi') && desc.includes('schema')) {
  const invalidFiles = obligation.evidence
    .filter(e => e.type === 'file')
    .map(e => e.metadata?.path || 'unknown');
  
  return {
    steps: [
      `Fix invalid OpenAPI schema in: ${invalidFiles.join(', ')}`,
      'Ensure the schema has required fields: openapi, info, paths',
      'Validate using: npx @redocly/cli lint openapi.yaml',
      'Common issues: missing version, invalid $ref, missing required fields'
    ],
    patch: `openapi: 3.0.0
info:
  title: Your API
  version: 1.0.0
paths:
  /health:
    get:
      summary: Health check
      responses:
        '200':
          description: OK`
  };
}
```

---

### 2.2 Calibrate Risk Score

**File:** `apps/api/src/services/gatekeeper/yaml-dsl/evaluationNormalizer.ts`

**Location:** In the `computeRiskScore()` function (around line 600)

**Add this case:**
```typescript
if (obligation.kind === ObligationKind.OPENAPI_SCHEMA_VALID) {
  score += 15; // High - invalid API schema can break integrations
}
```

---

### 2.3 Add Test Coverage

**File:** `apps/api/src/__tests__/comparators/openapiSchemaValid.test.ts`

Create comprehensive tests for:
- [ ] Valid OpenAPI 3.0 schema
- [ ] Invalid schema (missing openapi field)
- [ ] Invalid schema (missing info field)
- [ ] Invalid schema (missing paths field)
- [ ] Invalid JSON/YAML syntax

---

## Task 3: End-to-End Validation

### 3.1 Run Invariant Tests

```bash
cd apps/api
npm test -- invariants.test.ts
```

**Expected Result:** All 6 invariants pass for all test scenarios

---

### 3.2 Validate OPENAPI_SCHEMA_VALID Fix

Create a test PR in `/tmp/vertaai-e2e-test` with:
- Invalid OpenAPI schema
- Trigger policy evaluation
- Verify output shows specific remediation guidance (not generic)

---

## Success Criteria

**Week 1 is complete when:**
- [ ] All 6 invariant tests are implemented with real data
- [ ] All invariant tests pass for 5+ different scenarios
- [ ] `OPENAPI_SCHEMA_VALID` has specific remediation guidance
- [ ] `OPENAPI_SCHEMA_VALID` has calibrated risk score (65)
- [ ] `OPENAPI_SCHEMA_VALID` has 80%+ test coverage
- [ ] End-to-end validation shows governance-grade output

---

## Next Steps (Week 2)

After Week 1 is complete:
- Fix `CHECKRUNS_PASSED` comparator
- Fix `APPROVAL_REQUIRED` comparator
- Fix `HUMAN_APPROVAL_PRESENT` comparator
- Continue building out the quality assurance framework

