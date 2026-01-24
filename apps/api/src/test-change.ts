/**
 * Test file for drift detection
 *
 * This file tests the new deployment process for the API.
 *
 * ## Deployment Changes
 * - Added new Railway configuration
 * - Updated environment variables handling
 * - Changed health check endpoint path from /ping to /health
 *
 * ## Configuration Updates
 * - DATABASE_URL now uses connection pooling
 * - SLACK_BOT_TOKEN format has changed
 */

export const TEST_DEPLOYMENT_FLAG = true;
export const HEALTH_CHECK_PATH = '/health';
export const NEW_CONFIG_VERSION = '2.0.0';
