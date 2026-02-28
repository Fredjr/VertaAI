# Track A Task 2: Cross-Artifact Evidence Comparators

## 🎯 Objective
Implement 5 new cross-artifact comparators that detect inconsistencies between related artifacts (OpenAPI ↔ Code, Schema ↔ Migration, etc.) and wire them into the existing governance pipeline.

## 📋 Implementation Tasks

### Task 1: Design Cross-Artifact Comparator Interface ✅
**Status:** Complete (using existing `Comparator` interface with `evaluateStructured()`)

### Task 2: Add Message Catalog Entries
**File:** `apps/api/src/services/gatekeeper/yaml-dsl/ir/messageCatalog.ts`
**Add messages for:**
- OpenAPI ↔ Code consistency
- Schema ↔ Migration consistency
- Contract ↔ Implementation consistency
- Documentation ↔ Code consistency
- Test ↔ Implementation coverage

### Task 3: Implement 5 Cross-Artifact Comparators

#### 3.1: OpenAPI ↔ Code Comparator
**File:** `apps/api/src/services/gatekeeper/yaml-dsl/comparators/cross-artifact/openapiCodeParity.ts`
**Detects:**
- OpenAPI spec changes without corresponding code changes
- New endpoints in spec but not implemented
- Removed endpoints in spec but code still exists
- Parameter mismatches between spec and implementation

#### 3.2: Schema ↔ Migration Comparator
**File:** `apps/api/src/services/gatekeeper/yaml-dsl/comparators/cross-artifact/schemaMigrationParity.ts`
**Detects:**
- Schema changes (Prisma, SQL) without migration files
- Migration files without schema changes
- Breaking schema changes without rollback migrations

#### 3.3: Contract ↔ Implementation Comparator
**File:** `apps/api/src/services/gatekeeper/yaml-dsl/comparators/cross-artifact/contractImplementationParity.ts`
**Detects:**
- TypeScript interface changes without implementation updates
- GraphQL schema changes without resolver updates
- Proto file changes without service implementation updates

#### 3.4: Documentation ↔ Code Comparator
**File:** `apps/api/src/services/gatekeeper/yaml-dsl/comparators/cross-artifact/docCodeParity.ts`
**Detects:**
- Code changes in documented areas without README/doc updates
- API endpoint changes without API documentation updates
- Configuration changes without documentation updates

#### 3.5: Test ↔ Implementation Comparator
**File:** `apps/api/src/services/gatekeeper/yaml-dsl/comparators/cross-artifact/testImplementationParity.ts`
**Detects:**
- Implementation changes without corresponding test updates
- New functions/classes without test coverage
- Deleted tests without corresponding code deletion

### Task 4: Register Comparators
**File:** `apps/api/src/services/gatekeeper/yaml-dsl/comparators/index.ts`
**Action:** Import and register all 5 new comparators

### Task 5: Update ComparatorId Enum
**File:** `apps/api/src/services/gatekeeper/yaml-dsl/types.ts`
**Action:** Add 5 new comparator IDs to the enum

### Task 6: Wire into Evaluation Pipeline
**File:** `apps/api/src/services/gatekeeper/yaml-dsl/evaluationNormalizer.ts`
**Action:** Ensure cross-artifact comparators are invoked during evaluation

### Task 7: Update Output Renderer
**File:** `apps/api/src/services/gatekeeper/yaml-dsl/ultimateOutputRenderer.ts`
**Action:** Ensure cross-artifact findings are displayed with proper formatting

### Task 8: E2E Testing
**Repository:** `Fredjr/vertaai-e2e-test`
**Action:** Update test scenario to trigger cross-artifact comparators

## 🔧 Technical Architecture

### Evidence Type Extensions
Already defined in `ir/types.ts`:
- `openapi_code_reference`
- `schema_migration_reference`
- `slo_alert_reference`
- `runbook_alert_reference`

### Reuse Existing Parsers
- `apps/api/src/services/signals/openApiParser.ts` - OpenAPI parsing
- `apps/api/src/services/signals/iacParser.ts` - IaC parsing
- `apps/api/src/services/signals/codeownersParser.ts` - CODEOWNERS parsing
- `apps/api/src/services/baseline/artifactExtractor.ts` - Artifact extraction

### Integration Points
1. **Comparator Registry** - Register new comparators
2. **Message Catalog** - Add cross-artifact messages
3. **IR Types** - Use existing `CrossArtifactReference` type
4. **Output Renderer** - Display cross-artifact findings

## 📊 Success Criteria
- ✅ All 5 comparators implemented with `evaluateStructured()`
- ✅ All messages from catalog (0% freeform prose)
- ✅ Cross-artifact evidence properly structured in IR
- ✅ Findings displayed in governance output
- ✅ E2E test validates all comparators
- ✅ No regression in existing functionality

## 🚀 Implementation Order
1. Message catalog entries (foundation)
2. OpenAPI ↔ Code (highest value, uses existing parser)
3. Schema ↔ Migration (high value, clear detection logic)
4. Test ↔ Implementation (high value, file pattern matching)
5. Documentation ↔ Code (medium value, heuristic-based)
6. Contract ↔ Implementation (medium value, TypeScript/GraphQL specific)
7. Registration and wiring
8. E2E testing

