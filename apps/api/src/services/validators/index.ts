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
  expectedRevision?: string | null;  // For revision check validator
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
// Per spec Section 5.11.2 - patchStyleAllowedForDriftType
export function validatePatchStyleMatchesDriftType(
  patchStyle: string,
  driftType: string
): ValidationResult {
  const validCombos: Record<string, string[]> = {
    instruction: ['replace_steps', 'add_note'],
    process: ['reorder_steps', 'add_note'],  // Per spec: reorder_steps or add_note (MVP: prefer note)
    ownership: ['update_owner_block', 'add_note'],  // Per spec: update_owner_block or add_note
    coverage: ['add_section', 'add_note'],  // Per spec: add_section or add_note
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

// Validator 12: No new commands unless evidenced (spec Section 5.11)
export function validateNoNewCommandsUnlessEvidenced(
  diff: string,
  evidence: string[]
): ValidationResult {
  // Extract commands from added lines in diff
  const commandPatterns = [
    /`(kubectl|helm|terraform|docker|aws|gcloud|psql|curl|npm|yarn|pip|cargo|go)\s+[^`]+`/gi,
    /\$\s*(kubectl|helm|terraform|docker|aws|gcloud|psql|curl|npm|yarn|pip|cargo|go)\s+\S+/gi,
  ];

  const addedLines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
  const newCommands: string[] = [];

  for (const line of addedLines) {
    for (const pattern of commandPatterns) {
      const matches = line.match(pattern) || [];
      newCommands.push(...matches);
    }
  }

  if (newCommands.length === 0) {
    return { valid: true, errors: [], warnings: [] };
  }

  // Check if commands are supported by evidence
  const evidenceText = evidence.join(' ').toLowerCase();
  const unsupportedCommands = newCommands.filter(cmd => {
    // Extract tool name from command
    const toolMatch = cmd.match(/`?(kubectl|helm|terraform|docker|aws|gcloud|psql|curl|npm|yarn|pip|cargo|go)/i);
    if (!toolMatch || !toolMatch[1]) return true;  // Unknown command = unsupported
    const tool = toolMatch[1].toLowerCase();
    return !evidenceText.includes(tool);
  });

  if (unsupportedCommands.length > 0) {
    return {
      valid: false,
      errors: [`Patch introduces commands not supported by evidence: ${unsupportedCommands.slice(0, 3).join(', ')}. Use NOTE instead.`],
      warnings: [],
    };
  }

  return { valid: true, errors: [], warnings: [] };
}

// Validator 13: Owner block scope (spec Section 5.11)
export function validateOwnerBlockScope(
  diff: string,
  driftType: string,
  originalMarkdown: string
): ValidationResult {
  // Only applies to ownership drift
  if (driftType !== 'ownership') {
    return { valid: true, errors: [], warnings: [] };
  }

  // Owner block patterns
  const ownerPatterns = [
    /^#+\s*(?:owner|contact|team|escalat|on-?call)/gim,
    /owner:\s*[^\n]+/gi,
    /team:\s*[^\n]+/gi,
    /contact:\s*[^\n]+/gi,
  ];

  // Get all changed lines from diff
  const changedLines = diff.split('\n').filter(l =>
    (l.startsWith('+') || l.startsWith('-')) &&
    !l.startsWith('+++') && !l.startsWith('---')
  );

  // Check if all changes are within owner-related content
  const nonOwnerChanges: string[] = [];
  for (const line of changedLines) {
    const content = line.substring(1);  // Remove +/- prefix
    const isOwnerRelated = ownerPatterns.some(p => p.test(content));
    // Reset lastIndex for global patterns
    ownerPatterns.forEach(p => p.lastIndex = 0);

    if (!isOwnerRelated && content.trim().length > 0) {
      // Check if line is part of owner section context
      const isContext = content.startsWith('@') || content.startsWith('#') ||
                       /\b(owner|team|contact|escalat|on-?call)\b/i.test(content);
      if (!isContext) {
        nonOwnerChanges.push(content.substring(0, 50));
      }
    }
  }

  if (nonOwnerChanges.length > 0) {
    return {
      valid: false,
      errors: ['Ownership drift patches must only edit owner/contact sections. Found changes outside owner block.'],
      warnings: [],
    };
  }

  return { valid: true, errors: [], warnings: [] };
}

// Validator 14: Doc revision unchanged (spec Section 5.11)
export async function validateDocRevisionUnchanged(
  workspaceId: string,
  docId: string,
  expectedRevision: string | null
): Promise<ValidationResult> {
  if (!expectedRevision) {
    // No revision tracking, skip validation
    return { valid: true, errors: [], warnings: ['No revision tracking - concurrent edits possible'] };
  }

  // Use updatedAt as revision proxy since DocMappingV2 doesn't have docRevision field
  const mapping = await prisma.docMappingV2.findFirst({
    where: { workspaceId, docId },
    select: { updatedAt: true },
  });

  if (!mapping) {
    return {
      valid: false,
      errors: ['Document mapping not found'],
      warnings: [],
    };
  }

  // Compare updatedAt timestamp as revision
  const currentRevision = mapping.updatedAt.toISOString();
  if (currentRevision !== expectedRevision) {
    return {
      valid: false,
      errors: [`Document has been modified since patch was generated. Expected revision: ${expectedRevision}, current: ${currentRevision}`],
      warnings: [],
    };
  }

  return { valid: true, errors: [], warnings: [] };
}

// Run all validators (14 total per spec Section 5.11)
export async function runAllValidators(ctx: ValidatorContext): Promise<ValidationResult> {
  const results: ValidationResult[] = [
    // Core validators (1-6)
    validateMaxChangedLines(ctx.diff, 50),
    validateNoSecretsIntroduced(ctx.diff),
    validatePatchStyleMatchesDriftType(ctx.patchStyle, ctx.driftType),
    validateEvidenceForRiskyChanges(ctx.diff, ctx.evidence),
    validateConfidenceThreshold(ctx.confidence, 0.40),
    validateNoBreakingChanges(ctx.diff),

    // New validators per spec (12-13)
    validateNoNewCommandsUnlessEvidenced(ctx.diff, ctx.evidence),
    validateOwnerBlockScope(ctx.diff, ctx.driftType, ctx.originalMarkdown),
  ];

  // Check managed region only if doc has one (7)
  if (extractManagedRegion(ctx.originalMarkdown).hasManagedRegion) {
    results.push(validateManagedRegionOnly(ctx.originalMarkdown, ctx.patchedMarkdown));
  }

  // Async validators (8-11, 14)
  const primaryDocResult = await validatePrimaryDocOnly(ctx.workspaceId, ctx.docId, ctx.patchStyle);
  results.push(primaryDocResult);

  const freshnessResult = await validateDocFreshness(ctx.workspaceId, ctx.docId);
  results.push(freshnessResult);

  // Revision check (14) - only if expectedRevision is provided
  if (ctx.expectedRevision !== undefined) {
    const revisionResult = await validateDocRevisionUnchanged(ctx.workspaceId, ctx.docId, ctx.expectedRevision);
    results.push(revisionResult);
  }

  // Aggregate results
  const errors = results.flatMap(r => r.errors);
  const warnings = results.flatMap(r => r.warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

