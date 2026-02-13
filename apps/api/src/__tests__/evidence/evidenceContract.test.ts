/**
 * Evidence Contract Mapper Tests
 * 
 * Tests the mapping from full EvidenceBundle to minimal LLM-facing EvidenceContract
 */

import { 
  mapEvidenceBundleToContract, 
  validateEvidenceContract,
  type EvidenceContract 
} from '../../services/evidence/evidenceContract.js';
import type { EvidenceBundle, TypedDelta } from '../../services/evidence/types.js';

describe('Evidence Contract Mapper', () => {
  const createMockBundle = (overrides?: Partial<EvidenceBundle>): EvidenceBundle => ({
    bundleId: 'bundle-123',
    workspaceId: 'workspace-456',
    driftCandidateId: 'drift-789',
    createdAt: '2024-01-15T10:00:00Z',
    sourceEvidence: {
      sourceType: 'github_pr',
      sourceId: 'pr-101',
      timestamp: '2024-01-15T09:00:00Z',
      artifacts: {
        prDiff: {
          excerpt: 'diff content',
          linesAdded: 10,
          linesRemoved: 5,
          filesChanged: ['file1.ts'],
          maxChars: 5000,
          lineBounded: true,
        },
      },
    },
    targetEvidence: {
      docSystem: 'confluence',
      docId: 'doc-202',
      docTitle: 'Service Runbook',
      docUrl: 'https://confluence.example.com/doc-202',
      surface: 'runbook',
      claims: [
        {
          claimType: 'instruction_block',
          label: 'Deployment Steps',
          snippet: 'kubectl apply -f deployment.yaml',
          location: { startLine: 10, endLine: 15, section: 'Deployment' },
          confidence: 0.9,
          extractionMethod: 'markdown_structure',
        },
      ],
    },
    assessment: {
      impactScore: 0.75,
      impactBand: 'high',
      firedRules: ['rule1', 'rule2'],
      consequenceText: 'High impact change',
      blastRadius: {
        services: ['service-a', 'service-b'],
        teams: ['team-1'],
        systems: ['system-x'],
      },
      riskFactors: ['production-impact', 'multi-service'],
      typedDeltas: [
        {
          artifactType: 'command',
          action: 'changed',
          sourceValue: 'kubectl apply -f new-deployment.yaml',
          docValue: 'kubectl apply -f deployment.yaml',
          section: 'Deployment',
          confidence: 0.85,
        },
      ],
    },
    fingerprints: {
      strict: 'strict-fp',
      medium: 'medium-fp',
      broad: 'broad-fp',
    },
    version: '1.0.0',
    schemaVersion: '1.0.0',
    ...overrides,
  });

  test('maps complete EvidenceBundle to EvidenceContract', () => {
    const bundle = createMockBundle();
    const contract = mapEvidenceBundleToContract(bundle);

    expect(contract.version).toBe('1.0');
    expect(contract.signal.sourceType).toBe('github_pr');
    expect(contract.signal.workspaceId).toBe('workspace-456');
    expect(contract.signal.triggeringEvent).toBe('pr-101');
    expect(contract.signal.timestamp).toBe('2024-01-15T09:00:00Z');

    expect(contract.typedDeltas).toHaveLength(1);
    expect(contract.typedDeltas[0].artifactType).toBe('command');
    expect(contract.typedDeltas[0].action).toBe('changed');

    expect(contract.docContext.system).toBe('confluence');
    expect(contract.docContext.title).toBe('Service Runbook');
    expect(contract.docContext.url).toBe('https://confluence.example.com/doc-202');
    expect(contract.docContext.relevantSections).toContain('Deployment');

    expect(contract.assessment.impactBand).toBe('high');
    expect(contract.assessment.riskFactors).toEqual(['production-impact', 'multi-service']);
    expect(contract.assessment.blastRadius.services).toEqual(['service-a', 'service-b']);
  });

  test('handles bundle with no typed deltas', () => {
    const bundle = createMockBundle({
      assessment: {
        impactScore: 0.5,
        impactBand: 'medium',
        firedRules: [],
        consequenceText: 'Medium impact',
        blastRadius: { services: [], teams: [], systems: [] },
        // No typedDeltas field
      },
    });

    const contract = mapEvidenceBundleToContract(bundle);

    expect(contract.typedDeltas).toEqual([]);
  });

  test('truncates typed deltas to maxTypedDeltas limit', () => {
    const manyDeltas: TypedDelta[] = Array.from({ length: 100 }, (_, i) => ({
      artifactType: 'command',
      action: 'added',
      sourceValue: `command-${i}`,
      confidence: Math.random(),
    }));

    const bundle = createMockBundle({
      assessment: {
        impactScore: 0.8,
        impactBand: 'high',
        firedRules: [],
        consequenceText: 'Many changes',
        blastRadius: { services: [], teams: [], systems: [] },
        typedDeltas: manyDeltas,
      },
    });

    const contract = mapEvidenceBundleToContract(bundle, { maxTypedDeltas: 10 });

    expect(contract.typedDeltas).toHaveLength(10);
  });

  test('prioritizes high-confidence deltas when truncating', () => {
    const deltas: TypedDelta[] = [
      { artifactType: 'command', action: 'added', sourceValue: 'low', confidence: 0.3 },
      { artifactType: 'command', action: 'added', sourceValue: 'high', confidence: 0.9 },
      { artifactType: 'command', action: 'added', sourceValue: 'medium', confidence: 0.6 },
    ];

    const bundle = createMockBundle({
      assessment: {
        impactScore: 0.7,
        impactBand: 'high',
        firedRules: [],
        consequenceText: 'Changes',
        blastRadius: { services: [], teams: [], systems: [] },
        typedDeltas: deltas,
      },
    });

    const contract = mapEvidenceBundleToContract(bundle, { maxTypedDeltas: 2 });

    expect(contract.typedDeltas).toHaveLength(2);
    expect(contract.typedDeltas[0].sourceValue).toBe('high');
    expect(contract.typedDeltas[1].sourceValue).toBe('medium');
  });

  test('validates valid contract', () => {
    const bundle = createMockBundle();
    const contract = mapEvidenceBundleToContract(bundle);
    const validation = validateEvidenceContract(contract);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  test('validates invalid contract - missing fields', () => {
    const invalidContract = {
      version: '1.0',
      signal: {},
      typedDeltas: [],
      docContext: {},
      assessment: {},
    } as unknown as EvidenceContract;

    const validation = validateEvidenceContract(invalidContract);

    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  test('produces stable output for same input', () => {
    const bundle = createMockBundle();
    const contract1 = mapEvidenceBundleToContract(bundle);
    const contract2 = mapEvidenceBundleToContract(bundle);

    expect(contract1).toEqual(contract2);
  });
});

