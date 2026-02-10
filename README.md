# VertaAI

VertaAI is an intelligent documentation maintenance system that automatically detects drift between your codebase and documentation.

## Features

- **Automatic Drift Detection**: Monitors GitHub PRs, PagerDuty incidents, Slack conversations, and more
- **Multi-Source Intelligence**: Correlates signals across different platforms
- **Smart Classification**: Uses deterministic comparison + LLM fallback for accurate drift detection
- **Automated Patching**: Generates and applies documentation updates
- **Slack Integration**: Interactive approval workflow
- **Confluence Integration**: Automatic documentation updates

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

