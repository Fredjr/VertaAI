/**
 * Artifact Graph Builder (11.1 Acceptance Criteria)
 * 
 * Builds an explicit artifact graph from cross-artifact comparator results.
 * This transforms implicit drift detection into an explicit graph structure.
 */

import type {
  ArtifactGraph,
  ArtifactNode,
  ArtifactEdge,
  DriftEdge,
  EvidenceItem,
} from './types.js';
import type { PRContext } from './comparators/types.js';

/**
 * Build artifact graph from PR context and comparator results
 */
export function buildArtifactGraph(
  context: PRContext,
  autoInvokedFindings: any[]
): ArtifactGraph {
  const nodes: ArtifactNode[] = [];
  const edges: ArtifactEdge[] = [];
  const driftEdges: DriftEdge[] = [];

  // Define all artifact nodes based on file patterns
  const artifactDefinitions = getArtifactDefinitions(context);
  nodes.push(...artifactDefinitions);

  // Define all edges (parity invariants)
  const edgeDefinitions = getEdgeDefinitions();
  edges.push(...edgeDefinitions);

  // Detect drift from auto-invoked findings
  for (const finding of autoInvokedFindings) {
    const drift = extractDriftFromFinding(finding);
    if (drift) {
      driftEdges.push(drift);
    }
  }

  return { nodes, edges, driftEdges };
}

/**
 * Get artifact node definitions based on files in PR
 */
function getArtifactDefinitions(context: PRContext): ArtifactNode[] {
  const { files } = context;
  const nodes: ArtifactNode[] = [];

  // OpenAPI spec
  const openapiFiles = files.filter(f =>
    f.filename.match(/openapi\.(yaml|yml|json)$/i) ||
    f.filename.match(/swagger\.(yaml|yml|json)$/i)
  );
  if (openapiFiles.length > 0) {
    nodes.push({
      id: 'openapi',
      type: 'spec',
      paths: openapiFiles.map(f => f.filename),
    });
  }

  // Routes/Endpoints (implementation)
  const routeFiles = files.filter(f =>
    f.filename.includes('/routes/') ||
    f.filename.includes('/handlers/') ||
    f.filename.includes('/controllers/') ||
    f.filename.includes('/api/') ||
    f.filename.includes('/endpoints/')
  );
  if (routeFiles.length > 0) {
    nodes.push({
      id: 'routes',
      type: 'implementation',
      paths: routeFiles.map(f => f.filename),
    });
  }

  // Database schema
  const schemaFiles = files.filter(f =>
    f.filename.includes('schema.prisma') ||
    f.filename.endsWith('.sql') ||
    f.filename.includes('knexfile')
  );
  if (schemaFiles.length > 0) {
    nodes.push({
      id: 'schema',
      type: 'data',
      paths: schemaFiles.map(f => f.filename),
    });
  }

  // Migrations
  const migrationFiles = files.filter(f =>
    f.filename.includes('/migrations/') ||
    f.filename.includes('/alembic/') ||
    f.filename.includes('/flyway/')
  );
  if (migrationFiles.length > 0) {
    nodes.push({
      id: 'migrations',
      type: 'data',
      paths: migrationFiles.map(f => f.filename),
    });
  }

  // Contracts (Proto, GraphQL, etc.)
  const contractFiles = files.filter(f =>
    f.filename.endsWith('.proto') ||
    f.filename.endsWith('.thrift') ||
    f.filename.endsWith('.avsc') ||
    f.filename.endsWith('.graphql')
  );
  if (contractFiles.length > 0) {
    nodes.push({
      id: 'contracts',
      type: 'spec',
      paths: contractFiles.map(f => f.filename),
    });
  }

  // Generated code
  const generatedFiles = files.filter(f =>
    f.filename.includes('/generated/') ||
    f.filename.includes('/codegen/') ||
    f.filename.includes('_pb.') ||
    f.filename.includes('.generated.')
  );
  if (generatedFiles.length > 0) {
    nodes.push({
      id: 'generated',
      type: 'implementation',
      paths: generatedFiles.map(f => f.filename),
    });
  }

  // Documentation
  const docFiles = files.filter(f =>
    f.filename.endsWith('.md') ||
    f.filename.includes('/docs/') ||
    f.filename.includes('README')
  );
  if (docFiles.length > 0) {
    nodes.push({
      id: 'docs',
      type: 'documentation',
      paths: docFiles.map(f => f.filename),
    });
  }

  // Tests
  const testFiles = files.filter(f =>
    f.filename.includes('.test.') ||
    f.filename.includes('.spec.') ||
    f.filename.includes('/__tests__/')
  );
  if (testFiles.length > 0) {
    nodes.push({
      id: 'tests',
      type: 'test',
      paths: testFiles.map(f => f.filename),
    });
  }

  return nodes;
}

/**
 * Get edge definitions (parity invariants)
 */
