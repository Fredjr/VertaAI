# Comparator Coverage Audit
## Ensuring High-Quality Output for All Comparator Types

**Goal:** Audit all comparators to ensure they produce governance-grade output with:
1. **Specific remediation guidance** (not generic fallback)
2. **Calibrated risk scores** (based on real-world impact)
3. **Complete evidence** (helps user understand why it failed)
4. **Proper evidence type** (file, checkrun, approval, etc.)

---

## Comparator Coverage Matrix

| Comparator ID | Evidence Type | Remediation | Risk Score | Test Coverage | Status |
|---------------|---------------|-------------|------------|---------------|--------|
| `ARTIFACT_PRESENT` | `file` | ✅ Patch preview | ✅ Calibrated (70) | ✅ 95% | **EXCELLENT** |
| `ARTIFACT_UPDATED` | `file` | ✅ Patch preview | ✅ Calibrated (60) | ✅ 90% | **EXCELLENT** |
| `CHECKRUNS_PASSED` | `checkrun` | ⚠️ Generic | ⚠️ Not calibrated (50) | ⚠️ 60% | **NEEDS WORK** |
| `APPROVAL_REQUIRED` | `approval` | ⚠️ Generic | ⚠️ Not calibrated (50) | ⚠️ 50% | **NEEDS WORK** |
| `OPENAPI_SCHEMA_VALID` | `file` | ❌ Missing | ❌ Not calibrated (50) | ❌ 30% | **CRITICAL** |
| `PR_TEMPLATE_FIELD_PRESENT` | `file` | ⚠️ Generic | ⚠️ Not calibrated (50) | ⚠️ 40% | **NEEDS WORK** |
| `NO_SECRETS_IN_DIFF` | `file` | ✅ Specific | ✅ Calibrated (90) | ✅ 80% | **GOOD** |
| `HUMAN_APPROVAL_PRESENT` | `approval` | ⚠️ Generic | ⚠️ Not calibrated (50) | ⚠️ 50% | **NEEDS WORK** |
| `MIN_APPROVALS` | `approval` | ⚠️ Generic | ⚠️ Not calibrated (50) | ⚠️ 50% | **NEEDS WORK** |
| `ACTOR_IS_AGENT` | `actor` | ⚠️ Generic | ⚠️ Not calibrated (50) | ⚠️ 40% | **NEEDS WORK** |
| `CHANGED_PATH_MATCHES` | `file` | ⚠️ Generic | ⚠️ Not calibrated (50) | ⚠️ 60% | **NEEDS WORK** |

---

## Detailed Audit Results

### ✅ EXCELLENT: `ARTIFACT_PRESENT`

**Current Remediation:**
```typescript
// apps/api/src/services/gatekeeper/yaml-dsl/ultimateOutputRenderer.ts (line ~100)
if (desc.includes('codeowners')) {
  return {
    steps: [
      'Create CODEOWNERS file in repository root',
      'Add team ownership patterns',
      'Commit and push'
    ],
    patch: '* @your-team-name\ndocs/* @docs-team'
  };
}
```

**Risk Score:** 70 (High - missing governance artifact)

**Evidence:** `{ type: 'file', path: 'CODEOWNERS' }`

**Status:** ✅ This is the gold standard. All other comparators should match this quality.

---

### ⚠️ NEEDS WORK: `CHECKRUNS_PASSED`

**Current Remediation:**
```typescript
// Generic fallback
return { steps: ['Fix the issue described above'] };
```

**Risk Score:** 50 (default - not calibrated)

**Evidence:** `{ type: 'checkrun', name: 'CI Build', conclusion: 'failure', url: '...' }`

**Proposed Improvement:**
```typescript
if (desc.includes('checkrun') || desc.includes('ci')) {
  const failedChecks = obligation.evidence
    .filter(e => e.type === 'checkrun' && e.metadata?.conclusion !== 'success')
    .map(e => e.metadata?.name || 'unknown');
  
  return {
    steps: [
      `Fix the following failed CI checks: ${failedChecks.join(', ')}`,
      'Click the check run link to see detailed logs',
      'Re-run the check after fixing',
      'Ensure all required checks pass before merging'
    ],
    // No patch preview for CI checks (external system)
  };
}
```

