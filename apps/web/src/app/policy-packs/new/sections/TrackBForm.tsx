'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';

interface TrackBFormProps {
  formData: any;
  setFormData: (data: any) => void;
}

export default function TrackBForm({ formData, setFormData }: TrackBFormProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    materiality: false,
    docTargeting: false,
    noiseControls: false,
    budgets: false,
    writeback: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections({
      ...expandedSections,
      [section]: !expandedSections[section],
    });
  };

  const trackBConfig = formData.trackBConfig || {};

  const updateTrackBConfig = (updates: any) => {
    setFormData({
      ...formData,
      trackBConfig: {
        ...trackBConfig,
        ...updates,
      },
    });
  };

  const SectionHeader = ({ title, section }: { title: string; section: string }) => (
    <button
      type="button"
      onClick={() => toggleSection(section)}
      className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600"
    >
      <span className="text-lg font-medium text-gray-900 dark:text-white">{title}</span>
      {expandedSections[section] ? (
        <ChevronUp className="h-5 w-5 text-gray-500" />
      ) : (
        <ChevronDown className="h-5 w-5 text-gray-500" />
      )}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Enable Track B */}
      <div className="flex items-center justify-between p-4 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Track B: Drift Remediation
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Automatically detect and remediate documentation drift
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.trackBEnabled}
            onChange={(e) => setFormData({ ...formData, trackBEnabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 dark:peer-focus:ring-cyan-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-cyan-600"></div>
        </label>
      </div>

      {!formData.trackBEnabled && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Enable Track B to configure drift remediation settings
        </div>
      )}

      {formData.trackBEnabled && (
        <>
          {/* Basic Configuration */}
          <div className="space-y-4">
            <SectionHeader title="Basic Configuration" section="basic" />
            {expandedSections.basic && (
              <div className="p-4 space-y-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                {/* Primary Doc Class */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Primary Document Class
                  </label>
                  <select
                    value={trackBConfig.primaryDoc?.class || 'runbook'}
                    onChange={(e) => updateTrackBConfig({
                      primaryDoc: { ...trackBConfig.primaryDoc, class: e.target.value }
                    })}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                  >
                    <option value="runbook">Runbook</option>
                    <option value="architecture">Architecture</option>
                    <option value="api_docs">API Documentation</option>
                    <option value="onboarding">Onboarding Guide</option>
                  </select>
                </div>

                {/* Input Sources */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Input Sources
                  </label>
                  <div className="space-y-2">
                    {['github_pr', 'pagerduty_incident', 'slack_cluster', 'datadog_alert', 'grafana_alert'].map((source) => (
                      <label key={source} className="flex items-center p-2 border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700">
                        <input
                          type="checkbox"
                          checked={(trackBConfig.inputSources || []).includes(source)}
                          onChange={(e) => {
                            const sources = trackBConfig.inputSources || [];
                            updateTrackBConfig({
                              inputSources: e.target.checked
                                ? [...sources, source]
                                : sources.filter((s: string) => s !== source),
                            });
                          }}
                          className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 capitalize">
                          {source.replace('_', ' ')}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Drift Types */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Drift Types to Detect
                  </label>
                  <div className="space-y-2">
                    {['instruction', 'process', 'ownership', 'coverage', 'environment_tooling'].map((type) => (
                      <label key={type} className="flex items-center p-2 border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700">
                        <input
                          type="checkbox"
                          checked={(trackBConfig.driftTypes || []).includes(type)}
                          onChange={(e) => {
                            const types = trackBConfig.driftTypes || [];
                            updateTrackBConfig({
                              driftTypes: e.target.checked
                                ? [...types, type]
                                : types.filter((t: string) => t !== type),
                            });
                          }}
                          className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 capitalize">
                          {type.replace('_', ' ')}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Materiality Thresholds */}
          <div className="space-y-4">
            <SectionHeader title="Materiality Thresholds" section="materiality" />
            {expandedSections.materiality && (
              <div className="p-4 space-y-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Configure confidence thresholds for automatic approval, Slack notifications, and digest inclusion
                </p>

                <div className="space-y-4">
                  {/* Auto-Approve Threshold */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Auto-Approve Threshold
                      </label>
                      <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                        {trackBConfig.materiality?.autoApprove || 0.98}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={trackBConfig.materiality?.autoApprove || 0.98}
                      onChange={(e) => updateTrackBConfig({
                        materiality: {
                          ...trackBConfig.materiality,
                          autoApprove: parseFloat(e.target.value),
                        },
                      })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Auto-approve drift if confidence ≥ this threshold (default: 0.98)
                    </p>
                  </div>

                  {/* Slack Notify Threshold */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Slack Notify Threshold
                      </label>
                      <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                        {trackBConfig.materiality?.slackNotify || 0.40}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={trackBConfig.materiality?.slackNotify || 0.40}
                      onChange={(e) => updateTrackBConfig({
                        materiality: {
                          ...trackBConfig.materiality,
                          slackNotify: parseFloat(e.target.value),
                        },
                      })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Send Slack notification if confidence ≥ this threshold (default: 0.40)
                    </p>
                  </div>

                  {/* Digest Only Threshold */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Digest Only Threshold
                      </label>
                      <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                        {trackBConfig.materiality?.digestOnly || 0.30}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={trackBConfig.materiality?.digestOnly || 0.30}
                      onChange={(e) => updateTrackBConfig({
                        materiality: {
                          ...trackBConfig.materiality,
                          digestOnly: parseFloat(e.target.value),
                        },
                      })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Include in digest if confidence ≥ this threshold (default: 0.30)
                    </p>
                  </div>

                  {/* Ignore Threshold */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Ignore Threshold
                      </label>
                      <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                        {trackBConfig.materiality?.ignore || 0.20}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={trackBConfig.materiality?.ignore || 0.20}
                      onChange={(e) => updateTrackBConfig({
                        materiality: {
                          ...trackBConfig.materiality,
                          ignore: parseFloat(e.target.value),
                        },
                      })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Ignore drift if confidence &lt; this threshold (default: 0.20)
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Doc Targeting */}
          <div className="space-y-4">
            <SectionHeader title="Doc Targeting Configuration" section="docTargeting" />
            {expandedSections.docTargeting && (
              <div className="p-4 space-y-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Configure how drift updates are targeted to documentation
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Strategy
                    </label>
                    <select
                      value={trackBConfig.docTargeting?.strategy || 'primary_first'}
                      onChange={(e) => updateTrackBConfig({
                        docTargeting: {
                          ...trackBConfig.docTargeting,
                          strategy: e.target.value,
                        },
                      })}
                      className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    >
                      <option value="primary_first">Primary First</option>
                      <option value="all_parallel">All Parallel</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Max Docs Per Drift
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={trackBConfig.docTargeting?.maxDocsPerDrift || 3}
                      onChange={(e) => updateTrackBConfig({
                        docTargeting: {
                          ...trackBConfig.docTargeting,
                          maxDocsPerDrift: parseInt(e.target.value),
                        },
                      })}
                      className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Priority Order (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={(trackBConfig.docTargeting?.priorityOrder || ['confluence', 'notion', 'github_readme']).join(', ')}
                    onChange={(e) => updateTrackBConfig({
                      docTargeting: {
                        ...trackBConfig.docTargeting,
                        priorityOrder: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean),
                      },
                    })}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    placeholder="confluence, notion, github_readme"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Noise Controls */}
          <div className="space-y-4">
            <SectionHeader title="Noise Controls" section="noiseControls" />
            {expandedSections.noiseControls && (
              <div className="p-4 space-y-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Filter out noise and reduce false positives
                </p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ignore Patterns (one per line)
                  </label>
                  <textarea
                    rows={4}
                    value={(trackBConfig.noiseControls?.ignorePatterns || ['WIP:', 'draft:', 'test:']).join('\n')}
                    onChange={(e) => updateTrackBConfig({
                      noiseControls: {
                        ...trackBConfig.noiseControls,
                        ignorePatterns: e.target.value.split('\n').filter(Boolean),
                      },
                    })}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white sm:text-sm font-mono"
                    placeholder="WIP:&#10;draft:&#10;test:"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ignore Paths (one per line)
                  </label>
                  <textarea
                    rows={4}
                    value={(trackBConfig.noiseControls?.ignorePaths || ['test/**', 'docs/archive/**']).join('\n')}
                    onChange={(e) => updateTrackBConfig({
                      noiseControls: {
                        ...trackBConfig.noiseControls,
                        ignorePaths: e.target.value.split('\n').filter(Boolean),
                      },
                    })}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white sm:text-sm font-mono"
                    placeholder="test/**&#10;docs/archive/**"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ignore Authors (one per line)
                  </label>
                  <textarea
                    rows={3}
                    value={(trackBConfig.noiseControls?.ignoreAuthors || ['dependabot', 'renovate']).join('\n')}
                    onChange={(e) => updateTrackBConfig({
                      noiseControls: {
                        ...trackBConfig.noiseControls,
                        ignoreAuthors: e.target.value.split('\n').filter(Boolean),
                      },
                    })}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white sm:text-sm font-mono"
                    placeholder="dependabot&#10;renovate"
                  />
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Temporal Accumulation
                  </label>
                  <div className="space-y-3">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={trackBConfig.noiseControls?.temporalAccumulation?.enabled !== false}
                        onChange={(e) => updateTrackBConfig({
                          noiseControls: {
                            ...trackBConfig.noiseControls,
                            temporalAccumulation: {
                              ...trackBConfig.noiseControls?.temporalAccumulation,
                              enabled: e.target.checked,
                            },
                          },
                        })}
                        className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                        Enable temporal accumulation (bundle related drifts over time)
                      </span>
                    </label>

                    {trackBConfig.noiseControls?.temporalAccumulation?.enabled !== false && (
                      <div className="grid grid-cols-2 gap-4 ml-6">
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400">Window (days)</label>
                          <input
                            type="number"
                            min="1"
                            max="30"
                            value={trackBConfig.noiseControls?.temporalAccumulation?.windowDays || 7}
                            onChange={(e) => updateTrackBConfig({
                              noiseControls: {
                                ...trackBConfig.noiseControls,
                                temporalAccumulation: {
                                  ...trackBConfig.noiseControls?.temporalAccumulation,
                                  windowDays: parseInt(e.target.value),
                                },
                              },
                            })}
                            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400">Min Drifts to Bundle</label>
                          <input
                            type="number"
                            min="2"
                            max="20"
                            value={trackBConfig.noiseControls?.temporalAccumulation?.minDriftsToBundle || 3}
                            onChange={(e) => updateTrackBConfig({
                              noiseControls: {
                                ...trackBConfig.noiseControls,
                                temporalAccumulation: {
                                  ...trackBConfig.noiseControls?.temporalAccumulation,
                                  minDriftsToBundle: parseInt(e.target.value),
                                },
                              },
                            })}
                            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Budgets */}
          <div className="space-y-4">
            <SectionHeader title="Budgets & Rate Limits" section="budgets" />
            {expandedSections.budgets && (
              <div className="p-4 space-y-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Configure rate limits to prevent overwhelming teams with drift notifications
                </p>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Max Drifts Per Day
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={trackBConfig.budgets?.maxDriftsPerDay || 50}
                      onChange={(e) => updateTrackBConfig({
                        budgets: {
                          ...trackBConfig.budgets,
                          maxDriftsPerDay: parseInt(e.target.value),
                        },
                      })}
                      className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Max Drifts Per Week
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="2000"
                      value={trackBConfig.budgets?.maxDriftsPerWeek || 200}
                      onChange={(e) => updateTrackBConfig({
                        budgets: {
                          ...trackBConfig.budgets,
                          maxDriftsPerWeek: parseInt(e.target.value),
                        },
                      })}
                      className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Max Slack Notifications/Hour
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={trackBConfig.budgets?.maxSlackNotificationsPerHour || 5}
                      onChange={(e) => updateTrackBConfig({
                        budgets: {
                          ...trackBConfig.budgets,
                          maxSlackNotificationsPerHour: parseInt(e.target.value),
                        },
                      })}
                      className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Writeback Configuration */}
          <div className="space-y-4">
            <SectionHeader title="Writeback Configuration" section="writeback" />
            {expandedSections.writeback && (
              <div className="p-4 space-y-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Configure how drift updates are written back to documentation
                </p>

                <div>
                  <label className="flex items-center p-3 border border-gray-200 dark:border-gray-600 rounded-md">
                    <input
                      type="checkbox"
                      checked={trackBConfig.writeback?.enabled !== false}
                      onChange={(e) => updateTrackBConfig({
                        writeback: {
                          ...trackBConfig.writeback,
                          enabled: e.target.checked,
                        },
                      })}
                      className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                      Enable automatic writeback to documentation
                    </span>
                  </label>
                </div>

                {trackBConfig.writeback?.enabled !== false && (
                  <>
                    <div>
                      <label className="flex items-center p-3 border border-gray-200 dark:border-gray-600 rounded-md">
                        <input
                          type="checkbox"
                          checked={trackBConfig.writeback?.requiresApproval !== false}
                          onChange={(e) => updateTrackBConfig({
                            writeback: {
                              ...trackBConfig.writeback,
                              requiresApproval: e.target.checked,
                            },
                          })}
                          className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                          Require approval before writeback
                        </span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Target System
                      </label>
                      <select
                        value={trackBConfig.writeback?.targetSystem || 'confluence'}
                        onChange={(e) => updateTrackBConfig({
                          writeback: {
                            ...trackBConfig.writeback,
                            targetSystem: e.target.value,
                          },
                        })}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                      >
                        <option value="confluence">Confluence</option>
                        <option value="notion">Notion</option>
                        <option value="github_readme">GitHub README</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
