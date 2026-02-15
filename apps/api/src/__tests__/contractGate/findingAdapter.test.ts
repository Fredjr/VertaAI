/**
 * Finding Adapter Tests
 * 
 * Tests for adapting DeltaSyncFinding to IntegrityFinding
 * Week 3-4 Task 2: Unify Finding Model
 */

import { describe, it, expect } from 'vitest';
import { adaptDeltaSyncFinding, type AdapterContext } from '../../services/contractGate/findingAdapter.js';
import type { DeltaSyncFinding } from '../../services/gatekeeper/deltaSync.js';

describe('Finding Adapter', () => {
  const mockContext: AdapterContext = {
    workspaceId: 'test-workspace',
    signalEventId: 'test-signal-123',
  };

  describe('adaptDeltaSyncFinding()', () => {
    it('should adapt iac_drift finding correctly', () => {
      const deltaSyncFinding: DeltaSyncFinding = {
        type: 'iac_drift',
        severity: 'high',
        title: 'Database infrastructure changes detected',
        description: 'Database infrastructure changes may require migration notes',
        affectedFiles: ['terraform/database.tf', 'terraform/variables.tf'],
        suggestedDocs: ['database migration guide', 'rollback procedures'],
        evidence: 'IaC changes affecting database resources',
      };

      const result = adaptDeltaSyncFinding(deltaSyncFinding, mockContext);

      expect(result.workspaceId).toBe('test-workspace');
      expect(result.id).toBeDefined();
      expect(result.source).toBe('contract_comparator');
      expect(result.contractId).toBeUndefined();
      expect(result.invariantId).toBeUndefined();
      expect(result.driftType).toBe('environment_tooling');
      expect(result.domains).toEqual(['infrastructure', 'deployment']);
      expect(result.severity).toBe('high');
      expect(result.compared).toBeUndefined();
      expect(result.evidence).toHaveLength(1);
      expect(result.evidence[0].kind).toBe('iac_drift');
      expect(result.evidence[0].leftValue).toBe('IaC changes affecting database resources');
      expect(result.confidence).toBe(1.0);
      expect(result.impact).toBe(0.8);
      expect(result.band).toBe('fail');
      expect(result.recommendedAction).toBe('create_patch_candidate');
      expect(result.affectedFiles).toEqual(['terraform/database.tf', 'terraform/variables.tf']);
      expect(result.suggestedDocs).toEqual(['database migration guide', 'rollback procedures']);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should adapt api_drift finding correctly', () => {
      const deltaSyncFinding: DeltaSyncFinding = {
        type: 'api_drift',
        severity: 'critical',
        title: 'Breaking API changes detected',
        description: 'Breaking changes in API spec',
        affectedFiles: ['openapi.yaml'],
        suggestedDocs: ['API documentation', 'migration guide'],
        evidence: '3 breaking changes in API spec',
      };

      const result = adaptDeltaSyncFinding(deltaSyncFinding, mockContext);

      expect(result.driftType).toBe('instruction');
      expect(result.domains).toEqual(['api', 'docs']);
      expect(result.severity).toBe('critical');
      expect(result.impact).toBe(1.0);
      expect(result.band).toBe('fail');
      expect(result.recommendedAction).toBe('block_merge');
    });

    it('should adapt ownership_drift finding correctly', () => {
      const deltaSyncFinding: DeltaSyncFinding = {
        type: 'ownership_drift',
        severity: 'medium',
        title: 'Code ownership changes detected',
        description: 'Ownership rules changed',
        affectedFiles: ['CODEOWNERS'],
        suggestedDocs: ['team structure docs', 'on-call rotation docs'],
        evidence: '5 ownership rule changes',
      };

      const result = adaptDeltaSyncFinding(deltaSyncFinding, mockContext);

      expect(result.driftType).toBe('ownership');
      expect(result.domains).toEqual(['ownership', 'team']);
      expect(result.severity).toBe('medium');
      expect(result.impact).toBe(0.5);
      expect(result.band).toBe('warn');
      expect(result.recommendedAction).toBe('notify');
    });

    it('should handle low severity findings', () => {
      const deltaSyncFinding: DeltaSyncFinding = {
        type: 'api_drift',
        severity: 'low',
        title: 'Minor API changes',
        description: 'Non-breaking API changes',
        affectedFiles: ['openapi.yaml'],
        suggestedDocs: ['API documentation'],
        evidence: '1 minor change in API spec',
      };

      const result = adaptDeltaSyncFinding(deltaSyncFinding, mockContext);

      expect(result.severity).toBe('low');
      expect(result.impact).toBe(0.2);
      expect(result.band).toBe('warn');
      expect(result.recommendedAction).toBe('notify');
    });

    it('should handle empty affectedFiles array', () => {
      const deltaSyncFinding: DeltaSyncFinding = {
        type: 'iac_drift',
        severity: 'medium',
        title: 'Infrastructure changes',
        description: 'Some infrastructure changes',
        affectedFiles: [],
        suggestedDocs: ['infrastructure docs'],
        evidence: 'Infrastructure changes detected',
      };

      const result = adaptDeltaSyncFinding(deltaSyncFinding, mockContext);

      expect(result.affectedFiles).toEqual([]);
      expect(result.suggestedDocs).toEqual(['infrastructure docs']);
    });

    it('should handle empty suggestedDocs array', () => {
      const deltaSyncFinding: DeltaSyncFinding = {
        type: 'api_drift',
        severity: 'high',
        title: 'API changes',
        description: 'API changes detected',
        affectedFiles: ['openapi.yaml'],
        suggestedDocs: [],
        evidence: 'API changes',
      };

      const result = adaptDeltaSyncFinding(deltaSyncFinding, mockContext);

      expect(result.affectedFiles).toEqual(['openapi.yaml']);
      expect(result.suggestedDocs).toEqual([]);
    });

    it('should set confidence to 1.0 for all DeltaSync findings', () => {
      const findings: DeltaSyncFinding[] = [
        {
          type: 'iac_drift',
          severity: 'critical',
          title: 'Test',
          description: 'Test',
          affectedFiles: [],
          suggestedDocs: [],
          evidence: 'Test',
        },
        {
          type: 'api_drift',
          severity: 'high',
          title: 'Test',
          description: 'Test',
          affectedFiles: [],
          suggestedDocs: [],
          evidence: 'Test',
        },
        {
          type: 'ownership_drift',
          severity: 'medium',
          title: 'Test',
          description: 'Test',
          affectedFiles: [],
          suggestedDocs: [],
          evidence: 'Test',
        },
      ];

      for (const finding of findings) {
        const result = adaptDeltaSyncFinding(finding, mockContext);
        expect(result.confidence).toBe(1.0);
      }
    });

    it('should generate unique IDs for each adapted finding', () => {
      const deltaSyncFinding: DeltaSyncFinding = {
        type: 'iac_drift',
        severity: 'high',
        title: 'Test',
        description: 'Test',
        affectedFiles: [],
        suggestedDocs: [],
        evidence: 'Test',
      };

      const result1 = adaptDeltaSyncFinding(deltaSyncFinding, mockContext);
      const result2 = adaptDeltaSyncFinding(deltaSyncFinding, mockContext);

      expect(result1.id).toBeDefined();
      expect(result2.id).toBeDefined();
      expect(result1.id).not.toBe(result2.id);
    });
  });
});

