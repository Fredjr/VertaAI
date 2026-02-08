'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import Navigation from '../../components/Navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AuditLogEntry {
  id: string;
  timestamp: string;
  eventType: string;
  category: string;
  severity: string;
  entityType: string;
  entityId: string;
  actorType: string;
  actorId: string;
  fromState?: string;
  toState?: string;
  evidenceBundleHash?: string;
  impactBand?: string;
  complianceTag?: string;
}

interface ComplianceReport {
  workspaceId: string;
  reportType: string;
  startDate: string;
  endDate: string;
  totalEvents: number;
  criticalEvents: number;
  stateTransitions: number;
  humanActions: number;
  writebacks: number;
  retentionCompliance: boolean;
  auditTrailComplete: boolean;
  logs: AuditLogEntry[];
  generatedAt: string;
  generatedBy: string;
}

const REPORT_TYPES = [
  { value: 'SOX', label: 'SOX (Sarbanes-Oxley)', icon: '📊', description: 'Financial controls and audit trail' },
  { value: 'SOC2', label: 'SOC 2', icon: '🔒', description: 'Security, availability, and confidentiality' },
  { value: 'ISO27001', label: 'ISO 27001', icon: '🛡️', description: 'Information security management' },
  { value: 'GDPR', label: 'GDPR', icon: '🇪🇺', description: 'Data protection and privacy' },
  { value: 'CUSTOM', label: 'Custom Report', icon: '📋', description: 'Custom compliance report' },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  error: 'bg-orange-100 text-orange-800',
  warning: 'bg-yellow-100 text-yellow-800',
  info: 'bg-blue-100 text-blue-800',
  debug: 'bg-gray-100 text-gray-800',
};

const CATEGORY_ICONS: Record<string, string> = {
  system: '⚙️',
  user: '👤',
  integration: '🔌',
  compliance: '📋',
};

function ComplianceDashboardContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace');

  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retentionStats, setRetentionStats] = useState<any>(null);
  
  // Filters
  const [reportType, setReportType] = useState<string>('SOX');
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterEventType, setFilterEventType] = useState<string>('all');

  // Fetch audit logs
  const fetchAuditLogs = async () => {
    if (!workspaceId) return;

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({ workspaceId });
      if (filterSeverity !== 'all') params.append('severity', filterSeverity);
      if (filterCategory !== 'all') params.append('category', filterCategory);
      if (filterEventType !== 'all') params.append('eventType', filterEventType);
      params.append('startTime', new Date(startDate).toISOString());
      params.append('endTime', new Date(endDate).toISOString());
      params.append('limit', '100');

      const res = await fetch(`${API_URL}/api/audit/logs?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch audit logs');

      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Generate compliance report
  const generateReport = async () => {
    if (!workspaceId) return;

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${API_URL}/api/audit/compliance/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          reportType,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          generatedBy: 'compliance-dashboard',
        }),
      });

      if (!res.ok) throw new Error('Failed to generate compliance report');

      const data = await res.json();
      setReport(data);
      setLogs(data.logs || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Export to CSV
  const exportToCSV = async () => {
    if (!workspaceId) return;

    try {
      const res = await fetch(`${API_URL}/api/audit/compliance/report/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          reportType,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          generatedBy: 'compliance-dashboard',
        }),
      });

      if (!res.ok) throw new Error('Failed to export report');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `compliance-report-${reportType}-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Fetch retention stats
  const fetchRetentionStats = async () => {
    if (!workspaceId) return;

    try {
      const res = await fetch(
        `${API_URL}/api/audit/retention/evidence-bundles/stats?workspaceId=${workspaceId}`
      );
      if (!res.ok) throw new Error('Failed to fetch retention stats');

      const data = await res.json();
      setRetentionStats(data);
    } catch (err: any) {
      console.error('Error fetching retention stats:', err);
    }
  };

  // Apply evidence bundle retention
  const applyEvidenceBundleRetention = async () => {
    if (!workspaceId) return;

    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/audit/retention/evidence-bundles/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });

      if (!res.ok) throw new Error('Failed to apply retention policy');

      const data = await res.json();
      alert(`Successfully cleared ${data.deletedCount} expired evidence bundles`);
      fetchRetentionStats();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
    fetchRetentionStats();
  }, [workspaceId, startDate, endDate, filterSeverity, filterCategory, filterEventType]);

  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">Missing workspace parameter</div>
      </div>
    );
  }

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-8 px-4">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">🔒 Compliance Dashboard</h1>
            <p className="mt-2 text-gray-600">
              Audit trail monitoring and compliance reporting for SOX, SOC2, ISO27001, and GDPR
            </p>
          </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Compliance Report Generator */}
        <div className="mb-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">📊 Generate Compliance Report</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {/* Report Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                {REPORT_TYPES.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.icon} {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            {/* Actions */}
            <div className="flex items-end gap-2">
              <button
                onClick={generateReport}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? 'Generating...' : 'Generate'}
              </button>
              <button
                onClick={exportToCSV}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                title="Export to CSV"
              >
                📥
              </button>
            </div>
          </div>

          {/* Report Type Description */}
          {REPORT_TYPES.find(t => t.value === reportType) && (
            <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
              {REPORT_TYPES.find(t => t.value === reportType)?.description}
            </div>
          )}
        </div>

        {/* Compliance Report Summary */}
        {report && (
          <div className="mb-8 bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">📋 Report Summary</h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600">Total Events</div>
                <div className="text-2xl font-bold text-blue-900">{report.totalEvents}</div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600">Critical Events</div>
                <div className="text-2xl font-bold text-red-900">{report.criticalEvents}</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600">State Transitions</div>
                <div className="text-2xl font-bold text-green-900">{report.stateTransitions}</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600">Human Actions</div>
                <div className="text-2xl font-bold text-purple-900">{report.humanActions}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{report.retentionCompliance ? '✅' : '❌'}</span>
                <div>
                  <div className="font-medium">Retention Compliance</div>
                  <div className="text-sm text-gray-600">
                    {report.retentionCompliance ? 'All policies met' : 'Violations detected'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{report.auditTrailComplete ? '✅' : '❌'}</span>
                <div>
                  <div className="font-medium">Audit Trail Complete</div>
                  <div className="text-sm text-gray-600">
                    {report.auditTrailComplete ? 'No gaps detected' : 'Gaps found'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">📅</span>
                <div>
                  <div className="font-medium">Generated</div>
                  <div className="text-sm text-gray-600">
                    {new Date(report.generatedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Retention Policy */}
        {retentionStats && (
          <div className="mb-8 bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">🗄️ Evidence Bundle Retention</h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600">Total Evidence Bundles</div>
                <div className="text-2xl font-bold text-blue-900">
                  {retentionStats.totalEvidenceBundles}
                </div>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600">Expired Bundles</div>
                <div className="text-2xl font-bold text-orange-900">
                  {retentionStats.expiredEvidenceBundles}
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600">Retention Period</div>
                <div className="text-2xl font-bold text-green-900">
                  {retentionStats.retentionPolicy.evidenceBundleRetentionDays} days
                </div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600">Next Cleanup</div>
                <div className="text-lg font-bold text-purple-900">
                  {new Date(retentionStats.nextCleanupDate).toLocaleDateString()}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
              <div>
                <div className="font-medium text-gray-900">Retention Policy</div>
                <div className="text-sm text-gray-600">
                  Evidence bundles older than {retentionStats.retentionPolicy.evidenceBundleRetentionDays} days will be automatically cleared
                  {retentionStats.retentionPolicy.enableAutoCleanup ? ' (auto-cleanup enabled)' : ' (manual cleanup required)'}
                </div>
              </div>
              <button
                onClick={applyEvidenceBundleRetention}
                disabled={loading || retentionStats.expiredEvidenceBundles === 0}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                Clear Expired ({retentionStats.expiredEvidenceBundles})
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">🔍 Filter Audit Logs</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="error">Error</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">All Categories</option>
                <option value="system">System</option>
                <option value="user">User</option>
                <option value="integration">Integration</option>
                <option value="compliance">Compliance</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
              <select
                value={filterEventType}
                onChange={(e) => setFilterEventType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">All Event Types</option>
                <option value="state_transition">State Transition</option>
                <option value="evidence_created">Evidence Created</option>
                <option value="approval">Approval</option>
                <option value="rejection">Rejection</option>
                <option value="writeback_completed">Writeback Completed</option>
              </select>
            </div>
          </div>
        </div>

        {/* Audit Logs Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">📜 Audit Trail</h2>
              <div className="text-sm text-gray-600">
                {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-600">Loading audit logs...</div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">📜</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No audit logs found</h3>
              <p className="text-gray-600">
                Try adjusting your filters or date range
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Event
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Entity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      State Change
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Severity
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span>{CATEGORY_ICONS[log.category] || '📋'}</span>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {log.eventType.replace(/_/g, ' ')}
                            </div>
                            <div className="text-xs text-gray-500">{log.category}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{log.entityType}</div>
                        <div className="text-xs text-gray-500 font-mono">
                          {log.entityId.substring(0, 8)}...
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{log.actorType}</div>
                        <div className="text-xs text-gray-500">{log.actorId}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.fromState && log.toState ? (
                          <span>
                            {log.fromState} → {log.toState}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${SEVERITY_COLORS[log.severity] || 'bg-gray-100 text-gray-800'}`}>
                          {log.severity}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

export default function ComplianceDashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading compliance dashboard...</div>
      </div>
    }>
      <ComplianceDashboardContent />
    </Suspense>
  );
}


