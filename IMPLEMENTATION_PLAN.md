# VertaAI Implementation Plan

## From Current State to Full Spec

**Created:** 2026-01-25
**Based on:** VERTAAI_MVP_SPEC.md v1.1

---

## Executive Summary

This document provides a step-by-step implementation plan to transform the current VertaAI system (Express on Railway, Organization-based multi-tenancy, synchronous pipeline) into the full spec (Next.js on Vercel, Workspace-based multi-tenancy, QStash-driven state machine).

### Key Decisions (Recommended)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Platform Migration** | Stay on Express until Phase 5 | Minimize disruption; Express works fine |
| **Migration Strategy** | Gradual (not big-bang) | Add `workspace_id` alongside `orgId`, migrate incrementally |
| **MVP Scope** | Phases 1-3 first | Core value without PagerDuty/Notion complexity |

---

## Current State vs Target State

| Aspect | Current (apps/api) | Target (Spec) |
|--------|-------------------|---------------|
| **Platform** | Express on Railway | Next.js on Vercel |
| **Multi-tenancy** | `Organization` model | `Workspace` with composite keys |
| **Webhooks** | `/webhooks/github` | `/api/webhooks/github/{workspaceId}` |
| **Job Queue** | Synchronous pipeline | QStash + 18-state machine |
| **Locking** | None | Upstash Redis distributed locks |
| **Signal Sources** | GitHub PRs only | GitHub + PagerDuty |
| **Doc Providers** | Confluence only | Confluence + Notion |
| **Drift Detection** | Boolean (drift_detected) | 5 types + score + domains |
| **Writeback** | Full page | Managed region markers only |
| **Dedup** | Basic signal dedup | Fingerprinted drift dedup |
| **Notification** | Always send | Confidence-based routing + caps |

---

## 5-Phase Implementation Plan

### Phase 1: Foundation - Workspace Scoping (Week 1-2)
**Goal:** Establish tenant isolation and async processing foundation

### Phase 2: State Machine & Queue (Week 3-4)
**Goal:** Convert synchronous pipeline to QStash-driven state machine

### Phase 3: Enhanced Drift Detection (Week 5-6)
**Goal:** Add drift types, managed regions, fingerprinting, notification policy

### Phase 4: Multi-Source Support (Week 7-8)
**Goal:** Add PagerDuty, Notion, signal correlation

### Phase 5: Platform Migration (Week 9+)
**Goal:** Migrate to Next.js on Vercel (OPTIONAL - can stay on Express)

---

## Phase 1: Foundation - Workspace Scoping

### 1.1 Database Schema Migration

**Files to modify:**
- `apps/api/prisma/schema.prisma`

**New tables to add:**

```prisma
// Workspaces (replaces Organization)
model Workspace {
  id                        String   @id @default(uuid())
  name                      String
  slug                      String   @unique
  ownerEmail                String   @map("owner_email")
  
  // Ownership config (Section 15.9.4)
  ownershipSourceRanking    String[] @default(["pagerduty", "codeowners", "manual"]) @map("ownership_source_ranking")
  defaultOwnerType          String   @default("slack_channel") @map("default_owner_type")
  defaultOwnerRef           String   @default("#engineering") @map("default_owner_ref")
  
  // Notification policy (Section 15.9.5)
  highConfidenceThreshold   Float    @default(0.70) @map("high_confidence_threshold")
  mediumConfidenceThreshold Float    @default(0.55) @map("medium_confidence_threshold")
  digestChannel             String?  @map("digest_channel")
  
  createdAt                 DateTime @default(now()) @map("created_at")
  updatedAt                 DateTime @updatedAt @map("updated_at")
  
  integrations              Integration[]
  signalEvents              SignalEvent[]
  driftCandidates           DriftCandidate[]
  patchProposals            PatchProposal[]
  docMappings               DocMapping[]
  ownerMappings             OwnerMapping[]
  auditEvents               AuditEvent[]
  
  @@map("workspaces")
}

// Integrations (OAuth connections per workspace)
model Integration {
  id            BigInt   @id @default(autoincrement())
  workspaceId   String   @map("workspace_id")
  type          String   // 'github', 'pagerduty', 'slack', 'confluence', 'notion'
  status        String   @default("pending") // 'pending', 'connected', 'error', 'revoked'
  config        Json     @default("{}")
  webhookSecret String?  @map("webhook_secret")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  
  workspace     Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  
  @@unique([workspaceId, type])
  @@map("integrations")
}
```

**Migration strategy:**
1. Add new tables alongside existing ones
2. Create migration script: `Organization` → `Workspace`
3. Update queries one file at a time
4. Remove old tables after validation

### 1.2 Signal Events Table (Workspace-Scoped)

```prisma
model SignalEvent {
  workspaceId   String   @map("workspace_id")
  id            String   // eventId from source
  sourceType    String   @map("source_type") // 'github_pr', 'pagerduty_incident'
  occurredAt    DateTime @map("occurred_at")
  service       String?
  repo          String?
  severity      String?  // 'sev1', 'sev2', 'sev3', 'sev4'
  extracted     Json
  rawPayload    Json     @map("raw_payload")
  createdAt     DateTime @default(now()) @map("created_at")
  
  workspace     Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  driftCandidates DriftCandidate[]
  
  @@id([workspaceId, id])
  @@index([workspaceId, sourceType, occurredAt(sort: Desc)])
  @@index([workspaceId, service, occurredAt(sort: Desc)])
  @@map("signal_events")
}
```

### 1.3 Drift Candidates Table (State Machine Entity)

```prisma
model DriftCandidate {
  workspaceId       String   @map("workspace_id")
  id                String   @default(uuid())
  signalEventId     String   @map("signal_event_id")

  // State machine (Section 15.15.1)
  state             String   // DriftState enum
  stateUpdatedAt    DateTime @default(now()) @map("state_updated_at")

  // Source context
  sourceType        String   @map("source_type")
  service           String?
  repo              String?

  // Drift classification (Section 5.2)
  driftType         String?  @map("drift_type") // 'instruction', 'process', 'ownership', 'coverage', 'environment_tooling'
  driftDomains      String[] @map("drift_domains")

  // Evidence & scoring (Section 5.6)
  evidenceSummary   String?  @map("evidence_summary")
  confidence        Float?
  driftScore        Float?   @map("drift_score")
  riskLevel         String?  @map("risk_level") // 'low', 'medium', 'high'
  recommendedAction String?  @map("recommended_action") // 'generate_patch', 'annotate_only', 'review_queue', 'ignore'

  // Document targeting
  docCandidates     Json     @default("[]") @map("doc_candidates")
  baselineFindings  Json     @default("[]") @map("baseline_findings")

  // Owner resolution
  ownerResolution   Json?    @map("owner_resolution")

  // Deduplication (Section 5.12.6)
  fingerprint       String?

  // Correlated signals (Section 15.9.3)
  correlatedSignals Json     @default("[]") @map("correlated_signals")
  confidenceBoost   Float    @default(0) @map("confidence_boost")

  // Error tracking (Section 15.9.9)
  lastErrorCode     String?  @map("last_error_code") // FailureCode enum
  lastErrorMessage  String?  @map("last_error_message")
  retryCount        Int      @default(0) @map("retry_count")

  createdAt         DateTime @default(now()) @map("created_at")

  workspace         Workspace    @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  signalEvent       SignalEvent  @relation(fields: [workspaceId, signalEventId], references: [workspaceId, id], onDelete: Cascade)
  patchProposals    PatchProposal[]

  @@id([workspaceId, id])
  @@unique([workspaceId, fingerprint])
  @@index([workspaceId, state, stateUpdatedAt(sort: Desc)])
  @@index([workspaceId, service])
  @@map("drift_candidates")
}
```

### 1.4 Patch Proposals Table

