# Phase 1: Foundation - Schema & Metadata Implementation Plan

## Overview
This phase establishes the foundational schema, metadata, and validation infrastructure needed for the hybrid comparator/fact-based approach.

**Duration:** Week 1 (16-24 hours)  
**Risk Level:** Low (mostly additive changes)  
**Breaking Changes:** None (backward compatible)

---

## 1.1: JSON Schema Implementation (4-6 hours)

### Backend Tasks

#### Task 1.1.1: Create JSON Schema File
**File:** `apps/api/src/schemas/policypack.v1.schema.json`

**Content Structure:**
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://policy.yourproduct.io/schemas/policypack.v1.json",
  "title": "PolicyPack v1",
  "type": "object",
  "required": ["apiVersion", "kind", "metadata", "scope", "tracks"],
  "properties": {
    "apiVersion": { "const": "policy.yourproduct.io/v1" },
    "kind": { "const": "PolicyPack" },
    "metadata": { "$ref": "#/$defs/metadata" },
    "scope": { "$ref": "#/$defs/scope" },
    "defaults": { "$ref": "#/$defs/defaults" },
    "tracks": { "$ref": "#/$defs/tracks" },
    "approvalsAndRouting": { "$ref": "#/$defs/approvalsAndRouting" },
    "exceptions": { "$ref": "#/$defs/exceptions" }
  }
}
```

**Dependencies:**
- Install: `ajv` (JSON Schema validator)
- Install: `ajv-formats` (for date-time, email formats)

```bash
cd apps/api
pnpm add ajv ajv-formats
pnpm add -D @types/ajv
```

---

#### Task 1.1.2: Create Schema Validator Service
**File:** `apps/api/src/services/gatekeeper/yaml-dsl/schemaValidator.ts`

```typescript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import policyPackSchema from '../../../schemas/policypack.v1.schema.json';

export interface ValidationResult {
  valid: boolean;
  errors?: Array<{
    path: string;
    message: string;
    keyword: string;
  }>;
}

export class SchemaValidator {
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({ 
      allErrors: true,
      strict: false,
      validateFormats: true
    });
    addFormats(this.ajv);
    this.ajv.addSchema(policyPackSchema, 'policypack-v1');
  }

  validatePack(packYaml: any): ValidationResult {
    const validate = this.ajv.getSchema('policypack-v1');
    if (!validate) {
      throw new Error('Schema not found');
    }

    const valid = validate(packYaml);
    
    if (!valid && validate.errors) {
      return {
        valid: false,
        errors: validate.errors.map(err => ({
          path: err.instancePath || err.schemaPath,
          message: err.message || 'Validation error',
          keyword: err.keyword
        }))
      };
    }

    return { valid: true };
  }
}

export const schemaValidator = new SchemaValidator();
```

---

#### Task 1.1.3: Integrate Schema Validation into Pack Validator
**File:** `apps/api/src/services/gatekeeper/yaml-dsl/packValidator.ts`

**Changes:**
```typescript
import { schemaValidator } from './schemaValidator';

export async function validatePack(yamlContent: string): Promise<ValidationResult> {
  // 1. Parse YAML
  const parsed = yaml.load(yamlContent);
  
  // 2. Schema validation (NEW)
  const schemaResult = schemaValidator.validatePack(parsed);
  if (!schemaResult.valid) {
    return {
      valid: false,
      errors: schemaResult.errors?.map(e => `${e.path}: ${e.message}`) || []
    };
  }
  
  // 3. Existing business logic validation
  // ... existing code ...
}
```

---

## 1.2: Metadata Fields Enhancement (3-4 hours)

### Backend Tasks

#### Task 1.2.1: Update Database Schema
**File:** `apps/api/prisma/schema.prisma`

**Add to PolicyPack model:**
```prisma
model PolicyPack {
  // ... existing fields ...
  
  // NEW: Enhanced metadata
  status              PackStatus    @default(DRAFT)
  owners              Json?         // { teams: string[], users: string[] }
  labels              Json?         // { [key: string]: string }
  
  // NEW: Audit trail
  createdBy           String?
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt
  updatedBy           String?
  
  // NEW: Version notes
  versionNotes        String?
}

