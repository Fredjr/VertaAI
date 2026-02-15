import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('ContractPolicy Model', () => {
  const testWorkspaceId = 'test-workspace-contract-policy';

  beforeEach(async () => {
    // Create test workspace
    await prisma.workspace.create({
      data: {
        id: testWorkspaceId,
        name: 'Test Workspace',
        slug: 'test-workspace-policy',
        ownerEmail: 'test@example.com',
      },
    });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.contractPolicy.deleteMany({ where: { workspaceId: testWorkspaceId } });
    // Try to delete workspace (may already be deleted in cascade test)
    try {
      await prisma.workspace.delete({ where: { id: testWorkspaceId } });
    } catch (error) {
      // Workspace already deleted, ignore
    }
  });

  it('should create a contract policy with default values', async () => {
    const policy = await prisma.contractPolicy.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'Default Policy',
        description: 'A test policy with defaults',
      },
    });

    expect(policy).toBeDefined();
    expect(policy.name).toBe('Default Policy');
    expect(policy.mode).toBe('warn_only');
    expect(policy.criticalThreshold).toBe(90);
    expect(policy.highThreshold).toBe(70);
    expect(policy.mediumThreshold).toBe(40);
    expect(policy.active).toBe(true);
    expect(policy.gracefulDegradation).toEqual({});
    expect(policy.appliesTo).toEqual([]);
  });

  it('should create a policy with custom enforcement mode', async () => {
    const policy = await prisma.contractPolicy.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'Strict Policy',
        mode: 'block_all_critical',
        criticalThreshold: 95,
        highThreshold: 75,
        mediumThreshold: 50,
      },
    });

    expect(policy.mode).toBe('block_all_critical');
    expect(policy.criticalThreshold).toBe(95);
    expect(policy.highThreshold).toBe(75);
    expect(policy.mediumThreshold).toBe(50);
  });

  it('should create a policy with graceful degradation settings', async () => {
    const gracefulDegradation = {
      timeoutMs: 30000,
      maxArtifactFetchFailures: 3,
      fallbackMode: 'warn_only',
      enableSoftFail: true,
    };

    const policy = await prisma.contractPolicy.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'Resilient Policy',
        gracefulDegradation,
      },
    });

    expect(policy.gracefulDegradation).toEqual(gracefulDegradation);
  });

  it('should create a policy with appliesTo rules', async () => {
    const appliesTo = [
      { type: 'surface', value: 'api' },
      { type: 'repo', value: 'owner/repo' },
      { type: 'service', value: 'payment-service' },
    ];

    const policy = await prisma.contractPolicy.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'Scoped Policy',
        appliesTo,
      },
    });

    expect(policy.appliesTo).toEqual(appliesTo);
  });

  it('should update a contract policy', async () => {
    const policy = await prisma.contractPolicy.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'Original Policy',
        mode: 'warn_only',
      },
    });

    const updated = await prisma.contractPolicy.update({
      where: {
        workspaceId_id: {
          workspaceId: testWorkspaceId,
          id: policy.id,
        },
      },
      data: {
        name: 'Updated Policy',
        mode: 'block_high_critical',
      },
    });

    expect(updated.name).toBe('Updated Policy');
    expect(updated.mode).toBe('block_high_critical');
  });

  it('should delete a contract policy', async () => {
    const policy = await prisma.contractPolicy.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'To Be Deleted',
      },
    });

    await prisma.contractPolicy.delete({
      where: {
        workspaceId_id: {
          workspaceId: testWorkspaceId,
          id: policy.id,
        },
      },
    });

    const found = await prisma.contractPolicy.findUnique({
      where: {
        workspaceId_id: {
          workspaceId: testWorkspaceId,
          id: policy.id,
        },
      },
    });

    expect(found).toBeNull();
  });

  it('should list all policies for a workspace', async () => {
    await prisma.contractPolicy.createMany({
      data: [
        {
          workspaceId: testWorkspaceId,
          name: 'Policy 1',
          mode: 'warn_only',
        },
        {
          workspaceId: testWorkspaceId,
          name: 'Policy 2',
          mode: 'block_high_critical',
        },
        {
          workspaceId: testWorkspaceId,
          name: 'Policy 3',
          mode: 'block_all_critical',
          active: false,
        },
      ],
    });

    const policies = await prisma.contractPolicy.findMany({
      where: { workspaceId: testWorkspaceId },
      orderBy: { name: 'asc' },
    });

    expect(policies).toHaveLength(3);
    expect(policies[0].name).toBe('Policy 1');
    expect(policies[1].name).toBe('Policy 2');
    expect(policies[2].name).toBe('Policy 3');
  });

  it('should filter active policies only', async () => {
    await prisma.contractPolicy.createMany({
      data: [
        {
          workspaceId: testWorkspaceId,
          name: 'Active Policy',
          active: true,
        },
        {
          workspaceId: testWorkspaceId,
          name: 'Inactive Policy',
          active: false,
        },
      ],
    });

    const activePolicies = await prisma.contractPolicy.findMany({
      where: {
        workspaceId: testWorkspaceId,
        active: true,
      },
    });

    expect(activePolicies).toHaveLength(1);
    expect(activePolicies[0].name).toBe('Active Policy');
  });

  it('should cascade delete policies when workspace is deleted', async () => {
    const policy = await prisma.contractPolicy.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'Policy to Cascade',
      },
    });

    // Delete workspace (should cascade to policies)
    await prisma.workspace.delete({ where: { id: testWorkspaceId } });

    const found = await prisma.contractPolicy.findUnique({
      where: {
        workspaceId_id: {
          workspaceId: testWorkspaceId,
          id: policy.id,
        },
      },
    });

    expect(found).toBeNull();
  });

  it('should deactivate a policy instead of deleting', async () => {
    const policy = await prisma.contractPolicy.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'Policy to Deactivate',
        active: true,
      },
    });

    const updated = await prisma.contractPolicy.update({
      where: {
        workspaceId_id: {
          workspaceId: testWorkspaceId,
          id: policy.id,
        },
      },
      data: { active: false },
    });

    expect(updated.active).toBe(false);
  });
});

