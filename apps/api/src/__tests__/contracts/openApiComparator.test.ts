/**
 * Unit tests for OpenApiComparator
 */

import { describe, it, expect } from 'vitest';
import { OpenApiComparator } from '../../services/contracts/comparators/openapi.js';
import type {
  Invariant,
  ArtifactSnapshot,
  ComparatorInput,
} from '../../services/contracts/types.js';

// ======================================================================
// MOCK DATA
// ======================================================================

const mockOpenApiSnapshot: ArtifactSnapshot = {
  workspaceId: 'ws-123',
  id: 'snap-openapi-123',
  artifactId: 'artifact-openapi-123',
  artifactType: 'openapi',
  extract: {
    endpoints: [
      {
        method: 'GET',
        path: '/api/users',
        summary: 'Get all users',
        parameters: [
          { name: 'limit', in: 'query', required: false, type: 'integer' },
          { name: 'offset', in: 'query', required: false, type: 'integer' },
        ],
        responses: {
          '200': { description: 'Success', schema: { type: 'array' } },
        },
      },
      {
        method: 'POST',
        path: '/api/users',
        summary: 'Create user',
        parameters: [
          { name: 'name', in: 'body', required: true, type: 'string' },
          { name: 'email', in: 'body', required: true, type: 'string' },
        ],
        responses: {
          '201': { description: 'Created', schema: { type: 'object' } },
        },
      },
      {
        method: 'DELETE',
        path: '/api/users/:id',
        summary: 'Delete user',
        deprecated: true,
      },
    ],
    schemas: [
      {
        name: 'User',
        type: 'object',
        properties: {
          id: { type: 'string', required: true },
          name: { type: 'string', required: true },
          email: { type: 'string', required: true },
        },
        required: ['id', 'name', 'email'],
      },
    ],
    examples: [
      {
        endpoint: 'GET /api/users',
        example: { users: [{ id: '1', name: 'Alice', email: 'alice@example.com' }] },
      },
    ],
  },
  fetchedAt: new Date(),
  ttl: 86400,
  createdAt: new Date(),
};

const mockDocSnapshot: ArtifactSnapshot = {
  workspaceId: 'ws-123',
  id: 'snap-doc-123',
  artifactId: 'artifact-doc-123',
  artifactType: 'confluence_page',
  extract: {
    endpoints: [
      {
        method: 'GET',
        path: '/api/users',
        description: 'Retrieve all users',
        parameters: ['limit', 'offset'],
      },
      {
        method: 'GET',
        path: '/api/old-endpoint',
        description: 'Old endpoint that no longer exists',
      },
    ],
    examples: [],
    codeBlocks: [
      'const user: User = { id: "1", name: "Alice", email: "alice@example.com" }',
    ],
  },
  fetchedAt: new Date(),
  ttl: 86400,
  createdAt: new Date(),
};

const mockInvariant: Invariant = {
  invariantId: 'inv-123',
  comparatorType: 'openapi_docs_endpoint_parity',
  description: 'OpenAPI and docs must have matching endpoints',
  enabled: true,
  config: {},
};

const mockInput: ComparatorInput = {
  invariant: mockInvariant,
  leftSnapshot: mockOpenApiSnapshot,
  rightSnapshot: mockDocSnapshot,
  context: {
    workspaceId: 'ws-123',
    contractId: 'contract-123',
    signalEventId: 'signal-123',
    service: 'api-service',
    repo: 'acme/api',
  },
};

// ======================================================================
// TESTS
// ======================================================================

