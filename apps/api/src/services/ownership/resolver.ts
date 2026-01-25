/**
 * Ownership Resolver - Phase 4
 * 
 * Resolves owners for drift candidates based on configurable ranking:
 * - PagerDuty on-call
 * - CODEOWNERS file
 * - Manual mappings
 * - Commit history
 * 
 * Workspace can configure the priority order of these sources.
 */

import { prisma } from '../../lib/db.js';

export interface Owner {
  type: 'slack_user' | 'slack_channel' | 'team';
  ref: string;
  name?: string;
  source: 'pagerduty' | 'codeowners' | 'manual' | 'commit_history';
}

export interface OwnerResolution {
  /** Primary owner to notify */
  primary: Owner | null;
  /** Fallback owner if primary is unavailable */
  fallback: Owner | null;
  /** All discovered owners, sorted by workspace ranking */
  sources: Owner[];
}

/**
 * Resolve owners for a drift candidate based on workspace config
 * 
 * @param workspaceId - The workspace to resolve owners for
 * @param service - Service name (e.g., "payment-service")
 * @param repo - Repository name (e.g., "Fredjr/VertaAI")
 */
export async function resolveOwner(
  workspaceId: string,
  service: string | null,
  repo: string | null
): Promise<OwnerResolution> {
  // Load workspace with ownership config
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace) {
    console.warn(`[OwnerResolver] Workspace ${workspaceId} not found`);
    return {
      primary: null,
      fallback: { type: 'slack_channel', ref: '#engineering', source: 'manual' },
      sources: [],
    };
  }

  // Get ownership ranking from workspace config
  const ranking = workspace.ownershipSourceRanking || ['pagerduty', 'codeowners', 'manual'];

  // Gather owners from all sources
  const owners: Owner[] = [];

  // 1. From manual mappings in database
  if (service || repo) {
    const manualMappings = await prisma.ownerMapping.findMany({
      where: {
        workspaceId,
        OR: [
          ...(service ? [{ service }] : []),
          ...(repo ? [{ repo }] : []),
        ],
      },
    });

    for (const mapping of manualMappings) {
      owners.push({
        type: mapping.ownerType as Owner['type'],
        ref: mapping.ownerRef,
        source: mapping.source as Owner['source'],
      });
    }
  }

  // 2. TODO: Add PagerDuty on-call lookup
  // This would call PagerDuty API to get current on-call for the service
  // const pagerdutyOwner = await lookupPagerDutyOnCall(workspaceId, service);
  // if (pagerdutyOwner) owners.push(pagerdutyOwner);

  // 3. TODO: Add CODEOWNERS parsing from GitHub
  // This would fetch and parse CODEOWNERS file for the repo
  // const codeownersOwner = await parseCodeowners(workspaceId, repo);
  // if (codeownersOwner) owners.push(codeownersOwner);

  // 4. TODO: Add commit history analysis
  // This would analyze recent commits to find frequent contributors
  // const historyOwner = await analyzeCommitHistory(workspaceId, repo);
  // if (historyOwner) owners.push(historyOwner);

  // Sort owners by workspace ranking
  const sorted = [...owners].sort((a, b) => {
    const aRank = ranking.indexOf(a.source);
    const bRank = ranking.indexOf(b.source);
    // Sources not in ranking go to the end
    const aIdx = aRank === -1 ? ranking.length : aRank;
    const bIdx = bRank === -1 ? ranking.length : bRank;
    return aIdx - bIdx;
  });

  // Build resolution result
  const defaultFallback: Owner = {
    type: (workspace.defaultOwnerType as Owner['type']) || 'slack_channel',
    ref: workspace.defaultOwnerRef || '#engineering',
    source: 'manual',
  };

  const result: OwnerResolution = {
    primary: sorted[0] || null,
    fallback: sorted[1] || defaultFallback,
    sources: sorted,
  };

  console.log(
    `[OwnerResolver] Resolved for workspace=${workspaceId}, service=${service}, repo=${repo}: ` +
    `primary=${result.primary?.ref || 'none'} (${result.primary?.source || 'n/a'}), ` +
    `fallback=${result.fallback?.ref || 'none'}, sources=${sorted.length}`
  );

  return result;
}

/**
 * Format owner resolution for storage in DriftCandidate
 */
export function formatOwnerResolution(resolution: OwnerResolution): object {
  return {
    primary: resolution.primary ? {
      type: resolution.primary.type,
      ref: resolution.primary.ref,
      source: resolution.primary.source,
    } : null,
    fallback: resolution.fallback ? {
      type: resolution.fallback.type,
      ref: resolution.fallback.ref,
      source: resolution.fallback.source,
    } : null,
    sourceCount: resolution.sources.length,
  };
}

