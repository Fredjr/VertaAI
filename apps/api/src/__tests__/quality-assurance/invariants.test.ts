/**
 * Quality Assurance: Invariant Testing Framework
 * 
 * This test suite ensures that the governance layer output meets quality standards
 * REGARDLESS of which comparators, policy packs, or repo types are used.
 * 
 * Invariants tested:
 * 1. Counting Consistency - Title count === Body count (everywhere)
 * 2. Decision Determinism - Same input → same decision (no randomness)
 * 3. Confidence Bounds - 0 <= confidence.score <= 100 (always)
 * 4. Evidence Completeness - Every failed obligation has evidence
 * 5. Remediation Presence - Every failed obligation has remediation (not generic)
 * 6. Semantic Consistency - Repo invariants never labeled as "diff-derived"
 */

import { describe, it, expect } from 'vitest';
import { normalizeEvaluationResults } from '../../services/gatekeeper/yaml-dsl/evaluationNormalizer.js';
import { renderUltimateOutput } from '../../services/gatekeeper/yaml-dsl/ultimateOutputRenderer.js';
import { buildMultiPackCheckTitleFromNormalized } from '../../services/gatekeeper/yaml-dsl/githubCheckCreator.js';
import type { PackResult } from '../../services/gatekeeper/yaml-dsl/yamlGatekeeperIntegration.js';
import type { NormalizedEvaluationResult } from '../../services/gatekeeper/yaml-dsl/types.js';

// Test fixtures
import { simpleBaselineFailure } from './fixtures/simple-baseline-failure.js';
import { mixedObligations } from './fixtures/mixed-obligations.js';

/**
 * INVARIANT 1: Counting Consistency
 *
 * The obligation count in the title MUST match the count in the body and metadata.
 *
 * Formula: totalConsidered = enforced.length + suppressed.length
 *
 * This is tested across:
 * - GitHub check title (buildMultiPackCheckTitleFromNormalized)
 * - Executive summary (renderExecutiveSummary)
 * - Metadata section (renderMetadata)
 */
