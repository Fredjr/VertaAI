# E2E Testing Guide - Source-Level Doc Mapping

## Overview

This guide provides practical steps for testing the complete VertaAI drift detection pipeline with the new source-level doc mapping feature.

## Architecture Changes

### What Changed
- **Replaced** complex drift-type-based routing with simple source-level mapping
- **Added** `source_type` column to `doc_mappings_v2` (nullable - NULL = applies to all sources)
- **Simplified** resolution logic from 150+ lines of scoring to simple exact match → fallback

### Resolution Logic
```
1. Try exact match: workspace + repo + sourceType
2. Fallback: workspace + repo + sourceType=NULL (source-agnostic primary)
3. Else: NEEDS_MAPPING
```

## Current Database State

### Doc Mappings (All Source-Agnostic)
```sql
SELECT doc_system, doc_id, source_type, is_primary 
FROM doc_mappings_v2 
WHERE workspace_id = '63d61996-28c2-4050-a020-ebd784aa4076'
ORDER BY doc_system;
```

| doc_system           | doc_id                                                           | source_type | is_primary |
|----------------------|------------------------------------------------------------------|-------------|------------|
| backstage            | Fredjr/VertaAI/catalog-info.yaml                                 | NULL        | f          |
| confluence           | 163950                                                           | NULL        | t          |
| gitbook              | Fredjr/VertaAI/docs/runbook.md                                   | NULL        | f          |
| github_code_comments | Fredjr/VertaAI/apps/api/src/services/orchestrator/transitions.ts | NULL        | f          |
| github_readme        | Fredjr/VertaAI/README.md                                         | NULL        | t          |
| github_readme        | Fredjr/VertaAI/apps/frontend/README.md                           | NULL        | t          |
| github_swagger       | Fredjr/VertaAI/docs/openapi.yaml                                 | NULL        | f          |
| notion               | mock-notion-page-123                                             | NULL        | f          |

### Expected Behavior with Current Mappings
- **GitHub PR** (any drift type) → `github_readme` (first primary README)
- **PagerDuty** (any drift type) → `github_readme` (fallback to primary since no source-specific mapping)
- **Slack** (any drift type) → `github_readme` (fallback to primary)

## Testing Approach

### Option 1: Test with Existing Production Drifts (Recommended)

**Available Drifts:**
```sql
SELECT id, state, drift_type, source_type, 
       docs_resolution->'candidates'->0->>'docSystem' as doc_system
FROM drift_candidates
WHERE state = 'AWAITING_HUMAN';
```

**Results:**
- `c4614b66-e1ec-447b-81f8-5fdb7e0eda01` - AWAITING_HUMAN, GitHub PR → Confluence (OLD logic)
- `a43abde9-0514-4ef9-a54c-c3945fde5789` - AWAITING_HUMAN, GitHub PR → Confluence (OLD logic)

**Test Steps:**
1. **Approve a drift:**
   ```bash
   curl -X POST https://vertaai-api-production.up.railway.app/api/test/approve-drift \
     -H "Content-Type: application/json" \
     -d '{"workspaceId": "63d61996-28c2-4050-a020-ebd784aa4076", "driftId": "c4614b66-e1ec-447b-81f8-5fdb7e0eda01"}'
   ```

2. **Run state machine:**
   ```bash
   curl -X POST https://vertaai-api-production.up.railway.app/api/test/run-state-machine \
     -H "Content-Type: application/json" \
     -d '{"workspaceId": "63d61996-28c2-4050-a020-ebd784aa4076", "driftId": "c4614b66-e1ec-447b-81f8-5fdb7e0eda01", "maxIterations": 10}'
   ```

3. **Verify writeback:**
   - Check Confluence page 163950 for updates
   - Verify drift state is COMPLETED or WRITTEN_BACK

### Option 2: Create Real GitHub PR (Tests NEW Logic)

**Use the script:**
```bash
chmod +x apps/api/scripts/real-github-pr-e2e-test.sh
./apps/api/scripts/real-github-pr-e2e-test.sh
```

**What it does:**
1. Creates a real branch in Fredjr/VertaAI
2. Adds a test documentation file
3. Creates a PR
4. Sends webhook to VertaAI API
5. Verifies drift detection

**Expected Result:**
- Drift should select **README** (not Confluence) with NEW source-level logic
- Slack notification sent
- After approval, README PR created

### Option 3: Test Source-Specific Mappings

**Create PagerDuty → Confluence mapping:**
```sql
INSERT INTO doc_mappings_v2 (
  workspace_id, doc_system, doc_id, doc_title, repo,
  is_primary, allow_writeback, source_type, created_at, updated_at
) VALUES (
  '63d61996-28c2-4050-a020-ebd784aa4076',
  'confluence', '163950', 'Runbook (PagerDuty)', 'Fredjr/VertaAI',
  true, true, 'pagerduty_incident', NOW(), NOW()
) ON CONFLICT (workspace_id, doc_system, doc_id) DO UPDATE SET
  source_type = 'pagerduty_incident',
  is_primary = true;
```

**Test:**
1. Create a PagerDuty incident signal (or simulate via API)
2. Verify drift selects Confluence (source-specific)
3. Create a GitHub PR signal
4. Verify drift still selects README (unaffected by PagerDuty mapping)

## Test Matrix

| Input Source | Output Target | Mapping Type       | Expected Behavior                          |
|--------------|---------------|--------------------|--------------------------------------------|
| GitHub PR    | README        | Source-agnostic    | ✅ Selects first primary README            |
| PagerDuty    | README        | Source-agnostic    | ✅ Fallback to primary README              |
| PagerDuty    | Confluence    | Source-specific    | ✅ Overrides default, selects Confluence   |
| GitHub PR    | README        | Source-agnostic    | ✅ Unaffected by PagerDuty mapping         |
| Slack        | README        | Source-agnostic    | ✅ Fallback to primary README              |

## Verification Checklist

- [ ] **Doc Resolution** - Verify correct doc selected based on source type
- [ ] **Slack Notifications** - Check Slack channel for approval messages
- [ ] **Approval Flow** - Approve drift and verify state transitions
- [ ] **Writeback** - Verify README PR created or Confluence page updated
- [ ] **Source-Specific Override** - Create PagerDuty → Confluence mapping and verify it works
- [ ] **Drift Type Independence** - Verify drift type doesn't affect doc selection

## Troubleshooting

### Drifts Going to COMPLETED Instead of AWAITING_HUMAN
**Cause:** Comparison gate correctly identifies no drift in test data
**Solution:** Use real PR data or existing production drifts

### Fingerprint Collisions
**Cause:** Test drifts have duplicate fingerprints
**Solution:** Use unique fingerprints or delete old test drifts

### Patch Validation Failures
**Cause:** Missing PR data (merged status, diff, changed files)
**Solution:** Use real PRs or existing production drifts

## Redis + Celery Question

**Question:** Should we use Redis + Celery for async LLM processing?

**Answer:** **No, stick with QStash**

**Rationale:**
- ✅ QStash is already working with distributed locking, retries, bounded loops
- ✅ QStash handles HTTP timeouts with automatic retries (3 retries configured)
- ✅ Simpler architecture - no need to run Celery workers
- ✅ Redis already used for distributed locking (Upstash Redis)
- ❌ Celery would add complexity (Python workers, task serialization, monitoring)

**Current QStash Configuration:**
- Retries: 3
- Delay: 1 second between transitions
- Max transitions per invocation: 5 (bounded loop)
- Lock TTL: 30 seconds
- Max retries before FAILED: 10

