/**
 * Docs Required Sections Comparator
 * 
 * Checks if documentation contains all required sections.
 * This is a Tier 0 comparator (foundation, highest PMF).
 * 
 * Use Cases:
 * - Ensure README has "Installation", "Usage", "API Reference" sections
 * - Ensure runbooks have "Prerequisites", "Deployment", "Rollback" sections
 * - Ensure API docs have "Authentication", "Endpoints", "Examples" sections
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

interface RequiredSectionsConfig {
  requiredSections: string[]; // e.g., ["Installation", "Usage", "API Reference"]
  caseSensitive?: boolean; // Default: false
  exactMatch?: boolean; // Default: false (allows fuzzy matching)
}

// ======================================================================
// COMPARATOR
// ======================================================================

export class DocsRequiredSectionsComparator extends BaseComparator {
  readonly comparatorType = 'docs.required_sections';
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

  extractData(snapshot: ArtifactSnapshot): string[] {
    // Extract headers from markdown content
    const content = this.getContent(snapshot);
    const extract = this.markdownExtractor.extract(content);
    
    // Return header texts (normalized)
    return extract.headers.map(h => h.text.toLowerCase().trim());
  }

  async performComparison(
    left: string[],
    right: string[],
    input: ComparatorInput
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    // Get required sections from invariant config
    const config = input.invariant.config as RequiredSectionsConfig;
    if (!config || !config.requiredSections) {
      console.warn('[DocsRequiredSections] No required sections configured');
      return findings;
    }

    const requiredSections = config.requiredSections;
    const caseSensitive = config.caseSensitive ?? false;
    const exactMatch = config.exactMatch ?? false;

    // Use the most recent snapshot (right) for checking
    const actualSections = right;

    // Check each required section
    for (const requiredSection of requiredSections) {
      const normalizedRequired = caseSensitive
        ? requiredSection
        : requiredSection.toLowerCase().trim();

      const found = actualSections.some(actualSection => {
        const normalizedActual = caseSensitive
          ? actualSection
          : actualSection.toLowerCase().trim();

        if (exactMatch) {
          return normalizedActual === normalizedRequired;
        } else {
          // Fuzzy match: check if required section is contained in actual section
          return normalizedActual.includes(normalizedRequired) ||
                 normalizedRequired.includes(normalizedActual);
        }
      });

      if (!found) {
        const evidence: EvidenceItem[] = [{
          kind: 'section_missing',
          leftValue: null,
          rightValue: { requiredSection, actualSections },
          pointers: {
            left: null,
            right: '/headers',
          },
        }];

        const severity: Severity = this.getSeverity(requiredSection);

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

  private getSeverity(sectionName: string): Severity {
    const criticalSections = ['installation', 'deployment', 'authentication', 'security'];
    const highPrioritySections = ['usage', 'api reference', 'configuration', 'prerequisites'];

    const normalized = sectionName.toLowerCase();

    if (criticalSections.some(s => normalized.includes(s))) {
      return 'high';
    }

    if (highPrioritySections.some(s => normalized.includes(s))) {
      return 'medium';
    }

    return 'low';
  }
}

// ======================================================================
// AUTO-REGISTRATION
// ======================================================================

const docsRequiredSectionsComparator = new DocsRequiredSectionsComparator();
getComparatorRegistry().register(docsRequiredSectionsComparator);

