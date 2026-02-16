/**
 * End-to-End Tests for Unified Policy Pack System
 * 
 * Tests the complete CRUD flow for WorkspacePolicyPack including:
 * - Create policy pack with Track A and Track B configuration
 * - Read policy pack and verify all fields
 * - Update policy pack and verify versioning
 * - Delete policy pack (soft delete)
 * - Adapter layer compatibility
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_URL = process.env.API_URL || 'http://localhost:3001';

describe('Policy Pack E2E Tests', () => {
  const testWorkspaceId = 'test-workspace-e2e';
  let createdPolicyPackId: string;

  beforeAll(async () => {
    // Ensure test workspace exists
    await prisma.workspace.upsert({
      where: { id: testWorkspaceId },
      update: {},
      create: {
        id: testWorkspaceId,
        name: 'Test Workspace E2E',
        slug: 'test-workspace-e2e',
        ownerEmail: 'test@example.com',
      },
    });
  });

  afterAll(async () => {
    // Cleanup: Delete test policy packs
    await prisma.workspacePolicyPack.deleteMany({
      where: { workspaceId: testWorkspaceId },
    });
    await prisma.$disconnect();
  });

  describe('CREATE Policy Pack', () => {
    it('should create a policy pack with Track A configuration', async () => {
      const payload = {
        name: 'Test Track A Policy Pack',
        description: 'E2E test for Track A',
        scopeType: 'workspace',
        scopeRef: null,
        repoAllowlist: [],
        pathGlobs: [],
        trackAEnabled: true,
        trackAConfig: {
          surfaces: ['api', 'docs'],
          contracts: [
            {
              contractId: 'test-contract-1',
              name: 'API Contract',
              description: 'Test API contract',
              scope: {},
              artifacts: [
                {
                  system: 'github',
                  type: 'openapi_spec',
                  locator: { repo: 'test/repo', path: 'openapi.yaml', ref: 'main' },
                  role: 'primary',
                  required: true,
                  freshnessSlaHours: 24,
                },
              ],
              invariants: [
                {
                  invariantId: 'test-invariant-1',
                  name: 'Version Bump Required',
                  description: 'Breaking changes require version bump',
                  enabled: true,
                  severity: 'high',
                  comparatorType: 'openapi_version_bump',
                  config: {},
                },
              ],
              enforcement: {
                mode: 'pr_gate',
                blockOnFail: true,
                warnOnWarn: true,
                requireApprovalOverride: false,
              },
              routing: {
                method: 'codeowners',
                fallbackChannel: null,
              },
              writeback: {
                enabled: false,
                autoApproveThreshold: null,
                requiresApproval: true,
                targetArtifacts: [],
              },
            },
          ],
          dictionaries: {},
          extraction: {},
          safety: {},
          enforcement: {
            mode: 'warn_only',
            criticalThreshold: 90,
            highThreshold: 70,
            mediumThreshold: 40,
          },
          gracefulDegradation: {
            timeoutMs: 30000,
            maxArtifactFetchFailures: 3,
            fallbackMode: 'warn_only',
            enableSoftFail: true,
          },
          appliesTo: [],
        },
        trackBEnabled: false,
        trackBConfig: {},
        approvalTiers: {},
        routing: {},
      };

      const response = await fetch(`${API_URL}/api/workspaces/${testWorkspaceId}/policy-packs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'test-user' },
        body: JSON.stringify(payload),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.policyPack).toBeDefined();
      expect(data.policyPack.name).toBe('Test Track A Policy Pack');
      expect(data.policyPack.trackAEnabled).toBe(true);
      expect(data.policyPack.version).toBe(1);
      expect(data.policyPack.versionHash).toBeDefined();

      createdPolicyPackId = data.policyPack.id;
    });

    it('should create a policy pack with Track B configuration', async () => {
      const payload = {
        name: 'Test Track B Policy Pack',
        description: 'E2E test for Track B',
        scopeType: 'repo',
        scopeRef: 'test/repo',
        repoAllowlist: ['test/repo'],
        pathGlobs: ['**/*.md'],
        trackAEnabled: false,
        trackAConfig: {},
        trackBEnabled: true,
        trackBConfig: {
          primaryDoc: {
            system: 'confluence',
            id: 'test-page-123',
            title: 'Test Runbook',
            url: 'https://confluence.example.com/test',
            class: 'runbook',
          },
          inputSources: [
            { type: 'github_pr', enabled: true, config: {} },
            { type: 'pagerduty_incident', enabled: true, config: {} },
          ],
          driftTypes: [
            { type: 'instruction', enabled: true, sectionTarget: 'deployment' },
            { type: 'process', enabled: true, sectionTarget: null },
          ],
          materiality: {
            autoApprove: 0.98,
            slackNotify: 0.40,
            digestOnly: 0.30,
            ignore: 0.20,
          },
          docTargeting: {
            strategy: 'primary_first',
            maxDocsPerDrift: 3,
          },
          noiseControls: {
            ignorePatterns: ['test/**', '*.test.ts'],
            ignorePaths: ['/tmp'],
            ignoreAuthors: ['bot@example.com'],
            temporalAccumulation: {
              enabled: true,
              windowDays: 7,
            },
          },
          budgets: {
            maxDriftsPerDay: 50,
            maxDriftsPerWeek: 200,
          },
          writeback: {
            enabled: true,
            requiresApproval: true,
            targetSystem: 'confluence',
          },
        },
        approvalTiers: {},
        routing: {},
      };

      const response = await fetch(`${API_URL}/api/workspaces/${testWorkspaceId}/policy-packs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'test-user' },
        body: JSON.stringify(payload),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.policyPack).toBeDefined();
      expect(data.policyPack.name).toBe('Test Track B Policy Pack');
      expect(data.policyPack.trackBEnabled).toBe(true);
      expect(data.policyPack.scopeType).toBe('repo');
      expect(data.policyPack.scopeRef).toBe('test/repo');
    });
  });

  describe('READ Policy Pack', () => {
    it('should list all policy packs for workspace', async () => {
      const response = await fetch(`${API_URL}/api/workspaces/${testWorkspaceId}/policy-packs`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.policyPacks).toBeDefined();
      expect(Array.isArray(data.policyPacks)).toBe(true);
      expect(data.policyPacks.length).toBeGreaterThanOrEqual(2);
    });

    it('should get specific policy pack by ID', async () => {
      const response = await fetch(`${API_URL}/api/workspaces/${testWorkspaceId}/policy-packs/${createdPolicyPackId}`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.policyPack).toBeDefined();
      expect(data.policyPack.id).toBe(createdPolicyPackId);
      expect(data.policyPack.name).toBe('Test Track A Policy Pack');
      expect(data.policyPack.trackAConfig).toBeDefined();
      expect(data.policyPack.trackAConfig.contracts).toHaveLength(1);
    });

    it('should return 404 for non-existent policy pack', async () => {
      const response = await fetch(`${API_URL}/api/workspaces/${testWorkspaceId}/policy-packs/non-existent-id`);
      expect(response.status).toBe(404);
    });
  });

  describe('UPDATE Policy Pack', () => {
    it('should update policy pack and increment version', async () => {
      const updatePayload = {
        name: 'Updated Track A Policy Pack',
        description: 'Updated description',
        trackAEnabled: true,
        trackAConfig: {
          surfaces: ['api', 'docs', 'infra'],
          contracts: [
            {
              contractId: 'test-contract-1',
              name: 'Updated API Contract',
              description: 'Updated test API contract',
              scope: {},
              artifacts: [],
              invariants: [],
              enforcement: { mode: 'pr_gate', blockOnFail: true, warnOnWarn: true, requireApprovalOverride: false },
              routing: { method: 'codeowners', fallbackChannel: null },
              writeback: { enabled: false, autoApproveThreshold: null, requiresApproval: true, targetArtifacts: [] },
            },
          ],
          dictionaries: {},
          extraction: {},
          safety: {},
          enforcement: { mode: 'warn_only', criticalThreshold: 90, highThreshold: 70, mediumThreshold: 40 },
          gracefulDegradation: { timeoutMs: 30000, maxArtifactFetchFailures: 3, fallbackMode: 'warn_only', enableSoftFail: true },
          appliesTo: [],
        },
      };

      const response = await fetch(`${API_URL}/api/workspaces/${testWorkspaceId}/policy-packs/${createdPolicyPackId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'test-user' },
        body: JSON.stringify(updatePayload),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.policyPack.name).toBe('Updated Track A Policy Pack');
      expect(data.policyPack.version).toBe(2);
      expect(data.policyPack.parentId).toBe(createdPolicyPackId);
      expect(data.policyPack.trackAConfig.surfaces).toContain('infra');
    });
  });

  describe('DELETE Policy Pack', () => {
    it('should soft delete policy pack', async () => {
      const response = await fetch(`${API_URL}/api/workspaces/${testWorkspaceId}/policy-packs/${createdPolicyPackId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': 'test-user' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toContain('archived');

      // Verify it's archived
      const getResponse = await fetch(`${API_URL}/api/workspaces/${testWorkspaceId}/policy-packs/${createdPolicyPackId}`);
      const getData = await getResponse.json();
      expect(getData.policyPack.status).toBe('archived');
    });
  });
});


