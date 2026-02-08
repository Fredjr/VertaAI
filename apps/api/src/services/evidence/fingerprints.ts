// Fingerprint Generation for Suppression System
// Creates 3-level fingerprints for deterministic learning
// Based on GAP_ANALYSIS.md suppression specifications

import { SourceEvidence, TargetEvidence } from './types.js';
import { createHash } from 'crypto';

interface GenerateFingerprintsArgs {
  sourceEvidence: SourceEvidence;
  targetEvidence: TargetEvidence;
  driftType: string;
}

/**
 * Generate 3-level fingerprints for suppression system
 */
export function generateFingerprints(args: GenerateFingerprintsArgs): { strict: string; medium: string; broad: string } {
  const { sourceEvidence, targetEvidence, driftType } = args;
  
  // Extract key tokens for fingerprinting
  const sourceTokens = extractSourceTokens(sourceEvidence);
  const targetTokens = extractTargetTokens(targetEvidence);
  const normalizedTokens = normalizeTokens([...sourceTokens, ...targetTokens]);
  
  // Generate strict fingerprint (exact match)
  const strictFingerprint = generateStrictFingerprint(sourceEvidence, targetEvidence, driftType, normalizedTokens);
  
  // Generate medium fingerprint (normalized tokens)
  const mediumFingerprint = generateMediumFingerprint(sourceEvidence.sourceType, targetEvidence.docSystem, driftType, normalizedTokens);
  
  // Generate broad fingerprint (high-level pattern)
  const broadFingerprint = generateBroadFingerprint(sourceEvidence.sourceType, targetEvidence.surface, driftType);
  
  return {
    strict: strictFingerprint,
    medium: mediumFingerprint,
    broad: broadFingerprint
  };
}

/**
 * Extract tokens from source evidence
 */
function extractSourceTokens(sourceEvidence: SourceEvidence): string[] {
  const tokens: string[] = [];
  const artifacts = sourceEvidence.artifacts;
  
  if (artifacts.prDiff) {
    // Extract file names and key diff tokens
    tokens.push(...artifacts.prDiff.filesChanged.map(f => f.split('/').pop() || f));
    tokens.push(...extractTokensFromText(artifacts.prDiff.excerpt));
  }
  
  if (artifacts.incidentTimeline) {
    tokens.push(artifacts.incidentTimeline.severity);
    tokens.push(...extractTokensFromText(artifacts.incidentTimeline.excerpt));
  }
  
  if (artifacts.slackMessages) {
    tokens.push(...extractTokensFromText(artifacts.slackMessages.excerpt));
  }
  
  if (artifacts.alertData) {
    tokens.push(artifacts.alertData.alertType);
    tokens.push(...extractTokensFromText(artifacts.alertData.excerpt));
  }
  
  if (artifacts.iacChanges) {
    tokens.push(...artifacts.iacChanges.resourcesChanged);
    tokens.push(artifacts.iacChanges.changeType);
  }
  
  if (artifacts.ownershipChanges) {
    tokens.push(...artifacts.ownershipChanges.pathsChanged);
    tokens.push(...artifacts.ownershipChanges.ownersAdded);
    tokens.push(...artifacts.ownershipChanges.ownersRemoved);
  }
  
  return tokens.filter(Boolean);
}

/**
 * Extract tokens from target evidence
 */
function extractTargetTokens(targetEvidence: TargetEvidence): string[] {
  const tokens: string[] = [];
  
  // Add doc system and surface
  tokens.push(targetEvidence.docSystem);
  tokens.push(targetEvidence.surface);
  
  // Add tokens from claims
  for (const claim of targetEvidence.claims) {
    tokens.push(claim.claimType);
    tokens.push(...extractTokensFromText(claim.snippet));
  }
  
  // Add tokens from doc title
  tokens.push(...extractTokensFromText(targetEvidence.docTitle));
  
  return tokens.filter(Boolean);
}

/**
 * Extract meaningful tokens from text
 */
function extractTokensFromText(text: string): string[] {
  if (!text) return [];
  
  // Remove common words and extract meaningful tokens
  const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should']);
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2 && !commonWords.has(token))
    .slice(0, 20); // Limit to top 20 tokens
}

