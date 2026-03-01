/**
 * RUNBOOK_OWNERSHIP_PARITY Comparator
 *
 * Detects drift between service ownership and runbook documentation.
 *
 * INVARIANT: Service ownership must be declared and documented
 *
 * EXAMPLES:
 * - New service → must have runbook + CODEOWNERS + on-call rotation
 * - Service ownership changed → runbook should reflect new team
 * - Critical service → must have incident response runbook
 *
 * DETECTION LOGIC:
 * - Ownership files: CODEOWNERS, .github/CODEOWNERS, docs/OWNERS
 * - Runbook files: docs/runbooks/, runbooks/, *.runbook.md, RUNBOOK.md
 * - Service files: routes/, handlers/, controllers/, api/, services/
 * - Flags mismatch: Service changed but ownership/runbook not updated
 */

import type { PRContext, ComparatorResult, Comparator } from '../types.js';
import { ComparatorId } from '../types.js';

export async function evaluate(
  context: PRContext,
  params: Record<string, any>
): Promise<ComparatorResult> {
  const { files } = context;

  // Detect ownership file changes
  const ownershipFiles = files.filter(f =>
    f.filename === 'CODEOWNERS' ||
    f.filename === '.github/CODEOWNERS' ||
    f.filename === 'docs/OWNERS' ||
    f.filename.endsWith('/CODEOWNERS') ||
    f.filename.includes('OWNERS')
  );

  // Detect runbook changes
  const runbookFiles = files.filter(f =>
    f.filename.includes('/runbooks/') ||
    f.filename.includes('/runbook/') ||
    f.filename.endsWith('.runbook.md') ||
    f.filename === 'RUNBOOK.md' ||
    f.filename.endsWith('/RUNBOOK.md')
  );

  // Detect service implementation changes
  const serviceFiles = files.filter(f =>
    (f.filename.includes('/routes/') ||
     f.filename.includes('/handlers/') ||
     f.filename.includes('/controllers/') ||
     f.filename.includes('/api/') ||
     f.filename.includes('/services/')) &&
    (f.filename.endsWith('.ts') ||
     f.filename.endsWith('.js') ||
     f.filename.endsWith('.py') ||
     f.filename.endsWith('.go') ||
     f.filename.endsWith('.java'))
  );

  const hasOwnershipChanges = ownershipFiles.length > 0;
  const hasRunbookChanges = runbookFiles.length > 0;
  const hasServiceChanges = serviceFiles.length > 0;
  const hasOwnershipOrRunbookChanges = hasOwnershipChanges || hasRunbookChanges;

  // PASS: Service and ownership/runbook changed together
  if (hasServiceChanges && hasOwnershipOrRunbookChanges) {
    return {
      status: 'pass',
      reason: 'Service and ownership/runbook changes are in sync',
      reasonHuman: 'Service changes include corresponding ownership or runbook updates',
      confidence: {
        applicability: 100,
        evidence: 90,
      },
      evidence: [
        {
          type: 'file_reference',
          value: 'Ownership/runbook files changed',
          path: [...ownershipFiles, ...runbookFiles].map(f => f.filename).join(', '),
          snippet: `${ownershipFiles.length + runbookFiles.length} ownership/runbook file(s) updated`,
          confidence: 90,
        },
        {
          type: 'file_reference',
          value: 'Service files changed',
          path: serviceFiles.map(f => f.filename).join(', '),
          snippet: `${serviceFiles.length} service file(s) updated`,
          confidence: 90,
        },
      ],
    };
  }

  // PASS: Neither changed (no drift)
  if (!hasServiceChanges && !hasOwnershipOrRunbookChanges) {
    return {
      status: 'pass',
      reason: 'No service or ownership/runbook changes detected',
      reasonHuman: 'No ownership drift detected',
      confidence: {
        applicability: 100,
        evidence: 100,
      },
    };
  }

  // FAIL: Service changed but ownership/runbook not updated
  if (hasServiceChanges && !hasOwnershipOrRunbookChanges) {
    return {
      status: 'fail',
      reason: 'Service implementation changed without updating ownership or runbook documentation',
      reasonHuman: 'Service changes detected but ownership/runbook documentation was not updated',
      confidence: {
        applicability: 100,
        evidence: 75,
      },
      evidence: [
        {
          type: 'file_reference',
          value: 'Service files changed',
          path: serviceFiles.map(f => f.filename).join(', '),
          snippet: `${serviceFiles.length} service file(s) changed`,
          confidence: 90,
        },
        {
          type: 'string',
          value: 'No ownership or runbook updates detected',
          confidence: 75,
        },
      ],
    };
  }

  // PASS: Ownership/runbook changed but service didn't (acceptable for documentation updates)
  if (hasOwnershipOrRunbookChanges && !hasServiceChanges) {
    return {
      status: 'pass',
      reason: 'Ownership/runbook-only changes (acceptable for documentation updates)',
      reasonHuman: 'Ownership or runbook updates without service changes (team rotation or documentation improvements)',
      confidence: {
        applicability: 100,
        evidence: 80,
      },
      evidence: [
        {
          type: 'file_reference',
          value: 'Ownership/runbook files changed',
          path: [...ownershipFiles, ...runbookFiles].map(f => f.filename).join(', '),
          snippet: `${ownershipFiles.length + runbookFiles.length} ownership/runbook file(s) updated`,
          confidence: 90,
        },
      ],
    };
  }

  return {
    status: 'unknown',
    reason: 'Could not determine runbook-ownership parity',
    reasonHuman: 'Unable to assess ownership documentation',
    confidence: {
      applicability: 50,
      evidence: 50,
    },
  };
}

export const runbookOwnershipParityComparator: Comparator = {
  id: ComparatorId.RUNBOOK_OWNERSHIP_PARITY,
  version: '1.0.0',
  evaluate,
};

