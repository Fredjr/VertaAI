/**
 * Artifact Fetcher
 * Phase 1 Week 3-4: Artifact Fetcher & Snapshot System
 * 
 * Fetches artifacts from different systems (GitHub, Confluence, Grafana)
 * Creates versioned snapshots and caches them with TTL
 */

import type {
  ArtifactRef,
  ArtifactSystem,
  ArtifactSnapshot,
  ArtifactVersion,
  ArtifactType,
} from './types.js';
import { prisma } from '../../lib/db.js';

// ============================================================================
// Artifact Fetcher Interface
// ============================================================================

export interface ArtifactFetchResult {
  success: boolean;
  content?: any;
  version?: ArtifactVersion;
  error?: string;
  fetchedAt: Date;
}

export interface ArtifactAdapter {
  system: ArtifactSystem;
  fetch(artifact: ArtifactRef, workspaceId: string): Promise<ArtifactFetchResult>;
  supportsSystem(system: ArtifactSystem): boolean;
}

// ============================================================================
// Main Artifact Fetcher Service
// ============================================================================

export class ArtifactFetcher {
  private adapters: Map<ArtifactSystem, ArtifactAdapter> = new Map();

  constructor(private workspaceId: string) {
    // Register adapters
    this.registerAdapter(new GitHubArtifactAdapter());
    this.registerAdapter(new ConfluenceArtifactAdapter());
    this.registerAdapter(new GrafanaArtifactAdapter());
  }

  /**
   * Register an artifact adapter
   */
  registerAdapter(adapter: ArtifactAdapter): void {
    this.adapters.set(adapter.system, adapter);
  }

  /**
   * Fetch an artifact and create a snapshot
   */
  async fetchAndSnapshot(
    contractId: string,
    artifact: ArtifactRef,
    triggeredBy: { signalEventId?: string; prNumber?: number }
  ): Promise<ArtifactSnapshot | null> {
    const adapter = this.adapters.get(artifact.system);

    if (!adapter) {
      console.error(`[ArtifactFetcher] No adapter found for system: ${artifact.system}`);
      return null;
    }

    try {
      const result = await adapter.fetch(artifact, this.workspaceId);

      if (!result.success || !result.content) {
        console.error(`[ArtifactFetcher] Failed to fetch artifact:`, result.error);
        return null;
      }

      // Create version object
      const version: ArtifactVersion = result.version || {
        type: 'timestamp',
        value: result.fetchedAt.toISOString(),
        capturedAt: result.fetchedAt.toISOString(),
      };

      // Store snapshot in database
      const stored = await prisma.artifactSnapshot.create({
        data: {
          workspaceId: this.workspaceId,
          contractId,
          artifactType: artifact.type,
          artifactRef: artifact as any,
          version: version as any,
          extract: result.content as any,
          extractSchema: 'v1',
          triggeredBy: triggeredBy as any,
          ttlDays: Math.ceil((artifact.freshnessSlaHours || 24) / 24),
          compressed: false,
          sizeBytes: JSON.stringify(result.content).length,
        },
      });

      console.log(`[ArtifactFetcher] Created snapshot ${stored.id} for contract ${contractId}`);

      return {
        workspaceId: stored.workspaceId,
        id: stored.id,
        contractId: stored.contractId,
        artifactType: stored.artifactType as ArtifactType,
        artifactRef: stored.artifactRef as any,
        version: stored.version as any,
        extract: stored.extract as any,
        extractSchema: stored.extractSchema,
        triggeredBy: stored.triggeredBy as any,
        ttlDays: stored.ttlDays,
        compressed: stored.compressed,
        sizeBytes: stored.sizeBytes,
        createdAt: stored.createdAt,
      };
    } catch (error: any) {
      console.error(`[ArtifactFetcher] Error fetching artifact:`, error);
      return null;
    }
  }

  /**
   * Fetch all artifacts for a contract (with telemetry)
   */
  async fetchContractArtifacts(
    contractId: string,
    artifacts: ArtifactRef[],
    triggeredBy: { signalEventId?: string; prNumber?: number }
  ): Promise<ArtifactSnapshot[]> {
    const startTime = Date.now();
    const snapshots: (ArtifactSnapshot | null)[] = [];
    let cacheHits = 0;

    for (const artifact of artifacts) {
      // Check cache first
      const existing = await this.findValidSnapshot(contractId, artifact);

      if (existing) {
        console.log(`[ArtifactFetcher] Cache hit for ${artifact.type}`);
        snapshots.push(existing);
        cacheHits++;
      } else {
        // Fetch new snapshot
        const snapshot = await this.fetchAndSnapshot(contractId, artifact, triggeredBy);
        snapshots.push(snapshot);
      }
    }

    const fetchTimeMs = Date.now() - startTime;

    // Calculate and log telemetry
    const { calculateArtifactMetrics, logArtifactMetrics, logSummaryStats } = await import('./artifactTelemetry.js');

    const metrics = calculateArtifactMetrics(
      this.workspaceId,
      triggeredBy.signalEventId || 'unknown',
      contractId,
      snapshots,
      cacheHits,
      fetchTimeMs
    );

    logArtifactMetrics(metrics);
    logSummaryStats(metrics);

    // Return only successful snapshots
    return snapshots.filter((s): s is ArtifactSnapshot => s !== null);
  }

