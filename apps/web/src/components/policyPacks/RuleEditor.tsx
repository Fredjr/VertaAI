'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Sparkles } from 'lucide-react';
import ComparatorSelector from './ComparatorSelector';
import GlobPatternTester from './GlobPatternTester';
import ConditionBuilder from './ConditionBuilder';

// Condition types (matches backend)
interface SimpleCondition {
  fact: string;
  operator: string;
  value: any;
}

interface CompositeCondition {
  operator: 'AND' | 'OR' | 'NOT';
  conditions: Condition[];
}

type Condition = SimpleCondition | CompositeCondition;

/** One entry in the REQUIRE approvals grammar */
interface ApprovalRequirement {
  resolver: string;    // team slug or role, e.g. "security-team", "service-owner"
  minCount: number;    // minimum approvers required
  when?: string;       // optional predicate string, e.g. "endpoint_added"
}

interface Rule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: {
    always?: boolean;
    anyChangedPaths?: string[];
    anyFileExtensions?: string[];
    anyChangedPathsRef?: string;
    /** Semantic ChangeSurface IDs that trigger this rule */
    changeSurface?: string[];
  };
  obligations: Array<{
    // PHASE 2.4: Support both comparator-based and condition-based obligations
    comparator?: string;
    params?: Record<string, any>;
    condition?: Condition;
    conditions?: Condition[];
    severity: 'low' | 'medium' | 'high' | 'critical';
    decisionOnFail: 'pass' | 'warn' | 'block';
    decisionOnUnknown: 'pass' | 'warn' | 'block';
    message?: string;
  }>;
  /** REQUIRE grammar: structured approval requirements */
  approvals?: ApprovalRequirement[];
  skipIf?: {
    labels?: string[];
    actors?: string[];
  };
  excludePaths?: string[];
}

interface RuleEditorProps {
  rule: Rule;
  isOpen: boolean;
  onClose: () => void;
  onSave: (rule: Rule) => void;
}

// All semantic ChangeSurface IDs (subset of canonical catalog — shown in picker)
const CHANGE_SURFACE_OPTIONS = [
  { id: 'openapi_changed', label: '📋 OpenAPI Spec Changed' },
  { id: 'graphql_schema_changed', label: '🔷 GraphQL Schema Changed' },
  { id: 'proto_changed', label: '⚡ Protobuf Schema Changed' },
  { id: 'db_schema_changed', label: '🗄️ DB Schema Changed' },
  { id: 'migration_added', label: '📦 Migration Added' },
  { id: 'terraform_changed', label: '🏗️ Terraform Changed' },
  { id: 'k8s_manifest_changed', label: '☸️ K8s Manifest Changed' },
  { id: 'alert_rule_changed', label: '🔔 Alert Rule Changed' },
  { id: 'slo_threshold_changed', label: '📈 SLO Threshold Changed' },
  { id: 'codeowners_changed', label: '👥 CODEOWNERS Changed' },
  { id: 'authz_policy_changed', label: '🔐 AuthZ Policy Changed' },
  { id: 'agent_authored_sensitive_change', label: '🤖 AI Agent Authored Change' },
];

