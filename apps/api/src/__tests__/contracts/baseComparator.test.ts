/**
 * Unit tests for BaseComparator
 */

import { describe, it, expect } from 'vitest';
import { BaseComparator, CreateFindingParams } from '../../services/contracts/comparators/base.js';
import type {
  Invariant,
  ArtifactSnapshot,
  IntegrityFinding,
  ComparatorInput,
} from '../../services/contracts/types.js';

// ======================================================================
// MOCK COMPARATOR (for testing abstract class)
// ======================================================================

class MockComparator extends BaseComparator {
  readonly comparatorType = 'mock_comparator';
  readonly supportedArtifactTypes = ['openapi', 'confluence_page'];
  
  canCompare(invariant: Invariant, snapshots: ArtifactSnapshot[]): boolean {
    return invariant.comparatorType === this.comparatorType;
  }
  
  extractData(snapshot: ArtifactSnapshot): any {
    return snapshot.extract;
  }
  
  async performComparison(
    left: any,
    right: any,
    input: ComparatorInput
  ): Promise<IntegrityFinding[]> {
    // Mock: return empty findings
    return [];
  }
}

// ======================================================================
// TEST FIXTURES
// ======================================================================

const mockInvariant: Invariant = {
  invariantId: 'inv-123',
  name: 'Test Invariant',
  enabled: true,
  severity: 'high',
  comparatorType: 'mock_comparator',
};

const mockLeftSnapshot: ArtifactSnapshot = {
  workspaceId: 'ws-123',
  id: 'snap-left',
  contractId: 'contract-123',
  artifactType: 'openapi',
  artifactRef: { system: 'github', locator: 'repo/openapi.yaml', role: 'primary' },
  version: { type: 'git_sha', value: 'abc123', capturedAt: new Date() },
  extract: { endpoints: [] },
  extractSchema: 'openapi_v1',
  triggeredBy: { signalEventId: 'signal-123' },
  ttlDays: 30,
  compressed: false,
  sizeBytes: 1024,
  createdAt: new Date(),
};

const mockRightSnapshot: ArtifactSnapshot = {
  ...mockLeftSnapshot,
  id: 'snap-right',
  artifactType: 'confluence_page',
  artifactRef: { system: 'confluence', locator: 'page-123', role: 'secondary' },
};

const mockContext = {
  workspaceId: 'ws-123',
  contractId: 'contract-123',
  signalEventId: 'signal-123',
  service: 'api-service',
  repo: 'acme/api',
};

// ======================================================================
// TESTS
// ======================================================================

