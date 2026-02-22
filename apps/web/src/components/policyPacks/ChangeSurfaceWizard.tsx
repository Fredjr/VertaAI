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
  /** Where evidence for this invariant comes from */
  evidenceSource?: 'github-checks' | 'terraform-plan' | 'datadog' | 'backstage' | 'custom';
  /** Which branches this invariant enforces on */
  branchScope?: 'all' | 'protected' | 'feature';
  /** Human-readable description of when this invariant runs */
  runsWhen?: string;
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
      { id: 'schema_compatibility_backward', label: 'Backward-compatible schema', description: 'No breaking changes in OpenAPI spec', defaultDecision: 'block', fact: 'openapi.breakingChanges.count', operator: '==', value: 0, evidenceSource: 'github-checks', branchScope: 'protected', runsWhen: 'OpenAPI spec changes on protected branch' },
      { id: 'endpoint_parity_spec_vs_gateway', label: 'Spec ↔ Gateway parity', description: 'Spec endpoints must exist in gateway', defaultDecision: 'warn', evidenceSource: 'github-checks', runsWhen: 'OpenAPI spec changes' },
      { id: 'auth_endpoint_parity', label: 'Auth policy on all endpoints', description: 'Every new/changed endpoint must declare an auth policy', defaultDecision: 'warn', evidenceSource: 'github-checks', branchScope: 'protected', runsWhen: 'New endpoint detected in spec' },
      { id: 'error_contract_parity', label: 'Error contract parity', description: 'Error response shapes must match spec definitions', defaultDecision: 'warn', evidenceSource: 'github-checks', runsWhen: 'Error schema changed in spec' },
      { id: 'deprecation_window', label: 'Deprecation window enforced', description: 'Deprecated endpoints must have a sunset date ≥ 30 days out', defaultDecision: 'warn', evidenceSource: 'github-checks', runsWhen: 'Endpoint marked deprecated' },
      { id: 'sensitive_field_tagging', label: 'PII fields tagged in spec', description: 'Fields containing PII must be annotated with x-pii: true', defaultDecision: 'warn', evidenceSource: 'custom', runsWhen: 'New field added to response schema' },
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
      { id: 'schema_compatibility_backward', label: 'Backward-compatible schema', description: 'GraphQL changes must not break existing queries', defaultDecision: 'block', evidenceSource: 'github-checks', branchScope: 'protected', runsWhen: 'GraphQL schema file changes' },
      { id: 'auth_policy_parity', label: 'Auth consistently applied', description: 'All resolvers must declare authorization directives', defaultDecision: 'warn', evidenceSource: 'github-checks', runsWhen: 'New resolver or type added' },
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
      { id: 'schema_compatibility_backward', label: 'Wire-compatible schema', description: 'Proto changes must be wire-compatible', defaultDecision: 'block', evidenceSource: 'github-checks', branchScope: 'protected', runsWhen: '.proto file changes' },
      { id: 'field_deprecation_policy', label: 'Deprecated fields have migration notice', description: 'Fields marked reserved or deprecated must have a migration notice in PR', defaultDecision: 'warn', evidenceSource: 'custom', runsWhen: 'Field removed or deprecated' },
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
      { id: 'db_migration_matches_schema_diff', label: 'Migration ↔ Schema parity', description: 'Migration must match schema diff exactly', defaultDecision: 'warn', evidenceSource: 'github-checks', runsWhen: 'Schema file and migration file both present in PR' },
      { id: 'migration_append_only', label: 'Migrations are append-only', description: 'Existing migration files must not be rewritten', defaultDecision: 'block', evidenceSource: 'github-checks', runsWhen: 'Existing migration file modified' },
      { id: 'risky_ops_detection', label: 'No DROP/TRUNCATE without approval', description: 'Destructive SQL operations require explicit DBA approval', defaultDecision: 'block', evidenceSource: 'custom', branchScope: 'protected', runsWhen: 'DROP or TRUNCATE detected in migration' },
      { id: 'sensitive_table_approval', label: 'PII table changes need security approval', description: 'Changes to tables tagged as PII require security team sign-off', defaultDecision: 'block', evidenceSource: 'backstage', branchScope: 'protected', runsWhen: 'PII-tagged table detected in schema diff' },
      { id: 'index_safety', label: 'Index operations are online-safe', description: 'Index creation/drop must use CONCURRENTLY or equivalent', defaultDecision: 'warn', evidenceSource: 'custom', runsWhen: 'CREATE INDEX or DROP INDEX detected' },
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
    invariants: [
      { id: 'rollback_test_present', label: 'Rollback is testable', description: 'PR must describe how rollback will be validated', defaultDecision: 'warn', evidenceSource: 'custom', runsWhen: 'New migration file added' },
      { id: 'destructive_op_approval', label: 'Destructive ops need DBA approval', description: 'Migrations with DROP/ALTER COLUMN require DBA sign-off', defaultDecision: 'block', evidenceSource: 'github-checks', branchScope: 'protected', runsWhen: 'Destructive operation detected in migration' },
    ],
  },
  {
    id: 'terraform_changed', label: 'Terraform Changed', category: 'Infrastructure', emoji: '🏗️',
    description: '.tf or .tfvars files are modified',
    pathGlobs: ['**/*.tf', '**/*.tfvars', '**/.terraform*'],
    artifacts: [
      { id: 'runbook_updated', label: 'Runbook updated', description: 'Operations runbook must be updated', defaultDecision: 'warn', comparator: 'ARTIFACT_UPDATED', params: { artifactId: 'runbook' } },
      { id: 'two_person_review', label: '2-person review', description: 'Infrastructure changes require ≥2 approvals', defaultDecision: 'block', comparator: 'MIN_APPROVALS', params: { minApprovals: 2 } },
    ],
    invariants: [
      { id: 'plan_evidence_present', label: 'Terraform plan attached', description: 'A terraform plan output must be linked in the PR', defaultDecision: 'block', evidenceSource: 'terraform-plan', runsWhen: '.tf file changes' },
      { id: 'public_exposure_check', label: 'No unintended public exposure', description: 'No new public-facing resources without explicit tag', defaultDecision: 'block', evidenceSource: 'terraform-plan', branchScope: 'protected', runsWhen: 'New ingress or public resource detected in plan' },
      { id: 'iam_wildcard_check', label: 'No IAM * permissions', description: 'IAM policies must not grant wildcard (*) actions', defaultDecision: 'block', evidenceSource: 'terraform-plan', branchScope: 'protected', runsWhen: 'IAM policy resource in diff' },
      { id: 'secrets_hygiene', label: 'No secrets in Terraform vars', description: 'Sensitive values must use secret references, not literals', defaultDecision: 'block', evidenceSource: 'custom', runsWhen: '.tfvars or variable value detected' },
      { id: 'required_tags_present', label: 'Required resource tags present', description: 'All resources must have owner, env, and cost-center tags', defaultDecision: 'warn', evidenceSource: 'terraform-plan', runsWhen: 'New resource added to plan' },
    ],
  },
  {
    id: 'k8s_manifest_changed', label: 'K8s Manifest Changed', category: 'Infrastructure', emoji: '☸️',
    description: 'Kubernetes manifests / Helm / Kustomize files are modified',
    pathGlobs: ['**/k8s/**/*.yaml', '**/helm/**', '**/kustomize/**', '**/manifests/**'],
    artifacts: [
      { id: 'runbook_updated', label: 'Runbook updated', description: 'Operations runbook must be updated', defaultDecision: 'warn', comparator: 'ARTIFACT_UPDATED', params: { artifactId: 'runbook' } },
    ],
    invariants: [
      { id: 'network_policy_required', label: 'NetworkPolicy required', description: 'All workloads must have a NetworkPolicy defined', defaultDecision: 'warn', evidenceSource: 'github-checks', runsWhen: 'New Deployment or StatefulSet added' },
      { id: 'resource_limits_required', label: 'CPU/memory limits set', description: 'All containers must declare resource limits', defaultDecision: 'warn', evidenceSource: 'github-checks', runsWhen: 'Container spec changed' },
      { id: 'image_tag_pinned', label: 'Image tags pinned (no :latest)', description: 'Container images must reference a specific digest or version tag', defaultDecision: 'block', evidenceSource: 'github-checks', runsWhen: 'Image field changed in manifest' },
    ],
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
      { id: 'runbook_alert_parity', label: 'Alert ↔ Runbook parity', description: 'Every paging alert must link to a runbook', defaultDecision: 'warn', evidenceSource: 'custom', runsWhen: 'Alert rule added or severity changed' },
      { id: 'routing_ownership_parity', label: 'Routing ↔ Ownership parity', description: 'Alert routing must match service CODEOWNERS', defaultDecision: 'warn', evidenceSource: 'backstage', runsWhen: 'Alert routing target changes' },
      { id: 'dashboard_alert_parity', label: 'Dashboard ↔ Alert parity', description: 'A dashboard panel must exist for every paging alert', defaultDecision: 'warn', evidenceSource: 'datadog', runsWhen: 'New alert rule added' },
      { id: 'min_runbook_quality', label: 'Runbook minimum requirements', description: 'Runbook must contain Overview, Steps, and Escalation sections', defaultDecision: 'warn', evidenceSource: 'custom', runsWhen: 'Runbook file changed alongside alert' },
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
      { id: 'slo_alert_parity', label: 'SLO ↔ Alert parity', description: 'SLO thresholds must match alert thresholds', defaultDecision: 'warn', evidenceSource: 'datadog', runsWhen: 'SLO target value changed' },
      { id: 'burn_rate_alert_alignment', label: 'Burn-rate alert alignment', description: 'Burn-rate alert thresholds must be consistent with SLO budget', defaultDecision: 'warn', evidenceSource: 'datadog', runsWhen: 'SLO error budget or window changed' },
      { id: 'obs_triangle_consistency', label: 'Observability triangle complete', description: 'Dashboard + Alert + Runbook must all exist for tier-1 services', defaultDecision: 'warn', evidenceSource: 'backstage', branchScope: 'protected', runsWhen: 'SLO file changes for tier-1 service' },
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
      { id: 'codeowners_docs_parity', label: 'CODEOWNERS ↔ Docs parity', description: 'CODEOWNERS must match ownership docs', defaultDecision: 'warn', evidenceSource: 'custom', runsWhen: 'CODEOWNERS file changes' },
      { id: 'ownership_oncall_parity', label: 'Ownership ↔ On-call parity', description: 'Owners must have on-call coverage', defaultDecision: 'warn', evidenceSource: 'backstage', runsWhen: 'Team entry changed in CODEOWNERS' },
      { id: 'service_catalog_owner', label: 'Service catalog owner registered', description: 'CODEOWNERS team must be registered in service catalog', defaultDecision: 'warn', evidenceSource: 'backstage', runsWhen: 'New team added to CODEOWNERS' },
      { id: 'runbook_alert_reciprocal', label: 'Runbook ↔ Alert reciprocal references', description: 'Runbooks must reference alerts and alerts must link back to runbooks', defaultDecision: 'warn', evidenceSource: 'custom', runsWhen: 'CODEOWNERS or runbook changed together' },
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
  const EVIDENCE_LABELS: Record<string, string> = {
    'github-checks': '🔍 GitHub',
    'terraform-plan': '🏗️ TF Plan',
    'datadog': '📊 Datadog',
    'backstage': '📚 Backstage',
    'custom': '⚙️ Custom',
  };
  const BRANCH_LABELS: Record<string, string> = { all: '🌿 All', protected: '🔒 Protected', feature: '🌱 Feature' };

  const renderItem = (surfaceId: string, kind: 'artifacts' | 'invariants', item: ArtifactOption | InvariantOption) => {
    const cfg = surfaceConfigs[surfaceId]?.[kind]?.[item.id];
    if (!cfg) return null;
    const inv = kind === 'invariants' ? (item as InvariantOption) : null;
    return (
      <div key={item.id} className="py-2 px-3 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50">
        <div className="flex items-center justify-between">
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
        {/* Contextual badges for invariants */}
        {inv && (inv.evidenceSource || inv.branchScope || inv.runsWhen) && (
          <div className="ml-6 mt-1 flex flex-wrap gap-1">
            {inv.evidenceSource && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                {EVIDENCE_LABELS[inv.evidenceSource] ?? inv.evidenceSource}
              </span>
            )}
            {inv.branchScope && inv.branchScope !== 'all' && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {BRANCH_LABELS[inv.branchScope]}
              </span>
            )}
            {inv.runsWhen && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 italic">
                {inv.runsWhen}
              </span>
            )}
          </div>
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

