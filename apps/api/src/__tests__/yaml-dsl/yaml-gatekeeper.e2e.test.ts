/**
 * YAML DSL Gatekeeper E2E Test
 * 
 * Tests the complete flow:
 * 1. Pack selection (workspace/service/repo precedence)
 * 2. Pack evaluation with all 10 comparators
 * 3. GitHub Check creation
 * 4. Decision logic (PASS/WARN/BLOCK)
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { runYAMLGatekeeper } from '../../services/gatekeeper/yaml-dsl/yamlGatekeeperIntegration.js';
import { selectApplicablePack } from '../../services/gatekeeper/yaml-dsl/packSelector.js';
import { initializeComparators } from '../../services/gatekeeper/yaml-dsl/comparators/index.js';
import type { GatekeeperInput } from '../../services/gatekeeper/index.js';

const prisma = new PrismaClient();

// Test workspace created by setup script
const WORKSPACE_ID = 'test-yaml-e2e-1771372620592';
const PACK_ID = 'e2e-test-pack';

// Mock Octokit for GitHub API calls
const mockOctokit = {
  rest: {
    pulls: {
      get: vi.fn().mockResolvedValue({
        data: {
          user: { login: 'test-user', type: 'User' },
          title: 'Test PR',
          body: 'This is a test PR description',
          labels: [],
          base: { ref: 'main', sha: 'base-sha-123' },
          head: { ref: 'feature/test', sha: 'head-sha-456' },
        },
      }),
      listReviews: vi.fn().mockResolvedValue({
        data: [
          { user: { login: 'reviewer1', type: 'User' }, state: 'APPROVED', body: 'LGTM' },
        ],
      }),
      listFiles: vi.fn().mockResolvedValue({
        data: [
          { filename: 'src/routes/api.ts', status: 'modified', additions: 10, deletions: 5 },
          { filename: 'README.md', status: 'modified', additions: 2, deletions: 1 },
        ],
      }),
    },
    repos: {
      compareCommits: vi.fn().mockResolvedValue({
        data: {
          files: [
            { filename: 'src/routes/api.ts', status: 'modified', patch: '+console.log("test");' },
            { filename: 'README.md', status: 'modified', patch: '+# Updated docs' },
          ],
        },
      }),
      getContent: vi.fn().mockResolvedValue({
        data: {
          content: Buffer.from('openapi: 3.0.0\ninfo:\n  title: Test API\n  version: 1.0.0\npaths: {}').toString('base64'),
          encoding: 'base64',
        },
      }),
    },
    checks: {
      listForRef: vi.fn().mockResolvedValue({
        data: {
          check_runs: [
            { name: 'build', status: 'completed', conclusion: 'success' },
            { name: 'test', status: 'completed', conclusion: 'success' },
          ],
        },
      }),
    },
  },
};

describe('YAML DSL Gatekeeper E2E', () => {
  beforeAll(() => {
    // Initialize comparators
    initializeComparators();
  });

  describe('Pack Selection', () => {
    it('should select workspace-scoped pack', async () => {
      const selectedPack = await selectApplicablePack(
        prisma,
        WORKSPACE_ID,
        'test-org',
        'test-repo',
        'main'
      );

      expect(selectedPack).not.toBeNull();
      expect(selectedPack?.source).toBe('workspace');
      expect(selectedPack?.pack.metadata.id).toBe('e2e-comprehensive-pack');
      expect(selectedPack?.pack.metadata.version).toBe('1.0.0');
      expect(selectedPack?.pack.rules).toHaveLength(7);
    });

    it('should return null for workspace without pack', async () => {
      const selectedPack = await selectApplicablePack(
        prisma,
        'non-existent-workspace',
        'test-org',
        'test-repo',
        'main'
      );

      expect(selectedPack).toBeNull();
    });
  });

  describe('Pack Evaluation - Human User PR (PASS)', () => {
    it('should PASS for human-authored PR with approval', async () => {
      const input: GatekeeperInput = {
        owner: 'test-org',
        repo: 'test-repo',
        prNumber: 123,
        headSha: 'head-sha-456',
        baseSha: 'base-sha-123',
        author: 'test-user',
        title: 'Test PR',
        body: 'This is a test PR description',
        labels: [],
        baseBranch: 'main',
        headBranch: 'feature/test',
        commits: [],
        workspaceId: WORKSPACE_ID,
        installationId: 12345,
      };

      const result = await runYAMLGatekeeper(prisma, input, mockOctokit);

      expect(result).not.toBeNull();
      expect(result?.decision).toBe('pass');
      expect(result?.packUsed).toBe(true);
      expect(result?.packSource).toBe('workspace');
      expect(result?.triggeredRules).toContain('pr-description-required');
      expect(result?.triggeredRules).toContain('ci-must-pass');
    });
  });

  describe('Pack Evaluation - Agent PR (BLOCK)', () => {
    it('should BLOCK for agent-authored PR without human approval', async () => {
      // Mock agent PR
      mockOctokit.rest.pulls.get.mockResolvedValueOnce({
        data: {
          user: { login: 'dependabot[bot]', type: 'Bot' },
          title: 'Bump dependencies',
          body: 'Auto-generated PR',
          labels: [],
          base: { ref: 'main', sha: 'base-sha-123' },
          head: { ref: 'dependabot/npm/lodash', sha: 'head-sha-789' },
        },
      });

      mockOctokit.rest.pulls.listReviews.mockResolvedValueOnce({
        data: [], // No reviews
      });

      const input: GatekeeperInput = {
        owner: 'test-org',
        repo: 'test-repo',
        prNumber: 124,
        headSha: 'head-sha-789',
        baseSha: 'base-sha-123',
        author: 'dependabot[bot]',
        title: 'Bump dependencies',
        body: 'Auto-generated PR',
        labels: [],
        baseBranch: 'main',
        headBranch: 'dependabot/npm/lodash',
        commits: [],
        workspaceId: WORKSPACE_ID,
        installationId: 12345,
      };

      const result = await runYAMLGatekeeper(prisma, input, mockOctokit);

      expect(result).not.toBeNull();
      expect(result?.decision).toBe('block');
      expect(result?.triggeredRules).toContain('agent-pr-requires-human-approval');
      
      // Find the blocking finding
      const blockingFinding = result?.findings.find(
        (f: any) => f.ruleId === 'agent-pr-requires-human-approval'
      );
      expect(blockingFinding).toBeDefined();
      expect(blockingFinding?.decisionOnFail).toBe('block');
    });
  });

  describe('Pack Evaluation - API Changes (WARN)', () => {
    it('should WARN when API routes change without OpenAPI update', async () => {
      // Mock PR with API changes but no OpenAPI update
      mockOctokit.rest.pulls.listFiles.mockResolvedValueOnce({
        data: [
          { filename: 'src/routes/users.ts', status: 'modified', additions: 20, deletions: 5 },
          { filename: 'src/routes/auth.ts', status: 'added', additions: 50, deletions: 0 },
        ],
      });

      mockOctokit.rest.repos.compareCommits.mockResolvedValueOnce({
        data: {
          files: [
            { filename: 'src/routes/users.ts', status: 'modified', patch: '+export function getUser() {}' },
            { filename: 'src/routes/auth.ts', status: 'added', patch: '+export function login() {}' },
          ],
        },
      });

      // No OpenAPI file in the diff
      mockOctokit.rest.repos.getContent.mockRejectedValueOnce({
        status: 404,
        message: 'Not Found',
      });

      const input: GatekeeperInput = {
        owner: 'test-org',
        repo: 'test-repo',
        prNumber: 125,
        headSha: 'head-sha-api',
        baseSha: 'base-sha-123',
        author: 'developer',
        title: 'Add new API endpoints',
        body: 'Added user and auth endpoints',
        labels: [],
        baseBranch: 'main',
        headBranch: 'feature/new-api',
        commits: [],
        workspaceId: WORKSPACE_ID,
        installationId: 12345,
      };

      const result = await runYAMLGatekeeper(prisma, input, mockOctokit);

      expect(result).not.toBeNull();
      expect(result?.decision).toBe('warn');
      expect(result?.triggeredRules).toContain('api-changes-require-openapi-update');
    });
  });

  describe('Pack Evaluation - Infrastructure Changes (BLOCK)', () => {
    it('should BLOCK infrastructure changes without 2 approvals', async () => {
      // Mock PR with infrastructure changes
      mockOctokit.rest.pulls.listFiles.mockResolvedValueOnce({
        data: [
          { filename: 'infrastructure/terraform/main.tf', status: 'modified', additions: 10, deletions: 2 },
          { filename: 'k8s/deployment.yaml', status: 'modified', additions: 5, deletions: 1 },
        ],
      });

      mockOctokit.rest.repos.compareCommits.mockResolvedValueOnce({
        data: {
          files: [
            { filename: 'infrastructure/terraform/main.tf', status: 'modified', patch: '+resource "aws_instance" {}' },
            { filename: 'k8s/deployment.yaml', status: 'modified', patch: '+replicas: 3' },
          ],
        },
      });

      // Only 1 approval (need 2)
      mockOctokit.rest.pulls.listReviews.mockResolvedValueOnce({
        data: [
          { user: { login: 'reviewer1', type: 'User' }, state: 'APPROVED', body: 'LGTM' },
        ],
      });

      const input: GatekeeperInput = {
        owner: 'test-org',
        repo: 'test-repo',
        prNumber: 126,
        headSha: 'head-sha-infra',
        baseSha: 'base-sha-123',
        author: 'devops-engineer',
        title: 'Update infrastructure',
        body: 'Scaling up production',
        labels: [],
        baseBranch: 'main',
        headBranch: 'feature/scale-up',
        commits: [],
        workspaceId: WORKSPACE_ID,
        installationId: 12345,
      };

      const result = await runYAMLGatekeeper(prisma, input, mockOctokit);

      expect(result).not.toBeNull();
      expect(result?.decision).toBe('block');
      expect(result?.triggeredRules).toContain('production-changes-require-two-approvals');

      const blockingFinding = result?.findings.find(
        (f: any) => f.ruleId === 'production-changes-require-two-approvals'
      );
      expect(blockingFinding).toBeDefined();
      expect(blockingFinding?.comparatorResult.status).toBe('fail');
    });
  });

  describe('Pack Evaluation - Secrets Detection (BLOCK)', () => {
    it('should BLOCK PRs with secrets in diff', async () => {
      // Mock PR with secrets
      mockOctokit.rest.repos.compareCommits.mockResolvedValueOnce({
        data: {
          files: [
            {
              filename: 'config/database.ts',
              status: 'modified',
              patch: '+const API_KEY = "sk_live_1234567890abcdef";\n+const PASSWORD = "super_secret_password";',
            },
          ],
        },
      });

      const input: GatekeeperInput = {
        owner: 'test-org',
        repo: 'test-repo',
        prNumber: 127,
        headSha: 'head-sha-secrets',
        baseSha: 'base-sha-123',
        author: 'junior-dev',
        title: 'Add database config',
        body: 'Added database configuration',
        labels: [],
        baseBranch: 'main',
        headBranch: 'feature/db-config',
        commits: [],
        workspaceId: WORKSPACE_ID,
        installationId: 12345,
      };

      const result = await runYAMLGatekeeper(prisma, input, mockOctokit);

      expect(result).not.toBeNull();
      expect(result?.decision).toBe('block');
      expect(result?.triggeredRules).toContain('no-secrets-allowed');

      const secretsFinding = result?.findings.find(
        (f: any) => f.ruleId === 'no-secrets-allowed'
      );
      expect(secretsFinding).toBeDefined();
      expect(secretsFinding?.comparatorResult.status).toBe('fail');
      expect(secretsFinding?.comparatorResult.evidence).toBeDefined();
    });
  });

  describe('Integration with Legacy Gatekeeper', () => {
    it('should return null for workspace without YAML pack (fallback to legacy)', async () => {
      const input: GatekeeperInput = {
        owner: 'test-org',
        repo: 'test-repo',
        prNumber: 128,
        headSha: 'head-sha-legacy',
        baseSha: 'base-sha-123',
        author: 'test-user',
        title: 'Test PR',
        body: 'Test',
        labels: [],
        baseBranch: 'main',
        headBranch: 'feature/test',
        commits: [],
        workspaceId: 'non-existent-workspace',
        installationId: 12345,
      };

      const result = await runYAMLGatekeeper(prisma, input, mockOctokit);

      expect(result).toBeNull(); // Should fallback to legacy gatekeeper
    });
  });
});


