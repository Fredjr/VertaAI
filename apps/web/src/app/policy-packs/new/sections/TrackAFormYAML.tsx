'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { FileText, CheckCircle, XCircle, AlertCircle, Sparkles, Code, Eye, Wand2, ShieldOff } from 'lucide-react';
import TemplateGallery from '@/components/policyPacks/TemplateGallery';
import RuleBuilder from '@/components/policyPacks/RuleBuilder';
import PackPreview from '@/components/policyPacks/PackPreview';
import ChangeSurfaceWizard from '@/components/policyPacks/ChangeSurfaceWizard';
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
  const [activeTab, setActiveTab] = useState<'surfaces' | 'templates' | 'builder' | 'yaml' | 'preview' | 'waivers'>('surfaces');
  const [waiversEnabled, setWaiversEnabled] = useState<boolean>(formData.waiversEnabled ?? false);
  const [waiverMaxDays, setWaiverMaxDays] = useState<number>(formData.waiverMaxDays ?? 30);
  const [waiverApprovers, setWaiverApprovers] = useState<string>(formData.waiverApprovers ?? '');
  const [waiverRequiredFields, setWaiverRequiredFields] = useState<string[]>(
    formData.waiverRequiredFields ?? ['reason', 'scope', 'expiry']
  );

  // Backend API base (no Next.js proxy; must use absolute URL)
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  // Fetch templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const workspaceId = formData.workspaceId || 'demo-workspace';
        const response = await fetch(`${apiBase}/api/workspaces/${workspaceId}/policy-packs/templates`);
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
      const response = await fetch(`${apiBase}/api/workspaces/${workspaceId}/policy-packs/${packId}/validate`, {
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
    setFormData({ ...formData, trackAConfigYamlDraft: templateYaml });
    setActiveTab('yaml');
  };

  // Merge wizard-generated rules into existing YAML (append new, don't overwrite existing)
  const handleSurfaceRules = (newRules: any[]) => {
    const existingRules = parseRulesFromYAML(yamlContent);
    const existingIds = new Set(existingRules.map((r: any) => r.id));
    const merged = [...existingRules, ...newRules.filter(r => !existingIds.has(r.id))];
    const updatedYaml = convertRulesToYAML(merged);
    setYamlContent(updatedYaml);
    setFormData({ ...formData, trackAConfigYamlDraft: updatedYaml });
    setActiveTab('yaml'); // Jump to YAML so user can see what was generated
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
            <nav className="flex gap-4 overflow-x-auto">
              {/* Surfaces tab — first-class wizard */}
              <button
                type="button"
                onClick={() => setActiveTab('surfaces')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'surfaces'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4" />
                  Surfaces
                </div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('templates')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
              <button
                type="button"
                onClick={() => setActiveTab('waivers')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'waivers'
                    ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ShieldOff className="h-4 w-4" />
                  Exceptions &amp; Waivers
                </div>
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="mt-6">
            {/* Surfaces Tab — ChangeSurface → RequiredArtifacts + Invariants → Decision */}
            {activeTab === 'surfaces' && (
              <ChangeSurfaceWizard onGenerateRules={handleSurfaceRules} />
            )}

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
                    console.log('Pack is valid:', isValid);
                  }}
                />
              </div>
            )}

            {/* Exceptions & Waivers Tab */}
            {activeTab === 'waivers' && (
              <div className="space-y-6">
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                  <h3 className="text-sm font-semibold text-orange-900 dark:text-orange-200 flex items-center gap-2">
                    <ShieldOff className="h-4 w-4" />
                    Exceptions &amp; Waivers
                  </h3>
                  <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                    Time-boxed waivers let teams bypass a rule with explicit approval and a stated reason. All waivers are audited.
                  </p>
                </div>

                {/* Enable waivers toggle */}
                <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Allow waivers on this pack</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Teams can request a temporary exemption with approval.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={waiversEnabled}
                      onChange={e => { setWaiversEnabled(e.target.checked); setFormData({ ...formData, waiversEnabled: e.target.checked }); }}
                      className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                  </label>
                </div>

                {waiversEnabled && (
                  <div className="space-y-4">
                    {/* Max waiver duration */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Maximum waiver duration (days)
                      </label>
                      <input type="number" min={1} max={365} value={waiverMaxDays}
                        onChange={e => { const v = Number(e.target.value); setWaiverMaxDays(v); setFormData({ ...formData, waiverMaxDays: v }); }}
                        className="w-32 rounded-md border-gray-300 dark:border-gray-600 shadow-sm text-sm dark:bg-gray-700 dark:text-white" />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Waivers expire automatically after this many days.</p>
                    </div>

                    {/* Approver teams */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Approver team(s) <span className="font-normal text-gray-500">(comma-separated team slugs)</span>
                      </label>
                      <input type="text" value={waiverApprovers} placeholder="e.g. security-team, platform-eng"
                        onChange={e => { setWaiverApprovers(e.target.value); setFormData({ ...formData, waiverApprovers: e.target.value }); }}
                        className="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm text-sm dark:bg-gray-700 dark:text-white" />
                    </div>

                    {/* Required fields */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Required fields in waiver request
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['reason', 'scope', 'expiry', 'affected-parties', 'risk-assessment', 'mitigation-plan'] as const).map(field => {
                          const checked = waiverRequiredFields.includes(field);
                          return (
                            <label key={field} className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={checked} onChange={() => {
                                const updated = checked ? waiverRequiredFields.filter(f => f !== field) : [...waiverRequiredFields, field];
                                setWaiverRequiredFields(updated);
                                setFormData({ ...formData, waiverRequiredFields: updated });
                              }} className="h-4 w-4 text-orange-500 rounded border-gray-300" />
                              <span className="text-sm text-gray-700 dark:text-gray-300">{field}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
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

