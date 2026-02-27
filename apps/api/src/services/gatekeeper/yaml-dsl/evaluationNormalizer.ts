/**
 * Evaluation Normalizer
 * 
 * Converts raw evaluation results into the canonical NormalizedEvaluationResult model.
 * This normalization layer ensures consistent output quality across all use cases.
 * 
 * Key responsibilities:
 * 1. Extract and deduplicate detected surfaces
 * 2. Build normalized obligations with explicit surface→obligation mapping
 * 3. Convert findings to normalized format with risk/why/how-to-fix
 * 4. Separate NOT_EVALUABLE items as policy quality issues
 * 5. Compute confidence with degradation reasons
 * 6. Generate prioritized next actions
 */

import type { PackResult } from './yamlGatekeeperIntegration.js';
import type {
  NormalizedEvaluationResult,
  NormalizedObligation,
  NormalizedFinding,
  NotEvaluableItem,
  DetectedSurface,
  RepoClassification,
  RiskScore,
  ObligationApplicability,
} from './types.js';
import { ObligationKind } from './types.js'; // Import as value (enum)
import { v4 as uuidv4 } from 'uuid';
import { classifyRepo } from './repoClassifier.js';
import type { GitHubFile } from './comparators/types.js';

/**
 * Normalize pack evaluation results into canonical model
 */
export function normalizeEvaluationResults(
  packResults: PackResult[],
  globalDecision: 'pass' | 'warn' | 'block',
  prFiles?: GitHubFile[],
  repoName?: string
): NormalizedEvaluationResult {
  // Step 0: Classify repository (deterministic, cacheable)
  const repoClassification = prFiles && repoName
    ? classifyRepo(prFiles, repoName)
    : undefined;

  // Step 1: Extract all detected surfaces (deduplicated)
  const surfaces = extractAllSurfaces(packResults);

  // Step 2: Build normalized obligations with surface→obligation mapping
  const obligations = buildNormalizedObligations(packResults, surfaces, repoClassification);

  // Step 3: Convert findings to normalized format with risk scoring
  const findings = buildNormalizedFindings(packResults, obligations, repoClassification);

  // Step 4: Extract NOT_EVALUABLE items separately
  const notEvaluable = extractNotEvaluableItems(packResults);

  // Step 5: Compute decision with contributing factors
  const decision = computeNormalizedDecision(globalDecision, findings, notEvaluable);

  // Step 6: Compute confidence with degradation reasons (3-layer model)
  const confidence = computeConfidenceScore(packResults, notEvaluable, repoClassification);

  // Step 7: Generate prioritized next actions
  const nextActions = generateNextActions(findings, notEvaluable, globalDecision);

  // Step 8: Build metadata
  const metadata = buildMetadata(packResults);

  return {
    surfaces,
    obligations,
    findings,
    notEvaluable,
    decision,
    confidence,
    nextActions,
    metadata,
    repoClassification,
  };
}

/**
 * Extract all detected surfaces across all packs (deduplicated)
 */
function extractAllSurfaces(packResults: PackResult[]): DetectedSurface[] {
  const surfaceMap = new Map<string, DetectedSurface>();

  for (const packResult of packResults) {
    const graph = packResult.result.evaluationGraph;
    if (!graph) continue;

    for (const surface of graph.allSurfaces) {
      if (!surfaceMap.has(surface.surfaceId)) {
        surfaceMap.set(surface.surfaceId, surface);
      }
    }
  }

  return Array.from(surfaceMap.values());
}

/**
 * Build normalized obligations with explicit surface→obligation mapping
 * This is THE KEY DIFFERENTIATOR for Track A
 */
function buildNormalizedObligations(
  packResults: PackResult[],
  surfaces: DetectedSurface[],
  repoClassification?: RepoClassification
): NormalizedObligation[] {
  const obligations: NormalizedObligation[] = [];

  for (const packResult of packResults) {
    const graph = packResult.result.evaluationGraph;
    if (!graph) continue;

    for (const ruleGraph of graph.ruleGraphs) {
      for (const obligation of ruleGraph.obligations) {
        // Map obligation to surfaces that triggered it
        const triggeredBy = ruleGraph.surfaces.map(s => s.surfaceId);

        // Infer obligation kind from evaluator type
        const kind = inferObligationKind(obligation.evaluator.id);

        const normalized: NormalizedObligation = {
          id: uuidv4(),
          kind,
          description: obligation.description,
          triggeredBy, // EXPLICIT CAUSAL LINK
          sourceRule: {
            ruleId: ruleGraph.ruleId,
            ruleName: ruleGraph.ruleName,
          },
          result: obligation.result,
          evidence: ruleGraph.evidence.filter(ev =>
            // Filter evidence relevant to this obligation
            true // TODO: Add evidence filtering logic
          ),
          decisionOnFail: obligation.decisionOnFail || 'warn',
          decisionOnUnknown: obligation.decisionOnUnknown,
          evaluationStatus: obligation.result.status === 'unknown' ? 'not_evaluable' : 'evaluated',
          notEvaluableReason: obligation.result.status === 'unknown'
            ? buildNotEvaluableReason(obligation.result.reasonCode, obligation.result.message)
            : undefined,
        };

        obligations.push(normalized);
      }
    }
  }

  return obligations;
}

