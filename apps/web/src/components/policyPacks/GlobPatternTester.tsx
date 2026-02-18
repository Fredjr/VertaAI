'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, FileText, Plus, X } from 'lucide-react';
import { minimatch } from 'minimatch';

interface GlobPatternTesterProps {
  patterns: string[];
  onPatternsChange?: (patterns: string[]) => void;
  readOnly?: boolean;
}

export default function GlobPatternTester({ patterns, onPatternsChange, readOnly = false }: GlobPatternTesterProps) {
  const [testPaths, setTestPaths] = useState<string[]>([
    'src/api/users.ts',
    'src/components/Button.tsx',
    'docs/README.md',
    'test/unit/api.test.ts',
  ]);
  const [newPath, setNewPath] = useState('');
  const [newPattern, setNewPattern] = useState('');

  const handleAddPath = () => {
    if (newPath.trim() && !testPaths.includes(newPath.trim())) {
      setTestPaths([...testPaths, newPath.trim()]);
      setNewPath('');
    }
  };

  const handleRemovePath = (index: number) => {
    setTestPaths(testPaths.filter((_, i) => i !== index));
  };

  const handleAddPattern = () => {
    if (newPattern.trim() && !patterns.includes(newPattern.trim()) && onPatternsChange) {
      onPatternsChange([...patterns, newPattern.trim()]);
      setNewPattern('');
    }
  };

  const handleRemovePattern = (index: number) => {
    if (onPatternsChange) {
      onPatternsChange(patterns.filter((_, i) => i !== index));
    }
  };

  const testPattern = (path: string, pattern: string): boolean => {
    try {
      // Use minimatch with same options as backend (dot: true)
      return minimatch(path, pattern, { dot: true });
    } catch (error) {
      return false;
    }
  };

  const getMatchingPatterns = (path: string): string[] => {
    return patterns.filter(pattern => testPattern(path, pattern));
  };

  return (
    <div className="space-y-6">
      {/* Patterns Section */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          Glob Patterns
        </h3>
        
        {!readOnly && (
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPattern())}
              className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="e.g., src/**, *.ts, docs/*.md"
            />
            <button
              type="button"
              onClick={handleAddPattern}
              className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}

        {patterns.length === 0 ? (
          <div className="text-center py-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No patterns defined
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {patterns.map((pattern, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-sm rounded-md font-mono"
              >
                {pattern}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => handleRemovePattern(index)}
                    className="hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Test Paths Section */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          Test File Paths
        </h3>
        
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPath())}
            className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
            placeholder="e.g., src/api/users.ts"
          />
          <button
            type="button"
            onClick={handleAddPath}
            className="px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          {testPaths.map((path, index) => {
            const matchingPatterns = getMatchingPatterns(path);
            const isMatched = matchingPatterns.length > 0;

            return (
              <div
                key={index}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  isMatched
                    ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                }`}
              >
                <div className="flex items-center gap-3 flex-1">
                  {isMatched ? (
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm text-gray-900 dark:text-white truncate">
                      {path}
                    </div>
                    {isMatched && matchingPatterns.length > 0 && (
                      <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                        Matches: {matchingPatterns.map(p => `"${p}"`).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemovePath(index)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-2"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pattern Syntax Help */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <h4 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Glob Pattern Syntax
        </h4>
        <ul className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
          <li><code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">*</code> - Matches any characters except /</li>
          <li><code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">**</code> - Matches any number of directories</li>
          <li><code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">?</code> - Matches any single character</li>
          <li><code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">*.ts</code> - Matches all TypeScript files</li>
          <li><code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">src/**</code> - Matches all files in src directory and subdirectories</li>
          <li><code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">docs/*.md</code> - Matches all Markdown files in docs directory</li>
        </ul>
      </div>
    </div>
  );
}

