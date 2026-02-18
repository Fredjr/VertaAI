/**
 * Comparator Contract Types
 * Migration Plan v5.0
 */

import { ComparatorId } from '../types.js';

// Re-export for convenience
export { ComparatorId };

// ============================================================================
// Finding Codes (structured error codes)
// ============================================================================

export enum FindingCode {
  // Artifact codes
  ARTIFACT_MISSING = 'ARTIFACT_MISSING',
  ARTIFACT_NOT_UPDATED = 'ARTIFACT_NOT_UPDATED',
  ARTIFACT_INVALID_SCHEMA = 'ARTIFACT_INVALID_SCHEMA',
  ARTIFACT_SERVICE_NOT_FOUND = 'ARTIFACT_SERVICE_NOT_FOUND',
  ARTIFACT_NO_REGISTRY = 'ARTIFACT_NO_REGISTRY',

  // Evidence codes
  PR_FIELD_MISSING = 'PR_FIELD_MISSING',
  CHECKRUNS_FAILED = 'CHECKRUNS_FAILED',
  CHECKRUNS_REQUIRED_MISSING = 'CHECKRUNS_REQUIRED_MISSING',

  // Governance codes
  INSUFFICIENT_APPROVALS = 'INSUFFICIENT_APPROVALS',
  NO_HUMAN_APPROVAL = 'NO_HUMAN_APPROVAL',
  APPROVALS_ALL_BOTS = 'APPROVALS_ALL_BOTS',
  APPROVALS_TEAM_NOT_FOUND = 'APPROVALS_TEAM_NOT_FOUND',

  // Safety codes
  SECRET_DETECTED = 'SECRET_DETECTED',

  // Actor codes
  AGENT_DETECTED = 'AGENT_DETECTED',
  PATH_MATCHED = 'PATH_MATCHED',

  // Success
  PASS = 'PASS',

  // Errors
  EXTERNAL_DEPENDENCY_FAILED = 'EXTERNAL_DEPENDENCY_FAILED',
  TIMEOUT_EXCEEDED = 'TIMEOUT_EXCEEDED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  NOT_EVALUABLE = 'NOT_EVALUABLE',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// ============================================================================
// PR Context (passed to all comparators)
// ============================================================================

export interface PRContext {
  // PR metadata
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  baseBranch: string;
  headBranch: string;

  // PR content
  title: string;
  body: string;
  author: string;
  labels: string[];

  // Changes
  files: GitHubFile[];
  commits: GitHubCommit[];
  additions: number;
  deletions: number;

  // GitHub API client (budgeted)
  github: BudgetedGitHubClient;

  // Cancellation support
  abortController: AbortController;

  // Budgets
  budgets: {
    maxTotalMs: number;
    perComparatorTimeoutMs: number;
    maxGitHubApiCalls: number;
    currentApiCalls: number;
    startTime: number;
  };

  // Workspace context
  workspaceId: string;
  installationId: number;

  // Workspace defaults (loaded separately)
  defaults?: WorkspaceDefaults;

  // Cached data to reduce API calls
  cache: {
    approvals?: any[];
    checkRuns?: any[];
    teamMemberships?: Map<string, string[]>;
  };
}

export interface GitHubFile {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
  };
}

// ============================================================================
// Budgeted GitHub Client (Gap #1 - Fourth Review)
// ============================================================================

/**
 * CRITICAL: Comparators MUST use context.github (BudgetedGitHubClient)
 * NEVER use raw octokit or import their own Octokit
 *
 * Gap #1 (Fourth Review): Raw octokit MUST NOT be exposed to comparators
 * If any comparator uses raw octokit, it bypasses budgets + cancellation
 */
export class BudgetedGitHubClient {
  constructor(
    private octokit: any,
    private budgets: PRContext['budgets'],
    private abortSignal?: AbortSignal
  ) {}

