'use client';

import { useSearchParams, useParams, useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface DriftPlan {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  status: 'active' | 'archived' | 'draft';
  scopeType: 'workspace' | 'service' | 'repo';
  scopeRef?: string;
  primaryDocId?: string;
  primaryDocSystem?: string;
  docClass?: string;
  inputSources: string[];
  driftTypes: string[];
  allowedOutputs: string[];
  thresholds: any;
  eligibility: any;
  sectionTargets: any;
  impactRules: any;
  writeback: any;
  version: number;
  versionHash: string;
  parentId?: string;
  templateId?: string;
  templateName?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

const SCOPE_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  workspace: { label: 'Workspace Default', icon: '🏢' },
  service: { label: 'Service-Specific', icon: '⚙️' },
  repo: { label: 'Repository-Specific', icon: '📦' },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-green-100 text-green-800' },
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  archived: { label: 'Archived', color: 'bg-red-100 text-red-800' },
};

const INPUT_SOURCE_LABELS: Record<string, string> = {
  github_pr: '🔀 GitHub Pull Requests',
  pagerduty_incident: '🚨 PagerDuty Incidents',
  slack_cluster: '💬 Slack Questions',
  datadog_alert: '📊 Datadog Alerts',
  grafana_alert: '📈 Grafana Alerts',
  github_iac: '🏗️ Terraform/Pulumi',
  github_codeowners: '👥 CODEOWNERS',
  github_swagger: '🔌 Swagger/OpenAPI',
};

const DRIFT_TYPE_LABELS: Record<string, string> = {
  instruction: '📝 Instruction Drift',
  process: '🔄 Process Drift',
  ownership: '👤 Ownership Drift',
  coverage: '📊 Coverage Drift',
  environment_tooling: '🔧 Environment Drift',
};

const OUTPUT_TARGET_LABELS: Record<string, string> = {
  confluence: '📄 Confluence',
  notion: '📔 Notion',
  github_readme: '📖 README.md',
  github_swagger: '🔌 Swagger/OpenAPI',
  backstage: '🎭 Backstage Catalog',
  github_code_comments: '💻 Code Comments',
  gitbook: '📚 GitBook',
};

function PlanDetailContent() {
  const searchParams = useSearchParams();
  const params = useParams();
  const router = useRouter();
  const workspaceId = searchParams.get('workspace');
  const planId = params.id as string;
  
  const [plan, setPlan] = useState<DriftPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!workspaceId || !planId) return;
    
    fetch(`${API_URL}/api/plans/${workspaceId}/${planId}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setPlan(data.plan);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [workspaceId, planId]);

  const handleDelete = async () => {
    if (!workspaceId || !planId) return;
    if (!confirm('Are you sure you want to archive this plan?')) return;
    
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/api/plans/${workspaceId}/${planId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        router.push(`/plans?workspace=${workspaceId}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (!workspaceId || !planId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">Missing workspace or plan ID</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading plan...</div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Plan Not Found</h2>
          <Link
            href={`/plans?workspace=${workspaceId}`}
            className="text-indigo-600 hover:text-indigo-700"
          >
            ← Back to Plans
          </Link>
        </div>
      </div>
    );
  }

  const scopeInfo = SCOPE_TYPE_LABELS[plan.scopeType];
  const statusInfo = STATUS_LABELS[plan.status];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-gray-900">{plan.name}</h1>
            <span className={`px-3 py-1 text-sm font-medium rounded ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
            {plan.templateName && (
              <span className="px-3 py-1 text-sm font-medium bg-blue-100 text-blue-800 rounded">
                📄 {plan.templateName}
              </span>
            )}
          </div>
          {plan.description && (
            <p className="text-gray-600">{plan.description}</p>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Metadata */}
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">📋 Plan Metadata</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-500">Plan ID</div>
              <div className="font-mono text-gray-900">{plan.id}</div>
            </div>
            <div>
              <div className="text-gray-500">Version</div>
              <div className="font-semibold text-gray-900">v{plan.version}</div>
            </div>
            <div>
              <div className="text-gray-500">Scope</div>
              <div className="text-gray-900">
                {scopeInfo.icon} {scopeInfo.label}
                {plan.scopeRef && (
                  <span className="ml-2 font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                    {plan.scopeRef}
                  </span>
                )}
              </div>
            </div>
            {plan.docClass && (
              <div>
                <div className="text-gray-500">Doc Class</div>
                <div className="font-mono text-gray-900">{plan.docClass}</div>
              </div>
            )}
            <div>
              <div className="text-gray-500">Created</div>
              <div className="text-gray-900">{new Date(plan.createdAt).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-gray-500">Updated</div>
              <div className="text-gray-900">{new Date(plan.updatedAt).toLocaleString()}</div>
            </div>
            <div className="col-span-2">
              <div className="text-gray-500">Version Hash (SHA-256)</div>
              <div className="font-mono text-xs text-gray-900 break-all">{plan.versionHash}</div>
            </div>
          </div>
        </section>

        {/* Input Sources */}
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">📥 Input Sources</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {plan.inputSources.map(source => (
              <div key={source} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span>{INPUT_SOURCE_LABELS[source] || source}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Drift Types */}
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">🔍 Drift Types</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {plan.driftTypes.map(type => (
              <div key={type} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span>{DRIFT_TYPE_LABELS[type] || type}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Output Targets */}
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">📤 Output Targets</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {plan.allowedOutputs.map(output => (
              <div key={output} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span>{OUTPUT_TARGET_LABELS[output] || output}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Advanced Configuration */}
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">⚙️ Advanced Configuration</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Thresholds</h3>
              <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                {JSON.stringify(plan.thresholds, null, 2)}
              </pre>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Eligibility Rules</h3>
              <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                {JSON.stringify(plan.eligibility, null, 2)}
              </pre>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Section Targets</h3>
              <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                {JSON.stringify(plan.sectionTargets, null, 2)}
              </pre>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Impact Rules</h3>
              <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                {JSON.stringify(plan.impactRules, null, 2)}
              </pre>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Writeback Configuration</h3>
              <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                {JSON.stringify(plan.writeback, null, 2)}
              </pre>
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="flex justify-between items-center">
          <Link
            href={`/plans?workspace=${workspaceId}`}
            className="text-indigo-600 hover:text-indigo-700"
          >
            ← Back to Plans
          </Link>
          <div className="flex gap-4">
            <button
              onClick={handleDelete}
              disabled={deleting || plan.status === 'archived'}
              className="px-4 py-2 text-red-700 bg-white border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? 'Archiving...' : 'Archive Plan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlanDetailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading...</div>}>
      <PlanDetailContent />
    </Suspense>
  );
}

