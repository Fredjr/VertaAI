/**
 * ARTIFACT_PRESENT Comparator
 * Migration Plan v5.0 - Sprint 1, Task 1.3
 * 
 * Checks if specified artifact exists in the repository
 * CRITICAL: Uses service-aware artifact resolver (not globs)
 */

import type { Comparator, ComparatorResult, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import { resolveArtifactTargets } from '../artifactResolver.js';

export const artifactPresentComparator: Comparator = {
  id: ComparatorId.ARTIFACT_PRESENT,
  version: '1.0.0',

  async evaluate(context: PRContext, params: any): Promise<ComparatorResult> {
    const { artifactType } = params;

    // CRITICAL: Use service-aware artifact resolver (not globs)
    const targets = await resolveArtifactTargets(context, artifactType);

    if (targets.length === 0) {
      return {
        comparatorId: this.id,
        status: 'fail',
        evidence: [],
        reasonCode: FindingCode.ARTIFACT_NO_REGISTRY,
        message: `No artifact registry configured for type: ${artifactType}`,
      };
    }

    // Check if artifacts exist by fetching from GitHub
    const missingTargets: typeof targets = [];
    const presentTargets: typeof targets = [];

    for (const target of targets) {
      try {
        await context.github.rest.repos.getContent({
          owner: context.owner,
          repo: context.repo,
          path: target.path,
          ref: context.headSha,
        });
        presentTargets.push(target);
      } catch (error: any) {
        if (error.status === 404) {
          missingTargets.push(target);
        } else {
          // Other errors (rate limit, network, etc.)
          throw error;
        }
      }
    }

    if (missingTargets.length === 0) {
      return {
        comparatorId: this.id,
        status: 'pass',
        evidence: presentTargets.map(t => ({
          type: 'file',
          path: t.path,
          snippet: `Service: ${t.service}`,
        })),
        reasonCode: FindingCode.PASS,
        message: `All ${artifactType} artifacts present`,
      };
    }

    return {
      comparatorId: this.id,
      status: 'fail',
      evidence: missingTargets.map(t => ({
        type: 'file',
        path: t.path,
        snippet: `Missing for service: ${t.service}`,
      })),
      reasonCode: FindingCode.ARTIFACT_MISSING,
      message: `Missing ${artifactType} artifacts: ${missingTargets.map(t => t.path).join(', ')}`,
    };
  },
};

