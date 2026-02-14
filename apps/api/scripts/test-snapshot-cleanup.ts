// Test script for artifact snapshot TTL cleanup
// Phase 1 Week 3-4: Verify cleanup logic

import { prisma } from '../src/lib/db.js';
import { cleanupExpiredSnapshots, getSnapshotRetentionStats } from '../src/services/contracts/snapshotCleanup.js';

async function testSnapshotCleanup() {
  console.log('=== Artifact Snapshot TTL Cleanup Test ===\n');

  const workspaceId = 'test-workspace-cleanup';

  try {
    // Step 1: Clean up any existing test data
    console.log('Step 1: Cleaning up existing test data...');
    await prisma.artifactSnapshot.deleteMany({
      where: { workspaceId },
    });
    console.log('✅ Existing test data cleaned\n');

    // Step 2: Create test snapshots with different TTLs
    console.log('Step 2: Creating test snapshots...');
    
    const now = new Date();
    
    // Create snapshots with different ages and TTLs
    const testSnapshots = [
      // Expired: created 40 days ago, TTL 30 days (expired 10 days ago)
      {
        createdAt: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000),
        ttlDays: 30,
        contractId: 'contract-1',
        artifactType: 'openapi',
        shouldExpire: true,
      },
      // Expired: created 10 days ago, TTL 7 days (expired 3 days ago)
      {
        createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        ttlDays: 7,
        contractId: 'contract-2',
        artifactType: 'confluence_page',
        shouldExpire: true,
      },
      // Valid: created 5 days ago, TTL 30 days (expires in 25 days)
      {
        createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        ttlDays: 30,
        contractId: 'contract-3',
        artifactType: 'grafana_dashboard',
        shouldExpire: false,
      },
      // Valid: created 1 day ago, TTL 7 days (expires in 6 days)
      {
        createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        ttlDays: 7,
        contractId: 'contract-4',
        artifactType: 'openapi',
        shouldExpire: false,
      },
    ];

    for (const snapshot of testSnapshots) {
      await prisma.artifactSnapshot.create({
        data: {
          workspaceId,
          contractId: snapshot.contractId,
          artifactType: snapshot.artifactType,
          artifactRef: {
            system: 'github',
            type: snapshot.artifactType,
            locator: { repo: 'test/repo', path: 'test.yaml' },
            role: 'primary',
          },
          version: {
            type: 'git_sha',
            value: 'test-sha',
            capturedAt: snapshot.createdAt.toISOString(),
          },
          extract: { test: 'data' },
          extractSchema: 'v1',
          triggeredBy: { signalEventId: 'test-signal' },
          ttlDays: snapshot.ttlDays,
          compressed: false,
          sizeBytes: 100,
          createdAt: snapshot.createdAt,
        },
      });
      
      const status = snapshot.shouldExpire ? '❌ EXPIRED' : '✅ VALID';
      console.log(`  ${status} - ${snapshot.artifactType} (TTL: ${snapshot.ttlDays} days, age: ${Math.floor((now.getTime() - snapshot.createdAt.getTime()) / (24 * 60 * 60 * 1000))} days)`);
    }
    
    console.log(`\n✅ Created ${testSnapshots.length} test snapshots\n`);

    // Step 3: Get retention stats before cleanup
    console.log('Step 3: Getting retention stats before cleanup...');
    const statsBefore = await getSnapshotRetentionStats(workspaceId);
    console.log('📊 Stats before cleanup:');
    console.log(`  Total snapshots: ${statsBefore.totalSnapshots}`);
    console.log(`  Expired snapshots: ${statsBefore.expiredSnapshots}`);
    console.log(`  Snapshots by TTL:`, statsBefore.snapshotsByTTL);
    console.log('');

    // Step 4: Run cleanup
    console.log('Step 4: Running cleanup...');
    const cleanupStats = await cleanupExpiredSnapshots(workspaceId);
    console.log('🧹 Cleanup results:');
    console.log(`  Total snapshots: ${cleanupStats.totalSnapshots}`);
    console.log(`  Expired snapshots found: ${cleanupStats.expiredSnapshots}`);
    console.log(`  Snapshots deleted: ${cleanupStats.deletedSnapshots}`);
    console.log(`  Cleanup time: ${cleanupStats.cleanupTimeMs}ms`);
    console.log('');

    // Step 5: Get retention stats after cleanup
    console.log('Step 5: Getting retention stats after cleanup...');
    const statsAfter = await getSnapshotRetentionStats(workspaceId);
    console.log('📊 Stats after cleanup:');
    console.log(`  Total snapshots: ${statsAfter.totalSnapshots}`);
    console.log(`  Expired snapshots: ${statsAfter.expiredSnapshots}`);
    console.log(`  Snapshots by TTL:`, statsAfter.snapshotsByTTL);
    console.log('');

    // Step 6: Verify results
    console.log('Step 6: Verifying results...');
    const expectedExpired = testSnapshots.filter(s => s.shouldExpire).length;
    const expectedRemaining = testSnapshots.filter(s => !s.shouldExpire).length;
    
    if (cleanupStats.deletedSnapshots === expectedExpired && statsAfter.totalSnapshots === expectedRemaining) {
      console.log('✅ Cleanup worked correctly!');
      console.log(`   - Deleted ${cleanupStats.deletedSnapshots} expired snapshots (expected: ${expectedExpired})`);
      console.log(`   - Remaining ${statsAfter.totalSnapshots} valid snapshots (expected: ${expectedRemaining})`);
    } else {
      console.log('❌ Cleanup results unexpected!');
      console.log(`   - Deleted: ${cleanupStats.deletedSnapshots} (expected: ${expectedExpired})`);
      console.log(`   - Remaining: ${statsAfter.totalSnapshots} (expected: ${expectedRemaining})`);
    }

    // Step 7: Clean up test data
    console.log('\nStep 7: Cleaning up test data...');
    await prisma.artifactSnapshot.deleteMany({
      where: { workspaceId },
    });
    console.log('✅ Test data cleaned up\n');

    console.log('=== Test Complete ===');
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testSnapshotCleanup();

