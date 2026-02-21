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
  allowedOperators: ['==', '!=', 'matches'],
  valueWidget: { kind: 'text', placeholder: 'e.g. acme-corp' },
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
  allowedOperators: ['==', '!=', 'matches', 'startsWith'],
  valueWidget: { kind: 'text', placeholder: 'e.g. acme/api-service' },
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
  allowedOperators: ['==', '!=', 'matches', 'startsWith', 'in'],
  valueWidget: { kind: 'text', placeholder: 'e.g. main' },
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
  allowedOperators: ['==', '!=', 'in', 'matches'],
  valueWidget: { kind: 'text', placeholder: 'e.g. alice' },
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
  allowedOperators: ['==', '!=', 'in'],
  valueWidget: { kind: 'select', options: ['pull_request', 'pull_request_review', 'push', 'labeled'] },
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
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'datetime' },
  resolver: () => new Date().toISOString(),
  examples: ['2026-02-18T10:30:00Z'],
});

// Phase 3B.3: Additional time facts
registerFact({
  id: 'time.dayOfWeek',
  name: 'Day of Week',
  description: 'Day of week when PR was evaluated (Monday, Tuesday, etc.)',
  category: 'universal',
  valueType: 'string',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', 'in'],
  valueWidget: { kind: 'select', options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
  resolver: () => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
  },
  examples: ['Monday', 'Friday', 'Sunday'],
});

registerFact({
  id: 'time.hourOfDay',
  name: 'Hour of Day',
  description: 'Hour of day (0-23) when PR was evaluated',
  category: 'universal',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '9', min: 0, max: 23 },
  resolver: () => new Date().getHours(),
  examples: ['9', '14', '23'],
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
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '123', min: 1 },
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
  allowedOperators: ['==', '!=', 'contains', 'matches', 'startsWith'],
  valueWidget: { kind: 'text', placeholder: 'e.g. Add payment endpoint' },
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
  allowedOperators: ['contains', 'containsAll'],
  valueWidget: { kind: 'tag-list', placeholder: 'e.g. security, breaking-change' },
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
  allowedOperators: ['==', '!='],
  valueWidget: { kind: 'boolean' },
  resolver: (context: PRContext) => (context as any).isDraft || false,
  examples: ['true', 'false'],
});

// Phase 3B.3: Additional PR reviewer facts
registerFact({
  id: 'pr.reviewers.count',
  name: 'Reviewer Count',
  description: 'Number of unique reviewers who reviewed the PR',
  category: 'pr',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '2', min: 0 },
  resolver: async (context: PRContext) => {
    try {
      const reviews = await context.github.rest.pulls.listReviews({
        owner: context.owner,
        repo: context.repo,
        pull_number: context.prNumber,
      });
      const uniqueReviewers = new Set(
        reviews.data.map(r => r.user?.login).filter(Boolean)
      );
      return uniqueReviewers.size;
    } catch (error) {
      console.error('[Facts] Failed to fetch reviewers:', error);
      return 0;
    }
  },
  examples: ['0', '2', '5'],
});

registerFact({
  id: 'pr.reviewers.teams',
  name: 'Reviewer Teams',
  description: 'Teams that reviewed the PR (requires team membership data)',
  category: 'pr',
  valueType: 'array',
  version: 'v1.0.0',
  allowedOperators: ['contains', 'containsAll'],
  valueWidget: { kind: 'tag-list', placeholder: 'e.g. platform-team' },
  resolver: async (context: PRContext) => {
    try {
      // Get requested reviewers (teams)
      const pr = await context.github.rest.pulls.get({
        owner: context.owner,
        repo: context.repo,
        pull_number: context.prNumber,
      });

      const teams = pr.data.requested_teams?.map(t => t.slug) || [];
      return teams;
    } catch (error) {
      console.error('[Facts] Failed to fetch reviewer teams:', error);
      return [];
    }
  },
  examples: [['platform-team', 'security-team'], ['backend-team']],
});

registerFact({
  id: 'pr.approvals.count',
  name: 'Approval Count',
  description: 'Number of approvals the PR has received',
  category: 'pr',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '2', min: 0 },
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
  allowedOperators: ['contains', 'containsAll'],
  valueWidget: { kind: 'tag-list', placeholder: 'e.g. alice, bob' },
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
  allowedOperators: ['contains', 'containsAll'],
  valueWidget: { kind: 'tag-list', placeholder: 'e.g. @acme/security' },
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
  allowedOperators: ['==', '!=', 'matches', 'startsWith', 'in'],
  valueWidget: { kind: 'text', placeholder: 'e.g. main' },
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
  allowedOperators: ['==', '!=', 'matches', 'startsWith', 'in'],
  valueWidget: { kind: 'text', placeholder: 'e.g. feature/new-api' },
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
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '5', min: 0 },
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
  allowedOperators: ['contains', 'containsAll'],
  valueWidget: { kind: 'tag-list', placeholder: 'e.g. src/api.ts' },
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
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '50', min: 0 },
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
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '30', min: 0 },
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
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '80', min: 0 },
  resolver: (context: PRContext) => {
    // Use context.additions + context.deletions if available, otherwise sum from files
    if (context.additions !== undefined && context.deletions !== undefined) {
      return context.additions + context.deletions;
    }
    return context.files?.reduce((sum, f) => sum + (f.additions || 0) + (f.deletions || 0), 0) || 0;
  },
  examples: ['15', '80', '300'],
});

// ======================================================================
// OPENAPI FACTS (Phase 3B.2)
// ======================================================================

