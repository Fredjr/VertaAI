-- CreateEnum
CREATE TYPE "MergeStrategy" AS ENUM ('MOST_RESTRICTIVE', 'HIGHEST_PRIORITY', 'EXPLICIT');

-- AlterTable: workspace_policy_packs
-- Add scope precedence fields
ALTER TABLE "workspace_policy_packs"
  ADD COLUMN IF NOT EXISTS "scope_priority" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "scope_merge_strategy" "MergeStrategy" DEFAULT 'MOST_RESTRICTIVE';

-- Create index for priority-based queries
CREATE INDEX IF NOT EXISTS "workspace_policy_packs_scope_priority_idx" 
  ON "workspace_policy_packs"("workspace_id", "scope_priority" DESC);

-- Create index for active packs with priority
CREATE INDEX IF NOT EXISTS "workspace_policy_packs_active_priority_idx" 
  ON "workspace_policy_packs"("workspace_id", "status", "scope_priority" DESC)
  WHERE "status" = 'ACTIVE';

