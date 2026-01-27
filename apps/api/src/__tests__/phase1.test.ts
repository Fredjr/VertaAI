/**
 * Phase 1 Integration Tests
 * Tests workspace endpoints, integration management, and tenant-routed webhooks
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  TEST_WORKSPACE,
  generateWebhookSignature,
  createPRPayload,
  createPingPayload,
  API_BASE_URL,
  TEST_WEBHOOK_SECRET,
} from './setup.js';

// Helper to make API requests
async function api(path: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

describe('Phase 1: Foundation - Workspace Scoping', () => {
  let testWorkspaceId: string;

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const { status, data } = await api('/health');
      expect(status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.database).toBe('connected');
    });
  });

  describe('Workspace CRUD', () => {
    it('should list all workspaces', async () => {
      const { status, data } = await api('/api/workspaces');
      expect(status).toBe(200);
      expect(Array.isArray(data.workspaces)).toBe(true);
    });

    it('should create a new workspace', async () => {
      const uniqueName = `Test Workspace ${Date.now()}`;
      const { status, data } = await api('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify({
          name: uniqueName,
          ownerEmail: 'test@example.com',
        }),
      });
      expect(status).toBe(201);
      expect(data.workspace).toBeDefined();
      expect(data.workspace.name).toBe(uniqueName);
      testWorkspaceId = data.workspace.id;
    });

    it('should get a single workspace with integrations and counts', async () => {
      const { status, data } = await api(`/api/workspaces/${TEST_WORKSPACE.id}`);
      expect(status).toBe(200);
      // Response returns workspace object directly (not wrapped)
      expect(data.id).toBe(TEST_WORKSPACE.id);
      expect(data.integrations).toBeDefined();
      expect(data._count).toBeDefined();
    });

    it('should return 404 for non-existent workspace', async () => {
      const { status } = await api('/api/workspaces/non-existent-id');
      expect(status).toBe(404);
    });
  });

  describe('Integration Management', () => {
    it('should create/update a GitHub integration', async () => {
      const { status, data } = await api(
        `/api/workspaces/${TEST_WORKSPACE.id}/integrations/github`,
        {
          method: 'PUT',
          body: JSON.stringify({
            config: { installationId: '12345' },
            webhookSecret: TEST_WEBHOOK_SECRET,
          }),
        }
      );
      expect(status).toBe(200);
      expect(data.integration).toBeDefined();
      expect(data.integration.type).toBe('github');
    });

    it('should delete an integration', async () => {
      // First create one to delete
      await api(`/api/workspaces/${TEST_WORKSPACE.id}/integrations/notion`, {
        method: 'PUT',
        body: JSON.stringify({ config: { apiKey: 'test' } }),
      });
      
      const { status } = await api(
        `/api/workspaces/${TEST_WORKSPACE.id}/integrations/notion`,
        { method: 'DELETE' }
      );
      expect(status).toBe(200);
    });
  });

  describe('Tenant-Routed Webhooks', () => {
    it('should handle ping event', async () => {
      const payload = JSON.stringify(createPingPayload());
      const signature = generateWebhookSignature(payload, TEST_WEBHOOK_SECRET);

      const { status, data } = await api(
        `/webhooks/github/${TEST_WORKSPACE.id}`,
        {
          method: 'POST',
          body: payload,
          headers: {
            'X-GitHub-Event': 'ping',
            'X-Hub-Signature-256': signature,
            'X-GitHub-Delivery': `test-ping-${Date.now()}`,
          },
        }
      );
      expect(status).toBe(200);
      expect(data.message).toBe('pong');
    });

    it('should reject invalid signature', async () => {
      const payload = JSON.stringify(createPingPayload());
      const { status, data } = await api(
        `/webhooks/github/${TEST_WORKSPACE.id}`,
        {
          method: 'POST',
          body: payload,
          headers: {
            'X-GitHub-Event': 'ping',
            'X-Hub-Signature-256': 'sha256=invalid',
            'X-GitHub-Delivery': `test-invalid-${Date.now()}`,
          },
        }
      );
      expect(status).toBe(401);
      expect(data.error).toBe('Invalid signature');
    });

    it('should create SignalEvent and DriftCandidate for merged PR', async () => {
      const prNumber = 1000 + Math.floor(Math.random() * 9000);
      const payload = JSON.stringify(createPRPayload(prNumber));
      const signature = generateWebhookSignature(payload, TEST_WEBHOOK_SECRET);

      const { status, data } = await api(
        `/webhooks/github/${TEST_WORKSPACE.id}`,
        {
          method: 'POST',
          body: payload,
          headers: {
            'X-GitHub-Event': 'pull_request',
            'X-Hub-Signature-256': signature,
            'X-GitHub-Delivery': `test-pr-${Date.now()}`,
          },
        }
      );
      expect(status).toBe(202);
      expect(data.signalEventId).toBeDefined();
      expect(data.driftId).toBeDefined();
    });
  });
});

// DocContext extraction tests (unit tests - no API calls needed)
import {
  extractDocContext,
  buildHeadingsOutline,
  buildLlmPayload,
  validatePatchWithinRanges,
} from '../services/docs/docContextExtractor.js';

describe('DocContext Extraction', () => {
  const sampleDoc = `# Deployment Runbook

## Overview
This document describes deployment procedures.

<!-- DRIFT_AGENT_MANAGED_START -->
## Deploy Steps
1. First, run tests
2. Then, deploy to staging
3. Finally, deploy to production
<!-- DRIFT_AGENT_MANAGED_END -->

## Owner
Contact: @platform-team
Team: Platform Engineering
Slack: #platform-support

## FAQ
Common issues and troubleshooting.
`;

  describe('buildHeadingsOutline', () => {
    it('should extract all headings with levels', () => {
      const outline = buildHeadingsOutline(sampleDoc);
      expect(outline.length).toBeGreaterThan(0);
      const firstHeading = outline[0];
      expect(firstHeading).toBeDefined();
      expect(firstHeading!.heading).toBe('Deployment Runbook');
      expect(firstHeading!.level).toBe(1);
      expect(outline.some(h => h.heading === 'Deploy Steps')).toBe(true);
    });
  });

  describe('extractDocContext', () => {
    it('should extract DocContext with managed region', () => {
      const docContext = extractDocContext({
        workspaceId: 'test-ws',
        docSystem: 'confluence',
        docId: 'doc-123',
        docUrl: 'https://example.com/doc',
        docTitle: 'Deployment Runbook',
        docText: sampleDoc,
        baseRevision: '1',
        driftType: 'instruction',
        driftDomains: ['deployment'],
      });

      expect(docContext.docId).toBe('doc-123');
      expect(docContext.outline.length).toBeGreaterThan(0);
      expect(docContext.managedRegion).not.toBeNull();
      expect(docContext.managedRegion?.text).toContain('Deploy Steps');
      expect(docContext.flags.managedRegionMissing).toBe(false);
    });

    it('should extract owner block for ownership drift', () => {
      const docContext = extractDocContext({
        workspaceId: 'test-ws',
        docSystem: 'confluence',
        docId: 'doc-123',
        docUrl: 'https://example.com/doc',
        docTitle: 'Deployment Runbook',
        docText: sampleDoc,
        baseRevision: '1',
        driftType: 'ownership',
        driftDomains: ['ownership_routing'],
      });

      expect(docContext.ownerBlock).not.toBeNull();
      expect(docContext.ownerBlock?.text).toContain('@platform-team');
    });

    it('should set flag when managed region is missing', () => {
      const docWithoutManagedRegion = '# Simple Doc\n\nNo managed region here.';
      const docContext = extractDocContext({
        workspaceId: 'test-ws',
        docSystem: 'confluence',
        docId: 'doc-123',
        docUrl: 'https://example.com/doc',
        docTitle: 'Simple Doc',
        docText: docWithoutManagedRegion,
        baseRevision: '1',
        driftType: 'instruction',
        driftDomains: ['deployment'],
      });

      expect(docContext.flags.managedRegionMissing).toBe(true);
    });
  });

  describe('buildLlmPayload', () => {
    it('should build bounded payload for LLM', () => {
      const docContext = extractDocContext({
        workspaceId: 'test-ws',
        docSystem: 'confluence',
        docId: 'doc-123',
        docUrl: 'https://example.com/doc',
        docTitle: 'Deployment Runbook',
        docText: sampleDoc,
        baseRevision: '1',
        driftType: 'instruction',
        driftDomains: ['deployment'],
      });

      const payload = buildLlmPayload(docContext);
      expect(payload.docId).toBe('doc-123');
      expect(payload.outline.length).toBeGreaterThan(0);
      expect(payload.managedRegionText).not.toBeNull();
      expect(payload.managedRegionText!).toContain('Deploy Steps');
    });
  });

  describe('validatePatchWithinRanges', () => {
    it('should validate patch within allowed ranges', () => {
      const original = 'ABC123XYZ';
      const patched = 'ABC456XYZ'; // Only middle part changed
      const ranges = [{ startChar: 3, endChar: 6, reason: 'managed_region' as const }];

      const result = validatePatchWithinRanges(original, patched, ranges);
      expect(result.valid).toBe(true);
    });

    it('should detect violations outside allowed ranges', () => {
      const original = 'ABC123XYZ';
      const patched = 'XXX123XYZ'; // Beginning changed (outside range)
      const ranges = [{ startChar: 3, endChar: 6, reason: 'managed_region' as const }];

      const result = validatePatchWithinRanges(original, patched, ranges);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// PROCESS DRIFT RESULT TESTS
// ============================================================================
import { checkProcessBaselineDetailed, ProcessDriftResult, ProcessBaselineFinding } from '../services/baseline/patterns.js';

describe('ProcessDriftResult - checkProcessBaselineDetailed', () => {
  // Per spec Section 3.2: Process drift detection compares PR signals vs doc baseline
  // Doc-only analysis extracts doc_flow (steps/gates) but needs PR signals to detect drift

  it('should extract doc flow structure from doc-only input', () => {
    const docText = `
# Deployment Runbook

## Steps
1. First, check the current version
2. Then, run the deployment script
3. Next, verify the deployment
4. Finally, update the dashboard

If deployment fails, then rollback.
`;

    const result = checkProcessBaselineDetailed(docText);

    // Doc-only analysis extracts structure but doesn't detect drift without PR signals
    expect(result.doc_flow.length).toBeGreaterThan(0);
    expect(result.findings.length).toBeGreaterThan(0);
    // No PR signals means no drift detected (per spec Section 3.2)
    expect(result.detected).toBe(false);
  });

  it('should extract approval gates from doc content', () => {
    const docText = `
# Release Process

Before releasing:
1. Get sign-off from the team lead
2. The change requires approval from security team
3. Must be approved by the on-call engineer
`;

    const result = checkProcessBaselineDetailed(docText);

    // Should extract gate findings even without PR signals
    const approvalFindings = result.findings.filter((f: ProcessBaselineFinding) => f.kind === 'approval_gate');
    expect(approvalFindings.length).toBeGreaterThan(0);
    expect(result.doc_flow.length).toBeGreaterThan(0);
  });

  it('should detect new gate when PR adds one not in doc', () => {
    const docText = `
# Release Process

## Steps
1. Run the build
2. Deploy to staging
`;

    // PR uses explicit gate-add language that matches PR_GATE_ADD_PATTERNS
    const result = checkProcessBaselineDetailed(docText, {
      prTitle: 'Add new approval gate for production deploys',
      prDescription: 'This PR adds a new review step before production. Now requires approval from security team.',
    });

    expect(result.detected).toBe(true);
    expect(result.mismatch_type).toBe('new_gate');
    expect(result.pr_flow.length).toBeGreaterThan(0);
  });

  it('should determine mismatch type from PR title', () => {
    const docText = `
# Steps
1. First step
2. Second step
`;

    // PR uses explicit order change language that matches PR_ORDER_HINT_PATTERNS
    const result = checkProcessBaselineDetailed(docText, {
      prTitle: 'Reorder the steps in deployment process',
      prDescription: 'Moving test step before deploy. Changing the order of steps.',
    });

    // Should detect order change from "reorder" keyword
    expect(result.mismatch_type).toBe('order_change');
    expect(result.pr_flow.some(f => f.toLowerCase().includes('reorder') || f.toLowerCase().includes('order'))).toBe(true);
  });

  it('should recommend add_note for new gate PR when doc has no process steps', () => {
    const docText = `
# Simple Process
Just run the script.
`;

    const result = checkProcessBaselineDetailed(docText, {
      prTitle: 'Add approval gate for production deployments',
      prDescription: 'Requires manager approval before deploy',
    });

    // New gate detected, but no structured steps in doc = add_note (not add_section)
    expect(result.mismatch_type).toBe('new_gate');
    expect(result.detected).toBe(true);
    // add_note is default for new_gate per implementation
    expect(result.recommended_patch_style).toBe('add_note');
  });

  it('should return annotate_only for doc without process steps and no PR', () => {
    const docText = `
# Overview
This is a general overview document with no process steps.
`;

    const result = checkProcessBaselineDetailed(docText);

    // No process detected, no PR signals = annotate_only (default action)
    expect(result.detected).toBe(false);
    expect(result.recommended_action).toBe('annotate_only');
  });

  it('should recommend generate_patch for high confidence process change', () => {
    const docText = `
# Deployment Runbook

## Steps
1. First, verify environment
2. Then, deploy to staging
3. Next, run integration tests
4. Finally, deploy to production
`;

    // PR with explicit gate add (matches pattern), explicit process change language, and workflow file modification
    // Using multiple confidence boosters: explicitProcessChange + mentionsWorkflowFiles + docSteps
    const result = checkProcessBaselineDetailed(docText, {
      prTitle: 'Add new approval check for deployment process',
      prDescription: 'This PR changes the deploy process to require additional approval before prod. Now requires sign-off.',
      changedFiles: ['.github/workflows/deploy.yml', 'deploy/pipeline.yaml'],
    });

    expect(result.detected).toBe(true);
    // Confidence: 0.5 (explicitProcessChange) + 0.2 (workflowFiles) + 0.2 (docSteps) = 0.9
    expect(result.confidence_suggestion).toBeGreaterThanOrEqual(0.65);
    expect(result.recommended_action).toBe('generate_patch');
  });
});

// ============================================================================
// PROCESS PATCH SAFETY MODE TESTS
// ============================================================================
import { selectPatchStyle } from '../config/driftMatrix.js';

describe('Process Patch Safety Mode', () => {
  it('should return reorder_steps only when confidence AND drift_score meet thresholds', () => {
    // High confidence (0.8) AND high drift score (0.7) = reorder_steps
    const style1 = selectPatchStyle('process', 'incident', 0.8, 0.7);
    expect(style1).toBe('reorder_steps');
  });

  it('should return add_note when confidence is high but drift_score is low', () => {
    // High confidence (0.8) but low drift score (0.4) = add_note (safety)
    const style = selectPatchStyle('process', 'incident', 0.8, 0.4);
    expect(style).toBe('add_note');
  });

  it('should return add_note when drift_score is high but confidence is low', () => {
    // Low confidence (0.6) but high drift score (0.8) = add_note (safety)
    const style = selectPatchStyle('process', 'incident', 0.6, 0.8);
    expect(style).toBe('add_note');
  });

  it('should return add_note when drift_score is undefined for process drift', () => {
    // No drift score provided = add_note (safety)
    const style = selectPatchStyle('process', 'incident', 0.8);
    expect(style).toBe('add_note');
  });

  it('should not apply safety mode to non-process drift types', () => {
    // Ownership drift with high confidence should get update_owner_block
    const style = selectPatchStyle('ownership', 'pagerduty', 0.85);
    expect(style).toBe('update_owner_block');
  });
});
