/**
 * AUTO-INVOKED COMPARATORS
 *
 * This module handles comparators that run automatically on every PR,
 * subject to per-comparator trigger conditions.
 *
 * These comparators enforce baseline invariants:
 * - Cross-artifact consistency (Track A Task 2)
 * - Safety checks (secrets, hardcoded values, etc.)
 *
 * B2-FIX: Each comparator now declares a trigger — a list of file patterns that
 * must have at least one match for the comparator to run. This prevents expensive
 * GitHub API calls (DASHBOARD_SERVICE_PARITY, RUNBOOK_OWNERSHIP_PARITY, SLO_THRESHOLD_PARITY)
 * from firing on CSS-only or docs-only PRs where they can never produce meaningful findings.
 * Safety and agent-governance comparators use triggerPatterns: null to always run.
 *
 * ARCHITECTURE NOTE:
 * This is implemented as a separate module (not a class method) to avoid
 * TypeScript compiler bugs that generate malformed JavaScript when using
 * private async methods with generic return types.
 */

import { minimatch } from 'minimatch';
import type { PRContext, ComparatorId } from './comparators/types.js';
import { comparatorRegistry } from './comparators/registry.js';

/**
 * Finding structure for PackEvaluator.
 * decisionOnFail is aligned with Finding.decisionOnFail ('pass'|'warn'|'block').
 */
interface AutoInvokedFinding {
  ruleId: string;
  ruleName: string;
  obligationIndex: number;
  comparatorResult: any;
  decisionOnFail: 'pass' | 'warn' | 'block';
  evaluationStatus: 'evaluated' | 'not_evaluable';
}

/**
 * Configuration for a single auto-invoked comparator.
 * triggerPatterns: glob patterns — at least one file must match for the comparator to run.
 *                  null means "always run" (safety / agent-governance comparators).
 */
interface AutoInvokedConfig {
  id: ComparatorId;
  category: string;
  decisionOnFail: 'pass' | 'warn' | 'block';
  triggerPatterns: string[] | null;
}

const AUTO_INVOKED_COMPARATORS: AutoInvokedConfig[] = [
  // ─── Cross-Artifact Comparators (Track A Task 2) ────────────────────────
  {
    id: 'OPENAPI_CODE_PARITY' as ComparatorId,
    category: 'cross-artifact',
    decisionOnFail: 'warn',
    triggerPatterns: ['**/*.yaml', '**/*.yml', '**/*.json', '**/*.ts', '**/*.js', '**/*.py'],
  },
  {
    id: 'SCHEMA_MIGRATION_PARITY' as ComparatorId,
    category: 'cross-artifact',
    decisionOnFail: 'warn',
    triggerPatterns: [
      '**/migrations/**', '**/schema.prisma', '**/schema.sql',
      '**/*.migration.*', '**/db/**', '**/database/**',
    ],
  },
  {
    id: 'CONTRACT_IMPLEMENTATION_PARITY' as ComparatorId,
    category: 'cross-artifact',
    decisionOnFail: 'warn',
    triggerPatterns: [
      '**/contracts/**', '**/interfaces/**', '**/*.contract.*',
      '**/*.ts', '**/*.js', '**/*.py', '**/*.go',
    ],
  },
  {
    id: 'DOC_CODE_PARITY' as ComparatorId,
    category: 'cross-artifact',
    decisionOnFail: 'warn',
    triggerPatterns: ['**/*.md', '**/docs/**', '**/*.ts', '**/*.js', '**/*.py'],
  },
  {
    id: 'TEST_IMPLEMENTATION_PARITY' as ComparatorId,
    category: 'cross-artifact',
    decisionOnFail: 'warn',
    triggerPatterns: [
      '**/*.test.*', '**/*.spec.*', '**/__tests__/**',
      '**/src/**', '**/lib/**', '**/app/**',
    ],
  },
  {
    id: 'DASHBOARD_SERVICE_PARITY' as ComparatorId,
    category: 'cross-artifact',
    decisionOnFail: 'warn',
    // Only fire when dashboard or service definition files change
    triggerPatterns: [
      '**/dashboard*', '**/monitoring/**', '**/grafana/**',
      '**/services/**', '**/service.yaml', '**/service.yml',
    ],
  },
  {
    id: 'RUNBOOK_OWNERSHIP_PARITY' as ComparatorId,
    category: 'cross-artifact',
    decisionOnFail: 'warn',
    // Only fire when runbooks or ownership files change
    triggerPatterns: [
      '**/runbook*', '**/RUNBOOK*', '**/OWNERS', '**/CODEOWNERS',
      '**/oncall*', '**/on-call*',
    ],
  },
  {
    id: 'SLO_THRESHOLD_PARITY' as ComparatorId,
    category: 'cross-artifact',
    decisionOnFail: 'warn',
    // Only fire when SLO configs or alerting files change
    triggerPatterns: [
      '**/slo*', '**/SLO*', '**/alerting/**', '**/alerts/**',
      '**/*.config.*', '**/config/**',
    ],
  },

  // ─── Safety Comparators ──────────────────────────────────────────────────
  // Always run — secrets can appear in any file type.
  {
    id: 'NO_SECRETS_IN_DIFF' as ComparatorId,
    category: 'safety',
    decisionOnFail: 'block',
    triggerPatterns: null,
  },

  // ─── Agent Governance Comparators (Spec→Build→Run Triangle) ─────────────
  {
    id: 'INTENT_CAPABILITY_PARITY' as ComparatorId,
    category: 'agent-governance',
    decisionOnFail: 'block',
    triggerPatterns: null, // Always run — agent intent must always be verified
  },
  {
    id: 'INFRA_OWNERSHIP_PARITY' as ComparatorId,
    category: 'agent-governance',
    decisionOnFail: 'warn',
    triggerPatterns: [
      '**/terraform/**', '**/helm/**', '**/k8s/**', '**/kubernetes/**',
      '**/*.tf', '**/*.tfvars', '**/Dockerfile*', '**/docker-compose*',
      '**/infra/**', '**/infrastructure/**',
    ],
  },
  {
    id: 'CHURN_COMPLEXITY_RISK' as ComparatorId,
    category: 'agent-governance',
    decisionOnFail: 'warn',
    triggerPatterns: null, // Always run — churn is measured across all file types
  },
  // INTENT_RUNTIME_PARITY removed from Track A - now runs in Track B (async, post-deploy)
  // See: apps/api/src/services/runtime/runtimeDriftMonitor.ts
];