/**
 * Normalize tokens for consistent matching
 */
function normalizeTokens(tokens: string[]): string[] {
  return tokens.map(token => {
    let normalized = token.toLowerCase();
    
    // Normalize port numbers
    normalized = normalized.replace(/:\d+/g, ':PORT');
    
    // Normalize endpoints
    normalized = normalized.replace(/\/api\/v\d+/g, '/api/VERSION');
    
    // Normalize tool names
    const toolMappings: Record<string, string> = {
      'kubectl': 'k8s_tool',
      'helm': 'k8s_tool',
      'docker': 'container_tool',
      'podman': 'container_tool',
      'terraform': 'iac_tool',
      'pulumi': 'iac_tool'
    };
    
    const mappedTool = toolMappings[normalized];
    if (mappedTool) {
      normalized = mappedTool;
    }
    
    // Normalize service names (remove environment suffixes)
    normalized = normalized.replace(/-?(dev|staging|prod|production)$/g, '');
    
    return normalized;
  }).filter(Boolean);
}

/**
 * Generate strict fingerprint (exact match required)
 */
function generateStrictFingerprint(
  sourceEvidence: SourceEvidence, 
  targetEvidence: TargetEvidence, 
  driftType: string, 
  normalizedTokens: string[]
): string {
  const components = [
    sourceEvidence.sourceType,
    sourceEvidence.sourceId,
    targetEvidence.docSystem,
    targetEvidence.docId,
    driftType,
    normalizedTokens.sort().join('|')
  ];
  
  return hashComponents(components, 'strict');
}

/**
 * Generate medium fingerprint (normalized tokens)
 */
function generateMediumFingerprint(
  sourceType: string, 
  docSystem: string, 
  driftType: string, 
  normalizedTokens: string[]
): string {
  // Use top 10 most frequent tokens
  const tokenCounts: Record<string, number> = {};
  normalizedTokens.forEach(token => {
    tokenCounts[token] = (tokenCounts[token] || 0) + 1;
  });
  
  const topTokens = Object.entries(tokenCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([token]) => token);
  
  const components = [
    sourceType,
    docSystem,
    driftType,
    topTokens.sort().join('|')
  ];
  
  return hashComponents(components, 'medium');
}

/**
 * Generate broad fingerprint (high-level pattern)
 */
function generateBroadFingerprint(
  sourceType: string, 
  targetSurface: string, 
  driftType: string
): string {
  const components = [
    sourceType,
    targetSurface,
    driftType
  ];
  
  return hashComponents(components, 'broad');
}

/**
 * Hash components into fingerprint
 */
function hashComponents(components: string[], level: string): string {
  const input = components.join('::');
  const hash = createHash('sha256').update(input).digest('hex');
  return `${level}_${hash.substring(0, 16)}`;
}

/**
 * Check if two fingerprints match at any level
 */
export function fingerprintsMatch(
  fp1: { strict: string; medium: string; broad: string },
  fp2: { strict: string; medium: string; broad: string }
): { matches: boolean; level?: 'strict' | 'medium' | 'broad'; confidence?: number } {
  if (fp1.strict === fp2.strict) {
    return { matches: true, level: 'strict', confidence: 0.95 };
  }

  if (fp1.medium === fp2.medium) {
    return { matches: true, level: 'medium', confidence: 0.8 };
  }

  if (fp1.broad === fp2.broad) {
    return { matches: true, level: 'broad', confidence: 0.6 };
  }

  return { matches: false };
}

/**
 * Determine if fingerprint should escalate to broader level
 */
export function shouldEscalateFingerprint(
  currentLevel: 'strict' | 'medium' | 'broad',
  falsePositiveCount: number
): { shouldEscalate: boolean; newLevel: 'strict' | 'medium' | 'broad' } {
  if (currentLevel === 'strict' && falsePositiveCount >= 3) {
    return { shouldEscalate: true, newLevel: 'medium' };
  }

  if (currentLevel === 'medium' && falsePositiveCount >= 5) {
    return { shouldEscalate: true, newLevel: 'broad' };
  }

  return { shouldEscalate: false, newLevel: currentLevel };
}
