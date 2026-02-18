'use client';

import { useState } from 'react';
import { Plus, Trash2, Code } from 'lucide-react';
import FactSelector from './FactSelector';
import OperatorSelector from './OperatorSelector';

// Condition types (matches backend types.ts)
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

interface ConditionBuilderProps {
  value: Condition | null;
  onChange: (condition: Condition | null) => void;
  showYAMLPreview?: boolean;
}

export default function ConditionBuilder({ value, onChange, showYAMLPreview = false }: ConditionBuilderProps) {
  const [mode, setMode] = useState<'simple' | 'composite'>('simple');

  // Initialize with simple condition if null
  const condition = value || { fact: '', operator: '', value: '' };

  const isSimpleCondition = (c: Condition): c is SimpleCondition => {
    return 'fact' in c && 'operator' in c && 'value' in c;
  };

  const handleSimpleConditionChange = (updates: Partial<SimpleCondition>) => {
    if (isSimpleCondition(condition)) {
      onChange({ ...condition, ...updates });
    } else {
      // Convert to simple condition
      onChange({ fact: '', operator: '', value: '', ...updates });
    }
  };

  const handleFactChange = (factId: string, valueType: string) => {
    handleSimpleConditionChange({ fact: factId });
  };

  const handleOperatorChange = (operator: string) => {
    handleSimpleConditionChange({ operator });
  };

  const handleValueChange = (value: any) => {
    handleSimpleConditionChange({ value });
  };

  // Get value type for the selected fact
  const getFactValueType = (): string | undefined => {
    if (!isSimpleCondition(condition) || !condition.fact) return undefined;
    
    // This should match the fact catalog
    const factValueTypes: Record<string, string> = {
      'pr.approvals.count': 'number',
      'pr.number': 'number',
      'diff.additions': 'number',
      'diff.deletions': 'number',
      'diff.filesChanged.count': 'number',
      'pr.title': 'string',
      'pr.body': 'string',
      'pr.author': 'string',
      'pr.baseBranch': 'string',
      'pr.headBranch': 'string',
      'pr.labels': 'array',
      'diff.filesChanged.paths': 'array',
      'actor.isBot': 'boolean',
    };
    
    return factValueTypes[condition.fact];
  };

  // Render value input based on fact type
  const renderValueInput = () => {
    if (!isSimpleCondition(condition)) return null;

    const valueType = getFactValueType();
    const currentValue = condition.value;

    if (valueType === 'number') {
      return (
        <input
          type="number"
          value={currentValue || ''}
          onChange={(e) => handleValueChange(Number(e.target.value))}
          placeholder="Enter number..."
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      );
    }

    if (valueType === 'boolean') {
      return (
        <select
          value={currentValue === true ? 'true' : currentValue === false ? 'false' : ''}
          onChange={(e) => handleValueChange(e.target.value === 'true')}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value="">Select...</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }

    if (valueType === 'array') {
      // For arrays, show a text input with comma-separated values
      const arrayValue = Array.isArray(currentValue) ? currentValue.join(', ') : currentValue || '';
      return (
        <div>
          <input
            type="text"
            value={arrayValue}
            onChange={(e) => {
              const values = e.target.value.split(',').map(v => v.trim()).filter(v => v);
              handleValueChange(values);
            }}
            placeholder="Enter values (comma-separated)..."
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Separate multiple values with commas
          </div>
        </div>
      );
    }

    // Default: string input
    return (
      <input
        type="text"
        value={currentValue || ''}
        onChange={(e) => handleValueChange(e.target.value)}
        placeholder="Enter value..."
        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
      />
    );
  };

  return (
    <div className="space-y-4">
      {/* Simple Condition Builder */}
      {isSimpleCondition(condition) && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Fact
            </label>
            <FactSelector
              value={condition.fact}
              onChange={handleFactChange}
              showDescription={true}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Operator
            </label>
            <OperatorSelector
              value={condition.operator}
              onChange={handleOperatorChange}
              factValueType={getFactValueType()}
              showDescription={true}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Value
            </label>
            {renderValueInput()}
          </div>
        </div>
      )}

      {/* YAML Preview */}
      {showYAMLPreview && condition && condition.fact && condition.operator && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <Code className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">YAML Preview</span>
          </div>
          <pre className="text-xs text-gray-600 dark:text-gray-400 font-mono">
{`condition:
  fact: ${condition.fact}
  operator: ${condition.operator}
  value: ${JSON.stringify(condition.value)}`}
          </pre>
        </div>
      )}
    </div>
  );
}