export default function RuleEditor({ rule, isOpen, onClose, onSave }: RuleEditorProps) {
  const [editedRule, setEditedRule] = useState<Rule>(rule);
  const [newPath, setNewPath] = useState('');
  const [newExtension, setNewExtension] = useState('');
  const [newExcludePath, setNewExcludePath] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newActor, setNewActor] = useState('');
  const [newApprovalResolver, setNewApprovalResolver] = useState('');
  const [newApprovalMinCount, setNewApprovalMinCount] = useState(1);
  const [newApprovalWhen, setNewApprovalWhen] = useState('');
  // PHASE 2.4: Track obligation mode (comparator vs condition) for each obligation
  const [obligationModes, setObligationModes] = useState<Array<'comparator' | 'condition'>>([]);

  useEffect(() => {
    setEditedRule(rule);
    // Initialize obligation modes based on existing obligations
    const modes = rule.obligations.map(o =>
      (o.condition || o.conditions) ? 'condition' : 'comparator'
    );
    setObligationModes(modes);
  }, [rule]);

  const handleSave = () => {
    onSave(editedRule);
    onClose();
  };

  const handleAddObligation = () => {
    setEditedRule({
      ...editedRule,
      obligations: [
        ...editedRule.obligations,
        {
          comparator: '',
          severity: 'medium',
          decisionOnFail: 'warn',
          decisionOnUnknown: 'warn',
        },
      ],
    });
    // Default to comparator mode for new obligations
    setObligationModes([...obligationModes, 'comparator']);
  };

  const handleRemoveObligation = (index: number) => {
    setEditedRule({
      ...editedRule,
      obligations: editedRule.obligations.filter((_, i) => i !== index),
    });
    setObligationModes(obligationModes.filter((_, i) => i !== index));
  };

  const handleToggleObligationMode = (index: number) => {
    const newMode = obligationModes[index] === 'comparator' ? 'condition' : 'comparator';
    setObligationModes(obligationModes.map((m, i) => i === index ? newMode : m));

    // Clear the opposite mode's fields when switching
    if (newMode === 'condition') {
      handleUpdateObligation(index, { comparator: undefined, params: undefined });
    } else {
      handleUpdateObligation(index, { condition: undefined, conditions: undefined });
    }
  };

  const handleUpdateObligation = (index: number, updates: Partial<Rule['obligations'][0]>) => {
    setEditedRule({
      ...editedRule,
      obligations: editedRule.obligations.map((o, i) =>
        i === index ? { ...o, ...updates } : o
      ),
    });
  };

  const handleAddPath = () => {
    if (newPath.trim()) {
      setEditedRule({
        ...editedRule,
        trigger: {
          ...editedRule.trigger,
          anyChangedPaths: [...(editedRule.trigger.anyChangedPaths || []), newPath.trim()],
        },
      });
      setNewPath('');
    }
  };

  const handleRemovePath = (index: number) => {
    setEditedRule({
      ...editedRule,
      trigger: {
        ...editedRule.trigger,
        anyChangedPaths: editedRule.trigger.anyChangedPaths?.filter((_, i) => i !== index),
      },
    });
  };

  const handleAddExtension = () => {
    if (newExtension.trim()) {
      setEditedRule({
        ...editedRule,
        trigger: {
          ...editedRule.trigger,
          anyFileExtensions: [...(editedRule.trigger.anyFileExtensions || []), newExtension.trim()],
        },
      });
      setNewExtension('');
    }
  };

  const handleRemoveExtension = (index: number) => {
    setEditedRule({
      ...editedRule,
      trigger: {
        ...editedRule.trigger,
        anyFileExtensions: editedRule.trigger.anyFileExtensions?.filter((_, i) => i !== index),
      },
    });
  };

  const handleAddExcludePath = () => {
    if (newExcludePath.trim()) {
      setEditedRule({
        ...editedRule,
        excludePaths: [...(editedRule.excludePaths || []), newExcludePath.trim()],
      });
      setNewExcludePath('');
    }
  };

  const handleRemoveExcludePath = (index: number) => {
    setEditedRule({
      ...editedRule,
      excludePaths: editedRule.excludePaths?.filter((_, i) => i !== index),
    });
  };

  const handleAddLabel = () => {
    if (newLabel.trim()) {
      setEditedRule({
        ...editedRule,
        skipIf: {
          ...editedRule.skipIf,
          labels: [...(editedRule.skipIf?.labels || []), newLabel.trim()],
        },
      });
      setNewLabel('');
    }
  };

  const handleRemoveLabel = (index: number) => {
    setEditedRule({
      ...editedRule,
      skipIf: {
        ...editedRule.skipIf,
        labels: editedRule.skipIf?.labels?.filter((_, i) => i !== index),
      },
    });
  };

  const handleAddActor = () => {
    if (newActor.trim()) {
      setEditedRule({
        ...editedRule,
        skipIf: {
          ...editedRule.skipIf,
          actors: [...(editedRule.skipIf?.actors || []), newActor.trim()],
        },
      });
      setNewActor('');
    }
  };

  const handleRemoveActor = (index: number) => {
    setEditedRule({
      ...editedRule,
      skipIf: {
        ...editedRule.skipIf,
        actors: editedRule.skipIf?.actors?.filter((_, i) => i !== index),
      },
    });
  };

  const handleToggleChangeSurface = (surfaceId: string) => {
    const current = editedRule.trigger.changeSurface || [];
    const updated = current.includes(surfaceId)
      ? current.filter(s => s !== surfaceId)
      : [...current, surfaceId];
    setEditedRule({ ...editedRule, trigger: { ...editedRule.trigger, changeSurface: updated } });
  };

  const handleAddApproval = () => {
    if (!newApprovalResolver.trim()) return;
    setEditedRule({
      ...editedRule,
      approvals: [
        ...(editedRule.approvals || []),
        { resolver: newApprovalResolver.trim(), minCount: newApprovalMinCount, when: newApprovalWhen.trim() || undefined },
      ],
    });
    setNewApprovalResolver('');
    setNewApprovalMinCount(1);
    setNewApprovalWhen('');
  };

  const handleRemoveApproval = (index: number) => {
    setEditedRule({ ...editedRule, approvals: editedRule.approvals?.filter((_, i) => i !== index) });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Edit Rule: {editedRule.name}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Basic Information</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Rule Name *
                </label>
                <input
                  type="text"
                  value={editedRule.name}
                  onChange={(e) => setEditedRule({ ...editedRule, name: e.target.value })}
                  className="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                  placeholder="e.g., Require README updates"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={editedRule.description || ''}
                  onChange={(e) => setEditedRule({ ...editedRule, description: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                  placeholder="Describe what this rule checks for..."
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={editedRule.enabled}
                  onChange={(e) => setEditedRule({ ...editedRule, enabled: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="enabled" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                  Rule enabled
                </label>
              </div>
            </div>

            {/* Trigger Configuration */}
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Trigger Configuration</h3>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="always"
                  checked={editedRule.trigger.always || false}
                  onChange={(e) => setEditedRule({
                    ...editedRule,
                    trigger: { ...editedRule.trigger, always: e.target.checked }
                  })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="always" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                  Always trigger (run on every PR)
                </label>
              </div>

              {/* ChangeSurface picker (available regardless of always flag) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Trigger on Change Surfaces <span className="font-normal text-gray-500">(semantic surfaces — auto-maps to paths)</span>
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {CHANGE_SURFACE_OPTIONS.map(opt => {
                    const active = editedRule.trigger.changeSurface?.includes(opt.id) ?? false;
                    return (
                      <button key={opt.id} type="button" onClick={() => handleToggleChangeSurface(opt.id)}
                        className={`text-left px-2 py-1.5 rounded border text-xs transition-colors ${active ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-medium' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {!editedRule.trigger.always && (
                <>
                  {/* Changed Paths */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Trigger on Changed Paths (glob patterns)
                    </label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={newPath}
                        onChange={(e) => setNewPath(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPath())}
                        className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                        placeholder="e.g., src/**, docs/**"
                      />
                      <button
                        type="button"
                        onClick={handleAddPath}
                        className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    {editedRule.trigger.anyChangedPaths && editedRule.trigger.anyChangedPaths.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {editedRule.trigger.anyChangedPaths.map((path, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-xs rounded-md"
                          >
                            {path}
                            <button
                              type="button"
                              onClick={() => handleRemovePath(index)}
                              className="hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Pattern Tester */}
                    {editedRule.trigger.anyChangedPaths && editedRule.trigger.anyChangedPaths.length > 0 && (
                      <details className="mt-4">
                        <summary className="cursor-pointer text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                          🧪 Test Patterns
                        </summary>
                        <div className="mt-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                          <GlobPatternTester
                            patterns={editedRule.trigger.anyChangedPaths || []}
                            onPatternsChange={(patterns) => setEditedRule({
                              ...editedRule,
                              trigger: { ...editedRule.trigger, anyChangedPaths: patterns }
                            })}
                          />
                        </div>
                      </details>
                    )}
                  </div>

                  {/* File Extensions */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Trigger on File Extensions
                    </label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={newExtension}
                        onChange={(e) => setNewExtension(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddExtension())}
                        className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                        placeholder="e.g., .ts, .tsx, .js"
                      />
                      <button
                        type="button"
                        onClick={handleAddExtension}
                        className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    {editedRule.trigger.anyFileExtensions && editedRule.trigger.anyFileExtensions.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {editedRule.trigger.anyFileExtensions.map((ext, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-xs rounded-md"
                          >
                            {ext}
                            <button
                              type="button"
                              onClick={() => handleRemoveExtension(index)}
                              className="hover:text-green-600 dark:hover:text-green-400"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Obligations */}
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Obligations</h3>
                <button
                  type="button"
                  onClick={handleAddObligation}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Add Obligation
                </button>
              </div>

              {editedRule.obligations.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    No obligations configured. Add at least one obligation to define what this rule checks.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {editedRule.obligations.map((obligation, index) => (
                    <div
                      key={index}
                      className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                          Obligation {index + 1}
                        </h4>
                        <div className="flex items-center gap-2">
                          {/* PHASE 2.4: Mode Toggle */}
                          <button
                            type="button"
                            onClick={() => handleToggleObligationMode(index)}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800"
                            title={obligationModes[index] === 'comparator' ? 'Switch to Condition Mode' : 'Switch to Comparator Mode'}
                          >
                            <Sparkles className="h-3 w-3" />
                            {obligationModes[index] === 'comparator' ? 'Use Conditions' : 'Use Comparator'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveObligation(index)}
                            className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* PHASE 2.4: Comparator Mode */}
                      {obligationModes[index] === 'comparator' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Comparator *
                          </label>
                          <ComparatorSelector
                            value={obligation.comparator || ''}
                            onChange={(comparatorId) => handleUpdateObligation(index, { comparator: comparatorId })}
                          />
                        </div>
                      )}

                      {/* PHASE 2.4: Condition Mode */}
                      {obligationModes[index] === 'condition' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Condition *
                          </label>
                          <ConditionBuilder
                            value={obligation.condition || null}
                            onChange={(condition) => handleUpdateObligation(index, { condition: condition || undefined })}
                            showYAMLPreview={true}
                          />
                        </div>
                      )}

                      {/* Severity */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Severity *
                        </label>
                        <select
                          value={obligation.severity}
                          onChange={(e) => handleUpdateObligation(index, { severity: e.target.value as any })}
                          className="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="critical">Critical</option>
                        </select>
                      </div>

                      {/* Decision on Fail */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Decision on Fail *
                        </label>
                        <select
                          value={obligation.decisionOnFail}
                          onChange={(e) => handleUpdateObligation(index, { decisionOnFail: e.target.value as any })}
                          className="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                        >
                          <option value="pass">Pass (informational only)</option>
                          <option value="warn">Warn (show warning)</option>
                          <option value="block">Block (prevent merge)</option>
                        </select>
                      </div>

                      {/* Decision on Unknown */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Decision on Unknown (safe-fail)
                        </label>
                        <select
                          value={obligation.decisionOnUnknown}
                          onChange={(e) => handleUpdateObligation(index, { decisionOnUnknown: e.target.value as any })}
                          className="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                        >
                          <option value="pass">Pass</option>
                          <option value="warn">Warn (recommended)</option>
                          <option value="block">Block</option>
                        </select>
                      </div>

                      {/* Message */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Custom Message
                        </label>
                        <input
                          type="text"
                          value={obligation.message || ''}
                          onChange={(e) => handleUpdateObligation(index, { message: e.target.value })}
                          className="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                          placeholder="Optional custom message for this check"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Approvals — REQUIRE grammar */}
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Approvals <span className="text-sm font-normal text-gray-500">(REQUIRE)</span></h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Who must approve before this rule can pass. Resolver = team slug or role.</p>
                </div>
              </div>

              {/* Existing approvals */}
              {(editedRule.approvals || []).length > 0 && (
                <div className="space-y-2">
                  {(editedRule.approvals || []).map((ap, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-sm">
                      <span className="font-medium text-purple-800 dark:text-purple-200">{ap.resolver}</span>
                      <span className="text-purple-600 dark:text-purple-300">×{ap.minCount}</span>
                      {ap.when && <span className="text-xs text-purple-500 dark:text-purple-400 italic">when: {ap.when}</span>}
                      <button type="button" onClick={() => handleRemoveApproval(idx)} className="ml-auto text-purple-400 hover:text-red-500">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add approval row */}
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Resolver (team/role)</label>
                  <input type="text" value={newApprovalResolver} onChange={e => setNewApprovalResolver(e.target.value)}
                    placeholder="e.g. security-team"
                    className="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm text-sm dark:bg-gray-700 dark:text-white" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Min count</label>
                  <input type="number" min={1} max={10} value={newApprovalMinCount} onChange={e => setNewApprovalMinCount(Number(e.target.value))}
                    className="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm text-sm dark:bg-gray-700 dark:text-white" />
                </div>
                <div className="col-span-4">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">When (optional predicate)</label>
                  <input type="text" value={newApprovalWhen} onChange={e => setNewApprovalWhen(e.target.value)}
                    placeholder="e.g. endpoint_added"
                    className="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm text-sm dark:bg-gray-700 dark:text-white" />
                </div>
                <div className="col-span-1">
                  <button type="button" onClick={handleAddApproval}
                    className="w-full px-2 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center justify-center">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Exclude Paths */}
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Exclude Paths</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Files matching these patterns will be excluded from this rule
              </p>

              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newExcludePath}
                  onChange={(e) => setNewExcludePath(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddExcludePath())}
                  className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                  placeholder="e.g., test/**, *.test.ts"
                />
                <button
                  type="button"
                  onClick={handleAddExcludePath}
                  className="px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {editedRule.excludePaths && editedRule.excludePaths.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {editedRule.excludePaths.map((path, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs rounded-md"
                    >
                      {path}
                      <button
                        type="button"
                        onClick={() => handleRemoveExcludePath(index)}
                        className="hover:text-gray-600 dark:hover:text-gray-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Exclude Pattern Tester */}
              {editedRule.excludePaths && editedRule.excludePaths.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                    🧪 Test Exclude Patterns
                  </summary>
                  <div className="mt-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <GlobPatternTester
                      patterns={editedRule.excludePaths || []}
                      onPatternsChange={(patterns) => setEditedRule({
                        ...editedRule,
                        excludePaths: patterns
                      })}
                    />
                  </div>
                </details>
              )}
            </div>

            {/* Skip Conditions */}
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Skip Conditions</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Skip this rule when certain conditions are met
              </p>

              {/* Skip by Labels */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Skip if PR has labels
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddLabel())}
                    className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    placeholder="e.g., skip-validation, hotfix"
                  />
                  <button
                    type="button"
                    onClick={handleAddLabel}
                    className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {editedRule.skipIf?.labels && editedRule.skipIf.labels.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {editedRule.skipIf.labels.map((label, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-xs rounded-md"
                      >
                        {label}
                        <button
                          type="button"
                          onClick={() => handleRemoveLabel(index)}
                          className="hover:text-yellow-600 dark:hover:text-yellow-400"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Skip by Actors */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Skip if PR author is
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newActor}
                    onChange={(e) => setNewActor(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddActor())}
                    className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                    placeholder="e.g., dependabot[bot], renovate[bot]"
                  />
                  <button
                    type="button"
                    onClick={handleAddActor}
                    className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {editedRule.skipIf?.actors && editedRule.skipIf.actors.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {editedRule.skipIf.actors.map((actor, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 text-xs rounded-md"
                      >
                        {actor}
                        <button
                          type="button"
                          onClick={() => handleRemoveActor(index)}
                          className="hover:text-purple-600 dark:hover:text-purple-400"
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

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              Save Rule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}