```prisma
model PatchProposal {
  workspaceId       String   @map("workspace_id")
  id                String   @default(uuid())
  driftId           String   @map("drift_id")

  // Target document
  docSystem         String   @map("doc_system") // 'confluence', 'notion'
  docId             String   @map("doc_id")
  docTitle          String   @map("doc_title")
  docUrl            String?  @map("doc_url")

  // Patch content (Section 5.7.2)
  baseRevision      String   @map("base_revision")
  patchStyle        String   @map("patch_style") // 'replace_steps', 'add_note', 'reorder_steps', 'update_owner_block', 'add_section', 'link_patch'
  unifiedDiff       String   @map("unified_diff")

  // Metadata
  sourcesUsed       Json     @default("[]") @map("sources_used")
  confidence        Float    @default(0)

  // Validation (Section 5.11)
  validatorReport   Json     @default("{}") @map("validator_report")

  // Status
  status            String   // 'proposed', 'sent', 'approved', 'edited', 'rejected', 'snoozed', 'written_back'

  // Slack tracking
  slackChannel      String?  @map("slack_channel")
  slackTs           String?  @map("slack_ts")

  // Notification tracking (Section 15.9.5)
  lastNotifiedAt    DateTime? @map("last_notified_at")
  notificationCount Int      @default(0) @map("notification_count")

  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  workspace         Workspace      @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  driftCandidate    DriftCandidate @relation(fields: [workspaceId, driftId], references: [workspaceId, id], onDelete: Cascade)
  approvals         Approval[]

  @@id([workspaceId, id])
  @@index([workspaceId, docSystem, docId])
  @@index([workspaceId, status, updatedAt(sort: Desc)])
  @@map("patch_proposals")
}
```

### 1.5 Supporting Tables

```prisma
// Approvals (append-only audit log)
model Approval {
  workspaceId       String    @map("workspace_id")
  id                String    @default(uuid())
  patchId           String    @map("patch_id")
  action            String    // 'approve', 'edit', 'reject', 'snooze'
  actorSlackId      String    @map("actor_slack_id")
  actorName         String?   @map("actor_name")
  note              String?
  editedDiff        String?   @map("edited_diff")
  snoozeUntil       DateTime? @map("snooze_until")
  rejectionCategory String?   @map("rejection_category")
  createdAt         DateTime  @default(now()) @map("created_at")

  workspace         Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  patchProposal     PatchProposal @relation(fields: [workspaceId, patchId], references: [workspaceId, id], onDelete: Cascade)

  @@id([workspaceId, id])
  @@index([workspaceId, patchId, createdAt(sort: Desc)])
  @@map("approvals")
}

// Doc Mappings (with primary doc flag - Section 15.9.8)
model DocMapping {
  workspaceId              String    @map("workspace_id")
  id                       BigInt    @id @default(autoincrement())
  service                  String?
  repo                     String?
  docSystem                String    @map("doc_system") // 'confluence', 'notion'
  docId                    String    @map("doc_id")
  docTitle                 String    @map("doc_title")
  docUrl                   String?   @map("doc_url")
  isPrimary                Boolean   @default(false) @map("is_primary")
  hasManagedRegion         Boolean   @default(false) @map("has_managed_region")
  managedRegionInstalledAt DateTime? @map("managed_region_installed_at")
  createdAt                DateTime  @default(now()) @map("created_at")
  updatedAt                DateTime  @updatedAt @map("updated_at")

  workspace                Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, docSystem, docId])
  @@index([workspaceId, service])
  @@index([workspaceId, repo])
  @@map("doc_mappings")
}

// Owner Mappings (Section 15.11.7)
model OwnerMapping {
  workspaceId String   @map("workspace_id")
  id          BigInt   @id @default(autoincrement())
  service     String?
  repo        String?
  ownerType   String   @map("owner_type") // 'slack_user', 'slack_channel', 'team'
  ownerRef    String   @map("owner_ref")
  source      String   @default("manual") // 'manual', 'pagerduty', 'codeowners', 'commit_history'
  createdAt   DateTime @default(now()) @map("created_at")

  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId, service])
  @@index([workspaceId, repo])
  @@map("owner_mappings")
}

// Audit Events (Section 15.11.8)
model AuditEvent {
  workspaceId String   @map("workspace_id")
  id          BigInt   @id @default(autoincrement())
  entityType  String   @map("entity_type") // 'signal', 'drift', 'patch', 'approval', 'writeback', 'integration'
  entityId    String   @map("entity_id")
  eventType   String   @map("event_type")
  payload     Json     @default("{}")
  actorType   String?  @map("actor_type") // 'system', 'user', 'webhook'
  actorId     String?  @map("actor_id")
  createdAt   DateTime @default(now()) @map("created_at")

  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId, entityType, entityId, createdAt(sort: Desc)])
  @@index([workspaceId, createdAt(sort: Desc)])
  @@map("audit_events")
}
```

### 1.6 Tenant-Routed Webhooks

**Files to create/modify:**
- `apps/api/src/routes/webhooks.ts` → Add `/:workspaceId` parameter

**Current:**
```typescript
router.post('/github', async (req, res) => { ... });
```

**Target:**
```typescript
router.post('/github/:workspaceId', async (req, res) => {
  const { workspaceId } = req.params;

  // 1. Load workspace and integration
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { integrations: { where: { type: 'github' } } }
  });

  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found' });
  }

  const integration = workspace.integrations[0];
  if (!integration || integration.status !== 'connected') {
    return res.status(400).json({ error: 'GitHub integration not connected' });
  }

  // 2. Verify signature with workspace-specific secret
  const secret = integration.webhookSecret || process.env.GH_WEBHOOK_SECRET;
  if (!verifyWebhookSignature(payload, signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // 3. Create signal event with workspace scope
  const signalEvent = await prisma.signalEvent.create({
    data: {
      workspaceId,
      id: `github_pr_${prInfo.repoFullName}_${prInfo.prNumber}`,
      sourceType: 'github_pr',
      occurredAt: new Date(prInfo.mergedAt),
      repo: prInfo.repoFullName,
      service: inferServiceFromRepo(prInfo.repoFullName),
      extracted: { ... },
      rawPayload: payload,
    }
  });

  // 4. Create drift candidate in INGESTED state
  const driftCandidate = await prisma.driftCandidate.create({
    data: {
      workspaceId,
      signalEventId: signalEvent.id,
      state: 'ingested',
      sourceType: 'github_pr',
      repo: prInfo.repoFullName,
    }
  });

  // 5. Enqueue QStash job (Phase 2)
  // await enqueueJob({ workspaceId, driftId: driftCandidate.id });

  // 6. Return 202 immediately
  return res.status(202).json({
    message: 'Webhook received',
    signalEventId: signalEvent.id,
    driftId: driftCandidate.id,
  });
});
```

### 1.7 Migration Script

**File to create:** `apps/api/prisma/migrations/migrate-org-to-workspace.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateOrganizationsToWorkspaces() {
  const orgs = await prisma.organization.findMany();

  for (const org of orgs) {
    // Create workspace from organization
    const workspace = await prisma.workspace.create({
      data: {
        id: org.id, // Keep same ID for easier migration
        name: org.name,
        slug: org.name.toLowerCase().replace(/\s+/g, '-'),
        ownerEmail: 'admin@example.com', // Set manually
      }
    });

    // Create integrations from org fields
    if (org.slackWorkspaceId && org.slackBotToken) {
      await prisma.integration.create({
        data: {
          workspaceId: workspace.id,
          type: 'slack',
          status: 'connected',
          config: {
            teamId: org.slackWorkspaceId,
            botToken: org.slackBotToken,
            teamName: org.slackTeamName,
          }
        }
      });
    }

    if (org.confluenceCloudId && org.confluenceAccessToken) {
      await prisma.integration.create({
        data: {
          workspaceId: workspace.id,
          type: 'confluence',
          status: 'connected',
          config: {
            cloudId: org.confluenceCloudId,
            accessToken: org.confluenceAccessToken,
          }
        }
      });
    }

    if (org.githubInstallationId) {
      await prisma.integration.create({
        data: {
          workspaceId: workspace.id,
          type: 'github',
          status: 'connected',
          config: {
            installationId: org.githubInstallationId.toString(),
          }
        }
      });
    }

    console.log(`Migrated organization ${org.name} to workspace ${workspace.id}`);
  }
}

migrateOrganizationsToWorkspaces()
  .then(() => console.log('Migration complete'))
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

### 1.8 Phase 1 Checklist

- [ ] Create new Prisma schema with all tables from Section 15.11
- [ ] Run `prisma migrate dev` to create tables
- [ ] Create migration script for Organization → Workspace
- [ ] Update webhook routes to include `/:workspaceId`
- [ ] Update all queries to use `workspaceId` instead of `orgId`
- [ ] Add workspace auth middleware
- [ ] Test with existing data
- [ ] Update Slack OAuth to create Integration records
- [ ] Update Confluence OAuth to create Integration records

---

## Phase 2: State Machine & Queue

### 2.1 Dependencies

```bash
cd apps/api
npm install @upstash/qstash @upstash/redis
```

### 2.2 Environment Variables

Add to `.env` and Railway:

```bash
# QStash (required)
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=

