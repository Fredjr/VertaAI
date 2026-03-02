'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import Navigation from '../../components/Navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface CapabilityItem {
  capability: string;
  target: string;
  observationCount?: number;
}

interface ClusterSummary {
  intentArtifactId?: string;
  severity?: string;
  driftsDetected?: number;
  undeclaredUsage?: CapabilityItem[];
  unusedDeclarations?: CapabilityItem[];
  proposedChanges?: {
    type?: string;
    description?: string;
    changes?: { action: string; capability: { type: string; target: string } }[];
  };
}

interface SpecBuildFindings {
  checkedAt: string;
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
                const undeclaredUsage: CapabilityItem[] = Array.isArray(summary?.undeclaredUsage) ? summary.undeclaredUsage : [];
                const unusedDeclarations: CapabilityItem[] = Array.isArray(summary?.unusedDeclarations) ? summary.unusedDeclarations : [];
                const proposedFix = summary?.proposedChanges?.description || null;
                const specCaps = cluster.intentArtifact ? normalizeCapabilities(cluster.intentArtifact.requestedCapabilities) : [];
                const prNumber = cluster.intentArtifact?.prNumber;
                const repoFullName = cluster.intentArtifact?.repoFullName;
                const prUrl = prNumber && repoFullName ? `https://github.com/${repoFullName}/pull/${prNumber}` : null;

                // Parse Spec→Build findings (stored as JSON string on intentArtifact)
                let specBuildFindings: SpecBuildFindings | null = null;
                try {
                  const raw = cluster.intentArtifact?.specBuildFindings;
                  if (raw && typeof raw === 'string') specBuildFindings = JSON.parse(raw) as SpecBuildFindings;
                } catch { /* ignore parse errors */ }

                return (
                  <div key={cluster.id} className="bg-white dark:bg-gray-900 rounded-xl shadow hover:shadow-md transition-shadow overflow-hidden">
                    {/* Card header */}
                    <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white font-mono">{cluster.service}</h3>
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${SEVERITY_COLORS[severity]}`}>
                          {severity.toUpperCase()} severity
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${STATUS_COLORS[cluster.status] || 'bg-gray-100 text-gray-600'}`}>
                          {cluster.status}
                        </span>
                        <span className="text-xs text-gray-400">{cluster.driftCount} drifts detected</span>
                      </div>
                      <div className="text-xs text-gray-400 whitespace-nowrap">{new Date(cluster.createdAt).toLocaleDateString()}</div>
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
                          <div className="mt-3 text-xs text-gray-400">
                            by <span className="font-mono">{cluster.intentArtifact.author}</span>
                          </div>
                        )}
                      </div>

                      {/* 🔨 BUILD — PR reference */}
                      <div className="px-5 py-4">
                        <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">🔨 Build — Merged PR</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">What was shipped to production</div>
                        {prUrl ? (
                          <a href={prUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-sm font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                            PR #{prNumber}
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No PR linked</span>
                        )}
                        {repoFullName && (
                          <div className="mt-2 text-xs font-mono text-gray-400">{repoFullName}</div>
                        )}
                      </div>

                      {/* 🔍 SPEC→BUILD — Capability parity findings at PR merge time */}
                      <div className="px-5 py-4">
                        <div className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-2">🔍 Spec→Build — PR Gate</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">Capability parity check at merge time</div>
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
                            <div className="text-xs text-gray-400 mt-2">
                              Checked: {new Date(specBuildFindings.checkedAt).toLocaleDateString()}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No PR gate data yet — runs on next PR webhook</span>
                        )}
                      </div>

                      {/* ⚡ RUN — Runtime observations */}
                      <div className="px-5 py-4">
                        <div className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-2">⚡ Run — Runtime Observations</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">What actually executed in production</div>

                        {undeclaredUsage.length > 0 && (
                          <div className="mb-3">
                            <div className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">❌ Privilege expansion ({undeclaredUsage.length})</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Used at runtime but NOT declared in Spec:</div>
                            <div className="flex flex-wrap gap-1.5">
                              {undeclaredUsage.map((item, i) => (
                                <span key={i} className="px-2 py-0.5 text-xs font-mono rounded-full bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700">
                                  {item.capability}{item.target && item.target !== '*' ? `:${item.target}` : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {unusedDeclarations.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-yellow-600 dark:text-yellow-400 mb-1">⚠️ Over-scoped ({unusedDeclarations.length})</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Declared in Spec but never observed:</div>
                            <div className="flex flex-wrap gap-1.5">
                              {unusedDeclarations.map((item, i) => (
                                <span key={i} className="px-2 py-0.5 text-xs font-mono rounded-full bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-700">
                                  {item.capability}{item.target && item.target !== '*' ? `:${item.target}` : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {undeclaredUsage.length === 0 && unusedDeclarations.length === 0 && (
                          <span className="text-xs text-gray-400 italic">No runtime drift data</span>
                        )}
                      </div>
                    </div>

                    {/* Proposed fix footer */}
                    {proposedFix && (
                      <div className="px-6 py-3 bg-blue-50 dark:bg-blue-900/10 border-t border-blue-100 dark:border-blue-900/30">
                        <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 mr-2">💡 Proposed fix:</span>
                        <span className="text-xs text-blue-800 dark:text-blue-200">{proposedFix}</span>
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

