/**
 * Finding Adapter
 * 
 * Adapts DeltaSyncFinding (from Agent PR Gatekeeper) to IntegrityFinding
 * (from Contract Validation) to enable unified GitHub Check display.
 * 
 * This is part of Week 3-4 Task 2: Unify Finding Model
 */

import { v4 as uuidv4 } from 'uuid';
import type { DeltaSyncFinding } from '../gatekeeper/deltaSync.js';
import type { IntegrityFinding, Severity, Band, RecommendedAction } from '../contracts/types.js';

/**
 * Context required to adapt a DeltaSyncFinding to IntegrityFinding
 */
export interface AdapterContext {
  workspaceId: string;
  signalEventId: string;
}

/**
 * Adapt a DeltaSyncFinding to IntegrityFinding
 * 
 * Maps the simpler DeltaSyncFinding structure to the richer IntegrityFinding structure.
 * 
 * @param finding - The DeltaSyncFinding to adapt
 * @param context - Context information (workspaceId, signalEventId)
 * @returns IntegrityFinding compatible with Contract Validation system
 */
export function adaptDeltaSyncFinding(
  finding: DeltaSyncFinding,
  context: AdapterContext
): IntegrityFinding {
  return {
    // Core identity
    workspaceId: context.workspaceId,
    id: uuidv4(),

    // Source: DeltaSync findings are treated as contract comparator findings
    source: 'contract_comparator',

    // Contract context: DeltaSync findings don't have contract/invariant IDs
    // These are optional in the unified model
    contractId: undefined,
    invariantId: undefined,

    // Classification
    driftType: mapDriftType(finding.type),
    domains: extractDomains(finding.type),
    severity: finding.severity,

    // Evidence: DeltaSync has simple string evidence, wrap it in structured format
    compared: undefined, // DeltaSync doesn't compare artifacts
    evidence: [
      {
        kind: finding.type,
        leftValue: finding.evidence,
        rightValue: null,
        leftSnippet: finding.description,
        rightSnippet: undefined,
        pointers: undefined,
      },
    ],
    confidence: 1.0, // DeltaSync findings are deterministic (no LLM)
    impact: severityToImpact(finding.severity),

    // Routing
    band: severityToBand(finding.severity),
    recommendedAction: severityToRecommendedAction(finding.severity),
    ownerRouting: {
      method: 'fallback',
      owners: [],
    },

    // Links
    driftCandidateId: undefined,
    affectedFiles: finding.affectedFiles,
    suggestedDocs: finding.suggestedDocs,

    createdAt: new Date(),
  };
}

/**
 * Map DeltaSyncFinding type to DriftType
 */
function mapDriftType(type: DeltaSyncFinding['type']): string {
  switch (type) {
    case 'iac_drift':
      return 'environment_tooling';
    case 'api_drift':
      return 'instruction';
    case 'ownership_drift':
      return 'ownership';
    default:
      return 'instruction';
  }
}

/**
 * Extract domains from DeltaSyncFinding type
 */
function extractDomains(type: DeltaSyncFinding['type']): string[] {
  switch (type) {
    case 'iac_drift':
      return ['infrastructure', 'deployment'];
    case 'api_drift':
      return ['api', 'docs'];
    case 'ownership_drift':
      return ['ownership', 'team'];
    default:
      return [];
  }
}

/**
 * Convert severity to impact score (0-1)
 */
function severityToImpact(severity: Severity): number {
  switch (severity) {
    case 'critical':
      return 1.0;
    case 'high':
      return 0.8;
    case 'medium':
      return 0.5;
    case 'low':
      return 0.2;
    default:
      return 0.5;
  }
}

/**
 * Convert severity to band
 */
function severityToBand(severity: Severity): Band {
  switch (severity) {
    case 'critical':
      return 'fail';
    case 'high':
      return 'fail';
    case 'medium':
      return 'warn';
    case 'low':
      return 'warn';
    default:
      return 'warn';
  }
}

/**
 * Convert severity to recommended action
 */
function severityToRecommendedAction(severity: Severity): RecommendedAction {
  switch (severity) {
    case 'critical':
      return 'block_merge';
    case 'high':
      return 'create_patch_candidate';
    case 'medium':
      return 'notify';
    case 'low':
      return 'notify';
    default:
      return 'notify';
  }
}

