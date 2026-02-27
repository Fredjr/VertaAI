/**
 * Test Fixture: Mixed Obligations (Pass + Fail + Suppressed)
 * 
 * Scenario: Multiple obligations with different statuses
 * - 1 PASS (catalog-info.yaml present)
 * - 1 FAIL (CODEOWNERS missing)
 * - 2 SUPPRESSED (service-specific checks don't apply to docs repo)
 * 
 * Expected behavior:
 * - Title: "⚠️ 4 obligation(s) considered: 1 WARN, 1 PASS, 2 suppressed"
 * - Body: Shows enforced (pass + fail) and suppressed sections
 * - Metadata: "Obligations Considered: 4 total (2 enforced, 2 suppressed)"
 */

import type { PackResult } from '../../../services/gatekeeper/yaml-dsl/yamlGatekeeperIntegration.js';

export const mixedObligations: PackResult[] = [
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
          // PASS: catalog-info.yaml present
          {
            id: 'baseline-catalog',
            description: 'Service catalog file must be present',
            decisionOnFail: 'warn',
            surfaces: ['repo-root'],
            result: {
              status: 'pass',
              message: 'catalog-info.yaml found',
              evidence: [
                {
                  type: 'file',
                  value: 'catalog-info.yaml',
                  metadata: {
                    path: 'catalog-info.yaml',
                    found: true,
                  },
                },
              ],
              comparatorId: 'ARTIFACT_PRESENT',
            },
          },
          // FAIL: CODEOWNERS missing
          {
            id: 'baseline-codeowners',
            description: 'CODEOWNERS file must be present',
            decisionOnFail: 'warn',
            surfaces: ['repo-root'],
            result: {
              status: 'fail',
              message: 'CODEOWNERS file not found',
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
          // SUPPRESSED: Dockerfile check (doesn't apply to docs repo)
          {
            id: 'service-dockerfile',
            description: 'Dockerfile must be present for service repos',
            decisionOnFail: 'warn',
            surfaces: ['repo-root'],
            applicability: {
              applies: false,
              reason: 'This obligation only applies to service repositories (detected: docs)',
              recommendedStatus: 'suppressed',
            },
            result: {
              status: 'suppressed',
              message: 'Suppressed: Not applicable to docs repositories',
              evidence: [],
              comparatorId: 'ARTIFACT_PRESENT',
            },
          },
          // SUPPRESSED: OpenAPI schema check (doesn't apply to docs repo)
          {
            id: 'service-openapi',
            description: 'OpenAPI schema must be valid for service repos',
            decisionOnFail: 'warn',
            surfaces: ['repo-root'],
            applicability: {
              applies: false,
              reason: 'This obligation only applies to service repositories (detected: docs)',
              recommendedStatus: 'suppressed',
            },
            result: {
              status: 'suppressed',
              message: 'Suppressed: Not applicable to docs repositories',
              evidence: [],
              comparatorId: 'OPENAPI_SCHEMA_VALID',
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
 * - "⚠️ 4 obligation(s) considered: 1 WARN, 1 PASS, 2 suppressed"
 * 
 * Metadata:
 * - Obligations Considered: 4 total (2 enforced, 2 suppressed, 0 informational)
 * - Findings: 1 (only the failed obligation)
 * 
 * Body Structure:
 * - Enforced Obligations: 2 (1 pass, 1 fail)
 * - Suppressed Obligations: 2 (with reasons)
 * 
 * Invariants to Test:
 * 1. Counting Consistency: Title count (4) === Metadata count (4) === enforced (2) + suppressed (2)
 * 2. Decision Determinism: Same input → same decision (WARN)
 * 3. Confidence Bounds: All confidence scores between 0-100
 * 4. Evidence Completeness: Failed obligation has evidence
 * 5. Remediation Presence: Failed obligation has specific guidance
 * 6. Semantic Consistency: Suppressed obligations correctly labeled
 */

