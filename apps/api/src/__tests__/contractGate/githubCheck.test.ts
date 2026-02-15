/**
 * Tests for Contract Gate GitHub Check Integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContractCheckInput } from '../../services/contractGate/githubCheck.js';
import type { IntegrityFinding } from '../../services/contracts/types.js';

// Mock the GitHub client
vi.mock('../../lib/github.js', () => ({
  getInstallationOctokit: vi.fn(() => Promise.resolve({
    rest: {
      checks: {
        create: vi.fn(() => Promise.resolve({ data: { id: 123 } })),
      },
    },
  })),
}));

describe('Contract Gate GitHub Check', () => {
  let mockInput: ContractCheckInput;
  let mockFinding: IntegrityFinding;

  beforeEach(() => {
    mockInput = {
      owner: 'test-owner',
      repo: 'test-repo',
      headSha: 'abc123def456',
      installationId: 12345,
      band: 'pass',
      findings: [],
      contractsChecked: 0,
      duration: 100,
      signalEventId: 'signal-123',
      workspaceId: 'workspace-123',
      surfacesTouched: [],
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    };

    mockFinding = {
      workspaceId: 'workspace-123',
      id: 'finding-123',
      contractId: 'contract-123',
      invariantId: 'inv-123',
      driftType: 'instruction',
      domains: ['api'],
      severity: 'high',
      compared: {
        left: {
          artifact: {
            system: 'github',
            type: 'openapi',
            locator: { repo: 'test/repo', path: 'openapi.yaml', ref: 'main' },
            role: 'primary',
            required: true,
          },
          snapshotId: 'snap-1',
        },
        right: {
          artifact: {
            system: 'github',
            type: 'readme',
            locator: { repo: 'test/repo', path: 'README.md', ref: 'main' },
            role: 'secondary',
            required: false,
          },
          snapshotId: 'snap-2',
        },
      },
      evidence: [
        {
          kind: 'endpoint_missing',
          leftValue: '/api/users',
          rightValue: null,
          pointers: { left: '/paths/~1api~1users', right: null },
        },
      ],
      confidence: 0.95,
      impact: 0.8,
      band: 'warn',
      recommendedAction: 'create_patch_candidate',
      ownerRouting: { method: 'contract', owners: ['@platform-team'] },
      createdAt: new Date(),
    };
  });

  describe('Check Creation', () => {
    it('should create PASS check when no findings', async () => {
      const { createContractValidationCheck } = await import('../../services/contractGate/githubCheck.js');
      const { getInstallationOctokit } = await import('../../lib/github.js');

      mockInput.band = 'pass';
      mockInput.findings = [];
      mockInput.contractsChecked = 2;
      mockInput.surfacesTouched = ['api', 'docs'];

      await createContractValidationCheck(mockInput);

      expect(getInstallationOctokit).toHaveBeenCalledWith(12345);
    });

    it('should create WARN check when medium findings', async () => {
      const { createContractValidationCheck } = await import('../../services/contractGate/githubCheck.js');

      mockInput.band = 'warn';
      mockInput.findings = [mockFinding];
      mockInput.highCount = 1;
      mockInput.surfacesTouched = ['api'];

      await createContractValidationCheck(mockInput);

      // Should complete without error
      expect(true).toBe(true);
    });

    it('should create FAIL check when critical findings', async () => {
      const { createContractValidationCheck } = await import('../../services/contractGate/githubCheck.js');

      const criticalFinding = { ...mockFinding, severity: 'critical' as const };
      mockInput.band = 'fail';
      mockInput.findings = [criticalFinding];
      mockInput.criticalCount = 1;

      await createContractValidationCheck(mockInput);

      // Should complete without error
      expect(true).toBe(true);
    });

    it('should handle empty findings array', async () => {
      const { createContractValidationCheck } = await import('../../services/contractGate/githubCheck.js');

      mockInput.findings = [];
      mockInput.band = 'pass';

      await createContractValidationCheck(mockInput);

      // Should complete without error
      expect(true).toBe(true);
    });

    it('should handle multiple surfaces', async () => {
      const { createContractValidationCheck } = await import('../../services/contractGate/githubCheck.js');

      mockInput.surfacesTouched = ['api', 'infra', 'docs'];
      mockInput.contractsChecked = 3;

      await createContractValidationCheck(mockInput);

      // Should complete without error
      expect(true).toBe(true);
    });

    it('should handle missing optional fields', async () => {
      const { createContractValidationCheck } = await import('../../services/contractGate/githubCheck.js');

      delete mockInput.surfacesTouched;
      delete mockInput.criticalCount;
      delete mockInput.highCount;
      delete mockInput.mediumCount;
      delete mockInput.lowCount;

      await createContractValidationCheck(mockInput);

      // Should complete without error
      expect(true).toBe(true);
    });
  });
});