# Upstash Redis (recommended)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# App
APP_BASE_URL=https://your-api.railway.app
```

### 2.3 State Machine Types

**File to create:** `apps/api/src/types/state-machine.ts`

```typescript
// From Section 15.15.1
export enum DriftState {
  // Initial
  INGESTED = 'ingested',

  // Processing
  ELIGIBILITY_CHECKED = 'eligibility_checked',
  SIGNALS_CORRELATED = 'signals_correlated',
  DRIFT_CLASSIFIED = 'drift_classified',
  DOCS_RESOLVED = 'docs_resolved',
  DOCS_FETCHED = 'docs_fetched',
  BASELINE_CHECKED = 'baseline_checked',
  PATCH_PLANNED = 'patch_planned',
  PATCH_GENERATED = 'patch_generated',
  PATCH_VALIDATED = 'patch_validated',
  OWNER_RESOLVED = 'owner_resolved',
  SLACK_SENT = 'slack_sent',

  // Human interaction
  AWAITING_HUMAN = 'awaiting_human',
  APPROVED = 'approved',
  EDIT_REQUESTED = 'edit_requested',
  REJECTED = 'rejected',
  SNOOZED = 'snoozed',

  // Writeback
  WRITEBACK_VALIDATED = 'writeback_validated',
  WRITTEN_BACK = 'written_back',

  // Terminal
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// From Section 15.9.9
export enum FailureCode {
  // Retryable
  TIMEOUT = 'timeout',
  RATE_LIMITED = 'rate_limited',
  SERVICE_UNAVAILABLE = 'service_unavailable',

  // Needs configuration
  NEEDS_DOC_MAPPING = 'needs_doc_mapping',
  NEEDS_OWNER_MAPPING = 'needs_owner_mapping',
  NO_MANAGED_REGION = 'no_managed_region',
  MULTIPLE_PRIMARY_DOCS = 'multiple_primary_docs',

  // Validation failures
  PATCH_VALIDATION_FAILED = 'patch_validation_failed',
  UNSAFE_PATCH = 'unsafe_patch',
  SECRETS_DETECTED = 'secrets_detected',
  PATCH_TOO_LARGE = 'patch_too_large',
  OUT_OF_SCOPE = 'out_of_scope',

  // Permission issues
  DOC_WRITE_DENIED = 'doc_write_denied',
  SLACK_POST_DENIED = 'slack_post_denied',

  // Data issues
  DOC_NOT_FOUND = 'doc_not_found',
  REVISION_MISMATCH = 'revision_mismatch',
  FINGERPRINT_COLLISION = 'fingerprint_collision',
}

export interface TransitionResult {
  state: DriftState;
  enqueueNext: boolean;
  nextStateHint?: string;
  error?: { code: FailureCode; message: string };
}
```

### 2.4 QStash Job Enqueue (Section 15.10.3)

**File to create:** `apps/api/src/services/queue/qstash.ts`

```typescript
import { Client } from '@upstash/qstash';

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

export interface JobPayload {
  workspaceId: string;
  driftId: string;
  attempt?: number;
}

export async function enqueueJob(payload: JobPayload): Promise<string> {
  const result = await qstash.publishJSON({
    url: `${process.env.APP_BASE_URL}/api/jobs/run`,
    body: {
      ...payload,
      attempt: (payload.attempt || 0) + 1,
    },
    retries: 3,
    delay: 1, // 1 second delay
  });

  return result.messageId;
}

export async function enqueueDelayedJob(
  payload: JobPayload,
  delaySeconds: number
): Promise<string> {
  const result = await qstash.publishJSON({
    url: `${process.env.APP_BASE_URL}/api/jobs/run`,
    body: payload,
    delay: delaySeconds,
  });

  return result.messageId;
}
```

### 2.5 Distributed Locking (Section 15.10.5)

**File to create:** `apps/api/src/services/queue/locking.ts`

```typescript
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const LOCK_TTL_SECONDS = 30;

export async function acquireLock(
  workspaceId: string,
  driftId: string
): Promise<boolean> {
  const lockKey = `lock:drift:${workspaceId}:${driftId}`;

  // SET NX with expiration
  const acquired = await redis.set(lockKey, Date.now().toString(), {
    nx: true,
    ex: LOCK_TTL_SECONDS,
  });

  return acquired === 'OK';
}

export async function releaseLock(
  workspaceId: string,
  driftId: string
): Promise<void> {
  const lockKey = `lock:drift:${workspaceId}:${driftId}`;
  await redis.del(lockKey);
}

export async function extendLock(
  workspaceId: string,
  driftId: string
): Promise<boolean> {
  const lockKey = `lock:drift:${workspaceId}:${driftId}`;
  const result = await redis.expire(lockKey, LOCK_TTL_SECONDS);
  return result === 1;
}
```

### 2.6 Job Runner Route (Section 15.10.4)

**File to create:** `apps/api/src/routes/jobs.ts`

```typescript
import { Router, Request, Response } from 'express';
import { Receiver } from '@upstash/qstash';
import { prisma } from '../db';
import { acquireLock, releaseLock } from '../services/queue/locking';
import { enqueueJob } from '../services/queue/qstash';
import { executeTransition } from '../services/orchestrator/transitions';
import { DriftState } from '../types/state-machine';

const router = Router();

// QStash signature verification
const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

// Terminal states - no more transitions
const TERMINAL_STATES = [DriftState.COMPLETED, DriftState.FAILED];

// Human-gated states - wait for approval
const HUMAN_GATED_STATES = [
  DriftState.AWAITING_HUMAN,
  DriftState.SNOOZED,
];

// Maximum transitions per invocation (bounded loop)
const MAX_TRANSITIONS_PER_INVOCATION = 5;

router.post('/run', async (req: Request, res: Response) => {
  // 1. Verify QStash signature
  const signature = req.headers['upstash-signature'] as string;
  const body = JSON.stringify(req.body);

  const isValid = await receiver.verify({
    signature,
    body,
  });

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid QStash signature' });
  }

  const { workspaceId, driftId, attempt = 1 } = req.body;

  // 2. Acquire distributed lock
  const lockAcquired = await acquireLock(workspaceId, driftId);
  if (!lockAcquired) {
    // Another worker is processing this drift
    return res.status(200).json({ status: 'skipped', reason: 'locked' });
  }

  try {
    // 3. Load drift candidate
    const drift = await prisma.driftCandidate.findUnique({
      where: {
        workspaceId_id: { workspaceId, id: driftId }
      },
      include: {
        signalEvent: true,
        workspace: true,
      },
    });

    if (!drift) {
      return res.status(404).json({ error: 'Drift not found' });
    }

    // 4. Check if already terminal
    if (TERMINAL_STATES.includes(drift.state as DriftState)) {
      return res.status(200).json({
        status: 'complete',
        state: drift.state
      });
    }

    // 5. Check if human-gated
    if (HUMAN_GATED_STATES.includes(drift.state as DriftState)) {
      return res.status(200).json({
        status: 'waiting',
        state: drift.state,
        reason: 'awaiting_human_action'
      });
    }

    // 6. Execute bounded transition loop
    let currentState = drift.state as DriftState;
    let transitions = 0;

    while (
      transitions < MAX_TRANSITIONS_PER_INVOCATION &&
      !TERMINAL_STATES.includes(currentState) &&
      !HUMAN_GATED_STATES.includes(currentState)
    ) {
      const result = await executeTransition(drift, currentState);

      // Update state in DB
      await prisma.driftCandidate.update({
        where: { workspaceId_id: { workspaceId, id: driftId } },
        data: {
          state: result.state,
          stateUpdatedAt: new Date(),
          ...(result.error && {
            lastErrorCode: result.error.code,
            lastErrorMessage: result.error.message,
            retryCount: { increment: 1 },
          }),
        },
      });

      currentState = result.state;
      transitions++;

      // If error, break and potentially retry
      if (result.error) {
        break;
      }
    }

    // 7. If not terminal and not human-gated, enqueue next batch
    if (
      !TERMINAL_STATES.includes(currentState) &&
      !HUMAN_GATED_STATES.includes(currentState)
    ) {
      await enqueueJob({ workspaceId, driftId, attempt });
    }

    return res.status(200).json({
      status: 'ok',
      state: currentState,
      transitions,
    });

  } finally {
    // 8. Always release lock
    await releaseLock(workspaceId, driftId);
  }
});

