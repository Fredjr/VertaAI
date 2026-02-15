# Week 7-8 Implementation Plan: Comparator Registry + YAML Config + Tier 0 Comparators

**Date:** 2026-02-15  
**Workspace ID:** `dda61d53-8ac8-49e2-a297-f38efdbf1bf3` (Production Test Workspace)  
**Status:** Planning Complete, Ready for Implementation

---

## Executive Summary

Based on the architectural audit, we need to implement 3 critical items to complete Track A (Contract Integrity Gate):

1. **Comparator Registry** - Extensibility layer for adding new comparators without code changes
2. **YAML Config Support** - Per-repo policy configuration with org/repo/pack hierarchy
3. **Tier 0 Comparators** - Foundation comparators (docs.required_sections, docs.anchor_check, obligations)

**Timeline:** 2 weeks (Week 7-8)  
**Approach:** Senior architect hat - design first, implement incrementally, test continuously

---

## Part 1: Assessment & Architecture

### Current State Analysis

**✅ What Works:**
- Track A runs synchronously in webhook handler (< 30s)
- Track B runs asynchronously via QStash
- 2 comparators implemented (OpenAPI, Terraform)
- ContractPack model in database
- Artifact fetching with TTL caching
- GitHub Check creation (stubbed)

**🚨 Critical Gaps:**
1. No comparator registry - hardcoded in contractValidation.ts
2. No YAML config support - database-only
3. Missing 11 comparators from Tier 0-3 spec
4. No extractor layer - parsing duplicated across comparators
5. No rollout controls - no warn→block graduation

### Architecture Decision: Phased Approach

**Week 7 (Foundation):**
- Comparator registry + extractor layer
- Tier 0 comparators (4 comparators)
- Update contractValidation.ts to use registry

**Week 8 (Configuration):**
- YAML config loader with Zod validation
- Org → repo → pack hierarchy resolver
- Rollout controls (warn→block graduation)
- Tier 1 comparators (3 comparators)

---

## Part 2: Comparator Registry Design

### File Structure

```
apps/api/src/services/contracts/
  comparators/
    registry.ts              # NEW - Registry implementation
    base.ts                  # EXISTS - Base comparator
    openapi.ts               # EXISTS - OpenAPI comparator
    terraform.ts             # EXISTS - Terraform comparator
    docs-required-sections.ts # NEW - Tier 0
    docs-anchor-check.ts     # NEW - Tier 0
    obligation-file-present.ts # NEW - Tier 0
    obligation-file-changed.ts # NEW - Tier 0
  extractors/
    openapi-extractor.ts     # NEW - OpenAPI parsing
    markdown-extractor.ts    # NEW - Markdown parsing
    confluence-extractor.ts  # NEW - Confluence parsing
```

### Registry Interface

```typescript
// apps/api/src/services/contracts/comparators/registry.ts

export interface ComparatorMetadata {
  type: string;
  version: string;
  tier: 0 | 1 | 2 | 3;
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
    registry.register(new DocsRequiredSectionsComparator());
    registry.register(new DocsAnchorCheckComparator());
    registry.register(new ObligationFilePresentComparator());
    registry.register(new ObligationFileChangedComparator());
  }
  return registry;
}
```

### Usage in contractValidation.ts

```typescript
// BEFORE (hardcoded)
const openApiComparator = new OpenApiComparator();
const terraformComparator = new TerraformRunbookComparator();

for (const contract of contracts) {
  for (const invariant of contract.invariants) {
    if (invariant.comparatorType === 'openapi_docs_endpoint_parity') {
      const result = await openApiComparator.compare({...});
      findings.push(...result.findings);
    } else if (invariant.comparatorType === 'terraform_runbook_consistency') {
      const result = await terraformComparator.compare({...});
      findings.push(...result.findings);
    }
  }
}

// AFTER (registry-based)
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

## Part 3: Extractor Layer Design

### Why Extractors?

**Problem:** Each comparator parses artifacts independently (duplication, bugs, inconsistency)

**Solution:** Shared extractor layer with stable parsing logic

### Extractor Interface

```typescript
// apps/api/src/services/contracts/extractors/base.ts

export interface Extractor<T> {
  parse(content: string): T;
  validate(parsed: T): boolean;
  sha256(parsed: T): string;
}

export interface OpenApiAST {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, any>>;
  components?: { schemas?: Record<string, any> };
}

export interface MarkdownAST {
  headers: string[];
  anchors: Map<string, string>;
  codeBlocks: Array<{ language: string; code: string }>;
}
```

### OpenAPI Extractor

```typescript
// apps/api/src/services/contracts/extractors/openapi-extractor.ts

import * as yaml from 'js-yaml';
import * as crypto from 'crypto';

export class OpenApiExtractor implements Extractor<OpenApiAST> {
  parse(content: string): OpenApiAST {
    // Try YAML first, then JSON
    try {
      return yaml.load(content) as OpenApiAST;
    } catch {
      return JSON.parse(content) as OpenApiAST;
    }
  }
  
  validate(parsed: OpenApiAST): boolean {
    return !!parsed.openapi && !!parsed.info && !!parsed.paths;
  }
  
