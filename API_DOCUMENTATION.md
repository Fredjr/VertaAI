# VertaAI API Documentation

## Overview
This document provides comprehensive API documentation for the VertaAI transformation, covering 40+ TypeScript functions and type definitions extracted from the GAP_ANALYSIS.md specifications.

## Core Type Definitions

### EvidenceBundle
**File**: `apps/api/src/services/evidence/types.ts`

The central data structure containing all evidence for a drift assessment.

```typescript
export type EvidenceBundle = {
  bundleVersion: string;      // Schema version for compatibility
  createdAt: string;          // ISO timestamp
  workspaceId: string;
  driftCandidateId: string;

  source: SourceEvidence;     // What changed in reality
  target: TargetEvidence;     // What doc currently says
  assessment: Assessment;     // Computed impact and consequences
  fingerprints: Fingerprints; // For suppression system
};
```

### ImpactInputs
**File**: `apps/api/src/services/impact/types.ts`

Multi-source input structure for impact assessment.

```typescript
export type ImpactInputs = {
  sourceType: InputSourceType;
  driftType: DriftType;
  domains: DriftDomain[];
  docSystem?: DocSystem;
  confidence: number;

  // Source-specific evidence
  github?: GitHubEvidence;
  openApi?: OpenApiEvidence;
  codeowners?: CodeownersEvidence;
  iac?: IacEvidence;
  pagerduty?: PagerDutyEvidence;
  slack?: SlackEvidence;
  alert?: AlertEvidence;

  baseline?: BaselineEvidence;
  targetSurface?: TargetSurface;
};
```

### DocClaim
**File**: `apps/api/src/services/docs/docClaimExtractor.ts`

Deterministic extraction of documentation claims.

```typescript
export type DocClaim = {
  claimType: "instruction_token" | "process_step" | "owner_block" |
             "missing_coverage" | "tool_reference" | "api_contract_snippet";
  label: string;              // Human-readable description
  snippet: string;            // Extracted text (max 500 chars)
  headingPath?: string[];     // Document structure context
  location?: {                // Line numbers for precise location
    startLine: number;
    endLine: number;
  };
  matchedTokens?: string[];   // Tokens that triggered extraction
  patternId?: string;         // Pattern ID for debugging
};
```

## Evidence Bundle API

### buildEvidenceBundle()
**File**: `apps/api/src/services/evidence/builder.ts`

Main function to create deterministic evidence bundles.

```typescript
export async function buildEvidenceBundle(args: {
  driftCandidate: any;
  signalEvent: any;
  docContext: any;
  parserArtifacts?: ParserArtifacts;
}): Promise<EvidenceBundle>
```

**Parameters**:
- `driftCandidate`: Current drift candidate record
- `signalEvent`: Source signal (PR, incident, alert, etc.)
- `docContext`: Fetched documentation content and baseline
- `parserArtifacts`: Optional parsed data (OpenAPI diffs, IaC summaries, etc.)

**Returns**: Complete EvidenceBundle with all evidence and assessment

**Usage**:
```typescript
const bundle = await buildEvidenceBundle({
  driftCandidate: drift,
  signalEvent: signal,
  docContext: docContext,
  parserArtifacts: {
    openApiDiff: signal.openApiDiff,
    codeownersDiff: signal.codeownersDiff,
    iacSummary: signal.iacSummary
  }
});
```

### Source Evidence Builders

#### extractDiffExcerpt()
Extracts deterministic diff excerpts with line boundaries.

```typescript
function extractDiffExcerpt(diff: string | undefined, maxChars: number): string
```

#### buildOpenApiSummary()
Creates human-readable OpenAPI change summaries.

```typescript
function buildOpenApiSummary(diff: any): string
// Returns: "3 endpoints removed, 2 breaking changes"
```

#### extractTimelineExcerpt()
Extracts incident timeline excerpts for PagerDuty evidence.

```typescript
function extractTimelineExcerpt(timeline: any[] | undefined, maxEntries: number): string
```

## Impact Assessment API

### buildImpactInputs()
**File**: `apps/api/src/services/impact/buildImpactInputs.ts`

Converts raw signal data into structured impact inputs.

