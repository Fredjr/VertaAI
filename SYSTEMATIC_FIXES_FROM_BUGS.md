# Systematic Fixes from 4 Critical Bugs

## Executive Summary

This document extracts **systematic patterns** from the 4 bugs we fixed during PR #7-#12 testing and defines **mandatory fixes** to apply across all 35 drift matrix combinations (7 sources × 5 drift types) and the entire 18-state pipeline.

---

## The 4 Bugs We Fixed

| # | Bug | Root Cause | Impact | Fix |
|---|-----|------------|--------|-----|
| **1** | Missing `merged` field | Data contract violation | Pre-validation failed | Added to `extracted` |
| **2** | Missing `diff` field | Data contract violation | Comparison couldn't run | Added to `extracted` |
| **3** | Auto-approve bypass | Threshold misconfiguration | Skipped Slack notification | Raised threshold 0.85→0.98 |
| **4** | Deployment race condition | Async timing issue | Lost logs, no processing | QStash delay 1s→180s |

---

## Pattern 1: Data Contract Violations (Bugs #1 & #2)

### Root Cause
**No enforced schema between webhook ingestion and state machine processing**

- Webhook populated `prInfo.merged` but didn't include it in `extracted.merged`
- Webhook stored diff in `rawPayload.diff` but not in `extracted.diff`
- Downstream validators expected `extracted.merged`, comparison expected `extracted.diff`

### Systematic Fix

#### 1.1 Create TypeScript Schemas for All Source Types

**File**: `apps/api/src/types/extracted-schemas.ts` ✅ CREATED

**Schemas**:
- `GitHubPRExtracted` - PR metadata, merged, changedFiles, totalChanges, diff
- `PagerDutyIncidentExtracted` - Incident metadata, status, service, responders, timeline
- `SlackClusterExtracted` - Cluster metadata, clusterSize, uniqueAskers, questions, messages
- `DatadogAlertExtracted` - Alert metadata, monitorName, severity, metric, tags

**Type Guards**:
- `isGitHubPRExtracted()`
- `isPagerDutyIncidentExtracted()`
- `isSlackClusterExtracted()`
- `isDatadogAlertExtracted()`

#### 1.2 Audit All Webhook Handlers

**Action**: For each source type, verify webhook handler populates ALL required fields

| Source Type | Webhook Handler | Required Fields | Status |
|-------------|-----------------|-----------------|--------|
| `github_pr` | `webhooks.ts:444-473` | merged, changedFiles, totalChanges, diff | ✅ FIXED |
| `pagerduty_incident` | `webhooks/pagerduty.ts` | status, service, responders, timeline | ⚠️ TODO |
| `slack_cluster` | `webhooks/slack.ts` | clusterSize, uniqueAskers, questions, messages | ⚠️ TODO |
| `datadog_alert` | `webhooks/datadog.ts` | monitorName, severity, metric, tags | ⚠️ TODO |
| `grafana_alert` | `webhooks/grafana.ts` | monitorName, severity, metric, tags | ⚠️ TODO |
| `github_iac` | `webhooks.ts` | Same as github_pr | ⚠️ TODO |
| `github_codeowners` | `webhooks.ts` | owners, changedFiles, diff | ⚠️ TODO |

#### 1.3 Add Runtime Validation

**File**: `apps/api/src/services/validators/extractedDataValidator.ts` (NEW)

**Purpose**: Validate `extracted` data immediately after webhook ingestion

```typescript
export function validateExtractedData(
  sourceType: string,
  extracted: any
): { valid: boolean; errors: string[] } {
  switch (sourceType) {
    case 'github_pr':
      return validateGitHubPRExtracted(extracted);
    case 'pagerduty_incident':
      return validatePagerDutyIncidentExtracted(extracted);
    // ... other source types
  }
}
```

**Integration Point**: Call in webhook handlers BEFORE creating SignalEvent

```typescript
const validationResult = validateExtractedData('github_pr', extracted);
if (!validationResult.valid) {
  console.error(`[Webhook] Invalid extracted data: ${validationResult.errors.join(', ')}`);
  return res.status(400).json({ error: 'Invalid extracted data', errors: validationResult.errors });
}
```

#### 1.4 Add Unit Tests for Each Source Type

**File**: `apps/api/src/__tests__/extracted-data-validation.test.ts` (NEW)

**Tests**:
- ✅ Valid extracted data passes validation
- ❌ Missing required field fails validation
- ❌ Wrong type fails validation
- ✅ Optional fields can be omitted

---

## Pattern 2: Threshold Misconfiguration (Bug #3)

### Root Cause
**Source-specific thresholds not tuned for actual use cases**

- Auto-approve threshold 0.85 was too low for GitHub PRs
- Most PRs had confidence 0.85-0.95, bypassing Slack entirely
- No systematic review of thresholds across all 7 source types

### Systematic Fix

#### 2.1 Review and Tune All Source-Specific Thresholds

**File**: `apps/api/src/config/scoringWeights.ts:88-145`

**Current Thresholds**:

