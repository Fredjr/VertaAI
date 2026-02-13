# E2E Test Setup Summary - Phase 1-5 Validation

**Date**: 2026-02-13  
**Status**: ✅ READY FOR TESTING

---

## 🎯 Test Overview

This end-to-end test validates the entire VertaAI pipeline with all Phase 1-5 features enabled. The test is designed to trigger all 4 drift types and verify that each phase of the pipeline works correctly.

---

## 📋 Test Configuration

### Workspace Details

**Workspace ID**: `e887c992-63e1-4719-91cf-8ba165c893cd`  
**Workspace Name**: E2E Test Workspace 1770988360322  
**Owner**: fredericle77@gmail.com

**Feature Flags** (All Enabled):
```json
{
  "ENABLE_TYPED_DELTAS": true,
  "ENABLE_EVIDENCE_TO_LLM": true,
  "ENABLE_MATERIALITY_GATE": true,
  "ENABLE_CONTEXT_EXPANSION": true,
  "ENABLE_TEMPORAL_ACCUMULATION": true
}
```

**Enabled Drift Types**:
- `instruction` - Commands, configs, URLs
- `process` - Workflow steps, sequences
- `ownership` - Teams, owners, contacts
- `environment_tooling` - Platforms, tools, infrastructure

**Enabled Input Sources**:
- `github_pr` - GitHub Pull Requests

**Enabled Output Targets**:
- `confluence` - Confluence pages
- `github_readme` - GitHub README files

---

### DriftPlan Details

**Plan ID**: `eaaeeb85-5c8c-433e-a505-d58f6948c59a`  
**Plan Name**: E2E Test Plan - Phase 1-5 Validation  
**Status**: active  
**Scope**: workspace

