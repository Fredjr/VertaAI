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
} from './setup';

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

