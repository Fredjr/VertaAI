/**
 * Comparator Registry
 * Migration Plan v5.0 - Sprint 1, Task 1.2
 */

import type { Comparator, ComparatorResult, PRContext } from './types.js';
import { ComparatorId, FindingCode } from './types.js';

export class ComparatorRegistry {
  private static instance: ComparatorRegistry;
  private comparators: Map<ComparatorId, Comparator> = new Map();

  private constructor() {}

  static getInstance(): ComparatorRegistry {
    if (!ComparatorRegistry.instance) {
      ComparatorRegistry.instance = new ComparatorRegistry();
    }
    return ComparatorRegistry.instance;
  }

  register(comparator: Comparator): void {
    this.comparators.set(comparator.id, comparator);
    console.log(`[ComparatorRegistry] Registered: ${comparator.id} v${comparator.version}`);
  }

  async evaluate(
    comparatorId: ComparatorId,
    context: PRContext,
    params: any
  ): Promise<ComparatorResult> {
    const comparator = this.comparators.get(comparatorId);
    if (!comparator) {
      return {
        comparatorId,
        status: 'unknown',
        evidence: [],
        reasonCode: FindingCode.UNKNOWN_ERROR,
        message: `Comparator ${comparatorId} not found in registry`,
      };
    }

    try {
      // Apply per-comparator timeout
      const timeoutMs = context.budgets.perComparatorTimeoutMs;
      const result = await Promise.race([
        comparator.evaluate(context, params),
        new Promise<ComparatorResult>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), timeoutMs)
        ),
      ]);

      return result;
    } catch (error: any) {
      console.error(`[ComparatorRegistry] Error evaluating ${comparatorId}:`, error);

      // Handle timeout
      if (error.message === 'TIMEOUT_EXCEEDED') {
        return {
          comparatorId,
          status: 'unknown',
          evidence: [],
          reasonCode: FindingCode.TIMEOUT_EXCEEDED,
          message: `Comparator timed out after ${context.budgets.perComparatorTimeoutMs}ms`,
        };
      }

      // Handle rate limit
      if (error.message?.includes('RATE_LIMIT_EXCEEDED')) {
        return {
          comparatorId,
          status: 'unknown',
          evidence: [],
          reasonCode: FindingCode.RATE_LIMIT_EXCEEDED,
          message: `GitHub API rate limit exceeded`,
        };
      }

      // Handle abort
      if (error.message?.includes('ABORTED')) {
        return {
          comparatorId,
          status: 'unknown',
          evidence: [],
          reasonCode: FindingCode.TIMEOUT_EXCEEDED,
          message: `Evaluation cancelled`,
        };
      }

      // Generic error
      return {
        comparatorId,
        status: 'unknown',
        evidence: [],
        reasonCode: FindingCode.UNKNOWN_ERROR,
        message: `Error: ${error.message}`,
      };
    }
  }

  has(comparatorId: ComparatorId): boolean {
    return this.comparators.has(comparatorId);
  }

  list(): ComparatorId[] {
    return Array.from(this.comparators.keys());
  }

  getVersion(comparatorId: ComparatorId): string | undefined {
    return this.comparators.get(comparatorId)?.version;
  }

  getAllVersions(): Record<string, string> {
    const versions: Record<string, string> = {};
    for (const [id, comparator] of this.comparators.entries()) {
      versions[id] = comparator.version;
    }
    return versions;
  }
}

export const comparatorRegistry = ComparatorRegistry.getInstance();

