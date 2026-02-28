# Comparator Implementation Gap Analysis

**Date:** 2026-02-28  
**Status:** 🔍 Analysis Complete

---

## 📊 Summary

**Total Comparators Defined in Enum:** 32  
**Total Comparators Implemented:** 15  
**Implementation Gap:** 17 comparators (53%)

---

## ✅ Implemented Comparators (15)

### Artifact Comparators (2/3)
- ✅ `ARTIFACT_UPDATED` - Implemented in `artifact/artifactUpdated.ts`
- ✅ `ARTIFACT_PRESENT` - Implemented in `artifact/artifactPresent.ts`
- ❌ `ARTIFACT_SECTION_PRESENT` - **NOT IMPLEMENTED**

### Schema Validators (1/5)
- ✅ `OPENAPI_SCHEMA_VALID` - Implemented in `schema/openapiSchemaValid.ts`
- ❌ `JSON_PARSE_VALID` - **NOT IMPLEMENTED**
- ❌ `YAML_PARSE_VALID` - **NOT IMPLEMENTED**
- ❌ `MARKDOWN_PARSE_VALID` - **NOT IMPLEMENTED**
- ❌ `BACKSTAGE_REQUIRED_FIELDS_PRESENT` - **NOT IMPLEMENTED**

### Evidence Comparators (2/4)
- ✅ `PR_TEMPLATE_FIELD_PRESENT` - Implemented in `evidence/prTemplateFieldPresent.ts`
- ✅ `CHECKRUNS_PASSED` - Implemented in `evidence/checkrunsPassed.ts`
- ❌ `TESTS_TOUCHED_OR_JUSTIFIED` - **NOT IMPLEMENTED**
- ❌ `ARTIFACT_UPDATED_OR_JUSTIFIED` - **NOT IMPLEMENTED**

### Governance Comparators (2/4)
- ✅ `MIN_APPROVALS` - Implemented in `governance/minApprovals.ts`
- ✅ `HUMAN_APPROVAL_PRESENT` - Implemented in `governance/humanApprovalPresent.ts`
- ❌ `SENSITIVE_PATH_REQUIRES_APPROVAL` - **NOT IMPLEMENTED**
- ❌ `APPROVER_IN_ALLOWED_SET` - **NOT IMPLEMENTED**

### Safety Comparators (1/3)
- ✅ `NO_SECRETS_IN_DIFF` - Implemented in `safety/noSecretsInDiff.ts`
- ❌ `NO_HARDCODED_URLS` - **NOT IMPLEMENTED**
- ❌ `NO_COMMENTED_CODE` - **NOT IMPLEMENTED**

### Actor/Trigger Comparators (2/4)
- ✅ `ACTOR_IS_AGENT` - Implemented in `actor/actorIsAgent.ts`
- ✅ `CHANGED_PATH_MATCHES` - Implemented in `trigger/changedPathMatches.ts`
- ❌ `PR_MARKED_AGENT` - **NOT IMPLEMENTED**
- ❌ `CHANGED_FILE_EXTENSION_MATCHES` - **NOT IMPLEMENTED**

### Cross-Artifact Comparators (5/5) ✅ **COMPLETE**
- ✅ `OPENAPI_CODE_PARITY` - Implemented in `cross-artifact/openapiCodeParity.ts`
- ✅ `SCHEMA_MIGRATION_PARITY` - Implemented in `cross-artifact/schemaMigrationParity.ts`
- ✅ `CONTRACT_IMPLEMENTATION_PARITY` - Implemented in `cross-artifact/contractImplementationParity.ts`
- ✅ `DOC_CODE_PARITY` - Implemented in `cross-artifact/docCodeParity.ts`
- ✅ `TEST_IMPLEMENTATION_PARITY` - Implemented in `cross-artifact/testImplementationParity.ts`

---

## ❌ Missing Comparators (17)

### High Priority (Used in Policy Packs)
1. **`ARTIFACT_SECTION_PRESENT`** - Check if specific section exists in artifact (e.g., README has "Installation" section)
2. **`TESTS_TOUCHED_OR_JUSTIFIED`** - Verify tests updated OR justification provided
3. **`ARTIFACT_UPDATED_OR_JUSTIFIED`** - Verify artifact updated OR justification provided

### Medium Priority (Common Use Cases)
4. **`JSON_PARSE_VALID`** - Validate JSON files parse correctly
5. **`YAML_PARSE_VALID`** - Validate YAML files parse correctly
6. **`MARKDOWN_PARSE_VALID`** - Validate Markdown files parse correctly
7. **`BACKSTAGE_REQUIRED_FIELDS_PRESENT`** - Validate catalog-info.yaml has required fields
8. **`SENSITIVE_PATH_REQUIRES_APPROVAL`** - Require approval for changes to sensitive paths
9. **`APPROVER_IN_ALLOWED_SET`** - Verify approver is in allowed set
10. **`NO_HARDCODED_URLS`** - Detect hardcoded URLs in code
11. **`NO_COMMENTED_CODE`** - Detect commented-out code blocks

### Low Priority (Edge Cases)
12. **`PR_MARKED_AGENT`** - Check if PR has agent label
13. **`CHANGED_FILE_EXTENSION_MATCHES`** - Filter by file extension

---

## 🎯 Invocation Status

### Auto-Invoked Comparators
✅ **Cross-Artifact Comparators (5)** - Auto-invoked in `PackEvaluator.runCrossArtifactComparators()`
- Runs on EVERY PR before rule evaluation
- Independent of policy pack rules

### Rule-Invoked Comparators (10)
These comparators are only invoked when referenced by policy pack rules:
- `ARTIFACT_UPDATED`
- `ARTIFACT_PRESENT`
- `OPENAPI_SCHEMA_VALID`
- `PR_TEMPLATE_FIELD_PRESENT`
- `CHECKRUNS_PASSED`
- `MIN_APPROVALS`
- `HUMAN_APPROVAL_PRESENT`
- `NO_SECRETS_IN_DIFF`
- `ACTOR_IS_AGENT`
- `CHANGED_PATH_MATCHES`

---

## 🚀 Recommendations

### 1. Implement High-Priority Missing Comparators
Focus on comparators that are likely referenced in policy packs:
- `ARTIFACT_SECTION_PRESENT`
- `TESTS_TOUCHED_OR_JUSTIFIED`
- `ARTIFACT_UPDATED_OR_JUSTIFIED`

### 2. Consider Auto-Invocation for Safety Comparators
Safety comparators should probably run automatically:
- `NO_SECRETS_IN_DIFF` - Already implemented, should auto-invoke
- `NO_HARDCODED_URLS` - Implement and auto-invoke
- `NO_COMMENTED_CODE` - Implement and auto-invoke

### 3. Implement Schema Validators
These are commonly needed for validation:
- `JSON_PARSE_VALID`
- `YAML_PARSE_VALID`
- `BACKSTAGE_REQUIRED_FIELDS_PRESENT`

---

## 📝 Next Steps

1. **Immediate:** Add auto-invocation for `NO_SECRETS_IN_DIFF` (already implemented)
2. **Short-term:** Implement high-priority missing comparators
3. **Medium-term:** Implement schema validators
4. **Long-term:** Complete all 32 comparators for full coverage

