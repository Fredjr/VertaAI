# VertaAI

VertaAI is an intelligent documentation maintenance system that automatically detects drift between your codebase and documentation.

## Features

- **Automatic Drift Detection**: Monitors GitHub PRs, PagerDuty incidents, Slack conversations, and more
- **Multi-Source Intelligence**: Correlates signals across different platforms
- **Deterministic Classification**: Uses artifact comparison for 100% deterministic drift detection across all 7 source types
- **Automated Patching**: Generates and applies documentation updates
- **Slack Integration**: Interactive approval workflow
- **Confluence Integration**: Automatic documentation updates
- **Budget Controls**: Configurable limits on drift processing and notifications
- **Noise Filtering**: Context-aware 4-layer filtering system to reduce false positives

## Noise Filtering System

VertaAI uses a sophisticated 4-layer noise filtering system to reduce false positives while maintaining high detection accuracy:

### Layer 1: Context-Aware Keyword Filtering
- Filters based on negative keywords (refactor, lint, typo, etc.)
- **Context-aware**: Documentation keywords are ALLOWED when targeting doc systems
- **Coverage-aware**: Never filters signals with coverage keywords (new feature, add support, etc.)
- **Source-balanced**: GitHub sources use more lenient thresholds to match operational sources

### Layer 2: Plan-Based Noise Controls
- User-configurable ignore patterns, paths, and authors
- Customizable per DriftPlan for fine-grained control

### Layer 3: Eligibility Rules
- Source-specific structural filters (file paths, labels, authors)
- Minimum/maximum change thresholds

### Layer 4: Fingerprint-Based Suppression
- Prevents duplicate notifications for the same drift
- Three levels: exact match, normalized tokens, high-level patterns

**Expected Performance:**
- Filter rate: ~15% (balanced noise reduction)
- False negative rate: <5% (minimal missed drifts)
- Coverage drift detection: ~80% (new features detected)
- Documentation drift detection: ~90% (doc updates detected)

---

## Deterministic Drift Detection

VertaAI uses a **deterministic artifact comparison system** to detect drift between code and documentation. This approach provides:

### Key Benefits
- **100% Reproducible**: Same input always produces same output (no LLM randomness)
- **Fast**: No LLM calls needed for classification
- **Transparent**: Clear explanation of what changed and why it's drift
- **Accurate**: Detects 5 types of drift across 7 source types

### How It Works

1. **Artifact Extraction**: Extract structured data from both source (PR, incident, alert) and documentation
   - Commands, URLs, config values
   - Process steps and sequences
   - Ownership information (teams, channels, owners)
   - Environment details (tools, platforms, versions)

