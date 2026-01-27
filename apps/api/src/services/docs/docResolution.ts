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

export type DocResolutionStatus = 'explicit_link' | 'mapped' | 'search_candidate' | 'needs_mapping';
export type DocResolutionMethod = 'pr_link' | 'mapping' | 'confluence_search' | 'notion_search' | 'none';

export interface DocCandidate {
  docId: string;
  docSystem: 'confluence' | 'notion';
  docTitle: string;
  docUrl: string | null;
  isPrimary: boolean;
  hasManagedRegion: boolean;
  matchReason: string;
  confidence: number;
}

export interface DocResolutionResult {
  status: DocResolutionStatus;
  method: DocResolutionMethod;
  confidence: number;
  noWritebackMode: boolean;
  candidates: DocCandidate[];
  notes?: string;
}

export interface DocResolutionInput {
  workspaceId: string;
  repo: string | null;
  service: string | null;
  prBody?: string | null;
  prTitle?: string | null;
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
 */
export async function resolveDocsForDrift(input: DocResolutionInput): Promise<DocResolutionResult> {
  const { workspaceId, repo, service, prBody } = input;
  
  console.log(`[DocResolution] Resolving docs for workspace=${workspaceId}, repo=${repo}, service=${service}`);
  
  // -------------------------------------------------------------------------
  // P0: Check for explicit doc links in PR body
  // -------------------------------------------------------------------------
  const prLinks = extractDocLinksFromPR(prBody);
  
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
          matchReason: 'Explicit link in PR body',
          confidence: 0.95,
        });
      } else {
        // Doc not in mappings but linked in PR - create candidate with lower confidence
        p0Candidates.push({
          docId: link.docId || link.url,
          docSystem: link.docSystem,
          docTitle: 'Unknown (from PR link)',
          docUrl: link.url,
          isPrimary: false,
          hasManagedRegion: false,
          matchReason: 'Explicit link in PR body (not in mappings)',
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

      return {
        status: 'explicit_link',
        method: 'pr_link',
        confidence: p0Candidates[0]?.confidence ?? 0.75,
        noWritebackMode: !p0Candidates[0]?.isPrimary,
        candidates: p0Candidates.slice(0, 3),
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

  if (mappings.length > 0) {
    console.log(`[DocResolution] P1: Found ${mappings.length} mappings`);

    const p1Candidates: DocCandidate[] = mappings.map(m => ({
      docId: m.docId,
      docSystem: m.docSystem as 'confluence' | 'notion',
      docTitle: m.docTitle,
      docUrl: m.docUrl,
      isPrimary: m.isPrimary,
      hasManagedRegion: m.hasManagedRegion,
      matchReason: m.repo === repo ? 'Repo mapping' : 'Service mapping',
      confidence: m.isPrimary ? 0.85 : 0.70,
    }));

    // Primary docs get higher confidence
    const primaryDoc = p1Candidates.find(c => c.isPrimary);

    return {
      status: 'mapped',
      method: 'mapping',
      confidence: primaryDoc?.confidence ?? p1Candidates[0]?.confidence ?? 0.70,
      noWritebackMode: false,
      candidates: p1Candidates.slice(0, 3),
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
    notes: 'No doc mappings found for this repo/service. Please configure doc mappings.',
  };
}

