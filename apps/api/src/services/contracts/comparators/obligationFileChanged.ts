/**
 * Obligation File Changed Comparator
 * 
 * Checks if required files were modified in the PR.
 * This is a Tier 0 comparator (foundation, highest PMF).
 * 
 * Use Cases:
 * - If API changes, ensure CHANGELOG.md was updated
 * - If infrastructure changes, ensure docs/runbook.md was updated
 * - If security changes, ensure SECURITY.md was reviewed
 * - If dependencies change, ensure package-lock.json was updated
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

interface FileChangedConfig {
  requiredChangedFiles: string[]; // e.g., ["CHANGELOG.md", "docs/runbook.md"]
  caseSensitive?: boolean; // Default: true
  allowPattern?: boolean; // Default: false (if true, supports glob patterns)
}

interface FileChangedData {
  changedFiles: Set<string>; // Files that were modified in the PR
}

// ======================================================================
// COMPARATOR
// ======================================================================

export class ObligationFileChangedComparator extends BaseComparator {
  readonly comparatorType = 'obligation.file_changed';
  readonly supportedArtifactTypes = ['github_pr', 'git_diff'];

  canCompare(invariant: Invariant, snapshots: ArtifactSnapshot[]): boolean {
    if (invariant.comparatorType !== this.comparatorType) {
      return false;
    }

    // Need at least one PR/diff snapshot
    const hasPR = snapshots.some(s =>
      this.supportedArtifactTypes.includes(s.artifactType)
    );

    return hasPR;
  }

  extractData(snapshot: ArtifactSnapshot): FileChangedData {
    const extract = snapshot.extract as any;
    
    // Extract changed files from snapshot
    // Expected format: { changedFiles: string[] } or { files: Array<{ filename: string }> }
    let changedFileList: string[] = [];

    if (extract?.changedFiles && Array.isArray(extract.changedFiles)) {
      changedFileList = extract.changedFiles;
    } else if (extract?.files && Array.isArray(extract.files)) {
      changedFileList = extract.files.map((item: any) => item.filename || item.path || item.name || '');
    } else if (Array.isArray(extract)) {
      changedFileList = extract;
    }

    return {
      changedFiles: new Set(changedFileList.filter(f => f)),
    };
  }

  async performComparison(
    left: FileChangedData,
    right: FileChangedData,
    input: ComparatorInput
  ): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];

    // Get required changed files from invariant config
    const config = input.invariant.config as FileChangedConfig;
    if (!config || !config.requiredChangedFiles) {
      console.warn('[ObligationFileChanged] No required changed files configured');
      return findings;
    }

    const requiredChangedFiles = config.requiredChangedFiles;
    const caseSensitive = config.caseSensitive ?? true;
    const allowPattern = config.allowPattern ?? false;

    // Use the most recent snapshot (right) for checking
    const { changedFiles } = right;

    // Normalize file set if case-insensitive
    const normalizedChangedFiles = caseSensitive
      ? changedFiles
      : new Set(Array.from(changedFiles).map(f => f.toLowerCase()));

    // Check each required changed file
    for (const requiredFile of requiredChangedFiles) {
      const normalizedRequired = caseSensitive
        ? requiredFile
        : requiredFile.toLowerCase();

      let found = false;

      if (allowPattern && requiredFile.includes('*')) {
        // Simple glob pattern matching (e.g., "docs/*.md")
        const pattern = this.globToRegex(normalizedRequired);
        found = Array.from(normalizedChangedFiles).some(f => pattern.test(f));
      } else {
        // Exact match
        found = normalizedChangedFiles.has(normalizedRequired);
      }

      if (!found) {
        const evidence: EvidenceItem[] = [{
          kind: 'file_not_changed',
          leftValue: null,
          rightValue: {
            requiredFile,
            changedFiles: Array.from(changedFiles).slice(0, 20), // Limit for readability
          },
          pointers: {
            left: null,
            right: `/changedFiles/${requiredFile}`,
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
    const criticalFiles = ['SECURITY.md', 'CODEOWNERS'];
    const highPriorityFiles = ['CHANGELOG.md', 'docs/runbook.md', 'package-lock.json'];

    const normalized = fileName.toLowerCase();

    if (criticalFiles.some(f => normalized.includes(f.toLowerCase()))) {
      return 'high';
    }

    if (highPriorityFiles.some(f => normalized.includes(f.toLowerCase()))) {
      return 'medium';
    }

    return 'low';
  }

  private globToRegex(pattern: string): RegExp {
    // Simple glob to regex conversion
    // * matches any characters except /
    // ** matches any characters including /
    const escaped = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '___DOUBLE_STAR___')
      .replace(/\*/g, '[^/]*')
      .replace(/___DOUBLE_STAR___/g, '.*');
    
    return new RegExp(`^${escaped}$`);
  }
}

// ======================================================================
// AUTO-REGISTRATION
// ======================================================================

const obligationFileChangedComparator = new ObligationFileChangedComparator();
getComparatorRegistry().register(obligationFileChangedComparator);

