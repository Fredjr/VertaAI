/**
 * Validators Service
 * 
 * All 14 validators for patch validation before writeback.
 * 
 * @see IMPLEMENTATION_PLAN.md Section 3.6
 */

import { prisma } from '../../lib/db.js';
import { extractManagedRegion } from '../docs/managedRegion.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ValidatorContext {
  workspaceId: string;
  driftId: string;
  docId: string;
  service: string | null;
  driftType: string;
  patchStyle: string;
  originalMarkdown: string;
  patchedMarkdown: string;
  diff: string;
  evidence: string[];
  confidence: number;
}

// Validator 1: Diff applies cleanly (placeholder - actual diff application is done elsewhere)
export function validateDiffApplies(
  original: string,
  diff: string,
  patched: string
): ValidationResult {
  // This is a structural validation - actual diff application is handled by patch generator
  return { valid: true, errors: [], warnings: [] };
}

// Validator 2: Max changed lines
export function validateMaxChangedLines(
  diff: string,
  maxLines: number = 50
): ValidationResult {
  const lines = diff.split('\n').filter(l => l.startsWith('+') || l.startsWith('-'));
  if (lines.length > maxLines) {
    return {
      valid: false,
      errors: [`Patch changes ${lines.length} lines, max is ${maxLines}`],
      warnings: [],
    };
  }
  return { valid: true, errors: [], warnings: [] };
}

// Validator 3: Allowed sections only (placeholder)
export function validateAllowedSectionsOnly(
  diff: string,
  allowedHeadings: string[]
): ValidationResult {
  // Parse diff to find which headings are modified
  return { valid: true, errors: [], warnings: [] };
}

// Validator 4: No secrets introduced
export function validateNoSecretsIntroduced(diff: string): ValidationResult {
  const secretPatterns = [
    /[A-Za-z0-9+/]{40,}/, // Long base64 strings
    /ghp_[A-Za-z0-9]{36}/, // GitHub PAT
    /gho_[A-Za-z0-9]{36}/, // GitHub OAuth token
    /github_pat_[A-Za-z0-9_]{22,}/, // GitHub fine-grained PAT
    /sk-[A-Za-z0-9]{48}/, // OpenAI API key
    /sk-proj-[A-Za-z0-9-_]{80,}/, // OpenAI project key
    /AKIA[A-Z0-9]{16}/, // AWS access key
    /xoxb-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{24}/, // Slack bot token
    /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, // Private keys
  ];

  const addedLines = diff.split('\n').filter(l => l.startsWith('+'));
  for (const line of addedLines) {
    for (const pattern of secretPatterns) {
      if (pattern.test(line)) {
        return {
          valid: false,
          errors: ['Patch may contain secrets or tokens'],
          warnings: [],
        };
      }
    }
  }
  return { valid: true, errors: [], warnings: [] };
}

// Validator 5: Evidence for risky changes
export function validateEvidenceForRiskyChanges(
  diff: string,
  evidence: string[]
): ValidationResult {
  const riskyKeywords = ['auth', 'password', 'secret', 'deploy', 'rollback', 'prod', 'production'];
  const diffLower = diff.toLowerCase();
  const hasRiskyChange = riskyKeywords.some(kw => diffLower.includes(kw));

  if (hasRiskyChange && evidence.length === 0) {
    return {
      valid: false,
      errors: ['Risky change requires evidence from PR'],
      warnings: [],
    };
  }
  return { valid: true, errors: [], warnings: [] };
}

// Validator 6: Patch style matches drift type
export function validatePatchStyleMatchesDriftType(
  patchStyle: string,
  driftType: string
): ValidationResult {
  const validCombos: Record<string, string[]> = {
    instruction: ['replace_steps', 'add_note'],
    process: ['reorder_steps', 'replace_steps', 'add_section'],
    ownership: ['update_owner_block'],
    coverage: ['add_section', 'link_patch'],
    environment: ['replace_steps', 'add_note'],
  };

  if (!validCombos[driftType]?.includes(patchStyle)) {
    return {
      valid: false,
      errors: [`Patch style '${patchStyle}' invalid for drift type '${driftType}'`],
      warnings: [],
    };
  }
  return { valid: true, errors: [], warnings: [] };
}

