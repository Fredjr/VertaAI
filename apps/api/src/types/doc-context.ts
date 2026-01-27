/**
 * DocContext Types
 * 
 * DocContext is the single source of truth for:
 * - What the LLM sees (bounded, deterministic slices)
 * - What sections are editable
 * - What ranges validators accept
 * - What snippet is shown in Slack preview
 * 
 * @see VERTAAI_MVP_SPEC.md Section B - DocContext Schema
 */

import { createHash } from 'crypto';

// ============================================================================
// Core Types
// ============================================================================

export type DocSystem = 'confluence' | 'notion';
export type DriftType = 'instruction' | 'process' | 'ownership' | 'coverage' | 'environment';
export type ContentFormat = 'storage' | 'atlas_doc_format' | 'markdown' | 'plaintext';

// ============================================================================
// Outline Types
// ============================================================================

export interface HeadingOutline {
  level: number;           // 1..6
  heading: string;
  startChar: number;
  endChar: number;
}

// ============================================================================
// Managed Region Types
// ============================================================================

export interface ManagedRegionContext {
  startMarker: string;
  endMarker: string;
  startChar: number;
  endChar: number;
  text: string;            // The actual managed region extracted (bounded by max chars)
  sha256: string;
}

// ============================================================================
// Extracted Section Types
// ============================================================================

export type SectionMatchReason = 'section_target' | 'owner_block' | 'keyword_hit' | 'fallback_window';

export interface ExtractedSection {
  sectionId: string;       // Deterministic hash of heading path
  headingPath: string[];   // e.g. ["Runbook", "Deploy"]
  heading: string;
  startChar: number;
  endChar: number;
  text: string;            // Bounded
  matchReason: SectionMatchReason;
  matchedPatterns?: string[];
}

// ============================================================================
// Owner Block Types
// ============================================================================

export interface OwnerBlock {
  startChar: number;
  endChar: number;
  text: string;
  matchedPatterns: string[];
}

// ============================================================================
// Allowed Edit Range Types
// ============================================================================

export type EditRangeReason = 'managed_region' | 'owner_block_only' | 'section_targets';

export interface AllowedEditRange {
  startChar: number;
  endChar: number;
  reason: EditRangeReason;
}

// ============================================================================
// Budget Types
// ============================================================================

export interface DocContextBudgets {
  maxDocCharsSentToLlm: number;
  maxSections: number;
  maxSectionChars: number;
  usedDocChars: number;
}

// ============================================================================
// Safety Flags
// ============================================================================

export interface DocContextFlags {
  managedRegionMissing: boolean;
  tooLargeToSlice: boolean;
  lowStructure: boolean;   // Headings missing, messy doc
}

// ============================================================================
// Main DocContext Type
// ============================================================================

export interface DocContext {
  workspaceId: string;
  docSystem: DocSystem;
  docId: string;
  docUrl: string;
  docTitle: string;

  baseRevision: string;           // Confluence version number at fetch time
  fetchedAt: string;              // ISO
  contentFormat: ContentFormat;

  // Full normalized text hash (for change detection)
  normalizedFulltextSha256?: string;

  // Headings outline to support section targeting & UX
  outline: HeadingOutline[];

  // Managed region markers & resolved ranges
  managedRegion: ManagedRegionContext | null;

  // Extracted sections used for patching and planning
  extractedSections: ExtractedSection[];

  // Owner block extracted deterministically (for ownership drift)
  ownerBlock: OwnerBlock | null;

  // Allowed ranges for validators (char ranges)
  allowedEditRanges: AllowedEditRange[];

  // Token/size bookkeeping for truncation predictability
  budgets: DocContextBudgets;

  // Safety flags
  flags: DocContextFlags;
}

// ============================================================================
// Utility Functions
// ============================================================================

export function computeSha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function computeSectionId(headingPath: string[]): string {
  return computeSha256(headingPath.join('/')).substring(0, 12);
}

