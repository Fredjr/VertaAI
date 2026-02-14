/**
 * OpenAPI Comparator
 * 
 * Compares OpenAPI specs against documentation (Confluence, Notion, README)
 * to detect endpoint parity, schema parity, and example parity issues.
 * 
 * Comparison Types:
 * 1. Endpoint Parity - Missing/deprecated endpoints, parameter mismatches
 * 2. Schema Parity - Missing schemas, property mismatches
 * 3. Example Parity - Outdated/missing/invalid examples
 */

import { BaseComparator } from './base.js';
import type {
  Invariant,
  ArtifactSnapshot,
  IntegrityFinding,
  ComparatorInput,
  EvidenceItem,
  Severity,
} from '../types.js';

// ======================================================================
// DATA STRUCTURES
// ======================================================================

export interface OpenApiEndpoint {
  method: string;
  path: string;
  summary?: string;
  description?: string;
  parameters?: Array<{
    name: string;
    in: 'query' | 'path' | 'header' | 'body';
    required: boolean;
    type?: string;
    schema?: any;
  }>;
  responses?: Record<string, {
    description?: string;
    schema?: any;
  }>;
  deprecated?: boolean;
}

export interface OpenApiSchema {
  name: string;
  type: string;
  properties?: Record<string, {
    type: string;
    description?: string;
    required?: boolean;
  }>;
  required?: string[];
}

export interface OpenApiExample {
  endpoint: string; // "GET /api/users"
  example: any;
  description?: string;
}

export interface OpenApiData {
  endpoints: OpenApiEndpoint[];
  schemas: OpenApiSchema[];
  examples: OpenApiExample[];
}

export interface DocEndpoint {
  method: string;
  path: string;
  description?: string;
  parameters?: string[]; // Simple list of parameter names
}

export interface DocExample {
  language: string;
  code: string;
  endpoint?: string; // Extracted from context
}

export interface DocData {
  endpoints: DocEndpoint[];
  examples: DocExample[];
  codeBlocks: string[];
}

// ======================================================================
// OPENAPI COMPARATOR
// ======================================================================

export class OpenApiComparator extends BaseComparator {
  readonly comparatorType = 'openapi_docs_endpoint_parity';
  readonly supportedArtifactTypes = ['openapi', 'confluence_page', 'notion_page', 'github_readme'];

  canCompare(invariant: Invariant, snapshots: ArtifactSnapshot[]): boolean {
    // Check if invariant is for OpenAPI comparison
    if (invariant.comparatorType !== this.comparatorType) {
      return false;
    }

    // Check if we have one OpenAPI snapshot and one doc snapshot
    const hasOpenApi = snapshots.some(s => s.artifactType === 'openapi');
    const hasDoc = snapshots.some(s => 
      ['confluence_page', 'notion_page', 'github_readme'].includes(s.artifactType)
    );

    return hasOpenApi && hasDoc;
  }

  extractData(snapshot: ArtifactSnapshot): OpenApiData | DocData {
    if (snapshot.artifactType === 'openapi') {
      return this.extractOpenApiData(snapshot);
    } else {
      return this.extractDocData(snapshot);
    }
  }

  async performComparison(
    left: OpenApiData | DocData,
    right: OpenApiData | DocData,
    input: ComparatorInput
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    // Determine which is OpenAPI and which is doc
    const openApiData = 'schemas' in left ? left : right as OpenApiData;
    const docData = 'codeBlocks' in left ? left : right as DocData;

    // 1. Check endpoint parity
    const endpointFindings = this.compareEndpoints(openApiData.endpoints, docData.endpoints, input);
    findings.push(...endpointFindings);

    // 2. Check schema parity
    const schemaFindings = this.compareSchemas(openApiData.schemas, docData, input);
    findings.push(...schemaFindings);

    // 3. Check example parity
    const exampleFindings = this.compareExamples(openApiData.examples, docData.examples, input);
    findings.push(...exampleFindings);

    return findings;
  }

  // ======================================================================
  // EXTRACTION METHODS
  // ======================================================================