enum PackStatus {
  DRAFT
  IN_REVIEW
  ACTIVE
  DEPRECATED
  ARCHIVED
}
```

**Migration:**
```bash
cd apps/api
npx prisma migrate dev --name add_pack_metadata
```

---

#### Task 1.2.2: Update TypeScript Types
**File:** `apps/api/src/types/policyPack.ts`

```typescript
export enum PackStatus {
  DRAFT = 'draft',
  IN_REVIEW = 'in_review',
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  ARCHIVED = 'archived'
}

export interface PackOwner {
  team?: string;
  user?: string;
}

export interface PackMetadata {
  packId: string;
  name: string;
  description?: string;
  version: string;
  status: PackStatus;
  owners?: PackOwner[];
  labels?: Record<string, string>;
  audit?: {
    createdBy?: string;
    createdAt?: string;
    updatedAt?: string;
    updatedBy?: string;
  };
  notes?: string;
}
```

---

#### Task 1.2.3: Update YAML Serialization
**File:** `apps/api/src/services/gatekeeper/yaml-dsl/packSerializer.ts`

```typescript
export function serializePackToYAML(pack: PolicyPack): string {
  const yamlObj = {
    apiVersion: 'policy.yourproduct.io/v1',
    kind: 'PolicyPack',
    metadata: {
      packId: pack.id,
      name: pack.name,
      description: pack.description,
      version: pack.version,
      status: pack.status,
      owners: pack.owners ? JSON.parse(pack.owners as string) : undefined,
      labels: pack.labels ? JSON.parse(pack.labels as string) : undefined,
      audit: {
        createdBy: pack.createdBy,
        createdAt: pack.createdAt?.toISOString(),
        updatedAt: pack.updatedAt?.toISOString(),
        updatedBy: pack.updatedBy
      },
      notes: pack.versionNotes
    },
    // ... rest of pack structure
  };
  
  return yaml.dump(yamlObj, { noRefs: true, sortKeys: false });
}
```

---

### Frontend Tasks

#### Task 1.2.4: Update Overview Form
**File:** `apps/web/src/app/policy-packs/new/sections/OverviewForm.tsx`

**Add fields:**
```typescript
// Add to form state
const [formData, setFormData] = useState({
  // ... existing fields ...
  status: 'draft' as PackStatus,
  owners: [] as PackOwner[],
  labels: {} as Record<string, string>,
  versionNotes: ''
});

// Add UI components
<>
  {/* Status Dropdown */}
  <div>
    <label>Status</label>
    <select value={formData.status} onChange={handleStatusChange}>
      <option value="draft">Draft</option>
      <option value="in_review">In Review</option>
      <option value="active">Active</option>
      <option value="deprecated">Deprecated</option>
      <option value="archived">Archived</option>
    </select>
  </div>

  {/* Owners */}
  <div>
    <label>Owners</label>
    <OwnerSelector 
      owners={formData.owners}
      onChange={handleOwnersChange}
    />
  </div>

  {/* Labels */}
  <div>
    <label>Labels</label>
    <LabelEditor
      labels={formData.labels}
      onChange={handleLabelsChange}
    />
  </div>

  {/* Version Notes */}
  <div>
    <label>Version Notes</label>
    <textarea
      value={formData.versionNotes}
      onChange={(e) => setFormData({ ...formData, versionNotes: e.target.value })}
      placeholder="What changed in this version?"
    />
  </div>
</>
```

---

## 1.3: Scope Precedence (4-6 hours)

### Backend Tasks

#### Task 1.3.1: Update Database Schema
**File:** `apps/api/prisma/schema.prisma`

```prisma
model PolicyPack {
  // ... existing fields ...
  
  // NEW: Scope precedence
  scopePriority       Int           @default(50)
  scopeMergeStrategy  MergeStrategy @default(MOST_RESTRICTIVE)
}

enum MergeStrategy {
  MOST_RESTRICTIVE
  HIGHEST_PRIORITY
  EXPLICIT
}
```

---

#### Task 1.3.2: Create Pack Matching Service
**File:** `apps/api/src/services/gatekeeper/packMatcher.ts`

```typescript
export interface PackMatchContext {
  repository: string;
  branch: string;
  paths?: string[];
  environment?: string;
}

export class PackMatcher {
  /**
   * Find all packs that match the given context
   */
  async findApplicablePacks(
    context: PackMatchContext,
    workspaceId: string
  ): Promise<PolicyPack[]> {
    const allPacks = await prisma.policyPack.findMany({
      where: {
        workspaceId,
        status: 'ACTIVE'
      }
    });

    return allPacks.filter(pack => this.matchesPack(pack, context));
  }

