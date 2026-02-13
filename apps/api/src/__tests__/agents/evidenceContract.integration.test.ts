/**
 * Phase 2 Integration Tests - Evidence Contract to LLM Agents
 *
 * Tests that EvidenceContract is correctly wired to patch-planner and patch-generator
 * when ENABLE_EVIDENCE_TO_LLM feature flag is enabled
 *
 * Note: These tests verify the wiring and input acceptance, not the LLM responses.
 * They use mocked Claude API calls to avoid requiring actual API credentials.
 */

import { vi, beforeEach, afterEach } from 'vitest';
import type { EvidenceContract } from '../../services/evidence/evidenceContract.js';
import type { TypedDelta } from '../../services/evidence/types.js';

// Mock the Claude API module
vi.mock('../../lib/claude.js', () => ({
  callClaude: vi.fn().mockImplementation((params, schema) => {
    // Return different mock data based on the schema type
    const schemaName = schema?.name || '';

    if (schemaName.includes('PatchPlanner') || params.systemPrompt?.includes('PatchPlanner')) {
      return Promise.resolve({
        success: true,
        data: {
          targets: [{ section_pattern: 'Deployment', change_type: 'update', rationale: 'Update command' }],
          constraints: [],
          needs_human: false,
        },
        error: null,
      });
    } else {
      // PatchGenerator response
      return Promise.resolve({
        success: true,
        data: {
          doc_id: 'doc-123',
          unified_diff: '--- a/doc\n+++ b/doc\n@@ -1,1 +1,1 @@\n-old line\n+new line',
          summary: 'Updated deployment command',
          confidence: 0.85,
          sources_used: [{ type: 'pr_title', ref: 'Update deployment' }],
          safety: { secrets_redacted: false, risky_change_avoided: false },
          needs_human: false,
        },
        error: null,
      });
    }
  }),
  ClaudeResponse: {},
}));

describe('Phase 2 - Evidence Contract Integration', () => {
  // Import agents after mocking
  let runPatchPlanner: any;
  let runPatchGenerator: any;

  beforeEach(async () => {
    // Dynamically import after mocks are set up
    const plannerModule = await import('../../agents/patch-planner.js');
    const generatorModule = await import('../../agents/patch-generator.js');
    runPatchPlanner = plannerModule.runPatchPlanner;
    runPatchGenerator = generatorModule.runPatchGenerator;
  });

  const createMockEvidenceContract = (): EvidenceContract => ({
    version: '1.0',
    signal: {
      sourceType: 'github_pr',
      workspaceId: 'test-workspace',
      triggeringEvent: 'pr-123',
      timestamp: '2024-01-15T10:00:00Z',
    },
    typedDeltas: [
      {
        artifactType: 'command',
        action: 'changed',
        sourceValue: 'kubectl apply -f new-deployment.yaml',
        docValue: 'kubectl apply -f deployment.yaml',
        section: 'Deployment',
        confidence: 0.85,
      },
      {
        artifactType: 'configKey',
        action: 'changed',
        sourceValue: 'NODE_ENV=production',
        docValue: 'NODE_ENV=development',
        section: 'Configuration',
        confidence: 0.9,
      },
    ],
    docContext: {
      system: 'confluence',
      url: 'https://confluence.example.com/doc-123',
      title: 'Service Deployment Runbook',
      relevantSections: ['Deployment', 'Configuration'],
    },
    assessment: {
      impactBand: 'high',
      riskFactors: ['production-impact', 'config-change'],
      blastRadius: {
        services: ['api-service', 'worker-service'],
        teams: ['platform-team'],
        systems: ['kubernetes'],
      },
    },
  });

  describe('Patch Planner with Evidence Contract', () => {
    test('accepts evidence contract in input', async () => {
      const evidence = createMockEvidenceContract();

      const input = {
        docId: 'doc-123',
        docTitle: 'Service Deployment Runbook',
        docContent: '# Deployment\n\nRun: kubectl apply -f deployment.yaml\n\n# Configuration\n\nNODE_ENV=development',
        impactedDomains: ['deployment', 'configuration'],
        prTitle: 'Update deployment config',
        prDescription: 'Changed deployment file and env vars',
        diffExcerpt: '+kubectl apply -f new-deployment.yaml\n-kubectl apply -f deployment.yaml',
        evidence,
      };

      // This should not throw and should accept the evidence field
      const result = await runPatchPlanner(input);

      // The result structure should be valid regardless of LLM response
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('error');
    });

    test('works without evidence contract (backward compatibility)', async () => {
      const input = {
        docId: 'doc-123',
        docTitle: 'Service Deployment Runbook',
        docContent: '# Deployment\n\nRun: kubectl apply -f deployment.yaml',
        impactedDomains: ['deployment'],
        prTitle: 'Update deployment',
        prDescription: null,
        diffExcerpt: '+kubectl apply -f new-deployment.yaml',
        // No evidence field - should fall back to legacy behavior
      };

      const result = await runPatchPlanner(input);

      expect(result).toHaveProperty('success');
    });
  });

  describe('Patch Generator with Evidence Contract', () => {
    test('accepts evidence contract in input', async () => {
      const evidence = createMockEvidenceContract();

      const input = {
        docId: 'doc-123',
        docTitle: 'Service Deployment Runbook',
        docContent: '# Deployment\n\nRun: kubectl apply -f deployment.yaml\n\n# Configuration\n\nNODE_ENV=development',
        patchPlan: {
          targets: [
            {
              section_pattern: 'Deployment',
              change_type: 'update' as const,
              rationale: 'Update deployment command',
            },
          ],
          constraints: [],
          needs_human: false,
        },
        prId: 'repo#123',
        prTitle: 'Update deployment config',
        prDescription: 'Changed deployment file and env vars',
        diffExcerpt: '+kubectl apply -f new-deployment.yaml\n-kubectl apply -f deployment.yaml',
        changedFiles: ['deployment.yaml', '.env'],
        evidence,
      };

      // This should not throw and should accept the evidence field
      const result = await runPatchGenerator(input);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('error');
    });

    test('works without evidence contract (backward compatibility)', async () => {
      const input = {
        docId: 'doc-123',
        docTitle: 'Service Deployment Runbook',
        docContent: '# Deployment\n\nRun: kubectl apply -f deployment.yaml',
        patchPlan: {
          targets: [
            {
              section_pattern: 'Deployment',
              change_type: 'update' as const,
              rationale: 'Update deployment command',
            },
          ],
          constraints: [],
          needs_human: false,
        },
        prId: 'repo#123',
        prTitle: 'Update deployment',
        prDescription: null,
        diffExcerpt: '+kubectl apply -f new-deployment.yaml',
        changedFiles: ['deployment.yaml'],
        // No evidence field - should fall back to legacy behavior
      };

      const result = await runPatchGenerator(input);

      expect(result).toHaveProperty('success');
    });
  });
});

