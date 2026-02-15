/**
 * OpenAPI Diff Comparator
 * 
 * Compares two OpenAPI specs and identifies ALL changes (breaking + non-breaking).
 * 
 * Detects:
 * - Added/removed/modified endpoints
 * - Added/removed/modified parameters
 * - Added/removed/modified responses
 * - Added/removed/modified schemas
 * - Added/removed/modified schema properties
 * 
 * Tier: 1 (Highest PMF)
 * Deterministic: Yes
 * Max Latency: < 5 seconds
 */

import { BaseComparator } from './base.js';
import { getComparatorRegistry } from './registry.js';
import { detectAllChanges } from './openapiBreakingChanges.js';
import type {
  Invariant,
  ArtifactSnapshot,
  IntegrityFinding,
  ComparatorInput,
  EvidenceItem,
  Severity,
} from '../types.js';
import type { OpenApiData } from './openapi.js';

// ======================================================================
// OPENAPI DIFF COMPARATOR
// ======================================================================

export class OpenApiDiffComparator extends BaseComparator {
  readonly comparatorType = 'openapi.diff';
  readonly supportedArtifactTypes = ['openapi', 'openapi_spec'];

  canCompare(invariant: Invariant, snapshots: ArtifactSnapshot[]): boolean {
    // Check if invariant is for OpenAPI diff
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

    // Detect all changes (breaking + non-breaking)
    const changes = detectAllChanges(left, right);

    // Create findings for each change
    for (const change of changes) {
      const evidence: EvidenceItem[] = [{
        kind: change.type,
        leftValue: change.left,
        rightValue: change.right,
        pointers: {
          left: change.pointer || null,
          right: change.pointer || null,
        },
      }];

      // Determine severity based on change type and breaking status
      const severity = this.determineSeverity(change.type, change.breaking);

      findings.push(this.createFinding({
        workspaceId: input.context.workspaceId,
        contractId: input.context.contractId,
        invariantId: input.invariant.invariantId,
        driftType: change.breaking ? 'breaking_change' : 'instruction',
        severity,
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
  // HELPER METHODS
  // ======================================================================

  private determineSeverity(changeType: string, breaking: boolean): Severity {
    // Breaking changes are always high or critical
    if (breaking) {
      if (changeType === 'endpoint_removed' || changeType === 'parameter_removed') {
        return 'critical';
      }
      return 'high';
    }

    // Non-breaking changes are low or medium
    if (changeType === 'endpoint_added' || changeType === 'schema_added') {
      return 'low'; // New features are informational
    }

    return 'medium'; // Other changes are medium
  }
}

// ======================================================================
// AUTO-REGISTRATION
// ======================================================================

// Auto-register this comparator when the module is imported
const openApiDiffComparator = new OpenApiDiffComparator();
getComparatorRegistry().register(openApiDiffComparator);

