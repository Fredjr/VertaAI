/**
 * Contract Resolver
 * Phase 1 Week 1-2: Contract Registry & Resolution Engine
 * 
 * Resolves contracts from signal events using file pattern matching.
 * Reuses existing parsers (iacParser, openApiParser, codeownersParser).
 */

import type { SignalEvent } from '@prisma/client';
import { isIaCFile, detectIaCType } from '../signals/iacParser.js';
import { isOpenApiFile } from '../signals/openApiParser.js';
import type {
  Contract,
  ArtifactRef,
  ContractResolutionResult,
  ResolvedContract,
  UnresolvedArtifact,
  Obligation,
  ResolutionMethod,
} from './types.js';

// ============================================================================
// Contract Resolver Class
// ============================================================================

export class ContractResolver {
  constructor(
    private workspaceId: string,
    private contractPack: Contract[]
  ) {}

  /**
   * Resolve contracts from a signal event
   * 
   * Integration: Called from webhook handler after SignalEvent creation
   * Reuses: File pattern matching from iacParser, openApiParser
   */
  async resolveFromSignal(signal: SignalEvent): Promise<ContractResolutionResult> {
    const result: ContractResolutionResult = {
      resolvedContracts: [],
      unresolvedArtifacts: [],
      obligations: []
    };

    // Extract changed files from signal
    const changedFiles = this.extractChangedFiles(signal);
    const service = this.extractService(signal);
    const repo = this.extractRepo(signal);

    // Strategy 1: Explicit path mapping (highest confidence)
    for (const contract of this.contractPack) {
      const match = this.matchByExplicitPath(contract, changedFiles, repo);
      if (match.matched) {
        result.resolvedContracts.push({
          contractId: contract.contractId,
          resolutionMethod: 'explicit_path',
          confidence: 1.0,
          triggeredBy: { files: match.matchedFiles }
        });
      }
    }

    // Strategy 2: File pattern matching (deterministic, high priority)
    for (const contract of this.contractPack) {
      // Skip if already resolved by explicit path
      if (result.resolvedContracts.some(rc => rc.contractId === contract.contractId)) {
        continue;
      }

      const match = this.matchByFilePattern(contract, changedFiles, repo);
      if (match.matched) {
        result.resolvedContracts.push({
          contractId: contract.contractId,
          resolutionMethod: 'file_pattern',
          confidence: match.confidence,
          triggeredBy: { files: match.matchedFiles }
        });
      }
    }

    // Strategy 3: Directory pattern matching
    for (const contract of this.contractPack) {
      // Skip if already resolved
      if (result.resolvedContracts.some(rc => rc.contractId === contract.contractId)) {
        continue;
      }

      const match = this.matchByDirectoryPattern(contract, changedFiles);
      if (match.matched) {
        result.resolvedContracts.push({
          contractId: contract.contractId,
          resolutionMethod: 'directory_pattern',
          confidence: 0.7,
          triggeredBy: { files: match.matchedFiles }
        });
      }
    }

    // Strategy 4: CODEOWNERS mapping
    const codeownersMatch = await this.matchByCodeowners(changedFiles, repo);
    if (codeownersMatch) {
      for (const contract of this.contractPack) {
        // Skip if already resolved
        if (result.resolvedContracts.some(rc => rc.contractId === contract.contractId)) {
          continue;
        }

        if (this.matchesCodeownersScope(contract, codeownersMatch)) {
          result.resolvedContracts.push({
            contractId: contract.contractId,
            resolutionMethod: 'codeowners',
            confidence: 0.75,
            triggeredBy: { files: codeownersMatch.files, owners: codeownersMatch.owners }
          });
        }
      }
    }

    // Strategy 5: Service tag mapping (fallback)
    if (result.resolvedContracts.length === 0 && service) {
      for (const contract of this.contractPack) {
        if (this.matchesServiceScope(contract, service, repo)) {
          result.resolvedContracts.push({
            contractId: contract.contractId,
            resolutionMethod: 'service_tag',
            confidence: 0.6,
            triggeredBy: { service }
          });
        }
      }
    }

    // Track unresolved files (coverage accounting)
    const resolvedFiles = new Set(
      result.resolvedContracts.flatMap(c => c.triggeredBy.files || [])
    );

    for (const file of changedFiles) {
      if (!resolvedFiles.has(file) && this.isContractRelevantFile(file)) {
        const candidates = this.findCandidateContracts(file);
        
        result.unresolvedArtifacts.push({
          file,
          reason: candidates.length > 0 ? 'low_confidence' : 'no_mapping',
          candidates
        });

        result.obligations.push({
          type: 'NEEDS_CONTRACT_MAPPING',
          artifact: file,
          suggestedAction: candidates.length > 0
            ? `Low confidence match. Consider adding explicit mapping for ${file}`
            : `Add contract mapping for ${file} or update file patterns`
        });
      }
    }

    return result;
  }

