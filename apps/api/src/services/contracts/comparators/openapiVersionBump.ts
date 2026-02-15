/**
 * OpenAPI Version Bump Comparator
 * 
 * Ensures version follows semver rules based on detected changes.
 * 
 * Rules:
 * - Breaking changes → major bump required
 * - New features (non-breaking) → minor bump required
 * - Bug fixes only → patch bump required
 * - No changes → no bump required
 * 
 * Tier: 1 (Highest PMF)
 * Deterministic: Yes
 * Max Latency: < 5 seconds
 */

import { BaseComparator } from './base.js';
import { getComparatorRegistry } from './registry.js';
import { detectAllChanges } from './openapiBreakingChanges.js';
import {
  parseSemver,
  compareSemver,
  determineRequiredBump,
  validateVersionBump,
  formatSemver,
  type BumpType,
} from './semverUtils.js';
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
// TYPES
// ======================================================================

interface OpenApiDataWithVersion extends OpenApiData {
  version?: string;
}

// ======================================================================
// OPENAPI VERSION BUMP COMPARATOR
// ======================================================================

export class OpenApiVersionBumpComparator extends BaseComparator {
  readonly comparatorType = 'openapi.version_bump';
  readonly supportedArtifactTypes = ['openapi', 'openapi_spec'];

  canCompare(invariant: Invariant, snapshots: ArtifactSnapshot[]): boolean {
    // Check if invariant is for OpenAPI version bump
    if (invariant.comparatorType !== this.comparatorType) {
      return false;
    }

    // Check if we have two OpenAPI snapshots
    const hasOpenApi = snapshots.every(s =>
      this.supportedArtifactTypes.includes(s.artifactType)
    );

    return hasOpenApi && snapshots.length >= 2;
  }

  extractData(snapshot: ArtifactSnapshot): OpenApiDataWithVersion {
    const extract = snapshot.extract as any;

    return {
      endpoints: extract.endpoints || [],
      schemas: extract.schemas || [],
      examples: extract.examples || [],
      version: extract.version || extract.info?.version,
    };
  }

  async performComparison(
    left: OpenApiDataWithVersion,
    right: OpenApiDataWithVersion,
    input: ComparatorInput
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    // 1. Extract versions
    const leftVersion = left.version;
    const rightVersion = right.version;

    if (!leftVersion || !rightVersion) {
      // Missing version information
      const evidence: EvidenceItem[] = [{
        kind: 'version_missing',
        leftValue: leftVersion,
        rightValue: rightVersion,
        pointers: {
          left: '/info/version',
          right: '/info/version',
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

      return findings;
    }

    // 2. Parse versions
    const leftSemver = parseSemver(leftVersion);
    const rightSemver = parseSemver(rightVersion);

    if (!leftSemver || !rightSemver) {
      // Invalid semver format
      const evidence: EvidenceItem[] = [{
        kind: 'version_invalid',
        leftValue: leftVersion,
        rightValue: rightVersion,
        pointers: {
          left: '/info/version',
          right: '/info/version',
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

      return findings;
    }

    // 3. Detect changes
    const changes = detectAllChanges(left, right);

    // 4. Determine required bump
    const requiredBump = determineRequiredBump(changes);

    // 5. Determine actual bump
    const actualBump = compareSemver(leftSemver, rightSemver);

    // 6. Validate version bump
    const isValid = validateVersionBump(actualBump, requiredBump);

    if (!isValid) {
      const severity = this.determineSeverity(requiredBump, actualBump);

      const evidence: EvidenceItem[] = [{
        kind: 'version_bump_incorrect',
        leftValue: {
          version: formatSemver(leftSemver),
          changes: changes.length,
          requiredBump,
        },
        rightValue: {
          version: formatSemver(rightSemver),
          actualBump,
        },
        pointers: {
          left: '/info/version',
          right: '/info/version',
        },
      }];

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

    return findings;
  }

  // ======================================================================
  // HELPER METHODS
  // ======================================================================

  private determineSeverity(requiredBump: BumpType, actualBump: BumpType): Severity {
    // Breaking change but no major bump → critical
    if (requiredBump === 'major' && actualBump !== 'major') {
      return 'critical';
    }

    // New feature but no minor bump → high
    if (requiredBump === 'minor' && actualBump === 'patch') {
      return 'high';
    }

    // Patch bump when minor/major required → medium
    return 'medium';
  }
}

// ======================================================================
// AUTO-REGISTRATION
// ======================================================================

// Auto-register this comparator when the module is imported
const openApiVersionBumpComparator = new OpenApiVersionBumpComparator();
getComparatorRegistry().register(openApiVersionBumpComparator);

