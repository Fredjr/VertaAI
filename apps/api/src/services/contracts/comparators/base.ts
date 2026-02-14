/**
 * Base Comparator Interface and Abstract Class
 * 
 * Provides the foundation for all comparators in the Contract Integrity system.
 * Comparators are deterministic, fast, and LLM-free.
 * 
 * Design Principles:
 * - Deterministic: Same input always produces same output
 * - Fast: Complete in < 5 seconds
 * - LLM-free: No AI calls, pure comparison logic
 * - Stateless: No side effects, easy to test
 * - Pluggable: Easy to add new comparators
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Invariant,
  ArtifactSnapshot,
  IntegrityFinding,
  ComparatorInput,
  ComparatorResult,
  EvidenceItem,
  Severity,
  Band,
  RecommendedAction,
  DriftType,
} from '../types.js';

// ======================================================================
// INTERFACES
// ======================================================================

/**
 * Base interface that all comparators must implement
 */
export interface IComparator {
  // Metadata
  readonly comparatorType: string;
  readonly supportedArtifactTypes: string[];
  readonly version: string;
  
  // Core comparison method
  compare(input: ComparatorInput): Promise<ComparatorResult>;
  
  // Applicability check
  canCompare(invariant: Invariant, snapshots: ArtifactSnapshot[]): boolean;
}

/**
 * Parameters for creating an IntegrityFinding
 */
export interface CreateFindingParams {
  workspaceId: string;
  contractId: string;
  invariantId: string;
  driftType: DriftType;
  severity: Severity;
  compared: {
    left: { artifact: any; snapshotId: string };
    right: { artifact: any; snapshotId: string };
  };
  evidence: EvidenceItem[];
  context: {
    service?: string;
    repo?: string;
    signalEventId: string;
  };
}

// ======================================================================
// ABSTRACT BASE CLASS
// ======================================================================

/**
 * Abstract base class with common logic for all comparators
 * Uses the Template Method pattern
 */
export abstract class BaseComparator implements IComparator {
  abstract readonly comparatorType: string;
  abstract readonly supportedArtifactTypes: string[];
  readonly version: string = '1.0.0';
  
  /**
   * Template method: Orchestrates the comparison workflow
   */
  async compare(input: ComparatorInput): Promise<ComparatorResult> {
    // 1. Validate input
    this.validateInput(input);
    
    // 2. Check applicability
    if (!this.canCompare(input.invariant, [input.leftSnapshot, input.rightSnapshot])) {
      return this.createSkippedResult(input.invariant.invariantId, 'not_applicable');
    }
    
    // 3. Extract structured data from snapshots
    const leftData = this.extractData(input.leftSnapshot);
    const rightData = this.extractData(input.rightSnapshot);
    
    // 4. Perform comparison (implemented by subclass)
    const findings = await this.performComparison(leftData, rightData, input);
    
    // 5. Calculate coverage
    const coverage = this.calculateCoverage(input, findings);
    
    // 6. Return result
    return {
      invariantId: input.invariant.invariantId,
      evaluated: true,
      findings,
      coverage,
    };
  }
  
  /**
   * Check if this comparator can handle the given invariant and snapshots
   * Must be implemented by subclasses
   */
  abstract canCompare(invariant: Invariant, snapshots: ArtifactSnapshot[]): boolean;
  
  /**
   * Extract structured data from a snapshot
   * Must be implemented by subclasses
   */
  abstract extractData(snapshot: ArtifactSnapshot): any;
  
  /**
   * Perform the actual comparison logic
   * Must be implemented by subclasses
   */
  abstract performComparison(
    left: any,
    right: any,
    input: ComparatorInput
  ): Promise<IntegrityFinding[]>;
  
  // ======================================================================
  // HELPER METHODS (shared by all comparators)
  // ======================================================================
  
  /**
   * Validate that the input is well-formed
   */
  protected validateInput(input: ComparatorInput): void {
    if (!input.invariant) {
      throw new Error('Invariant is required');
    }
    
    if (!input.invariant.enabled) {
      throw new Error('Invariant is disabled');
    }
    
    if (!input.leftSnapshot || !input.rightSnapshot) {
      throw new Error('Both snapshots are required');
    }
    
    if (!input.context?.workspaceId || !input.context?.contractId) {
      throw new Error('Context must include workspaceId and contractId');
    }
  }
  
  /**
   * Create a skipped result when comparison cannot be performed
   */
  protected createSkippedResult(
    invariantId: string,
    reason: 'not_applicable' | 'artifacts_missing' | 'low_confidence' | 'disabled'
  ): ComparatorResult {
    return {
      invariantId,
      evaluated: false,
      skippedReason: reason,
      findings: [],
      coverage: {
        artifactsChecked: [],
        artifactsSkipped: [],
        completeness: 0,
      },
    };
  }

  /**
   * Calculate coverage metrics for the comparison
   */
  protected calculateCoverage(
    input: ComparatorInput,
    findings: IntegrityFinding[]
  ): { artifactsChecked: string[]; artifactsSkipped: string[]; completeness: number } {
    const artifactsChecked = [
      input.leftSnapshot.artifactType,
      input.rightSnapshot.artifactType,
    ];

    const artifactsSkipped: string[] = [];

    // Completeness: 1.0 if both artifacts were checked, 0.5 if only one, 0 if none
    const completeness = artifactsChecked.length / 2;

    return {
      artifactsChecked,
      artifactsSkipped,
      completeness,
    };
  }

