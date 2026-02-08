'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Navigation from '../../components/Navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface DriftPlan {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  status: 'active' | 'archived' | 'draft';
  scopeType: 'workspace' | 'service' | 'repo';
  scopeRef?: string;
  docClass?: string;
  inputSources: string[];
  driftTypes: string[];
  allowedOutputs: string[];
  templateId?: string;
  templateName?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const SCOPE_TYPE_LABELS: Record<string, { label: string; icon: string; description: string }> = {
  workspace: { label: 'Workspace Default', icon: '🏢', description: 'Applies to all services and repos' },
  service: { label: 'Service-Specific', icon: '⚙️', description: 'Applies to a specific service' },
  repo: { label: 'Repository-Specific', icon: '📦', description: 'Applies to a specific repository' },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-green-100 text-green-800' },
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  archived: { label: 'Archived', color: 'bg-red-100 text-red-800' },
};

function PlansListContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace');

  const [plans, setPlans] = useState<DriftPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [filterScope, setFilterScope] = useState<string>('all');

  useEffect(() => {
    if (!workspaceId) return;

    const params = new URLSearchParams();
    if (filterStatus !== 'all') params.append('status', filterStatus);
    if (filterScope !== 'all') params.append('scopeType', filterScope);

    fetch(`${API_URL}/api/plans/${workspaceId}?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setPlans(data.plans || []);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [workspaceId, filterStatus, filterScope]);

  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">Missing workspace parameter</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading plans...</div>
      </div>
    );
  }

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-8 px-4">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">📋 Drift Plans</h1>
              <p className="mt-2 text-gray-600">
                Manage versioned drift detection plans for your workspace
              </p>
            </div>
          <Link
            href={`/plans/new?workspace=${workspaceId}`}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            + Create Plan
          </Link>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
            <select
              value={filterScope}
              onChange={(e) => setFilterScope(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="all">All Scopes</option>
              <option value="workspace">Workspace</option>
              <option value="service">Service</option>
              <option value="repo">Repository</option>
            </select>
          </div>
        </div>

        {/* Plans List */}
        {plans.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-6xl mb-4">📋</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No plans found</h3>
            <p className="text-gray-600 mb-6">
              Create your first drift plan to start managing drift detection policies
            </p>
            <Link
              href={`/plans/new?workspace=${workspaceId}`}
              className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Create Your First Plan
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {plans.map(plan => {
              const scopeInfo = SCOPE_TYPE_LABELS[plan.scopeType];
              const statusInfo = STATUS_LABELS[plan.status];

              return (
                <Link
                  key={plan.id}
                  href={`/plans/${plan.id}?workspace=${workspaceId}`}
                  className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                        {plan.templateName && (
                          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                            📄 {plan.templateName}
                          </span>
                        )}
                      </div>

                      {plan.description && (
                        <p className="text-gray-600 mb-3">{plan.description}</p>
                      )}

                      <div className="flex items-center gap-6 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <span>{scopeInfo.icon}</span>
                          <span>{scopeInfo.label}</span>
                          {plan.scopeRef && (
                            <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                              {plan.scopeRef}
                            </span>
                          )}
                        </div>
                        <div>v{plan.version}</div>
                        <div>{plan.inputSources.length} sources</div>
                        <div>{plan.driftTypes.length} drift types</div>
                        <div>{plan.allowedOutputs.length} outputs</div>
                      </div>
                    </div>

                    <div className="text-right text-sm text-gray-500">
                      <div>Updated {new Date(plan.updatedAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Back Link */}
        <div className="mt-8">
          <Link
            href={`/onboarding?workspace=${workspaceId}`}
            className="text-indigo-600 hover:text-indigo-700"
          >
            ← Back to Onboarding
          </Link>
        </div>
      </div>
    </div>
    </>
  );
}

export default function PlansListPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading...</div>}>
      <PlansListContent />
    </Suspense>
  );
}


