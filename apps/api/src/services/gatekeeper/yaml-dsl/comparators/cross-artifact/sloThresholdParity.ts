/**
 * SLO_THRESHOLD_PARITY Comparator
 *
 * Detects drift between SLO definitions and alert thresholds.
 *
 * INVARIANT: SLO changes should update alert thresholds
 *
 * EXAMPLES:
 * - SLO tightened (99.9% → 99.99%) → alert thresholds must be updated
 * - New SLO added → corresponding alerts should be created
 * - Error budget changed → alert thresholds should reflect new budget
 *
 * DETECTION LOGIC:
 * - SLO files: slo/, slos/, *.slo.yaml, *.slo.json, service-level-objectives/
 * - Alert files: alerts/, monitoring/, *.alert.yaml, *.alert.json, alerting/
 * - Flags mismatch: SLO changed but alerts not updated
 */

import type { PRContext, ComparatorResult, Comparator } from '../types.js';
import { ComparatorId } from '../types.js';

export async function evaluate(
  context: PRContext,
  params: Record<string, any>
): Promise<ComparatorResult> {
  const { files } = context;

  // Detect SLO file changes
  const sloFiles = files.filter(f =>
    f.filename.includes('/slo/') ||
    f.filename.includes('/slos/') ||
    f.filename.includes('/service-level-objectives/') ||
    f.filename.endsWith('.slo.yaml') ||
    f.filename.endsWith('.slo.yml') ||
    f.filename.endsWith('.slo.json')
  );

  // Detect alert/threshold file changes
  const alertFiles = files.filter(f =>
    f.filename.includes('/alerts/') ||
    f.filename.includes('/alerting/') ||
    f.filename.includes('/monitoring/') ||
    f.filename.includes('/thresholds/') ||
    f.filename.endsWith('.alert.yaml') ||
    f.filename.endsWith('.alert.yml') ||
    f.filename.endsWith('.alert.json') ||
    f.filename.includes('alert-rules') ||
    f.filename.includes('prometheus-rules')
  );

  const hasSloChanges = sloFiles.length > 0;
  const hasAlertChanges = alertFiles.length > 0;

  // PASS: Both changed together (good!)
  if (hasSloChanges && hasAlertChanges) {
    return {
      status: 'pass',
      reason: 'SLO and alert threshold changes are in sync',
      reasonHuman: 'SLO changes include corresponding alert threshold updates',
      confidence: {
        applicability: 100,
        evidence: 90,
      },
      evidence: [
        {
          type: 'file_reference',
          value: 'SLO files changed',
          path: sloFiles.map(f => f.filename).join(', '),
          snippet: `${sloFiles.length} SLO file(s) updated`,
          confidence: 90,
        },
        {
          type: 'file_reference',
          value: 'Alert files changed',
          path: alertFiles.map(f => f.filename).join(', '),
          snippet: `${alertFiles.length} alert file(s) updated`,
          confidence: 90,
        },
      ],
    };
  }

  // PASS: Neither changed (no drift)
  if (!hasSloChanges && !hasAlertChanges) {
    return {
      status: 'pass',
      reason: 'No SLO or alert threshold changes detected',
      reasonHuman: 'No SLO drift detected',
      confidence: {
        applicability: 100,
        evidence: 100,
      },
    };
  }

  // FAIL: SLO changed but alerts not updated
  if (hasSloChanges && !hasAlertChanges) {
    return {
      status: 'fail',
      reason: 'SLO definitions changed without updating alert thresholds',
      reasonHuman: 'SLO changes detected but alert thresholds were not updated',
      confidence: {
        applicability: 100,
        evidence: 85,
      },
      evidence: [
        {
          type: 'file_reference',
          value: 'SLO files changed',
          path: sloFiles.map(f => f.filename).join(', '),
          snippet: `${sloFiles.length} SLO file(s) changed`,
          confidence: 90,
        },
        {
          type: 'string',
          value: 'No alert threshold updates detected',
          confidence: 85,
        },
      ],
    };
  }

  // WARN: Alerts changed but SLO didn't (unusual but not necessarily wrong)
  if (hasAlertChanges && !hasSloChanges) {
    return {
      status: 'pass',
      reason: 'Alert-only changes (acceptable for threshold tuning)',
      reasonHuman: 'Alert threshold updates without SLO changes (noise reduction or sensitivity adjustments)',
      confidence: {
        applicability: 100,
        evidence: 70,
      },
      evidence: [
        {
          type: 'file_reference',
          value: 'Alert files changed',
          path: alertFiles.map(f => f.filename).join(', '),
          snippet: `${alertFiles.length} alert file(s) updated`,
          confidence: 90,
        },
      ],
    };
  }

  return {
    status: 'unknown',
    reason: 'Could not determine SLO-threshold parity',
    reasonHuman: 'Unable to assess SLO compliance',
    confidence: {
      applicability: 50,
      evidence: 50,
    },
  };
}

export const sloThresholdParityComparator: Comparator = {
  id: ComparatorId.SLO_THRESHOLD_PARITY,
  version: '1.0.0',
  evaluate,
};

