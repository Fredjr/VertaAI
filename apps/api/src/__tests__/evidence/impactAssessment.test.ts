// apps/api/src/__tests__/evidence/impactAssessment.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../services/evidence/impactInputs.js');
vi.mock('../../services/evidence/impactRules.js');
vi.mock('../../config/featureFlags.js');

import { computeImpactAssessment } from '../../services/evidence/impactAssessment.js';
import type { SourceEvidence, TargetEvidence } from '../../services/evidence/types.js';
import { buildImpactInputs } from '../../services/evidence/impactInputs.js';
import { computeImpactFromRules } from '../../services/evidence/impactRules.js';
import { isFeatureEnabled } from '../../config/featureFlags.js';

const mockBuildImpactInputs = vi.mocked(buildImpactInputs);
const mockComputeImpactFromRules = vi.mocked(computeImpactFromRules);
const mockIsFeatureEnabled = vi.mocked(isFeatureEnabled);

const baseSourceEvidence: SourceEvidence = {
  sourceType: 'github_pr',
  sourceId: 'pr-123',
  timestamp: '2026-02-08T10:00:00Z',
  artifacts: {
    prDiff: {
      excerpt: 'diff content',
      linesAdded: 1,
      linesRemoved: 1,
      filesChanged: ['apps/api/src/index.ts'],
      maxChars: 1000,
      lineBounded: true,
    },
  },
};

const baseTargetEvidence: TargetEvidence = {
  docSystem: 'confluence',
  docId: 'doc-1',
  docTitle: 'Test Doc',
  surface: 'runbook',
  claims: [
    {
      claimType: 'instruction_block',
      label: 'Deployment',
      snippet: 'deploy using kubectl',
      location: { startLine: 1, endLine: 5 },
      confidence: 0.9,
      extractionMethod: 'pattern_match',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildImpactInputs.mockResolvedValue({} as any);
  mockComputeImpactFromRules.mockReturnValue({
    impactScore: 0.5,
    firedRules: ['matrix_rule'],
    appliedMultipliers: [],
  });
});

describe('computeImpactAssessment typed deltas wiring', () => {
  it('does not attach typed deltas when feature flag is disabled', async () => {
    mockIsFeatureEnabled.mockReturnValue(false);

    const assessment = await computeImpactAssessment({
      sourceEvidence: baseSourceEvidence,
      targetEvidence: baseTargetEvidence,
      driftCandidate: {
        workspaceId: 'ws-1',
        driftType: 'instruction',
        comparisonResult: {
          typedDeltas: [
            {
              artifactType: 'command',
              action: 'missing_in_doc',
              sourceValue: 'kubectl apply',
              confidence: 0.8,
            },
          ],
        },
      },
    } as any);

    expect(assessment.typedDeltas).toBeUndefined();
  });

  it('attaches typed deltas when feature flag is enabled (object comparisonResult)', async () => {
    mockIsFeatureEnabled.mockReturnValue(true);

    const assessment = await computeImpactAssessment({
      sourceEvidence: baseSourceEvidence,
      targetEvidence: baseTargetEvidence,
      driftCandidate: {
        workspaceId: 'ws-1',
        driftType: 'instruction',
        comparisonResult: {
          typedDeltas: [
            {
              artifactType: 'command',
              action: 'missing_in_doc',
              sourceValue: 'kubectl apply',
              confidence: 0.9,
            },
          ],
        },
      },
    } as any);

    expect(assessment.typedDeltas).toBeDefined();
    expect(assessment.typedDeltas?.length).toBe(1);
    expect(assessment.typedDeltas?.[0].artifactType).toBe('command');
  });

  it('parses typed deltas when comparisonResult is a JSON string', async () => {
    mockIsFeatureEnabled.mockReturnValue(true);

    const comparisonResult = JSON.stringify({
      typedDeltas: [
        {
          artifactType: 'tool',
          action: 'missing_in_doc',
          sourceValue: 'helm',
          confidence: 0.7,
        },
      ],
    });

    const assessment = await computeImpactAssessment({
      sourceEvidence: baseSourceEvidence,
      targetEvidence: baseTargetEvidence,
      driftCandidate: {
        workspaceId: 'ws-1',
        driftType: 'instruction',
        comparisonResult,
      },
    } as any);

    expect(assessment.typedDeltas).toBeDefined();
    expect(assessment.typedDeltas?.[0].artifactType).toBe('tool');
    expect(assessment.typedDeltas?.[0].sourceValue).toBe('helm');
  });
});

