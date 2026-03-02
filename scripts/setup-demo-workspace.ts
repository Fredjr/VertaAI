/**
 * Setup Script for Demo Workspace
 * 
 * This script sets up the demo-workspace with:
 * 1. Sample intent artifacts
 * 2. Sample services
 * 3. Sample runtime observations
 * 4. Sample policy pack configuration
 * 
 * Usage:
 *   pnpm tsx scripts/setup-demo-workspace.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const WORKSPACE_ID = 'demo-workspace';

async function createSampleIntentArtifact() {
  console.log('📝 Creating sample intent artifact...');

  // specBuildFindings: realistic PR gate result at MERGE TIME.
  // s3_write was detected in the diff but NOT declared in the intent → privilege_expansion.
  // isFinalSnapshot:true means this snapshot was written when the PR was actually merged (closed event).
  const mergedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
  const specBuildFindings = JSON.stringify({
    checkedAt: mergedAt.toISOString(),
    isFinalSnapshot: true, // P0-A: gate fired at the closed (merged) event
    declaredCapabilities: ['db_read', 'db_write', 'api_endpoint'],
    actualCapabilities: ['db_read', 'db_write', 'api_endpoint', 's3_write'],
    violations: [
      {
        type: 'undeclared',
        capability: 's3_write',
        resource: 's3://user-uploads/profile-pictures',
        reason: 'Capability s3_write detected in PR diff but not declared in intent artifact. ' +
          'Code at src/services/userService.ts line 142 calls s3.putObject() without intent coverage.',
      },
    ],
    summary: 'privilege_expansion', // canonical field read by the UI
    prNumber: 42,
    repoFullName: 'acme-corp/user-service',
    checkedBy: 'vertaai-github-app[bot]',
  });

  // Purge any stale intent artifacts for this service (e.g., from previous sessions
  // that stored wrong requestedCapabilities). Always create fresh so the UI displays
  // the correct canonical capabilities: ['db_read', 'db_write', 'api_endpoint'].
  const deleted = await prisma.intentArtifact.deleteMany({
    where: { workspaceId: WORKSPACE_ID, repoFullName: 'acme-corp/user-service' },
  });
  if (deleted.count > 0) {
    console.log(`🗑️  Removed ${deleted.count} stale intent artifact(s) for user-service`);
  }

  const intentArtifact = await prisma.intentArtifact.create({
    data: {
      workspaceId: WORKSPACE_ID,
      prNumber: 42,
      repoFullName: 'acme-corp/user-service',
      author: 'cursor:v0.42.1',
      authorType: 'AGENT',
      agentIdentity: 'cursor:v0.42.1',
      requestedCapabilities: ['db_read', 'db_write', 'api_endpoint'],
      affectedServices: ['user-service'],
      constraints: { least_privilege: true, no_new_infra: true },
      expectedSideEffects: { modifies_schema: false, creates_table: false },
      riskAcknowledgements: [],
      specBuildFindings,
      links: {
        ticket: 'https://linear.app/acme/issue/ENG-1234',
        design_doc: 'https://notion.so/acme/user-service-redesign',
      },
      signature: {
        signed_by: 'eng-lead@acme-corp.com',
        signed_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        approval_tier: 'standard',
        approval_method: 'github_review',
      },
    },
  });
  console.log(`✅ Created fresh intent artifact: ${intentArtifact.id}`);

  return intentArtifact;
}

async function createSampleAgentActionTrace() {
  console.log('📝 Creating sample agent action trace...');

  // Idempotent: skip if a trace already exists for this PR
  const existing = await prisma.agentActionTrace.findFirst({
    where: { workspaceId: WORKSPACE_ID, prNumber: 42, repoFullName: 'acme-corp/user-service' },
  });
  if (existing) {
    console.log(`✅ Agent action trace already exists: ${existing.id}`);
    return existing;
  }

  const trace = await prisma.agentActionTrace.create({
    data: {
      workspaceId: WORKSPACE_ID,
      prNumber: 42,
      repoFullName: 'acme-corp/user-service',
      agentId: 'cursor',
      agentVersion: 'v0.42.1',
      toolCalls: [
        { tool: 'read_file', args: { path: 'src/services/userService.ts' }, result: 'ok', timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
        { tool: 'write_file', args: { path: 'src/services/userService.ts', linesAdded: 150 }, result: 'ok', timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 5000).toISOString() },
        { tool: 'bash', args: { command: 'aws s3 cp ...' }, result: 'ok', timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 10000).toISOString() },
      ],
      filesModified: [
        { path: 'src/services/userService.ts', changeType: 'modified', linesAdded: 150, linesDeleted: 12 },
        { path: 'src/routes/users.ts', changeType: 'modified', linesAdded: 22, linesDeleted: 5 },
      ],
      externalActions: [
        { type: 'aws_s3_put', target: 's3://user-uploads/profile-pictures', timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 12000).toISOString() },
        { type: 'db_query', target: 'postgresql://production/users', operation: 'SELECT', timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 15000).toISOString() },
      ],
      runtimeEffects: {
        filesWritten: 2,
        externalCallsMade: 2,
        capabilitiesExercised: ['db_read', 'db_write', 's3_write', 'api_endpoint'],
      },
    },
  });

  console.log(`✅ Created agent action trace: ${trace.id}`);
  return trace;
}

async function createSampleRuntimeObservations() {
  console.log('📝 Creating sample runtime observations...');

  // Helper: idempotent insert using sourceEventId
  async function upsertObservation(data: {
    service: string;
    source: string;
    sourceEventId: string;
    capabilityType: string;
    capabilityTarget: string;
    observedAt: Date;
    metadata: object;
  }) {
    const existing = await prisma.runtimeCapabilityObservation.findFirst({
      where: { workspaceId: WORKSPACE_ID, service: data.service, sourceEventId: data.sourceEventId },
    });
    if (existing) return existing;
    return prisma.runtimeCapabilityObservation.create({
      data: { workspaceId: WORKSPACE_ID, ...data },
    });
  }

  const observations = [];
  const now = new Date();

  // CloudTrail — S3 PutObject (undeclared: s3_write not in intent)
  observations.push(await upsertObservation({
    service: 'user-service',
    source: 'aws_cloudtrail',
    sourceEventId: 'demo-cloudtrail-s3-put-001',
    capabilityType: 's3_write',
    capabilityTarget: 's3://user-uploads/profile-pictures',
    observedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    metadata: {
      eventName: 'PutObject',
      awsRegion: 'us-east-1',
      userArn: 'arn:aws:iam::123456789012:role/user-service-role',
      bucketName: 'user-uploads',
      key: 'profile-pictures/user-123.jpg',
      count: 14,
    },
  }));

  // CloudTrail — second S3 PutObject (same capability, different time — builds evidence count)
  observations.push(await upsertObservation({
    service: 'user-service',
    source: 'aws_cloudtrail',
    sourceEventId: 'demo-cloudtrail-s3-put-002',
    capabilityType: 's3_write',
    capabilityTarget: 's3://user-uploads/profile-pictures',
    observedAt: new Date(now.getTime() - 30 * 60 * 1000),
    metadata: {
      eventName: 'PutObject',
      awsRegion: 'us-east-1',
      userArn: 'arn:aws:iam::123456789012:role/user-service-role',
      bucketName: 'user-uploads',
      key: 'profile-pictures/user-456.jpg',
      count: 3,
    },
  }));

  // DB query log — SELECT (declared: db_read ✅)
  observations.push(await upsertObservation({
    service: 'user-service',
    source: 'database_query_log',
    sourceEventId: 'demo-db-select-001',
    capabilityType: 'db_read',
    capabilityTarget: 'postgresql://production/users',
    observedAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
    metadata: {
      operation: 'SELECT',
      user: 'app_user',
      query: 'SELECT * FROM users WHERE id = $1',
      table: 'users',
      duration: 15.5,
    },
  }));

  // DB query log — INSERT (declared: db_write ✅)
  observations.push(await upsertObservation({
    service: 'user-service',
    source: 'database_query_log',
    sourceEventId: 'demo-db-insert-001',
    capabilityType: 'db_write',
    capabilityTarget: 'postgresql://production/users',
    observedAt: new Date(now.getTime() - 45 * 60 * 1000),
    metadata: {
      operation: 'INSERT',
      user: 'app_user',
      query: 'INSERT INTO users (name, email) VALUES ($1, $2)',
      table: 'users',
      duration: 8.2,
    },
  }));

  // GCP Audit Log — API endpoint call (declared: api_endpoint ✅)
  observations.push(await upsertObservation({
    service: 'user-service',
    source: 'gcp_audit_log',
    sourceEventId: 'demo-gcp-api-001',
    capabilityType: 'api_endpoint',
    capabilityTarget: 'GET:/api/users/:id',
    observedAt: new Date(now.getTime() - 20 * 60 * 1000),
    metadata: {
      methodName: 'GET /api/users/:id',
      principalEmail: 'service-account@acme-corp.iam.gserviceaccount.com',
      projectId: 'acme-prod',
      statusCode: 200,
    },
  }));

  // Cost Explorer — cost_increase (NOT declared → drift ❌)
  // The demo intent artifact only declares ['db_read', 'db_write', 'api_endpoint'].
  // An S3 cost anomaly surfacing here means the service is incurring cloud spend
  // on a capability never declared in its intent — a realistic vibe-coding scenario.
  observations.push(await upsertObservation({
    service: 'user-service',
    source: 'cost_explorer',
    sourceEventId: 'demo-cost-anomaly-001',
    capabilityType: 'cost_increase',
    capabilityTarget: 'amazon-s3',
    observedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    metadata: {
      alertType: 'anomaly_detected',
      awsService: 'Amazon S3',
      currentSpend: 847.23,
      forecastedSpend: 2100.00,
      budgetLimit: 500.00,
      anomalyScore: 87,
      tags: { 'vertaai:service': 'user-service' },
    },
  }));

  console.log(`✅ Created/verified ${observations.length} runtime observations`);
  return observations;
}

/**
 * Creates (or refreshes) the DriftCluster for user-service with the new chain-of-custody fields:
 *
 * P1-B: Each undeclaredUsage item has gatePredicted:boolean — true if the Spec→Build gate
 *       flagged it at merge time, false if it's a new post-merge regression.
 *       In the demo: s3_write was flagged by the gate (gatePredicted:true),
 *                    cost_increase was NOT (gatePredicted:false) → new regression.
 * P1-A: mergedAt is stored so the UI can display "Merged: <date>" and the observation window
 *       is anchored to post-merge traffic.
 * P2-A: unusedDeclarations include observationReason to distinguish no-coverage from not-seen.
 */
