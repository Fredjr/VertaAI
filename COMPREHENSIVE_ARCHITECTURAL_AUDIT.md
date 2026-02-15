# Comprehensive Architectural Audit - Track A & Track B
**Date:** 2026-02-15  
**Auditor:** Senior Architect Review  
**Scope:** Full system architecture, synchronous/async compliance, comparator registry, bugs

---

## Executive Summary

### ✅ COMPLIANT: Track A (Contract Integrity Gate)
- **Synchronous:** ✅ Runs in webhook handler with 25s timeout
- **Deterministic:** ✅ No LLM for pass/fail decisions
- **< 30s latency:** ✅ Promise.race() timeout enforcement
- **GitHub Check:** ✅ Creates check with findings
- **Graceful degradation:** ✅ Soft-fail on timeout/errors

### ✅ COMPLIANT: Track B (Drift Remediation)
- **Asynchronous:** ✅ Returns 202, queues via QStash
- **High recall:** ✅ Cluster-first triage
- **LLM allowed:** ✅ Claude for patch generation only
- **Human workflow:** ✅ Slack approvals + batching
- **Temporal accumulation:** ✅ Bundling + clustering

### 🚨 CRITICAL ISSUES FOUND: 3
1. **Missing comparator registry** - No unified interface for adding comparators
2. **No contractpacks.yaml support** - Database-only, no YAML config
3. **Incomplete comparator implementation** - Only OpenAPI/Terraform, missing 11 types

### ⚠️ ARCHITECTURAL GAPS: 5
1. No extractor layer (OpenAPI/Markdown/Confluence parsing)
2. No rollout controls (warn→block graduation)
3. No anchor-based doc checks (deterministic doc validation)
4. No obligation registry (hardcoded in obligationChecker.ts)
5. No repo-level configuration (org/repo/pack hierarchy)

---

## Part 1: Track A vs Track B Compliance

### A. Track A (Contract Integrity Gate) - SYNCHRONOUS ✅

**Requirement:** Must run synchronously in webhook handler, complete in < 30s

**Implementation:** `apps/api/src/routes/webhooks.ts` lines 518-622

```typescript
// ✅ CORRECT: Runs synchronously in webhook handler
if (isFeatureEnabled('ENABLE_CONTRACT_VALIDATION', workspaceId) && !prInfo.merged) {
  try {
    const TRACK_A_TIMEOUT_MS = 25000; // ✅ 25s timeout
    
    const validationPromise = runContractValidation({...});
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Contract validation timeout')), TRACK_A_TIMEOUT_MS)
    );
    
    // ✅ CORRECT: Promise.race() enforces timeout
    const validationResult = await Promise.race([validationPromise, timeoutPromise]);
    
    // ✅ CORRECT: Creates GitHub Check synchronously
    await createContractValidationCheck({...});
  } catch (error) {
    // ✅ CORRECT: Soft-fail to WARN on timeout
    if (error.message === 'Contract validation timeout') {
      await createContractValidationCheck({ band: 'warn', timeoutOccurred: true });
    }
  }
}
```

**Verdict:** ✅ **FULLY COMPLIANT**
- Runs synchronously (blocks webhook until complete)
- 25s timeout with 5s buffer
- Soft-fail on timeout (never blocks webhook)
- Creates GitHub Check inline

---

### B. Track B (Drift Remediation) - ASYNCHRONOUS ✅

**Requirement:** Must return 202 immediately, queue async processing

**Implementation:** `apps/api/src/routes/webhooks.ts` lines 833-920

```typescript
// ✅ CORRECT: Creates DriftCandidate in INGESTED state
const driftCandidate = await prisma.driftCandidate.create({
  data: {
    workspaceId,
    signalEventId: signalEvent.id,
    state: 'INGESTED', // ✅ Initial state
    sourceType: 'github_pr',
    repo: prInfo.repoFullName,
    service: inferredService,
    traceId,
  },
});

// ✅ CORRECT: Enqueues async job via QStash
const messageId = await enqueueJob({
  workspaceId,
  driftId: driftCandidate.id,
});

// ✅ CORRECT: Returns 202 Accepted immediately
return res.status(202).json({
  message: 'PR merged - drift candidate created',
  signalEventId,
  driftId: driftCandidate.id,
  qstashMessageId: messageId || undefined,
});
```

**Async Processing:** `apps/api/src/routes/jobs.ts` lines 71-207

