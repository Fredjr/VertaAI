/**
 * Doc Resolution Service
 * 
 * Implements the doc resolution pipeline with priority order:
 * P0: PR link → explicit doc reference in PR body
 * P1: mapping → DocMappingV2 lookup by repo/service
 * P2: search → Confluence/Notion search (not implemented yet)
 * else: NEEDS_MAPPING
 * 
 * @see VERTAAI_MVP_SPEC.md Section C - Doc Resolution
 */

import { prisma } from '../../lib/db.js';

// ============================================================================
// Types
// ============================================================================

// Per spec Section 6.1: status values for doc resolution
export type DocResolutionStatus = 'explicit_link' | 'mapped' | 'search_candidate' | 'needs_mapping' | 'ignored';
export type DocResolutionMethod = 'pr_link' | 'mapping' | 'confluence_search' | 'notion_search' | 'none';

/**
 * DocResolutionAttempt - Per spec Section 1.1
 * Tracks each resolution step for debugging (flight recorder)
 */
export interface DocResolutionAttempt {
  step: 'parse_pr_links' | 'mapping_lookup' | 'confluence_search' | 'notion_search' | 'rerank';
  ok: boolean;
  info?: Record<string, unknown>;
  error?: string;
}

export interface DocCandidate {
  docId: string;
  docSystem: 'confluence' | 'notion';
  docTitle: string;
  docUrl: string | null;
  isPrimary: boolean;
  hasManagedRegion: boolean;
  allowWriteback: boolean; // Per spec: controls if writeback is allowed for this doc
  spaceKey?: string;       // Per spec: Confluence space key for filtering
  reasons: string[];       // Per spec: multiple reasons for match (was matchReason: string)
  confidence: number;
}

export interface DocResolutionResult {
  status: DocResolutionStatus;
  method: DocResolutionMethod;
  confidence: number;
  noWritebackMode: boolean;
  candidates: DocCandidate[];
  // Per spec Section 1.1 - Flight recorder and thresholds
  repoFullName?: string;           // Repository full name for traceability
  attempts: DocResolutionAttempt[]; // Resolution step log for debugging
  thresholds: {
    minConfidenceForSuggest: number;
    minConfidenceForAutoselect: number;
  };
  notes?: string;
}

export interface DocResolutionInput {
  workspaceId: string;
  repo: string | null;
  service: string | null;
  prBody?: string | null;
  prTitle?: string | null;
  // Per spec Section 6.1: flag to indicate doc resolution should be skipped (e.g., for non-doc-impacting changes)
  shouldIgnore?: boolean;
  ignoreReason?: string;
  // Per spec Section 1.1 + Section 7: workspace policy for doc resolution
  policy?: WorkspacePolicy;
}

/**
 * WorkspacePolicy - Per spec Section 1.1
 * Controls per-workspace doc resolution behavior
 */
export interface WorkspacePolicy {
  primaryDocRequired: boolean;        // If true, fail if no primary doc mapping exists
  allowPrLinkOverride: boolean;       // Allow PR links to override mappings
  allowSearchSuggestMapping: boolean; // Allow search-based suggestions (P2)
  minConfidenceForSuggest: number;    // Min confidence for search suggest
  allowedConfluenceSpaces?: string[]; // Space key allowlist (empty = allow all)
}

// ============================================================================
// PR Link Parsing (P0 Resolution)
// ============================================================================

/**
 * Regex patterns to extract doc links from PR body
 */
const DOC_LINK_PATTERNS = [
  // Confluence patterns
  /https?:\/\/[^\/]+\.atlassian\.net\/wiki\/spaces\/[^\/]+\/pages\/(\d+)(?:\/[^\s\)]*)?/gi,
  /https?:\/\/[^\/]+\/wiki\/spaces\/[^\/]+\/pages\/(\d+)(?:\/[^\s\)]*)?/gi,
  /https?:\/\/confluence\.[^\/]+\/display\/[^\/]+\/[^\s\)]+/gi,
  /https?:\/\/confluence\.[^\/]+\/pages\/viewpage\.action\?pageId=(\d+)/gi,
  
  // Notion patterns
  /https?:\/\/(?:www\.)?notion\.so\/[^\/]+\/[a-zA-Z0-9-]+-([a-f0-9]{32})/gi,
  /https?:\/\/(?:www\.)?notion\.so\/([a-f0-9]{32})/gi,
  
  // Markdown link patterns with doc keywords
  /\[(?:runbook|doc|documentation|wiki|guide)[^\]]*\]\(([^)]+)\)/gi,
];

/**
 * Extract doc references from PR body text.
 * Returns P0 candidates if explicit doc links are found.
 */
