/**
 * Duplicate Abstraction Risk Comparator (Agent Governance - Build→Run Spaghetti Prevention)
 *
 * Detects when AI-written code introduces files that duplicate existing abstractions,
 * creating the "session amnesia" spaghetti problem:
 *
 * - LLMs start each session blind — they create `UserDatabaseHelper` not knowing
 *   `UserRepository` already exists from a previous session.
 * - This comparator detects the collision at PR time, before the duplicated abstraction
 *   is merged and becomes permanent technical debt.
 *
 * DETECTION STRATEGIES (no AST, no expensive GitHub API):
 * 1. Historical name collision — compare new file stems against IntentArtifacts from
 *    the last 10 PRs. If Levenshtein similarity ≥ 0.80, flag as likely duplicate.
 * 2. PR-internal duplicate — within this PR, find pairs of new files with the same
 *    normalized stem but different paths (e.g., userService.ts + userServiceV2.ts).
 * 3. Direct DB bypass — new files outside data-access directories that use `prisma.`
 *    in their diff, when another file in the same PR is inside a canonical data dir.
 *
 * SCORING:
 *   name collision  +30
 *   PR-internal dup +25
 *   DB bypass       +20
 *   Thresholds: low < 20, medium 20–49, high ≥ 50
 *
 * ARCHITECTURE NOTE:
 * - Follow the exact shape of churnComplexityRisk.ts (same Comparator interface).
 * - Returns status:'fail' for medium/high risk — the gatekeeper converts this to a warning
 *   via `decisionOnFail: 'warn'` in autoInvokedComparators.ts (ComparatorResult has no 'warn').
 * - Reads `specBuildFindings.actualCapabilities[].resource` from recent IntentArtifacts.
 */

