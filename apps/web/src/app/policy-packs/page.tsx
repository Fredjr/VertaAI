'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { Plus, Edit2, Trash2, BarChart2, Shield, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import ConflictDetector from '@/components/policyPacks/ConflictDetector';

interface WorkspacePolicyPack {
  workspaceId: string;
  id: string;
  name: string;
  description: string | null;
  status: 'DRAFT' | 'IN_REVIEW' | 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED';
  scopeType: 'workspace' | 'service' | 'repo';
  scopeRef: string | null;
  scopePriority?: number;
  scopeMergeStrategy?: 'MOST_RESTRICTIVE' | 'HIGHEST_PRIORITY' | 'EXPLICIT';
  trackAEnabled: boolean;
  trackBEnabled: boolean;
  trackAConfig?: any;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface AgentPermissionEnvelope {
  blocked: string[];
  requireDeclaration: string[];
  alwaysAllowed: string[];
  requireHumanApproval: string[];
  sessionBudgets: { maxFilesChanged: number; maxNewAbstractions: number; requireTestFor: string[] };
  compiledFromPacks: string[];
  compiledAt: string;
}

function PolicyPacksContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace') || 'demo-workspace';

  const [policyPacks, setPolicyPacks] = useState<WorkspacePolicyPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [envelope, setEnvelope] = useState<AgentPermissionEnvelope | null>(null);
  const [envelopeLoading, setEnvelopeLoading] = useState(false);
  const [envelopeExpanded, setEnvelopeExpanded] = useState(false);

  useEffect(() => {
    fetchPolicyPacks();
    fetchEnvelope();
  }, [workspaceId]);

  const fetchEnvelope = async () => {
    setEnvelopeLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/agent-permissions`);
      if (res.ok) {
        const data = await res.json();
        setEnvelope(data);
      }
    } catch { /* non-blocking */ } finally {
      setEnvelopeLoading(false);
    }
  };

  const fetchPolicyPacks = async () => {
    try {
      setLoading(true);
      setError(null);

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/policy-packs`);

      if (!response.ok) {
        throw new Error('Failed to fetch policy packs');
      }

      const data = await response.json();
      setPolicyPacks(data.policyPacks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this policy pack?')) {
      return;
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/policy-packs/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete policy pack');
      }

