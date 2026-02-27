/**
 * ObligationResult Builder
 * 
 * Maps existing NormalizedFinding to the new structured ObligationResult format.
 * This is ADDITIVE - preserves all existing data while adding new structured fields.
 * 
 * Key principles:
 * - Preserve all existing finding data
 * - Add structured evidence, remediation, and risk
 * - Map to canonical reason codes
 * - Backward compatible
 */

import type { ObligationResult, ReasonCode, EvidenceItem, RiskScore } from './types.js';
import type { NormalizedFinding } from '../types.js';
import { ReasonCode as RC } from './types.js';

/**
 * Build ObligationResult from NormalizedFinding
 * 
 * @param finding - Existing normalized finding
 * @returns Structured ObligationResult
 */
export function buildObligationResult(finding: NormalizedFinding): ObligationResult {
  // Map to canonical reason code
  const reasonCode = mapToReasonCode(finding);

  // Build structured evidence
  const evidence = buildEvidence(finding);

  // Build structured remediation
  const remediation = buildRemediation(finding);

  // Build structured risk score
  const risk = buildRiskScore(finding);

  // Build confidence (applicability vs evidence)
  const confidence = buildConfidence(finding);

  return {
    // Identity
    id: finding.id,
    title: finding.obligation.description,
    controlObjective: finding.obligation.description, // Could be enhanced with more context
    
    // Scope
    scope: mapToScope(finding.obligation.kind),
    
    // Decision
    decisionOnFail: finding.obligation.result === 'FAIL' ? 'block' : 'warn',
    status: finding.obligation.result,
    
    // Reason (structured)
    reasonCode,
    reasonHuman: finding.why || 'No reason provided',
    
    // Evidence (typed)
    evidence,
    evidenceSearch: finding.evidenceLocationsSearched ? {
      locationsSearched: finding.evidenceLocationsSearched,
      patternsUsed: [], // Not available in current structure
      closestMatches: [], // Not available in current structure
    } : undefined,
    
    // Remediation (structured)
    remediation,
    
    // Risk (structured breakdown)
    risk,
    
    // Confidence (per obligation)
    confidence,
  };
}

/**
 * Map finding to canonical reason code
 */
function mapToReasonCode(finding: NormalizedFinding): ReasonCode {
  const why = finding.why?.toLowerCase() || '';
  const description = finding.obligation.description.toLowerCase();

  // File-based
  if (why.includes('missing') && (why.includes('file') || description.includes('file'))) {
    return RC.FILE_MISSING;
  }
  if (why.includes('invalid') && (why.includes('file') || description.includes('file'))) {
    return RC.FILE_INVALID;
  }
  if (why.includes('outdated') && (why.includes('file') || description.includes('file'))) {
    return RC.FILE_OUTDATED;
  }

  // Content-based
  if (why.includes('missing') && !why.includes('file')) {
    return RC.CONTENT_MISSING;
  }
  if (why.includes('invalid') && !why.includes('file')) {
    return RC.CONTENT_INVALID;
  }
  if (why.includes('incomplete')) {
    return RC.CONTENT_INCOMPLETE;
  }

  // Parity-based
  if (why.includes('parity') || why.includes('mismatch')) {
    return RC.PARITY_VIOLATION;
  }
  if (why.includes('breaking')) {
    return RC.BREAKING_CHANGE;
  }

  // Approval-based
  if (why.includes('approval') && why.includes('missing')) {
    return RC.APPROVAL_MISSING;
  }
  if (why.includes('approval') && why.includes('insufficient')) {
    return RC.APPROVAL_INSUFFICIENT;
  }

  // Check-based
  if (why.includes('check') && why.includes('failed')) {
    return RC.CHECK_FAILED;
  }
  if (why.includes('check') && why.includes('missing')) {
    return RC.CHECK_MISSING;
  }

  // Artifact-based
  if (why.includes('artifact') && why.includes('missing')) {
    return RC.ARTIFACT_MISSING;
  }
  if (why.includes('artifact') && why.includes('outdated')) {
    return RC.ARTIFACT_OUTDATED;
  }

  // Default
  return RC.UNKNOWN;
}

