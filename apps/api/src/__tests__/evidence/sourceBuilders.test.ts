// apps/api/src/__tests__/evidence/sourceBuilders.test.ts
// Phase 1 implementation - comprehensive unit tests for source evidence builders

import { describe, it, expect } from 'vitest';
import { buildSourceEvidence } from '../../services/evidence/sourceBuilders.js';
import type { SignalEvent } from '@prisma/client';

describe('buildSourceEvidence', () => {
  describe('GitHub PR source', () => {
    it('should build evidence from GitHub PR signal', async () => {
      const signalEvent = {
        workspaceId: 'ws-123',
        id: 'signal-456',
        sourceType: 'github_pr',
        rawPayload: {
          pull_request: {
            number: 123,
            title: 'Update deployment process',
            body: 'Changed from kubectl to helm',
            diff_url: 'https://github.com/org/repo/pull/123.diff'
          }
        },
        extracted: {
          prDiff: {
            filesChanged: ['deploy.sh', 'README.md'],
            linesAdded: 25,
            linesRemoved: 10,
            diffContent: 'diff --git a/deploy.sh...'
          }
        }
      } as any;

      const result = await buildSourceEvidence({
        signalEvent,
        parserArtifacts: {}
      });

      expect(result.sourceType).toBe('github_pr');
      expect(result.sourceId).toContain('pr-123');
      expect(result.artifacts.prDiff).toBeDefined();
      expect(result.artifacts.prDiff?.filesChanged).toEqual(['deploy.sh', 'README.md']);
      expect(result.artifacts.prDiff?.linesAdded).toBe(25);
      expect(result.artifacts.prDiff?.linesRemoved).toBe(10);
      expect(result.artifacts.prDiff?.excerpt).toContain('diff --git');
    });

    it('should handle PR with no diff content', async () => {
      const signalEvent = {
        sourceType: 'github_pr',
        rawPayload: { pull_request: { number: 123 } },
        extracted: {}
      } as any;

      const result = await buildSourceEvidence({
        signalEvent,
        parserArtifacts: {}
      });

      expect(result.sourceType).toBe('github_pr');
      expect(result.artifacts.prDiff?.excerpt).toBe('');
    });
  });

  describe('PagerDuty incident source', () => {
    it('should build evidence from PagerDuty incident', async () => {
      const signalEvent = {
        sourceType: 'pagerduty_incident',
        rawPayload: {
          incident: {
            id: 'INC-123',
            title: 'API service down',
            urgency: 'high',
            status: 'resolved'
          }
        },
        extracted: {
          pagerdutyNormalized: {
            incidentId: 'INC-123',
            severity: 'high',
            timeline: [
              { timestamp: '2026-02-08T10:00:00Z', action: 'triggered', user: 'system' },
              { timestamp: '2026-02-08T10:15:00Z', action: 'acknowledged', user: 'john' },
              { timestamp: '2026-02-08T10:45:00Z', action: 'resolved', user: 'john' }
            ],
            responders: ['john', 'jane']
          }
        }
      } as any;

      const result = await buildSourceEvidence({
        signalEvent,
        parserArtifacts: {}
      });

      expect(result.sourceType).toBe('pagerduty_incident');
      expect(result.artifacts.incidentTimeline).toBeDefined();
      expect(result.artifacts.incidentTimeline?.severity).toBe('high');
      expect(result.artifacts.incidentTimeline?.responders).toEqual(['john', 'jane']);
      expect(result.artifacts.incidentTimeline?.timelineExcerpt).toContain('triggered');
    });
  });

  describe('Slack cluster source', () => {
    it('should build evidence from Slack message cluster', async () => {
      const signalEvent = {
        sourceType: 'slack_cluster',
        rawPayload: {
          messages: [
            { text: 'Deployment failed with kubectl', user: 'alice', ts: '1707390000' },
            { text: 'Same issue here', user: 'bob', ts: '1707390060' },
            { text: 'We switched to helm last week', user: 'charlie', ts: '1707390120' }
          ]
        },
        extracted: {
          slackCluster: {
            theme: 'deployment_tool_change',
            messageCount: 3,
            uniqueUsers: 3,
            messages: [
              { text: 'Deployment failed with kubectl', user: 'alice' },
              { text: 'Same issue here', user: 'bob' },
              { text: 'We switched to helm last week', user: 'charlie' }
            ]
          }
        }
      } as any;

      const result = await buildSourceEvidence({
        signalEvent,
        parserArtifacts: {}
      });

      expect(result.sourceType).toBe('slack_cluster');
      expect(result.artifacts.slackMessages).toBeDefined();
      expect(result.artifacts.slackMessages?.theme).toBe('deployment_tool_change');
      expect(result.artifacts.slackMessages?.userCount).toBe(3);
      expect(result.artifacts.slackMessages?.messagesExcerpt).toContain('kubectl');
      expect(result.artifacts.slackMessages?.messagesExcerpt).toContain('helm');
    });
  });

  describe('DataDog alert source', () => {
    it('should build evidence from DataDog alert', async () => {
      const signalEvent = {
        sourceType: 'datadog_alert',
        rawPayload: {
          alert: {
            id: 'alert-123',
            title: 'High CPU usage on api-service',
            priority: 'P1',
            status: 'triggered'
          }
        },
        extracted: {
          alertNormalized: {
            alertType: 'cpu_high',
            severity: 'critical',
            affectedServices: ['api-service'],
            metrics: { cpu: 95, threshold: 80 }
          }
        }
      } as any;

      const result = await buildSourceEvidence({
        signalEvent,
        parserArtifacts: {}
      });

      expect(result.sourceType).toBe('datadog_alert');
      expect(result.artifacts.alertData).toBeDefined();
      expect(result.artifacts.alertData?.alertType).toBe('cpu_high');
      expect(result.artifacts.alertData?.severity).toBe('critical');
      expect(result.artifacts.alertData?.affectedServices).toEqual(['api-service']);
    });
  });

  describe('IaC source', () => {
    it('should build evidence from IaC changes', async () => {
      const signalEvent = {
        sourceType: 'github_iac',
        rawPayload: {},
        extracted: {
          iacSummary: {
            resourcesAdded: ['aws_instance.web'],
            resourcesModified: ['aws_security_group.main'],
            resourcesDeleted: [],
            changeTypes: ['compute', 'network']
          }
        }
      } as any;

      const result = await buildSourceEvidence({
        signalEvent,
        parserArtifacts: {}
      });

      expect(result.sourceType).toBe('github_iac');
      expect(result.artifacts.iacChanges).toBeDefined();
      expect(result.artifacts.iacChanges?.resourcesAdded).toEqual(['aws_instance.web']);
      expect(result.artifacts.iacChanges?.changeTypes).toEqual(['compute', 'network']);
    });
  });

  describe('CODEOWNERS source', () => {
    it('should build evidence from CODEOWNERS changes', async () => {
      const signalEvent = {
        sourceType: 'github_codeowners',
        rawPayload: {},
        extracted: {
          codeownersDiff: {
            pathsAdded: ['/api/*'],
            pathsRemoved: [],
            ownersAdded: ['@platform-team'],
            ownersRemoved: []
          }
        }
      } as any;

      const result = await buildSourceEvidence({
        signalEvent,
        parserArtifacts: {}
      });

      expect(result.sourceType).toBe('github_codeowners');
      expect(result.artifacts.ownershipChanges).toBeDefined();
      expect(result.artifacts.ownershipChanges?.pathsAdded).toEqual(['/api/*']);
      expect(result.artifacts.ownershipChanges?.ownersAdded).toEqual(['@platform-team']);
    });
  });
});