```typescript
export function buildImpactInputs(args: {
  driftCandidate: any;
  signalEvent: any;
  docContext: any;
  parserArtifacts?: any;
}): ImpactInputs

## DriftPlan API

### Plan Management
**File**: `apps/api/src/services/plans/manager.ts`

#### createDriftPlan()
Creates a new drift plan with versioning.

```typescript
export async function createDriftPlan(args: {
  workspaceId: string;
  name: string;
  scopeType: "workspace" | "service" | "repo";
  scopeRef?: string;
  primaryDocId: string;
  primaryDocSystem: DocSystem;
  docClass?: string;
  config: DriftPlanConfig;
}): Promise<DriftPlan>
```

#### resolveDriftPlan()
Resolves the active plan using 5-step fallback hierarchy.

```typescript
export async function resolveDriftPlan(args: {
  workspaceId: string;
  serviceId?: string;
  repoId?: string;
  docSystem: DocSystem;
  docClass?: string;
}): Promise<DriftPlan | null>
```

**Fallback Order**:
1. Exact match (workspace + service + docSystem + docClass)
2. Service-level default (workspace + service + docSystem)
3. Doc system default (workspace + docSystem)
4. Workspace default (workspace only)
5. Global template (if enabled)

#### updateDriftPlan()
Updates plan with automatic versioning.

```typescript
export async function updateDriftPlan(args: {
  planId: string;
  updates: Partial<DriftPlanConfig>;
  reason?: string;
}): Promise<DriftPlan>
```

**Automatic versioning**:
- Increments version number
- Generates new SHA-256 hash
- Preserves previous version for rollback

### Plan Templates
**File**: `apps/api/src/services/plans/templates.ts`

#### getTemplateLibrary()
Returns available plan templates.

```typescript
export function getTemplateLibrary(): PlanTemplate[]
```

**Built-in templates**:
- `microservice-standard`: Standard microservice documentation
- `api-gateway`: API gateway and routing documentation
- `database-ops`: Database operations and migrations
- `infrastructure`: Infrastructure and deployment docs
- `security-compliance`: Security and compliance documentation

#### applyTemplate()
Applies template to create new plan.

```typescript
export async function applyTemplate(args: {
  templateId: string;
  workspaceId: string;
  customizations?: TemplateCustomizations;
}): Promise<DriftPlan>
```

## Coverage Health API

### Coverage Calculation
**File**: `apps/api/src/services/coverage/calculator.ts`

#### calculateCoverageSnapshot()
Calculates current coverage metrics.

```typescript
export async function calculateCoverageSnapshot(args: {
  workspaceId: string;
  date?: Date;
}): Promise<CoverageSnapshot>
```

**Metrics calculated**:
- **Mapping Coverage**: % of services with documentation mapped
- **Processing Coverage**: % of mapped docs being actively monitored
- **Source Health**: Health score per input source (GitHub, PagerDuty, etc.)
- **Blocked Reasons**: Categorized reasons for coverage gaps

#### getCoverageObligation()
Checks coverage obligations and alerts.

```typescript
export async function getCoverageObligation(args: {
  workspaceId: string;
  serviceId?: string;
}): Promise<CoverageObligation[]>
```

**Obligation types**:
- `missing_runbook`: Critical service missing runbook
- `stale_api_docs`: API documentation not updated in 30+ days
- `no_ownership`: Service without clear ownership documentation
- `incident_gaps`: Recent incidents without documentation updates

### Coverage Dashboard
**File**: `apps/api/src/routes/coverage/dashboard.ts`

#### GET /api/coverage/dashboard
Returns coverage dashboard data.

**Response**:
```typescript
{
  overall: {
    mappingCoverage: number;      // 0-1
    processingCoverage: number;   // 0-1
    healthScore: number;          // 0-1
  };
  byService: ServiceCoverage[];
  byDocSystem: DocSystemCoverage[];
  obligations: CoverageObligation[];
  trends: CoverageTrend[];
}
```

## Audit & Compliance API

### Audit Trail
**File**: `apps/api/src/services/audit/trail.ts`

#### recordAuditEvent()
Records audit events for compliance.

```typescript
export async function recordAuditEvent(args: {
  workspaceId: string;
  eventType: AuditEventType;
  entityType: "drift_candidate" | "drift_plan" | "evidence_bundle";
  entityId: string;
  userId?: string;
  metadata?: Record<string, any>;
}): Promise<void>
```

**Event types**:
- `drift_detected`: New drift candidate created
- `verification_completed`: User verified/rejected drift
- `patch_generated`: Documentation patch created
- `plan_updated`: Drift plan configuration changed
- `suppression_added`: New suppression rule created

#### getAuditTrail()
Retrieves audit trail for compliance reporting.

```typescript
export async function getAuditTrail(args: {
  workspaceId: string;
  entityType?: string;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  cursor?: string;
}): Promise<{
  events: AuditEvent[];
  nextCursor?: string;
}>
```

### Compliance Export
**File**: `apps/api/src/services/audit/export.ts`

#### exportComplianceReport()
Generates compliance reports for auditors.

```typescript
export async function exportComplianceReport(args: {
  workspaceId: string;
  reportType: "sox" | "soc2" | "iso27001" | "custom";
  startDate: Date;
  endDate: Date;
  format: "csv" | "pdf" | "json";
}): Promise<{
  reportId: string;
  downloadUrl: string;
  expiresAt: Date;
}>
```

**Report contents**:
- All drift detections and resolutions
- Evidence bundles with complete audit trails
- Plan changes with approval workflows
- User actions with timestamps and justifications
- System decisions with deterministic rule explanations

## Analytics API

### Metrics Collection
**File**: `apps/api/src/services/analytics/collector.ts`

#### recordMetric()
Records business and technical metrics.

```typescript
export async function recordMetric(args: {
  workspaceId: string;
  metricType: MetricType;
  value: number;
  dimensions?: Record<string, string>;
  timestamp?: Date;
}): Promise<void>
```

**Metric types**:
- `false_positive_rate`: % of drift marked as false positive
- `response_time`: Time from detection to resolution
- `coverage_percentage`: % of services with active monitoring
- `suppression_accuracy`: % of suppressions that remain valid
- `user_satisfaction`: User feedback scores

#### getAnalyticsDashboard()
Returns analytics dashboard data.

```typescript
export async function getAnalyticsDashboard(args: {
  workspaceId: string;
  timeRange: "7d" | "30d" | "90d" | "1y";
  metrics?: MetricType[];
}): Promise<AnalyticsDashboard>
```

## Webhook API

### Slack Integration
**File**: `apps/api/src/routes/slack/webhooks.ts`

#### POST /api/slack/events
Handles Slack event subscriptions.

**Supported events**:
- `app_mention`: @VertaAI mentions for manual drift reporting
- `message`: Channel messages for Slack cluster detection
- `reaction_added`: Reactions to drift notifications for feedback

#### POST /api/slack/interactions
Handles Slack interactive components.

**Supported interactions**:
- `verta_verify_true`: User confirms drift is accurate
- `verta_verify_false`: User marks drift as false positive
- `verta_generate_patch`: User requests patch generation
- `verta_snooze_7d`: User snoozes drift for 7 days

### External Integrations
**File**: `apps/api/src/routes/webhooks/external.ts`

#### POST /api/webhooks/github
GitHub webhook for PR and push events.

#### POST /api/webhooks/pagerduty
PagerDuty webhook for incident events.

#### POST /api/webhooks/datadog
Datadog webhook for alert events.

#### POST /api/webhooks/grafana
Grafana webhook for alert events.

## Rate Limiting & Security

### Rate Limiting
All API endpoints include rate limiting:

- **Per-workspace limits**: 1000 requests/hour for standard plans
- **Per-user limits**: 100 requests/minute for interactive endpoints
- **Webhook limits**: 10,000 requests/hour for external webhooks
- **Burst allowance**: 2x normal rate for short bursts

### Security Headers
All responses include security headers:

```typescript
{
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Strict-Transport-Security": "max-age=31536000",
  "Content-Security-Policy": "default-src 'self'"
}
```

### Input Validation
All inputs validated using Zod schemas:

```typescript
const CreateDriftPlanSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  scopeType: z.enum(["workspace", "service", "repo"]),
  config: DriftPlanConfigSchema
});
```

## SDK & Client Libraries

### TypeScript SDK
**Package**: `@verta/api-client`

```typescript
import { VertaClient } from '@verta/api-client';