/**
 * Infer obligation kind from comparator/evaluator ID
 */
function inferObligationKind(evaluatorId: string): ObligationKind {
  const id = evaluatorId.toUpperCase();

  if (id.includes('ARTIFACT_PRESENT')) return ObligationKind.ARTIFACT_PRESENT;
  if (id.includes('ARTIFACT_UPDATED')) return ObligationKind.ARTIFACT_UPDATED;
  if (id.includes('APPROVAL')) return ObligationKind.APPROVAL_REQUIRED;
  if (id.includes('CHECKRUN')) return ObligationKind.CHECKRUN_PASSED;
  if (id.includes('PARITY') || id.includes('INVARIANT')) return ObligationKind.PARITY_INVARIANT;
  if (id.includes('SECRET')) return ObligationKind.SECRET_SCAN;
  if (id.includes('CONDITION')) return ObligationKind.CONDITION_CHECK;

  return ObligationKind.CUSTOM;
}

/**
 * Build not-evaluable reason with remediation guidance
 */
function buildNotEvaluableReason(reasonCode: string, message: string): {
  category: 'policy_misconfig' | 'missing_external_evidence' | 'integration_error';
  message: string;
  remediation: string;
  degradeTo?: 'pass' | 'warn' | 'block';
} {
  // Categorize based on reason code
  let category: 'policy_misconfig' | 'missing_external_evidence' | 'integration_error';
  let remediation: string;
  let degradeTo: 'pass' | 'warn' | 'block' = 'warn'; // Default degrade behavior

  if (reasonCode === 'NOT_EVALUABLE' || reasonCode === 'MISSING_CONFIG') {
    category = 'policy_misconfig';
    remediation = 'Configure the required workspace settings or policy parameters';
  } else if (reasonCode === 'MISSING_EXTERNAL_EVIDENCE') {
    category = 'missing_external_evidence';
    remediation = 'Ensure external integrations (GitHub checks, approvals) are configured';
  } else {
    category = 'integration_error';
    remediation = 'Check integration status and retry evaluation';
  }

  return {
    category,
    message,
    remediation,
    degradeTo,
  };
}

/**
 * Extract evidence search metadata from comparator result
 * CRITICAL FIX: Evidence transparency
 */
function extractEvidenceSearch(obligation: NormalizedObligation): {
  searchedPaths?: string[];
  matchedPaths?: string[];
  closestMatches?: string[];
} | undefined {
  // Check if comparator result has evidenceSearch metadata
  const metadata = obligation.result.metadata as any;
  if (metadata?.evidenceSearch) {
    return metadata.evidenceSearch;
  }
  return undefined;
}

/**
 * Build normalized findings with risk/why/how-to-fix
 */
function buildNormalizedFindings(
  packResults: PackResult[],
  obligations: NormalizedObligation[],
  repoClassification?: RepoClassification
): NormalizedFinding[] {
  const findings: NormalizedFinding[] = [];

  for (const obligation of obligations) {
    // Skip if evaluated successfully
    if (obligation.result.status === 'pass') continue;
    if (obligation.evaluationStatus === 'not_evaluable') continue; // Handled separately

    // Compute applicability (does this obligation apply to this repo?)
    const applicability = resolveObligationApplicability(obligation, repoClassification);

    // CRITICAL FIX: If obligation doesn't apply, override the result status
    let finalResult = obligation.result;
    if (!applicability.applies && applicability.recommendedStatus) {
      finalResult = {
        ...obligation.result,
        status: applicability.recommendedStatus,
        message: applicability.reason,
      };

      // If not applicable, skip adding to findings (don't show in warnings)
      if (applicability.recommendedStatus === 'not_applicable') {
        continue;
      }

      // If not evaluable, we might still want to show it (depending on policy)
      // For now, skip it to reduce noise
      if (applicability.recommendedStatus === 'not_evaluable') {
        continue;
      }
    }

    // Compute risk score (deterministic)
    const riskScore = computeRiskScore(obligation, repoClassification);

    // CRITICAL FIX: Extract evidence search from comparator metadata
    const evidenceSearch = extractEvidenceSearch(obligation);

    // Build finding from failed obligation
    const finding: NormalizedFinding = {
      id: uuidv4(),
      severity: mapDecisionToSeverity(obligation.decisionOnFail),
      what: obligation.description,
      why: buildWhyItMatters(obligation, repoClassification),
      evidence: obligation.evidence,
      howToFix: buildHowToFix(obligation),
      owner: extractOwner(obligation),
      obligationId: obligation.id,
      decision: obligation.decisionOnFail,
      riskScore,
      applicability,
      result: finalResult,
      evidenceSearch,
    };

    findings.push(finding);
  }

  // Sort findings by risk score (highest first)
  findings.sort((a, b) => (b.riskScore?.score || 0) - (a.riskScore?.score || 0));

  return findings;
}

