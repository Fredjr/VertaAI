/**
 * Comparator Registry
 * 
 * Provides a plugin architecture for comparators, enabling:
 * - Dynamic registration of new comparators
 * - Discovery of available comparators
 * - Automatic selection of appropriate comparator for an invariant
 * 
 * Design Pattern: Registry + Singleton
 */

import type { IComparator } from './base.js';
import type { Invariant, ArtifactSnapshot } from '../types.js';

// ======================================================================
// INTERFACES
// ======================================================================

/**
 * Metadata about a registered comparator
 */
export interface ComparatorMetadata {
  comparatorType: string;
  supportedArtifactTypes: string[];
  version: string;
}

/**
 * Comparator Registry Interface
 */
export interface IComparatorRegistry {
  /**
   * Register a comparator
   * @throws Error if comparator type is already registered
   */
  register(comparator: IComparator): void;

  /**
   * Get a comparator by type
   * @returns Comparator instance or undefined if not found
   */
  get(type: string): IComparator | undefined;

  /**
   * List all registered comparators
   * @returns Array of comparator metadata
   */
  list(): ComparatorMetadata[];

  /**
   * Find a comparator that can handle the given invariant and snapshots
   * @returns Comparator instance or null if none can handle
   */
  canHandle(invariant: Invariant, snapshots: ArtifactSnapshot[]): IComparator | null;

  /**
   * Check if a comparator type is registered
   */
  has(type: string): boolean;

  /**
   * Unregister a comparator (useful for testing)
   */
  unregister(type: string): boolean;

  /**
   * Clear all registered comparators (useful for testing)
   */
  clear(): void;
}

// ======================================================================
// IMPLEMENTATION
// ======================================================================

/**
 * Default implementation of ComparatorRegistry
 */
class DefaultComparatorRegistry implements IComparatorRegistry {
  private comparators = new Map<string, IComparator>();

  register(comparator: IComparator): void {
    if (this.comparators.has(comparator.comparatorType)) {
      throw new Error(
        `Comparator type '${comparator.comparatorType}' is already registered`
      );
    }
    this.comparators.set(comparator.comparatorType, comparator);
  }

  get(type: string): IComparator | undefined {
    return this.comparators.get(type);
  }

  list(): ComparatorMetadata[] {
    return Array.from(this.comparators.values()).map((comparator) => ({
      comparatorType: comparator.comparatorType,
      supportedArtifactTypes: comparator.supportedArtifactTypes,
      version: comparator.version,
    }));
  }

  canHandle(invariant: Invariant, snapshots: ArtifactSnapshot[]): IComparator | null {
    const comparator = this.get(invariant.comparatorType);
    if (!comparator) {
      return null;
    }
    return comparator.canCompare(invariant, snapshots) ? comparator : null;
  }

  has(type: string): boolean {
    return this.comparators.has(type);
  }

  unregister(type: string): boolean {
    return this.comparators.delete(type);
  }

  clear(): void {
    this.comparators.clear();
  }
}

// ======================================================================
// SINGLETON
// ======================================================================

let registryInstance: IComparatorRegistry | null = null;

/**
 * Get the singleton comparator registry instance
 * Auto-registers built-in comparators on first call
 */
export function getComparatorRegistry(): IComparatorRegistry {
  if (!registryInstance) {
    registryInstance = new DefaultComparatorRegistry();
    // Built-in comparators will auto-register themselves
    // when their modules are imported
  }
  return registryInstance;
}

/**
 * Reset the registry (useful for testing)
 */
export function resetComparatorRegistry(): void {
  registryInstance = null;
}