  /**
   * Get cached snapshot or fetch new one
   */
  async getOrFetchSnapshot(
    contractId: string,
    artifact: ArtifactRef,
    triggeredBy: { signalEventId?: string; prNumber?: number }
  ): Promise<ArtifactSnapshot | null> {
    // Check for existing snapshot within TTL
    const existing = await this.findValidSnapshot(contractId, artifact);

    if (existing) {
      console.log(`[ArtifactFetcher] Using cached snapshot ${existing.id}`);
      return existing;
    }

    // Fetch new snapshot
    return this.fetchAndSnapshot(contractId, artifact, triggeredBy);
  }

  /**
   * Find valid snapshot within TTL
   */
  private async findValidSnapshot(
    contractId: string,
    artifact: ArtifactRef
  ): Promise<ArtifactSnapshot | null> {
    const snapshots = await prisma.artifactSnapshot.findMany({
      where: {
        workspaceId: this.workspaceId,
        contractId,
        artifactType: artifact.type,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 1,
    });

    if (snapshots.length === 0) {
      return null;
    }

    const snapshot = snapshots[0];
    if (!snapshot) {
      return null;
    }

    const ttlDays = snapshot.ttlDays || 30;
    const expiresAt = new Date(snapshot.createdAt);
    expiresAt.setDate(expiresAt.getDate() + ttlDays);

    if (new Date() > expiresAt) {
      console.log(`[ArtifactFetcher] Snapshot ${snapshot.id} expired`);
      return null;
    }

    return {
      workspaceId: snapshot.workspaceId,
      id: snapshot.id,
      contractId: snapshot.contractId,
      artifactType: snapshot.artifactType as ArtifactType,
      artifactRef: snapshot.artifactRef as any,
      version: snapshot.version as any,
      extract: snapshot.extract as any,
      extractSchema: snapshot.extractSchema,
      triggeredBy: snapshot.triggeredBy as any,
      ttlDays: snapshot.ttlDays,
      compressed: snapshot.compressed,
      sizeBytes: snapshot.sizeBytes,
      createdAt: snapshot.createdAt,
    };
  }
}

// ============================================================================
// Artifact Adapters
// ============================================================================

/**
 * GitHub Artifact Adapter
 * Fetches files from GitHub repositories
 */
class GitHubArtifactAdapter implements ArtifactAdapter {
  system: ArtifactSystem = 'github';

  supportsSystem(system: ArtifactSystem): boolean {
    return system === 'github';
  }

  async fetch(artifact: ArtifactRef, workspaceId: string): Promise<ArtifactFetchResult> {
    const { repo, path, ref } = artifact.locator;

    if (!repo || !path) {
      return {
        success: false,
        error: 'Missing repo or path in locator',
        fetchedAt: new Date(),
      };
    }

    try {
      // In production, use GitHub API with installation token
      // For now, use a simplified implementation
      const [owner, repoName] = repo.split('/');
      const branch = ref || 'main';

      // Placeholder: In production, fetch from GitHub API
      const content = {
        path,
        repo,
        ref: branch,
        // Content would be fetched from GitHub API
        raw: `// Placeholder content for ${path}`,
      };

      const version: ArtifactVersion = {
        type: 'git_sha',
        value: 'placeholder-sha', // Would be actual commit SHA
        capturedAt: new Date().toISOString(),
      };

      return {
        success: true,
        content,
        version,
        fetchedAt: new Date(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        fetchedAt: new Date(),
      };
    }
  }
}

/**
 * Confluence Artifact Adapter
 * Fetches pages from Confluence
 */
class ConfluenceArtifactAdapter implements ArtifactAdapter {
  system: ArtifactSystem = 'confluence';

  supportsSystem(system: ArtifactSystem): boolean {
    return system === 'confluence';
  }

  async fetch(artifact: ArtifactRef, workspaceId: string): Promise<ArtifactFetchResult> {
    const { pageId } = artifact.locator;

    if (!pageId) {
      return {
        success: false,
        error: 'Missing pageId in locator',
        fetchedAt: new Date(),
      };
    }

    try {
      // Placeholder: In production, fetch from Confluence API
      const content = {
        pageId,
        title: 'Placeholder Page',
        body: 'Placeholder content',
      };

      const version: ArtifactVersion = {
        type: 'page_version',
        value: '1', // Would be actual page version
        capturedAt: new Date().toISOString(),
      };

      return {
        success: true,
        content,
        version,
        fetchedAt: new Date(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        fetchedAt: new Date(),
      };
    }
  }
}

/**
 * Grafana Artifact Adapter
 * Fetches dashboards from Grafana
 */
class GrafanaArtifactAdapter implements ArtifactAdapter {
  system: ArtifactSystem = 'grafana';

  supportsSystem(system: ArtifactSystem): boolean {
    return system === 'grafana';
  }

  async fetch(artifact: ArtifactRef, workspaceId: string): Promise<ArtifactFetchResult> {
    const { dashboardUid, url } = artifact.locator;

    if (!dashboardUid && !url) {
      return {
        success: false,
        error: 'Missing dashboardUid or url in locator',
        fetchedAt: new Date(),
      };
    }

    try {
      // Placeholder: In production, fetch from Grafana API
      const content = {
        dashboardUid: dashboardUid || 'unknown',
        title: 'Placeholder Dashboard',
        panels: [],
        url,
      };

      const version: ArtifactVersion = {
        type: 'dashboard_version',
        value: '1', // Would be actual dashboard version
        capturedAt: new Date().toISOString(),
      };

      return {
        success: true,
        content,
        version,
        fetchedAt: new Date(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        fetchedAt: new Date(),
      };
    }
  }
}