/**
 * Resolve obligation applicability based on repo classification
 * PHASE 2: Core Differentiation - Deterministic applicability
 */
function resolveObligationApplicability(
  obligation: NormalizedObligation,
  repoClassification?: RepoClassification
): ObligationApplicability {
  const obligationId = obligation.id;
  const ruleName = obligation.sourceRule.ruleName.toLowerCase();
  const ruleId = obligation.sourceRule.ruleId.toLowerCase();

  // TIER-SPECIFIC RULES
  if (ruleName.includes('tier-1') || ruleName.includes('tier1') || ruleId.includes('tier-1')) {
    if (!repoClassification) {
      return {
        obligationId,
        applies: false,
        reason: 'Cannot determine service tier (classification unavailable)',
        confidence: 0,
        evidence: [],
        recommendedStatus: 'not_evaluable',
      };
    }

    if (repoClassification.serviceTier === 'unknown') {
      return {
        obligationId,
        applies: false,
        reason: 'Service tier not declared; cannot evaluate tier-1 requirement',
        confidence: repoClassification.confidence,
        evidence: repoClassification.evidence,
        recommendedStatus: 'not_evaluable',
      };
    }

    if (repoClassification.serviceTier === 'tier-1') {
      return {
        obligationId,
        applies: true,
        reason: `This is a tier-1 service (${repoClassification.evidence.join(', ')})`,
        confidence: repoClassification.confidence,
        evidence: repoClassification.evidence,
      };
    }

    // Tier-2 or Tier-3
    return {
      obligationId,
      applies: false,
      reason: `This rule only applies to tier-1 services. Current tier: ${repoClassification.serviceTier}`,
      confidence: repoClassification.confidence,
      evidence: repoClassification.evidence,
      recommendedStatus: 'not_applicable',
    };
  }

  // SERVICE CATALOG RULES (only for services, not docs/libraries)
  if (ruleName.includes('service catalog') || ruleName.includes('service owner') || ruleId.includes('service-owner')) {
    if (!repoClassification) {
      return {
        obligationId,
        applies: true,
        reason: 'Cannot determine repo type; assuming service',
        confidence: 0.5,
        evidence: [],
      };
    }

    if (repoClassification.repoType === 'docs' || repoClassification.repoType === 'library') {
      return {
        obligationId,
        applies: false,
        reason: `This rule applies to services. Current repo type: ${repoClassification.repoType}`,
        confidence: repoClassification.confidence,
        evidence: repoClassification.evidence,
        recommendedStatus: 'not_applicable',
      };
    }

    return {
      obligationId,
      applies: true,
      reason: `This is a ${repoClassification.repoType} repository`,
      confidence: repoClassification.confidence,
      evidence: repoClassification.evidence,
    };
  }

  // DATABASE-SPECIFIC RULES
  if (ruleName.includes('migration') || ruleName.includes('database') || ruleName.includes('schema')) {
    if (!repoClassification) {
      return {
        obligationId,
        applies: true,
        reason: 'Cannot determine database presence',
        confidence: 0.5,
        evidence: [],
      };
    }

    if (!repoClassification.hasDatabase) {
      return {
        obligationId,
        applies: false,
        reason: 'This rule only applies to services with databases',
        confidence: 0.9,
        evidence: ['No database files detected'],
        recommendedStatus: 'not_applicable',
      };
    }

    return {
      obligationId,
      applies: true,
      reason: 'This repository has database migrations',
      confidence: 0.9,
      evidence: ['Database files detected'],
    };
  }

  // RUNBOOK RULES (tier-specific, but also service-specific)
  if (ruleName.includes('runbook') && !ruleName.includes('tier')) {
    if (!repoClassification) {
      return {
        obligationId,
        applies: true,
        reason: 'Cannot determine repo type',
        confidence: 0.5,
        evidence: [],
      };
    }

    if (repoClassification.repoType === 'docs' || repoClassification.repoType === 'library') {
      return {
        obligationId,
        applies: false,
        reason: `Runbooks typically not required for ${repoClassification.repoType} repositories`,
        confidence: repoClassification.confidence,
        evidence: repoClassification.evidence,
        recommendedStatus: 'not_applicable',
      };
    }

    return {
      obligationId,
      applies: true,
      reason: `This is a ${repoClassification.repoType} repository`,
      confidence: repoClassification.confidence,
      evidence: repoClassification.evidence,
    };
  }

  // DEFAULT: CODEOWNERS, CI checks, etc. - applies to all
  return {
    obligationId,
    applies: true,
    reason: 'General rule applies to all repositories',
    confidence: 1.0,
    evidence: [],
  };
}

