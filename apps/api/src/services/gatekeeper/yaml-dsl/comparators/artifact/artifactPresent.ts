/**
 * ARTIFACT_PRESENT Comparator
 * Migration Plan v5.0 - Sprint 1, Task 1.3
 *
 * Checks if specified artifact exists in the repository
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
  missingArtifactRemediation,
} from '../../ir/obligationDSL.js';
import { ArtifactMessages, RemediationMessages, formatMessage } from '../../ir/messageCatalog.js';

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
  version: '2.0.0', // Phase 4: Bumped to 2.0.0 (structured IR support)

  /**
   * NEW: Structured evaluation (Phase 4)
   * Returns fully structured ObligationResult
   */
  async evaluateStructured(context: PRContext, params: any): Promise<ObligationResult> {
    const { artifactType, title, controlObjective, decisionOnFail = 'block' } = params;

    // Create obligation builder
    const obligation = createObligation({
      id: `artifact-present-${artifactType}`,
      title: title || `${artifactType} Artifact Present`,
      controlObjective: controlObjective || `Ensure ${artifactType} artifacts are present and up-to-date`,
      scope: 'repo_invariant',
      decisionOnFail: decisionOnFail as 'block' | 'warn' | 'pass',
    });

    // CRITICAL: Use service-aware artifact resolver (not globs)
    const targets = await resolveArtifactTargets(context, artifactType);

    if (targets.length === 0) {
      return obligation.notEvaluableWithMessage(
        'not_evaluable.no_artifact_registry',
        { artifactType },
        'policy_misconfig'
      );
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

    // All artifacts present - PASS
    if (missingTargets.length === 0) {
      return obligation.passWithMessage(
        'pass.artifact.all_present',
        {
          artifactType,
          paths: presentTargets.map(t => t.path).join(', '),
        }
      );
    }

    // Some artifacts missing - FAIL
    const closestMatches = await findClosestMatches(context, missingTargets.map(t => t.path));
    const searchedPaths = targets.map(t => t.path);
    const matchedPaths = presentTargets.map(t => t.path);

    return obligation.failWithMessage({
      reasonCode: 'ARTIFACT_MISSING',
      messageId: 'fail.artifact.missing',
      messageParams: {
        artifactType,
        missingPaths: missingTargets.map(t => t.path).join(', '),
      },
      evidence: [
        ...missingTargets.map(t => missingFileEvidence(
          t.path,
          formatMessage('evidence.file.missing', {
            service: t.service,
            closestMatches: closestMatches.join(', ') || 'none',
          })
        )),
        ...presentTargets.map(t => presentFileEvidence(
          t.path,
          formatMessage('evidence.file.present', { service: t.service })
        )),
      ],
      evidenceSearch: {
        locationsSearched: searchedPaths,
        strategy: 'service_aware_artifact_resolver',
        confidence: 1.0,
      },
      remediation: missingArtifactRemediation({
        artifactType,
        suggestedPath: missingTargets[0].path,
        docsLink: params.docsLink,
        owner: params.owner || 'platform-team',
      }),
      risk: calculateArtifactRisk({
        isBlocking: decisionOnFail === 'block',
        affectsAPI: artifactType.toLowerCase().includes('openapi') || artifactType.toLowerCase().includes('api'),
        affectsDeployment: artifactType.toLowerCase().includes('dockerfile') || artifactType.toLowerCase().includes('deploy'),
        hasDownstreamDeps: true, // Assume artifacts have downstream deps
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

