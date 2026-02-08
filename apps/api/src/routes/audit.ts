// Audit Trail API Routes
// Phase 4 Week 8: REST endpoints for audit logs and compliance reporting

import { Router, type Request, type Response } from 'express';
import {
  queryAuditLogs,
  getEntityAuditTrail,
  getDriftStateHistory,
  generateComplianceReport,
  exportComplianceReportToCSV,
  applyRetentionPolicy,
  getRetentionPolicy,
  applyEvidenceBundleRetention,
  getEvidenceBundleRetentionStats,
} from '../services/audit/index.js';

const router: Router = Router();

/**
 * GET /api/audit/logs
 * Query audit logs with filtering and pagination
 */
router.get('/logs', async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const options = {
      workspaceId,
      entityType: req.query.entityType as any,
      entityId: req.query.entityId as string,
      eventType: req.query.eventType as any,
      category: req.query.category as any,
      severity: req.query.severity as any,
      actorId: req.query.actorId as string,
      startTime: req.query.startTime ? new Date(req.query.startTime as string) : undefined,
      endTime: req.query.endTime ? new Date(req.query.endTime as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      sortBy: (req.query.sortBy as any) || 'timestamp',
      sortOrder: (req.query.sortOrder as any) || 'desc',
    };

    const result = await queryAuditLogs(options);
    res.json(result);
  } catch (error: any) {
    console.error('[Audit API] Error querying logs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/audit/entity/:entityType/:entityId
 * Get complete audit trail for a specific entity
 */
router.get('/entity/:entityType/:entityId', async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    const { entityType, entityId } = req.params;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const logs = await getEntityAuditTrail(workspaceId, entityType, entityId);
    res.json({ logs, total: logs.length });
  } catch (error: any) {
    console.error('[Audit API] Error getting entity trail:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/audit/drift/:driftId/history
 * Get state transition history for a drift candidate
 */
router.get('/drift/:driftId/history', async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    const { driftId } = req.params;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const logs = await getDriftStateHistory(workspaceId, driftId);
    res.json({ logs, total: logs.length });
  } catch (error: any) {
    console.error('[Audit API] Error getting drift history:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/audit/compliance/report
 * Generate a compliance report
 */
router.post('/compliance/report', async (req, res) => {
  try {
    const { workspaceId, reportType, startDate, endDate, generatedBy } = req.body;
    
    if (!workspaceId || !reportType || !startDate || !endDate || !generatedBy) {
      return res.status(400).json({ 
        error: 'workspaceId, reportType, startDate, endDate, and generatedBy are required' 
      });
    }

    const report = await generateComplianceReport(
      workspaceId,
      reportType,
      new Date(startDate),
      new Date(endDate),
      generatedBy
    );

    res.json(report);
  } catch (error: any) {
    console.error('[Audit API] Error generating compliance report:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/audit/compliance/report/export
 * Export compliance report to CSV
 */
router.post('/compliance/report/export', async (req, res) => {
  try {
    const { workspaceId, reportType, startDate, endDate, generatedBy } = req.body;
    
    if (!workspaceId || !reportType || !startDate || !endDate || !generatedBy) {
      return res.status(400).json({ 
        error: 'workspaceId, reportType, startDate, endDate, and generatedBy are required' 
      });
    }

    const report = await generateComplianceReport(
      workspaceId,
      reportType,
      new Date(startDate),
      new Date(endDate),
      generatedBy
    );

    const csv = exportComplianceReportToCSV(report);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="compliance-report-${reportType}-${Date.now()}.csv"`);
    res.send(csv);
  } catch (error: any) {
    console.error('[Audit API] Error exporting compliance report:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/audit/retention/apply
 * Apply retention policy (delete expired logs)
 */
router.post('/retention/apply', async (req, res) => {
  try {
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const deletedCount = await applyRetentionPolicy(workspaceId);
    res.json({ deletedCount, message: `Deleted ${deletedCount} expired audit logs` });
  } catch (error: any) {
    console.error('[Audit API] Error applying retention policy:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/audit/retention/policy
 * Get retention policy for workspace
 */
router.get('/retention/policy', async (req, res) => {
  try {
    const { workspaceId } = req.query;

    if (!workspaceId || typeof workspaceId !== 'string') {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const policy = await getRetentionPolicy(workspaceId);
    res.json(policy);
  } catch (error: any) {
    console.error('[Audit API] Error fetching retention policy:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/audit/retention/evidence-bundles/apply
 * Apply evidence bundle retention policy
 */
router.post('/retention/evidence-bundles/apply', async (req, res) => {
  try {
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const deletedCount = await applyEvidenceBundleRetention(workspaceId);
    res.json({
      success: true,
      deletedCount,
      message: `Cleared ${deletedCount} expired evidence bundles`,
    });
  } catch (error: any) {
    console.error('[Audit API] Error applying evidence bundle retention:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/audit/retention/evidence-bundles/stats
 * Get evidence bundle retention statistics
 */
router.get('/retention/evidence-bundles/stats', async (req, res) => {
  try {
    const { workspaceId } = req.query;

    if (!workspaceId || typeof workspaceId !== 'string') {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const stats = await getEvidenceBundleRetentionStats(workspaceId);
    res.json(stats);
  } catch (error: any) {
    console.error('[Audit API] Error fetching evidence bundle retention stats:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

