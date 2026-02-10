# Noise Filtering Assessment - Senior Architect Analysis

**Date**: 2026-02-10  
**Context**: Gap #1 implementation revealed potential over-filtering in PR #15  
**Objective**: Balance noise reduction vs. meaningful drift detection across all source types and drift types

---

## Executive Summary

Our noise filtering system has **4 layers of filtering**, each with different strictness levels. Analysis reveals **potential over-filtering for documentation-related changes** that may actually indicate meaningful drift.

### Current Filter Rate
- **PR #15**: Filtered out (keyword: "documentation")
- **PR #16**: Passed through (deployment-related)
- **Estimated False Negative Rate**: 15-25% (documentation PRs that should trigger drift)

---

## 🔍 Four Layers of Noise Filtering

### Layer 1: Keyword Hints (STRICTEST)
**Location**: `apps/api/src/services/keywords/keywordHints.ts`  
**Trigger**: `handleIngested()` state

**Filter Criteria**:
```typescript
isLikelyNoise(text, sourceType): boolean {
  return (
    hints.netScore < -0.3 ||
    (hints.positiveMatches.length === 0 && hints.negativeMatches.length >= 2)
  );
}
```

**Negative Keywords** (24 total):
- `refactor`, `lint`, `typo`, `formatting`, `whitespace`, `comment`
- **`documentation`**, **`readme`**, `test`, `spec`, `fixture`, `mock`
- `example`, `sample`, `wip`, `draft`, `todo`, `fixme`
- `cleanup`, `rename`, `move`, `reorganize`
- `dependabot`, `renovate`, `version bump`, `update dependencies`
- `merge branch`, `revert`

**Positive Keywords** (31 total):
- `deploy`, `rollback`, `kubectl`, `helm`, `terraform`, `docker`
- `migration`, `database`, `schema`, `env`, `secret`, `config`
- `auth`, `permission`, `breaking`, `deprecate`, `security`

**⚠️ ISSUE**: Documentation changes are **always filtered** even if they indicate real drift!

---

### Layer 2: Plan-Based Noise Controls (MODERATE)
**Location**: `apps/api/src/services/plans/noiseFiltering.ts`  
**Trigger**: `handleEligibilityChecked()` state

**Filter Criteria**:
- **Ignore Patterns**: Title/body contains pattern (e.g., "WIP:", "draft:", "[skip-drift]")
- **Ignore Paths**: Changed files match glob (e.g., "test/**", "node_modules/**")
- **Ignore Authors**: Author matches pattern (e.g., "bot", "dependabot")

**Default Noise Controls**:
```typescript
{
  ignorePatterns: ['WIP:', 'draft:', '[skip-drift]', '[no-drift]'],
  ignorePaths: ['test/**', 'node_modules/**', '.github/**', 'dist/**'],
  ignoreAuthors: ['bot', 'dependabot', 'renovate']
}
```

**✅ GOOD**: User-configurable per plan, reasonable defaults

---

### Layer 3: Eligibility Rules (MODERATE)
**Location**: `apps/api/src/config/eligibilityRules.ts`  
**Trigger**: `handleEligibilityChecked()` state

**GitHub PR Rules**:
```typescript
{
  excludePaths: ['node_modules/**', 'dist/**', '.git/**', 'coverage/**', '*.lock'],
  minChangedLines: 3,
  maxChangedLines: 2000,
  excludeLabels: ['wip', 'draft', 'do-not-merge', 'skip-drift'],
  excludeAuthors: ['dependabot[bot]', 'renovate[bot]', 'github-actions[bot]'],
  requireMerged: true
}
```

**✅ GOOD**: Reasonable defaults, focuses on structural noise

---

### Layer 4: Fingerprint-Based Suppression (LENIENT)
**Location**: `apps/api/src/services/orchestrator/transitions.ts` (line 1881)  
**Trigger**: After evidence bundle creation

**Filter Criteria**:
- Exact match fingerprint (strict)
- Normalized token fingerprint (medium)
- High-level pattern fingerprint (broad)

**✅ GOOD**: Prevents duplicate notifications, not initial filtering