/**
 * Build structured evidence from finding
 */
function buildEvidence(finding: NormalizedFinding): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];

  // Add evidence from obligation evidence array
  if (finding.obligation.evidence) {
    for (const ev of finding.obligation.evidence) {
      evidence.push({
        type: ev.type === 'file_content' ? 'content' : 'file',
        location: ev.location,
        found: ev.found,
        details: ev.snippet,
        metadata: ev.metadata,
      });
    }
  }

  // Add evidence from locations searched
  if (finding.evidenceLocationsSearched) {
    for (const location of finding.evidenceLocationsSearched) {
      // Only add if not already in evidence
      if (!evidence.some(e => e.location === location)) {
        evidence.push({
          type: 'file',
          location,
          found: false,
          details: 'Location searched but not found',
        });
      }
    }
  }

  return evidence;
}

/**
 * Build structured remediation from finding
 */
function buildRemediation(finding: NormalizedFinding): ObligationResult['remediation'] {
  return {
    minimumToPass: finding.howToFix?.steps || [],
    patch: finding.howToFix?.patch,
    links: finding.howToFix?.links,
    owner: finding.howToFix?.owner ? {
      team: finding.howToFix.owner.team,
      contact: finding.howToFix.owner.contact,
    } : undefined,
  };
}

/**
 * Build structured risk score from finding
 * Uses existing risk score and breaks it down into components
 */
function buildRiskScore(finding: NormalizedFinding): RiskScore {
  const total = finding.risk?.score || 50; // Default to medium risk

  // Break down total into components (proportional distribution)
  // This is a heuristic - ideally each comparator would provide this breakdown
  const blastRadius = Math.round(total * 0.3); // 30% weight
  const criticality = Math.round(total * 0.3); // 30% weight
  const immediacy = Math.round(total * 0.2); // 20% weight
  const dependency = Math.round(total * 0.2); // 20% weight

  return {
    total,
    breakdown: {
      blastRadius: Math.min(30, blastRadius),
      criticality: Math.min(30, criticality),
      immediacy: Math.min(20, immediacy),
      dependency: Math.min(20, dependency),
    },
    reasons: {
      blastRadius: finding.risk?.blastRadiusReason || 'Impact scope not specified',
      criticality: finding.risk?.criticalityReason || 'Criticality not specified',
      immediacy: finding.risk?.immediacyReason || 'Urgency not specified',
      dependency: finding.risk?.dependencyReason || 'Dependency impact not specified',
    },
  };
}

/**
 * Build confidence breakdown for this obligation
 * Separates applicability confidence from evidence confidence
 */
function buildConfidence(finding: NormalizedFinding): ObligationResult['confidence'] {
  // Applicability confidence (should this obligation run?)
  const applicability = finding.obligation.applicability?.confidence || 1.0;

  // Evidence confidence (did we find what we looked for?)
  // High confidence if we have evidence, lower if we're missing evidence
  const hasEvidence = finding.obligation.evidence && finding.obligation.evidence.length > 0;
  const allEvidenceFound = finding.obligation.evidence?.every(e => e.found) ?? false;

  let evidenceConfidence = 1.0;
  if (!hasEvidence) {
    evidenceConfidence = 0.5; // Low confidence if no evidence at all
  } else if (!allEvidenceFound) {
    evidenceConfidence = 0.7; // Medium confidence if some evidence missing
  }

  // Overall confidence is the minimum of the two
  // (we're only as confident as our weakest link)
  const overall = Math.min(applicability, evidenceConfidence);

  return {
    applicability,
    evidence: evidenceConfidence,
    overall,
  };
}

/**
 * Map obligation kind to scope
 */
function mapToScope(kind: string): ObligationResult['scope'] {
  const kindLower = kind.toLowerCase();

  if (kindLower.includes('diff') || kindLower.includes('change')) {
    return 'diff_derived';
  }

  if (kindLower.includes('environment') || kindLower.includes('gate')) {
    return 'environment_gate';
  }

  // Default to repo_invariant
  return 'repo_invariant';
}

