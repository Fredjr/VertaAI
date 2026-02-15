/**
 * Policy Enforcement Tests
 * Week 5-6 Task 3: Wire Policy Enforcement
 * 
 * Tests ContractPolicy enforcement modes and thresholds
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../../lib/db.js';
import { calculateRiskTier } from '../../services/contracts/findingRepository.js';
import type { IntegrityFinding } from '../../services/contracts/types.js';

const testWorkspaceId = 'test-workspace-policy-enforcement';

// Mock finding factory
function createMockFinding(severity: 'low' | 'medium' | 'high' | 'critical'): IntegrityFinding {
  return {
    workspaceId: testWorkspaceId,
    id: `finding-${Math.random()}`,
    contractId: 'contract-1',
    invariantId: 'invariant-1',
    driftType: 'instruction',
    domains: ['api'],
    severity,
    compared: {
      left: {
        artifact: {
          system: 'github',
          type: 'openapi',
          locator: { repo: 'test/repo', path: '/spec/openapi.yaml' },
          role: 'primary',
          required: true,
        },
        snapshotId: 'snapshot-1',
      },
      right: {
        artifact: {
          system: 'github',
          type: 'readme',
          locator: { repo: 'test/repo', path: '/README.md' },
          role: 'secondary',
          required: false,
        },
        snapshotId: 'snapshot-2',
      },
    },
    evidence: [],
    confidence: 0.9,
    impact: 0.8,
    band: 'fail',
    recommendedAction: 'block_merge',
    ownerRouting: {
      method: 'contract',
      owners: ['@team-api'],
    },
    createdAt: new Date(),
  };
}

describe('Policy Enforcement', () => {
  beforeEach(async () => {
    // Create test workspace
    await prisma.workspace.create({
      data: {
        id: testWorkspaceId,
        name: 'Test Workspace - Policy Enforcement',
        slug: 'test-workspace-policy-enforcement',
        ownerEmail: 'test@example.com',
      },
    });
  });

  afterEach(async () => {
    // Clean up
    await prisma.contractPolicy.deleteMany({ where: { workspaceId: testWorkspaceId } });
    try {
      await prisma.workspace.delete({ where: { id: testWorkspaceId } });
    } catch (error) {
      // Workspace already deleted, ignore
    }
  });

  describe('calculateRiskTier with policy modes', () => {
    it('should use default behavior when no policy provided', () => {
      const findings = [
        createMockFinding('critical'),
        createMockFinding('high'),
      ];

      const result = calculateRiskTier(findings);

      expect(result.band).toBe('fail'); // Default: fail on critical
      expect(result.criticalCount).toBe(1);
      expect(result.highCount).toBe(1);
      expect(result.policyMode).toBeUndefined();
    });

    it('should enforce warn_only mode (never blocks)', () => {
      const findings = [
        createMockFinding('critical'),
        createMockFinding('high'),
        createMockFinding('medium'),
      ];

      const policy = { mode: 'warn_only' };
      const result = calculateRiskTier(findings, policy);

      expect(result.band).toBe('warn'); // warn_only: never fail
      expect(result.criticalCount).toBe(1);
      expect(result.policyMode).toBe('warn_only');
    });

    it('should enforce block_high_critical mode (blocks on high or critical)', () => {
      const findingsWithHigh = [
        createMockFinding('high'),
        createMockFinding('medium'),
      ];

      const policy = { mode: 'block_high_critical' };
      const result = calculateRiskTier(findingsWithHigh, policy);

      expect(result.band).toBe('fail'); // block_high_critical: fail on high
      expect(result.highCount).toBe(1);
      expect(result.policyMode).toBe('block_high_critical');
    });

    it('should enforce block_high_critical mode (warns on medium only)', () => {
      const findingsWithMedium = [
        createMockFinding('medium'),
        createMockFinding('low'),
      ];

      const policy = { mode: 'block_high_critical' };
      const result = calculateRiskTier(findingsWithMedium, policy);

      expect(result.band).toBe('warn'); // block_high_critical: warn on medium
      expect(result.mediumCount).toBe(1);
      expect(result.policyMode).toBe('block_high_critical');
    });

    it('should enforce block_all_critical mode (blocks only on critical)', () => {
      const findingsWithCritical = [
        createMockFinding('critical'),
        createMockFinding('high'),
      ];

      const policy = { mode: 'block_all_critical' };
      const result = calculateRiskTier(findingsWithCritical, policy);

      expect(result.band).toBe('fail'); // block_all_critical: fail on critical
      expect(result.criticalCount).toBe(1);
      expect(result.policyMode).toBe('block_all_critical');
    });

    it('should enforce block_all_critical mode (warns on high)', () => {
      const findingsWithHigh = [
        createMockFinding('high'),
        createMockFinding('medium'),
      ];

      const policy = { mode: 'block_all_critical' };
      const result = calculateRiskTier(findingsWithHigh, policy);

      expect(result.band).toBe('warn'); // block_all_critical: warn on high
      expect(result.highCount).toBe(1);
      expect(result.policyMode).toBe('block_all_critical');
    });

    it('should pass when no findings', () => {
      const findings: IntegrityFinding[] = [];

      const policy = { mode: 'block_all_critical' };
      const result = calculateRiskTier(findings, policy);

      expect(result.band).toBe('pass');
      expect(result.totalCount).toBe(0);
      expect(result.policyMode).toBe('block_all_critical');
    });

    it('should handle unknown policy mode gracefully', () => {
      const findings = [createMockFinding('critical')];

      const policy = { mode: 'unknown_mode' };
      const result = calculateRiskTier(findings, policy);

      // Should fall back to default behavior
      expect(result.band).toBe('fail');
      expect(result.policyMode).toBe('unknown_mode');
    });

    it('should count findings by severity correctly', () => {
      const findings = [
        createMockFinding('critical'),
        createMockFinding('critical'),
        createMockFinding('high'),
        createMockFinding('high'),
        createMockFinding('high'),
        createMockFinding('medium'),
        createMockFinding('low'),
      ];

      const result = calculateRiskTier(findings);

      expect(result.criticalCount).toBe(2);
      expect(result.highCount).toBe(3);
      expect(result.mediumCount).toBe(1);
      expect(result.lowCount).toBe(1);
      expect(result.totalCount).toBe(7);
    });
  });

  describe('ContractPolicy database integration', () => {
    it('should create and fetch active policy', async () => {
      const policy = await prisma.contractPolicy.create({
        data: {
          workspaceId: testWorkspaceId,
          name: 'Test Policy',
          mode: 'block_high_critical',
          active: true,
        },
      });

      expect(policy.mode).toBe('block_high_critical');
      expect(policy.active).toBe(true);

      // Fetch active policy
      const activePolicy = await prisma.contractPolicy.findFirst({
        where: {
          workspaceId: testWorkspaceId,
          active: true,
        },
      });

      expect(activePolicy).not.toBeNull();
      expect(activePolicy?.mode).toBe('block_high_critical');
    });

    it('should return null when no active policy exists', async () => {
      const activePolicy = await prisma.contractPolicy.findFirst({
        where: {
          workspaceId: testWorkspaceId,
          active: true,
        },
      });

      expect(activePolicy).toBeNull();
    });

    it('should use most recent active policy when multiple exist', async () => {
      // Create first policy
      await prisma.contractPolicy.create({
        data: {
          workspaceId: testWorkspaceId,
          name: 'Old Policy',
          mode: 'warn_only',
          active: true,
        },
      });

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      // Create second policy
      await prisma.contractPolicy.create({
        data: {
          workspaceId: testWorkspaceId,
          name: 'New Policy',
          mode: 'block_all_critical',
          active: true,
        },
      });

      // Fetch most recent active policy
      const activePolicy = await prisma.contractPolicy.findFirst({
        where: {
          workspaceId: testWorkspaceId,
          active: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      expect(activePolicy?.name).toBe('New Policy');
      expect(activePolicy?.mode).toBe('block_all_critical');
    });
  });
});


