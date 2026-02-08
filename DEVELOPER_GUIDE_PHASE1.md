# Developer Guide: Phase 1 EvidenceBundle System

## Overview

Phase 1 introduces the **EvidenceBundle Pattern** - a deterministic, immutable artifact that captures all evidence for drift detection decisions. This eliminates LLM hallucination, enables reproducibility, and provides the foundation for the truth-making system.

---

## Architecture

### Core Concept: Immutable Evidence Artifacts

Every drift candidate now has an **EvidenceBundle** containing:
1. **Source Evidence**: What changed (PR, incident, alert, etc.)
2. **Target Evidence**: What the docs claim
3. **Assessment**: Impact score, fired rules, consequence
4. **Fingerprints**: For suppression and learning

### Data Flow

```
SignalEvent → buildEvidenceBundle() → EvidenceBundle → Database
                                    ↓
                            checkSuppressions() → SUPPRESSED or Continue
```

---

## File Structure

```
apps/api/src/services/evidence/
├── types.ts                 # TypeScript type definitions
├── builder.ts               # Main orchestration function
├── sourceBuilders.ts        # Source-specific evidence builders
├── docClaimExtractor.ts     # Deterministic doc claim extraction
├── impactAssessment.ts      # Impact scoring and consequence generation
└── fingerprints.ts          # Fingerprint generation and matching
```

---

## Key Functions

### 1. `buildEvidenceBundle()`

**Location**: `apps/api/src/services/evidence/builder.ts`

**Purpose**: Main orchestration function that creates a complete evidence bundle.

**Usage**:
```typescript
import { buildEvidenceBundle } from '../evidence/builder.js';

const result = await buildEvidenceBundle({
  driftCandidate: drift,
  signalEvent: signal,
  docContext: docContext,
  parserArtifacts: {
    openApiDiff: extracted.openApiDiff,
    codeownersDiff: extracted.codeownersDiff,
    // ... other artifacts
  }
});

if (result.success && result.bundle) {
  const bundle = result.bundle;
  // Use bundle.assessment.impactScore, bundle.fingerprints, etc.
}
```

**Returns**: `EvidenceBundleResult` with `success`, `bundle`, and optional `error`.

### 2. `buildSourceEvidence()`

**Location**: `apps/api/src/services/evidence/sourceBuilders.ts`

**Purpose**: Creates source-specific evidence from signal events.

**Supported Sources**:
- `github_pr` - PR diffs, files changed, line counts
- `pagerduty_incident` - Incident timeline, severity, responders
- `slack_cluster` - Message excerpts, themes, user count
- `datadog_alert` - Alert type, severity, affected services
- `grafana_alert` - Alert data with excerpts
- `github_iac` - Resource changes, change types
- `github_codeowners` - Path changes, owner additions/removals

### 3. `extractDocClaims()`

**Location**: `apps/api/src/services/evidence/docClaimExtractor.ts`

**Purpose**: Deterministically extracts claims from documentation (no LLM).

**Supported Doc Systems**:
- `confluence` - Macro patterns, code blocks, procedure lists
- `github_swagger` - Endpoint definitions, parameter specs
- `backstage` - YAML metadata, service catalog entries
- `github_readme` - Markdown headers, code blocks, lists
- `github_code_comments` - JSDoc, docstrings, inline comments
- `notion` - Block-based content extraction
- `gitbook` - Markdown structure with hints
- Generic fallback for unknown systems

### 4. `computeImpactAssessment()`

**Location**: `apps/api/src/services/evidence/impactAssessment.ts`

**Purpose**: Calculates deterministic impact score and generates consequence text.

**Impact Bands**:
- **Low**: <0.4 - Minor documentation inconsistency
- **Medium**: 0.4-0.7 - Moderate impact, should be addressed
- **High**: 0.7-0.9 - Significant impact, urgent attention needed
- **Critical**: ≥0.9 - Severe impact, immediate action required

**Fired Rules Examples**:
- `instruction_mismatch` - Deployment steps don't match reality
- `deployment_tool_change` - Tool changed but docs not updated
- `ownership_gap` - Owner changed but not documented
- `api_contract_drift` - API endpoint changed but spec not updated

### 5. `generateFingerprints()`

**Location**: `apps/api/src/services/evidence/fingerprints.ts`

**Purpose**: Creates 3-level fingerprints for suppression system.

**Fingerprint Levels**:
- **Strict**: Exact match (source ID + doc ID + normalized tokens)
- **Medium**: Normalized tokens (top 10 frequent tokens)
- **Broad**: High-level pattern (source type + target surface + drift type)

