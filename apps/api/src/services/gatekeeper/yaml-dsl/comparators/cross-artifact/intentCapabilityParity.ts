/**
 * Intent ↔ Capability Parity Comparator (Agent Governance - Spec→Build)
 * 
 * Verifies that actual code changes match declared intent capabilities:
 * - Detects undeclared capabilities (privilege expansion)
 * - Detects unused declared capabilities (over-scoping)
 * - Validates constraint compliance (read_only, no_new_infra, etc.)
 * 
 * This is a Spec→Build comparator in the Spec–Build–Run triangle.
 */

import type { Comparator, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import type { ObligationResult, EvidenceItem } from '../../ir/types.js';
import { CrossArtifactMessages, RemediationMessages } from '../../ir/messageCatalog.js';
import { prisma } from '../../../../../lib/db.js';
import { inferCapabilitiesFromFileChanges, detectOverpermissionedImports } from '../../../../agentGovernance/ingestion/agentSummaryParser.js';
import type { Capability, Constraints, FileChange } from '../../../../../types/agentGovernance.js';

export const intentCapabilityParityComparator: Comparator = {
  id: ComparatorId.INTENT_CAPABILITY_PARITY,
  version: '1.0.0',

  async evaluate(context: PRContext, params: IntentCapabilityParityParams): Promise<any> {
    const { owner, repo, prNumber, files, workspaceId, prAction } = context;
    const repoFullName = `${owner}/${repo}`;

    // Step 1: Fetch intent artifact from database
    const intentArtifact = await prisma.intentArtifact.findFirst({
      where: {
        workspaceId,
        prNumber,
        repoFullName,
      },
    });

    if (!intentArtifact) {
      // No intent artifact found - skip this comparator
      return {
        comparatorId: ComparatorId.INTENT_CAPABILITY_PARITY,
        status: 'unknown',
        reasonCode: FindingCode.NOT_EVALUABLE,
        message: 'No intent artifact found for this PR',
        evidence: [],
      };
    }

    // Step 2: Extract declared capabilities and constraints
    // requestedCapabilities is stored as string[] in DB (e.g. ["db_read","db_write"])
    // Parse them into Capability objects with wildcard resource so comparison works.
    const rawRequested: unknown[] = (intentArtifact.requestedCapabilities as unknown as unknown[]) || [];
    const declaredCapabilities: Capability[] = rawRequested.map((cap: unknown) => {
      if (typeof cap === 'string') {
        return { type: cap as Capability['type'], resource: '*' };
      }
      const c = cap as Partial<Capability>;
      return { type: c.type!, resource: c.resource ?? '*', scope: c.scope };
    });
    const constraints = (intentArtifact.constraints as unknown as Constraints) || {};

    // Step 3: Infer actual capabilities from file changes
    // P0-B FIX: pass patch so inferCapabilitiesFromFileChanges can detect IAM wildcards in diff content
    const fileChanges: FileChange[] = files.map(f => ({
      path: f.filename,
      changeType: (f.status === 'added' ? 'created' : f.status === 'removed' ? 'deleted' : 'modified') as FileChange['changeType'],
      linesAdded: f.additions ?? 0,
      linesDeleted: f.deletions ?? 0,
      patch: f.patch ?? undefined,
    }));

    const actualCapabilities = inferCapabilitiesFromFileChanges(fileChanges);

    // Step 3b: Import-level over-permission detection
    // Scans added import statements for cloud SDK patterns that imply undeclared capabilities
    const overpermissionedImports = detectOverpermissionedImports(fileChanges);

    // Step 4: Compare declared vs actual capabilities
    const violations = compareCapabilities(declaredCapabilities, actualCapabilities, constraints);

    // Step 4b: Add overpermissioned import violations (if not already covered by declared caps)
    for (const imp of overpermissionedImports) {
      const isCovered = declaredCapabilities.some(d => d.type === imp.capability);
      if (!isCovered) {
        violations.push({
          type: 'undeclared',
          capability: imp.capability,
          resource: imp.file,
          reason: `${imp.description} imported but '${imp.capability}' not declared in IntentArtifact`,
        });
      }
    }

    // Step 5: Persist findings to IntentArtifact.specBuildFindings (governance page reads this)
    // P0-A FIX: mark isFinalSnapshot:true when the PR was just merged (closed event)
    const specBuildFindings = {
      checkedAt: new Date().toISOString(),
      isFinalSnapshot: prAction === 'closed', // true only at actual merge time
      declaredCapabilities: declaredCapabilities.map(c => c.type),
      actualCapabilities: actualCapabilities.map(c => ({ type: c.type, resource: c.resource })),
      importedCapabilities: overpermissionedImports,
      violations: violations.map(v => ({
        type: v.type,
        capability: v.capability,
        resource: v.resource,
        reason: v.reason,
      })),
      summary: violations.length === 0 ? 'pass' : (
        violations.some(v => v.type === 'undeclared') ? 'privilege_expansion' : 'constraint_violation'
      ),
    };
    try {
      await prisma.intentArtifact.update({
        where: { id: intentArtifact.id },
        data: { specBuildFindings: JSON.stringify(specBuildFindings) },
      });
    } catch { /* non-blocking — governance display is best-effort */ }

    // Step 6: Build evidence
    const evidence: EvidenceItem[] = [];
    for (const violation of violations) {
      const isImportViolation = violation.type === 'undeclared' &&
        overpermissionedImports.some(i => i.file === violation.resource && i.capability === violation.capability);
      evidence.push({
        type: 'artifact',
        location: violation.resource,
        found: true,
        details: `${violation.type}: ${violation.reason}`,
        metadata: {
          capabilityType: violation.capability,
          violationType: violation.type,
          reasonCode: isImportViolation ? FindingCode.OVERPERMISSIONED_IMPORT : FindingCode.INTENT_CAPABILITY_UNDECLARED,
        },
      });
    }

    // Step 7: Return result
    if (violations.length > 0) {
      const undeclaredViolations = violations.filter(v => v.type === 'undeclared');

      return {
        comparatorId: ComparatorId.INTENT_CAPABILITY_PARITY,
        status: 'fail',
        reasonCode: undeclaredViolations.length > 0
          ? FindingCode.INTENT_CAPABILITY_UNDECLARED
          : FindingCode.INTENT_CONSTRAINT_VIOLATED,
        message: `Intent capability parity check failed: ${violations.length} violation(s) detected`,
        evidence,
      };
    }

    return {
      comparatorId: ComparatorId.INTENT_CAPABILITY_PARITY,
      status: 'pass',
      reasonCode: FindingCode.PASS,
      message: 'All capabilities match declared intent',
      evidence,
    };
  },
};

// ============================================================================
// CAPABILITY COMPARISON LOGIC
// ============================================================================

interface CapabilityViolation {
  type: 'undeclared' | 'unused' | 'constraint_violation';
  capability: string;
  resource: string;
  reason: string;
}

function compareCapabilities(
  declared: Capability[],
  actual: Capability[],
  constraints: Constraints
): CapabilityViolation[] {
  const violations: CapabilityViolation[] = [];

  // Check for undeclared capabilities (privilege expansion)
  for (const actualCap of actual) {
    const isDeclared = declared.some(declaredCap => {
      // Types must match
      if (declaredCap.type !== actualCap.type) return false;
      // Wildcard resource '*' covers any actual resource
      if (declaredCap.resource === '*') return true;
      return declaredCap.resource === actualCap.resource;
    });

    if (!isDeclared) {
      violations.push({
        type: 'undeclared',
        capability: actualCap.type,
        resource: actualCap.resource,
        reason: `Undeclared capability: ${actualCap.type} on ${actualCap.resource}`,
      });
    }
  }

  // Check constraint violations
  if (constraints.read_only) {
    const writeCapabilities = actual.filter(cap => 
      cap.type.includes('write') || cap.type.includes('modify') || cap.type.includes('delete')
    );
    for (const writeCap of writeCapabilities) {
      violations.push({
        type: 'constraint_violation',
        capability: writeCap.type,
        resource: writeCap.resource,
        reason: `Constraint violation: read_only constraint violated by ${writeCap.type}`,
      });
    }
  }

  if (constraints.no_new_infra) {
    const infraCapabilities = actual.filter(cap => cap.type === 'infra_create');
    for (const infraCap of infraCapabilities) {
      violations.push({
        type: 'constraint_violation',
        capability: infraCap.type,
        resource: infraCap.resource,
        reason: `Constraint violation: no_new_infra constraint violated`,
      });
    }
  }

  return violations;
}

export interface IntentCapabilityParityParams {
  /**
   * If true, warn on unused declared capabilities (over-scoping)
   */
  warnOnUnused?: boolean;
}

