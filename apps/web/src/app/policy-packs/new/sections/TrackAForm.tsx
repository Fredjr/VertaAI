'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, X, Trash2 } from 'lucide-react';

interface TrackAFormProps {
  formData: any;
  setFormData: (data: any) => void;
}

export default function TrackAForm({ formData, setFormData }: TrackAFormProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    contracts: false,
    dictionaries: false,
    extraction: false,
    safety: false,
    policy: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections({
      ...expandedSections,
      [section]: !expandedSections[section],
    });
  };

  const trackAConfig = formData.trackAConfig || {};

  const updateTrackAConfig = (updates: any) => {
    setFormData({
      ...formData,
      trackAConfig: {
        ...trackAConfig,
        ...updates,
      },
    });
  };

  // Contract management
  const addContract = () => {
    const contracts = trackAConfig.contracts || [];
    updateTrackAConfig({
      contracts: [
        ...contracts,
        {
          contractId: `contract-${Date.now()}`,
          name: '',
          description: '',
          scope: {},
          artifacts: [],
          invariants: [],
          enforcement: {
            blockPR: false,
            requireApproval: false,
            notifyChannels: [],
            gracePeriodHours: 0,
          },
          routing: {},
          writeback: {},
        },
      ],
    });
  };

  const removeContract = (index: number) => {
    const contracts = trackAConfig.contracts || [];
    updateTrackAConfig({
      contracts: contracts.filter((_: any, i: number) => i !== index),
    });
  };

  const updateContract = (index: number, updates: any) => {
    const contracts = trackAConfig.contracts || [];
    const updated = [...contracts];
    updated[index] = { ...updated[index], ...updates };
    updateTrackAConfig({ contracts: updated });
  };

  // Artifact management
  const addArtifact = (contractIndex: number) => {
    const contracts = trackAConfig.contracts || [];
    const contract = contracts[contractIndex];
    const artifacts = contract.artifacts || [];
    updateContract(contractIndex, {
      artifacts: [
        ...artifacts,
        {
          system: 'github',
          type: 'openapi_spec',
          locator: {},
          role: 'primary',
          required: true,
          freshnessSlaHours: 24,
        },
      ],
    });
  };

  const removeArtifact = (contractIndex: number, artifactIndex: number) => {
    const contracts = trackAConfig.contracts || [];
    const contract = contracts[contractIndex];
    const artifacts = contract.artifacts || [];
    updateContract(contractIndex, {
      artifacts: artifacts.filter((_: any, i: number) => i !== artifactIndex),
    });
  };

  const updateArtifact = (contractIndex: number, artifactIndex: number, updates: any) => {
    const contracts = trackAConfig.contracts || [];
    const contract = contracts[contractIndex];
    const artifacts = contract.artifacts || [];
    const updated = [...artifacts];
    updated[artifactIndex] = { ...updated[artifactIndex], ...updates };
    updateContract(contractIndex, { artifacts: updated });
  };

  // Invariant management
  const addInvariant = (contractIndex: number) => {
    const contracts = trackAConfig.contracts || [];
    const contract = contracts[contractIndex];
    const invariants = contract.invariants || [];
    updateContract(contractIndex, {
      invariants: [
        ...invariants,
        {
          invariantId: `invariant-${Date.now()}`,
          name: '',
          description: '',
          enabled: true,
          severity: 'medium',
          comparatorType: '',
          config: {},
        },
      ],
    });
  };

  const removeInvariant = (contractIndex: number, invariantIndex: number) => {
    const contracts = trackAConfig.contracts || [];
    const contract = contracts[contractIndex];
    const invariants = contract.invariants || [];
    updateContract(contractIndex, {
      invariants: invariants.filter((_: any, i: number) => i !== invariantIndex),
    });
  };

  const updateInvariant = (contractIndex: number, invariantIndex: number, updates: any) => {
    const contracts = trackAConfig.contracts || [];
    const contract = contracts[contractIndex];
    const invariants = contract.invariants || [];
    const updated = [...invariants];
    updated[invariantIndex] = { ...updated[invariantIndex], ...updates };
    updateContract(contractIndex, { invariants: updated });
  };

  const SectionHeader = ({ title, section, count }: { title: string; section: string; count?: number }) => (
    <button
      type="button"
      onClick={() => toggleSection(section)}
      className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600"
    >
      <div className="flex items-center gap-2">
        <span className="text-lg font-medium text-gray-900 dark:text-white">{title}</span>
        {count !== undefined && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            {count}
          </span>
        )}
      </div>
      {expandedSections[section] ? (
        <ChevronUp className="h-5 w-5 text-gray-500" />
      ) : (
        <ChevronDown className="h-5 w-5 text-gray-500" />
      )}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Enable Track A */}
      <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Track A: Contract Integrity Gate
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Enforce contract integrity across API specs, infrastructure, and documentation
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.trackAEnabled}
            onChange={(e) => setFormData({ ...formData, trackAEnabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
        </label>
      </div>

      {!formData.trackAEnabled && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Enable Track A to configure contract integrity settings
        </div>
      )}

      {formData.trackAEnabled && (
        <>
          {/* Basic Configuration */}
          <div className="space-y-4">
            <SectionHeader title="Basic Configuration" section="basic" />
            {expandedSections.basic && (
              <div className="p-4 space-y-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                {/* Surfaces */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Surfaces (Contract Types)
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    Select which types of contracts to enforce
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {['api', 'infra', 'docs', 'data_model', 'observability', 'security'].map((surface) => (
                      <label key={surface} className="flex items-center p-2 border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700">
                        <input
                          type="checkbox"
                          checked={(trackAConfig.surfaces || []).includes(surface)}
                          onChange={(e) => {
                            const surfaces = trackAConfig.surfaces || [];
                            updateTrackAConfig({
                              surfaces: e.target.checked
                                ? [...surfaces, surface]
                                : surfaces.filter((s: string) => s !== surface),
                            });
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 capitalize">
                          {surface.replace('_', ' ')}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Contracts */}
          <div className="space-y-4">
            <SectionHeader title="Contracts" section="contracts" count={(trackAConfig.contracts || []).length} />
            {expandedSections.contracts && (
              <div className="p-4 space-y-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <button
                  type="button"
                  onClick={addContract}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contract
                </button>

                {(trackAConfig.contracts || []).map((contract: any, contractIndex: number) => (
                  <div key={contractIndex} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                        Contract #{contractIndex + 1}
                      </h4>
                      <button
                        type="button"
                        onClick={() => removeContract(contractIndex)}
                        className="text-red-600 hover:text-red-700 dark:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Contract ID */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Contract ID *
                      </label>
                      <input
                        type="text"
                        value={contract.contractId || ''}
                        onChange={(e) => updateContract(contractIndex, { contractId: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-600 dark:text-white sm:text-sm"
                        placeholder="e.g., api-openapi-contract"
                      />
                    </div>

                    {/* Contract Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Name *
                      </label>
                      <input
                        type="text"
                        value={contract.name || ''}
                        onChange={(e) => updateContract(contractIndex, { name: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-600 dark:text-white sm:text-sm"
                        placeholder="e.g., API Documentation Contract"
                      />
                    </div>

                    {/* Contract Description */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Description
                      </label>
                      <textarea
                        rows={2}
                        value={contract.description || ''}
                        onChange={(e) => updateContract(contractIndex, { description: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-600 dark:text-white sm:text-sm"
                        placeholder="Describe what this contract enforces..."
                      />
                    </div>

                    {/* Artifacts Section */}
                    <div className="border-t border-gray-300 dark:border-gray-600 pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Artifacts ({(contract.artifacts || []).length})
                        </label>
                        <button
                          type="button"
                          onClick={() => addArtifact(contractIndex)}
                          className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Artifact
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        Define the artifacts (OpenAPI specs, Terraform files, etc.) that this contract monitors
                      </p>
                      {(contract.artifacts || []).map((artifact: any, artifactIndex: number) => (
                        <div key={artifactIndex} className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600 mb-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Artifact #{artifactIndex + 1}</span>
                            <button
                              type="button"
                              onClick={() => removeArtifact(contractIndex, artifactIndex)}
                              className="text-red-600 hover:text-red-700 dark:text-red-400"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <label className="block text-gray-700 dark:text-gray-300">System</label>
                              <select
                                value={artifact.system || 'github'}
                                onChange={(e) => updateArtifact(contractIndex, artifactIndex, { system: e.target.value })}
                                className="mt-1 block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs"
                              >
                                <option value="github">GitHub</option>
                                <option value="confluence">Confluence</option>
                                <option value="notion">Notion</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-gray-700 dark:text-gray-300">Type</label>
                              <select
                                value={artifact.type || 'openapi_spec'}
                                onChange={(e) => updateArtifact(contractIndex, artifactIndex, { type: e.target.value })}
                                className="mt-1 block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs"
                              >
                                <option value="openapi_spec">OpenAPI Spec</option>
                                <option value="terraform_plan">Terraform Plan</option>
                                <option value="github_readme">GitHub README</option>
                                <option value="confluence_page">Confluence Page</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-gray-700 dark:text-gray-300">Role</label>
                              <select
                                value={artifact.role || 'primary'}
                                onChange={(e) => updateArtifact(contractIndex, artifactIndex, { role: e.target.value })}
                                className="mt-1 block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs"
                              >
                                <option value="primary">Primary</option>
                                <option value="secondary">Secondary</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-gray-700 dark:text-gray-300">Freshness SLA (hours)</label>
                              <input
                                type="number"
                                value={artifact.freshnessSlaHours || 24}
                                onChange={(e) => updateArtifact(contractIndex, artifactIndex, { freshnessSlaHours: parseInt(e.target.value) })}
                                className="mt-1 block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={artifact.required || false}
                                  onChange={(e) => updateArtifact(contractIndex, artifactIndex, { required: e.target.checked })}
                                  className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                                <span className="ml-2 text-gray-700 dark:text-gray-300">Required artifact</span>
                              </label>
                            </div>
                          </div>

                          {/* Artifact Locator Details */}
                          <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded">
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Locator Details
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              {artifact.system === 'github' && (
                                <>
                                  <div>
                                    <label className="block text-gray-700 dark:text-gray-300 text-xs">Repository</label>
                                    <input
                                      type="text"
                                      value={artifact.locator?.repo || ''}
                                      onChange={(e) => updateArtifact(contractIndex, artifactIndex, {
                                        locator: { ...artifact.locator, repo: e.target.value }
                                      })}
                                      className="mt-1 block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-xs"
                                      placeholder="e.g., owner/repo"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-gray-700 dark:text-gray-300 text-xs">Path</label>
                                    <input
                                      type="text"
                                      value={artifact.locator?.path || ''}
                                      onChange={(e) => updateArtifact(contractIndex, artifactIndex, {
                                        locator: { ...artifact.locator, path: e.target.value }
                                      })}
                                      className="mt-1 block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-xs"
                                      placeholder="e.g., docs/openapi.yaml"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-gray-700 dark:text-gray-300 text-xs">Ref (branch/tag)</label>
                                    <input
                                      type="text"
                                      value={artifact.locator?.ref || ''}
                                      onChange={(e) => updateArtifact(contractIndex, artifactIndex, {
                                        locator: { ...artifact.locator, ref: e.target.value }
                                      })}
                                      className="mt-1 block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-xs"
                                      placeholder="e.g., main"
                                    />
                                  </div>
                                </>
                              )}
                              {artifact.system === 'confluence' && (
                                <>
                                  <div>
                                    <label className="block text-gray-700 dark:text-gray-300 text-xs">Page ID</label>
                                    <input
                                      type="text"
                                      value={artifact.locator?.pageId || ''}
                                      onChange={(e) => updateArtifact(contractIndex, artifactIndex, {
                                        locator: { ...artifact.locator, pageId: e.target.value }
                                      })}
                                      className="mt-1 block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-xs"
                                      placeholder="e.g., 123456789"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-gray-700 dark:text-gray-300 text-xs">Space Key</label>
                                    <input
                                      type="text"
                                      value={artifact.locator?.spaceKey || ''}
                                      onChange={(e) => updateArtifact(contractIndex, artifactIndex, {
                                        locator: { ...artifact.locator, spaceKey: e.target.value }
                                      })}
                                      className="mt-1 block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-xs"
                                      placeholder="e.g., PLATFORM"
                                    />
                                  </div>
                                </>
                              )}
                              {artifact.system === 'notion' && (
                                <>
                                  <div>
                                    <label className="block text-gray-700 dark:text-gray-300 text-xs">Page ID</label>
                                    <input
                                      type="text"
                                      value={artifact.locator?.pageId || ''}
                                      onChange={(e) => updateArtifact(contractIndex, artifactIndex, {
                                        locator: { ...artifact.locator, pageId: e.target.value }
                                      })}
                                      className="mt-1 block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-xs"
                                      placeholder="e.g., abc123def456"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-gray-700 dark:text-gray-300 text-xs">Database ID</label>
                                    <input
                                      type="text"
                                      value={artifact.locator?.databaseId || ''}
                                      onChange={(e) => updateArtifact(contractIndex, artifactIndex, {
                                        locator: { ...artifact.locator, databaseId: e.target.value }
                                      })}
                                      className="mt-1 block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-xs"
                                      placeholder="e.g., xyz789"
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Invariants Section */}
                    <div className="border-t border-gray-300 dark:border-gray-600 pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Invariants ({(contract.invariants || []).length})
                        </label>
                        <button
                          type="button"
                          onClick={() => addInvariant(contractIndex)}
                          className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Invariant
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        Define the invariants (rules) that must hold true across artifacts
                      </p>
                      {(contract.invariants || []).map((invariant: any, invariantIndex: number) => (
                        <div key={invariantIndex} className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600 mb-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Invariant #{invariantIndex + 1}</span>
                            <button
                              type="button"
                              onClick={() => removeInvariant(contractIndex, invariantIndex)}
                              className="text-red-600 hover:text-red-700 dark:text-red-400"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div>
                              <label className="block text-gray-700 dark:text-gray-300">Invariant ID</label>
                              <input
                                type="text"
                                value={invariant.invariantId || ''}
                                onChange={(e) => updateInvariant(contractIndex, invariantIndex, { invariantId: e.target.value })}
                                className="mt-1 block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs"
                                placeholder="e.g., endpoint-parity"
                              />
                            </div>
                            <div>
                              <label className="block text-gray-700 dark:text-gray-300">Name</label>
                              <input
                                type="text"
                                value={invariant.name || ''}
                                onChange={(e) => updateInvariant(contractIndex, invariantIndex, { name: e.target.value })}
                                className="mt-1 block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs"
                                placeholder="e.g., Endpoint Parity"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-gray-700 dark:text-gray-300">Severity</label>
                                <select
                                  value={invariant.severity || 'medium'}
                                  onChange={(e) => updateInvariant(contractIndex, invariantIndex, { severity: e.target.value })}
                                  className="mt-1 block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs"
                                >
                                  <option value="low">Low</option>
                                  <option value="medium">Medium</option>
                                  <option value="high">High</option>
                                  <option value="critical">Critical</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-gray-700 dark:text-gray-300">Comparator Type</label>
                                <input
                                  type="text"
                                  value={invariant.comparatorType || ''}
                                  onChange={(e) => updateInvariant(contractIndex, invariantIndex, { comparatorType: e.target.value })}
                                  className="mt-1 block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs"
                                  placeholder="e.g., openapi_docs_endpoint_parity"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="flex items-center mb-1">
                                <input
                                  type="checkbox"
                                  checked={invariant.enabled !== false}
                                  onChange={(e) => updateInvariant(contractIndex, invariantIndex, { enabled: e.target.checked })}
                                  className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                                <span className="ml-2 text-gray-700 dark:text-gray-300">Enabled</span>
                              </label>
                            </div>
                            <div>
                              <label className="block text-gray-700 dark:text-gray-300 mb-1">Config (JSON)</label>
                              <textarea
                                rows={3}
                                value={typeof invariant.config === 'object' ? JSON.stringify(invariant.config, null, 2) : invariant.config || '{}'}
                                onChange={(e) => {
                                  try {
                                    const parsed = JSON.parse(e.target.value);
                                    updateInvariant(contractIndex, invariantIndex, { config: parsed });
                                  } catch {
                                    // Allow invalid JSON while typing
                                    updateInvariant(contractIndex, invariantIndex, { config: e.target.value });
                                  }
                                }}
                                className="mt-1 block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs font-mono"
                                placeholder='{"threshold": 0.95, "ignoreFields": []}'
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Enforcement Settings */}
                    <div className="border-t border-gray-300 dark:border-gray-600 pt-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Enforcement Settings
                      </label>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <label className="flex items-center p-2 border border-gray-200 dark:border-gray-600 rounded">
                          <input
                            type="checkbox"
                            checked={contract.enforcement?.blockPR || false}
                            onChange={(e) => updateContract(contractIndex, {
                              enforcement: { ...contract.enforcement, blockPR: e.target.checked }
                            })}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-gray-700 dark:text-gray-300">Block PR on violation</span>
                        </label>
                        <label className="flex items-center p-2 border border-gray-200 dark:border-gray-600 rounded">
                          <input
                            type="checkbox"
                            checked={contract.enforcement?.requireApproval || false}
                            onChange={(e) => updateContract(contractIndex, {
                              enforcement: { ...contract.enforcement, requireApproval: e.target.checked }
                            })}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-gray-700 dark:text-gray-300">Require approval</span>
                        </label>
                        <div>
                          <label className="block text-gray-700 dark:text-gray-300 mb-1">Grace Period (hours)</label>
                          <input
                            type="number"
                            value={contract.enforcement?.gracePeriodHours || 0}
                            onChange={(e) => updateContract(contractIndex, {
                              enforcement: { ...contract.enforcement, gracePeriodHours: parseInt(e.target.value) }
                            })}
                            className="block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs"
                            min="0"
                          />
                        </div>
                        <div>
                          <label className="block text-gray-700 dark:text-gray-300 mb-1">Notify Channels (comma-separated)</label>
                          <input
                            type="text"
                            value={(contract.enforcement?.notifyChannels || []).join(', ')}
                            onChange={(e) => updateContract(contractIndex, {
                              enforcement: {
                                ...contract.enforcement,
                                notifyChannels: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean)
                              }
                            })}
                            className="block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs"
                            placeholder="e.g., #platform-alerts"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Routing Settings */}
                    <div className="border-t border-gray-300 dark:border-gray-600 pt-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Routing Settings
                      </label>
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <label className="block text-gray-700 dark:text-gray-300 mb-1">Assign to Team</label>
                          <input
                            type="text"
                            value={contract.routing?.assignToTeam || ''}
                            onChange={(e) => updateContract(contractIndex, {
                              routing: { ...contract.routing, assignToTeam: e.target.value }
                            })}
                            className="block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs"
                            placeholder="e.g., @platform-team"
                          />
                        </div>
                        <div>
                          <label className="block text-gray-700 dark:text-gray-300 mb-1">Notify Slack Channel</label>
                          <input
                            type="text"
                            value={contract.routing?.notifySlackChannel || ''}
                            onChange={(e) => updateContract(contractIndex, {
                              routing: { ...contract.routing, notifySlackChannel: e.target.value }
                            })}
                            className="block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs"
                            placeholder="e.g., #contract-violations"
                          />
                        </div>
                        <label className="flex items-center p-2 border border-gray-200 dark:border-gray-600 rounded">
                          <input
                            type="checkbox"
                            checked={contract.routing?.createJiraTicket || false}
                            onChange={(e) => updateContract(contractIndex, {
                              routing: { ...contract.routing, createJiraTicket: e.target.checked }
                            })}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-gray-700 dark:text-gray-300">Create Jira ticket</span>
                        </label>
                      </div>
                    </div>

                    {/* Writeback Settings */}
                    <div className="border-t border-gray-300 dark:border-gray-600 pt-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Writeback Settings
                      </label>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <label className="flex items-center p-2 border border-gray-200 dark:border-gray-600 rounded">
                          <input
                            type="checkbox"
                            checked={contract.writeback?.enabled || false}
                            onChange={(e) => updateContract(contractIndex, {
                              writeback: { ...contract.writeback, enabled: e.target.checked }
                            })}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-gray-700 dark:text-gray-300">Enable writeback</span>
                        </label>
                        <div>
                          <label className="block text-gray-700 dark:text-gray-300 mb-1">Target System</label>
                          <select
                            value={contract.writeback?.targetSystem || 'github'}
                            onChange={(e) => updateContract(contractIndex, {
                              writeback: { ...contract.writeback, targetSystem: e.target.value }
                            })}
                            className="block w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs"
                            disabled={!contract.writeback?.enabled}
                          >
                            <option value="github">GitHub</option>
                            <option value="confluence">Confluence</option>
                            <option value="notion">Notion</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dictionaries */}
          <div className="space-y-4">
            <SectionHeader title="Dictionaries" section="dictionaries" />
            {expandedSections.dictionaries && (
              <div className="p-4 space-y-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Define reusable dictionaries for services, environments, teams, etc.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Dictionaries (JSON)
                  </label>
                  <textarea
                    rows={8}
                    value={typeof trackAConfig.dictionaries === 'object' ? JSON.stringify(trackAConfig.dictionaries, null, 2) : trackAConfig.dictionaries || '{}'}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        updateTrackAConfig({ dictionaries: parsed });
                      } catch {
                        // Allow invalid JSON while typing
                        updateTrackAConfig({ dictionaries: e.target.value });
                      }
                    }}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm font-mono"
                    placeholder={`{\n  "services": ["api", "web", "worker"],\n  "environments": ["dev", "staging", "prod"],\n  "teams": ["platform", "data", "ml"]\n}`}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Extraction Settings */}
          <div className="space-y-4">
            <SectionHeader title="Extraction Settings" section="extraction" />
            {expandedSections.extraction && (
              <div className="p-4 space-y-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Configure token limits and extraction settings per artifact type
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Extraction Config (JSON)
                  </label>
                  <textarea
                    rows={8}
                    value={typeof trackAConfig.extraction === 'object' ? JSON.stringify(trackAConfig.extraction, null, 2) : trackAConfig.extraction || '{}'}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        updateTrackAConfig({ extraction: parsed });
                      } catch {
                        // Allow invalid JSON while typing
                        updateTrackAConfig({ extraction: e.target.value });
                      }
                    }}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm font-mono"
                    placeholder={`{\n  "tokenLimits": {\n    "openapi_spec": 50000,\n    "terraform_plan": 30000,\n    "github_readme": 10000\n  }\n}`}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Safety Settings */}
          <div className="space-y-4">
            <SectionHeader title="Safety Settings" section="safety" />
            {expandedSections.safety && (
              <div className="p-4 space-y-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Configure secret patterns, immutable sections, and other safety controls
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Safety Config (JSON)
                  </label>
                  <textarea
                    rows={8}
                    value={typeof trackAConfig.safety === 'object' ? JSON.stringify(trackAConfig.safety, null, 2) : trackAConfig.safety || '{}'}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        updateTrackAConfig({ safety: parsed });
                      } catch {
                        // Allow invalid JSON while typing
                        updateTrackAConfig({ safety: e.target.value });
                      }
                    }}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm font-mono"
                    placeholder={`{\n  "secretPatterns": ["API_KEY", "SECRET", "PASSWORD"],\n  "immutableSections": ["security", "compliance"]\n}`}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Contract Policy */}
          <div className="space-y-4">
            <SectionHeader title="Contract Policy (Thresholds)" section="policy" />
            {expandedSections.policy && (
              <div className="p-4 space-y-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Configure policy thresholds and graceful degradation settings
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Policy Name
                    </label>
                    <input
                      type="text"
                      value={trackAConfig.policy?.name || ''}
                      onChange={(e) => updateTrackAConfig({
                        policy: { ...trackAConfig.policy, name: e.target.value }
                      })}
                      className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                      placeholder="e.g., Default Contract Policy"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Mode
                    </label>
                    <select
                      value={trackAConfig.policy?.mode || 'enforce'}
                      onChange={(e) => updateTrackAConfig({
                        policy: { ...trackAConfig.policy, mode: e.target.value }
                      })}
                      className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    >
                      <option value="enforce">Enforce</option>
                      <option value="warn">Warn Only</option>
                      <option value="monitor">Monitor Only</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={trackAConfig.policy?.description || ''}
                    onChange={(e) => updateTrackAConfig({
                      policy: { ...trackAConfig.policy, description: e.target.value }
                    })}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    placeholder="Describe this policy..."
                  />
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Severity Thresholds (0.0 - 1.0)
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400">Critical Threshold</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={trackAConfig.policy?.thresholds?.critical || 0.95}
                        onChange={(e) => updateTrackAConfig({
                          policy: {
                            ...trackAConfig.policy,
                            thresholds: { ...trackAConfig.policy?.thresholds, critical: parseFloat(e.target.value) }
                          }
                        })}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400">High Threshold</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={trackAConfig.policy?.thresholds?.high || 0.80}
                        onChange={(e) => updateTrackAConfig({
                          policy: {
                            ...trackAConfig.policy,
                            thresholds: { ...trackAConfig.policy?.thresholds, high: parseFloat(e.target.value) }
                          }
                        })}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400">Medium Threshold</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={trackAConfig.policy?.thresholds?.medium || 0.60}
                        onChange={(e) => updateTrackAConfig({
                          policy: {
                            ...trackAConfig.policy,
                            thresholds: { ...trackAConfig.policy?.thresholds, medium: parseFloat(e.target.value) }
                          }
                        })}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400">Low Threshold</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={trackAConfig.policy?.thresholds?.low || 0.40}
                        onChange={(e) => updateTrackAConfig({
                          policy: {
                            ...trackAConfig.policy,
                            thresholds: { ...trackAConfig.policy?.thresholds, low: parseFloat(e.target.value) }
                          }
                        })}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Graceful Degradation
                  </label>
                  <label className="flex items-center p-3 border border-gray-200 dark:border-gray-600 rounded-md">
                    <input
                      type="checkbox"
                      checked={trackAConfig.policy?.gracefulDegradation?.enabled || false}
                      onChange={(e) => updateTrackAConfig({
                        policy: {
                          ...trackAConfig.policy,
                          gracefulDegradation: { ...trackAConfig.policy?.gracefulDegradation, enabled: e.target.checked }
                        }
                      })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                      Enable graceful degradation (soft-fail to WARN if external systems down)
                    </span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Applies To (comma-separated surfaces)
                  </label>
                  <input
                    type="text"
                    value={(trackAConfig.policy?.appliesTo || []).join(', ')}
                    onChange={(e) => updateTrackAConfig({
                      policy: {
                        ...trackAConfig.policy,
                        appliesTo: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean)
                      }
                    })}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    placeholder="e.g., api, infra, docs"
                  />
                </div>

                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={trackAConfig.policy?.active !== false}
                      onChange={(e) => updateTrackAConfig({
                        policy: { ...trackAConfig.policy, active: e.target.checked }
                      })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Policy Active</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

