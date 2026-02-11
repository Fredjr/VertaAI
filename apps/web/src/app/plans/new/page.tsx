'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  config: {
    inputSources: string[];
    driftTypes: string[];
    allowedOutputs: string[];
    thresholds: any;
    eligibility: any;
    sectionTargets: any;
    impactRules: any;
    writeback: any;
  };
}

interface PlanFormData {
  name: string;
  description: string;
  scopeType: 'workspace' | 'service' | 'repo';
  scopeRef: string;
  docClass: string;
  templateId: string;
  inputSources: string[];
  driftTypes: string[];
  allowedOutputs: string[];
  // Priority 1: Cluster-First Triage
  enableClustering: boolean;
  // Priority 2: Budget Controls
  maxDriftsPerDay: number;
  maxDriftsPerWeek: number;
  maxSlackNotificationsPerHour: number;
  // Priority 4: Threshold Configuration
  autoApproveThreshold: number;
  slackNotifyThreshold: number;
  digestOnlyThreshold: number;
  ignoreThreshold: number;
}

const SCOPE_TYPE_OPTIONS = [
  { value: 'workspace', label: 'Workspace Default', icon: '🏢', description: 'Applies to all services and repos' },
  { value: 'service', label: 'Service-Specific', icon: '⚙️', description: 'Applies to a specific service' },
  { value: 'repo', label: 'Repository-Specific', icon: '📦', description: 'Applies to a specific repository' },
];

const INPUT_SOURCE_OPTIONS = [
  { value: 'github_pr', label: 'GitHub Pull Requests', icon: '🔀' },
  { value: 'pagerduty_incident', label: 'PagerDuty Incidents', icon: '🚨' },
  { value: 'slack_cluster', label: 'Slack Questions', icon: '💬' },
  { value: 'datadog_alert', label: 'Datadog Alerts', icon: '📊' },
  { value: 'grafana_alert', label: 'Grafana Alerts', icon: '📈' },
  { value: 'github_iac', label: 'Terraform/Pulumi', icon: '🏗️' },
  { value: 'github_codeowners', label: 'CODEOWNERS', icon: '👥' },
  { value: 'github_swagger', label: 'Swagger/OpenAPI', icon: '🔌' },
];

const DRIFT_TYPE_OPTIONS = [
  { value: 'instruction', label: 'Instruction Drift', icon: '📝', description: 'Commands, configs, URLs changed' },
  { value: 'process', label: 'Process Drift', icon: '🔄', description: 'Sequence/order of steps changed' },
  { value: 'ownership', label: 'Ownership Drift', icon: '👤', description: 'Team/owner/contact changed' },
  { value: 'coverage', label: 'Coverage Drift', icon: '📊', description: 'Missing scenarios/edge cases' },
  { value: 'environment_tooling', label: 'Environment Drift', icon: '🔧', description: 'Platform/tooling changed' },
];

const OUTPUT_TARGET_OPTIONS = [
  { value: 'confluence', label: 'Confluence', icon: '📄' },
  { value: 'notion', label: 'Notion', icon: '📔' },
  { value: 'github_readme', label: 'README.md', icon: '📖' },
  { value: 'github_swagger', label: 'Swagger/OpenAPI', icon: '🔌' },
  { value: 'backstage', label: 'Backstage Catalog', icon: '🎭' },
  { value: 'github_code_comments', label: 'Code Comments', icon: '💻' },
  { value: 'gitbook', label: 'GitBook', icon: '📚' },
];

function NewPlanContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const workspaceId = searchParams.get('workspace');
  
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<PlanTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<PlanFormData>({
    name: '',
    description: '',
    scopeType: 'workspace',
    scopeRef: '',
    docClass: '',
    templateId: '',
    inputSources: [],
    driftTypes: [],
    allowedOutputs: [],
    // Priority 1: Cluster-First Triage (default: disabled for safety)
    enableClustering: false,
    // Priority 2: Budget Controls (defaults from backend)
    maxDriftsPerDay: 50,
    maxDriftsPerWeek: 200,
    maxSlackNotificationsPerHour: 5,
    // Priority 4: Threshold Configuration (defaults from backend)
    autoApproveThreshold: 98,
    slackNotifyThreshold: 40,
    digestOnlyThreshold: 30,
    ignoreThreshold: 20,
  });

  useEffect(() => {
    fetch(`${API_URL}/api/plans/templates`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setTemplates(data.templates || []);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleTemplateSelect = (template: PlanTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      ...formData,
      templateId: template.id,
      name: template.name,
      description: template.description,
      inputSources: template.config.inputSources,
      driftTypes: template.config.driftTypes,
      allowedOutputs: template.config.allowedOutputs,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!workspaceId) {
      setError('Missing workspace ID');
      return;
    }
    
    setSaving(true);
    setError(null);

    try {
      // Build budgets object (Priority 1 + Priority 2)
      const budgets = {
        enableClustering: formData.enableClustering,
        maxDriftsPerDay: formData.maxDriftsPerDay,
        maxDriftsPerWeek: formData.maxDriftsPerWeek,
        maxSlackNotificationsPerHour: formData.maxSlackNotificationsPerHour,
      };

      // Build thresholds object (Priority 4)
      const thresholds = {
        autoApprove: formData.autoApproveThreshold / 100, // Convert percentage to decimal
        slackNotify: formData.slackNotifyThreshold / 100,
        digestOnly: formData.digestOnlyThreshold / 100,
        ignore: formData.ignoreThreshold / 100,
      };

      const config = selectedTemplate ? {
        inputSources: formData.inputSources,
        driftTypes: formData.driftTypes,
        allowedOutputs: formData.allowedOutputs,
        thresholds: thresholds,
        eligibility: selectedTemplate.config.eligibility,
        sectionTargets: selectedTemplate.config.sectionTargets,
        impactRules: selectedTemplate.config.impactRules,
        writeback: selectedTemplate.config.writeback,
        budgets: budgets, // Add budgets to config
      } : {
        inputSources: formData.inputSources,
        driftTypes: formData.driftTypes,
        allowedOutputs: formData.allowedOutputs,
        thresholds: thresholds,
        eligibility: {},
        sectionTargets: {},
        impactRules: {},
        writeback: {},
        budgets: budgets, // Add budgets to config
      };

      const res = await fetch(`${API_URL}/api/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          name: formData.name,
          description: formData.description,
          scopeType: formData.scopeType,
          scopeRef: formData.scopeRef || undefined,
          docClass: formData.docClass || undefined,
          config,
          templateId: formData.templateId || undefined,
        }),
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
      setSaving(false);
    }
  };

  const toggleArrayValue = (array: string[], value: string) => {
    return array.includes(value)
      ? array.filter(v => v !== value)
      : [...array, value];
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
        <div className="text-gray-600">Loading templates...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">📋 Create Drift Plan</h1>
          <p className="mt-2 text-gray-600">
            Create a new versioned drift detection plan
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Template Selection */}
          {!selectedTemplate && (
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Choose a Template (Optional)</h2>
              <p className="text-gray-600 mb-4">Start with a pre-configured template or create from scratch</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {templates.map(template => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleTemplateSelect(template)}
                    className="text-left p-4 border-2 border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
                  >
                    <h3 className="font-semibold text-gray-900 mb-1">{template.name}</h3>
                    <p className="text-sm text-gray-600">{template.description}</p>
                    <div className="mt-2 flex gap-2 text-xs text-gray-500">
                      <span>{template.config.inputSources.length} sources</span>
                      <span>•</span>
                      <span>{template.config.driftTypes.length} drift types</span>
                    </div>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, templateId: '' })}
                className="text-indigo-600 hover:text-indigo-700 text-sm"
              >
                Or create from scratch →
              </button>
            </section>
          )}

          {/* Basic Information */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {selectedTemplate ? '2. Basic Information' : '1. Basic Information'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Plan Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., Payment Service Runbook Plan"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  rows={3}
                  placeholder="Describe what this plan is for..."
                />
              </div>
            </div>
          </section>

          {/* Scope Configuration */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {selectedTemplate ? '3. Scope Configuration' : '2. Scope Configuration'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Scope Type *
                </label>
                <div className="space-y-2">
                  {SCOPE_TYPE_OPTIONS.map(option => (
                    <label key={option.value} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                      <input
                        type="radio"
                        name="scopeType"
                        value={option.value}
                        checked={formData.scopeType === option.value}
                        onChange={(e) => setFormData({ ...formData, scopeType: e.target.value as any })}
                        className="mt-1 h-4 w-4 text-indigo-600"
                      />
                      <div>
                        <div className="font-medium text-gray-900">{option.icon} {option.label}</div>
                        <div className="text-sm text-gray-500">{option.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {formData.scopeType !== 'workspace' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {formData.scopeType === 'service' ? 'Service ID' : 'Repository Full Name'} *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.scopeRef}
                    onChange={(e) => setFormData({ ...formData, scopeRef: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                    placeholder={formData.scopeType === 'service' ? 'e.g., payment-service' : 'e.g., myorg/payment-service'}
                  />
                </div>
              )}

              {formData.scopeType === 'repo' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Documentation Class (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.docClass}
                    onChange={(e) => setFormData({ ...formData, docClass: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="e.g., runbook, api-spec, deployment-guide"
                  />
                  <p className="text-xs text-gray-500 mt-1">Leave empty to apply to all documentation types</p>
                </div>
              )}
            </div>
          </section>

          {/* Input Sources */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {selectedTemplate ? '4. Input Sources' : '3. Input Sources'}
            </h2>
            <p className="text-gray-600 mb-4">Select which data sources trigger drift detection</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {INPUT_SOURCE_OPTIONS.map(option => (
                <label key={option.value} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.inputSources.includes(option.value)}
                    onChange={() => setFormData({
                      ...formData,
                      inputSources: toggleArrayValue(formData.inputSources, option.value),
                    })}
                    className="h-4 w-4 text-indigo-600 rounded"
                  />
                  <span className="font-medium text-gray-900">{option.icon} {option.label}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Drift Types */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {selectedTemplate ? '5. Drift Types' : '4. Drift Types'}
            </h2>
            <p className="text-gray-600 mb-4">Select which types of drift to detect</p>

            <div className="space-y-3">
              {DRIFT_TYPE_OPTIONS.map(option => (
                <label key={option.value} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.driftTypes.includes(option.value)}
                    onChange={() => setFormData({
                      ...formData,
                      driftTypes: toggleArrayValue(formData.driftTypes, option.value),
                    })}
                    className="mt-1 h-4 w-4 text-indigo-600 rounded"
                  />
                  <div>
                    <div className="font-medium text-gray-900">{option.icon} {option.label}</div>
                    <div className="text-sm text-gray-500">{option.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* Output Targets */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {selectedTemplate ? '6. Output Targets' : '5. Output Targets'}
            </h2>
            <p className="text-gray-600 mb-4">Select which documentation systems to update</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {OUTPUT_TARGET_OPTIONS.map(option => (
                <label key={option.value} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.allowedOutputs.includes(option.value)}
                    onChange={() => setFormData({
                      ...formData,
                      allowedOutputs: toggleArrayValue(formData.allowedOutputs, option.value),
                    })}
                    className="h-4 w-4 text-indigo-600 rounded"
                  />
                  <span className="font-medium text-gray-900">{option.icon} {option.label}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Priority 1: Cluster-First Triage */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {selectedTemplate ? '7. Cluster-First Triage' : '6. Cluster-First Triage'}
            </h2>
            <p className="text-gray-600 mb-4">
              Group similar drifts together to reduce notification fatigue by 80-90%
            </p>

            <label className="flex items-start gap-3 p-4 rounded-lg border-2 border-indigo-200 bg-indigo-50 cursor-pointer hover:bg-indigo-100 transition-colors">
              <input
                type="checkbox"
                checked={formData.enableClustering}
                onChange={(e) => setFormData({
                  ...formData,
                  enableClustering: e.target.checked,
                })}
                className="mt-1 h-5 w-5 text-indigo-600 rounded"
              />
              <div>
                <div className="font-semibold text-gray-900">🎯 Enable Cluster-First Triage</div>
                <div className="text-sm text-gray-700 mt-1">
                  When enabled, similar drifts are grouped together and sent as a single Slack notification with bulk actions (Approve All, Reject All, Review Individually).
                </div>
                <div className="text-sm text-indigo-700 mt-2 font-medium">
                  Expected impact: 50 individual notifications → 5-10 cluster notifications (80-90% reduction)
                </div>
              </div>
            </label>
          </section>

          {/* Priority 2: Budget Controls */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {selectedTemplate ? '8. Budget Controls' : '7. Budget Controls'}
            </h2>
            <p className="text-gray-600 mb-4">
              Set limits to prevent notification fatigue and control processing costs
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Drifts Per Day
                </label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={formData.maxDriftsPerDay}
                  onChange={(e) => setFormData({
                    ...formData,
                    maxDriftsPerDay: parseInt(e.target.value) || 50,
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Maximum number of drifts to process per day (default: 50)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Drifts Per Week
                </label>
                <input
                  type="number"
                  min="1"
                  max="2000"
                  value={formData.maxDriftsPerWeek}
                  onChange={(e) => setFormData({
                    ...formData,
                    maxDriftsPerWeek: parseInt(e.target.value) || 200,
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Maximum number of drifts to process per week (default: 200)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Slack Notifications Per Hour
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={formData.maxSlackNotificationsPerHour}
                  onChange={(e) => setFormData({
                    ...formData,
                    maxSlackNotificationsPerHour: parseInt(e.target.value) || 5,
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Maximum Slack notifications per hour (default: 5). Prevents notification spam.
                </p>
              </div>
            </div>
          </section>

          {/* Priority 4: Threshold Configuration */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {selectedTemplate ? '9. Threshold Configuration' : '8. Threshold Configuration'}
            </h2>
            <p className="text-gray-600 mb-4">
              Configure confidence thresholds for routing decisions
            </p>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    Auto-Approve Threshold
                  </label>
                  <span className="text-sm font-semibold text-indigo-600">{formData.autoApproveThreshold}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={formData.autoApproveThreshold}
                  onChange={(e) => setFormData({
                    ...formData,
                    autoApproveThreshold: parseInt(e.target.value),
                  })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Drifts with confidence ≥ {formData.autoApproveThreshold}% are automatically approved and written back (default: 98%)
                </p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    Slack Notify Threshold
                  </label>
                  <span className="text-sm font-semibold text-indigo-600">{formData.slackNotifyThreshold}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={formData.slackNotifyThreshold}
                  onChange={(e) => setFormData({
                    ...formData,
                    slackNotifyThreshold: parseInt(e.target.value),
                  })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Drifts with confidence ≥ {formData.slackNotifyThreshold}% send Slack notifications for human review (default: 40%)
                </p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    Digest-Only Threshold
                  </label>
                  <span className="text-sm font-semibold text-gray-600">{formData.digestOnlyThreshold}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={formData.digestOnlyThreshold}
                  onChange={(e) => setFormData({
                    ...formData,
                    digestOnlyThreshold: parseInt(e.target.value),
                  })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-600"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Drifts with confidence ≥ {formData.digestOnlyThreshold}% are included in daily digest (default: 30%)
                </p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    Ignore Threshold
                  </label>
                  <span className="text-sm font-semibold text-gray-400">{formData.ignoreThreshold}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={formData.ignoreThreshold}
                  onChange={(e) => setFormData({
                    ...formData,
                    ignoreThreshold: parseInt(e.target.value),
                  })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-400"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Drifts with confidence &lt; {formData.ignoreThreshold}% are ignored (default: 20%)
                </p>
              </div>
            </div>
          </section>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Link
              href={`/plans?workspace=${workspaceId}`}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving || !formData.name || formData.inputSources.length === 0 || formData.driftTypes.length === 0 || formData.allowedOutputs.length === 0}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Creating...' : 'Create Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function NewPlanPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading...</div>}>
      <NewPlanContent />
    </Suspense>
  );
}

