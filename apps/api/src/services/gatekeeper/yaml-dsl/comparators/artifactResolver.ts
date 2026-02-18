/**
 * Service-Aware Artifact Resolver
 * Migration Plan v5.0 - Sprint 1, Task 1.2b
 * 
 * CRITICAL: Prevents false positives in microservices orgs
 * Only returns artifact targets for actually affected services
 */

import { minimatch } from 'minimatch';
import type { PRContext, WorkspaceDefaults } from './types.js';

export interface ArtifactTarget {
  service: string;
  path: string;
  repo: string;
}

/**
 * Resolve artifact targets based on changed files and artifact registry
 * CRITICAL: Service-aware - only returns targets for affected services
 */
export async function resolveArtifactTargets(
  context: PRContext,
  artifactType: string,
  overrideTargets?: string[]
): Promise<ArtifactTarget[]> {
  const defaults = context.defaults;
  if (!defaults?.artifactRegistry) {
    return [];
  }

  // If override targets specified, use those
  if (overrideTargets && overrideTargets.length > 0) {
    return overrideTargets.map(path => ({
      service: 'override',
      path: normalizePath(path),
      repo: context.repo,
    }));
  }

  const targets: ArtifactTarget[] = [];
  const changedPaths = new Set(context.files.map(f => normalizePath(f.filename)));

  // Iterate through services in artifact registry
  for (const [serviceName, serviceConfig] of Object.entries(defaults.artifactRegistry.services)) {
    // Check if repo matches
    if (!isRepoMatch(serviceConfig.repo, context.owner, context.repo)) {
      continue;
    }

    // Handle monorepo with service detection
    if (serviceConfig.serviceDetection?.strategy === 'path-prefix') {
      const affectedSubServices = getAffectedSubServices(
        serviceConfig.serviceDetection.services,
        changedPaths
      );

      for (const subServiceName of affectedSubServices) {
        const subServiceConfig = serviceConfig.serviceDetection.services[subServiceName];
        const artifactPath = subServiceConfig.artifacts?.[artifactType];
        if (artifactPath) {
          targets.push({
            service: `${serviceName}/${subServiceName}`,
            path: normalizePath(artifactPath),
            repo: serviceConfig.repo,
          });
        }
      }
    } else {
      // Single-service repo: only add target if service is actually affected
      const isAffected = isSingleServiceAffected(serviceConfig, changedPaths);
      if (isAffected) {
        const artifactPath = serviceConfig.artifacts?.[artifactType];
        if (artifactPath) {
          targets.push({
            service: serviceName,
            path: normalizePath(artifactPath),
            repo: serviceConfig.repo,
          });
        }
      }
    }
  }

  return targets;
}

/**
 * Get only affected sub-services in monorepo
 */
function getAffectedSubServices(
  services: Record<string, any>,
  changedPaths: Set<string>
): string[] {
  const affected: string[] = [];

  for (const [subServiceName, subServiceConfig] of Object.entries(services)) {
    const pathPrefix = normalizePath(subServiceConfig.pathPrefix);
    const hasMatchingChange = Array.from(changedPaths).some(path =>
      path.startsWith(pathPrefix)
    );

    if (hasMatchingChange) {
      affected.push(subServiceName);
    }
  }

  return affected;
}

/**
 * Determine if single-service repo is affected
 * Respects serviceScope patterns to avoid docs-only false triggers
 */
function isSingleServiceAffected(
  serviceConfig: any,
  changedPaths: Set<string>
): boolean {
  // If serviceScope patterns defined, check if any changed path matches
  if (serviceConfig.serviceScope?.includePaths) {
    return Array.from(changedPaths).some(path =>
      serviceConfig.serviceScope.includePaths.some((pattern: string) =>
        minimatch(path, pattern, { dot: true })
      )
    );
  }

  // If excludePaths defined, check if ALL changes are excluded
  if (serviceConfig.serviceScope?.excludePaths) {
    const allExcluded = Array.from(changedPaths).every(path =>
      serviceConfig.serviceScope.excludePaths.some((pattern: string) =>
        minimatch(path, pattern, { dot: true })
      )
    );
    if (allExcluded) return false;
  }

  // Default: any change affects service (backward compatible)
  return true;
}

/**
 * Check if repo matches (handles org/repo format)
 */
function isRepoMatch(configRepo: string, owner: string, repo: string): boolean {
  const fullRepo = `${owner}/${repo}`;
  return configRepo === fullRepo || configRepo === repo;
}

/**
 * Normalize path (remove leading ./, handle Windows slashes)
 */
function normalizePath(path: string): string {
  return path
    .replace(/^\.\//, '')
    .replace(/\\/g, '/')
    .trim();
}