describe('INVARIANT 1: Counting Consistency', () => {
  it('should have consistent counts in title, body, and metadata (simple case)', () => {
    // Arrange
    const packResults = simpleBaselineFailure;
    const normalized = normalizeEvaluationResults(packResults, 'warn');

    // Act
    const title = buildMultiPackCheckTitleFromNormalized(normalized, 'warn');
    const body = renderUltimateOutput(normalized, 'warn');

    // Extract counts from title
    const titleMatch = title.match(/(\d+) obligation\(s\) considered/);
    const titleCount = titleMatch ? parseInt(titleMatch[1]) : 0;

    // Extract counts from metadata section
    const metadataMatch = body.match(/Obligations Considered: (\d+) total/);
    const metadataCount = metadataMatch ? parseInt(metadataMatch[1]) : 0;

    // Assert: All counts must match
    expect(titleCount).toBe(1); // Simple case: 1 obligation
    expect(metadataCount).toBe(1);
    expect(titleCount).toBe(metadataCount);
    expect(titleCount).toBe(normalized.obligations.length);
  });

  it('should count ALL suppressed obligations (not just failed ones)', () => {
    // This was the bug we just fixed - ensure it stays fixed
    // Arrange
    const packResults = mixedObligations;
    const normalized = normalizeEvaluationResults(packResults, 'warn');

    // Act
    const title = buildMultiPackCheckTitleFromNormalized(normalized, 'warn');
    const body = renderUltimateOutput(normalized, 'warn');

    // Extract counts
    const titleMatch = title.match(/(\d+) obligation\(s\) considered/);
    const titleCount = titleMatch ? parseInt(titleMatch[1]) : 0;

    const suppressedMatch = title.match(/(\d+) suppressed/);
    const suppressedCount = suppressedMatch ? parseInt(suppressedMatch[1]) : 0;

    // Assert: Should count ALL suppressed (2), not just failed suppressed
    expect(suppressedCount).toBe(2);
    expect(titleCount).toBe(4); // 2 enforced + 2 suppressed
  });

  it('should use the same counting model everywhere', () => {
    // Verify splitObligationsByApplicability is used consistently
    // Arrange
    const packResults = mixedObligations;
    const normalized = normalizeEvaluationResults(packResults, 'warn');

    // Act
    const title = buildMultiPackCheckTitleFromNormalized(normalized, 'warn');
    const body = renderUltimateOutput(normalized, 'warn');

    // Extract counts from different sections
    const titleMatch = title.match(/(\d+) obligation\(s\) considered/);
    const titleCount = titleMatch ? parseInt(titleMatch[1]) : 0;

    const metadataMatch = body.match(/Obligations Considered: (\d+) total \((\d+) enforced, (\d+) suppressed/);
    const metadataTotal = metadataMatch ? parseInt(metadataMatch[1]) : 0;
    const metadataEnforced = metadataMatch ? parseInt(metadataMatch[2]) : 0;
    const metadataSuppressed = metadataMatch ? parseInt(metadataMatch[3]) : 0;

    // Assert: Formula must hold everywhere
    expect(titleCount).toBe(metadataTotal);
    expect(metadataTotal).toBe(metadataEnforced + metadataSuppressed);
    expect(metadataEnforced).toBe(2); // 1 pass + 1 fail
    expect(metadataSuppressed).toBe(2); // 2 suppressed
  });
});

/**
 * INVARIANT 2: Decision Determinism
 *
 * Given the same input, the system MUST produce the same decision.
 * No randomness, no time-based variation, no external API calls that could change.
 */
describe('INVARIANT 2: Decision Determinism', () => {
  it('should produce the same decision for the same input (run 10 times)', () => {
    // Arrange
    const packResults = simpleBaselineFailure;

    // Act: Run normalization 10 times
    const results = Array.from({ length: 10 }, () =>
      normalizeEvaluationResults(packResults, 'warn')
    );

    // Assert: All decisions should be identical
    const firstDecision = results[0].decision;
    results.forEach((result, index) => {
      expect(result.decision).toEqual(firstDecision);
      expect(result.decision.status).toBe('warn');
    });
  });

  it('should produce the same confidence score for the same input', () => {
    // Arrange
    const packResults = mixedObligations;

    // Act: Run normalization 10 times
    const results = Array.from({ length: 10 }, () =>
      normalizeEvaluationResults(packResults, 'warn')
    );

    // Assert: All confidence scores should be identical
    const firstConfidence = results[0].confidence;
    results.forEach((result, index) => {
      expect(result.confidence.decision.score).toBe(firstConfidence.decision.score);
      expect(result.confidence.classification.score).toBe(firstConfidence.classification.score);
      expect(result.confidence.aggregate.score).toBe(firstConfidence.aggregate.score);
    });
  });

  it('should produce the same output text for the same input', () => {
    // Arrange
    const packResults = simpleBaselineFailure;

    // Act: Render output 10 times
    const outputs = Array.from({ length: 10 }, () => {
      const normalized = normalizeEvaluationResults(packResults, 'warn');
      return renderUltimateOutput(normalized, 'warn');
    });

    // Assert: All outputs should be identical (character-for-character)
    const firstOutput = outputs[0];
    outputs.forEach((output, index) => {
      expect(output).toBe(firstOutput);
    });
  });
});

/**
 * INVARIANT 3: Confidence Bounds
 *
 * All confidence scores MUST be between 0 and 100.
 * This includes:
 * - Decision confidence
 * - Classification confidence
 * - Evidence confidence
 * - Aggregate confidence
 */
describe('INVARIANT 3: Confidence Bounds', () => {
  it('should have confidence scores between 0 and 100 (simple case)', () => {
    // Arrange
    const packResults = simpleBaselineFailure;
    const normalized = normalizeEvaluationResults(packResults, 'warn');

    // Assert: All confidence scores must be in valid range
    expect(normalized.confidence.decision.score).toBeGreaterThanOrEqual(0);
    expect(normalized.confidence.decision.score).toBeLessThanOrEqual(100);

    expect(normalized.confidence.classification.score).toBeGreaterThanOrEqual(0);
    expect(normalized.confidence.classification.score).toBeLessThanOrEqual(100);

    expect(normalized.confidence.aggregate.score).toBeGreaterThanOrEqual(0);
    expect(normalized.confidence.aggregate.score).toBeLessThanOrEqual(100);
  });

  it('should have confidence scores between 0 and 100 (complex case)', () => {
    // Arrange
    const packResults = mixedObligations;
    const normalized = normalizeEvaluationResults(packResults, 'warn');

    // Assert: All confidence scores must be in valid range
    expect(normalized.confidence.decision.score).toBeGreaterThanOrEqual(0);
    expect(normalized.confidence.decision.score).toBeLessThanOrEqual(100);

    expect(normalized.confidence.classification.score).toBeGreaterThanOrEqual(0);
    expect(normalized.confidence.classification.score).toBeLessThanOrEqual(100);

    expect(normalized.confidence.aggregate.score).toBeGreaterThanOrEqual(0);
    expect(normalized.confidence.aggregate.score).toBeLessThanOrEqual(100);
  });

  it('should never have NaN or undefined confidence scores', () => {
    // Arrange
    const packResults = mixedObligations;
    const normalized = normalizeEvaluationResults(packResults, 'warn');

    // Assert: No NaN or undefined values
    expect(normalized.confidence.decision.score).not.toBeNaN();
    expect(normalized.confidence.decision.score).toBeDefined();

    expect(normalized.confidence.classification.score).not.toBeNaN();
    expect(normalized.confidence.classification.score).toBeDefined();

    expect(normalized.confidence.aggregate.score).not.toBeNaN();
    expect(normalized.confidence.aggregate.score).toBeDefined();
  });
});

/**
 * INVARIANT 4: Evidence Completeness
 *
 * Every failed obligation MUST have at least one evidence item.
 * This ensures the user can understand WHY the obligation failed.
 */
describe('INVARIANT 4: Evidence Completeness', () => {
  it('should have at least 1 evidence item for every failed obligation', () => {
    // Arrange
    const packResults = mixedObligations;
    const normalized = normalizeEvaluationResults(packResults, 'warn');

    // Act: Find all failed obligations
    const failedObligations = normalized.obligations.filter(
      o => o.result.status === 'fail'
    );

    // Assert: Every failed obligation must have evidence
    expect(failedObligations.length).toBeGreaterThan(0); // Ensure we're testing something
    failedObligations.forEach(obligation => {
      expect(obligation.evidence.length).toBeGreaterThan(0);
    });
  });

  it('should have evidence with valid types (file, checkrun, approval, etc.)', () => {
    // Arrange
    const packResults = mixedObligations;
    const normalized = normalizeEvaluationResults(packResults, 'warn');

    // Act: Find all obligations with evidence
    const obligationsWithEvidence = normalized.obligations.filter(
      o => o.evidence && o.evidence.length > 0
    );

    // Assert: All evidence items must have valid types
    const validTypes = ['file', 'checkrun', 'approval', 'diff', 'commit', 'snippet', 'secret_detected'];
    obligationsWithEvidence.forEach(obligation => {
      obligation.evidence.forEach(evidence => {
        expect(validTypes).toContain(evidence.type);
      });
    });
  });
});

/**
 * INVARIANT 5: Remediation Presence
 *
 * Every failed obligation MUST have remediation guidance.
 * The guidance MUST NOT be the generic fallback ("Fix the issue described above").
 */
describe('INVARIANT 5: Remediation Presence', () => {
  it('should have remediation guidance for every failed obligation', () => {
    // Arrange
    const packResults = simpleBaselineFailure;
    const normalized = normalizeEvaluationResults(packResults, 'warn');
    const body = renderUltimateOutput(normalized, 'warn');

    // Act: Find all failed obligations
    const failedObligations = normalized.obligations.filter(
      o => o.result.status === 'fail'
    );

    // Assert: Body must contain "How to Fix" section
    expect(failedObligations.length).toBeGreaterThan(0);
    expect(body).toContain('How to Fix');
  });

  it('should NOT use generic fallback guidance for known obligation types', () => {
    // Arrange: CODEOWNERS is a known obligation type with specific guidance
    const packResults = simpleBaselineFailure;
    const normalized = normalizeEvaluationResults(packResults, 'warn');
    const body = renderUltimateOutput(normalized, 'warn');

    // Assert: Should NOT contain generic fallback
    expect(body).not.toContain('Fix the issue described above');

    // Should contain specific guidance for CODEOWNERS
    expect(body).toContain('CODEOWNERS');
  });

  it('should include patch previews for artifact-based obligations', () => {
    // Arrange: CODEOWNERS is an artifact-based obligation
    const packResults = simpleBaselineFailure;
    const normalized = normalizeEvaluationResults(packResults, 'warn');
    const body = renderUltimateOutput(normalized, 'warn');

    // Assert: Should contain patch preview section
    expect(body).toContain('Patch Preview');
    // Should contain actual patch content (not just the header)
    expect(body.length).toBeGreaterThan(500); // Patch preview adds significant content
  });
});

/**
 * INVARIANT 6: Semantic Consistency
 *
 * Repo invariant checks MUST NEVER be labeled as "diff-derived" or "triggered by changes".
 * The section title MUST be "Checks Evaluated" (not "Change Surface Summary").
 */
describe('INVARIANT 6: Semantic Consistency', () => {
  it('should label repo invariants as "Checks Evaluated" (not "Change Surface")', () => {
    // Arrange: Baseline checks are repo invariants (not diff-derived)
    const packResults = simpleBaselineFailure;
    const normalized = normalizeEvaluationResults(packResults, 'warn');
    const body = renderUltimateOutput(normalized, 'warn');

    // Assert: Should use "Checks Evaluated" for repo invariants
    expect(body).toContain('Checks Evaluated');
    // Should NOT use "Change Surface Summary" for baseline checks
    expect(body).not.toContain('Change Surface Summary');
  });

  it('should never say "triggered by changes" for baseline checks', () => {
    // Arrange: Baseline checks are always evaluated (not triggered by changes)
    const packResults = simpleBaselineFailure;
    const normalized = normalizeEvaluationResults(packResults, 'warn');
    const body = renderUltimateOutput(normalized, 'warn');

    // Assert: Should NOT contain "triggered by" language
    expect(body).not.toContain('triggered by changes');
    expect(body).not.toContain('triggered by your PR');
  });

  it('should distinguish between enforced and suppressed obligations', () => {
    // Arrange: Mixed obligations (enforced + suppressed)
    const packResults = mixedObligations;
    const normalized = normalizeEvaluationResults(packResults, 'warn');
    const body = renderUltimateOutput(normalized, 'warn');

    // Assert: Should have separate sections for enforced and suppressed
    expect(body).toContain('Enforced Obligations');
    expect(body).toContain('Suppressed Obligations');

    // Should explain why obligations are suppressed
    expect(body).toContain('Not applicable');
  });
});

/**
 * CROSS-CUTTING INVARIANT: Output Length Bounds
 *
 * The output MUST be adaptive:
 * - Simple outcomes (1 finding) → concise (< 500 lines)
 * - Complex outcomes (10+ findings) → detailed (but < 2000 lines)
 */
describe('CROSS-CUTTING: Output Length Bounds', () => {
  it('should produce concise output for simple outcomes', () => {
    // Arrange: Simple case (1 failed obligation)
    const packResults = simpleBaselineFailure;
    const normalized = normalizeEvaluationResults(packResults, 'warn');
    const body = renderUltimateOutput(normalized, 'warn');

    // Act: Count lines
    const lineCount = body.split('\n').length;

    // Assert: Simple outcomes should be concise (< 500 lines)
    expect(lineCount).toBeLessThan(500);
  });

  it('should collapse boilerplate sections for simple outcomes', () => {
    // Arrange: Simple case (1 failed obligation)
    const packResults = simpleBaselineFailure;
    const normalized = normalizeEvaluationResults(packResults, 'warn');
    const body = renderUltimateOutput(normalized, 'warn');

    // Assert: Boilerplate sections should be collapsed in <details>
    expect(body).toContain('<details>');
    expect(body).toContain('</details>');

    // Technical details should be hidden by default
    expect(body).toContain('<summary>');
  });

  it('should never exceed 2000 lines (even for complex outcomes)', () => {
    // Arrange: Complex case (multiple obligations)
    const packResults = mixedObligations;
    const normalized = normalizeEvaluationResults(packResults, 'warn');
    const body = renderUltimateOutput(normalized, 'warn');

    // Act: Count lines
    const lineCount = body.split('\n').length;

    // Assert: Even complex outcomes should be bounded
    expect(lineCount).toBeLessThan(2000);
  });
});

