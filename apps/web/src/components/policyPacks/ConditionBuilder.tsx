'use client';

import { useState } from 'react';
import { Code } from 'lucide-react';
import FactSelector, { getFactById, type FactEntry, type FactValueWidget } from './FactSelector';
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

  const handleFactChange = (factId: string, _valueType: string) => {
    // Reset operator + value when the fact changes so stale values don't carry over
    handleSimpleConditionChange({ fact: factId, operator: '', value: '' });
  };

  const handleOperatorChange = (operator: string) => {
    handleSimpleConditionChange({ operator });
  };

  const handleValueChange = (value: any) => {
    handleSimpleConditionChange({ value });
  };

  /** Live catalog lookup — replaces the old hardcoded factValueTypes map. */
  const getSelectedFact = (): FactEntry | undefined => {
    if (!isSimpleCondition(condition) || !condition.fact) return undefined;
    return getFactById(condition.fact);
  };

  const getFactValueType = (): string | undefined => getSelectedFact()?.valueType;
  const getFactWidget = (): FactValueWidget | undefined => getSelectedFact()?.valueWidget;
  const getAllowedOperators = (): string[] | undefined => getSelectedFact()?.allowedOperators;

  const INPUT_CLASS =
    'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white';

  /** Render value input driven by the fact's valueWidget metadata. */
  const renderValueInput = () => {
    if (!isSimpleCondition(condition)) return null;

    const widget = getFactWidget();
    const currentValue = condition.value;

    // ── select (enum / fixed options) ──────────────────────────────────────
    if (widget?.kind === 'select') {
      return (
        <select
          value={currentValue ?? ''}
          onChange={(e) => handleValueChange(e.target.value)}
          className={INPUT_CLASS}
        >
          <option value="">Select…</option>
          {widget.options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    // ── boolean ────────────────────────────────────────────────────────────
    if (widget?.kind === 'boolean') {
      return (
        <select
          value={currentValue === true ? 'true' : currentValue === false ? 'false' : ''}
          onChange={(e) => handleValueChange(e.target.value === 'true')}
          className={INPUT_CLASS}
        >
          <option value="">Select…</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }

    // ── number ─────────────────────────────────────────────────────────────
    if (widget?.kind === 'number') {
      return (
        <input
          type="number"
          value={currentValue ?? ''}
          min={widget.min}
          max={widget.max}
          step={widget.step ?? 1}
          onChange={(e) => handleValueChange(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder={widget.placeholder ?? 'Enter number…'}
          className={INPUT_CLASS}
        />
      );
    }

    // ── datetime ───────────────────────────────────────────────────────────
    if (widget?.kind === 'datetime') {
      return (
        <input
          type="datetime-local"
          value={currentValue ?? ''}
          onChange={(e) => handleValueChange(e.target.value)}
          className={INPUT_CLASS}
        />
      );
    }

    // ── tag-list (array, comma-separated) ──────────────────────────────────
    if (widget?.kind === 'tag-list' || getFactValueType() === 'array') {
      const arrayValue = Array.isArray(currentValue) ? currentValue.join(', ') : currentValue ?? '';
      return (
        <div>
          <input
            type="text"
            value={arrayValue}
            onChange={(e) => {
              const values = e.target.value.split(',').map((v: string) => v.trim()).filter(Boolean);
              handleValueChange(values);
            }}
            placeholder={widget?.kind === 'tag-list' && widget.placeholder
              ? widget.placeholder
              : 'Enter values (comma-separated)…'}
            className={INPUT_CLASS}
          />
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Separate multiple values with commas
          </div>
        </div>
      );
    }

    // ── text (default) ─────────────────────────────────────────────────────
    return (
      <input
        type="text"
        value={currentValue ?? ''}
        onChange={(e) => handleValueChange(e.target.value)}
        placeholder={widget?.kind === 'text' && widget.placeholder
          ? widget.placeholder
          : 'Enter value…'}
        className={INPUT_CLASS}
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
              allowedOperators={getAllowedOperators()}
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
      {showYAMLPreview && condition && isSimpleCondition(condition) && condition.fact && condition.operator && (
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