export default router;
```

### 2.7 State Transition Orchestrator (Section 15.10.6)

**File to create:** `apps/api/src/services/orchestrator/transitions.ts`

```typescript
import { DriftState, FailureCode, TransitionResult } from '../../types/state-machine';
import { runDriftTriage } from '../../agents/drift-triage';
import { runDocResolver } from '../../agents/doc-resolver';
import { runPatchPlanner } from '../../agents/patch-planner';
import { runPatchGenerator } from '../../agents/patch-generator';
import { runSlackComposer } from '../../agents/slack-composer';
import { prisma } from '../../db';

// State transition map - each state has one handler
const TRANSITION_HANDLERS: Record<DriftState, TransitionHandler> = {
  [DriftState.INGESTED]: handleIngested,
  [DriftState.ELIGIBILITY_CHECKED]: handleEligibilityChecked,
  [DriftState.SIGNALS_CORRELATED]: handleSignalsCorrelated,
  [DriftState.DRIFT_CLASSIFIED]: handleDriftClassified,
  [DriftState.DOCS_RESOLVED]: handleDocsResolved,
  [DriftState.DOCS_FETCHED]: handleDocsFetched,
  [DriftState.BASELINE_CHECKED]: handleBaselineChecked,
  [DriftState.PATCH_PLANNED]: handlePatchPlanned,
  [DriftState.PATCH_GENERATED]: handlePatchGenerated,
  [DriftState.PATCH_VALIDATED]: handlePatchValidated,
  [DriftState.OWNER_RESOLVED]: handleOwnerResolved,
  [DriftState.SLACK_SENT]: handleSlackSent,
  [DriftState.AWAITING_HUMAN]: handleAwaitingHuman,
  [DriftState.APPROVED]: handleApproved,
  [DriftState.EDIT_REQUESTED]: handleEditRequested,
  [DriftState.REJECTED]: handleRejected,
  [DriftState.SNOOZED]: handleSnoozed,
  [DriftState.WRITEBACK_VALIDATED]: handleWritebackValidated,
  [DriftState.WRITTEN_BACK]: handleWrittenBack,
  [DriftState.COMPLETED]: async () => ({ state: DriftState.COMPLETED, enqueueNext: false }),
  [DriftState.FAILED]: async () => ({ state: DriftState.FAILED, enqueueNext: false }),
};

type TransitionHandler = (drift: any) => Promise<TransitionResult>;

export async function executeTransition(
  drift: any,
  currentState: DriftState
): Promise<TransitionResult> {
  const handler = TRANSITION_HANDLERS[currentState];

  if (!handler) {
    return {
      state: DriftState.FAILED,
      enqueueNext: false,
      error: {
        code: FailureCode.TIMEOUT,
        message: `No handler for state: ${currentState}`
      },
    };
  }

  try {
    return await handler(drift);
  } catch (error) {
    return {
      state: currentState, // Stay in current state for retry
      enqueueNext: true,
      error: {
        code: FailureCode.SERVICE_UNAVAILABLE,
        message: error.message
      },
    };
  }
}

// --- Sample Transition Handlers ---

async function handleIngested(drift: any): Promise<TransitionResult> {
  // Check eligibility: is this a PR we should process?
  const signal = drift.signalEvent;

  // Skip if not merged PR
  if (signal.sourceType === 'github_pr' && !signal.extracted?.mergedAt) {
    return { state: DriftState.COMPLETED, enqueueNext: false };
  }

  // Skip if only tests/docs changed
  const files = signal.extracted?.filePaths || [];
  const isOnlyTests = files.every((f: string) =>
    f.includes('test') || f.includes('spec') || f.endsWith('.md')
  );
  if (isOnlyTests) {
    return { state: DriftState.COMPLETED, enqueueNext: false };
  }

  return { state: DriftState.ELIGIBILITY_CHECKED, enqueueNext: true };
}

// Additional handlers follow same pattern...
// See Section 7.2 of spec for full Agent implementations
```

### 2.8 Update Webhook to Enqueue Jobs

**File to modify:** `apps/api/src/routes/webhooks.ts`

Replace synchronous pipeline with async enqueue:

```typescript
// OLD (synchronous):
// const triageResult = await runDriftTriage(prInfo);
// const resolvedDocs = await runDocResolver(...);

// NEW (async via QStash):
import { enqueueJob } from '../services/queue/qstash';

// After creating drift candidate:
await enqueueJob({
  workspaceId,
  driftId: driftCandidate.id,
});

// Return 202 immediately
return res.status(202).json({
  message: 'Webhook received, processing async',
  driftId: driftCandidate.id,
});
```

### 2.9 Update Slack Interactions for Human Actions

After human action (approve/edit/reject), re-enqueue for state transition:

```typescript
// In approve handler:
await prisma.driftCandidate.update({
  where: { workspaceId_id: { workspaceId, id: driftId } },
  data: { state: DriftState.APPROVED },
});
await enqueueJob({ workspaceId, driftId });

// In reject handler - no enqueue (terminal state)
await prisma.driftCandidate.update({
  where: { workspaceId_id: { workspaceId, id: driftId } },
  data: { state: DriftState.REJECTED },
});
```

### 2.10 Phase 2 Checklist

- [ ] Install `@upstash/qstash` and `@upstash/redis` packages
- [ ] Add QStash and Redis environment variables
- [ ] Create state machine types (`DriftState`, `FailureCode`)
- [ ] Create QStash enqueue service
- [ ] Create distributed locking service
- [ ] Create job runner route with QStash signature verification
- [ ] Create state transition orchestrator
- [ ] Update webhook routes to enqueue jobs
- [ ] Update Slack interactions to enqueue after human actions
- [ ] Add `/api/jobs/run` to Express routes
- [ ] Test state machine with sample PR webhook

---

## Phase 3: Enhanced Drift Detection

### 3.1 Goals

- Add 5 drift types (instruction, process, ownership, coverage, environment)
- Implement managed region markers
- Add drift fingerprinting and deduplication
- Implement notification routing policy
- Add all 14 validators

### 3.2 Managed Region Markers (Section 15.9.1)

**File to create:** `apps/api/src/services/docs/managedRegion.ts`

```typescript
// Managed region markers for safe writeback
const MANAGED_START = '<!-- DRIFT_AGENT_MANAGED_START -->';
const MANAGED_END = '<!-- DRIFT_AGENT_MANAGED_END -->';

