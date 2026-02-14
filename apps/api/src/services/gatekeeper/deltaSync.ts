/**
 * Delta Sync Findings
 * 
 * Analyzes PR changes using existing parsers (IaC, OpenAPI, CODEOWNERS)
 * to detect mismatches with documentation and generate gate findings.
 * 
 * This is the "Delta Sync" feature from the gatekeeper architecture:
 * - Detects IaC changes that may require runbook updates
 * - Detects API changes that may require API doc updates
 * - Detects ownership changes that may require team doc updates
 */

import { analyzeIaCChanges, type IaCAnalysisResult } from '../signals/iacParser.js';
import { diffOpenApiSpecs, isOpenApiFile, type OpenApiDiff } from '../signals/openApiParser.js';
import { diffCodeOwners, isCodeOwnersFile, type CodeOwnersDiff } from '../signals/codeownersParser.js';
import { getFileContent } from '../github-client.js';
import type { Octokit } from 'octokit';

export interface DeltaSyncFinding {
  type: 'iac_drift' | 'api_drift' | 'ownership_drift';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  affectedFiles: string[];
  suggestedDocs: string[];
  evidence: string;
}

export interface DeltaSyncResult {
  findings: DeltaSyncFinding[];
  hasHighSignalFindings: boolean;
  summary: string;
}

/**
 * Analyze PR for delta sync findings
 */
export async function analyzeDeltaSync(params: {
  files: Array<{ filename: string; patch?: string; status?: string }>;
  octokit?: Octokit;
  owner?: string;
  repo?: string;
  baseBranch?: string;
  headBranch?: string;
}): Promise<DeltaSyncResult> {
  const findings: DeltaSyncFinding[] = [];
  
  // 1. Analyze IaC changes
  const iacFindings = await analyzeIaCDrift(params.files);
  findings.push(...iacFindings);
  
  // 2. Analyze API changes
  const apiFindings = await analyzeApiDrift(params);
  findings.push(...apiFindings);
  
  // 3. Analyze ownership changes
  const ownershipFindings = await analyzeOwnershipDrift(params);
  findings.push(...ownershipFindings);
  
  // Determine if there are high-signal findings
  const hasHighSignalFindings = findings.some(f => 
    f.severity === 'high' || f.severity === 'critical'
  );
  
  // Generate summary
  const summary = generateDeltaSyncSummary(findings);
  
  return { findings, hasHighSignalFindings, summary };
}

/**
 * Analyze IaC changes for drift
 */
async function analyzeIaCDrift(
  files: Array<{ filename: string; patch?: string; status?: string }>
): Promise<DeltaSyncFinding[]> {
  const iacAnalysis = analyzeIaCChanges(files);
  
  if (!iacAnalysis.hasIaCChanges) {
    return [];
  }
  
  const findings: DeltaSyncFinding[] = [];
  
  // Check for deployment-related changes
  const hasDeploymentChanges = iacAnalysis.keywords.some(k => 
    /deploy|release|pipeline|ci|cd/.test(k)
  );
  
  if (hasDeploymentChanges) {
    findings.push({
      type: 'iac_drift',
      severity: 'high',
      title: 'Deployment infrastructure changes detected',
      description: iacAnalysis.environmentDriftEvidence,
      affectedFiles: iacAnalysis.changes.map(c => c.filePath),
      suggestedDocs: ['deployment runbook', 'infrastructure docs', 'environment setup guide'],
      evidence: `${iacAnalysis.changes.length} IaC changes affecting deployment`,
    });
  }
  
  // Check for database/storage changes
  const hasDatabaseChanges = iacAnalysis.keywords.some(k => 
    /database|rds|dynamodb|postgres|mysql|redis/.test(k)
  );
  
  if (hasDatabaseChanges) {
    findings.push({
      type: 'iac_drift',
      severity: 'critical',
      title: 'Database infrastructure changes detected',
      description: 'Database infrastructure changes may require migration notes and rollback procedures',
      affectedFiles: iacAnalysis.changes.map(c => c.filePath),
      suggestedDocs: ['database migration guide', 'rollback procedures', 'data backup docs'],
      evidence: `IaC changes affecting database resources`,
    });
  }
  
  // Check for security-related changes
  const hasSecurityChanges = iacAnalysis.keywords.some(k => 
    /security|firewall|iam|role|policy|certificate|ssl|tls/.test(k)
  );
  
  if (hasSecurityChanges) {
    findings.push({
      type: 'iac_drift',
      severity: 'critical',
      title: 'Security infrastructure changes detected',
      description: 'Security changes require careful documentation and review',
      affectedFiles: iacAnalysis.changes.map(c => c.filePath),
      suggestedDocs: ['security policies', 'access control docs', 'compliance docs'],
      evidence: `IaC changes affecting security resources`,
    });
  }
  
  return findings;
}

/**
 * Analyze API changes for drift
 */