/**
 * Check whether a comparator's trigger conditions are satisfied.
 * null triggerPatterns = always run.
 * Non-empty array = run only if at least one changed file matches at least one pattern.
 */
function isTriggerSatisfied(triggerPatterns: string[] | null, context: PRContext): boolean {
  if (!triggerPatterns) return true;
  if (triggerPatterns.length === 0) return true;
  return context.files.some(file =>
    triggerPatterns.some(pattern => minimatch(file.filename, pattern, { dot: true })),
  );
}

/**
 * Run auto-invoked comparators and return findings.
 *
 * B2-FIX: Comparators with triggerPatterns only run when relevant files are present,
 * preventing expensive GitHub API calls for PRs that cannot trigger a finding.
 *
 * @param context       - PR context with all necessary data
 * @param usedComparators - Set to track which comparators were invoked (for fingerprint)
 * @returns Array of findings from failed/unknown comparators
 */
export async function runAutoInvokedComparators(
  context: PRContext,
  usedComparators: Set<ComparatorId>,
): Promise<AutoInvokedFinding[]> {
  const findings: AutoInvokedFinding[] = [];
  const registry = comparatorRegistry;

  console.log('[AutoInvoked] Running auto-invoked comparators...');

  for (const config of AUTO_INVOKED_COMPARATORS) {
    const { id, category, decisionOnFail, triggerPatterns } = config;

    // Skip if comparator not registered
    if (!registry.has(id)) {
      console.log(`[AutoInvoked] Comparator ${id} not registered, skipping`);
      continue;
    }

    // B2-FIX: Skip when trigger conditions are not met
    if (!isTriggerSatisfied(triggerPatterns, context)) {
      console.log(`[AutoInvoked] Skipping ${id} — no matching files in PR`);
      continue;
    }

    try {
      // Track usage for engine fingerprint
      usedComparators.add(id);

      const result = await registry.evaluate(id, context, {});

      if (result.status === 'fail' || result.status === 'unknown') {
        findings.push({
          ruleId: `auto-invoked-${id.toLowerCase()}`, // CRITICAL: must start with 'auto-invoked-' for graph builder
          ruleName: `${category === 'safety' ? 'Safety' : 'Cross-Artifact'} Check: ${id}`,
          obligationIndex: -1,
          comparatorResult: result,
          decisionOnFail,
          evaluationStatus: 'evaluated',
        });
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
