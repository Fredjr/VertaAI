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

function ContractsContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace') || 'demo-workspace';
  
  const [contractPacks, setContractPacks] = useState<ContractPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPack, setSelectedPack] = useState<ContractPack | null>(null);

  // Fetch contract packs
  useEffect(() => {
    fetchContractPacks();
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            📋 Contract Packs
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage contract integrity rules for your workspace
          </p>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-800 dark:text-red-200">❌ {error}</p>
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
            <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
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
                <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm">
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
                    <button
                      onClick={() => handleDelete(selectedPack.id)}
                      className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    >
                      🗑️ Delete
                    </button>
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
