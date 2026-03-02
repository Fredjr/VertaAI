/**
 * Runtime Observation Webhook Routes
 *
 * Aggregates all runtime observation webhook endpoints:
 * - AWS CloudTrail
 * - GCP Audit Log
 * - Database Query Log
 * - Runtime Drift Monitor (Track B scheduled job)
 *
 * These endpoints enable Spec→Run verification by ingesting
 * actual capability usage from production systems.
 */

import { Router } from 'express';
import cloudtrailRouter from './cloudtrail.js';
import gcpAuditRouter from './gcpAudit.js';
import databaseQueryLogRouter from './databaseQueryLog.js';
import driftMonitorRouter from './driftMonitor.js';
import setupRouter from './setup.js';

const router = Router();

// Mount runtime observation webhooks
router.use('/cloudtrail', cloudtrailRouter);
router.use('/gcp-audit', gcpAuditRouter);
router.use('/database-query-log', databaseQueryLogRouter);

// Mount Track B drift monitor (scheduled job endpoint)
router.use('/drift-monitor', driftMonitorRouter);

// Mount setup endpoints (infrastructure-as-code generation)
router.use('/setup', setupRouter);

// Health check for all runtime webhooks
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Runtime observation webhooks are healthy',
    endpoints: {
      cloudtrail: '/api/runtime/cloudtrail',
      gcpAudit: '/api/runtime/gcp-audit',
      databaseQueryLog: '/api/runtime/database-query-log',
      driftMonitor: '/api/runtime/drift-monitor',
      setup: {
        testConnection: '/api/runtime/setup/test-connection',
        status: '/api/runtime/setup/status/:workspaceId',
        instructions: '/api/runtime/setup/instructions/:source',
        terraformCloudTrail: '/api/runtime/setup/terraform/cloudtrail',
        cloudFormationCloudTrail: '/api/runtime/setup/cloudformation/cloudtrail',
        terraformGcpAudit: '/api/runtime/setup/terraform/gcp-audit',
      },
    },
  });
});

export default router;

