/**
 * Test Fixture: Simple Baseline Failure
 * 
 * Scenario: Single failed obligation (CODEOWNERS missing)
 * Expected behavior:
 * - Title: "⚠️ 1 obligation(s) considered: 1 WARN"
 * - Body: Shows 1 failed obligation with specific remediation
 * - Metadata: "Obligations Considered: 1 total (1 enforced, 0 suppressed)"
 */

import type { PackResult } from '../../../services/gatekeeper/yaml-dsl/yamlGatekeeperIntegration.js';

export const simpleBaselineFailure: PackResult[] = [
  {
    packName: 'baseline',
    result: {
      decision: 'warn',
      evaluationGraph: {
        allSurfaces: [
          {
            surfaceId: 'repo-root',
            surfaceType: 'repository',
            path: '/',
            metadata: {},
          },
        ],
        obligations: [
          {
            id: 'baseline-codeowners',
            description: 'CODEOWNERS file must be present',
            decisionOnFail: 'warn',
            surfaces: ['repo-root'],
            result: {
              status: 'fail',
              message: 'CODEOWNERS file not found in repository root',
              evidence: [
                {
                  type: 'file',
                  value: 'CODEOWNERS',
                  metadata: {
                    path: 'CODEOWNERS',
                    expected: true,
                    found: false,
                  },
                },
              ],
              comparatorId: 'ARTIFACT_PRESENT',
            },
          },
        ],
      },
    },
  },
];

/**
 * Expected Output Characteristics:
 * 
 * Title:
 * - "⚠️ 1 obligation(s) considered: 1 WARN"
 * 
 * Executive Summary:
 * - Decision: WARN
 * - Governance Impact: "Changes may not reach accountable maintainers..."
 * 
 * Metadata:
 * - Obligations Considered: 1 total (1 enforced, 0 suppressed, 0 informational)
 * - Findings: 1
 * 
 * Remediation:
 * - Should show specific guidance (not generic fallback)
 * - Should include patch preview for CODEOWNERS
 * 
 * Invariants to Test:
 * 1. Counting Consistency: Title count (1) === Metadata count (1)
 * 2. Decision Determinism: Same input → same decision (WARN)
 * 3. Confidence Bounds: All confidence scores between 0-100
 * 4. Evidence Completeness: 1 failed obligation has 1 evidence item
 * 5. Remediation Presence: Has specific guidance (not "Fix the issue described above")
 * 6. Semantic Consistency: Labeled as "Checks Evaluated" (repo invariant)
 */

