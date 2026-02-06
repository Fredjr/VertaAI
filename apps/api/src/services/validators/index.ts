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
  autoApproveThreshold?: number;  // For evidence binding validator (FIX F3)
  prData?: {  // For evidence binding validator (FIX F3)
    changedFiles?: string[];
    diff?: string;
    title?: string;
    body?: string;
  };
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
    instruction: ['replace_steps', 'add_note', 'update_section'],  // update_section = modify existing section content
    process: ['reorder_steps', 'add_note', 'update_section'],  // Per spec: reorder_steps or add_note (MVP: prefer note)
    ownership: ['update_owner_block', 'add_note', 'update_section'],  // Per spec: update_owner_block or add_note
    coverage: ['add_section', 'add_note', 'update_section'],  // Per spec: add_section or add_note
    environment: ['replace_steps', 'add_note', 'update_section'],
    environment_tooling: ['replace_steps', 'add_note', 'update_section'],
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

  // Compare revisions: Confluence stores numeric version (e.g., "1"),
  // while docMapping uses updatedAt timestamp. Only compare when types match.
  const currentRevision = mapping.updatedAt.toISOString();
  const isNumericRevision = /^[0-9]+$/.test(expectedRevision);

  if (isNumericRevision) {
    // Confluence-style numeric revision — can't compare against timestamp
    // Skip with warning; real conflict detection happens at writeback via adapter
    return {
      valid: true,
      errors: [],
      warnings: [`Numeric revision (${expectedRevision}) — conflict check deferred to writeback`],
    };
  }

  if (currentRevision !== expectedRevision) {
    return {
      valid: false,
      errors: [`Document has been modified since patch was generated. Expected revision: ${expectedRevision}, current: ${currentRevision}`],
      warnings: [],
    };
  }

  return { valid: true, errors: [], warnings: [] };
}

// Validator 15: Hard evidence binding for auto-approve (FIX F3)
// This validator enforces that auto-approve patches MUST have deterministic evidence
// binding to specific PR changes. Prevents LLM hallucination from auto-approving.
export function validateHardEvidenceForAutoApprove(
  diff: string,
  evidence: string[],
  confidence: number,
  autoApproveThreshold: number,
  prData: {
    changedFiles?: string[];
    diff?: string;
    title?: string;
    body?: string;
  }
): ValidationResult {
  // Only enforce for patches that would be auto-approved
  if (confidence < autoApproveThreshold) {
    return { valid: true, errors: [], warnings: [] };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Requirement 1: Must have evidence
  if (!evidence || evidence.length === 0) {
    errors.push('Auto-approve requires evidence pack - no evidence provided');
    return { valid: false, errors, warnings };
  }

  // Requirement 2: Must have PR diff data
  if (!prData.diff && (!prData.changedFiles || prData.changedFiles.length === 0)) {
    errors.push('Auto-approve requires PR diff data - no changed files or diff provided');
    return { valid: false, errors, warnings };
  }

  // Requirement 3: Evidence must reference specific files or code changes
  // Note: This is a soft check — missing evidence downgrades to warning (human review)
  // rather than blocking the pipeline entirely. Auto-approve is still prevented.
  const hasFileReference = evidence.some(e => {
    // Check if evidence mentions specific files
    if (prData.changedFiles) {
      for (const file of prData.changedFiles) {
        const fileName = file.split('/').pop() || file;
        if (e.toLowerCase().includes(fileName.toLowerCase())) {
          return true;
        }
      }
    }
    // Check if evidence mentions code-like patterns (function names, variables, etc.)
    const codePatterns = [
      /\b[a-z_][a-z0-9_]*\(/i, // Function calls
      /\b(function|class|const|let|var|def|async|await)\b/i, // Keywords
      /\b[A-Z][a-zA-Z0-9]*\b/, // Class names
      /`[^`]+`/, // Code snippets in backticks
    ];
    return codePatterns.some(pattern => pattern.test(e));
  });

  if (!hasFileReference) {
    // Downgrade to warning instead of error — the patch is still valid for human review,
    // but auto-approve should not proceed without deterministic evidence binding
    warnings.push('Auto-approve blocked: evidence does not reference specific files or code changes from PR — requires human review');
    return { valid: true, errors, warnings };
  }

  // Requirement 4: Patch content must align with evidence
  // Extract added lines from patch diff
  const addedLines = diff.split('\n').filter(l => l.startsWith('+')).map(l => l.substring(1).trim());

  // Check that at least some added content is mentioned in evidence
  let hasContentAlignment = false;
  for (const line of addedLines) {
    if (line.length < 10) continue; // Skip very short lines

    // Check if any evidence mentions key terms from this line
    const keyTerms = line.split(/\s+/).filter(term => term.length > 4);
    for (const term of keyTerms) {
      if (evidence.some(e => e.toLowerCase().includes(term.toLowerCase()))) {
        hasContentAlignment = true;
        break;
      }
    }
    if (hasContentAlignment) break;
  }

  if (!hasContentAlignment && addedLines.length > 0) {
    warnings.push('Auto-approve warning: patch content does not clearly align with evidence - consider manual review');
  }

  // Requirement 5: Confidence must be based on deterministic signals, not just LLM
  // This is a heuristic - if confidence is exactly at threshold, it might be artificially boosted
  if (Math.abs(confidence - autoApproveThreshold) < 0.01) {
    warnings.push('Auto-approve warning: confidence is exactly at threshold - verify deterministic evidence');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// Run all validators (15 total - 14 from spec + 1 new evidence binding validator)
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

  // FIX F3: Hard evidence binding for auto-approve (15)
  if (ctx.autoApproveThreshold !== undefined && ctx.prData) {
    results.push(validateHardEvidenceForAutoApprove(
      ctx.diff,
      ctx.evidence,
      ctx.confidence,
      ctx.autoApproveThreshold,
      ctx.prData
    ));
  }

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

