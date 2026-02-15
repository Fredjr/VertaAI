'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';

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

function ContractsContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace') || 'demo-workspace';

  const [contractPacks, setContractPacks] = useState<ContractPack[]>([]);
  const [contractPolicies, setContractPolicies] = useState<ContractPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPack, setSelectedPack] = useState<ContractPack | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingPack, setEditingPack] = useState<ContractPack | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    version: 'v1',
    contracts: '[]',
  });
  const [saving, setSaving] = useState(false);

  // Fetch contract packs and policies
  useEffect(() => {
    fetchContractPacks();
    fetchContractPolicies();
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
    setFormData({
      name: '',
      description: '',
      version: 'v1',
      contracts: JSON.stringify([
        {
          contractId: 'example-contract',
          name: 'Example Contract',
          description: 'Example contract description',
          surfaces: ['api'],
          artifacts: [
            {
              type: 'openapi',
              location: 'https://api.example.com/openapi.json',
            },
          ],
          invariants: [
            {
              comparatorType: 'openapi.validate',
              severity: 'high',
              config: {},
            },
          ],
          enforcement: {
            mode: 'warn',
            blockOnFail: false,
          },
          routing: {
            method: 'service_owner',
          },
        },
      ], null, 2),
    });
    setShowModal(true);
  };

  const openEditModal = (pack: ContractPack) => {
    setEditingPack(pack);
    setFormData({
      name: pack.name,
      description: pack.description || '',
      version: pack.version,
      contracts: JSON.stringify(pack.contracts, null, 2),
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingPack(null);
    setSaving(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Parse contracts JSON
      let contracts;
      try {
        contracts = JSON.parse(formData.contracts);
      } catch (err) {
        alert('Invalid JSON in contracts field');
        setSaving(false);
        return;
      }

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
            <div className="bg-white dark:bg-gray-900 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 dark:border-gray-800">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {editingPack ? 'Edit Contract Pack' : 'Create Contract Pack'}
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Name *
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

                {/* Description */}
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

                {/* Version */}
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

                {/* Contracts (JSON Editor) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Contracts (JSON) *
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Define contracts as a JSON array. Each contract should have: contractId, name, surfaces, artifacts, invariants, enforcement, routing.
                  </p>
                  <textarea
                    required
                    value={formData.contracts}
                    onChange={(e) => setFormData({ ...formData, contracts: e.target.value })}
                    rows={20}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
                    placeholder='[{"contractId": "...", "name": "...", ...}]'
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={saving}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !formData.name || !formData.contracts}
                    className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving...' : editingPack ? 'Update Pack' : 'Create Pack'}
                  </button>
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
