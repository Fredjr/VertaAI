# Cross-Artifact Comparators Assessment

## ✅ **All 5 Comparators Are Actively Used**

### 1. **OPENAPI_CODE_PARITY** ✅
- **File:** `apps/api/src/services/gatekeeper/yaml-dsl/comparators/cross-artifact/openapiCodeParity.ts`
- **Registered:** Yes (auto-invoked)
- **Renders in UI:** Yes (Cross-Artifact & Safety Checks section)
- **Detection Logic:**
  - Detects OpenAPI spec changes (openapi.yaml, swagger.yaml)
  - Detects code changes (routes/, handlers/, controllers/, api/, endpoints/)
  - Flags mismatch: OpenAPI changed but no code, or code changed but no OpenAPI
- **Evidence:** File references with change counts
- **Status:** ✅ **WORKING**

### 2. **SCHEMA_MIGRATION_PARITY** ✅
- **File:** `apps/api/src/services/gatekeeper/yaml-dsl/comparators/cross-artifact/schemaMigrationParity.ts`
- **Registered:** Yes (auto-invoked)
- **Renders in UI:** Yes (Cross-Artifact & Safety Checks section)
- **Detection Logic:**
  - Detects schema changes (schema.prisma, *.sql, knexfile.js)
  - Detects migration changes (migrations/, alembic/, flyway/)
  - Flags mismatch: Schema changed but no migration, or migration added but no schema change
- **Evidence:** File references with change counts
- **Status:** ✅ **WORKING** (verified in PR #35)

### 3. **CONTRACT_IMPLEMENTATION_PARITY** ✅
- **File:** `apps/api/src/services/gatekeeper/yaml-dsl/comparators/cross-artifact/contractImplementationParity.ts`
- **Registered:** Yes (auto-invoked)
- **Renders in UI:** Yes (Cross-Artifact & Safety Checks section)
- **Detection Logic:**
  - Detects contract changes (*.proto, *.thrift, *.avsc, *.graphql)
  - Detects implementation changes (generated/, codegen/, client/, server/)
  - Flags mismatch: Contract changed but no implementation, or implementation changed but no contract
- **Evidence:** File references with change counts
- **Status:** ✅ **WORKING**

### 4. **DOC_CODE_PARITY** ✅
- **File:** `apps/api/src/services/gatekeeper/yaml-dsl/comparators/cross-artifact/docCodeParity.ts`
- **Registered:** Yes (auto-invoked)
- **Renders in UI:** Yes (Cross-Artifact & Safety Checks section)
- **Detection Logic:**
  - Detects doc changes (*.md, docs/, README)
  - Detects code changes (*.ts, *.js, *.py, *.go, *.java, *.rb)
  - Flags mismatch: Code changed but docs not updated, or docs reference outdated code
- **Evidence:** File references with change counts
- **Status:** ✅ **WORKING**

### 5. **TEST_IMPLEMENTATION_PARITY** ✅
- **File:** `apps/api/src/services/gatekeeper/yaml-dsl/comparators/cross-artifact/testImplementationParity.ts`
- **Registered:** Yes (auto-invoked)
- **Renders in UI:** Yes (Cross-Artifact & Safety Checks section)
- **Detection Logic:**
  - Detects test changes (*.test.*, *.spec.*, __tests__/)
  - Detects implementation changes (src/, lib/, app/)
  - Flags mismatch: Implementation changed but tests not updated, or new implementation without tests
- **Evidence:** File references with change counts
- **Status:** ✅ **WORKING**

---

## 📊 **Current Artifact Graph (Implicit)**

```
service
  ├─→ openapi.yaml ─→ routes/endpoints (OPENAPI_CODE_PARITY)
  ├─→ schema.prisma ─→ migrations/ (SCHEMA_MIGRATION_PARITY)
  ├─→ *.proto ─→ generated/ (CONTRACT_IMPLEMENTATION_PARITY)
  ├─→ docs/ ─→ src/ (DOC_CODE_PARITY)
  └─→ src/ ─→ __tests__/ (TEST_IMPLEMENTATION_PARITY)
```

---

## ❌ **Missing Edges for 11.1 Acceptance Criteria**

To fully meet the "governance layer, not bot" differentiator, we need:

### **Missing Edge 1: service → dashboards → alerts**
- **Artifact:** Grafana dashboards, Datadog monitors, CloudWatch alarms
- **Invariant:** Service changes should update monitoring dashboards
- **Example:** New endpoint added → dashboard should track its latency/errors

### **Missing Edge 2: service → runbook → ownership**
- **Artifact:** Runbooks (docs/runbooks/), PagerDuty configs, CODEOWNERS
- **Invariant:** Service ownership must be declared and documented
- **Example:** New service → must have runbook + CODEOWNERS + on-call rotation

### **Missing Edge 3: service → SLO → alert thresholds**
- **Artifact:** SLO definitions, alert thresholds, error budgets
- **Invariant:** SLO changes should update alert thresholds
- **Example:** SLO tightened (99.9% → 99.99%) → alert thresholds must be updated

---

## 🎯 **Next Steps to Complete 11.1**

1. **Make the graph explicit** (not just implicit in comparator logic)
2. **Add 3 missing edges** (dashboards, runbooks, SLOs)
3. **Render graph visualization** in PR output (Mermaid diagram)
4. **Track drift over time** (11.2 - governance memory)

---

## ✅ **Conclusion**

**All 5 cross-artifact comparators are actively used and working correctly.**

They run on every PR, detect drift, and render in the "Cross-Artifact & Safety Checks" section of the PR output.

**However**, to fully meet acceptance criteria 11.1, we need to:
- Make the artifact graph **explicit** (data structure in IR)
- Add **3 more edges** (dashboards, runbooks, SLOs)
- **Visualize the graph** in PR output

