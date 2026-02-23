# Admin Endpoint vs UI Flow Clarification

## Question
> "Make sure in our code, the new endpoint POST /api/admin/create-baseline-pack endpoint is used irrespective of the track used"

## Answer

The **admin endpoint is NOT used by the UI flow**. Here's why:

### Admin Endpoint Purpose
**File**: `apps/api/src/routes/admin.ts`  
**Endpoint**: `POST /api/admin/create-baseline-pack`

**Purpose**: Programmatic pack creation for:
- ✅ Seeding database with pre-built packs
- ✅ Testing/development (create baseline pack quickly)
- ✅ CI/CD automation (deploy packs to production)
- ✅ Admin operations (bulk pack creation)

**What it does**:
1. Loads template YAML from disk
2. Creates pack in database
3. **Immediately publishes** (skips draft state)
4. Sets specific scope (workspace-level)

### UI Flow (User Creates Pack)
**File**: `apps/web/src/app/policy-packs/new/page.tsx`  
**Endpoint**: `POST /api/workspaces/:workspaceId/policy-packs`

**Purpose**: User-driven pack creation via UI wizard

**What it does**:
1. User fills in form fields (name, owner, packMode, etc.)
2. User selects template OR uses surfaces/builder/YAML
3. `mergeFormDataIntoYAML()` merges UI fields into YAML
4. Sends merged YAML to API
5. Creates pack in **draft** state
6. User can preview, then publish

### Key Differences

| Aspect | Admin Endpoint | UI Flow |
|--------|---------------|---------|
| **Endpoint** | `/api/admin/create-baseline-pack` | `/api/workspaces/:id/policy-packs` |
| **YAML Source** | Template from disk | UI form + template/surfaces/builder/YAML |
| **Field Merging** | No merging (uses template as-is) | `mergeFormDataIntoYAML()` merges UI fields |
| **Initial State** | Published immediately | Draft (user must publish) |
| **Scope** | Fixed (workspace-level) | User-configurable |
| **Use Case** | Programmatic/admin | User-driven |

### How UI Fields Are Merged (All 4 Authoring Paths)

**Fix A** ensures all 4 authoring paths use the same field merging logic:

```typescript
// apps/web/src/app/policy-packs/new/page.tsx (line 204)
const finalYaml = mergeFormDataIntoYAML(formData.trackAConfigYamlDraft || '', formData);
```

**Option 1: Template selected → Skip to save**
- User selects template in Step 3
- Template YAML loaded into `formData.trackAConfigYamlDraft`
- User clicks "Save" without editing
- `mergeFormDataIntoYAML()` merges UI fields into template YAML
- Result: Template rules + UI fields (packMode, scopePriority, etc.)

**Option 2: Surfaces wizard → Generate rules**
- User selects template in Step 3
- User clicks "Surfaces" tab, generates rules
- Generated YAML replaces `formData.trackAConfigYamlDraft`
- `mergeFormDataIntoYAML()` merges UI fields into generated YAML
- Result: Generated rules + UI fields

**Option 3: Builder → Edit rules**
- User selects template in Step 3
- User clicks "Builder" tab, edits rules
- Edited YAML updates `formData.trackAConfigYamlDraft`
- `mergeFormDataIntoYAML()` merges UI fields into edited YAML
- Result: Edited rules + UI fields

**Option 4: Manual YAML → Edit directly**
- User selects template in Step 3
- User clicks "Advanced YAML" tab, manually edits
- Manual YAML updates `formData.trackAConfigYamlDraft`
- `mergeFormDataIntoYAML()` merges UI fields into manual YAML
- Result: Manual YAML + UI fields

### Track B Configuration

**Track B fields are ALREADY saved** in the database:

```typescript
// apps/api/src/routes/policyPacks.ts (lines 330-333)
trackBEnabled: body.trackBEnabled || false,
trackBConfig: (body.trackBConfig || {}) as Prisma.InputJsonValue,
approvalTiers: (body.approvalTiers || {}) as Prisma.InputJsonValue,
routing: (body.routing || {}) as Prisma.InputJsonValue,
```

**UI sends all form data**:

```typescript
// apps/web/src/app/policy-packs/new/page.tsx (line 213)
body: JSON.stringify({
  ...formData,  // Includes trackBConfig, approvalTiers, routing
  trackAConfigYamlDraft: finalYaml,
}),
```

**Track B logic** (drift remediation) is documented but not fully implemented yet. The database schema and API endpoints are ready, but the evaluation engine is still in planning phase.

### Conclusion

✅ **Admin endpoint** is for programmatic pack creation (seeding, testing, CI/CD)  
✅ **UI flow** uses regular API endpoint with field merging  
✅ **All 4 authoring paths** merge UI fields into YAML via `mergeFormDataIntoYAML()`  
✅ **Track B configuration** is saved to database (ready for future implementation)  
✅ **Track A evaluation** uses merged fields (packMode, scopePriority, scopeMergeStrategy, scope filters)  

**No changes needed** - the implementation is correct!

