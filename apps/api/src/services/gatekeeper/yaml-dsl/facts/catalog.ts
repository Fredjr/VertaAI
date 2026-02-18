/**
 * Fact Catalog Service
 * Phase 2.1 - Hybrid Comparator/Fact-Based Approach
 * 
 * Central registry of all available facts for fact-based conditions
 */

import type { Fact, FactCategory, FactCatalogVersion } from './types.js';
import type { PRContext } from '../comparators/types.js';

/**
 * Fact Catalog - Registry of all available facts
 */
class FactCatalog {
  private facts: Map<string, Fact> = new Map();
  private version: string = 'v1.0.0';

  /**
   * Register a fact in the catalog
   */
  register(fact: Fact): void {
    if (this.facts.has(fact.id)) {
      throw new Error(`Fact ${fact.id} is already registered`);
    }
    this.facts.set(fact.id, fact);
  }

  /**
   * Get a fact by ID
   */
  get(factId: string): Fact | undefined {
    return this.facts.get(factId);
  }

  /**
   * Get all facts
   */
  getAll(): Fact[] {
    return Array.from(this.facts.values());
  }

  /**
   * Get facts by category
   */
  getByCategory(category: FactCategory): Fact[] {
    return this.getAll().filter(f => f.category === category);
  }

  /**
   * Get catalog version
   */
  getVersion(): string {
    return this.version;
  }

  /**
   * Get catalog version info
   */
  getCatalogVersion(): FactCatalogVersion {
    return {
      version: this.version,
      releaseDate: '2026-02-18',
      facts: this.getAll(),
      changelog: 'Initial release with core facts for PR evaluation',
    };
  }

  /**
   * Check if a fact exists
   */
  has(factId: string): boolean {
    return this.facts.has(factId);
  }

  /**
   * Get fact count
   */
  count(): number {
    return this.facts.size;
  }
}

/**
 * Global fact catalog instance
 */
export const factCatalog = new FactCatalog();

/**
 * Helper function to register a fact
 */
export function registerFact(fact: Fact): void {
  factCatalog.register(fact);
}

// ======================================================================
// UNIVERSAL FACTS (Scope, Environment, Actor)
// ======================================================================

registerFact({
  id: 'scope.workspace',
  name: 'Workspace ID',
  description: 'The workspace ID where the PR is being evaluated',
  category: 'universal',
  valueType: 'string',
  version: 'v1.0.0',
  resolver: (context: PRContext) => context.workspaceId || '',
  examples: ['workspace-123', 'acme-corp'],
});

registerFact({
  id: 'scope.repository',
  name: 'Repository Full Name',
  description: 'The full name of the repository (owner/repo)',
  category: 'universal',
  valueType: 'string',
  version: 'v1.0.0',
  resolver: (context: PRContext) => `${context.owner}/${context.repo}` || '',
  examples: ['acme/api-service', 'acme/web-app'],
});

registerFact({
  id: 'scope.branch',
  name: 'Target Branch',
  description: 'The target branch of the pull request',
  category: 'universal',
  valueType: 'string',
  version: 'v1.0.0',
  resolver: (context: PRContext) => context.baseBranch || '',
  examples: ['main', 'develop', 'release/v1.0'],
});

registerFact({
  id: 'actor.user',
  name: 'PR Author',
  description: 'The GitHub username of the PR author',
  category: 'universal',
  valueType: 'string',
  version: 'v1.0.0',
  resolver: (context: PRContext) => context.author || '',
  examples: ['alice', 'bob', 'charlie'],
});

registerFact({
  id: 'event.type',
  name: 'Event Type',
  description: 'The type of GitHub event that triggered evaluation',
  category: 'universal',
  valueType: 'string',
  version: 'v1.0.0',
  resolver: (context: PRContext) => (context as any).eventType || 'pull_request',
  examples: ['pull_request', 'pull_request_review', 'push'],
});

registerFact({
  id: 'time.utc',
  name: 'Current Time (UTC)',
  description: 'The current time in ISO 8601 format',
  category: 'universal',
  valueType: 'string',
  version: 'v1.0.0',
  resolver: () => new Date().toISOString(),
  examples: ['2026-02-18T10:30:00Z'],
});

// ======================================================================
// PR METADATA FACTS
// ======================================================================

registerFact({
  id: 'pr.id',
  name: 'Pull Request ID',
  description: 'The pull request number',
  category: 'pr',
  valueType: 'number',
  version: 'v1.0.0',
  resolver: (context: PRContext) => context.prNumber || 0,
  examples: ['123', '456'],
});

registerFact({
  id: 'pr.title',
  name: 'Pull Request Title',
  description: 'The title of the pull request',
  category: 'pr',
  valueType: 'string',
  version: 'v1.0.0',
  resolver: (context: PRContext) => context.title || '',
  examples: ['Add new feature', 'Fix bug in API'],
});