| Source Type | Auto-Approve | Slack Notify | Digest Only | Ignore | Status |
|-------------|--------------|--------------|-------------|--------|--------|
| `github_pr` | 0.98 | 0.40 | 0.30 | 0.20 | ✅ FIXED |
| `pagerduty_incident` | 0.90 | 0.60 | 0.40 | 0.25 | ⚠️ REVIEW |
| `slack_cluster` | 0.85 | 0.55 | 0.35 | 0.20 | ⚠️ REVIEW |
| `datadog_alert` | 0.85 | 0.55 | 0.35 | 0.20 | ⚠️ REVIEW |
| `grafana_alert` | 0.85 | 0.55 | 0.35 | 0.20 | ⚠️ REVIEW |
| `github_iac` | 0.90 | 0.50 | 0.30 | 0.20 | ⚠️ REVIEW |
| `github_codeowners` | 0.85 | 0.50 | 0.30 | 0.20 | ⚠️ REVIEW |

**Recommendation**:
- **Auto-Approve**: Should be 0.95+ for all sources (nearly perfect confidence required)
- **Slack Notify**: Should be 0.40-0.50 (most drifts go through human review)
- **Digest Only**: Should be 0.25-0.35 (low confidence, batch notification)
- **Ignore**: Should be 0.15-0.25 (very low confidence, suppress)

#### 2.2 Add Threshold Monitoring

**File**: `apps/api/src/routes/monitoring.ts` (EXTEND)

**New Endpoint**: `GET /api/monitoring/threshold-effectiveness`

**Metrics**:
- % of drifts auto-approved (should be <5%)
- % of drifts sent to Slack (should be 60-80%)
- % of drifts in digest (should be 10-20%)
- % of drifts ignored (should be 5-15%)

---

## Pattern 3: Async Timing Issues (Bug #4)

### Root Cause
**QStash delay didn't account for deployment time**

- Railway deployments take 2+ minutes
- QStash delay was 1 second
- Jobs delivered to old container being shut down
- No logs, no processing visibility

### Systematic Fix

#### 3.1 Environment-Aware Async Delays

**File**: `apps/api/src/services/queue/qstash.ts:34-42`

**Current**: Fixed 180-second delay for all environments

**Improvement**: Environment-specific delays

```typescript
const DEPLOYMENT_DELAYS = {
  production: 180,  // Railway takes 2+ minutes
  staging: 120,     // Faster deployment
  development: 5,   // Local, no deployment
};

const delay = DEPLOYMENT_DELAYS[process.env.NODE_ENV || 'production'];
```

#### 3.2 Add Deployment Health Checks

**File**: `apps/api/src/routes/health.ts` (EXTEND)

**New Endpoint**: `GET /health/deployment`

**Response**:
```json
{
  "deploymentId": "0e436d8e",
  "startedAt": "2026-02-10T09:36:18Z",
  "uptime": 120,
  "ready": true
}
```

**Integration**: QStash can poll this endpoint before processing jobs

---

## Pattern 4: Missing Observability

### Root Cause
**No systematic logging/monitoring across all state transitions**

- Some states had detailed logs, others had none
- No structured logging format
- Hard to trace drift through 18 states

### Systematic Fix

#### 4.1 Structured Logging for All State Transitions

**File**: `apps/api/src/services/orchestrator/transitions.ts`

**Standard Log Format**:
```typescript
console.log(JSON.stringify({
  level: 'info',
  event: 'state_transition',
  driftId: drift.id,
  fromState: currentState,
  toState: nextState,
  confidence: drift.confidence,
  method: drift.classificationMethod,
  timestamp: new Date().toISOString(),
}));
```

#### 4.2 Add Trace IDs

**Purpose**: Track a single drift through all 18 states

**Implementation**:
- Generate `traceId` when drift is created
- Include in all logs: `traceId: drift.traceId`
- Add to database: `DriftCandidate.traceId`

---

## Implementation Checklist

### Phase 1: Data Contract Enforcement (Week 1)
- [x] Create TypeScript schemas (`extracted-schemas.ts`)
- [ ] Create runtime validator (`extractedDataValidator.ts`)
- [ ] Audit all 7 webhook handlers
- [ ] Add unit tests for extracted data validation
- [ ] Deploy and test with real webhooks

### Phase 2: Threshold Tuning (Week 2)
- [ ] Review all 7 source-specific thresholds
- [ ] Add threshold effectiveness monitoring
- [ ] Run A/B test with new thresholds
- [ ] Document threshold tuning methodology

### Phase 3: Async Reliability (Week 3)
- [ ] Add environment-aware delays
- [ ] Add deployment health checks
- [ ] Test with Railway deployments
- [ ] Add retry logic for failed jobs

### Phase 4: Observability (Week 4)
- [ ] Add structured logging to all transitions
- [ ] Add trace IDs to drift tracking
- [ ] Create dashboard for drift pipeline health
- [ ] Add alerting for stuck drifts

---

## Success Metrics

| Metric | Before | Target | Current |
|--------|--------|--------|---------|
| Data contract violations | 2/12 PRs | 0% | ⚠️ TBD |
| Auto-approve bypass rate | 33% (PR #9) | <5% | ✅ 0% |
| Deployment race conditions | 3/12 PRs | 0% | ✅ 0% |
| Missing logs | 25% | 0% | ✅ 0% |
| Slack notification success | 0% | >95% | ✅ 100% (1/1) |

---

## Next Steps

1. **Immediate**: Create `extractedDataValidator.ts` and add to all webhook handlers
2. **This Week**: Audit all 7 webhook handlers for data contract compliance
3. **Next Week**: Review and tune all source-specific thresholds
4. **Month 1**: Add structured logging and trace IDs across all transitions


