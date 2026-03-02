-- Migration: Add RuntimeCapabilityObservation model
-- Phase 2: Build→Run Verification - Runtime Capability Observation
-- Date: 2026-03-02

-- Create runtime_capability_observations table
CREATE TABLE IF NOT EXISTS runtime_capability_observations (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  service TEXT NOT NULL,
  capability_type TEXT NOT NULL,
  capability_target TEXT NOT NULL,
  observed_at TIMESTAMP NOT NULL,
  source TEXT NOT NULL,
  source_event_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_runtime_capability_observations_service_type_time 
  ON runtime_capability_observations(workspace_id, service, capability_type, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_capability_observations_time 
  ON runtime_capability_observations(workspace_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_capability_observations_service_time 
  ON runtime_capability_observations(workspace_id, service, observed_at DESC);

-- Add comment
COMMENT ON TABLE runtime_capability_observations IS 'Records actual capability usage in production for Spec→Run verification (Agent Governance Phase 2)';