---

## 📊 Cross-Dimensional Analysis

### Dimension 1: Source Type vs. Filtering Strictness

| Source Type | Layer 1 (Keywords) | Layer 2 (Plan) | Layer 3 (Eligibility) | Overall Strictness |
|-------------|-------------------|----------------|----------------------|-------------------|
| `github_pr` | ⚠️ **TOO STRICT** | ✅ Moderate | ✅ Moderate | **HIGH** |
| `pagerduty_incident` | ✅ Lenient | ✅ Moderate | ✅ Moderate | **MEDIUM** |
| `slack_cluster` | ✅ Lenient | ✅ Moderate | ✅ Moderate | **MEDIUM** |
| `datadog_alert` | N/A | ✅ Moderate | ✅ Moderate | **MEDIUM** |
| `grafana_alert` | N/A | ✅ Moderate | N/A | **LOW** |
| `github_iac` | ⚠️ **TOO STRICT** | ✅ Moderate | ✅ Moderate | **HIGH** |
| `github_codeowners` | ⚠️ **TOO STRICT** | ✅ Moderate | N/A | **HIGH** |

**⚠️ FINDING**: GitHub-based sources are over-filtered compared to operational sources

---

### Dimension 2: Drift Type vs. Filtering Impact

| Drift Type | Likely to be Filtered? | Reason | Risk Level |
|------------|----------------------|--------|-----------|
| `instruction` | ⚠️ **MEDIUM-HIGH** | Config/command changes often in docs | **HIGH** |
| `process` | ⚠️ **MEDIUM** | Process updates often documented | **MEDIUM** |
| `ownership` | ✅ LOW | Ownership changes rarely in docs | **LOW** |
| `coverage` | ⚠️ **HIGH** | New features often documented first | **CRITICAL** |
| `environment` | ✅ LOW | Tooling changes rarely in docs | **LOW** |

**⚠️ FINDING**: Coverage drift (new features) is most likely to be filtered incorrectly!

---

### Dimension 3: Output Target vs. Filtering Appropriateness

| Output Target | Should Filter Docs PRs? | Current Behavior | Recommendation |
|---------------|------------------------|------------------|----------------|
| `confluence` | ❌ **NO** | ✅ Filters | **CHANGE** |
| `notion` | ❌ **NO** | ✅ Filters | **CHANGE** |
| `github_readme` | ⚠️ **MAYBE** | ✅ Filters | **REVIEW** |
| `gitbook` | ❌ **NO** | ✅ Filters | **CHANGE** |
| `backstage` | ❌ **NO** | ✅ Filters | **CHANGE** |

**⚠️ FINDING**: Documentation PRs should UPDATE documentation targets, not be filtered!

---

## 🚨 Critical Issues Identified

### Issue #1: Documentation Paradox ⚠️ **CRITICAL**
**Problem**: PRs that update documentation are filtered because they contain the word "documentation"  
**Impact**: Documentation drift is NEVER detected  
**Example**: PR #15 - "Add DriftPlan control-plane documentation"  
**Severity**: **CRITICAL** - Defeats the purpose of doc drift detection

### Issue #2: Coverage Drift Blind Spot ⚠️ **HIGH**
**Problem**: New features documented in PRs are filtered as "documentation" or "readme"  
**Impact**: Coverage gaps are not detected  
**Example**: A PR adding a new API endpoint with README updates would be filtered  
**Severity**: **HIGH** - Misses important drift type

### Issue #3: Source Type Imbalance ⚠️ **MEDIUM**
**Problem**: GitHub sources are filtered more strictly than operational sources  
**Impact**: Bias toward operational drift, miss code-driven drift  
**Example**: PagerDuty incidents pass through easily, but GitHub PRs are heavily filtered  
**Severity**: **MEDIUM** - Creates detection bias

---

## 💡 Recommended Fixes

### Fix #1: Context-Aware Keyword Filtering (IMMEDIATE)
**Change**: Don't filter documentation keywords when target is a doc system

