// DriftPlan Resolver Tests
// Phase 3: Control-Plane Architecture - Week 5

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../../lib/db.js';
import { createDriftPlan } from '../../services/plans/manager.js';
import { resolveDriftPlan, checkPlanEligibility } from '../../services/plans/resolver.js';

describe('DriftPlan Resolver', () => {
  const testWorkspaceId = 'test-workspace-resolver';
  
  beforeEach(async () => {
    // Create test workspace
    await prisma.workspace.create({
      data: {
        id: testWorkspaceId,
        name: 'Test Workspace',
        slug: 'test-workspace-resolver',
        ownerEmail: 'test@example.com',
      },
    });
  });

  afterEach(async () => {
    // Clean up
    await prisma.driftPlan.deleteMany({ where: { workspaceId: testWorkspaceId } });
    await prisma.workspace.delete({ where: { id: testWorkspaceId } });
  });

  describe('resolveDriftPlan - 5-step hierarchy', () => {
    it('Step 1: should resolve exact match (repo + docClass)', async () => {
      await createDriftPlan({
        workspaceId: testWorkspaceId,
        name: 'Exact Match Plan',
        scopeType: 'repo',
        scopeRef: 'myorg/payment-service',
        docClass: 'runbook',
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

      const result = await resolveDriftPlan({
        workspaceId: testWorkspaceId,
        repoFullName: 'myorg/payment-service',
        docClass: 'runbook',
      });

      expect(result.plan).toBeDefined();
      expect(result.plan?.name).toBe('Exact Match Plan');
      expect(result.coverageFlags.resolutionMethod).toBe('exact_match');
      expect(result.coverageFlags.planScope).toBe('repo');
    });

    it('Step 2: should resolve repo match (any docClass)', async () => {
      await createDriftPlan({
        workspaceId: testWorkspaceId,
        name: 'Repo Match Plan',
        scopeType: 'repo',
        scopeRef: 'myorg/payment-service',
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

      const result = await resolveDriftPlan({
        workspaceId: testWorkspaceId,
        repoFullName: 'myorg/payment-service',
        docClass: 'api-spec', // Different docClass
      });

      expect(result.plan).toBeDefined();
      expect(result.plan?.name).toBe('Repo Match Plan');
      expect(result.coverageFlags.resolutionMethod).toBe('repo_match');
      expect(result.coverageFlags.planScope).toBe('repo');
    });

    it('Step 3: should resolve service match', async () => {
      await createDriftPlan({
        workspaceId: testWorkspaceId,
        name: 'Service Match Plan',
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

      const result = await resolveDriftPlan({
        workspaceId: testWorkspaceId,
        serviceId: 'payment-service',
      });

      expect(result.plan).toBeDefined();
      expect(result.plan?.name).toBe('Service Match Plan');
      expect(result.coverageFlags.resolutionMethod).toBe('service_match');
      expect(result.coverageFlags.planScope).toBe('service');
    });

    it('Step 4: should fallback to workspace default', async () => {
      await createDriftPlan({
        workspaceId: testWorkspaceId,
        name: 'Workspace Default Plan',
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

      const result = await resolveDriftPlan({
        workspaceId: testWorkspaceId,
        repoFullName: 'myorg/unknown-repo',
      });

      expect(result.plan).toBeDefined();
      expect(result.plan?.name).toBe('Workspace Default Plan');
      expect(result.coverageFlags.resolutionMethod).toBe('workspace_default');
      expect(result.coverageFlags.planScope).toBe('workspace');
    });

    it('Step 5: should return null when no plan found', async () => {
      const result = await resolveDriftPlan({
        workspaceId: testWorkspaceId,
        repoFullName: 'myorg/unknown-repo',
      });

      expect(result.plan).toBeNull();
      expect(result.coverageFlags.hasPlan).toBe(false);
      expect(result.coverageFlags.resolutionMethod).toBe('none');
      expect(result.coverageFlags.planScope).toBe('none');
    });

    it('should prioritize exact match over repo match', async () => {
      // Create repo-level plan (any docClass)
      await createDriftPlan({
        workspaceId: testWorkspaceId,
        name: 'Repo Plan',
        scopeType: 'repo',
        scopeRef: 'myorg/payment-service',
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

      // Create exact match plan (repo + docClass)
      await createDriftPlan({
        workspaceId: testWorkspaceId,
        name: 'Exact Plan',
        scopeType: 'repo',
        scopeRef: 'myorg/payment-service',
        docClass: 'runbook',
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

      const result = await resolveDriftPlan({
        workspaceId: testWorkspaceId,
        repoFullName: 'myorg/payment-service',
        docClass: 'runbook',
      });

      expect(result.plan?.name).toBe('Exact Plan');
      expect(result.coverageFlags.resolutionMethod).toBe('exact_match');
    });
  });

  describe('checkPlanEligibility', () => {
    it('should allow eligible drift candidate', () => {
      const plan = {
        inputSources: ['github_pr', 'pagerduty_incident'],
        driftTypes: ['instruction', 'process'],
        thresholds: {
          minConfidence: 0.7,
          minImpactScore: 0.6,
        },
        eligibility: {},
      };

      const result = checkPlanEligibility({
        plan,
        sourceType: 'github_pr',
        driftType: 'instruction',
        confidence: 0.8,
        impactScore: 0.7,
      });

      expect(result.eligible).toBe(true);
    });

    it('should reject drift candidate with disallowed source type', () => {
      const plan = {
        inputSources: ['github_pr'],
        driftTypes: ['instruction'],
        thresholds: {},
        eligibility: {},
      };

      const result = checkPlanEligibility({
        plan,
        sourceType: 'pagerduty_incident',
        driftType: 'instruction',
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Source type');
    });

    it('should reject drift candidate with disallowed drift type', () => {
      const plan = {
        inputSources: ['github_pr'],
        driftTypes: ['instruction'],
        thresholds: {},
        eligibility: {},
      };

      const result = checkPlanEligibility({
        plan,
        sourceType: 'github_pr',
        driftType: 'process',
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Drift type');
    });

    it('should reject drift candidate below confidence threshold', () => {
      const plan = {
        inputSources: ['github_pr'],
        driftTypes: ['instruction'],
        thresholds: {
          minConfidence: 0.7,
        },
        eligibility: {},
      };

      const result = checkPlanEligibility({
        plan,
        sourceType: 'github_pr',
        driftType: 'instruction',
        confidence: 0.5,
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Confidence');
    });

    it('should reject drift candidate below impact score threshold', () => {
      const plan = {
        inputSources: ['github_pr'],
        driftTypes: ['instruction'],
        thresholds: {
          minImpactScore: 0.6,
        },
        eligibility: {},
      };

      const result = checkPlanEligibility({
        plan,
        sourceType: 'github_pr',
        driftType: 'instruction',
        impactScore: 0.4,
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Impact score');
    });

    it('should reject drift candidate below minimum severity', () => {
      const plan = {
        inputSources: ['pagerduty_incident'],
        driftTypes: ['instruction'],
        thresholds: {},
        eligibility: {
          minSeverity: 'sev2',
        },
      };

      const result = checkPlanEligibility({
        plan,
        sourceType: 'pagerduty_incident',
        driftType: 'instruction',
        severity: 'sev3',
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Severity');
    });
  });
});

