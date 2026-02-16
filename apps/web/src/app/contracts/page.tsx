'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { X, Plus, Trash2, Edit2, ChevronDown, ChevronUp } from 'lucide-react';

interface ContractPack {
  workspaceId: string;
  id: string;
  version: string;
  name: string;
  description: string | null;
  contracts: any[];
  createdAt: string;
  updatedAt: string;
}

interface ContractPolicy {
  workspaceId: string;
  id: string;
  name: string;
  description: string | null;
  mode: string;
  criticalThreshold: number;
  highThreshold: number;
  mediumThreshold: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Comparator {
  comparatorType: string;
  supportedArtifactTypes: string[];
  version: string;
}

interface ComparatorSelection {
  type: string;
  enabled: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

function ContractsContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace') || 'demo-workspace';

  const [contractPacks, setContractPacks] = useState<ContractPack[]>([]);
  const [contractPolicies, setContractPolicies] = useState<ContractPolicy[]>([]);
  const [availableComparators, setAvailableComparators] = useState<Comparator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPack, setSelectedPack] = useState<ContractPack | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingPack, setEditingPack] = useState<ContractPack | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    version: 'v1',
    scopeType: 'workspace' as 'workspace' | 'service' | 'repo',
    scopeRef: '',
    repoAllowlist: [] as string[],
    pathGlobs: [] as string[],
    enforcementMode: 'warn' as 'off' | 'warn' | 'block',
    selectedComparators: [] as ComparatorSelection[],
  });

  // Fetch contract packs, policies, and comparators
  useEffect(() => {
    fetchContractPacks();
    fetchContractPolicies();
    fetchComparators();
  }, [workspaceId]);

  const fetchContractPacks = async () => {
    try {
      setLoading(true);
      setError(null);

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/contract-packs`);

      if (!response.ok) {
        throw new Error('Failed to fetch contract packs');
      }

      const data = await response.json();
      setContractPacks(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchContractPolicies = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/contract-policies`);

      if (!response.ok) {
        throw new Error('Failed to fetch contract policies');
      }

      const data = await response.json();
      setContractPolicies(data.data || []);
    } catch (err) {
      console.error('Failed to fetch contract policies:', err);
      // Don't set error state for policies, just log it
    }
  };

  const fetchComparators = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/comparators`);

      if (!response.ok) {
        throw new Error('Failed to fetch comparators');
      }

      const data = await response.json();
      setAvailableComparators(data.data || []);
    } catch (err) {
      console.error('Failed to fetch comparators:', err);
      // Don't set error state for comparators, just log it
    }
  };

  const handleDelete = async (packId: string) => {
    if (!confirm('Are you sure you want to delete this contract pack?')) {
      return;
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(
        `${apiUrl}/api/workspaces/${workspaceId}/contract-packs/${packId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('Failed to delete contract pack');
      }

      // Refresh the list
      fetchContractPacks();
      setSelectedPack(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete contract pack');
    }
  };

  const openCreateModal = () => {
    setEditingPack(null);
    setCurrentStep(1);
    setFormData({
      name: '',
      description: '',
      version: 'v1',
      scopeType: 'workspace',
      scopeRef: '',
      repoAllowlist: [],
      pathGlobs: [],
      enforcementMode: 'warn',
      selectedComparators: availableComparators.map(c => ({
        type: c.comparatorType,
        enabled: false,
        severity: 'medium' as const,
      })),
    });
    setShowModal(true);
  };

  const openEditModal = (pack: ContractPack) => {
    setEditingPack(pack);
    setCurrentStep(1);

    // Extract enforcement mode from first contract (if exists)
    const firstContract = pack.contracts[0];
    const enforcementMode = firstContract?.enforcement?.mode || 'warn';

    // Extract comparators from first contract's invariants
    const existingComparators = firstContract?.invariants?.map((inv: any) => ({
      type: inv.comparatorType,
      enabled: true,
      severity: inv.severity || 'medium',
    })) || [];

    // Merge with available comparators
    const selectedComparators = availableComparators.map(c => {
      const existing = existingComparators.find((ec: any) => ec.type === c.comparatorType);
      return existing || {
        type: c.comparatorType,
        enabled: false,
        severity: 'medium' as const,
      };
    });

    setFormData({
      name: pack.name,
      description: pack.description || '',
      version: pack.version,
      scopeType: firstContract?.scope?.type || 'workspace',
      scopeRef: firstContract?.scope?.ref || '',
      repoAllowlist: firstContract?.scope?.repoAllowlist || [],
      pathGlobs: firstContract?.scope?.pathGlobs || [],
      enforcementMode: enforcementMode as 'off' | 'warn' | 'block',
      selectedComparators,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingPack(null);
    setSaving(false);
    setCurrentStep(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Build contracts array from form data
      const enabledComparators = formData.selectedComparators.filter(c => c.enabled);

      const contracts = [{
        contractId: `${formData.name.toLowerCase().replace(/\s+/g, '-')}-contract`,
        name: formData.name,
        description: formData.description,
        surfaces: ['api'], // Default to API surface
        scope: {
          type: formData.scopeType,
          ref: formData.scopeRef || undefined,
          repoAllowlist: formData.repoAllowlist.length > 0 ? formData.repoAllowlist : undefined,
          pathGlobs: formData.pathGlobs.length > 0 ? formData.pathGlobs : undefined,
        },
        artifacts: [
          {
            type: 'openapi',
            location: 'https://api.example.com/openapi.json',
          },
        ],
        invariants: enabledComparators.map(c => ({
          comparatorType: c.type,
          severity: c.severity,
          config: {},
        })),
        enforcement: {
          mode: formData.enforcementMode,
          blockOnFail: formData.enforcementMode === 'block',
        },
        routing: {
          method: 'service_owner',
        },
      }];

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const url = editingPack
        ? `${apiUrl}/api/workspaces/${workspaceId}/contract-packs/${editingPack.id}`
        : `${apiUrl}/api/workspaces/${workspaceId}/contract-packs`;

      const method = editingPack ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          version: formData.version,
          contracts,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save contract pack');
      }

      // Refresh the list
      await fetchContractPacks();
      closeModal();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save contract pack');
      setSaving(false);
    }
  };

  // Helper functions for form management
  const toggleComparator = (type: string) => {
    setFormData(prev => ({
      ...prev,
      selectedComparators: prev.selectedComparators.map(c =>
        c.type === type ? { ...c, enabled: !c.enabled } : c
      ),
    }));
  };

  const updateComparatorSeverity = (type: string, severity: 'low' | 'medium' | 'high' | 'critical') => {
    setFormData(prev => ({
      ...prev,
      selectedComparators: prev.selectedComparators.map(c =>
        c.type === type ? { ...c, severity } : c
      ),
    }));
  };

  const addRepoToAllowlist = (repo: string) => {
    if (repo && !formData.repoAllowlist.includes(repo)) {
      setFormData(prev => ({
        ...prev,
        repoAllowlist: [...prev.repoAllowlist, repo],
      }));
    }
  };

  const removeRepoFromAllowlist = (repo: string) => {
    setFormData(prev => ({
      ...prev,
      repoAllowlist: prev.repoAllowlist.filter(r => r !== repo),
    }));
  };

  const addPathGlob = (glob: string) => {
    if (glob && !formData.pathGlobs.includes(glob)) {
      setFormData(prev => ({
        ...prev,
        pathGlobs: [...prev.pathGlobs, glob],
      }));
    }
  };

  const removePathGlob = (glob: string) => {
    setFormData(prev => ({
      ...prev,
      pathGlobs: prev.pathGlobs.filter(g => g !== glob),
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            🔒 Contract Integrity Gate
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage contract validation policies and packs for your workspace
          </p>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-800 dark:text-red-200">❌ {error}</p>
          </div>
        )}

        {/* Active Contract Policy */}
        {!loading && contractPolicies.length > 0 && (
          <div className="mb-8 p-6 bg-gradient-to-r from-primary-50 to-indigo-50 dark:from-primary-900/20 dark:to-indigo-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
                  ⚙️ Active Policy
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Current enforcement policy for contract validation
                </p>
              </div>
              <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-sm font-medium rounded-full">
                Active
              </span>
            </div>

            {(() => {
              const activePolicy = contractPolicies.find(p => p.active);
              if (!activePolicy) {
                return (
                  <div className="text-gray-600 dark:text-gray-400">
                    No active policy configured. All PRs will use default behavior.
                  </div>
                );
              }

              const policyModeDisplay = {
                'warn_only': { label: '⚠️ Warn Only', desc: 'Never blocks PRs, only warns', color: 'yellow' },
                'block_high_critical': { label: '🛑 Block High/Critical', desc: 'Blocks on high or critical findings', color: 'orange' },
                'block_all_critical': { label: '🛑 Block Critical', desc: 'Blocks only on critical findings', color: 'red' },
              }[activePolicy.mode] || { label: activePolicy.mode, desc: 'Unknown mode', color: 'gray' };

              return (
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                      {activePolicy.name}
                    </h3>
                    {activePolicy.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        {activePolicy.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 bg-${policyModeDisplay.color}-100 dark:bg-${policyModeDisplay.color}-900/30 text-${policyModeDisplay.color}-800 dark:text-${policyModeDisplay.color}-200 text-sm font-medium rounded-full`}>
                        {policyModeDisplay.label}
                      </span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {policyModeDisplay.desc}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Critical Threshold:</span>{' '}
                      <span className="font-semibold text-gray-900 dark:text-white">{activePolicy.criticalThreshold}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-600 dark:text-gray-400">High Threshold:</span>{' '}
                      <span className="font-semibold text-gray-900 dark:text-white">{activePolicy.highThreshold}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Medium Threshold:</span>{' '}
                      <span className="font-semibold text-gray-900 dark:text-white">{activePolicy.mediumThreshold}</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading contract packs...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && contractPacks.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              No Contract Packs Yet
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Create your first contract pack to start enforcing contract integrity
            </p>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              + Create Contract Pack
            </button>
          </div>
        )}

        {/* Contract Packs List */}
        {!loading && contractPacks.length > 0 && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* List View */}
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Contract Packs ({contractPacks.length})
                </h2>
                <button
                  onClick={openCreateModal}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm"
                >
                  + New Pack
                </button>
              </div>

              {contractPacks.map((pack) => (
                <div
                  key={pack.id}
                  onClick={() => setSelectedPack(pack)}
                  className={`p-4 bg-white dark:bg-gray-900 rounded-lg border cursor-pointer transition-all ${
                    selectedPack?.id === pack.id
                      ? 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800'
                      : 'border-gray-200 dark:border-gray-800 hover:border-primary-300'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {pack.name}
                    </h3>
                    <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                      {pack.version}
                    </span>
                  </div>
                  {pack.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      {pack.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-500">
                    <span>📋 {pack.contracts.length} contracts</span>
                    <span>🕒 {new Date(pack.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Detail View */}
            <div>
              {selectedPack ? (
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6 sticky top-4">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        {selectedPack.name}
                      </h2>
                      <p className="text-gray-600 dark:text-gray-400">
                        {selectedPack.description || 'No description'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditModal(selectedPack)}
                        className="px-3 py-1 text-sm text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-colors"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => handleDelete(selectedPack.id)}
                        className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Metadata
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Version:</span>
                          <span className="font-medium text-gray-900 dark:text-white">{selectedPack.version}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Contracts:</span>
                          <span className="font-medium text-gray-900 dark:text-white">{selectedPack.contracts.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Created:</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {new Date(selectedPack.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Updated:</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {new Date(selectedPack.updatedAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                        Contracts ({selectedPack.contracts.length})
                      </h3>
                      <div className="space-y-3">
                        {selectedPack.contracts.map((contract: any, index: number) => (
                          <div
                            key={index}
                            className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                                {contract.name}
                              </h4>
                              <span className="text-xs px-2 py-1 bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 rounded">
                                {contract.contractId}
                              </span>
                            </div>
                            {contract.description && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                                {contract.description}
                              </p>
                            )}
                            <div className="flex gap-2 text-xs text-gray-500 dark:text-gray-500">
                              <span>📦 {contract.artifacts?.length || 0} artifacts</span>
                              <span>✓ {contract.invariants?.length || 0} invariants</span>
                              <span>🔒 {contract.enforcement?.mode || 'N/A'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-12 text-center">
                  <div className="text-4xl mb-4">👈</div>
                  <p className="text-gray-600 dark:text-gray-400">
                    Select a contract pack to view details
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-900 rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {editingPack ? 'Edit Contract Pack' : 'Create Contract Pack'}
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Step {currentStep} of 4
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Step Indicator */}
              <div className="px-6 pt-4 pb-2">
                <div className="flex items-center justify-between">
                  {[
                    { num: 1, label: 'Basic Info' },
                    { num: 2, label: 'Enforcement' },
                    { num: 3, label: 'Comparators' },
                    { num: 4, label: 'Scope' },
                  ].map((step, idx) => (
                    <div key={step.num} className="flex items-center flex-1">
                      <div className="flex flex-col items-center flex-1">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                            currentStep >= step.num
                              ? 'bg-primary-600 text-white'
                              : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                          }`}
                        >
                          {step.num}
                        </div>
                        <span className="text-xs mt-1 text-gray-600 dark:text-gray-400">
                          {step.label}
                        </span>
                      </div>
                      {idx < 3 && (
                        <div
                          className={`h-1 flex-1 mx-2 ${
                            currentStep > step.num
                              ? 'bg-primary-600'
                              : 'bg-gray-200 dark:bg-gray-700'
                          }`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {/* Step 1: Basic Info */}
                {currentStep === 1 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Pack Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        placeholder="e.g., Production API Contract Pack"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Description
                      </label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        placeholder="Optional description of this contract pack"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Version
                      </label>
                      <input
                        type="text"
                        value={formData.version}
                        onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        placeholder="e.g., v1"
                      />
                    </div>
                  </div>
                )}

                {/* Step 2: Enforcement Mode */}
                {currentStep === 2 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Enforcement Mode *
                      </label>
                      <div className="space-y-3">
                        {[
                          { value: 'off', label: 'OFF', desc: 'No enforcement - findings are logged only' },
                          { value: 'warn', label: 'WARN', desc: 'Show warnings but allow PR to proceed' },
                          { value: 'block', label: 'BLOCK', desc: 'Block PR if critical findings detected' },
                        ].map((mode) => (
                          <label
                            key={mode.value}
                            className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                              formData.enforcementMode === mode.value
                                ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                            }`}
                          >
                            <input
                              type="radio"
                              name="enforcementMode"
                              value={mode.value}
                              checked={formData.enforcementMode === mode.value}
                              onChange={(e) => setFormData({ ...formData, enforcementMode: e.target.value as any })}
                              className="mt-1 mr-3"
                            />
                            <div>
                              <div className="font-semibold text-gray-900 dark:text-white">
                                {mode.label}
                              </div>
                              <div className="text-sm text-gray-600 dark:text-gray-400">
                                {mode.desc}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <div className="flex items-start">
                        <div className="text-blue-600 dark:text-blue-400 mr-3">ℹ️</div>
                        <div className="text-sm text-blue-800 dark:text-blue-200">
                          <strong>Recommendation:</strong> Start with WARN mode to understand the impact before enabling BLOCK mode.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: Comparator Selection */}
                {currentStep === 3 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Select Comparators
                      </label>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Choose which comparators to enable for this contract pack. Each comparator validates a specific aspect of your contracts.
                      </p>

                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {formData.selectedComparators.map((comp) => {
                          const comparatorInfo = availableComparators.find(c => c.comparatorType === comp.type);
                          return (
                            <div
                              key={comp.type}
                              className={`p-4 border-2 rounded-lg transition-colors ${
                                comp.enabled
                                  ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                                  : 'border-gray-200 dark:border-gray-700'
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <label className="flex items-start cursor-pointer flex-1">
                                  <input
                                    type="checkbox"
                                    checked={comp.enabled}
                                    onChange={() => toggleComparator(comp.type)}
                                    className="mt-1 mr-3"
                                  />
                                  <div className="flex-1">
                                    <div className="font-semibold text-gray-900 dark:text-white">
                                      {comp.type}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      Supports: {comparatorInfo?.supportedArtifactTypes.join(', ') || 'N/A'}
                                    </div>
                                  </div>
                                </label>

                                {comp.enabled && (
                                  <div className="ml-4">
                                    <select
                                      value={comp.severity}
                                      onChange={(e) => updateComparatorSeverity(comp.type, e.target.value as any)}
                                      className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                    >
                                      <option value="low">Low</option>
                                      <option value="medium">Medium</option>
                                      <option value="high">High</option>
                                      <option value="critical">Critical</option>
                                    </select>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {formData.selectedComparators.filter(c => c.enabled).length === 0 && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mt-4">
                          <div className="flex items-start">
                            <div className="text-yellow-600 dark:text-yellow-400 mr-3">⚠️</div>
                            <div className="text-sm text-yellow-800 dark:text-yellow-200">
                              No comparators selected. Your contract pack won't perform any validations.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 4: Scope Configuration */}
                {currentStep === 4 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Scope Type
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { value: 'workspace', label: 'Workspace', desc: 'All repos in workspace' },
                          { value: 'service', label: 'Service', desc: 'Specific service' },
                          { value: 'repo', label: 'Repository', desc: 'Specific repo' },
                        ].map((scope) => (
                          <label
                            key={scope.value}
                            className={`flex flex-col p-3 border-2 rounded-lg cursor-pointer transition-colors ${
                              formData.scopeType === scope.value
                                ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name="scopeType"
                              value={scope.value}
                              checked={formData.scopeType === scope.value}
                              onChange={(e) => setFormData({ ...formData, scopeType: e.target.value as any })}
                              className="sr-only"
                            />
                            <div className="font-semibold text-sm text-gray-900 dark:text-white">
                              {scope.label}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              {scope.desc}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {formData.scopeType !== 'workspace' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Scope Reference
                        </label>
                        <input
                          type="text"
                          value={formData.scopeRef}
                          onChange={(e) => setFormData({ ...formData, scopeRef: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          placeholder={formData.scopeType === 'service' ? 'e.g., payment-service' : 'e.g., org/repo-name'}
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Repository Allowlist (Optional)
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        Restrict this pack to specific repositories. Leave empty to apply to all repos.
                      </p>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          id="repoInput"
                          placeholder="e.g., org/repo-name"
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const input = e.currentTarget;
                              addRepoToAllowlist(input.value);
                              input.value = '';
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.getElementById('repoInput') as HTMLInputElement;
                            addRepoToAllowlist(input.value);
                            input.value = '';
                          }}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {formData.repoAllowlist.map((repo) => (
                          <span
                            key={repo}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200 rounded-full text-sm"
                          >
                            {repo}
                            <button
                              type="button"
                              onClick={() => removeRepoFromAllowlist(repo)}
                              className="hover:text-primary-900 dark:hover:text-primary-100"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Path Globs (Optional)
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        Filter files using glob patterns. Leave empty to check all files.
                      </p>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          id="globInput"
                          placeholder="e.g., src/**/*.ts"
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const input = e.currentTarget;
                              addPathGlob(input.value);
                              input.value = '';
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.getElementById('globInput') as HTMLInputElement;
                            addPathGlob(input.value);
                            input.value = '';
                          }}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {formData.pathGlobs.map((glob) => (
                          <span
                            key={glob}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200 rounded-full text-sm font-mono"
                          >
                            {glob}
                            <button
                              type="button"
                              onClick={() => removePathGlob(glob)}
                              className="hover:text-primary-900 dark:hover:text-primary-100"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Navigation Buttons */}
                <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-800">
                  <div>
                    {currentStep > 1 && (
                      <button
                        type="button"
                        onClick={() => setCurrentStep(currentStep - 1)}
                        disabled={saving}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                      >
                        ← Previous
                      </button>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={closeModal}
                      disabled={saving}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>

                    {currentStep < 4 ? (
                      <button
                        type="button"
                        onClick={() => setCurrentStep(currentStep + 1)}
                        disabled={!formData.name}
                        className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next →
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={saving || !formData.name}
                        className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {saving ? 'Saving...' : editingPack ? 'Update Pack' : 'Create Pack'}
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ContractsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
          </div>
        </main>
      </div>
    }>
      <ContractsContent />
    </Suspense>
  );
}
