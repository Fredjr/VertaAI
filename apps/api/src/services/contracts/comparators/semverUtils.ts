/**
 * Semver Utility Functions
 * 
 * Provides semver parsing, comparison, and version bump validation
 * for OpenAPI version bump comparator.
 * 
 * Follows Semantic Versioning 2.0.0 (https://semver.org/)
 */

import type { Change } from './openapiBreakingChanges.js';

// ======================================================================
// TYPES
// ======================================================================

export interface Semver {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

export type BumpType = 'major' | 'minor' | 'patch' | 'none';

// ======================================================================
// PARSING
// ======================================================================

/**
 * Parse a semver string into components
 * Supports: 1.2.3, v1.2.3, 1.2.3-alpha.1, 1.2.3+build.123
 */
export function parseSemver(version: string): Semver | null {
  // Remove leading 'v' if present
  const cleaned = version.trim().replace(/^v/, '');

  // Regex for semver: major.minor.patch[-prerelease][+build]
  const regex = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/;
  const match = cleaned.match(regex);

  if (!match) {
    return null;
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
    build: match[5],
  };
}

/**
 * Format a Semver object back to string
 */
export function formatSemver(semver: Semver): string {
  let version = `${semver.major}.${semver.minor}.${semver.patch}`;
  if (semver.prerelease) {
    version += `-${semver.prerelease}`;
  }
  if (semver.build) {
    version += `+${semver.build}`;
  }
  return version;
}

// ======================================================================
// COMPARISON
// ======================================================================

/**
 * Compare two semver versions and determine the bump type
 * Returns 'major', 'minor', 'patch', or 'none'
 */
export function compareSemver(v1: Semver, v2: Semver): BumpType {
  if (v2.major > v1.major) {
    return 'major';
  }
  if (v2.major < v1.major) {
    return 'none'; // Version went backwards (invalid)
  }

  if (v2.minor > v1.minor) {
    return 'minor';
  }
  if (v2.minor < v1.minor) {
    return 'none'; // Version went backwards (invalid)
  }

  if (v2.patch > v1.patch) {
    return 'patch';
  }

  return 'none'; // No version change
}

/**
 * Check if v2 is greater than v1
 */
export function isGreaterThan(v1: Semver, v2: Semver): boolean {
  if (v2.major !== v1.major) {
    return v2.major > v1.major;
  }
  if (v2.minor !== v1.minor) {
    return v2.minor > v1.minor;
  }
  return v2.patch > v1.patch;
}

// ======================================================================
// VERSION BUMP VALIDATION
// ======================================================================

/**
 * Determine the required version bump based on detected changes
 * 
 * Rules:
 * - Breaking changes → major bump required
 * - New features (non-breaking) → minor bump required
 * - Bug fixes only → patch bump required
 * - No changes → no bump required
 */
export function determineRequiredBump(changes: Change[]): BumpType {
  if (changes.length === 0) {
    return 'none';
  }

  // Check for breaking changes
  const hasBreakingChanges = changes.some(c => c.breaking);
  if (hasBreakingChanges) {
    return 'major';
  }

  // Check for new features (added endpoints, added schemas)
  const hasNewFeatures = changes.some(c =>
    c.type === 'endpoint_added' ||
    c.type === 'schema_added' ||
    c.type === 'parameter_added'
  );
  if (hasNewFeatures) {
    return 'minor';
  }

  // Otherwise, assume patch (bug fixes, documentation changes, etc.)
  return 'patch';
}

/**
 * Validate that the actual version bump matches the required bump
 * 
 * Returns true if valid, false otherwise
 */
export function validateVersionBump(
  actualBump: BumpType,
  requiredBump: BumpType
): boolean {
  // No changes, no bump required
  if (requiredBump === 'none') {
    return actualBump === 'none';
  }

  // Major bump required
  if (requiredBump === 'major') {
    return actualBump === 'major';
  }

  // Minor bump required (major is also acceptable)
  if (requiredBump === 'minor') {
    return actualBump === 'minor' || actualBump === 'major';
  }

  // Patch bump required (minor or major is also acceptable)
  if (requiredBump === 'patch') {
    return actualBump === 'patch' || actualBump === 'minor' || actualBump === 'major';
  }

  return false;
}

