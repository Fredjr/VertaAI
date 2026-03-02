/**
 * AWS Cost Explorer / Budget Alert Webhook Endpoint
 *
 * Receives cost anomaly and budget alert events and ingests them as
 * `cost_increase` runtime capability observations.
 *
 * ARCHITECTURE:
 * - Accepts Cost Anomaly Detection / AWS Budgets SNS notifications forwarded by a Lambda
 * - Maps to `cost_increase` capability type
 * - Stores observations in database for Spec→Run drift detection
 *
 * USAGE:
 * POST /api/runtime/cost-explorer
 * Body: CostExplorerEvent JSON
 *
 * SETUP:
 * 1. Create a Lambda that subscribes to AWS Budgets SNS topic
 * 2. Lambda forwards events to POST /api/runtime/cost-explorer?workspaceId=<id>
 */

import { Router } from 'express';
import { z } from 'zod';
import { ingestCostExplorerEvent } from '../../services/runtime/observationIngestion.js';
import type { CostExplorerEvent } from '../../services/runtime/capabilityMapper.js';

const router = Router();

/**
 * Cost Explorer event schema (from Lambda forwarder)
 */
const CostExplorerEventSchema = z.object({
  eventId: z.string(),
  timestamp: z.string(),
  awsService: z.string(),
  resourceId: z.string().optional(),
  currentSpend: z.number(),
  forecastedSpend: z.number().optional(),
  budgetLimit: z.number().optional(),
  anomalyScore: z.number().min(0).max(100).optional(),
  alertType: z.enum(['budget_exceeded', 'anomaly_detected', 'spike', 'forecast_exceeded']),
  tags: z.record(z.string()).optional(),
});

/**
 * POST /api/runtime/cost-explorer
 * Ingest a Cost Explorer budget alert or anomaly detection event.
 * workspaceId is taken from the query string (set by the Lambda forwarder).
 * service is taken from the request body tags['vertaai:service'] or query string.
 */
router.post('/', async (req, res) => {
  try {
    console.log('[CostExplorer Webhook] Received event');

    // Zod validates all required fields at runtime; cast to the interface for downstream typing
    const event = CostExplorerEventSchema.parse(req.body) as CostExplorerEvent;

    // Workspace ID: query param set by forwarder, or a default
    const workspaceId = (req.query.workspaceId as string | undefined) || 'default-workspace';

    // Service attribution: prefer vertaai:service tag, then query param, then AWS service name
    const service = event.tags?.['vertaai:service']
      || (req.query.service as string | undefined)
      || event.awsService.toLowerCase().replace(/\s+/g, '-');

    console.log(`[CostExplorer Webhook] Processing ${event.alertType} event for workspace: ${workspaceId}, service: ${service}`);

    const observationId = await ingestCostExplorerEvent(workspaceId, service, event);

    if (observationId) {
      res.status(200).json({
        success: true,
        message: `Cost Explorer event ingested as cost_increase observation`,
        observationId,
      });
    } else {
      res.status(200).json({
        success: true,
        message: 'Event already ingested (duplicate)',
      });
    }
  } catch (error: any) {
    console.error('[CostExplorer Webhook] Error:', error.message);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;

