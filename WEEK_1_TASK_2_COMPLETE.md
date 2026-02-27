# Week 1 Task 2: Fix OPENAPI_SCHEMA_VALID Comparator

## ✅ STATUS: COMPLETE (Partial - Tests Pending)

---

## 🎯 Objective

Upgrade the `OPENAPI_SCHEMA_VALID` comparator from generic fallback to governance-grade output with:
- ✅ Specific "why it matters" context
- ✅ Concrete "how to fix" steps
- ✅ Patch preview (copy-pasteable OpenAPI template)
- ✅ Calibrated risk score (65 - medium-high)
- ⏳ Test coverage (80%+) - **PENDING**

---

## 📦 Deliverables

### 1. Context-Aware "Why It Matters" ✅

**File:** `apps/api/src/services/gatekeeper/yaml-dsl/ultimateOutputRenderer.ts`
**Function:** `buildContextAwareWhyItMatters()`

**Added:**
```typescript
// OpenAPI schema validation reasoning
if (desc.includes('openapi') && (desc.includes('schema') || desc.includes('valid'))) {
  if (repoType === 'service') {
    return 'Invalid OpenAPI schema breaks API documentation generation, client SDK generation, and contract testing, preventing consumers from reliably integrating with your service.';
  } else {
    return 'Invalid OpenAPI schema prevents automated validation, documentation generation, and integration testing, reducing API quality and consumer confidence.';
  }
}
```

**Impact:**
- Service repos get service-specific reasoning (SDK generation, contract testing)
- Other repos get general API quality reasoning
- No more generic "This policy violation may impact..." fallback

---

### 2. Patch Preview with Remediation Steps ✅

**File:** `apps/api/src/services/gatekeeper/yaml-dsl/ultimateOutputRenderer.ts`
**Function:** `buildPatchPreview()`

**Added:**
- Minimal valid OpenAPI 3.0.0 template (copy-pasteable)
- 5-step remediation process
- Specific validation command (`npx @redocly/cli lint openapi.yaml`)
- Common issues highlighted (missing version, invalid $ref, missing required fields)

**Template Provided:**
```yaml
openapi: 3.0.0
info:
  title: Your API
  version: 1.0.0
  description: Brief description of your API
paths:
  /health:
    get:
      summary: Health check endpoint
      responses:
        '200':
          description: Service is healthy
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: ok
```

---

### 3. Calibrated Risk Score: 65/100 ✅

**File:** `apps/api/src/services/gatekeeper/yaml-dsl/evaluationNormalizer.ts`
**Function:** `computeRiskScore()`

**Risk Breakdown (Target: 65/100 - Medium-High):**
- **Blast Radius:** 20/30 - Invalid API schema breaks tooling for all consumers
- **Criticality:** 25/30 - API schema validity is critical for integrations
- **Immediacy:** 10/20 - Should fix soon (warning level)
- **Dependency:** 10/20 - Invalid schema blocks SDK generation and contract testing

**TOTAL:** 65/100 ✅ (assuming 'warn' decision)

**Rationale:**
- OpenAPI schema validation is **medium-high** risk (not critical, but significant)
- Breaks tooling (docs, SDKs, contract tests) but doesn't directly impact runtime
- Should be yellow-to-low-red (61-100 range) - 65 is appropriate
- Higher than CODEOWNERS (60) but lower than RUNBOOK (70)

**Changes Made:**
```typescript
// Blast Radius
else if (ruleName.includes('openapi') && (ruleName.includes('schema') || ruleName.includes('valid'))) {
  blastRadius = 20;
  blastRadiusReason = 'Invalid API schema breaks tooling for all consumers';
}

// Criticality
else if (ruleName.includes('openapi') && (ruleName.includes('schema') || ruleName.includes('valid'))) {
  baseCriticality = 25; // API schema validity is critical for integrations
}

// Dependency
else if (ruleName.includes('openapi') && (ruleName.includes('schema') || ruleName.includes('valid'))) {
  dependency = 10;
  dependencyReason = 'Invalid schema blocks SDK generation and contract testing';
}
```