  /**
   * Match contract by file patterns
   * 
   * Reuses: isIaCFile, isOpenApiFile from existing parsers
   */
  private matchByFilePattern(
    contract: Contract,
    changedFiles: string[],
    repo: string
  ): { matched: boolean; confidence: number; matchedFiles: string[] } {
    const matchedFiles: string[] = [];

    for (const artifact of contract.artifacts) {
      if (artifact.system !== 'github') continue;
      if (artifact.locator.repo && artifact.locator.repo !== repo) continue;

      for (const file of changedFiles) {
        // Use existing parsers for type detection
        const fileMatches = this.fileMatchesArtifact(file, artifact);
        if (fileMatches) {
          matchedFiles.push(file);
        }
      }
    }

    if (matchedFiles.length === 0) {
      return { matched: false, confidence: 0, matchedFiles: [] };
    }

    // Confidence based on artifact role
    const hasPrimaryMatch = matchedFiles.some(f =>
      contract.artifacts.some(a =>
        a.role === 'primary' && this.fileMatchesArtifact(f, a)
      )
    );

    return {
      matched: true,
      confidence: hasPrimaryMatch ? 1.0 : 0.7,
      matchedFiles
    };
  }

  /**
   * Check if file matches artifact definition
   * 
   * Integration: Reuses existing file type detection
   */
  private fileMatchesArtifact(file: string, artifact: ArtifactRef): boolean {
    // Exact path match
    if (artifact.locator.path && file === artifact.locator.path) {
      return true;
    }

    // Type-based matching using existing parsers
    switch (artifact.type) {
      case 'openapi':
        return isOpenApiFile(file);

      case 'iac_terraform':
        return isIaCFile(file) && detectIaCType(file) === 'terraform';

      case 'iac_pulumi':
        return isIaCFile(file) && detectIaCType(file) === 'pulumi';

      case 'readme':
        return file.toLowerCase().includes('readme');

      default:
        return false;
    }
  }

  /**
   * Check if contract matches service scope
   */
  private matchesServiceScope(contract: Contract, service: string, repo?: string): boolean {
    // Check service match
    if (contract.scope.service === service) {
      return true;
    }

    // Check repo match
    if (repo && contract.scope.repo === repo) {
      return true;
    }

    // Check tags
    if (contract.scope.tags?.includes(service)) {
      return true;
    }

    return false;
  }

  /**
   * Check if file is potentially contract-relevant
   *
   * Integration: Reuses existing operational path patterns
   */
  private isContractRelevantFile(file: string): boolean {
    // Reuse existing operational path patterns
    const operationalPaths = [
      '**/deploy/**',
      '**/infra/**',
      '**/terraform/**',
      '**/helm/**',
      '**/k8s/**',
      '**/.github/workflows/**',
      '**/config/**',
      '**/docs/**',
      'openapi.*',
      'swagger.*',
      'README.md'
    ];

    return operationalPaths.some(pattern =>
      this.globMatch(file, pattern)
    );
  }

  /**
   * Find candidate contracts for a file (fuzzy matching)
   */
  private findCandidateContracts(file: string): Array<{ contractId: string; score: number }> {
    const candidates: Array<{ contractId: string; score: number }> = [];

    for (const contract of this.contractPack) {
      let score = 0;

      // Check if file type matches any artifact type
      for (const artifact of contract.artifacts) {
        if (this.fileMatchesArtifact(file, artifact)) {
          score += artifact.role === 'primary' ? 0.8 : 0.5;
        }
      }

      if (score > 0) {
        candidates.push({ contractId: contract.contractId, score });
      }
    }

    return candidates.sort((a, b) => b.score - a.score).slice(0, 3);
  }

  /**
   * Extract changed files from signal
   */
  private extractChangedFiles(signal: SignalEvent): string[] {
    const extracted = signal.extracted as any;
    return extracted?.changedFiles || extracted?.files || [];
  }

  /**
   * Extract service from signal
   */
  private extractService(signal: SignalEvent): string | undefined {
    const extracted = signal.extracted as any;
    return extracted?.service || signal.service || undefined;
  }

