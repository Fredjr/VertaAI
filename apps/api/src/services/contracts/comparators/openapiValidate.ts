/**
 * OpenAPI Validate Comparator
 * 
 * Validates OpenAPI spec structure and detects breaking changes.
 * 
 * Checks:
 * - Valid OpenAPI structure (version, paths, components)
 * - Breaking changes:
 *   - Removed endpoints
 *   - Removed required parameters
 *   - Changed parameter types
 *   - Removed schemas
 *   - Removed required fields in schemas
 * 
 * Tier: 1 (Highest PMF)
 * Deterministic: Yes
 * Max Latency: < 5 seconds
 */

import { BaseComparator } from './base.js';
import { getComparatorRegistry } from './registry.js';
import { detectBreakingChanges } from './openapiBreakingChanges.js';
import type {
  Invariant,
  ArtifactSnapshot,
  IntegrityFinding,
  ComparatorInput,
  EvidenceItem,
} from '../types.js';
import type { OpenApiData } from './openapi.js';

// ======================================================================
// OPENAPI VALIDATE COMPARATOR
// ======================================================================

export class OpenApiValidateComparator extends BaseComparator {
  readonly comparatorType = 'openapi.validate';
  readonly supportedArtifactTypes = ['openapi', 'openapi_spec'];

  canCompare(invariant: Invariant, snapshots: ArtifactSnapshot[]): boolean {
    // Check if invariant is for OpenAPI validation
    if (invariant.comparatorType !== this.comparatorType) {
      return false;
    }

    // Check if we have two OpenAPI snapshots
    const hasOpenApi = snapshots.every(s =>
      this.supportedArtifactTypes.includes(s.artifactType)
    );

    return hasOpenApi && snapshots.length >= 2;
  }

  extractData(snapshot: ArtifactSnapshot): OpenApiData {
    const extract = snapshot.extract as any;

    return {
      endpoints: extract.endpoints || [],
      schemas: extract.schemas || [],
      examples: extract.examples || [],
    };
  }

  async performComparison(
    left: OpenApiData,
    right: OpenApiData,
    input: ComparatorInput
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    // 1. Validate OpenAPI structure
    const structureFindings = this.validateStructure(right, input);
    findings.push(...structureFindings);

    // 2. Detect breaking changes
    const breakingChanges = detectBreakingChanges(left, right);

    // 3. Create findings for each breaking change
    for (const change of breakingChanges) {
      const evidence: EvidenceItem[] = [{
        kind: change.type,
        leftValue: change.left,
        rightValue: change.right,
        pointers: {
          left: change.pointer || null,
          right: change.pointer || null,
        },
      }];

      findings.push(this.createFinding({
        workspaceId: input.context.workspaceId,
        contractId: input.context.contractId,
        invariantId: input.invariant.invariantId,
        driftType: 'breaking_change',
        severity: change.severity,
        compared: {
          left: { artifact: input.leftSnapshot, snapshotId: input.leftSnapshot.id },
          right: { artifact: input.rightSnapshot, snapshotId: input.rightSnapshot.id },
        },
        evidence,
        context: input.context,
      }));
    }

    return findings;
  }

  // ======================================================================
  // VALIDATION METHODS
  // ======================================================================

  private validateStructure(data: OpenApiData, input: ComparatorInput): IntegrityFinding[] {
    const findings: IntegrityFinding[] = [];

    // Check if OpenAPI spec has at least one endpoint
    if (data.endpoints.length === 0) {
      const evidence: EvidenceItem[] = [{
        kind: 'structure_invalid',
        leftValue: null,
        rightValue: { message: 'No endpoints defined in OpenAPI spec' },
        pointers: {
          left: null,
          right: '/paths',
        },
      }];

      findings.push(this.createFinding({
        workspaceId: input.context.workspaceId,
        contractId: input.context.contractId,
        invariantId: input.invariant.invariantId,
        driftType: 'instruction',
        severity: 'high',
        compared: {
          left: { artifact: input.leftSnapshot, snapshotId: input.leftSnapshot.id },
          right: { artifact: input.rightSnapshot, snapshotId: input.rightSnapshot.id },
        },
        evidence,
        context: input.context,
      }));
    }

    // Check for endpoints with missing required fields
    for (const endpoint of data.endpoints) {
      if (!endpoint.method || !endpoint.path) {
        const evidence: EvidenceItem[] = [{
          kind: 'structure_invalid',
          leftValue: null,
          rightValue: { message: 'Endpoint missing method or path', endpoint },
          pointers: {
            left: null,
            right: `/paths/${endpoint.path || 'unknown'}`,
          },
        }];

        findings.push(this.createFinding({
          workspaceId: input.context.workspaceId,
          contractId: input.context.contractId,
          invariantId: input.invariant.invariantId,
          driftType: 'instruction',
          severity: 'medium',
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
}

// ======================================================================
// AUTO-REGISTRATION
// ======================================================================

// Auto-register this comparator when the module is imported
const openApiValidateComparator = new OpenApiValidateComparator();
getComparatorRegistry().register(openApiValidateComparator);

