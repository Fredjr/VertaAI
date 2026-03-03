/**
 * Compact Governance Summary Builder — Phase 2
 *
 * Transforms raw DriftCluster data into a terse, LLM-readable governance summary
 * suitable for injection into a developer's active coding session (Claude Code,
 * Cursor, etc.) via MCP resource subscription or CLAUDE.md injection.
 *
 * The output is intentionally minimal: one line per behavior, one action
 * recommendation per cluster. The goal is to answer "is it safe to ship?"
 * without requiring the developer to switch to the governance dashboard.
 *
 * DESIGN PRINCIPLES:
 * - ATC (Air Traffic Control): suppress petty signals entirely
 * - Critical clusters surface first with immediate action language
 * - Operational clusters surface next with "team review" framing
 * - Footer reassures: "N petty signals suppressed" prevents false silence anxiety
 * - Causal vs correlated attribution lets the developer know confidence level
 * - Gate-predicted flag lets the developer know if Spec→Build already caught this
 */

// ─────────────────────────────────────────────────────────────────────────────
// Input types (parsed from DriftCluster.clusterSummary + DB columns)
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedDriftCluster {
  id: string;
  service: string;
  /** DB-level materiality tier — 'critical' | 'operational' | 'petty' | null (old clusters) */
  materialityTier: string | null;
  createdAt: Date;
  /** Parsed clusterSummary JSON — may be partial for old clusters */
  clusterSummary: Record<string, any>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────────────────────────────────────

export interface CompactAlert {
  service: string;
  materialityTier: string;
  severity: string;
  /** Terse single-line description of the most critical undeclared behavior. */
  headline: string;
  /** Option A first-step title for the top undeclared behavior. */
  topRemediation: string | null;
  /** Number of additional undeclared behaviors beyond the one shown in headline. */
  moreCount: number;
  /** Other services with the same undeclared capability types this window. */
  correlatedServices: string[];
  /** Whether this behavior was already flagged by the Spec→Build gate. */
  gatePredicted: boolean;
}

export interface CompactSummary {
  workspaceId: string;
  workspaceName: string;
  generatedAt: string;
  criticalCount: number;
  operationalCount: number;
  pettyCount: number;
  /** Services with runtime observations but no open non-petty drift clusters. */
  compliantServiceCount: number;
  alerts: CompactAlert[];
  /** LLM-ready markdown block. */
  markdown: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Materiality sort order
// ─────────────────────────────────────────────────────────────────────────────

const TIER_RANK: Record<string, number> = { critical: 3, operational: 2, petty: 1 };

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a compact governance summary from a list of parsed DriftClusters.
 *
 * @param workspace          Workspace identity for the header.
 * @param clusters           All pending DriftClusters with parsed clusterSummary JSON.
 * @param compliantServiceCount Services with observations but no open non-petty drift.
 */
export function buildCompactSummary(
  workspace: { id: string; name: string },
  clusters: ParsedDriftCluster[],
  compliantServiceCount: number,
): CompactSummary {
  // Separate petty (suppressed) from actionable clusters.
  // Old clusters without materialityTier default to 'operational' (safe fallback).
  const pettyOnly = clusters.filter(c => (c.materialityTier ?? 'operational') === 'petty');
  const nonPetty = clusters.filter(c => {
    const tier = c.materialityTier ?? 'operational';
    return tier !== 'petty' && (c.clusterSummary.undeclaredUsage?.length ?? 0) > 0;
  });

  // Sort: critical first, then operational; within each tier, newest first.
  nonPetty.sort((a, b) => {
    const tierDiff = (TIER_RANK[b.materialityTier ?? 'operational'] ?? 0)
      - (TIER_RANK[a.materialityTier ?? 'operational'] ?? 0);
    if (tierDiff !== 0) return tierDiff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const criticalClusters = nonPetty.filter(c => (c.materialityTier ?? 'operational') === 'critical');
  const operationalClusters = nonPetty.filter(c => (c.materialityTier ?? 'operational') === 'operational');

  const alerts = nonPetty.map(c => buildAlert(c));
  const markdown = buildMarkdown(
    workspace.name,
    alerts,
    pettyOnly.length,
    compliantServiceCount,
  );

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    generatedAt: new Date().toISOString(),
    criticalCount: criticalClusters.length,
    operationalCount: operationalClusters.length,
    pettyCount: pettyOnly.length,
    compliantServiceCount,
    alerts,
    markdown,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: per-cluster alert builder
// ─────────────────────────────────────────────────────────────────────────────

function buildAlert(cluster: ParsedDriftCluster): CompactAlert {
  const summary = cluster.clusterSummary;
  const usage: any[] = summary.undeclaredUsage ?? [];
  const remOptions: any[][] = summary.remediationOptions ?? [];

  if (usage.length === 0) {
    return {
      service: cluster.service,
      materialityTier: cluster.materialityTier ?? 'operational',
      severity: summary.severity ?? 'medium',
      headline: '(no undeclared behaviors — cluster may be stale)',
      topRemediation: null,
      moreCount: 0,
      correlatedServices: [],
      gatePredicted: false,
    };
  }

  // Rank undeclared items by item-level materialityTier (if present — Phase 0+),
  // then by observation count. Preserve original index for remediation lookup.
  const ranked = usage
    .map((item: any, idx: number) => ({ item, idx }))
    .sort((a, b) => {
      const tierDiff =
        (TIER_RANK[a.item.materialityTier ?? 'operational'] ?? 0) -
        (TIER_RANK[b.item.materialityTier ?? 'operational'] ?? 0);
      if (tierDiff !== 0) return -tierDiff; // descending
      return (b.item.observationCount ?? 0) - (a.item.observationCount ?? 0);
    });

  const topEntry = ranked[0]!;
  const top = topEntry.item;
  const topIndex = topEntry.idx;

  // Build the one-line headline for this cluster.
  const parts: string[] = [`\`${top.capability}:${top.target}\``];
  const env = top.scopeDetails?.environment;
  if (env) parts.push(env.toUpperCase());
  if (top.observationCount) parts.push(`${top.observationCount}×`);
  if (top.sources?.length) parts.push(top.sources.slice(0, 2).join('+'));
  if (top.gatePredicted) parts.push('gate predicted');
  if (top.attributionConfidence === 'causal') parts.push('causal');
  else if (top.attributionConfidence === 'correlated') parts.push('correlated');

  const headline = parts.join(' · ');

  // Remediation: Option A first step for the top undeclared capability.
  // remediationOptions[topIndex] = [optA, optB, optC] for that capability.
  const optionASteps = remOptions[topIndex]?.[0]?.steps as any[] | undefined;
  const topRemediation =
    optionASteps?.[0]?.title ??
    remOptions[topIndex]?.[0]?.label ??
    null;

  const correlatedServices: string[] =
    (summary.correlationSignal?.correlatedServices as string[] | undefined) ?? [];

  return {
    service: cluster.service,
    materialityTier: cluster.materialityTier ?? 'operational',
    severity: summary.severity ?? 'medium',
    headline,
    topRemediation,
    moreCount: Math.max(0, usage.length - 1),
    correlatedServices,
    gatePredicted: top.gatePredicted === true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: markdown renderer
// ─────────────────────────────────────────────────────────────────────────────

function buildMarkdown(
  workspaceName: string,
  alerts: CompactAlert[],
  pettyCount: number,
  compliantServiceCount: number,
): string {
  const lines: string[] = [];
  const tsStr = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');

  lines.push(`## VertaAI — Active Governance Alerts (${workspaceName})`);
  lines.push(`*Updated: ${tsStr}*`);
  lines.push('');

  if (alerts.length === 0) {
    lines.push('✅ **No active drift alerts** — all observed services are within declared capability boundaries.');
    if (pettyCount > 0) {
      lines.push(`🔇 ${pettyCount} low-signal observation(s) suppressed (ATC silent mode — below materiality threshold).`);
    }
    lines.push('');
    lines.push('*Reference VertaAI governance dashboard for full audit trail.*');
    return lines.join('\n');
  }

  const criticalAlerts = alerts.filter(a => a.materialityTier === 'critical');
  const operationalAlerts = alerts.filter(a => a.materialityTier === 'operational');

  // ── Critical section ────────────────────────────────────────────────────
  if (criticalAlerts.length > 0) {
    lines.push('### 🚨 Critical — Block & remediate immediately');
    lines.push('');
    for (const alert of criticalAlerts) {
      lines.push(`**${alert.service}** · ${alert.headline}`);
      if (alert.topRemediation) {
        lines.push(`  → ${alert.topRemediation}`);
      }
      if (alert.moreCount > 0) {
        lines.push(`  _(+${alert.moreCount} more undeclared behavior${alert.moreCount > 1 ? 's' : ''} — see dashboard)_`);
      }
      if (alert.correlatedServices.length > 0) {
        lines.push(`  ⚡ Also affects: ${alert.correlatedServices.join(', ')}`);
      }
      lines.push('');
    }
  }

  // ── Operational section ─────────────────────────────────────────────────
  if (operationalAlerts.length > 0) {
    lines.push('### ⚠️ Operational — Team review before next release');
    lines.push('');
    for (const alert of operationalAlerts) {
      lines.push(`**${alert.service}** · ${alert.headline}`);
      if (alert.topRemediation) {
        lines.push(`  → ${alert.topRemediation}`);
      }
      if (alert.moreCount > 0) {
        lines.push(`  _(+${alert.moreCount} more undeclared behavior${alert.moreCount > 1 ? 's' : ''} — see dashboard)_`);
      }
      lines.push('');
    }
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  lines.push('---');
  if (compliantServiceCount > 0) {
    lines.push(`✅ ${compliantServiceCount} service(s) fully compliant (no undeclared capability usage detected)`);
  }
  if (pettyCount > 0) {
    lines.push(`🔇 ${pettyCount} low-signal observation(s) suppressed — below materiality threshold (ATC silent mode)`);
  }

  return lines.join('\n');
}
