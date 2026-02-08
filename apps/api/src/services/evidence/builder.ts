// Evidence Bundle Builder
// Main function to create deterministic evidence bundles
// Integrates with existing VertaAI state machine and data structures

import { 
  EvidenceBundle, 
  EvidenceBundleResult, 
  BuildEvidenceBundleArgs,
  SourceEvidence,
  TargetEvidence,
  Assessment,
  DocClaim
} from './types.js';
import { buildSourceEvidence } from './sourceBuilders.js';
import { extractDocClaims } from './docClaimExtractor.js';
import { computeImpactAssessment } from './impactAssessment.js';
import { generateFingerprints } from './fingerprints.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Main function to build complete evidence bundle
 * Integrates with existing DriftCandidate and SignalEvent data
 */
export async function buildEvidenceBundle(args: BuildEvidenceBundleArgs): Promise<EvidenceBundleResult> {
  try {
    const { driftCandidate, signalEvent, docContext, parserArtifacts } = args;
    
    // Validate required inputs
    if (!driftCandidate || !signalEvent || !docContext) {
      return {
        success: false,
        error: {
          code: 'MISSING_REQUIRED_DATA',
          message: 'Missing required driftCandidate, signalEvent, or docContext',
          details: { driftCandidate: !!driftCandidate, signalEvent: !!signalEvent, docContext: !!docContext }
        }
      };
    }

    // Step 1: Build source evidence from SignalEvent
    const sourceEvidence = await buildSourceEvidence({
      signalEvent,
      parserArtifacts
    });

    // Step 2: Extract deterministic doc claims from docContext
    const docClaims = await extractDocClaims({
      docContext,
      driftType: driftCandidate.driftType,
      docSystem: getDocSystemFromContext(docContext)
    });

    // Step 3: Build target evidence
    const targetEvidence: TargetEvidence = {
      docSystem: getDocSystemFromContext(docContext),
      docId: docContext.docId || 'unknown',
      docTitle: docContext.title || 'Unknown Document',
      docUrl: docContext.url,
      surface: determineTargetSurface(docContext, driftCandidate.driftType),
      claims: docClaims,
      baseline: docContext.baseline
    };

    // Step 4: Compute impact assessment
    const assessment = await computeImpactAssessment({
      sourceEvidence,
      targetEvidence,
      driftCandidate
    });

    // Step 5: Generate fingerprints for suppression
    const fingerprints = generateFingerprints({
      sourceEvidence,
      targetEvidence,
      driftType: driftCandidate.driftType
    });

    // Step 6: Create complete evidence bundle
    const bundle: EvidenceBundle = {
      bundleId: uuidv4(),
      workspaceId: driftCandidate.workspaceId,
      driftCandidateId: driftCandidate.id,
      createdAt: new Date().toISOString(),
      sourceEvidence,
      targetEvidence,
      assessment,
      fingerprints,
      version: '1.0.0',
      schemaVersion: '1.0.0'
    };

    return {
      success: true,
      bundle
    };

  } catch (error: any) {
    console.error('[EvidenceBundle] Error building evidence bundle:', error);
    return {
      success: false,
      error: {
        code: 'BUILD_ERROR',
        message: error.message || 'Unknown error building evidence bundle',
        details: error
      }
    };
  }
}

/**
 * Determine doc system from docContext
 */
function getDocSystemFromContext(docContext: any): TargetEvidence['docSystem'] {
  // Check existing docSystem field first
  if (docContext.docSystem) {
    return docContext.docSystem;
  }
  
  // Infer from URL or other context clues
  const url = docContext.url || '';
  if (url.includes('confluence')) return 'confluence';
  if (url.includes('notion')) return 'notion';
  if (url.includes('github') && url.includes('README')) return 'github_readme';
  if (url.includes('github') && url.includes('swagger')) return 'github_swagger';
  if (url.includes('backstage')) return 'backstage';
  if (url.includes('gitbook')) return 'gitbook';
  
  // Default fallback
  return 'confluence';
}

/**
 * Determine target surface based on doc context and drift type
 */
function determineTargetSurface(docContext: any, driftType: string): TargetEvidence['surface'] {
  // Use existing logic or infer from content
  const title = (docContext.title || '').toLowerCase();
  const content = (docContext.content || '').toLowerCase();
  
  // API documentation
  if (title.includes('api') || content.includes('endpoint') || content.includes('swagger')) {
    return 'api_contract';
  }
  
  // Runbooks and operational docs
  if (title.includes('runbook') || title.includes('incident') || content.includes('troubleshoot')) {
    return 'runbook';
  }
  
  // Service catalog
  if (title.includes('service') && (title.includes('catalog') || title.includes('registry'))) {
    return 'service_catalog';
  }
  
  // Code documentation
  if (docContext.docSystem === 'github_code_comments') {
    return 'code_doc';
  }
  
  // Developer documentation
  if (title.includes('developer') || title.includes('dev') || content.includes('getting started')) {
    return 'developer_doc';
  }
  
  // Default to knowledge base
  return 'knowledge_base';
}

/**
 * Validate evidence bundle structure
 */
export function validateEvidenceBundle(bundle: EvidenceBundle): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!bundle.bundleId) errors.push('Missing bundleId');
  if (!bundle.workspaceId) errors.push('Missing workspaceId');
  if (!bundle.driftCandidateId) errors.push('Missing driftCandidateId');
  if (!bundle.sourceEvidence) errors.push('Missing sourceEvidence');
  if (!bundle.targetEvidence) errors.push('Missing targetEvidence');
  if (!bundle.assessment) errors.push('Missing assessment');
  if (!bundle.fingerprints) errors.push('Missing fingerprints');
  
  return {
    valid: errors.length === 0,
    errors
  };
}
