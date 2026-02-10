-- Gap #6: DriftPlan as True Control-Plane
-- Adds plan-specific thresholds, PlanRun tracking, and plan-driven routing

-- Step 1: Update Workspace defaults to match Phase 2 systematic fixes
-- Old: highConfidenceThreshold = 0.70, mediumConfidenceThreshold = 0.55
-- New: highConfidenceThreshold = 0.98, mediumConfidenceThreshold = 0.40
ALTER TABLE "workspaces" 
  ALTER COLUMN "high_confidence_threshold" SET DEFAULT 0.98,
  ALTER COLUMN "medium_confidence_threshold" SET DEFAULT 0.40;

-- Update existing workspaces to use new defaults
UPDATE "workspaces" 
SET 
  "high_confidence_threshold" = 0.98,
  "medium_confidence_threshold" = 0.40
WHERE 
  "high_confidence_threshold" = 0.70 
  AND "medium_confidence_threshold" = 0.55;

-- Step 2: Add plan tracking fields to DriftCandidate
ALTER TABLE "drift_candidates"
  ADD COLUMN "active_plan_id" TEXT,
  ADD COLUMN "active_plan_version" INTEGER,
  ADD COLUMN "active_plan_hash" TEXT;

-- Step 3: Create PlanRun table for execution tracking
CREATE TABLE "plan_runs" (
  "workspace_id" TEXT NOT NULL,
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "plan_id" TEXT NOT NULL,
  "plan_version" INTEGER NOT NULL,
  "plan_hash" TEXT NOT NULL,
  "drift_id" TEXT NOT NULL,
  "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "routing_action" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "thresholds_used" JSONB NOT NULL,

  CONSTRAINT "plan_runs_pkey" PRIMARY KEY ("workspace_id", "id")
);

-- Step 4: Add indexes for PlanRun
CREATE INDEX "plan_runs_workspace_id_plan_id_idx" ON "plan_runs"("workspace_id", "plan_id");
CREATE INDEX "plan_runs_workspace_id_drift_id_idx" ON "plan_runs"("workspace_id", "drift_id");
CREATE INDEX "plan_runs_workspace_id_executed_at_idx" ON "plan_runs"("workspace_id", "executed_at");
CREATE INDEX "plan_runs_workspace_id_routing_action_idx" ON "plan_runs"("workspace_id", "routing_action");

-- Step 5: Add foreign key constraints
ALTER TABLE "plan_runs" 
  ADD CONSTRAINT "plan_runs_workspace_id_fkey" 
  FOREIGN KEY ("workspace_id") 
  REFERENCES "workspaces"("id") 
  ON DELETE CASCADE 
  ON UPDATE CASCADE;