async function analyzeApiDrift(params: {
  files: Array<{ filename: string; patch?: string; status?: string }>;
  octokit?: Octokit;
  owner?: string;
  repo?: string;
  baseBranch?: string;
  headBranch?: string;
}): Promise<DeltaSyncFinding[]> {
  const findings: DeltaSyncFinding[] = [];
  
  // Find OpenAPI/Swagger files
  const apiFiles = params.files.filter(f => isOpenApiFile(f.filename));
  
  if (apiFiles.length === 0) {
    return findings;
  }
  
  // For each API file, fetch old and new content and diff
  for (const file of apiFiles) {
    if (!params.octokit || !params.owner || !params.repo || !params.baseBranch || !params.headBranch) {
      continue; // Skip if we don't have GitHub client
    }
    
    try {
      const oldContent = await getFileContent(
        params.octokit,
        params.owner,
        params.repo,
        file.filename,
        params.baseBranch
      );
      
      const newContent = await getFileContent(
        params.octokit,
        params.owner,
        params.repo,
        file.filename,
        params.headBranch
      );
      
      const apiDiff = diffOpenApiSpecs(oldContent, newContent);
      
      if (apiDiff.hasBreakingChanges) {
        const breakingChanges = apiDiff.changes.filter(c => c.breakingChange);
        findings.push({
          type: 'api_drift',
          severity: 'critical',
          title: 'Breaking API changes detected',
          description: apiDiff.summary,
          affectedFiles: [file.filename],
          suggestedDocs: ['API documentation', 'migration guide', 'changelog'],
          evidence: `${breakingChanges.length} breaking changes in API spec`,
        });
      } else if (apiDiff.changes.length > 0) {
        findings.push({
          type: 'api_drift',
          severity: 'medium',
          title: 'API changes detected',
          description: apiDiff.summary,
          affectedFiles: [file.filename],
          suggestedDocs: ['API documentation', 'changelog'],
          evidence: `${apiDiff.changes.length} changes in API spec`,
        });
      }
    } catch (error) {
      console.error(`[DeltaSync] Error analyzing API file ${file.filename}:`, error);
    }
  }
  
  return findings;
}

/**
 * Analyze ownership changes for drift
 */
async function analyzeOwnershipDrift(params: {
  files: Array<{ filename: string; patch?: string; status?: string }>;
  octokit?: Octokit;
  owner?: string;
  repo?: string;
  baseBranch?: string;
  headBranch?: string;
}): Promise<DeltaSyncFinding[]> {
  const findings: DeltaSyncFinding[] = [];

  // Find CODEOWNERS files
  const codeownersFiles = params.files.filter(f => isCodeOwnersFile(f.filename));

  if (codeownersFiles.length === 0) {
    return findings;
  }

  // For each CODEOWNERS file, fetch old and new content and diff
  for (const file of codeownersFiles) {
    if (!params.octokit || !params.owner || !params.repo || !params.baseBranch || !params.headBranch) {
      continue; // Skip if we don't have GitHub client
    }

    try {
      const oldContent = await getFileContent(
        params.octokit,
        params.owner,
        params.repo,
        file.filename,
        params.baseBranch
      );

      const newContent = await getFileContent(
        params.octokit,
        params.owner,
        params.repo,
        file.filename,
        params.headBranch
      );

      const ownershipDiff = diffCodeOwners(oldContent, newContent);

      if (ownershipDiff.hasOwnershipDrift) {
        const totalChanges = ownershipDiff.changes.length;

        const severity = totalChanges > 5 ? 'high' : 'medium';

        findings.push({
          type: 'ownership_drift',
          severity,
          title: 'Code ownership changes detected',
          description: ownershipDiff.summary,
          affectedFiles: [file.filename],
          suggestedDocs: ['team structure docs', 'on-call rotation docs', 'responsibility matrix'],
          evidence: `${totalChanges} ownership rule changes`,
        });
      }
    } catch (error) {
      console.error(`[DeltaSync] Error analyzing CODEOWNERS file ${file.filename}:`, error);
    }
  }

  return findings;
}

/**
 * Generate summary text from findings
 */
function generateDeltaSyncSummary(findings: DeltaSyncFinding[]): string {
  if (findings.length === 0) {
    return 'No delta sync findings detected';
  }

  const bySeverity = findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byType = findings.reduce((acc, f) => {
    acc[f.type] = (acc[f.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const parts: string[] = [];

  // Severity summary
  if (bySeverity.critical) parts.push(`${bySeverity.critical} critical`);
  if (bySeverity.high) parts.push(`${bySeverity.high} high`);
  if (bySeverity.medium) parts.push(`${bySeverity.medium} medium`);
  if (bySeverity.low) parts.push(`${bySeverity.low} low`);

  const severitySummary = parts.join(', ');

  // Type summary
  const typeParts: string[] = [];
  if (byType.iac_drift) typeParts.push(`${byType.iac_drift} IaC`);
  if (byType.api_drift) typeParts.push(`${byType.api_drift} API`);
  if (byType.ownership_drift) typeParts.push(`${byType.ownership_drift} ownership`);

  const typeSummary = typeParts.join(', ');

  return `Found ${findings.length} delta sync findings (${severitySummary}): ${typeSummary}`;
}
