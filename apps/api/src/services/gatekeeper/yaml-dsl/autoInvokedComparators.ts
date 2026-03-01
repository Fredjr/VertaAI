/**
 * AUTO-INVOKED COMPARATORS
 * 
 * This module handles comparators that run automatically on EVERY PR,
 * regardless of policy pack configuration.
 * 
 * These comparators enforce baseline invariants:
 * - Cross-artifact consistency (Track A Task 2)
 * - Safety checks (secrets, hardcoded values, etc.)
 * 
 * ARCHITECTURE NOTE:
 * This is implemented as a separate module (not a class method) to avoid
 * TypeScript compiler bugs that generate malformed JavaScript when using
 * private async methods with generic return types.
 */

import type { PRContext } from './types.js';
import type { ComparatorId } from './comparators/types.js';
import { comparatorRegistry } from './comparators/registry.js';

/**
 * Finding structure for PackEvaluator
 * Must match the Finding interface in packEvaluator.ts
 */
interface AutoInvokedFinding {
  ruleId: string;
  ruleName: string;
  obligationIndex: number;
  comparatorResult: any;
  decisionOnFail: 'block' | 'warn' | 'info';
  evaluationStatus: 'evaluated' | 'not_evaluable';
}

/**
 * Configuration for auto-invoked comparators
 */
const AUTO_INVOKED_COMPARATORS = [
  // Cross-Artifact Comparators (Track A Task 2)
  // These detect drift between related artifacts
  {
    id: 'OPENAPI_CODE_PARITY' as ComparatorId,
    category: 'cross-artifact',
    decisionOnFail: 'warn' as const,
  },
  {
    id: 'SCHEMA_MIGRATION_PARITY' as ComparatorId,
    category: 'cross-artifact',
    decisionOnFail: 'warn' as const,
  },
  {
    id: 'CONTRACT_IMPLEMENTATION_PARITY' as ComparatorId,
    category: 'cross-artifact',
    decisionOnFail: 'warn' as const,
  },
  {
    id: 'DOC_CODE_PARITY' as ComparatorId,
    category: 'cross-artifact',
    decisionOnFail: 'warn' as const,
  },
  {
    id: 'TEST_IMPLEMENTATION_PARITY' as ComparatorId,
    category: 'cross-artifact',
    decisionOnFail: 'warn' as const,
  },

  // 11.1: Additional Cross-Artifact Comparators (Full Acceptance Criteria)
  {
    id: 'DASHBOARD_SERVICE_PARITY' as ComparatorId,
    category: 'cross-artifact',
    decisionOnFail: 'warn' as const,
  },
  {
    id: 'RUNBOOK_OWNERSHIP_PARITY' as ComparatorId,
    category: 'cross-artifact',
    decisionOnFail: 'warn' as const,
  },
  {
    id: 'SLO_THRESHOLD_PARITY' as ComparatorId,
    category: 'cross-artifact',
    decisionOnFail: 'warn' as const,
  },

  // Safety Comparators
  // These enforce critical security/quality checks
  {
    id: 'NO_SECRETS_IN_DIFF' as ComparatorId,
    category: 'safety',
    decisionOnFail: 'block' as const,
  },
];

/**
 * Run all auto-invoked comparators and return findings
 * 
 * This function is called by PackEvaluator.evaluate() BEFORE processing
 * policy pack rules to ensure baseline checks always run.
 * 
 * @param context - PR context with all necessary data
 * @param usedComparators - Set to track which comparators have been invoked
 * @returns Array of findings from failed/unknown comparators
 */
export async function runAutoInvokedComparators(
  context: PRContext,
  usedComparators: Set<ComparatorId>
) {
  const findings: AutoInvokedFinding[] = [];
  const registry = comparatorRegistry;

  console.log('[AutoInvoked] Running auto-invoked comparators...');

  for (const config of AUTO_INVOKED_COMPARATORS) {
    const { id, category, decisionOnFail } = config;

    // Skip if comparator not registered
    if (!registry.has(id)) {
      console.log(`[AutoInvoked] Comparator ${id} not registered, skipping`);
      continue;
    }

    try {
      // Track usage for fingerprinting
      usedComparators.add(id);

      // Evaluate comparator with empty params
      const result = await registry.evaluate(id, context, {});

      // Create finding if failed or unknown
      if (result.status === 'fail' || result.status === 'unknown') {
        const finding: AutoInvokedFinding = {
          ruleId: `auto-invoked-${id.toLowerCase()}`,  // CRITICAL: Must start with 'auto-invoked-' for graph builder
          ruleName: `${category === 'safety' ? 'Safety' : 'Cross-Artifact'} Check: ${id}`,
          obligationIndex: -1,
          comparatorResult: result,
          decisionOnFail,
          evaluationStatus: 'evaluated',
        };

        findings.push(finding);
        console.log(`[AutoInvoked] Finding: ${id} - ${result.status} (${decisionOnFail})`);
      } else if (result.status === 'pass') {
        console.log(`[AutoInvoked] Passed: ${id}`);
      }
    } catch (error: any) {
      console.error(`[AutoInvoked] Error running ${id}:`, error.message);
      // Soft-fail: continue with other comparators
    }
  }

  console.log(`[AutoInvoked] Completed: ${findings.length} findings`);
  return findings;
}

