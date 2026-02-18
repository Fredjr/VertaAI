-- CreateEnum
CREATE TYPE "PackStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'ACTIVE', 'DEPRECATED', 'ARCHIVED');

-- AlterTable: workspace_policy_packs
-- 1. Change status column from String to PackStatus enum
ALTER TABLE "workspace_policy_packs" 
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "PackStatus" USING (
    CASE 
      WHEN "status" = 'draft' THEN 'DRAFT'::"PackStatus"
      WHEN "status" = 'active' THEN 'ACTIVE'::"PackStatus"
      WHEN "status" = 'archived' THEN 'ARCHIVED'::"PackStatus"
      ELSE 'DRAFT'::"PackStatus"
    END
  ),
  ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"PackStatus";

-- 2. Add new metadata fields
ALTER TABLE "workspace_policy_packs"
  ADD COLUMN IF NOT EXISTS "owners" JSONB,
  ADD COLUMN IF NOT EXISTS "labels" JSONB,
  ADD COLUMN IF NOT EXISTS "version_notes" TEXT;

-- 3. Add audit trail fields (if they don't exist from duplicate removal)
ALTER TABLE "workspace_policy_packs"
  ADD COLUMN IF NOT EXISTS "created_by" TEXT,
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updated_by" TEXT;

-- 4. Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_workspace_policy_packs_updated_at ON "workspace_policy_packs";

CREATE TRIGGER update_workspace_policy_packs_updated_at
    BEFORE UPDATE ON "workspace_policy_packs"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

