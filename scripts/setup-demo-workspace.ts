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
  
  const intentArtifact = await prisma.intentArtifact.upsert({
    where: {
      workspaceId_serviceName_version: {
        workspaceId: WORKSPACE_ID,
        serviceName: 'user-service',
        version: '1.0.0',
      },
    },
    update: {},
    create: {
      workspaceId: WORKSPACE_ID,
      serviceName: 'user-service',
      version: '1.0.0',
      authorType: 'AGENT',
      authorId: 'claude-sonnet-4.5',
      intentHash: 'sha256:' + Buffer.from('sample-intent').toString('hex'),
      rawIntent: JSON.stringify({
        task: 'Create a user management service',
        requirements: [
          'Read user data from database',
          'Create new users',
          'Update user profiles',
          'Delete users',
        ],
      }),
      declaredCapabilities: [
        'db_read',
        'db_write',
        'db_delete',
        'api_create',
        'api_modify',
        'api_delete',
      ],
      approvedBy: 'test-user@example.com',
      approvedAt: new Date(),
    },
  });
  
  console.log(`✅ Created intent artifact: ${intentArtifact.id}`);
  return intentArtifact;
}

async function createSampleAgentActionTrace() {
  console.log('📝 Creating sample agent action trace...');
  
  const trace = await prisma.agentActionTrace.create({
    data: {
      workspaceId: WORKSPACE_ID,
      serviceName: 'user-service',
      prNumber: 123,
      commitSha: 'abc123def456',
      agentId: 'claude-sonnet-4.5',
      actionType: 'code_generate',
      filePath: 'src/services/userService.ts',
      detectedCapabilities: [
        'db_read',
        'db_write',
        'db_delete',
        'api_create',
        'api_modify',
        'api_delete',
      ],
      metadata: {
        linesAdded: 150,
        linesDeleted: 0,
        functions: ['getUser', 'createUser', 'updateUser', 'deleteUser'],
      },
    },
  });
  
  console.log(`✅ Created agent action trace: ${trace.id}`);
  return trace;
}

async function createSampleRuntimeObservations() {
  console.log('📝 Creating sample runtime observations...');
  
  const observations = [];
  
  // CloudTrail observation - S3 PutObject
  observations.push(await prisma.runtimeCapabilityObservation.create({
    data: {
      workspaceId: WORKSPACE_ID,
      serviceName: 'user-service',
      source: 'aws_cloudtrail',
      eventId: 'cloudtrail-event-1',
      eventTime: new Date(),
      capability: 'file_system_access',
      resourceArn: 'arn:aws:s3:::user-uploads/profile-pictures',
      principalId: 'arn:aws:iam::123456789012:role/user-service-role',
      action: 's3:PutObject',
      metadata: {
        eventName: 'PutObject',
        bucketName: 'user-uploads',
        key: 'profile-pictures/user-123.jpg',
      },
    },
  }));
  
  // Database query observation - SELECT
  observations.push(await prisma.runtimeCapabilityObservation.create({
    data: {
      workspaceId: WORKSPACE_ID,
      serviceName: 'user-service',
      source: 'database_query_log',
      eventId: 'db-query-1',
      eventTime: new Date(),
      capability: 'db_read',
      resourceArn: 'postgresql://production/users',
      principalId: 'app_user',
      action: 'SELECT',
      metadata: {
        query: 'SELECT * FROM users WHERE id = $1',
        table: 'users',
        duration: 15.5,
      },
    },
  }));
  
  // Database query observation - INSERT
  observations.push(await prisma.runtimeCapabilityObservation.create({
    data: {
      workspaceId: WORKSPACE_ID,
      serviceName: 'user-service',
      source: 'database_query_log',
      eventId: 'db-query-2',
      eventTime: new Date(),
      capability: 'db_write',
      resourceArn: 'postgresql://production/users',
      principalId: 'app_user',
      action: 'INSERT',
      metadata: {
        query: 'INSERT INTO users (name, email) VALUES ($1, $2)',
        table: 'users',
        duration: 8.2,
      },
    },
  }));
  
  // Database query observation - DELETE
  observations.push(await prisma.runtimeCapabilityObservation.create({
    data: {
      workspaceId: WORKSPACE_ID,
      serviceName: 'user-service',
      source: 'database_query_log',
      eventId: 'db-query-3',
      eventTime: new Date(),
      capability: 'db_delete',
      resourceArn: 'postgresql://production/users',
      principalId: 'app_user',
      action: 'DELETE',
      metadata: {
        query: 'DELETE FROM users WHERE id = $1',
        table: 'users',
        duration: 12.1,
      },
    },
  }));
  
  console.log(`✅ Created ${observations.length} runtime observations`);
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

