'use client';

import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';

// Fact catalog — mirrors apps/api/src/services/gatekeeper/yaml-dsl/facts/catalog.ts exactly
// IMPORTANT: fact IDs here MUST match the backend catalog. Do not invent IDs.
const FACT_CATALOG = {
  Universal: [
    { id: 'scope.workspace',  name: 'Workspace ID',     description: 'Workspace where this PR is evaluated',                        valueType: 'string',  example: 'acme-corp' },
    { id: 'scope.repository', name: 'Repository',        description: 'Repository full name (owner/repo)',                           valueType: 'string',  example: 'acme/api-service' },
    { id: 'scope.branch',     name: 'Target Branch',     description: 'Target (base) branch of the PR',                             valueType: 'string',  example: 'main' },
    { id: 'scope.env',        name: 'Environment',       description: 'Deployment environment derived from target branch',           valueType: 'string',  example: 'production' },
    { id: 'actor.user',       name: 'PR Author',         description: 'GitHub username of the PR author',                           valueType: 'string',  example: 'alice' },
    { id: 'event.type',       name: 'Event Type',        description: 'GitHub event that triggered evaluation',                     valueType: 'string',  example: 'pull_request' },
    { id: 'time.utc',         name: 'Current Time (UTC)', description: 'ISO 8601 timestamp of evaluation',                         valueType: 'string',  example: '2026-02-18T10:30:00Z' },
    { id: 'time.dayOfWeek',   name: 'Day of Week',       description: 'Day of week (Monday–Sunday)',                                valueType: 'string',  example: 'Friday' },
    { id: 'time.hourOfDay',   name: 'Hour of Day',       description: 'Hour (0–23) in UTC at time of evaluation',                   valueType: 'number',  example: 14 },
  ],
  PR: [
    { id: 'pr.id',              name: 'PR Number',         description: 'Pull request number',                                    valueType: 'number',  example: 123 },
    { id: 'pr.title',           name: 'PR Title',          description: 'Title of the pull request',                             valueType: 'string',  example: 'Add payment endpoint' },
    { id: 'pr.labels',          name: 'PR Labels',         description: 'Labels attached to the PR',                             valueType: 'array',   example: ['security', 'breaking-change'] },
    { id: 'pr.isDraft',         name: 'Is Draft',          description: 'Whether the PR is in draft mode',                       valueType: 'boolean', example: false },
    { id: 'pr.targetBranch',    name: 'Target Branch',     description: 'Branch the PR is merging into (base)',                  valueType: 'string',  example: 'main' },
    { id: 'pr.sourceBranch',    name: 'Source Branch',     description: 'Branch the PR originates from (head)',                  valueType: 'string',  example: 'feature/new-api' },
    { id: 'pr.reviewers.count', name: 'Reviewer Count',    description: 'Number of unique reviewers on the PR',                  valueType: 'number',  example: 2 },
    { id: 'pr.reviewers.teams', name: 'Reviewer Teams',    description: 'Teams requested as reviewers',                          valueType: 'array',   example: ['platform-team'] },
    { id: 'pr.approvals.count', name: 'Approval Count',    description: 'Number of approvals received',                         valueType: 'number',  example: 2 },
    { id: 'pr.approvals.users', name: 'Approving Users',   description: 'Usernames who approved the PR',                        valueType: 'array',   example: ['alice', 'bob'] },
    { id: 'pr.approvals.teams', name: 'Approving Teams',   description: 'Teams whose members approved the PR',                  valueType: 'array',   example: ['@acme/security'] },
  ],
  Diff: [
    { id: 'diff.filesChanged.count', name: 'Files Changed',   description: 'Number of files changed',                           valueType: 'number', example: 5 },
    { id: 'diff.filesChanged.paths', name: 'Changed Paths',   description: 'Array of changed file paths',                       valueType: 'array',  example: ['src/api.ts', 'README.md'] },
    { id: 'diff.linesAdded',         name: 'Lines Added',     description: 'Total lines added across all changed files',        valueType: 'number', example: 150 },
    { id: 'diff.linesDeleted',       name: 'Lines Deleted',   description: 'Total lines deleted across all changed files',      valueType: 'number', example: 50 },
    { id: 'diff.linesChanged',       name: 'Lines Changed',   description: 'Total lines changed (added + deleted)',             valueType: 'number', example: 200 },
  ],
  OpenAPI: [
    { id: 'openapi.changed',                  name: 'OpenAPI Changed',          description: 'Whether an OpenAPI spec was modified in this PR',            valueType: 'boolean', example: true },
    { id: 'openapi.breakingChanges.count',    name: 'Breaking Changes',         description: 'Number of breaking changes in the OpenAPI spec',             valueType: 'number',  example: 0 },
    { id: 'openapi.breakingChanges.types',    name: 'Breaking Change Types',    description: 'Types of breaking changes (e.g. endpoint_removed)',          valueType: 'array',   example: ['endpoint_removed'] },
    { id: 'openapi.endpointsAdded.count',     name: 'Endpoints Added',          description: 'Endpoints added to the spec',                               valueType: 'number',  example: 3 },
    { id: 'openapi.endpointsRemoved.count',   name: 'Endpoints Removed',        description: 'Endpoints removed from the spec',                           valueType: 'number',  example: 0 },
    { id: 'openapi.endpointsModified.count',  name: 'Endpoints Modified',       description: 'Endpoints modified in the spec',                            valueType: 'number',  example: 2 },
    { id: 'openapi.deprecatedEndpoints.count',name: 'Deprecated Endpoints',     description: 'Endpoints newly marked as deprecated',                      valueType: 'number',  example: 1 },
    { id: 'openapi.schemasAdded.count',       name: 'Schemas Added',            description: 'Schemas added to components/schemas',                       valueType: 'number',  example: 2 },
    { id: 'openapi.schemasRemoved.count',     name: 'Schemas Removed',          description: 'Schemas removed from components/schemas',                   valueType: 'number',  example: 0 },
    { id: 'openapi.versionBumpRequired',      name: 'Version Bump Required',    description: 'Required version bump (major / minor / patch / none)',       valueType: 'string',  example: 'major' },
    { id: 'openapi.oldVersion',               name: 'Old OpenAPI Version',      description: 'Previous version string from the spec',                     valueType: 'string',  example: '1.0.0' },
    { id: 'openapi.newVersion',               name: 'New OpenAPI Version',      description: 'New version string from the spec',                          valueType: 'string',  example: '2.0.0' },
  ],
  Terraform: [
    { id: 'tf.plan.resourceChanges.count',  name: 'Total Resource Changes',   description: 'Total Terraform resource changes (create+update+delete)',   valueType: 'number', example: 5 },
    { id: 'tf.plan.changes.create.count',   name: 'Resources to Create',      description: 'Resources the plan will create',                           valueType: 'number', example: 2 },
    { id: 'tf.plan.changes.update.count',   name: 'Resources to Update',      description: 'Resources the plan will update in-place',                  valueType: 'number', example: 2 },
    { id: 'tf.plan.changes.delete.count',   name: 'Resources to Delete',      description: 'Resources the plan will destroy',                          valueType: 'number', example: 1 },
    { id: 'tf.plan.resourceTypes.changed',  name: 'Resource Types Changed',   description: 'Unique Terraform resource types affected',                 valueType: 'array',  example: ['aws_s3_bucket', 'aws_iam_role'] },
    { id: 'tf.plan.cost.deltaMonthlyUsd',   name: 'Monthly Cost Delta (USD)', description: 'Estimated monthly cost change from this plan',             valueType: 'number', example: 50.25 },
  ],
  SBOM: [
    { id: 'sbom.packages.count',         name: 'Package Count',          description: 'Total packages in SBOM',                            valueType: 'number', example: 120 },
    { id: 'sbom.packages.added.count',   name: 'Packages Added',         description: 'Packages added to SBOM in this PR',                 valueType: 'number', example: 2 },
    { id: 'sbom.packages.removed.count', name: 'Packages Removed',       description: 'Packages removed from SBOM in this PR',             valueType: 'number', example: 0 },
    { id: 'sbom.cves.critical.count',    name: 'Critical CVEs',          description: 'Critical-severity CVEs in SBOM packages',           valueType: 'number', example: 0 },
    { id: 'sbom.cves.high.count',        name: 'High CVEs',              description: 'High-severity CVEs in SBOM packages',               valueType: 'number', example: 2 },
    { id: 'sbom.licenses.nonCompliant',  name: 'Non-Compliant Licenses', description: 'Non-approved licenses found in SBOM packages',      valueType: 'array',  example: ['GPL-3.0'] },
  ],
  Gate: [
    { id: 'gate.previous.status',   name: 'Previous Gate Status',   description: 'Status of the last VertaAI Policy Pack check run', valueType: 'string', example: 'pass' },
    { id: 'gate.previous.findings', name: 'Previous Gate Findings', description: 'Finding count from the last Policy Pack check',    valueType: 'number', example: 0 },
  ],
  Drift: [
    { id: 'drift.detected',       name: 'Drift Detected',       description: 'Whether Track B detected drift in this PR',                        valueType: 'boolean', example: false },
    { id: 'drift.types',          name: 'Drift Types',          description: 'Types of drift (instruction, process, ownership…)',                valueType: 'array',   example: ['instruction'] },
    { id: 'drift.confidence',     name: 'Drift Confidence',     description: 'Confidence score (0–1) from the triage agent',                    valueType: 'number',  example: 0.85 },
    { id: 'drift.impactedDomains',name: 'Impacted Domains',     description: 'Domains affected by drift (deployment, api, auth…)',               valueType: 'array',   example: ['deployment'] },
    { id: 'drift.riskLevel',      name: 'Drift Risk Level',     description: 'Risk level of detected drift: low, medium, high',                 valueType: 'string',  example: 'medium' },
    { id: 'drift.priority',       name: 'Drift Priority',       description: 'Remediation priority: P0 (critical), P1 (high), P2 (medium)',     valueType: 'string',  example: 'P1' },
  ],
  Derived: [
    { id: 'risk.score',        name: 'Composite Risk Score', description: 'Risk score 0–100 from CVEs, drift, breaking changes, TF deletes', valueType: 'number',  example: 35 },
    { id: 'risk.category',     name: 'Risk Category',        description: 'low / medium / high / critical derived from risk.score',          valueType: 'string',  example: 'medium' },
    { id: 'change.isSensitive',name: 'Change Is Sensitive',  description: 'PR touches secrets, auth, infra, billing, or prod config',        valueType: 'boolean', example: false },
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

