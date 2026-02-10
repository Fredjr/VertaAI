/**
 * Gap #6 Part 2: Noise Filtering
 * Filters out noise based on ignore patterns, paths, and authors
 */

import { prisma } from '../../lib/prisma.js';
import { NoiseControlsConfig, parseNoiseControls } from './types.js';

export interface NoiseFilterResult {
  shouldIgnore: boolean;
  reason?: string;
  matchedRule?: {
    type: 'pattern' | 'path' | 'author';
    value: string;
  };
}

/**
 * Check if a signal should be ignored based on noise controls
 */
export async function checkNoiseFilter(args: {
  workspaceId: string;
  planId: string;
  signalData: {
    title?: string;
    body?: string;
    author?: string;
    changedFiles?: Array<{ filename: string }>;
  };
}): Promise<NoiseFilterResult> {
  const { workspaceId, planId, signalData } = args;

  // Get plan noise controls
  const plan = await prisma.driftPlan.findUnique({
    where: { workspaceId_id: { workspaceId, id: planId } },
    select: { noiseControls: true },
  });

  if (!plan) {
    throw new Error(`Plan ${planId} not found`);
  }

  const noiseControls = parseNoiseControls(plan.noiseControls);

  // Check ignore patterns (in title or body)
  const textToCheck = `${signalData.title || ''} ${signalData.body || ''}`.toLowerCase();
  for (const pattern of noiseControls.ignorePatterns) {
    if (textToCheck.includes(pattern.toLowerCase())) {
      return {
        shouldIgnore: true,
        reason: `Matched ignore pattern: "${pattern}"`,
        matchedRule: { type: 'pattern', value: pattern },
      };
    }
  }

  // Check ignore authors
  if (signalData.author) {
    const authorLower = signalData.author.toLowerCase();
    for (const ignoredAuthor of noiseControls.ignoreAuthors) {
      if (authorLower.includes(ignoredAuthor.toLowerCase())) {
        return {
          shouldIgnore: true,
          reason: `Matched ignore author: "${ignoredAuthor}"`,
          matchedRule: { type: 'author', value: ignoredAuthor },
        };
      }
    }
  }

  // Check ignore paths (for changed files)
  if (signalData.changedFiles && signalData.changedFiles.length > 0) {
    for (const file of signalData.changedFiles) {
      for (const ignorePath of noiseControls.ignorePaths) {
        if (matchesGlobPattern(file.filename, ignorePath)) {
          return {
            shouldIgnore: true,
            reason: `Matched ignore path: "${ignorePath}" (file: ${file.filename})`,
            matchedRule: { type: 'path', value: ignorePath },
          };
        }
      }
    }
  }

  return {
    shouldIgnore: false,
  };
}

/**
 * Simple glob pattern matching
 * Supports: *, **, ?
 */
function matchesGlobPattern(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\*\*/g, '.*') // ** matches any number of directories
    .replace(/\*/g, '[^/]*') // * matches anything except /
    .replace(/\?/g, '.') // ? matches any single character
    .replace(/\./g, '\\.'); // Escape dots

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

/**
 * Get noise filtering statistics for a plan
 */
export async function getNoiseFilteringStats(args: {
  workspaceId: string;
  planId: string;
  timeWindowHours?: number;
}): Promise<{
  totalSignals: number;
  filteredSignals: number;
  filterRate: number;
  topFilters: Array<{
    type: 'pattern' | 'path' | 'author';
    value: string;
    count: number;
  }>;
}> {
  const { workspaceId, planId, timeWindowHours = 24 } = args;

  const since = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);

  // Get all plan runs in the time window
  const planRuns = await prisma.planRun.findMany({
    where: {
      workspaceId,
      planId,
      executedAt: { gte: since },
    },
  });

  const totalSignals = planRuns.length;
  const filteredSignals = planRuns.filter((run) => run.routingAction === 'ignore').length;

  return {
    totalSignals,
    filteredSignals,
    filterRate: totalSignals > 0 ? (filteredSignals / totalSignals) * 100 : 0,
    topFilters: [], // TODO: Track filter reasons in PlanRun
  };
}