const client = new VertaClient({
  apiKey: process.env.VERTA_API_KEY,
  workspaceId: 'workspace-uuid'
});

// Create evidence bundle
const bundle = await client.evidence.create({
  driftCandidateId: 'drift-uuid',
  // ... other params
});

// Get coverage dashboard
const coverage = await client.coverage.getDashboard({
  timeRange: '30d'
});
```

### REST API Examples

#### Create Drift Plan
```bash
curl -X POST https://api.verta.ai/v1/plans \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "workspace-uuid",
    "name": "API Documentation Plan",
    "scopeType": "service",
    "scopeRef": "user-service",
    "primaryDocSystem": "github_swagger",
    "config": {
      "inputSources": ["github_pr", "openapi_diff"],
      "driftTypes": ["instruction", "api_contract"],
      "thresholds": {"minConfidence": 0.8}
    }
  }'
```

#### Get Evidence Bundle
```bash
curl -X GET https://api.verta.ai/v1/evidence/bundle-uuid \
  -H "Authorization: Bearer $API_KEY"
```

#### Record False Positive
```bash
curl -X POST https://api.verta.ai/v1/suppressions/false-positive \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "workspace-uuid",
    "fingerprints": {
      "strict": "hash1",
      "medium": "hash2",
      "broad": "hash3"
    }
  }'