/**
 * Helper function to find OpenAPI files in PR
 */
function findOpenApiFiles(context: PRContext): string[] {
  return context.files?.filter(f =>
    f.filename.includes('openapi') ||
    f.filename.endsWith('.openapi.yaml') ||
    f.filename.endsWith('.openapi.json') ||
    f.filename.endsWith('swagger.yaml') ||
    f.filename.endsWith('swagger.json') ||
    f.filename.match(/\/openapi\.(yaml|yml|json)$/i) ||
    f.filename.match(/\/swagger\.(yaml|yml|json)$/i)
  ).map(f => f.filename) || [];
}

/**
 * Helper function to fetch file content from GitHub
 */
async function fetchFileContent(
  context: PRContext,
  path: string,
  ref: 'base' | 'head'
): Promise<string | null> {
  try {
    const sha = ref === 'base' ? context.baseBranch : context.headSha;
    const response = await context.github.rest.repos.getContent({
      owner: context.owner,
      repo: context.repo,
      path,
      ref: sha,
    });

    // Decode base64 content
    if ('content' in response.data && response.data.content) {
      return Buffer.from(response.data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch (error) {
    console.error(`[OpenAPIFacts] Failed to fetch ${path} at ${ref}:`, error);
    return null;
  }
}

/**
 * Helper function to get OpenAPI diff data (cached in context)
 */
async function getOpenApiDiffData(context: PRContext): Promise<any> {
  // Check if already cached
  if (context.cache && (context.cache as any).openApiDiff) {
    return (context.cache as any).openApiDiff;
  }

  // Find OpenAPI files
  const openapiFiles = findOpenApiFiles(context);
  if (openapiFiles.length === 0) {
    return null;
  }

  // For now, analyze the first OpenAPI file found
  const file = openapiFiles[0];

  // Import OpenAPI parser (dynamic import to avoid circular dependencies)
  const { diffOpenApiSpecs } = await import('../../../signals/openApiParser.js');

  // Fetch old and new content
  const oldContent = await fetchFileContent(context, file, 'base');
  const newContent = await fetchFileContent(context, file, 'head');

  // Compute diff
  const diff = diffOpenApiSpecs(oldContent, newContent);

  // Cache the result
  if (!context.cache) {
    (context as any).cache = {};
  }
  (context.cache as any).openApiDiff = diff;

  return diff;
}

registerFact({
  id: 'openapi.changed',
  name: 'OpenAPI Spec Changed',
  description: 'Whether OpenAPI spec changed in this PR',
  category: 'openapi',
  valueType: 'boolean',
  version: 'v1.0.0',
  allowedOperators: ['==', '!='],
  valueWidget: { kind: 'boolean' },
  resolver: (context: PRContext) => {
    const openapiFiles = findOpenApiFiles(context);
    return openapiFiles.length > 0;
  },
  examples: ['true', 'false'],
});

registerFact({
  id: 'openapi.breakingChanges.count',
  name: 'OpenAPI Breaking Changes Count',
  description: 'Number of breaking changes detected in OpenAPI spec',
  category: 'openapi',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0', min: 0 },
  resolver: async (context: PRContext) => {
    const diff = await getOpenApiDiffData(context);
    if (!diff) return 0;
    return diff.changes.filter((c: any) => c.breakingChange).length;
  },
  examples: ['0', '2', '5'],
});

registerFact({
  id: 'openapi.breakingChanges.types',
  name: 'OpenAPI Breaking Change Types',
  description: 'Types of breaking changes (e.g., ["endpoint_removed", "required_param_added"])',
  category: 'openapi',
  valueType: 'array',
  version: 'v1.0.0',
  allowedOperators: ['contains', 'containsAll'],
  valueWidget: { kind: 'tag-list', placeholder: 'e.g. endpoint_removed' },
  resolver: async (context: PRContext) => {
    const diff = await getOpenApiDiffData(context);
    if (!diff) return [];
    return diff.changes
      .filter((c: any) => c.breakingChange)
      .map((c: any) => c.changeType);
  },
  examples: [['endpoint_removed', 'required_param_added'], ['schema_removed']],
});

registerFact({
  id: 'openapi.endpointsAdded.count',
  name: 'OpenAPI Endpoints Added',
  description: 'Number of endpoints added to OpenAPI spec',
  category: 'openapi',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0', min: 0 },
  resolver: async (context: PRContext) => {
    const diff = await getOpenApiDiffData(context);
    if (!diff) return 0;
    return diff.addedEndpoints || 0;
  },
  examples: ['0', '3', '10'],
});

registerFact({
  id: 'openapi.endpointsRemoved.count',
  name: 'OpenAPI Endpoints Removed',
  description: 'Number of endpoints removed from OpenAPI spec',
  category: 'openapi',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0', min: 0 },
  resolver: async (context: PRContext) => {
    const diff = await getOpenApiDiffData(context);
    if (!diff) return 0;
    return diff.removedEndpoints || 0;
  },
  examples: ['0', '1', '5'],
});

registerFact({
  id: 'openapi.endpointsModified.count',
  name: 'OpenAPI Endpoints Modified',
  description: 'Number of endpoints modified in OpenAPI spec',
  category: 'openapi',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0', min: 0 },
  resolver: async (context: PRContext) => {
    const diff = await getOpenApiDiffData(context);
    if (!diff) return 0;
    return diff.modifiedEndpoints || 0;
  },
  examples: ['0', '2', '8'],
});

registerFact({
  id: 'openapi.versionBumpRequired',
  name: 'OpenAPI Version Bump Required',
  description: 'Required version bump type (major, minor, patch)',
  category: 'openapi',
  valueType: 'string',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', 'in'],
  valueWidget: { kind: 'select', options: ['major', 'minor', 'patch', 'none'] },
  resolver: async (context: PRContext) => {
    const diff = await getOpenApiDiffData(context);
    if (!diff) return 'none';

    // Determine version bump based on changes
    if (diff.hasBreakingChanges) {
      return 'major';
    } else if (diff.addedEndpoints > 0) {
      return 'minor';
    } else if (diff.modifiedEndpoints > 0) {
      return 'patch';
    }
    return 'none';
  },
  examples: ['major', 'minor', 'patch', 'none'],
});

registerFact({
  id: 'openapi.oldVersion',
  name: 'OpenAPI Old Version',
  description: 'Old OpenAPI spec version',
  category: 'openapi',
  valueType: 'string',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', 'matches'],
  valueWidget: { kind: 'text', placeholder: 'e.g. 1.0.0' },
  resolver: async (context: PRContext) => {
    const diff = await getOpenApiDiffData(context);
    if (!diff) return '';
    return diff.oldVersion || '';
  },
  examples: ['1.0.0', '2.3.1'],
});

registerFact({
  id: 'openapi.newVersion',
  name: 'OpenAPI New Version',
  description: 'New OpenAPI spec version',
  category: 'openapi',
  valueType: 'string',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', 'matches'],
  valueWidget: { kind: 'text', placeholder: 'e.g. 2.0.0' },
  resolver: async (context: PRContext) => {
    const diff = await getOpenApiDiffData(context);
    if (!diff) return '';
    return diff.newVersion || '';
  },
  examples: ['1.1.0', '3.0.0'],
});

registerFact({
  id: 'openapi.deprecatedEndpoints.count',
  name: 'OpenAPI Deprecated Endpoints',
  description: 'Number of endpoints marked as deprecated',
  category: 'openapi',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0', min: 0 },
  resolver: async (context: PRContext) => {
    const diff = await getOpenApiDiffData(context);
    if (!diff) return 0;

    // Count endpoints that were newly marked as deprecated
    return diff.changes.filter((c: any) =>
      c.changeType === 'modified' &&
      c.newSpec?.deprecated &&
      !c.oldSpec?.deprecated
    ).length;
  },
  examples: ['0', '1', '3'],
});

registerFact({
  id: 'openapi.schemasAdded.count',
  name: 'OpenAPI Schemas Added',
  description: 'Number of schemas added to OpenAPI spec',
  category: 'openapi',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0', min: 0 },
  resolver: async (context: PRContext) => {
    const diff = await getOpenApiDiffData(context);
    if (!diff) return 0;

    // Count schema additions from changes
    return diff.changes.filter((c: any) =>
      c.changeType === 'added' && c.path?.includes('/components/schemas/')
    ).length;
  },
  examples: ['0', '2', '5'],
});

registerFact({
  id: 'openapi.schemasRemoved.count',
  name: 'OpenAPI Schemas Removed',
  description: 'Number of schemas removed from OpenAPI spec',
  category: 'openapi',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0', min: 0 },
  resolver: async (context: PRContext) => {
    const diff = await getOpenApiDiffData(context);
    if (!diff) return 0;

    // Count schema removals from changes
    return diff.changes.filter((c: any) =>
      c.changeType === 'removed' && c.path?.includes('/components/schemas/')
    ).length;
  },
  examples: ['0', '1', '2'],
});

// ======================================================================
// SBOM/CVE FACTS (Phase 3C.1)
// ======================================================================

// Helper function to find SBOM files in PR
function findSBOMFiles(context: PRContext): any[] {
  return context.files?.filter(f =>
    f.filename.includes('sbom') ||
    f.filename.endsWith('.sbom.json') ||
    f.filename.endsWith('.spdx.json') ||
    f.filename.endsWith('.cyclonedx.json') ||
    f.filename.includes('bom.json')
  ) || [];
}

// Helper function to parse SBOM content
function parseSBOM(content: string): any {
  try {
    const data = JSON.parse(content);

    // CycloneDX format
    if (data.bomFormat === 'CycloneDX') {
      return {
        format: 'cyclonedx',
        packages: (data.components || []).map((c: any) => ({
          name: c.name,
          version: c.version,
          license: c.licenses?.[0]?.license?.id || c.licenses?.[0]?.license?.name,
          vulnerabilities: (c.vulnerabilities || []).map((v: any) => ({
            id: v.id,
            severity: v.ratings?.[0]?.severity?.toLowerCase() || 'unknown',
          })),
        })),
      };
    }

    // SPDX format
    if (data.spdxVersion) {
      return {
        format: 'spdx',
        packages: (data.packages || []).map((p: any) => ({
          name: p.name,
          version: p.versionInfo,
          license: p.licenseConcluded,
          vulnerabilities: [], // SPDX doesn't include CVEs by default
        })),
      };
    }

    return { format: 'unknown', packages: [] };
  } catch (error) {
    console.error('[SBOMParser] Failed to parse SBOM:', error);
    return { format: 'unknown', packages: [] };
  }
}

// Helper function to get SBOM data (cached)
async function getSBOMData(context: PRContext): Promise<any | null> {
  // Check cache first
  if ((context as any)._sbomDataCache) {
    return (context as any)._sbomDataCache;
  }

  const sbomFiles = findSBOMFiles(context);
  if (sbomFiles.length === 0) {
    return null;
  }

  // For now, handle first SBOM file
  const file = sbomFiles[0];

  const oldContent = await fetchFileContent(context, file.filename, 'base');
  const newContent = await fetchFileContent(context, file.filename, 'head');

  if (!newContent) {
    return null;
  }

  const oldSBOM = oldContent ? parseSBOM(oldContent) : { packages: [] };
  const newSBOM = parseSBOM(newContent);

  // Compute diff
  const oldPackageNames = new Set(oldSBOM.packages.map((p: any) => p.name));
  const newPackageNames = new Set(newSBOM.packages.map((p: any) => p.name));

  const added = newSBOM.packages.filter((p: any) => !oldPackageNames.has(p.name));
  const removed = oldSBOM.packages.filter((p: any) => !newPackageNames.has(p.name));

  const result = {
    oldSBOM,
    newSBOM,
    added,
    removed,
  };

  // Cache the result
  (context as any)._sbomDataCache = result;

  return result;
}

registerFact({
  id: 'sbom.packages.count',
  name: 'SBOM Package Count',
  description: 'Total number of packages in SBOM',
  category: 'sbom',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '50', min: 0 },
  resolver: async (context: PRContext) => {
    const data = await getSBOMData(context);
    if (!data) return 0;
    return data.newSBOM.packages.length;
  },
  examples: ['50', '120', '300'],
});

registerFact({
  id: 'sbom.packages.added.count',
  name: 'SBOM Packages Added',
  description: 'Number of packages added to SBOM',
  category: 'sbom',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0', min: 0 },
  resolver: async (context: PRContext) => {
    const data = await getSBOMData(context);
    if (!data) return 0;
    return data.added.length;
  },
  examples: ['0', '2', '5'],
});

registerFact({
  id: 'sbom.packages.removed.count',
  name: 'SBOM Packages Removed',
  description: 'Number of packages removed from SBOM',
  category: 'sbom',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0', min: 0 },
  resolver: async (context: PRContext) => {
    const data = await getSBOMData(context);
    if (!data) return 0;
    return data.removed.length;
  },
  examples: ['0', '1', '3'],
});

registerFact({
  id: 'sbom.cves.critical.count',
  name: 'Critical CVE Count',
  description: 'Number of critical CVEs in SBOM packages',
  category: 'sbom',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0', min: 0 },
  resolver: async (context: PRContext) => {
    const data = await getSBOMData(context);
    if (!data) return 0;

    let count = 0;
    for (const pkg of data.newSBOM.packages) {
      count += (pkg.vulnerabilities || []).filter(
        (v: any) => v.severity === 'critical'
      ).length;
    }
    return count;
  },
  examples: ['0', '1', '5'],
});

registerFact({
  id: 'sbom.cves.high.count',
  name: 'High CVE Count',
  description: 'Number of high-severity CVEs in SBOM packages',
  category: 'sbom',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0', min: 0 },
  resolver: async (context: PRContext) => {
    const data = await getSBOMData(context);
    if (!data) return 0;

    let count = 0;
    for (const pkg of data.newSBOM.packages) {
      count += (pkg.vulnerabilities || []).filter(
        (v: any) => v.severity === 'high'
      ).length;
    }
    return count;
  },
  examples: ['0', '2', '10'],
});

registerFact({
  id: 'sbom.licenses.nonCompliant',
  name: 'Non-Compliant Licenses',
  description: 'List of non-compliant licenses found in SBOM packages',
  category: 'sbom',
  valueType: 'array',
  version: 'v1.0.0',
  allowedOperators: ['contains', 'containsAll'],
  valueWidget: { kind: 'tag-list', placeholder: 'e.g. GPL-3.0' },
  resolver: async (context: PRContext) => {
    const data = await getSBOMData(context);
    if (!data) return [];

    // List of approved licenses (common permissive licenses)
    const approvedLicenses = [
      'MIT',
      'Apache-2.0',
      'BSD-2-Clause',
      'BSD-3-Clause',
      'ISC',
      'CC0-1.0',
      'Unlicense',
      '0BSD',
    ];

    const nonCompliant = new Set<string>();

    for (const pkg of data.newSBOM.packages) {
      if (pkg.license && !approvedLicenses.includes(pkg.license)) {
        nonCompliant.add(pkg.license);
      }
    }

    return Array.from(nonCompliant);
  },
  examples: [['GPL-3.0', 'AGPL-3.0'], ['LGPL-2.1']],
});

// ======================================================================
// GATE STATUS FACTS (Cross-Gate Dependencies)
// Phase 2 - Option C: Gate Status Facts
// ======================================================================

/**
 * Helper function to get previous gate check run status from GitHub
 * Uses GitHub Check Runs API to query for previous VertaAI Policy Pack checks
 * CRITICAL FIX: Excludes in-progress checks to avoid circular dependencies
 * ENHANCED: Returns detailed metadata for better output context
 */
async function getPreviousGateStatus(context: PRContext, options?: {
  checkNameFilter?: string; // Filter by specific check name (e.g., "VertaAI Policy Pack")
  excludeCheckId?: number;   // Exclude specific check run ID (to avoid querying current check)
}): Promise<{
  status: 'pass' | 'warn' | 'block' | 'unknown';
  findings: number;
  checkName: string;
  checkId: number;
  completedAt: string;
  conclusion: string;
} | null> {
  try {
    // Query GitHub for check runs on this PR's head SHA
    const response = await context.github.rest.checks.listForRef({
      owner: context.owner,
      repo: context.repo,
      ref: context.headSha,
    });

    // Find the most recent COMPLETED VertaAI Policy Pack check
    // CRITICAL: Exclude in_progress, queued checks AND the current check to avoid circular dependencies
    const policyChecks = response.data.check_runs?.filter(
      (run: any) => {
        // CRITICAL FIX: Only match "VertaAI Policy Pack" checks (YAML DSL), not legacy checks
        const checkNameFilter = options?.checkNameFilter || 'VertaAI Policy Pack';
        const isTargetCheck = run.name === checkNameFilter;

        // Only include completed checks (exclude in_progress, queued)
        const isCompleted = run.status === 'completed';

        // Exclude the current check run if specified
        const isNotCurrentCheck = !options?.excludeCheckId || run.id !== options.excludeCheckId;

        return isTargetCheck && isCompleted && isNotCurrentCheck;
      }
    ) || [];

    if (policyChecks.length === 0) {
      console.log(`[getPreviousGateStatus] No previous completed check run found (filter: ${options?.checkNameFilter || 'VertaAI Policy Pack'})`);
      return null; // No previous check run found
    }

    // Get the most recent completed check (they're sorted by created_at desc by default)
    const latestCheck = policyChecks[0];
    console.log(`[getPreviousGateStatus] Found previous check: ${latestCheck.name} (ID: ${latestCheck.id}, conclusion: ${latestCheck.conclusion}, completed: ${latestCheck.completed_at})`);

    // Map GitHub check conclusion to our status
    let status: 'pass' | 'warn' | 'block' | 'unknown' = 'unknown';
    if (latestCheck.conclusion === 'success') {
      status = 'pass';
    } else if (latestCheck.conclusion === 'failure') {
      status = 'block';
    } else if (latestCheck.conclusion === 'neutral' || latestCheck.conclusion === 'action_required') {
      status = 'warn';
    }

    // Extract findings count from check output
    // The check output summary typically includes "X findings" or "X rules triggered"
    let findings = 0;
    const summary = latestCheck.output?.summary || '';
    const findingsMatch = summary.match(/(\d+)\s+findings?/i);
    if (findingsMatch) {
      findings = parseInt(findingsMatch[1], 10);
    }

    return {
      status,
      findings,
      checkName: latestCheck.name,
      checkId: latestCheck.id,
      completedAt: latestCheck.completed_at || 'unknown',
      conclusion: latestCheck.conclusion || 'unknown',
    };
  } catch (error) {
    console.error('[FactCatalog] Failed to fetch previous gate status:', error);
    return null;
  }
}

/**
 * Cache for gate status to avoid redundant API calls
 */
let gateStatusCache: {
  status: 'pass' | 'warn' | 'block' | 'unknown';
  findings: number;
  checkName: string;
  checkId: number;
  completedAt: string;
  conclusion: string;
} | null | undefined = undefined;

async function getGateStatusCached(context: PRContext, options?: {
  checkNameFilter?: string;
  excludeCheckId?: number;
}) {
  if (gateStatusCache === undefined) {
    gateStatusCache = await getPreviousGateStatus(context, options);
  }
  return gateStatusCache;
}

// ENHANCED: Register gate facts with detailed metadata for better output context
// These facts query the previous "VertaAI Policy Pack" check (YAML DSL)
registerFact({
  id: 'gate.previous.status',
  name: 'Previous Policy Pack Status',
  description: 'Status of the most recent VertaAI Policy Pack check: pass, warn, block, or unknown. Use this for cross-gate dependencies.',
  category: 'gate',
  valueType: 'string',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', 'in'],
  valueWidget: { kind: 'select', options: ['pass', 'warn', 'block', 'unknown'] },
  resolver: async (context: PRContext) => {
    const gateStatus = await getGateStatusCached(context, {
      checkNameFilter: 'VertaAI Policy Pack',
    });

    // Store metadata in context for enhanced output
    if (gateStatus && (context as any)._factMetadata) {
      (context as any)._factMetadata['gate.previous.status'] = {
        checkName: gateStatus.checkName,
        checkId: gateStatus.checkId,
        completedAt: gateStatus.completedAt,
        conclusion: gateStatus.conclusion,
        findings: gateStatus.findings,
      };
    }

    return gateStatus?.status || 'unknown';
  },
  examples: ['pass', 'warn', 'block', 'unknown'],
});

registerFact({
  id: 'gate.previous.findings',
  name: 'Previous Policy Pack Findings Count',
  description: 'Number of findings from the most recent VertaAI Policy Pack check',
  category: 'gate',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0', min: 0 },
  resolver: async (context: PRContext) => {
    const gateStatus = await getGateStatusCached(context, {
      checkNameFilter: 'VertaAI Policy Pack',
    });
    return gateStatus?.findings || 0;
  },
  examples: ['0', '3', '10'],
});

// DEPRECATED: Legacy gate facts (kept for backward compatibility)
// These query ANY VertaAI check (could be legacy or YAML DSL)
// Prefer using gate.previous.* facts for cross-gate dependencies
registerFact({
  id: 'gate.contractIntegrity.status',
  name: 'Contract Integrity Gate Status (Legacy)',
  description: 'DEPRECATED: Use gate.previous.status instead. Status of the most recent VertaAI check (could be legacy or YAML DSL)',
  category: 'gate',
  valueType: 'string',
  version: 'v1.0.0',
  deprecated: true,
  replacedBy: 'gate.previous.status',
  allowedOperators: ['==', '!=', 'in'],
  valueWidget: { kind: 'select', options: ['pass', 'warn', 'block', 'unknown'] },
  resolver: async (context: PRContext) => {
    const gateStatus = await getGateStatusCached(context);
    return gateStatus?.status || 'unknown';
  },
  examples: ['pass', 'warn', 'block', 'unknown'],
});

registerFact({
  id: 'gate.contractIntegrity.findings',
  name: 'Contract Integrity Gate Findings Count (Legacy)',
  description: 'DEPRECATED: Use gate.previous.findings instead. Number of findings from the most recent VertaAI check',
  category: 'gate',
  valueType: 'number',
  version: 'v1.0.0',
  deprecated: true,
  replacedBy: 'gate.previous.findings',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0', min: 0 },
  resolver: async (context: PRContext) => {
    const gateStatus = await getGateStatusCached(context);
    return gateStatus?.findings || 0;
  },
  examples: ['0', '3', '10'],
});

registerFact({
  id: 'gate.driftRemediation.status',
  name: 'Drift Remediation Gate Status',
  description: 'Status of the most recent Track B (Drift Remediation) gate evaluation: pass, warn, block, or unknown. Note: Track B is async, so this reflects the last evaluation if any.',
  category: 'gate',
  valueType: 'string',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', 'in'],
  valueWidget: { kind: 'select', options: ['pass', 'warn', 'block', 'unknown'] },
  resolver: async (context: PRContext) => {
    // Track B doesn't currently post GitHub checks, so we return 'unknown' for now
    // This fact is reserved for future Track B YAML DSL integration
    // When Track B posts checks, we can query for them similar to Track A
    return 'unknown';
  },
  examples: ['pass', 'warn', 'block', 'unknown'],
});

// ============================================================================
// DRIFT FACTS (Track B - Drift Remediation)
// ============================================================================

/**
 * Helper function to get drift candidate for this PR
 * Queries DriftCandidate table for PR-based drift detection results
 */
async function getDriftCandidateForPR(context: PRContext): Promise<any | null> {
  try {
    const { prisma } = await import('../../../../lib/db.js');

    // Query for drift candidate associated with this PR
    // DriftCandidate.repo format: "owner/repo"
    const repoFullName = `${context.owner}/${context.repo}`;

    const driftCandidate = await prisma.driftCandidate.findFirst({
      where: {
        workspaceId: context.workspaceId,
        repo: repoFullName,
        sourceType: 'github_pr',
      },
      orderBy: {
        stateUpdatedAt: 'desc', // Get most recent
      },
    });

    return driftCandidate;
  } catch (error) {
    console.error('[FactCatalog] Failed to fetch drift candidate:', error);
    return null;
  }
}

/**
 * Cache for drift candidate to avoid redundant queries
 */
let driftCandidateCache: any | null | undefined = undefined;

async function getDriftCandidateCached(context: PRContext) {
  if (driftCandidateCache === undefined) {
    driftCandidateCache = await getDriftCandidateForPR(context);
  }
  return driftCandidateCache;
}

registerFact({
  id: 'drift.detected',
  name: 'Drift Detected',
  description: 'Whether drift was detected in this PR by the Track B drift detection pipeline',
  category: 'drift',
  valueType: 'boolean',
  version: 'v1.0.0',
  allowedOperators: ['==', '!='],
  valueWidget: { kind: 'boolean' },
  resolver: async (context: PRContext) => {
    const driftCandidate = await getDriftCandidateCached(context);
    if (!driftCandidate) {
      return false;
    }

    // Drift is detected if the candidate exists and has a drift type
    return driftCandidate.driftType !== null && driftCandidate.driftType !== undefined;
  },
  examples: ['true', 'false'],
});

registerFact({
  id: 'drift.types',
  name: 'Drift Types',
  description: 'Types of drift detected: instruction, process, ownership, coverage, environment_tooling',
  category: 'drift',
  valueType: 'array',
  version: 'v1.0.0',
  allowedOperators: ['contains', 'containsAll'],
  valueWidget: { kind: 'tag-list', placeholder: 'e.g. instruction' },
  resolver: async (context: PRContext) => {
    const driftCandidate = await getDriftCandidateCached(context);
    if (!driftCandidate || !driftCandidate.driftType) {
      return [];
    }

    // DriftCandidate.driftType is a single string, but we return as array for consistency
    return [driftCandidate.driftType];
  },
  examples: ['["instruction"]', '["process", "coverage"]', '[]'],
});

registerFact({
  id: 'drift.confidence',
  name: 'Drift Confidence Score',
  description: 'Confidence score (0-1) of drift detection from triage agent',
  category: 'drift',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0.8', min: 0, max: 1, step: 0.01 },
  resolver: async (context: PRContext) => {
    const driftCandidate = await getDriftCandidateCached(context);
    if (!driftCandidate || driftCandidate.confidence === null || driftCandidate.confidence === undefined) {
      return 0;
    }

    return driftCandidate.confidence;
  },
  examples: ['0.85', '0.92', '0.0'],
});

registerFact({
  id: 'drift.impactedDomains',
  name: 'Drift Impacted Domains',
  description: 'Domains impacted by drift: deployment, rollback, config, infra, api, auth, observability, onboarding, ownership_routing, data_migrations',
  category: 'drift',
  valueType: 'array',
  version: 'v1.0.0',
  allowedOperators: ['contains', 'containsAll'],
  valueWidget: { kind: 'tag-list', placeholder: 'e.g. deployment' },
  resolver: async (context: PRContext) => {
    const driftCandidate = await getDriftCandidateCached(context);
    if (!driftCandidate || !driftCandidate.driftDomains) {
      return [];
    }

    return driftCandidate.driftDomains;
  },
  examples: ['["deployment", "rollback"]', '["api", "auth"]', '[]'],
});

registerFact({
  id: 'drift.riskLevel',
  name: 'Drift Risk Level',
  description: 'Risk level of detected drift: low, medium, high',
  category: 'drift',
  valueType: 'string',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', 'in'],
  valueWidget: { kind: 'select', options: ['low', 'medium', 'high', 'unknown'] },
  resolver: async (context: PRContext) => {
    const driftCandidate = await getDriftCandidateCached(context);
    if (!driftCandidate || !driftCandidate.riskLevel) {
      return 'unknown';
    }

    return driftCandidate.riskLevel;
  },
  examples: ['low', 'medium', 'high', 'unknown'],
});

registerFact({
  id: 'drift.priority',
  name: 'Drift Priority',
  description: 'Priority level for drift remediation: P0 (critical), P1 (high), P2 (medium)',
  category: 'drift',
  valueType: 'string',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', 'in'],
  valueWidget: { kind: 'select', options: ['P0', 'P1', 'P2', 'unknown'] },
  resolver: async (context: PRContext) => {
    const driftCandidate = await getDriftCandidateCached(context);
    if (!driftCandidate) return 'unknown';
    if (driftCandidate.riskLevel === 'high') return 'P0';
    if (driftCandidate.riskLevel === 'medium') return 'P1';
    if (driftCandidate.riskLevel === 'low') return 'P2';
    return 'unknown';
  },
  examples: ['P0', 'P1', 'P2', 'unknown'],
});

// ============================================================================
// SCOPE / ENVIRONMENT FACT (FactCatalog v1 addition)
// ============================================================================

registerFact({
  id: 'scope.env',
  name: 'Environment',
  description: 'Deployment environment derived from the target branch name (production, staging, dev, test)',
  category: 'universal',
  valueType: 'string',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', 'in', 'matches'],
  valueWidget: { kind: 'select', options: ['production', 'staging', 'dev', 'test'] },
  resolver: (context: PRContext) => {
    const branch = context.baseBranch || '';
    if (branch === 'main' || branch === 'master' || branch.startsWith('release/')) return 'production';
    if (branch === 'staging' || branch.startsWith('staging/')) return 'staging';
    if (branch === 'dev' || branch === 'develop' || branch.startsWith('develop/')) return 'dev';
    if (branch.startsWith('test') || branch.startsWith('qa')) return 'test';
    return 'dev';
  },
  examples: ['production', 'staging', 'dev', 'test'],
});

// ============================================================================
// TERRAFORM PLAN FACTS (FactCatalog v1)
// ============================================================================

/**
 * Helper: find a terraform plan JSON artifact attached to the PR (if any).
 * VertaAI expects a plan artifact named `tf-plan.json` or `terraform-plan.json`
 * in the PR's changed files (typically uploaded as a PR comment artifact).
 * Falls back to static .tf file detection when no plan is present.
 */
async function getTerraformPlanData(context: PRContext): Promise<any | null> {
  if ((context as any)._tfPlanCache !== undefined) {
    return (context as any)._tfPlanCache;
  }

  // Find a plan JSON file in the PR
  const planFiles = context.files?.filter(f =>
    f.filename.endsWith('tf-plan.json') ||
    f.filename.endsWith('terraform-plan.json') ||
    f.filename.match(/tfplan.*\.json$/i)
  ) || [];

  if (planFiles.length === 0) {
    (context as any)._tfPlanCache = null;
    return null;
  }

  try {
    const content = await fetchFileContent(context, planFiles[0].filename, 'head');
    if (!content) {
      (context as any)._tfPlanCache = null;
      return null;
    }
    const plan = JSON.parse(content);
    (context as any)._tfPlanCache = plan;
    return plan;
  } catch {
    (context as any)._tfPlanCache = null;
    return null;
  }
}

/** Count terraform resource changes of a given action from a plan JSON */
function countTfChanges(plan: any, action: string): number {
  const changes: any[] = plan?.resource_changes || [];
  return changes.filter((c: any) =>
    Array.isArray(c.change?.actions)
      ? c.change.actions.includes(action)
      : c.change?.actions === action
  ).length;
}

registerFact({
  id: 'tf.plan.resourceChanges.count',
  name: 'Terraform Resource Changes',
  description: 'Total number of resource changes in the Terraform plan (create + update + delete)',
  category: 'terraform',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0', min: 0 },
  resolver: async (context: PRContext) => {
    const plan = await getTerraformPlanData(context);
    if (!plan) {
      // Fallback: count .tf files changed
      return context.files?.filter(f => f.filename.endsWith('.tf')).length || 0;
    }
    return (plan.resource_changes || []).length;
  },
  examples: ['0', '5', '20'],
});

registerFact({
  id: 'tf.plan.changes.create.count',
  name: 'Terraform Resources to Create',
  description: 'Number of resources the Terraform plan will create',
  category: 'terraform',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0', min: 0 },
  resolver: async (context: PRContext) => {
    const plan = await getTerraformPlanData(context);
    if (!plan) return 0;
    return countTfChanges(plan, 'create');
  },
  examples: ['0', '2', '10'],
});

registerFact({
  id: 'tf.plan.changes.update.count',
  name: 'Terraform Resources to Update',
  description: 'Number of resources the Terraform plan will update in-place',
  category: 'terraform',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0', min: 0 },
  resolver: async (context: PRContext) => {
    const plan = await getTerraformPlanData(context);
    if (!plan) return 0;
    return countTfChanges(plan, 'update');
  },
  examples: ['0', '3', '8'],
});

registerFact({
  id: 'tf.plan.changes.delete.count',
  name: 'Terraform Resources to Delete',
  description: 'Number of resources the Terraform plan will destroy',
  category: 'terraform',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0', min: 0 },
  resolver: async (context: PRContext) => {
    const plan = await getTerraformPlanData(context);
    if (!plan) return 0;
    return countTfChanges(plan, 'delete');
  },
  examples: ['0', '1', '5'],
});

registerFact({
  id: 'tf.plan.resourceTypes.changed',
  name: 'Terraform Resource Types Changed',
  description: 'Unique Terraform resource types affected by this plan (e.g., aws_s3_bucket, google_compute_instance)',
  category: 'terraform',
  valueType: 'array',
  version: 'v1.0.0',
  allowedOperators: ['contains', 'containsAll'],
  valueWidget: { kind: 'tag-list', placeholder: 'e.g. aws_s3_bucket' },
  resolver: async (context: PRContext) => {
    const plan = await getTerraformPlanData(context);
    if (!plan) return [];
    const types = new Set<string>(
      (plan.resource_changes || []).map((c: any) => c.type).filter(Boolean)
    );
    return Array.from(types);
  },
  examples: [['aws_s3_bucket', 'aws_iam_role'], ['google_compute_instance']],
});

registerFact({
  id: 'tf.plan.cost.deltaMonthlyUsd',
  name: 'Terraform Monthly Cost Delta (USD)',
  description: 'Estimated monthly cost change in USD from this Terraform plan (requires cost estimation metadata in plan JSON)',
  category: 'terraform',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0', step: 0.01 },
  resolver: async (context: PRContext) => {
    const plan = await getTerraformPlanData(context);
    if (!plan) return 0;
    // Infracost / Terraform Cloud cost estimate metadata
    return plan.cost_estimate?.delta_monthly_cost ?? plan.costDeltaMonthlyUsd ?? 0;
  },
  examples: ['0', '50.25', '-12.00'],
});

// ============================================================================
// DERIVED / COMPOSITE RISK FACTS (FactCatalog v1)
// ============================================================================

registerFact({
  id: 'risk.score',
  name: 'Composite Risk Score',
  description: 'Composite risk score (0–100) derived from CVE severity, drift risk level, OpenAPI breaking changes, and Terraform destructive operations',
  category: 'derived',
  valueType: 'number',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', '>', '>=', '<', '<='],
  valueWidget: { kind: 'number', placeholder: '0', min: 0, max: 100 },
  resolver: async (context: PRContext) => {
    let score = 0;

    // Critical CVEs: +25 each (capped at 50)
    const criticalCves = await factCatalog.get('sbom.cves.critical.count')?.resolver(context);
    score += Math.min((criticalCves || 0) * 25, 50);

    // Drift risk: high=30, medium=15, low=5
    const driftRisk = await factCatalog.get('drift.riskLevel')?.resolver(context);
    if (driftRisk === 'high') score += 30;
    else if (driftRisk === 'medium') score += 15;
    else if (driftRisk === 'low') score += 5;

    // OpenAPI breaking changes: +10 per (capped at 30)
    const breakingChanges = await factCatalog.get('openapi.breakingChanges.count')?.resolver(context);
    score += Math.min((breakingChanges || 0) * 10, 30);

    // Terraform destructive ops: +5 per delete (capped at 20)
    const tfDeletes = await factCatalog.get('tf.plan.changes.delete.count')?.resolver(context);
    score += Math.min((tfDeletes || 0) * 5, 20);

    return Math.min(score, 100);
  },
  examples: ['0', '35', '75', '100'],
});

registerFact({
  id: 'risk.category',
  name: 'Risk Category',
  description: 'Risk category derived from composite risk score: low (<25), medium (25–49), high (50–74), critical (≥75)',
  category: 'derived',
  valueType: 'string',
  version: 'v1.0.0',
  allowedOperators: ['==', '!=', 'in'],
  valueWidget: { kind: 'select', options: ['low', 'medium', 'high', 'critical'] },
  resolver: async (context: PRContext) => {
    const score = await factCatalog.get('risk.score')?.resolver(context);
    if (score >= 75) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
  },
  examples: ['low', 'medium', 'high', 'critical'],
});

registerFact({
  id: 'change.isSensitive',
  name: 'Change Is Sensitive',
  description: 'Whether the PR touches sensitive paths (secrets, auth, infra, billing, or production config)',
  category: 'derived',
  valueType: 'boolean',
  version: 'v1.0.0',
  allowedOperators: ['==', '!='],
  valueWidget: { kind: 'boolean' },
  resolver: (context: PRContext) => {
    const sensitivePaths = [
      /\.env/, /secret/, /password/, /credential/, /token/,
      /auth/, /billing/, /payment/, /terraform/, /infra\//,
      /\.pem$/, /\.key$/, /k8s\//, /helm\//,
    ];
    const changedPaths = context.files?.map(f => f.filename) || [];
    return changedPaths.some(p => sensitivePaths.some(r => r.test(p)));
  },
  examples: ['true', 'false'],
});


