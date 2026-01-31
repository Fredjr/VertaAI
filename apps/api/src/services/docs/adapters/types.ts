/**
 * Unified Doc Adapter Types
 * 
 * Defines the interfaces for all documentation system adapters.
 * Supports both direct writeback (Confluence, Notion) and PR-based writeback (GitHub).
 * 
 * @see MULTI_SOURCE_IMPLEMENTATION_PLAN.md Section 5.3
 */

// Documentation categories - per spec, used for drift type routing
export const DOC_CATEGORIES = [
  'functional',    // Runbooks, onboarding, procedures (Confluence, Notion)
  'developer',     // API docs, README, code comments (GitHub, Swagger)
  'operational',   // Service catalog, dashboards (Backstage)
] as const;

export type DocCategory = typeof DOC_CATEGORIES[number];

// Supported documentation systems
export const DOC_SYSTEMS = [
  'confluence',
  'notion',
  'github_readme',
  'github_swagger',
  'backstage',
  'github_code_comments',  // Phase 5: JSDoc/TSDoc
  'gitbook',               // Phase 5: GitBook
] as const;

export type DocSystem = typeof DOC_SYSTEMS[number];

// Input source types (signals)
export const INPUT_SOURCE_TYPES = [
  'github_pr',           // Existing
  'github_codeowners',   // Phase 1: CODEOWNERS file changes
  'github_iac',          // Phase 5: Terraform/Pulumi changes
  'pagerduty_incident',  // Phase 3: PagerDuty incidents
  'slack_cluster',       // Phase 4: Slack question clusters
  'datadog_alert',       // Phase 5: Datadog/Grafana alert changes
] as const;

export type InputSourceType = typeof INPUT_SOURCE_TYPES[number];

// Drift types supported by the system
export const DRIFT_TYPES = [
  'instruction',
  'process',
  'ownership',
  'coverage',
  'environment_tooling',
] as const;

export type DriftType = typeof DRIFT_TYPES[number];

/**
 * Reference to a document in any system
 */
export interface DocRef {
  docId: string;           // System-specific document ID
  docSystem: DocSystem;    // Which system this doc is in
  docUrl?: string;         // URL to the document
  
  // For GitHub-based docs
  owner?: string;          // GitHub repo owner
  repo?: string;           // GitHub repo name
  filePath?: string;       // Path to file (e.g., "README.md", "docs/api.yaml")
  ref?: string;            // Git ref (branch/tag/sha)
}

/**
 * Result of fetching a document
 */
export interface DocFetchResult {
  doc: DocRef;
  baseRevision: string | null;    // Version/SHA for optimistic locking (null if file not found)
  format: 'markdown' | 'adf' | 'html' | 'yaml' | 'json';
  content: string | null;         // Raw content in native format (null if file not found)
  markdown?: string;              // Markdown conversion (if applicable)
  title: string;                  // Document title
  metadata?: Record<string, unknown>;
  error?: string;                 // Error message if fetch failed
}

/**
 * Parameters for writing a patch
 */
export interface WritePatchParams {
  doc: DocRef;
  baseRevision: string;    // Expected revision (for conflict detection)
  newContent: string;      // Updated content
  summary: string;         // Summary of changes
  driftType?: DriftType;   // Type of drift being fixed
}

/**
 * Result of writing a patch (direct writeback)
 */
export interface WriteResult {
  success: boolean;
  newRevision?: string;
  docUrl?: string;
  error?: string;
}

/**
 * Parameters for creating a PR with changes
 */
export interface CreatePRParams {
  doc: DocRef;
  baseSha?: string;        // Base commit SHA (optional - will be fetched if not provided)
  newContent: string;      // Updated content
  title?: string;          // PR title
  body?: string;           // PR body/description
  branchName?: string;     // Branch to create (auto-generated if not provided)
  baseBranch?: string;     // Target branch for PR (default: 'main')
  driftType?: DriftType;
  driftId?: string;        // Reference to DriftCandidate
}

/**
 * Result of creating a PR
 */
export interface PRResult {
  success: boolean;
  prNumber?: number;
  prUrl?: string;
  branchName?: string;
  error?: string;
}

/**
 * Base interface for all documentation adapters
 */
export interface DocAdapter {
  system: DocSystem;
  category: DocCategory;
  
  /**
   * Fetch document content
   */
  fetch(doc: DocRef): Promise<DocFetchResult>;
  
  /**
   * Write patch directly to document
   * Not all adapters support this (GitHub-based docs use PRs)
   */
  writePatch(params: WritePatchParams): Promise<WriteResult>;
  
  /**
   * Check if adapter supports direct writeback
   */
  supportsDirectWriteback(): boolean;
  
  /**
   * Get the URL for a document
   */
  getDocUrl(doc: DocRef): string;
}

/**
 * Extended interface for GitHub-based documentation adapters
 * These create PRs instead of direct writes
 */
export interface GitHubDocAdapter extends DocAdapter {
  /**
   * Create a PR with documentation changes
   */
  createPatchPR(params: CreatePRParams): Promise<PRResult>;
  
  /**
   * Get file content at a specific ref
   */
  getFileContent(doc: DocRef): Promise<string | null>;
  
  /**
   * Get the SHA of a file
   */
  getFileSha(doc: DocRef): Promise<string | null>;
}

/**
 * Check if an adapter is a GitHub-based adapter
 */
export function isGitHubAdapter(adapter: DocAdapter): adapter is GitHubDocAdapter {
  return !adapter.supportsDirectWriteback() && 'createPatchPR' in adapter;
}