function getEdgeDefinitions(): ArtifactEdge[] {
  return [
    // OpenAPI ↔ Routes
    {
      id: 'openapi-routes',
      from: 'openapi',
      to: 'routes',
      relationship: 'defines',
      invariant: 'OpenAPI spec changes must be reflected in route implementations',
      comparatorId: 'OPENAPI_CODE_PARITY',
      bidirectional: true,
    },

    // Schema ↔ Migrations
    {
      id: 'schema-migrations',
      from: 'schema',
      to: 'migrations',
      relationship: 'defines',
      invariant: 'Schema changes must have corresponding migration files',
      comparatorId: 'SCHEMA_MIGRATION_PARITY',
      bidirectional: true,
    },

    // Contracts ↔ Generated
    {
      id: 'contracts-generated',
      from: 'contracts',
      to: 'generated',
      relationship: 'defines',
      invariant: 'Contract changes must regenerate implementation code',
      comparatorId: 'CONTRACT_IMPLEMENTATION_PARITY',
      bidirectional: true,
    },

    // Docs ↔ Code
    {
      id: 'docs-code',
      from: 'docs',
      to: 'routes',
      relationship: 'documents',
      invariant: 'Documentation must stay in sync with code changes',
      comparatorId: 'DOC_CODE_PARITY',
      bidirectional: true,
    },

    // Code ↔ Tests
    {
      id: 'code-tests',
      from: 'routes',
      to: 'tests',
      relationship: 'tests',
      invariant: 'Implementation changes must have corresponding test updates',
      comparatorId: 'TEST_IMPLEMENTATION_PARITY',
      bidirectional: true,
    },
  ];
}

/**
 * Extract drift information from an auto-invoked finding
 */
function extractDriftFromFinding(finding: any): DriftEdge | null {
  const { ruleId, comparatorResult } = finding;

  // Only process failed findings
  if (comparatorResult.status !== 'fail') {
    return null;
  }

  // Map comparator ID to edge ID
  const edgeMap: Record<string, string> = {
    'auto-invoked-openapi_code_parity': 'openapi-routes',
    'auto-invoked-schema_migration_parity': 'schema-migrations',
    'auto-invoked-contract_implementation_parity': 'contracts-generated',
    'auto-invoked-doc_code_parity': 'docs-code',
    'auto-invoked-test_implementation_parity': 'code-tests',
  };

  const edgeId = edgeMap[ruleId];
  if (!edgeId) {
    return null;
  }

  // Extract evidence
  const evidence: EvidenceItem[] = comparatorResult.evidence || [];

  // Calculate severity from confidence
  const confidence = comparatorResult.confidence?.evidence || 50;
  const severity = 100 - confidence; // Higher confidence in drift = higher severity

  return {
    edgeId,
    severity,
    evidence,
    detectedAt: new Date(),
    message: comparatorResult.reasonHuman || comparatorResult.reason || 'Drift detected',
  };
}

/**
 * Generate Mermaid diagram from artifact graph
 */
export function renderArtifactGraphMermaid(graph: ArtifactGraph): string {
  const lines: string[] = [];

  lines.push('```mermaid');
  lines.push('graph LR');
  lines.push('');

  // Add nodes with styling
  const nodeStyles: Record<string, string> = {
    'openapi': 'OpenAPI[OpenAPI Spec]',
    'routes': 'Routes[Routes/Endpoints]',
    'schema': 'Schema[Database Schema]',
    'migrations': 'Migrations[Migration Files]',
    'contracts': 'Contracts[Contracts Proto/GraphQL]',
    'generated': 'Generated[Generated Code]',
    'docs': 'Docs[Documentation]',
    'tests': 'Tests[Test Files]',
  };

  // Add edges
  for (const edge of graph.edges) {
    const fromLabel = nodeStyles[edge.from] || edge.from;
    const toLabel = nodeStyles[edge.to] || edge.to;
    const arrow = edge.bidirectional ? '<-->' : '-->';

    lines.push(`    ${fromLabel} ${arrow}|${edge.relationship}| ${toLabel}`);
  }

  lines.push('');

  // Highlight drift edges
  const driftNodeIds = new Set<string>();
  for (const drift of graph.driftEdges) {
    const edge = graph.edges.find(e => e.id === drift.edgeId);
    if (edge) {
      driftNodeIds.add(edge.from);
      driftNodeIds.add(edge.to);
    }
  }

  // Apply styling
  for (const nodeId of driftNodeIds) {
    lines.push(`    style ${nodeStyles[nodeId]?.split('[')[0] || nodeId} fill:#ff6b6b,stroke:#c92a2a`);
  }

  lines.push('```');

  return lines.join('\n');
}

/**
 * Render drift summary for PR output
 */
export function renderDriftSummary(graph: ArtifactGraph): string {
  if (graph.driftEdges.length === 0) {
    return '✅ **No drift detected** - All artifacts are in sync';
  }

  const lines: string[] = [];
  lines.push(`⚠️ **${graph.driftEdges.length} drift edge(s) detected:**`);
  lines.push('');

  for (const drift of graph.driftEdges) {
    const edge = graph.edges.find(e => e.id === drift.edgeId);
    if (edge) {
      const severityEmoji = drift.severity >= 70 ? '🔴' : drift.severity >= 40 ? '🟡' : '🔵';
      lines.push(`- ${severityEmoji} **${edge.from} → ${edge.to}** - ${drift.message}`);
    }
  }

  return lines.join('\n');
}