export interface ManagedRegionResult {
  before: string;
  managed: string;
  after: string;
  hasManagedRegion: boolean;
}

export function extractManagedRegion(markdown: string): ManagedRegionResult {
  const startIdx = markdown.indexOf(MANAGED_START);
  const endIdx = markdown.indexOf(MANAGED_END);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return { before: markdown, managed: '', after: '', hasManagedRegion: false };
  }

  return {
    before: markdown.slice(0, startIdx + MANAGED_START.length),
    managed: markdown.slice(startIdx + MANAGED_START.length, endIdx),
    after: markdown.slice(endIdx),
    hasManagedRegion: true,
  };
}

export function applyPatchToManagedRegion(
  markdown: string,
  patchedManaged: string
): string {
  const { before, after, hasManagedRegion } = extractManagedRegion(markdown);

  if (!hasManagedRegion) {
    throw new Error('Document does not have a managed region');
  }

  return before + patchedManaged + after;
}

// Install snippet for teams to add to their docs
export const INSTALL_SNIPPET = `
<!-- DRIFT_AGENT_MANAGED_START -->
<!--
  This section is managed by VertaAI Drift Agent.
  Changes here may be overwritten automatically.
  Move content outside these markers if you don't want it auto-updated.
-->

<!-- DRIFT_AGENT_MANAGED_END -->
`;
```

### 3.3 Drift Fingerprinting (Section 5.12.6, 15.10.7)

**File to create:** `apps/api/src/services/dedup/fingerprint.ts`

```typescript
import crypto from 'crypto';

export interface FingerprintInput {
  workspaceId: string;
  service: string | null;
  driftType: string;
  driftDomains: string[];
  docId: string;
  keyTokens: string[]; // Extracted from evidence
}

export function computeDriftFingerprint(input: FingerprintInput): string {
  const normalized = {
    ws: input.workspaceId,
    svc: input.service || '_none_',
    type: input.driftType,
    domains: [...input.driftDomains].sort(),
    doc: input.docId,
    tokens: [...input.keyTokens].sort().slice(0, 10), // Top 10 tokens
  };

  const payload = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

// Extract key tokens from evidence for fingerprinting
export function extractKeyTokens(evidence: string): string[] {
  const tokens: string[] = [];

  // Extract commands: kubectl, helm, docker, etc.
  const commandRegex = /\b(kubectl|helm|docker|terraform|aws|gcloud|npm|yarn)\s+\w+/gi;
  const commands = evidence.match(commandRegex) || [];
  tokens.push(...commands.map(c => c.toLowerCase()));

  // Extract URLs and paths
  const urlRegex = /https?:\/\/[^\s]+/gi;
  const urls = evidence.match(urlRegex) || [];
  tokens.push(...urls.map(u => new URL(u).pathname));

  // Extract config keys: FOO_BAR, foo.bar.baz
  const configRegex = /\b[A-Z][A-Z0-9_]{2,}\b|\b\w+\.\w+\.\w+\b/g;
  const configs = evidence.match(configRegex) || [];
  tokens.push(...configs.map(c => c.toLowerCase()));

  return [...new Set(tokens)];
}
```

### 3.4 Deduplication Validator (Section 15.14.4)

**File to create:** `apps/api/src/services/validators/dedup.ts`

```typescript
import { prisma } from '../../db';
import { computeDriftFingerprint, extractKeyTokens } from '../dedup/fingerprint';

export interface DedupResult {
  isDuplicate: boolean;
  existingDriftId?: string;
  shouldNotify: boolean;
  reason?: string;
}

export async function checkDuplicateDrift(
  workspaceId: string,
  driftType: string,
  driftDomains: string[],
  docId: string,
  evidence: string,
  newConfidence: number
): Promise<DedupResult> {
  const keyTokens = extractKeyTokens(evidence);
  const fingerprint = computeDriftFingerprint({
    workspaceId,
    service: null, // Filled by caller
    driftType,
    driftDomains,
    docId,
    keyTokens,
  });

  // Check for existing drift with same fingerprint
  const existing = await prisma.driftCandidate.findFirst({
    where: {
      workspaceId,
      fingerprint,
      state: { notIn: ['completed', 'failed', 'rejected'] },
    },
    include: { patchProposals: true },
  });

  if (!existing) {
    return { isDuplicate: false, shouldNotify: true };
  }

  // Same fingerprint exists
  const existingConfidence = existing.confidence || 0;
  const confidenceDelta = newConfidence - existingConfidence;

  // Re-notify if new evidence significantly increases confidence
  if (confidenceDelta >= 0.15) {
    return {
      isDuplicate: true,
      existingDriftId: existing.id,
      shouldNotify: true,
      reason: `Confidence increased by ${(confidenceDelta * 100).toFixed(0)}%`,
    };
  }

  // Don't re-notify
  return {
    isDuplicate: true,
    existingDriftId: existing.id,
    shouldNotify: false,
    reason: 'Duplicate drift already pending',
  };
}
```

### 3.5 Notification Policy (Section 15.9.5, 15.14.3)

**File to create:** `apps/api/src/services/notifications/policy.ts`

```typescript
import { prisma } from '../../db';

export interface NotificationDecision {
  shouldNotify: boolean;
  channel: 'dm' | 'team_channel' | 'digest' | 'none';
  reason: string;
  target?: string; // Slack channel/user ID
}

export async function shouldNotifySlack(
  workspaceId: string,
  driftId: string,
  confidence: number,
  ownerSlackId: string | null
): Promise<NotificationDecision> {
  // Load workspace notification thresholds
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace) {
    return { shouldNotify: false, channel: 'none', reason: 'Workspace not found' };
  }

  const highThreshold = workspace.highConfidenceThreshold || 0.70;
  const mediumThreshold = workspace.mediumConfidenceThreshold || 0.55;

  // Check rate limits
  const recentNotifications = await prisma.patchProposal.count({
    where: {
      workspaceId,
      lastNotifiedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
    },
  });

  if (recentNotifications >= 10) {
    return {
      shouldNotify: false,
      channel: 'none',
      reason: 'Rate limit: 10 notifications/hour exceeded'
    };
  }

  // Confidence-based routing
  if (confidence >= highThreshold) {
    return {
      shouldNotify: true,
      channel: 'dm',
      target: ownerSlackId || undefined,
      reason: `High confidence (${(confidence * 100).toFixed(0)}%) → DM owner`,
    };
  }

  if (confidence >= mediumThreshold) {
    return {
      shouldNotify: true,
      channel: 'team_channel',
      target: workspace.defaultOwnerRef || undefined,
      reason: `Medium confidence (${(confidence * 100).toFixed(0)}%) → team channel`,
    };
  }

  // Low confidence → batch for weekly digest
  return {
    shouldNotify: false,
    channel: 'digest',
    reason: `Low confidence (${(confidence * 100).toFixed(0)}%) → weekly digest`,
  };
}
```

### 3.6 All 14 Validators (Section 5.11)

**File to create:** `apps/api/src/services/validators/index.ts`

```typescript
import { extractManagedRegion } from '../docs/managedRegion';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Validator 1: Diff applies cleanly
export function validateDiffApplies(
  original: string,
  diff: string,
  patched: string
): ValidationResult {
  // Implementation: apply diff to original and compare to patched
  return { valid: true, errors: [], warnings: [] };
}

// Validator 2: Max changed lines
export function validateMaxChangedLines(
  diff: string,
  maxLines: number = 50
): ValidationResult {
  const lines = diff.split('\n').filter(l => l.startsWith('+') || l.startsWith('-'));
  if (lines.length > maxLines) {
    return {
      valid: false,
      errors: [`Patch changes ${lines.length} lines, max is ${maxLines}`],
      warnings: []
    };
  }
  return { valid: true, errors: [], warnings: [] };
}

