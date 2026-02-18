/**
 * Pack Matcher Service
 * Phase 1.3: Scope Precedence
 * 
 * Finds applicable policy packs for a given context (repo, branch, paths)
 * and resolves conflicts using scope precedence and merge strategies.
 */

import { minimatch } from 'minimatch';
import { PackYAML, PackScope, MergeStrategy } from './types.js';

export interface PackMatchContext {
  repository: string;      // e.g., 'owner/repo'
  branch: string;          // e.g., 'main', 'feature/xyz'
  paths?: string[];        // Changed files, e.g., ['src/api.ts', 'README.md']
  environment?: string;    // e.g., 'production', 'staging'
}

export interface ApplicablePack {
  pack: PackYAML;
  priority: number;
  mergeStrategy: MergeStrategy;
}

export class PackMatcher {
  /**
   * Find all packs that match the given context, sorted by priority (highest first)
   */
  findApplicablePacks(
    packs: PackYAML[],
    context: PackMatchContext
  ): ApplicablePack[] {
    const applicable = packs
      .filter(pack => this.matchesPack(pack, context))
      .map(pack => ({
        pack,
        priority: pack.metadata.scopePriority || 50,
        mergeStrategy: pack.metadata.scopeMergeStrategy || 'MOST_RESTRICTIVE' as MergeStrategy
      }))
      .sort((a, b) => b.priority - a.priority); // Highest priority first

    return applicable;
  }

  /**
   * Check if a pack matches the given context
   */
  private matchesPack(pack: PackYAML, context: PackMatchContext): boolean {
    const scope = pack.scope;

    // 1. Check scope type
    if (scope.type === 'workspace') {
      // Workspace-level packs apply to all repos
      return this.matchesBranch(scope, context.branch) &&
             this.matchesRepos(scope, context.repository);
    }

    if (scope.type === 'repo') {
      // Repo-level packs apply to specific repos
      if (!this.matchesRepos(scope, context.repository)) {
        return false;
      }
      return this.matchesBranch(scope, context.branch);
    }

    if (scope.type === 'service') {
      // Service-level packs (future enhancement)
      // For now, treat as workspace-level
      return this.matchesBranch(scope, context.branch) &&
             this.matchesRepos(scope, context.repository);
    }

    return false;
  }

  /**
   * Check if repository matches scope.repos filters
   */
  private matchesRepos(scope: PackScope, repository: string): boolean {
    const { repos } = scope;
    
    if (!repos) {
      // No repo filter = match all repos
      return true;
    }

    // Check include patterns
    if (repos.include && repos.include.length > 0) {
      const included = repos.include.some(pattern => 
        minimatch(repository, pattern, { dot: true })
      );
      if (!included) return false;
    }

    // Check exclude patterns
    if (repos.exclude && repos.exclude.length > 0) {
      const excluded = repos.exclude.some(pattern => 
        minimatch(repository, pattern, { dot: true })
      );
      if (excluded) return false;
    }

    return true;
  }

  /**
   * Check if branch matches scope.branches filters
   */
  private matchesBranch(scope: PackScope, branch: string): boolean {
    const { branches } = scope;
    
    if (!branches) {
      // No branch filter = match all branches
      return true;
    }

    // Check include patterns
    if (branches.include && branches.include.length > 0) {
      const included = branches.include.some(pattern => 
        minimatch(branch, pattern, { dot: true })
      );
      if (!included) return false;
    }

    // Check exclude patterns
    if (branches.exclude && branches.exclude.length > 0) {
      const excluded = branches.exclude.some(pattern => 
        minimatch(branch, pattern, { dot: true })
      );
      if (excluded) return false;
    }

    return true;
  }

  /**
   * Check if any changed path matches the pack's path filters
   * (Used for path-specific rules)
   */
  matchesPaths(pack: PackYAML, paths: string[]): boolean {
    // If no paths specified in context, assume all paths match
    if (!paths || paths.length === 0) {
      return true;
    }

    // If pack has no path filters, it applies to all paths
    const scope = pack.scope;
    if (!scope.repos?.include && !scope.repos?.exclude) {
      return true;
    }

    // Check if any changed path matches the pack's filters
    // This is used for rules that target specific files
    return paths.some(path => {
      // For now, we don't have path-level filtering in scope
      // This will be enhanced in future phases
      return true;
    });
  }
}

export const packMatcher = new PackMatcher();

