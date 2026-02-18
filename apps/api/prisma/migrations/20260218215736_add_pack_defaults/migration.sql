-- AlterTable: workspace_policy_packs
-- Add pack-level defaults field
ALTER TABLE "workspace_policy_packs"
  ADD COLUMN IF NOT EXISTS "defaults" JSONB;

-- Add comment for documentation
COMMENT ON COLUMN "workspace_policy_packs"."defaults" IS 'Pack-level default values for rules (timeouts, severity, approval requirements, etc.)';

