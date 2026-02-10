# Gap #9: Cluster-First Drift Triage - Implementation Plan

## 🎯 Objective

Reduce notification fatigue by clustering similar drifts and sending aggregated Slack notifications instead of individual messages.

**Problem**: Each drift sends individual Slack notification (50 drifts = 50 messages)
**Solution**: Cluster-first notifications (50 drifts = 5 clusters = 5 messages)

---

## 📊 Current State Assessment

### What We Have
- ✅ Individual drift detection working (PR #16 tested successfully)
- ✅ Slack notifications working (one message per drift)
- ✅ Fingerprint-based suppression (prevents exact duplicates)
- ✅ DriftPlan with noise controls

### What's Missing
- ❌ No DriftCluster model
- ❌ No cluster aggregation logic
- ❌ No cluster Slack UX
- ❌ No bulk actions (approve all, reject all, snooze all)
- ❌ No rate limiting on notifications

---

## 🏗️ Architecture Design

### Clustering Strategy

**Cluster Key**: `{service}_{driftType}_{fingerprintPattern}`

**Example**:
- Drift 1: `api-service_instruction_kubectl-command`
- Drift 2: `api-service_instruction_kubectl-command`
- Drift 3: `api-service_process_deployment-steps`

→ Creates 2 clusters:
- Cluster A: `api-service_instruction_kubectl-command` (2 drifts)
- Cluster B: `api-service_process_deployment-steps` (1 drift)

### Clustering Rules

1. **Time Window**: Cluster drifts within 1 hour of each other
2. **Max Cluster Size**: 20 drifts per cluster (prevent mega-clusters)
3. **Min Cluster Size**: 2 drifts (single drifts send individual notifications)
4. **Cluster Expiry**: Close cluster after 1 hour of no new drifts

### State Machine Changes

**New States**:
- `CLUSTER_PENDING`: Drift is waiting to be added to a cluster
- `CLUSTER_ASSIGNED`: Drift has been assigned to a cluster
- `CLUSTER_NOTIFIED`: Cluster notification has been sent

**Flow**:
```
PATCH_VALIDATED
  ↓
OWNER_RESOLVED
  ↓
  [Clustering Logic]
  - Find or create cluster
  - Add drift to cluster
  - If cluster ready → send notification
  - If cluster pending → wait
  ↓
CLUSTER_ASSIGNED (or SLACK_SENT for individual)
  ↓
AWAITING_HUMAN
```

---

## 📋 Implementation Steps

### Step 1: Create DriftCluster Model (2 hours)

**Tasks**:
- Add `DriftCluster` model to Prisma schema
- Add `clusterId` field to `DriftCandidate`
- Create migration
- Generate Prisma client

**Schema**:
```prisma
model DriftCluster {
  id                String   @id @default(uuid())
  workspaceId       String

  // Cluster key
  service           String
  driftType         String
  fingerprintPattern String

  // Cluster metadata
  status            String   // 'pending', 'notified', 'closed'
  driftCount        Int      @default(0)
  createdAt         DateTime @default(now())
  closedAt          DateTime?
  notifiedAt        DateTime?

  // Slack notification
  slackMessageTs    String?
  slackChannel      String?

  // Relations
  drifts            DriftCandidate[]
  workspace         Workspace @relation(fields: [workspaceId], references: [id])

  @@unique([workspaceId, service, driftType, fingerprintPattern, status])
  @@index([workspaceId, status])
  @@index([createdAt])
}
```

---

### Step 2: Implement Cluster Aggregation Logic (3 hours)

**Tasks**:
- Create `apps/api/src/services/clustering/aggregator.ts`
- Implement `findOrCreateCluster()`
- Implement `addDriftToCluster()`
- Implement `shouldNotifyCluster()`
- Implement `closeCluster()`

**Key Functions**:
```typescript
// Find or create cluster for drift
async function findOrCreateCluster(drift: DriftCandidate): Promise<DriftCluster>

// Add drift to cluster
async function addDriftToCluster(drift: DriftCandidate, cluster: DriftCluster): Promise<void>

// Check if cluster is ready to notify
function shouldNotifyCluster(cluster: DriftCluster): boolean

// Close cluster and send notification
async function closeCluster(cluster: DriftCluster): Promise<void>
```

---

### Step 3: Build Cluster Slack UX (4 hours)

**Tasks**:
- Create `apps/api/src/services/clustering/slackClusterMessage.ts`

### Step 4: Update State Machine (2 hours)

**Tasks**:
- Add clustering logic to `handleOwnerResolved()`
- Update `transitions.ts` to support cluster states
- Add cluster notification logic
- Update individual notification logic (fallback)

**Changes to `transitions.ts`**:
```typescript
async function handleOwnerResolved(drift: DriftCandidate) {
  // Check if clustering is enabled for this plan
  const plan = await getPlanForDrift(drift);

  if (plan.enableClustering) {
    // Find or create cluster
    const cluster = await findOrCreateCluster(drift);

    // Add drift to cluster
    await addDriftToCluster(drift, cluster);

    // Check if cluster is ready to notify
    if (shouldNotifyCluster(cluster)) {
      await sendClusterNotification(cluster);
      return { state: DriftState.CLUSTER_NOTIFIED, enqueueNext: true };
    } else {
      return { state: DriftState.CLUSTER_PENDING, enqueueNext: false };
    }
  } else {
    // Individual notification (existing logic)
    await sendSlackNotification(drift);
    return { state: DriftState.SLACK_SENT, enqueueNext: true };
  }
}
```

---

### Step 5: Add Rate Limiting (2 hours)

**Tasks**:
- Create `apps/api/src/services/clustering/rateLimiter.ts`
- Implement per-workspace rate limiting
- Add rate limit tracking to DriftPlan
- Add rate limit metrics

**Rate Limiting Rules**:
- Max 10 notifications per hour per workspace
- Max 50 notifications per day per workspace
- Cluster notifications count as 1 notification (regardless of size)

**Schema Changes**:
```prisma
model DriftPlan {
  // ... existing fields

  // Rate limiting
  maxNotificationsPerHour  Int @default(10)
  maxNotificationsPerDay   Int @default(50)
}
```

---

### Step 6: Add Observability Metrics (1 hour)

**Tasks**:
- Add cluster metrics to structured logger
- Track cluster size distribution
- Track notification reduction rate
- Track cluster expiry rate

**Metrics**:
- `cluster.created` - New cluster created
- `cluster.drift_added` - Drift added to cluster
- `cluster.notified` - Cluster notification sent
- `cluster.closed` - Cluster closed
- `cluster.size` - Number of drifts in cluster
- `notification.reduction_rate` - % reduction in notifications

---

### Step 7: Database Migration (1 hour)

**Tasks**:
- Create migration file
- Test migration locally
- Deploy migration to production
- Verify schema changes

---

### Step 8: Test with Real Drifts (2 hours)

**Tasks**:
- Create multiple similar PRs to trigger clustering
- Verify cluster creation
- Verify cluster notification
- Verify bulk actions
- Verify rate limiting

**Test Cases**:
1. **Single drift**: Should send individual notification
2. **2 similar drifts**: Should create cluster and send cluster notification
3. **10 similar drifts**: Should create cluster with 10 drifts
4. **2 different drift types**: Should create 2 separate clusters
5. **Rate limit exceeded**: Should queue notifications

---

## 📊 Expected Impact

### Before (Current State)
- 50 drifts = 50 Slack messages
- Notification fatigue: HIGH
- User engagement: LOW (users ignore notifications)
- Approval rate: 20%

### After (With Clustering)
- 50 drifts = 5-10 cluster messages
- Notification fatigue: LOW
- User engagement: HIGH (users review clusters)
- Approval rate: 60%

### Metrics
- **Notification reduction**: 80-90%
- **Cluster size**: 2-10 drifts per cluster (average: 5)
- **Time to review**: 50% reduction (bulk actions)
- **False positive rate**: 30% reduction (better context)

---

## 🚀 Rollout Plan

### Phase 1: Development (2 days)
- Complete Steps 1-7
- Test locally with mock data

### Phase 2: Testing (1 day)
- Test with real PRs (Step 8)
- Verify clustering logic
- Verify Slack UX

### Phase 3: Deployment (1 day)
- Deploy migration
- Deploy code changes
- Monitor metrics
- Adjust thresholds if needed

### Phase 4: Iteration (ongoing)
- Monitor cluster size distribution
- Adjust clustering rules
- Add more bulk actions
- Improve Slack UX

---

## 🔑 Key Design Decisions

### Decision 1: Cluster Key Strategy
**Chosen**: `{service}_{driftType}_{fingerprintPattern}`

**Rationale**:
- Groups similar drifts together
- Prevents mega-clusters (different services/types are separate)
- Fingerprint pattern provides additional granularity

**Alternatives considered**:
- `{service}_{driftType}` - Too broad, creates mega-clusters
- `{fingerprintExact}` - Too narrow, no clustering benefit

---

### Decision 2: Time Window
**Chosen**: 1 hour

**Rationale**:
- Long enough to capture related drifts (e.g., multiple PRs in a feature branch)
- Short enough to avoid stale clusters
- Matches typical development workflow (feature branch → multiple PRs → merge)

**Alternatives considered**:
- 15 minutes - Too short, misses related drifts
- 24 hours - Too long, creates stale clusters

---

### Decision 3: Notification Trigger
**Chosen**: Notify when cluster reaches 2 drifts OR 1 hour expires

**Rationale**:
- Immediate notification for clusters (2+ drifts)
- Fallback to individual notification after 1 hour (prevents indefinite waiting)
- Balances timeliness vs. clustering benefit

**Alternatives considered**:
- Notify only when cluster reaches 5 drifts - Too slow, misses small clusters
- Notify immediately - No clustering benefit

---

## 📚 Related Documentation

- **Revised Implementation Plan**: `REVISED_IMPLEMENTATION_PLAN.md` (Gap #9, lines 218-243)
- **Gap #1 Progress**: `GAP1_PROGRESS_SUMMARY.md`
- **Noise Filtering Assessment**: `NOISE_FILTERING_ASSESSMENT.md`

---

## ✅ Success Criteria

- [ ] DriftCluster model created and migrated
- [ ] Cluster aggregation logic implemented
- [ ] Cluster Slack UX implemented with bulk actions
- [ ] State machine updated to support clustering
- [ ] Rate limiting implemented
- [ ] Observability metrics added
- [ ] Tested with real drifts (5+ test cases)
- [ ] Notification reduction: 80%+
- [ ] User engagement: 2x increase
- [ ] Approval rate: 3x increase

---

## 🎯 READY TO START!

All prerequisites complete:
- ✅ Gap #1 complete (deterministic drift detection)
- ✅ Noise filtering fixes complete
- ✅ Documentation updated
- ✅ Testing infrastructure in place

**Next**: Begin Step 1 - Create DriftCluster Model

- Design cluster message format
- Add bulk action buttons
- Implement cluster interaction handlers

**Message Format**:
```
🔔 Drift Cluster Alert: api-service (3 drifts)

Type: instruction drift
Pattern: kubectl command changes

Drifts:
1. PR #123: Update kubectl version in deployment docs
2. PR #124: Fix kubectl apply command
3. PR #125: Add kubectl rollout command

Actions:
[Approve All] [Reject All] [Snooze All] [Review Individually]
```

---