// Validator 3: Allowed sections only
export function validateAllowedSectionsOnly(
  diff: string,
  allowedHeadings: string[]
): ValidationResult {
  // Parse diff to find which headings are modified
  return { valid: true, errors: [], warnings: [] };
}

// Validator 4: No secrets introduced
export function validateNoSecretsIntroduced(diff: string): ValidationResult {
  const secretPatterns = [
    /[A-Za-z0-9+/]{40,}/,  // Base64 strings
    /ghp_[A-Za-z0-9]{36}/,  // GitHub tokens
    /sk-[A-Za-z0-9]{48}/,   // OpenAI keys
    /AKIA[A-Z0-9]{16}/,     // AWS keys
  ];

  for (const pattern of secretPatterns) {
    if (pattern.test(diff)) {
      return {
        valid: false,
        errors: ['Patch may contain secrets or tokens'],
        warnings: []
      };
    }
  }
  return { valid: true, errors: [], warnings: [] };
}

// Validator 5: Evidence for risky changes
export function validateEvidenceForRiskyChanges(
  diff: string,
  evidence: string[]
): ValidationResult {
  const riskyKeywords = ['auth', 'password', 'secret', 'deploy', 'rollback'];
  const hasRiskyChange = riskyKeywords.some(kw => diff.toLowerCase().includes(kw));

  if (hasRiskyChange && evidence.length === 0) {
    return {
      valid: false,
      errors: ['Risky change requires evidence from PR'],
      warnings: []
    };
  }
  return { valid: true, errors: [], warnings: [] };
}

// Validator 6: Patch style matches drift type
export function validatePatchStyleMatchesDriftType(
  patchStyle: string,
  driftType: string
): ValidationResult {
  const validCombos: Record<string, string[]> = {
    instruction: ['replace_steps', 'add_note'],
    process: ['reorder_steps', 'replace_steps', 'add_section'],
    ownership: ['update_owner_block'],
    coverage: ['add_section', 'link_patch'],
    environment: ['replace_steps', 'add_note'],
  };

  if (!validCombos[driftType]?.includes(patchStyle)) {
    return {
      valid: false,
      errors: [`Patch style '${patchStyle}' invalid for drift type '${driftType}'`],
      warnings: []
    };
  }
  return { valid: true, errors: [], warnings: [] };
}

// Validator 11: Managed region only (Section 15.14.1)
export function validateManagedRegionOnly(
  originalMarkdown: string,
  patchedMarkdown: string
): ValidationResult {
  const original = extractManagedRegion(originalMarkdown);
  const patched = extractManagedRegion(patchedMarkdown);

  if (!original.hasManagedRegion) {
    return { valid: false, errors: ['Document has no managed region'], warnings: [] };
  }

  if (original.before !== patched.before || original.after !== patched.after) {
    return { valid: false, errors: ['Patch modifies content outside managed region'], warnings: [] };
  }

  return { valid: true, errors: [], warnings: [] };
}

// Validator 12: Primary doc only (Section 15.14.2)
export async function validatePrimaryDocOnly(
  workspaceId: string,
  docId: string,
  service: string
): Promise<ValidationResult> {
  const mapping = await prisma.docMapping.findFirst({
    where: { workspaceId, docId },
  });

  if (!mapping?.isPrimary) {
    return {
      valid: false,
      errors: ['Only primary docs can receive full patches. Use link_patch for secondary docs.'],
      warnings: []
    };
  }
  return { valid: true, errors: [], warnings: [] };
}

// Run all validators
export async function runAllValidators(ctx: ValidatorContext): Promise<ValidationResult> {
  const results: ValidationResult[] = [
    validateMaxChangedLines(ctx.diff, 50),
    validateNoSecretsIntroduced(ctx.diff),
    validatePatchStyleMatchesDriftType(ctx.patchStyle, ctx.driftType),
    validateManagedRegionOnly(ctx.originalMarkdown, ctx.patchedMarkdown),
  ];

  const errors = results.flatMap(r => r.errors);
  const warnings = results.flatMap(r => r.warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
```

### 3.7 Phase 3 Checklist

- [ ] Update Agent A with drift type classification
- [ ] Implement managed region extraction and validation
- [ ] Create drift fingerprinting service
- [ ] Implement deduplication validator
- [ ] Create notification routing policy
- [ ] Implement all 14 validators
- [ ] Update patch generation to respect managed regions
- [ ] Update writeback to verify managed region only
- [ ] Add primary doc enforcement
- [ ] Test with docs that have managed regions
- [ ] Test deduplication with similar PRs

---

## Phase 4: Multi-Source Support

### 4.1 Goals

- Add PagerDuty webhook handler
- Implement SignalJoiner for cross-source correlation
- Add Notion adapter for doc fetch/writeback
- Implement configurable ownership ranking

### 4.2 PagerDuty Webhook Handler (Section 15.17.2, 15.19.2)

**File to create:** `apps/api/src/routes/pagerduty.ts`

```typescript
import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { enqueueJob } from '../services/queue/qstash';
import crypto from 'crypto';

const router = Router();

// PagerDuty webhook signature verification
function verifyPagerDutySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`v1=${expected}`)
  );
}

router.post('/:workspaceId', async (req: Request, res: Response) => {
  const { workspaceId } = req.params;
  const signature = req.headers['x-pagerduty-signature'] as string;

  // 1. Load workspace and integration
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { integrations: { where: { type: 'pagerduty' } } },
  });

  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found' });
  }

  const integration = workspace.integrations[0];
  if (!integration || integration.status !== 'connected') {
    return res.status(400).json({ error: 'PagerDuty integration not connected' });
  }

  // 2. Verify signature
  const secret = integration.webhookSecret || process.env.PD_WEBHOOK_SECRET!;
  if (!verifyPagerDutySignature(JSON.stringify(req.body), signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // 3. Parse incident payload
  const { event } = req.body;
  if (event.event_type !== 'incident.resolved') {
    return res.status(200).json({ status: 'ignored', reason: 'Not a resolved incident' });
  }

  const incident = event.data;
  const service = incident.service?.summary || inferServiceFromIncident(incident);

  // 4. Create signal event
  const signalEvent = await prisma.signalEvent.create({
    data: {
      workspaceId,
      id: `pagerduty_incident_${incident.id}`,
      sourceType: 'pagerduty_incident',
      occurredAt: new Date(incident.resolved_at || incident.updated_at),
      service,
      severity: mapPagerDutySeverity(incident.urgency),
      extracted: {
        title: incident.title,
        summary: incident.description || '',
        incidentNumber: incident.incident_number,
        urgency: incident.urgency,
        priority: incident.priority?.summary,
        escalationPolicy: incident.escalation_policy?.summary,
        assignees: incident.assignments?.map((a: any) => a.assignee?.summary) || [],
        resolvedBy: incident.resolved_by?.summary,
        duration: calculateDuration(incident.created_at, incident.resolved_at),
      },
      rawPayload: req.body,
    },
  });

  // 5. Create drift candidate
  const driftCandidate = await prisma.driftCandidate.create({
    data: {
      workspaceId,
      signalEventId: signalEvent.id,
      state: 'ingested',
      sourceType: 'pagerduty_incident',
      service,
    },
  });

  // 6. Enqueue for processing
  await enqueueJob({ workspaceId, driftId: driftCandidate.id });

  return res.status(202).json({
    message: 'Incident received',
    signalEventId: signalEvent.id,
    driftId: driftCandidate.id,
  });
});

function inferServiceFromIncident(incident: any): string | undefined {
  // Try to extract service from incident metadata
  const title = incident.title?.toLowerCase() || '';
  // Add service inference logic
  return undefined;
}

function mapPagerDutySeverity(urgency: string): string {
  return urgency === 'high' ? 'sev1' : 'sev2';
}

function calculateDuration(createdAt: string, resolvedAt: string): number {
  return new Date(resolvedAt).getTime() - new Date(createdAt).getTime();
}