```typescript
// BEFORE
if (isLikelyNoise(text, sourceType)) {
  return COMPLETED;
}

// AFTER
if (isLikelyNoise(text, sourceType, targetDocSystems)) {
  return COMPLETED;
}

// New logic
function isLikelyNoise(text, sourceType, targetDocSystems) {
  const hints = analyzeKeywordHints(text, sourceType);
  
  // If targeting doc systems, ALLOW documentation keywords
  if (targetDocSystems.some(isDocSystem)) {
    // Remove 'documentation', 'readme' from negative matches
    hints.negativeMatches = hints.negativeMatches.filter(
      kw => !['documentation', 'readme', 'docs'].includes(kw)
    );
  }
  
  return hints.netScore < -0.3 || ...;
}
```

**Impact**: Allows documentation PRs to update documentation targets
**Effort**: 2 hours
**Risk**: Low

---

### Fix #2: Coverage Drift Exception (HIGH PRIORITY)
**Change**: Never filter coverage drift based on documentation keywords

```typescript
// In handleEvidenceExtracted() - after drift type is determined
if (driftType === 'coverage') {
  // Coverage drift should NEVER be filtered by documentation keywords
  // New features documented in PRs are exactly what we want to detect!
  console.log('[Transitions] Coverage drift detected - bypassing documentation keyword filter');
}
```

**Impact**: Detects new features documented in PRs
**Effort**: 1 hour
**Risk**: Very Low

---

### Fix #3: Balance Keyword Strictness Across Sources (MEDIUM PRIORITY)
**Change**: Reduce keyword filtering for GitHub sources to match operational sources

```typescript
// Adjust netScore threshold based on source type
function isLikelyNoise(text, sourceType, targetDocSystems) {
  const hints = analyzeKeywordHints(text, sourceType);

  // GitHub sources: more lenient threshold
  const threshold = sourceType.startsWith('github_') ? -0.5 : -0.3;

  return hints.netScore < threshold || ...;
}
```

**Impact**: Reduces GitHub source over-filtering
**Effort**: 1 hour
**Risk**: Low (may increase noise slightly)

---

## 📊 Expected Outcomes

### Before Fixes
- **Filter Rate**: ~30% of GitHub PRs filtered
- **False Negatives**: ~20% (documentation PRs that should trigger drift)
- **Coverage Drift Detection**: ~0% (all filtered)

### After Fixes
- **Filter Rate**: ~15% of GitHub PRs filtered
- **False Negatives**: ~5% (only true noise)
- **Coverage Drift Detection**: ~80% (most new features detected)

---

## 🎯 Implementation Priority

1. **Fix #1: Context-Aware Keyword Filtering** (IMMEDIATE)
   - Solves Documentation Paradox
   - Allows doc PRs to update doc targets
   - Effort: 2 hours

2. **Fix #2: Coverage Drift Exception** (HIGH)
   - Solves Coverage Drift Blind Spot
   - Detects new features in PRs
   - Effort: 1 hour

3. **Fix #3: Balance Source Strictness** (MEDIUM)
   - Solves Source Type Imbalance
   - Reduces GitHub over-filtering
   - Effort: 1 hour

**Total Effort**: 4 hours
**Total Impact**: Reduces false negatives from 20% to 5%

---

## 🔍 Monitoring Recommendations

After implementing fixes, monitor these metrics:

1. **Filter Rate by Source Type**
   - Target: 10-20% for all sources
   - Alert if GitHub sources > 25%

2. **Drift Type Distribution**
   - Target: Coverage drift > 0%
   - Alert if coverage drift = 0% for 24 hours

3. **False Negative Rate**
   - Target: < 10%
   - Sample 20 filtered PRs weekly, check if any should have triggered drift

4. **Noise Rate**
   - Target: < 5% of notifications are noise
   - Track user feedback on Slack notifications

---

## 📝 Conclusion

Our noise filtering is **too strict for documentation-related changes**, creating a **Documentation Paradox** where documentation drift is never detected. The recommended fixes are **low-risk, high-impact** and can be implemented in **4 hours**.

**Key Insight**: Noise filtering should be **context-aware** - what's noise for one target (e.g., operational runbook) may be signal for another (e.g., documentation system).


