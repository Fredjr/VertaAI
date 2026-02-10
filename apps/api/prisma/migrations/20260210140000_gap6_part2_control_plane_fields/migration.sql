-- Gap #6 Part 2: Add Missing Control-Plane Fields to DriftPlan
-- Adds: docTargeting, sourceCursors, budgets, noiseControls

-- Add new control-plane fields to drift_plans table
ALTER TABLE "drift_plans" 
  ADD COLUMN IF NOT EXISTS "doc_targeting" JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "source_cursors" JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "budgets" JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "noise_controls" JSONB DEFAULT '{}';

-- Update existing plans with default values
UPDATE "drift_plans"
SET 
  "doc_targeting" = '{"strategy": "primary_first", "maxDocsPerDrift": 3}'::jsonb,
  "source_cursors" = '{}'::jsonb,
  "budgets" = '{"maxDriftsPerDay": 50, "maxDriftsPerWeek": 200, "maxSlackNotificationsPerHour": 5}'::jsonb,
  "noise_controls" = '{"ignorePatterns": [], "ignorePaths": [], "ignoreAuthors": []}'::jsonb
WHERE 
  "doc_targeting" = '{}'::jsonb OR "doc_targeting" IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN "drift_plans"."doc_targeting" IS 'Doc targeting strategy: which docs to update first, max docs per drift, priority order';
COMMENT ON COLUMN "drift_plans"."source_cursors" IS 'Track last processed signal per source type for incremental processing';
COMMENT ON COLUMN "drift_plans"."budgets" IS 'Budget limits: max drifts per day/week, max Slack notifications per hour';
COMMENT ON COLUMN "drift_plans"."noise_controls" IS 'Noise filtering: ignore patterns, paths, authors to reduce false positives';

