/**
 * Docs Anchor Check Comparator
 * 
 * Validates that internal links (anchors) in documentation point to existing headers.
 * This is a Tier 0 comparator (foundation, highest PMF).
 * 
 * Use Cases:
 * - Detect broken internal links in README
 * - Ensure table of contents links are valid
 * - Validate cross-references between sections
 */

import { BaseComparator } from './base.js';
import { getComparatorRegistry } from './registry.js';
import { MarkdownExtractor } from '../extractors/markdownExtractor.js';
import type {
  Invariant,
  ArtifactSnapshot,
  IntegrityFinding,
  ComparatorInput,
  EvidenceItem,
  Severity,
} from '../types.js';

// ======================================================================
// TYPES
// ======================================================================

interface AnchorCheckData {
  anchors: Set<string>; // Available anchors (from headers)
  links: Array<{ text: string; anchor: string; line: number }>; // Internal links
}

// ======================================================================
// COMPARATOR
// ======================================================================

export class DocsAnchorCheckComparator extends BaseComparator {
  readonly comparatorType = 'docs.anchor_check';
  readonly supportedArtifactTypes = ['github_readme', 'confluence_page', 'notion_page', 'markdown'];

  private markdownExtractor = new MarkdownExtractor();

  canCompare(invariant: Invariant, snapshots: ArtifactSnapshot[]): boolean {
    if (invariant.comparatorType !== this.comparatorType) {
      return false;
    }

    // Need at least one doc snapshot
    const hasDoc = snapshots.some(s =>
      this.supportedArtifactTypes.includes(s.artifactType)
    );

    return hasDoc;
  }

  extractData(snapshot: ArtifactSnapshot): AnchorCheckData {
    const content = this.getContent(snapshot);
    const extract = this.markdownExtractor.extract(content);

    // Extract available anchors from headers
    const anchors = new Set<string>();
    for (const header of extract.headers) {
      anchors.add(header.anchor);
    }

    // Extract internal links (those starting with #)
    const links = extract.links
      .filter(link => link.url.startsWith('#'))
      .map(link => ({
        text: link.text,
        anchor: link.url.substring(1), // Remove leading #
        line: link.line,
      }));

    return { anchors, links };
  }

  async performComparison(
    left: AnchorCheckData,
    right: AnchorCheckData,
    input: ComparatorInput
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    // Use the most recent snapshot (right) for checking
    const { anchors, links } = right;

    // Check each internal link
    for (const link of links) {
      if (!anchors.has(link.anchor)) {
        const evidence: EvidenceItem[] = [{
          kind: 'broken_anchor',
          leftValue: null,
          rightValue: {
            linkText: link.text,
            targetAnchor: link.anchor,
            line: link.line,
            availableAnchors: Array.from(anchors),
          },
          pointers: {
            left: null,
            right: `/links/${link.anchor}`,
          },
        }];

        // Broken links are medium severity (annoying but not critical)
        const severity: Severity = 'medium';

        findings.push(this.createFinding({
          workspaceId: input.context.workspaceId,
          contractId: input.context.contractId,
          invariantId: input.invariant.invariantId,
          driftType: 'instruction',
          severity,
          compared: {
            left: { artifact: input.leftSnapshot, snapshotId: input.leftSnapshot.id },
            right: { artifact: input.rightSnapshot, snapshotId: input.rightSnapshot.id },
          },
          evidence,
          context: input.context,
        }));
      }
    }

    return findings;
  }

  // ======================================================================
  // HELPER METHODS
  // ======================================================================

  private getContent(snapshot: ArtifactSnapshot): string {
    const extract = snapshot.extract as any;
    return extract?.content || extract || '';
  }
}

// ======================================================================
// AUTO-REGISTRATION
// ======================================================================

const docsAnchorCheckComparator = new DocsAnchorCheckComparator();
getComparatorRegistry().register(docsAnchorCheckComparator);