**Primary Documentation Target**:
- **System**: Confluence
- **Page**: [Template - Decision documentation](https://frederic-le.atlassian.net/wiki/spaces/SD/pages/164013/Template+-+Decision+documentation)

**Doc Targeting Strategy**:
- Strategy: `all_parallel` (patches both Confluence and README)
- Max Docs Per Drift: 2
- Priority Order: `['confluence', 'github_readme']`

**Thresholds**:
- Auto-approve: 0.98 (very high confidence)
- Slack notify: 0.40 (medium confidence)
- Digest only: 0.30 (low confidence)
- Ignore: 0.20 (very low confidence)

---

## 🔄 Test PR Details

**PR Number**: #18  
**Branch**: `e2e-test-phase-1-5`  
**URL**: https://github.com/Fredjr/VertaAI/pull/18

**Files Changed**:
1. `E2E_TEST_CHANGES.md` (NEW) - 200+ lines of changes across all 4 drift types
2. `README.md` (MODIFIED) - Added deployment section with Railway instructions
3. `apps/api/scripts/create-test-workspace.ts` (NEW) - Workspace creation script
4. `apps/api/scripts/create-test-plan.ts` (NEW) - Plan creation script

**Total Changes**: +464 lines, -2 lines

---

## 🧪 Changes by Drift Type

### 1. INSTRUCTION DRIFT ⚙️

**Triggers**: New commands, configuration changes, URL updates

**Changes in E2E_TEST_CHANGES.md**:
- New deployment prerequisites (Node.js 18+, Docker, PostgreSQL 14+, Redis 7+)
- New installation commands: `pnpm install`, `pnpm prisma generate`
- Updated environment variables: `DATABASE_URL`, `REDIS_URL`, `GITHUB_WEBHOOK_SECRET`, `CONFLUENCE_API_TOKEN`
- New database migration commands: `pnpm prisma migrate deploy`, `pnpm prisma db seed`
- Health check verification: `curl http://localhost:3000/health`

**Expected Typed Deltas**: ~8-10 deltas
- `artifactType: 'command'` - pnpm commands, curl commands
- `artifactType: 'config'` - Environment variables
- `artifactType: 'url'` - Health check endpoint

### 2. PROCESS DRIFT 🔄

**Triggers**: Workflow changes, step order changes, new/removed steps

**Changes in E2E_TEST_CHANGES.md**:
- **NEW STEP**: Pre-deployment checks (tests, compilation, connectivity)
- **CHANGED ORDER**: Database preparation before app deployment
- **UPDATED**: Application deployment with health checks (5-minute timeout)
- **NEW STEP**: Post-deployment validation (smoke tests, webhook verification)
- **UPDATED**: Automatic rollback on validation failure

**Expected Typed Deltas**: ~6-8 deltas
- `artifactType: 'step'` - New steps, modified steps
- `artifactType: 'sequence'` - Workflow order changes
- `action: 'added'` - Pre-deployment checks, post-deployment validation
- `action: 'modified'` - Deployment step, rollback procedure

### 3. OWNERSHIP DRIFT 👥

**Triggers**: Team changes, owner changes, contact changes

**Changes in E2E_TEST_CHANGES.md**:
- **NEW TEAM**: Backend API Team (@sarah-backend, #team-backend-api, backend-api-oncall)
- **CHANGED LEAD**: Frontend Team lead @mike-frontend → @john-frontend
- **CHANGED CHANNEL**: #frontend-dev → #team-frontend
- **CHANGED ONCALL**: infrastructure-oncall → devops-oncall
- **NEW CONTACT**: devops@vertaai.com

**Expected Typed Deltas**: ~7-9 deltas
- `artifactType: 'team'` - New Backend API Team
- `artifactType: 'owner'` - Lead changes
- `artifactType: 'contact'` - Slack channels, PagerDuty, email
- `action: 'added'` - New team, new email
- `action: 'modified'` - Changed leads, changed channels

### 4. ENVIRONMENT_TOOLING DRIFT 🛠️

**Triggers**: Platform changes, tool changes, infrastructure changes

**Changes in E2E_TEST_CHANGES.md + README.md**:
- **PLATFORM**: Heroku → Railway
- **DATABASE**: PostgreSQL 13 → 14
- **CACHING**: Added Redis 7
- **MONITORING**: Added DataDog APM
- **CI/CD**: GitHub Actions → Railway auto-deploy
- **PACKAGE MANAGER**: npm/yarn → pnpm
- **TYPESCRIPT**: Upgraded to 5.3
- **TESTING**: Jest → Vitest

**Expected Typed Deltas**: ~10-12 deltas
- `artifactType: 'platform'` - Heroku → Railway
- `artifactType: 'tool'` - PostgreSQL, pnpm, Vitest
- `artifactType: 'infrastructure'` - Redis, DataDog
- `artifactType: 'version'` - TypeScript 5.3, PostgreSQL 14
- `action: 'added'` - Redis, DataDog
- `action: 'modified'` - Platform, database, package manager, testing framework

---

## ✅ Expected Phase 1-5 Behavior

### Phase 1: Typed Deltas
- ✅ ~30-40 typed deltas generated across all 4 drift types
- ✅ Each delta has `artifactType`, `action`, `sourceValue`, `docValue`, `confidence`
- ✅ Deltas flattened and stored in `comparison_result.typedDeltas`

### Phase 2: Evidence Contract
- ✅ Evidence bundle mapped to minimal contract
- ✅ Contract includes `version`, `signal`, `typedDeltas`, `docContext`, `assessment`
- ✅ Typed deltas truncated to max 50 (if needed)
- ✅ High-confidence deltas prioritized
- ✅ Contract passed to LLM agents for patch generation

### Phase 3: Materiality Gate
- ✅ Materiality score computed from impact band, delta count, risk factors
- ✅ Expected score: 0.7-0.9 (HIGH materiality)
- ✅ `shouldPatch: true` (drift not skipped)
- ✅ Factors: impactBandScore, deltaCountScore, riskFactorScore

### Phase 4: Context Expansion
- ✅ Top 3 changed files selected: `E2E_TEST_CHANGES.md`, `README.md`, script file
- ✅ Full content fetched (all under 10KB)
- ✅ `expandedContext` attached to evidence bundle
- ✅ Helps LLM distinguish critical changes from trivial edits

### Phase 5: Temporal Accumulation
- ✅ Drift history created for each doc target (Confluence, README)
- ✅ Drift recorded with materiality score and drift type
- ✅ Accumulation window: 7 days
- ✅ Bundling triggers: 5+ drifts, total materiality ≥ 1.5, or window expired with ≥2 drifts

---

## 🚀 Testing Instructions

### Step 1: Merge the PR

```bash
# Option 1: Merge via GitHub UI
# Go to https://github.com/Fredjr/VertaAI/pull/18 and click "Merge pull request"

# Option 2: Merge via command line
git checkout main
git merge e2e-test-phase-1-5
git push origin main
```

### Step 2: Monitor Pipeline Execution

```bash
# Run the monitoring script
cd apps/api
npx tsx scripts/monitor-e2e-test.ts e887c992-63e1-4719-91cf-8ba165c893cd
```

### Step 3: Check Railway Logs

1. Go to Railway dashboard
2. Select the VertaAI project
3. View logs for webhook receipt and processing
4. Look for log entries like:
   - `[GitHub Webhook] Received PR event`
   - `[SignalEvent] Created github_pr event`
   - `[DriftCandidate] Created drift candidate`
   - `[Phase 1] Generated X typed deltas`
   - `[Phase 3] Materiality score: X.XX`
   - `[Phase 4] Fetched X files for context expansion`
   - `[Phase 5] Recorded drift in history`

### Step 4: Verify Database Records

```sql
-- Check SignalEvent
SELECT * FROM signal_events 
WHERE workspace_id = 'e887c992-63e1-4719-91cf-8ba165c893cd' 
ORDER BY created_at DESC LIMIT 1;

-- Check DriftCandidate with typed deltas
SELECT id, state, drift_type, confidence, 
       comparison_result->'typedDeltas' as typed_deltas,
       comparison_result->'materialityScore' as materiality_score
FROM drift_candidates 
WHERE workspace_id = 'e887c992-63e1-4719-91cf-8ba165c893cd' 
ORDER BY created_at DESC LIMIT 1;

-- Check expanded context
SELECT evidence_bundle->'expandedContext' as expanded_context
FROM drift_candidates 
WHERE workspace_id = 'e887c992-63e1-4719-91cf-8ba165c893cd' 
ORDER BY created_at DESC LIMIT 1;

-- Check drift histories
SELECT * FROM drift_histories 
WHERE workspace_id = 'e887c992-63e1-4719-91cf-8ba165c893cd' 
ORDER BY created_at DESC;
```

---

## 📊 Success Criteria

- [ ] PR webhook triggers successfully
- [ ] SignalEvent created with `source_type: 'github_pr'`
- [ ] DriftCandidate created with state progression
- [ ] Typed deltas present in `comparison_result` (~30-40 deltas)
- [ ] Materiality score computed (expected: 0.7-0.9)
- [ ] `shouldPatch: true` (drift not skipped)
- [ ] Expanded context attached with 3 files
- [ ] Drift history created for both Confluence and README
- [ ] Patches generated for both doc targets
- [ ] Slack notification sent (if configured)

---

## 🔍 Troubleshooting

### Webhook Not Triggering

1. Check GitHub webhook delivery in repo settings
2. Verify Railway environment variables are set
3. Check Railway logs for errors

### No Drift Candidate Created

1. Verify workspace ID exists: `SELECT * FROM workspaces WHERE id = 'e887c992-63e1-4719-91cf-8ba165c893cd'`
2. Verify plan ID exists and is active: `SELECT * FROM drift_plans WHERE id = 'eaaeeb85-5c8c-433e-a505-d58f6948c59a'`
3. Check eligibility rules in plan

### Typed Deltas Missing

1. Verify `ENABLE_TYPED_DELTAS` feature flag is true
2. Check comparison logic in baseline service
3. Review Railway logs for errors during comparison

### Materiality Score Missing

1. Verify `ENABLE_MATERIALITY_GATE` feature flag is true
2. Check materiality computation in evidence service
3. Review impact assessment logic

### Expanded Context Missing

1. Verify `ENABLE_CONTEXT_EXPANSION` feature flag is true
2. Check file selection logic (top 3 by change volume)
3. Verify files are under 10KB size limit

---

## 📚 Related Documentation

- `PHASE_1-5_TEST_REPORT.md` - Comprehensive test report for Phase 1-5 features
- `E2E_TEST_CHANGES.md` - Detailed changes designed to trigger all drift types
- `apps/api/scripts/create-test-workspace.ts` - Workspace creation script
- `apps/api/scripts/create-test-plan.ts` - Plan creation script
- `apps/api/scripts/monitor-e2e-test.ts` - Monitoring script

---

**Ready to test!** Merge PR #18 and run the monitoring script to verify all Phase 1-5 features. 🚀

