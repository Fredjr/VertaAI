/**
 * Obligation File Present Comparator
 * 
 * Checks if required files exist in the repository.
 * This is a Tier 0 comparator (foundation, highest PMF).
 * 
 * Use Cases:
 * - Ensure CHANGELOG.md exists
 * - Ensure tests/ directory exists
 * - Ensure .github/CODEOWNERS exists
 * - Ensure docs/runbook.md exists for infrastructure changes
 */

import { BaseComparator } from './base.js';
import { getComparatorRegistry } from './registry.js';
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

interface FilePresentConfig {
  requiredFiles: string[]; // e.g., ["CHANGELOG.md", "tests/", ".github/CODEOWNERS"]
  caseSensitive?: boolean; // Default: true (file paths are case-sensitive on Unix)
}

interface FilePresentData {
  files: Set<string>; // All files in the repository
}

// ======================================================================
// COMPARATOR
// ======================================================================

export class ObligationFilePresentComparator extends BaseComparator {
  readonly comparatorType = 'obligation.file_present';
  readonly supportedArtifactTypes = ['github_repo', 'git_tree'];

  canCompare(invariant: Invariant, snapshots: ArtifactSnapshot[]): boolean {
    if (invariant.comparatorType !== this.comparatorType) {
      return false;
    }

    // Need at least one repo/tree snapshot
    const hasRepo = snapshots.some(s =>
      this.supportedArtifactTypes.includes(s.artifactType)
    );

    return hasRepo;
  }

  extractData(snapshot: ArtifactSnapshot): FilePresentData {
    const extract = snapshot.extract as any;
    
    // Extract file list from snapshot
    // Expected format: { files: string[] } or { tree: Array<{ path: string }> }
    let fileList: string[] = [];

    if (extract?.files && Array.isArray(extract.files)) {
      fileList = extract.files;
    } else if (extract?.tree && Array.isArray(extract.tree)) {
      fileList = extract.tree.map((item: any) => item.path || item.name || '');
    } else if (Array.isArray(extract)) {
      fileList = extract;
    }

    return {
      files: new Set(fileList.filter(f => f)),
    };
  }

  async performComparison(
    left: FilePresentData,
    right: FilePresentData,
    input: ComparatorInput
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    // Get required files from invariant config
    const config = input.invariant.config as FilePresentConfig;
    if (!config || !config.requiredFiles) {
      console.warn('[ObligationFilePresent] No required files configured');
      return findings;
    }

    const requiredFiles = config.requiredFiles;
    const caseSensitive = config.caseSensitive ?? true;

    // Use the most recent snapshot (right) for checking
    const { files } = right;

    // Normalize file set if case-insensitive
    const normalizedFiles = caseSensitive
      ? files
      : new Set(Array.from(files).map(f => f.toLowerCase()));

    // Check each required file
    for (const requiredFile of requiredFiles) {
      const normalizedRequired = caseSensitive
        ? requiredFile
        : requiredFile.toLowerCase();

      const found = normalizedFiles.has(normalizedRequired) ||
                    // Also check if it's a directory (ends with /)
                    (requiredFile.endsWith('/') && 
                     Array.from(normalizedFiles).some(f => f.startsWith(normalizedRequired)));

      if (!found) {
        const evidence: EvidenceItem[] = [{
          kind: 'file_missing',
          leftValue: null,
          rightValue: {
            requiredFile,
            availableFiles: Array.from(files).slice(0, 20), // Limit to first 20 for readability
          },
          pointers: {
            left: null,
            right: `/files/${requiredFile}`,
          },
        }];

        const severity: Severity = this.getSeverity(requiredFile);

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

  private getSeverity(fileName: string): Severity {
    const criticalFiles = ['CODEOWNERS', 'LICENSE', 'SECURITY.md'];
    const highPriorityFiles = ['CHANGELOG.md', 'README.md', 'tests/', 'docs/runbook.md'];

    const normalized = fileName.toLowerCase();

    if (criticalFiles.some(f => normalized.includes(f.toLowerCase()))) {
      return 'high';
    }

    if (highPriorityFiles.some(f => normalized.includes(f.toLowerCase()))) {
      return 'medium';
    }

    return 'low';
  }
}

// ======================================================================
// AUTO-REGISTRATION
// ======================================================================

const obligationFilePresentComparator = new ObligationFilePresentComparator();
getComparatorRegistry().register(obligationFilePresentComparator);

