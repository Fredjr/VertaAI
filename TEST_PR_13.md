# Test PR #13: Gap #6 Validation

## Purpose
Validate that Gap #6 (DriftPlan as True Control-Plane) is working correctly.

## Expected Behavior

### 1. Plan Resolution
- Should resolve active plan using 5-step hierarchy
- Should fall back to workspace defaults if no plan exists

### 2. Threshold Resolution
- Should use workspace defaults: autoApprove=0.98, slackNotify=0.40
- Should create PlanRun record with routing decision
- Should store activePlanId, activePlanVersion, activePlanHash in DriftCandidate

### 3. Routing Decision
- Confidence >= 0.98 → auto_approve
- Confidence >= 0.40 → slack_notify
- Confidence >= 0.30 → digest_only
- Confidence < 0.30 → ignore

## Test Scenario

This PR updates the deployment process for the VertaAI API service.

**Changes:**
- Updated Railway deployment configuration
- Added new environment variables for QStash delays
- Modified health check endpoint

**Expected Drift Detection:**
- Drift Type: `instruction` (deployment config changed)
- Confidence: ~0.65 (medium confidence)
- Expected Routing: `slack_notify` (0.40 <= 0.65 < 0.98)
- Expected Plan: None (should use workspace defaults)

## Validation Checklist

- [ ] Webhook received and processed
- [ ] DriftCandidate created with state=INGESTED
- [ ] Plan resolution completed (activePlanId should be null)
- [ ] Thresholds resolved from workspace (0.98/0.40)
- [ ] PlanRun record created
- [ ] Routing decision: slack_notify
- [ ] Slack notification sent to #nouveau-canal

