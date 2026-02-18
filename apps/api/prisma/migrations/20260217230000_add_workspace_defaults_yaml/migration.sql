-- Add workspace_defaults_yaml field to Workspace table
-- Migration Plan v5.0 - Sprint 3

-- Check if column already exists, if not add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'workspaces'
        AND column_name = 'workspace_defaults_yaml'
    ) THEN
        ALTER TABLE "workspaces" ADD COLUMN "workspace_defaults_yaml" TEXT;
    END IF;
END $$;

