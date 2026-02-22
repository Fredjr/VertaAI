'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Wand2, CheckSquare, Square } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface ArtifactOption {
  id: string; label: string; description: string;
  defaultDecision: 'warn' | 'block';
  comparator: string; params?: Record<string, any>;
}
interface InvariantOption {
  id: string; label: string; description: string;
  defaultDecision: 'warn' | 'block';
  fact?: string; operator?: string; value?: any;
}
interface SurfaceEntry {
  id: string; label: string; category: string; emoji: string; description: string;
  pathGlobs: string[]; alwaysTrigger?: boolean;
  artifacts: ArtifactOption[]; invariants: InvariantOption[];
}
interface ItemConfig { enabled: boolean; decision: 'warn' | 'block'; }
interface SurfaceConfig {
  enabled: boolean;
  artifacts: Record<string, ItemConfig>;
  invariants: Record<string, ItemConfig>;
}
export interface ChangeSurfaceWizardProps {
  onGenerateRules: (rules: any[]) => void;
}

// ── Surface Catalog ───────────────────────────────────────────────────────────

const SURFACE_CATALOG: SurfaceEntry[] = [
  {
    id: 'openapi_changed', label: 'OpenAPI Spec Changed', category: 'API Contracts', emoji: '📋',
    description: 'OpenAPI/Swagger spec files are modified',
    pathGlobs: ['**/*.openapi.yaml', '**/*.openapi.json', '**/openapi.yaml', '**/swagger.yaml', '**/swagger.json'],
    artifacts: [
      { id: 'changelog_updated', label: 'CHANGELOG updated', description: 'API changelog must be updated', defaultDecision: 'warn', comparator: 'ARTIFACT_UPDATED', params: { artifactId: 'changelog' } },
      { id: 'two_person_review', label: '2-person review', description: 'Requires ≥2 human approvals', defaultDecision: 'block', comparator: 'MIN_APPROVALS', params: { minApprovals: 2 } },
    ],
    invariants: [
      { id: 'schema_compatibility_backward', label: 'Backward-compatible schema', description: 'No breaking changes in OpenAPI spec', defaultDecision: 'block', fact: 'openapi.breakingChanges.count', operator: '==', value: 0 },
      { id: 'endpoint_parity_spec_vs_gateway', label: 'Spec ↔ Gateway parity', description: 'Spec endpoints must exist in gateway', defaultDecision: 'warn' },
    ],
  },
  {
    id: 'graphql_schema_changed', label: 'GraphQL Schema Changed', category: 'API Contracts', emoji: '🔷',
    description: '.graphql / .gql schema files are modified',
    pathGlobs: ['**/*.graphql', '**/*.gql', '**/schema.graphql'],
    artifacts: [
      { id: 'changelog_updated', label: 'CHANGELOG updated', description: 'Schema changelog must be updated', defaultDecision: 'warn', comparator: 'ARTIFACT_UPDATED', params: { artifactId: 'changelog' } },
    ],
    invariants: [
      { id: 'schema_compatibility_backward', label: 'Backward-compatible schema', description: 'GraphQL changes must not break existing queries', defaultDecision: 'block' },
    ],
  },
  {
    id: 'proto_changed', label: 'Protobuf Schema Changed', category: 'API Contracts', emoji: '⚡',
    description: '.proto files are modified',
    pathGlobs: ['**/*.proto'],
    artifacts: [
      { id: 'changelog_updated', label: 'CHANGELOG updated', description: 'Proto changelog updated', defaultDecision: 'warn', comparator: 'ARTIFACT_UPDATED', params: { artifactId: 'changelog' } },
      { id: 'consumer_notification_sent', label: 'Consumer notification', description: 'Consumers notified via PR body', defaultDecision: 'warn', comparator: 'PR_TEMPLATE_FIELD_PRESENT', params: { field: 'consumer-notification' } },
    ],
    invariants: [
      { id: 'schema_compatibility_backward', label: 'Wire-compatible schema', description: 'Proto changes must be wire-compatible', defaultDecision: 'block' },
    ],
  },
  {
    id: 'db_schema_changed', label: 'DB Schema Changed', category: 'Database', emoji: '🗄️',
    description: 'Database schema files (Prisma, SQL) are modified',
    pathGlobs: ['**/schema.prisma', '**/*.sql', '**/schema.sql', '**/db/schema*'],
    artifacts: [
      { id: 'migration_present', label: 'Migration file present', description: 'Migration must accompany schema changes', defaultDecision: 'block', comparator: 'ARTIFACT_PRESENT', params: { artifactId: 'migration' } },
      { id: 'rollback_notes_present', label: 'Rollback notes present', description: 'PR must contain rollback instructions', defaultDecision: 'warn', comparator: 'PR_TEMPLATE_FIELD_PRESENT', params: { field: 'rollback-notes' } },
    ],
    invariants: [
      { id: 'db_migration_matches_schema_diff', label: 'Migration ↔ Schema parity', description: 'Migration must match schema diff exactly', defaultDecision: 'warn' },
    ],
  },
  {
    id: 'migration_added', label: 'Migration Added/Missing', category: 'Database', emoji: '📦',
    description: 'Database migration files are added or are expected but missing',
    pathGlobs: ['**/migrations/**', '**/migrate/**'],
    artifacts: [
      { id: 'rollback_notes_present', label: 'Rollback notes present', description: 'PR must document rollback procedure', defaultDecision: 'block', comparator: 'PR_TEMPLATE_FIELD_PRESENT', params: { field: 'rollback-notes' } },
      { id: 'two_person_review', label: '2-person review', description: 'Migrations require ≥2 approvals', defaultDecision: 'block', comparator: 'MIN_APPROVALS', params: { minApprovals: 2 } },
    ],
    invariants: [],
  },
  {
    id: 'terraform_changed', label: 'Terraform Changed', category: 'Infrastructure', emoji: '🏗️',
    description: '.tf or .tfvars files are modified',
    pathGlobs: ['**/*.tf', '**/*.tfvars', '**/.terraform*'],
    artifacts: [
      { id: 'runbook_updated', label: 'Runbook updated', description: 'Operations runbook must be updated', defaultDecision: 'warn', comparator: 'ARTIFACT_UPDATED', params: { artifactId: 'runbook' } },
      { id: 'two_person_review', label: '2-person review', description: 'Infrastructure changes require ≥2 approvals', defaultDecision: 'block', comparator: 'MIN_APPROVALS', params: { minApprovals: 2 } },
    ],
    invariants: [],
  },
  {
    id: 'k8s_manifest_changed', label: 'K8s Manifest Changed', category: 'Infrastructure', emoji: '☸️',
    description: 'Kubernetes manifests / Helm / Kustomize files are modified',
    pathGlobs: ['**/k8s/**/*.yaml', '**/helm/**', '**/kustomize/**', '**/manifests/**'],
    artifacts: [
      { id: 'runbook_updated', label: 'Runbook updated', description: 'Operations runbook must be updated', defaultDecision: 'warn', comparator: 'ARTIFACT_UPDATED', params: { artifactId: 'runbook' } },
    ],
    invariants: [],
  },
  {
    id: 'alert_rule_changed', label: 'Alert Rule Changed', category: 'Observability', emoji: '🔔',
    description: 'Alerting rules / Prometheus rules are modified',
    pathGlobs: ['**/alerts/**', '**/alerting/**', '**/*.alert.yaml', '**/prometheus-rules/**'],
    artifacts: [
      { id: 'runbook_updated', label: 'Runbook updated', description: 'Every alert must link to a runbook', defaultDecision: 'block', comparator: 'ARTIFACT_UPDATED', params: { artifactId: 'runbook' } },
      { id: 'dashboard_updated', label: 'Dashboard updated', description: 'Dashboard must reflect alert changes', defaultDecision: 'warn', comparator: 'ARTIFACT_UPDATED', params: { artifactId: 'dashboard' } },
    ],
    invariants: [
      { id: 'runbook_alert_parity', label: 'Alert ↔ Runbook parity', description: 'Every alert must have a linked runbook', defaultDecision: 'warn' },
    ],
  },
  {
    id: 'slo_threshold_changed', label: 'SLO Threshold Changed', category: 'Observability', emoji: '📈',
    description: 'SLO definition files are modified',
    pathGlobs: ['**/slo.yaml', '**/slo/**', '**/*.slo.yaml'],
    artifacts: [
      { id: 'alert_rule_updated', label: 'Alert rule updated', description: 'Matching alert must be updated with SLO', defaultDecision: 'block', comparator: 'ARTIFACT_UPDATED', params: { artifactId: 'alert-rule' } },
    ],
    invariants: [
      { id: 'slo_alert_parity', label: 'SLO ↔ Alert parity', description: 'SLO thresholds must match alert thresholds', defaultDecision: 'warn' },
    ],
  },
  {
    id: 'codeowners_changed', label: 'CODEOWNERS Changed', category: 'Ownership', emoji: '👥',
    description: 'CODEOWNERS file is modified',
    pathGlobs: ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'],
    artifacts: [
      { id: 'owner_ack_required', label: 'Owner acknowledgment', description: 'Team lead must approve CODEOWNERS changes', defaultDecision: 'block', comparator: 'HUMAN_APPROVAL_PRESENT' },
    ],
    invariants: [
      { id: 'codeowners_docs_parity', label: 'CODEOWNERS ↔ Docs parity', description: 'CODEOWNERS must match ownership docs', defaultDecision: 'warn' },
      { id: 'ownership_oncall_parity', label: 'Ownership ↔ On-call parity', description: 'Owners must have on-call coverage', defaultDecision: 'warn' },
    ],
  },
  {
    id: 'authz_policy_changed', label: 'AuthZ Policy Changed', category: 'Security', emoji: '🔐',
    description: 'Authorization policy files (OPA, RBAC) are modified',
    pathGlobs: ['**/*.rego', '**/authz/**', '**/policy.yaml', '**/permissions/**'],
    artifacts: [
      { id: 'two_person_review', label: '2-person review', description: 'Security policies require ≥2 approvals', defaultDecision: 'block', comparator: 'MIN_APPROVALS', params: { minApprovals: 2 } },
      { id: 'security_team_ack', label: 'Security team ack', description: 'Security team must approve', defaultDecision: 'block', comparator: 'SENSITIVE_PATH_REQUIRES_APPROVAL' },
    ],
    invariants: [
      { id: 'auth_policy_parity', label: 'Auth policy parity', description: 'Auth policies consistently applied', defaultDecision: 'block' },
    ],
  },
  {
    id: 'agent_authored_sensitive_change', label: 'AI Agent Authored Change', category: 'Security', emoji: '🤖',
    description: 'AI agent authors a change to sensitive files (always runs actor check)',
    pathGlobs: [], alwaysTrigger: true,
    artifacts: [
      { id: 'two_person_review', label: '2-person review', description: 'AI-authored changes need ≥2 human approvals', defaultDecision: 'block', comparator: 'MIN_APPROVALS', params: { minApprovals: 2 } },
    ],
    invariants: [],
  },
];

