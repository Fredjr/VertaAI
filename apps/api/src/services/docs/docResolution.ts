/**
 * Doc Resolution Service
 *
 * Implements the doc resolution pipeline with priority order:
 * P0: PR link → explicit doc reference in PR body
 * P1: mapping → DocMappingV2 lookup by repo/service
 * P2: search → Confluence/Notion search fallback (top-K)
 * else: NEEDS_MAPPING
 *
 * @see VERTAAI_MVP_SPEC.md Section C - Doc Resolution
 */

import { prisma } from '../../lib/db.js';
import { searchPages } from '../confluence-client.js';

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
  // NEW: Multi-source support (Phase 1)
  // Drift type hints from triage agent for category-aware resolution
  driftTypeHints?: Array<'instruction' | 'process' | 'ownership' | 'coverage' | 'environment_tooling'>;
  // Preferred doc category based on drift type
  preferredDocCategory?: 'functional' | 'developer' | 'operational';
  // CRITICAL: Target doc systems from source-output compatibility matrix
  // This enforces the routing rules: e.g., GitHub PR instruction drift → README first, not Confluence
  targetDocSystems?: string[];
}

// ============================================================================
// Drift Type to Doc Category Mapping (Phase 1 - Multi-Source)
// ============================================================================

/**
 * Maps drift types to preferred documentation categories
 * Per MULTI_SOURCE_IMPLEMENTATION_PLAN.md Section 5.2
 */
export const DRIFT_TYPE_TO_DOC_CATEGORY: Record<string, Array<'functional' | 'developer' | 'operational'>> = {
  instruction: ['developer', 'functional'],      // API docs, README, then Confluence
  process: ['functional', 'operational'],         // Runbooks, procedures
  ownership: ['functional', 'operational'],       // Team docs, service catalog
  coverage: ['functional'],                       // FAQ, knowledge base
  environment_tooling: ['developer', 'functional'], // README, code docs
};

/**
 * Get preferred doc categories for given drift types
 */
