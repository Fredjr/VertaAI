'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import Navigation from '../../components/Navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface EvidenceItem {
  observedAt: string;
  source: string;
  sourceEventId?: string | null;
  actor?: string;
  region?: string | null;
  rawEvent?: string | null;
  /** Gap B: deep link to source audit console */
  evidenceLink?: string | null;
}

interface RemediationStep {
  title: string;
  description: string;
  snippet?: string;
  link?: string;
}

interface RemediationOption {
  id: 'A' | 'B' | 'C';
  label: string;
  description: string;
  requiresApproval: boolean;
  steps: RemediationStep[];
}

interface ScopeDetails {
  resourcePath: string | null;
  environment: string | null;
  isWildcard: boolean;
  isExactResource: boolean;
}

interface CapabilityItem {
  capability: string;
  target: string;
  observationCount?: number;
  firstSeen?: string | null;
  lastSeen?: string | null;
  sources?: string[];
  severity?: string;
  evidence?: EvidenceItem[];
  /** P1-B: true if the Spec→Build gate predicted this undeclared capability */
  gatePredicted?: boolean;
  /** P2-A: why this unused_declaration was not observed at runtime */
  observationReason?: 'not_observed_in_window' | 'source_coverage_gap';
  /** Gap D: parsed resource scope */
  scopeDetails?: ScopeDetails;
  /** Gap C: causal vs correlated attribution confidence */
  attributionConfidence?: 'causal' | 'correlated';
  attributionNote?: string;
}

/** FIX(issue-1): Build-time context — file changes and agent signals from the PR */
interface BuildContext {
  commitSha?: string;
  checkRunUrl?: string;
  changedFiles?: { path: string; changeType: string; linesAdded?: number; linesDeleted?: number }[];
  agentChanges?: string[];
}

/** FIX(issue-6): Declared capability confirmed observed at runtime */
interface ConfirmedCompliantItem {
  capability: string;
  observationCount: number;
  sources: string[];
}

interface ClusterSummary {
  intentArtifactId?: string;
  /** P1-A: ISO timestamp proxied from intent artifact creation (merge anchor) */
  mergedAt?: string;
  /** Gap B: exact observation window used for drift detection */
  observationWindow?: { start: string; end: string };
  /** Gap B: gate provenance — when and which policy pack ran */
  gateProvenance?: { gateRunAt: string | null; isFinalSnapshot: boolean; packName: string | null; packVersion: string | null };
  /** Gap F: agent context from the originating intent artifact */
  agentContext?: { authorType: string | null; agentIdentity: Record<string, string> | null; traceId: string | null; promptProvided: boolean; claimSetProvided: boolean };
  /** Gap E: cross-service correlation signal */
  correlationSignal?: { correlatedServices: string[]; correlatedCount: number; note: string } | null;
  /** P1-B: true if specBuildFindings contained any violations for this service */
  specBuildViolated?: boolean;
  /** P1-B: number of capabilities the gate predicted before runtime drift was observed */
  gatePredictedCount?: number;
  severity?: string;
  severityRationale?: string;
  driftsDetected?: number;
  undeclaredUsage?: CapabilityItem[];
  unusedDeclarations?: CapabilityItem[];
  remediationOptions?: RemediationOption[][];
  /** P2-B: non-null when intent artifact ingestion failed during the PR gate run */
  artifactIngestionWarning?: string;
  /** FIX(issue-1): build-time context (changed files, commit, agent signals) */
  buildContext?: BuildContext;
  /** FIX(issue-6): declared capabilities confirmed observed at runtime */
  confirmedCompliant?: ConfirmedCompliantItem[];
}

interface SpecBuildFindings {
  checkedAt: string;
  /** P0-A: true when snapshot was written at actual merge time (closed event) */
  isFinalSnapshot?: boolean;
  declaredCapabilities: string[];
  actualCapabilities: string[];
  violations: {
    type: 'undeclared' | 'unused' | 'constraint_violation';
    capability: string;
    resource: string;
    reason: string;
  }[];
  summary: 'pass' | 'privilege_expansion' | 'constraint_violation';
}

interface ClaimSet {
  expectedOutcomes?: string[];
  constraints?: string[];
  nonGoals?: string[];
}

interface IntentArtifact {
  id: string;
  prNumber: number;
  author: string;
  authorType?: string;
  agentIdentity?: string | null;
  repoFullName: string;
  affectedServices: string[];
  requestedCapabilities: string[] | { type: string; resource: string; scope?: string }[];
  specBuildFindings?: string | null; // JSON string — parse before use
  /** FIX(issue-1): ticket / design-doc links for BUILD column */
  links?: Record<string, string> | null;
  /** FIX(issue-1): approval metadata for BUILD column */
  signature?: { signed_by?: string; signed_at?: string; approval_tier?: string; approval_method?: string } | null;
  createdAt?: string;
  /** Gap A: vibe coding provenance */
  promptText?: string | null;
  claimSet?: ClaimSet | null;
  agentTraceId?: string | null;
}

