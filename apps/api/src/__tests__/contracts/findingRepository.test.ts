/**
 * Tests for IntegrityFinding Repository
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '../../lib/db.js';
import {
  createFinding,
  createFindings,
  findByContractId,
  findByBand,
  calculateRiskTier,
  getFindingsSummary,
} from '../../services/contracts/findingRepository.js';
import type { IntegrityFinding } from '../../services/contracts/types.js';

// Mock Prisma
vi.mock('../../lib/db.js', () => ({
  prisma: {
    integrityFinding: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    artifactSnapshot: {
      findMany: vi.fn(),
    },
  },
}));

describe('IntegrityFinding Repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockFinding: IntegrityFinding = {
    workspaceId: 'ws-123',
    id: 'finding-123',
    contractId: 'contract-123',
    invariantId: 'inv-123',
    driftType: 'instruction',
    domains: ['api', 'docs'],
    severity: 'high',
    compared: {
      left: { artifact: { type: 'github_file', value: 'openapi.yaml' }, snapshotId: 'snap-1' },
      right: { artifact: { type: 'confluence_page', value: 'page-123' }, snapshotId: 'snap-2' },
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

  describe('createFinding', () => {
    it('should create a single finding', async () => {
      vi.mocked(prisma.integrityFinding.create).mockResolvedValue(mockFinding as any);

      await createFinding(mockFinding);

      expect(prisma.integrityFinding.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: 'ws-123',
          id: 'finding-123',
          contractId: 'contract-123',
          severity: 'high',
          band: 'warn',
        }),
      });
    });
  });

  describe('createFindings', () => {
    it('should create multiple findings', async () => {
      const findings = [mockFinding, { ...mockFinding, id: 'finding-456' }];
      vi.mocked(prisma.integrityFinding.createMany).mockResolvedValue({ count: 2 });

      await createFindings(findings);

      expect(prisma.integrityFinding.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'finding-123' }),
          expect.objectContaining({ id: 'finding-456' }),
        ]),
      });
    });

    it('should handle empty array', async () => {
      await createFindings([]);

      expect(prisma.integrityFinding.createMany).not.toHaveBeenCalled();
    });
  });

  describe('findByContractId', () => {
    it('should find findings by contract ID', async () => {
      vi.mocked(prisma.integrityFinding.findMany).mockResolvedValue([mockFinding as any]);

      const findings = await findByContractId('ws-123', 'contract-123');

      expect(findings).toHaveLength(1);
      expect(findings[0].contractId).toBe('contract-123');
      expect(prisma.integrityFinding.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-123', contractId: 'contract-123' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findByBand', () => {
    it('should find findings by band', async () => {
      vi.mocked(prisma.integrityFinding.findMany).mockResolvedValue([mockFinding as any]);

      const findings = await findByBand('ws-123', 'warn');

      expect(findings).toHaveLength(1);
      expect(findings[0].band).toBe('warn');
      expect(prisma.integrityFinding.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-123', band: 'warn' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('calculateRiskTier', () => {
    it('should return FAIL for critical findings', () => {
      const findings = [{ ...mockFinding, severity: 'critical' as const }];
      const result = calculateRiskTier(findings);

      expect(result.band).toBe('fail');
      expect(result.criticalCount).toBe(1);
    });

    it('should return WARN for high findings', () => {
      const findings = [{ ...mockFinding, severity: 'high' as const }];
      const result = calculateRiskTier(findings);

      expect(result.band).toBe('warn');
      expect(result.highCount).toBe(1);
    });

    it('should return PASS for low findings', () => {
      const findings = [{ ...mockFinding, severity: 'low' as const }];
      const result = calculateRiskTier(findings);

      expect(result.band).toBe('pass');
      expect(result.lowCount).toBe(1);
    });
  });
});

