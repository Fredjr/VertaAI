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
  });
});

