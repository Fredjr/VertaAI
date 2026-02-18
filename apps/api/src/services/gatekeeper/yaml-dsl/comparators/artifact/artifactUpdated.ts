/**
 * ARTIFACT_UPDATED Comparator
 * Migration Plan v5.0 - Sprint 1, Task 1.3
 * 
 * Checks if specified artifact was updated in the PR
 * CRITICAL: Uses service-aware artifact resolver (not globs)
 */

import type { Comparator, ComparatorResult, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import { resolveArtifactTargets } from '../artifactResolver.js';

function normalizePath(path: string): string {
  return path.replace(/^\.\//, '').replace(/\\/g, '/').trim();
}

export const artifactUpdatedComparator: Comparator = {
  id: ComparatorId.ARTIFACT_UPDATED,
  version: '1.0.0',

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

