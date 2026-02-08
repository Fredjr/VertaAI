// DriftPlan Versioning with SHA-256
// Phase 3: Control-Plane Architecture
// Ensures reproducibility and content-based versioning

import crypto from 'crypto';
import { DriftPlanConfig } from './types.js';

/**
 * Generate SHA-256 hash of plan content for versioning
 * This ensures reproducibility - same content = same hash
 */
export function generatePlanHash(args: {
  name: string;
  scopeType: string;
  scopeRef?: string;
  primaryDocId?: string;
  primaryDocSystem?: string;
  docClass?: string;
  config: DriftPlanConfig;
}): string {
  // Create a canonical representation of the plan content
  const canonical = {
    name: args.name,
    scopeType: args.scopeType,
    scopeRef: args.scopeRef || null,
    primaryDocId: args.primaryDocId || null,
    primaryDocSystem: args.primaryDocSystem || null,
    docClass: args.docClass || null,
    config: {
      inputSources: [...args.config.inputSources].sort(),
      driftTypes: [...args.config.driftTypes].sort(),
      allowedOutputs: [...args.config.allowedOutputs].sort(),
      thresholds: args.config.thresholds,
      eligibility: args.config.eligibility,
      sectionTargets: args.config.sectionTargets,
      impactRules: args.config.impactRules,
      writeback: args.config.writeback,
    },
  };

  // Convert to stable JSON string (sorted keys)
  const jsonString = JSON.stringify(canonical, Object.keys(canonical).sort());

  // Generate SHA-256 hash
  const hash = crypto.createHash('sha256');
  hash.update(jsonString);
  return hash.digest('hex');
}

/**
 * Compare two plan hashes to check if content has changed
 */
export function plansAreIdentical(hash1: string, hash2: string): boolean {
  return hash1 === hash2;
}

/**
 * Validate plan hash
 */
export function validatePlanHash(args: {
  name: string;
  scopeType: string;
  scopeRef?: string;
  primaryDocId?: string;
  primaryDocSystem?: string;
  docClass?: string;
  config: DriftPlanConfig;
  expectedHash: string;
}): boolean {
  const actualHash = generatePlanHash(args);
  return plansAreIdentical(actualHash, args.expectedHash);
}

/**
 * Generate version number for a new plan version
 * Increments from parent version or starts at 1
 */
export function generateVersionNumber(parentVersion?: number): number {
  return parentVersion ? parentVersion + 1 : 1;
}

/**
 * Create version metadata for audit trail
 */
export function createVersionMetadata(args: {
  version: number;
  versionHash: string;
  parentId?: string;
  createdBy?: string;
}): {
  version: number;
  versionHash: string;
  parentId?: string;
  createdBy?: string;
  createdAt: Date;
} {
  return {
    version: args.version,
    versionHash: args.versionHash,
    parentId: args.parentId,
    createdBy: args.createdBy,
    createdAt: new Date(),
  };
}

/**
 * Check if a plan update requires a new version
 * Returns true if content has changed (different hash)
 */
export function requiresNewVersion(args: {
  currentHash: string;
  newHash: string;
}): boolean {
  return !plansAreIdentical(args.currentHash, args.newHash);
}

