# Complex E2E Test Scenario: API Breaking Change

**Date:** 2026-02-28  
**Test ID:** track-a-e2e-001  
**Objective:** Exercise complete Track A implementation with all Phase 1-6 features

---

## 🎯 Test Scenario: Breaking API Change with Multiple Governance Violations

This PR simulates a realistic complex scenario where a developer:
1. Makes a breaking change to a public API endpoint
2. Updates the OpenAPI spec (but with inconsistencies)
3. Modifies database schema without migration
4. Changes authentication requirements
5. Updates some documentation (but not all)

This should trigger multiple governance rules and exercise:
- ✅ Vector Confidence Model (3 components)
- ✅ Stable Fingerprints (SHA-256 hashing)
- ✅ Runtime Validation (20 invariants)
- ✅ Message Catalog (0% freeform prose)
- ✅ IR-Aware Rendering
- ✅ Risk Scoring
- ✅ Evidence Collection

---

## 📋 Changes Made

### 1. API Endpoint Change (Breaking)
**File:** `apps/api/src/routes/users.ts`
- Changed `/api/users/:id` response format
- Removed `email` field (BREAKING)
- Added `contactInfo` nested object
- Changed authentication from API key to OAuth2

### 2. OpenAPI Spec Update (Inconsistent)
**File:** `apps/api/openapi.yaml`
- Updated endpoint definition
- **VIOLATION:** Spec shows `email` as optional (should be removed)
- **VIOLATION:** Missing OAuth2 security scheme definition

### 3. Database Schema Change (No Migration)
**File:** `apps/api/prisma/schema.prisma`
- Added `contactInfo` field to User model
- **VIOLATION:** No migration file created

### 4. Partial Documentation Update
**File:** `apps/api/docs/api-reference.md`
- Updated endpoint documentation
- **VIOLATION:** Missing migration guide for breaking change
- **VIOLATION:** No deprecation notice

---

## 🔍 Expected Governance Findings

### High-Severity Findings (Should BLOCK)

1. **Breaking Change Without Migration Guide**
   - Rule: `breaking-change-documentation`
   - Severity: CRITICAL
   - Risk Score: 85/100
   - Confidence: HIGH (95%)
     - Applicability: 100% (explicit signal: breaking change detected)
     - Evidence: 95% (deterministic: diff analysis)
     - Decision Quality: 95% (all checks passed)

2. **OpenAPI-Code Parity Violation**
   - Rule: `openapi-code-consistency`
   - Severity: HIGH
   - Risk Score: 75/100
   - Confidence: MEDIUM (70%)
     - Applicability: 100% (explicit signal: openapi.yaml changed)
     - Evidence: 70% (heuristic: field mismatch detected)
     - Decision Quality: 80% (partial checks: manual verification needed)

3. **Schema Change Without Migration**
   - Rule: `schema-migration-required`
   - Severity: CRITICAL
   - Risk Score: 90/100
   - Confidence: HIGH (95%)
     - Applicability: 100% (explicit signal: schema.prisma changed)
     - Evidence: 95% (deterministic: no migration file found)
     - Decision Quality: 95% (all checks passed)

### Medium-Severity Findings (Should WARN)

4. **Authentication Change Without Security Review**
   - Rule: `auth-change-requires-review`
   - Severity: MEDIUM
   - Risk Score: 60/100
   - Confidence: MEDIUM (75%)

5. **Incomplete Documentation**
   - Rule: `documentation-completeness`
   - Severity: MEDIUM
   - Risk Score: 50/100
   - Confidence: MEDIUM (70%)

---

## ✅ Expected Track A Features in Output

### 1. Vector Confidence Model
```
Decision Confidence: 🟡 MEDIUM (70%)
- Applicability: 100% (explicit_signal)
  - Found openapi.yaml
  - Found schema.prisma
  - Breaking change detected
- Evidence: 70% (deterministic_baseline + heuristic)
  - 3 deterministic checks passed
  - 2 heuristic checks (manual verification needed)
- Decision Quality: 80% (partial_checks)
  - High-confidence classification
  - Some checks require manual verification
```

### 2. Stable Fingerprints
```
Evaluation Fingerprint: sha256:a1b2c3d4e5f6...
- Repository: Fredjr/VertaAI
- PR: #<number>
- Head SHA: <commit-sha>
- Policy Plan: <policy-plan-id>
- Timestamp: 2026-02-28T...
```

### 3. Runtime Validation
```
✅ All 20 invariants passed
- INVARIANT_01: Counting consistency ✅
- INVARIANT_02: Decision basis ✅
- INVARIANT_03: Confidence display ✅
- INVARIANT_16: 0% freeform prose ✅
- INVARIANT_20: PolicyPlan ledger ✅
... (all 20)
```

### 4. Risk Scoring
```
Risk Score: 85/100 (CRITICAL)
- Blast Radius: 30/40 (Public API, multiple consumers)
- Criticality: 25/30 (Tier-1 service, compliance impact)
- Immediacy: 20/20 (Breaking change, immediate impact)
- Dependency: 10/10 (Blocks other teams)
```

---

## 🚀 How to Run This Test

1. **Push this branch:**
   ```bash
   git push origin test/track-a-e2e-complex-scenario
   ```

2. **Create PR:**
   ```bash
   gh pr create \
     --title "Test: Track A E2E Complex Scenario" \
     --body "See test-scenarios/complex-api-change.md for details"
   ```

3. **Verify GitHub Check:**
   - Check should be created: "VertaAI Policy Evaluation"
   - Status should be: FAILURE (blocking findings)
   - Output should show all Track A features

4. **Inspect Output:**
   - Vector confidence breakdown
   - Stable fingerprints
   - Runtime validation results
   - Risk scores
   - Evidence collection

---

## ✅ Success Criteria

- ✅ PR triggers governance evaluation
- ✅ 5 findings detected (3 blocking, 2 warning)
- ✅ Vector confidence model displayed
- ✅ Stable fingerprints generated
- ✅ All 20 invariants pass
- ✅ Risk scores calculated correctly
- ✅ Evidence collected and displayed
- ✅ GitHub Check created with detailed output
- ✅ 0% freeform prose (all messages from catalog)

---

**This test validates the complete Track A implementation!** 🎉

