'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';

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
              className={`rounded-lg border p-4 ${
                conflict.severity === 'error'
                  ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10'
                  : 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/10'
              }`}
            >
              {/* Conflict Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  {getSeverityIcon(conflict.severity)}
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                        {getConflictTypeName(conflict.type)}
                      </h4>
                      {getSeverityBadge(conflict.severity)}
                    </div>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                      {conflict.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Affected Packs */}
              <div className="mt-3">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Affected Packs
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {conflict.affectedPacks.map((pack, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                    >
                      {pack}
                    </span>
                  ))}
                </div>
              </div>

              {/* Affected Rules (if applicable) */}
              {conflict.affectedRules && conflict.affectedRules.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Affected Rules
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {conflict.affectedRules.map((rule, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
                      >
                        {rule}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Remediation Steps */}
              <div className="mt-3">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  How to Fix
                </p>
                <ul className="mt-1 space-y-1">
                  {conflict.remediation.map((step, i) => (
                    <li key={i} className="text-xs text-gray-600 dark:text-gray-400">
                      • {step}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

