/**
 * DocContext Extractor
 * 
 * Deterministic extraction of document context for LLM calls.
 * Produces bounded, reproducible slices that prevent hallucination.
 * 
 * @see VERTAAI_MVP_SPEC.md Section B - DocContext Schema
 * @see VERTAAI_MVP_SPEC.md Section E - DOC_CONTEXT_EXTRACTED Step
 */

import {
  DocContext,
  DocSystem,
  DriftType,
  ContentFormat,
  HeadingOutline,
  ManagedRegionContext,
  ExtractedSection,
  OwnerBlock,
  AllowedEditRange,
  DocContextBudgets,
  DocContextFlags,
  BaselineAnchors,
  computeSha256,
  computeSectionId,
} from '../../types/doc-context.js';
import {
  extractManagedRegion,
  MANAGED_START,
  MANAGED_END,
} from './managedRegion.js';
import {
  OWNERSHIP_PATTERNS,
  PROCESS_PATTERNS,
  INSTRUCTION_PATTERNS,
  ENVIRONMENT_PATTERNS,
  COVERAGE_KEYWORDS,
} from '../baseline/patterns.js';

// ============================================================================
// Configuration
// ============================================================================

export interface DocContextConfig {
  maxDocCharsSentToLlm: number;
  maxSections: number;
  maxSectionChars: number;
  maxManagedRegionChars: number;
  maxOwnerBlockChars: number;
}

export const DEFAULT_CONFIG: DocContextConfig = {
  maxDocCharsSentToLlm: 12000,
  maxSections: 6,
  maxSectionChars: 2500,
  maxManagedRegionChars: 8000,
  maxOwnerBlockChars: 1200,
};

// ============================================================================
// Section Target Patterns by Drift Type
// ============================================================================

const SECTION_TARGETS_BY_DRIFT_TYPE: Record<DriftType, string[]> = {
  instruction: ['deploy', 'config', 'tooling', 'setup', 'installation', 'commands', 'usage'],
  process: ['steps', 'runbook', 'procedure', 'workflow', 'process', 'checklist', 'how to'],
  ownership: ['owner', 'contact', 'team', 'escalation', 'on-call', 'oncall'],
  coverage: ['faq', 'known issues', 'troubleshooting', 'common problems', 'gotchas'],
  environment: ['environment', 'tooling', 'infrastructure', 'ci/cd', 'monitoring'],
};

// ============================================================================
// Extraction Input
// ============================================================================

export interface DocContextInput {
  workspaceId: string;
  docSystem: DocSystem;
  docId: string;
  docUrl: string;
  docTitle: string;
  docText: string;
  baseRevision: string;
  contentFormat?: ContentFormat;
  driftType: DriftType;
  driftDomains: string[];
  evidenceKeywords?: string[];
  config?: Partial<DocContextConfig>;
}

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract DocContext from raw document text.
 * This is the deterministic slicing step that happens before LLM calls.
 */
