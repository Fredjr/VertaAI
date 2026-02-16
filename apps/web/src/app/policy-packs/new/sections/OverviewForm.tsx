'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

interface OverviewFormProps {
  formData: any;
  setFormData: (data: any) => void;
}

export default function OverviewForm({ formData, setFormData }: OverviewFormProps) {
  const [newRepo, setNewRepo] = useState('');
  const [newGlob, setNewGlob] = useState('');

  const handleAddRepo = () => {
    if (newRepo.trim()) {
      setFormData({
        ...formData,
        repoAllowlist: [...(formData.repoAllowlist || []), newRepo.trim()],
      });
      setNewRepo('');
    }
  };

  const handleRemoveRepo = (index: number) => {
    setFormData({
      ...formData,
      repoAllowlist: formData.repoAllowlist.filter((_: any, i: number) => i !== index),
    });
  };

  const handleAddGlob = () => {
    if (newGlob.trim()) {
      setFormData({
        ...formData,
        pathGlobs: [...(formData.pathGlobs || []), newGlob.trim()],
      });
      setNewGlob('');
    }
  };

  const handleRemoveGlob = (index: number) => {
    setFormData({
      ...formData,
      pathGlobs: formData.pathGlobs.filter((_: any, i: number) => i !== index),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Basic Information
        </h2>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name *
            </label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="e.g., Production API Contract Pack"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description
            </label>
            <textarea
              id="description"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="Describe the purpose of this policy pack..."
            />
          </div>

          {/* Status */}
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Status
            </label>
            <select
              id="status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Scope Configuration
        </h2>

        <div className="space-y-4">
          {/* Scope Type */}
          <div>
            <label htmlFor="scopeType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Scope Type *
            </label>
            <select
              id="scopeType"
              value={formData.scopeType}
              onChange={(e) => setFormData({ ...formData, scopeType: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
            >
              <option value="workspace">Workspace (applies to all repos)</option>
              <option value="service">Service (specific service)</option>
              <option value="repo">Repository (specific repo)</option>
            </select>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Determines where this policy pack applies
            </p>
          </div>

          {/* Scope Ref */}
          {(formData.scopeType === 'service' || formData.scopeType === 'repo') && (
            <div>
              <label htmlFor="scopeRef" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {formData.scopeType === 'service' ? 'Service ID' : 'Repository Name'} *
              </label>
              <input
                type="text"
                id="scopeRef"
                value={formData.scopeRef}
                onChange={(e) => setFormData({ ...formData, scopeRef: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                placeholder={formData.scopeType === 'service' ? 'e.g., payment-api' : 'e.g., owner/repo-name'}
                required
              />
            </div>
          )}

          {/* Repository Allowlist */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Repository Allowlist (optional)
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              Restrict this policy pack to specific repositories
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newRepo}
                onChange={(e) => setNewRepo(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddRepo())}
                className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                placeholder="e.g., owner/repo-name"
              />
              <button
                type="button"
                onClick={handleAddRepo}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {formData.repoAllowlist && formData.repoAllowlist.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.repoAllowlist.map((repo: string, index: number) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                  >
                    {repo}
                    <button
                      type="button"
                      onClick={() => handleRemoveRepo(index)}
                      className="ml-2 inline-flex items-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Path Globs */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Path Globs (optional)
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              Restrict this policy pack to specific file paths (supports glob patterns)
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newGlob}
                onChange={(e) => setNewGlob(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddGlob())}
                className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                placeholder="e.g., src/**/*.ts or terraform/**/*.tf"
              />
              <button
                type="button"
                onClick={handleAddGlob}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {formData.pathGlobs && formData.pathGlobs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.pathGlobs.map((glob: string, index: number) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                  >
                    {glob}
                    <button
                      type="button"
                      onClick={() => handleRemoveGlob(index)}
                      className="ml-2 inline-flex items-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

