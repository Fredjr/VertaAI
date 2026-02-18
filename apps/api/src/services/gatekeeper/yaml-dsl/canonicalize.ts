/**
 * Canonical Hashing Implementation
 * Migration Plan v5.0 - Gap #10 (Fourth Review)
 *
 * CRITICAL: This is the SINGLE canonical implementation
 * All pack hashing MUST use this function
 */

import { createHash } from 'crypto';
import yaml from 'yaml';

/**
 * Recursively canonicalize object for deterministic hashing
 * Uses parent path for set-like array detection (not element path)
 *
 * CRITICAL RULES:
 * 1. Sort object keys recursively at all nesting levels
 * 2. Sort set-like arrays (tags, include/exclude patterns, requiredChecks)
 * 3. Preserve order for non-set arrays (rules, obligations)
 * 4. Normalize undefined to null
 * 5. CRITICAL FIX (Gap #9): Never return undefined at root level
 * 6. Skip undefined/null values in objects
 */
export function canonicalize(obj: any, parentPath: string = ''): any {
  if (obj === null || obj === undefined) {
    return null;  // Normalize undefined to null
  }

  if (Array.isArray(obj)) {
    // Check if parent path is a set-like array
    if (isSetLikeArrayPath(parentPath)) {
      // Sort set-like arrays for deterministic hashing
      return obj
        .map(item => canonicalize(item, parentPath))  // Use parent path, not element path
        .filter(item => item !== null && item !== undefined)  // Remove null/undefined
        .sort((a, b) => {
          const aStr = typeof a === 'string' ? a : JSON.stringify(a);
          const bStr = typeof b === 'string' ? b : JSON.stringify(b);
          return aStr.localeCompare(bStr);
        });
    }
    // Non-set arrays: preserve order, filter out null/undefined
    return obj
      .map((item, idx) => canonicalize(item, `${parentPath}[${idx}]`))
      .filter(item => item !== null && item !== undefined);
  }

  if (typeof obj === 'object') {
    const sorted: any = {};
    const keys = Object.keys(obj).sort();

    // CRITICAL FIX (Gap #9): Return null instead of undefined for empty objects
    if (keys.length === 0) return null;

    for (const key of keys) {
      const value = canonicalize(obj[key], `${parentPath}.${key}`);
      // Skip null and undefined values
      if (value !== undefined && value !== null) {
        sorted[key] = value;
      }
    }

    // CRITICAL FIX (Gap #9): Return null instead of undefined
    return Object.keys(sorted).length > 0 ? sorted : null;
  }

  return obj;
}

/**
 * Detect set-like arrays by exact prefix match (not includes())
 * Bug #4 Fix: Normalize path to strip array indices before matching
 * 
 * Actual paths look like: ".rules[0].trigger.anyChangedPaths"
 * We need to match against: "trigger.anyChangedPaths"
 */
function isSetLikeArrayPath(path: string): boolean {
  const setLikePaths = [
    'metadata.tags',
    'scope.actorSignals',
    'scope.branches.include',
    'scope.branches.exclude',
    'scope.prEvents',
    'trigger.anyChangedPaths',
    'trigger.allChangedPaths',
    'trigger.anyFileExtensions',
    'artifacts.requiredTypes',
    'evaluation.skipIf.allChangedPaths',
    'evaluation.skipIf.labels',
    'evaluation.skipIf.prBodyContains',
    'skipIf.allChangedPaths',
    'skipIf.labels',
    'skipIf.prBodyContains',
  ];

  // Bug #4 Fix: Normalize path by:
  // 1. Strip leading dot
  // 2. Remove array indices like [0], [1], etc.
  // Example: ".rules[0].trigger.anyChangedPaths" → "rules.trigger.anyChangedPaths"
  const normalizedPath = path
    .replace(/^\./, '')  // Remove leading dot
    .replace(/\[\d+\]/g, '');  // Remove array indices

  // Check if normalized path ends with any set-like pattern
  // Use suffix matching to handle nested paths like "rules.trigger.anyChangedPaths"
  return setLikePaths.some(pattern =>
    normalizedPath === pattern ||
    normalizedPath.endsWith(`.${pattern}`)
  );
}

/**
 * Compute full SHA-256 hash (64 hex chars) of canonicalized pack YAML
 * CRITICAL: Root canonical output is NEVER undefined (Gap #9 - Fourth Review)
 */
export function computePackHashFull(packYaml: string): string {
  const parsed = yaml.parse(packYaml);
  const canonical = canonicalize(parsed);

  // CRITICAL: Ensure root is never undefined (would break JSON.stringify)
  const safeCanonical = canonical === undefined ? null : canonical;

  const canonicalJson = JSON.stringify(safeCanonical);
  if (!canonicalJson) {
    throw new Error('Failed to serialize canonical pack (root was undefined)');
  }

  return createHash('sha256').update(canonicalJson).digest('hex');  // 64 chars
}

/**
 * Short hash for UI display (first 16 chars)
 */
export function computePackHashShort(packHashFull: string): string {
  return packHashFull.slice(0, 16);
}

/**
 * Store in DB: trackAPackHashPublished = packHashFull (64 chars)
 * Show in UI: packHashShort (16 chars)
 * Include in evidence bundle: packHashFull (64 chars)
 */

