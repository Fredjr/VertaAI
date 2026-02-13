/**
 * Evidence Contract - LLM-Facing Evidence Interface
 * 
 * This is the minimal, versioned contract that LLM agents receive.
 * It's a stable, bounded subset of the full EvidenceBundle optimized for:
 * - Token efficiency
 * - Semantic clarity
 * - Deterministic grounding
 * 
 * Phase 2: Wire EvidenceBundle to LLM agents via this contract
 */

import type { EvidenceBundle, TypedDelta } from './types.js';

/**
 * LLM-facing evidence contract (v1.0)
 * This is what patch-planner and patch-generator receive
 */
export interface EvidenceContract {
  version: '1.0';
  
  signal: {
    sourceType: string;
    workspaceId: string;
    triggeringEvent: string;
    timestamp: string;
  };

  typedDeltas: TypedDelta[];

  docContext: {
    system: string;
    url?: string;
    title: string;
    relevantSections?: string[];
  };

  assessment: {
    impactBand: 'low' | 'medium' | 'high' | 'critical';
    riskFactors: string[];
    blastRadius: {
      services: string[];
      teams: string[];
      systems: string[];
    };
  };
}

/**
 * Configuration for evidence contract mapping
 */
export interface EvidenceContractConfig {
  maxTypedDeltas?: number;
  maxRiskFactors?: number;
  maxBlastRadiusItems?: number;
}

const DEFAULT_CONFIG: Required<EvidenceContractConfig> = {
  maxTypedDeltas: 50,
  maxRiskFactors: 10,
  maxBlastRadiusItems: 20,
};

/**
 * Map EvidenceBundle to LLM-facing EvidenceContract
 * 
 * This is a pure function that:
 * - Extracts only the fields needed by LLM agents
 * - Truncates large arrays to stay within token limits
 * - Produces a stable, versioned contract
 * 
 * @param bundle - Full EvidenceBundle from evidence builder
 * @param config - Optional truncation/filtering config
 * @returns EvidenceContract - Minimal LLM-facing contract
 */
export function mapEvidenceBundleToContract(
  bundle: EvidenceBundle,
  config?: EvidenceContractConfig
): EvidenceContract {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Extract typed deltas from assessment (Phase 1 wiring)
  const typedDeltas = bundle.assessment.typedDeltas || [];
  
  // Truncate typed deltas if needed, prioritizing high-confidence deltas
  const sortedDeltas = [...typedDeltas].sort((a, b) => b.confidence - a.confidence);
  const truncatedDeltas = sortedDeltas.slice(0, cfg.maxTypedDeltas);

  // Extract risk factors with truncation
  const riskFactors = (bundle.assessment.riskFactors || []).slice(0, cfg.maxRiskFactors);

  // Extract blast radius with truncation
  const blastRadius = {
    services: (bundle.assessment.blastRadius.services || []).slice(0, cfg.maxBlastRadiusItems),
    teams: (bundle.assessment.blastRadius.teams || []).slice(0, cfg.maxBlastRadiusItems),
    systems: (bundle.assessment.blastRadius.systems || []).slice(0, cfg.maxBlastRadiusItems),
  };

  // Build contract
  const contract: EvidenceContract = {
    version: '1.0',
    
    signal: {
      sourceType: bundle.sourceEvidence.sourceType,
      workspaceId: bundle.workspaceId,
      triggeringEvent: bundle.sourceEvidence.sourceId,
      timestamp: bundle.sourceEvidence.timestamp,
    },

    typedDeltas: truncatedDeltas,

    docContext: {
      system: bundle.targetEvidence.docSystem,
      url: bundle.targetEvidence.docUrl,
      title: bundle.targetEvidence.docTitle,
      // Extract section names from doc claims
      relevantSections: extractRelevantSections(bundle),
    },

    assessment: {
      impactBand: bundle.assessment.impactBand,
      riskFactors,
      blastRadius,
    },
  };

  return contract;
}

/**
 * Extract relevant section names from doc claims
 */
function extractRelevantSections(bundle: EvidenceBundle): string[] {
  const sections = new Set<string>();
  
  for (const claim of bundle.targetEvidence.claims || []) {
    if (claim.location.section) {
      sections.add(claim.location.section);
    }
  }

  // Return up to 10 unique sections
  return Array.from(sections).slice(0, 10);
}

/**
 * Validate evidence contract structure
 */
export function validateEvidenceContract(contract: EvidenceContract): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (contract.version !== '1.0') {
    errors.push(`Unsupported version: ${contract.version}`);
  }

  if (!contract.signal?.sourceType) {
    errors.push('Missing signal.sourceType');
  }

  if (!Array.isArray(contract.typedDeltas)) {
    errors.push('typedDeltas must be an array');
  }

  if (!contract.docContext?.system) {
    errors.push('Missing docContext.system');
  }

  if (!contract.assessment?.impactBand) {
    errors.push('Missing assessment.impactBand');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