  sha256(parsed: OpenApiAST): string {
    const canonical = JSON.stringify(parsed, Object.keys(parsed).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }
  
  jsonPath(ast: OpenApiAST, path: string): any {
    // JSONPath implementation for querying OpenAPI spec
    // e.g., "$.paths./users.get.parameters[?(@.name=='userId')]"
    // Use jsonpath-plus library
  }
}
```

---

## Part 4: Tier 0 Comparators

### Comparator 1: docs.required_sections

**Purpose:** Check if documentation has required sections (deterministic header matching)

**Example:**
```yaml
comparator:
  type: docs.required_sections
  required_sections:
    - "Deployment"
    - "Rollback"
    - "Monitoring"
    - "Troubleshooting"
```

**Implementation:**
```typescript
export class DocsRequiredSectionsComparator extends BaseComparator {
  readonly comparatorType = 'docs.required_sections';
  readonly supportedArtifactTypes = ['confluence_page', 'notion_page', 'github_readme'];
  readonly tier = 0;
  
  canCompare(invariant: Invariant, snapshots: ArtifactSnapshot[]): boolean {
    return snapshots.some(s => this.supportedArtifactTypes.includes(s.artifactType));
  }
  
  extractData(snapshot: ArtifactSnapshot): MarkdownAST {
    const extractor = new MarkdownHeaderExtractor();
    return extractor.parse(snapshot.rawContent || '');
  }
  
  async performComparison(
    left: MarkdownAST,
    right: MarkdownAST,
    input: ComparatorInput
  ): Promise<IntegrityFinding[]> {
    const requiredSections = input.invariant.config?.required_sections || [];
    const findings: IntegrityFinding[] = [];
    
    for (const section of requiredSections) {
      const found = right.headers.some(h => h.toLowerCase().includes(section.toLowerCase()));
      
      if (!found) {
        findings.push(this.createFinding({
          workspaceId: input.context.workspaceId,
          contractId: input.context.contractId,
          invariantId: input.invariant.invariantId,
          driftType: 'missing_section',
          severity: 'high',
          compared: {
            left: { artifact: left, snapshotId: input.leftSnapshot.id },
            right: { artifact: right, snapshotId: input.rightSnapshot.id },
          },
          evidence: [{
            type: 'missing_header',
            description: `Required section "${section}" not found in documentation`,
            location: { file: 'documentation', line: null },
            snippet: null,
          }],
          context: input.context,
        }));
      }
    }
    
    return findings;
  }
}
```

### Comparator 2: docs.anchor_check

**Purpose:** Validate anchors in documentation match source artifacts (deterministic anchor extraction)

**Example:**
```yaml
comparator:
  type: docs.anchor_check
  anchors:
    - anchor_key: OPENAPI_SHA
      target_regex: 'OPENAPI_SHA:\s*([a-f0-9]{64})'
      source_value: 'sha256(openapi_spec_head)'
```

**Implementation:** (See detailed plan in audit doc)

### Comparator 3: obligation.file_present

**Purpose:** Check if required files exist in PR

### Comparator 4: obligation.file_changed

**Purpose:** Check if required files were modified in PR

---

## Part 5: YAML Config Loader

### File Structure

```
apps/api/src/config/
  contractpacks/
    loader.ts          # YAML parser + validator
    schema.ts          # Zod schema
    resolver.ts        # Org → repo → pack hierarchy
    examples/
      acme.yaml        # Example org config
```

### Zod Schema

```typescript
// apps/api/src/config/contractpacks/schema.ts

import { z } from 'zod';

export const ContractPacksConfigSchema = z.object({
  version: z.literal(1),
  org: z.object({
    name: z.string(),
    defaults: z.object({
      mode: z.enum(['warn', 'block']),
      max_runtime_seconds: z.number(),
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
  })),
});
```

---

## Part 6: Implementation Order

### Week 7 Tasks

1. **Day 1-2: Extractor Layer**
   - Create base extractor interface
   - Implement OpenApiExtractor
   - Implement MarkdownHeaderExtractor
   - Write tests (10 tests)

2. **Day 3-4: Comparator Registry**
   - Create registry interface
   - Implement DefaultComparatorRegistry
   - Update contractValidation.ts to use registry
   - Write tests (8 tests)

3. **Day 5-7: Tier 0 Comparators**
   - Implement docs.required_sections
   - Implement docs.anchor_check
   - Implement obligation.file_present
   - Implement obligation.file_changed
   - Write tests (20 tests)

### Week 8 Tasks

4. **Day 1-3: YAML Config Loader**
   - Create Zod schema
   - Implement YAML loader
   - Implement hierarchy resolver
   - Write tests (12 tests)

5. **Day 4-5: Rollout Controls**
   - Track clean run count per workspace/repo
   - Implement warn→block graduation logic
   - Add severity overrides support
   - Write tests (8 tests)

6. **Day 6-7: Integration & Testing**
   - End-to-end testing with production workspace
   - Performance testing (< 25s validation)
   - Documentation updates

---

## Part 7: Success Criteria

**Week 7:**
- ✅ Comparator registry functional with 6 comparators
- ✅ Extractor layer reduces parsing duplication
- ✅ All tests passing (38 new tests)
- ✅ No regression in existing functionality

**Week 8:**
- ✅ YAML config loader functional
- ✅ Org/repo/pack hierarchy working
- ✅ Rollout controls implemented
- ✅ All tests passing (20 new tests)
- ✅ Documentation updated

**Overall:**
- ✅ Track A validation < 25s
- ✅ 6 comparators implemented (Tier 0 complete)
- ✅ Extensible architecture for adding more comparators
- ✅ Per-repo policy configuration
- ✅ Zero production bugs

---

## Next Steps

1. Review this plan with stakeholders
2. Create GitHub issues for each task
3. Start Week 7 Day 1: Extractor Layer

