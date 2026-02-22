'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, AlertTriangle, RefreshCw, ChevronDown, ChevronRight, ArrowUpCircle, ArrowDownCircle, Minimize2, GitMerge } from 'lucide-react';

interface PackConflict {
  type: 'merge_strategy_conflict' | 'rule_conflict' | 'priority_conflict';
  severity: 'error' | 'warning';
  affectedPacks: string[];
  affectedRules?: string[];
  description: string;
  remediation: string[];
}

interface ConflictDetectorProps {
  workspaceId: string;
  autoRefresh?: boolean;
  refreshInterval?: number; // in seconds
}

export default function ConflictDetector({
  workspaceId,
  autoRefresh = false,
  refreshInterval = 30
}: ConflictDetectorProps) {
  const [conflicts, setConflicts] = useState<PackConflict[]>([]);
  const [totalPacks, setTotalPacks] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [expandedConflicts, setExpandedConflicts] = useState<Set<number>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ index: number; text: string; type: 'success' | 'error' } | null>(null);

  const fetchConflicts = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/policy-packs/conflicts`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch conflicts');
      }

      const data = await response.json();
      setConflicts(data.conflicts || []);
      setTotalPacks(data.totalPacks || 0);
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to detect conflicts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConflicts();

    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(fetchConflicts, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [workspaceId, autoRefresh, refreshInterval]);

  const toggleExpand = (index: number) => {
    setExpandedConflicts(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  const handleAction = async (index: number, action: string, pack: string) => {
    const key = `${index}-${action}`;
    setActionLoading(key);
    setActionMessage(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/policy-packs/resolve-conflict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, pack, conflictIndex: index }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Action failed');
      }
      setActionMessage({ index, text: `Action "${action}" applied to pack "${pack}"`, type: 'success' });
      await fetchConflicts();
    } catch (err: any) {
      setActionMessage({ index, text: err.message || 'Action failed', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const getSeverityIcon = (severity: 'error' | 'warning') => {
    if (severity === 'error') {
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    }
    return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
  };

  const getSeverityBadge = (severity: 'error' | 'warning') => {
    if (severity === 'error') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
          Error
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
        Warning
      </span>
    );
  };

  const getConflictTypeName = (type: string) => {
    switch (type) {
      case 'merge_strategy_conflict':
        return 'Merge Strategy Conflict';
      case 'rule_conflict':
        return 'Rule Conflict';
      case 'priority_conflict':
        return 'Priority Conflict';
      default:
        return type;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Policy Pack Conflicts
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {totalPacks} published packs analyzed
            {lastRefresh && (
              <span className="ml-2">
                • Last checked: {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={fetchConflicts}
          disabled={isLoading}
          className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-400">
                Error detecting conflicts
              </h3>
              <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No Conflicts State */}
      {!isLoading && !error && conflicts.length === 0 && (
        <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-4">
          <div className="flex">
            <CheckCircle className="h-5 w-5 text-green-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800 dark:text-green-400">
                No conflicts detected
              </h3>
              <div className="mt-2 text-sm text-green-700 dark:text-green-300">
                All {totalPacks} published policy packs are compatible.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conflicts List */}
      {conflicts.length > 0 && (
        <div className="space-y-4">
          {conflicts.map((conflict, index) => (
            <div
              key={index}
              className={`rounded-lg border ${
                conflict.severity === 'error'
                  ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10'
                  : 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/10'
              }`}
            >
              {/* Conflict Header — clickable to expand */}
              <button
                type="button"
                onClick={() => toggleExpand(index)}
                className="w-full p-4 flex items-start gap-3 text-left"
              >
                {expandedConflicts.has(index)
                  ? <ChevronDown className="h-4 w-4 mt-0.5 text-gray-400 shrink-0" />
                  : <ChevronRight className="h-4 w-4 mt-0.5 text-gray-400 shrink-0" />}
                {getSeverityIcon(conflict.severity)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                      {getConflictTypeName(conflict.type)}
                    </h4>
                    {getSeverityBadge(conflict.severity)}
                  </div>
                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                    {conflict.description}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {conflict.affectedPacks.map((pack, i) => (
                      <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                        {pack}
                      </span>
                    ))}
                  </div>
                </div>
              </button>

              {/* Expanded Detail Panel */}
              {expandedConflicts.has(index) && (
                <div className="border-t border-inherit px-4 pb-4 pt-3 space-y-4">

                  {/* Affected Rules side-by-side */}
                  {conflict.affectedRules && conflict.affectedRules.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Conflicting Rules
                      </p>
                      <div className={`grid gap-3 ${conflict.affectedPacks.length >= 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {conflict.affectedPacks.slice(0, 2).map((pack, pi) => (
                          <div key={pi} className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
                            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 truncate">{pack}</p>
                            <div className="space-y-1">
                              {conflict.affectedRules!.map((rule, ri) => (
                                <span key={ri} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 mr-1">
                                  {rule}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Remediation steps */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                      How to Fix
                    </p>
                    <ul className="space-y-1">
                      {conflict.remediation.map((step, i) => (
                        <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex gap-2">
                          <span className="text-gray-400 shrink-0">•</span>{step}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Action feedback */}
                  {actionMessage?.index === index && (
                    <div className={`text-xs rounded px-3 py-2 ${actionMessage.type === 'success' ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300' : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300'}`}>
                      {actionMessage.text}
                    </div>
                  )}

                  {/* Actionable buttons */}
                  {conflict.affectedPacks.length >= 1 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Quick Actions
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {conflict.affectedPacks[0] && (
                          <>
                            <button
                              type="button"
                              disabled={actionLoading !== null}
                              onClick={() => handleAction(index, 'raise_priority', conflict.affectedPacks[0])}
                              className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded border border-blue-300 text-blue-700 bg-white dark:bg-gray-800 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50"
                            >
                              <ArrowUpCircle className="h-3.5 w-3.5 mr-1" />
                              Raise priority: {conflict.affectedPacks[0]}
                            </button>
                            {conflict.affectedPacks[1] && (
                              <button
                                type="button"
                                disabled={actionLoading !== null}
                                onClick={() => handleAction(index, 'lower_priority', conflict.affectedPacks[1])}
                                className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded border border-gray-300 text-gray-700 bg-white dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                              >
                                <ArrowDownCircle className="h-3.5 w-3.5 mr-1" />
                                Lower priority: {conflict.affectedPacks[1]}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={actionLoading !== null}
                              onClick={() => handleAction(index, 'narrow_scope', conflict.affectedPacks[0])}
                              className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded border border-purple-300 text-purple-700 bg-white dark:bg-gray-800 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-50"
                            >
                              <Minimize2 className="h-3.5 w-3.5 mr-1" />
                              Narrow scope
                            </button>
                            {conflict.affectedRules && conflict.affectedRules.length > 0 && (
                              <button
                                type="button"
                                disabled={actionLoading !== null}
                                onClick={() => handleAction(index, 'mark_mergeable', conflict.affectedRules![0])}
                                className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded border border-green-300 text-green-700 bg-white dark:bg-gray-800 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50"
                              >
                                <GitMerge className="h-3.5 w-3.5 mr-1" />
                                Mark rule as mergeable
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