  private extractOpenApiData(snapshot: ArtifactSnapshot): OpenApiData {
    const extract = snapshot.extract as any;
    
    return {
      endpoints: extract.endpoints || [],
      schemas: extract.schemas || [],
      examples: extract.examples || [],
    };
  }

  private extractDocData(snapshot: ArtifactSnapshot): DocData {
    const extract = snapshot.extract as any;

    return {
      endpoints: extract.endpoints || [],
      examples: extract.examples || [],
      codeBlocks: extract.codeBlocks || [],
    };
  }

  // ======================================================================
  // COMPARISON METHODS
  // ======================================================================

  private compareEndpoints(
    openApiEndpoints: OpenApiEndpoint[],
    docEndpoints: DocEndpoint[],
    input: ComparatorInput
  ): IntegrityFinding[] {
    const findings: IntegrityFinding[] = [];

    // Create lookup maps
    const openApiMap = new Map<string, OpenApiEndpoint>();
    for (const endpoint of openApiEndpoints) {
      const key = `${endpoint.method} ${endpoint.path}`;
      openApiMap.set(key, endpoint);
    }

    const docMap = new Map<string, DocEndpoint>();
    for (const endpoint of docEndpoints) {
      const key = `${endpoint.method} ${endpoint.path}`;
      docMap.set(key, endpoint);
    }

    // Check for missing endpoints (in OpenAPI but not in docs)
    for (const [key, openApiEndpoint] of openApiMap) {
      if (!docMap.has(key) && !openApiEndpoint.deprecated) {
        const evidence: EvidenceItem[] = [{
          kind: 'endpoint_missing',
          leftValue: { method: openApiEndpoint.method, path: openApiEndpoint.path, summary: openApiEndpoint.summary },
          rightValue: null,
          pointers: {
            left: `/paths/${this.escapeJsonPointer(openApiEndpoint.path)}/${openApiEndpoint.method.toLowerCase()}`,
            right: null,
          },
        }];

        const severity: Severity = 'high'; // Missing documentation for new endpoint

        findings.push(this.createFinding({
          workspaceId: input.context.workspaceId,
          contractId: input.context.contractId,
          invariantId: input.invariant.invariantId,
          driftType: 'instruction',
          severity,
          compared: {
            left: { artifact: input.leftSnapshot, snapshotId: input.leftSnapshot.id },
            right: { artifact: input.rightSnapshot, snapshotId: input.rightSnapshot.id },
          },
          evidence,
          context: input.context,
        }));
      }
    }

    // Check for deprecated endpoints (in docs but not in OpenAPI)
    for (const [key, docEndpoint] of docMap) {
      if (!openApiMap.has(key)) {
        const evidence: EvidenceItem[] = [{
          kind: 'endpoint_deprecated',
          leftValue: null,
          rightValue: { method: docEndpoint.method, path: docEndpoint.path, description: docEndpoint.description },
          pointers: {
            left: null,
            right: `/endpoints/${key}`,
          },
        }];

        const severity: Severity = 'medium'; // Documented endpoint no longer exists

        findings.push(this.createFinding({
          workspaceId: input.context.workspaceId,
          contractId: input.context.contractId,
          invariantId: input.invariant.invariantId,
          driftType: 'instruction',
          severity,
          compared: {
            left: { artifact: input.leftSnapshot, snapshotId: input.leftSnapshot.id },
            right: { artifact: input.rightSnapshot, snapshotId: input.rightSnapshot.id },
          },
          evidence,
          context: input.context,
        }));
      }
    }

    // Check for parameter mismatches
    for (const [key, openApiEndpoint] of openApiMap) {
      const docEndpoint = docMap.get(key);
      if (docEndpoint && openApiEndpoint.parameters) {
        const openApiParams = new Set(openApiEndpoint.parameters.map(p => p.name));
        const docParams = new Set(docEndpoint.parameters || []);

        // Find missing parameters in docs
        for (const param of openApiEndpoint.parameters) {
          if (!docParams.has(param.name) && param.required) {
            const evidence: EvidenceItem[] = [{
              kind: 'parameter_missing',
              leftValue: { name: param.name, required: param.required, type: param.type },
              rightValue: null,
              pointers: {
                left: `/paths/${this.escapeJsonPointer(openApiEndpoint.path)}/${openApiEndpoint.method.toLowerCase()}/parameters/${param.name}`,
                right: null,
              },
            }];

            const severity: Severity = param.required ? 'high' : 'medium';

            findings.push(this.createFinding({
              workspaceId: input.context.workspaceId,
              contractId: input.context.contractId,
              invariantId: input.invariant.invariantId,
              driftType: 'instruction',
              severity,
              compared: {
                left: { artifact: input.leftSnapshot, snapshotId: input.leftSnapshot.id },
                right: { artifact: input.rightSnapshot, snapshotId: input.rightSnapshot.id },
              },
              evidence,
              context: input.context,
            }));
          }
        }
      }
    }

    return findings;
  }

