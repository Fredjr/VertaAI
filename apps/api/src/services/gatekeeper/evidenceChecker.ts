/**
 * Evidence Requirement Checker
 * 
 * Checks if a PR satisfies domain-specific evidence requirements:
 * - Deployment: rollback notes, runbook links
 * - Database: migration notes
 * - API: breaking change documentation
 * - Universal: test updates or exemption notes
 */

export interface EvidenceRequirement {
  id: string;
  name: string;
  required: boolean;
  checkFn: (pr: PRContext) => EvidenceCheckResult;
}

export interface EvidenceCheckResult {
  satisfied: boolean;
  evidence?: string;
  reason?: string;
}

export interface PRContext {
  body: string;
  files: Array<{ filename: string; patch?: string }>;
  labels: string[];
  domains: string[];
}

export interface EvidenceCheckSummary {
  satisfied: boolean;
  missing: string[];
  optional: string[];
  details: Array<{
    requirement: string;
    satisfied: boolean;
    evidence?: string;
    reason?: string;
  }>;
}

/**
 * Evidence requirements based on risk domains
 */
export const EVIDENCE_REQUIREMENTS: Record<string, EvidenceRequirement[]> = {
  deployment: [
    {
      id: 'rollback_note',
      name: 'Rollback procedure documented',
      required: true,
      checkFn: (pr) => {
        const hasRollbackSection = /## Rollback/i.test(pr.body) || 
                                   /### Rollback/i.test(pr.body);
        const hasRollbackNote = /rollback:/i.test(pr.body);
        
        return {
          satisfied: hasRollbackSection || hasRollbackNote,
          evidence: hasRollbackSection ? 'Rollback section found in PR body' : undefined,
          reason: hasRollbackSection ? undefined : 'Missing rollback procedure documentation',
        };
      },
    },
    {
      id: 'runbook_link',
      name: 'Runbook reference provided',
      required: false,
      checkFn: (pr) => {
        const hasRunbookLink = /runbook:/i.test(pr.body) ||
                               /https?:\/\/.*runbook/i.test(pr.body);
        
        return {
          satisfied: hasRunbookLink,
          evidence: hasRunbookLink ? 'Runbook link found' : undefined,
          reason: hasRunbookLink ? undefined : 'No runbook reference provided',
        };
      },
    },
  ],
  
  database: [
    {
      id: 'migration_note',
      name: 'Migration strategy documented',
      required: true,
      checkFn: (pr) => {
        const hasMigrationSection = /## Migration/i.test(pr.body);
        const hasMigrationNote = /migration:/i.test(pr.body);
        
        return {
          satisfied: hasMigrationSection || hasMigrationNote,
          evidence: hasMigrationSection ? 'Migration section found' : undefined,
          reason: hasMigrationSection ? undefined : 'Missing migration strategy documentation',
        };
      },
    },
  ],
  
  api: [
    {
      id: 'breaking_change_note',
      name: 'Breaking changes documented',
      required: true,
      checkFn: (pr) => {
        const hasBreakingSection = /## Breaking Changes/i.test(pr.body);
        const hasBreakingLabel = pr.labels.includes('breaking-change');
        const hasNoBreakingNote = /no breaking changes/i.test(pr.body);
        
        return {
          satisfied: hasBreakingSection || hasBreakingLabel || hasNoBreakingNote,
          evidence: hasBreakingSection ? 'Breaking changes section found' : 
                    hasNoBreakingNote ? 'Explicitly marked as no breaking changes' : undefined,
          reason: hasBreakingSection || hasNoBreakingNote ? undefined : 
                  'Missing breaking changes documentation',
        };
      },
    },
  ],
  
  // Universal requirements (apply to all PRs)
  universal: [
    {
      id: 'tests_updated',
      name: 'Tests updated or exemption noted',
      required: true,
      checkFn: (pr) => {
        // Check if test files were modified
        const hasTestChanges = pr.files.some(f => 
          /test|spec|__tests__|\.test\.|\.spec\./i.test(f.filename)
        );
        
        // Check for explicit "no tests needed" note
        const hasTestExemption = /no tests needed/i.test(pr.body) ||
                                 /tests: none/i.test(pr.body) ||
                                 /\[x\] no tests required/i.test(pr.body);
        
        return {
          satisfied: hasTestChanges || hasTestExemption,
          evidence: hasTestChanges ? 'Test files modified' : 
                    hasTestExemption ? 'Test exemption noted' : undefined,
          reason: hasTestChanges || hasTestExemption ? undefined : 
                  'No test changes and no exemption note provided',
        };
      },
    },
  ],
};

/**
 * Check evidence requirements for a PR
 */
export function checkEvidenceRequirements(pr: PRContext): EvidenceCheckSummary {
  const missing: string[] = [];
  const optional: string[] = [];
  const details: EvidenceCheckSummary['details'] = [];

  // Check universal requirements
  const universalReqs = EVIDENCE_REQUIREMENTS.universal || [];
  for (const req of universalReqs) {
    const result = req.checkFn(pr);
    details.push({
      requirement: req.name,
      satisfied: result.satisfied,
      evidence: result.evidence,
      reason: result.reason,
    });

    if (!result.satisfied && req.required) {
      missing.push(req.name);
    } else if (!result.satisfied && !req.required) {
      optional.push(req.name);
    }
  }

  // Check domain-specific requirements
  for (const domain of pr.domains) {
    const requirements = EVIDENCE_REQUIREMENTS[domain] || [];
    for (const req of requirements) {
      const result = req.checkFn(pr);
      details.push({
        requirement: `[${domain}] ${req.name}`,
        satisfied: result.satisfied,
        evidence: result.evidence,
        reason: result.reason,
      });

      if (!result.satisfied && req.required) {
        missing.push(`[${domain}] ${req.name}`);
      } else if (!result.satisfied && !req.required) {
        optional.push(`[${domain}] ${req.name}`);
      }
    }
  }

  return {
    satisfied: missing.length === 0,
    missing,
    optional,
    details,
  };
}