  private matchesPack(pack: PolicyPack, context: PackMatchContext): boolean {
    // Match repository
    if (!this.matchesSelector(
      context.repository,
      pack.scopeRepositoriesInclude,
      pack.scopeRepositoriesExclude
    )) {
      return false;
    }

    // Match branch
    if (!this.matchesSelector(
      context.branch,
      pack.scopeBranchesInclude,
      pack.scopeBranchesExclude
    )) {
      return false;
    }

    // Match paths (if specified)
    if (context.paths && pack.scopePathsInclude) {
      const pathsMatch = context.paths.some(path =>
        this.matchesGlobPattern(path, pack.scopePathsInclude)
      );
      if (!pathsMatch) return false;
    }

    return true;
  }

  private matchesSelector(
    value: string,
    include?: string[],
    exclude?: string[]
  ): boolean {
    // Empty include = match all
    if (!include || include.length === 0) {
      // Check exclude
      if (exclude && exclude.length > 0) {
        return !exclude.some(pattern => minimatch(value, pattern));
      }
      return true;
    }

    // Check include
    const included = include.some(pattern => minimatch(value, pattern));
    if (!included) return false;

    // Check exclude
    if (exclude && exclude.length > 0) {
      return !exclude.some(pattern => minimatch(value, pattern));
    }

    return true;
  }
}
```

---

## 1.4: Pack-Level Defaults (4-6 hours)

### Backend Tasks

#### Task 1.4.1: Update Database Schema
**File:** `apps/api/prisma/schema.prisma`

```prisma
model PolicyPack {
  // ... existing fields ...
  
  // NEW: Pack-level defaults
  defaults                Json?  // Stores entire defaults section
}
```

**Defaults Structure:**
```typescript
interface PackDefaults {
  enforcement?: {
    mode?: 'monitor' | 'warn' | 'block';
    severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
  };
  decision?: {
    onPass?: 'allow';
    onFail?: 'warn' | 'block' | 'require_approval' | 'quarantine';
  };
  obligations?: {
    approvals?: {
      required?: boolean;
      minApprovals?: number;
      approverGroups?: string[];
    };
    evidence?: {
      required?: boolean;
      fields?: string[];
    };
    notifications?: {
      channels?: string[];
      on?: ('pass' | 'fail' | 'exception_used')[];
    };
    ticketing?: {
      enabled?: boolean;
      system?: 'jira' | 'servicenow' | 'github';
      projectKey?: string;
    };
  };
}
```

---

## Testing Checklist

### Unit Tests
- [ ] Schema validator validates correct YAML
- [ ] Schema validator rejects invalid YAML
- [ ] Metadata fields serialize/deserialize correctly
- [ ] Pack matcher finds applicable packs
- [ ] Pack matcher respects include/exclude rules
- [ ] Defaults merge correctly with rule overrides

### Integration Tests
- [ ] Create pack with new metadata fields
- [ ] Update pack status triggers validation
- [ ] Multiple packs match same PR
- [ ] Pack precedence resolves correctly

### E2E Tests
- [ ] UI shows new metadata fields
- [ ] UI validates status transitions
- [ ] UI shows pack conflicts
- [ ] YAML export includes all new fields

---

## Rollout Strategy

### Step 1: Deploy Backend (No UI changes yet)
- Deploy schema changes
- Deploy validation logic
- Existing packs continue to work (backward compatible)

### Step 2: Deploy UI (Gradual rollout)
- Deploy new metadata fields (optional)
- Deploy scope precedence UI (optional)
- Users can opt-in to new features

### Step 3: Enable by Default
- Make new fields visible by default
- Show warnings for packs without precedence set
- Encourage migration to new format

---

## Success Criteria

- [ ] All existing packs validate against new schema
- [ ] New metadata fields appear in UI
- [ ] Pack precedence can be set and saved
- [ ] Multiple packs can be created for same workspace
- [ ] No breaking changes to existing functionality
- [ ] Documentation updated
- [ ] Migration guide published

---

## Next Phase Preview

**Phase 2** will build on this foundation:
- Fact catalog implementation
- Hybrid comparator/fact-based conditions
- Multi-pack evaluation engine
- Conflict resolution UI

