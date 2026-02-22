/**
 * Change Surface Catalog
 *
 * Maps each ChangeSurfaceId to its canonical set of file path globs.
 * This is the backend counterpart to the frontend SURFACE_CATALOG in
 * ChangeSurfaceWizard.tsx — kept in sync so that trigger expansion in
 * the evaluator produces the same path-glob semantics as the UI.
 *
 * Path globs are evaluated with minimatch (dot: true) in packEvaluator.ts.
 */

import { ChangeSurfaceId } from './types.js';

/** Map of surface → path globs */
export const CHANGE_SURFACE_GLOBS: Record<ChangeSurfaceId, string[]> = {
  // ── API Contracts ─────────────────────────────────────────────────
  [ChangeSurfaceId.OPENAPI_CHANGED]: [
    '**/*.openapi.yaml', '**/*.openapi.json',
    '**/openapi.yaml', '**/openapi.json',
    '**/swagger.yaml', '**/swagger.json',
    '**/*.oas*.yaml', '**/*.oas*.json',
    // §1B additions: explicit openapi/ and specs/ directories
    'openapi/**/*.yaml', 'openapi/**/*.json',
    'specs/openapi/**', 'api-docs/**',
    '**/api-spec/**', '**/api-specs/**',
  ],
  [ChangeSurfaceId.GRAPHQL_SCHEMA_CHANGED]: [
    '**/*.graphql', '**/*.gql', '**/schema.graphql',
    // §1B additions
    '**/*.graphqls', 'graphql/**/*.graphql', 'graphql/**/*.gql',
    '**/graphql/schema/**',
  ],
  [ChangeSurfaceId.PROTO_CHANGED]: [
    '**/*.proto',
    // §1B additions: explicit proto/ directories
    'proto/**', 'api/**/*.proto', '**/protos/**',
  ],
  [ChangeSurfaceId.API_HANDLER_CHANGED]: [
    // TypeScript / JavaScript
    '**/routes/**/*.ts', '**/routes/**/*.js',
    '**/controllers/**/*.ts', '**/controllers/**/*.js',
    '**/handlers/**/*.ts', '**/handlers/**/*.js',
    '**/resolvers/**/*.ts', '**/resolvers/**/*.js',
    '**/api/**/*.ts', '**/api/**/*.js',
    // §1B additions: Go, Python, Java, Kotlin, C#, Ruby
    '**/handlers/**/*.go', '**/routes/**/*.go', '**/controllers/**/*.go',
    '**/handlers/**/*.py', '**/routes/**/*.py', '**/views/**/*.py',
    '**/handlers/**/*.java', '**/controllers/**/*.java',
    '**/handlers/**/*.kt', '**/controllers/**/*.kt',
    '**/controllers/**/*.cs', '**/api/**/*.cs',
    '**/routes/**/*.rb', '**/controllers/**/*.rb',
    // Common convention directories (any language)
    'app/**/*', 'internal/**/*', 'cmd/**/*',
  ],
  [ChangeSurfaceId.ROUTING_CHANGED]: [
    '**/routes/**', '**/router/**',
    '**/gateway/**', '**/proxy/**',
    '**/nginx/**', '**/*.nginx.conf',
    '**/traefik/**', '**/envoy/**',
    // §1B additions
    'api-gateway/**', 'k8s/**/ingress*.yaml', 'helm/**/ingress*.yaml',
  ],
  [ChangeSurfaceId.AUTHZ_POLICY_CHANGED]: [
    '**/*.rego', '**/authz/**',
    '**/policy.yaml', '**/permissions/**',
    '**/rbac/**', '**/*.rbac.yaml',
    // §1B additions
    'auth/**', 'security/**', 'opa/**',
    '**/istio/**/authorizationpolicy*.yaml', '**/istio/**/AuthorizationPolicy*.yaml',
  ],

  // ── Database ──────────────────────────────────────────────────────
  [ChangeSurfaceId.DB_SCHEMA_CHANGED]: [
    '**/schema.prisma', '**/*.sql',
    '**/schema.sql', '**/db/schema*',
    '**/database/schema*',
    // §1B additions: explicit schema/ and models/ directories
    'schema/**', 'models/**', 'db/**/*.sql',
    '**/ddl/**', '**/db/ddl/**',
  ],
  [ChangeSurfaceId.MIGRATION_ADDED_OR_MISSING]: [
    '**/migrations/**', '**/migrate/**',
    '**/db/migrations/**', '**/database/migrations/**',
    // §1B additions: Flyway, Liquibase, Alembic
    'flyway/**', '**/flyway/sql/**',
    'liquibase/**', '**/liquibase/changelogs/**',
    '**/alembic/versions/**',
  ],
  [ChangeSurfaceId.ORM_MODEL_CHANGED]: [
    '**/models/**/*.ts', '**/models/**/*.js',
    '**/entities/**/*.ts', '**/entities/**/*.js',
    '**/*.entity.ts', '**/*.model.ts',
    // §1B additions: Prisma, TypeORM, Django, Rails, Sequelize
    'prisma/**', 'prisma/schema.prisma',
    '**/typeorm/**', '**/*.typeorm.ts',
    '**/models.py', '**/models/**/*.py',   // Django
    '**/schema.rb', 'db/schema.rb',        // Rails
    'sequelize/**', '**/sequelize/models/**',
  ],

  // ── Infrastructure ────────────────────────────────────────────────
  [ChangeSurfaceId.TERRAFORM_CHANGED]: [
    '**/*.tf', '**/*.tfvars', '**/.terraform*',
    '**/terraform/**',
    // §1B additions: modules, Terragrunt
    'modules/**', '**/terragrunt.hcl', '**/*.terragrunt.hcl',
    'infrastructure/**', 'infra/**',
  ],
  [ChangeSurfaceId.K8S_MANIFEST_CHANGED]: [
    '**/k8s/**/*.yaml', '**/helm/**',
    '**/kustomize/**', '**/manifests/**',
    '**/deploy/**/*.yaml',
    // §1B additions: charts/, values files
    'charts/**', '**/charts/**', '**/values.yaml', '**/values*.yaml',
  ],
  [ChangeSurfaceId.IAM_CHANGED]: [
    '**/iam/**', '**/roles/**',
    '**/permissions/**', '**/*.iam.yaml',
    '**/*.rbac.yaml', '**/service-accounts/**',
    // §1B additions: Terraform IAM resources, K8s RBAC
    'terraform/**/iam*', '**/terraform/**/*iam*',
    'k8s/**/rbac*.yaml', 'k8s/**/clusterrole*.yaml',
    '**/clusterrolebinding*.yaml',
  ],
  [ChangeSurfaceId.SECRETS_CHANGED]: [
    '**/secrets/**', '**/vault/**',
    '**/*.secrets.yaml', '**/*.env.example',
    '**/sealed-secrets/**', '**/external-secrets/**',
    // §1B additions: SOPS, .env files
    'sops/**', '**/*.sops.yaml', '**/*.sops.json',
    '**/.env*',
  ],
  [ChangeSurfaceId.NETWORK_POLICY_CHANGED]: [
    '**/network-policies/**', '**/netpol/**',
    '**/firewall/**', '**/*.networkpolicy.yaml',
    '**/security-groups/**',
    // §1B additions: Calico, Cilium
    'calico/**', '**/calico/**', 'cilium/**', '**/cilium/**',
    '**/networkpolicies/**',
  ],
  [ChangeSurfaceId.INGRESS_CHANGED]: [
    '**/ingress/**', '**/*.ingress.yaml',
    '**/nginx-ingress/**', '**/istio/**',
    '**/virtual-service/**', '**/gateway-route/**',
    // §1B additions: k8s Gateway API, Kong
    'k8s/**/gateway*.yaml', '**/kong/**',
    '**/httproute*.yaml', '**/gateway-api/**',
  ],

  // ── Observability ─────────────────────────────────────────────────
  [ChangeSurfaceId.DASHBOARD_CHANGED]: [
    '**/dashboards/**', '**/grafana/**',
    '**/*.dashboard.json', '**/*.dashboard.yaml',
    '**/datadog/dashboards/**',
    // §1B additions
    '**/newrelic/dashboards/**', '**/cloudwatch/dashboards/**',
    '**/kibana/dashboards/**',
  ],
  [ChangeSurfaceId.ALERT_RULE_CHANGED]: [
    '**/alerts/**', '**/alerting/**',
    '**/*.alert.yaml', '**/prometheus-rules/**',
    '**/datadog/monitors/**', '**/opsgenie/rules/**',
    // §1B additions
    '**/alertmanager/**', '**/pagerduty/rules/**',
    '**/monitoring/alerts/**', '**/*.alerts.yaml',
  ],
  [ChangeSurfaceId.SLO_THRESHOLD_CHANGED]: [
    '**/slo.yaml', '**/slo/**', '**/*.slo.yaml',
    '**/service-level-objectives/**',
    '**/slos/**', '**/burn-rate/**',
  ],
  [ChangeSurfaceId.RUNBOOK_CHANGED]: [
    '**/runbooks/**', '**/docs/runbooks/**',
    '**/*.runbook.md', '**/wiki/runbooks/**',
    // §1B additions: playbooks as synonym
    '**/playbooks/**', '**/*runbook*.md', '**/ops/**/*.md',
  ],
  [ChangeSurfaceId.ONCALL_ROTATION_CHANGED]: [
    '**/oncall/**', '**/pagerduty/**',
    '**/opsgenie/**', '**/on-call/**',
    // §1B additions: schedules and rotations
    '**/schedules/**', '**/rotations/**',
    '**/pagerduty/schedules/**', '**/opsgenie/schedules/**',
  ],

  // ── Ownership ─────────────────────────────────────────────────────
  [ChangeSurfaceId.CODEOWNERS_CHANGED]: [
    'CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS',
  ],
  [ChangeSurfaceId.OWNERSHIP_DOCS_CHANGED]: [
    '**/docs/ownership/**', '**/OWNERS',
    '**/team-registry/**',
  ],

  // ── Events & ETL ─────────────────────────────────────────────────
  [ChangeSurfaceId.EVENT_SCHEMA_CHANGED]: [
    '**/events/**/*.avro', '**/events/**/*.proto',
    '**/events/**/*.json', '**/event-schemas/**',
    '**/kafka/schemas/**', '**/avro/**',
  ],
  [ChangeSurfaceId.ETL_CONTRACT_CHANGED]: [
    '**/etl/**', '**/pipeline/**',
    '**/dbt/**', '**/airflow/dags/**',
  ],

  // ── Security / Actor ─────────────────────────────────────────────
  // Agent-authored changes are detected via actor signals, not file paths
  [ChangeSurfaceId.AGENT_AUTHORED_SENSITIVE_CHANGE]: [],

  // ── Service Catalog / Docs ───────────────────────────────────────
  // GAP-I: new surfaces referenced in Prompt 2 requirements
  [ChangeSurfaceId.SERVICE_CATALOG_CHANGED]: [
    '**/catalog-info.yaml', '**/backstage.yaml',
    '**/service.yaml', '**/service-info.yaml',
    '.backstage/**', '**/service-catalog/**',
  ],
  [ChangeSurfaceId.DOCS_CHANGED]: [
    '**/docs/**/*.md', '**/docs/**/*.mdx',
    'README.md', '**/README.md',
    '**/wiki/**', '**/documentation/**',
    '**/confluence/**', '**/*.docs.yaml',
    // §1B additions: ADRs, architecture docs
    'adr/**', '**/adr/**', '**/architecture/**',
    '**/architecture-decisions/**',
  ],

  // ── New canonical surfaces (§1A / GAP-1) ─────────────────────────
  /** Gateway-layer route definitions (Kong, Envoy, nginx, k8s Ingress/Gateway API). */
  [ChangeSurfaceId.GATEWAY_ROUTE_CHANGED]: [
    'api-gateway/**', '**/kong/routes/**', '**/kong/plugins/**',
    '**/envoy/routes/**', '**/envoy/clusters/**',
    '**/nginx/**/*.conf', 'nginx/**',
    'k8s/**/ingress*.yaml', 'k8s/**/gateway*.yaml', 'k8s/**/httproute*.yaml',
    'helm/**/ingress*.yaml', 'helm/**/gateway*.yaml',
    '**/gateway-routes/**', '**/route-config/**',
  ],
  /** Authentication / authorization policy changes (OPA, RBAC, Istio AuthzPolicy, Keycloak). */
  [ChangeSurfaceId.AUTH_POLICY_CHANGED]: [
    '**/*.rego', 'auth/**', '**/authz/**',
    'security/**', 'opa/**', '**/opa/policies/**',
    '**/rbac/**', '**/*.rbac.yaml',
    '**/istio/**/authorizationpolicy*.yaml',
    '**/istio/**/AuthorizationPolicy*.yaml',
    '**/keycloak/**', '**/oauth/**', '**/jwt/**',
    '**/auth-policies/**',
  ],
  /** Oncall routing changes — who receives the page (escalation policies, routing rules). */
  [ChangeSurfaceId.ONCALL_ROUTING_CHANGED]: [
    '**/pagerduty/routing*', '**/pagerduty/escalation*',
    '**/opsgenie/routing*', '**/opsgenie/escalation*',
    '**/oncall/routing/**', '**/alert-routing/**',
    '**/alertmanager/routes/**', '**/alertmanager/*.yaml',
    '**/routing-rules/**', '**/escalation-policies/**',
  ],
};

/**
 * Resolve a ChangeSurfaceId (or array) to a flat list of file path globs.
 * Returns empty array if the surface has no file globs (e.g., actor-based surfaces).
 */
export function resolveChangeSurfaceGlobs(
  surface: ChangeSurfaceId | ChangeSurfaceId[]
): string[] {
  const surfaces = Array.isArray(surface) ? surface : [surface];
  const globs = surfaces.flatMap(s => CHANGE_SURFACE_GLOBS[s] ?? []);
  return [...new Set(globs)]; // deduplicate
}

