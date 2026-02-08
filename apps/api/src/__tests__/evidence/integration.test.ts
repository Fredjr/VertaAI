// apps/api/src/__tests__/evidence/integration.test.ts
// Phase 1 implementation - end-to-end integration tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildEvidenceBundle } from '../../services/evidence/builder.js';
import type { BuildEvidenceBundleArgs } from '../../services/evidence/types.js';

describe('Evidence Bundle Integration Tests', () => {
  describe('End-to-end evidence bundle creation', () => {
    it('should create complete evidence bundle for GitHub PR drift', async () => {
      const args: BuildEvidenceBundleArgs = {
        driftCandidate: {
          workspaceId: 'ws-test-123',
          id: 'drift-test-456',
          driftType: 'instruction',
          state: 'BASELINE_CHECKED',
          signalEventId: 'signal-test-789'
        } as any,
        signalEvent: {
          workspaceId: 'ws-test-123',
          id: 'signal-test-789',
          sourceType: 'github_pr',
          rawPayload: {
            pull_request: {
              number: 123,
              title: 'Update deployment to use Helm',
              body: 'Migrating from kubectl to Helm for deployments',
              diff_url: 'https://github.com/org/repo/pull/123.diff'
            }
          },
          extracted: {
            prDiff: {
              filesChanged: ['deploy.sh', 'README.md'],
              linesAdded: 45,
              linesRemoved: 20,
              diffContent: `diff --git a/deploy.sh b/deploy.sh
index abc123..def456 100644
--- a/deploy.sh
+++ b/deploy.sh
@@ -1,5 +1,5 @@
 #!/bin/bash
-kubectl apply -f deployment.yaml
+helm upgrade --install myapp ./charts/myapp
 echo "Deployment complete"`
            }
          }
        } as any,
        docContext: {
          content: `# Deployment Guide

## Prerequisites
- kubectl installed
- Access to Kubernetes cluster

## Deployment Steps

1. Configure kubectl context:
   \`\`\`bash
   kubectl config use-context production
   \`\`\`

2. Deploy the application:
   \`\`\`bash
   kubectl apply -f deployment.yaml
   \`\`\`

3. Verify deployment:
   \`\`\`bash
   kubectl get pods
   \`\`\`

## Rollback

If deployment fails, rollback using:
\`\`\`bash
kubectl rollout undo deployment/myapp
\`\`\``,
          docSystem: 'confluence',
          docId: 'CONF-123',
          docTitle: 'Deployment Guide',
          docUrl: 'https://docs.example.com/deployment'
        } as any,
        parserArtifacts: {
          openApiDiff: null,
          codeownersDiff: null,
          iacSummary: null,
          pagerdutyNormalized: null,
          slackCluster: null,
          alertNormalized: null
        }
      };

      const result = await buildEvidenceBundle(args);

      // Verify success
      expect(result.success).toBe(true);
      expect(result.bundle).toBeDefined();

      if (!result.bundle) return;

      // Verify bundle structure
      expect(result.bundle.bundleId).toBeDefined();
      expect(result.bundle.workspaceId).toBe('ws-test-123');
      expect(result.bundle.driftCandidateId).toBe('drift-test-456');
      expect(result.bundle.createdAt).toBeDefined();
      expect(result.bundle.version).toBe('1.0.0');
      expect(result.bundle.schemaVersion).toBe('1.0.0');

      // Verify source evidence
      expect(result.bundle.sourceEvidence.sourceType).toBe('github_pr');
      expect(result.bundle.sourceEvidence.sourceId).toContain('pr-123');
      expect(result.bundle.sourceEvidence.artifacts.prDiff).toBeDefined();
      expect(result.bundle.sourceEvidence.artifacts.prDiff?.filesChanged).toContain('deploy.sh');
      expect(result.bundle.sourceEvidence.artifacts.prDiff?.linesAdded).toBe(45);

      // Verify target evidence
      expect(result.bundle.targetEvidence.docSystem).toBe('confluence');
      expect(result.bundle.targetEvidence.docId).toBe('CONF-123');
      // Surface classification is determined by doc claim extractor logic
      expect(result.bundle.targetEvidence.surface).toMatch(/^(runbook|api_contract|service_catalog|developer_doc|code_doc|knowledge_base)$/);
      expect(result.bundle.targetEvidence.claims.length).toBeGreaterThan(0);
      
      // Verify at least one claim was extracted
      const instructionClaim = result.bundle.targetEvidence.claims.find(
        c => c.claimType === 'instruction_block'
      );
      expect(instructionClaim).toBeDefined();

      // Verify impact assessment
      expect(result.bundle.assessment.impactScore).toBeGreaterThan(0);
      expect(result.bundle.assessment.impactScore).toBeLessThanOrEqual(1);
      expect(result.bundle.assessment.impactBand).toMatch(/^(low|medium|high|critical)$/);
      expect(result.bundle.assessment.firedRules).toBeDefined();
      expect(Array.isArray(result.bundle.assessment.firedRules)).toBe(true);
      expect(result.bundle.assessment.consequenceText).toBeDefined();
      expect(result.bundle.assessment.consequenceText.length).toBeGreaterThan(0);

      // Verify blast radius
      expect(result.bundle.assessment.blastRadius).toBeDefined();
      expect(result.bundle.assessment.blastRadius.services).toBeDefined();
      expect(result.bundle.assessment.blastRadius.teams).toBeDefined();
      expect(result.bundle.assessment.blastRadius.systems).toBeDefined();

      // Verify fingerprints
      expect(result.bundle.fingerprints.strict).toBeDefined();
      expect(result.bundle.fingerprints.medium).toBeDefined();
      expect(result.bundle.fingerprints.broad).toBeDefined();
      expect(result.bundle.fingerprints.strict.length).toBeGreaterThan(0);
      expect(result.bundle.fingerprints.medium.length).toBeGreaterThan(0);
      expect(result.bundle.fingerprints.broad.length).toBeGreaterThan(0);
    });

    it('should handle PagerDuty incident source', async () => {
      const args: BuildEvidenceBundleArgs = {
        driftCandidate: {
          workspaceId: 'ws-test-123',
          id: 'drift-test-789',
          driftType: 'process',
          state: 'BASELINE_CHECKED'
        } as any,
        signalEvent: {
          sourceType: 'pagerduty_incident',
          rawPayload: {
            incident: {
              id: 'INC-456',
              title: 'API service down - wrong deployment command',
              urgency: 'high'
            }
          },
          extracted: {
            pagerdutyNormalized: {
              incidentId: 'INC-456',
              severity: 'high',
              timeline: [
                { timestamp: '2026-02-08T10:00:00Z', action: 'triggered', user: 'system' },
                { timestamp: '2026-02-08T10:30:00Z', action: 'resolved', user: 'john' }
              ],
              responders: ['john', 'jane']
            }
          }
        } as any,
        docContext: {
          content: 'Incident response runbook content',
          docSystem: 'confluence',
          docId: 'CONF-456',
          docTitle: 'Incident Response',
          docUrl: 'https://docs.example.com/incidents'
        } as any,
        parserArtifacts: {}
      };

      const result = await buildEvidenceBundle(args);

      expect(result.success).toBe(true);
      expect(result.bundle?.sourceEvidence.sourceType).toBe('pagerduty_incident');
      expect(result.bundle?.sourceEvidence.artifacts.incidentTimeline).toBeDefined();
      // Impact score is calculated based on multiple factors
      expect(result.bundle?.assessment.impactScore).toBeGreaterThan(0);
      expect(result.bundle?.assessment.impactScore).toBeLessThanOrEqual(1);
    });
  });

  describe('Performance benchmarks', () => {
    it('should create evidence bundle in less than 100ms', async () => {
      const args: BuildEvidenceBundleArgs = {
        driftCandidate: { workspaceId: 'ws-123', id: 'drift-456', driftType: 'instruction' } as any,
        signalEvent: { sourceType: 'github_pr', rawPayload: {}, extracted: {} } as any,
        docContext: { content: 'test', docSystem: 'confluence' } as any,
        parserArtifacts: {}
      };

      const startTime = performance.now();
      await buildEvidenceBundle(args);
      const endTime = performance.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(100);
    });
  });
});

