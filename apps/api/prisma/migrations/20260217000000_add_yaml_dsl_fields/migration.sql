-- AlterTable: Add YAML DSL fields to WorkspacePolicyPack
-- Migration Plan v5.0: YAML/DSL-Based Policy Pack Migration

-- Add new YAML fields for Track A
ALTER TABLE "workspace_policy_packs" 
ADD COLUMN IF NOT EXISTS "track_a_config_yaml_draft" TEXT,
ADD COLUMN IF NOT EXISTS "track_a_config_yaml_published" TEXT,
ADD COLUMN IF NOT EXISTS "track_a_pack_hash_published" TEXT,
ADD COLUMN IF NOT EXISTS "pack_status" TEXT DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "published_by" TEXT;

-- Add denormalized metadata fields for DB-level queries (Gap #2)
ALTER TABLE "workspace_policy_packs"
ADD COLUMN IF NOT EXISTS "pack_metadata_id" TEXT,
ADD COLUMN IF NOT EXISTS "pack_metadata_version" TEXT,
ADD COLUMN IF NOT EXISTS "pack_metadata_name" TEXT;

-- Make trackAConfig nullable (legacy field, now optional)
ALTER TABLE "workspace_policy_packs"
ALTER COLUMN "track_a_config" DROP NOT NULL,
ALTER COLUMN "track_a_config" DROP DEFAULT;

-- Add indexes for pack selection and uniqueness checks
CREATE INDEX IF NOT EXISTS "workspace_policy_packs_scope_type_scope_ref_idx" 
ON "workspace_policy_packs"("scopeType", "scope_ref");

CREATE INDEX IF NOT EXISTS "workspace_policy_packs_pack_metadata_id_pack_metadata_version_idx"
ON "workspace_policy_packs"("pack_metadata_id", "pack_metadata_version");

CREATE INDEX IF NOT EXISTS "workspace_policy_packs_pack_status_idx"
ON "workspace_policy_packs"("pack_status");

-- Add unique constraint for pack name at scope level
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_policy_packs_workspace_id_scope_type_scope_ref_name_key"
ON "workspace_policy_packs"("workspace_id", "scopeType", "scope_ref", "name");

-- Add unique constraint to prevent duplicate pack versions
-- Note: This will allow NULL values (drafts) but enforce uniqueness for published packs
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_policy_packs_workspace_id_scope_type_scope_ref_pack_metadata_id_pack_metadata_version_key"
ON "workspace_policy_packs"("workspace_id", "scopeType", "scope_ref", "pack_metadata_id", "pack_metadata_version")
WHERE "pack_metadata_id" IS NOT NULL AND "pack_metadata_version" IS NOT NULL;