export function extractDocLinksFromPR(prBody: string | null | undefined): Array<{
  url: string;
  docSystem: 'confluence' | 'notion';
  docId: string | null;
}> {
  if (!prBody) return [];
  
  const links: Array<{ url: string; docSystem: 'confluence' | 'notion'; docId: string | null }> = [];
  const seenUrls = new Set<string>();
  
  for (const pattern of DOC_LINK_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    let match;
    
    while ((match = pattern.exec(prBody)) !== null) {
      const url = match[0];
      
      // Skip if already seen
      if (seenUrls.has(url.toLowerCase())) continue;
      seenUrls.add(url.toLowerCase());
      
      // Determine doc system
      let docSystem: 'confluence' | 'notion' = 'confluence';
      let docId: string | null = null;
      
      if (url.includes('notion.so')) {
        docSystem = 'notion';
        // Extract Notion page ID (32 char hex)
        const notionIdMatch = url.match(/([a-f0-9]{32})/i);
        if (notionIdMatch) {
          docId = notionIdMatch[1] ?? null;
        }
      } else {
        docSystem = 'confluence';
        // Extract Confluence page ID
        const confluenceIdMatch = url.match(/pages\/(\d+)|pageId=(\d+)/);
        if (confluenceIdMatch) {
          docId = confluenceIdMatch[1] || confluenceIdMatch[2] || null;
        }
      }
      
      links.push({ url, docSystem, docId });
    }
  }
  
  return links;
}

// ============================================================================
// Main Resolution Function
// ============================================================================

/**
 * Resolve docs using priority order:
 * P0: PR link (explicit doc reference)
 * P1: Mapping (DocMappingV2 lookup)
 * P2: Search (not implemented - returns needs_mapping)
 *
 * Per spec Section 6.1: If shouldIgnore=true, returns 'ignored' status → COMPLETED
 * Per spec Section 7: If policy.primaryDocRequired=true and no primary mapping, returns 'needs_mapping'
 */