```

This completes the comprehensive API documentation covering all 40+ functions and type definitions from the VertaAI transformation specifications.
```

**Source-Specific Normalizers**:

#### normalizeOpenApiDiff()
```typescript
function normalizeOpenApiDiff(diff: any): {
  removedEndpoints: Array<{method: string, path: string}>;
  addedRequiredParams: Array<{endpoint: string, param: string}>;
  breakingChanges: Array<{type: string, description: string}>;
}
```

#### normalizePagerduty()
```typescript
function normalizePagerduty(incident: any): {
  severity: string;
  durationMinutes: number;
  responders: string[];
  escalations: number;
  hasPostmortemLink: boolean;
}
```

### getTargetSurface()
**File**: `apps/api/src/services/impact/targetSurface.ts`

Classifies documentation targets for risk assessment.

```typescript
export function getTargetSurface(docSystem: DocSystem, docClass?: string): {
  artifactType: "runbook" | "api_contract" | "service_catalog" |
                "developer_doc" | "code_doc" | "knowledge_base";
  writebackMode: "direct" | "pr_only" | "none";
}
```

**Examples**:
```typescript
getTargetSurface("github_swagger")
// Returns: { artifactType: "api_contract", writebackMode: "pr_only" }

getTargetSurface("confluence", "runbook")
// Returns: { artifactType: "runbook", writebackMode: "direct" }
```

## Doc Claim Extraction API

### extractDocClaims()
**File**: `apps/api/src/services/docs/docClaimExtractor.ts`

Main function for deterministic documentation claim extraction.

```typescript
export function extractDocClaims(args: {
  docSystem: DocSystem;
  driftType: DriftType;
  docText: string;
  baselineFindings?: any;
  hints?: ExtractionHints;
}): DocClaimResult
```

**Specialized Extractors**:

#### extractInstructionClaims()
Extracts instruction tokens and commands.

```typescript
function extractInstructionClaims(args: ExtractionArgs): DocClaimResult
```

#### extractProcessClaims()
Extracts process steps and procedures.

```typescript
function extractProcessClaims(args: ExtractionArgs): DocClaimResult
```

#### extractOwnerBlockClaims()
Extracts ownership information.

```typescript
function extractOwnerBlockClaims(args: ExtractionArgs): DocClaimResult
```

#### extractSwaggerClaims()
Extracts API contract information from OpenAPI specs.

```typescript
function extractSwaggerClaims(args: ExtractionArgs): DocClaimResult
```

**Helper Functions**:

#### findTokenWindow()
Finds text windows around specific tokens.

```typescript
function findTokenWindow(text: string, token: string, windowSize: number): {
  snippet: string;
  startLine: number;
  endLine: number;
} | null
```

#### extractStepSkeleton()
Extracts numbered or bulleted process steps.

```typescript
function extractStepSkeleton(text: string, maxSteps: number): string[]
```

## Suppression System API

### Fingerprint Generation
**File**: `apps/api/src/services/fingerprints/generate.ts`

#### generateFingerprints()
Creates 3-level fingerprint system for suppression.

```typescript
export function generateFingerprints(args: {
  workspaceId: string;
  docSystem: DocSystem;
  docId: string;
  sourceType: InputSourceType;
  driftType: DriftType;
  domains: DriftDomain[];
  keyToken?: string;
}): {
  strict: string;   // Exact match
  medium: string;   // Normalized tokens
  broad: string;    // Domain-level
}
```

#### normalizeKeyToken()
Normalizes tokens for fingerprint matching.

```typescript
export function normalizeKeyToken(token: string): string
// "DB_PORT=5432" → "db_port=*"
// "/api/v1/users/{id}" → "/api/*/users/*"
```

