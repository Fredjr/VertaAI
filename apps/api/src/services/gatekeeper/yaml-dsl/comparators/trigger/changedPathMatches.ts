/**
 * CHANGED_PATH_MATCHES Comparator
 * Migration Plan v5.0 - Sprint 1, Task 1.3
 * 
 * Checks if any changed file matches the specified glob patterns
 */

import { minimatch } from 'minimatch';
import type { Comparator, ComparatorResult, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';

export const changedPathMatchesComparator: Comparator = {
  id: ComparatorId.CHANGED_PATH_MATCHES,
  version: '1.0.0',

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

