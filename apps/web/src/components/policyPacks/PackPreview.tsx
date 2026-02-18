'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, FileText, Shield, Target, Settings, GitBranch } from 'lucide-react';
import yaml from 'js-yaml';

interface PackPreviewProps {
  yamlContent: string;
  workspaceId: string;
  onValidate?: (isValid: boolean) => void;
}

interface ValidationResult {
  valid: boolean;
  errors?: Array<{ message: string; path?: string[] }>;
  packHash?: string;
  metadata?: any;
  ruleCount?: number;
  message?: string;
}

export default function PackPreview({ yamlContent, workspaceId, onValidate }: PackPreviewProps) {
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsedPack, setParsedPack] = useState<any>(null);

  useEffect(() => {
    validatePack();
  }, [yamlContent]);

  const validatePack = async () => {
    if (!yamlContent.trim()) {
      setValidation(null);
      setParsedPack(null);
      onValidate?.(false);
      return;
    }

    setLoading(true);
    try {
      // First, try to parse YAML locally
      const parsed = yaml.load(yamlContent) as any;
      setParsedPack(parsed);

      // Then validate with backend
      const response = await fetch(`/api/workspaces/${workspaceId}/policy-packs/temp/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yamlContent }),
      });

      const result = await response.json();
      setValidation(result);
      onValidate?.(result.valid);
    } catch (error: any) {
      setValidation({
        valid: false,
        errors: [{ message: error.message || 'Failed to parse YAML' }],
      });
      setParsedPack(null);
      onValidate?.(false);
    } finally {
      setLoading(false);
    }
  };

  if (!yamlContent.trim()) {
    return (
      <div className="text-center py-12 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
        <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">
          No YAML content to preview
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Validation Status */}
      <div className={`p-4 rounded-lg border ${
        loading
          ? 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800'
          : validation?.valid
          ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
          : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
      }`}>
        <div className="flex items-start gap-3">
          {loading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900 dark:border-white" />
          ) : validation?.valid ? (
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <h3 className={`text-sm font-medium ${
              loading
                ? 'text-gray-900 dark:text-white'
                : validation?.valid
                ? 'text-green-900 dark:text-green-200'
                : 'text-red-900 dark:text-red-200'
            }`}>
              {loading ? 'Validating...' : validation?.valid ? 'Valid Policy Pack' : 'Invalid Policy Pack'}
            </h3>
            {validation?.message && (
              <p className={`text-sm mt-1 ${
                validation.valid
                  ? 'text-green-700 dark:text-green-300'
                  : 'text-red-700 dark:text-red-300'
              }`}>
                {validation.message}
              </p>
            )}
            {validation?.errors && validation.errors.length > 0 && (
              <ul className="mt-2 space-y-1">
                {validation.errors.map((error, index) => (
                  <li key={index} className="text-sm text-red-700 dark:text-red-300">
                    • {error.message}
                    {error.path && error.path.length > 0 && (
                      <span className="text-xs ml-2 font-mono">
                        ({error.path.join('.')})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Pack Summary */}
      {validation?.valid && parsedPack && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Metadata Card */}
          <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Metadata
            </h4>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Name</dt>
                <dd className="text-gray-900 dark:text-white font-medium">{parsedPack.metadata?.name || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Version</dt>
                <dd className="text-gray-900 dark:text-white font-mono text-xs">{parsedPack.metadata?.version || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Pack Mode</dt>
                <dd className="text-gray-900 dark:text-white">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    parsedPack.metadata?.packMode === 'enforce'
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                      : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'
                  }`}>
                    {parsedPack.metadata?.packMode || 'observe'}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Strictness</dt>
                <dd className="text-gray-900 dark:text-white capitalize">{parsedPack.metadata?.strictness || 'balanced'}</dd>
              </div>
              {validation.packHash && (
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Pack Hash</dt>
                  <dd className="text-gray-900 dark:text-white font-mono text-xs truncate" title={validation.packHash}>
                    {validation.packHash.substring(0, 16)}...
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Scope Card */}
          <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Scope
            </h4>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Type</dt>
                <dd className="text-gray-900 dark:text-white capitalize">{parsedPack.scope?.type || 'workspace'}</dd>
              </div>
              {parsedPack.scope?.ref && (
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Reference</dt>
                  <dd className="text-gray-900 dark:text-white font-mono text-xs">{parsedPack.scope.ref}</dd>
                </div>
              )}
              {parsedPack.scope?.branches && (
                <div>
                  <dt className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    Branch Filters
                  </dt>
                  <dd className="text-gray-900 dark:text-white text-xs mt-1">
                    {parsedPack.scope.branches.include && (
                      <div>Include: {parsedPack.scope.branches.include.join(', ')}</div>
                    )}
                    {parsedPack.scope.branches.exclude && (
                      <div>Exclude: {parsedPack.scope.branches.exclude.join(', ')}</div>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Rules Card */}
          <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Rules
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Total Rules</span>
                <span className="text-lg font-semibold text-gray-900 dark:text-white">
                  {parsedPack.rules?.length || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Enabled</span>
                <span className="text-sm font-medium text-green-600 dark:text-green-400">
                  {parsedPack.rules?.filter((r: any) => r.enabled !== false).length || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Disabled</span>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {parsedPack.rules?.filter((r: any) => r.enabled === false).length || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Evaluation Card */}
          <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Evaluation
            </h4>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Max Total Time</dt>
                <dd className="text-gray-900 dark:text-white">
                  {parsedPack.evaluation?.budgets?.maxTotalMs || 30000}ms
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Per-Comparator Timeout</dt>
                <dd className="text-gray-900 dark:text-white">
                  {parsedPack.evaluation?.budgets?.perComparatorTimeoutMs || 5000}ms
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">External Dependency Mode</dt>
                <dd className="text-gray-900 dark:text-white capitalize">
                  {parsedPack.evaluation?.externalDependencyMode || 'soft_fail'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {/* Rules List */}
      {validation?.valid && parsedPack?.rules && parsedPack.rules.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">
              Rule Details
            </h4>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {parsedPack.rules.map((rule: any, index: number) => (
              <div key={index} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h5 className="text-sm font-medium text-gray-900 dark:text-white">
                      {rule.name}
                    </h5>
                    {rule.description && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {rule.description}
                      </p>
                    )}
                  </div>
                  <span className={`ml-3 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    rule.enabled !== false
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                  }`}>
                    {rule.enabled !== false ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
                  <span>{rule.obligations?.length || 0} obligation(s)</span>
                  {rule.trigger?.always && <span className="text-blue-600 dark:text-blue-400">Always triggers</span>}
                  {rule.excludePaths && rule.excludePaths.length > 0 && (
                    <span>{rule.excludePaths.length} exclusion(s)</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

