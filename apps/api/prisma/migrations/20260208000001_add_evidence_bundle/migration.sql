-- Migration: Add Evidence Bundle and Impact Assessment fields
-- Phase 1 of VertaAI transformation to control-plane + truth-making system
-- Date: 2026-02-08

-- Add Evidence Bundle fields to DriftCandidate
ALTER TABLE "drift_candidates" 
ADD COLUMN "evidence_bundle" JSONB,
ADD COLUMN "impact_score" DOUBLE PRECISION,
ADD COLUMN "impact_band" TEXT,
ADD COLUMN "impact_json" JSONB,
ADD COLUMN "consequence_text" TEXT,
ADD COLUMN "impact_assessed_at" TIMESTAMP(3),
ADD COLUMN "fingerprint_strict" TEXT,
ADD COLUMN "fingerprint_medium" TEXT,
ADD COLUMN "fingerprint_broad" TEXT;

-- Add indexes for performance
CREATE INDEX "drift_candidates_impact_band_idx" ON "drift_candidates"("workspace_id", "impact_band");
CREATE INDEX "drift_candidates_impact_score_idx" ON "drift_candidates"("workspace_id", "impact_score" DESC);
CREATE INDEX "drift_candidates_fingerprint_strict_idx" ON "drift_candidates"("workspace_id", "fingerprint_strict");
CREATE INDEX "drift_candidates_fingerprint_medium_idx" ON "drift_candidates"("workspace_id", "fingerprint_medium");
CREATE INDEX "drift_candidates_fingerprint_broad_idx" ON "drift_candidates"("workspace_id", "fingerprint_broad");

-- Add check constraints for data integrity
ALTER TABLE "drift_candidates" 
ADD CONSTRAINT "drift_candidates_impact_score_check" 
CHECK ("impact_score" IS NULL OR ("impact_score" >= 0 AND "impact_score" <= 1));

ALTER TABLE "drift_candidates" 
ADD CONSTRAINT "drift_candidates_impact_band_check" 
CHECK ("impact_band" IS NULL OR "impact_band" IN ('low', 'medium', 'high', 'critical'));

-- Create DriftSuppression table for suppression system
CREATE TABLE "drift_suppressions" (
    "workspace_id" TEXT NOT NULL,
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "fingerprint" TEXT NOT NULL,
    "fingerprint_level" TEXT NOT NULL CHECK ("fingerprint_level" IN ('strict', 'medium', 'broad')),
    "suppression_type" TEXT NOT NULL CHECK ("suppression_type" IN ('false_positive', 'snooze', 'permanent')),
    "reason" TEXT,
    "created_by" TEXT,
    "expires_at" TIMESTAMP(3),
    "false_positive_count" INTEGER NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drift_suppressions_pkey" PRIMARY KEY ("workspace_id", "id")
);

-- Add indexes for suppression lookups
CREATE INDEX "drift_suppressions_fingerprint_idx" ON "drift_suppressions"("workspace_id", "fingerprint");
CREATE INDEX "drift_suppressions_expires_at_idx" ON "drift_suppressions"("workspace_id", "expires_at");
CREATE UNIQUE INDEX "drift_suppressions_workspace_fingerprint_key" ON "drift_suppressions"("workspace_id", "fingerprint");

-- Add foreign key constraint
ALTER TABLE "drift_suppressions" 
ADD CONSTRAINT "drift_suppressions_workspace_id_fkey" 
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for drift_suppressions
CREATE TRIGGER update_drift_suppressions_updated_at 
    BEFORE UPDATE ON "drift_suppressions" 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON COLUMN "drift_candidates"."evidence_bundle" IS 'Complete EvidenceBundle JSON with source evidence, target evidence, and assessment';
COMMENT ON COLUMN "drift_candidates"."impact_score" IS 'Deterministic impact score from 0-1 based on multi-source assessment';
COMMENT ON COLUMN "drift_candidates"."impact_band" IS 'Impact band: low (<0.4), medium (0.4-0.7), high (0.7-0.9), critical (>=0.9)';
COMMENT ON COLUMN "drift_candidates"."impact_json" IS 'Complete impact assessment details including fired rules and blast radius';
COMMENT ON COLUMN "drift_candidates"."consequence_text" IS 'Human-readable consequence text for Slack messages';
COMMENT ON COLUMN "drift_candidates"."fingerprint_strict" IS 'Strict fingerprint for exact match suppression';
COMMENT ON COLUMN "drift_candidates"."fingerprint_medium" IS 'Medium fingerprint for normalized token suppression';
COMMENT ON COLUMN "drift_candidates"."fingerprint_broad" IS 'Broad fingerprint for high-level pattern suppression';

COMMENT ON TABLE "drift_suppressions" IS 'Suppression rules for reducing false positive fatigue';
COMMENT ON COLUMN "drift_suppressions"."fingerprint" IS 'Fingerprint hash to match against drift candidates';
COMMENT ON COLUMN "drift_suppressions"."fingerprint_level" IS 'Level of fingerprint matching: strict, medium, or broad';
COMMENT ON COLUMN "drift_suppressions"."suppression_type" IS 'Type of suppression: false_positive, snooze, or permanent';
COMMENT ON COLUMN "drift_suppressions"."false_positive_count" IS 'Number of times this pattern was marked as false positive';
