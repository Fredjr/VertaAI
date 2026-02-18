/**
 * Pack Selection Algorithm
 * Migration Plan v5.0 - Sprint 2
 * 
 * Implements precedence: repo > service > workspace
 * With semver tie-breaking
 */

import semver from 'semver';
import { minimatch } from 'minimatch';
import type { PackYAML } from './packValidator.js';
import type { PrismaClient } from '@prisma/client';

export interface SelectedPack {
  pack: PackYAML;
  packHash: string;
  source: 'repo' | 'service' | 'workspace';
  dbId: string;
  publishedAt: Date | null;
}

/**
 * Select applicable pack for a PR
 * CRITICAL: Precedence is repo > service > workspace
 */
export async function selectApplicablePack(
  prisma: PrismaClient,
  workspaceId: string,
  owner: string,
  repo: string,
  branch: string
): Promise<SelectedPack | null> {
  const fullRepo = `${owner}/${repo}`;

  // 1. Find all published packs for this workspace
  const allPacks = await prisma.workspacePolicyPack.findMany({
    where: {
      workspaceId,
      packStatus: 'published',
      trackAEnabled: true,
      trackAConfigYamlPublished: { not: null },
    },
  });

  if (allPacks.length === 0) {
    return null;
  }

  // 2. Parse and filter packs by scope
  const repoPacks: Array<{ pack: PackYAML; packHash: string; dbId: string; publishedAt: Date | null }> = [];
  const servicePacks: Array<{ pack: PackYAML; packHash: string; dbId: string; publishedAt: Date | null }> = [];
  const workspacePacks: Array<{ pack: PackYAML; packHash: string; dbId: string; publishedAt: Date | null }> = [];

  for (const dbPack of allPacks) {
    try {
      const yaml = require('yaml');
      const pack: PackYAML = yaml.parse(dbPack.trackAConfigYamlPublished!);

      // Check if pack applies to this PR
      if (!packApplies(pack, fullRepo, branch)) {
        continue;
      }

      const packData = {
        pack,
        packHash: dbPack.trackAPackHashPublished!,
        dbId: dbPack.id,
        publishedAt: dbPack.publishedAt,
      };

      // Categorize by scope type
      if (pack.scope.type === 'repo' && pack.scope.ref === fullRepo) {
        repoPacks.push(packData);
      } else if (pack.scope.type === 'service') {
        servicePacks.push(packData);
      } else if (pack.scope.type === 'workspace') {
        workspacePacks.push(packData);
      }
    } catch (error) {
      console.error(`[PackSelector] Failed to parse pack ${dbPack.id}:`, error);
    }
  }

  // 3. Apply precedence
  if (repoPacks.length > 0) {
    const selected = selectBestPack(repoPacks);
    return { ...selected, source: 'repo' };
  }

  if (servicePacks.length > 0) {
    const selected = selectBestPack(servicePacks);
    return { ...selected, source: 'service' };
  }

  if (workspacePacks.length > 0) {
    const selected = selectBestPack(workspacePacks);
    return { ...selected, source: 'workspace' };
  }

  return null;
}

/**
 * Check if pack applies to this repo/branch
 */
function packApplies(pack: PackYAML, fullRepo: string, branch: string): boolean {
  // Check repo match
  if (pack.scope.type === 'repo' && pack.scope.ref !== fullRepo) {
    return false;
  }

  // Check branch filters (applied AFTER loading pack)
  if (pack.scope.branches) {
    const { include, exclude } = pack.scope.branches;

    if (include && include.length > 0) {
      const matches = include.some(pattern => minimatch(branch, pattern));
      if (!matches) return false;
    }

    if (exclude && exclude.length > 0) {
      const matches = exclude.some(pattern => minimatch(branch, pattern));
      if (matches) return false;
    }
  }

  return true;
}

/**
 * Select best pack from candidates using semver + publishedAt
 * CRITICAL FIX (Gap #3): Use publishedAt as tie-breaker, NOT updatedAt or packHash
 */
function selectBestPack(
  packs: Array<{ pack: PackYAML; packHash: string; dbId: string; publishedAt: Date | null }>
): { pack: PackYAML; packHash: string; dbId: string; publishedAt: Date | null } {
  return packs.sort((a, b) => {
    // Sort by semver (descending)
    const versionCompare = semver.rcompare(a.pack.metadata.version, b.pack.metadata.version);
    if (versionCompare !== 0) return versionCompare;

    // CRITICAL: If same version, use publishedAt as tie-breaker (most recent first)
    // This ensures deterministic selection and prevents "policy suddenly changed" incidents
    if (a.publishedAt && b.publishedAt) {
      return b.publishedAt.getTime() - a.publishedAt.getTime();
    }

    // Fallback: if publishedAt is missing (shouldn't happen for published packs), use pack hash
    return a.packHash.localeCompare(b.packHash);
  })[0];
}

