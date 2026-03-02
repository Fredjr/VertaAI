/**
 * Churn ↔ Complexity Risk Comparator (Agent Governance - Build→Run Quality)
 * 
 * Analyzes code churn metrics and complexity delta to identify high-risk changes:
 * - High churn (many files changed, large diffs)
 * - High complexity delta (increased nesting, cyclomatic complexity)
 * - Requires design notes for high-risk changes
 * 
 * This is a Build→Run quality comparator in the Spec–Build–Run triangle.
 * 
 * ARCHITECTURE:
 * - Calculates churn metrics (files changed, lines changed, commit frequency)
 * - Estimates complexity delta from diff patterns
 * - Combines metrics into risk score
 * - Requires design notes (PR description, linked docs) for high-risk changes
 * 
 * RISK FACTORS:
 * - Large PR size (>500 lines changed)
 * - Many files changed (>10 files)
 * - High complexity patterns (nested loops, deep conditionals)
 * - Critical paths (auth, payment, data access)
 * - Lack of design documentation
 */

import type { Comparator, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import type { EvidenceItem } from '../../ir/types.js';
import { AgentGovernanceMessages, RemediationMessages } from '../../ir/messageCatalog.js';

/**
 * Parameters for CHURN_COMPLEXITY_RISK comparator
 */
interface ChurnComplexityRiskParams {
  /** Maximum lines changed before requiring design notes (default: 500) */
  maxLinesChanged?: number;
  /** Maximum files changed before requiring design notes (default: 10) */
  maxFilesChanged?: number;
  /** Critical path patterns that always require design notes */
  criticalPaths?: string[];
  /** Whether to fail on high-risk changes without design notes (default: true) */
  failOnMissingDesignNotes?: boolean;
}

/**
 * Churn metrics
 */
interface ChurnMetrics {
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  totalChanges: number;
  largeFiles: string[]; // Files with >100 lines changed
}

/**
 * Complexity delta estimate
 */
interface ComplexityDelta {
  nestedLoops: number; // Estimated nested loop additions
  deepConditionals: number; // Estimated deep conditional additions
  complexityScore: number; // 0-100 score
}

/**
 * Risk assessment
 */
interface RiskAssessment {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number; // 0-100
  factors: string[];
  requiresDesignNotes: boolean;
}

export const churnComplexityRiskComparator: Comparator = {
  id: ComparatorId.CHURN_COMPLEXITY_RISK,
  version: '1.0.0',

  async evaluate(context: PRContext, params: ChurnComplexityRiskParams = {}): Promise<any> {
    const { files, description } = context;

    // Default parameters
    const maxLinesChanged = params.maxLinesChanged || 500;
    const maxFilesChanged = params.maxFilesChanged || 10;
    const criticalPaths = params.criticalPaths || [
      '**/auth/**',
      '**/payment/**',
      '**/security/**',
      '**/permissions/**',
      '**/iam/**',
    ];
    const failOnMissingDesignNotes = params.failOnMissingDesignNotes !== false;

    // Step 1: Calculate churn metrics
    const churnMetrics = calculateChurnMetrics(files);

    // Step 2: Estimate complexity delta
    const complexityDelta = estimateComplexityDelta(files);

    // Step 3: Assess risk
    const riskAssessment = assessRisk(churnMetrics, complexityDelta, files, criticalPaths);

    // Step 4: Check for design notes
    const hasDesignNotes = checkForDesignNotes(description);

    // Step 5: Build evidence
    const evidence: EvidenceItem[] = [];

    evidence.push({
      type: 'churn_metrics',
      path: 'PR',
      snippet: `Files: ${churnMetrics.filesChanged}, Lines: +${churnMetrics.linesAdded}/-${churnMetrics.linesDeleted}`,
      confidence: 100,
    });

    evidence.push({
      type: 'complexity_delta',
      path: 'PR',
      snippet: `Complexity Score: ${complexityDelta.complexityScore}/100`,
      confidence: 80,
    });

    evidence.push({
      type: 'risk_assessment',
      path: 'PR',
      snippet: `Risk Level: ${riskAssessment.riskLevel.toUpperCase()}, Score: ${riskAssessment.riskScore}/100`,
      confidence: 90,
    });

    // Step 6: Return result
    if (riskAssessment.requiresDesignNotes && !hasDesignNotes) {
      const factorsList = riskAssessment.factors.join(', ');

      return {
        comparatorId: ComparatorId.CHURN_COMPLEXITY_RISK,
        status: failOnMissingDesignNotes ? 'fail' : 'warn',
        reasonCode: FindingCode.CHURN_COMPLEXITY_HIGH_RISK,
        message: AgentGovernanceMessages.churnComplexityHighRisk(
          riskAssessment.riskLevel,
          churnMetrics.filesChanged,
          churnMetrics.totalChanges
        ),
        evidence,
        remediation: RemediationMessages.agentGovernance.addDesignNotes(factorsList),
      };
    }

    if (riskAssessment.riskLevel === 'medium' || riskAssessment.riskLevel === 'high') {
      return {
        comparatorId: ComparatorId.CHURN_COMPLEXITY_RISK,
        status: 'warn',
        reasonCode: FindingCode.CHURN_COMPLEXITY_MEDIUM_RISK,
        message: AgentGovernanceMessages.churnComplexityMediumRisk(
          riskAssessment.riskLevel,
          churnMetrics.filesChanged,
          churnMetrics.totalChanges
        ),
        evidence,
      };
    }

    // Low risk - PASS
    return {
      comparatorId: ComparatorId.CHURN_COMPLEXITY_RISK,
      status: 'pass',
      reasonCode: FindingCode.PASS,
      message: AgentGovernanceMessages.churnComplexityLowRisk(
        churnMetrics.filesChanged,
        churnMetrics.totalChanges
      ),
      evidence,
    };
  },
};

/**
 * Calculate churn metrics from file changes
 */
function calculateChurnMetrics(files: any[]): ChurnMetrics {
  let filesChanged = 0;
  let linesAdded = 0;
  let linesDeleted = 0;
  const largeFiles: string[] = [];

  for (const file of files) {
    filesChanged++;
    linesAdded += file.additions || 0;
    linesDeleted += file.deletions || 0;

    const fileChanges = (file.additions || 0) + (file.deletions || 0);
    if (fileChanges > 100) {
      largeFiles.push(file.filename);
    }
  }

  return {
    filesChanged,
    linesAdded,
    linesDeleted,
    totalChanges: linesAdded + linesDeleted,
    largeFiles,
  };
}

/**
 * Estimate complexity delta from diff patterns
 */
function estimateComplexityDelta(files: any[]): ComplexityDelta {
  let nestedLoops = 0;
  let deepConditionals = 0;

  for (const file of files) {
    if (!file.patch) continue;

    const lines = file.patch.split('\n');
    let currentNesting = 0;
    let maxNesting = 0;

    for (const line of lines) {
      // Only check added lines
      if (!line.startsWith('+')) continue;

      // Detect loop keywords
      if (/\b(for|while|forEach|map|filter|reduce)\b/.test(line)) {
        currentNesting++;
        maxNesting = Math.max(maxNesting, currentNesting);
      }

      // Detect conditional keywords
      if (/\b(if|else if|switch|case|\?)\b/.test(line)) {
        currentNesting++;
        maxNesting = Math.max(maxNesting, currentNesting);
      }

      // Detect closing braces (reduce nesting)
      if (/^\+\s*}/.test(line)) {
        currentNesting = Math.max(0, currentNesting - 1);
      }
    }

    // Count nested loops (nesting > 2)
    if (maxNesting > 2) {
      nestedLoops++;
    }

    // Count deep conditionals (nesting > 3)
    if (maxNesting > 3) {
      deepConditionals++;
    }
  }

  // Calculate complexity score (0-100)
  const complexityScore = Math.min(100, (nestedLoops * 10) + (deepConditionals * 15));

  return {
    nestedLoops,
    deepConditionals,
    complexityScore,
  };
}

