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

  // specBuildFindings: realistic PR gate result — s3_write was observed in the diff
  // but was NOT declared in the intent, triggering a privilege_expansion violation.
  const specBuildFindings = JSON.stringify({
    checkedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    declaredCapabilities: ['db_read', 'db_write', 'api_endpoint'],
    actualCapabilities: ['db_read', 'db_write', 'api_endpoint', 's3_write'],
    violations: [
      {
        type: 'privilege_expansion',
        capability: 's3_write',
        resource: 's3://user-uploads/profile-pictures',
        reason: 'Capability s3_write detected in PR diff but not declared in intent artifact. ' +
          'Code at src/services/userService.ts line 142 calls s3.putObject() without intent coverage.',
      },
    ],
    passed: false,
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
    await createSampleIntentArtifact();
    await createSampleAgentActionTrace();
    await createSampleRuntimeObservations();
    await printSummary();
  } catch (error) {
    console.error('❌ Error setting up demo workspace:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

