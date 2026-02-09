/**
 * Phase 1 Day 1 Task 1.1: Universal Artifact Types
 * 
 * These artifact types can be extracted from ANY source type and compared
 * against documentation to detect drift deterministically.
 */

/**
 * Baseline artifacts that can be extracted from any source
 * Used for deterministic drift detection across all source types
 */
export interface BaselineArtifacts {
  // ============================================================================
  // INSTRUCTION DRIFT ARTIFACTS
  // ============================================================================
  
  /** CLI commands, scripts, shell commands */
  commands?: string[];
  
  /** Configuration keys, environment variables, settings */
  configKeys?: string[];
  
  /** API endpoints, URLs, routes */
  endpoints?: string[];
  
  /** Tool names, software versions, dependencies */
  tools?: string[];
  
  // ============================================================================
  // PROCESS DRIFT ARTIFACTS
  // ============================================================================
  
  /** Process steps, procedures, instructions */
  steps?: string[];
  
  /** Decision points, gates, conditions */
  decisions?: string[];
  
  /** Ordered sequences, workflows */
  sequences?: string[];
  
  // ============================================================================
  // OWNERSHIP DRIFT ARTIFACTS
  // ============================================================================
  
  /** Team names, groups, squads */
  teams?: string[];
  
  /** Owner names, emails, usernames */
  owners?: string[];
  
  /** File paths, directories, code locations */
  paths?: string[];
  
  /** Slack channels, contact points, escalation paths */
  channels?: string[];
  
  // ============================================================================
  // ENVIRONMENT DRIFT ARTIFACTS
  // ============================================================================
  
  /** Platforms, operating systems, cloud providers */
  platforms?: string[];
  
  /** Version numbers, release tags */
  versions?: string[];
  
  /** Dependencies, libraries, packages */
  dependencies?: string[];
  
  // ============================================================================
  // COVERAGE DRIFT ARTIFACTS
  // ============================================================================
  
  /** New scenarios, use cases, edge cases */
  scenarios?: string[];
  
  /** New features, capabilities, functionality */
  features?: string[];
  
  /** Error codes, failure modes, exceptions */
  errors?: string[];
}

/**
 * Result of drift detection for a specific drift type
 */
export interface DriftDetectionResult {
  /** Whether drift was detected */
  hasDrift: boolean;
  
  /** Confidence level (0.0 to 1.0) */
  confidence: number;
  
  /** Number of evidence items found */
  evidenceCount: number;
  
  /** Conflicts (existing content that changed) */
  conflicts: string[];
  
  /** New content (not found in doc) */
  newContent: string[];
}

/**
 * Result of coverage gap detection
 */
export interface CoverageGapResult {
  /** Whether coverage gaps were found */
  hasGap: boolean;
  
  /** Number of gaps found */
  gapCount: number;
  
  /** List of coverage gaps */
  gaps: string[];
}

/**
 * Complete comparison result
 */
export interface ComparisonResult {
  /** Primary drift type detected */
  driftType: 'instruction' | 'process' | 'ownership' | 'environment';
  
  /** Overall confidence (0.0 to 1.0) */
  confidence: number;
  
  /** Whether any drift was detected */
  hasDrift: boolean;
  
  /** Whether coverage gaps were detected (orthogonal) */
  hasCoverageGap: boolean;
  
  /** All drift types detected (may be multiple) */
  allDriftTypes: string[];
  
  /** Conflicts (existing content that changed) */
  conflicts: string[];
  
  /** New content (not found in doc) */
  newContent: string[];
  
  /** Coverage gaps (new scenarios/features/errors) */
  coverageGaps: string[];
  
  /** Recommendation for patch generation */
  recommendation: 'replace_steps' | 'add_section' | 'update_ownership' | 'add_note';
  
  /** Detailed results per drift type */
  details?: {
    instruction?: DriftDetectionResult;
    process?: DriftDetectionResult;
    ownership?: DriftDetectionResult;
    environment?: DriftDetectionResult;
    coverage?: CoverageGapResult;
  };
}

/**
 * Arguments for artifact extraction
 */
export interface ExtractArtifactsArgs {
  /** Source type (github_pr, pagerduty_incident, etc.) */
  sourceType: string;
  
  /** Source evidence from evidence bundle */
  sourceEvidence: any;
  
  /** Optional drift type hint for focused extraction */
  driftType?: string;
}

/**
 * Arguments for artifact comparison
 */
export interface CompareArtifactsArgs {
  /** Artifacts extracted from source (PR, incident, etc.) */
  sourceArtifacts: BaselineArtifacts;
  
  /** Artifacts extracted from documentation */
  docArtifacts: BaselineArtifacts;
  
  /** Source type for context */
  sourceType: string;
}

