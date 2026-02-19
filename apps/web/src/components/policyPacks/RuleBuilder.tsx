'use client';

import { useState } from 'react';
import { Plus, Edit2, Trash2, GripVertical, ToggleLeft, ToggleRight } from 'lucide-react';
import RuleEditor from './RuleEditor';

// Condition types (matches backend types.ts)
interface SimpleCondition {
  fact: string;
  operator: string;
  value: any;
}

interface CompositeCondition {
  operator: 'AND' | 'OR' | 'NOT';
  conditions: Array<SimpleCondition | CompositeCondition>;
}

type Condition = SimpleCondition | CompositeCondition;

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
  skipIf?: {
    labels?: string[];
    actors?: string[];
  };
  excludePaths?: string[];
}

interface RuleBuilderProps {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
}

export default function RuleBuilder({ rules, onChange }: RuleBuilderProps) {
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const editingRule = rules.find(r => r.id === editingRuleId);

  const handleAddRule = () => {
    const newRule: Rule = {
      id: `rule-${Date.now()}`,
      name: 'New Rule',
      enabled: true,
      trigger: { always: true },
      obligations: [],
    };
    onChange([...rules, newRule]);
    setEditingRuleId(newRule.id);
    setIsEditorOpen(true);
  };

  const handleEditRule = (ruleId: string) => {
    setEditingRuleId(ruleId);
    setIsEditorOpen(true);
  };

  const handleSaveRule = (updatedRule: Rule) => {
    onChange(rules.map(r => r.id === updatedRule.id ? updatedRule : r));
    setEditingRuleId(null);
    setIsEditorOpen(false);
  };

  const handleCloseEditor = () => {
    setEditingRuleId(null);
    setIsEditorOpen(false);
  };

  const handleDeleteRule = (ruleId: string) => {
    onChange(rules.filter(r => r.id !== ruleId));
  };

  const handleToggleEnabled = (ruleId: string) => {
    onChange(
      rules.map(r =>
        r.id === ruleId ? { ...r, enabled: !r.enabled } : r
      )
    );
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newRules = [...rules];
    [newRules[index - 1], newRules[index]] = [newRules[index], newRules[index - 1]];
    onChange(newRules);
  };

  const handleMoveDown = (index: number) => {
    if (index === rules.length - 1) return;
    const newRules = [...rules];
    [newRules[index], newRules[index + 1]] = [newRules[index + 1], newRules[index]];
    onChange(newRules);
  };

  const getTriggerSummary = (trigger: Rule['trigger']): string => {
    if (trigger.always) return 'Always';
    if (trigger.anyChangedPathsRef) return `Ref: ${trigger.anyChangedPathsRef}`;
    if (trigger.anyChangedPaths && trigger.anyChangedPaths.length > 0) {
      return `Paths: ${trigger.anyChangedPaths.slice(0, 2).join(', ')}${trigger.anyChangedPaths.length > 2 ? '...' : ''}`;
    }
    if (trigger.anyFileExtensions && trigger.anyFileExtensions.length > 0) {
      return `Extensions: ${trigger.anyFileExtensions.join(', ')}`;
    }
    return 'No trigger';
  };

  const getDecisionSummary = (rule: Rule): string => {
    if (rule.obligations.length === 0) return 'No obligations';
    const decisions = rule.obligations.map(o => o.decisionOnFail);
    if (decisions.includes('block')) return 'Block';
    if (decisions.includes('warn')) return 'Warn';
    return 'Pass';
  };

  const getHighestSeverity = (rule: Rule): string => {
    if (rule.obligations.length === 0) return '-';
    const severities = rule.obligations.map(o => o.severity);
    if (severities.includes('critical')) return 'Critical';
    if (severities.includes('high')) return 'High';
    if (severities.includes('medium')) return 'Medium';
    return 'Low';
  };

  const getSeverityColor = (severity: string): string => {
    const colors: Record<string, string> = {
      critical: 'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30',
      high: 'text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/30',
      medium: 'text-yellow-700 bg-yellow-100 dark:text-yellow-300 dark:bg-yellow-900/30',
      low: 'text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/30',
    };
    return colors[severity.toLowerCase()] || 'text-gray-700 bg-gray-100 dark:text-gray-300 dark:bg-gray-900/30';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Rules</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {rules.length} {rules.length === 1 ? 'rule' : 'rules'} configured
          </p>
        </div>
        <button
          onClick={handleAddRule}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Rule
        </button>
      </div>

      {/* Rules Table */}
      {rules.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          <p className="text-gray-600 dark:text-gray-400">No rules configured yet</p>
          <button
            onClick={handleAddRule}
            className="mt-4 text-blue-600 dark:text-blue-400 hover:underline"
          >
            Add your first rule
          </button>
        </div>
      ) : (
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="w-8"></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">Trigger</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">Decision</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">Severity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">Enabled</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {rules.map((rule, index) => (
                <tr key={rule.id} className={!rule.enabled ? 'opacity-50' : ''}>
                  {/* Drag Handle */}
                  <td className="px-2">
                    <GripVertical className="h-4 w-4 text-gray-400 cursor-move" />
                  </td>

                  {/* Name */}
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white">{rule.name}</div>
                    {rule.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{rule.description}</div>
                    )}
                  </td>

                  {/* Trigger */}
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {getTriggerSummary(rule.trigger)}
                  </td>

                  {/* Decision */}
                  <td className="px-4 py-3 text-sm font-medium">
                    {getDecisionSummary(rule)}
                  </td>

                  {/* Severity */}
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${getSeverityColor(getHighestSeverity(rule))}`}>
                      {getHighestSeverity(rule)}
                    </span>
                  </td>

                  {/* Enabled Toggle */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleEnabled(rule.id)}
                      className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    >
                      {rule.enabled ? (
                        <ToggleRight className="h-5 w-5 text-green-600" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditRule(rule.id)}
                        className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                        title="Edit rule"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        title="Delete rule"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Rule Editor Modal */}
      {editingRule && (
        <RuleEditor
          rule={editingRule}
          isOpen={isEditorOpen}
          onClose={handleCloseEditor}
          onSave={handleSaveRule}
        />
      )}
    </div>
  );
}