export function extractDocContext(input: DocContextInput): DocContext {
  const config = { ...DEFAULT_CONFIG, ...input.config };
  const { docText, driftType } = input;
  
  // Step 1: Compute full text hash for change detection
  const normalizedFulltextSha256 = computeSha256(docText);
  
  // Step 2: Build headings outline
  const outline = buildHeadingsOutline(docText);
  
  // Step 3: Extract managed region
  const managedRegion = extractManagedRegionContext(docText, config);
  
  // Step 4: Extract owner block (for ownership drift or general context)
  const ownerBlock = extractOwnerBlock(docText, config);
  
  // Step 5: Select and extract target sections
  const extractedSections = extractTargetSections(
    docText,
    outline,
    driftType,
    input.evidenceKeywords || [],
    config
  );
  
  // Step 6: Compute allowed edit ranges
  const allowedEditRanges = computeAllowedEditRanges(
    managedRegion,
    ownerBlock,
    extractedSections,
    driftType
  );
  
  // Step 7: Compute budgets
  const usedDocChars = computeUsedChars(managedRegion, extractedSections, ownerBlock);
  const budgets: DocContextBudgets = {
    maxDocCharsSentToLlm: config.maxDocCharsSentToLlm,
    maxSections: config.maxSections,
    maxSectionChars: config.maxSectionChars,
    usedDocChars,
  };
  
  // Step 8: Set safety flags
  const flags: DocContextFlags = {
    managedRegionMissing: managedRegion === null,
    tooLargeToSlice: docText.length > config.maxDocCharsSentToLlm * 2,
    lowStructure: outline.length < 2,
  };

  // Step 9: Extract baseline anchors for drift comparison (Per Spec)
  const baselineAnchors = extractBaselineAnchors(docText, managedRegion, ownerBlock);

  return {
    workspaceId: input.workspaceId,
    docSystem: input.docSystem,
    docId: input.docId,
    docUrl: input.docUrl,
    docTitle: input.docTitle,
    baseRevision: input.baseRevision,
    fetchedAt: new Date().toISOString(),
    contentFormat: input.contentFormat || 'markdown',
    normalizedFulltextSha256,
    outline,
    managedRegion,
    extractedSections,
    ownerBlock,
    allowedEditRanges,
    budgets,
    flags,
    baselineAnchors,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build headings outline from document text.
 * Parses markdown headings and returns their positions.
 */
export function buildHeadingsOutline(docText: string): HeadingOutline[] {
  const outline: HeadingOutline[] = [];
  const lines = docText.split('\n');
  let charOffset = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch && headingMatch[1] && headingMatch[2]) {
      const level = headingMatch[1].length;
      const heading = headingMatch[2].trim();
      outline.push({
        level,
        heading,
        startChar: charOffset,
        endChar: charOffset + line.length,
      });
    }
    charOffset += line.length + 1; // +1 for newline
  }

  return outline;
}

/**
 * Extract managed region with context metadata.
 */
function extractManagedRegionContext(
  docText: string,
  config: DocContextConfig
): ManagedRegionContext | null {
  const result = extractManagedRegion(docText);

  if (!result.hasManagedRegion) {
    return null;
  }

  // Bound the managed region text
  const boundedText = result.managed.substring(0, config.maxManagedRegionChars);

  return {
    startMarker: MANAGED_START,
    endMarker: MANAGED_END,
    startChar: result.startIndex,
    endChar: result.endIndex,
    text: boundedText,
    sha256: computeSha256(result.managed),
  };
}

/**
 * Extract owner block from document.
 * Looks for ownership patterns and extracts a bounded window around them.
 */
function extractOwnerBlock(
  docText: string,
  config: DocContextConfig
): OwnerBlock | null {
  const matchedPatterns: string[] = [];
  let firstMatchStart = -1;
  let lastMatchEnd = -1;

  for (const pattern of OWNERSHIP_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(docText)) !== null) {
      matchedPatterns.push(match[0]);
      if (firstMatchStart === -1 || match.index < firstMatchStart) {
        firstMatchStart = match.index;
      }
      const matchEnd = match.index + match[0].length;
      if (matchEnd > lastMatchEnd) {
        lastMatchEnd = matchEnd;
      }
    }
  }

  if (matchedPatterns.length === 0) {
    return null;
  }

  // Expand window around matches (up to maxOwnerBlockChars)
  const windowPadding = Math.floor((config.maxOwnerBlockChars - (lastMatchEnd - firstMatchStart)) / 2);
  const startChar = Math.max(0, firstMatchStart - windowPadding);
  const endChar = Math.min(docText.length, lastMatchEnd + windowPadding);

  return {
    startChar,
    endChar,
    text: docText.substring(startChar, endChar),
    matchedPatterns: [...new Set(matchedPatterns)].slice(0, 10),
  };
}

/**
 * Extract target sections based on drift type and evidence keywords.
 */
