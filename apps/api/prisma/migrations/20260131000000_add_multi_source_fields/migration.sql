-- Add Multi-Source Architecture Fields (Phase 1)
-- This migration adds fields to support multiple input and output sources for drift detection
-- See: MULTI_SOURCE_IMPLEMENTATION_PLAN.md

-- ============================================================================
-- SignalEvent: Add fields for incident-based and Slack-based signals
-- ============================================================================

-- For PagerDuty incident-based signals (Phase 3)
ALTER TABLE "signal_events" ADD COLUMN IF NOT EXISTS "incident_id" TEXT;
ALTER TABLE "signal_events" ADD COLUMN IF NOT EXISTS "incident_url" TEXT;
ALTER TABLE "signal_events" ADD COLUMN IF NOT EXISTS "responders" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- For Slack message clustering signals (Phase 4)
ALTER TABLE "signal_events" ADD COLUMN IF NOT EXISTS "slack_cluster_id" TEXT;
ALTER TABLE "signal_events" ADD COLUMN IF NOT EXISTS "message_count" INTEGER;

-- ============================================================================
-- DocMappingV2: Add fields for multi-source documentation
-- ============================================================================

-- Documentation category for drift type routing
-- 'functional' = Confluence/Notion runbooks, procedures
-- 'developer' = GitHub README, Swagger/OpenAPI, code docs
-- 'operational' = Backstage service catalog, dashboards
ALTER TABLE "doc_mappings_v2" ADD COLUMN IF NOT EXISTS "doc_category" TEXT;

-- File path for GitHub-based documentation (e.g., "README.md", "docs/api.yaml")
ALTER TABLE "doc_mappings_v2" ADD COLUMN IF NOT EXISTS "file_path" TEXT;

-- Drift type affinity - which drift types this doc is relevant for
-- e.g., ['instruction', 'environment'] for a README
ALTER TABLE "doc_mappings_v2" ADD COLUMN IF NOT EXISTS "drift_type_affinity" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Additional fields from spec that might be missing
ALTER TABLE "doc_mappings_v2" ADD COLUMN IF NOT EXISTS "space_key" TEXT;
ALTER TABLE "doc_mappings_v2" ADD COLUMN IF NOT EXISTS "doc_class" TEXT;
ALTER TABLE "doc_mappings_v2" ADD COLUMN IF NOT EXISTS "allow_writeback" BOOLEAN DEFAULT true;

-- ============================================================================
-- Indexes for efficient querying
-- ============================================================================

-- Index for category-based doc resolution
CREATE INDEX IF NOT EXISTS "doc_mappings_v2_workspace_id_doc_category_idx" 
ON "doc_mappings_v2"("workspace_id", "doc_category");

-- Index for incident signals lookup
CREATE INDEX IF NOT EXISTS "signal_events_workspace_id_incident_id_idx" 
ON "signal_events"("workspace_id", "incident_id") 
WHERE "incident_id" IS NOT NULL;

-- Index for Slack cluster signals lookup
CREATE INDEX IF NOT EXISTS "signal_events_workspace_id_slack_cluster_id_idx"
ON "signal_events"("workspace_id", "slack_cluster_id")
WHERE "slack_cluster_id" IS NOT NULL;

-- ============================================================================
-- Workspace: Add workflow preferences (Phase 5)
-- ============================================================================

-- JSON structure: { enabledDriftTypes: string[], enabledInputSources: string[], enabledOutputTargets: string[], outputTargetPriority: string[] }
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "workflow_preferences" JSONB DEFAULT '{}';