describe('OpenApiComparator', () => {
  describe('canCompare()', () => {
    it('should return true when invariant matches and snapshots are valid', () => {
      const comparator = new OpenApiComparator();
      const result = comparator.canCompare(mockInvariant, [mockOpenApiSnapshot, mockDocSnapshot]);
      expect(result).toBe(true);
    });

    it('should return false when invariant type does not match', () => {
      const comparator = new OpenApiComparator();
      const wrongInvariant = { ...mockInvariant, comparatorType: 'wrong_type' };
      const result = comparator.canCompare(wrongInvariant, [mockOpenApiSnapshot, mockDocSnapshot]);
      expect(result).toBe(false);
    });

    it('should return false when no OpenAPI snapshot', () => {
      const comparator = new OpenApiComparator();
      const result = comparator.canCompare(mockInvariant, [mockDocSnapshot, mockDocSnapshot]);
      expect(result).toBe(false);
    });

    it('should return false when no doc snapshot', () => {
      const comparator = new OpenApiComparator();
      const result = comparator.canCompare(mockInvariant, [mockOpenApiSnapshot, mockOpenApiSnapshot]);
      expect(result).toBe(false);
    });
  });

  describe('compare() - Endpoint Parity', () => {
    it('should detect missing endpoints (in OpenAPI but not in docs)', async () => {
      const comparator = new OpenApiComparator();
      const result = await comparator.compare(mockInput);

      expect(result.evaluated).toBe(true);
      expect(result.findings.length).toBeGreaterThan(0);

      // Should find POST /api/users missing from docs
      const missingEndpoint = result.findings.find(f =>
        f.evidence.some(e => e.kind === 'endpoint_missing' &&
          (e.leftValue as any)?.path === '/api/users' &&
          (e.leftValue as any)?.method === 'POST')
      );
      expect(missingEndpoint).toBeDefined();
      expect(missingEndpoint?.severity).toBe('high');
    });

    it('should detect deprecated endpoints (in docs but not in OpenAPI)', async () => {
      const comparator = new OpenApiComparator();
      const result = await comparator.compare(mockInput);

      expect(result.evaluated).toBe(true);

      // Should find GET /api/old-endpoint deprecated
      const deprecatedEndpoint = result.findings.find(f =>
        f.evidence.some(e => e.kind === 'endpoint_deprecated' &&
          (e.rightValue as any)?.path === '/api/old-endpoint')
      );
      expect(deprecatedEndpoint).toBeDefined();
      expect(deprecatedEndpoint?.severity).toBe('medium');
    });

    it('should not flag deprecated OpenAPI endpoints as missing', async () => {
      const comparator = new OpenApiComparator();
      const result = await comparator.compare(mockInput);

      // DELETE /api/users/:id is deprecated in OpenAPI, should not be flagged as missing
      const deprecatedMissing = result.findings.find(f =>
        f.evidence.some(e => e.kind === 'endpoint_missing' &&
          (e.leftValue as any)?.path === '/api/users/:id')
      );
      expect(deprecatedMissing).toBeUndefined();
    });

    it('should detect missing required parameters', async () => {
      // Create a doc snapshot missing required parameters
      const docWithMissingParams: ArtifactSnapshot = {
        ...mockDocSnapshot,
        extract: {
          endpoints: [
            {
              method: 'POST',
              path: '/api/users',
              description: 'Create user',
              parameters: [], // Missing required parameters
            },
          ],
          examples: [],
          codeBlocks: [],
        },
      };

      const input: ComparatorInput = {
        ...mockInput,
        rightSnapshot: docWithMissingParams,
      };

      const comparator = new OpenApiComparator();
      const result = await comparator.compare(input);

      // Should find missing required parameters (name, email)
      const missingParams = result.findings.filter(f =>
        f.evidence.some(e => e.kind === 'parameter_missing')
      );
      expect(missingParams.length).toBeGreaterThan(0);
    });
  });

  describe('compare() - Schema Parity', () => {
    it('should detect missing schemas', async () => {
      // Create a doc snapshot without User schema reference
      const docWithoutSchema: ArtifactSnapshot = {
        ...mockDocSnapshot,
        extract: {
          endpoints: [],
          examples: [],
          codeBlocks: [], // No mention of User schema
        },
      };

      const input: ComparatorInput = {
        ...mockInput,
        rightSnapshot: docWithoutSchema,
      };

      const comparator = new OpenApiComparator();
      const result = await comparator.compare(input);

      // Should find User schema missing
      const missingSchema = result.findings.find(f =>
        f.evidence.some(e => e.kind === 'schema_missing' &&
          (e.leftValue as any)?.name === 'User')
      );
      expect(missingSchema).toBeDefined();
      expect(missingSchema?.severity).toBe('medium');
    });

    it('should not flag schemas that are mentioned in code blocks', async () => {
      const comparator = new OpenApiComparator();
      const result = await comparator.compare(mockInput);

      // User schema is mentioned in code block, should not be flagged
      const missingUser = result.findings.find(f =>
        f.evidence.some(e => e.kind === 'schema_missing' &&
          (e.leftValue as any)?.name === 'User')
      );
      expect(missingUser).toBeUndefined();
    });
  });

  describe('compare() - Example Parity', () => {
    it('should detect missing examples', async () => {
      const comparator = new OpenApiComparator();
      const result = await comparator.compare(mockInput);

      // Should find GET /api/users example missing from docs
      const missingExample = result.findings.find(f =>
        f.evidence.some(e => e.kind === 'example_missing' &&
          (e.leftValue as any)?.endpoint === 'GET /api/users')
      );
      expect(missingExample).toBeDefined();
      expect(missingExample?.severity).toBe('medium');
    });

    it('should not flag examples that exist in docs', async () => {
      // Create a doc snapshot with matching example
      const docWithExample: ArtifactSnapshot = {
        ...mockDocSnapshot,
        extract: {
          endpoints: [],
          examples: [
            {
              language: 'json',
              code: '{ "users": [...] }',
              endpoint: 'GET /api/users',
            },
          ],
          codeBlocks: [],
        },
      };

      const input: ComparatorInput = {
        ...mockInput,
        rightSnapshot: docWithExample,
      };

      const comparator = new OpenApiComparator();
      const result = await comparator.compare(input);

      // Should not find GET /api/users example missing
      const missingExample = result.findings.find(f =>
        f.evidence.some(e => e.kind === 'example_missing' &&
          (e.leftValue as any)?.endpoint === 'GET /api/users')
      );
      expect(missingExample).toBeUndefined();
    });
  });

  describe('compare() - Coverage', () => {
    it('should calculate coverage metrics', async () => {
      const comparator = new OpenApiComparator();
      const result = await comparator.compare(mockInput);

      expect(result.coverage).toBeDefined();
      expect(result.coverage.artifactsChecked).toContain('openapi');
      expect(result.coverage.artifactsChecked).toContain('confluence_page');
      expect(result.coverage.completeness).toBe(1.0); // Both artifacts checked
    });
  });
});
