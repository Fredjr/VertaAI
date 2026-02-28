/**
 * RunContext Builder
 * 
 * Builds the RunContext IR entity from available evaluation data.
 * This is ADDITIVE - it doesn't modify existing data structures.
 * 
 * Key principles:
 * - Only use data that's already available
 * - No new API calls or external dependencies
 * - Deterministic and cacheable
 * - Backward compatible
 */

import type { RunContext, DetectedSignals, ConfidenceBreakdown, PolicyPlan } from './types.js';
import type { GatekeeperInput } from '../../index.js';
import type { GitHubFile } from '../comparators/types.js';
import type { RepoClassification } from '../types.js';
import { createHash } from 'crypto';

/**
 * Build RunContext from GatekeeperInput and evaluation data
 *
 * PHASE 6: Now includes stable fingerprints and policy revision
 *
 * @param input - Original gatekeeper input
 * @param prFiles - PR files (for signal detection)
 * @param repoClassification - Repo classification (if available)
 * @param baseSha - Base SHA (if available)
 * @param isDraft - Whether PR is draft (if available)
 * @param policyPlan - PolicyPlan (for fingerprint calculation) - PHASE 6
 * @returns Complete RunContext with fingerprints
 */
export function buildRunContext(
  input: GatekeeperInput,
  prFiles?: GitHubFile[],
  repoClassification?: RepoClassification,
  baseSha?: string,
  isDraft?: boolean,
  policyPlan?: PolicyPlan
): RunContext {
  // Build repo identifiers
  const repo = {
    owner: input.owner,
    name: input.repo,
    fullName: `${input.owner}/${input.repo}`,
  };

  // Build PR context
  const pr = {
    number: input.prNumber,
    title: input.title,
    branch: input.headBranch,
    baseBranch: input.baseBranch,
    headSha: input.headSha,
    baseSha: baseSha,
    author: input.author,
    isDraft: isDraft ?? false,
  };

  // Build workspace context
  const workspace = {
    id: input.workspaceId,
    installationId: input.installationId,
  };

  // Detect signals from files
  const signals = detectSignals(prFiles || [], input.files);

  // Build confidence breakdown
  const confidence = buildConfidenceBreakdown(repoClassification, signals);

  // Timestamp
  const evaluatedAt = new Date().toISOString();

  // PHASE 6: Calculate stable fingerprints
  const evaluationFingerprint = policyPlan ? calculateEvaluationFingerprint(input, policyPlan) : undefined;
  const policyRevision = policyPlan ? extractPolicyRevision(policyPlan) : undefined;

  return {
    repo,
    pr,
    workspace,
    signals,
    confidence,
    evaluatedAt,
    // PHASE 6: Stable fingerprints for reproducibility
    evaluationFingerprint,
    policyRevision,
  };
}

/**
 * Detect signals from PR files
 * This is deterministic and based on file patterns
 */
