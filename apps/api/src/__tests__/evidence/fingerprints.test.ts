// apps/api/src/__tests__/evidence/fingerprints.test.ts
// Phase 1 implementation - comprehensive unit tests for fingerprint generation

import { describe, it, expect } from 'vitest';
import { generateFingerprints, fingerprintsMatch, shouldEscalateFingerprint } from '../../services/evidence/fingerprints.js';
import type { SourceEvidence, TargetEvidence } from '../../services/evidence/types.js';

describe('generateFingerprints', () => {
  const mockSourceEvidence: SourceEvidence = {
    sourceType: 'github_pr',
    sourceId: 'pr-123',
    timestamp: '2026-02-08T10:00:00Z',
    artifacts: {
      prDiff: {
        excerpt: 'Changed deployment from kubectl to helm on port 8080',
        linesAdded: 10,
        linesRemoved: 5,
        filesChanged: ['deploy.sh'],
        maxChars: 1000,
        lineBounded: true
      }
    }
  };

  const mockTargetEvidence: TargetEvidence = {
    docSystem: 'confluence',
    docId: 'doc-123',
    docTitle: 'Deployment Guide',
    docUrl: 'https://docs.example.com/deployment',
    surface: 'runbook',
    claims: [
      {
        claimType: 'instruction_block',
        label: 'Deploy with kubectl',
        snippet: 'Use kubectl apply -f deployment.yaml',
        location: { startLine: 10, endLine: 15 },
        confidence: 0.9,
        extractionMethod: 'pattern_match'
      }
    ],
    baseline: 'kubectl apply'
  };

  it('should generate all three fingerprint levels', () => {
    const fingerprints = generateFingerprints({
      sourceEvidence: mockSourceEvidence,
      targetEvidence: mockTargetEvidence,
      driftType: 'instruction'
    });

    expect(fingerprints.strict).toBeDefined();
    expect(fingerprints.medium).toBeDefined();
    expect(fingerprints.broad).toBeDefined();
    expect(fingerprints.strict).not.toBe(fingerprints.medium);
    expect(fingerprints.medium).not.toBe(fingerprints.broad);
  });

  it('should generate consistent strict fingerprints for same inputs', () => {
    const fp1 = generateFingerprints({
      sourceEvidence: mockSourceEvidence,
      targetEvidence: mockTargetEvidence,
      driftType: 'instruction'
    });

    const fp2 = generateFingerprints({
      sourceEvidence: mockSourceEvidence,
      targetEvidence: mockTargetEvidence,
      driftType: 'instruction'
    });

    expect(fp1.strict).toBe(fp2.strict);
  });

  it('should generate different medium fingerprints for different content', () => {
    // Test that medium fingerprints are different when content differs
    const source1 = {
      ...mockSourceEvidence,
      artifacts: {
        prDiff: {
          ...mockSourceEvidence.artifacts.prDiff!,
          excerpt: 'Changed deployment from kubectl to helm',
          filesChanged: ['deploy.sh']
        }
      }
    };

    const source2 = {
      ...mockSourceEvidence,
      artifacts: {
        prDiff: {
          ...mockSourceEvidence.artifacts.prDiff!,
          excerpt: 'Updated authentication configuration',
          filesChanged: ['auth.ts']
        }
      }
    };

    const fp1 = generateFingerprints({
      sourceEvidence: source1,
      targetEvidence: mockTargetEvidence,
      driftType: 'instruction'
    });

    const fp2 = generateFingerprints({
      sourceEvidence: source2,
      targetEvidence: mockTargetEvidence,
      driftType: 'instruction'
    });

    // Medium fingerprints should be different for different content
    expect(fp1.medium).not.toBe(fp2.medium);
    // But both should be valid medium fingerprints
    expect(fp1.medium).toMatch(/^medium_[a-f0-9]{16}$/);
    expect(fp2.medium).toMatch(/^medium_[a-f0-9]{16}$/);
  });

  it('should generate same broad fingerprint for same source type and surface', () => {
    const differentSource: SourceEvidence = {
      sourceType: 'github_pr',
      sourceId: 'pr-999',
      timestamp: '2026-02-09T10:00:00Z',
      artifacts: {
        prDiff: {
          excerpt: 'Completely different content',
          linesAdded: 100,
          linesRemoved: 50,
          filesChanged: ['other.sh'],
          maxChars: 1000,
          lineBounded: true
        }
      }
    };

    const fp1 = generateFingerprints({
      sourceEvidence: mockSourceEvidence,
      targetEvidence: mockTargetEvidence,
      driftType: 'instruction'
    });

    const fp2 = generateFingerprints({
      sourceEvidence: differentSource,
      targetEvidence: mockTargetEvidence,
      driftType: 'instruction'
    });

    // Broad fingerprints should match (same source type + surface + drift type)
    expect(fp1.broad).toBe(fp2.broad);
  });
});

describe('fingerprintsMatch', () => {
  it('should match strict fingerprints with high confidence', () => {
    const result = fingerprintsMatch(
      { strict: 'abc123', medium: 'def456', broad: 'ghi789' },
      { strict: 'abc123', medium: 'different', broad: 'different' }
    );

    expect(result.matches).toBe(true);
    expect(result.level).toBe('strict');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('should match medium fingerprints with medium confidence', () => {
    const result = fingerprintsMatch(
      { strict: 'abc123', medium: 'def456', broad: 'ghi789' },
      { strict: 'different', medium: 'def456', broad: 'different' }
    );

    expect(result.matches).toBe(true);
    expect(result.level).toBe('medium');
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.confidence).toBeLessThan(0.9);
  });

  it('should match broad fingerprints with low confidence', () => {
    const result = fingerprintsMatch(
      { strict: 'abc123', medium: 'def456', broad: 'ghi789' },
      { strict: 'different', medium: 'different', broad: 'ghi789' }
    );

    expect(result.matches).toBe(true);
    expect(result.level).toBe('broad');
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.confidence).toBeLessThan(0.7);
  });

  it('should not match when no fingerprints match', () => {
    const result = fingerprintsMatch(
      { strict: 'abc123', medium: 'def456', broad: 'ghi789' },
      { strict: 'different1', medium: 'different2', broad: 'different3' }
    );

    expect(result.matches).toBe(false);
    expect(result.level).toBeUndefined();
  });
});

describe('shouldEscalateFingerprint', () => {
  it('should escalate to medium after 3 false positives', () => {
    const result = shouldEscalateFingerprint('strict', 3);
    expect(result.shouldEscalate).toBe(true);
    expect(result.newLevel).toBe('medium');
  });

  it('should escalate to broad after 5 false positives', () => {
    const result = shouldEscalateFingerprint('medium', 5);
    expect(result.shouldEscalate).toBe(true);
    expect(result.newLevel).toBe('broad');
  });

  it('should not escalate broad fingerprints', () => {
    const result = shouldEscalateFingerprint('broad', 10);
    expect(result.shouldEscalate).toBe(false);
    expect(result.newLevel).toBe('broad');
  });

  it('should not escalate with low false positive count', () => {
    const result = shouldEscalateFingerprint('strict', 2);
    expect(result.shouldEscalate).toBe(false);
    expect(result.newLevel).toBe('strict');
  });
});