```typescript
// ✅ CORRECT: Async job handler
router.post('/orchestrator/process', async (req, res) => {
  const { workspaceId, driftId } = req.body;
  
  // ✅ Distributed lock prevents concurrent processing
  const lockAcquired = await acquireLock(workspaceId, driftId);
  
  // ✅ State machine processes drift asynchronously
  while (!TERMINAL_STATES.includes(currentState) && !HUMAN_GATED_STATES.includes(currentState)) {
    const result = await executeTransition(currentDrift, currentState);
    currentState = result.state;
  }
  
  // ✅ Re-enqueues if not terminal
  if (!TERMINAL_STATES.includes(currentState)) {
    await enqueueJob({ workspaceId, driftId });
  }
  
  return res.status(200).json({ status: 'ok', state: currentState });
});
```

**Verdict:** ✅ **FULLY COMPLIANT**
- Returns 202 immediately
- Queues via QStash
- 18-state async state machine
- Distributed locking
- Human-gated states (AWAITING_APPROVAL)

---

## Part 2: Critical Issues

### Issue 1: Missing Comparator Registry 🚨

**Problem:** No unified registry for comparators. Adding new comparators requires code changes.

**Current State:**
- Comparators hardcoded in `contractValidation.ts` lines 110-150
- No plugin architecture
- No dynamic loading

**Required Architecture (from your spec):**

```typescript
// Comparator registry interface
interface ComparatorRegistry {
  register(comparator: IComparator): void;
  get(type: string): IComparator | undefined;
  list(): IComparator[];
}

// Usage in contractValidation.ts
const registry = getComparatorRegistry();
for (const invariant of contract.invariants) {
  const comparator = registry.get(invariant.comparatorType);
  if (comparator && comparator.canCompare(invariant, snapshots)) {
    const result = await comparator.compare({...});
    findings.push(...result.findings);
  }
}
```

**Impact:** HIGH - Cannot add comparators without code deployment

**Recommendation:** Implement comparator registry in Week 7-8

---

### Issue 2: No contractpacks.yaml Support 🚨

**Problem:** Your canonical YAML spec is not implemented. System only supports database JSON.

**Current State:**
- ContractPacks stored as JSON in database
- No YAML parsing
- No org/repo/pack hierarchy
- No rollout controls (warn→block graduation)

**Required (from your spec):**
```yaml
version: 1
org:
  name: "acme"
  defaults:
    mode: "warn"
    max_runtime_seconds: 25
repos:
  - repo: "acme/payments-service"
    rollout:
      mode: "warn"
      graduation:
        min_clean_runs: 25
        allow_block_for_packs: ["PublicAPI"]
    contractpacks:
      enabled: ["PublicAPI", "PrivilegedInfra"]
```

**Impact:** CRITICAL - Cannot configure per-repo policies, no rollout controls

**Recommendation:** Implement YAML config loader in Week 7-8

---

### Issue 3: Incomplete Comparator Implementation 🚨

**Problem:** Only 2 of 13 comparators implemented

**Implemented:**
1. ✅ `openapi.validate` (partial - no breaking change detection)
2. ✅ `terraform.risk_classifier` (partial - basic resource matching)

**Missing (from your Tier 0-3 spec):**
3. ❌ `docs.required_sections`
4. ❌ `docs.anchor_check`
5. ❌ `obligation.file_present`
6. ❌ `obligation.file_changed`
7. ❌ `obligation.approval_required`
8. ❌ `obligation.min_reviewers`
9. ❌ `openapi.diff`
10. ❌ `openapi.version_bump`
11. ❌ `obs.alert_slo_alignment`
12. ❌ `db.migration_presence`

**Impact:** HIGH - Limited contract validation coverage

**Recommendation:** Implement Tier 0 comparators (3-6) in Week 7, Tier 1 (7-10) in Week 8

---

## Part 3: Architectural Gaps

### Gap 1: No Extractor Layer ⚠️

**Problem:** Comparators parse artifacts inline, no shared extraction logic

**Required (from your spec):**
```typescript
// Shared extractors
class OpenApiExtractor {
  parse(content: string): OpenApiAST;
  jsonPath(ast: OpenApiAST, path: string): any;
  sha256(ast: OpenApiAST): string;
}

class MarkdownHeaderExtractor {
  extractHeaders(content: string): string[];
  extractAnchors(content: string, regex: RegExp): Map<string, string>;
}
```

**Current State:** Each comparator parses independently (duplication, bugs)

**Recommendation:** Create extractor layer in Week 7

---

### Gap 2: No Rollout Controls ⚠️

**Problem:** No warn→block graduation, no severity overrides

**Required:**
```yaml
rollout:
  mode: "warn"
  graduation:
    min_clean_runs: 25
    allow_block_for_packs: ["PublicAPI"]
  severity_overrides:
    "DOC_ANCHOR_MISMATCH": "warn"
```

**Current State:** ContractPolicy has `mode` but no graduation logic

**Recommendation:** Add rollout state tracking in Week 8

---

### Gap 3: No Anchor-Based Doc Checks ⚠️