export async function resolveDocsForDrift(input: DocResolutionInput): Promise<DocResolutionResult> {
  const { workspaceId, repo, service, prBody, shouldIgnore, ignoreReason, policy } = input;

  console.log(`[DocResolution] Resolving docs for workspace=${workspaceId}, repo=${repo}, service=${service}, policy.primaryDocRequired=${policy?.primaryDocRequired}`);

  // Track resolution attempts for debugging (flight recorder)
  const attempts: DocResolutionAttempt[] = [];

  // Default thresholds (can be overridden by policy)
  const thresholds = {
    minConfidenceForSuggest: policy?.minConfidenceForSuggest ?? 0.5,
    minConfidenceForAutoselect: 0.75,
  };

  // Build repo full name for traceability
  const repoFullName = repo || undefined;

  // -------------------------------------------------------------------------
  // Handle 'ignored' status (per spec Section 6.1)
  // This is used when a drift candidate should not trigger doc updates
  // -------------------------------------------------------------------------
  if (shouldIgnore) {
    console.log(`[DocResolution] Returning 'ignored' status: ${ignoreReason || 'no reason provided'}`);
    return {
      status: 'ignored',
      method: 'none',
      confidence: 0,
      noWritebackMode: true,
      candidates: [],
      repoFullName,
      attempts: [],
      thresholds,
      notes: ignoreReason || 'Doc resolution skipped - change does not require doc update',
    };
  }

  // -------------------------------------------------------------------------
  // P0: Check for explicit doc links in PR body
  // -------------------------------------------------------------------------
  const prLinks = extractDocLinksFromPR(prBody);

  attempts.push({
    step: 'parse_pr_links',
    ok: prLinks.length > 0,
    info: { linksFound: prLinks.length, links: prLinks.map(l => l.url) },
  });

  if (prLinks.length > 0) {
    console.log(`[DocResolution] P0: Found ${prLinks.length} doc links in PR body`);

    // Look up these docs in DocMappingV2 to get full metadata
    const p0Candidates: DocCandidate[] = [];

    for (const link of prLinks) {
      // Try to find by URL first
      let mapping = await prisma.docMappingV2.findFirst({
        where: { workspaceId, docUrl: link.url },
      });

      // If not found by URL and we have a docId, try by docId
      if (!mapping && link.docId) {
        mapping = await prisma.docMappingV2.findFirst({
          where: { workspaceId, docId: link.docId },
        });
      }

      if (mapping) {
        p0Candidates.push({
          docId: mapping.docId,
          docSystem: mapping.docSystem as 'confluence' | 'notion',
          docTitle: mapping.docTitle,
          docUrl: mapping.docUrl,
          isPrimary: mapping.isPrimary,
          hasManagedRegion: mapping.hasManagedRegion,
          allowWriteback: mapping.allowWriteback,
          spaceKey: mapping.spaceKey ?? undefined,
          reasons: ['Explicit link in PR body', 'Found in doc mappings'],
          confidence: 0.95,
        });
      } else {
        // Doc not in mappings but linked in PR - create candidate with lower confidence
        // allowWriteback=false for unmapped docs (safety)
        p0Candidates.push({
          docId: link.docId || link.url,
          docSystem: link.docSystem,
          docTitle: 'Unknown (from PR link)',
          docUrl: link.url,
          isPrimary: false,
          hasManagedRegion: false,
          allowWriteback: false, // Unmapped docs don't allow writeback
          reasons: ['Explicit link in PR body', 'Not in doc mappings - reduced confidence'],
          confidence: 0.75,
        });
      }
    }

    if (p0Candidates.length > 0) {
      // Sort by isPrimary first, then by confidence
      p0Candidates.sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return b.confidence - a.confidence;
      });

      // noWritebackMode is true if selected doc doesn't allow writeback or is not primary
      const selectedDoc = p0Candidates[0];
      const noWritebackMode = selectedDoc ? (!selectedDoc.isPrimary || !selectedDoc.allowWriteback) : true;

      return {
        status: 'explicit_link',
        method: 'pr_link',
        confidence: p0Candidates[0]?.confidence ?? 0.75,
        noWritebackMode,
        candidates: p0Candidates.slice(0, 3),
        repoFullName,
        attempts,
        thresholds,
        notes: `Found ${prLinks.length} doc link(s) in PR body`,
      };
    }
  }

  // -------------------------------------------------------------------------
  // P1: Look up DocMappingV2 by repo or service
  // -------------------------------------------------------------------------
  console.log(`[DocResolution] P1: Looking up DocMappingV2 for repo=${repo}, service=${service}`);

  const mappings = await prisma.docMappingV2.findMany({
    where: {
      workspaceId,
      OR: [
        repo ? { repo } : {},
        service ? { service } : {},
      ].filter(c => Object.keys(c).length > 0),
    },
    orderBy: [
      { isPrimary: 'desc' },
      { updatedAt: 'desc' },
    ],
    take: 5,
  });

  attempts.push({
    step: 'mapping_lookup',
    ok: mappings.length > 0,
    info: { mappingsFound: mappings.length, repo, service },
  });

  if (mappings.length > 0) {
    console.log(`[DocResolution] P1: Found ${mappings.length} mappings`);

    const p1Candidates: DocCandidate[] = mappings.map(m => ({
      docId: m.docId,
      docSystem: m.docSystem as 'confluence' | 'notion',
      docTitle: m.docTitle,
      docUrl: m.docUrl,
      isPrimary: m.isPrimary,
      hasManagedRegion: m.hasManagedRegion,
      allowWriteback: m.allowWriteback,
      spaceKey: m.spaceKey ?? undefined,
      reasons: [
        m.repo === repo ? 'Matched by repository' : 'Matched by service',
        m.isPrimary ? 'Primary doc mapping' : 'Secondary doc mapping',
      ],
      confidence: m.isPrimary ? 0.85 : 0.70,
    }));

    // Primary docs get higher confidence
    const primaryDoc = p1Candidates.find(c => c.isPrimary);

    // Per spec Section 7: If policy.primaryDocRequired=true and no primary doc, return NEEDS_MAPPING
    if (policy?.primaryDocRequired && !primaryDoc) {
      console.log(`[DocResolution] Policy gate: primaryDocRequired=true but no primary doc found`);
      return {
        status: 'needs_mapping',
        method: 'mapping',
        confidence: 0,
        noWritebackMode: true,
        candidates: p1Candidates.slice(0, 3), // Include non-primary candidates for reference
        repoFullName,
        attempts,
        thresholds,
        notes: 'Policy requires a primary doc mapping, but none found. Please mark one doc as primary.',
      };
    }

    // noWritebackMode is true if the selected doc doesn't allow writeback
    const selectedDoc = primaryDoc || p1Candidates[0];
    const noWritebackMode = selectedDoc ? !selectedDoc.allowWriteback : true;

    return {
      status: 'mapped',
      method: 'mapping',
      confidence: primaryDoc?.confidence ?? p1Candidates[0]?.confidence ?? 0.70,
      noWritebackMode,
      candidates: p1Candidates.slice(0, 3),
      repoFullName,
      attempts,
      thresholds,
      notes: `Found ${mappings.length} mapping(s) for repo/service`,
    };
  }

  // -------------------------------------------------------------------------
  // P2: Search fallback (not implemented - would use Confluence CQL / Notion API)
  // -------------------------------------------------------------------------
  console.log(`[DocResolution] P2: No mappings found, would search (not implemented)`);

  // For now, return NEEDS_MAPPING
  // In future: implement Confluence CQL search or Notion database search

  return {
    status: 'needs_mapping',
    method: 'none',
    confidence: 0,
    noWritebackMode: true,
    candidates: [],
    repoFullName,
    attempts,
    thresholds,
    notes: 'No doc mappings found for this repo/service. Please configure doc mappings.',
  };
}

