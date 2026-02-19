/**
 * Fact Catalog Types
 * Phase 2.1 - Hybrid Comparator/Fact-Based Approach
 * 
 * Defines the type system for fact-based conditions
 */

import type { PRContext } from '../comparators/types.js';

/**
 * Fact categories for organization
 */
export type FactCategory =
  | 'universal'   // Workspace, repo, branch, environment
  | 'pr'          // PR metadata (approvals, labels, author)
  | 'diff'        // File changes, lines added/deleted
  | 'openapi'     // OpenAPI spec changes
  | 'terraform'   // Terraform plan changes
  | 'sbom'        // SBOM/dependency changes
  | 'drift'       // Drift detection (Track B)
  | 'gate';       // Gate status (cross-gate dependencies)

/**
 * Supported value types for facts
 */
export type FactValueType = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'array' 
  | 'object';

/**
 * Fact definition
 */
export interface Fact {
  id: string;                           // e.g., "pr.approvals.count"
  name: string;                         // e.g., "PR Approval Count"
  description: string;                  // Human-readable description
  category: FactCategory;               // Category for organization
  valueType: FactValueType;             // Type of value returned
  resolver: (context: PRContext) => any; // Function to extract value from context
  version: string;                      // Fact catalog version (e.g., "v1.0.0")
  examples?: string[];                  // Example values
  deprecated?: boolean;                 // If true, fact is deprecated
  replacedBy?: string;                  // ID of replacement fact
}

/**
 * Fact catalog version
 */
export interface FactCatalogVersion {
  version: string;                      // e.g., "v1.0.0"
  releaseDate: string;                  // ISO date
  facts: Fact[];                        // All facts in this version
  changelog?: string;                   // What changed in this version
}

/**
 * Resolved fact value
 */
export interface ResolvedFact {
  factId: string;                       // Fact ID that was resolved
  value: any;                           // Resolved value
  resolvedAt: string;                   // ISO timestamp
  error?: string;                       // Error message if resolution failed
}

/**
 * Fact resolution result
 */
export interface FactResolutionResult {
  facts: Record<string, any>;           // Map of fact ID to resolved value
  errors: Record<string, string>;       // Map of fact ID to error message
  resolvedAt: string;                   // ISO timestamp
  catalogVersion: string;               // Version of catalog used
}

