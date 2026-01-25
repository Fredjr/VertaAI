/**
 * Test setup and utilities for Phase 1 testing
 */
import crypto from 'crypto';

// Test workspace data
export const TEST_WORKSPACE = {
  id: '63d61996-28c2-4050-a020-ebd784aa4076',
  name: 'Test Workspace',
  slug: 'test-workspace',
};

// Generate HMAC signature for webhook testing
export function generateWebhookSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  return 'sha256=' + hmac.update(payload).digest('hex');
}

// Create a valid PR webhook payload
export function createPRPayload(prNumber: number = 125) {
  return {
    action: 'closed',
    pull_request: {
      number: prNumber,
      merged: true,
      merged_at: new Date().toISOString(),
      title: `Test PR #${prNumber}`,
      body: 'This is a test PR for automated testing',
      html_url: `https://github.com/Fredjr/VertaAI/pull/${prNumber}`,
      head: { sha: 'abc123', ref: 'feature-branch' },
      base: { ref: 'main' },
      user: { login: 'testuser' },
      changed_files: 3,
    },
    repository: {
      full_name: 'Fredjr/VertaAI',
      name: 'VertaAI',
      owner: { login: 'Fredjr' },
    },
  };
}

// Create a ping webhook payload
export function createPingPayload() {
  return {
    zen: 'Keep it logically awesome.',
    hook_id: 12345,
  };
}

// API base URL for testing
export const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:3001';

// Webhook secret for testing
export const TEST_WEBHOOK_SECRET = 'test-secret-123';

