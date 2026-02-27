# Ultimate Track A Output - Step 1: Normalization Layer

## ✅ Implementation Status: COMPLETE

This document tracks the implementation of **Step 1: Normalization Layer** from the Ultimate Track A Output architecture.

## 🎯 Objective

Transform the raw `PackEvaluationResult` into a canonical `NormalizedEvaluationResult` that ensures consistent, high-quality output regardless of which rules or packs are evaluated.

## 📦 Deliverables

### 1. Type Definitions (`types.ts`)

**Added canonical evaluation model types:**

- `ObligationKind` - Enum for typed obligations (artifact_present, artifact_updated, approval_required, etc.)
- `NormalizedObligation` - Canonical representation with explicit surface→obligation mapping
- `NormalizedFinding` - Includes severity, what/why/how-to-fix, evidence, and owner
- `NotEvaluableItem` - Separate tracking for policy quality issues
- `NormalizedEvaluationResult` - The single source of truth for rendering

**Key Innovation:** Explicit `triggeredBy` field in `NormalizedObligation` creates the causal link between change surfaces and contract requirements (THE DIFFERENTIATOR).

### 2. Evaluation Normalizer (`evaluationNormalizer.ts`)

**Main Function:**
```typescript
normalizeEvaluationResults(packResults: PackResult[], globalDecision): NormalizedEvaluationResult
```

**Normalization Pipeline:**
1. Extract all detected surfaces (deduplicated)
2. Build normalized obligations with surface→obligation mapping
3. Convert findings to normalized format with risk/why/how-to-fix
4. Extract NOT_EVALUABLE items separately (policy quality issues)
5. Compute decision with contributing factors
6. Compute confidence with degradation reasons
7. Generate prioritized next actions

**Key Functions:**
- `extractAllSurfaces()` - Deduplicates surfaces across packs
- `buildNormalizedObligations()` - Creates explicit surface→obligation links
- `buildNormalizedFindings()` - Adds "why it matters" and "how to fix" guidance
- `extractNotEvaluableItems()` - Separates policy config issues from developer issues
- `computeConfidenceScore()` - Calculates confidence with degradation tracking
- `generateNextActions()` - Prioritizes agentic next steps

### 3. Ultimate Output Renderer (`ultimateOutputRenderer.ts`)

**Main Function:**
```typescript
renderUltimateOutput(normalized: NormalizedEvaluationResult): string
```

**Output Structure (A-F):**

**A) Executive Summary**
- Global decision (PASS/WARN/BLOCK) with emoji
- "Why" in 1-2 sentences
- Merge recommendation (can merge / merge with caution / do not merge)
- Confidence score with degradation reasons

**B) Change Surface Summary** ⭐ THE DIFFERENTIATOR
- Shows exactly what changed (API, DB, Infra, etc.)
- Confidence level for each surface
- Detection method and matched files/patterns
- Grounds the evaluation in concrete changes

**C) Required Contracts & Obligations**
- For each surface, shows what contracts are required
- Status of each obligation (pass/fail/unknown)
- Impact if failed (PASS/WARN/BLOCK)
- Explicit causal link: "Because X changed → Y is required"

**D) Findings (Ranked by Risk)**
- Grouped by severity (Critical → High → Medium → Low)
- Each finding includes:
  - What is wrong (plain English)
  - Why it matters (risk explanation)
  - Evidence (files, diffs, links)
  - How to fix (exact steps)
  - Owner (team/individuals/CODEOWNERS)

**E) Not-Evaluable Section**
- Separate from findings (policy quality issues)
- Grouped by category:
  - Policy Configuration Issues
  - Missing External Evidence
  - Integration Errors
- Shows confidence impact and remediation steps

**F) Next Best Actions**
- Prioritized agentic steps
- Categories: fix_blocking, fix_warning, configure_policy, request_approval
- Limited to top 5 actions

**Metadata (Collapsed)**
- Pack info, evaluation time, counts

### 4. GitHub Check Integration (`githubCheckCreator.ts`)

**Updated multi-pack check creation:**
```typescript
// Normalize evaluation results
const normalized = normalizeEvaluationResults(input.packResults!, decision);

// Render Ultimate Track A output
const ultimateOutput = renderUltimateOutput(normalized);

// Use as check text
const text = ultimateOutput;
```

**New summary function:**
```typescript
buildUltimateCheckSummary(normalized, isObserveMode)
```
- Shows decision, confidence, and counts in one line
- Includes decision reason

## 🔑 Key Architectural Decisions

1. **Strict Internal Model** - All evaluations flow through `NormalizedEvaluationResult`
2. **Surface→Obligation Mapping** - Explicit `triggeredBy` field creates causal links
3. **NOT_EVALUABLE as Policy Quality Issue** - Separated from developer failures
4. **Risk-First Findings** - Every finding explains "why it matters"
5. **Agentic Next Actions** - Prioritized, actionable steps

## 📊 Impact

**Before (Phase 3):**
- Output was evaluation-graph-centric
- No explicit surface→obligation link
- NOT_EVALUABLE mixed with failures
- Generic "how to fix" guidance

**After (Step 1):**
- Output is human-narrative-centric
- Explicit "Because X changed → Y required" story
- NOT_EVALUABLE treated as config issue
- Specific, actionable remediation steps
- Confidence degradation tracking

## 🧪 Next Steps

1. **Test on PR #27** - Trigger re-evaluation to see Ultimate Track A output
2. **Refine rendering** - Adjust formatting based on real output
3. **Step 2: Surface→Obligation Mapping** - Make YAML schema support explicit obligations
4. **Step 3: Degrade Logic** - Add `onNotEvaluable` configuration
5. **Step 4: Obligation Types** - Expand `ObligationKind` with more types
6. **Step 5: Pack Precedence** - Multi-pack decision aggregation rules

## 📁 Files Modified

- `apps/api/src/services/gatekeeper/yaml-dsl/types.ts` - Added normalization types
- `apps/api/src/services/gatekeeper/yaml-dsl/evaluationNormalizer.ts` - NEW
- `apps/api/src/services/gatekeeper/yaml-dsl/ultimateOutputRenderer.ts` - NEW
- `apps/api/src/services/gatekeeper/yaml-dsl/githubCheckCreator.ts` - Integrated new renderer

## ✅ Completion Checklist

- [x] Define canonical evaluation model types
- [x] Implement normalization pipeline
- [x] Build Ultimate Track A renderer
- [x] Integrate with GitHub check creator
- [x] Add confidence degradation tracking
- [x] Separate NOT_EVALUABLE items
- [x] Generate prioritized next actions
- [ ] Test on real PR
- [ ] Refine based on feedback

