'use client';

import { Plus, X } from 'lucide-react';
import { useState } from 'react';

interface ApprovalTiersFormProps {
  formData: any;
  setFormData: (data: any) => void;
}

export default function ApprovalTiersForm({ formData, setFormData }: ApprovalTiersFormProps) {
  const [newUser, setNewUser] = useState('');
  const [newTeam, setNewTeam] = useState('');
  const [selectedTier, setSelectedTier] = useState<'tier1' | 'tier2' | 'tier3'>('tier1');

  const approvalTiers = formData.approvalTiers || { tier1: { users: [], teams: [] }, tier2: { users: [], teams: [] }, tier3: { users: [], teams: [] } };

  const updateApprovalTiers = (updates: any) => {
    setFormData({
      ...formData,
      approvalTiers: {
        ...approvalTiers,
        ...updates,
      },
    });
  };

  const addUser = () => {
    if (newUser.trim()) {
      const tier = approvalTiers[selectedTier] || { users: [], teams: [] };
      updateApprovalTiers({
        [selectedTier]: {
          ...tier,
          users: [...(tier.users || []), newUser.trim()],
        },
      });
      setNewUser('');
    }
  };

  const removeUser = (tier: string, index: number) => {
    const tierData = approvalTiers[tier] || { users: [], teams: [] };
    updateApprovalTiers({
      [tier]: {
        ...tierData,
        users: tierData.users.filter((_: any, i: number) => i !== index),
      },
    });
  };

  const addTeam = () => {
    if (newTeam.trim()) {
      const tier = approvalTiers[selectedTier] || { users: [], teams: [] };
      updateApprovalTiers({
        [selectedTier]: {
          ...tier,
          teams: [...(tier.teams || []), newTeam.trim()],
        },
      });
      setNewTeam('');
    }
  };

  const removeTeam = (tier: string, index: number) => {
    const tierData = approvalTiers[tier] || { users: [], teams: [] };
    updateApprovalTiers({
      [tier]: {
        ...tierData,
        teams: tierData.teams.filter((_: any, i: number) => i !== index),
      },
    });
  };

  return (
    <div className="space-y-8">
      {/* Section 1: Approval Tiers */}
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Approval Tiers
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Configure approval tiers for contract violations and drift findings
          </p>
        </div>

      {/* Tier Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Select Tier to Configure
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(['tier1', 'tier2', 'tier3'] as const).map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => setSelectedTier(tier)}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                selectedTier === tier
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {tier === 'tier1' ? 'Tier 1 (Low)' : tier === 'tier2' ? 'Tier 2 (Medium)' : 'Tier 3 (High)'}
            </button>
          ))}
        </div>
      </div>

      {/* Users */}
      <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Users for {selectedTier === 'tier1' ? 'Tier 1' : selectedTier === 'tier2' ? 'Tier 2' : 'Tier 3'}
        </label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newUser}
            onChange={(e) => setNewUser(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addUser())}
            className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
            placeholder="e.g., @username"
          />
          <button
            type="button"
            onClick={addUser}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {approvalTiers[selectedTier]?.users && approvalTiers[selectedTier].users.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {approvalTiers[selectedTier].users.map((user: string, index: number) => (
              <span
                key={index}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
              >
                {user}
                <button
                  type="button"
                  onClick={() => removeUser(selectedTier, index)}
                  className="ml-2 inline-flex items-center"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Teams */}
      <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Teams for {selectedTier === 'tier1' ? 'Tier 1' : selectedTier === 'tier2' ? 'Tier 2' : 'Tier 3'}
        </label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newTeam}
            onChange={(e) => setNewTeam(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTeam())}
            className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
            placeholder="e.g., @platform-team"
          />
          <button
            type="button"
            onClick={addTeam}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {approvalTiers[selectedTier]?.teams && approvalTiers[selectedTier].teams.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {approvalTiers[selectedTier].teams.map((team: string, index: number) => (
              <span
                key={index}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
              >
                {team}
                <button
                  type="button"
                  onClick={() => removeTeam(selectedTier, index)}
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

      {/* Section 2: GitHub Check Configuration */}
      <div className="space-y-6 border-t border-gray-200 dark:border-gray-700 pt-8">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            GitHub Check Configuration
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Configure how policy pack results are displayed in GitHub
          </p>
        </div>

        {/* Check Run Name */}
        <div>
          <label htmlFor="checkRunName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Check Run Name *
          </label>
          <input
            type="text"
            id="checkRunName"
            value={formData.checkRunName || 'Policy Pack Validation'}
            onChange={(e) => setFormData({ ...formData, checkRunName: e.target.value })}
            className="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
            placeholder="e.g., Policy Pack Validation"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            The name that will appear in GitHub's Checks tab
          </p>
        </div>

        {/* Post Summary Comment */}
        <div className="flex items-start">
          <div className="flex items-center h-5">
            <input
              type="checkbox"
              id="postSummaryComment"
              checked={formData.postSummaryComment !== false}
              onChange={(e) => setFormData({ ...formData, postSummaryComment: e.target.checked })}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
          </div>
          <div className="ml-3">
            <label htmlFor="postSummaryComment" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Post Summary Comment
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Post a comment on the PR with a summary of policy pack results
            </p>
          </div>
        </div>

        {/* Annotate Files */}
        <div className="flex items-start">
          <div className="flex items-center h-5">
            <input
              type="checkbox"
              id="annotateFiles"
              checked={formData.annotateFiles !== false}
              onChange={(e) => setFormData({ ...formData, annotateFiles: e.target.checked })}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
          </div>
          <div className="ml-3">
            <label htmlFor="annotateFiles" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Annotate Files
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Add inline annotations to files with policy violations
            </p>
          </div>
        </div>

        {/* Conclusion Mapping */}
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            Conclusion Mapping
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Map policy pack decisions to GitHub check conclusions
          </p>

          {/* Block Decision */}
          <div>
            <label htmlFor="conclusionBlock" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              When decision is BLOCK
            </label>
            <select
              id="conclusionBlock"
              value={formData.conclusionMapping?.block || 'failure'}
              onChange={(e) => setFormData({
                ...formData,
                conclusionMapping: {
                  ...formData.conclusionMapping,
                  block: e.target.value,
                },
              })}
              className="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
            >
              <option value="failure">Failure (prevents merge)</option>
              <option value="neutral">Neutral (informational)</option>
              <option value="action_required">Action Required</option>
            </select>
          </div>

          {/* Warn Decision */}
          <div>
            <label htmlFor="conclusionWarn" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              When decision is WARN
            </label>
            <select
              id="conclusionWarn"
              value={formData.conclusionMapping?.warn || 'neutral'}
              onChange={(e) => setFormData({
                ...formData,
                conclusionMapping: {
                  ...formData.conclusionMapping,
                  warn: e.target.value,
                },
              })}
              className="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
            >
              <option value="neutral">Neutral (informational)</option>
              <option value="failure">Failure (prevents merge)</option>
              <option value="action_required">Action Required</option>
            </select>
          </div>

          {/* Pass Decision */}
          <div>
            <label htmlFor="conclusionPass" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              When decision is PASS
            </label>
            <select
              id="conclusionPass"
              value={formData.conclusionMapping?.pass || 'success'}
              onChange={(e) => setFormData({
                ...formData,
                conclusionMapping: {
                  ...formData.conclusionMapping,
                  pass: e.target.value,
                },
              })}
              className="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
            >
              <option value="success">Success</option>
              <option value="neutral">Neutral</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
