-- Add trace ID for observability (Phase 4)
-- Enables end-to-end tracing of drift candidates through all 18 states

ALTER TABLE "drift_candidates" ADD COLUMN "trace_id" TEXT;

-- Create index for trace ID lookups
CREATE INDEX "drift_candidates_trace_id_idx" ON "drift_candidates"("trace_id");

-- Backfill trace IDs for existing drifts (use drift ID as trace ID)
UPDATE "drift_candidates" SET "trace_id" = "id" WHERE "trace_id" IS NULL;

