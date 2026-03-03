-- AlterTable: Add materiality_tier to drift_clusters (ATC Mode — Phase 0)
-- materialityTier: 'critical' | 'operational' | 'petty'
-- Determines alert routing: critical → PagerDuty + GitHub + Slack
--                           operational → Slack only
--                           petty → silent log (no developer interruption)
ALTER TABLE "drift_clusters"
  ADD COLUMN IF NOT EXISTS "materiality_tier" TEXT;