export function getDocCategoriesForDriftTypes(
  driftTypes: string[] | undefined
): Array<'functional' | 'developer' | 'operational'> {
  if (!driftTypes || driftTypes.length === 0) {
    // Default: functional first (backward compatible)
    return ['functional', 'developer', 'operational'];
  }

  const categoriesSet = new Set<'functional' | 'developer' | 'operational'>();

  for (const driftType of driftTypes) {
    const categories = DRIFT_TYPE_TO_DOC_CATEGORY[driftType];
    if (categories) {
      for (const cat of categories) {
        categoriesSet.add(cat);
      }
    }
  }

  // If no categories found, return all in default order
  if (categoriesSet.size === 0) {
    return ['functional', 'developer', 'operational'];
  }

  return Array.from(categoriesSet);
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
  const { workspaceId, repo, service, prBody, shouldIgnore, ignoreReason, policy, driftTypeHints } = input;

  console.log(`[DocResolution] Resolving docs for workspace=${workspaceId}, repo=${repo}, service=${service}, driftTypeHints=${driftTypeHints?.join(', ')}, policy.primaryDocRequired=${policy?.primaryDocRequired}`);

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
  // With category-aware resolution (Phase 1 - Multi-Source)
  // CRITICAL FIX: Filter by targetDocSystems to enforce source-output compatibility
  // -------------------------------------------------------------------------
  const preferredCategories = getDocCategoriesForDriftTypes(driftTypeHints);
  const { targetDocSystems } = input;

  console.log(`[DocResolution] P1: Looking up DocMappingV2 for repo=${repo}, service=${service}, preferredCategories=[${preferredCategories.join(', ')}], targetDocSystems=[${targetDocSystems?.join(', ') || 'none'}]`);

  // Build where clause with targetDocSystems filter
  const whereClause: any = {
    workspaceId,
    OR: [
      repo ? { repo } : {},
      service ? { service } : {},
    ].filter(c => Object.keys(c).length > 0),
  };

  // CRITICAL: Filter by targetDocSystems if provided (enforces source-output compatibility)
  if (targetDocSystems && targetDocSystems.length > 0) {
    whereClause.docSystem = { in: targetDocSystems };
    console.log(`[DocResolution] P1: Filtering by targetDocSystems=[${targetDocSystems.join(', ')}]`);
  }

  const mappings = await prisma.docMappingV2.findMany({
    where: whereClause,
    orderBy: [
      { isPrimary: 'desc' },
      { updatedAt: 'desc' },
    ],
    take: 10, // Increased to allow category filtering
  });

  attempts.push({
    step: 'mapping_lookup',
    ok: mappings.length > 0,
    info: {
      mappingsFound: mappings.length,
      repo,
      service,
      preferredCategories,
      targetDocSystems: targetDocSystems || null,
      filterApplied: !!(targetDocSystems && targetDocSystems.length > 0),
    },
  });

  if (mappings.length > 0) {
    console.log(`[DocResolution] P1: Found ${mappings.length} mappings`);

    // Map and score candidates with category awareness
    const p1Candidates: DocCandidate[] = mappings.map(m => {
      // Calculate base confidence
      let confidence = m.isPrimary ? 0.85 : 0.70;
      const reasons: string[] = [
        m.repo === repo ? 'Matched by repository' : 'Matched by service',
        m.isPrimary ? 'Primary doc mapping' : 'Secondary doc mapping',
      ];

      // CRITICAL: Boost confidence based on targetDocSystems priority order
      // This ensures source-output compatibility matrix is enforced
      if (targetDocSystems && targetDocSystems.length > 0) {
        const docSystemIndex = targetDocSystems.indexOf(m.docSystem);
        if (docSystemIndex >= 0) {
          // First target gets +0.20, second +0.15, third +0.10, etc.
          // This ensures README (index 0) beats Confluence (index 3) for instruction drift
          const priorityBoost = Math.max(0.20 - (docSystemIndex * 0.05), 0);
          confidence = Math.min(confidence + priorityBoost, 0.99);
          reasons.push(`Target doc system priority: #${docSystemIndex + 1} of ${targetDocSystems.length}`);
        }
      }

      // Boost confidence if doc category matches preferred categories
      const docCategory = (m as any).docCategory as string | null;
      if (docCategory && preferredCategories.includes(docCategory as any)) {
        const categoryIndex = preferredCategories.indexOf(docCategory as any);
        // Reduced boost to not override targetDocSystems priority
        const categoryBoost = categoryIndex === 0 ? 0.03 : 0.01;
        confidence = Math.min(confidence + categoryBoost, 0.99);
        reasons.push(`Category match: ${docCategory} (preferred for drift type)`);
      }

      // Boost if doc has matching drift type affinity
      const driftTypeAffinity = (m as any).driftTypeAffinity as string[] | null;
      if (driftTypeHints && driftTypeAffinity && driftTypeAffinity.length > 0) {
        const matchingAffinities = driftTypeHints.filter(dt => driftTypeAffinity.includes(dt));
        if (matchingAffinities.length > 0) {
          confidence = Math.min(confidence + 0.02, 0.99);
          reasons.push(`Drift type affinity match: ${matchingAffinities.join(', ')}`);
        }
      }

      return {
        docId: m.docId,
        docSystem: m.docSystem as 'confluence' | 'notion',
        docTitle: m.docTitle,
        docUrl: m.docUrl,
        isPrimary: m.isPrimary,
        hasManagedRegion: m.hasManagedRegion,
        allowWriteback: m.allowWriteback,
        spaceKey: m.spaceKey ?? undefined,
        reasons,
        confidence,
      };
    });

    // Sort by confidence (category/affinity boosts included), then isPrimary
    p1Candidates.sort((a, b) => {
      // Primary docs always first within similar confidence
      if (a.isPrimary !== b.isPrimary && Math.abs(a.confidence - b.confidence) < 0.15) {
        return a.isPrimary ? -1 : 1;
      }
      return b.confidence - a.confidence;
    });

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
  // P2: Search fallback - Use Confluence CQL search to find relevant docs
  // -------------------------------------------------------------------------
  console.log(`[DocResolution] P2: No mappings found, attempting Confluence search fallback`);

  // Build search query from repo name, service, and PR title
  const searchTerms: string[] = [];
  if (repo) {
    // Extract repo name without org (e.g., "my-repo" from "org/my-repo")
    const repoName = repo.includes('/') ? repo.split('/')[1] : repo;
    if (repoName) searchTerms.push(repoName);
  }
  if (service) searchTerms.push(service);
  if (input.prTitle) {
    // Add key words from PR title (filter out common words)
    const titleWords = input.prTitle
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !['the', 'and', 'for', 'with', 'from', 'this', 'that', 'update', 'fix', 'add', 'remove'].includes(w))
      .slice(0, 3);
    searchTerms.push(...titleWords);
  }

  if (searchTerms.length === 0) {
    console.log(`[DocResolution] P2: No search terms available`);
    return {
      status: 'needs_mapping',
      method: 'none',
      confidence: 0,
      noWritebackMode: true,
      candidates: [],
      repoFullName,
      attempts,
      thresholds,
      notes: 'No doc mappings found and no search terms available.',
    };
  }

  const searchQuery = searchTerms.join(' ');
  console.log(`[DocResolution] P2: Searching Confluence with query: "${searchQuery}"`);

  try {
    const searchResults = await searchPages(workspaceId, searchQuery, 5);

    attempts.push({
      step: 'confluence_search',
      ok: searchResults.length > 0,
      info: { query: searchQuery, resultsFound: searchResults.length },
    });

    if (searchResults.length > 0) {
      console.log(`[DocResolution] P2: Found ${searchResults.length} search results`);

      // Convert search results to candidates
      // Lower confidence for search results (0.5-0.65 range)
      const p2Candidates: DocCandidate[] = searchResults.map((result, index) => ({
        docId: result.id,
        docSystem: 'confluence' as const,
        docTitle: result.title,
        docUrl: null, // Search results don't include URL
        isPrimary: false,
        hasManagedRegion: false,
        allowWriteback: false, // Don't allow writeback for search results (safety)
        spaceKey: result.spaceKey,
        reasons: [
          'Found via Confluence search',
          `Matched query: "${searchQuery}"`,
          `Result #${index + 1} of ${searchResults.length}`,
        ],
        // Confidence decreases with position (0.65, 0.60, 0.55, 0.50, 0.45)
        confidence: Math.max(0.45, 0.65 - (index * 0.05)),
      }));

      return {
        status: 'search_candidate',
        method: 'confluence_search',
        confidence: p2Candidates[0]?.confidence ?? 0.5,
        noWritebackMode: true, // Always read-only for search results
        candidates: p2Candidates.slice(0, 3),
        repoFullName,
        attempts,
        thresholds,
        notes: `Found ${searchResults.length} potential doc(s) via Confluence search. Please verify and approve.`,
      };
    }
  } catch (error: any) {
    console.error(`[DocResolution] P2: Confluence search failed:`, error);
    attempts.push({
      step: 'confluence_search',
      ok: false,
      error: error.message,
    });
  }

  // No results from P2 search
  return {
    status: 'needs_mapping',
    method: 'none',
    confidence: 0,
    noWritebackMode: true,
    candidates: [],
    repoFullName,
    attempts,
    thresholds,
    notes: 'No doc mappings found and Confluence search returned no results.',
  };
}

