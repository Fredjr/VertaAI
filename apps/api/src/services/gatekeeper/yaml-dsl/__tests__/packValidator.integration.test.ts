/**
 * Pack Validator Integration Tests
 * Phase 1.1: Testing two-layer validation (JSON Schema + Zod)
 */

import { describe, it, expect } from 'vitest';
import { validatePackYAML } from '../packValidator.js';

describe('PackValidator Integration (Two-Layer Validation)', () => {
  describe('Layer 1: JSON Schema Validation', () => {
    it('should catch structural errors with user-friendly messages', () => {
      const yamlWithMissingMetadata = `
apiVersion: verta.ai/v1
kind: PolicyPack
scope:
  type: workspace
rules:
  - id: rule-1
    name: Test Rule
    trigger:
      anyChangedPaths: ['**/*.ts']
    obligations:
      - comparator: ARTIFACT_UPDATED
        decisionOnFail: warn
`;

      const result = validatePackYAML(yamlWithMissingMetadata);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some(e => e.message.includes('metadata'))).toBe(true);
    });

    it('should catch invalid enum values', () => {
      const yamlWithInvalidEnum = `
apiVersion: verta.ai/v1
kind: PolicyPack
metadata:
  id: test-pack
  name: Test Pack
  version: 1.0.0
  packMode: invalid-mode
scope:
  type: workspace
rules:
  - id: rule-1
    name: Test Rule
    trigger:
      anyChangedPaths: ['**/*.ts']
    obligations:
      - comparator: ARTIFACT_UPDATED
        decisionOnFail: warn
`;

      const result = validatePackYAML(yamlWithInvalidEnum);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('Layer 2: Zod Validation', () => {
    it('should catch invalid comparator IDs (business logic)', () => {
      const yamlWithInvalidComparator = `
apiVersion: verta.ai/v1
kind: PolicyPack
metadata:
  id: test-pack
  name: Test Pack
  version: 1.0.0
scope:
  type: workspace
rules:
  - id: rule-1
    name: Test Rule
    trigger:
      anyChangedPaths: ['**/*.ts']
    obligations:
      - comparator: INVALID_COMPARATOR_ID
        decisionOnFail: warn
`;

      const result = validatePackYAML(yamlWithInvalidComparator);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('Valid YAML', () => {
    it('should pass both layers of validation', () => {
      const validYaml = `
apiVersion: verta.ai/v1
kind: PolicyPack
metadata:
  id: test-pack
  name: Test Pack
  version: 1.0.0
scope:
  type: workspace
rules:
  - id: rule-1
    name: Test Rule
    trigger:
      anyChangedPaths: ['**/*.ts']
    obligations:
      - comparator: ARTIFACT_UPDATED
        decisionOnFail: warn
`;

      const result = validatePackYAML(validYaml);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should validate pack with all optional fields', () => {
      const fullYaml = `
apiVersion: verta.ai/v1
kind: PolicyPack
metadata:
  id: full-pack
  name: Full Pack
  version: 1.0.0
  description: A complete pack
  tags:
    - api
    - security
  packMode: enforce
  strictness: balanced
  owner: platform-team
scope:
  type: repo
  ref: owner/repo
  branches:
    include:
      - main
      - develop
    exclude:
      - feature/*
rules:
  - id: rule-1
    name: Test Rule
    enabled: true
    description: A test rule
    trigger:
      anyChangedPaths: ['**/*.ts']
    obligations:
      - comparator: ARTIFACT_UPDATED
        params:
          artifactType: openapi
        decisionOnFail: block
        severity: high
        message: OpenAPI must be updated
    skipIf:
      labels:
        - skip-policy
    excludePaths:
      - '**/*.test.ts'
evaluation:
  externalDependencyMode: soft_fail
  budgets:
    maxTotalMs: 30000
    perComparatorTimeoutMs: 5000
`;

      const result = validatePackYAML(fullYaml);
      expect(result.valid).toBe(true);
    });
  });
});