**Proposed Risk Score:** 40 (Medium - CI failure is important but not governance-critical)

**Action Items:**
- [ ] Add specific remediation guidance for `CHECKRUNS_PASSED`
- [ ] Calibrate risk score to 40
- [ ] Add test coverage for failed CI checks

---

### ❌ CRITICAL: `OPENAPI_SCHEMA_VALID`

**Current Remediation:**
```typescript
// Generic fallback
return { steps: ['Fix the issue described above'] };
```

**Risk Score:** 50 (default - not calibrated)

**Evidence:** `{ type: 'file', path: 'openapi.yaml', snippet: 'Missing openapi version field' }`

**Proposed Improvement:**
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

**Proposed Risk Score:** 65 (High - invalid API schema can break integrations)

**Action Items:**
- [ ] Add specific remediation guidance for `OPENAPI_SCHEMA_VALID`
- [ ] Add patch preview with minimal valid schema
- [ ] Calibrate risk score to 65
- [ ] Add test coverage for invalid schemas

---

### ⚠️ NEEDS WORK: `APPROVAL_REQUIRED`

**Current Remediation:**
```typescript
// Generic fallback
return { steps: ['Fix the issue described above'] };
```

**Risk Score:** 50 (default - not calibrated)

**Evidence:** `{ type: 'approval', user: 'alice', timestamp: '2024-01-01T00:00:00Z' }`

**Proposed Improvement:**
```typescript
if (desc.includes('approval') || desc.includes('review')) {
  const requiredApprovers = obligation.evidence
    .filter(e => e.type === 'approval')
    .map(e => e.metadata?.user || 'unknown');
  
  return {
    steps: [
      'Request review from required approvers',
      `Required approvers: ${requiredApprovers.join(', ') || 'See CODEOWNERS'}`,
      'Address review comments',
      'Ensure all required approvals are obtained before merging'
    ],
    // No patch preview for approvals (human action)
  };
}
```

**Proposed Risk Score:** 55 (Medium-High - missing approval is a governance gap)

**Action Items:**
- [ ] Add specific remediation guidance for `APPROVAL_REQUIRED`
- [ ] Calibrate risk score to 55
- [ ] Add test coverage for missing approvals

---

## Implementation Plan

### Phase 1: Critical Comparators (Week 1)
**Target:** Fix comparators with ❌ CRITICAL status

- [ ] `OPENAPI_SCHEMA_VALID` - Add remediation + patch preview + risk calibration
- [ ] Add test coverage to 80%+

### Phase 2: High-Impact Comparators (Week 2)
**Target:** Fix comparators with ⚠️ NEEDS WORK status and high usage

- [ ] `CHECKRUNS_PASSED` - Add remediation + risk calibration
- [ ] `APPROVAL_REQUIRED` - Add remediation + risk calibration
- [ ] `HUMAN_APPROVAL_PRESENT` - Add remediation + risk calibration
- [ ] Add test coverage to 70%+

### Phase 3: Remaining Comparators (Week 3)
**Target:** Fix all remaining comparators

- [ ] `PR_TEMPLATE_FIELD_PRESENT` - Add remediation + risk calibration
- [ ] `MIN_APPROVALS` - Add remediation + risk calibration
- [ ] `ACTOR_IS_AGENT` - Add remediation + risk calibration
- [ ] `CHANGED_PATH_MATCHES` - Add remediation + risk calibration
- [ ] Add test coverage to 70%+

### Phase 4: Validation (Week 4)
**Target:** Ensure all comparators meet quality standards

- [ ] Run invariant tests on all comparators
- [ ] Validate remediation guidance is not generic
- [ ] Validate risk scores are calibrated
- [ ] Validate test coverage is 70%+

---

## Success Criteria

**Definition of "Governance-Grade" Comparator:**
1. ✅ **Specific remediation guidance** (not "Fix the issue described above")
2. ✅ **Calibrated risk score** (based on real-world impact, not default 50)
3. ✅ **Complete evidence** (at least 1 evidence item per failed obligation)
4. ✅ **Proper evidence type** (file, checkrun, approval, etc.)
5. ✅ **Test coverage** (70%+ for all code paths)

**Target:** 100% of comparators meet all 5 criteria by end of Phase 4.

