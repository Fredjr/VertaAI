/**
 * Documentation ↔ Code Parity Comparator (Track A Task 2)
 * 
 * Detects inconsistencies between documentation and code:
 * - Code changes in documented areas without README/doc updates
 * - API endpoint changes without API documentation updates
 * - Configuration changes without documentation updates
 */

import type { Comparator, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import type { ObligationResult, EvidenceItem } from '../../ir/types.js';
import { CrossArtifactMessages, RemediationMessages } from '../../ir/messageCatalog.js';

export const docCodeParityComparator: Comparator = {
  id: ComparatorId.DOC_CODE_PARITY,
  version: '1.0.0',
  
  async evaluateStructured(
    context: PRContext,
    params: DocCodeParityParams
  ): Promise<ObligationResult> {
    const { files } = context;
    
    // Detect documentation file changes
    const docFiles = files.filter(f =>
      f.filename.match(/\.(md|mdx|rst|txt)$/i) ||
      f.filename.match(/README/i) ||
      f.filename.match(/CHANGELOG/i) ||
      f.filename.includes('/docs/') ||
      f.filename.includes('/documentation/')
    );
    
    // Detect code changes in areas that typically need documentation
    const documentedCodeFiles = files.filter(f =>
      (f.filename.match(/\.(ts|js|py|go|java|rb)$/i) &&
       (f.filename.includes('/api/') ||
        f.filename.includes('/routes/') ||
        f.filename.includes('/handlers/') ||
        f.filename.includes('/config/') ||
        f.filename.includes('/lib/') ||
        f.filename.includes('/src/'))) ||
      f.filename.match(/\.(yaml|yml|json)$/i) && 
       (f.filename.includes('config') ||
        f.filename.includes('openapi') ||
        f.filename.includes('swagger'))
    );
    
    const hasDocChanges = docFiles.length > 0;
    const hasCodeChanges = documentedCodeFiles.length > 0;
    
    // Evidence collection
    const evidence: EvidenceItem[] = [];
    
    if (hasDocChanges) {
      evidence.push({
        type: 'file_reference',
        path: docFiles.map(f => f.filename).join(', '),
        snippet: `Documentation files changed: ${docFiles.length}`,
        confidence: 100,
      });
    }
    
    if (hasCodeChanges) {
      evidence.push({
        type: 'file_reference',
        path: documentedCodeFiles.map(f => f.filename).join(', '),
        snippet: `Code files changed: ${documentedCodeFiles.length}`,
        confidence: 100,
      });
    }
    
    // Check for mismatches
    if (hasCodeChanges && !hasDocChanges && params.requireDocUpdates) {
      // Code changed but no documentation updates
      return {
        status: 'fail',
        reason: 'Code changed in documented areas without documentation updates',
        reasonHuman: CrossArtifactMessages.docCodeMismatch(
          documentedCodeFiles.map(f => f.filename).join(', ')
        ),
        reasonCode: FindingCode.DOC_CODE_MISMATCH,
        evidence,
        remediation: [
          RemediationMessages.crossArtifact.updateDocumentation(
            documentedCodeFiles.map(f => f.filename).join(', ')
          ),
        ],
        confidence: {
          applicability: 100,
          evidence: 70,
          decisionQuality: 65,
        },
      };
    }
    
    // Documentation and code are consistent
    return {
      status: 'pass',
      reason: 'Documentation and code are consistent',
      reasonHuman: CrossArtifactMessages.docCodeConsistent(),
      reasonCode: FindingCode.PASS,
      evidence,
      confidence: {
        applicability: 100,
        evidence: 100,
        decisionQuality: 100,
      },
    };
  },
};

export interface DocCodeParityParams {
  /**
   * If true, code changes in documented areas require documentation updates
   */
  requireDocUpdates?: boolean;
}

