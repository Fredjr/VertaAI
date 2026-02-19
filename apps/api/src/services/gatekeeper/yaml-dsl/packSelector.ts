/**
 * Pack Selection Algorithm
 * Migration Plan v5.0 - Sprint 2
 * PHASE 3A.2: Now uses PackMatcher for priority-based selection
 *
 * Implements priority-based selection with PackMatcher integration
 */

import type { PackYAML } from './packValidator.js';
import type { PrismaClient } from '@prisma/client';
import * as yaml from 'yaml';
// PHASE 2.4: Auto-enhance packs with fact-based conditions
import { enhancePackWithConditions } from './packEnhancer.js';
// PHASE 3A.2: Use PackMatcher for priority-based selection
import { PackMatcher, type PackMatchContext } from './packMatcher.js';

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
 * DEPRECATED: Use selectApplicablePacks() for multi-pack support
 */
export async function selectApplicablePack(
  prisma: PrismaClient,
  workspaceId: string,
  owner: string,
  repo: string,
  branch: string
): Promise<SelectedPack | null> {
  const packs = await selectApplicablePacks(prisma, workspaceId, owner, repo, branch);
  return packs.length > 0 ? packs[0] : null;
}

/**
 * PHASE 3A.2: Select ALL applicable packs for a PR (multi-pack support)
 * Now uses PackMatcher for priority-based selection
 * Returns packs sorted by priority (highest first)
 */
export async function selectApplicablePacks(
  prisma: PrismaClient,
  workspaceId: string,
  owner: string,
  repo: string,
  branch: string
): Promise<SelectedPack[]> {
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
    return [];
  }

  // 2. Parse YAML and enhance with conditions
  const parsedPacks: Array<{ pack: PackYAML; dbPack: any }> = [];

  for (const dbPack of allPacks) {
    try {
      let pack: PackYAML = yaml.parse(dbPack.trackAConfigYamlPublished!);
      // PHASE 2.4: Auto-enhance with fact-based conditions
      pack = enhancePackWithConditions(pack);
      parsedPacks.push({ pack, dbPack });
    } catch (error) {
      console.error(`[PackSelector] Failed to parse pack ${dbPack.id}:`, error);
    }
  }

  // 3. PHASE 3A.2: Use PackMatcher to find applicable packs (priority-based)
  const matcher = new PackMatcher();
  const context: PackMatchContext = {
    repository: fullRepo,
    branch,
  };

  const applicablePacks = matcher.findApplicablePacks(
    parsedPacks.map(p => p.pack),
    context
  );

  // 4. Map back to SelectedPack format with database info
  const result: SelectedPack[] = applicablePacks.map(ap => {
    const dbPack = parsedPacks.find(p => p.pack === ap.pack)!.dbPack;
    return {
      pack: ap.pack,
      packHash: dbPack.trackAPackHashPublished!,
      source: ap.pack.scope.type as 'repo' | 'service' | 'workspace',
      dbId: dbPack.id,
      publishedAt: dbPack.publishedAt,
    };
  });

  console.log(
    `[PackSelector] Selected ${result.length} applicable packs for ${fullRepo}:${branch} ` +
    `(priorities: ${applicablePacks.map(ap => `${ap.pack.metadata.name}=${ap.priority}`).join(', ')})`
  );

  return result;
}

// PHASE 3A.2: Old helper functions removed - now using PackMatcher service
// All pack matching logic is centralized in packMatcher.ts

