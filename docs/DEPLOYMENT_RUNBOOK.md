# Deployment Runbook

**Last Updated**: 2026-02-08  
**Owner**: Platform Team  
**Severity**: SEV2

---

## Overview

This runbook covers deployment procedures for the VertaAI platform, including standard deployments, rollback procedures, and troubleshooting steps.

---

## Deployment Steps

### 1. Pre-Deployment Checklist

- [ ] All tests passing in CI/CD
- [ ] Code review approved
- [ ] Database migrations reviewed
- [ ] Feature flags configured
- [ ] Rollback plan documented
- [ ] On-call engineer notified

### 2. Standard Deployment

**Frontend (Vercel)**:
```bash
# Automatic deployment on merge to main
# Manual deployment:
vercel --prod
```

**Backend (Railway)**:
```bash
# Automatic deployment on merge to main
# Manual deployment via Railway dashboard
```

**Database Migrations**:
```bash
# Run migrations
cd apps/api
npx prisma migrate deploy

# Verify migration
npx prisma migrate status
```

### 3. Post-Deployment Verification

```bash
# Health check
curl https://vertaai-api-production.up.railway.app/health

# Verify frontend
curl https://verta-ai-pearl.vercel.app/

# Check database connectivity
psql $DATABASE_URL -c "SELECT 1;"
```

---

## Rollback Procedures

### Frontend Rollback

**Option 1: Vercel Dashboard**
1. Go to: https://vercel.com/fredjr/verta-ai-pearl/deployments
2. Find previous successful deployment
3. Click "Promote to Production"

**Option 2: Git Revert**
```bash
# Revert the commit
git revert <commit-hash>
git push origin main

# Vercel will auto-deploy the revert
```

### Backend Rollback

**Option 1: Railway Dashboard**
1. Go to Railway project dashboard
2. Navigate to Deployments
3. Select previous successful deployment
4. Click "Redeploy"

**Option 2: Git Revert**
```bash
# Revert the commit
git revert <commit-hash>
git push origin main

# Railway will auto-deploy the revert
```

### Database Rollback

**⚠️ CRITICAL: Database rollbacks require careful planning**

```bash
# Create backup first
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Rollback migration
cd apps/api
npx prisma migrate resolve --rolled-back <migration-name>

# Verify
npx prisma migrate status
```

---

## Troubleshooting

### Issue: Deployment Failed

**Symptoms**: Build fails, deployment doesn't complete

**Steps**:
1. Check build logs in Vercel/Railway dashboard
2. Verify environment variables are set correctly
3. Check for TypeScript errors: `npm run build`
4. Verify dependencies: `npm install`

### Issue: Database Connection Failed

**Symptoms**: API returns 500 errors, health check fails

**Steps**:
1. Verify DATABASE_URL environment variable
2. Check database is running: `psql $DATABASE_URL -c "SELECT 1;"`
3. Check connection pool: Look for "too many connections" errors
4. Restart API service if needed

### Issue: Frontend Not Loading

**Symptoms**: Blank page, 404 errors

**Steps**:
1. Check browser console for errors
2. Verify NEXT_PUBLIC_API_URL is set correctly
3. Check Vercel deployment logs
4. Clear browser cache and retry

---

## Monitoring

### Key Metrics

- **API Response Time**: < 200ms (p95)
- **Error Rate**: < 1%
- **Database Connections**: < 80% of pool
- **Memory Usage**: < 80% of limit

### Alerts

- **Critical**: API down, database unreachable
- **Warning**: High error rate, slow response times
- **Info**: Deployment started/completed

---

## Emergency Contacts

- **Platform Team**: @platform-team (Slack)
- **On-Call Engineer**: Check PagerDuty schedule
- **Database Team**: @database-team (Slack)

---

## Related Documentation

- [API Documentation](../README.md)
- [Database Schema](../apps/api/prisma/schema.prisma)
- [Environment Variables](../PRODUCTION_DEPLOYMENT_FIX.md)
- [E2E Testing](../E2E_TESTING_SUMMARY.md)