/**
 * Compute deterministic risk score for a finding
 * PHASE 2: Core Differentiation - Risk scoring
 */
function computeRiskScore(
  obligation: NormalizedObligation,
  repoClassification?: RepoClassification
): RiskScore {
  let blastRadius = 0;
  let blastRadiusReason = '';
  let criticality = 0;
  let criticalityReason = '';
  let immediacy = 0;
  let immediacyReason = '';
  let dependency = 0;
  let dependencyReason = '';

  const ruleName = obligation.sourceRule.ruleName.toLowerCase();

  // Blast Radius (0-30): How many systems/users affected
  if (obligation.kind === ObligationKind.PARITY_INVARIANT) {
    blastRadius = 25;
    blastRadiusReason = 'API changes affect all consumers';
  } else if (obligation.kind === ObligationKind.SECRET_SCAN) {
    blastRadius = 30;
    blastRadiusReason = 'Security issues affect entire org';
  } else if (obligation.kind === ObligationKind.ARTIFACT_UPDATED) {
    blastRadius = 15;
    blastRadiusReason = 'Documentation drift affects team';
  } else if (ruleName.includes('codeowners')) {
    blastRadius = 20;
    blastRadiusReason = 'Ownership clarity affects team coordination';
  } else if (ruleName.includes('service catalog') || ruleName.includes('service owner')) {
    blastRadius = 15;
    blastRadiusReason = 'Service ownership affects incident response';
  } else if (ruleName.includes('runbook')) {
    blastRadius = 25;
    blastRadiusReason = 'Runbook missing affects incident recovery';
  } else {
    blastRadius = 10;
    blastRadiusReason = 'Limited scope impact';
  }

  // Criticality (0-30): Service tier + compliance (tier as multiplier, not hard max)
  // CRITICAL FIX: Confidence-weight tier-based risk when tier is inferred
  if (repoClassification) {
    const tierMultiplier = repoClassification.serviceTier === 'tier-1' ? 1.0 :
                           repoClassification.serviceTier === 'tier-2' ? 0.67 :
                           repoClassification.serviceTier === 'tier-3' ? 0.33 : 0.5;

    // Base criticality depends on obligation type
    let baseCriticality = 15;
    if (ruleName.includes('runbook') || ruleName.includes('slo')) {
      baseCriticality = 30; // Operational readiness is critical
    } else if (ruleName.includes('codeowners') || ruleName.includes('service owner')) {
      baseCriticality = 20; // Ownership is important
    } else if (ruleName.includes('service catalog')) {
      baseCriticality = 15; // Metadata is useful
    }

    // CRITICAL FIX: Apply confidence weighting if tier is inferred
    let finalMultiplier = tierMultiplier;
    const tierConfidence = repoClassification.confidenceBreakdown?.tierConfidence || 1.0;
    const tierSource = repoClassification.confidenceBreakdown?.tierSource || 'unknown';

    if (tierSource === 'inferred' && tierConfidence < 0.9) {
      // Reduce tier multiplier by confidence (e.g., 70% confidence → 0.7x multiplier)
      finalMultiplier = tierMultiplier * tierConfidence;
    }

    criticality = Math.round(baseCriticality * finalMultiplier);

    // CRITICAL FIX: Drop "1.0 multiplier" text when redundant
    if (repoClassification.serviceTier === 'tier-1') {
      if (tierSource === 'inferred' && tierConfidence < 0.9) {
        criticalityReason = `Tier-1 service (${baseCriticality} × ${tierConfidence.toFixed(2)} confidence-weighted)`;
      } else {
        criticalityReason = `Tier-1 service (${baseCriticality} base)`;
      }
    } else if (repoClassification.serviceTier === 'tier-2') {
      criticalityReason = `Tier-2 service (${baseCriticality} × 0.67)`;
    } else if (repoClassification.serviceTier === 'tier-3') {
      criticalityReason = `Tier-3 service (${baseCriticality} × 0.33)`;
    } else if (repoClassification.repoType === 'docs' || repoClassification.repoType === 'library') {
      criticality = 5;
      criticalityReason = `${repoClassification.repoType} repo (low criticality)`;
    } else {
      criticalityReason = `Unknown tier (${baseCriticality} × 0.5)`;
    }
  } else {
    criticality = 15;
    criticalityReason = 'No repo classification available';
  }

  // Immediacy (0-20): Blocks merge vs tech debt
  if (obligation.decisionOnFail === 'block') {
    immediacy = 20;
    immediacyReason = 'Blocks merge immediately';
  } else if (obligation.decisionOnFail === 'warn') {
    immediacy = 10;
    immediacyReason = 'Should fix soon (warning)';
  } else {
    immediacy = 5;
    immediacyReason = 'Tech debt (informational)';
  }

  // Dependency (0-20): Blocks other work
  if (obligation.kind === ObligationKind.CHECKRUN_PASSED) {
    dependency = 20;
    dependencyReason = 'CI failures block everything';
  } else if (obligation.kind === ObligationKind.APPROVAL_REQUIRED) {
    dependency = 15;
    dependencyReason = 'Waiting for approval blocks merge';
  } else if (ruleName.includes('codeowners')) {
    dependency = 10;
    dependencyReason = 'Missing CODEOWNERS affects review routing';
  } else if (ruleName.includes('runbook')) {
    dependency = 15;
    dependencyReason = 'Missing runbook affects on-call readiness';
  } else {
    dependency = 5;
    dependencyReason = 'Does not block other work';
  }

  const score = blastRadius + criticality + immediacy + dependency;

  return {
    score,
    factors: {
      blastRadius,
      criticality,
      immediacy,
      dependency,
    },
    reasoning: `Risk: ${score}/100 (Blast: ${blastRadius}, Criticality: ${criticality}, Immediacy: ${immediacy}, Dependency: ${dependency})`,
    drivers: {
      blastRadiusReason,
      criticalityReason,
      immediacyReason,
      dependencyReason,
    },
  };
}