function detectSignals(prFiles: GitHubFile[], inputFiles: GatekeeperInput['files']): DetectedSignals {
  // Combine both file sources (prFiles is more complete, inputFiles is fallback)
  const allFiles = prFiles.length > 0 ? prFiles : inputFiles.map(f => ({ filename: f.filename }));
  const filenames = allFiles.map(f => f.filename);

  // File-based signals
  const filesPresent = filenames;
  const manifestTypes: string[] = [];

  // Detect manifest types
  if (filenames.some(f => f === 'package.json')) manifestTypes.push('npm');
  if (filenames.some(f => f.match(/openapi\.(yaml|yml|json)$/i))) manifestTypes.push('openapi');
  if (filenames.some(f => f.match(/schema\.graphql$/i))) manifestTypes.push('graphql');
  if (filenames.some(f => f.match(/\.proto$/i))) manifestTypes.push('proto');
  if (filenames.some(f => f.match(/pom\.xml$/i))) manifestTypes.push('maven');
  if (filenames.some(f => f.match(/build\.gradle$/i))) manifestTypes.push('gradle');
  if (filenames.some(f => f.match(/Cargo\.toml$/i))) manifestTypes.push('cargo');
  if (filenames.some(f => f.match(/go\.mod$/i))) manifestTypes.push('go');

  // Language/framework signals (basic detection)
  const languages: { language: string; percentage: number }[] = [];
  const frameworks: string[] = [];

  // Simple language detection based on file extensions
  const jsFiles = filenames.filter(f => f.match(/\.(js|jsx|ts|tsx)$/i)).length;
  const pyFiles = filenames.filter(f => f.match(/\.py$/i)).length;
  const javaFiles = filenames.filter(f => f.match(/\.java$/i)).length;
  const goFiles = filenames.filter(f => f.match(/\.go$/i)).length;
  const totalCodeFiles = jsFiles + pyFiles + javaFiles + goFiles;

  if (totalCodeFiles > 0) {
    if (jsFiles > 0) languages.push({ language: 'javascript', percentage: jsFiles / totalCodeFiles });
    if (pyFiles > 0) languages.push({ language: 'python', percentage: pyFiles / totalCodeFiles });
    if (javaFiles > 0) languages.push({ language: 'java', percentage: javaFiles / totalCodeFiles });
    if (goFiles > 0) languages.push({ language: 'go', percentage: goFiles / totalCodeFiles });
  }

  // Framework detection (basic)
  if (filenames.some(f => f.match(/express/i))) frameworks.push('express');
  if (filenames.some(f => f.match(/react/i))) frameworks.push('react');
  if (filenames.some(f => f.match(/django/i))) frameworks.push('django');
  if (filenames.some(f => f.match(/spring/i))) frameworks.push('spring');

  // Service catalog signals
  const serviceCatalogFile = filenames.find(f => f.match(/service\.yaml$|catalog-info\.yaml$|backstage\.yaml$/i));
  const serviceCatalog = serviceCatalogFile ? {
    name: 'unknown', // Would need to parse file to get name
    tier: 'unknown' as const,
    owner: 'unknown',
    source: serviceCatalogFile.includes('catalog-info') ? 'catalog-info.yaml' as const : 'service.yaml' as const,
  } : undefined;

  // Operational signals
  const hasRunbook = filenames.some(f => f.match(/runbook\.md$|runbook\//i));
  const hasSLO = filenames.some(f => f.match(/slo\.yaml$|sli\.yaml$|slo\//i));
  const hasAlerts = filenames.some(f => f.match(/alert.*\.yaml$|prometheus.*\.yaml$/i));

  // Build system signals
  let buildSystem: DetectedSignals['buildSystem'] = 'unknown';
  if (manifestTypes.includes('npm')) buildSystem = 'npm';
  else if (manifestTypes.includes('maven')) buildSystem = 'maven';
  else if (manifestTypes.includes('gradle')) buildSystem = 'gradle';
  else if (manifestTypes.includes('cargo')) buildSystem = 'cargo';
  else if (manifestTypes.includes('go')) buildSystem = 'go';

  // API signals
  const hasOpenAPI = manifestTypes.includes('openapi');
  const hasGraphQL = manifestTypes.includes('graphql');
  const hasProto = manifestTypes.includes('proto');

  // Database signals
  const hasMigrations = filenames.some(f => f.match(/migrations?\//i));
  const hasORM = filenames.some(f => f.match(/models?\//i) || f.match(/entities?\//i));

  return {
    filesPresent,
    manifestTypes,
    languages,
    frameworks,
    serviceCatalog,
    hasRunbook,
    hasSLO,
    hasAlerts,
    buildSystem,
    hasOpenAPI,
    hasGraphQL,
    hasProto,
    hasMigrations,
    hasORM,
  };
}

/**
 * Build confidence breakdown from repo classification and signals
 * Separates classification confidence from decision confidence
 */
function buildConfidenceBreakdown(
  repoClassification?: RepoClassification,
  signals?: DetectedSignals
): ConfidenceBreakdown {
  // Classification confidence (repo type)
  const classification = repoClassification ? {
    repoType: repoClassification.repoType,
    confidence: repoClassification.confidence,
    source: (repoClassification.evidence.some(e => e.includes('explicit')) ? 'explicit' : 'inferred') as 'explicit' | 'inferred',
    evidence: repoClassification.evidence,
  } : {
    repoType: 'unknown' as const,
    confidence: 0,
    source: 'inferred' as const,
    evidence: ['No repo classification available'],
  };

  // Tier confidence (service tier)
  const tier = repoClassification && repoClassification.serviceTier !== 'unknown' ? {
    tier: repoClassification.serviceTier,
    confidence: repoClassification.confidence,
    source: (signals?.serviceCatalog ? 'catalog' : (signals?.hasSLO ? 'slo' : 'inferred')) as 'catalog' | 'slo' | 'inferred',
    evidence: repoClassification.evidence.filter(e => e.includes('tier') || e.includes('SLO')),
  } : undefined;

  // Decision confidence (evidence quality)
  // Start with high confidence for deterministic baseline checks
  const decision = {
    confidence: 0.95, // High confidence for deterministic checks
    basis: 'deterministic_baseline' as const,
    degradationReasons: [] as string[],
  };

  // Degrade confidence if we're missing key signals
  if (!repoClassification) {
    decision.confidence = Math.max(0.7, decision.confidence - 0.1);
    decision.degradationReasons.push('No repo classification available');
  }

  if (!signals?.serviceCatalog && classification.repoType === 'service') {
    decision.confidence = Math.max(0.7, decision.confidence - 0.05);
    decision.degradationReasons.push('Service repo without service catalog');
  }

  return {
    classification,
    tier,
    decision,
  };
}

/**
 * Calculate stable evaluation fingerprint (PHASE 6)
 *
 * This creates a deterministic hash of the evaluation inputs + policy plan
 * to enable reproducible evaluations and caching.
 *
 * Formula: SHA-256(repo + PR + headSha + policyPlan)
 */
function calculateEvaluationFingerprint(
  input: GatekeeperInput,
  policyPlan: PolicyPlan
): string {
  // Build deterministic input string
  const fingerprintInput = {
    repo: `${input.owner}/${input.repo}`,
    pr: input.prNumber,
    headSha: input.headSha,
    // Include policy plan fingerprint (which packs + versions)
    policyPlan: {
      basePacks: policyPlan.basePacks.map(p => `${p.packId}@${p.version}`).sort(),
      overlays: policyPlan.overlays.map(o => `${o.packId}@${o.version}`).sort(),
    },
  };

  // Create SHA-256 hash
  const hash = createHash('sha256')
    .update(JSON.stringify(fingerprintInput))
    .digest('hex');

  return `sha256:${hash}`;
}

/**
 * Extract policy revision from PolicyPlan (PHASE 6)
 *
 * This tracks which version of the policy was used for the evaluation.
 * Enables audit trail and policy change tracking.
 */
function extractPolicyRevision(policyPlan: PolicyPlan): string {
  // Use the first base pack's version as the policy revision
  // In the future, this could be a git SHA or bundle version
  const firstBasePack = policyPlan.basePacks[0];

  if (!firstBasePack) {
    return 'unknown';
  }

  // Format: "bundle:packId@version"
  return `bundle:${firstBasePack.packId}@${firstBasePack.version}`;
}