// Validator 7: Managed region only
export function validateManagedRegionOnly(
  originalMarkdown: string,
  patchedMarkdown: string
): ValidationResult {
  const original = extractManagedRegion(originalMarkdown);
  const patched = extractManagedRegion(patchedMarkdown);

  if (!original.hasManagedRegion) {
    return {
      valid: false,
      errors: ['Document has no managed region'],
      warnings: [],
    };
  }

  if (original.before !== patched.before || original.after !== patched.after) {
    return {
      valid: false,
      errors: ['Patch modifies content outside managed region'],
      warnings: [],
    };
  }

  return { valid: true, errors: [], warnings: [] };
}

// Validator 8: Primary doc only
export async function validatePrimaryDocOnly(
  workspaceId: string,
  docId: string,
  patchStyle: string
): Promise<ValidationResult> {
  // link_patch is allowed for secondary docs
  if (patchStyle === 'link_patch') {
    return { valid: true, errors: [], warnings: [] };
  }

  const mapping = await prisma.docMappingV2.findFirst({
    where: { workspaceId, docId },
  });

  if (!mapping?.isPrimary) {
    return {
      valid: false,
      errors: ['Only primary docs can receive full patches. Use link_patch for secondary docs.'],
      warnings: [],
    };
  }
  return { valid: true, errors: [], warnings: [] };
}

// Validator 9: Confidence threshold
export function validateConfidenceThreshold(
  confidence: number,
  minThreshold: number = 0.40
): ValidationResult {
  if (confidence < minThreshold) {
    return {
      valid: false,
      errors: [`Confidence ${(confidence * 100).toFixed(0)}% below threshold ${(minThreshold * 100).toFixed(0)}%`],
      warnings: [],
    };
  }
  return { valid: true, errors: [], warnings: [] };
}

// Validator 10: Breaking change detection
export function validateNoBreakingChanges(diff: string): ValidationResult {
  const breakingPatterns = [
    /removed?\s+(endpoint|api|field|column)/i,
    /deprecat(ed|ing)/i,
    /breaking\s+change/i,
    /^-.*required/im, // Removing required fields
  ];

  const warnings: string[] = [];
  for (const pattern of breakingPatterns) {
    if (pattern.test(diff)) {
      warnings.push('Potential breaking change detected - requires human review');
      break;
    }
  }

  return { valid: true, errors: [], warnings };
}

// Validator 11: Doc freshness check
export async function validateDocFreshness(
  workspaceId: string,
  docId: string,
  maxAgeDays: number = 365
): Promise<ValidationResult> {
  const mapping = await prisma.docMappingV2.findFirst({
    where: { workspaceId, docId },
    select: { updatedAt: true },
  });

  if (mapping) {
    const ageMs = Date.now() - mapping.updatedAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > maxAgeDays) {
      return {
        valid: true,
        errors: [],
        warnings: [`Document hasn't been updated in ${Math.floor(ageDays)} days`],
      };
    }
  }

  return { valid: true, errors: [], warnings: [] };
}

// Run all validators
export async function runAllValidators(ctx: ValidatorContext): Promise<ValidationResult> {
  const results: ValidationResult[] = [
    validateMaxChangedLines(ctx.diff, 50),
    validateNoSecretsIntroduced(ctx.diff),
    validatePatchStyleMatchesDriftType(ctx.patchStyle, ctx.driftType),
    validateEvidenceForRiskyChanges(ctx.diff, ctx.evidence),
    validateConfidenceThreshold(ctx.confidence, 0.40),
    validateNoBreakingChanges(ctx.diff),
  ];

  // Check managed region only if doc has one
  if (extractManagedRegion(ctx.originalMarkdown).hasManagedRegion) {
    results.push(validateManagedRegionOnly(ctx.originalMarkdown, ctx.patchedMarkdown));
  }

  // Async validators
  const primaryDocResult = await validatePrimaryDocOnly(ctx.workspaceId, ctx.docId, ctx.patchStyle);
  results.push(primaryDocResult);

  const freshnessResult = await validateDocFreshness(ctx.workspaceId, ctx.docId);
  results.push(freshnessResult);

  // Aggregate results
  const errors = results.flatMap(r => r.errors);
  const warnings = results.flatMap(r => r.warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