registerFact({
  id: 'pr.labels',
  name: 'Pull Request Labels',
  description: 'Array of labels attached to the PR',
  category: 'pr',
  valueType: 'array',
  version: 'v1.0.0',
  resolver: (context: PRContext) => context.labels || [],
  examples: [['security', 'breaking-change'], ['bug', 'hotfix']],
});

registerFact({
  id: 'pr.isDraft',
  name: 'Is Draft PR',
  description: 'Whether the PR is in draft mode',
  category: 'pr',
  valueType: 'boolean',
  version: 'v1.0.0',
  resolver: (context: PRContext) => (context as any).isDraft || false,
  examples: ['true', 'false'],
});

registerFact({
  id: 'pr.approvals.count',
  name: 'Approval Count',
  description: 'Number of approvals the PR has received',
  category: 'pr',
  valueType: 'number',
  version: 'v1.0.0',
  resolver: (context: PRContext) => context.cache?.approvals?.length || 0,
  examples: ['0', '2', '5'],
});

registerFact({
  id: 'pr.approvals.users',
  name: 'Approving Users',
  description: 'Array of usernames who approved the PR',
  category: 'pr',
  valueType: 'array',
  version: 'v1.0.0',
  resolver: (context: PRContext) =>
    context.cache?.approvals?.map((a: any) => a.user) || [],
  examples: [['alice', 'bob'], ['charlie']],
});

registerFact({
  id: 'pr.approvals.teams',
  name: 'Approving Teams',
  description: 'Array of teams whose members approved the PR',
  category: 'pr',
  valueType: 'array',
  version: 'v1.0.0',
  resolver: (context: PRContext) =>
    context.cache?.approvals?.flatMap((a: any) => a.teams || []) || [],
  examples: [['@acme/security', '@acme/api-team'], []],
});

registerFact({
  id: 'pr.targetBranch',
  name: 'Target Branch',
  description: 'The branch the PR is targeting (base branch)',
  category: 'pr',
  valueType: 'string',
  version: 'v1.0.0',
  resolver: (context: PRContext) => context.baseBranch || '',
  examples: ['main', 'develop', 'release/v1.0'],
});

registerFact({
  id: 'pr.sourceBranch',
  name: 'Source Branch',
  description: 'The branch the PR is coming from (head branch)',
  category: 'pr',
  valueType: 'string',
  version: 'v1.0.0',
  resolver: (context: PRContext) => context.headBranch || '',
  examples: ['feature/new-api', 'fix/bug-123'],
});

// ======================================================================
// DIFF FACTS (File Changes)
// ======================================================================

registerFact({
  id: 'diff.filesChanged.count',
  name: 'Files Changed Count',
  description: 'Number of files changed in the PR',
  category: 'diff',
  valueType: 'number',
  version: 'v1.0.0',
  resolver: (context: PRContext) => context.files?.length || 0,
  examples: ['1', '5', '20'],
});

registerFact({
  id: 'diff.filesChanged.paths',
  name: 'Changed File Paths',
  description: 'Array of file paths that were changed',
  category: 'diff',
  valueType: 'array',
  version: 'v1.0.0',
  resolver: (context: PRContext) =>
    context.files?.map(f => f.filename) || [],
  examples: [['src/api.ts', 'README.md'], ['openapi.yaml']],
});

registerFact({
  id: 'diff.linesAdded',
  name: 'Lines Added',
  description: 'Total number of lines added across all files',
  category: 'diff',
  valueType: 'number',
  version: 'v1.0.0',
  resolver: (context: PRContext) => {
    // Use context.additions if available, otherwise sum from files
    if (context.additions !== undefined) {
      return context.additions;
    }
    return context.files?.reduce((sum, f) => sum + (f.additions || 0), 0) || 0;
  },
  examples: ['10', '50', '200'],
});

registerFact({
  id: 'diff.linesDeleted',
  name: 'Lines Deleted',
  description: 'Total number of lines deleted across all files',
  category: 'diff',
  valueType: 'number',
  version: 'v1.0.0',
  resolver: (context: PRContext) => {
    // Use context.deletions if available, otherwise sum from files
    if (context.deletions !== undefined) {
      return context.deletions;
    }
    return context.files?.reduce((sum, f) => sum + (f.deletions || 0), 0) || 0;
  },
  examples: ['5', '30', '100'],
});

registerFact({
  id: 'diff.linesChanged',
  name: 'Lines Changed',
  description: 'Total number of lines changed (added + deleted)',
  category: 'diff',
  valueType: 'number',
  version: 'v1.0.0',
  resolver: (context: PRContext) => {
    // Use context.additions + context.deletions if available, otherwise sum from files
    if (context.additions !== undefined && context.deletions !== undefined) {
      return context.additions + context.deletions;
    }
    return context.files?.reduce((sum, f) => sum + (f.additions || 0) + (f.deletions || 0), 0) || 0;
  },
  examples: ['15', '80', '300'],
});

