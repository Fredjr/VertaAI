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

        // Check if OpenAPI/API files were modified
        const apiFiles = pr.files.filter(f =>
          f.filename.includes('openapi') ||
          f.filename.includes('swagger') ||
          f.filename.endsWith('.yaml') ||
          f.filename.endsWith('.yml') ||
          f.filename.includes('/api/') ||
          f.filename.includes('routes')
        );

        const reason = hasBreakingSection || hasNoBreakingNote ? undefined :
          apiFiles.length > 0
            ? `API files modified (${apiFiles.map(f => f.filename).join(', ')}). Add "## Breaking Changes" section to PR description or "no breaking changes" note.`
            : 'Add "## Breaking Changes" section to PR description or "no breaking changes" note.';

        return {
          satisfied: hasBreakingSection || hasBreakingLabel || hasNoBreakingNote,
          evidence: hasBreakingSection ? 'Breaking changes section found' :
                    hasNoBreakingNote ? 'Explicitly marked as no breaking changes' : undefined,
          reason,
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

        // Generate specific test file suggestions based on changed files
        let suggestedTestFiles: string[] = [];
        if (!hasTestChanges && !hasTestExemption) {
          const sourceFiles = pr.files.filter(f =>
            !f.filename.includes('test') &&
            !f.filename.includes('spec') &&
            (f.filename.endsWith('.ts') || f.filename.endsWith('.js') ||
             f.filename.endsWith('.tsx') || f.filename.endsWith('.jsx') ||
             f.filename.endsWith('.py'))
          );

          suggestedTestFiles = sourceFiles.slice(0, 3).map(f => {
            const dir = f.filename.substring(0, f.filename.lastIndexOf('/') + 1);
            const basename = f.filename.substring(f.filename.lastIndexOf('/') + 1);
            const nameWithoutExt = basename.substring(0, basename.lastIndexOf('.'));
            const ext = basename.substring(basename.lastIndexOf('.'));

            // Suggest test file in same directory or __tests__ subdirectory
            if (ext === '.py') {
              return `${dir}test_${nameWithoutExt}.py`;
            } else {
              return `${dir}${nameWithoutExt}.test${ext}`;
            }
          });
        }

        const reason = hasTestChanges || hasTestExemption ? undefined :
          suggestedTestFiles.length > 0
            ? `No test changes found. Consider adding tests: ${suggestedTestFiles.join(', ')}. Or add "no tests needed" to PR description.`
            : 'No test changes and no exemption note provided';

        return {
          satisfied: hasTestChanges || hasTestExemption,
          evidence: hasTestChanges ? 'Test files modified' :
                    hasTestExemption ? 'Test exemption noted' : undefined,
          reason,
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

