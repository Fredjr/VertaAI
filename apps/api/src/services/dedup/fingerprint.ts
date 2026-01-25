/**
 * Drift Fingerprinting Service
 * 
 * Computes fingerprints for drift candidates to enable deduplication.
 * Fingerprint = hash of (workspace + service + drift_type + domains + doc_id + key_tokens)
 * 
 * @see IMPLEMENTATION_PLAN.md Section 3.3
 */

import crypto from 'crypto';

export interface FingerprintInput {
  workspaceId: string;
  service: string | null;
  driftType: string;
  driftDomains: string[];
  docId: string;
  keyTokens: string[]; // Extracted from evidence
}

/**
 * Compute a fingerprint hash for a drift candidate.
 * Used to detect duplicate drifts across different signals.
 */
export function computeDriftFingerprint(input: FingerprintInput): string {
  const normalized = {
    ws: input.workspaceId,
    svc: input.service || '_none_',
    type: input.driftType,
    domains: [...input.driftDomains].sort(),
    doc: input.docId,
    tokens: [...input.keyTokens].sort().slice(0, 10), // Top 10 tokens for stability
  };

  const payload = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

/**
 * Extract key tokens from evidence text for fingerprinting.
 * Tokens include commands, URLs, config keys, and other identifiers.
 */
export function extractKeyTokens(evidence: string): string[] {
  const tokens: string[] = [];

  // Extract CLI commands: kubectl, helm, docker, terraform, aws, gcloud, npm, yarn
  const commandRegex = /\b(kubectl|helm|docker|terraform|aws|gcloud|npm|yarn|pnpm|git)\s+[\w-]+/gi;
  const commands = evidence.match(commandRegex) || [];
  tokens.push(...commands.map(c => c.toLowerCase().trim()));

  // Extract URLs and paths
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  const urls = evidence.match(urlRegex) || [];
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      tokens.push(parsed.pathname.toLowerCase());
    } catch {
      // Invalid URL, skip
    }
  }

  // Extract file paths
  const pathRegex = /(?:^|\s)(\/[\w\-./]+|[\w\-]+\/[\w\-./]+)/g;
  const paths = evidence.match(pathRegex) || [];
  tokens.push(...paths.map(p => p.trim().toLowerCase()));

  // Extract config keys: FOO_BAR, foo.bar.baz
  const configRegex = /\b[A-Z][A-Z0-9_]{2,}\b|\b\w+\.\w+\.\w+\b/g;
  const configs = evidence.match(configRegex) || [];
  tokens.push(...configs.map(c => c.toLowerCase()));

  // Extract version numbers: v1.2.3, 1.2.3
  const versionRegex = /\bv?\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?\b/g;
  const versions = evidence.match(versionRegex) || [];
  tokens.push(...versions.map(v => v.toLowerCase()));

  // Extract port numbers
  const portRegex = /\b(?:port|PORT)\s*[:=]?\s*(\d{2,5})\b/gi;
  const portMatches = evidence.matchAll(portRegex);
  for (const match of portMatches) {
    tokens.push(`port:${match[1]}`);
  }

  // Deduplicate and return
  return [...new Set(tokens)].filter(t => t.length > 2);
}

/**
 * Compute a simple similarity score between two sets of tokens.
 * Returns a value between 0 (no overlap) and 1 (identical).
 */
export function computeTokenSimilarity(tokens1: string[], tokens2: string[]): number {
  if (tokens1.length === 0 && tokens2.length === 0) return 1;
  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  let intersection = 0;
  for (const token of set1) {
    if (set2.has(token)) intersection++;
  }

  // Jaccard similarity
  const union = set1.size + set2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Check if two fingerprints are similar enough to be considered duplicates.
 * This is a simple equality check - fingerprints are designed to be exact matches.
 */
export function areFingerprintsSimilar(fp1: string, fp2: string): boolean {
  return fp1 === fp2;
}

/**
 * Generate a partial fingerprint for fuzzy matching.
 * Uses only workspace, service, and drift type (ignores doc and tokens).
 */
export function computePartialFingerprint(
  workspaceId: string,
  service: string | null,
  driftType: string
): string {
  const normalized = {
    ws: workspaceId,
    svc: service || '_none_',
    type: driftType,
  };

  const payload = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

