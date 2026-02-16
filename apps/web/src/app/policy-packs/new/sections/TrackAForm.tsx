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
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

