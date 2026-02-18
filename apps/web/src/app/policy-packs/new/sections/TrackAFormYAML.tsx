'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { FileText, CheckCircle, XCircle, AlertCircle, Sparkles, Code, Eye } from 'lucide-react';
import TemplateGallery from '@/components/policyPacks/TemplateGallery';
import RuleBuilder from '@/components/policyPacks/RuleBuilder';
import PackPreview from '@/components/policyPacks/PackPreview';
import yaml from 'js-yaml';

// Dynamically import Monaco Editor to avoid SSR issues
const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface TrackAFormYAMLProps {
  formData: any;
  setFormData: (data: any) => void;
}

interface Template {
  id: string;
  name: string;
  description: string;
  yaml: string;
}

interface ValidationResult {
  valid: boolean;
  errors?: string[];
  packHash?: string;
}

export default function TrackAFormYAML({ formData, setFormData }: TrackAFormYAMLProps) {
  const [yamlContent, setYamlContent] = useState<string>(formData.trackAConfigYamlDraft || '');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [activeTab, setActiveTab] = useState<'templates' | 'builder' | 'yaml' | 'preview'>('templates');

  // Fetch templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const workspaceId = formData.workspaceId || 'demo-workspace'; // TODO: Get from context
        const response = await fetch(`/api/workspaces/${workspaceId}/policy-packs/templates`);
        if (response.ok) {
          const data = await response.json();
          setTemplates(data.templates || []);
        }
      } catch (error) {
        console.error('Failed to fetch templates:', error);
      }
    };
    fetchTemplates();
  }, [formData.workspaceId]);

  // Validate YAML on change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (yamlContent && formData.trackAEnabled) {
        validateYAML();
      }
    }, 1000); // 1 second debounce

    return () => clearTimeout(timer);
  }, [yamlContent, formData.trackAEnabled]);

  const validateYAML = async () => {
    if (!yamlContent.trim()) {
      setValidationResult(null);
      return;
    }

    setIsValidating(true);
    try {
      const workspaceId = formData.workspaceId || 'demo-workspace';
      const packId = formData.id || 'new';
      const response = await fetch(`/api/workspaces/${workspaceId}/policy-packs/${packId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml: yamlContent }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setValidationResult({ valid: true, packHash: data.packHash });
      } else {
        setValidationResult({ valid: false, errors: data.errors || [data.error] });
      }
    } catch (error: any) {
      setValidationResult({ valid: false, errors: [error.message] });
    } finally {
      setIsValidating(false);
    }
  };

  const handleYAMLChange = (value: string | undefined) => {
    const newValue = value || '';
    setYamlContent(newValue);
    setFormData({
      ...formData,
      trackAConfigYamlDraft: newValue,
    });
  };

  const handleTemplateSelect = (templateYaml: string) => {
    setYamlContent(templateYaml);
    setFormData({
      ...formData,
      trackAConfigYamlDraft: templateYaml,
    });
    setActiveTab('yaml'); // Switch to YAML editor after selecting template
  };

  // Parse YAML to extract rules
  const parseRulesFromYAML = (yamlString: string): any[] => {
    try {
      if (!yamlString.trim()) return [];
      const parsed = yaml.load(yamlString) as any;
      return parsed?.rules || [];
    } catch (error) {
      console.error('Failed to parse YAML:', error);
      return [];
    }
  };

  // Convert rules array back to YAML
  const convertRulesToYAML = (rules: any[]): string => {
    try {
      if (!yamlContent.trim()) {
        // Create a minimal pack structure if YAML is empty
        const minimalPack = {
          apiVersion: 'verta.ai/v1',
          kind: 'PolicyPack',
          metadata: {
            id: formData.id || 'new-pack',
            name: formData.name || 'New Policy Pack',
            version: '1.0.0',
            packMode: formData.packMode || 'observe',
            strictness: formData.strictness || 'balanced',
            owner: formData.owner || '',
          },
          scope: {
            type: formData.scopeType || 'workspace',
            ref: formData.scopeRef || '',
          },
          rules: rules,
        };
        return yaml.dump(minimalPack, { indent: 2, lineWidth: 120 });
      }

      // Update existing YAML with new rules
      const parsed = yaml.load(yamlContent) as any;
      parsed.rules = rules;
      return yaml.dump(parsed, { indent: 2, lineWidth: 120 });
    } catch (error) {
      console.error('Failed to convert rules to YAML:', error);
      return yamlContent;
    }
  };

  // Handle rule changes from RuleBuilder
  const handleRulesChange = (rules: any[]) => {
    const updatedYaml = convertRulesToYAML(rules);
    setYamlContent(updatedYaml);
    setFormData({
      ...formData,
      trackAConfigYamlDraft: updatedYaml,
    });
  };

  return (
    <div className="space-y-6">
      {/* Enable Track A */}
      <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Track A: YAML Policy Pack
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Define policy rules using declarative YAML configuration
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.trackAEnabled}
            onChange={(e) => setFormData({ ...formData, trackAEnabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
        </label>
      </div>

      {formData.trackAEnabled && (
        <>
          {/* Tab Switcher */}
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex gap-4">
              <button
                type="button"
                onClick={() => setActiveTab('templates')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'templates'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Templates
                </div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('builder')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'builder'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Builder
                </div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('yaml')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'yaml'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Code className="h-4 w-4" />
                  Advanced YAML
                </div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'preview'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Preview
                </div>
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="mt-6">
            {/* Templates Tab */}
            {activeTab === 'templates' && (
              <TemplateGallery
                workspaceId={formData.workspaceId || 'demo-workspace'}
                onSelectTemplate={handleTemplateSelect}
                currentYaml={yamlContent}
              />
            )}

            {/* Builder Tab */}
            {activeTab === 'builder' && (
              <div className="space-y-4">
                <RuleBuilder
                  rules={parseRulesFromYAML(yamlContent)}
                  onChange={handleRulesChange}
                />
              </div>
            )}

            {/* YAML Editor Tab */}
            {activeTab === 'yaml' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Policy Pack YAML
                  </label>
                  {isValidating && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 animate-spin" />
                      Validating...
                    </span>
                  )}
                  {!isValidating && validationResult && (
                    <span className={`text-xs flex items-center gap-1 ${
                      validationResult.valid
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {validationResult.valid ? (
                        <>
                          <CheckCircle className="h-3 w-3" />
                          Valid YAML
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3" />
                          Invalid YAML
                        </>
                      )}
                    </span>
                  )}
                </div>

                <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                  <Editor
                    height="500px"
                    defaultLanguage="yaml"
                    value={yamlContent}
                    onChange={handleYAMLChange}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      tabSize: 2,
                    }}
                  />
                </div>

                {/* Validation Errors */}
                {validationResult && !validationResult.valid && validationResult.errors && (
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <div className="flex items-start gap-2">
                      <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-red-900 dark:text-red-200">
                          Validation Errors
                        </h4>
                        <ul className="mt-2 text-sm text-red-700 dark:text-red-300 list-disc list-inside space-y-1">
                          {validationResult.errors.map((error, index) => (
                            <li key={index}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Preview Tab */}
            {activeTab === 'preview' && (
              <div className="space-y-4">
                <PackPreview
                  yamlContent={yamlContent}
                  workspaceId={formData.workspaceId || 'demo-workspace'}
                  onValidate={(isValid) => {
                    // Optional: Update form validation state
                    console.log('Pack is valid:', isValid);
                  }}
                />
              </div>
            )}
          </div>

          {/* Pack Hash Preview */}
          {validationResult && validationResult.valid && validationResult.packHash && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-xs text-green-700 dark:text-green-300">
                  Pack Hash: <code className="font-mono">{validationResult.packHash.substring(0, 16)}...</code>
                </span>
              </div>
            </div>
          )}

          {/* Help Text */}
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
              YAML Pack Structure
            </h4>
            <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
              <li>• <code className="font-mono">metadata</code>: Pack ID, version, name, description</li>
              <li>• <code className="font-mono">scope</code>: Workspace/service/repo scope with branch filters</li>
              <li>• <code className="font-mono">rules</code>: Array of policy rules with triggers and obligations</li>
              <li>• Each rule has: <code className="font-mono">id</code>, <code className="font-mono">name</code>, <code className="font-mono">trigger</code>, <code className="font-mono">obligations</code>, <code className="font-mono">decision</code></li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