interface DriftCluster {
  id: string;
  workspaceId: string;
  service: string;
  driftType: string;
  fingerprintPattern: string;
  status: string;
  driftCount: number;
  driftIds: string[];
  /** DB column — 'critical' | 'operational' | 'petty' | null (old clusters default to 'operational') */
  materialityTier?: string | null;
  clusterSummary: ClusterSummary | null;
  intentArtifact: IntentArtifact | null;
  createdAt: string;
  updatedAt: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-300',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  low: 'bg-green-100 text-green-800 border-green-300',
  unknown: 'bg-gray-100 text-gray-700 border-gray-300',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  notified: 'bg-blue-100 text-blue-800',
  closed: 'bg-gray-100 text-gray-600',
};

/** Format a timestamp with absolute date + time (UTC) for audit-grade display. */
function formatTs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });
}

/** Short date label for compact display (e.g., "Mar 1"). */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Generate a copy-ready incident summary in markdown. */
function buildIncidentSummary(
  cluster: DriftCluster,
  summary: ClusterSummary | null,
  specBuildFindings: SpecBuildFindings | null,
): string {
  const sev = summary?.severity ?? 'unknown';
  const undeclared = summary?.undeclaredUsage ?? [];
  const win = summary?.observationWindow;
  const gate = summary?.gateProvenance;
  const lines: string[] = [
    `## Incident: ${cluster.service} — runtime capability drift (${sev.toUpperCase()})`,
    `**Detected:** ${formatTs(cluster.createdAt)} | **Status:** ${cluster.status}`,
    win ? `**Observation window:** ${formatTs(win.start)} → ${formatTs(win.end)}` : '',
    '',
    `### Undeclared behaviors (${undeclared.length}):`,
    ...undeclared.map(d => {
      const ev = d.evidence?.[0];
      const link = ev?.evidenceLink ? ` — [View evidence](${ev.evidenceLink})` : '';
      return `- \`${d.capability}:${d.target}\` — observed ×${d.observationCount ?? '?'} via ${d.sources?.join(', ') ?? 'unknown'} (last: ${d.lastSeen ? shortDate(d.lastSeen) : '?'})${link}`;
    }),
    '',
    `### Recommended action:`,
    summary?.remediationOptions?.[0]?.[0]
      ? `Option A — ${summary.remediationOptions[0][0].label}: ${summary.remediationOptions[0][0].steps?.[0]?.title ?? ''}`
      : 'See VertaAI governance dashboard for remediation options.',
    '',
    `### Gate context:`,
    gate?.gateRunAt ? `Gate run: ${formatTs(gate.gateRunAt)}${gate.packName ? ` | Pack: ${gate.packName}${gate.packVersion ? `@${gate.packVersion}` : ''}` : ''}` : 'Gate not run.',
    specBuildFindings ? `Spec→Build: ${specBuildFindings.summary}` : 'No Spec→Build findings.',
  ];
  return lines.filter(l => l !== null).join('\n');
}

// Normalize requestedCapabilities — stored as string[] or Capability[] depending on how ingested
function normalizeCapabilities(raw: IntentArtifact['requestedCapabilities']): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(cap => {
    if (typeof cap === 'string') return cap;
    if (cap && typeof cap === 'object' && 'type' in cap) {
      return cap.resource ? `${cap.type}:${cap.resource}` : cap.type;
    }
    return String(cap);
  });
}

function GovernanceContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace') || 'demo-workspace';

  const [clusters, setClusters] = useState<DriftCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  /** Materiality filter — 'non-petty' by default: ATC mode (petty signals suppressed). */
  const [materialityFilter, setMaterialityFilter] = useState<'non-petty' | 'critical' | 'operational' | 'petty' | 'all'>('non-petty');
  const [expandedEvidence, setExpandedEvidence] = useState<string | null>(null);
  const [copiedClusterId, setCopiedClusterId] = useState<string | null>(null);

  /** Resolve the effective materiality tier for a cluster.
   *  Prefer the DB column (materialityTier) over the JSON blob field for accuracy. */
  const resolvedTier = (c: DriftCluster): string =>
    c.materialityTier ?? (c.clusterSummary as any)?.materialityTier ?? 'operational';

  const fetchClusters = async () => {
    setLoading(true);
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/drift-clusters${params}`);
      const data = await res.json();
      if (data.success) {
        setClusters(data.data || []);
        setError(null);
      } else {
        setError(data.error || 'Failed to load drift clusters');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchClusters(); }, [workspaceId, statusFilter]);

  // ATC materiality counts (computed from loaded clusters)
  const criticalCount = clusters.filter(c => resolvedTier(c) === 'critical').length;
  const operationalCount = clusters.filter(c => resolvedTier(c) === 'operational').length;
  const pettyCount = clusters.filter(c => resolvedTier(c) === 'petty').length;

  // Client-side materiality filter — petty suppressed by default (ATC mode)
  const displayedClusters = materialityFilter === 'all'
    ? clusters
    : materialityFilter === 'non-petty'
      ? clusters.filter(c => resolvedTier(c) !== 'petty')
      : clusters.filter(c => resolvedTier(c) === materialityFilter);

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="max-w-7xl mx-auto py-8 px-4">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">🔍 Forensic Evidence Vault</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Spec–Build–Run audit trail for <span className="font-mono font-semibold">{workspaceId}</span>.
              ATC mode active — critical and operational signals surface; petty noise suppressed by default.
            </p>
          </div>

          {/* Summary bar — ATC materiality breakdown */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <button
              onClick={() => setMaterialityFilter(materialityFilter === 'critical' ? 'non-petty' : 'critical')}
              className={`rounded-lg shadow p-4 text-center transition-all border-2 ${materialityFilter === 'critical' ? 'border-red-500 bg-red-50 dark:bg-red-950' : 'border-transparent bg-white dark:bg-gray-900 hover:border-red-300'}`}
            >
              <div className="text-3xl font-bold text-red-600">{criticalCount}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">🚨 Critical</div>
            </button>
            <button
              onClick={() => setMaterialityFilter(materialityFilter === 'operational' ? 'non-petty' : 'operational')}
              className={`rounded-lg shadow p-4 text-center transition-all border-2 ${materialityFilter === 'operational' ? 'border-amber-500 bg-amber-50 dark:bg-amber-950' : 'border-transparent bg-white dark:bg-gray-900 hover:border-amber-300'}`}
            >
              <div className="text-3xl font-bold text-amber-600">{operationalCount}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">⚠️ Operational</div>
            </button>
            <button
              onClick={() => setMaterialityFilter(materialityFilter === 'petty' ? 'non-petty' : 'petty')}
              className={`rounded-lg shadow p-4 text-center transition-all border-2 ${materialityFilter === 'petty' ? 'border-gray-500 bg-gray-100 dark:bg-gray-800' : 'border-transparent bg-white dark:bg-gray-900 hover:border-gray-300'}`}
            >
              <div className="text-3xl font-bold text-gray-400">{pettyCount}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">🔇 Petty (suppressed)</div>
            </button>
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-4 text-center border-2 border-transparent">
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{clusters.length}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total Clusters</div>
            </div>
          </div>

          {/* Filters */}
          <div className="mb-6 flex flex-wrap gap-3 items-center">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Status:</span>
            {['all', 'pending', 'notified', 'closed'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${statusFilter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400'}`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400 ml-2">Materiality:</span>
            {([
              { value: 'non-petty', label: 'Critical + Operational', activeClass: 'bg-indigo-600 text-white border-indigo-600' },
              { value: 'critical',  label: '🚨 Critical only',        activeClass: 'bg-red-600 text-white border-red-600' },
              { value: 'operational', label: '⚠️ Operational only',   activeClass: 'bg-amber-500 text-white border-amber-500' },
              { value: 'petty',     label: '🔇 Petty (hidden)',        activeClass: 'bg-gray-500 text-white border-gray-500' },
              { value: 'all',       label: 'All tiers',                activeClass: 'bg-gray-700 text-white border-gray-700' },
            ] as const).map(opt => (
              <button key={opt.value} onClick={() => setMaterialityFilter(opt.value)}
                className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${materialityFilter === opt.value ? opt.activeClass : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400'}`}>
                {opt.label}
              </button>
            ))}
            <button onClick={fetchClusters} className="ml-auto px-3 py-1 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              ↻ Refresh
            </button>
          </div>

          {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>}

          {loading ? (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400">Loading drift clusters…</div>
          ) : displayedClusters.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-12 text-center">
              <div className="text-5xl mb-4">{clusters.length === 0 ? '✅' : '🔇'}</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {clusters.length === 0 ? 'No drift clusters found' : 'All signals suppressed by current filter'}
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {clusters.length === 0
                  ? 'Run the drift monitor or adjust the status filter.'
                  : `${clusters.length} cluster(s) exist but are hidden by the active materiality filter. Use "All tiers" to see everything.`}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {displayedClusters.map(cluster => {
                const summary = cluster.clusterSummary;
                const severity = summary?.severity || 'unknown';
                const severityRationale = summary?.severityRationale || null;
                const undeclaredUsage: CapabilityItem[] = Array.isArray(summary?.undeclaredUsage) ? summary.undeclaredUsage : [];
                const unusedDeclarations: CapabilityItem[] = Array.isArray(summary?.unusedDeclarations) ? summary.unusedDeclarations : [];
                const confirmedCompliant: ConfirmedCompliantItem[] = Array.isArray(summary?.confirmedCompliant) ? summary.confirmedCompliant : [];
                // remediationOptions is RemediationOption[][] (one A/B/C set per capability) — use first set
                const remediationOptionSets: RemediationOption[][] = Array.isArray(summary?.remediationOptions) ? summary.remediationOptions as RemediationOption[][] : [];
                const remediationOptions: RemediationOption[] = remediationOptionSets[0] ?? [];
                const buildContext: BuildContext | undefined = summary?.buildContext ?? undefined;
                const observationWindow = summary?.observationWindow ?? null;
                const gateProvenance = summary?.gateProvenance ?? null;
                const agentCtx = summary?.agentContext ?? null;
                const correlationSignal = summary?.correlationSignal ?? null;
                const claimSet = cluster.intentArtifact?.claimSet ?? null;
                const promptText = cluster.intentArtifact?.promptText ?? null;
                const agentIdentityParsed = (() => {
                  const raw = cluster.intentArtifact?.agentIdentity;
                  if (!raw) return null;
                  try { return JSON.parse(raw); } catch { return { raw }; }
                })();
                const specCaps = cluster.intentArtifact ? normalizeCapabilities(cluster.intentArtifact.requestedCapabilities) : [];
                const artifactId = cluster.intentArtifact?.id ?? null;
                const artifactHash = artifactId ? artifactId.slice(-8) : null;
                const prNumber = cluster.intentArtifact?.prNumber;
                const repoFullName = cluster.intentArtifact?.repoFullName;
                const prUrl = prNumber && repoFullName ? `https://github.com/${repoFullName}/pull/${prNumber}` : null;
                const iaLinks = cluster.intentArtifact?.links ?? null;
                const iaSignature = cluster.intentArtifact?.signature ?? null;

                // Parse Spec→Build findings (stored as JSON string on intentArtifact)
                let specBuildFindings: SpecBuildFindings | null = null;
                try {
                  const raw = cluster.intentArtifact?.specBuildFindings;
                  if (raw && typeof raw === 'string') specBuildFindings = JSON.parse(raw) as SpecBuildFindings;
                } catch { /* ignore parse errors */ }

                // FIX(issue-11): SLA — days pending since cluster was created
                const daysPending = Math.floor((Date.now() - new Date(cluster.createdAt).getTime()) / (1000 * 60 * 60 * 24));
                const slaBreached =
                  (severity === 'critical' && daysPending >= 1) ||
                  (severity === 'high' && daysPending >= 3) ||
                  (severity === 'medium' && daysPending >= 7);
                const slaNear =
                  !slaBreached && (
                    (severity === 'critical' && daysPending >= 0) ||
                    (severity === 'high' && daysPending >= 1) ||
                    (severity === 'medium' && daysPending >= 4)
                  );

                return (
                  <div key={cluster.id} className="bg-white dark:bg-gray-900 rounded-xl shadow hover:shadow-md transition-shadow overflow-hidden">
                    {/* Card header */}
                    <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white font-mono">{cluster.service}</h3>
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${SEVERITY_COLORS[severity]}`}>
                            {severity.toUpperCase()} severity
                          </span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${STATUS_COLORS[cluster.status] || 'bg-gray-100 text-gray-600'}`}>
                            {cluster.status}
                          </span>
                          <span className="text-xs text-gray-400">{cluster.driftCount} drifts detected</span>
                          {/* FIX(issue-11): SLA / time-to-remediate indicator */}
                          {cluster.status === 'pending' && (
                            <span className={`px-2 py-0.5 text-xs font-medium rounded border ${
                              slaBreached
                                ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700'
                                : slaNear
                                ? 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700'
                                : 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600'
                            }`}
                              title={`SLA: CRITICAL ≤1d · HIGH ≤3d · MEDIUM ≤7d`}>
                              ⏱ {daysPending === 0 ? 'today' : `${daysPending}d pending`}{slaBreached ? ' — SLA breached' : ''}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-gray-400 whitespace-nowrap" title={formatTs(cluster.createdAt)}>{new Date(cluster.createdAt).toLocaleDateString()}</div>
                          <button
                            title="Copy incident summary"
                            onClick={() => {
                              const md = buildIncidentSummary(cluster, summary, specBuildFindings);
                              navigator.clipboard.writeText(md).then(() => {
                                setCopiedClusterId(cluster.id);
                                setTimeout(() => setCopiedClusterId(null), 2000);
                              });
                            }}
                            className="px-2 py-0.5 text-xs rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            {copiedClusterId === cluster.id ? '✓ Copied' : '📋 Copy'}
                          </button>
                        </div>
                      </div>
                      {severityRationale && (
                        <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 italic">{severityRationale}</div>
                      )}
                    </div>

                    {/* Spec → Build → Run triangle (+ Spec→Build findings from INTENT_CAPABILITY_PARITY) */}
                    <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-gray-100 dark:divide-gray-800">

                      {/* 🎯 SPEC — Intent Artifact */}
                      <div className="px-5 py-4">
                        <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">🎯 Spec — Intent Artifact</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">What the agent declared it would do</div>
                        {specCaps.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {specCaps.map(cap => (
                              <span key={cap} className="px-2 py-0.5 text-xs font-mono rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700">
                                {cap}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No intent artifact linked</span>
                        )}
                        {cluster.intentArtifact && (
                          <div className="mt-3 space-y-1">
                            <div className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                              by <span className="font-mono">{cluster.intentArtifact.author}</span>
                              {/* Gap F: agent identity badge */}
                              {(cluster.intentArtifact.authorType === 'AGENT' || agentIdentityParsed) && (
                                <span className="px-1.5 py-0.5 text-xs rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700 font-medium">
                                  🤖 {agentIdentityParsed?.tooling ?? agentCtx?.agentIdentity?.tooling ?? 'Agent'}
                                </span>
                              )}
                            </div>
                            {artifactHash && (
                              <div className="text-xs text-gray-400 font-mono">artifact #{artifactHash}</div>
                            )}
                            {/* Gap A: Claim Set */}
                            {claimSet && (claimSet.expectedOutcomes?.length || claimSet.constraints?.length || claimSet.nonGoals?.length) ? (
                              <details className="mt-1.5">
                                <summary className="text-xs text-indigo-500 dark:text-indigo-400 cursor-pointer hover:text-indigo-700 select-none">📋 Claim Set</summary>
                                <div className="mt-1 p-2 rounded bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 space-y-1.5">
                                  {claimSet.expectedOutcomes && claimSet.expectedOutcomes.length > 0 && (
                                    <div>
                                      <div className="text-xs font-semibold text-green-700 dark:text-green-400 mb-0.5">Expected outcomes</div>
                                      <div className="flex flex-wrap gap-1">{claimSet.expectedOutcomes.map((o, i) => (
                                        <span key={i} className="px-1.5 py-0.5 text-xs rounded bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">{o}</span>
                                      ))}</div>
                                    </div>
                                  )}
                                  {claimSet.constraints && claimSet.constraints.length > 0 && (
                                    <div>
                                      <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-0.5">Constraints</div>
                                      <div className="flex flex-wrap gap-1">{claimSet.constraints.map((c, i) => (
                                        <span key={i} className="px-1.5 py-0.5 text-xs rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">{c}</span>
                                      ))}</div>
                                    </div>
                                  )}
                                  {claimSet.nonGoals && claimSet.nonGoals.length > 0 && (
                                    <div>
                                      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-0.5">Non-goals</div>
                                      <div className="flex flex-wrap gap-1">{claimSet.nonGoals.map((n, i) => (
                                        <span key={i} className="px-1.5 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 italic">{n}</span>
                                      ))}</div>
                                    </div>
                                  )}
                                </div>
                              </details>
                            ) : null}
                            {/* Gap A: Original prompt */}
                            {promptText && (
                              <details className="mt-1">
                                <summary className="text-xs text-indigo-500 dark:text-indigo-400 cursor-pointer hover:text-indigo-700 select-none">💬 Original prompt</summary>
                                <div className="mt-1 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 italic leading-relaxed max-h-24 overflow-y-auto">
                                  {promptText.length > 300 ? promptText.slice(0, 300) + '…' : promptText}
                                </div>
                              </details>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 🔨 BUILD — PR reference + file diff evidence (FIX issue-1) */}
                      <div className="px-5 py-4">
                        <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">🔨 Build — Merged PR</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">What was shipped to production</div>
                        <div className="space-y-2">
                          {/* PR link + commit SHA */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {prUrl ? (
                              <a href={prUrl} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                                PR #{prNumber}
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                              </a>
                            ) : (
                              <span className="text-xs text-gray-400 italic">No PR linked</span>
                            )}
                            {buildContext?.commitSha && (
                              <span className="font-mono text-xs text-gray-500 dark:text-gray-400" title="Commit SHA">
                                {buildContext.commitSha.slice(0, 7)}
                              </span>
                            )}
                            {buildContext?.checkRunUrl && (
                              <a href={buildContext.checkRunUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline">CI ↗</a>
                            )}
                          </div>
                          {repoFullName && <div className="text-xs font-mono text-gray-400">{repoFullName}</div>}

                          {/* Changed files */}
                          {buildContext?.changedFiles && buildContext.changedFiles.length > 0 && (
                            <div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Changed files ({buildContext.changedFiles.length}):</div>
                              <div className="space-y-0.5">
                                {buildContext.changedFiles.map((f, fi) => (
                                  <div key={fi} className="flex items-center gap-1.5 text-xs font-mono text-gray-600 dark:text-gray-300">
                                    <span className="text-gray-400">{f.changeType === 'added' ? '+' : f.changeType === 'deleted' ? '-' : '~'}</span>
                                    <span className="truncate max-w-[130px]" title={f.path}>{f.path}</span>
                                    {(f.linesAdded != null || f.linesDeleted != null) && (
                                      <span className="text-gray-400 shrink-0">
                                        {f.linesAdded != null && <span className="text-green-600">+{f.linesAdded}</span>}
                                        {f.linesDeleted != null && <span className="text-red-500">/{f.linesDeleted}</span>}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Agent-specific signals */}
                          {buildContext?.agentChanges && buildContext.agentChanges.length > 0 && (
                            <div className="rounded bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-1.5">
                              <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-0.5">⚠️ Agent signals</div>
                              {buildContext.agentChanges.map((c, ci) => (
                                <div key={ci} className="text-xs text-amber-800 dark:text-amber-300">• {c}</div>
                              ))}
                            </div>
                          )}

                          {/* External links (ticket, design doc) */}
                          {iaLinks && Object.keys(iaLinks).length > 0 && (
                            <div className="flex gap-2 flex-wrap">
                              {Object.entries(iaLinks).map(([key, url]) => url ? (
                                <a key={key} href={url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-indigo-500 dark:text-indigo-400 hover:underline capitalize">
                                  🔗 {key.replace(/_/g, ' ')} ↗
                                </a>
                              ) : null)}
                            </div>
                          )}

                          {/* Approval / signature */}
                          {iaSignature && (
                            <div className="text-xs text-gray-400">
                              ✅ Signed: <span className="font-mono">{iaSignature.signed_by}</span>
                              {iaSignature.approval_tier && <span className="ml-1">({iaSignature.approval_tier})</span>}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 🔍 SPEC→BUILD — Capability parity findings at PR merge time */}
                      <div className="px-5 py-4">
                        <div className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 flex-wrap">
                          🔍 Spec→Build — PR Gate
                          {/* P0-A: Final snapshot badge — only shown when gate ran at actual merge time */}
                          {specBuildFindings?.isFinalSnapshot && (
                            <span className="px-1.5 py-0.5 text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded font-normal border border-violet-200 dark:border-violet-700">
                              ✓ Final snapshot (merged)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">Capability parity check at merge time</div>
                        {/* P2-B: Surface ingestion failures as a visible warning banner */}
                        {summary?.artifactIngestionWarning && (
                          <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-2 mb-3">
                            <div className="text-xs font-bold text-amber-700 dark:text-amber-400">⚠️ Ingestion Warning</div>
                            <div className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">{summary.artifactIngestionWarning}</div>
                          </div>
                        )}
                        {specBuildFindings ? (
                          <>
                            <div className={`text-xs font-semibold mb-2 ${specBuildFindings.summary === 'pass' ? 'text-green-600' : 'text-red-600 dark:text-red-400'}`}>
                              {specBuildFindings.summary === 'pass' ? '✅ All capabilities declared' : specBuildFindings.summary === 'privilege_expansion' ? '❌ Privilege expansion in code' : '⚠️ Constraint violation'}
                            </div>
                            {specBuildFindings.violations.filter(v => v.type === 'undeclared').length > 0 && (
                              <div className="mb-2">
                                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">In code but not in Spec:</div>
                                <div className="flex flex-wrap gap-1">
                                  {specBuildFindings.violations.filter(v => v.type === 'undeclared').map((v, i) => (
                                    <span key={i} className="px-2 py-0.5 text-xs font-mono rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700">
                                      {v.capability}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* FIX(issue-4): when isFinalSnapshot=true, gate ran AT merge time —
                                show a single "Gate ran at merge" date, not a confusing Checked vs Merged gap. */}
                            <div className="text-xs text-gray-400 mt-2 space-y-0.5">
                              <div title={specBuildFindings.checkedAt ? formatTs(specBuildFindings.checkedAt) : ''}>
                                {specBuildFindings.isFinalSnapshot
                                  ? <>Gate ran at merge: <span className="font-medium">{shortDate(specBuildFindings.checkedAt)}</span></>
                                  : <>
                                      Checked: {shortDate(specBuildFindings.checkedAt)}
                                      {summary?.mergedAt && (
                                        <span className="ml-2" title={`Observation window anchored to merge: ${formatTs(summary.mergedAt)}`}>
                                          · Merged: {shortDate(summary.mergedAt)}
                                        </span>
                                      )}
                                    </>
                                }
                              </div>
                              {/* Gap B: gate provenance — pack name/version */}
                              {gateProvenance?.packName && (
                                <div className="flex items-center gap-1">
                                  <span className="px-1.5 py-0.5 rounded text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-700 font-mono">
                                    {gateProvenance.packName}{gateProvenance.packVersion ? `@${gateProvenance.packVersion}` : ''}
                                  </span>
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 p-3">
                            <div className="text-xs font-bold text-orange-700 dark:text-orange-400">⚠️ CONTROL GAP — Gate Not Run</div>
                            <div className="text-xs text-orange-800 dark:text-orange-300 mt-1">Spec→Build verification was not enforced on this PR.</div>
                            <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">Impact: Runtime-only detection increases breach window. Code may have shipped capabilities never declared in intent.</div>
                          </div>
                        )}
                      </div>

                      {/* ⚡ RUN — Runtime observations */}
                      <div className="px-5 py-4">
                        <div className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-1">⚡ Run — Runtime Observations</div>
                        {/* Gap B: observation window */}
                        {observationWindow ? (
                          <div className="text-xs text-gray-400 dark:text-gray-500 mb-1 font-mono" title={`${formatTs(observationWindow.start)} → ${formatTs(observationWindow.end)}`}>
                            Window: {shortDate(observationWindow.start)} → {shortDate(observationWindow.end)}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">What actually executed in production</div>
                        )}
                        {/* Cross-service correlation chip */}
                        {correlationSignal && correlationSignal.correlatedCount > 0 && (
                          <div className="mb-2" title={correlationSignal.note}>
                            <span className="px-1.5 py-0.5 text-xs rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 font-medium">
                              ⚡ {correlationSignal.correlatedCount} other service{correlationSignal.correlatedCount !== 1 ? 's' : ''} affected
                            </span>
                          </div>
                        )}

                        {undeclaredUsage.length > 0 && (
                          <div className="mb-3">
                            {/* Language improvement: "behaviors" not "capability types" */}
                            <div className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">
                              ❌ {undeclaredUsage.length} undeclared behavior{undeclaredUsage.length !== 1 ? 's' : ''} at runtime
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Used at runtime but NOT declared in Spec:</div>
                            <div className="space-y-1.5">
                              {undeclaredUsage.map((item, i) => {
                                const evidenceKey = `${cluster.id}:${item.capability}:${i}`;
                                const isOpen = expandedEvidence === evidenceKey;
                                return (
                                  <div key={i}>
                                    {/* FIX(issues 2, 3, 8): inline severity + source + count always visible on collapsed pill */}
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <button onClick={() => setExpandedEvidence(isOpen ? null : evidenceKey)}
                                        className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-mono rounded-full bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors cursor-pointer">
                                        {item.capability}{item.target && item.target !== '*' ? `:${item.target}` : ''}
                                        <span className="text-red-400">{isOpen ? '▲' : '▼'}</span>
                                      </button>
                                      {/* Severity badge — always on collapsed row */}
                                      {item.severity && (
                                        <span className={`px-1.5 py-0.5 text-xs rounded border font-semibold ${SEVERITY_COLORS[item.severity] ?? SEVERITY_COLORS['unknown']}`}>
                                          {item.severity.toUpperCase()}
                                        </span>
                                      )}
                                      {/* Primary source tag */}
                                      {item.sources?.[0] && (
                                        <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{item.sources[0]}</span>
                                      )}
                                      {/* Observation count */}
                                      {item.observationCount != null && (
                                        <span className="text-xs text-gray-500 dark:text-gray-400">×{item.observationCount}</span>
                                      )}
                                      {/* P1-B: gate also predicted — confirmed regression */}
                                      {item.gatePredicted === true && (
                                        <span className="px-1.5 py-0.5 text-xs rounded bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-700 font-medium">
                                          ⚠️ Gate also flagged
                                        </span>
                                      )}
                                      {/* FIX(issue-3): new post-merge regression the gate didn't predict */}
                                      {item.gatePredicted === false && (
                                        <span className="px-1.5 py-0.5 text-xs rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 font-medium">
                                          🆕 New regression
                                        </span>
                                      )}
                                    </div>
                                    {isOpen && (
                                      <div className="mt-1 ml-1 p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-xs space-y-1">
                                        {/* Gap D: resource scope */}
                                        {item.scopeDetails?.resourcePath && (
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-gray-500 dark:text-gray-400">Resource:</span>
                                            <span className="font-mono text-gray-700 dark:text-gray-300">{item.scopeDetails.resourcePath}</span>
                                            {item.scopeDetails.isExactResource
                                              ? <span className="px-1 py-0.5 rounded text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700">exact scope</span>
                                              : <span className="px-1 py-0.5 rounded text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-700">wildcard</span>
                                            }
                                            {item.scopeDetails.environment && (
                                              <span className={`px-1 py-0.5 rounded text-xs font-semibold border ${item.scopeDetails.environment === 'prod' || item.scopeDetails.environment === 'production' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'}`}>
                                                {item.scopeDetails.environment}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                        {/* Gap C: attribution confidence for cost/s3 */}
                                        {item.attributionConfidence && (
                                          <div className="flex items-center gap-1.5">
                                            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold border ${item.attributionConfidence === 'causal' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'}`}>
                                              {item.attributionConfidence === 'causal' ? '⚠ Causal' : '~ Correlated'}
                                            </span>
                                            {item.attributionNote && <span className="text-gray-500 dark:text-gray-400 leading-tight">{item.attributionNote}</span>}
                                          </div>
                                        )}
                                        {item.lastSeen && <div className="text-gray-600 dark:text-gray-300">Last seen: <span className="font-mono" title={formatTs(item.lastSeen)}>{new Date(item.lastSeen).toLocaleString()} UTC</span></div>}
                                        {item.firstSeen && <div className="text-gray-600 dark:text-gray-300">First seen: <span className="font-mono" title={formatTs(item.firstSeen)}>{new Date(item.firstSeen).toLocaleString()} UTC</span></div>}
                                        {item.observationCount && <div className="text-gray-600 dark:text-gray-300">Observations: <span className="font-semibold">{item.observationCount}</span></div>}
                                        {item.sources && item.sources.length > 0 && <div className="text-gray-600 dark:text-gray-300">Sources: <span className="font-mono">{item.sources.join(', ')}</span></div>}
                                        {/* FIX(issue-9): show gate violation reason when gatePredicted=true */}
                                        {item.gatePredicted === true && (() => {
                                          const gv = specBuildFindings?.violations.find(v => v.capability === item.capability);
                                          return gv ? (
                                            <div className="text-gray-500 dark:text-gray-400">Gate violation: <span className="font-mono">{gv.reason}</span></div>
                                          ) : null;
                                        })()}
                                        {item.evidence && item.evidence.length > 0 && (
                                          <div className="mt-1.5 space-y-1 border-t border-red-200 dark:border-red-800 pt-1.5">
                                            <div className="text-gray-500 dark:text-gray-400 font-semibold">Evidence samples:</div>
                                            {item.evidence.map((ev, ei) => (
                                              <div key={ei} className="bg-white dark:bg-gray-900 rounded p-1.5 border border-red-100 dark:border-red-800 space-y-0.5">
                                                <div className="text-gray-500 dark:text-gray-400 font-mono" title={formatTs(ev.observedAt)}>{new Date(ev.observedAt).toLocaleString()}</div>
                                                {ev.rawEvent && <div>Event: <span className="font-mono text-gray-700 dark:text-gray-300">{ev.rawEvent}</span></div>}
                                                {ev.actor && ev.actor !== 'unknown' && (
                                                  <div>Actor: <span className="font-mono text-gray-700 dark:text-gray-300 break-all" title={ev.actor}>
                                                    {ev.actor.length > 52 ? `${ev.actor.slice(0, 20)}…${ev.actor.slice(-20)}` : ev.actor}
                                                  </span></div>
                                                )}
                                                {ev.source && <div className="flex items-center gap-1.5">Source: <span className="font-mono text-gray-700 dark:text-gray-300">{ev.source}</span>
                                                  {/* Gap B: evidence deep link */}
                                                  {ev.evidenceLink && (
                                                    <a href={ev.evidenceLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 dark:text-blue-400 hover:underline text-xs">View ↗</a>
                                                  )}
                                                </div>}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {unusedDeclarations.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-yellow-600 dark:text-yellow-400 mb-1">⚠️ Over-scoped ({unusedDeclarations.length})</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Declared in Spec but never observed:</div>
                            <div className="space-y-1.5">
                              {unusedDeclarations.map((item, i) => (
                                <div key={i} className="flex items-center gap-1.5 flex-wrap">
                                  <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-700">
                                    {item.capability}{item.target && item.target !== '*' ? `:${item.target}` : ''}
                                  </span>
                                  {/* P2-A: Distinguish data-coverage gap from genuine "not observed" */}
                                  {item.observationReason === 'source_coverage_gap' && (
                                    <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                                      No source coverage
                                    </span>
                                  )}
                                  {item.observationReason === 'not_observed_in_window' && (
                                    <span className="px-1.5 py-0.5 text-xs rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-700">
                                      Not observed in window
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* FIX(issue-6): Confirmed compliant — declared caps with runtime evidence */}
                        {confirmedCompliant.length > 0 && (
                          <div className="mt-3">
                            <div className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1">✅ Confirmed compliant ({confirmedCompliant.length})</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Declared and observed at runtime:</div>
                            <div className="flex flex-wrap gap-1.5">
                              {confirmedCompliant.map((item, i) => (
                                <span key={i}
                                  className="px-2 py-0.5 text-xs font-mono rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700"
                                  title={`${item.observationCount} obs · ${item.sources.join(', ')}`}>
                                  {item.capability} ✓{item.observationCount > 1 ? ` ×${item.observationCount}` : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {undeclaredUsage.length === 0 && unusedDeclarations.length === 0 && confirmedCompliant.length === 0 && (
                          <span className="text-xs text-gray-400 italic">No runtime drift data</span>
                        )}
                      </div>
                    </div>

                    {/* Remediation options footer */}
                    {remediationOptions.length > 0 && (
                      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
                        <div className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">🔧 Remediation Options</div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {remediationOptions.map(opt => (
                            <div key={opt.id} className={`rounded-lg border p-3 ${
                              opt.id === 'A' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                              : opt.id === 'B' ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
                              : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                            }`}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                  opt.id === 'A' ? 'bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300'
                                  : opt.id === 'B' ? 'bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-300'
                                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                }`}>Option {opt.id}</span>
                                {opt.requiresApproval && <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">🔒 Needs approval</span>}
                              </div>
                              <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1">{opt.label}</div>
                              <div className="text-xs text-gray-600 dark:text-gray-400">{opt.description}</div>
                              {/* Gap A/B/C: remediation steps with title, description, snippet, link */}
                              {opt.steps && opt.steps.length > 0 && (
                                <div className="mt-2 space-y-2 border-t border-gray-200 dark:border-gray-700 pt-2">
                                  {opt.steps.map((step, si) => (
                                    <div key={si} className="text-xs">
                                      <div className="font-semibold text-gray-700 dark:text-gray-300">{step.title}</div>
                                      <div className="text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{step.description}</div>
                                      {step.snippet && (
                                        <pre className="mt-1 bg-gray-100 dark:bg-gray-900 rounded p-1.5 font-mono text-[10px] text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap">{step.snippet}</pre>
                                      )}
                                      {step.link && (
                                        <a href={step.link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 hover:underline">
                                          Docs ↗
                                        </a>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* ATC petty suppression footer — mirrors compact summary format */}
              {pettyCount > 0 && materialityFilter !== 'petty' && materialityFilter !== 'all' && (
                <div className="mt-4 px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    🔇 <strong>{pettyCount}</strong> low-signal observation{pettyCount !== 1 ? 's' : ''} suppressed — below materiality threshold (ATC silent mode)
                  </span>
                  <button
                    onClick={() => setMaterialityFilter('petty')}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline ml-4 shrink-0"
                  >
                    Show petty signals
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function GovernancePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading…</div>}>
      <GovernanceContent />
    </Suspense>
  );
}