/**
 * Map decision to severity level
 */
function mapDecisionToSeverity(decision: 'pass' | 'warn' | 'block'): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  switch (decision) {
    case 'block': return 'critical';
    case 'warn': return 'medium';
    case 'pass': return 'info';
  }
}

/**
 * Build "why it matters" explanation based on obligation kind
 */
function buildWhyItMatters(obligation: NormalizedObligation, repoClassification?: RepoClassification): string {
  const baseReason = getBaseWhyItMatters(obligation.kind);

  // Add context based on repo classification
  if (repoClassification && repoClassification.serviceTier === 'tier-1') {
    return `${baseReason} This is especially critical for tier-1 services with high availability requirements.`;
  }

  return baseReason;
}

function getBaseWhyItMatters(kind: ObligationKind): string {
  switch (kind) {
    case ObligationKind.ARTIFACT_PRESENT:
      return 'Missing required documentation or configuration files can lead to operational issues and knowledge gaps.';

    case ObligationKind.ARTIFACT_UPDATED:
      return 'Outdated documentation creates drift between code and contracts, leading to integration failures and confusion.';

    case ObligationKind.APPROVAL_REQUIRED:
      return 'Changes without proper review increase the risk of bugs, security vulnerabilities, and compliance violations.';

    case ObligationKind.CHECKRUN_PASSED:
      return 'Failed CI checks indicate potential bugs, test failures, or quality issues that could impact production.';

    case ObligationKind.PARITY_INVARIANT:
      return 'Inconsistencies between specifications and implementation cause integration failures and API contract violations.';

    case ObligationKind.SECRET_SCAN:
      return 'Exposed secrets in code can lead to security breaches, data leaks, and unauthorized access.';

    default:
      return 'This policy violation may impact system reliability, security, or compliance.';
  }
}

/**
 * Build "how to fix" steps based on obligation kind and result
 */
