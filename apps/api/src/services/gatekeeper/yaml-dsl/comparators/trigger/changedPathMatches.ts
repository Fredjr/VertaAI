/**
 * CHANGED_PATH_MATCHES Comparator
 * Migration Plan v5.0 - Sprint 1, Task 1.3
 *
 * Checks if any changed file matches the specified glob patterns
 *
 * Phase 4: Migrated to structured IR output
 * - evaluateStructured(): Returns ObligationResult (NEW)
 * - evaluate(): Returns ComparatorResult (LEGACY, kept for backward compatibility)
 */

import { minimatch } from 'minimatch';
import type { Comparator, ComparatorResult, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import type { ObligationResult } from '../../ir/types.js';
import {
  createObligation,
  presentFileEvidence,
  missingFileEvidence,
} from '../../ir/obligationDSL.js';

export const changedPathMatchesComparator: Comparator = {
  id: ComparatorId.CHANGED_PATH_MATCHES,
  version: '2.0.0', // Phase 4: Bumped to 2.0.0 (structured IR support)

  /**
   * NEW: Structured evaluation (Phase 4)
   * Returns fully structured ObligationResult
   */
  async evaluateStructured(context: PRContext, params: any): Promise<ObligationResult> {
    const { patterns, title, controlObjective, decisionOnFail = 'pass' } = params;

    // Create obligation builder
    const obligation = createObligation({
      id: 'changed-path-matches',
      title: title || 'Changed Path Matches',
      controlObjective: controlObjective || 'Detect if changed files match specified patterns',
      scope: 'diff_derived',
      decisionOnFail: decisionOnFail as 'block' | 'warn' | 'pass',
    });

    if (!patterns || patterns.length === 0) {
      return obligation.notEvaluable(
        'No patterns specified',
        'policy_misconfig'
      );
    }

    const matchedFiles: Array<{ file: string; pattern: string }> = [];

    // Check each changed file against patterns
    for (const file of context.files) {
      for (const pattern of patterns) {
        if (minimatch(file.filename, pattern)) {
          matchedFiles.push({
            file: file.filename,
            pattern,
          });
          break; // Only count each file once
        }
      }
    }

    // Files matched - PASS (this is a positive detection)
    if (matchedFiles.length > 0) {
      return obligation.pass(
        `Found ${matchedFiles.length} file(s) matching patterns`
      );
    }

    // No files matched - INFO (not a failure, just informational)
    return obligation.info(
      `No files matched patterns: ${patterns.join(', ')}`
    );
  },

  /**
   * LEGACY: Unstructured evaluation (backward compatibility)
   * Kept for existing integrations
   */
  async evaluate(context: PRContext, params: any): Promise<ComparatorResult> {
    const { patterns } = params;

    if (!patterns || patterns.length === 0) {
      return {
        comparatorId: this.id,
        status: 'unknown',
        evidence: [],
        reasonCode: FindingCode.NOT_EVALUABLE,
        message: 'No patterns specified',
      };
    }

    const matchedFiles: string[] = [];

    for (const file of context.files) {
      for (const pattern of patterns) {
        if (minimatch(file.filename, pattern, { dot: true })) {
          matchedFiles.push(file.filename);
          break; // Only count each file once
        }
      }
    }

    if (matchedFiles.length > 0) {
      return {
        comparatorId: this.id,
        status: 'pass',
        evidence: matchedFiles.slice(0, 5).map(path => ({
          type: 'file',
          path,
        })),
        reasonCode: FindingCode.PATH_MATCHED,
        message: `Matched ${matchedFiles.length} file(s)`,
      };
    }

    return {
      comparatorId: this.id,
      status: 'fail',
      evidence: [],
      reasonCode: FindingCode.PASS,
      message: 'No files matched the specified patterns',
    };
  },
};

