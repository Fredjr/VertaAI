// DriftPlan Manager Tests
// Phase 3: Control-Plane Architecture - Week 5

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../../lib/db.js';
import {
  createDriftPlan,
  getDriftPlan,
  listDriftPlans,
  updateDriftPlan,
  deleteDriftPlan,
} from '../../services/plans/manager.js';

describe('DriftPlan Manager', () => {
  const testWorkspaceId = 'test-workspace-plans';
  
  beforeEach(async () => {
    // Create test workspace
    await prisma.workspace.create({
      data: {
        id: testWorkspaceId,
        name: 'Test Workspace',
        slug: 'test-workspace-plans',
        ownerEmail: 'test@example.com',
      },
    });
  });

  afterEach(async () => {
    // Clean up
    await prisma.driftPlan.deleteMany({ where: { workspaceId: testWorkspaceId } });
    await prisma.workspace.delete({ where: { id: testWorkspaceId } });
  });

  describe('createDriftPlan', () => {
    it('should create a new drift plan with version 1', async () => {
      const plan = await createDriftPlan({
        workspaceId: testWorkspaceId,
        name: 'Test Plan',
        description: 'Test description',
        scopeType: 'workspace',
        config: {
          inputSources: ['github_pr'],
          driftTypes: ['instruction'],
          allowedOutputs: ['confluence'],
          thresholds: { minConfidence: 0.7 },
          eligibility: {},
          sectionTargets: {},
          impactRules: {},
          writeback: { enabled: false, requiresApproval: false },
        },
      });

      expect(plan).toBeDefined();
      expect(plan.name).toBe('Test Plan');
      expect(plan.version).toBe(1);
      expect(plan.versionHash).toBeDefined();
      expect(plan.status).toBe('active');
    });

    it('should create plan with template reference', async () => {
      const plan = await createDriftPlan({
        workspaceId: testWorkspaceId,
        name: 'Microservice Plan',
        scopeType: 'service',
        scopeRef: 'payment-service',
        templateId: 'microservice',
        config: {
          inputSources: ['github_pr', 'pagerduty_incident'],
          driftTypes: ['instruction', 'process'],
          allowedOutputs: ['confluence'],
          thresholds: {},
          eligibility: {},
          sectionTargets: {},
          impactRules: {},
          writeback: { enabled: false, requiresApproval: false },
        },
      });

      expect(plan.templateId).toBe('microservice');
      expect(plan.templateName).toBe('Microservice Runbook');
      expect(plan.scopeType).toBe('service');
      expect(plan.scopeRef).toBe('payment-service');
    });

    it('should create repo-scoped plan with docClass', async () => {
      const plan = await createDriftPlan({
        workspaceId: testWorkspaceId,
        name: 'Repo Runbook Plan',
        scopeType: 'repo',
        scopeRef: 'myorg/payment-service',
        docClass: 'runbook',
        config: {
          inputSources: ['github_pr'],
          driftTypes: ['instruction'],
          allowedOutputs: ['github_readme'],
          thresholds: {},
          eligibility: {},
          sectionTargets: {},
          impactRules: {},
          writeback: { enabled: false, requiresApproval: false },
        },
      });

      expect(plan.scopeType).toBe('repo');
      expect(plan.scopeRef).toBe('myorg/payment-service');
      expect(plan.docClass).toBe('runbook');
    });
  });

  describe('getDriftPlan', () => {
    it('should retrieve a plan by ID', async () => {
      const created = await createDriftPlan({
        workspaceId: testWorkspaceId,
        name: 'Test Plan',
        scopeType: 'workspace',
        config: {
          inputSources: ['github_pr'],
          driftTypes: ['instruction'],
          allowedOutputs: ['confluence'],
          thresholds: {},
          eligibility: {},
          sectionTargets: {},
          impactRules: {},
          writeback: { enabled: false, requiresApproval: false },
        },
      });

      const retrieved = await getDriftPlan({
        workspaceId: testWorkspaceId,
        planId: created.id,
      });

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('Test Plan');
    });

    it('should return null for non-existent plan', async () => {
      const plan = await getDriftPlan({
        workspaceId: testWorkspaceId,
        planId: 'non-existent-id',
      });

      expect(plan).toBeNull();
    });
  });

  describe('listDriftPlans', () => {
    it('should list all plans for a workspace', async () => {
      await createDriftPlan({
        workspaceId: testWorkspaceId,
        name: 'Plan 1',
        scopeType: 'workspace',
        config: {
          inputSources: ['github_pr'],
          driftTypes: ['instruction'],
          allowedOutputs: ['confluence'],
          thresholds: {},
          eligibility: {},
          sectionTargets: {},
          impactRules: {},
          writeback: { enabled: false, requiresApproval: false },
        },
      });

      await createDriftPlan({
        workspaceId: testWorkspaceId,
        name: 'Plan 2',
        scopeType: 'service',
        scopeRef: 'payment-service',
        config: {
          inputSources: ['github_pr'],
          driftTypes: ['instruction'],
          allowedOutputs: ['confluence'],
          thresholds: {},
          eligibility: {},
          sectionTargets: {},
          impactRules: {},
          writeback: { enabled: false, requiresApproval: false },
        },
      });

      const plans = await listDriftPlans({ workspaceId: testWorkspaceId });

      expect(plans).toHaveLength(2);
      expect(plans[0]?.name).toBeDefined();
    });

    it('should filter plans by status', async () => {
      const plan = await createDriftPlan({
        workspaceId: testWorkspaceId,
        name: 'Active Plan',
        scopeType: 'workspace',
        config: {
          inputSources: ['github_pr'],
          driftTypes: ['instruction'],
          allowedOutputs: ['confluence'],
          thresholds: {},
          eligibility: {},
          sectionTargets: {},
          impactRules: {},
          writeback: { enabled: false, requiresApproval: false },
        },
      });

      // Archive the plan
      await deleteDriftPlan({
        workspaceId: testWorkspaceId,
        planId: plan.id,
      });

      const activePlans = await listDriftPlans({
        workspaceId: testWorkspaceId,
        status: 'active',
      });

      const archivedPlans = await listDriftPlans({
        workspaceId: testWorkspaceId,
        status: 'archived',
      });

      expect(activePlans).toHaveLength(0);
      expect(archivedPlans).toHaveLength(1);
    });

    it('should filter plans by scope type', async () => {
      await createDriftPlan({
        workspaceId: testWorkspaceId,
        name: 'Workspace Plan',
        scopeType: 'workspace',
        config: {
          inputSources: ['github_pr'],
          driftTypes: ['instruction'],
          allowedOutputs: ['confluence'],
          thresholds: {},
          eligibility: {},
          sectionTargets: {},
          impactRules: {},
          writeback: { enabled: false, requiresApproval: false },
        },
      });

      await createDriftPlan({
        workspaceId: testWorkspaceId,
        name: 'Service Plan',
        scopeType: 'service',
        scopeRef: 'payment-service',
        config: {
          inputSources: ['github_pr'],
          driftTypes: ['instruction'],
          allowedOutputs: ['confluence'],
          thresholds: {},
          eligibility: {},
          sectionTargets: {},
          impactRules: {},
          writeback: { enabled: false, requiresApproval: false },
        },
      });

      const servicePlans = await listDriftPlans({
        workspaceId: testWorkspaceId,
        scopeType: 'service',
      });

      expect(servicePlans).toHaveLength(1);
      expect(servicePlans[0]?.scopeType).toBe('service');
    });
  });

  describe('updateDriftPlan', () => {
    it('should update plan name and description', async () => {
      const plan = await createDriftPlan({
        workspaceId: testWorkspaceId,
        name: 'Original Name',
        description: 'Original description',
        scopeType: 'workspace',
        config: {
          inputSources: ['github_pr'],
          driftTypes: ['instruction'],
          allowedOutputs: ['confluence'],
          thresholds: {},
          eligibility: {},
          sectionTargets: {},
          impactRules: {},
          writeback: { enabled: false, requiresApproval: false },
        },
      });

      const updated = await updateDriftPlan({
        workspaceId: testWorkspaceId,
        planId: plan.id,
        name: 'Updated Name',
        description: 'Updated description',
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('Updated description');
      expect(updated.version).toBe(2); // Version should increment
    });

    it('should increment version when config changes', async () => {
      const plan = await createDriftPlan({
        workspaceId: testWorkspaceId,
        name: 'Test Plan',
        scopeType: 'workspace',
        config: {
          inputSources: ['github_pr'],
          driftTypes: ['instruction'],
          allowedOutputs: ['confluence'],
          thresholds: {},
          eligibility: {},
          sectionTargets: {},
          impactRules: {},
          writeback: { enabled: false, requiresApproval: false },
        },
      });

      const updated = await updateDriftPlan({
        workspaceId: testWorkspaceId,
        planId: plan.id,
        config: {
          inputSources: ['github_pr', 'pagerduty_incident'],
          driftTypes: ['instruction'],
          allowedOutputs: ['confluence'],
          thresholds: {},
          eligibility: {},
          sectionTargets: {},
          impactRules: {},
          writeback: { enabled: false, requiresApproval: false },
        },
      });

      expect(updated.version).toBe(2);
      expect(updated.inputSources).toContain('pagerduty_incident');
      expect(updated.versionHash).not.toBe(plan.versionHash);
    });
  });

  describe('deleteDriftPlan', () => {
    it('should archive a plan (soft delete)', async () => {
      const plan = await createDriftPlan({
        workspaceId: testWorkspaceId,
        name: 'Test Plan',
        scopeType: 'workspace',
        config: {
          inputSources: ['github_pr'],
          driftTypes: ['instruction'],
          allowedOutputs: ['confluence'],
          thresholds: {},
          eligibility: {},
          sectionTargets: {},
          impactRules: {},
          writeback: { enabled: false, requiresApproval: false },
        },
      });

      await deleteDriftPlan({
        workspaceId: testWorkspaceId,
        planId: plan.id,
      });

      const retrieved = await getDriftPlan({
        workspaceId: testWorkspaceId,
        planId: plan.id,
      });

      expect(retrieved).toBeDefined();
      expect(retrieved?.status).toBe('archived');
    });
  });
});