describe('BaseComparator', () => {
  describe('compare() - Template Method', () => {
    it('should successfully compare when invariant matches', async () => {
      const comparator = new MockComparator();
      const input: ComparatorInput = {
        invariant: mockInvariant,
        leftSnapshot: mockLeftSnapshot,
        rightSnapshot: mockRightSnapshot,
        context: mockContext,
      };
      
      const result = await comparator.compare(input);
      
      expect(result.invariantId).toBe('inv-123');
      expect(result.evaluated).toBe(true);
      expect(result.findings).toEqual([]);
      expect(result.coverage.completeness).toBe(1.0);
    });
    
    it('should skip when invariant does not match', async () => {
      const comparator = new MockComparator();
      const input: ComparatorInput = {
        invariant: { ...mockInvariant, comparatorType: 'different_comparator' },
        leftSnapshot: mockLeftSnapshot,
        rightSnapshot: mockRightSnapshot,
        context: mockContext,
      };
      
      const result = await comparator.compare(input);
      
      expect(result.evaluated).toBe(false);
      expect(result.skippedReason).toBe('not_applicable');
      expect(result.findings).toEqual([]);
    });
    
    it('should throw when invariant is disabled', async () => {
      const comparator = new MockComparator();
      const input: ComparatorInput = {
        invariant: { ...mockInvariant, enabled: false },
        leftSnapshot: mockLeftSnapshot,
        rightSnapshot: mockRightSnapshot,
        context: mockContext,
      };
      
      await expect(comparator.compare(input)).rejects.toThrow('Invariant is disabled');
    });
    
    it('should throw when snapshots are missing', async () => {
      const comparator = new MockComparator();
      const input: ComparatorInput = {
        invariant: mockInvariant,
        leftSnapshot: null as any,
        rightSnapshot: mockRightSnapshot,
        context: mockContext,
      };
      
      await expect(comparator.compare(input)).rejects.toThrow('Both snapshots are required');
    });
  });
  
  describe('calculateConfidence()', () => {
    it('should return 0 for empty evidence', () => {
      const comparator = new MockComparator();
      const confidence = (comparator as any).calculateConfidence([]);
      expect(confidence).toBe(0);
    });

    it('should calculate confidence for exact matches', () => {
      const comparator = new MockComparator();
      const evidence = [
        { kind: 'endpoint_exact_match', leftValue: 'a', rightValue: 'a', pointers: {} },
        { kind: 'schema_exact_match', leftValue: 'b', rightValue: 'b', pointers: {} },
      ];
      const confidence = (comparator as any).calculateConfidence(evidence);
      expect(confidence).toBe(0.4); // 2 * 0.2
    });

    it('should calculate confidence for fuzzy matches', () => {
      const comparator = new MockComparator();
      const evidence = [
        { kind: 'endpoint_fuzzy_match', leftValue: 'a', rightValue: 'A', pointers: {} },
      ];
      const confidence = (comparator as any).calculateConfidence(evidence);
      expect(confidence).toBe(0.1);
    });

    it('should clamp confidence to 1.0', () => {
      const comparator = new MockComparator();
      const evidence = Array(10).fill({ kind: 'endpoint_exact_match', leftValue: 'a', rightValue: 'a', pointers: {} });
      const confidence = (comparator as any).calculateConfidence(evidence);
      expect(confidence).toBe(1.0); // Clamped
    });
  });

  describe('calculateImpact()', () => {
    it('should calculate base impact from severity', () => {
      const comparator = new MockComparator();
      expect((comparator as any).calculateImpact('critical', [])).toBe(1.0);
      expect((comparator as any).calculateImpact('high', [])).toBe(0.8);
      expect((comparator as any).calculateImpact('medium', [])).toBe(0.5);
      expect((comparator as any).calculateImpact('low', [])).toBe(0.2);
    });

    it('should boost impact for more evidence', () => {
      const comparator = new MockComparator();
      const evidence = Array(4).fill({ kind: 'endpoint_missing', leftValue: 'a', rightValue: null, pointers: {} });
      const impact = (comparator as any).calculateImpact('medium', evidence);
      expect(impact).toBe(0.7); // 0.5 + (4 * 0.05)
    });

    it('should boost impact for breaking changes', () => {
      const comparator = new MockComparator();
      const evidence = [{ kind: 'endpoint_breaking_change', leftValue: 'a', rightValue: 'b', pointers: {} }];
      const impact = (comparator as any).calculateImpact('medium', evidence);
      expect(impact).toBe(0.75); // 0.5 + 0.05 + 0.2
    });
  });

  describe('determineBand()', () => {
    it('should return fail for high confidence + critical severity', () => {
      const comparator = new MockComparator();
      const band = (comparator as any).determineBand(0.9, 0.5, 'critical');
      expect(band).toBe('fail');
    });

    it('should return fail for high confidence + high impact', () => {
      const comparator = new MockComparator();
      const band = (comparator as any).determineBand(0.9, 0.9, 'medium');
      expect(band).toBe('fail');
    });

    it('should return warn for medium confidence + high severity', () => {
      const comparator = new MockComparator();
      const band = (comparator as any).determineBand(0.7, 0.4, 'high');
      expect(band).toBe('warn');
    });

    it('should return pass for low confidence', () => {
      const comparator = new MockComparator();
      const band = (comparator as any).determineBand(0.5, 0.9, 'critical');
      expect(band).toBe('pass');
    });
  });

  describe('determineRecommendedAction()', () => {
    it('should return block_merge for fail + critical', () => {
      const comparator = new MockComparator();
      const action = (comparator as any).determineRecommendedAction('fail', 'critical');
      expect(action).toBe('block_merge');
    });

    it('should return create_patch_candidate for fail + non-critical', () => {
      const comparator = new MockComparator();
      const action = (comparator as any).determineRecommendedAction('fail', 'high');
      expect(action).toBe('create_patch_candidate');
    });

    it('should return create_patch_candidate for warn + high', () => {
      const comparator = new MockComparator();
      const action = (comparator as any).determineRecommendedAction('warn', 'high');
      expect(action).toBe('create_patch_candidate');
    });

    it('should return notify for warn + non-high', () => {
      const comparator = new MockComparator();
      const action = (comparator as any).determineRecommendedAction('warn', 'medium');
      expect(action).toBe('notify');
    });

    it('should return no_action for pass', () => {
      const comparator = new MockComparator();
      const action = (comparator as any).determineRecommendedAction('pass', 'low');
      expect(action).toBe('no_action');
    });
  });

  describe('routeToOwners()', () => {
    it('should route to service_owner when service is provided', () => {
      const comparator = new MockComparator();
      const routing = (comparator as any).routeToOwners({ service: 'api-service' });
      expect(routing.method).toBe('service_owner');
      expect(routing.owners).toEqual(['api-service']);
    });

    it('should route to codeowners when repo is provided', () => {
      const comparator = new MockComparator();
      const routing = (comparator as any).routeToOwners({ repo: 'acme/api' });
      expect(routing.method).toBe('codeowners');
      expect(routing.owners).toEqual(['acme/api']);
    });

    it('should fallback when no context is provided', () => {
      const comparator = new MockComparator();
      const routing = (comparator as any).routeToOwners({});
      expect(routing.method).toBe('fallback');
      expect(routing.owners).toEqual([]);
    });
  });

  describe('extractDomains()', () => {
    it('should extract domains from evidence kinds', () => {
      const comparator = new MockComparator();
      const evidence = [
        { kind: 'endpoint_missing', leftValue: 'a', rightValue: null, pointers: {} },
        { kind: 'schema_mismatch', leftValue: 'b', rightValue: 'c', pointers: {} },
        { kind: 'endpoint_deprecated', leftValue: 'd', rightValue: null, pointers: {} },
      ];
      const domains = (comparator as any).extractDomains(evidence);
      expect(domains).toEqual(['endpoint', 'schema']);
    });

    it('should return empty array for empty evidence', () => {
      const comparator = new MockComparator();
      const domains = (comparator as any).extractDomains([]);
      expect(domains).toEqual([]);
    });
  });

  describe('createFinding()', () => {
    it('should create a complete IntegrityFinding', () => {
      const comparator = new MockComparator();
      const params: CreateFindingParams = {
        workspaceId: 'ws-123',
        contractId: 'contract-123',
        invariantId: 'inv-123',
        driftType: 'instruction',
        severity: 'high',
        compared: {
          left: { artifact: { type: 'openapi' }, snapshotId: 'snap-left' },
          right: { artifact: { type: 'confluence_page' }, snapshotId: 'snap-right' },
        },
        evidence: [
          { kind: 'endpoint_missing', leftValue: '/api/users', rightValue: null, pointers: {} },
        ],
        context: {
          service: 'api-service',
          repo: 'acme/api',
          signalEventId: 'signal-123',
        },
      };

      const finding = (comparator as any).createFinding(params);

      expect(finding.workspaceId).toBe('ws-123');
      expect(finding.contractId).toBe('contract-123');
      expect(finding.invariantId).toBe('inv-123');
      expect(finding.driftType).toBe('instruction');
      expect(finding.severity).toBe('high');
      expect(finding.confidence).toBeGreaterThan(0);
      expect(finding.impact).toBeGreaterThan(0);
      expect(finding.band).toBeDefined();
      expect(finding.recommendedAction).toBeDefined();
      expect(finding.ownerRouting.method).toBe('service_owner');
      expect(finding.domains).toEqual(['endpoint']);
      expect(finding.id).toBeDefined();
      expect(finding.createdAt).toBeInstanceOf(Date);
    });
  });
});