export default router;
```

### 4.3 SignalJoiner for Correlation (Section 15.9.3, 15.19.3)

**File to create:** `apps/api/src/services/correlation/signalJoiner.ts`

```typescript
import { prisma } from '../../db';

export interface CorrelatedSignal {
  id: string;
  sourceType: string;
  occurredAt: Date;
  summary: string;
  relevanceScore: number;
}

export interface JoinResult {
  correlatedSignals: CorrelatedSignal[];
  confidenceBoost: number;
  joinReason: string | null;
}

export async function joinSignals(
  workspaceId: string,
  primarySignalId: string,
  service: string | null,
  timeWindowHours: number = 168 // 7 days
): Promise<JoinResult> {
  if (!service) {
    return { correlatedSignals: [], confidenceBoost: 0, joinReason: null };
  }

  const primarySignal = await prisma.signalEvent.findUnique({
    where: { workspaceId_id: { workspaceId, id: primarySignalId } },
  });

  if (!primarySignal) {
    return { correlatedSignals: [], confidenceBoost: 0, joinReason: null };
  }

  // Find signals for same service in time window
  const windowStart = new Date(
    primarySignal.occurredAt.getTime() - timeWindowHours * 60 * 60 * 1000
  );

  const relatedSignals = await prisma.signalEvent.findMany({
    where: {
      workspaceId,
      service,
      id: { not: primarySignalId },
      occurredAt: { gte: windowStart },
    },
    orderBy: { occurredAt: 'desc' },
    take: 10,
  });

  // Score correlation relevance
  const correlatedSignals: CorrelatedSignal[] = relatedSignals.map(signal => {
    const timeDelta = Math.abs(
      primarySignal.occurredAt.getTime() - signal.occurredAt.getTime()
    );
    const hoursApart = timeDelta / (60 * 60 * 1000);

    // Closer in time = higher relevance
    const relevanceScore = Math.max(0, 1 - hoursApart / timeWindowHours);

    return {
      id: signal.id,
      sourceType: signal.sourceType,
      occurredAt: signal.occurredAt,
      summary: (signal.extracted as any)?.title || '',
      relevanceScore,
    };
  });

  // Calculate confidence boost
  // GitHub PR + PagerDuty incident = strong correlation
  const hasGitHub = primarySignal.sourceType === 'github_pr' ||
    correlatedSignals.some(s => s.sourceType === 'github_pr');
  const hasPagerDuty = primarySignal.sourceType === 'pagerduty_incident' ||
    correlatedSignals.some(s => s.sourceType === 'pagerduty_incident');

  let confidenceBoost = 0;
  let joinReason = null;

  if (hasGitHub && hasPagerDuty) {
    confidenceBoost = 0.15;
    joinReason = 'PR merged near incident resolution';
  } else if (correlatedSignals.length >= 2) {
    confidenceBoost = 0.05;
    joinReason = `${correlatedSignals.length} related signals found`;
  }

  return { correlatedSignals, confidenceBoost, joinReason };
}
```

### 4.4 Notion Adapter (Section 7.2.3)

**File to create:** `apps/api/src/services/docs/adapters/notionAdapter.ts`

```typescript
import { Client } from '@notionhq/client';
import { DocAdapter, DocRef, DocFetchResult } from '../../../types/docs';
import { applyDiff } from '../markdown/diffApply';

export function createNotionAdapter(accessToken: string): DocAdapter {
  const notion = new Client({ auth: accessToken });

  return {
    system: 'notion',

    async fetch(doc: DocRef): Promise<DocFetchResult> {
      const page = await notion.pages.retrieve({ page_id: doc.docId });
      const blocks = await notion.blocks.children.list({ block_id: doc.docId });

      return {
        doc,
        baseRevision: (page as any).last_edited_time,
        format: 'markdown',
        markdown: blocksToMarkdown(blocks.results),
      };
    },

    async writePatch({ doc, baseRevision, unifiedDiff }) {
      // Fetch current to verify revision
      const current = await this.fetch(doc);
      if (current.baseRevision !== baseRevision) {
        throw new Error('Revision mismatch: page was edited since fetch');
      }

      // Apply diff
      const newMarkdown = applyDiff(current.markdown, unifiedDiff);
      const newBlocks = markdownToBlocks(newMarkdown);

      // Delete existing blocks and append new ones
      const existingBlocks = await notion.blocks.children.list({ block_id: doc.docId });
      for (const block of existingBlocks.results) {
        await notion.blocks.delete({ block_id: (block as any).id });
      }

      await notion.blocks.children.append({
        block_id: doc.docId,
        children: newBlocks as any,
      });

      const updated = await notion.pages.retrieve({ page_id: doc.docId });
      return { newRevision: (updated as any).last_edited_time };
    },
  };
}

// Simplified block to markdown conversion
function blocksToMarkdown(blocks: any[]): string {
  return blocks.map(block => {
    switch (block.type) {
      case 'paragraph':
        return richTextToPlain(block.paragraph.rich_text);
      case 'heading_1':
        return `# ${richTextToPlain(block.heading_1.rich_text)}`;
      case 'heading_2':
        return `## ${richTextToPlain(block.heading_2.rich_text)}`;
      case 'heading_3':
        return `### ${richTextToPlain(block.heading_3.rich_text)}`;
      case 'bulleted_list_item':
        return `- ${richTextToPlain(block.bulleted_list_item.rich_text)}`;
      case 'numbered_list_item':
        return `1. ${richTextToPlain(block.numbered_list_item.rich_text)}`;
      case 'code':
        return `\`\`\`${block.code.language}\n${richTextToPlain(block.code.rich_text)}\n\`\`\``;
      default:
        return '';
    }
  }).join('\n\n');
}

function richTextToPlain(richText: any[]): string {
  return richText.map(t => t.plain_text).join('');
}

function markdownToBlocks(markdown: string): any[] {
  // Simplified markdown to blocks conversion
  const lines = markdown.split('\n');
  const blocks: any[] = [];

  for (const line of lines) {
    if (line.startsWith('# ')) {
      blocks.push({
        type: 'heading_1',
        heading_1: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] },
      });
    } else if (line.startsWith('## ')) {
      blocks.push({
        type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: line.slice(3) } }] },
      });
    } else if (line.startsWith('- ')) {
      blocks.push({
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ type: 'text', text: { content: line.slice(2) } }] },
      });
    } else if (line.trim()) {
      blocks.push({
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: line } }] },
      });
    }
  }

  return blocks;
}
```

### 4.5 Configurable Ownership Ranking (Section 15.9.4)

**File to create:** `apps/api/src/services/ownership/resolver.ts`

```typescript
import { prisma } from '../../db';

export interface Owner {
  type: 'slack_user' | 'slack_channel' | 'team';
  ref: string;
  name?: string;
  source: 'pagerduty' | 'codeowners' | 'manual' | 'commit_history';
}

export interface OwnerResolution {
  primary: Owner | null;
  fallback: Owner | null;
  sources: Owner[];
}

