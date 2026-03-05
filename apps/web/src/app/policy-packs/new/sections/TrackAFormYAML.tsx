'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { FileText, CheckCircle, XCircle, AlertCircle, Code, Eye, Wand2, ShieldOff, Shield } from 'lucide-react';
// FIX B: Removed TemplateGallery import - template selection is in Step 3
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

// FIX B: Removed Template interface - templates are selected in Step 3

interface ValidationResult {
  valid: boolean;
  errors?: string[];
  packHash?: string;
}

export default function TrackAFormYAML({ formData, setFormData }: TrackAFormYAMLProps) {
  const [yamlContent, setYamlContent] = useState<string>(formData.trackAConfigYamlDraft || '');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  // FIX B: Remove 'templates' from tab options (template selection is in Step 3)
  const [activeTab, setActiveTab] = useState<'surfaces' | 'builder' | 'yaml' | 'preview' | 'waivers' | 'agent-policy'>('yaml');
  const [waiversEnabled, setWaiversEnabled] = useState<boolean>(formData.waiversEnabled ?? false);
  const [waiverMaxDays, setWaiverMaxDays] = useState<number>(formData.waiverMaxDays ?? 30);
  const [waiverApprovers, setWaiverApprovers] = useState<string>(formData.waiverApprovers ?? '');
  const [waiverRequiredFields, setWaiverRequiredFields] = useState<string[]>(
    formData.waiverRequiredFields ?? ['reason', 'scope', 'expiry']
  );
  // Capability constants — must match severityConstants.ts on the backend
  const CRITICAL_CAPS = ['iam_modify', 'secret_write', 'db_admin', 'infra_delete', 'deployment_modify'];
  const HIGH_CAPS = ['s3_delete', 's3_write', 'schema_modify', 'network_public', 'infra_create', 'infra_modify', 'secret_read'];
  const ALL_CAPS = [...CRITICAL_CAPS, ...HIGH_CAPS];

  // Agent Policy state — synced bidirectionally with trackAConfigYamlDraft
  const [agentPolicyBlocked, setAgentPolicyBlocked] = useState<string[]>(() => {
    try {
      const parsed = yaml.load(formData.trackAConfigYamlDraft || '') as any;
      return parsed?.agentPolicy?.additionalBlocked ?? [];
    } catch { return []; }
  });
  const [agentPolicyApproval, setAgentPolicyApproval] = useState<string[]>(() => {
    try {
      const parsed = yaml.load(formData.trackAConfigYamlDraft || '') as any;
      return parsed?.agentPolicy?.requireApproval ?? [];
    } catch { return []; }
  });
  const [agentMaxFiles, setAgentMaxFiles] = useState<number>(() => {
    try {
      const parsed = yaml.load(formData.trackAConfigYamlDraft || '') as any;
      return parsed?.agentPolicy?.sessionBudgets?.maxFilesChanged ?? 20;
    } catch { return 20; }
  });
  const [agentMaxAbstractions, setAgentMaxAbstractions] = useState<number>(() => {
    try {
      const parsed = yaml.load(formData.trackAConfigYamlDraft || '') as any;
      return parsed?.agentPolicy?.sessionBudgets?.maxNewAbstractions ?? 3;
    } catch { return 3; }
  });

  // FIX B: Track if template was loaded from Step 3
  const [templateLoadedFromStep3, setTemplateLoadedFromStep3] = useState<boolean>(
    !!(formData.trackAConfigYamlDraft && formData.trackAConfigYamlDraft.length > 100)
  );

  // Backend API base (no Next.js proxy; must use absolute URL)
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  // FIX B: Removed template fetching - templates are selected in Step 3

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

  // FIX B: Removed handleTemplateSelect - templates are selected in Step 3

  // FIX C: Merge wizard-generated rules into existing YAML with confirmation if template loaded
  const handleSurfaceRules = (newRules: any[]) => {
    // FIX C: Warn user if they're about to overwrite a template
    if (templateLoadedFromStep3 && yamlContent && yamlContent.length > 100) {
      const confirmed = window.confirm(
        '⚠️ Warning: This will replace your current YAML configuration with generated rules from the Surfaces wizard.\n\n' +
        'Your template rules will be overwritten. Continue?'
      );
      if (!confirmed) return;
      setTemplateLoadedFromStep3(false); // User confirmed, clear template flag
    }

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

  // Sync agentPolicy local state → YAML draft + formData
  const applyAgentPolicyToYaml = (
    blocked: string[],
    approval: string[],
    maxFiles: number,
    maxAbstractions: number,
    currentYaml: string,
  ): string => {
    try {
      const parsed = (yaml.load(currentYaml || '') as any) ?? {};
      if (blocked.length === 0 && approval.length === 0 && maxFiles === 20 && maxAbstractions === 3) {
        delete parsed.agentPolicy;
      } else {
        parsed.agentPolicy = {
          ...(blocked.length > 0 ? { additionalBlocked: blocked } : {}),
          ...(approval.length > 0 ? { requireApproval: approval } : {}),
          ...(maxFiles !== 20 || maxAbstractions !== 3 ? {
            sessionBudgets: {
              ...(maxFiles !== 20 ? { maxFilesChanged: maxFiles } : {}),
              ...(maxAbstractions !== 3 ? { maxNewAbstractions: maxAbstractions } : {}),
            },
          } : {}),
        };
      }
      return yaml.dump(parsed, { indent: 2, lineWidth: 120 });
    } catch {
      return currentYaml;
    }
  };

  const handleAgentPolicyChange = (
    blocked: string[],
    approval: string[],
    maxFiles: number,
    maxAbstractions: number,
  ) => {
    const updatedYaml = applyAgentPolicyToYaml(blocked, approval, maxFiles, maxAbstractions, yamlContent);
    setYamlContent(updatedYaml);
    setFormData({ ...formData, trackAConfigYamlDraft: updatedYaml });
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
          {/* FIX B: Banner when template is loaded from Step 3 */}
          {templateLoadedFromStep3 && yamlContent && yamlContent.length > 100 && (
            <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-900 dark:text-green-200">
                  ✅ Template loaded from Step 3
                </span>
              </div>
              <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                You can edit the YAML below or proceed to the next step.
                <strong> Warning:</strong> Using the Surfaces wizard will replace the template rules.
              </p>
            </div>
          )}

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
              {/* FIX B: Removed Templates tab - template selection is in Step 3 */}
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
              <button
                type="button"
                onClick={() => setActiveTab('agent-policy')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'agent-policy'
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Agent Policy
                  {(agentPolicyBlocked.length > 0 || agentPolicyApproval.length > 0) && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-full">
                      {agentPolicyBlocked.length + agentPolicyApproval.length}
                    </span>
                  )}
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

            {/* FIX B: Removed Templates Tab - template selection is in Step 3 */}

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

            {/* Agent Policy Tab */}
            {activeTab === 'agent-policy' && (
              <div className="space-y-6">
                {/* Header banner */}
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                  <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-200 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Agent Permission Policy
                  </h3>
                  <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                    Configure what AI coding agents (Claude Code, Copilot, Cursor, Windsurf, Augment) are allowed to do in this workspace.
                    These settings are compiled into the permission envelope injected into every AI session automatically.
                  </p>
                </div>

                {/* Section 1: Additional Blocked */}
                <div className="space-y-3">
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <h4 className="text-sm font-semibold text-red-900 dark:text-red-200">🚫 Additional Blocked Capabilities</h4>
                    <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                      AI agents will refuse to write code using these capabilities.
                      The baseline CRITICAL capabilities (marked below) are always blocked regardless of this setting.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_CAPS.map(cap => {
                      const isBaseline = CRITICAL_CAPS.includes(cap);
                      const isChecked = isBaseline || agentPolicyBlocked.includes(cap);
                      return (
                        <label key={cap} className={`flex items-center gap-2 p-2 rounded border ${isBaseline ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 opacity-70 cursor-not-allowed' : 'border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isBaseline}
                            onChange={() => {
                              const next = agentPolicyBlocked.includes(cap)
                                ? agentPolicyBlocked.filter(c => c !== cap)
                                : [...agentPolicyBlocked, cap];
                              setAgentPolicyBlocked(next);
                              handleAgentPolicyChange(next, agentPolicyApproval, agentMaxFiles, agentMaxAbstractions);
                            }}
                            className="h-4 w-4 text-red-500 rounded border-gray-300"
                          />
                          <span className="text-sm font-mono text-gray-800 dark:text-gray-200">{cap}</span>
                          {isBaseline && <span className="text-xs text-red-500 ml-auto">baseline</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Section 2: Require Human Approval */}
                <div className="space-y-3">
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200">👤 Require Human Approval</h4>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                      AI agents must pause and get human sign-off before writing code that uses these capabilities.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_CAPS.map(cap => {
                      const isChecked = agentPolicyApproval.includes(cap);
                      return (
                        <label key={cap} className="flex items-center gap-2 p-2 rounded border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const next = isChecked
                                ? agentPolicyApproval.filter(c => c !== cap)
                                : [...agentPolicyApproval, cap];
                              setAgentPolicyApproval(next);
                              handleAgentPolicyChange(agentPolicyBlocked, next, agentMaxFiles, agentMaxAbstractions);
                            }}
                            className="h-4 w-4 text-blue-500 rounded border-gray-300"
                          />
                          <span className="text-sm font-mono text-gray-800 dark:text-gray-200">{cap}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Section 3: Session Budgets */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">📊 Session Budget Overrides</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Limit how much an AI agent can change in a single session. The most restrictive value across all active packs wins.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Max files changed per session
                      </label>
                      <input
                        type="number" min={1} max={200} value={agentMaxFiles}
                        onChange={e => {
                          const v = Number(e.target.value);
                          setAgentMaxFiles(v);
                          handleAgentPolicyChange(agentPolicyBlocked, agentPolicyApproval, v, agentMaxAbstractions);
                        }}
                        className="w-32 rounded-md border-gray-300 dark:border-gray-600 shadow-sm text-sm dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Max new abstractions per session
                      </label>
                      <input
                        type="number" min={1} max={50} value={agentMaxAbstractions}
                        onChange={e => {
                          const v = Number(e.target.value);
                          setAgentMaxAbstractions(v);
                          handleAgentPolicyChange(agentPolicyBlocked, agentPolicyApproval, agentMaxFiles, v);
                        }}
                        className="w-32 rounded-md border-gray-300 dark:border-gray-600 shadow-sm text-sm dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 4: Compiled preview */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Preview — Effective Permission Envelope</h4>
                  <div className="p-4 bg-gray-900 dark:bg-gray-950 text-gray-100 rounded-lg font-mono text-xs space-y-1">
                    <div><span className="text-red-400">🚫 Blocked:</span> {[...CRITICAL_CAPS, ...agentPolicyBlocked.filter(c => !CRITICAL_CAPS.includes(c))].join(', ') || '—'}</div>
                    <div><span className="text-yellow-400">⚠️ Requires declaration:</span> {HIGH_CAPS.filter(c => !agentPolicyBlocked.includes(c)).join(', ') || '—'}</div>
                    <div><span className="text-blue-400">👤 Requires approval:</span> {agentPolicyApproval.length > 0 ? agentPolicyApproval.join(', ') : 'iam_modify, secret_write (baseline)'}</div>
                    <div><span className="text-green-400">✅ Always allowed:</span> db_read, s3_read, api_endpoint</div>
                    <div className="pt-1 border-t border-gray-700"><span className="text-gray-400">Session:</span> max {agentMaxFiles} files · max {agentMaxAbstractions} abstractions</div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    This preview reflects this pack&apos;s contribution. The final envelope merges all active packs — visible at the top of the Policy Packs page.
                  </p>
                </div>
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

