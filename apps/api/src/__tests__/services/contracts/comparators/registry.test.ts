/**
 * Tests for Comparator Registry
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getComparatorRegistry, resetComparatorRegistry, type IComparatorRegistry } from '../../../../services/contracts/comparators/registry.js';
import type { IComparator } from '../../../../services/contracts/comparators/base.js';
import type { Invariant, ArtifactSnapshot, ComparatorInput, ComparatorResult } from '../../../../services/contracts/types.js';

// ======================================================================
// MOCK COMPARATORS
// ======================================================================

class MockComparatorA implements IComparator {
  readonly comparatorType = 'mock_a';
  readonly supportedArtifactTypes = ['type_a', 'type_b'];
  readonly version = '1.0.0';

  async compare(input: ComparatorInput): Promise<ComparatorResult> {
    return { findings: [], metrics: { duration: 0, comparisonsRun: 0 } };
  }

  canCompare(invariant: Invariant, snapshots: ArtifactSnapshot[]): boolean {
    return invariant.comparatorType === this.comparatorType;
  }
}

class MockComparatorB implements IComparator {
  readonly comparatorType = 'mock_b';
  readonly supportedArtifactTypes = ['type_c'];
  readonly version = '2.0.0';

  async compare(input: ComparatorInput): Promise<ComparatorResult> {
    return { findings: [], metrics: { duration: 0, comparisonsRun: 0 } };
  }

  canCompare(invariant: Invariant, snapshots: ArtifactSnapshot[]): boolean {
    return invariant.comparatorType === this.comparatorType;
  }
}

// ======================================================================
// TESTS
// ======================================================================

describe('ComparatorRegistry', () => {
  let registry: IComparatorRegistry;

  beforeEach(() => {
    resetComparatorRegistry();
    registry = getComparatorRegistry();
  });

  afterEach(() => {
    resetComparatorRegistry();
  });

  describe('register', () => {
    it('should register a comparator', () => {
      const comparator = new MockComparatorA();
      registry.register(comparator);

      expect(registry.has('mock_a')).toBe(true);
      expect(registry.get('mock_a')).toBe(comparator);
    });

    it('should throw error if comparator type is already registered', () => {
      const comparator1 = new MockComparatorA();
      const comparator2 = new MockComparatorA();

      registry.register(comparator1);

      expect(() => registry.register(comparator2)).toThrow(
        "Comparator type 'mock_a' is already registered"
      );
    });

    it('should register multiple different comparators', () => {
      const comparatorA = new MockComparatorA();
      const comparatorB = new MockComparatorB();

      registry.register(comparatorA);
      registry.register(comparatorB);

      expect(registry.has('mock_a')).toBe(true);
      expect(registry.has('mock_b')).toBe(true);
    });
  });

  describe('get', () => {
    it('should return registered comparator', () => {
      const comparator = new MockComparatorA();
      registry.register(comparator);

      const retrieved = registry.get('mock_a');
      expect(retrieved).toBe(comparator);
    });

    it('should return undefined for unregistered comparator', () => {
      const retrieved = registry.get('nonexistent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for registered comparator', () => {
      const comparator = new MockComparatorA();
      registry.register(comparator);

      expect(registry.has('mock_a')).toBe(true);
    });

    it('should return false for unregistered comparator', () => {
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('list', () => {
    it('should return empty array when no comparators registered', () => {
      const list = registry.list();
      expect(list).toEqual([]);
    });

    it('should return metadata for all registered comparators', () => {
      const comparatorA = new MockComparatorA();
      const comparatorB = new MockComparatorB();

      registry.register(comparatorA);
      registry.register(comparatorB);

      const list = registry.list();
      expect(list).toHaveLength(2);
      expect(list).toContainEqual({
        comparatorType: 'mock_a',
        supportedArtifactTypes: ['type_a', 'type_b'],
        version: '1.0.0',
      });
      expect(list).toContainEqual({
        comparatorType: 'mock_b',
        supportedArtifactTypes: ['type_c'],
        version: '2.0.0',
      });
    });
  });

  describe('canHandle', () => {
    it('should return comparator if it can handle the invariant', () => {
      const comparator = new MockComparatorA();
      registry.register(comparator);

      const invariant = { comparatorType: 'mock_a' } as Invariant;
      const snapshots = [] as ArtifactSnapshot[];

      const result = registry.canHandle(invariant, snapshots);
      expect(result).toBe(comparator);
    });

    it('should return null if comparator type not registered', () => {
      const invariant = { comparatorType: 'nonexistent' } as Invariant;
      const snapshots = [] as ArtifactSnapshot[];

      const result = registry.canHandle(invariant, snapshots);
      expect(result).toBeNull();
    });

    it('should return null if comparator cannot handle the invariant', () => {
      const comparator = new MockComparatorA();
      registry.register(comparator);

      // Invariant with different type
      const invariant = { comparatorType: 'mock_b' } as Invariant;
      const snapshots = [] as ArtifactSnapshot[];

      const result = registry.canHandle(invariant, snapshots);
      expect(result).toBeNull();
    });
  });

  describe('unregister', () => {
    it('should unregister a comparator', () => {
      const comparator = new MockComparatorA();
      registry.register(comparator);

      expect(registry.has('mock_a')).toBe(true);

      const result = registry.unregister('mock_a');
      expect(result).toBe(true);
      expect(registry.has('mock_a')).toBe(false);
    });

    it('should return false when unregistering non-existent comparator', () => {
      const result = registry.unregister('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all registered comparators', () => {
      const comparatorA = new MockComparatorA();
      const comparatorB = new MockComparatorB();

      registry.register(comparatorA);
      registry.register(comparatorB);

      expect(registry.list()).toHaveLength(2);

      registry.clear();

      expect(registry.list()).toHaveLength(0);
      expect(registry.has('mock_a')).toBe(false);
      expect(registry.has('mock_b')).toBe(false);
    });
  });

  describe('singleton behavior', () => {
    it('should return same instance on multiple calls', () => {
      const registry1 = getComparatorRegistry();
      const registry2 = getComparatorRegistry();

      expect(registry1).toBe(registry2);
    });

    it('should reset singleton with resetComparatorRegistry', () => {
      const registry1 = getComparatorRegistry();
      const comparator = new MockComparatorA();
      registry1.register(comparator);

      expect(registry1.has('mock_a')).toBe(true);

      resetComparatorRegistry();

      const registry2 = getComparatorRegistry();
      expect(registry2.has('mock_a')).toBe(false);
      expect(registry1).not.toBe(registry2);
    });
  });
});