function buildHowToFix(obligation: NormalizedObligation): string[] {
  const steps: string[] = [];

  switch (obligation.kind) {
    case ObligationKind.ARTIFACT_PRESENT:
      steps.push(`Create the required file: ${extractRequiredArtifact(obligation.result.message)}`);
      steps.push('Commit and push the file to this PR');
      break;

    case ObligationKind.ARTIFACT_UPDATED:
      steps.push(`Update the required file: ${extractRequiredArtifact(obligation.result.message)}`);
      steps.push('Ensure changes reflect the code modifications in this PR');
      break;

    case ObligationKind.APPROVAL_REQUIRED:
      steps.push('Request review from a code owner or authorized approver');
      steps.push('Address any review comments');
      steps.push('Obtain approval before merging');
      break;

    case ObligationKind.CHECKRUN_PASSED:
      steps.push('Review the failed check run output');
      steps.push('Fix the underlying issue (tests, linting, etc.)');
      steps.push('Push fixes to trigger re-evaluation');
      break;

    case ObligationKind.PARITY_INVARIANT:
      steps.push('Review the specification and implementation for inconsistencies');
      steps.push('Update either the spec or code to ensure they match');
      steps.push('Run validation tools to verify parity');
      break;

    case ObligationKind.SECRET_SCAN:
      steps.push('Remove the exposed secret from the code');
      steps.push('Rotate the compromised credential immediately');
      steps.push('Use environment variables or secret management tools');
      break;

    default:
      steps.push(`Resolve: ${obligation.description}`);
      steps.push('See rule documentation for specific guidance');
  }

  return steps;
}

/**
 * Extract required artifact name from message
 */
function extractRequiredArtifact(message: string): string {
  const match = message.match(/Expected one of: (.+)/);
  if (match) {
    return match[1].split(',')[0].trim();
  }
  return 'required artifact';
}

/**
 * Extract owner information from obligation
 */
function extractOwner(obligation: NormalizedObligation): { team?: string; individuals?: string[]; codeownersPath?: string } | undefined {
  // TODO: Extract from CODEOWNERS or rule metadata
  return undefined;
}

/**
 * Extract NOT_EVALUABLE items as separate policy quality issues
 */
function extractNotEvaluableItems(packResults: PackResult[]): NotEvaluableItem[] {
  const items: NotEvaluableItem[] = [];

  for (const packResult of packResults) {
    for (const finding of packResult.result.findings) {
      if (finding.evaluationStatus !== 'not_evaluable') continue;

      const reasonCode = finding.comparatorResult?.reasonCode || finding.conditionResult?.error || 'UNKNOWN';
      const message = finding.comparatorResult?.message || finding.conditionResult?.error || 'Unable to evaluate';

      const notEvaluableReason = buildNotEvaluableReason(reasonCode, message);

      const item: NotEvaluableItem = {
        description: finding.ruleName,
        category: notEvaluableReason.category,
        message: notEvaluableReason.message,
        confidenceImpact: finding.decisionOnFail === 'block' ? 'high' : 'medium',
        remediation: {
          steps: [notEvaluableReason.remediation],
          configPath: extractConfigPath(reasonCode, message),
          documentationUrl: undefined, // TODO: Add docs links
        },
        degradeTo: notEvaluableReason.degradeTo || finding.decisionOnUnknown || 'warn',
        sourceRule: {
          ruleId: finding.ruleId,
          ruleName: finding.ruleName,
        },
      };

      items.push(item);
    }
  }

  return items;
}

/**
 * Extract configuration path from error message
 */
function extractConfigPath(reasonCode: string, message: string): string | undefined {
  if (reasonCode === 'NOT_EVALUABLE') {
    const fieldMatch = message.match(/field[:\s]+['"]?([^'"]+)['"]?/i);
    if (fieldMatch) {
      return `workspace.defaults.prTemplate.requiredFields['${fieldMatch[1]}']`;
    }
  }
  return undefined;
}

/**
 * Compute normalized decision with contributing factors
 */
