'use client';

import { useState } from 'react';
import { Plus, X, Users, Tag, Globe, Layers } from 'lucide-react';

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

          {/* Pack Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Pack Type *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                formData.packType === 'GLOBAL_BASELINE'
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}>
                <input type="radio" value="GLOBAL_BASELINE" checked={formData.packType === 'GLOBAL_BASELINE'}
                  onChange={(e) => setFormData({ ...formData, packType: e.target.value })}
                  className="mt-0.5 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <Globe className="h-4 w-4 text-indigo-500" />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">Global Baseline</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Cross-cutting invariants applied workspace-wide. Service overlays stack on top.</p>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                formData.packType === 'SERVICE_OVERLAY'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}>
                <input type="radio" value="SERVICE_OVERLAY" checked={formData.packType === 'SERVICE_OVERLAY'}
                  onChange={(e) => setFormData({ ...formData, packType: e.target.value })}
                  className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">Service Overlay</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Service- or repo-specific rules that extend or override the global baseline.</p>
                </div>
              </label>
            </div>
          </div>

          {/* Enforcement Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Enforcement Mode *
            </label>
            <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
              {([
                { value: 'observe', label: '👁 Monitor', hint: 'Log only, never block' },
                { value: 'warn',    label: '⚠️ Warn',    hint: 'Allow but annotate PR' },
                { value: 'enforce', label: '🚫 Block',   hint: 'Block PRs on violations' },
              ] as const).map(({ value, label, hint }, idx) => (
                <button key={value} type="button"
                  onClick={() => setFormData({ ...formData, packMode: value })}
                  className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${idx > 0 ? 'border-l border-gray-300 dark:border-gray-600' : ''} ${
                    formData.packMode === value
                      ? value === 'enforce' ? 'bg-red-600 text-white' : value === 'warn' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}>
                  <div>{label}</div>
                  <div className={`text-xs mt-0.5 ${formData.packMode === value ? 'opacity-80' : 'text-gray-400'}`}>{hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Evidence Health Defaults */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Evidence Health Defaults
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              What to do when a fact value cannot be resolved (e.g., scanner didn't run, data unavailable)
            </p>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">On unknown evidence:</span>
              <select value={formData.defaultDecisionOnUnknown || 'warn'}
                onChange={(e) => setFormData({ ...formData, defaultDecisionOnUnknown: e.target.value })}
                className="rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm">
                <option value="pass">✅ Pass (assume OK)</option>
                <option value="warn">⚠️ Warn (flag but allow)</option>
                <option value="block">🚫 Block (fail safe)</option>
              </select>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Individual rules can override this default via <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">decisionOnUnknown</code>.
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
    </div>
  );
}
