/**
 * DASHBOARD_SERVICE_PARITY Comparator
 *
 * Detects drift between service changes and monitoring dashboards.
 *
 * INVARIANT: Service changes should update monitoring dashboards
 *
 * EXAMPLES:
 * - New endpoint added → dashboard should track its latency/errors
 * - Service renamed → dashboard titles/queries should be updated
 * - Critical path changed → SLI dashboards should reflect new metrics
 *
 * DETECTION LOGIC:
 * - Dashboard files: grafana/, datadog/, cloudwatch/, dashboards/, *.dashboard.json
 * - Service files: routes/, handlers/, controllers/, api/, services/
 * - Flags mismatch: Service changed but dashboards not updated
 */

import type { PRContext, ComparatorResult, Comparator } from '../types.js';
import { ComparatorId } from '../types.js';

export async function evaluate(
  context: PRContext,
  params: Record<string, any>
): Promise<ComparatorResult> {
  const { files } = context;

  // Detect dashboard changes
  const dashboardFiles = files.filter(f =>
    f.filename.includes('/grafana/') ||
    f.filename.includes('/datadog/') ||
    f.filename.includes('/cloudwatch/') ||
    f.filename.includes('/dashboards/') ||
    f.filename.endsWith('.dashboard.json') ||
    f.filename.endsWith('.dashboard.yaml') ||
    f.filename.endsWith('.dashboard.yml')
  );

  // Detect service implementation changes
  const serviceFiles = files.filter(f =>
    (f.filename.includes('/routes/') ||
     f.filename.includes('/handlers/') ||
     f.filename.includes('/controllers/') ||
     f.filename.includes('/api/') ||
     f.filename.includes('/services/')) &&
    (f.filename.endsWith('.ts') ||
     f.filename.endsWith('.js') ||
     f.filename.endsWith('.py') ||
     f.filename.endsWith('.go') ||
     f.filename.endsWith('.java'))
  );

  const hasDashboardChanges = dashboardFiles.length > 0;
  const hasServiceChanges = serviceFiles.length > 0;

  // PASS: Both changed together (good!)
  if (hasDashboardChanges && hasServiceChanges) {
    return {
      status: 'pass',
      reason: 'Service and dashboard changes are in sync',
      reasonHuman: 'Service changes include corresponding dashboard updates',
      confidence: {
        applicability: 100,
        evidence: 90,
      },
      evidence: [
        {
          type: 'file_reference',
          value: 'Dashboard files changed',
          path: dashboardFiles.map(f => f.filename).join(', '),
          snippet: `${dashboardFiles.length} dashboard file(s) updated`,
          confidence: 90,
        },
        {
          type: 'file_reference',
          value: 'Service files changed',
          path: serviceFiles.map(f => f.filename).join(', '),
          snippet: `${serviceFiles.length} service file(s) updated`,
          confidence: 90,
        },
      ],
    };
  }

  // PASS: Neither changed (no drift)
  if (!hasDashboardChanges && !hasServiceChanges) {
    return {
      status: 'pass',
      reason: 'No service or dashboard changes detected',
      reasonHuman: 'No monitoring drift detected',
      confidence: {
        applicability: 100,
        evidence: 100,
      },
    };
  }

  // FAIL: Service changed but dashboards not updated
  if (hasServiceChanges && !hasDashboardChanges) {
    return {
      status: 'fail',
      reason: 'Service implementation changed without updating monitoring dashboards',
      reasonHuman: 'Service changes detected but monitoring dashboards were not updated',
      confidence: {
        applicability: 100,
        evidence: 80,
      },
      evidence: [
        {
          type: 'file_reference',
          value: 'Service files changed',
          path: serviceFiles.map(f => f.filename).join(', '),
          snippet: `${serviceFiles.length} service file(s) changed`,
          confidence: 90,
        },
        {
          type: 'string',
          value: 'No dashboard updates detected',
          confidence: 80,
        },
      ],
    };
  }

  // WARN: Dashboards changed but service didn't (unusual but not necessarily wrong)
  if (hasDashboardChanges && !hasServiceChanges) {
    return {
      status: 'pass',
      reason: 'Dashboard-only changes (acceptable for metric tuning)',
      reasonHuman: 'Dashboard updates without service changes (metric tuning or threshold adjustments)',
      confidence: {
        applicability: 100,
        evidence: 70,
      },
      evidence: [
        {
          type: 'file_reference',
          value: 'Dashboard files changed',
          path: dashboardFiles.map(f => f.filename).join(', '),
          snippet: `${dashboardFiles.length} dashboard file(s) updated`,
          confidence: 90,
        },
      ],
    };
  }

  return {
    status: 'unknown',
    reason: 'Could not determine dashboard-service parity',
    reasonHuman: 'Unable to assess monitoring coverage',
    confidence: {
      applicability: 50,
      evidence: 50,
    },
  };
}

export const dashboardServiceParityComparator: Comparator = {
  id: ComparatorId.DASHBOARD_SERVICE_PARITY,
  version: '1.0.0',
  evaluate,
};