  /**
   * Extract repo from signal
   */
  private extractRepo(signal: SignalEvent): string {
    const extracted = signal.extracted as any;
    return extracted?.repo || signal.repo || '';
  }

  /**
   * Simple glob matching
   *
   * Note: Can use minimatch library for more advanced patterns
   */
  private globMatch(file: string, pattern: string): boolean {
    // Simple glob matching (can use minimatch library)
    const regex = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regex}$`).test(file);
  }

  // ============================================================================
  // New Resolution Strategies (Task 3)
  // ============================================================================

  /**
   * Strategy 1: Explicit path mapping
   * Matches exact file paths specified in contract artifacts
   * Confidence: 1.0 (highest)
   */
  private matchByExplicitPath(
    contract: Contract,
    changedFiles: string[],
    repo: string
  ): { matched: boolean; matchedFiles: string[]; confidence: number } {
    const matchedFiles: string[] = [];

    for (const artifact of contract.artifacts) {
      // Only match if artifact has explicit path
      if (!artifact.locator.path) {
        continue;
      }

      // Check repo scope if specified
      if (artifact.locator.repo && artifact.locator.repo !== repo) {
        continue;
      }

      // Exact path match
      if (changedFiles.includes(artifact.locator.path)) {
        matchedFiles.push(artifact.locator.path);
      }
    }

    return {
      matched: matchedFiles.length > 0,
      matchedFiles,
      confidence: 1.0
    };
  }

  /**
   * Strategy 3: Directory pattern matching
   * Matches files based on directory structure
   * Confidence: 0.7
   */
  private matchByDirectoryPattern(
    contract: Contract,
    changedFiles: string[]
  ): { matched: boolean; matchedFiles: string[]; confidence: number } {
    const matchedFiles: string[] = [];

    // Extract directory patterns from contract scope
    const directoryPatterns: string[] = [];

    // Check if contract has directory-based scope
    if (contract.scope.tags) {
      for (const tag of contract.scope.tags) {
        // Map tags to directory patterns
        if (tag === 'infrastructure' || tag === 'terraform') {
          directoryPatterns.push('**/terraform/**', '**/infra/**', '**/infrastructure/**');
        } else if (tag === 'api' || tag === 'openapi') {
          directoryPatterns.push('**/api/**', '**/routes/**', '**/controllers/**');
        } else if (tag === 'documentation' || tag === 'docs') {
          directoryPatterns.push('**/docs/**', '**/documentation/**');
        } else if (tag === 'deployment') {
          directoryPatterns.push('**/deploy/**', '**/.github/workflows/**', '**/helm/**');
        }
      }
    }

    // Match files against directory patterns
    for (const file of changedFiles) {
      for (const pattern of directoryPatterns) {
        if (this.globMatch(file, pattern)) {
          matchedFiles.push(file);
          break;
        }
      }
    }

    return {
      matched: matchedFiles.length > 0,
      matchedFiles,
      confidence: 0.7
    };
  }

  /**
   * Strategy 4: CODEOWNERS mapping
   * Matches files based on code ownership
   * Confidence: 0.75
   */
  private async matchByCodeowners(
    changedFiles: string[],
    repo: string
  ): Promise<{ files: string[]; owners: string[] } | null> {
    // This is a simplified implementation
    // In production, you would fetch CODEOWNERS file from GitHub
    // and parse it to determine ownership

    // For now, we'll use a simple heuristic based on file paths
    const ownershipMap: Record<string, string[]> = {
      'terraform/': ['@infrastructure-team'],
      'docs/': ['@documentation-team'],
      'api/': ['@backend-team'],
      '.github/workflows/': ['@devops-team'],
    };

    const matchedFiles: string[] = [];
    const owners = new Set<string>();

    for (const file of changedFiles) {
      for (const [path, fileOwners] of Object.entries(ownershipMap)) {
        if (file.startsWith(path)) {
          matchedFiles.push(file);
          fileOwners.forEach(owner => owners.add(owner));
        }
      }
    }

    if (matchedFiles.length === 0) {
      return null;
    }

    return {
      files: matchedFiles,
      owners: Array.from(owners)
    };
  }

  /**
   * Check if contract matches CODEOWNERS scope
   */
  private matchesCodeownersScope(
    contract: Contract,
    codeownersMatch: { files: string[]; owners: string[] }
  ): boolean {
    // Check if contract has owner-based routing
    if (contract.routing?.method === 'codeowners') {
      return true;
    }

    // Check if contract scope matches owners
    // This is a simplified check - in production you'd have more sophisticated matching
    return codeownersMatch.owners.length > 0;
  }
}
