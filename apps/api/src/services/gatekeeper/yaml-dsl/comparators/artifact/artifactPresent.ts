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

/**
 * Find closest matches for missing artifacts
 * CRITICAL FIX: Evidence transparency - show what we found nearby
 */
async function findClosestMatches(context: PRContext, missingPaths: string[]): Promise<string[]> {
  const closestMatches: string[] = [];

  for (const missingPath of missingPaths) {
    const pathParts = missingPath.split('/');
    const fileName = pathParts[pathParts.length - 1];
    const dirPath = pathParts.slice(0, -1).join('/');

    // Check if directory exists
    if (dirPath) {
      try {
        const dirContents = await context.github.rest.repos.getContent({
          owner: context.owner,
          repo: context.repo,
          path: dirPath,
          ref: context.headSha,
        });

        if (Array.isArray(dirContents.data)) {
          closestMatches.push(`${dirPath}/ (directory exists with ${dirContents.data.length} files)`);
        }
      } catch (error: any) {
        // Directory doesn't exist
      }
    }

    // Check for similar file names in repo root
    const similarFiles = context.files
      .map(f => f.filename)
      .filter(f => {
        const fName = f.split('/').pop() || '';
        return fName.toLowerCase().includes(fileName.toLowerCase().split('.')[0]);
      })
      .slice(0, 3);

    if (similarFiles.length > 0) {
      closestMatches.push(...similarFiles.map(f => `${f} (similar name)`));
    }
  }

  return closestMatches.slice(0, 5); // Limit to 5 closest matches
}

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

    // CRITICAL FIX: Evidence transparency
    const searchedPaths = targets.map(t => t.path);
    const matchedPaths = presentTargets.map(t => t.path);

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
        metadata: {
          evidenceSearch: {
            searchedPaths,
            matchedPaths,
          },
        },
      };
    }

    // Try to find closest matches (similar file names or directories)
    const closestMatches = await findClosestMatches(context, missingTargets.map(t => t.path));

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
      metadata: {
        evidenceSearch: {
          searchedPaths,
          matchedPaths,
          closestMatches,
        },
      },
    };
  },
};