2. **Deterministic Comparison**: Compare source artifacts against doc artifacts
   - Detect conflicts (source says X, doc says Y)
   - Detect new content (source has X, doc doesn't mention it)
   - Detect coverage gaps (doc doesn't cover scenario)
   - Calculate confidence score (0.0 to 1.0)

3. **Classification**: Determine drift type based on comparison
   - **Instruction Drift**: Commands, URLs, or config values are wrong
   - **Process Drift**: Steps or sequences are outdated
   - **Ownership Drift**: Teams, channels, or owners have changed
   - **Environment Drift**: Tools, platforms, or versions have changed
   - **Coverage Drift**: Documentation doesn't cover the scenario

### Supported Sources

All 7 source types use deterministic classification:
- GitHub Pull Requests
- PagerDuty Incidents
- Slack Conversations
- Datadog Alerts
- Grafana Alerts
- Infrastructure-as-Code Changes
- CODEOWNERS Changes

### Classification Methods

- `deterministic`: Comparison confidence ≥ 60% (high confidence)
- `deterministic_low_confidence`: Comparison confidence < 60% but drift detected (uses default type)
- `llm`: Legacy method (deprecated, not used in new flow)

## DriftPlan as Control-Plane

VertaAI uses **DriftPlan** as the central control-plane for all drift detection and routing decisions. This provides fine-grained control over how drifts are processed, routed, and acted upon.

### Key Capabilities

#### 1. **Plan-Driven Routing Thresholds**
Each DriftPlan can override workspace-level thresholds:
- `autoApprove`: Confidence threshold for automatic approval (default: 0.98)
- `slackNotify`: Confidence threshold for Slack notifications (default: 0.40)
- `digestOnly`: Confidence threshold for digest-only (default: 0.30)
- `ignore`: Confidence threshold for ignoring (default: 0.20)

**Resolution Priority**: Plan → Workspace → Source Defaults

#### 2. **Budget Controls**
Prevent notification fatigue and control processing costs:
- `maxDriftsPerDay`: Maximum drifts to process per day
- `maxDriftsPerWeek`: Maximum drifts to process per week
- `maxSlackNotificationsPerHour`: Rate limit for Slack notifications

When budgets are exceeded, drifts are downgraded (e.g., `slack_notify` → `digest_only`).

#### 3. **Noise Filtering**
Reduce false positives with smart filtering:
- **Ignore Patterns**: Filter by title/body patterns (e.g., "WIP:", "Draft:", "test:")
- **Ignore Paths**: Filter by file paths (e.g., "test/**", "*.test.ts")
- **Ignore Authors**: Filter by specific authors (e.g., "dependabot", "renovate")

Filtered drifts are marked as `COMPLETED` without processing.

#### 4. **Doc Targeting Strategy**
Control which docs to update first:
- **Strategy**: `priority_order`, `most_recent`, `highest_confidence`
- **Max Docs Per Drift**: Limit number of docs updated per drift
- **Priority Order**: Custom ordering of doc systems (e.g., Confluence → Notion → GitHub)

#### 5. **Source Cursors**
Track last processed signal per source for incremental processing:
- Prevents reprocessing old signals
- Enables "catch-up" mode after downtime
- Tracks processing position per source type

#### 6. **PlanRun Tracking**
Every drift is linked to a PlanRun record that captures:
- Which plan version was active
- What thresholds were used
- What routing decision was made
- Timestamp of execution

This enables **reproducibility** and **audit trails** for all routing decisions.

### Example DriftPlan Configuration

```json
{
  "name": "Production Drift Plan",
  "thresholds": {
    "autoApprove": 0.98,
    "slackNotify": 0.40,
    "digestOnly": 0.30,
    "ignore": 0.20
  },
  "budgets": {
    "maxDriftsPerDay": 50,
    "maxDriftsPerWeek": 200,
    "maxSlackNotificationsPerHour": 5
  },
  "noiseControls": {
    "ignorePatterns": ["WIP:", "Draft:", "test:", "chore:"],
    "ignorePaths": ["test/**", "*.test.ts", "*.spec.ts"],
    "ignoreAuthors": ["dependabot[bot]", "renovate[bot]"]
  },
  "docTargeting": {
    "strategy": "priority_order",
    "maxDocsPerDrift": 3,
    "priorityOrder": ["confluence", "notion", "github_readme"]
  }
}
```

### Benefits

- ✅ **Reproducible**: Same plan version always produces same routing decision
- ✅ **Auditable**: Full history of which plan was used for each drift
- ✅ **Flexible**: Override thresholds per plan without changing workspace settings
- ✅ **Cost-Controlled**: Budget limits prevent runaway processing costs
- ✅ **Noise-Resistant**: Smart filtering reduces false positives

## Deployment

### Railway Deployment

The API is deployed on Railway with automatic deployments from the `main` branch.

**Important**: QStash jobs are delayed by 3 minutes to account for Railway deployment time. This ensures that webhook callbacks hit the new container after deployment completes, preventing race conditions.

### Environment Variables

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- `QSTASH_URL`: Upstash QStash endpoint
- `QSTASH_TOKEN`: Upstash QStash token
- `QSTASH_CURRENT_SIGNING_KEY`: QStash signing key
- `QSTASH_NEXT_SIGNING_KEY`: QStash next signing key
- `SLACK_CLIENT_ID`: Slack app client ID
- `SLACK_CLIENT_SECRET`: Slack app client secret
- `CONFLUENCE_CLIENT_ID`: Confluence app client ID
- `CONFLUENCE_CLIENT_SECRET`: Confluence app client secret
- `ANTHROPIC_API_KEY`: Claude API key

## Architecture

- **Frontend**: Next.js 14 (React) on Vercel
- **Backend**: Node.js + Express on Railway
- **Database**: PostgreSQL 15 on Railway (Prisma ORM)
- **Queue**: QStash for async job processing
- **AI**: Claude Sonnet 4 for drift classification

## Development

```bash
# Install dependencies
pnpm install

# Run database migrations
cd apps/api && npx prisma migrate dev

# Start development server
cd apps/api && pnpm dev
```

## Testing

```bash
# Run tests
cd apps/api && pnpm test

# Run type checking
cd apps/api && npx tsc --noEmit
```

## License

MIT

