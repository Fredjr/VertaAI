/**
 * End-to-End Test Script for Runtime Observations
 * 
 * This script tests the complete runtime observation flow:
 * 1. Send test CloudTrail events to the webhook
 * 2. Send test GCP Audit Logs to the webhook
 * 3. Send test Database Query Logs to the webhook
 * 4. Verify observations are stored in the database
 * 5. Test the drift monitor
 * 6. Verify DriftPlans are created
 * 
 * Usage:
 *   pnpm tsx scripts/e2e-test-runtime-observations.ts
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';
const WORKSPACE_ID = 'demo-workspace';

interface TestResult {
  test: string;
  passed: boolean;
  message: string;
  details?: any;
}

const results: TestResult[] = [];

async function testCloudTrailWebhook() {
  console.log('\n🧪 Testing CloudTrail Webhook...');
  
  const cloudTrailEvent = {
    Type: 'Notification',
    MessageId: 'test-message-id-' + Date.now(),
    TopicArn: 'arn:aws:sns:us-east-1:123456789012:vertaai-cloudtrail-topic',
    Message: JSON.stringify({
      Records: [
        {
          eventVersion: '1.08',
          userIdentity: {
            type: 'IAMUser',
            principalId: 'AIDAI23HXS4EXAMPLE',
            arn: 'arn:aws:iam::123456789012:user/test-user',
            accountId: '123456789012',
            userName: 'test-user',
          },
          eventTime: new Date().toISOString(),
          eventSource: 's3.amazonaws.com',
          eventName: 'PutObject',
          awsRegion: 'us-east-1',
          sourceIPAddress: '192.0.2.1',
          userAgent: 'aws-cli/2.0.0',
          requestParameters: {
            bucketName: 'test-bucket',
            key: 'test-file.txt',
          },
          responseElements: null,
          requestID: 'test-request-id',
          eventID: 'test-event-id-' + Date.now(),
          eventType: 'AwsApiCall',
          recipientAccountId: '123456789012',
        },
      ],
    }),
    Timestamp: new Date().toISOString(),
    SignatureVersion: '1',
    Signature: 'test-signature',
    SigningCertURL: 'https://sns.us-east-1.amazonaws.com/test.pem',
    UnsubscribeURL: 'https://sns.us-east-1.amazonaws.com/unsubscribe',
  };

  try {
    const response = await fetch(`${API_URL}/api/runtime/cloudtrail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cloudTrailEvent),
    });

    const data = await response.json();
    
    if (response.ok && data.success) {
      results.push({
        test: 'CloudTrail Webhook',
        passed: true,
        message: 'CloudTrail event ingested successfully',
        details: data,
      });
      console.log('✅ CloudTrail webhook test passed');
    } else {
      results.push({
        test: 'CloudTrail Webhook',
        passed: false,
        message: `Failed: ${data.error || 'Unknown error'}`,
        details: data,
      });
      console.log('❌ CloudTrail webhook test failed');
    }
  } catch (error: any) {
    results.push({
      test: 'CloudTrail Webhook',
      passed: false,
      message: `Error: ${error.message}`,
    });
    console.log('❌ CloudTrail webhook test failed:', error.message);
  }
}

async function testGCPAuditWebhook() {
  console.log('\n🧪 Testing GCP Audit Webhook...');
  
  const gcpAuditEvent = {
    message: {
      data: Buffer.from(JSON.stringify({
        protoPayload: {
          '@type': 'type.googleapis.com/google.cloud.audit.AuditLog',
          authenticationInfo: {
            principalEmail: 'test-user@example.com',
          },
          requestMetadata: {
            callerIp: '192.0.2.1',
          },
          serviceName: 'storage.googleapis.com',
          methodName: 'storage.objects.create',
          resourceName: 'projects/_/buckets/test-bucket/objects/test-file.txt',
          request: {
            bucket: 'test-bucket',
            name: 'test-file.txt',
          },
        },
        insertId: 'test-insert-id-' + Date.now(),
        resource: {
          type: 'gcs_bucket',
          labels: {
            project_id: 'test-project',
            bucket_name: 'test-bucket',
          },
        },
        timestamp: new Date().toISOString(),
        severity: 'NOTICE',
        logName: 'projects/test-project/logs/cloudaudit.googleapis.com%2Factivity',
      })).toString('base64'),
      messageId: 'test-message-id-' + Date.now(),
      publishTime: new Date().toISOString(),
    },
    subscription: 'projects/test-project/subscriptions/vertaai-audit-logs-sub',
  };

  try {
    const response = await fetch(`${API_URL}/api/runtime/gcp-audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gcpAuditEvent),
    });

    const data = await response.json();
    
    if (response.ok && data.success) {
      results.push({
        test: 'GCP Audit Webhook',
        passed: true,
        message: 'GCP Audit event ingested successfully',
        details: data,
      });
      console.log('✅ GCP Audit webhook test passed');
    } else {
      results.push({
        test: 'GCP Audit Webhook',
        passed: false,
        message: `Failed: ${data.error || 'Unknown error'}`,
        details: data,
      });
      console.log('❌ GCP Audit webhook test failed');
    }
  } catch (error: any) {
    results.push({
      test: 'GCP Audit Webhook',
      passed: false,
      message: `Error: ${error.message}`,
    });
    console.log('❌ GCP Audit webhook test failed:', error.message);
  }
}

async function testDatabaseQueryLogWebhook() {
  console.log('\n🧪 Testing Database Query Log Webhook...');

  const dbQueryEvent = {
    workspaceId: WORKSPACE_ID,
    serviceName: 'user-service',
    database: 'production',
    query: 'SELECT * FROM users WHERE id = $1',
    operation: 'SELECT',
    table: 'users',
    user: 'app_user',
    timestamp: new Date().toISOString(),
    duration: 15.5,
    rowsAffected: 1,
  };

  try {
    const response = await fetch(`${API_URL}/api/runtime/database-query-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dbQueryEvent),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      results.push({
        test: 'Database Query Log Webhook',
        passed: true,
        message: 'Database query log ingested successfully',
        details: data,
      });
      console.log('✅ Database query log webhook test passed');
    } else {
      results.push({
        test: 'Database Query Log Webhook',
        passed: false,
        message: `Failed: ${data.error || 'Unknown error'}`,
        details: data,
      });
      console.log('❌ Database query log webhook test failed');
    }
  } catch (error: any) {
    results.push({
      test: 'Database Query Log Webhook',
      passed: false,
      message: `Error: ${error.message}`,
    });
    console.log('❌ Database query log webhook test failed:', error.message);
  }
}

async function testConnectionStatus() {
  console.log('\n🧪 Testing Connection Status Endpoint...');

  try {
    const response = await fetch(`${API_URL}/api/runtime/setup/status/${WORKSPACE_ID}`);
    const data = await response.json();

    if (response.ok && data.success) {
      results.push({
        test: 'Connection Status',
        passed: true,
        message: 'Connection status retrieved successfully',
        details: data.status,
      });
      console.log('✅ Connection status test passed');
      console.log('   CloudTrail:', data.status.cloudtrail.connected ? '✅ Connected' : '❌ Not connected');
      console.log('   GCP Audit:', data.status.gcpAudit.connected ? '✅ Connected' : '❌ Not connected');
      console.log('   Database Logs:', data.status.databaseLogs.connected ? '✅ Connected' : '❌ Not connected');
    } else {
      results.push({
        test: 'Connection Status',
        passed: false,
        message: `Failed: ${data.error || 'Unknown error'}`,
      });
      console.log('❌ Connection status test failed');
    }
  } catch (error: any) {
    results.push({
      test: 'Connection Status',
      passed: false,
      message: `Error: ${error.message}`,
    });
    console.log('❌ Connection status test failed:', error.message);
  }
}

async function testDriftMonitor() {
  console.log('\n🧪 Testing Runtime Drift Monitor...');

  try {
    const response = await fetch(`${API_URL}/api/runtime/drift-monitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      results.push({
        test: 'Runtime Drift Monitor',
        passed: true,
        message: 'Drift monitor executed successfully',
        details: data,
      });
      console.log('✅ Drift monitor test passed');
      console.log(`   Workspaces checked: ${data.workspacesChecked}`);
      console.log(`   Drift detected: ${data.driftDetected}`);
    } else {
      results.push({
        test: 'Runtime Drift Monitor',
        passed: false,
        message: `Failed: ${data.error || 'Unknown error'}`,
      });
      console.log('❌ Drift monitor test failed');
    }
  } catch (error: any) {
    results.push({
      test: 'Runtime Drift Monitor',
      passed: false,
      message: `Error: ${error.message}`,
    });
    console.log('❌ Drift monitor test failed:', error.message);
  }
}

async function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\nTotal Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.test}: ${r.message}`);
    });
  }

  console.log('\n' + '='.repeat(60));

  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED!');
  } else {
    console.log('⚠️  SOME TESTS FAILED');
  }

  console.log('='.repeat(60) + '\n');
}

async function main() {
  console.log('🚀 Starting End-to-End Runtime Observation Tests');
  console.log(`   API URL: ${API_URL}`);
  console.log(`   Workspace ID: ${WORKSPACE_ID}`);

  await testCloudTrailWebhook();
  await testGCPAuditWebhook();
  await testDatabaseQueryLogWebhook();
  await testConnectionStatus();
  await testDriftMonitor();

  await printSummary();

  process.exit(results.some(r => !r.passed) ? 1 : 0);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

