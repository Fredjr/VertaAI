'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import Navigation from '../../components/Navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface DriftCluster {
  id: string;
  workspaceId: string;
  service: string;
  driftType: string;
  fingerprintPattern: string;
  status: string;
  driftCount: number;
  driftIds: string[];
  clusterSummary: Record<string, unknown> | null;
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
            <div className="space-y-4">
              {clusters.map(cluster => {
                const summary = cluster.clusterSummary as Record<string, unknown> | null;
                const severity = (summary?.severity as string) || 'unknown';
                const undeclared = (summary?.undeclaredUsage as number) ?? 0;
                const unused = (summary?.unusedDeclarations as number) ?? 0;
                const proposedFix = (summary?.proposedFix as string) || null;
                return (
                  <div key={cluster.id} className="bg-white dark:bg-gray-900 rounded-lg shadow hover:shadow-md transition-shadow p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white font-mono">{cluster.service}</h3>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded border ${SEVERITY_COLORS[severity]}`}>
                            {severity.toUpperCase()} severity
                          </span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${STATUS_COLORS[cluster.status] || 'bg-gray-100 text-gray-600'}`}>
                            {cluster.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
                          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
                            <div className="text-xs text-gray-500 dark:text-gray-400">Drift type</div>
                            <div className="font-mono font-medium text-gray-900 dark:text-white">{cluster.driftType}</div>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
                            <div className="text-xs text-gray-500 dark:text-gray-400">Total drifts</div>
                            <div className="font-bold text-gray-900 dark:text-white">{cluster.driftCount}</div>
                          </div>
                          <div className="bg-red-50 dark:bg-red-900/20 rounded p-2">
                            <div className="text-xs text-red-500">Undeclared usage</div>
                            <div className="font-bold text-red-700 dark:text-red-400">{undeclared}</div>
                          </div>
                          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded p-2">
                            <div className="text-xs text-yellow-600">Unused declarations</div>
                            <div className="font-bold text-yellow-700 dark:text-yellow-400">{unused}</div>
                          </div>
                        </div>
                        {proposedFix && (
                          <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 mr-2">💡 Proposed fix:</span>
                            <span className="text-sm text-blue-800 dark:text-blue-200">{proposedFix}</span>
                          </div>
                        )}
                        <div className="mt-2 text-xs text-gray-400 font-mono truncate">pattern: {cluster.fingerprintPattern}</div>
                      </div>
                      <div className="text-xs text-gray-400 whitespace-nowrap">
                        {new Date(cluster.createdAt).toLocaleDateString()}
                      </div>
                    </div>
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

