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
}

interface RemediationOption {
  id: 'A' | 'B' | 'C';
  label: string;
  description: string;
  requiresApproval: boolean;
  actions: { type: string; capability: string; target: string; guidance: string }[];
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
  /** P1-B: true if specBuildFindings contained any violations for this service */
  specBuildViolated?: boolean;
  /** P1-B: number of capabilities the gate predicted before runtime drift was observed */
  gatePredictedCount?: number;
  severity?: string;
  severityRationale?: string;
  driftsDetected?: number;
  undeclaredUsage?: CapabilityItem[];
  unusedDeclarations?: CapabilityItem[];
  remediationOptions?: RemediationOption[];
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

interface IntentArtifact {
  id: string;
  prNumber: number;
  author: string;
  repoFullName: string;
  affectedServices: string[];
  requestedCapabilities: string[] | { type: string; resource: string; scope?: string }[];
  specBuildFindings?: string | null; // JSON string — parse before use
  /** FIX(issue-1): ticket / design-doc links for BUILD column */
  links?: Record<string, string> | null;
  /** FIX(issue-1): approval metadata for BUILD column */
  signature?: { signed_by?: string; signed_at?: string; approval_tier?: string; approval_method?: string } | null;
  createdAt?: string;
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
  const [expandedEvidence, setExpandedEvidence] = useState<string | null>(null);

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

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="max-w-7xl mx-auto py-8 px-4">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">🔍 Runtime Governance</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Spec–Build–Run drift clusters for <span className="font-mono font-semibold">{workspaceId}</span>.
              Each cluster groups runtime observations that deviate from the declared intent artifact.
            </p>
          </div>

          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { label: 'Total Clusters', value: clusters.length, color: 'text-gray-900 dark:text-white' },
              { label: 'Pending Review', value: clusters.filter(c => c.status === 'pending').length, color: 'text-yellow-600' },
              { label: 'Total Drifts', value: clusters.reduce((s, c) => s + c.driftCount, 0), color: 'text-red-600' },
            ].map(stat => (
              <div key={stat.label} className="bg-white dark:bg-gray-900 rounded-lg shadow p-4 text-center">
                <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Filter */}
          <div className="mb-6 flex gap-3 items-center">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter:</span>
            {['all', 'pending', 'notified', 'closed'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${statusFilter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400'}`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <button onClick={fetchClusters} className="ml-auto px-3 py-1 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              ↻ Refresh
            </button>
          </div>

          {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>}

          {loading ? (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400">Loading drift clusters…</div>
          ) : clusters.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-12 text-center">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No drift clusters found</h3>
              <p className="text-gray-600 dark:text-gray-400">Run the drift monitor or adjust the status filter.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {clusters.map(cluster => {
                const summary = cluster.clusterSummary;
                const severity = summary?.severity || 'unknown';
                const severityRationale = summary?.severityRationale || null;
                const undeclaredUsage: CapabilityItem[] = Array.isArray(summary?.undeclaredUsage) ? summary.undeclaredUsage : [];
                const unusedDeclarations: CapabilityItem[] = Array.isArray(summary?.unusedDeclarations) ? summary.unusedDeclarations : [];
                const confirmedCompliant: ConfirmedCompliantItem[] = Array.isArray(summary?.confirmedCompliant) ? summary.confirmedCompliant : [];
                const remediationOptions: RemediationOption[] = Array.isArray(summary?.remediationOptions) ? summary.remediationOptions : [];
                const buildContext: BuildContext | undefined = summary?.buildContext ?? undefined;
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
                        <div className="text-xs text-gray-400 whitespace-nowrap">{new Date(cluster.createdAt).toLocaleDateString()}</div>
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
                          <div className="mt-3 space-y-0.5">
                            <div className="text-xs text-gray-400">
                              by <span className="font-mono">{cluster.intentArtifact.author}</span>
                            </div>
                            {artifactHash && (
                              <div className="text-xs text-gray-400 font-mono">artifact #{artifactHash}</div>
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
                            <div className="text-xs text-gray-400 mt-2">
                              {specBuildFindings.isFinalSnapshot
                                ? <>Gate ran at merge: <span className="font-medium">{new Date(specBuildFindings.checkedAt).toLocaleDateString()}</span></>
                                : <>
                                    Checked: {new Date(specBuildFindings.checkedAt).toLocaleDateString()}
                                    {summary?.mergedAt && (
                                      <span className="ml-2" title="Runtime observation window anchored to this date">
                                        · Merged: {new Date(summary.mergedAt).toLocaleDateString()}
                                      </span>
                                    )}
                                  </>
                              }
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
                        <div className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-2">⚡ Run — Runtime Observations</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">What actually executed in production</div>

                        {undeclaredUsage.length > 0 && (
                          <div className="mb-3">
                            {/* FIX(issue-7): renamed from "Privilege expansion" — more accurate term */}
                            <div className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">
                              ❌ Undeclared at runtime ({undeclaredUsage.length} capability type{undeclaredUsage.length !== 1 ? 's' : ''})
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
                                        {item.lastSeen && <div className="text-gray-600 dark:text-gray-300">Last seen: <span className="font-mono">{new Date(item.lastSeen).toLocaleString()}</span></div>}
                                        {item.firstSeen && <div className="text-gray-600 dark:text-gray-300">First seen: <span className="font-mono">{new Date(item.firstSeen).toLocaleString()}</span></div>}
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
                                                <div className="text-gray-500 dark:text-gray-400 font-mono">{new Date(ev.observedAt).toLocaleString()}</div>
                                                {ev.rawEvent && <div>Event: <span className="font-mono text-gray-700 dark:text-gray-300">{ev.rawEvent}</span></div>}
                                                {/* FIX(issue-10): truncate long ARNs — show first+last 20 chars with title tooltip */}
                                                {ev.actor && ev.actor !== 'unknown' && (
                                                  <div>Actor: <span className="font-mono text-gray-700 dark:text-gray-300 break-all" title={ev.actor}>
                                                    {ev.actor.length > 52 ? `${ev.actor.slice(0, 20)}…${ev.actor.slice(-20)}` : ev.actor}
                                                  </span></div>
                                                )}
                                                {ev.source && <div>Source: <span className="font-mono text-gray-700 dark:text-gray-300">{ev.source}</span></div>}
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
                              {/* FIX(issue-5): per-capability action guidance */}
                              {opt.actions && opt.actions.length > 0 && (
                                <div className="mt-2 space-y-1.5 border-t border-gray-200 dark:border-gray-700 pt-2">
                                  {opt.actions.map((action, ai) => (
                                    <div key={ai} className="text-xs">
                                      <div className="flex items-center gap-1 flex-wrap">
                                        <span className="font-mono font-semibold text-gray-700 dark:text-gray-300">{action.capability}</span>
                                        {action.target && action.target !== '*' && (
                                          <span className="text-gray-400 truncate max-w-[100px]" title={action.target}>→ {action.target}</span>
                                        )}
                                      </div>
                                      <div className="text-gray-500 dark:text-gray-500 mt-0.5 leading-snug">{action.guidance}</div>
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