export async function resolveOwner(
  workspaceId: string,
  service: string | null,
  repo: string | null
): Promise<OwnerResolution> {
  // Load workspace ownership ranking config
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  const ranking = workspace?.ownershipSourceRanking || ['pagerduty', 'codeowners', 'manual'];

  // Gather owners from all sources
  const owners: Owner[] = [];

  // From manual mappings
  const manualMappings = await prisma.ownerMapping.findMany({
    where: {
      workspaceId,
      OR: [
        { service: service || undefined },
        { repo: repo || undefined },
      ],
    },
  });

  for (const mapping of manualMappings) {
    owners.push({
      type: mapping.ownerType as Owner['type'],
      ref: mapping.ownerRef,
      source: mapping.source as Owner['source'],
    });
  }

  // TODO: Add PagerDuty on-call lookup
  // TODO: Add CODEOWNERS parsing

  // Sort by workspace ranking
  const sorted = owners.sort((a, b) => {
    const aRank = ranking.indexOf(a.source);
    const bRank = ranking.indexOf(b.source);
    return aRank - bRank;
  });

  return {
    primary: sorted[0] || null,
    fallback: sorted[1] || {
      type: workspace?.defaultOwnerType as Owner['type'] || 'slack_channel',
      ref: workspace?.defaultOwnerRef || '#engineering',
      source: 'manual',
    },
    sources: sorted,
  };
}
```

### 4.6 Phase 4 Checklist

- [ ] Create PagerDuty webhook route (`/webhooks/pagerduty/:workspaceId`)
- [ ] Add PagerDuty integration to workspace setup
- [ ] Implement SignalJoiner for cross-source correlation
- [ ] Create Notion adapter with managed region support
- [ ] Add Notion integration to workspace setup
- [ ] Implement configurable ownership ranking
- [ ] Add PagerDuty on-call API integration
- [ ] Parse CODEOWNERS files from GitHub
- [ ] Update state machine to use SignalJoiner
- [ ] Test GitHub + PagerDuty correlation
- [ ] Test Notion doc fetch and writeback

---

## Phase 5: Platform Migration (Optional)

### 5.1 Goals

- Migrate from Express on Railway to Next.js on Vercel
- Leverage Vercel's edge functions for webhooks
- Native QStash integration
- Better developer experience

### 5.2 Decision: Stay or Migrate?

| Factor | Stay on Express | Migrate to Next.js |
|--------|-----------------|-------------------|
| **Effort** | Low (already works) | Medium-High |
| **Benefits** | Stability | Serverless scaling, edge functions |
| **Complexity** | Lower | Higher (new patterns) |
| **Cost** | Railway hosting | Vercel + Neon/Supabase |

**Recommendation:** Only migrate if you need serverless scaling or have time to invest.

### 5.3 Next.js App Router Structure (Section 15.17)

If you decide to migrate:

```
apps/web/
├── app/
│   ├── api/
│   │   ├── webhooks/
│   │   │   ├── github/
│   │   │   │   └── [workspaceId]/
│   │   │   │       └── route.ts
│   │   │   └── pagerduty/
│   │   │       └── [workspaceId]/
│   │   │           └── route.ts
│   │   ├── slack/
│   │   │   └── interactivity/
│   │   │       └── [workspaceId]/
│   │   │           └── route.ts
│   │   ├── jobs/
│   │   │   └── run/
│   │   │       └── route.ts
│   │   └── admin/
│   │       ├── patches/
│   │       │   └── route.ts
│   │       └── mappings/
│   │           └── docs/
│   │               └── route.ts
│   └── (dashboard)/
│       └── page.tsx
├── lib/
│   ├── prisma.ts
│   ├── qstash.ts
│   └── redis.ts
└── middleware.ts
```

### 5.4 Sample Next.js Route (Section 15.17.1)

**File:** `apps/web/app/api/webhooks/github/[workspaceId]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifySignature } from '@/lib/github';
import { prisma } from '@/lib/prisma';
import { enqueueJob } from '@/lib/qstash';

export async function POST(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  const { workspaceId } = params;
  const body = await request.text();
  const signature = request.headers.get('x-hub-signature-256') || '';

  // Load workspace
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { integrations: { where: { type: 'github' } } },
  });

  if (!workspace) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Verify signature
  const secret = workspace.integrations[0]?.webhookSecret || process.env.GH_WEBHOOK_SECRET!;
  if (!verifySignature(body, signature, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = JSON.parse(body);

  // Handle only merged PRs
  if (payload.action !== 'closed' || !payload.pull_request?.merged) {
    return NextResponse.json({ status: 'ignored' });
  }

  // Create signal and drift candidate (same as Express)
  const signalEvent = await prisma.signalEvent.create({ ... });
  const driftCandidate = await prisma.driftCandidate.create({ ... });

  // Enqueue
  await enqueueJob({ workspaceId, driftId: driftCandidate.id });

  return NextResponse.json({
    status: 'accepted',
    driftId: driftCandidate.id
  }, { status: 202 });
}
```

### 5.5 Vercel Configuration

**File:** `vercel.json`

```json
{
  "buildCommand": "cd apps/web && npm run build",
  "outputDirectory": "apps/web/.next",
  "framework": "nextjs",
  "functions": {
    "app/api/webhooks/**/*.ts": {
      "maxDuration": 30
    },
    "app/api/jobs/run/route.ts": {
      "maxDuration": 60
    }
  }
}
```

### 5.6 Phase 5 Checklist

- [ ] Create Next.js app in `apps/web`
- [ ] Set up Prisma in Next.js
- [ ] Create all API routes per Section 15.17
- [ ] Configure Vercel deployment
- [ ] Migrate environment variables
- [ ] Update webhook URLs in GitHub/PagerDuty/Slack apps
- [ ] Run parallel testing (Express + Next.js)
- [ ] Gradual traffic migration
- [ ] Deprecate Express app

---

## Testing Strategy

### Unit Tests

| Component | Test Focus |
|-----------|-----------|
| Validators | Each validator with valid/invalid inputs |
| Fingerprint | Deterministic hashing, collision handling |
| Managed Region | Extract/apply with edge cases |
| State Machine | Each transition handler |

### Integration Tests

| Flow | Test Coverage |
|------|--------------|
| GitHub Webhook → Signal | Signature verification, signal creation |
| Signal → Drift Candidate | State transitions, QStash enqueue |
| Human Approval → Writeback | Slack interaction, doc update |

### End-to-End Tests

| Scenario | Description |
|----------|-------------|
| Full GitHub Flow | PR → Drift → Patch → Approve → Writeback |
| Deduplication | Same PR twice → only one notification |
| Cross-Source | GitHub PR + PagerDuty → boosted confidence |

---

## Rollout Plan

### Week 1-2: Phase 1 (Workspace Scoping)
- Day 1-2: Create new Prisma schema
- Day 3-4: Migration script and testing
- Day 5: Update queries to use workspace
- Day 6-7: Deploy and validate

### Week 3-4: Phase 2 (State Machine)
- Day 1-2: Install QStash, create types
- Day 3-4: Job runner and transitions
- Day 5: Update webhooks
- Day 6-7: Testing and monitoring

### Week 5-6: Phase 3 (Enhanced Drift)
- Day 1-2: Managed regions, fingerprinting
- Day 3-4: All validators
- Day 5: Notification policy
- Day 6-7: End-to-end testing

### Week 7-8: Phase 4 (Multi-Source)
- Day 1-2: PagerDuty webhook
- Day 3-4: SignalJoiner
- Day 5: Notion adapter
- Day 6-7: Testing correlation flows

### Week 9+: Phase 5 (Optional Migration)
- Evaluate if needed
- Gradual migration with parallel running

---

## Success Criteria

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Webhook latency | <500ms response | Monitor 202 response times |
| Pipeline completion | <2min end-to-end | Time from signal to Slack |
| Approval rate | >50% for P0 | approved / (approved + rejected) |
| Duplicate rate | <5% | Fingerprint collisions |
| Error rate | <1% | Failed state transitions |

---

## Appendix: Reference to Spec Sections

| Implementation Area | Spec Sections |
|--------------------|---------------|
| State Machine | 15.10, 15.15.1 |
| Drift Types | 5.2, 5.4, 6.1 |
| Validators | 5.11, 15.13, 15.14 |
| Managed Regions | 15.9.1, 15.14.1 |
| Fingerprinting | 5.12.6, 15.10.7 |
| Notification Policy | 15.9.5, 15.14.3 |
| PagerDuty | 15.17.2, 15.19.2 |
| SignalJoiner | 15.9.3, 15.19.3 |
| Doc Adapters | 7.2.3 |
| Signal Adapters | 7.2.4 |
| Ownership | 15.9.4, 15.11.7 |
| OpenAPI | 8.2.6 |
| Operational Flows | 15.19 |