function extractTargetSections(
  docText: string,
  outline: HeadingOutline[],
  driftType: DriftType,
  evidenceKeywords: string[],
  config: DocContextConfig
): ExtractedSection[] {
  const sections: ExtractedSection[] = [];
  const targetPatterns = SECTION_TARGETS_BY_DRIFT_TYPE[driftType] || [];

  // Build section boundaries from outline
  const sectionBoundaries = outline.map((h, i) => {
    const nextHeading = outline[i + 1];
    return {
      heading: h,
      startChar: h.startChar,
      endChar: nextHeading ? nextHeading.startChar : docText.length,
    };
  });

  // Score and select sections
  for (const boundary of sectionBoundaries) {
    const headingLower = boundary.heading.heading.toLowerCase();
    let matchReason: ExtractedSection['matchReason'] | null = null;
    const matchedPatterns: string[] = [];

    // Check section targets
    for (const target of targetPatterns) {
      if (headingLower.includes(target.toLowerCase())) {
        matchReason = 'section_target';
        matchedPatterns.push(target);
      }
    }

    // Check evidence keywords
    if (!matchReason && evidenceKeywords.length > 0) {
      const sectionText = docText.substring(boundary.startChar, boundary.endChar).toLowerCase();
      for (const keyword of evidenceKeywords) {
        if (sectionText.includes(keyword.toLowerCase())) {
          matchReason = 'keyword_hit';
          matchedPatterns.push(keyword);
          break;
        }
      }
    }

    if (matchReason && sections.length < config.maxSections) {
      const headingPath = buildHeadingPath(outline, boundary.heading);
      const sectionText = docText.substring(boundary.startChar, boundary.endChar);
      const boundedText = sectionText.substring(0, config.maxSectionChars);

      sections.push({
        sectionId: computeSectionId(headingPath),
        headingPath,
        heading: boundary.heading.heading,
        startChar: boundary.startChar,
        endChar: boundary.endChar,
        text: boundedText,
        matchReason,
        matchedPatterns,
      });
    }
  }

  // Fallback: if no sections found, take first section within managed region or doc start
  if (sections.length === 0 && outline.length > 0) {
    const firstHeading = outline[0]!;
    const secondHeading = outline[1];
    const endChar = secondHeading ? secondHeading.startChar : docText.length;
    const sectionText = docText.substring(firstHeading.startChar, endChar);

    sections.push({
      sectionId: computeSectionId([firstHeading.heading]),
      headingPath: [firstHeading.heading],
      heading: firstHeading.heading,
      startChar: firstHeading.startChar,
      endChar,
      text: sectionText.substring(0, config.maxSectionChars),
      matchReason: 'fallback_window',
    });
  }

  return sections;
}

/**
 * Build heading path (breadcrumb) for a heading.
 */
function buildHeadingPath(outline: HeadingOutline[], target: HeadingOutline): string[] {
  const path: string[] = [];
  let currentLevel = 0;

  for (const h of outline) {
    if (h.startChar > target.startChar) break;

    if (h.level > currentLevel) {
      path.push(h.heading);
      currentLevel = h.level;
    } else if (h.level <= currentLevel) {
      // Pop back to parent level
      while (path.length > 0 && currentLevel >= h.level) {
        path.pop();
        currentLevel--;
      }
      path.push(h.heading);
      currentLevel = h.level;
    }
  }

  return path.length > 0 ? path : [target.heading];
}

/**
 * Compute allowed edit ranges based on drift type and extracted content.
 */
function computeAllowedEditRanges(
  managedRegion: ManagedRegionContext | null,
  ownerBlock: OwnerBlock | null,
  extractedSections: ExtractedSection[],
  driftType: DriftType
): AllowedEditRange[] {
  const ranges: AllowedEditRange[] = [];

  // Always include managed region if present
  if (managedRegion) {
    ranges.push({
      startChar: managedRegion.startChar,
      endChar: managedRegion.endChar,
      reason: 'managed_region',
    });
  }

  // For ownership drift, also allow owner block edits
  if (driftType === 'ownership' && ownerBlock) {
    ranges.push({
      startChar: ownerBlock.startChar,
      endChar: ownerBlock.endChar,
      reason: 'owner_block_only',
    });
  }

  // Add section target ranges
  for (const section of extractedSections) {
    // Only add if not already covered by managed region
    const alreadyCovered = ranges.some(
      r => r.startChar <= section.startChar && r.endChar >= section.endChar
    );
    if (!alreadyCovered) {
      ranges.push({
        startChar: section.startChar,
        endChar: section.endChar,
        reason: 'section_targets',
      });
    }
  }

  return ranges;
}

/**
 * Compute total characters used in DocContext.
 */
function computeUsedChars(
  managedRegion: ManagedRegionContext | null,
  extractedSections: ExtractedSection[],
  ownerBlock: OwnerBlock | null
): number {
  let total = 0;

  if (managedRegion) {
    total += managedRegion.text.length;
  }

  for (const section of extractedSections) {
    total += section.text.length;
  }

  if (ownerBlock) {
    total += ownerBlock.text.length;
  }

  return total;
}

