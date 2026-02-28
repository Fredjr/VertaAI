/**
 * ARTIFACT_UPDATED Comparator
 * Migration Plan v5.0 - Sprint 1, Task 1.3
 *
 * Checks if specified artifact was updated in the PR
 * CRITICAL: Uses service-aware artifact resolver (not globs)
 *
 * Phase 4: Migrated to structured IR output
 * - evaluateStructured(): Returns ObligationResult (NEW)
 * - evaluate(): Returns ComparatorResult (LEGACY, kept for backward compatibility)
 */

import type { Comparator, ComparatorResult, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import { resolveArtifactTargets } from '../artifactResolver.js';
import type { ObligationResult } from '../../ir/types.js';
import {
  createObligation,
  missingFileEvidence,
  presentFileEvidence,
  calculateArtifactRisk,
  outdatedArtifactRemediation,
} from '../../ir/obligationDSL.js';

function normalizePath(path: string): string {
  return path.replace(/^\.\//, '').replace(/\\/g, '/').trim();
}

export const artifactUpdatedComparator: Comparator = {
  id: ComparatorId.ARTIFACT_UPDATED,
  version: '2.0.0', // Phase 4: Bumped to 2.0.0 (structured IR support)

  /**
   * NEW: Structured evaluation (Phase 4)
   * Returns fully structured ObligationResult
   */
  async evaluateStructured(context: PRContext, params: any): Promise<ObligationResult> {
    const { artifactType, title, controlObjective, decisionOnFail = 'block' } = params;

    // Create obligation builder
    const obligation = createObligation({
      id: `artifact-updated-${artifactType}`,
      title: title || `${artifactType} Artifact Updated`,
      controlObjective: controlObjective || `Ensure ${artifactType} artifacts are updated when relevant code changes`,
      scope: 'diff_derived',
      decisionOnFail: decisionOnFail as 'block' | 'warn' | 'pass',
    });

    // CRITICAL: Use service-aware artifact resolver (not globs)
    const targets = await resolveArtifactTargets(context, artifactType);

    if (targets.length === 0) {
      return obligation.notEvaluable(
        `No artifact registry configured for type: ${artifactType}. Configure workspace defaults artifactRegistry.`,
        'policy_misconfig'
      );
    }

    // Check if any target was updated
    const updatedTargets = targets.filter(target =>
      context.files.some(file =>
        normalizePath(file.filename) === normalizePath(target.path) ||
        (file.previous_filename && normalizePath(file.previous_filename) === normalizePath(target.path))
      )
    );

    // All targets updated - PASS
    if (updatedTargets.length > 0) {
      return obligation.pass(
        `Artifact ${artifactType} updated for services: ${updatedTargets.map(t => t.service).join(', ')}`
      );
    }

    // Artifact not updated - FAIL
    return obligation.fail({
      reasonCode: 'ARTIFACT_NOT_UPDATED',
      reasonHuman: `Artifact ${artifactType} not updated. Expected paths: ${targets.map(t => t.path).join(', ')}`,
      evidence: targets.map(t => missingFileEvidence(
        t.path,
        `Expected for service: ${t.service}`
      )),
      evidenceSearch: {
        locationsSearched: targets.map(t => t.path),
        strategy: 'service_aware_artifact_resolver',
        confidence: 1.0,
      },
      remediation: outdatedArtifactRemediation({
        artifactType,
        path: targets[0].path,
        requiredChanges: [`Update ${artifactType} to reflect code changes`],
        docsLink: params.docsLink,
        owner: params.owner || 'platform-team',
      }),
      risk: calculateArtifactRisk({
        isBlocking: decisionOnFail === 'block',
        affectsAPI: artifactType.toLowerCase().includes('openapi') || artifactType.toLowerCase().includes('api'),
        affectsDeployment: artifactType.toLowerCase().includes('dockerfile') || artifactType.toLowerCase().includes('deploy'),
        hasDownstreamDeps: true,
      }),
    });
  },

  /**
   * LEGACY: Unstructured evaluation (backward compatibility)
   * Kept for existing integrations
   */
  async evaluate(context: PRContext, params: any): Promise<ComparatorResult> {
    const { artifactType } = params;

    // CRITICAL: Use service-aware artifact resolver (not globs)
    const targets = await resolveArtifactTargets(context, artifactType);

    if (targets.length === 0) {
      // No artifact registry configured - return deterministic finding
      return {
        comparatorId: this.id,
        status: 'fail',
        evidence: [],
        reasonCode: FindingCode.ARTIFACT_NO_REGISTRY,
        message: `No artifact registry configured for type: ${artifactType}. Configure workspace defaults artifactRegistry.`,
      };
    }

    // Check if any target was updated
    const updatedTargets = targets.filter(target =>
      context.files.some(file =>
        normalizePath(file.filename) === normalizePath(target.path) ||
        (file.previous_filename && normalizePath(file.previous_filename) === normalizePath(target.path))
      )
    );

    if (updatedTargets.length > 0) {
      return {
        comparatorId: this.id,
        status: 'pass',
        evidence: updatedTargets.map(t => ({
          type: 'file',
          path: t.path,
          snippet: `Service: ${t.service}`,
        })),
        reasonCode: FindingCode.PASS,
        message: `Artifact ${artifactType} updated for services: ${updatedTargets.map(t => t.service).join(', ')}`,
      };
    }

    // Artifact not updated - provide specific expected paths
    return {
      comparatorId: this.id,
      status: 'fail',
      evidence: targets.map(t => ({
        type: 'file',
        path: t.path,
        snippet: `Expected for service: ${t.service}`,
      })),
      reasonCode: FindingCode.ARTIFACT_NOT_UPDATED,
      message: `Artifact ${artifactType} not updated. Expected paths: ${targets.map(t => t.path).join(', ')}`,
    };
  },
};