async function createSampleDriftCluster(intentArtifact: { id: string; createdAt: Date }) {
  console.log('📝 Creating/refreshing demo DriftCluster for user-service...');

  const now = new Date();
  const mergedAt = intentArtifact.createdAt.toISOString();

  // P1-B: Cross-reference the gate violations to build the gateFlaggedTypes set.
  // The gate flagged s3_write at merge time. cost_increase was never mentioned in specBuildFindings.
  // → s3_write.gatePredicted = true  (gate confirmed it — regression known at ship time)
  // → cost_increase.gatePredicted = false (gate silent — new post-merge regression)
  const clusterSummary = {
    intentArtifactId: intentArtifact.id,
    // P1-A: merge anchor for observation window
    mergedAt,
    // P1-B: chain-of-custody — the gate DID have violations for this service
    specBuildViolated: true,
    gatePredictedCount: 1, // only s3_write was predicted by the gate
    severity: 'high',
    severityRationale: 's3_write (HIGH) used 17× at runtime but never declared in intent. ' +
      'Gate predicted this at merge time — runtime confirms the prediction. ' +
      'cost_increase is a new post-merge regression not caught by the gate.',
    driftsDetected: 2,
    undeclaredUsage: [
      {
        capability: 's3_write',
        target: 's3://user-uploads/profile-pictures',
        severity: 'high',
        // P1-B: gate flagged s3_write at merge — this is a CONFIRMED regression
        gatePredicted: true,
        observationCount: 17,
        firstSeen: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        lastSeen: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
        sources: ['aws_cloudtrail'],
        evidence: [
          {
            observedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
            source: 'aws_cloudtrail',
            sourceEventId: 'demo-cloudtrail-s3-put-001',
            actor: 'arn:aws:iam::123456789012:role/user-service-role',
            region: 'us-east-1',
            rawEvent: 'PutObject',
          },
          {
            observedAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
            source: 'aws_cloudtrail',
            sourceEventId: 'demo-cloudtrail-s3-put-002',
            actor: 'arn:aws:iam::123456789012:role/user-service-role',
            region: 'us-east-1',
            rawEvent: 'PutObject',
          },
        ],
      },
      {
        capability: 'cost_increase',
        target: 'amazon-s3',
        severity: 'medium',
        // P1-B: gate did NOT flag cost_increase — this is a NEW post-merge regression
        gatePredicted: false,
        observationCount: 1,
        firstSeen: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        lastSeen: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        sources: ['cost_explorer'],
        evidence: [
          {
            observedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
            source: 'cost_explorer',
            sourceEventId: 'demo-cost-anomaly-001',
            actor: 'unknown',
            region: null,
            rawEvent: 'anomaly_detected',
          },
        ],
      },
    ],
    // All declared capabilities (db_read, db_write, api_endpoint) were observed —
    // no over-scoped items for this demo.
    unusedDeclarations: [],
    remediationOptions: [
      {
        id: 'A',
        label: 'Tighten runtime (recommended)',
        description: 'Remove or restrict the undeclared capability from code/IAM. Spec remains unchanged.',
        requiresApproval: false,
        actions: [
          { type: 'remove_capability', capability: 's3_write', target: 's3://user-uploads/profile-pictures', guidance: 'Remove s3_write access to s3://user-uploads/profile-pictures from code/IAM policy.' },
          { type: 'remove_capability', capability: 'cost_increase', target: 'amazon-s3', guidance: 'Investigate and remove the unbudgeted S3 spend causing the cost anomaly.' },
        ],
      },
      {
        id: 'B',
        label: 'Expand intent (requires security approval)',
        description: 'Add the capability to the intent artifact — triggers security review workflow.',
        requiresApproval: true,
        actions: [
          { type: 'add_to_intent', capability: 's3_write', target: 's3://user-uploads/profile-pictures', guidance: 'Add s3_write:s3://user-uploads/profile-pictures to intent artifact. Requires security team sign-off.' },
          { type: 'add_to_intent', capability: 'cost_increase', target: 'amazon-s3', guidance: 'Add cost_increase:amazon-s3 to intent artifact with budget ceiling. Requires security team sign-off.' },
        ],
      },
      {
        id: 'C',
        label: 'Mark as false positive',
        description: 'Dismiss with documented justification and mandatory expiry date for re-evaluation.',
        requiresApproval: true,
        actions: [
          { type: 'false_positive', capability: 's3_write', target: 's3://user-uploads/profile-pictures', guidance: 'Document why s3_write is benign. Set expiry ≤ 90 days for mandatory re-evaluation.' },
          { type: 'false_positive', capability: 'cost_increase', target: 'amazon-s3', guidance: 'Document why cost_increase is benign. Set expiry ≤ 90 days for mandatory re-evaluation.' },
        ],
      },
    ],
  };

  // Idempotent: update if a cluster already exists for user-service, otherwise create
  const existing = await prisma.driftCluster.findFirst({
    where: { workspaceId: WORKSPACE_ID, service: 'user-service' },
  });

  if (existing) {
    await prisma.driftCluster.update({
      where: { workspaceId_id: { workspaceId: existing.workspaceId, id: existing.id } },
      data: {
        clusterSummary: JSON.stringify(clusterSummary),
        driftCount: 2,
        // intentArtifactId is NOT a schema column — it lives inside clusterSummary JSON.
        // The API route at GET /api/workspaces/:id/drift-clusters reads summary.intentArtifactId
        // from the JSON blob and does a separate prisma.intentArtifact.findUnique() call.
      },
    });
    console.log(`✅ Refreshed DriftCluster ${existing.id} with chain-of-custody fields`);
  } else {
    const cluster = await prisma.driftCluster.create({
      data: {
        workspaceId: WORKSPACE_ID,
        service: 'user-service',
        driftType: 'runtime_capability_drift',
        fingerprintPattern: 'runtime:user-service:capability_drift',
        status: 'pending',
        driftCount: 2,
        clusterSummary: JSON.stringify(clusterSummary),
        // intentArtifactId is NOT a schema column — it lives inside clusterSummary JSON.
        // The API route at GET /api/workspaces/:id/drift-clusters reads summary.intentArtifactId
        // from the JSON blob and does a separate prisma.intentArtifact.findUnique() call.
      },
    });
    console.log(`✅ Created DriftCluster ${cluster.id} with chain-of-custody fields`);
  }
}