// ============================================================================
// Baseline Anchors Extraction (Per Spec)
// ============================================================================

// Command patterns to extract from doc
const DOC_COMMAND_PATTERNS: RegExp[] = [
  /`(kubectl\s+[^`]+)`/gi,
  /`(helm\s+[^`]+)`/gi,
  /`(terraform\s+[^`]+)`/gi,
  /`(docker\s+[^`]+)`/gi,
  /`(aws\s+[^`]+)`/gi,
  /`(gcloud\s+[^`]+)`/gi,
  /`(npm\s+[^`]+)`/gi,
  /`(yarn\s+[^`]+)`/gi,
  /`(make\s+\w+)`/gi,
  /`(\.\/[^\s`]+)`/gi,
  /\$\s*(kubectl\s+[^\n]+)/gi,
  /\$\s*(helm\s+[^\n]+)/gi,
];

// Tool mention patterns
const DOC_TOOL_PATTERNS: RegExp[] = [
  /\b(kubectl|helm|terraform|docker|podman)\b/gi,
  /\b(aws|gcloud|az|azure)\b/gi,
  /\b(circleci|buildkite|jenkins|travis|github\s*actions?|gitlab[\s-]?ci)\b/gi,
  /\b(argocd|flux|spinnaker|harness)\b/gi,
  /\b(datadog|newrelic|grafana|prometheus|splunk|honeycomb)\b/gi,
  /\b(launchdarkly|split\.io|optimizely|flagsmith)\b/gi,
];

// Config key patterns
const DOC_CONFIG_PATTERNS: RegExp[] = [
  /\b([A-Z][A-Z0-9_]{2,})\b/g,  // FOO_BAR style
  /`([A-Z][A-Z0-9_]{2,})`/g,    // `FOO_BAR` in backticks
];

// Endpoint patterns
const DOC_ENDPOINT_PATTERNS: RegExp[] = [
  /["'`](\/v\d+\/[^"'`\s]+)["'`]/gi,
  /["'`](\/api\/[^"'`\s]+)["'`]/gi,
  /https?:\/\/[^\s"'`]+/gi,
];

// Step marker patterns
const STEP_MARKER_PATTERNS: RegExp[] = [
  /\bstep\s+\d+/gi,
  /^\s*\d+[\.\)]\s+/gm,
  /\b(first|second|third|then|next|finally|lastly)\b/gi,
];

// Decision marker patterns
const DECISION_MARKER_PATTERNS: RegExp[] = [
  /\bif\b[^.]*\bthen\b/gi,
  /\bwhen\b[^.]*\bdo\b/gi,
  /\belse\b/gi,
  /\bunless\b/gi,
  /\botherwise\b/gi,
];

// Owner reference patterns
const OWNER_REF_PATTERNS: RegExp[] = [
  /@[a-zA-Z0-9_-]+/g,           // @mentions
  /#[a-zA-Z0-9_-]+/g,           // #channels
  /owner:\s*([^\n]+)/gi,
  /team:\s*([^\n]+)/gi,
  /contact:\s*([^\n]+)/gi,
  /maintainer:\s*([^\n]+)/gi,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // emails
];

/**
 * Extract baseline anchors from document for drift comparison.
 * This provides the "baseline" side of drift detection.
 */
function extractBaselineAnchors(
  docText: string,
  managedRegion: ManagedRegionContext | null,
  ownerBlock: OwnerBlock | null
): BaselineAnchors {
  // Use managed region text if available, otherwise full doc
  const textToAnalyze = managedRegion?.text || docText;

  return {
    managed_region_text: managedRegion?.text || '',
    owner_block_text: ownerBlock?.text || null,
    anchors: {
      commands: extractUniqueMatches(textToAnalyze, DOC_COMMAND_PATTERNS, 30),
      tool_mentions: extractUniqueMatches(textToAnalyze, DOC_TOOL_PATTERNS, 20),
      config_keys: extractUniqueMatches(textToAnalyze, DOC_CONFIG_PATTERNS, 30),
      endpoints: extractUniqueMatches(textToAnalyze, DOC_ENDPOINT_PATTERNS, 20),
      step_markers: extractUniqueMatches(textToAnalyze, STEP_MARKER_PATTERNS, 20),
      decision_markers: extractUniqueMatches(textToAnalyze, DECISION_MARKER_PATTERNS, 15),
      owner_refs: extractUniqueMatches(ownerBlock?.text || docText, OWNER_REF_PATTERNS, 15),
      coverage_keywords_present: findCoverageKeywordsInDoc(textToAnalyze),
    },
  };
}