  /**
   * Helper to create an IntegrityFinding
   */
  protected createFinding(params: CreateFindingParams): IntegrityFinding {
    const {
      workspaceId,
      contractId,
      invariantId,
      driftType,
      severity,
      compared,
      evidence,
      context,
    } = params;

    // Calculate confidence based on evidence quality
    const confidence = this.calculateConfidence(evidence);

    // Calculate impact based on severity and evidence
    const impact = this.calculateImpact(severity, evidence);

    // Determine band (pass/warn/fail)
    const band = this.determineBand(confidence, impact, severity);

    // Determine recommended action
    const recommendedAction = this.determineRecommendedAction(band, severity);

    // Route to owners
    const ownerRouting = this.routeToOwners(context);

    // Extract domains from evidence
    const domains = this.extractDomains(evidence);

    return {
      workspaceId,
      id: uuidv4(),
      contractId,
      invariantId,
      driftType,
      domains,
      severity,
      compared,
      evidence,
      confidence,
      impact,
      band,
      recommendedAction,
      ownerRouting,
      createdAt: new Date(),
    };
  }

  /**
   * Calculate confidence based on evidence quality
   */
  protected calculateConfidence(evidence: EvidenceItem[]): number {
    if (evidence.length === 0) {
      return 0;
    }

    let confidence = 0;

    for (const item of evidence) {
      // Exact matches: high confidence
      if (item.kind.includes('exact') || item.kind.includes('missing')) {
        confidence += 0.2;
      }
      // Fuzzy matches: medium confidence
      else if (item.kind.includes('fuzzy') || item.kind.includes('mismatch')) {
        confidence += 0.1;
      }
      // Inferred: low confidence
      else if (item.kind.includes('inferred')) {
        confidence += 0.05;
      }
    }

    // Clamp to [0, 1]
    return Math.min(1.0, confidence);
  }

  /**
   * Calculate impact based on severity and evidence
   */
  protected calculateImpact(severity: Severity, evidence: EvidenceItem[]): number {
    // Base impact from severity
    const baseImpact: Record<Severity, number> = {
      critical: 1.0,
      high: 0.8,
      medium: 0.5,
      low: 0.2,
    };

    const base = baseImpact[severity];

    // Adjust for evidence count (more evidence = higher impact)
    const evidenceBoost = Math.min(0.2, evidence.length * 0.05);

    // Adjust for breaking changes
    const hasBreakingChange = evidence.some(e => e.kind.includes('breaking'));
    const breakingBoost = hasBreakingChange ? 0.2 : 0;

    // Clamp to [0, 1]
    return Math.min(1.0, base + evidenceBoost + breakingBoost);
  }

  /**
   * Determine band (pass/warn/fail) based on confidence, impact, and severity
   */
  protected determineBand(confidence: number, impact: number, severity: Severity): Band {
    // fail: high confidence + (critical severity OR high impact)
    if (confidence >= 0.8 && (severity === 'critical' || impact >= 0.8)) {
      return 'fail';
    }

    // warn: medium confidence + (high severity OR medium impact)
    if (confidence >= 0.6 && (severity === 'high' || impact >= 0.5)) {
      return 'warn';
    }

    // pass: otherwise
    return 'pass';
  }

  /**
   * Determine recommended action based on band and severity
   */
  protected determineRecommendedAction(band: Band, severity: Severity): RecommendedAction {
    // block_merge: fail band + critical severity
    if (band === 'fail' && severity === 'critical') {
      return 'block_merge';
    }

    // create_patch_candidate: fail band OR (warn band + high severity)
    if (band === 'fail' || (band === 'warn' && severity === 'high')) {
      return 'create_patch_candidate';
    }

    // notify: warn band + non-high severity
    if (band === 'warn') {
      return 'notify';
    }

    // no_action: pass band
    return 'no_action';
  }

  /**
   * Route to owners based on context
   */
  protected routeToOwners(context: { service?: string; repo?: string }): {
    method: 'contract' | 'codeowners' | 'service_owner' | 'fallback';
    owners: string[];
  } {
    // For now, use simple routing based on service/repo
    // In the future, this could integrate with CODEOWNERS, PagerDuty, etc.

    if (context.service) {
      return {
        method: 'service_owner',
        owners: [context.service],
      };
    }

    if (context.repo) {
      return {
        method: 'codeowners',
        owners: [context.repo],
      };
    }

    return {
      method: 'fallback',
      owners: [],
    };
  }

  /**
   * Extract domains from evidence
   */
  protected extractDomains(evidence: EvidenceItem[]): string[] {
    const domains = new Set<string>();

    for (const item of evidence) {
      // Extract domain from evidence kind
      // e.g., 'endpoint_missing' -> 'endpoint'
      const parts = item.kind.split('_');
      if (parts.length > 0 && parts[0]) {
        domains.add(parts[0]);
      }
    }

    return Array.from(domains);
  }
}

