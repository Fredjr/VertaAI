'use client';

import { useState } from 'react';
import { Plus, X, Users, Tag } from 'lucide-react';

interface OverviewFormProps {
  formData: any;
  setFormData: (data: any) => void;
}

export default function OverviewForm({ formData, setFormData }: OverviewFormProps) {
  const [newRepo, setNewRepo] = useState('');
  const [newGlob, setNewGlob] = useState('');
  const [newOwnerTeam, setNewOwnerTeam] = useState('');
  const [newOwnerUser, setNewOwnerUser] = useState('');
  const [newLabelKey, setNewLabelKey] = useState('');
  const [newLabelValue, setNewLabelValue] = useState('');

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

  const handleAddOwnerTeam = () => {
    if (newOwnerTeam.trim()) {
      const owners = formData.owners || [];
      setFormData({
        ...formData,
        owners: [...owners, { team: newOwnerTeam.trim() }],
      });
      setNewOwnerTeam('');
    }
  };

  const handleAddOwnerUser = () => {
    if (newOwnerUser.trim()) {
      const owners = formData.owners || [];
      setFormData({
        ...formData,
        owners: [...owners, { user: newOwnerUser.trim() }],
      });
      setNewOwnerUser('');
    }
  };

  const handleRemoveOwner = (index: number) => {
    setFormData({
      ...formData,
      owners: (formData.owners || []).filter((_: any, i: number) => i !== index),
    });
  };

  const handleAddLabel = () => {
    if (newLabelKey.trim() && newLabelValue.trim()) {
      const labels = formData.labels || {};
      setFormData({
        ...formData,
        labels: { ...labels, [newLabelKey.trim()]: newLabelValue.trim() },
      });
      setNewLabelKey('');
      setNewLabelValue('');
    }
  };

  const handleRemoveLabel = (key: string) => {
    const labels = { ...(formData.labels || {}) };
    delete labels[key];
    setFormData({
      ...formData,
      labels,
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

          {/* Owner */}
          <div>
            <label htmlFor="owner" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Owner *
            </label>
            <input
              type="text"
              id="owner"
              value={formData.owner || ''}
              onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="e.g., platform-team"
              required
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Team or individual responsible for this pack
            </p>
          </div>

          {/* Pack Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Pack Mode *
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="observe"
                  checked={formData.packMode === 'observe'}
                  onChange={(e) => setFormData({ ...formData, packMode: e.target.value })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Observe (monitor only)
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="enforce"
                  checked={formData.packMode === 'enforce'}
                  onChange={(e) => setFormData({ ...formData, packMode: e.target.value })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Enforce (block PRs)
                </span>
              </label>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Observe mode logs violations without blocking; Enforce mode blocks PRs
            </p>
          </div>

          {/* Strictness */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Strictness *
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="permissive"
                  checked={formData.strictness === 'permissive'}
                  onChange={(e) => setFormData({ ...formData, strictness: e.target.value })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Permissive
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="balanced"
                  checked={formData.strictness === 'balanced'}
                  onChange={(e) => setFormData({ ...formData, strictness: e.target.value })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Balanced
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="strict"
                  checked={formData.strictness === 'strict'}
                  onChange={(e) => setFormData({ ...formData, strictness: e.target.value })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Strict
                </span>
              </label>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Controls how external dependency failures are handled
            </p>
          </div>

          {/* Status - PHASE 1.2: Enhanced with new enum values */}
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Status
            </label>
            <select
              id="status"
              value={formData.status || 'DRAFT'}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
            >
              <option value="DRAFT">Draft</option>
              <option value="IN_REVIEW">In Review</option>
              <option value="ACTIVE">Active</option>
              <option value="DEPRECATED">Deprecated</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Pack lifecycle status
            </p>
          </div>

          {/* PHASE 1.2: Owners (Teams and Users) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Users className="inline h-4 w-4 mr-1" />
              Owners (optional)
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              Teams and users responsible for this pack
            </p>

            {/* Add Team */}
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newOwnerTeam}
                onChange={(e) => setNewOwnerTeam(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddOwnerTeam())}
                className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                placeholder="Add team (e.g., platform-team)"
              />
              <button
                type="button"
                onClick={handleAddOwnerTeam}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Add User */}
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newOwnerUser}
                onChange={(e) => setNewOwnerUser(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddOwnerUser())}
                className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                placeholder="Add user (e.g., @username)"
              />
              <button
                type="button"
                onClick={handleAddOwnerUser}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Display Owners */}
            {formData.owners && formData.owners.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.owners.map((owner: any, index: number) => (
                  <span
                    key={index}
                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                      owner.team
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                        : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    }`}
                  >
                    {owner.team ? `Team: ${owner.team}` : `User: ${owner.user}`}
                    <button
                      type="button"
                      onClick={() => handleRemoveOwner(index)}
                      className="ml-2 inline-flex items-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* PHASE 1.2: Labels */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Tag className="inline h-4 w-4 mr-1" />
              Labels (optional)
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              Key-value pairs for categorization and filtering
            </p>

            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newLabelKey}
                onChange={(e) => setNewLabelKey(e.target.value)}
                className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                placeholder="Key (e.g., environment)"
              />
              <input
                type="text"
                value={newLabelValue}
                onChange={(e) => setNewLabelValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddLabel())}
                className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                placeholder="Value (e.g., production)"
              />
              <button
                type="button"
                onClick={handleAddLabel}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Display Labels */}
            {formData.labels && Object.keys(formData.labels).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(formData.labels).map(([key, value]) => (
                  <span
                    key={key}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                  >
                    {key}: {value as string}
                    <button
                      type="button"
                      onClick={() => handleRemoveLabel(key)}
                      className="ml-2 inline-flex items-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* PHASE 1.2: Version Notes */}
          <div>
            <label htmlFor="versionNotes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Version Notes (optional)
            </label>
            <textarea
              id="versionNotes"
              rows={3}
              value={formData.versionNotes || ''}
              onChange={(e) => setFormData({ ...formData, versionNotes: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="Describe changes in this version..."
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Changelog or release notes for this pack version
            </p>
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

