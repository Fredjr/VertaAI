'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Drift type display names
const DRIFT_TYPE_LABELS: Record<string, { label: string; description: string; icon: string }> = {
  instruction: { label: 'Instruction Drift', description: 'Commands, configs, URLs changed', icon: '📝' },
  process: { label: 'Process Drift', description: 'Sequence/order of steps changed', icon: '🔄' },
  ownership: { label: 'Ownership Drift', description: 'Team/owner/contact changed', icon: '👤' },
  coverage: { label: 'Coverage Drift', description: 'Missing scenarios/edge cases', icon: '📊' },
  environment_tooling: { label: 'Environment Drift', description: 'Platform/tooling/infrastructure changed', icon: '🔧' },
};

// Input source display names
const INPUT_SOURCE_LABELS: Record<string, { label: string; icon: string }> = {
  github_pr: { label: 'GitHub Pull Requests', icon: '🔀' },
  pagerduty_incident: { label: 'PagerDuty Incidents', icon: '🚨' },
  slack_cluster: { label: 'Slack Questions', icon: '💬' },
  datadog_alert: { label: 'Datadog/Grafana Alerts', icon: '📊' },
  github_iac: { label: 'Terraform/Pulumi Changes', icon: '🏗️' },
};

// Output target display names
const OUTPUT_TARGET_LABELS: Record<string, { label: string; icon: string }> = {
  confluence: { label: 'Confluence', icon: '📄' },
  notion: { label: 'Notion', icon: '📔' },
  github_readme: { label: 'README.md', icon: '📖' },
  github_swagger: { label: 'Swagger/OpenAPI', icon: '🔌' },
  backstage: { label: 'Backstage Catalog', icon: '🎭' },
  github_code_comments: { label: 'Code Comments', icon: '💻' },
  gitbook: { label: 'GitBook', icon: '📚' },
};

interface WorkflowPreferences {
  enabledDriftTypes: string[];
  enabledInputSources: string[];
  enabledOutputTargets: string[];
  outputTargetPriority: string[];
}

interface SettingsData {
  workspace: { id: string; name: string; slug: string };
  workflowPreferences: WorkflowPreferences;
  ownershipSourceRanking: string[];
  confidenceThresholds: { high: number; medium: number };
  availableOptions: {
    driftTypes: string[];
    inputSources: string[];
    outputTargets: string[];
  };
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace');
  
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    
    fetch(`${API_URL}/api/workspaces/${workspaceId}/settings`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setSettings(data);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [workspaceId]);

  const toggleDriftType = (type: string) => {
    if (!settings) return;
    const current = settings.workflowPreferences.enabledDriftTypes;
    const updated = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    setSettings({
      ...settings,
      workflowPreferences: { ...settings.workflowPreferences, enabledDriftTypes: updated },
    });
  };

  const toggleInputSource = (source: string) => {
    if (!settings) return;
    const current = settings.workflowPreferences.enabledInputSources;
    const updated = current.includes(source)
      ? current.filter(s => s !== source)
      : [...current, source];
    setSettings({
      ...settings,
      workflowPreferences: { ...settings.workflowPreferences, enabledInputSources: updated },
    });
  };

  const toggleOutputTarget = (target: string) => {
    if (!settings) return;
    const current = settings.workflowPreferences.enabledOutputTargets;
    const updated = current.includes(target)
      ? current.filter(t => t !== target)
      : [...current, target];
    setSettings({
      ...settings,
      workflowPreferences: { ...settings.workflowPreferences, enabledOutputTargets: updated },
    });
  };

  const saveSettings = async () => {
    if (!workspaceId || !settings) return;
    
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowPreferences: settings.workflowPreferences,
          confidenceThresholds: settings.confidenceThresholds,
        }),
      });
      
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setSuccessMessage('Settings saved successfully!');
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
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
        <div className="text-gray-600">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">⚙️ Workflow Settings</h1>
          <p className="mt-2 text-gray-600">
            {settings?.workspace.name} • Advanced configuration for power users
          </p>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
            {successMessage}
          </div>
        )}

        {settings && (
          <div className="space-y-8">
            {/* Drift Types Section */}
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">📋 Enabled Drift Types</h2>
              <p className="text-gray-600 mb-4">Select which types of documentation drift to detect</p>
              <div className="space-y-3">
                {settings.availableOptions.driftTypes.map(type => {
                  const info = DRIFT_TYPE_LABELS[type] || { label: type, description: '', icon: '📌' };
                  const enabled = settings.workflowPreferences.enabledDriftTypes.includes(type);
                  return (
                    <label key={type} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => toggleDriftType(type)}
                        className="mt-1 h-4 w-4 text-indigo-600 rounded border-gray-300"
                      />
                      <div>
                        <div className="font-medium text-gray-900">{info.icon} {info.label}</div>
                        <div className="text-sm text-gray-500">{info.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>

            {/* Input Sources Section */}
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">📥 Input Sources</h2>
              <p className="text-gray-600 mb-4">Select which data sources trigger drift detection</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {settings.availableOptions.inputSources.map(source => {
                  const info = INPUT_SOURCE_LABELS[source] || { label: source, icon: '📌' };
                  const enabled = settings.workflowPreferences.enabledInputSources.includes(source);
                  return (
                    <label key={source} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => toggleInputSource(source)}
                        className="h-4 w-4 text-indigo-600 rounded border-gray-300"
                      />
                      <span className="font-medium text-gray-900">{info.icon} {info.label}</span>
                    </label>
                  );
                })}
              </div>
            </section>

            {/* Output Targets Section */}
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">📤 Output Targets</h2>
              <p className="text-gray-600 mb-4">Select which documentation systems to update</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {settings.availableOptions.outputTargets.map(target => {
                  const info = OUTPUT_TARGET_LABELS[target] || { label: target, icon: '📌' };
                  const enabled = settings.workflowPreferences.enabledOutputTargets.includes(target);
                  return (
                    <label key={target} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => toggleOutputTarget(target)}
                        className="h-4 w-4 text-indigo-600 rounded border-gray-300"
                      />
                      <span className="font-medium text-gray-900">{info.icon} {info.label}</span>
                    </label>
                  );
                })}
              </div>
            </section>

            {/* Confidence Thresholds Section */}
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">🎯 Confidence Thresholds</h2>
              <p className="text-gray-600 mb-4">Adjust when drift candidates are auto-approved or require review</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    High Confidence Threshold: {Math.round(settings.confidenceThresholds.high * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="1"
                    step="0.05"
                    value={settings.confidenceThresholds.high}
                    onChange={(e) => setSettings({
                      ...settings,
                      confidenceThresholds: { ...settings.confidenceThresholds, high: parseFloat(e.target.value) },
                    })}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">Above this: auto-approve patches</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Medium Confidence Threshold: {Math.round(settings.confidenceThresholds.medium * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0.3"
                    max="0.7"
                    step="0.05"
                    value={settings.confidenceThresholds.medium}
                    onChange={(e) => setSettings({
                      ...settings,
                      confidenceThresholds: { ...settings.confidenceThresholds, medium: parseFloat(e.target.value) },
                    })}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">Above this: send to Slack for review</p>
                </div>
              </div>
            </section>

            {/* Save Button */}
            <div className="flex justify-end gap-4">
              <a
                href={`/onboarding?workspace=${workspaceId}`}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ← Back to Onboarding
              </a>
              <button
                onClick={saveSettings}
                disabled={saving}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading...</div>}>
      <SettingsContent />
    </Suspense>
  );
}

