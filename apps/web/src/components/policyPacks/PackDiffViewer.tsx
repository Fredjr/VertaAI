'use client';

import { useState, useEffect, useMemo } from 'react';
import { GitBranch, Plus, Minus, Edit, AlertCircle, CheckCircle } from 'lucide-react';
import yaml from 'js-yaml';

interface PackDiffViewerProps {
  leftYaml: string;
  rightYaml: string;
  leftLabel?: string;
  rightLabel?: string;
}

interface DiffChange {
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  path: string;
  leftValue?: any;
  rightValue?: any;
  description: string;
}

export default function PackDiffViewer({
  leftYaml,
  rightYaml,
  leftLabel = 'Previous Version',
  rightLabel = 'Current Version',
}: PackDiffViewerProps) {
  const [leftPack, setLeftPack] = useState<any>(null);
  const [rightPack, setRightPack] = useState<any>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const left = leftYaml.trim() ? yaml.load(leftYaml) : null;
      const right = rightYaml.trim() ? yaml.load(rightYaml) : null;
      setLeftPack(left);
      setRightPack(right);
      setParseError(null);
    } catch (error: any) {
      setParseError(error.message);
      setLeftPack(null);
      setRightPack(null);
    }
  }, [leftYaml, rightYaml]);

  const changes = useMemo(() => {
    if (!leftPack && !rightPack) return [];
    
    const diffs: DiffChange[] = [];

    // Compare metadata
    if (leftPack?.metadata || rightPack?.metadata) {
      const leftMeta = leftPack?.metadata || {};
      const rightMeta = rightPack?.metadata || {};

      if (leftMeta.name !== rightMeta.name) {
        diffs.push({
          type: 'modified',
          path: 'metadata.name',
          leftValue: leftMeta.name,
          rightValue: rightMeta.name,
          description: 'Pack name changed',
        });
      }

      if (leftMeta.version !== rightMeta.version) {
        diffs.push({
          type: 'modified',
          path: 'metadata.version',
          leftValue: leftMeta.version,
          rightValue: rightMeta.version,
          description: 'Version changed',
        });
      }

      if (leftMeta.packMode !== rightMeta.packMode) {
        diffs.push({
          type: 'modified',
          path: 'metadata.packMode',
          leftValue: leftMeta.packMode,
          rightValue: rightMeta.packMode,
          description: 'Pack mode changed',
        });
      }

      if (leftMeta.strictness !== rightMeta.strictness) {
        diffs.push({
          type: 'modified',
          path: 'metadata.strictness',
          leftValue: leftMeta.strictness,
          rightValue: rightMeta.strictness,
          description: 'Strictness level changed',
        });
      }
    }

    // Compare scope
    if (leftPack?.scope || rightPack?.scope) {
      const leftScope = leftPack?.scope || {};
      const rightScope = rightPack?.scope || {};

      if (leftScope.type !== rightScope.type) {
        diffs.push({
          type: 'modified',
          path: 'scope.type',
          leftValue: leftScope.type,
          rightValue: rightScope.type,
          description: 'Scope type changed',
        });
      }

      if (leftScope.ref !== rightScope.ref) {
        diffs.push({
          type: 'modified',
          path: 'scope.ref',
          leftValue: leftScope.ref,
          rightValue: rightScope.ref,
          description: 'Scope reference changed',
        });
      }
    }

    // Compare rules
    const leftRules = leftPack?.rules || [];
    const rightRules = rightPack?.rules || [];

    // Find added rules
    rightRules.forEach((rightRule: any) => {
      const leftRule = leftRules.find((l: any) => l.id === rightRule.id);
      if (!leftRule) {
        diffs.push({
          type: 'added',
          path: `rules.${rightRule.id}`,
          rightValue: rightRule.name,
          description: `Rule "${rightRule.name}" added`,
        });
      }
    });

    // Find removed rules
    leftRules.forEach((leftRule: any) => {
      const rightRule = rightRules.find((r: any) => r.id === leftRule.id);
      if (!rightRule) {
        diffs.push({
          type: 'removed',
          path: `rules.${leftRule.id}`,
          leftValue: leftRule.name,
          description: `Rule "${leftRule.name}" removed`,
        });
      }
    });

    // Find modified rules
    leftRules.forEach((leftRule: any) => {
      const rightRule = rightRules.find((r: any) => r.id === leftRule.id);
      if (rightRule) {
        if (leftRule.name !== rightRule.name) {
          diffs.push({
            type: 'modified',
            path: `rules.${leftRule.id}.name`,
            leftValue: leftRule.name,
            rightValue: rightRule.name,
            description: `Rule name changed`,
          });
        }

        if (leftRule.enabled !== rightRule.enabled) {
          diffs.push({
            type: 'modified',
            path: `rules.${leftRule.id}.enabled`,
            leftValue: leftRule.enabled,
            rightValue: rightRule.enabled,
            description: `Rule "${leftRule.name}" ${rightRule.enabled ? 'enabled' : 'disabled'}`,
          });
        }

        const leftObligations = leftRule.obligations?.length || 0;
        const rightObligations = rightRule.obligations?.length || 0;
        if (leftObligations !== rightObligations) {
          diffs.push({
            type: 'modified',
            path: `rules.${leftRule.id}.obligations`,
            leftValue: `${leftObligations} obligation(s)`,
            rightValue: `${rightObligations} obligation(s)`,
            description: `Rule "${leftRule.name}" obligations changed`,
          });
        }
      }
    });

    // Compare evaluation settings
    if (leftPack?.evaluation || rightPack?.evaluation) {
      const leftEval = leftPack?.evaluation || {};
      const rightEval = rightPack?.evaluation || {};

      const leftMaxTime = leftEval.budgets?.maxTotalMs;
      const rightMaxTime = rightEval.budgets?.maxTotalMs;
      if (leftMaxTime !== rightMaxTime) {
        diffs.push({
          type: 'modified',
          path: 'evaluation.budgets.maxTotalMs',
          leftValue: leftMaxTime,
          rightValue: rightMaxTime,
          description: 'Max evaluation time changed',
        });
      }
    }

    return diffs;
  }, [leftPack, rightPack]);

  const stats = useMemo(() => {
    return {
      added: changes.filter(c => c.type === 'added').length,
      removed: changes.filter(c => c.type === 'removed').length,
      modified: changes.filter(c => c.type === 'modified').length,
      total: changes.length,
    };
  }, [changes]);

  if (parseError) {
    return (
      <div className="p-4 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-red-900 dark:text-red-200">
              Failed to parse YAML
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
              {parseError}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!leftPack && !rightPack) {
    return (
      <div className="text-center py-12 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
        <GitBranch className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">
          No versions to compare
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="text-gray-500 dark:text-gray-400">Comparing:</span>
            <span className="ml-2 font-medium text-gray-900 dark:text-white">{leftLabel}</span>
            <span className="mx-2 text-gray-400">→</span>
            <span className="font-medium text-gray-900 dark:text-white">{rightLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <Plus className="h-4 w-4" />
            <span>{stats.added} added</span>
          </div>
          <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
            <Minus className="h-4 w-4" />
            <span>{stats.removed} removed</span>
          </div>
          <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
            <Edit className="h-4 w-4" />
            <span>{stats.modified} modified</span>
          </div>
        </div>
      </div>

      {/* Changes List */}
      {changes.length === 0 ? (
        <div className="p-8 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-center">
          <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No Changes Detected
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            The two versions are identical
          </p>
        </div>
      ) : (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
          {changes.map((change, index) => (
            <div
              key={index}
              className={`p-4 ${
                change.type === 'added'
                  ? 'bg-green-50 dark:bg-green-900/10'
                  : change.type === 'removed'
                  ? 'bg-red-50 dark:bg-red-900/10'
                  : change.type === 'modified'
                  ? 'bg-blue-50 dark:bg-blue-900/10'
                  : ''
              }`}
            >
              <div className="flex items-start gap-3">
                {change.type === 'added' && (
                  <Plus className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                )}
                {change.type === 'removed' && (
                  <Minus className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                )}
                {change.type === 'modified' && (
                  <Edit className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                        {change.description}
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">
                        {change.path}
                      </p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      change.type === 'added'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                        : change.type === 'removed'
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
                    }`}>
                      {change.type}
                    </span>
                  </div>
                  {(change.leftValue !== undefined || change.rightValue !== undefined) && (
                    <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
                      {change.leftValue !== undefined && (
                        <div>
                          <div className="text-gray-500 dark:text-gray-400 mb-1">{leftLabel}</div>
                          <div className="p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded font-mono">
                            {typeof change.leftValue === 'object'
                              ? JSON.stringify(change.leftValue, null, 2)
                              : String(change.leftValue)}
                          </div>
                        </div>
                      )}
                      {change.rightValue !== undefined && (
                        <div>
                          <div className="text-gray-500 dark:text-gray-400 mb-1">{rightLabel}</div>
                          <div className="p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded font-mono">
                            {typeof change.rightValue === 'object'
                              ? JSON.stringify(change.rightValue, null, 2)
                              : String(change.rightValue)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

