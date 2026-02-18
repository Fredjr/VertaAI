/**
 * Schema Validator Tests
 * Phase 1.1: JSON Schema Implementation
 */

import { describe, it, expect } from 'vitest';
import { schemaValidator } from '../schemaValidator.js';

describe('SchemaValidator', () => {
  describe('Valid YAML', () => {
    it('should validate a minimal valid pack', () => {
      const validPack = {
        apiVersion: 'verta.ai/v1',
        kind: 'PolicyPack',
        metadata: {
          id: 'test-pack',
          name: 'Test Pack',
          version: '1.0.0',
        },
        scope: {
          type: 'workspace',
        },
        rules: [
          {
            id: 'rule-1',
            name: 'Test Rule',
            trigger: {
              anyChangedPaths: ['**/*.ts'],
            },
            obligations: [
              {
                comparator: 'ARTIFACT_UPDATED',
                decisionOnFail: 'warn',
              },
            ],
          },
        ],
      };

      const result = schemaValidator.validatePack(validPack);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should validate a pack with all optional fields', () => {
      const fullPack = {
        apiVersion: 'verta.ai/v1',
        kind: 'PolicyPack',
        metadata: {
          id: 'full-pack',
          name: 'Full Pack',
          version: '1.0.0',
          description: 'A complete pack',
          tags: ['api', 'security'],
          packMode: 'enforce',
          strictness: 'balanced',
          owner: 'platform-team',
        },
        scope: {
          type: 'repo',
          ref: 'owner/repo',
          branches: {
            include: ['main', 'develop'],
            exclude: ['feature/*'],
          },
        },
        rules: [
          {
            id: 'rule-1',
            name: 'Test Rule',
            enabled: true,
            description: 'A test rule',
            trigger: {
              anyChangedPaths: ['**/*.ts'],
            },
            obligations: [
              {
                comparator: 'ARTIFACT_UPDATED',
                params: { artifactType: 'openapi' },
                decisionOnFail: 'block',
                severity: 'high',
                message: 'OpenAPI must be updated',
              },
            ],
            skipIf: {
              labels: ['skip-policy'],
            },
            excludePaths: ['**/*.test.ts'],
          },
        ],
        evaluation: {
          externalDependencyMode: 'soft_fail',
          budgets: {
            maxTotalMs: 30000,
            perComparatorTimeoutMs: 5000,
          },
        },
      };

      const result = schemaValidator.validatePack(fullPack);
      expect(result.valid).toBe(true);
    });
  });

  describe('Invalid YAML', () => {
    it('should reject pack with missing required fields', () => {
      const invalidPack = {
        apiVersion: 'verta.ai/v1',
        kind: 'PolicyPack',
        // Missing metadata
        scope: {
          type: 'workspace',
        },
        rules: [],
      };

      const result = schemaValidator.validatePack(invalidPack);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some(e => e.message.includes('metadata'))).toBe(true);
    });

    it('should reject pack with invalid apiVersion', () => {
      const invalidPack = {
        apiVersion: 'wrong/v1',
        kind: 'PolicyPack',
        metadata: {
          id: 'test',
          name: 'Test',
          version: '1.0.0',
        },
        scope: {
          type: 'workspace',
        },
        rules: [],
      };

      const result = schemaValidator.validatePack(invalidPack);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.message.includes('verta.ai/v1'))).toBe(true);
    });

    it('should reject pack with invalid enum values', () => {
      const invalidPack = {
        apiVersion: 'verta.ai/v1',
        kind: 'PolicyPack',
        metadata: {
          id: 'test',
          name: 'Test',
          version: '1.0.0',
          packMode: 'invalid-mode', // Invalid enum
        },
        scope: {
          type: 'workspace',
        },
        rules: [],
      };

      const result = schemaValidator.validatePack(invalidPack);
      expect(result.valid).toBe(false);
    });
  });
});

