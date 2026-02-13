# E2E Test Changes - Phase 1-5 Validation

This file contains significant changes designed to trigger all 4 drift types and test Phase 1-5 features.

## Deployment Instructions (INSTRUCTION DRIFT)

### Prerequisites
- Node.js 18+ installed
- Docker Desktop running
- PostgreSQL 14+ database
- Redis 7+ for caching

### New Deployment Steps

1. **Install dependencies**
   ```bash
   pnpm install
   cd apps/api && pnpm prisma generate
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Update the following critical variables:
   DATABASE_URL="postgresql://user:password@localhost:5432/vertaai"
   REDIS_URL="redis://localhost:6379"
   GITHUB_WEBHOOK_SECRET="your-webhook-secret-here"
   CONFLUENCE_API_TOKEN="your-confluence-token"
   ```

3. **Run database migrations**
   ```bash
   cd apps/api
   pnpm prisma migrate deploy
   pnpm prisma db seed
   ```

4. **Start the application**
   ```bash
   # Development mode
   pnpm dev
   
   # Production mode
   pnpm build
   pnpm start
   ```

5. **Verify deployment**
   ```bash
   curl http://localhost:3000/health
   # Expected response: {"status":"ok","timestamp":"2026-02-13T..."}
   ```

## Process Changes (PROCESS DRIFT)

### New Workflow Order

The deployment process has been updated to follow this sequence:

1. **Pre-deployment checks** (NEW STEP)
   - Run all tests: `pnpm test`
   - Check TypeScript compilation: `pnpm build`
   - Verify database connectivity
   - Check Redis connection

2. **Database preparation** (CHANGED ORDER - moved before app deployment)
   - Backup current database
   - Run migrations
   - Verify schema integrity

3. **Application deployment** (CHANGED - now includes health checks)
   - Build Docker image
   - Push to container registry
   - Deploy to Railway
   - Wait for health check to pass (timeout: 5 minutes)

4. **Post-deployment validation** (NEW STEP)
   - Run smoke tests
   - Verify webhook endpoints
   - Check coverage metrics
   - Monitor error rates for 10 minutes

5. **Rollback procedure** (UPDATED)
   - If any validation fails, automatically rollback to previous version
   - Restore database from backup
   - Alert on-call engineer via PagerDuty

## Ownership Changes (OWNERSHIP DRIFT)

### Team Responsibilities

**Backend API Team** (NEW TEAM)
- **Lead**: @sarah-backend
- **Slack Channel**: #team-backend-api
- **PagerDuty**: backend-api-oncall
- **Responsibilities**:
  - API routes and middleware
  - Database schema and migrations
  - Background jobs and workers
  - Integration with external services

**Frontend Team** (UPDATED)
- **Lead**: @john-frontend (changed from @mike-frontend)
- **Slack Channel**: #team-frontend (changed from #frontend-dev)
- **PagerDuty**: frontend-oncall
- **Responsibilities**:
  - React components and pages
  - State management
  - UI/UX implementation

**DevOps Team** (NEW CONTACT INFO)
- **Lead**: @alex-devops
- **Slack Channel**: #team-devops
- **PagerDuty**: devops-oncall (changed from infrastructure-oncall)
- **Email**: devops@vertaai.com (NEW)

## Environment & Tooling Changes (ENVIRONMENT_TOOLING DRIFT)

### Infrastructure Updates

**Container Platform**: Migrated from Heroku to Railway
- **Reason**: Better performance, lower cost, native Docker support
- **Migration Date**: 2026-02-10
- **Rollback Plan**: Heroku app still available for 30 days

**Database**: Upgraded from PostgreSQL 13 to PostgreSQL 14
- **New Features**: Performance improvements, better JSON support
- **Connection String**: Updated to use SSL mode `require`

**Caching Layer**: Added Redis 7
- **Purpose**: Session storage, rate limiting, coverage metrics caching
- **Endpoint**: redis://vertaai-redis.railway.app:6379
- **Failover**: Graceful degradation if Redis unavailable

**Monitoring Tools**: Added DataDog APM
- **Dashboard**: https://app.datadoghq.com/dashboard/vertaai
- **Alerts**: Configured for error rate > 1%, latency > 500ms
- **Integration**: Automatic incident creation in PagerDuty

**CI/CD Pipeline**: Migrated from GitHub Actions to Railway auto-deploy
- **Trigger**: Push to main branch
- **Build Time**: ~3-5 minutes
- **Deployment**: Automatic with health checks
- **Rollback**: One-click rollback in Railway dashboard

### Development Tools

**Package Manager**: Standardized on pnpm (was using npm/yarn mix)
- **Version**: pnpm 8.x
- **Workspace**: Monorepo with Turborepo
- **Lock File**: pnpm-lock.yaml (committed to git)

**TypeScript**: Upgraded to 5.3
- **Module Resolution**: NodeNext
- **Target**: ES2022
- **Strict Mode**: Enabled

**Testing Framework**: Vitest (replaced Jest)
- **Speed**: 10x faster test execution
- **Watch Mode**: Better developer experience
- **Coverage**: Built-in coverage reporting

## Testing Instructions

### Running E2E Tests

```bash
# Run all tests
pnpm test

# Run specific test suites
pnpm test -- src/__tests__/baseline/
pnpm test -- src/__tests__/evidence/
pnpm test -- src/__tests__/context/
pnpm test -- src/__tests__/temporal/

# Run with coverage
pnpm test:coverage
```

### Expected Test Results

All 73 tests should pass:
- Baseline comparison: 2 tests
- Evidence contract: 7 tests
- Materiality scoring: 15 tests
- Context expansion: 11 tests
- Temporal accumulation: 9 tests
- Additional coverage: 29 tests

## Troubleshooting

### Common Issues

**Issue**: Database connection fails
**Solution**: Verify DATABASE_URL is correct and PostgreSQL is running

**Issue**: Redis connection timeout
**Solution**: Check REDIS_URL and ensure Redis is accessible

**Issue**: Webhook signature validation fails
**Solution**: Verify GITHUB_WEBHOOK_SECRET matches GitHub settings

**Issue**: Confluence API returns 401
**Solution**: Regenerate CONFLUENCE_API_TOKEN with correct permissions

