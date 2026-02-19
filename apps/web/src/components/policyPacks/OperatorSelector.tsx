'use client';

import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';

// Comparison operators (matches backend operators.ts)
const OPERATORS = {
  Equality: [
    { id: '==', name: 'Equals', description: 'Values are equal', example: 'pr.approvals.count == 2' },
    { id: '!=', name: 'Not Equals', description: 'Values are not equal', example: 'pr.author != "bot"' },
  ],
  Comparison: [
    { id: '>', name: 'Greater Than', description: 'Left value is greater than right', example: 'diff.additions > 100', types: ['number'] },
    { id: '>=', name: 'Greater Than or Equal', description: 'Left value is greater than or equal to right', example: 'pr.approvals.count >= 2', types: ['number'] },
    { id: '<', name: 'Less Than', description: 'Left value is less than right', example: 'diff.filesChanged.count < 10', types: ['number'] },
    { id: '<=', name: 'Less Than or Equal', description: 'Left value is less than or equal to right', example: 'diff.deletions <= 50', types: ['number'] },
  ],
  Membership: [
    { id: 'in', name: 'In', description: 'Value is in array', example: '"bug" in pr.labels' },
    { id: 'contains', name: 'Contains', description: 'Array contains value', example: 'pr.labels contains "urgent"' },
    { id: 'containsAll', name: 'Contains All', description: 'Array contains all values', example: 'pr.labels containsAll ["bug", "urgent"]' },
  ],
  String: [
    { id: 'matches', name: 'Matches', description: 'String matches regex pattern', example: 'pr.title matches "^feat:"', types: ['string'] },
    { id: 'startsWith', name: 'Starts With', description: 'String starts with prefix', example: 'pr.title startsWith "feat:"', types: ['string'] },
    { id: 'endsWith', name: 'Ends With', description: 'String ends with suffix', example: 'pr.headBranch endsWith "-hotfix"', types: ['string'] },
  ],
};

interface OperatorSelectorProps {
  value: string;
  onChange: (operator: string) => void;
  factValueType?: string; // Filter operators based on fact type
  showDescription?: boolean;
}

export default function OperatorSelector({ value, onChange, factValueType, showDescription = true }: OperatorSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedOperator = Object.values(OPERATORS)
    .flat()
    .find(op => op.id === value);

  type Operator = { id: string; name: string; description: string; example: string; types?: string[] };

  // Filter operators based on fact value type
  const filteredCategories = Object.entries(OPERATORS).reduce((acc, [category, operators]) => {
    const filtered = (operators as Operator[]).filter(op => {
      // If no type restriction, show all
      if (!op.types) return true;
      // If fact type specified, only show compatible operators
      if (factValueType) {
        return op.types.includes(factValueType);
      }
      return true;
    });
    if (filtered.length > 0) {
      acc[category] = filtered;
    }
    return acc;
  }, {} as Record<string, Operator[]>);

  const handleSelect = (operator: typeof OPERATORS.Equality[0]) => {
    onChange(operator.id);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Selector Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600"
      >
        <span className={value ? '' : 'text-gray-500 dark:text-gray-400'}>
          {selectedOperator ? selectedOperator.name : 'Select operator...'}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Selected Operator Info */}
      {showDescription && selectedOperator && (
        <div className="mt-1 flex items-start gap-1 text-xs text-gray-600 dark:text-gray-400">
          <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <div>
            <div>{selectedOperator.description}</div>
            <div className="text-gray-500 dark:text-gray-500 mt-0.5">
              Example: <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">{selectedOperator.example}</code>
            </div>
          </div>
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-96 overflow-auto">
          <div className="py-1">
            {Object.entries(filteredCategories).map(([category, operators]) => (
              <div key={category}>
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-900">
                  {category}
                </div>
                {operators.map((operator) => (
                  <button
                    key={operator.id}
                    type="button"
                    onClick={() => handleSelect(operator)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      value === operator.id
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    <div className="font-medium">{operator.name} <code className="text-xs text-gray-500 dark:text-gray-400">({operator.id})</code></div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {operator.description}
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

