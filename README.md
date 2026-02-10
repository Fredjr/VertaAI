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
- **Noise Filtering**: Smart filtering to reduce false positives

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

