'use client';

import { useState, useEffect } from 'react';
import { Clock, AlertTriangle, CheckCircle, Shield, GitPullRequest, Plus, X, ChevronDown, ChevronRight, FileCode, Check, Eye } from 'lucide-react';

interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  ruleCount: number;
  packMode: string;
  strictness: string;
}

interface PackDefaultsFormProps {
  formData: any;
  setFormData: (data: any) => void;
}

export default function PackDefaultsForm({ formData, setFormData }: PackDefaultsFormProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    template: true,
    timeouts: false,
    severity: false,
    approvals: false,
    obligations: false,
    triggers: false,
  });

  // Template picker state
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [previewYaml, setPreviewYaml] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const workspaceId = formData.workspaceId || 'demo-workspace';

  useEffect(() => {
    const fetchTemplates = async () => {
      setLoadingTemplates(true);
      try {
        const res = await fetch(`${apiBase}/api/workspaces/${workspaceId}/policy-packs/templates`);
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.templates || []);
        }
      } catch (err) {
        console.error('Failed to load templates', err);
      } finally {
        setLoadingTemplates(false);
      }
    };
    fetchTemplates();
  }, [workspaceId]);

  const handlePreviewTemplate = async (templateId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/workspaces/${workspaceId}/policy-packs/templates/${templateId}`);
      if (res.ok) {
        const data = await res.json();
        setPreviewYaml(data.template?.yaml || '');
        setShowPreview(true);
      }
    } catch (err) {
      console.error('Failed to preview template', err);
    }
  };

  const handleUseTemplate = async (templateId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/workspaces/${workspaceId}/policy-packs/templates/${templateId}`);
      if (res.ok) {
        const data = await res.json();
        const yaml = data.template?.yaml || '';
        setSelectedTemplateId(templateId);
        setFormData({
          ...formData,
          trackAConfigYamlDraft: yaml,
          trackAEnabled: true,
        });
      }
    } catch (err) {
      console.error('Failed to use template', err);
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      starter: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      standard: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      strict: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      security: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      documentation: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      infrastructure: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      microservices: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
      packset: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    };
    return colors[category] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  };

  const toggleSection = (section: string) => {
    setExpandedSections({
      ...expandedSections,
      [section]: !expandedSections[section],
    });
  };

  const defaults = formData.defaults || {};

  const updateDefaults = (category: string, updates: any) => {
    setFormData({
      ...formData,
      defaults: {
        ...defaults,
        [category]: {
          ...(defaults[category] || {}),
          ...updates,
        },
      },
    });
  };

  const [newTeam, setNewTeam] = useState('');
  const [newUser, setNewUser] = useState('');

  const handleAddTeam = () => {
    if (newTeam.trim()) {
      const teams = defaults.approvals?.requiredTeams || [];
      updateDefaults('approvals', {
        requiredTeams: [...teams, newTeam.trim()],
      });
      setNewTeam('');
    }
  };

  const handleRemoveTeam = (index: number) => {
    const teams = [...(defaults.approvals?.requiredTeams || [])];
    teams.splice(index, 1);
    updateDefaults('approvals', { requiredTeams: teams });
  };

  const handleAddUser = () => {
    if (newUser.trim()) {
      const users = defaults.approvals?.requiredUsers || [];
      updateDefaults('approvals', {
        requiredUsers: [...users, newUser.trim()],
      });
      setNewUser('');
    }
  };

  const handleRemoveUser = (index: number) => {
    const users = [...(defaults.approvals?.requiredUsers || [])];
    users.splice(index, 1);
    updateDefaults('approvals', { requiredUsers: users });
  };

  const handleTogglePrEvent = (event: string) => {
    const events = defaults.triggers?.defaultPrEvents || [];
    if (events.includes(event)) {
      updateDefaults('triggers', {
        defaultPrEvents: events.filter((e: string) => e !== event),
      });
    } else {
      updateDefaults('triggers', {
        defaultPrEvents: [...events, event],
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Pack-Level Defaults
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Start from one of the pre-built templates below, then fine-tune the defaults. Rules can always override pack-level defaults.
        </p>
      </div>

      {/* ── Template Picker ── */}
      <div className="border border-blue-200 dark:border-blue-700 rounded-lg">
        <button
          type="button"
          onClick={() => toggleSection('template')}
          className="w-full flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-t-lg"
        >
          <div className="flex items-center gap-2">
            <FileCode className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span className="font-medium text-gray-900 dark:text-white">Start from a Template</span>
            {selectedTemplateId && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full">
                <Check className="h-3 w-3" /> Template loaded
              </span>
            )}
          </div>
          {expandedSections.template ? (
            <ChevronDown className="h-5 w-5 text-gray-500" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-500" />
          )}
        </button>
        {expandedSections.template && (
          <div className="p-4">
            {loadingTemplates ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading templates…</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No templates available.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className={`relative border rounded-lg p-3 transition-shadow hover:shadow-md ${
                      selectedTemplateId === tpl.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'
                    }`}
                  >
                    {selectedTemplateId === tpl.id && (
                      <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-500 text-white rounded-full">
                        <Check className="h-3 w-3" /> Selected
                      </span>
                    )}
                    <div className="mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(tpl.category)}`}>
                        {tpl.category}
                      </span>
                    </div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">{tpl.name}</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 line-clamp-2">{tpl.description}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                      <span>{tpl.ruleCount} rules</span>
                      <span>·</span>
                      <span className="capitalize">{tpl.packMode}</span>
                      <span>·</span>
                      <span className="capitalize">{tpl.strictness}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handlePreviewTemplate(tpl.id)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        <Eye className="h-3 w-3" /> Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUseTemplate(tpl.id)}
                        className="flex-1 px-2 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-700"
                      >
                        Use
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {showPreview && previewYaml && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[75vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-medium text-gray-900 dark:text-white">Template YAML Preview</h3>
              <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-xs text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 p-3 rounded overflow-x-auto whitespace-pre-wrap">{previewYaml}</pre>
            </div>
            <div className="flex justify-end p-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setShowPreview(false)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Timeouts Section */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
        <button
          type="button"
          onClick={() => toggleSection('timeouts')}
          className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 rounded-t-lg"
        >
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span className="font-medium text-gray-900 dark:text-white">Timeout Defaults</span>
          </div>
          {expandedSections.timeouts ? (
            <ChevronDown className="h-5 w-5 text-gray-500" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-500" />
          )}
        </button>

        {expandedSections.timeouts && (
          <div className="p-4 space-y-4">
            <div>
              <label htmlFor="comparatorTimeout" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Comparator Timeout (ms)
              </label>
              <input
                type="number"
                id="comparatorTimeout"
                min="0"
                value={defaults.timeouts?.comparatorTimeout || ''}
                onChange={(e) => updateDefaults('timeouts', { comparatorTimeout: parseInt(e.target.value) || undefined })}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                placeholder="e.g., 5000"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Default timeout per comparator in milliseconds
              </p>
            </div>

            <div>
              <label htmlFor="totalEvaluationTimeout" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Total Evaluation Timeout (ms)
              </label>
              <input
                type="number"
                id="totalEvaluationTimeout"
                min="0"
                value={defaults.timeouts?.totalEvaluationTimeout || ''}
                onChange={(e) => updateDefaults('timeouts', { totalEvaluationTimeout: parseInt(e.target.value) || undefined })}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                placeholder="e.g., 30000"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Default total evaluation timeout in milliseconds
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Severity Section */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
        <button
          type="button"
          onClick={() => toggleSection('severity')}
          className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            <span className="font-medium text-gray-900 dark:text-white">Severity Defaults</span>
          </div>
          {expandedSections.severity ? (
            <ChevronDown className="h-5 w-5 text-gray-500" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-500" />
          )}
        </button>

        {expandedSections.severity && (
          <div className="p-4 space-y-4">
            <div>
              <label htmlFor="defaultLevel" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Default Severity Level
              </label>
              <select
                id="defaultLevel"
                value={defaults.severity?.defaultLevel || ''}
                onChange={(e) => updateDefaults('severity', { defaultLevel: e.target.value || undefined })}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
              >
                <option value="">Not set</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Default severity level for rule violations
              </p>
            </div>

            <div>
              <label htmlFor="escalationThreshold" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Escalation Threshold
              </label>
              <input
                type="number"
                id="escalationThreshold"
                min="0"
                value={defaults.severity?.escalationThreshold || ''}
                onChange={(e) => updateDefaults('severity', { escalationThreshold: parseInt(e.target.value) || undefined })}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                placeholder="e.g., 3"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Number of violations before escalating severity
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Approvals Section */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
        <button
          type="button"
          onClick={() => toggleSection('approvals')}
          className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750"
        >
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            <span className="font-medium text-gray-900 dark:text-white">Approval Defaults</span>
          </div>
          {expandedSections.approvals ? (
            <ChevronDown className="h-5 w-5 text-gray-500" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-500" />
          )}
        </button>

        {expandedSections.approvals && (
          <div className="p-4 space-y-4">
            <div>
              <label htmlFor="minCount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Minimum Approval Count
              </label>
              <input
                type="number"
                id="minCount"
                min="0"
                value={defaults.approvals?.minCount || ''}
                onChange={(e) => updateDefaults('approvals', { minCount: parseInt(e.target.value) || undefined })}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                placeholder="e.g., 2"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Default minimum number of approvals required
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Required Teams
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newTeam}
                  onChange={(e) => setNewTeam(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTeam())}
                  className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                  placeholder="e.g., security-team"
                />
                <button
                  type="button"
                  onClick={handleAddTeam}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {defaults.approvals?.requiredTeams && defaults.approvals.requiredTeams.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {defaults.approvals.requiredTeams.map((team: string, index: number) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                    >
                      {team}
                      <button
                        type="button"
                        onClick={() => handleRemoveTeam(index)}
                        className="ml-2 inline-flex items-center"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Required Users
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newUser}
                  onChange={(e) => setNewUser(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddUser())}
                  className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                  placeholder="e.g., @username"
                />
                <button
                  type="button"
                  onClick={handleAddUser}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {defaults.approvals?.requiredUsers && defaults.approvals.requiredUsers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {defaults.approvals.requiredUsers.map((user: string, index: number) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    >
                      {user}
                      <button
                        type="button"
                        onClick={() => handleRemoveUser(index)}
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
        )}
      </div>

      {/* Obligations Section */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
        <button
          type="button"
          onClick={() => toggleSection('obligations')}
          className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750"
        >
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-600 dark:text-red-400" />
            <span className="font-medium text-gray-900 dark:text-white">Obligation Defaults</span>
          </div>
          {expandedSections.obligations ? (
            <ChevronDown className="h-5 w-5 text-gray-500" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-500" />
          )}
        </button>

        {expandedSections.obligations && (
          <div className="p-4 space-y-4">
            <div>
              <label htmlFor="defaultDecisionOnFail" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Default Decision on Failure
              </label>
              <select
                id="defaultDecisionOnFail"
                value={defaults.obligations?.defaultDecisionOnFail || ''}
                onChange={(e) => updateDefaults('obligations', { defaultDecisionOnFail: e.target.value || undefined })}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
              >
                <option value="">Not set</option>
                <option value="block">Block (fail the check)</option>
                <option value="warn">Warn (pass with warning)</option>
                <option value="pass">Pass (ignore failure)</option>
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Default action when an obligation fails
              </p>
            </div>

            <div>
              <label htmlFor="defaultObligationSeverity" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Default Obligation Severity
              </label>
              <select
                id="defaultObligationSeverity"
                value={defaults.obligations?.defaultSeverity || ''}
                onChange={(e) => updateDefaults('obligations', { defaultSeverity: e.target.value || undefined })}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
              >
                <option value="">Not set</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Default severity level for obligation violations
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Triggers Section */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
        <button
          type="button"
          onClick={() => toggleSection('triggers')}
          className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750"
        >
          <div className="flex items-center gap-2">
            <GitPullRequest className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            <span className="font-medium text-gray-900 dark:text-white">Trigger Defaults</span>
          </div>
          {expandedSections.triggers ? (
            <ChevronDown className="h-5 w-5 text-gray-500" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-500" />
          )}
        </button>

        {expandedSections.triggers && (
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Default PR Events
              </label>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Select which PR events should trigger policy evaluation by default
              </p>
              <div className="space-y-2">
                {['opened', 'synchronize', 'reopened', 'labeled'].map((event) => (
                  <label key={event} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={(defaults.triggers?.defaultPrEvents || []).includes(event)}
                      onChange={() => handleTogglePrEvent(event)}
                      className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 capitalize">
                      {event}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