import type { Comparator, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import type { EvidenceItem } from '../../ir/types.js';
import { prisma } from '../../../../../lib/db.js';

// ============================================================================
// Parameters
// ============================================================================

interface DuplicateAbstractionRiskParams {
  /** Maximum recent IntentArtifacts to query for historical name collision (default 10) */
  maxHistoricalArtifacts?: number;
  /** Levenshtein/max-length similarity threshold for name collision (default 0.80) */
  similarityThreshold?: number;
}

// ============================================================================
// Internal types
// ============================================================================

interface DuplicateSignal {
  type: 'name_collision' | 'pr_internal_dup' | 'db_bypass';
  score: number;
  description: string;
  files: string[];
}

// ============================================================================
// Comparator
// ============================================================================

export const duplicateAbstractionRiskComparator: Comparator = {
  id: ComparatorId.DUPLICATE_ABSTRACTION_RISK,
  version: '1.0.0',

  async evaluate(context: PRContext, params: DuplicateAbstractionRiskParams = {}): Promise<any> {
    const { files, workspaceId } = context;
    const maxHistoricalArtifacts = params.maxHistoricalArtifacts ?? 10;
    const similarityThreshold = params.similarityThreshold ?? 0.80;

    // Only analyze added/modified files with meaningful paths
    const addedFiles = files.filter(f => f.status === 'added' || f.status === 'modified');
    if (addedFiles.length === 0) {
      return {
        comparatorId: ComparatorId.DUPLICATE_ABSTRACTION_RISK,
        status: 'pass',
        reasonCode: FindingCode.PASS,
        message: 'No new or modified files — no abstraction collision risk',
        evidence: [],
      };
    }

    const signals: DuplicateSignal[] = [];

    // ── Signal 1: Historical name collision ─────────────────────────────────
    try {
      const recentArtifacts = await prisma.intentArtifact.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: maxHistoricalArtifacts,
        select: { specBuildFindings: true, prNumber: true },
      });

      // Collect all resource paths from recent specBuildFindings.actualCapabilities
      const historicalPaths: string[] = [];
      for (const artifact of recentArtifacts) {
        if (!artifact.specBuildFindings) continue;
        try {
          const findings = JSON.parse(artifact.specBuildFindings);
          const caps: Array<{ resource?: string }> = findings.actualCapabilities ?? [];
          for (const cap of caps) {
            if (cap.resource && cap.resource !== '*') {
              historicalPaths.push(cap.resource);
            }
          }
        } catch { /* malformed JSON — skip */ }
      }

      // Compare each new file stem against historical paths
      for (const file of addedFiles) {
        const newStem = normalizeStem(file.filename);
        if (!newStem) continue;

        for (const historicalPath of historicalPaths) {
          const historicalStem = normalizeStem(historicalPath);
          if (!historicalStem) continue;
          const similarity = stringSimilarity(newStem, historicalStem);
          if (similarity >= similarityThreshold && newStem !== historicalStem) {
            signals.push({
              type: 'name_collision',
              score: 30,
              description: `'${file.filename}' (stem: ${newStem}) is ${Math.round(similarity * 100)}% similar to existing '${historicalPath}'`,
              files: [file.filename, historicalPath],
            });
            break; // one collision per file is enough
          }
        }
      }
    } catch (e: any) {
      console.warn('[DuplicateAbstractionRisk] Historical query failed:', e.message);
    }

    // ── Signal 2: PR-internal duplicate stems ───────────────────────────────
    const newFiles = files.filter(f => f.status === 'added');
    const stemMap = new Map<string, string[]>();
    for (const file of newFiles) {
      const stem = normalizeStem(file.filename);
      if (!stem) continue;
      const existing = stemMap.get(stem) ?? [];
      existing.push(file.filename);
      stemMap.set(stem, existing);
    }
    for (const [stem, paths] of stemMap) {
      if (paths.length > 1) {
        signals.push({
          type: 'pr_internal_dup',
          score: 25,
          description: `Multiple files with stem '${stem}' added in the same PR: ${paths.join(', ')}`,
          files: paths,
        });
      }
    }

    // ── Signal 3: Direct DB bypass ──────────────────────────────────────────
    const DATA_ACCESS_DIRS = ['repos/', 'repositories/', 'dao/', 'services/', 'repository/'];
    const prHasDataAccessFile = files.some(f =>
      DATA_ACCESS_DIRS.some(dir => f.filename.toLowerCase().includes(dir))
    );

    if (prHasDataAccessFile) {
      const bypassFiles = files.filter(f =>
        (f.status === 'added' || f.status === 'modified') &&
        !DATA_ACCESS_DIRS.some(dir => f.filename.toLowerCase().includes(dir)) &&
        (f.patch ?? '').includes('prisma.')
      );
      if (bypassFiles.length > 0) {
        signals.push({
          type: 'db_bypass',
          score: 20,
          description: `${bypassFiles.length} file(s) outside data-access directories use prisma directly: ${bypassFiles.map(f => f.filename).join(', ')}`,
          files: bypassFiles.map(f => f.filename),
        });
      }
    }

    // ── Compute total risk score ────────────────────────────────────────────
    const totalScore = signals.reduce((sum, s) => sum + s.score, 0);
    const riskLevel = totalScore >= 50 ? 'high' : totalScore >= 20 ? 'medium' : 'low';

    // ── Build evidence ───────────────────────────────────────────────────────
    const evidence: EvidenceItem[] = signals.map(s => ({
      type: 'artifact' as const,
      location: s.files[0] ?? 'PR',
      found: true,
      details: s.description,
      metadata: { signalType: s.type, score: s.score },
    }));

    evidence.push({
      type: 'artifact',
      location: 'PR',
      found: true,
      details: `Duplicate abstraction risk score: ${totalScore}/100 (${riskLevel.toUpperCase()})`,
      metadata: { totalScore, riskLevel },
    });

    // ── Return result ────────────────────────────────────────────────────────
    if (riskLevel === 'low') {
      return {
        comparatorId: ComparatorId.DUPLICATE_ABSTRACTION_RISK,
        status: 'pass',
        reasonCode: FindingCode.PASS,
        message: `No duplicate abstraction risk detected (score: ${totalScore}/100)`,
        evidence,
      };
    }

    const signalDescriptions = signals.map(s => s.description).join('; ');
    return {
      comparatorId: ComparatorId.DUPLICATE_ABSTRACTION_RISK,
      status: 'fail',
      reasonCode: FindingCode.DUPLICATE_ABSTRACTION_RISK,
      message: `Duplicate abstraction risk detected (${riskLevel.toUpperCase()}, score: ${totalScore}/100). ` +
        `${signals.length} signal(s): ${signalDescriptions}. ` +
        `Review existing abstractions before merging to prevent spaghetti code.`,
      evidence,
    };
  },
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Normalize a file path to a stem for similarity comparison.
 * Strips directory prefix, file extension, and lowercases.
 * e.g. "src/repos/UserRepository.ts" → "userrepository"
 */
function normalizeStem(filePath: string): string {
  const basename = filePath.split('/').pop() ?? filePath;
  const withoutExt = basename.replace(/\.[^.]+$/, '');
  return withoutExt.toLowerCase().replace(/[-_\s]/g, '');
}

/**
 * Levenshtein-based string similarity normalized to [0, 1].
 * similarity = 1 - (levenshtein / max(len_a, len_b))
 */
function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