**Problem:** Cannot do deterministic doc validation (required for gate-safe doc checks)

**Required:**
```typescript
// Anchor check comparator
const anchorCheck = {
  type: 'docs.anchor_check',
  anchors: [
    {
      anchor_key: 'OPENAPI_SHA',
      target_regex: 'OPENAPI_SHA:\\s*([a-f0-9]{64})',
      source_value: 'sha256(openapi_spec_head)',
    }
  ]
};
```

**Current State:** No anchor extraction, no deterministic doc checks

**Recommendation:** Implement in Week 7 (Tier 0 comparator)

---

## Part 4: Code Quality Issues

### Bug 1: Obligation Counter Logic Error

**File:** `apps/api/src/services/contracts/obligationChecker.ts` lines 62-77

```typescript
// ❌ BUG: Incorrect counting logic
obligationsChecked += evidenceFindings.length > 0 ? 1 : 0;
obligationsFailed += evidenceFindings.length;
```

**Problem:** `obligationsChecked` counts checks that produced findings, not total checks run

**Fix:**
```typescript
// ✅ CORRECT
const evidenceChecks = ['infra_rollback', 'data_migration_plan'];
obligationsChecked += evidenceChecks.length;
obligationsFailed += evidenceFindings.length;
```

---

### Bug 2: Missing Timeout Cleanup

**File:** `apps/api/src/routes/webhooks.ts` lines 540-542

```typescript
const timeoutPromise = new Promise<never>((_, reject) =>
  setTimeout(() => reject(new Error('Contract validation timeout')), TRACK_A_TIMEOUT_MS)
);
```

**Problem:** setTimeout not cleared if validation completes early (memory leak)

**Fix:**
```typescript
let timeoutId: NodeJS.Timeout;
const timeoutPromise = new Promise<never>((_, reject) => {
  timeoutId = setTimeout(() => reject(new Error('Contract validation timeout')), TRACK_A_TIMEOUT_MS);
});

try {
  const validationResult = await Promise.race([validationPromise, timeoutPromise]);
  clearTimeout(timeoutId); // ✅ Clean up
} catch (error) {
  clearTimeout(timeoutId); // ✅ Clean up
  // Handle error
}
```

---

## Part 5: Recommendations

### Immediate (Week 7)
1. ✅ Fix Bug 1 (obligation counter)
2. ✅ Fix Bug 2 (timeout cleanup)
3. ✅ Implement Tier 0 comparators (docs.required_sections, docs.anchor_check, obligations)
4. ✅ Create extractor layer (OpenApiExtractor, MarkdownHeaderExtractor)

### Short-term (Week 8)
5. ✅ Implement comparator registry
6. ✅ Implement Tier 1 comparators (openapi.diff, openapi.version_bump)
7. ✅ Add rollout controls (warn→block graduation)
8. ✅ Implement contractpacks.yaml loader

### Medium-term (Week 9-10)
9. ✅ Implement Tier 2 comparators (terraform.risk_classifier enhancements)
10. ✅ Add performance metrics (validation duration, timeout rate)
11. ✅ Add comparator telemetry (success rate, false positives)

---

## Part 6: Detailed Comparator Registry Plan

### Architecture

```typescript
// apps/api/src/services/contracts/comparators/registry.ts

export interface ComparatorMetadata {
  type: string;
  version: string;
  tier: 0 | 1 | 2 | 3; // Tier 0 = foundation, Tier 3 = advanced
  supportedArtifactTypes: string[];
  deterministic: boolean;
  maxLatencyMs: number;
}

export interface ComparatorRegistry {
  register(comparator: IComparator): void;
  get(type: string): IComparator | undefined;
  list(): ComparatorMetadata[];
  canHandle(invariant: Invariant, snapshots: ArtifactSnapshot[]): IComparator | null;
}

class DefaultComparatorRegistry implements ComparatorRegistry {
  private comparators = new Map<string, IComparator>();

  register(comparator: IComparator): void {
    this.comparators.set(comparator.comparatorType, comparator);
  }

  get(type: string): IComparator | undefined {
    return this.comparators.get(type);
  }

  list(): ComparatorMetadata[] {
    return Array.from(this.comparators.values()).map(c => ({
      type: c.comparatorType,
      version: c.version,
      tier: c.tier || 1,
      supportedArtifactTypes: c.supportedArtifactTypes,
      deterministic: true,
      maxLatencyMs: c.maxLatencyMs || 5000,
    }));
  }

  canHandle(invariant: Invariant, snapshots: ArtifactSnapshot[]): IComparator | null {
    const comparator = this.get(invariant.comparatorType);
    if (!comparator) return null;
    return comparator.canCompare(invariant, snapshots) ? comparator : null;
  }
}

// Singleton instance
let registry: ComparatorRegistry | null = null;

export function getComparatorRegistry(): ComparatorRegistry {
  if (!registry) {
    registry = new DefaultComparatorRegistry();

    // Auto-register all comparators
    registry.register(new OpenApiComparator());
    registry.register(new TerraformRunbookComparator());
    registry.register(new DocsRequiredSectionsComparator()); // NEW
    registry.register(new DocsAnchorCheckComparator()); // NEW
    registry.register(new ObligationFilePresentComparator()); // NEW
    // ... register all comparators
  }
  return registry;
}
```

