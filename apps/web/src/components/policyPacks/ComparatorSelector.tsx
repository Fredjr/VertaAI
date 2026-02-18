'use client';

import { useState } from 'react';
import { ChevronDown, Search, Info } from 'lucide-react';

// ComparatorId enum from backend
const COMPARATORS = {
  // Artifact Comparators
  Artifact: [
    { id: 'ARTIFACT_PRESENT', name: 'Artifact Present', description: 'Check if artifact exists' },
    { id: 'ARTIFACT_UPDATED', name: 'Artifact Updated', description: 'Check if artifact was updated recently' },
    { id: 'ARTIFACT_VALID_SCHEMA', name: 'Artifact Valid Schema', description: 'Validate artifact against schema' },
    { id: 'OPENAPI_VALID', name: 'OpenAPI Valid', description: 'Validate OpenAPI specification' },
    { id: 'BACKSTAGE_VALID', name: 'Backstage Valid', description: 'Validate Backstage catalog' },
  ],
  // Evidence Comparators
  Evidence: [
    { id: 'PR_TEMPLATE_FIELD_PRESENT', name: 'PR Template Field Present', description: 'Check if PR template field is filled' },
    { id: 'CHECKRUNS_PASSED', name: 'Check Runs Passed', description: 'Verify CI checks passed' },
    { id: 'CHECKRUNS_REQUIRED', name: 'Check Runs Required', description: 'Require specific CI checks' },
  ],
  // Governance Comparators
  Governance: [
    { id: 'MIN_APPROVALS', name: 'Minimum Approvals', description: 'Require minimum number of approvals' },
    { id: 'HUMAN_APPROVAL_PRESENT', name: 'Human Approval Present', description: 'Require at least one human approval' },
    { id: 'SENSITIVE_PATH_REQUIRES_APPROVAL', name: 'Sensitive Path Requires Approval', description: 'Require approval for sensitive paths' },
    { id: 'APPROVER_IN_ALLOWED_SET', name: 'Approver in Allowed Set', description: 'Require approval from specific team/user' },
  ],
  // Safety Comparators
  Safety: [
    { id: 'NO_SECRETS_IN_DIFF', name: 'No Secrets in Diff', description: 'Detect potential secrets in changes' },
    { id: 'NO_HARDCODED_URLS', name: 'No Hardcoded URLs', description: 'Prevent hardcoded URLs in code' },
    { id: 'NO_COMMENTED_CODE', name: 'No Commented Code', description: 'Detect large blocks of commented code' },
  ],
};

interface ComparatorSelectorProps {
  value: string;
  onChange: (comparatorId: string) => void;
  showDescription?: boolean;
}

export default function ComparatorSelector({ value, onChange, showDescription = true }: ComparatorSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedComparator = Object.values(COMPARATORS)
    .flat()
    .find(c => c.id === value);

  const filteredCategories = Object.entries(COMPARATORS).reduce((acc, [category, comparators]) => {
    const filtered = comparators.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filtered.length > 0) {
      acc[category] = filtered;
    }
    return acc;
  }, {} as Record<string, typeof COMPARATORS.Artifact>);

  const handleSelect = (comparatorId: string) => {
    onChange(comparatorId);
    setIsOpen(false);
    setSearchQuery('');
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
          {selectedComparator ? selectedComparator.name : 'Select comparator...'}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Description */}
      {showDescription && selectedComparator && (
        <div className="mt-1 flex items-start gap-1 text-xs text-gray-600 dark:text-gray-400">
          <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span>{selectedComparator.description}</span>
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-96 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search comparators..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                autoFocus
              />
            </div>
          </div>

          {/* Options */}
          <div className="overflow-y-auto max-h-80">
            {Object.entries(filteredCategories).map(([category, comparators]) => (
              <div key={category}>
                {/* Category Header */}
                <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 sticky top-0">
                  {category}
                </div>

                {/* Comparator Options */}
                {comparators.map((comparator) => (
                  <button
                    key={comparator.id}
                    type="button"
                    onClick={() => handleSelect(comparator.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      value === comparator.id
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    <div className="font-medium">{comparator.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {comparator.description}
                    </div>
                  </button>
                ))}
              </div>
            ))}

            {/* No Results */}
            {Object.keys(filteredCategories).length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                No comparators found
              </div>
            )}
          </div>
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

