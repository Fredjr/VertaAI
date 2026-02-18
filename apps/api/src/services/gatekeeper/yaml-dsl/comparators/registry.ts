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

    // CRITICAL FIX (Gap #2): Create fresh AbortController per comparator
    // Prevents cascading aborts after first timeout
    const comparatorAbortController = new AbortController();
    const scopedContext: PRContext = {
      ...context,
      abortController: comparatorAbortController,
    };

    let timeoutId: NodeJS.Timeout | null = null;

    try {
      // Apply per-comparator timeout
      const timeoutMs = context.budgets.perComparatorTimeoutMs;

      const timeoutPromise = new Promise<ComparatorResult>((resolve) => {
        timeoutId = setTimeout(() => {
          // Abort only this comparator's work
          comparatorAbortController.abort();

          resolve({
            comparatorId,
            status: 'unknown',
            evidence: [],
            reasonCode: FindingCode.TIMEOUT_EXCEEDED,
            message: `Comparator timed out after ${timeoutMs}ms`,
          });
        }, timeoutMs);
      });

      const result = await Promise.race([
        comparator.evaluate(scopedContext, params),
        timeoutPromise,
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
    } finally {
      // CRITICAL FIX (Gap #2): Clear timeout to prevent timer leak
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
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

