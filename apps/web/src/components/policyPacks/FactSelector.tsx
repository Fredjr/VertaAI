'use client';

import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';

// Fact catalog organized by category (matches backend catalog)
const FACT_CATALOG = {
  Universal: [
    { id: 'scope.workspace', name: 'Workspace ID', description: 'Current workspace identifier', valueType: 'string', example: 'acme-corp' },
    { id: 'scope.service', name: 'Service ID', description: 'Service identifier (if scoped)', valueType: 'string', example: 'payment-api' },
    { id: 'scope.repo', name: 'Repository', description: 'Repository full name', valueType: 'string', example: 'acme/payment-api' },
  ],
  PR: [
    { id: 'pr.number', name: 'PR Number', description: 'Pull request number', valueType: 'number', example: 123 },
    { id: 'pr.title', name: 'PR Title', description: 'Pull request title', valueType: 'string', example: 'Add payment endpoint' },
    { id: 'pr.body', name: 'PR Body', description: 'Pull request description', valueType: 'string', example: 'This PR adds...' },
    { id: 'pr.author', name: 'PR Author', description: 'Pull request author username', valueType: 'string', example: 'john-doe' },
    { id: 'pr.labels', name: 'PR Labels', description: 'Array of PR labels', valueType: 'array', example: ['bug', 'urgent'] },
    { id: 'pr.baseBranch', name: 'Base Branch', description: 'Target branch name', valueType: 'string', example: 'main' },
    { id: 'pr.headBranch', name: 'Head Branch', description: 'Source branch name', valueType: 'string', example: 'feature/payment' },
    { id: 'pr.approvals.count', name: 'Approval Count', description: 'Number of approvals', valueType: 'number', example: 2 },
    { id: 'pr.approvals.users', name: 'Approvers', description: 'List of approver usernames', valueType: 'array', example: ['alice', 'bob'] },
  ],
  Diff: [
    { id: 'diff.additions', name: 'Lines Added', description: 'Total lines added', valueType: 'number', example: 150 },
    { id: 'diff.deletions', name: 'Lines Deleted', description: 'Total lines deleted', valueType: 'number', example: 50 },
    { id: 'diff.filesChanged.count', name: 'Files Changed', description: 'Number of files changed', valueType: 'number', example: 5 },
    { id: 'diff.filesChanged.paths', name: 'Changed Paths', description: 'Array of changed file paths', valueType: 'array', example: ['src/api.ts', 'README.md'] },
    { id: 'diff.filesChanged.extensions', name: 'File Extensions', description: 'Unique file extensions', valueType: 'array', example: ['.ts', '.md'] },
  ],
  Actor: [
    { id: 'actor.user', name: 'Actor Username', description: 'Username of PR author', valueType: 'string', example: 'john-doe' },
    { id: 'actor.isBot', name: 'Is Bot', description: 'Whether actor is a bot', valueType: 'boolean', example: false },
  ],
  OpenAPI: [
    { id: 'openapi.present', name: 'OpenAPI Present', description: 'Whether OpenAPI spec exists', valueType: 'boolean', example: true },
    { id: 'openapi.version', name: 'OpenAPI Version', description: 'OpenAPI spec version', valueType: 'string', example: '3.0.0' },
    { id: 'openapi.endpoints.count', name: 'Endpoint Count', description: 'Number of API endpoints', valueType: 'number', example: 12 },
  ],
  Terraform: [
    { id: 'terraform.present', name: 'Terraform Present', description: 'Whether Terraform files exist', valueType: 'boolean', example: true },
    { id: 'terraform.resources.count', name: 'Resource Count', description: 'Number of Terraform resources', valueType: 'number', example: 8 },
  ],
  SBOM: [
    { id: 'sbom.present', name: 'SBOM Present', description: 'Whether SBOM exists', valueType: 'boolean', example: true },
    { id: 'sbom.dependencies.count', name: 'Dependency Count', description: 'Number of dependencies', valueType: 'number', example: 45 },
  ],
};

interface FactSelectorProps {
  value: string;
  onChange: (factId: string, valueType: string) => void;
  showDescription?: boolean;
}

export default function FactSelector({ value, onChange, showDescription = true }: FactSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedFact = Object.values(FACT_CATALOG)
    .flat()
    .find(f => f.id === value);

  type Fact = { id: string; name: string; description: string; valueType: string; example: any };

  const filteredCategories = Object.entries(FACT_CATALOG).reduce((acc, [category, facts]) => {
    const filtered = facts.filter(f =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filtered.length > 0) {
      acc[category] = filtered;
    }
    return acc;
  }, {} as Record<string, Fact[]>);

  const handleSelect = (fact: typeof FACT_CATALOG.Universal[0]) => {
    onChange(fact.id, fact.valueType);
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
          {selectedFact ? selectedFact.name : 'Select fact...'}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Selected Fact Info */}
      {showDescription && selectedFact && (
        <div className="mt-1 flex items-start gap-1 text-xs text-gray-600 dark:text-gray-400">
          <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <div>
            <div>{selectedFact.description}</div>
            <div className="text-gray-500 dark:text-gray-500 mt-0.5">
              Type: <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">{selectedFact.valueType}</code>
              {' • '}
              Example: <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">{JSON.stringify(selectedFact.example)}</code>
            </div>
          </div>
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-96 overflow-auto">
          {/* Search */}
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search facts..."
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              autoFocus
            />
          </div>

          {/* Categories */}
          <div className="py-1">
            {Object.entries(filteredCategories).map(([category, facts]) => (
              <div key={category}>
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-900">
                  {category}
                </div>
                {facts.map((fact) => (
                  <button
                    key={fact.id}
                    type="button"
                    onClick={() => handleSelect(fact)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      value === fact.id
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    <div className="font-medium">{fact.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {fact.description}
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

