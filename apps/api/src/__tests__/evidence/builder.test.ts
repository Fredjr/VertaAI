// apps/api/src/__tests__/evidence/builder.test.ts
// Phase 1 implementation - comprehensive unit tests for buildEvidenceBundle()

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildEvidenceBundle } from '../../services/evidence/builder.js';
import type { BuildEvidenceBundleArgs } from '../../services/evidence/types.js';

// Mock dependencies
vi.mock('../../services/evidence/sourceBuilders.js');
vi.mock('../../services/evidence/docClaimExtractor.js');
vi.mock('../../services/evidence/impactAssessment.js');
vi.mock('../../services/evidence/fingerprints.js');

import { buildSourceEvidence } from '../../services/evidence/sourceBuilders.js';
import { extractDocClaims } from '../../services/evidence/docClaimExtractor.js';
import { computeImpactAssessment } from '../../services/evidence/impactAssessment.js';
import { generateFingerprints } from '../../services/evidence/fingerprints.js';

const mockBuildSourceEvidence = vi.mocked(buildSourceEvidence);
const mockExtractDocClaims = vi.mocked(extractDocClaims);
const mockComputeImpactAssessment = vi.mocked(computeImpactAssessment);
const mockGenerateFingerprints = vi.mocked(generateFingerprints);

describe('buildEvidenceBundle', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup default mock implementations
    mockBuildSourceEvidence.mockResolvedValue({
      sourceType: 'github_pr',
      sourceId: 'pr-123',
      timestamp: '2026-02-08T10:00:00Z',
      artifacts: {
        prDiff: {
          excerpt: 'diff content',
          linesAdded: 10,
          linesRemoved: 5,
          filesChanged: ['file1.ts', 'file2.ts'],
          maxChars: 1000,
          lineBounded: true
        }
      }
    });

    mockExtractDocClaims.mockResolvedValue([
      {
        claimType: 'instruction_block',
        label: 'Deployment Steps',
        snippet: 'Deploy using kubectl apply',
        location: { startLine: 15, endLine: 20, section: 'Deployment Steps' },
        confidence: 0.9,
        extractionMethod: 'pattern_match'
      }
    ]);

    mockComputeImpactAssessment.mockResolvedValue({
      impactScore: 0.75,
      impactBand: 'high',
      firedRules: ['instruction_mismatch', 'deployment_tool_change'],
      consequenceText: 'Deployment instructions are outdated. This could lead to failed deployments.',
      blastRadius: {
        services: ['api-service', 'worker-service'],
        teams: ['platform-team'],
        systems: ['kubernetes']
      }
    });

    mockGenerateFingerprints.mockReturnValue({
      strict: 'strict-fingerprint-hash',
      medium: 'medium-fingerprint-hash',
      broad: 'broad-fingerprint-hash'
    });
  });

  it('should successfully build evidence bundle with all components', async () => {
    const args: BuildEvidenceBundleArgs = {
      driftCandidate: {
        workspaceId: 'ws-123',
        id: 'drift-456',
        driftType: 'instruction',
        state: 'BASELINE_CHECKED'
      } as any,
      signalEvent: {
        workspaceId: 'ws-123',
        id: 'signal-789',
        sourceType: 'github_pr',
        rawPayload: { pr: { number: 123 } }
      } as any,
      docContext: {
        content: 'Documentation content',
        docSystem: 'confluence',
        docId: 'doc-123',
        docTitle: 'Deployment Guide',
        docUrl: 'https://docs.example.com/deployment'
      } as any,
      parserArtifacts: {}
    };

    const result = await buildEvidenceBundle(args);

    expect(result.success).toBe(true);
    expect(result.bundle).toBeDefined();
    
    if (result.bundle) {
      expect(result.bundle.workspaceId).toBe('ws-123');
      expect(result.bundle.driftCandidateId).toBe('drift-456');
      expect(result.bundle.sourceEvidence.sourceType).toBe('github_pr');
      expect(result.bundle.targetEvidence.claims).toHaveLength(1);
      expect(result.bundle.assessment.impactBand).toBe('high');
      expect(result.bundle.fingerprints.strict).toBe('strict-fingerprint-hash');
      expect(result.bundle.version).toBe('1.0.0');
      expect(result.bundle.schemaVersion).toBe('1.0.0');
    }
  });

  it('should return error when driftCandidate is missing', async () => {
    const args: BuildEvidenceBundleArgs = {
      driftCandidate: null as any,
      signalEvent: {} as any,
      docContext: {} as any,
      parserArtifacts: {}
    };

    const result = await buildEvidenceBundle(args);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('driftCandidate');
  });

  it('should return error when signalEvent is missing', async () => {
    const args: BuildEvidenceBundleArgs = {
      driftCandidate: { workspaceId: 'ws-123', id: 'drift-456' } as any,
      signalEvent: null as any,
      docContext: {} as any,
      parserArtifacts: {}
    };

    const result = await buildEvidenceBundle(args);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('signalEvent');
  });

  it('should call all builder functions with correct arguments', async () => {
    const args: BuildEvidenceBundleArgs = {
      driftCandidate: {
        workspaceId: 'ws-123',
        id: 'drift-456',
        driftType: 'instruction'
      } as any,
      signalEvent: {
        sourceType: 'github_pr'
      } as any,
      docContext: {
        content: 'doc content',
        docSystem: 'confluence'
      } as any,
      parserArtifacts: {}
    };

    await buildEvidenceBundle(args);

    expect(mockBuildSourceEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        signalEvent: args.signalEvent,
        parserArtifacts: args.parserArtifacts
      })
    );

    expect(mockExtractDocClaims).toHaveBeenCalledWith(
      expect.objectContaining({
        docContext: args.docContext,
        driftType: 'instruction',
        docSystem: 'confluence'
      })
    );
  });
});