const CATEGORIES = Array.from(new Set(SURFACE_CATALOG.map(s => s.category)));

// ── Helpers ───────────────────────────────────────────────────────────────────

function initSurfaceConfig(entry: SurfaceEntry): SurfaceConfig {
  const artifacts: Record<string, ItemConfig> = {};
  const invariants: Record<string, ItemConfig> = {};
  entry.artifacts.forEach(a => { artifacts[a.id] = { enabled: true, decision: a.defaultDecision }; });
  entry.invariants.forEach(i => { invariants[i.id] = { enabled: true, decision: i.defaultDecision }; });
  return { enabled: true, artifacts, invariants };
}

function generateRules(configs: Record<string, SurfaceConfig>): any[] {
  const rules: any[] = [];
  for (const surface of SURFACE_CATALOG) {
    const cfg = configs[surface.id];
    if (!cfg?.enabled) continue;
    const obligations: any[] = [];
    surface.artifacts.forEach(a => {
      const ac = cfg.artifacts[a.id];
      if (!ac?.enabled) return;
      obligations.push({ comparator: a.comparator, params: a.params, severity: ac.decision === 'block' ? 'high' : 'medium', decisionOnFail: ac.decision, decisionOnUnknown: 'warn', message: `[${surface.label}] ${a.label} is required` });
    });
    surface.invariants.forEach(inv => {
      const ic = cfg.invariants[inv.id];
      if (!ic?.enabled) return;
      const ob: any = { severity: ic.decision === 'block' ? 'high' : 'medium', decisionOnFail: ic.decision, decisionOnUnknown: 'warn', message: `[${surface.label}] Invariant: ${inv.label}` };
      if (inv.fact) { ob.condition = { fact: inv.fact, operator: inv.operator || '==', value: inv.value ?? true }; }
      else { ob.comparator = 'CHECKRUNS_PASSED'; ob.params = { checkName: inv.id }; }
      obligations.push(ob);
    });
    if (obligations.length === 0) continue;
    rules.push({ id: surface.id, name: surface.label, description: surface.description, enabled: true, trigger: surface.alwaysTrigger ? { always: true } : { anyChangedPaths: surface.pathGlobs, changeSurface: surface.id }, obligations });
  }
  return rules;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChangeSurfaceWizard({ onGenerateRules }: ChangeSurfaceWizardProps) {
  const [surfaceConfigs, setSurfaceConfigs] = useState<Record<string, SurfaceConfig>>({});
  const [expandedSurface, setExpandedSurface] = useState<string | null>(null);

  const toggleSurface = (id: string) => {
    setSurfaceConfigs(prev => {
      const entry = SURFACE_CATALOG.find(s => s.id === id)!;
      if (prev[id]) { const next = { ...prev }; delete next[id]; return next; }
      return { ...prev, [id]: initSurfaceConfig(entry) };
    });
  };

  const toggleItem = (surfaceId: string, kind: 'artifacts' | 'invariants', itemId: string) => {
    setSurfaceConfigs(prev => ({ ...prev, [surfaceId]: { ...prev[surfaceId], [kind]: { ...prev[surfaceId][kind], [itemId]: { ...prev[surfaceId][kind][itemId], enabled: !prev[surfaceId][kind][itemId].enabled } } } }));
  };

  const setItemDecision = (surfaceId: string, kind: 'artifacts' | 'invariants', itemId: string, decision: 'warn' | 'block') => {
    setSurfaceConfigs(prev => ({ ...prev, [surfaceId]: { ...prev[surfaceId], [kind]: { ...prev[surfaceId][kind], [itemId]: { ...prev[surfaceId][kind][itemId], decision } } } }));
  };

  const selectedCount = Object.keys(surfaceConfigs).length;

  // ── Item row (artifact or invariant) ────────────────────────────────────────
  const renderItem = (surfaceId: string, kind: 'artifacts' | 'invariants', item: ArtifactOption | InvariantOption) => {
    const cfg = surfaceConfigs[surfaceId]?.[kind]?.[item.id];
    if (!cfg) return null;
    return (
      <div key={item.id} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button type="button" onClick={() => toggleItem(surfaceId, kind, item.id)} className="flex-shrink-0 text-gray-400 hover:text-blue-600">
            {cfg.enabled ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4" />}
          </button>
          <div className="min-w-0">
            <p className={`text-sm font-medium truncate ${cfg.enabled ? 'text-gray-900 dark:text-white' : 'text-gray-400 line-through'}`}>{item.label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.description}</p>
          </div>
        </div>
        {cfg.enabled && (
          <select value={cfg.decision} onChange={e => setItemDecision(surfaceId, kind, item.id, e.target.value as 'warn' | 'block')}
            className="ml-2 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1 py-0.5 flex-shrink-0">
            <option value="warn">⚠️ Warn</option>
            <option value="block">🚫 Block</option>
          </select>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
        <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
          <Wand2 className="h-4 w-4" />
          ChangeSurface → RequiredArtifacts + Invariants → Decision
        </h3>
        <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">
          Select the change surfaces this pack governs. For each surface, configure which artifacts must be present and which invariants must hold. Rules are generated automatically.
        </p>
      </div>

      {/* Surface picker grouped by category */}
      <div className="space-y-4">
        {CATEGORIES.map(category => (
          <div key={category}>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{category}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {SURFACE_CATALOG.filter(s => s.category === category).map(surface => {
                const isSelected = !!surfaceConfigs[surface.id];
                return (
                  <button key={surface.id} type="button" onClick={() => toggleSurface(surface.id)}
                    className={`text-left p-3 rounded-lg border-2 transition-all ${isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{surface.emoji}</span>
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold truncate ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>{surface.label}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{surface.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Configuration panels for selected surfaces */}
      {selectedCount > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Configure Selected Surfaces ({selectedCount})</h4>
          {SURFACE_CATALOG.filter(s => surfaceConfigs[s.id]).map(surface => (
            <div key={surface.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <button type="button" onClick={() => setExpandedSurface(expandedSurface === surface.id ? null : surface.id)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700">
                <span className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  <span>{surface.emoji}</span>{surface.label}
                </span>
                {expandedSurface === surface.id ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
              </button>
              {expandedSurface === surface.id && (
                <div className="px-4 py-3 space-y-4">
                  {surface.artifacts.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Required Artifacts</p>
                      {surface.artifacts.map(a => renderItem(surface.id, 'artifacts', a))}
                    </div>
                  )}
                  {surface.invariants.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Invariants</p>
                      {surface.invariants.map(i => renderItem(surface.id, 'invariants', i))}
                    </div>
                  )}
                  {surface.pathGlobs.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Trigger Paths</p>
                      <div className="flex flex-wrap gap-1">
                        {surface.pathGlobs.map(g => <code key={g} className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono text-gray-600 dark:text-gray-300">{g}</code>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Generate button */}
      <div className="flex justify-end">
        <button type="button" disabled={selectedCount === 0} onClick={() => onGenerateRules(generateRules(surfaceConfigs))}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
          <Wand2 className="h-4 w-4" />
          Generate {selectedCount > 0 ? `${selectedCount} Rule${selectedCount > 1 ? 's' : ''}` : 'Rules'} →
        </button>
      </div>
    </div>
  );
}

    pathGlobs: [], alwaysTrigger: true,
    artifacts: [
      { id: 'two_person_review', label: '2-person review', description: 'AI-authored changes need ≥2 human approvals', defaultDecision: 'block', comparator: 'MIN_APPROVALS', params: { minApprovals: 2 } },
    ],
    invariants: [],
  },
];

const CATEGORIES = Array.from(new Set(SURFACE_CATALOG.map(s => s.category)));

