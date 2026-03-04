/**
 * CLAUDE.md Governance File Writer — Phase 3
 *
 * Writes a compact governance snapshot to `.claude/GOVERNANCE.md` in the target
 * GitHub repository after each non-petty drift detection event.
 *
 * On session start, Claude Code reads all `.md` files in `.claude/` automatically
 * (or when CLAUDE.md references `@.claude/GOVERNANCE.md`). This gives developers
 * real-time governance context — "is it safe to ship?" — without switching to the
 * governance dashboard.
 *
 * DESIGN:
 * - Fire-and-forget: errors are logged but never propagate to the ingestion pipeline
 * - Workspace-level 5-minute write throttle: prevents commit spam on burst ingestion
 * - File create vs update: manages GitHub SHA for idempotent file mutations
 * - [skip ci]: commit message suffix to avoid triggering CI pipelines
 * - Mirrors the DB query logic of GET /api/workspaces/:id/governance-summary/compact
 */

import { prisma } from '../../lib/db.js';
import { getGitHubClient } from '../github-client.js';
import { buildCompactSummary, type ParsedDriftCluster } from './compactSummaryBuilder.js';

// ─────────────────────────────────────────────────────────────────────────────
// Write throttle
// ─────────────────────────────────────────────────────────────────────────────

/** Last time we wrote the governance file for a given workspaceId. */
const lastWriteTimestamp = new Map<string, number>();
const WRITE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes per workspace

const GOVERNANCE_FILE_PATH = '.claude/GOVERNANCE.md';

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write the compact governance snapshot to `.claude/GOVERNANCE.md` in the
 * target repository. Throttled to once per 5 minutes per workspace to avoid
 * commit spam during burst ingestion events.
 *
 * @param workspaceId  VertaAI workspace ID (used to fetch clusters + GitHub client)
 * @param repoFullName GitHub repo in `owner/repo` format (e.g. `acme/api-service`)
 */
export async function writeGovernanceFile(
  workspaceId: string,
  repoFullName: string,
): Promise<void> {
  // ── Throttle ────────────────────────────────────────────────────────────────
  const now = Date.now();
  const lastWrite = lastWriteTimestamp.get(workspaceId) ?? 0;
  if (now - lastWrite < WRITE_COOLDOWN_MS) {
    console.log(
      `[ClaudeMdWriter] Throttled — last write for workspace ${workspaceId} was ${Math.round((now - lastWrite) / 1000)}s ago (cooldown: ${WRITE_COOLDOWN_MS / 1000}s)`,
    );
    return;
  }
  lastWriteTimestamp.set(workspaceId, now);

  // ── GitHub client ────────────────────────────────────────────────────────────
  const octokit = await getGitHubClient(workspaceId);
  if (!octokit) {
    console.log(
      `[ClaudeMdWriter] No GitHub client for workspace ${workspaceId} — skipping governance file write`,
    );
    return;
  }

  const [owner, repo] = repoFullName.split('/');
  if (!owner || !repo) {
    console.warn(`[ClaudeMdWriter] Invalid repoFullName: "${repoFullName}" — expected owner/repo format`);
    return;
  }

  // ── Build governance markdown ────────────────────────────────────────────────
  const markdown = await buildWorkspaceGovernanceMarkdown(workspaceId);

  // ── Resolve default branch ───────────────────────────────────────────────────
  let defaultBranch = 'main';
  try {
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
    defaultBranch = repoData.default_branch;
  } catch {
    console.warn(
      `[ClaudeMdWriter] Could not fetch repo metadata for ${repoFullName} — defaulting to 'main'`,
    );
  }

  // ── Get existing file SHA (required by GitHub API for updates) ───────────────
  let existingSha: string | undefined;
  try {
    const { data: existing } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: GOVERNANCE_FILE_PATH,
      ref: defaultBranch,
    });
    if (!Array.isArray(existing) && 'sha' in existing) {
      existingSha = existing.sha;
    }
  } catch (err: any) {
    if (err.status !== 404) {
      console.warn(
        `[ClaudeMdWriter] Unexpected error reading ${GOVERNANCE_FILE_PATH} from ${repoFullName}: ${err.message}`,
      );
    }
    // 404 = file doesn't exist yet — we'll create it (no sha needed)
  }

  // ── Commit to GitHub ─────────────────────────────────────────────────────────
  const content = Buffer.from(markdown, 'utf-8').toString('base64');
  const commitMessage = existingSha
    ? 'chore: update VertaAI governance snapshot [skip ci]'
    : 'chore: add VertaAI governance snapshot [skip ci]';

  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: GOVERNANCE_FILE_PATH,
    message: commitMessage,
    content,
    branch: defaultBranch,
    ...(existingSha ? { sha: existingSha } : {}),
  });

  console.log(
    `[ClaudeMdWriter] Wrote ${GOVERNANCE_FILE_PATH} to ${repoFullName} on '${defaultBranch}' (${existingSha ? 'updated' : 'created'})`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: build governance markdown from DB
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the compact governance markdown for a workspace.
 * Mirrors the DB query logic of `GET /api/workspaces/:id/governance-summary/compact`.
 */
async function buildWorkspaceGovernanceMarkdown(workspaceId: string): Promise<string> {
  // Workspace name for the header
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true },
  });
  const workspaceName = workspace?.name ?? workspaceId;

  // All pending drift clusters
  const clusters = await prisma.driftCluster.findMany({
    where: { workspaceId, status: 'pending' },
    orderBy: { createdAt: 'asc' },
  });

  // Count distinct observed services
  const observedServiceGroups = await prisma.runtimeCapabilityObservation.groupBy({
    by: ['service'],
    where: { workspaceId },
    _count: { id: true },
  });
  const totalObservedServices = observedServiceGroups.length;

  // Services with a non-petty pending cluster are "drifting"
  const driftingServices = new Set(
    clusters
      .filter(c => (c.materialityTier ?? 'operational') !== 'petty')
      .map(c => c.service),
  );
  const compliantServiceCount = Math.max(0, totalObservedServices - driftingServices.size);

  // Parse clusterSummary JSON for each cluster
  const parsed: ParsedDriftCluster[] = clusters.map(c => {
    let summary: Record<string, any> = {};
    try {
      if (typeof c.clusterSummary === 'string' && c.clusterSummary.length > 0) {
        summary = JSON.parse(c.clusterSummary) as Record<string, any>;
      }
    } catch { /* leave empty if malformed */ }
    return {
      id: c.id,
      service: c.service,
      materialityTier: c.materialityTier,
      createdAt: c.createdAt,
      clusterSummary: summary,
    };
  });

  const result = buildCompactSummary(
    { id: workspaceId, name: workspaceName },
    parsed,
    compliantServiceCount,
  );
  return result.markdown;
}
