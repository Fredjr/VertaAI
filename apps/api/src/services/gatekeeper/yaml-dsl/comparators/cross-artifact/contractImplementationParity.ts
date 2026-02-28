/**
 * Contract ↔ Implementation Parity Comparator (Track A Task 2)
 * 
 * Detects inconsistencies between contracts and implementations:
 * - TypeScript interface changes without implementation updates
 * - GraphQL schema changes without resolver updates
 * - Proto file changes without service implementation updates
 */

import type { Comparator, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import type { ObligationResult, EvidenceItem } from '../../ir/types.js';
import { CrossArtifactMessages, RemediationMessages } from '../../ir/messageCatalog.js';

export const contractImplementationParityComparator: Comparator = {
  id: ComparatorId.CONTRACT_IMPLEMENTATION_PARITY,
  version: '1.0.0',
  
  async evaluateStructured(
    context: PRContext,
    params: ContractImplementationParityParams
  ): Promise<ObligationResult> {
    const { files } = context;
    
    // Detect contract file changes
    const contractFiles = files.filter(f =>
      f.filename.match(/\.proto$/i) ||
      f.filename.match(/\.graphql$/i) ||
      f.filename.match(/\.gql$/i) ||
      f.filename.match(/types\.(ts|js)$/i) ||
      f.filename.match(/interfaces\.(ts|js)$/i) ||
      f.filename.includes('/contracts/') ||
      f.filename.includes('/interfaces/') ||
      f.filename.includes('/types/') ||
      f.filename.includes('/schema/')
    );
    
    // Detect implementation file changes
    const implementationFiles = files.filter(f =>
      f.filename.match(/\.(ts|js|py|go|java|rb)$/i) &&
      !contractFiles.some(cf => cf.filename === f.filename) &&
      (f.filename.includes('/resolvers/') ||
       f.filename.includes('/services/') ||
       f.filename.includes('/handlers/') ||
       f.filename.includes('/impl/') ||
       f.filename.includes('/implementations/'))
    );
    
    const hasContractChanges = contractFiles.length > 0;
    const hasImplementationChanges = implementationFiles.length > 0;
    
    // Evidence collection
    const evidence: EvidenceItem[] = [];
    
    if (hasContractChanges) {
      evidence.push({
        type: 'file_reference',
        path: contractFiles.map(f => f.filename).join(', '),
        snippet: `Contract files changed: ${contractFiles.length}`,
        confidence: 100,
      });
    }
    
    if (hasImplementationChanges) {
      evidence.push({
        type: 'file_reference',
        path: implementationFiles.map(f => f.filename).join(', '),
        snippet: `Implementation files changed: ${implementationFiles.length}`,
        confidence: 100,
      });
    }
    
    // Check for mismatches
    if (hasContractChanges && !hasImplementationChanges && params.requireImplementationUpdate) {
      // Contract changed but no implementation changes
      return {
        status: 'fail',
        reason: 'Contract changed without implementation updates',
        reasonHuman: CrossArtifactMessages.contractImplementationMismatch(
          contractFiles.map(f => f.filename).join(', ')
        ),
        reasonCode: FindingCode.CONTRACT_IMPLEMENTATION_MISMATCH,
        evidence,
        remediation: [RemediationMessages.crossArtifact.updateImplementation()],
        confidence: {
          applicability: 100,
          evidence: 85,
          decisionQuality: 80,
        },
      };
    }
    
    if (hasImplementationChanges && !hasContractChanges && params.requireContractUpdate) {
      // Implementation changed but no contract changes
      return {
        status: 'fail',
        reason: 'Implementation changed without contract updates',
        reasonHuman: CrossArtifactMessages.implementationContractMismatch(
          implementationFiles.map(f => f.filename).join(', ')
        ),
        reasonCode: FindingCode.IMPLEMENTATION_CONTRACT_MISMATCH,
        evidence,
        remediation: [RemediationMessages.crossArtifact.updateContract()],
        confidence: {
          applicability: 100,
          evidence: 75,
          decisionQuality: 70,
        },
      };
    }
    
    // Contract and implementation are consistent
    return {
      status: 'pass',
      reason: 'Contract and implementation are consistent',
      reasonHuman: CrossArtifactMessages.contractImplementationConsistent(),
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

export interface ContractImplementationParityParams {
  /**
   * If true, contract changes require implementation updates
   */
  requireImplementationUpdate?: boolean;
  
  /**
   * If true, implementation changes require contract updates
   */
  requireContractUpdate?: boolean;
}

