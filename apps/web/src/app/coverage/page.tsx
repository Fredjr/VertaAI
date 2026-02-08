'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import Navigation from '../../components/Navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface CoverageSnapshot {
  id: string;
  workspaceId: string;
  snapshotAt: string;
  totalServices: number;
  servicesMapped: number;
  totalRepos: number;
  reposMapped: number;
  mappingCoveragePercent: number;
  totalSignals: number;
  signalsProcessed: number;
  signalsIgnored: number;
  processingCoveragePercent: number;
  sourceHealth: Record<string, SourceHealthMetrics>;
  driftTypeDistribution: Record<string, number>;
  obligationsStatus: Record<string, ObligationStatus>;
}

interface SourceHealthMetrics {
  total: number;
  processed: number;
  ignored: number;
  health: 'excellent' | 'good' | 'fair' | 'poor';
  healthScore: number;
}

interface ObligationStatus {
  threshold: number;
  actual: number;
  met: boolean;
  severity: 'critical' | 'warning';
}

interface CoverageAlert {
  type: string;
  severity: 'critical' | 'warning';
  message: string;
  threshold: number;
  actual: number;
  timestamp: string;
}

interface CoverageTrend {
  date: string;
  mappingCoverage: number;
  processingCoverage: number;
  avgSourceHealth: number;
}

const HEALTH_COLORS: Record<string, string> = {
  excellent: 'bg-green-100 text-green-800',
  good: 'bg-blue-100 text-blue-800',
  fair: 'bg-yellow-100 text-yellow-800',
  poor: 'bg-red-100 text-red-800',
};

const HEALTH_ICONS: Record<string, string> = {
  excellent: '✅',
  good: '👍',
  fair: '⚠️',
  poor: '❌',
};

function CoverageDashboardContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace');

  const [snapshot, setSnapshot] = useState<CoverageSnapshot | null>(null);
  const [alerts, setAlerts] = useState<CoverageAlert[]>([]);
  const [trends, setTrends] = useState<CoverageTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trendDays, setTrendDays] = useState<number>(30);

  useEffect(() => {
    if (!workspaceId) {
      setError('No workspace selected');
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch latest snapshot
        const snapshotRes = await fetch(
          `${API_URL}/api/coverage/latest?workspaceId=${workspaceId}`
        );
        if (!snapshotRes.ok) {
          throw new Error('Failed to fetch coverage snapshot');
        }
        const snapshotData = await snapshotRes.json();
        setSnapshot(snapshotData);

        // Fetch alerts
        const alertsRes = await fetch(
          `${API_URL}/api/coverage/alerts?workspaceId=${workspaceId}`
        );
        if (!alertsRes.ok) {
          throw new Error('Failed to fetch coverage alerts');
        }
        const alertsData = await alertsRes.json();
        setAlerts(alertsData);

        // Fetch trends
        const trendsRes = await fetch(
          `${API_URL}/api/coverage/trends?workspaceId=${workspaceId}&days=${trendDays}`
        );
        if (!trendsRes.ok) {
          throw new Error('Failed to fetch coverage trends');
        }
        const trendsData = await trendsRes.json();
        setTrends(trendsData);
      } catch (err: any) {
        console.error('Error fetching coverage data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [workspaceId, trendDays]);

  const handleRefresh = async () => {
    if (!workspaceId) return;

    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/coverage/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });

      if (!res.ok) {
        throw new Error('Failed to create snapshot');
      }

      // Reload data
      window.location.reload();
    } catch (err: any) {
      console.error('Error creating snapshot:', err);
      alert(`Error: ${err.message}`);
    }
  };

  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-yellow-800 mb-2">
              No Workspace Selected
            </h2>
            <p className="text-yellow-700">
              Please select a workspace from the URL: ?workspace=YOUR_WORKSPACE_ID
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !snapshot) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading coverage data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-red-800 mb-2">Error</h2>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-blue-800 mb-2">
              No Coverage Data
            </h2>
            <p className="text-blue-700 mb-4">
              No coverage snapshots found for this workspace.
            </p>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create First Snapshot
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
              Coverage Health Dashboard
            </h1>
            <p className="text-gray-600 mt-2">
              Monitor mapping coverage, processing coverage, and source health
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : '🔄 Refresh Snapshot'}
          </button>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="mb-8 bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-red-800 mb-4">
              ⚠️ Coverage Alerts ({alerts.length})
            </h2>
            <div className="space-y-3">
              {alerts.map((alert, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg ${
                    alert.severity === 'critical'
                      ? 'bg-red-100 border border-red-300'
                      : 'bg-yellow-100 border border-yellow-300'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p
                        className={`font-semibold ${
                          alert.severity === 'critical'
                            ? 'text-red-800'
                            : 'text-yellow-800'
                        }`}
                      >
                        {alert.message}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        Type: {alert.type} | Severity: {alert.severity}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        alert.severity === 'critical'
                          ? 'bg-red-200 text-red-800'
                          : 'bg-yellow-200 text-yellow-800'
                      }`}
                    >
                      {alert.severity.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Coverage Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Mapping Coverage */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              📊 Mapping Coverage
            </h3>
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-3xl font-bold text-blue-600">
                  {snapshot.mappingCoveragePercent.toFixed(1)}%
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    snapshot.mappingCoveragePercent >= 80
                      ? 'bg-green-100 text-green-800'
                      : snapshot.mappingCoveragePercent >= 60
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {snapshot.mappingCoveragePercent >= 80
                    ? 'Excellent'
                    : snapshot.mappingCoveragePercent >= 60
                    ? 'Good'
                    : 'Needs Improvement'}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all"
                  style={{ width: `${snapshot.mappingCoveragePercent}%` }}
                ></div>
              </div>
            </div>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Services Mapped:</span>
                <span className="font-semibold">
                  {snapshot.servicesMapped} / {snapshot.totalServices}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Repos Mapped:</span>
                <span className="font-semibold">
                  {snapshot.reposMapped} / {snapshot.totalRepos}
                </span>
              </div>
            </div>
          </div>

          {/* Processing Coverage */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              ⚡ Processing Coverage
            </h3>
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-3xl font-bold text-green-600">
                  {snapshot.processingCoveragePercent.toFixed(1)}%
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    snapshot.processingCoveragePercent >= 70
                      ? 'bg-green-100 text-green-800'
                      : snapshot.processingCoveragePercent >= 50
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {snapshot.processingCoveragePercent >= 70
                    ? 'Excellent'
                    : snapshot.processingCoveragePercent >= 50
                    ? 'Good'
                    : 'Needs Improvement'}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-green-600 h-3 rounded-full transition-all"
                  style={{ width: `${snapshot.processingCoveragePercent}%` }}
                ></div>
              </div>
            </div>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Signals Processed:</span>
                <span className="font-semibold">
                  {snapshot.signalsProcessed} / {snapshot.totalSignals}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Signals Ignored:</span>
                <span className="font-semibold">{snapshot.signalsIgnored}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Source Health */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            🏥 Source Health Monitoring
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(snapshot.sourceHealth).map(([source, metrics]) => (
              <div
                key={source}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">{source}</p>
                    <p className="text-sm text-gray-600">
                      {metrics.healthScore.toFixed(1)}% health
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      HEALTH_COLORS[metrics.health]
                    }`}
                  >
                    {HEALTH_ICONS[metrics.health]} {metrics.health}
                  </span>
                </div>
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>Total:</span>
                    <span className="font-semibold">{metrics.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Processed:</span>
                    <span className="font-semibold text-green-600">
                      {metrics.processed}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ignored:</span>
                    <span className="font-semibold text-red-600">
                      {metrics.ignored}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Drift Type Distribution */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            📈 Drift Type Distribution
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {Object.entries(snapshot.driftTypeDistribution).map(
              ([type, count]) => (
                <div
                  key={type}
                  className="border border-gray-200 rounded-lg p-4 text-center"
                >
                  <p className="text-2xl font-bold text-blue-600">{count}</p>
                  <p className="text-sm text-gray-600 mt-1">{type}</p>
                </div>
              )
            )}
          </div>
        </div>

        {/* Coverage Trends */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              📊 Coverage Trends
            </h3>
            <select
              value={trendDays}
              onChange={(e) => setTrendDays(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>
          {trends.length > 0 ? (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Mapping Coverage
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Processing Coverage
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Avg Source Health
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {trends.slice(0, 10).map((trend, idx) => (
                      <tr key={idx}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(trend.date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span
                            className={`font-semibold ${
                              trend.mappingCoverage >= 80
                                ? 'text-green-600'
                                : trend.mappingCoverage >= 60
                                ? 'text-yellow-600'
                                : 'text-red-600'
                            }`}
                          >
                            {trend.mappingCoverage.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span
                            className={`font-semibold ${
                              trend.processingCoverage >= 70
                                ? 'text-green-600'
                                : trend.processingCoverage >= 50
                                ? 'text-yellow-600'
                                : 'text-red-600'
                            }`}
                          >
                            {trend.processingCoverage.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span
                            className={`font-semibold ${
                              trend.avgSourceHealth >= 70
                                ? 'text-green-600'
                                : trend.avgSourceHealth >= 50
                                ? 'text-yellow-600'
                                : 'text-red-600'
                            }`}
                          >
                            {trend.avgSourceHealth.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-gray-600 text-center py-8">
              No trend data available for the selected period.
            </p>
          )}
        </div>

        {/* Snapshot Info */}
        <div className="mt-8 text-center text-sm text-gray-500">
          Last updated: {new Date(snapshot.snapshotAt).toLocaleString()}
        </div>
      </div>
    </div>
    </>
  );
}

export default function CoverageDashboard() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600">Loading...</p>
            </div>
          </div>
        </div>
      }
    >
      <CoverageDashboardContent />
    </Suspense>
  );
}