**Token Normalization**:
- Port numbers → `:PORT`
- API versions → `/api/VERSION`
- Tool names → standardized categories
- Service names → environment-agnostic

---

## Database Schema

### DriftCandidate Model (New Fields)

```prisma
model DriftCandidate {
  // ... existing fields ...
  
  // Evidence Bundle (Phase 1)
  evidenceBundle     Json?     @map("evidence_bundle")
  
  // Impact Assessment
  impactScore        Float?    @map("impact_score")
  impactBand         String?   @map("impact_band")
  impactJson         Json?     @map("impact_json")
  consequenceText    String?   @map("consequence_text")
  impactAssessedAt   DateTime? @map("impact_assessed_at")
  
  // Fingerprints for suppression
  fingerprintStrict  String?   @map("fingerprint_strict")
  fingerprintMedium  String?   @map("fingerprint_medium")
  fingerprintBroad   String?   @map("fingerprint_broad")
}
```

### DriftSuppression Model (New)

```prisma
model DriftSuppression {
  workspaceId        String    @map("workspace_id")
  id                 String    @default(cuid()) @map("id")
  fingerprint        String    @map("fingerprint")
  fingerprintLevel   String    @map("fingerprint_level")
  suppressionType    String    @map("suppression_type")
  reason             String?   @map("reason")
  createdBy          String?   @map("created_by")
  expiresAt          DateTime? @map("expires_at")
  falsePositiveCount Int       @default(0) @map("false_positive_count")
  lastSeenAt         DateTime? @map("last_seen_at")
  
  @@id([workspaceId, id])
  @@unique([workspaceId, fingerprint])
}
```

---

## State Machine Integration

### When Evidence Bundle is Created

**State**: `BASELINE_CHECKED`  
**Location**: `apps/api/src/services/orchestrator/transitions.ts` (lines 1309-1369)

**Flow**:
1. Build evidence bundle from signal event + doc context
2. Store bundle and impact assessment in database
3. Check for suppressions using fingerprints
4. If suppressed → transition to `SUPPRESSED` state (terminal)
5. If not suppressed → continue to patch planning

### Error Handling

Evidence bundle creation is **non-blocking**:
- Wrapped in try-catch
- Failures logged but don't break existing flow
- Existing patch planning continues if evidence bundle fails

---

## Testing

### Unit Tests (To Be Created)

```typescript
// apps/api/src/__tests__/evidence/builder.test.ts
describe('buildEvidenceBundle', () => {
  it('should create evidence bundle for GitHub PR source', async () => {
    // Test implementation
  });
});
```

### Integration Tests (To Be Created)

```typescript
// apps/api/src/__tests__/evidence/integration.test.ts
describe('Evidence Bundle Integration', () => {
  it('should create evidence bundle and check suppressions', async () => {
    // Test implementation
  });
});
```

---

## Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Evidence bundle creation | <100ms | Includes all sub-operations |
| Fingerprint generation | <10ms | SHA-256 hashing |
| Suppression checking | <50ms | Database query with indexes |
| Impact assessment | <20ms | Deterministic calculation |

---

## Monitoring & Observability

### Log Messages

```typescript
// Success
console.log(`[Transitions] EvidenceBundle created: impact=${impactBand} (${impactScore}), claims=${claimCount}`);

// Suppression
console.log(`[Transitions] Drift suppressed by ${level} fingerprint: ${reason}`);

// Failure
console.warn(`[Transitions] EvidenceBundle creation failed: ${error.message}`);
```

### Metrics to Track

- Evidence bundle creation success rate
- Average impact score by drift type
- Suppression rate by fingerprint level
- False positive escalation rate

---

## Common Patterns

### Adding a New Source Type

1. Add type to `SourceType` in `types.ts`
2. Add artifact interface to `SourceArtifacts` in `types.ts`
3. Create builder function in `sourceBuilders.ts`
4. Add case to `buildSourceEvidence()` switch statement

### Adding a New Doc System

1. Add type to `DocSystem` in `types.ts`
2. Create extractor function in `docClaimExtractor.ts`
3. Add case to `extractDocClaims()` switch statement

---

## Troubleshooting

### Evidence Bundle Not Created

**Check**:
1. Is signal event data available?
2. Is doc context available?
3. Check logs for error messages
4. Verify database fields are nullable

### Suppression Not Working

**Check**:
1. Are fingerprints being generated?
2. Does DriftSuppression record exist?
3. Is suppression expired?
4. Check fingerprint level matching

---

## Next Steps

See `COMPREHENSIVE_IMPLEMENTATION_PLAN.md` for Week 2 tasks:
- Multi-source impact assessment
- Impact rules for source+target combinations
- Target-aware risk assessment

