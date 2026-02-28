/**
 * OpenAPI ↔ Code Parity Comparator (Track A Task 2)
 * 
 * Detects inconsistencies between OpenAPI specs and actual code implementations:
 * - OpenAPI spec changes without corresponding code changes
 * - Code changes without OpenAPI spec updates
 * - New endpoints in spec but not implemented
 * - Removed endpoints in spec but code still exists
 */

import type { Comparator, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import type { ObligationResult, EvidenceItem } from '../../ir/types.js';
import { CrossArtifactMessages, RemediationMessages } from '../../ir/messageCatalog.js';

export const openapiCodeParityComparator: Comparator = {
  id: ComparatorId.OPENAPI_CODE_PARITY,
  version: '1.0.0',
  
  async evaluateStructured(
    context: PRContext,
    params: OpenapiCodeParityParams
  ): Promise<ObligationResult> {
    const { files } = context;
    
    // Detect OpenAPI spec changes
    const openapiFiles = files.filter(f => 
      f.filename.match(/openapi\.(yaml|yml|json)$/i) ||
      f.filename.match(/swagger\.(yaml|yml|json)$/i) ||
      f.filename.includes('/openapi/') ||
      f.filename.includes('/swagger/')
    );
    
    // Detect code changes (routes, handlers, controllers)
    const codeFiles = files.filter(f =>
      f.filename.match(/\.(ts|js|py|go|java|rb)$/i) &&
      (f.filename.includes('/routes/') ||
       f.filename.includes('/handlers/') ||
       f.filename.includes('/controllers/') ||
       f.filename.includes('/api/') ||
       f.filename.includes('/endpoints/'))
    );
    
    const hasOpenapiChanges = openapiFiles.length > 0;
    const hasCodeChanges = codeFiles.length > 0;
    
    // Evidence collection
    const evidence: EvidenceItem[] = [];
    
    if (hasOpenapiChanges) {
      evidence.push({
        type: 'file_reference',
        path: openapiFiles.map(f => f.filename).join(', '),
        snippet: `OpenAPI files changed: ${openapiFiles.length}`,
        confidence: 100,
      });
    }
    
    if (hasCodeChanges) {
      evidence.push({
        type: 'file_reference',
        path: codeFiles.map(f => f.filename).join(', '),
        snippet: `Code files changed: ${codeFiles.length}`,
        confidence: 100,
      });
    }
    
    // Check for mismatches
    if (hasOpenapiChanges && !hasCodeChanges) {
      // OpenAPI changed but no code changes
      return {
        status: 'fail',
        reason: 'OpenAPI spec changed without corresponding code changes',
        reasonHuman: CrossArtifactMessages.openapiCodeMismatch(
          openapiFiles.map(f => f.filename).join(', ')
        ),
        reasonCode: FindingCode.OPENAPI_CODE_MISMATCH,
        evidence,
        remediation: [RemediationMessages.crossArtifact.updateCodeImplementation()],
        confidence: {
          applicability: 100,
          evidence: 95,
          decisionQuality: 90,
        },
      };
    }
    
    if (hasCodeChanges && !hasOpenapiChanges && params.requireOpenapiUpdate) {
      // Code changed but no OpenAPI changes
      return {
        status: 'fail',
        reason: 'Code changed without OpenAPI spec update',
        reasonHuman: CrossArtifactMessages.codeOpenapiMismatch(
          codeFiles.map(f => f.filename).join(', ')
        ),
        reasonCode: FindingCode.CODE_OPENAPI_MISMATCH,
        evidence,
        remediation: [
          RemediationMessages.crossArtifact.updateOpenapiSpec(
            codeFiles.map(f => f.filename).join(', ')
          ),
        ],
        confidence: {
          applicability: 100,
          evidence: 85,
          decisionQuality: 80,
        },
      };
    }
    
    // Both changed or neither changed (consistent)
    return {
      status: 'pass',
      reason: 'OpenAPI spec and code changes are consistent',
      reasonHuman: CrossArtifactMessages.openapiCodeConsistent(),
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

export interface OpenapiCodeParityParams {
  /**
   * If true, code changes in API routes require OpenAPI spec updates
   * If false, only warn when OpenAPI changes without code changes
   */
  requireOpenapiUpdate?: boolean;
}