function computeNormalizedDecision(
  globalDecision: 'pass' | 'warn' | 'block',
  findings: NormalizedFinding[],
  notEvaluable: NotEvaluableItem[]
): {
  outcome: 'pass' | 'warn' | 'block';
  reason: string;
  contributingFactors: Array<{
    type: 'blocking_issue' | 'warning' | 'not_evaluable';
    count: number;
    description: string;
  }>;
} {
  const blockingCount = findings.filter(f => f.decision === 'block').length;
  const warningCount = findings.filter(f => f.decision === 'warn').length;
  const notEvaluableCount = notEvaluable.length;

  const contributingFactors: Array<{
    type: 'blocking_issue' | 'warning' | 'not_evaluable';
    count: number;
    description: string;
  }> = [];

  if (blockingCount > 0) {
    contributingFactors.push({
      type: 'blocking_issue',
      count: blockingCount,
      description: `${blockingCount} blocking issue(s) must be resolved`,
    });
  }

  if (warningCount > 0) {
    contributingFactors.push({
      type: 'warning',
      count: warningCount,
      description: `${warningCount} warning(s) should be reviewed`,
    });
  }

  if (notEvaluableCount > 0) {
    contributingFactors.push({
      type: 'not_evaluable',
      count: notEvaluableCount,
      description: `${notEvaluableCount} check(s) could not be evaluated`,
    });
  }

  // Build 1-2 sentence reason
  let reason: string;
  if (globalDecision === 'block') {
    reason = `${blockingCount} critical policy violation(s) detected that must be resolved before merging.`;
  } else if (globalDecision === 'warn') {
    reason = `${warningCount} policy warning(s) detected. Review recommended before merging.`;
    if (notEvaluableCount > 0) {
      reason += ` ${notEvaluableCount} check(s) could not be evaluated due to configuration gaps.`;
    }
  } else {
    reason = 'All policy checks passed successfully.';
  }

  return {
    outcome: globalDecision,
    reason,
    contributingFactors,
  };
}

/**
 * Compute confidence score with 3-layer model
 * CRITICAL FIX: Confidence must be mathematically consistent
 *
 * Layer 1: Applicability Confidence (repo type/tier classification)
 * Layer 2: Evidence Confidence (artifact checks)
 * Layer 3: Decision Confidence (aggregate = min of above)
 */
function computeConfidenceScore(
  packResults: PackResult[],
  notEvaluable: NotEvaluableItem[],
  repoClassification?: RepoClassification
): {
  score: number;
  level: 'high' | 'medium' | 'low';
  degradationReasons: string[];
  // CRITICAL FIX: 3-layer breakdown
  applicabilityConfidence?: {
    score: number;
    level: 'high' | 'medium' | 'low';
    reason: string;
  };
  evidenceConfidence: {
    score: number;
    level: 'high' | 'medium' | 'low';
    reason: string;
  };
} {
  // Layer 1: Applicability Confidence (from repo classification)
  let applicabilityScore = 100;
  let applicabilityLevel: 'high' | 'medium' | 'low' = 'high';
  let applicabilityReason = 'No classification required';

  if (repoClassification?.confidenceBreakdown) {
    const breakdown = repoClassification.confidenceBreakdown;

    // Take minimum of repo type and tier confidence
    const repoTypeScore = breakdown.repoTypeConfidence * 100;
    const tierScore = breakdown.tierConfidence * 100;
    applicabilityScore = Math.min(repoTypeScore, tierScore);

    // Determine level
    if (applicabilityScore >= 90) applicabilityLevel = 'high';
    else if (applicabilityScore >= 60) applicabilityLevel = 'medium';
    else applicabilityLevel = 'low';

    // Build reason
    const repoSource = breakdown.repoTypeSource === 'explicit' ? 'explicit' : 'inferred';
    const tierSource = breakdown.tierSource === 'explicit' ? 'explicit' :
                       breakdown.tierSource === 'inferred' ? 'inferred' : 'unknown';
    applicabilityReason = `Repo type ${repoSource}, tier ${tierSource}`;
  }

  // Layer 2: Evidence Confidence (from artifact checks)
  const totalCoverage = packResults.reduce((sum, pr) => ({
    evaluable: sum.evaluable + pr.result.coverage.evaluable,
    total: sum.total + pr.result.coverage.total,
    notEvaluable: sum.notEvaluable + pr.result.coverage.notEvaluable,
  }), { evaluable: 0, total: 0, notEvaluable: 0 });

  const evidenceScore = totalCoverage.total === 0 ? 100 : Math.round((totalCoverage.evaluable / totalCoverage.total) * 100);

  let evidenceLevel: 'high' | 'medium' | 'low';
  if (evidenceScore >= 90) evidenceLevel = 'high';
  else if (evidenceScore >= 70) evidenceLevel = 'medium';
  else evidenceLevel = 'low';

  const evidenceReason = totalCoverage.notEvaluable > 0
    ? `${totalCoverage.notEvaluable} check(s) not evaluable`
    : 'All artifact checks deterministic';

  // Layer 3: Decision Confidence (aggregate = minimum of above)
  // CRITICAL: Global confidence cannot exceed applicability confidence
  const score = Math.min(applicabilityScore, evidenceScore);

  let level: 'high' | 'medium' | 'low';
  if (score >= 90) level = 'high';
  else if (score >= 60) level = 'medium';
  else level = 'low';

  const degradationReasons: string[] = [];

  if (applicabilityLevel !== 'high') {
    degradationReasons.push(`Applicability ${applicabilityLevel} (${applicabilityReason})`);
  }

  if (totalCoverage.notEvaluable > 0) {
    degradationReasons.push(`${totalCoverage.notEvaluable} check(s) not evaluable`);
  }

  // Group by category
  const policyMisconfigCount = notEvaluable.filter(item => item.category === 'policy_misconfig').length;
  const missingEvidenceCount = notEvaluable.filter(item => item.category === 'missing_external_evidence').length;
  const integrationErrorCount = notEvaluable.filter(item => item.category === 'integration_error').length;

  if (policyMisconfigCount > 0) {
    degradationReasons.push(`${policyMisconfigCount} policy configuration issue(s)`);
  }
  if (missingEvidenceCount > 0) {
    degradationReasons.push(`${missingEvidenceCount} missing external evidence`);
  }
  if (integrationErrorCount > 0) {
    degradationReasons.push(`${integrationErrorCount} integration error(s)`);
  }

  return {
    score,
    level,
    degradationReasons,
    applicabilityConfidence: repoClassification ? {
      score: applicabilityScore,
      level: applicabilityLevel,
      reason: applicabilityReason,
    } : undefined,
    evidenceConfidence: {
      score: evidenceScore,
      level: evidenceLevel,
      reason: evidenceReason,
    },
  };
}

