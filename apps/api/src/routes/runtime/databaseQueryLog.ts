/**
 * Database Query Log Streaming Endpoint
 * 
 * Receives database query logs and ingests them as runtime capability observations.
 * 
 * ARCHITECTURE:
 * - Accepts query logs from various database systems (PostgreSQL, MySQL, MongoDB, etc.)
 * - Maps database operations to capability types (db_read, db_write, db_admin)
 * - Stores observations in database
 * - Returns 200 OK to acknowledge receipt
 * 
 * USAGE:
 * POST /api/runtime/database-query-log
 * Body: Database query log entry
 */

import { Router } from 'express';
import { z } from 'zod';
import { ingestDatabaseQuery } from '../../services/runtime/observationIngestion.js';

const router = Router();

/**
 * Database query log entry schema
 */
const DatabaseQueryLogSchema = z.object({
  workspaceId: z.string(),
  service: z.string(), // Service name (e.g., "user-service", "payment-service")
  database: z.string(), // Database name
  operation: z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'GRANT', 'REVOKE']),
  table: z.string().optional(), // Table name
  query: z.string().optional(), // Full query (optional, for debugging)
  user: z.string().optional(), // Database user
  timestamp: z.string(), // ISO 8601 timestamp
  duration_ms: z.number().optional(), // Query duration in milliseconds
  rows_affected: z.number().optional(), // Number of rows affected
  metadata: z.record(z.any()).optional(), // Additional metadata
});

/**
 * POST /api/runtime/database-query-log
 * Ingest database query log entry
 */
router.post('/', async (req, res) => {
  try {
    console.log('[Database Query Log Webhook] Received event');

    // Parse query log entry
    const queryLog = DatabaseQueryLogSchema.parse(req.body);

    console.log(`[Database Query Log Webhook] Processing query for workspace: ${queryLog.workspaceId}`);

    // Ingest database query
    const observation = await ingestDatabaseQuery(queryLog.workspaceId, queryLog);

    console.log(`[Database Query Log Webhook] Ingested observation: ${observation.id}`);

    res.status(200).json({
      success: true,
      message: 'Database query log entry ingested successfully',
      observationId: observation.id,
    });
  } catch (error: any) {
    console.error('[Database Query Log Webhook] Error:', error.message);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/runtime/database-query-log/batch
 * Ingest multiple database query log entries in a single request
 */
router.post('/batch', async (req, res) => {
  try {
    console.log('[Database Query Log Webhook] Received batch event');

    const { workspaceId, entries } = req.body;

    if (!workspaceId || !Array.isArray(entries)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: workspaceId and entries array required',
      });
    }

    console.log(`[Database Query Log Webhook] Processing ${entries.length} entries for workspace: ${workspaceId}`);

    const results = [];

    for (const entry of entries) {
      try {
        const queryLog = DatabaseQueryLogSchema.parse({ ...entry, workspaceId });
        const observation = await ingestDatabaseQuery(workspaceId, queryLog);
        results.push({ success: true, observationId: observation.id });
      } catch (error: any) {
        console.error('[Database Query Log Webhook] Error ingesting entry:', error.message);
        results.push({ success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[Database Query Log Webhook] Ingested ${successCount}/${entries.length} entries`);

    res.status(200).json({
      success: true,
      message: `Ingested ${successCount}/${entries.length} database query log entries`,
      results,
    });
  } catch (error: any) {
    console.error('[Database Query Log Webhook] Batch error:', error.message);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/runtime/database-query-log/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Database query log webhook is healthy',
  });
});

export default router;