---

## 📊 Before vs After

### BEFORE (Generic Fallback)
```markdown
**Why it matters:** This policy violation may impact system reliability, security, or compliance.

**How to fix:**
1. Fix the issue described above

**Risk Score:** 50/100 (default - not calibrated)
```

### AFTER (Governance-Grade)
```markdown
**Why it matters:** Invalid OpenAPI schema breaks API documentation generation, client SDK generation, and contract testing, preventing consumers from reliably integrating with your service.

**How to fix:**
1. Fix invalid OpenAPI schema in your spec file (e.g., `openapi.yaml` or `openapi.json`)
2. Ensure the schema has required fields: `openapi`, `info`, `paths`
3. Validate using: `npx @redocly/cli lint openapi.yaml`
4. Common issues: missing version field, invalid $ref, missing required fields
5. Use the minimal valid schema below as a starting point if needed

📋 **Suggested Patch (click to expand)**
[Minimal valid OpenAPI 3.0.0 template]

**Risk Score:** 65/100 (Blast: 20, Criticality: 25, Immediacy: 10, Dependency: 10)
```

---

## ✅ Success Criteria Met

- ✅ OpenAPI has specific "why it matters" context (DONE)
- ✅ OpenAPI has concrete "how to fix" steps (DONE)
- ✅ OpenAPI has patch preview (DONE)
- ✅ OpenAPI has calibrated risk score (65) (DONE)
- ⏳ OpenAPI has 80%+ test coverage (PENDING)
- ⏳ End-to-end validation shows governance-grade output (PENDING)

---

## 🚀 Next Steps

### Immediate (To Complete Week 1 Task 2)
1. **Create test suite** for OpenAPI comparator
   - File: `apps/api/src/__tests__/quality-assurance/comparators/openapi-schema-valid.test.ts`
   - Coverage: Valid schema → PASS, Invalid schema → FAIL, Edge cases
   - Target: 80%+ code coverage

2. **End-to-end validation**
   - Create a test PR with invalid OpenAPI schema
   - Validate output shows all improvements (context, patch, risk score)
   - Confirm output is governance-grade (not bot-speak)

---

## 📁 Files Modified

1. `apps/api/src/services/gatekeeper/yaml-dsl/ultimateOutputRenderer.ts`
   - `buildContextAwareWhyItMatters()`: Added OpenAPI-specific reasoning
   - `buildPatchPreview()`: Added OpenAPI patch template

2. `apps/api/src/services/gatekeeper/yaml-dsl/evaluationNormalizer.ts`
   - `computeRiskScore()`: Added OpenAPI-specific blast radius (20)
   - `computeRiskScore()`: Added OpenAPI-specific criticality (25)
   - `computeRiskScore()`: Added OpenAPI-specific dependency (10)

---

## 🎓 Key Learnings

1. **Risk Score Composition:** Risk = Blast Radius + Criticality + Immediacy + Dependency
2. **Calibration Strategy:** Compare to similar obligations (CODEOWNERS, RUNBOOK) to ensure consistency
3. **Context-Aware Guidance:** Different repo types (service vs docs) get different "why it matters" reasoning
4. **Patch Previews:** Copy-pasteable templates are more valuable than generic instructions

---

## 📈 Impact on Comparator Coverage

**Updated Status (from COMPARATOR_COVERAGE_AUDIT.md):**
- **Before:** 2/11 comparators have specific remediation (18%)
- **After:** 3/11 comparators have specific remediation (27%)
- **Remaining:** 8 comparators need governance-grade upgrades

**Next Comparators to Fix (Week 2):**
1. `CHECKRUNS_PASSED` - High impact, high usage
2. `APPROVAL_REQUIRED` - High impact, high usage
3. `ARTIFACT_UPDATED` - Medium impact, medium usage