/**
 * Generate prioritized next actions
 */
function generateNextActions(
  findings: NormalizedFinding[],
  notEvaluable: NotEvaluableItem[],
  globalDecision: 'pass' | 'warn' | 'block'
): Array<{
  priority: number;
  action: string;
  category: 'fix_blocking' | 'fix_warning' | 'configure_policy' | 'request_approval';
  relatedFindingIds?: string[];
}> {
  const actions: Array<{
    priority: number;
    action: string;
    category: 'fix_blocking' | 'fix_warning' | 'configure_policy' | 'request_approval';
    relatedFindingIds?: string[];
  }> = [];

  let priority = 1;

  // Priority 1: Fix blocking issues
  const blockingFindings = findings.filter(f => f.decision === 'block');
  for (const finding of blockingFindings.slice(0, 3)) { // Top 3 blocking
    actions.push({
      priority: priority++,
      action: finding.howToFix[0] || `Resolve: ${finding.what}`,
      category: 'fix_blocking',
      relatedFindingIds: [finding.id],
    });
  }

  // Priority 2: Configure policy for not-evaluable items
  const policyMisconfigItems = notEvaluable.filter(item => item.category === 'policy_misconfig');
  for (const item of policyMisconfigItems.slice(0, 2)) { // Top 2 config issues
    actions.push({
      priority: priority++,
      action: item.remediation.steps[0] || 'Configure policy settings',
      category: 'configure_policy',
    });
  }

  // Priority 3: Fix warnings (if no blocking issues)
  if (blockingFindings.length === 0) {
    const warningFindings = findings.filter(f => f.decision === 'warn');
    for (const finding of warningFindings.slice(0, 3)) { // Top 3 warnings
      actions.push({
        priority: priority++,
        action: finding.howToFix[0] || `Review: ${finding.what}`,
        category: 'fix_warning',
        relatedFindingIds: [finding.id],
      });
    }
  }

  // Priority 4: Request approval if needed
  const approvalFindings = findings.filter(f =>
    f.what.toLowerCase().includes('approval') ||
    f.what.toLowerCase().includes('review')
  );
  if (approvalFindings.length > 0) {
    actions.push({
      priority: priority++,
      action: 'Request review from code owners or authorized approvers',
      category: 'request_approval',
      relatedFindingIds: approvalFindings.map(f => f.id),
    });
  }

  return actions.slice(0, 5); // Limit to top 5 actions
}

/**
 * Build metadata from pack results
 */
function buildMetadata(packResults: PackResult[]): {
  packId: string;
  packName: string;
  packVersion: string;
  evaluationTimeMs: number;
  timestamp: string;
} {
  // Use first pack for metadata (or aggregate if multiple)
  const firstPack = packResults[0];
  const totalTime = packResults.reduce((sum, pr) => sum + pr.result.evaluationTimeMs, 0);

  return {
    packId: firstPack.pack.metadata.id || 'unknown',
    packName: firstPack.pack.metadata.name,
    packVersion: firstPack.pack.metadata.version,
    evaluationTimeMs: totalTime,
    timestamp: new Date().toISOString(),
  };
}

