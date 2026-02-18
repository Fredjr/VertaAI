'use client';

import { useState, useEffect } from 'react';
import { Plus, X, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

interface ScopeFormProps {
  formData: any;
  setFormData: (data: any) => void;
}

interface Repository {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  description: string;
  url: string;
}

interface Branch {
  name: string;
  protected: boolean;
}

export default function ScopeForm({ formData, setFormData }: ScopeFormProps) {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [branchIncludeInput, setBranchIncludeInput] = useState('');
  const [branchExcludeInput, setBranchExcludeInput] = useState('');
  const [repoIncludeInput, setRepoIncludeInput] = useState('');
  const [repoExcludeInput, setRepoExcludeInput] = useState('');

  const workspaceId = formData.workspaceId || 'demo-workspace';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  // Check GitHub connection status
  useEffect(() => {
    const checkGitHubStatus = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/github/status`);
        if (response.ok) {
          const data = await response.json();
          setGithubConnected(data.connected);
        }
      } catch (error) {
        console.error('Failed to check GitHub status:', error);
      }
    };
    checkGitHubStatus();
  }, [workspaceId, apiUrl]);

  // Fetch repositories when GitHub is connected
  useEffect(() => {
    if (githubConnected) {
      fetchRepositories();
    }
  }, [githubConnected]);

  const fetchRepositories = async () => {
    setLoadingRepos(true);
    try {
      const response = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/github/repos`);
      if (response.ok) {
        const data = await response.json();
        setRepos(data.repos || []);
      }
    } catch (error) {
      console.error('Failed to fetch repositories:', error);
    } finally {
      setLoadingRepos(false);
    }
  };

  const fetchBranches = async (repoFullName: string) => {
    const [owner, repo] = repoFullName.split('/');
    setLoadingBranches(true);
    try {
      const response = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/github/repos/${owner}/${repo}/branches`);
      if (response.ok) {
        const data = await response.json();
        setBranches(data.branches || []);
      }
    } catch (error) {
      console.error('Failed to fetch branches:', error);
    } finally {
      setLoadingBranches(false);
    }
  };

  const handleRepoSelect = (repoFullName: string) => {
    setSelectedRepo(repoFullName);
    fetchBranches(repoFullName);
  };

  const handleAddBranchInclude = (branchName?: string) => {
    const branch = branchName || branchIncludeInput.trim();
    if (branch && !formData.branchesInclude?.includes(branch)) {
      setFormData({
        ...formData,
        branchesInclude: [...(formData.branchesInclude || []), branch],
      });
      setBranchIncludeInput('');
    }
  };

  const handleAddBranchExclude = (branchName?: string) => {
    const branch = branchName || branchExcludeInput.trim();
    if (branch && !formData.branchesExclude?.includes(branch)) {
      setFormData({
        ...formData,
        branchesExclude: [...(formData.branchesExclude || []), branch],
      });
      setBranchExcludeInput('');
    }
  };

  const handleAddRepoInclude = (repoName?: string) => {
    const repo = repoName || repoIncludeInput.trim();
    if (repo && !formData.reposInclude?.includes(repo)) {
      setFormData({
        ...formData,
        reposInclude: [...(formData.reposInclude || []), repo],
      });
      setRepoIncludeInput('');
    }
  };

  const handleAddRepoExclude = (repoName?: string) => {
    const repo = repoName || repoExcludeInput.trim();
    if (repo && !formData.reposExclude?.includes(repo)) {
      setFormData({
        ...formData,
        reposExclude: [...(formData.reposExclude || []), repo],
      });
      setRepoExcludeInput('');
    }
  };

  const handleRemoveBranchInclude = (index: number) => {
    setFormData({
      ...formData,
      branchesInclude: formData.branchesInclude.filter((_: any, i: number) => i !== index),
    });
  };

  const handleRemoveBranchExclude = (index: number) => {
    setFormData({
      ...formData,
      branchesExclude: formData.branchesExclude.filter((_: any, i: number) => i !== index),
    });
  };

  const handleRemoveRepoInclude = (index: number) => {
    setFormData({
      ...formData,
      reposInclude: formData.reposInclude.filter((_: any, i: number) => i !== index),
    });
  };

  const handleRemoveRepoExclude = (index: number) => {
    setFormData({
      ...formData,
      reposExclude: formData.reposExclude.filter((_: any, i: number) => i !== index),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Scope Configuration
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Define which repositories and branches this policy pack applies to
        </p>

        {/* GitHub Connection Status */}
        {!githubConnected && (
          <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
                  GitHub Not Connected
                </h4>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  Connect your GitHub account to automatically fetch repositories and branches.
                  You can still manually enter repository and branch patterns.
                </p>
              </div>
            </div>
          </div>
        )}

        {githubConnected && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-green-900 dark:text-green-200">
                  GitHub Connected
                </h4>
                <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                  {repos.length} repositories available
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {/* Scope Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Scope Type *
            </label>
            <select
              value={formData.scopeType || 'workspace'}
              onChange={(e) => setFormData({ ...formData, scopeType: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
            >
              <option value="workspace">Workspace (all repos)</option>
              <option value="service">Service (specific service)</option>
              <option value="repo">Repository (specific repo)</option>
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Workspace applies to all repos, Service applies to a specific service, Repo applies to a specific repository
            </p>
          </div>

          {/* Scope Reference (for service/repo types) */}
          {(formData.scopeType === 'service' || formData.scopeType === 'repo') && (
            <div>
              <label htmlFor="scopeRef" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {formData.scopeType === 'service' ? 'Service Name' : 'Repository Name'} *
              </label>
              <input
                type="text"
                id="scopeRef"
                value={formData.scopeRef || ''}
                onChange={(e) => setFormData({ ...formData, scopeRef: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                placeholder={formData.scopeType === 'service' ? 'e.g., payment-service' : 'e.g., owner/repo-name'}
                required
              />
            </div>
          )}

          {/* PHASE 1.3: Scope Priority */}
          <div>
            <label htmlFor="scopePriority" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Scope Priority (0-100)
            </label>
            <input
              type="number"
              id="scopePriority"
              min="0"
              max="100"
              value={formData.scopePriority ?? 50}
              onChange={(e) => setFormData({ ...formData, scopePriority: parseInt(e.target.value) || 50 })}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Higher priority packs take precedence when multiple packs apply (default: 50)
            </p>
          </div>

          {/* PHASE 1.3: Scope Merge Strategy */}
          <div>
            <label htmlFor="scopeMergeStrategy" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Merge Strategy
            </label>
            <select
              id="scopeMergeStrategy"
              value={formData.scopeMergeStrategy || 'MOST_RESTRICTIVE'}
              onChange={(e) => setFormData({ ...formData, scopeMergeStrategy: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
            >
              <option value="MOST_RESTRICTIVE">Most Restrictive (take strictest rule from all packs)</option>
              <option value="HIGHEST_PRIORITY">Highest Priority (use rules from highest priority pack only)</option>
              <option value="EXPLICIT">Explicit (require manual conflict resolution)</option>
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              How to resolve conflicts when multiple packs apply to the same scope
            </p>
          </div>

          {/* Repository Filters */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Repository Filters
            </label>

            {/* Include Repos */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                Include Repositories
              </label>

              {/* Repository Dropdown (if GitHub connected) */}
              {githubConnected && repos.length > 0 && (
                <div className="mb-2">
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddRepoInclude(e.target.value);
                        handleRepoSelect(e.target.value);
                      }
                    }}
                    className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    disabled={loadingRepos}
                  >
                    <option value="">
                      {loadingRepos ? 'Loading repositories...' : 'Select a repository to add'}
                    </option>
                    {repos.map((repo) => (
                      <option key={repo.id} value={repo.fullName}>
                        {repo.fullName} {repo.private ? '(private)' : '(public)'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Manual Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={repoIncludeInput}
                  onChange={(e) => setRepoIncludeInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddRepoInclude())}
                  className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                  placeholder="e.g., owner/repo-name or owner/*"
                />
                <button
                  type="button"
                  onClick={() => handleAddRepoInclude()}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Display included repos as tags */}
              {formData.reposInclude && formData.reposInclude.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {formData.reposInclude.map((repo: string, index: number) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-xs rounded-md"
                    >
                      {repo}
                      <button
                        type="button"
                        onClick={() => handleRemoveRepoInclude(index)}
                        className="hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Exclude Repos */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                Exclude Repositories
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={repoExcludeInput}
                  onChange={(e) => setRepoExcludeInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddRepoExclude())}
                  className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                  placeholder="e.g., owner/archived-repo or */test-*"
                />
                <button
                  type="button"
                  onClick={() => handleAddRepoExclude()}
                  className="px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Display excluded repos as tags */}
              {formData.reposExclude && formData.reposExclude.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {formData.reposExclude.map((repo: string, index: number) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs rounded-md"
                    >
                      {repo}
                      <button
                        type="button"
                        onClick={() => handleRemoveRepoExclude(index)}
                        className="hover:text-gray-600 dark:hover:text-gray-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Branch Filters */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Branch Filters
            </label>

            {/* Include Branches */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                Include Branches
              </label>

              {/* Branch Dropdown (if repo selected and GitHub connected) */}
              {githubConnected && selectedRepo && branches.length > 0 && (
                <div className="mb-2">
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddBranchInclude(e.target.value);
                      }
                    }}
                    className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    disabled={loadingBranches}
                  >
                    <option value="">
                      {loadingBranches ? 'Loading branches...' : `Select a branch from ${selectedRepo}`}
                    </option>
                    {branches.map((branch) => (
                      <option key={branch.name} value={branch.name}>
                        {branch.name} {branch.protected ? '(protected)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Manual Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={branchIncludeInput}
                  onChange={(e) => setBranchIncludeInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddBranchInclude())}
                  className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                  placeholder="e.g., main, release/*, feature/*"
                />
                <button
                  type="button"
                  onClick={() => handleAddBranchInclude()}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Display included branches as tags */}
              {formData.branchesInclude && formData.branchesInclude.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {formData.branchesInclude.map((branch: string, index: number) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-xs rounded-md"
                    >
                      {branch}
                      <button
                        type="button"
                        onClick={() => handleRemoveBranchInclude(index)}
                        className="hover:text-green-600 dark:hover:text-green-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Exclude Branches */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                Exclude Branches
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={branchExcludeInput}
                  onChange={(e) => setBranchExcludeInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddBranchExclude())}
                  className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                  placeholder="e.g., dependabot/*, renovate/*"
                />
                <button
                  type="button"
                  onClick={() => handleAddBranchExclude()}
                  className="px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Display excluded branches as tags */}
              {formData.branchesExclude && formData.branchesExclude.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {formData.branchesExclude.map((branch: string, index: number) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs rounded-md"
                    >
                      {branch}
                      <button
                        type="button"
                        onClick={() => handleRemoveBranchExclude(index)}
                        className="hover:text-gray-600 dark:hover:text-gray-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Refresh Button */}
          {githubConnected && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={fetchRepositories}
                disabled={loadingRepos}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <RefreshCw className={`h-4 w-4 ${loadingRepos ? 'animate-spin' : ''}`} />
                Refresh Repositories
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