  private compareSchemas(
    openApiSchemas: OpenApiSchema[],
    docData: DocData,
    input: ComparatorInput
  ): IntegrityFinding[] {
    const findings: IntegrityFinding[] = [];

    // Extract schema names mentioned in doc
    const docSchemaNames = new Set<string>();
    for (const codeBlock of docData.codeBlocks) {
      // Simple heuristic: look for schema names in code blocks
      for (const schema of openApiSchemas) {
        if (codeBlock.includes(schema.name)) {
          docSchemaNames.add(schema.name);
        }
      }
    }

    // Check for missing schemas
    for (const schema of openApiSchemas) {
      if (!docSchemaNames.has(schema.name)) {
        const evidence: EvidenceItem[] = [{
          kind: 'schema_missing',
          leftValue: { name: schema.name, type: schema.type },
          rightValue: null,
          pointers: {
            left: `/components/schemas/${schema.name}`,
            right: null,
          },
        }];

        const severity: Severity = 'medium'; // Missing schema documentation

        findings.push(this.createFinding({
          workspaceId: input.context.workspaceId,
          contractId: input.context.contractId,
          invariantId: input.invariant.invariantId,
          driftType: 'instruction',
          severity,
          compared: {
            left: { artifact: input.leftSnapshot, snapshotId: input.leftSnapshot.id },
            right: { artifact: input.rightSnapshot, snapshotId: input.rightSnapshot.id },
          },
          evidence,
          context: input.context,
        }));
      }
    }

    return findings;
  }

  private compareExamples(
    openApiExamples: OpenApiExample[],
    docExamples: DocExample[],
    input: ComparatorInput
  ): IntegrityFinding[] {
    const findings: IntegrityFinding[] = [];

    // Create lookup map for doc examples by endpoint
    const docExampleMap = new Map<string, DocExample[]>();
    for (const example of docExamples) {
      if (example.endpoint) {
        if (!docExampleMap.has(example.endpoint)) {
          docExampleMap.set(example.endpoint, []);
        }
        docExampleMap.get(example.endpoint)!.push(example);
      }
    }

    // Check for missing examples
    for (const openApiExample of openApiExamples) {
      const docExamplesForEndpoint = docExampleMap.get(openApiExample.endpoint);

      if (!docExamplesForEndpoint || docExamplesForEndpoint.length === 0) {
        const evidence: EvidenceItem[] = [{
          kind: 'example_missing',
          leftValue: { endpoint: openApiExample.endpoint, example: openApiExample.example },
          rightValue: null,
          pointers: {
            left: `/examples/${openApiExample.endpoint}`,
            right: null,
          },
        }];

        const severity: Severity = 'medium'; // Missing example

        findings.push(this.createFinding({
          workspaceId: input.context.workspaceId,
          contractId: input.context.contractId,
          invariantId: input.invariant.invariantId,
          driftType: 'instruction',
          severity,
          compared: {
            left: { artifact: input.leftSnapshot, snapshotId: input.leftSnapshot.id },
            right: { artifact: input.rightSnapshot, snapshotId: input.rightSnapshot.id },
          },
          evidence,
          context: input.context,
        }));
      }
    }

    return findings;
  }

  // ======================================================================
  // HELPER METHODS
  // ======================================================================

  private escapeJsonPointer(path: string): string {
    // JSON Pointer escaping: ~ becomes ~0, / becomes ~1
    return path.replace(/~/g, '~0').replace(/\//g, '~1');
  }
}
