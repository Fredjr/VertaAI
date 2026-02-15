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
  primaryDocId?: string;
  primaryDocSystem?: string;
  docClass?: string;
  inputSources: string[];
  driftTypes: string[];
  allowedOutputs: string[];
  thresholds: any;
  eligibility: any;
  sectionTargets: any;
  writeback: any;
  docTargeting: any;
  noiseControls: any;
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

// Constants for configuration options
const INPUT_SOURCES = [
  { id: 'github_pr', label: 'GitHub Pull Requests', icon: '🔀', description: 'Detect drift from PR descriptions' },
  { id: 'pagerduty_incident', label: 'PagerDuty Incidents', icon: '🚨', description: 'Learn from incident postmortems' },
  { id: 'slack_cluster', label: 'Slack Questions', icon: '💬', description: 'Clustered questions from Slack' },
  { id: 'datadog_alert', label: 'Datadog Alerts', icon: '📊', description: 'Alert configurations' },
  { id: 'grafana_alert', label: 'Grafana Alerts', icon: '📈', description: 'Dashboard annotations' },
];

const DRIFT_TYPES = [
  { id: 'instruction', label: 'Instructions', icon: '📝', description: 'Step-by-step procedures', sectionTarget: 'Deployment Steps' },
  { id: 'process', label: 'Processes', icon: '⚙️', description: 'Workflows and runbooks', sectionTarget: 'Runbook' },
  { id: 'ownership', label: 'Ownership', icon: '👥', description: 'Team and contact info', sectionTarget: 'Team & Ownership' },
  { id: 'coverage', label: 'Coverage', icon: '🎯', description: 'Monitoring/alerting gaps', sectionTarget: 'Monitoring' },
  { id: 'environment_tooling', label: 'Environment & Tooling', icon: '🔧', description: 'Infrastructure changes', sectionTarget: 'Infrastructure' },
];

const OUTPUT_TARGETS = [
  { id: 'confluence', label: 'Confluence', icon: '📄', description: 'Atlassian Confluence pages' },
  { id: 'notion', label: 'Notion', icon: '📝', description: 'Notion pages' },
  { id: 'github_readme', label: 'GitHub README', icon: '📖', description: 'GitHub README files' },
  { id: 'backstage', label: 'Backstage', icon: '🎭', description: 'Backstage service catalog' },
];

const DOC_SYSTEMS = [
  { id: 'confluence', label: 'Confluence' },
  { id: 'notion', label: 'Notion' },
  { id: 'github_readme', label: 'GitHub README' },
  { id: 'backstage', label: 'Backstage' },
];

const DOC_CLASSES = [
  { id: 'runbook', label: 'Runbook', icon: '📗' },
  { id: 'api_contract', label: 'API Contract', icon: '📘' },
  { id: 'service_catalog', label: 'Service Catalog', icon: '📙' },
  { id: 'architecture_doc', label: 'Architecture Doc', icon: '📕' },
];

function PlansListContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace');

  const [plans, setPlans] = useState<DriftPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [filterScope, setFilterScope] = useState<string>('all');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<DriftPlan | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    scopeType: 'workspace' as 'workspace' | 'service' | 'repo',
    scopeRef: '',
    primaryDocId: '',
    primaryDocSystem: 'confluence',
    primaryDocTitle: '',
    primaryDocUrl: '',
    docClass: 'runbook',
    inputSources: [] as string[],
    driftTypes: [] as string[],
    allowedOutputs: [] as string[],
    autoApproveThreshold: 0.98,
    slackNotifyThreshold: 0.40,
    digestOnlyThreshold: 0.30,
    ignoreThreshold: 0.20,
  });

  const fetchPlans = async () => {
    if (!workspaceId) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.append('status', filterStatus);
      if (filterScope !== 'all') params.append('scopeType', filterScope);

      const response = await fetch(`${API_URL}/api/workspaces/${workspaceId}/drift-plans?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setPlans(data.data || []);
        setError(null);
      } else {
        setError(data.error || 'Failed to load plans');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, [workspaceId, filterStatus, filterScope]);

  const openCreateModal = () => {
    setEditingPlan(null);
    setFormData({
      name: '',
      description: '',
      scopeType: 'workspace',
      scopeRef: '',
      primaryDocId: '',
      primaryDocSystem: 'confluence',
      primaryDocTitle: '',
      primaryDocUrl: '',
      docClass: 'runbook',
      inputSources: [],
      driftTypes: [],
      allowedOutputs: [],
      autoApproveThreshold: 0.98,
      slackNotifyThreshold: 0.40,
      digestOnlyThreshold: 0.30,
      ignoreThreshold: 0.20,
    });
    setShowModal(true);
  };

  const openEditModal = (plan: DriftPlan) => {
    setEditingPlan(plan);
    const thresholds = plan.thresholds || {};
    setFormData({
      name: plan.name,
      description: plan.description || '',
      scopeType: plan.scopeType,
      scopeRef: plan.scopeRef || '',
      primaryDocId: plan.primaryDocId || '',
      primaryDocSystem: plan.primaryDocSystem || 'confluence',
      primaryDocTitle: '',
      primaryDocUrl: '',
      docClass: plan.docClass || 'runbook',
      inputSources: plan.inputSources || [],
      driftTypes: plan.driftTypes || [],
      allowedOutputs: plan.allowedOutputs || [],
      autoApproveThreshold: thresholds.autoApprove || 0.98,
      slackNotifyThreshold: thresholds.slackNotify || 0.40,
      digestOnlyThreshold: thresholds.digestOnly || 0.30,
      ignoreThreshold: thresholds.ignore || 0.20,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingPlan(null);
    setSaving(false);
  };

  const handleSave = async () => {
    if (!workspaceId) return;

    setSaving(true);
    try {
      const config = {
        inputSources: formData.inputSources,
        driftTypes: formData.driftTypes,
        allowedOutputs: formData.allowedOutputs,
        thresholds: {
          autoApprove: formData.autoApproveThreshold,
          slackNotify: formData.slackNotifyThreshold,
          digestOnly: formData.digestOnlyThreshold,
          ignore: formData.ignoreThreshold,
        },
        eligibility: {},
        sectionTargets: formData.driftTypes.reduce((acc, type) => {
          const driftType = DRIFT_TYPES.find(dt => dt.id === type);
          if (driftType) {
            acc[type] = driftType.sectionTarget;
          }
          return acc;
        }, {} as Record<string, string>),
        impactRules: {},
        writeback: {
          enabled: true,
          requiresApproval: formData.autoApproveThreshold < 1.0,
        },
        docTargeting: {
          strategy: 'primary_first',
          maxDocsPerDrift: 3,
        },
        noiseControls: {
          ignorePatterns: ['WIP:', 'draft:', 'test:'],
          temporalAccumulation: {
            enabled: true,
            windowDays: 7,
            minDriftsToBundle: 3,
          },
        },
        budgets: {},
        sourceCursors: {},
      };

      const url = editingPlan
        ? `${API_URL}/api/workspaces/${workspaceId}/drift-plans/${editingPlan.id}`
        : `${API_URL}/api/workspaces/${workspaceId}/drift-plans`;

      const method = editingPlan ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          scopeType: formData.scopeType,
          scopeRef: formData.scopeRef || null,
          primaryDocId: formData.primaryDocId || null,
          primaryDocSystem: formData.primaryDocSystem || null,
          docClass: formData.docClass,
          config,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to save plan');
      }

      await fetchPlans();
      closeModal();
    } catch (err: any) {
      alert(err.message);
      setSaving(false);
    }
  };

  const handleDelete = async (planId: string) => {
    if (!workspaceId) return;
    if (!confirm('Are you sure you want to archive this plan?')) return;

    try {
      const response = await fetch(`${API_URL}/api/workspaces/${workspaceId}/drift-plans/${planId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to delete plan');
      }

      await fetchPlans();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleInputSource = (sourceId: string) => {
    setFormData(prev => ({
      ...prev,
      inputSources: prev.inputSources.includes(sourceId)
        ? prev.inputSources.filter(s => s !== sourceId)
        : [...prev.inputSources, sourceId],
    }));
  };

  const toggleDriftType = (typeId: string) => {
    setFormData(prev => ({
      ...prev,
      driftTypes: prev.driftTypes.includes(typeId)
        ? prev.driftTypes.filter(t => t !== typeId)
        : [...prev.driftTypes, typeId],
    }));
  };

  const toggleOutputTarget = (targetId: string) => {
    setFormData(prev => ({
      ...prev,
      allowedOutputs: prev.allowedOutputs.includes(targetId)
        ? prev.allowedOutputs.filter(t => t !== targetId)
        : [...prev.allowedOutputs, targetId],
    }));
  };

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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="max-w-7xl mx-auto py-8 px-4">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">📋 Drift Remediation Plans</h1>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Configure drift detection, materiality thresholds, and doc targeting
              </p>
            </div>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              + New Plan
            </button>
          </div>

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {editingPlan ? 'Edit Drift Plan' : 'Create New Drift Plan'}
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Configure drift detection, materiality thresholds, and primary doc targeting
                </p>
              </div>

              <div className="p-6 space-y-6">
                {/* Step 1: Basic Info */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">1. Basic Information</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Plan Name *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        placeholder="e.g., Payment Service Runbook Plan"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Description
                      </label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        rows={3}
                        placeholder="Describe what this plan covers..."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Scope Type *
                        </label>
                        <select
                          value={formData.scopeType}
                          onChange={(e) => setFormData({ ...formData, scopeType: e.target.value as any })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        >
                          <option value="workspace">Workspace Default</option>
                          <option value="service">Service-Specific</option>
                          <option value="repo">Repository-Specific</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Scope Reference
                        </label>
                        <input
                          type="text"
                          value={formData.scopeRef}
                          onChange={(e) => setFormData({ ...formData, scopeRef: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          placeholder={formData.scopeType === 'service' ? 'service-id' : 'org/repo'}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 2: Primary Doc Picker (CRITICAL - solves "wrong page selection") */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    2. Primary Doc Targeting 🎯
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    <strong>Solves "wrong page selection":</strong> Specify the primary doc to patch first
                  </p>
                  <div className="space-y-4 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Doc System
                        </label>
                        <select
                          value={formData.primaryDocSystem}
                          onChange={(e) => setFormData({ ...formData, primaryDocSystem: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        >
                          {DOC_SYSTEMS.map(sys => (
                            <option key={sys.id} value={sys.id}>{sys.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Doc Class
                        </label>
                        <select
                          value={formData.docClass}
                          onChange={(e) => setFormData({ ...formData, docClass: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        >
                          {DOC_CLASSES.map(cls => (
                            <option key={cls.id} value={cls.id}>{cls.icon} {cls.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Primary Doc ID (optional)
                      </label>
                      <input
                        type="text"
                        value={formData.primaryDocId}
                        onChange={(e) => setFormData({ ...formData, primaryDocId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        placeholder="e.g., confluence-page-id or notion-page-id"
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Leave empty to auto-discover based on doc class and scope
                      </p>
                    </div>
                  </div>
                </div>

                {/* Step 3: Input Sources */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">3. Input Sources</h3>
                  <div className="grid grid-cols-1 gap-3">
                    {INPUT_SOURCES.map(source => (
                      <label
                        key={source.id}
                        className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={formData.inputSources.includes(source.id)}
                          onChange={() => toggleInputSource(source.id)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span>{source.icon}</span>
                            <span className="font-medium text-gray-900 dark:text-white">{source.label}</span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{source.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Step 4: Drift Types */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">4. Drift Types</h3>
                  <div className="grid grid-cols-1 gap-3">
                    {DRIFT_TYPES.map(type => (
                      <label
                        key={type.id}
                        className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={formData.driftTypes.includes(type.id)}
                          onChange={() => toggleDriftType(type.id)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span>{type.icon}</span>
                            <span className="font-medium text-gray-900 dark:text-white">{type.label}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">→ {type.sectionTarget}</span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{type.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Step 5: Output Targets */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">5. Output Targets</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {OUTPUT_TARGETS.map(target => (
                      <label
                        key={target.id}
                        className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={formData.allowedOutputs.includes(target.id)}
                          onChange={() => toggleOutputTarget(target.id)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span>{target.icon}</span>
                            <span className="font-medium text-gray-900 dark:text-white">{target.label}</span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{target.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Step 6: Materiality Thresholds (CRITICAL - solves "noisy drift alerts" + "patching commas") */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    6. Materiality Thresholds 🎚️
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    <strong>Solves "noisy drift alerts" and "patching commas":</strong> Only patch material changes
                  </p>
                  <div className="space-y-6 bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Auto-Approve Threshold
                        </label>
                        <span className="text-sm font-mono text-gray-900 dark:text-white">
                          {formData.autoApproveThreshold.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={formData.autoApproveThreshold}
                        onChange={(e) => setFormData({ ...formData, autoApproveThreshold: parseFloat(e.target.value) })}
                        className="w-full"
                      />
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Patches with confidence ≥ {formData.autoApproveThreshold.toFixed(2)} are auto-approved
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Slack Notify Threshold
                        </label>
                        <span className="text-sm font-mono text-gray-900 dark:text-white">
                          {formData.slackNotifyThreshold.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={formData.slackNotifyThreshold}
                        onChange={(e) => setFormData({ ...formData, slackNotifyThreshold: parseFloat(e.target.value) })}
                        className="w-full"
                      />
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Patches with confidence ≥ {formData.slackNotifyThreshold.toFixed(2)} trigger Slack notification
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Digest-Only Threshold
                        </label>
                        <span className="text-sm font-mono text-gray-900 dark:text-white">
                          {formData.digestOnlyThreshold.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={formData.digestOnlyThreshold}
                        onChange={(e) => setFormData({ ...formData, digestOnlyThreshold: parseFloat(e.target.value) })}
                        className="w-full"
                      />
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Patches with confidence ≥ {formData.digestOnlyThreshold.toFixed(2)} included in weekly digest
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Ignore Threshold
                        </label>
                        <span className="text-sm font-mono text-gray-900 dark:text-white">
                          {formData.ignoreThreshold.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={formData.ignoreThreshold}
                        onChange={(e) => setFormData({ ...formData, ignoreThreshold: parseFloat(e.target.value) })}
                        className="w-full"
                      />
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Patches below {formData.ignoreThreshold.toFixed(2)} are ignored (prevents "patching commas")
                      </p>
                    </div>

                    <div className="mt-4 p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Example Scenarios:</p>
                      <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                        <li>• Confidence 0.99 → Auto-approved ✅</li>
                        <li>• Confidence 0.65 → Slack notification 📢</li>
                        <li>• Confidence 0.35 → Weekly digest only 📧</li>
                        <li>• Confidence 0.15 → Ignored (too low quality) 🚫</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                <button
                  onClick={closeModal}
                  disabled={saving}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formData.name}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingPlan ? 'Update Plan' : 'Create Plan'}
                </button>
              </div>
            </div>
          </div>
        )}

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
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-12 text-center">
            <div className="text-6xl mb-4">📋</div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No plans found</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Create your first drift plan to start managing drift detection policies
            </p>
            <button
              onClick={openCreateModal}
              className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Create Your First Plan
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {plans.map(plan => {
              const scopeInfo = SCOPE_TYPE_LABELS[plan.scopeType];
              const statusInfo = STATUS_LABELS[plan.status];
              const thresholds = plan.thresholds || {};

              return (
                <div
                  key={plan.id}
                  className="bg-white dark:bg-gray-900 rounded-lg shadow hover:shadow-md transition-shadow p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{plan.name}</h3>
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
                        <p className="text-gray-600 dark:text-gray-400 mb-3">{plan.description}</p>
                      )}

                      <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400 mb-3">
                        <div className="flex items-center gap-1">
                          <span>{scopeInfo.icon}</span>
                          <span>{scopeInfo.label}</span>
                          {plan.scopeRef && (
                            <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                              {plan.scopeRef}
                            </span>
                          )}
                        </div>
                        <div>v{plan.version}</div>
                        <div>{plan.inputSources.length} sources</div>
                        <div>{plan.driftTypes.length} drift types</div>
                        <div>{plan.allowedOutputs.length} outputs</div>
                      </div>

                      {/* Materiality Thresholds Display */}
                      {thresholds.autoApprove !== undefined && (
                        <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                          <span className="font-semibold">Materiality:</span>
                          <span>Auto-approve ≥{(thresholds.autoApprove || 0.98).toFixed(2)}</span>
                          <span>Slack ≥{(thresholds.slackNotify || 0.40).toFixed(2)}</span>
                          <span>Digest ≥{(thresholds.digestOnly || 0.30).toFixed(2)}</span>
                          <span>Ignore &lt;{(thresholds.ignore || 0.20).toFixed(2)}</span>
                        </div>
                      )}

                      {/* Primary Doc Info */}
                      {plan.primaryDocId && (
                        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                          🎯 Primary Doc: {plan.primaryDocSystem} ({plan.docClass})
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        Updated {new Date(plan.updatedAt).toLocaleDateString()}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(plan);
                          }}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(plan.id);
                          }}
                          className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
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


