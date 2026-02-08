-- Migration: Add Performance Indexes for Evidence Bundle Queries
-- Phase 3 Week 7 Days 34-35: Database query optimization
-- Date: 2026-02-08

-- Add indexes for evidence bundle queries
-- These indexes improve performance for common query patterns

-- Index for querying evidence bundles by workspace and impact band
CREATE INDEX IF NOT EXISTS "drift_candidates_workspace_impact_idx" 
ON "drift_candidates"("workspace_id", "impact_band") 
WHERE "evidence_bundle" IS NOT NULL;

-- Index for querying evidence bundles by workspace and state
CREATE INDEX IF NOT EXISTS "drift_candidates_workspace_state_evidence_idx" 
ON "drift_candidates"("workspace_id", "state") 
WHERE "evidence_bundle" IS NOT NULL;

-- Index for querying evidence bundles by fingerprints (for suppression checks)
CREATE INDEX IF NOT EXISTS "drift_candidates_fingerprint_strict_idx" 
ON "drift_candidates"("workspace_id", "fingerprint_strict") 
WHERE "fingerprint_strict" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "drift_candidates_fingerprint_medium_idx" 
ON "drift_candidates"("workspace_id", "fingerprint_medium") 
WHERE "fingerprint_medium" IS NOT NULL;

-- Index for querying by impact score (for analytics)
CREATE INDEX IF NOT EXISTS "drift_candidates_impact_score_idx" 
ON "drift_candidates"("workspace_id", "impact_score" DESC) 
WHERE "impact_score" IS NOT NULL;

-- Index for querying by impact assessed timestamp
CREATE INDEX IF NOT EXISTS "drift_candidates_impact_assessed_idx" 
ON "drift_candidates"("workspace_id", "impact_assessed_at" DESC) 
WHERE "impact_assessed_at" IS NOT NULL;

-- Index for patch proposals by drift ID (for faster lookups)
CREATE INDEX IF NOT EXISTS "patch_proposals_drift_idx" 
ON "patch_proposals"("workspace_id", "drift_id", "created_at" DESC);

-- Index for signal events by source type and timestamp (for analytics)
CREATE INDEX IF NOT EXISTS "signal_events_source_type_idx" 
ON "signal_events"("workspace_id", "source_type", "created_at" DESC);

-- Index for drift candidates by drift type and state (for filtering)
CREATE INDEX IF NOT EXISTS "drift_candidates_type_state_idx" 
ON "drift_candidates"("workspace_id", "drift_type", "state");

-- Add comments for documentation
COMMENT ON INDEX "drift_candidates_workspace_impact_idx" IS 'Optimizes queries filtering by workspace and impact band';
COMMENT ON INDEX "drift_candidates_workspace_state_evidence_idx" IS 'Optimizes queries filtering by workspace and state with evidence bundles';
COMMENT ON INDEX "drift_candidates_fingerprint_strict_idx" IS 'Optimizes suppression checks using strict fingerprints';
COMMENT ON INDEX "drift_candidates_fingerprint_medium_idx" IS 'Optimizes suppression checks using medium fingerprints';
COMMENT ON INDEX "drift_candidates_impact_score_idx" IS 'Optimizes queries sorting by impact score';
COMMENT ON INDEX "drift_candidates_impact_assessed_idx" IS 'Optimizes queries filtering by impact assessment time';
COMMENT ON INDEX "patch_proposals_drift_idx" IS 'Optimizes patch proposal lookups by drift ID';
COMMENT ON INDEX "signal_events_source_type_idx" IS 'Optimizes signal event queries by source type';
COMMENT ON INDEX "drift_candidates_type_state_idx" IS 'Optimizes queries filtering by drift type and state';

