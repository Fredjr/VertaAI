-- AlterTable
ALTER TABLE "drift_candidates" ADD COLUMN "has_coverage_gap" BOOLEAN NOT NULL DEFAULT false;

-- Comment
COMMENT ON COLUMN "drift_candidates"."has_coverage_gap" IS 'Gap #2: Coverage as orthogonal dimension - can be true for ANY drift type';