  /**
   * Proxy to octokit.rest.* with automatic signal injection and budget tracking
   */
  get rest(): any {
    const self = this;
    return new Proxy(this.octokit.rest, {
      get: (target, namespace: string) => {
        if (typeof target[namespace] !== 'object') return target[namespace];

        return new Proxy(target[namespace], {
          get: (nsTarget, method: string) => {
            const originalFn = nsTarget[method];
            if (typeof originalFn !== 'function') return originalFn;

            // Wrap the actual Octokit function
            return async (params?: any) => {
              // Check if already aborted
              if (self.abortSignal?.aborted) {
                throw new Error('ABORTED: Request cancelled');
              }

              // Check budget before making call
              if (self.budgets.currentApiCalls >= self.budgets.maxGitHubApiCalls) {
                throw new Error('RATE_LIMIT_EXCEEDED: GitHub API call budget exhausted');
              }

              // Increment counter BEFORE making call (fail-safe)
              self.budgets.currentApiCalls++;

              try {
                // Inject signal into params.request (Octokit convention)
                const paramsWithSignal = self.abortSignal
                  ? { ...params, request: { ...params?.request, signal: self.abortSignal } }
                  : params;

                // Call the real Octokit function
                return await originalFn.call(nsTarget, paramsWithSignal);
              } catch (error: any) {
                // Detect abort
                if (error.name === 'AbortError' || self.abortSignal?.aborted) {
                  throw new Error('ABORTED: Request cancelled');
                }

                // Detect GitHub rate limit
                if (error.status === 403 && error.message?.includes('rate limit')) {
                  throw new Error('RATE_LIMIT_EXCEEDED: GitHub API rate limit hit');
                }
                throw error;
              }
            };
          },
        });
      },
    });
  }

  /**
   * Get current API call count
   */
  getCallCount(): number {
    return this.budgets.currentApiCalls;
  }

  /**
   * Get remaining API calls
   */
  getRemainingCalls(): number {
    return Math.max(0, this.budgets.maxGitHubApiCalls - this.budgets.currentApiCalls);
  }
}

// ============================================================================
// Workspace Defaults
// ============================================================================

export interface WorkspaceDefaults {
  approvers?: {
    platformTeams?: string[];
    securityTeams?: string[];
  };
  approvals?: {
    countOnlyStates?: string[];
    ignoreBots?: boolean;
    honorCodeowners?: boolean;
    ignoredUsers?: string[];
    teamSlugFormat?: string;
    cacheMembershipTtlSeconds?: number;
  };
  paths?: Record<string, string[]>;
  sensitivePaths?: Record<string, string[]>;
  prTemplate?: {
    requiredFields?: Record<string, { matchAny: string[] }>;
  };
  safety?: {
    secretPatterns?: string[];
  };
  artifacts?: Record<string, { matchAny: string[] }>;
  artifactRegistry?: ArtifactRegistry;
}

export interface ArtifactRegistry {
  services: Record<string, ServiceArtifacts>;
}

export interface ServiceArtifacts {
  repo: string;
  serviceScope?: {
    includePaths?: string[];
    excludePaths?: string[];
  };
  artifacts: Record<string, string>;
}

// ============================================================================
// Comparator Result
// ============================================================================

export interface ComparatorResult {
  comparatorId: ComparatorId;
  status: 'pass' | 'fail' | 'unknown';
  reasonCode: string;
  message: string;
  evidence: Evidence[];
}

export type Evidence =
  | { type: 'file'; path: string; lineNumber?: number; snippet?: string }
  | { type: 'commit'; sha: string; message: string; author: string }
  | { type: 'approval'; user: string; timestamp: string }
  | { type: 'checkrun'; name: string; conclusion: string; url: string }
  | { type: 'snippet'; file: string; lineStart: number; lineEnd: number; content: string }
  | { type: 'secret_detected'; hash: string; location: string; pattern: string };

// ============================================================================
// Comparator Interface
// ============================================================================

export interface Comparator {
  id: ComparatorId;
  version: string;
  evaluate(context: PRContext, params: any): Promise<ComparatorResult>;
}