      fetchPolicyPacks();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete policy pack');
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      DRAFT: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      IN_REVIEW: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      DEPRECATED: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      ARCHIVED: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    };
    return colors[status] || colors.DRAFT;
  };

  const getScopeBadge = (scopeType: string) => {
    const colors = {
      workspace: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      service: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      repo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    };
    return colors[scopeType as keyof typeof colors] || colors.workspace;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Policy Packs
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Unified configuration for Contract Integrity Gate (Track A) and Drift Remediation (Track B)
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href={`/policy-packs/effective-policy?workspace=${workspaceId}`}
                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <BarChart2 className="h-4 w-4 mr-2" />
                Effective Policy
              </Link>
              <Link
                href={`/policy-packs/new?workspace=${workspaceId}`}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Policy Pack
              </Link>
            </div>
          </div>
        </div>

        {/* Active Agent Permission Envelope */}
        <div className="mb-6 bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-800 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setEnvelopeExpanded(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span className="text-sm font-semibold text-purple-900 dark:text-purple-200">Active Agent Permission Envelope</span>
              {envelope && (
                <span className="text-xs text-purple-600 dark:text-purple-400 font-normal">
                  · compiled {new Date(envelope.compiledAt).toLocaleTimeString()} from{' '}
                  {envelope.compiledFromPacks.length > 0 ? envelope.compiledFromPacks.join(', ') : 'baseline'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={e => { e.stopPropagation(); fetchEnvelope(); }}
                className="p-1 text-purple-400 hover:text-purple-600 dark:hover:text-purple-300"
                title="Refresh envelope"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${envelopeLoading ? 'animate-spin' : ''}`} />
              </button>
              {envelopeExpanded
                ? <ChevronDown className="h-4 w-4 text-gray-400" />
                : <ChevronRight className="h-4 w-4 text-gray-400" />
              }
            </div>
          </button>
          {envelopeExpanded && (
            <div className="px-5 pb-4 border-t border-purple-100 dark:border-purple-900">
              {!envelope ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">No data — ensure the API is running.</p>
              ) : (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 font-mono text-xs">
                  <div><span className="text-red-500">🚫 Blocked:</span> <span className="text-gray-700 dark:text-gray-300">{envelope.blocked.join(', ')}</span></div>
                  <div><span className="text-yellow-600 dark:text-yellow-400">⚠️ Requires declaration:</span> <span className="text-gray-700 dark:text-gray-300">{envelope.requireDeclaration.join(', ')}</span></div>
                  <div><span className="text-blue-600 dark:text-blue-400">👤 Requires approval:</span> <span className="text-gray-700 dark:text-gray-300">{envelope.requireHumanApproval.join(', ')}</span></div>
                  <div><span className="text-green-600 dark:text-green-400">✅ Always allowed:</span> <span className="text-gray-700 dark:text-gray-300">{envelope.alwaysAllowed.join(', ')}</span></div>
                  <div className="sm:col-span-2 pt-1 border-t border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                    Session: max {envelope.sessionBudgets.maxFilesChanged} files · max {envelope.sessionBudgets.maxNewAbstractions} abstractions · tests required for {envelope.sessionBudgets.requireTestFor.join(', ')}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Conflict Detector - Show conflicts across all packs */}
        {!loading && policyPacks.length > 0 && (
          <div className="mb-6">
            <ConflictDetector workspaceId={workspaceId} autoRefresh={true} refreshInterval={60} />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading policy packs...</p>
          </div>
        )}

        {/* Policy Packs List */}
        {!loading && policyPacks.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="text-gray-600 dark:text-gray-400">No policy packs found</p>
            <Link
              href={`/policy-packs/new?workspace=${workspaceId}`}
              className="mt-4 inline-flex items-center text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              <Plus className="h-4 w-4 mr-1" />
              Create your first policy pack
            </Link>
          </div>
        )}

        {!loading && policyPacks.length > 0 && (
          <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Scope
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Merge Strategy
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Tracks
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {policyPacks.map((pack) => (
                  <tr key={pack.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <Link
                          href={`/policy-packs/${pack.id}?workspace=${workspaceId}`}
                          className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                          {pack.name}
                        </Link>
                        {pack.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {pack.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getScopeBadge(pack.scopeType)}`}>
                        {pack.scopeType}
                        {pack.scopeRef && `: ${pack.scopeRef}`}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-semibold text-xs">
                        {pack.scopePriority ?? 50}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {(() => {
                        const strategy = pack.scopeMergeStrategy || 'MOST_RESTRICTIVE';
                        const styles: Record<string, string> = {
                          MOST_RESTRICTIVE: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
                          HIGHEST_PRIORITY: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300',
                          EXPLICIT: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
                        };
                        const labels: Record<string, string> = {
                          MOST_RESTRICTIVE: 'Most Restrictive',
                          HIGHEST_PRIORITY: 'Highest Priority',
                          EXPLICIT: 'Explicit',
                        };
                        return (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${styles[strategy]}`}>
                            {labels[strategy]}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-2">
                        {pack.trackAEnabled && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                            Track A
                          </span>
                        )}
                        {pack.trackBEnabled && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200">
                            Track B
                          </span>
                        )}
                        {(() => {
                          const ap = pack.trackAConfig?.agentPolicy;
                          const hasPolicy = (ap?.additionalBlocked?.length ?? 0) > 0 || (ap?.requireApproval?.length ?? 0) > 0;
                          return hasPolicy ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" title="This pack configures agent permissions">
                              <Shield className="h-3 w-3" />
                              Agent Policy
                            </span>
                          ) : null;
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(pack.status)}`}>
                        {pack.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/policy-packs/${pack.id}?workspace=${workspaceId}`}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(pack.id)}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PolicyPacksPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PolicyPacksContent />
    </Suspense>
  );
}

