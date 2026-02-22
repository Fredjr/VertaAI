'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { ArrowLeft, Search, Shield, AlertTriangle, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';

type MergeStrategy = 'MOST_RESTRICTIVE' | 'HIGHEST_PRIORITY' | 'EXPLICIT';

interface RuleSource {
  packId: string;
  packName: string;
  packVersion: string;
  packPriority: number;
  packSource: 'repo' | 'service' | 'workspace';
}

interface EffectiveRule {
  ruleId: string;
  ruleName: string;
  enabled: boolean;
  trigger: any;
  obligations: any[];
  sources: RuleSource[];
  hasConflict: boolean;
  conflictResolution?: { strategy: MergeStrategy; winningPackId: string; reason: string };
}

interface EffectivePolicy {
  repository: string;
  branch: string;
  applicablePacks: Array<{
    id: string; name: string; version: string; priority: number;
    mergeStrategy: MergeStrategy; source: 'repo' | 'service' | 'workspace'; ruleCount: number;
  }>;
  effectiveRules: EffectiveRule[];
  decisionLogic: { mergeStrategy: MergeStrategy; priorityOrder: string[]; explanation: string };
  conflicts: Array<{ ruleId: string; conflictingPacks: string[]; resolution: string }>;
}

function EffectivePolicyContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace') || 'demo-workspace';

  const [repository, setRepository] = useState('');
  const [branch, setBranch] = useState('main');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<EffectivePolicy | null>(null);
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());

  const handleCompute = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setPolicy(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/policy-packs/effective-policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repository, branch }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to compute effective policy');
      }
      const d = await res.json();
      setPolicy(d.effectivePolicy);
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const toggleRule = (ruleId: string) => {
    setExpandedRules(prev => {
      const next = new Set(prev);
      next.has(ruleId) ? next.delete(ruleId) : next.add(ruleId);
      return next;
    });
  };

  const sourceBadge = (src: 'repo' | 'service' | 'workspace') => {
    const m: Record<string, string> = {
      repo: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
      service: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
      workspace: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    };
    return m[src] || m.workspace;
  };

  const mergeStrategyColor = (s: MergeStrategy) => {
    const m: Record<MergeStrategy, string> = {
      MOST_RESTRICTIVE: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
      HIGHEST_PRIORITY: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300',
      EXPLICIT: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
    };
    return m[s];
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="mb-8">
          <Link href={`/policy-packs?workspace=${workspaceId}`}
            className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 mb-4">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Policy Packs
          </Link>
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Effective Policy</h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                See which packs apply to a repo/branch, how rules merge, and why decisions are made
              </p>
            </div>
          </div>
        </div>

        {/* Query Form */}
        <form onSubmit={handleCompute}
          className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6 mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Repository <span className="text-gray-400 font-normal">(owner/repo)</span>
              </label>
              <input type="text" value={repository} onChange={e => setRepository(e.target.value)}
                placeholder="e.g., acme-corp/payment-api" required
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Branch</label>
              <input type="text" value={branch} onChange={e => setBranch(e.target.value)}
                placeholder="main" required
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button type="submit" disabled={loading}
              className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md disabled:opacity-50">
              {loading ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />Computing…</> :
                <><Search className="h-4 w-4 mr-2" />Compute Effective Policy</>}
            </button>
          </div>
        </form>

        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-sm text-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        {policy && (
          <div className="space-y-8">

            {/* Decision Logic Banner */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-5">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <h2 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-1">Decision Logic</h2>
                  <p className="text-sm text-blue-800 dark:text-blue-300">{policy.decisionLogic.explanation}</p>
                  {policy.decisionLogic.priorityOrder.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-1">Pack Evaluation Order (highest → lowest priority)</p>
                      <ol className="space-y-0.5">
                        {policy.decisionLogic.priorityOrder.map((p, i) => (
                          <li key={i} className="text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
                            <span className="font-mono bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded text-xs text-blue-700 dark:text-blue-300">#{i + 1}</span>
                            {p}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Applicable Packs */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  Applicable Packs <span className="ml-2 text-sm font-normal text-gray-500">({policy.applicablePacks.length})</span>
                </h2>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {policy.applicablePacks.length === 0 && (
                  <div className="px-6 py-8 text-sm text-gray-500 dark:text-gray-400 text-center">No packs apply to this repository/branch.</div>
                )}
                {[...policy.applicablePacks].sort((a, b) => b.priority - a.priority).map((pack, i) => (
                  <div key={pack.id} className="px-6 py-4 flex items-center gap-4">
                    <span className="text-lg font-bold text-gray-300 dark:text-gray-600 w-6 text-right shrink-0">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{pack.name}</span>
                        <span className="text-xs text-gray-500">v{pack.version}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${sourceBadge(pack.source)}`}>{pack.source}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${mergeStrategyColor(pack.mergeStrategy)}`}>
                          {pack.mergeStrategy.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Priority</div>
                        <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">{pack.priority}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Rules</div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">{pack.ruleCount}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Conflicts Summary */}
            {policy.conflicts.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2">
                      {policy.conflicts.length} Rule Conflict{policy.conflicts.length !== 1 ? 's' : ''} Detected &amp; Resolved
                    </h2>
                    <div className="space-y-2">
                      {policy.conflicts.map((c, i) => (
                        <div key={i} className="text-xs text-amber-800 dark:text-amber-300">
                          <span className="font-mono font-medium">{c.ruleId}</span>
                          {' '}— {c.resolution}
                          <span className="ml-2 text-amber-600 dark:text-amber-400">
                            [{c.conflictingPacks.join(', ')}]
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Effective Rules */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  Effective Rules <span className="ml-2 text-sm font-normal text-gray-500">({policy.effectiveRules.length})</span>
                </h2>
                {policy.conflicts.length === 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                    <CheckCircle className="h-3.5 w-3.5" /> No conflicts
                  </span>
                )}
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {policy.effectiveRules.map(rule => (
                  <div key={rule.ruleId} className={`${rule.hasConflict ? 'bg-amber-50/30 dark:bg-amber-900/5' : ''}`}>
                    <button
                      type="button"
                      onClick={() => toggleRule(rule.ruleId)}
                      className="w-full px-6 py-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      {expandedRules.has(rule.ruleId)
                        ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{rule.ruleName}</span>
                          <span className="font-mono text-xs text-gray-400">{rule.ruleId}</span>
                          {!rule.enabled && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">disabled</span>
                          )}
                          {rule.hasConflict && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                              <AlertTriangle className="h-3 w-3 mr-1" />conflict resolved
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          {rule.sources.map((s, i) => (
                            <span key={i} className="text-xs text-gray-500">
                              {i > 0 && <span className="mr-1 text-gray-300">+</span>}
                              {s.packName} <span className="text-gray-400">(p={s.packPriority})</span>
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{rule.obligations.length} obligation{rule.obligations.length !== 1 ? 's' : ''}</span>
                    </button>

                    {expandedRules.has(rule.ruleId) && (
                      <div className="px-6 pb-4 pt-0">
                        <div className="ml-7 space-y-3">
                          {/* Provenance */}
                          <div>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Provenance</p>
                            <div className="flex flex-wrap gap-2">
                              {rule.sources.map((s, i) => (
                                <div key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-300">
                                  <span className={`inline-block w-2 h-2 rounded-full ${s.packSource === 'workspace' ? 'bg-gray-400' : s.packSource === 'service' ? 'bg-purple-400' : 'bg-blue-400'}`} />
                                  {s.packName} v{s.packVersion} · priority {s.packPriority}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Conflict Resolution */}
                          {rule.hasConflict && rule.conflictResolution && (
                            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700 rounded p-3">
                              <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">Conflict Resolution</p>
                              <p className="text-xs text-amber-700 dark:text-amber-400">
                                Strategy: <strong>{rule.conflictResolution.strategy}</strong> — {rule.conflictResolution.reason}
                              </p>
                            </div>
                          )}

                          {/* Obligations */}
                          {rule.obligations.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Obligations</p>
                              <div className="space-y-1">
                                {rule.obligations.map((ob: any, i: number) => (
                                  <div key={i} className="text-xs bg-gray-50 dark:bg-gray-700/50 rounded px-2 py-1.5 font-mono text-gray-700 dark:text-gray-300">
                                    {ob.comparator || ob.comparatorId || 'unknown'} →{' '}
                                    <span className={`font-semibold ${ob.decisionOnFail === 'block' ? 'text-red-600 dark:text-red-400' : ob.decisionOnFail === 'warn' ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                                      {ob.decisionOnFail}
                                    </span>
                                    {ob.message && <span className="text-gray-400 ml-2">"{ob.message}"</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}

export default function EffectivePolicyPage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <EffectivePolicyContent />
    </Suspense>
  );
}