### Suppression Checking
**File**: `apps/api/src/services/fingerprints/suppressionCheck.ts`

#### isSuppressed()
Checks if a drift should be suppressed based on fingerprints.

```typescript
export async function isSuppressed(args: {
  workspaceId: string;
  fingerprints: {strict: string, medium: string, broad: string};
}): Promise<{
  suppressed: boolean;
  level?: "strict" | "medium" | "broad";
  reason?: string;
}>
```

### Outcome Recording
**File**: `apps/api/src/services/fingerprints/recordOutcome.ts`

#### recordFalsePositive()
Records false positive feedback for learning.

```typescript
export async function recordFalsePositive(args: {
  workspaceId: string;
  fingerprints: Fingerprints;
}): Promise<void>
```

#### recordSnooze()
Records snooze action with optional duration.

```typescript
export async function recordSnooze(args: {
  workspaceId: string;
  fingerprints: Fingerprints;
  days?: number;
}): Promise<void>
```

#### recordVerifiedTrue()
Records verified true positive for accuracy tracking.

```typescript
export async function recordVerifiedTrue(args: {
  workspaceId: string;
  fingerprints: Fingerprints;
}): Promise<void>
```

## Slack Integration API

### buildVerifyRealityBlocksFromBundle()
**File**: `apps/api/src/routes/slack/buildVerifyRealityFromBundle.ts`

Creates Slack Block Kit messages from evidence bundles.

```typescript
export function buildVerifyRealityBlocksFromBundle(bundle: EvidenceBundle): SlackBlock[]
```

**Returns**: Array of Slack Block Kit blocks with:
- Header with drift type
- Source evidence section (deterministic excerpts)
- Target evidence section (doc claims)
- Consequence section (impact assessment)
- Action buttons (verify/false positive/patch/snooze)

### formatSourceEvidence()
Formats source evidence for Slack display.

```typescript
function formatSourceEvidence(source: EvidenceBundle['source']): string
```

**Handles all source types**:
- GitHub PR: Shows diff excerpt, changed files, author
- PagerDuty: Shows incident details, timeline excerpt
- Slack cluster: Shows message count, participants, excerpt
- Alerts: Shows severity, occurrences, description

## State Machine Integration

### handleBaselineChecked()
Updated state handler that builds and stores evidence bundles.

```typescript
async function handleBaselineChecked(ctx: TransitionContext): Promise<StateTransition>
```

**Process**:
1. Build EvidenceBundle from all available evidence
2. Store bundle in database
3. Check suppression using bundle fingerprints
4. Route to appropriate next state

### handleSlackSentVerify()
Sends Slack verification message using evidence bundle.

```typescript
async function handleSlackSentVerify(ctx: TransitionContext): Promise<StateTransition>
```

### generatePatch()
Generates documentation patches using evidence bundle for LLM context.

```typescript
async function generatePatch(ctx: TransitionContext): Promise<string>
```

## Database Schema

### EvidenceBundle Storage
Two options for storing evidence bundles:

**Option 1: JSON field on DriftCandidate**
```sql
ALTER TABLE drift_candidates ADD COLUMN evidence_bundle JSONB;
```

**Option 2: Separate table**
```sql
CREATE TABLE evidence_bundles (
  id UUID PRIMARY KEY,
  drift_candidate_id UUID UNIQUE REFERENCES drift_candidates(id),
  workspace_id UUID NOT NULL,
  bundle_version VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  bundle JSONB NOT NULL,
  source_type VARCHAR NOT NULL,
  drift_type VARCHAR NOT NULL,
  impact_band VARCHAR NOT NULL
);
```

## Error Handling

All API functions include comprehensive error handling:

- **Validation**: Input parameter validation with descriptive errors
- **Fallbacks**: Graceful degradation when optional data is missing
- **Logging**: Structured logging for debugging and monitoring
- **Retries**: Automatic retries for transient failures

## Performance Considerations

- **Caching**: Evidence bundles cached in Redis for 24 hours
- **Indexing**: Database indexes on frequently queried fields
- **Pagination**: Large result sets paginated with cursor-based pagination
- **Rate Limiting**: API rate limiting to prevent abuse

## Authentication & Authorization

All APIs require:
- **Workspace-scoped**: All operations scoped to authenticated workspace
- **Role-based**: Different permissions for viewers, editors, admins
- **Audit logging**: All API calls logged for compliance