/**
 * Extract unique matches from text using multiple patterns.
 */
function extractUniqueMatches(text: string, patterns: RegExp[], limit: number): string[] {
  const matches = new Set<string>();

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      // Use capture group if present, otherwise full match
      const value = (match[1] || match[0]).trim().toLowerCase();
      if (value.length > 1 && value.length < 100) {
        matches.add(value);
      }
    }
  }

  return [...matches].slice(0, limit);
}

/**
 * Find coverage keywords present in document.
 */
function findCoverageKeywordsInDoc(text: string): string[] {
  const textLower = text.toLowerCase();
  return COVERAGE_KEYWORDS.filter(keyword =>
    textLower.includes(keyword.toLowerCase())
  );
}

// ============================================================================
// LLM Payload Builder
// ============================================================================

export interface LlmDocPayload {
  docId: string;
  docTitle: string;
  outline: string[];
  managedRegionText: string | null;
  extractedSections: Array<{
    sectionId: string;
    heading: string;
    text: string;
  }>;
  ownerBlockText: string | null;
  allowedEditRanges: AllowedEditRange[];
  flags: DocContextFlags;
}

/**
 * Build a bounded payload for LLM calls from DocContext.
 * This ensures the LLM only sees what it needs.
 */
export function buildLlmPayload(docContext: DocContext): LlmDocPayload {
  return {
    docId: docContext.docId,
    docTitle: docContext.docTitle,
    outline: docContext.outline.map(h => `${'#'.repeat(h.level)} ${h.heading}`),
    managedRegionText: docContext.managedRegion?.text || null,
    extractedSections: docContext.extractedSections.map(s => ({
      sectionId: s.sectionId,
      heading: s.heading,
      text: s.text,
    })),
    ownerBlockText: docContext.ownerBlock?.text || null,
    allowedEditRanges: docContext.allowedEditRanges,
    flags: docContext.flags,
  };
}

/**
 * Validate that a patch only touches allowed edit ranges.
 */
export function validatePatchWithinRanges(
  originalText: string,
  patchedText: string,
  allowedRanges: AllowedEditRange[]
): { valid: boolean; violations: string[] } {
  if (allowedRanges.length === 0) {
    return { valid: false, violations: ['No allowed edit ranges defined'] };
  }

  // Simple validation: check that content outside allowed ranges is unchanged
  const violations: string[] = [];

  // Sort ranges by start position
  const sortedRanges = [...allowedRanges].sort((a, b) => a.startChar - b.startChar);
  const firstRange = sortedRanges[0];
  const lastRange = sortedRanges[sortedRanges.length - 1];

  if (!firstRange || !lastRange) {
    return { valid: false, violations: ['Invalid ranges'] };
  }

  // Check content before first range
  if (firstRange.startChar > 0) {
    const beforeOriginal = originalText.substring(0, firstRange.startChar);
    const beforePatched = patchedText.substring(0, firstRange.startChar);
    if (beforeOriginal !== beforePatched) {
      violations.push(`Content modified before first allowed range (0-${firstRange.startChar})`);
    }
  }

  // Check gaps between ranges
  for (let i = 0; i < sortedRanges.length - 1; i++) {
    const currentRange = sortedRanges[i];
    const nextRange = sortedRanges[i + 1];
    if (currentRange && nextRange) {
      const gapStart = currentRange.endChar;
      const gapEnd = nextRange.startChar;
      if (gapEnd > gapStart) {
        const gapOriginal = originalText.substring(gapStart, gapEnd);
        const gapPatched = patchedText.substring(gapStart, gapEnd);
        if (gapOriginal !== gapPatched) {
          violations.push(`Content modified in gap between ranges (${gapStart}-${gapEnd})`);
        }
      }
    }
  }

  // Check content after last range
  if (lastRange.endChar < originalText.length) {
    const afterOriginal = originalText.substring(lastRange.endChar);
    const afterPatched = patchedText.substring(lastRange.endChar);
    if (afterOriginal !== afterPatched) {
      violations.push(`Content modified after last allowed range (${lastRange.endChar}-end)`);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

