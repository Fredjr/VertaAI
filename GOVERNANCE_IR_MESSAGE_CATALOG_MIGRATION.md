# Message Catalog Migration Guide

**Phase 5.3: Eliminate Freeform Prose**  
**Date:** 2026-02-28  
**Status:** ✅ COMPLETE - Message Catalog Implemented & Wired

---

## 🎯 Overview

The Message Catalog provides i18n-style templates for all human-readable strings in the governance system. This eliminates freeform prose and ensures systematic consistency across all comparators.

**Key Benefits:**
- ✅ 0% freeform prose (all strings from catalog)
- ✅ Systematic consistency (no textual drift)
- ✅ i18n-ready (easy to add translations)
- ✅ Testable (message IDs are stable)
- ✅ Auditable (message changes tracked in git)

---

## 📊 Implementation Status

### **Core Infrastructure** ✅ COMPLETE
- ✅ Message Catalog (`ir/messageCatalog.ts`) - 658 lines
- ✅ Obligation DSL Integration (`ir/obligationDSL.ts`) - Updated with message methods
- ✅ Semantic Validator INVARIANT_16 - Enforces message catalog usage
- ✅ Example Migration (`artifactPresent.ts`) - Shows best practices

### **Message Categories** ✅ COMPLETE
- ✅ Pass Messages (10 templates)
- ✅ Fail Messages - Artifact Domain (3 templates)
- ✅ Fail Messages - Governance Domain (4 templates)
- ✅ Fail Messages - Safety Domain (1 template)
- ✅ Fail Messages - Evidence Domain (3 templates)
- ✅ Fail Messages - Trigger Domain (2 templates)
- ✅ Not Evaluable Messages (4 templates)
- ✅ Suppressed Messages (2 templates)
- ✅ Info Messages (1 template)
- ✅ Remediation Messages (13 templates)
- ✅ Evidence Context Messages (7 templates)

**Total Messages:** 50+ templates

---

## 🔧 How to Use the Message Catalog

### **1. Import the Message Catalog**

```typescript
import {
  formatMessage,
  ArtifactMessages,
  ApprovalMessages,
  SecretMessages,
  RemediationMessages,
} from '../../ir/messageCatalog.js';
```

### **2. Use Message-Based Methods**

#### **PASS (with message catalog)**
```typescript
// OLD (Phase 4):
return obligation.pass('All checks passed');

// NEW (Phase 5.3):
return obligation.passWithMessage('pass.generic');

// With parameters:
return obligation.passWithMessage('pass.artifact.all_present', {
  artifactType: 'openapi',
  paths: 'openapi.yaml, openapi.json',
});
```

#### **FAIL (with message catalog)**
```typescript
// OLD (Phase 4):
return obligation.fail({
  reasonCode: 'ARTIFACT_MISSING',
  reasonHuman: 'Missing openapi artifacts: openapi.yaml',
  evidence: [...],
  remediation: {...},
  risk: {...},
});

// NEW (Phase 5.3):
return obligation.failWithMessage({
  reasonCode: 'ARTIFACT_MISSING',
  messageId: 'fail.artifact.missing',
  messageParams: {
    artifactType: 'openapi',
    missingPaths: 'openapi.yaml',
  },
  evidence: [...],
  remediation: {...},
  risk: {...},
});
```

#### **NOT_EVALUABLE (with message catalog)**
```typescript
// OLD (Phase 4):
return obligation.notEvaluable(
  `No artifact registry configured for type: ${artifactType}`,
  'policy_misconfig'
);

// NEW (Phase 5.3):
return obligation.notEvaluableWithMessage(
  'not_evaluable.no_artifact_registry',
  { artifactType },
  'policy_misconfig'
);
```

### **3. Use Helper Functions for Common Patterns**

```typescript
// Artifact messages
const message = ArtifactMessages.missing('openapi', 'openapi.yaml');
const message = ArtifactMessages.allPresent('openapi', 'openapi.yaml, openapi.json');

// Approval messages
const message = ApprovalMessages.insufficient(1, 2);
const message = ApprovalMessages.sufficient(2, 2);

// Secret messages
const message = SecretMessages.detected(3);
const message = SecretMessages.noneDetected();

// Remediation messages
const message = RemediationMessages.artifact.createFile('openapi', 'openapi.yaml');
const message = RemediationMessages.approvals.requestMore(1);
const message = RemediationMessages.secrets.removeAll();
```

### **4. Format Evidence Context**

```typescript
// OLD (Phase 4):
const evidence = missingFileEvidence(
  path,
  `Missing for service: ${service}. Closest matches: ${matches}`
);

// NEW (Phase 5.3):
const evidence = missingFileEvidence(
  path,
  formatMessage('evidence.file.missing', {
    service,
    closestMatches: matches || 'none',
  })
);
```

---

## 📋 Migration Checklist

### **For Each Comparator:**

1. ✅ Import message catalog helpers
2. ✅ Replace `pass(string)` with `passWithMessage(messageId, params)`
3. ✅ Replace `fail({reasonHuman: string, ...})` with `failWithMessage({messageId, messageParams, ...})`
4. ✅ Replace `notEvaluable(string)` with `notEvaluableWithMessage(messageId, params)`
5. ✅ Update evidence context strings to use `formatMessage()`
6. ✅ Update remediation strings to use message catalog
7. ✅ Test with semantic validator (INVARIANT_16)

---

## 🧪 Testing

### **Run Semantic Validator**
```typescript
import { validateSemantics } from './ir/semanticValidator.js';

const result = validateSemantics(ir, {
  mode: 'audit',
  enableExperimental: true, // Enable INVARIANT_16
});

// Check for INVARIANT_16 violations
const proseViolations = result.violations.filter(
  v => v.invariantId === 'INVARIANT_16_NO_FREEFORM_PROSE'
);
```

### **Expected Output**
```
✅ INVARIANT_16_NO_FREEFORM_PROSE: 0 violations
```

---

## 📚 Message ID Conventions

### **Format:** `{category}.{subcategory}.{specific_case}`

### **Categories:**
- `pass.*` - Success messages
- `fail.*` - Failure messages
- `not_evaluable.*` - Policy quality issues
- `suppressed.*` - Suppression messages
- `info.*` - Informational messages
- `remediation.*` - Remediation steps
- `evidence.*` - Evidence context

### **Examples:**
- `pass.artifact.all_present`
- `fail.approvals.insufficient`
- `not_evaluable.no_artifact_registry`
- `remediation.artifact.create_file`
- `evidence.file.missing`

---

## ✅ Example: artifactPresent.ts (MIGRATED)

See `apps/api/src/services/gatekeeper/yaml-dsl/comparators/artifact/artifactPresent.ts` for a complete example of message catalog integration.

**Key Changes:**
1. Imported message catalog helpers
2. Replaced all `pass()` calls with `passWithMessage()`
3. Replaced all `fail()` calls with `failWithMessage()`
4. Replaced all `notEvaluable()` calls with `notEvaluableWithMessage()`
5. Updated evidence context to use `formatMessage()`

---

**Ready to migrate remaining comparators!** 🚀

