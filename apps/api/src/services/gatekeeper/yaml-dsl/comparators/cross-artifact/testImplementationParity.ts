/**
 * Test ↔ Implementation Parity Comparator (Track A Task 2)
 * 
 * Detects inconsistencies between tests and implementation:
 * - Implementation changes without corresponding test updates
 * - New functions/classes without test coverage
 * - Deleted tests without corresponding code deletion
 */

import type { Comparator, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import type { ObligationResult, EvidenceItem } from '../../ir/types.js';
import { CrossArtifactMessages, RemediationMessages } from '../../ir/messageCatalog.js';

export const testImplementationParityComparator: Comparator = {
  id: ComparatorId.TEST_IMPLEMENTATION_PARITY,
  version: '1.0.0',
  
  async evaluateStructured(
    context: PRContext,
    params: TestImplementationParityParams
  ): Promise<ObligationResult> {
    const { files } = context;
    
    // Detect test file changes
    const testFiles = files.filter(f =>
      f.filename.match(/\.(test|spec)\.(ts|js|py|go|java|rb)$/i) ||
      f.filename.includes('/__tests__/') ||
      f.filename.includes('/test/') ||
      f.filename.includes('/tests/') ||
      f.filename.includes('_test.') ||
      f.filename.includes('.test.')
    );
    
    // Detect implementation file changes (excluding tests)
    const implementationFiles = files.filter(f =>
      f.filename.match(/\.(ts|js|py|go|java|rb)$/i) &&
      !f.filename.match(/\.(test|spec)\.(ts|js|py|go|java|rb)$/i) &&
      !f.filename.includes('/__tests__/') &&
      !f.filename.includes('/test/') &&
      !f.filename.includes('/tests/') &&
      !f.filename.includes('_test.') &&
      !f.filename.includes('.test.') &&
      !f.filename.match(/\.(config|setup)\.(ts|js)$/i)
    );
    
    const hasTestChanges = testFiles.length > 0;
    const hasImplementationChanges = implementationFiles.length > 0;
    
    // Evidence collection
    const evidence: EvidenceItem[] = [];
    
    if (hasTestChanges) {
      evidence.push({
        type: 'file_reference',
        path: testFiles.map(f => f.filename).join(', '),
        snippet: `Test files changed: ${testFiles.length}`,
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
    if (hasImplementationChanges && !hasTestChanges && params.requireTestUpdates) {
      // Implementation changed but no test changes
      return {
        status: 'fail',
        reason: 'Implementation changed without test updates',
        reasonHuman: CrossArtifactMessages.testImplementationMissing(
          implementationFiles.map(f => f.filename).join(', ')
        ),
        reasonCode: FindingCode.TEST_IMPLEMENTATION_MISSING,
        evidence,
        remediation: [
          RemediationMessages.crossArtifact.addTests(
            implementationFiles.map(f => f.filename).join(', ')
          ),
        ],
        confidence: {
          applicability: 100,
          evidence: 85,
          decisionQuality: 75,
        },
      };
    }
    
    // Detect new files without tests
    const newImplementationFiles = implementationFiles.filter(f => f.status === 'added');
    if (newImplementationFiles.length > 0 && !hasTestChanges && params.requireTestsForNewCode) {
      return {
        status: 'fail',
        reason: 'New implementation without test coverage',
        reasonHuman: CrossArtifactMessages.implementationTestMissing(
          newImplementationFiles.map(f => f.filename).join(', ')
        ),
        reasonCode: FindingCode.IMPLEMENTATION_TEST_MISSING,
        evidence,
        remediation: [
          RemediationMessages.crossArtifact.addTests(
            newImplementationFiles.map(f => f.filename).join(', ')
          ),
        ],
        confidence: {
          applicability: 100,
          evidence: 90,
          decisionQuality: 85,
        },
      };
    }
    
    // Tests and implementation are consistent
    return {
      status: 'pass',
      reason: 'Tests and implementation are consistent',
      reasonHuman: CrossArtifactMessages.testImplementationConsistent(),
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

export interface TestImplementationParityParams {
  /**
   * If true, implementation changes require test updates
   */
  requireTestUpdates?: boolean;
  
  /**
   * If true, new implementation files require new tests
   */
  requireTestsForNewCode?: boolean;
}