/**
 * Assess risk based on churn and complexity metrics
 */
function assessRisk(
  churn: ChurnMetrics,
  complexity: ComplexityDelta,
  files: any[],
  criticalPaths: string[]
): RiskAssessment {
  const factors: string[] = [];
  let riskScore = 0;

  // Factor 1: Large PR size
  if (churn.totalChanges > 1000) {
    factors.push('Very large PR (>1000 lines)');
    riskScore += 40;
  } else if (churn.totalChanges > 500) {
    factors.push('Large PR (>500 lines)');
    riskScore += 25;
  }

  // Factor 2: Many files changed
  if (churn.filesChanged > 20) {
    factors.push('Many files changed (>20)');
    riskScore += 30;
  } else if (churn.filesChanged > 10) {
    factors.push('Multiple files changed (>10)');
    riskScore += 15;
  }

  // Factor 3: High complexity delta
  if (complexity.complexityScore > 50) {
    factors.push('High complexity increase');
    riskScore += 30;
  } else if (complexity.complexityScore > 25) {
    factors.push('Moderate complexity increase');
    riskScore += 15;
  }

  // Factor 4: Critical paths
  const criticalFilesChanged = files.filter(f =>
    criticalPaths.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
      return regex.test(f.filename);
    })
  );

  if (criticalFilesChanged.length > 0) {
    factors.push(`Critical paths modified (${criticalFilesChanged.length} files)`);
    riskScore += 40;
  }

  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  if (riskScore >= 80) {
    riskLevel = 'critical';
  } else if (riskScore >= 50) {
    riskLevel = 'high';
  } else if (riskScore >= 25) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  // Require design notes for high/critical risk
  const requiresDesignNotes = riskLevel === 'high' || riskLevel === 'critical';

  return {
    riskLevel,
    riskScore,
    factors,
    requiresDesignNotes,
  };
}

/**
 * Check if PR description contains design notes
 */
function checkForDesignNotes(description: string): boolean {
  if (!description) return false;

  // Look for design note indicators
  const designNotePatterns = [
    /## Design/i,
    /## Architecture/i,
    /## Technical Design/i,
    /## Approach/i,
    /## Implementation Notes/i,
    /Design Doc:/i,
    /Architecture Decision:/i,
    /Technical Approach:/i,
    /https?:\/\/.*\/(design|architecture|technical)/i, // Links to design docs
  ];

  return designNotePatterns.some(pattern => pattern.test(description));
}

