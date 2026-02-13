// Evidence Bundle Type System
// Implements deterministic evidence collection for VertaAI transformation
// Based on COMPREHENSIVE_IMPLEMENTATION_PLAN.md Phase 1

// Re-export TypedDelta for use in other modules
import type { TypedDelta } from '../baseline/types.js';
export type { TypedDelta };

/**
 * Source-specific evidence structures for different signal types
 */
export interface SourceEvidence {
  sourceType: 'github_pr' | 'pagerduty_incident' | 'slack_cluster' | 'datadog_alert' | 'grafana_alert' | 'github_iac' | 'github_codeowners';
  sourceId: string;
  timestamp: string;
  artifacts: SourceArtifacts;
}

export interface SourceArtifacts {
  // GitHub PR artifacts
  prDiff?: {
    excerpt: string;
    linesAdded: number;
    linesRemoved: number;
    filesChanged: string[];
    maxChars: number;
    lineBounded: boolean;
  };
  
  // PagerDuty incident artifacts
  incidentTimeline?: {
    excerpt: string;
    severity: string;
    duration: string;
    responders: string[];
    maxChars: number;
    lineBounded: boolean;
    timelineExcerpt?: string;
  };

  // Slack cluster artifacts
  slackMessages?: {
    excerpt: string;
    messageCount: number;
    participants: string[];
    timespan: string;
    maxChars: number;
    lineBounded: boolean;
    theme?: string;
    userCount?: number;
    messagesExcerpt?: string;
  };

  // Alert artifacts (Datadog/Grafana)
  alertData?: {
    excerpt: string;
    alertType: string;
    threshold: string;
    duration: string;
    maxChars: number;
    lineBounded: boolean;
    severity?: string;
    affectedServices?: string[];
  };

  // Infrastructure as Code artifacts
  iacChanges?: {
    excerpt: string;
    resourcesChanged: string[];
    changeType: 'create' | 'update' | 'delete';
    maxChars: number;
    lineBounded: boolean;
    resourcesAdded?: string[];
    resourcesModified?: string[];
    resourcesDeleted?: string[];
    changeTypes?: string[];
  };

  // CODEOWNERS artifacts
  ownershipChanges?: {
    excerpt: string;
    pathsChanged: string[];
    ownersAdded: string[];
    ownersRemoved: string[];
    maxChars: number;
    lineBounded: boolean;
    pathsAdded?: string[];
    pathsRemoved?: string[];
  };
}

/**
 * Target documentation evidence with deterministic claims
 */
export interface TargetEvidence {
  docSystem: 'confluence' | 'notion' | 'github_readme' | 'github_swagger' | 'backstage' | 'github_code_comments' | 'gitbook';
  docId: string;
  docTitle: string;
  docUrl?: string;
  surface: TargetSurface;
  claims: DocClaim[];
  baseline?: string;
}

export type TargetSurface = 
  | 'runbook'
  | 'api_contract' 
  | 'service_catalog'
  | 'developer_doc'
  | 'code_doc'
  | 'knowledge_base';

/**
 * Deterministic document claims extracted without LLM
 */
export interface DocClaim {
  claimType: 'instruction_block' | 'process_step' | 'owner_block' | 'tool_reference' | 'api_endpoint' | 'coverage_gap';
  label: string;
  snippet: string;
  location: {
    startLine: number;
    endLine: number;
    section?: string;
  };
  confidence: number;
  extractionMethod: 'token_pattern' | 'yaml_parse' | 'markdown_structure' | 'code_comment' | 'pattern_match';
}

/**
 * Impact assessment with deterministic scoring
 */
export interface Assessment {
  impactScore: number; // 0-1 scale
  impactBand: 'low' | 'medium' | 'high' | 'critical';
  firedRules: string[];
  consequenceText: string;
  blastRadius: {
    services: string[];
    teams: string[];
    systems: string[];
  };
  riskFactors?: string[];

  /** Structured representation of drift deltas used for this assessment */
  typedDeltas?: TypedDelta[];
}

/**
 * Complete evidence bundle - single immutable artifact
 */
export interface EvidenceBundle {
  bundleId: string;
  workspaceId: string;
  driftCandidateId: string;
  createdAt: string;

  // Source evidence
  sourceEvidence: SourceEvidence;

  // Target evidence
  targetEvidence: TargetEvidence;

  // Impact assessment
  assessment: Assessment;

  // Drift classification (Gap #2)
  driftType?: string; // 'instruction', 'process', 'ownership', 'environment'
  hasCoverageGap?: boolean; // Gap #2: Coverage as orthogonal dimension

  // Fingerprints for suppression
  fingerprints: {
    strict: string;
    medium: string;
    broad: string;
  };

  // Metadata
  version: string;
  schemaVersion: string;
}

/**
 * Result type for evidence bundle creation
 */
export interface EvidenceBundleResult {
  success: boolean;
  bundle?: EvidenceBundle;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Input parameters for building evidence bundle
 */
export interface BuildEvidenceBundleArgs {
  driftCandidate: any; // Current DriftCandidate record
  signalEvent: any;    // SignalEvent record
  docContext: any;     // Fetched documentation context
  parserArtifacts?: {  // Optional parsed data
    openApiDiff?: any;
    codeownersDiff?: any;
    iacSummary?: any;
    pagerdutyNormalized?: any;
    slackCluster?: any;
    alertNormalized?: any;
  };
}