async function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 DEMO WORKSPACE SETUP SUMMARY');
  console.log('='.repeat(60));

  // Count intent artifacts
  const intentCount = await prisma.intentArtifact.count({
    where: { workspaceId: WORKSPACE_ID },
  });

  // Count agent action traces
  const traceCount = await prisma.agentActionTrace.count({
    where: { workspaceId: WORKSPACE_ID },
  });

  // Count runtime observations
  const observationCount = await prisma.runtimeCapabilityObservation.count({
    where: { workspaceId: WORKSPACE_ID },
  });

  // Get observation breakdown by source
  const observationsBySource = await prisma.runtimeCapabilityObservation.groupBy({
    by: ['source'],
    where: { workspaceId: WORKSPACE_ID },
    _count: true,
  });

  console.log(`\nWorkspace ID: ${WORKSPACE_ID}`);
  console.log(`\n📝 Intent Artifacts: ${intentCount}`);
  console.log(`🔍 Agent Action Traces: ${traceCount}`);
  console.log(`📊 Runtime Observations: ${observationCount}`);

  console.log('\n📊 Observations by Source:');
  observationsBySource.forEach(({ source, _count }) => {
    console.log(`   - ${source}: ${_count}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('✅ Demo workspace setup complete!');
  console.log('='.repeat(60));

  console.log('\n🚀 Next Steps:');
  console.log('   1. Start the API server: cd apps/api && pnpm dev');
  console.log('   2. Start the web app: cd apps/web && pnpm dev');
  console.log('   3. Run E2E tests: pnpm tsx scripts/e2e-test-runtime-observations.ts');
  console.log('   4. Visit: http://localhost:3000/onboarding?workspace=demo-workspace');
  console.log('');
}

async function main() {
  console.log('🚀 Setting up demo-workspace for E2E testing\n');

  try {
    const intentArtifact = await createSampleIntentArtifact();
    await createSampleAgentActionTrace();
    await createSampleRuntimeObservations();
    await createSampleDriftCluster(intentArtifact);
    await printSummary();
  } catch (error) {
    console.error('❌ Error setting up demo workspace:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