### Usage in contractValidation.ts

```typescript
// Replace hardcoded comparator logic with registry
const registry = getComparatorRegistry();

for (const contract of contracts) {
  for (const invariant of contract.invariants) {
    const comparator = registry.canHandle(invariant, snapshots);

    if (comparator) {
      const result = await comparator.compare({
        invariant,
        leftSnapshot: snapshots[0],
        rightSnapshot: snapshots[1],
        context: { workspaceId, contractId: contract.contractId, signalEventId },
      });

      findings.push(...result.findings);
    } else {
      console.warn(`No comparator available for ${invariant.comparatorType}`);
    }
  }
}
```

---

## Part 7: YAML Config Loader Plan

### File Structure

```
apps/api/src/config/
  contractpacks/
    loader.ts          # YAML parser + validator
    schema.ts          # Zod schema for validation
    resolver.ts        # Resolve org → repo → pack hierarchy
    examples/
      acme.yaml        # Example org config
```

### Implementation

```typescript
// apps/api/src/config/contractpacks/loader.ts

import * as yaml from 'js-yaml';
import { z } from 'zod';

// Zod schema matching your canonical YAML
const ContractPacksConfigSchema = z.object({
  version: z.literal(1),
  org: z.object({
    name: z.string(),
    timezone: z.string().optional(),
    defaults: z.object({
      mode: z.enum(['warn', 'block']),
      check_name: z.string(),
      max_runtime_seconds: z.number(),
      grace: z.object({
        external_fetch_failure: z.enum(['warn', 'ignore', 'block']),
        missing_optional_artifact: z.enum(['warn', 'ignore', 'block']),
      }),
    }),
    risk: z.object({
      surface_weights: z.record(z.number()),
      thresholds: z.object({
        warn_risk: z.number(),
        block_risk: z.number(),
      }),
    }),
  }),
  repos: z.array(z.object({
    repo: z.string(),
    rollout: z.object({
      mode: z.enum(['warn', 'block']),
      graduation: z.object({
        min_clean_runs: z.number(),
        allow_block_for_packs: z.array(z.string()),
      }).optional(),
    }),
    contractpacks: z.object({
      enabled: z.array(z.string()),
    }),
  })),
  contractpacks_definitions: z.array(z.object({
    name: z.string(),
    description: z.string(),
    activation: z.object({
      any_surfaces: z.array(z.string()),
      min_confidence: z.number(),
    }),
    artifacts: z.object({
      required: z.array(z.any()),
      optional: z.array(z.any()).optional(),
    }),
    comparators: z.array(z.any()),
    obligations: z.array(z.any()),
  })),
});

export async function loadContractPacksConfig(yamlPath: string): Promise<ContractPacksConfig> {
  const content = await fs.readFile(yamlPath, 'utf-8');
  const parsed = yaml.load(content);
  return ContractPacksConfigSchema.parse(parsed);
}

export function resolveRepoConfig(
  config: ContractPacksConfig,
  repoFullName: string
): RepoConfig {
  const repoConfig = config.repos.find(r => r.repo === repoFullName);
  if (!repoConfig) {
    // Return org defaults
    return {
      mode: config.org.defaults.mode,
      packs: [],
      rollout: { mode: 'warn' },
    };
  }

  // Merge org defaults with repo overrides
  return {
    mode: repoConfig.rollout.mode,
    packs: repoConfig.contractpacks.enabled.map(name =>
      config.contractpacks_definitions.find(p => p.name === name)
    ).filter(Boolean),
    rollout: repoConfig.rollout,
  };
}
```

---

## Conclusion

**Overall Assessment:** ✅ **ARCHITECTURE IS SOUND**

**Track A/B Separation:** ✅ **FULLY COMPLIANT**
- Track A is synchronous with timeout
- Track B is asynchronous with state machine

**Critical Gaps:**
- Comparator registry (needed for extensibility)
- YAML config support (needed for per-repo policies)
- Missing comparators (needed for coverage)

**Next Steps:**
1. Fix 2 bugs immediately
2. Implement Tier 0 comparators (Week 7)
3. Build comparator registry + YAML loader (Week 8)

**The foundation is solid. The gaps are in completeness, not correctness.**

