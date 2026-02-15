/**
 * ContractPack CRUD Operations Tests
 * Week 5-6 Task 2: ContractPack Model Testing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../../lib/db.js';
import type { Contract } from '../../services/contracts/types.js';

describe('ContractPack CRUD Operations', () => {
  const testWorkspaceId = 'test-workspace-contractpack-' + Date.now();

  beforeEach(async () => {
    // Create test workspace
    await prisma.workspace.create({
      data: {
        id: testWorkspaceId,
        name: 'Test Workspace',
        slug: `test-workspace-${Date.now()}`,
        ownerEmail: 'test@example.com',
      },
    });
  });

  afterEach(async () => {
    // Clean up
    await prisma.contractPack.deleteMany({ where: { workspaceId: testWorkspaceId } });
    try {
      await prisma.workspace.delete({ where: { id: testWorkspaceId } });
    } catch (error) {
      // Workspace already deleted in cascade test, ignore
    }
  });

  it('should create a contract pack with minimal fields', async () => {
    const contractPack = await prisma.contractPack.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'Test Pack',
        contracts: [],
      },
    });

    expect(contractPack).toBeDefined();
    expect(contractPack.name).toBe('Test Pack');
    expect(contractPack.version).toBe('v1'); // Default value
    expect(contractPack.contracts).toEqual([]);
    expect(contractPack.dictionaries).toEqual({});
    expect(contractPack.extraction).toEqual({});
    expect(contractPack.safety).toEqual({});
  });

  it('should create PublicAPI starter pack', async () => {
    const publicAPIContracts: Contract[] = [
      {
        contractId: 'api-openapi-contract',
        name: 'OpenAPI Contract',
        description: 'Ensures OpenAPI spec is valid and documented',
        scope: {
          tags: ['api', 'openapi'],
        },
        artifacts: [
          {
            system: 'github',
            type: 'openapi',
            locator: {
              path: 'openapi/openapi.yaml',
            },
            role: 'primary',
            required: true,
          },
          {
            system: 'github',
            type: 'readme',
            locator: {
              path: 'README.md',
            },
            role: 'secondary',
            required: true,
          },
        ],
        invariants: [
          {
            invariantId: 'openapi-valid',
            name: 'OpenAPI Validation',
            description: 'OpenAPI spec must be valid',
            enabled: true,
            severity: 'critical',
            comparatorType: 'openapi.validate',
          },
          {
            invariantId: 'openapi-breaking-changes',
            name: 'Breaking Changes Detection',
            description: 'Detect breaking changes in API',
            enabled: true,
            severity: 'high',
            comparatorType: 'openapi.diff',
          },
        ],
        enforcement: {
          mode: 'pr_gate',
          blockOnFail: true,
          warnOnWarn: true,
          requireApprovalOverride: true,
        },
        routing: {
          method: 'codeowners',
          fallbackChannel: '#api-team',
        },
        writeback: {
          enabled: false,
          requiresApproval: true,
          targetArtifacts: [],
        },
      },
    ];

    const contractPack = await prisma.contractPack.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'PublicAPI',
        description: 'Ensures public API changes maintain contract integrity',
        contracts: publicAPIContracts as any,
        dictionaries: {
          services: {
            'payment-api': 'Payment Service API',
            'user-api': 'User Management API',
          },
        },
        extraction: {
          tokenLimits: {
            openapi: 50000,
            readme: 10000,
          },
        },
        safety: {
          secretPatterns: [
            'API_KEY',
            'SECRET',
            'PASSWORD',
          ],
        },
      },
    });

    expect(contractPack.name).toBe('PublicAPI');
    expect(contractPack.contracts).toHaveLength(1);
    expect((contractPack.contracts as any)[0].contractId).toBe('api-openapi-contract');
  });

  it('should create PrivilegedInfra starter pack', async () => {
    const infraContracts: Contract[] = [
      {
        contractId: 'infra-terraform-contract',
        name: 'Terraform Infrastructure Contract',
        description: 'Ensures Terraform changes are documented and reviewed',
        scope: {
          tags: ['infrastructure', 'terraform', 'iam'],
        },
        artifacts: [
          {
            system: 'github',
            type: 'iac_terraform',
            locator: {
              path: 'terraform/',
            },
            role: 'primary',
            required: true,
          },
          {
            system: 'github',
            type: 'readme',
            locator: {
              path: 'docs/infrastructure.md',
            },
            role: 'secondary',
            required: false,
          },
        ],
        invariants: [
          {
            invariantId: 'terraform-documented',
            name: 'Terraform Documentation',
            description: 'All Terraform resources must be documented',
            enabled: true,
            severity: 'high',
            comparatorType: 'terraform.docs_parity',
          },
          {
            invariantId: 'iam-changes-reviewed',
            name: 'IAM Changes Review',
            description: 'IAM changes require security team review',
            enabled: true,
            severity: 'critical',
            comparatorType: 'terraform.iam_review',
          },
        ],
        enforcement: {
          mode: 'pr_gate',
          blockOnFail: true,
          warnOnWarn: true,
          requireApprovalOverride: true,
        },
        routing: {
          method: 'codeowners',
          fallbackChannel: '#platform-team',
        },
        writeback: {
          enabled: false,
          requiresApproval: true,
          targetArtifacts: [],
        },
      },
    ];

    const contractPack = await prisma.contractPack.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'PrivilegedInfra',
        description: 'Ensures infrastructure changes are secure and documented',
        contracts: infraContracts as any,
        dictionaries: {
          environments: {
            prod: 'Production',
            staging: 'Staging',
            dev: 'Development',
          },
        },
        extraction: {
          tokenLimits: {
            terraform: 100000,
            readme: 20000,
          },
        },
        safety: {
          immutableSections: [
            'production-iam-roles',
            'security-groups',
          ],
        },
      },
    });

    expect(contractPack.name).toBe('PrivilegedInfra');
    expect(contractPack.contracts).toHaveLength(1);
    expect((contractPack.contracts as any)[0].contractId).toBe('infra-terraform-contract');
  });

  it('should list all contract packs for a workspace', async () => {
    // Create multiple packs
    await prisma.contractPack.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'Pack 1',
        contracts: [],
      },
    });

    await prisma.contractPack.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'Pack 2',
        contracts: [],
      },
    });

    const packs = await prisma.contractPack.findMany({
      where: { workspaceId: testWorkspaceId },
      orderBy: { createdAt: 'desc' },
    });

    expect(packs).toHaveLength(2);
    expect(packs[0].name).toBe('Pack 2'); // Most recent first
    expect(packs[1].name).toBe('Pack 1');
  });

  it('should get a specific contract pack by id', async () => {
    const created = await prisma.contractPack.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'Specific Pack',
        contracts: [],
      },
    });

    const found = await prisma.contractPack.findUnique({
      where: {
        workspaceId_id: {
          workspaceId: testWorkspaceId,
          id: created.id,
        },
      },
    });

    expect(found).toBeDefined();
    expect(found?.name).toBe('Specific Pack');
    expect(found?.id).toBe(created.id);
  });

  it('should update a contract pack', async () => {
    const created = await prisma.contractPack.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'Original Name',
        description: 'Original description',
        contracts: [],
      },
    });

    const updated = await prisma.contractPack.update({
      where: {
        workspaceId_id: {
          workspaceId: testWorkspaceId,
          id: created.id,
        },
      },
      data: {
        name: 'Updated Name',
        description: 'Updated description',
      },
    });

    expect(updated.name).toBe('Updated Name');
    expect(updated.description).toBe('Updated description');
  });

  it('should delete a contract pack', async () => {
    const created = await prisma.contractPack.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'To Delete',
        contracts: [],
      },
    });

    await prisma.contractPack.delete({
      where: {
        workspaceId_id: {
          workspaceId: testWorkspaceId,
          id: created.id,
        },
      },
    });

    const found = await prisma.contractPack.findUnique({
      where: {
        workspaceId_id: {
          workspaceId: testWorkspaceId,
          id: created.id,
        },
      },
    });

    expect(found).toBeNull();
  });

  it('should cascade delete packs when workspace is deleted', async () => {
    await prisma.contractPack.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'Pack to cascade delete',
        contracts: [],
      },
    });

    await prisma.workspace.delete({ where: { id: testWorkspaceId } });

    const packs = await prisma.contractPack.findMany({
      where: { workspaceId: testWorkspaceId },
    });

    expect(packs).toHaveLength(0);
  });

  it('should support versioning', async () => {
    const v1 = await prisma.contractPack.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'Versioned Pack',
        version: 'v1',
        contracts: [],
      },
    });

    const v2 = await prisma.contractPack.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'Versioned Pack',
        version: 'v2',
        contracts: [],
      },
    });

    expect(v1.version).toBe('v1');
    expect(v2.version).toBe('v2');
    expect(v1.id).not.toBe(v2.id);
  });

  it('should store complex contracts with multiple artifacts', async () => {
    const complexContract: Contract = {
      contractId: 'complex-contract',
      name: 'Complex Multi-Artifact Contract',
      description: 'Contract with multiple artifact types',
      scope: {
        service: 'payment-service',
        repo: 'acme/payments',
        tags: ['api', 'infrastructure', 'docs'],
      },
      artifacts: [
        {
          system: 'github',
          type: 'openapi',
          locator: { path: 'openapi.yaml' },
          role: 'primary',
          required: true,
        },
        {
          system: 'confluence',
          type: 'confluence_page',
          locator: { pageId: '123456' },
          role: 'secondary',
          required: false,
        },
        {
          system: 'grafana',
          type: 'grafana_dashboard',
          locator: { dashboardUid: 'abc123' },
          role: 'reference',
          required: false,
        },
      ],
      invariants: [
        {
          invariantId: 'multi-check-1',
          name: 'Check 1',
          enabled: true,
          severity: 'high',
          comparatorType: 'test.check',
        },
      ],
      enforcement: {
        mode: 'both',
        blockOnFail: true,
        warnOnWarn: true,
        requireApprovalOverride: false,
      },
      routing: {
        method: 'service_owner',
      },
      writeback: {
        enabled: true,
        autoApproveThreshold: 0.95,
        requiresApproval: true,
        targetArtifacts: ['confluence_page'],
      },
    };

    const pack = await prisma.contractPack.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'Complex Pack',
        contracts: [complexContract] as any,
      },
    });

    expect(pack.contracts).toHaveLength(1);
    const stored = (pack.contracts as any)[0];
    expect(stored.artifacts).toHaveLength(3);
    expect(stored.artifacts[0].system).toBe('github');
    expect(stored.artifacts[1].system).toBe('confluence');
    expect(stored.artifacts[2].system).toBe('grafana');
  });
});


