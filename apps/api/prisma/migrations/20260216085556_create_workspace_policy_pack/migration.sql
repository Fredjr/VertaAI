/*
  Warnings:

  - You are about to drop the column `confidence_boost` on the `drift_candidates` table. All the data in the column will be lost.
  - Made the column `allow_writeback` on table `doc_mappings_v2` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workflow_preferences` on table `workspaces` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "drift_candidates_fingerprint_broad_idx";

-- DropIndex
DROP INDEX "drift_candidates_fingerprint_medium_idx";

-- DropIndex
DROP INDEX "drift_candidates_fingerprint_strict_idx";

-- DropIndex
DROP INDEX "drift_candidates_impact_band_idx";

-- DropIndex
DROP INDEX "drift_candidates_impact_score_idx";

-- DropIndex
DROP INDEX "drift_candidates_type_state_idx";

-- DropIndex
DROP INDEX "patch_proposals_drift_idx";

-- DropIndex
DROP INDEX "signal_events_source_type_idx";

-- AlterTable
ALTER TABLE "doc_mappings_v2" ADD COLUMN     "source_type" TEXT,
ALTER COLUMN "allow_writeback" SET NOT NULL;

-- AlterTable
ALTER TABLE "drift_candidates" DROP COLUMN "confidence_boost",
ADD COLUMN     "base_revision" TEXT,
ADD COLUMN     "classification_method" TEXT,
ADD COLUMN     "cluster_id" TEXT,
ADD COLUMN     "comparison_result" JSONB,
ADD COLUMN     "correlation_boost" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "correlation_reason" TEXT,
ADD COLUMN     "correlation_score" DOUBLE PRECISION,
ADD COLUMN     "doc_context" JSONB,
ADD COLUMN     "doc_context_sha256" TEXT,
ADD COLUMN     "docs_resolution" JSONB,
ADD COLUMN     "docs_resolution_confidence" DOUBLE PRECISION,
ADD COLUMN     "docs_resolution_method" TEXT,
ADD COLUMN     "docs_resolution_status" TEXT,
ADD COLUMN     "drift_verdict" JSONB,
ADD COLUMN     "llm_confidence" DOUBLE PRECISION,
ADD COLUMN     "llm_drift_type" TEXT,
ADD COLUMN     "needs_mapping_key" TEXT,
ADD COLUMN     "needs_mapping_notified_at" TIMESTAMP(3),
ADD COLUMN     "no_writeback_mode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "patch_style" TEXT,
ADD COLUMN     "pre_validation_passed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "section_pattern" TEXT,
ADD COLUMN     "selected_doc_id" TEXT,
ADD COLUMN     "selected_doc_title" TEXT,
ADD COLUMN     "selected_doc_url" TEXT,
ADD COLUMN     "source_confidence_weight" DOUBLE PRECISION,
ADD COLUMN     "source_threshold" DOUBLE PRECISION,
ADD COLUMN     "target_doc_systems" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "drift_suppressions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "plan_runs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "allow_pr_link_override" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allow_search_suggest_mapping" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allowed_confluence_spaces" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "min_confidence_for_suggest" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
ADD COLUMN     "primary_doc_required" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "workflow_preferences" SET NOT NULL;

-- CreateTable
CREATE TABLE "drift_clusters" (
    "workspace_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "drift_type" TEXT NOT NULL,
    "fingerprint_pattern" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "drift_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "notified_at" TIMESTAMP(3),
    "slack_message_ts" TEXT,
    "slack_channel" TEXT,
    "cluster_summary" TEXT,
    "drift_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bulk_action_status" TEXT,
    "bulk_action_at" TIMESTAMP(3),
    "bulk_action_by" TEXT,

    CONSTRAINT "drift_clusters_pkey" PRIMARY KEY ("workspace_id","id")
);

-- CreateTable
CREATE TABLE "drift_histories" (
    "workspace_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "doc_system" TEXT NOT NULL,
    "doc_id" TEXT NOT NULL,
    "doc_title" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "drift_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_drift_count" INTEGER NOT NULL DEFAULT 0,
    "total_materiality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "average_materiality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "drift_type_breakdown" JSONB NOT NULL DEFAULT '[]',
    "accumulated_drift_ids" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'accumulating',
    "bundled_at" TIMESTAMP(3),
    "bundled_drift_id" TEXT,
    "bundle_trigger" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drift_histories_pkey" PRIMARY KEY ("workspace_id","id")
);

-- CreateTable
CREATE TABLE "contract_packs" (
    "workspace_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "contracts" JSONB NOT NULL DEFAULT '[]',
    "dictionaries" JSONB NOT NULL DEFAULT '{}',
    "extraction" JSONB NOT NULL DEFAULT '{}',
    "safety" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_packs_pkey" PRIMARY KEY ("workspace_id","id")
);

-- CreateTable
CREATE TABLE "workspace_policy_packs" (
    "workspace_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "scopeType" TEXT NOT NULL,
    "scope_ref" TEXT,
    "repo_allowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "path_globs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "track_a_enabled" BOOLEAN NOT NULL DEFAULT false,
    "track_a_config" JSONB NOT NULL DEFAULT '{}',
    "track_b_enabled" BOOLEAN NOT NULL DEFAULT false,
    "track_b_config" JSONB NOT NULL DEFAULT '{}',
    "approval_tiers" JSONB NOT NULL DEFAULT '{}',
    "routing" JSONB NOT NULL DEFAULT '{}',
    "test_mode" BOOLEAN NOT NULL DEFAULT false,
    "test_mode_config" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "version_hash" TEXT NOT NULL,
    "parent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "workspace_policy_packs_pkey" PRIMARY KEY ("workspace_id","id")
);

-- CreateTable
CREATE TABLE "contract_policies" (
    "workspace_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'warn_only',
    "critical_threshold" INTEGER NOT NULL DEFAULT 90,
    "high_threshold" INTEGER NOT NULL DEFAULT 70,
    "medium_threshold" INTEGER NOT NULL DEFAULT 40,
    "graceful_degradation" JSONB NOT NULL DEFAULT '{}',
    "applies_to" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_policies_pkey" PRIMARY KEY ("workspace_id","id")
);

-- CreateTable
CREATE TABLE "contract_resolutions" (
    "workspace_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "signal_event_id" TEXT NOT NULL,
    "resolved_contracts" JSONB NOT NULL DEFAULT '[]',
    "unresolved_artifacts" JSONB NOT NULL DEFAULT '[]',
    "obligations" JSONB NOT NULL DEFAULT '[]',
    "resolution_method" TEXT NOT NULL,
    "resolution_time_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_resolutions_pkey" PRIMARY KEY ("workspace_id","id")
);

-- CreateTable
CREATE TABLE "artifact_snapshots" (
    "workspace_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "artifact_type" TEXT NOT NULL,
    "artifact_ref" JSONB NOT NULL,
    "version" JSONB NOT NULL,
    "extract" JSONB NOT NULL,
    "extract_schema" TEXT NOT NULL,
    "triggered_by" JSONB NOT NULL,
    "ttl_days" INTEGER NOT NULL DEFAULT 30,
    "compressed" BOOLEAN NOT NULL DEFAULT false,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifact_snapshots_pkey" PRIMARY KEY ("workspace_id","id")
);

-- CreateTable
CREATE TABLE "integrity_findings" (
    "workspace_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "invariant_id" TEXT NOT NULL,
    "drift_type" TEXT NOT NULL,
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "severity" TEXT NOT NULL,
    "compared" JSONB NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "confidence" DOUBLE PRECISION NOT NULL,
    "impact" DOUBLE PRECISION NOT NULL,
    "band" TEXT NOT NULL,
    "recommended_action" TEXT NOT NULL,
    "owner_routing" JSONB NOT NULL DEFAULT '{}',
    "drift_candidate_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrity_findings_pkey" PRIMARY KEY ("workspace_id","id")
);

-- CreateTable
CREATE TABLE "drift_plans" (
    "workspace_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "scopeType" TEXT NOT NULL,
    "scopeRef" TEXT,
    "primary_doc_id" TEXT,
    "primary_doc_system" TEXT,
    "doc_class" TEXT,
    "input_sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "drift_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowed_outputs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "thresholds" JSONB NOT NULL DEFAULT '{}',
    "eligibility" JSONB NOT NULL DEFAULT '{}',
    "sectionTargets" JSONB NOT NULL DEFAULT '{}',
    "impactRules" JSONB NOT NULL DEFAULT '{}',
    "writeback" JSONB NOT NULL DEFAULT '{}',
    "doc_targeting" JSONB NOT NULL DEFAULT '{}',
    "source_cursors" JSONB NOT NULL DEFAULT '{}',
    "budgets" JSONB NOT NULL DEFAULT '{}',
    "noise_controls" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "version_hash" TEXT NOT NULL,
    "parent_id" TEXT,
    "template_id" TEXT,
    "template_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "drift_plans_pkey" PRIMARY KEY ("workspace_id","id")
);

-- CreateTable
CREATE TABLE "coverage_snapshots" (
    "workspace_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "snapshot_at" TIMESTAMP(3) NOT NULL,
    "total_services" INTEGER NOT NULL DEFAULT 0,
    "services_mapped" INTEGER NOT NULL DEFAULT 0,
    "total_repos" INTEGER NOT NULL DEFAULT 0,
    "repos_mapped" INTEGER NOT NULL DEFAULT 0,
    "mapping_coverage_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_signals" INTEGER NOT NULL DEFAULT 0,
    "signals_processed" INTEGER NOT NULL DEFAULT 0,
    "signals_ignored" INTEGER NOT NULL DEFAULT 0,
    "processing_coverage_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source_health" JSONB NOT NULL DEFAULT '{}',
    "drift_type_distribution" JSONB NOT NULL DEFAULT '{}',
    "obligations_status" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coverage_snapshots_pkey" PRIMARY KEY ("workspace_id","id")
);

-- CreateTable
CREATE TABLE "audit_trails" (
    "workspace_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_type" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'system',
    "severity" TEXT NOT NULL DEFAULT 'info',
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "from_state" TEXT,
    "to_state" TEXT,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "evidence_bundle_hash" TEXT,
    "impact_band" TEXT,
    "plan_id" TEXT,
    "plan_version_hash" TEXT,
    "requires_retention" BOOLEAN NOT NULL DEFAULT false,
    "retention_until" TIMESTAMP(3),
    "compliance_tag" TEXT,

    CONSTRAINT "audit_trails_pkey" PRIMARY KEY ("workspace_id","id")
);

-- CreateIndex
CREATE INDEX "drift_clusters_workspace_id_status_idx" ON "drift_clusters"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "drift_clusters_workspace_id_service_idx" ON "drift_clusters"("workspace_id", "service");

-- CreateIndex
CREATE INDEX "drift_clusters_created_at_idx" ON "drift_clusters"("created_at");

-- CreateIndex
CREATE INDEX "drift_clusters_notified_at_idx" ON "drift_clusters"("notified_at");

-- CreateIndex
CREATE UNIQUE INDEX "drift_clusters_workspace_id_service_drift_type_fingerprint__key" ON "drift_clusters"("workspace_id", "service", "drift_type", "fingerprint_pattern", "status");

-- CreateIndex
CREATE INDEX "drift_histories_workspace_id_doc_system_doc_id_status_idx" ON "drift_histories"("workspace_id", "doc_system", "doc_id", "status");

-- CreateIndex
CREATE INDEX "drift_histories_workspace_id_status_window_end_idx" ON "drift_histories"("workspace_id", "status", "window_end");

-- CreateIndex
CREATE UNIQUE INDEX "drift_histories_workspace_id_doc_system_doc_id_window_start_key" ON "drift_histories"("workspace_id", "doc_system", "doc_id", "window_start");

-- CreateIndex
CREATE INDEX "contract_packs_workspace_id_idx" ON "contract_packs"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_policy_packs_workspace_id_idx" ON "workspace_policy_packs"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_policy_packs_status_idx" ON "workspace_policy_packs"("status");

-- CreateIndex
CREATE INDEX "workspace_policy_packs_workspace_id_status_idx" ON "workspace_policy_packs"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "contract_policies_workspace_id_idx" ON "contract_policies"("workspace_id");

-- CreateIndex
CREATE INDEX "contract_policies_workspace_id_active_idx" ON "contract_policies"("workspace_id", "active");

-- CreateIndex
CREATE INDEX "contract_resolutions_workspace_id_signal_event_id_idx" ON "contract_resolutions"("workspace_id", "signal_event_id");

-- CreateIndex
CREATE INDEX "artifact_snapshots_workspace_id_contract_id_idx" ON "artifact_snapshots"("workspace_id", "contract_id");

-- CreateIndex
CREATE INDEX "artifact_snapshots_workspace_id_artifact_type_idx" ON "artifact_snapshots"("workspace_id", "artifact_type");

-- CreateIndex
CREATE INDEX "artifact_snapshots_created_at_idx" ON "artifact_snapshots"("created_at");

-- CreateIndex
CREATE INDEX "integrity_findings_workspace_id_contract_id_idx" ON "integrity_findings"("workspace_id", "contract_id");

-- CreateIndex
CREATE INDEX "integrity_findings_workspace_id_band_idx" ON "integrity_findings"("workspace_id", "band");

-- CreateIndex
CREATE INDEX "integrity_findings_created_at_idx" ON "integrity_findings"("created_at");

-- CreateIndex
CREATE INDEX "drift_plans_workspace_id_status_idx" ON "drift_plans"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "drift_plans_workspace_id_scopeType_scopeRef_idx" ON "drift_plans"("workspace_id", "scopeType", "scopeRef");

-- CreateIndex
CREATE INDEX "drift_plans_workspace_id_template_id_idx" ON "drift_plans"("workspace_id", "template_id");

-- CreateIndex
CREATE UNIQUE INDEX "drift_plans_workspace_id_version_hash_key" ON "drift_plans"("workspace_id", "version_hash");

-- CreateIndex
CREATE INDEX "coverage_snapshots_workspace_id_snapshot_at_idx" ON "coverage_snapshots"("workspace_id", "snapshot_at");

-- CreateIndex
CREATE INDEX "audit_trails_workspace_id_timestamp_idx" ON "audit_trails"("workspace_id", "timestamp");

-- CreateIndex
CREATE INDEX "audit_trails_workspace_id_entity_type_entity_id_idx" ON "audit_trails"("workspace_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_trails_workspace_id_event_type_timestamp_idx" ON "audit_trails"("workspace_id", "event_type", "timestamp");

-- CreateIndex
CREATE INDEX "audit_trails_workspace_id_actor_id_timestamp_idx" ON "audit_trails"("workspace_id", "actor_id", "timestamp");

-- CreateIndex
CREATE INDEX "audit_trails_workspace_id_category_severity_timestamp_idx" ON "audit_trails"("workspace_id", "category", "severity", "timestamp");

-- CreateIndex
CREATE INDEX "audit_trails_evidence_bundle_hash_idx" ON "audit_trails"("evidence_bundle_hash");

-- CreateIndex
CREATE INDEX "audit_trails_plan_version_hash_idx" ON "audit_trails"("plan_version_hash");

-- CreateIndex
CREATE INDEX "doc_mappings_v2_workspace_id_repo_source_type_idx" ON "doc_mappings_v2"("workspace_id", "repo", "source_type");

-- CreateIndex
CREATE INDEX "drift_candidates_workspace_id_needs_mapping_key_needs_mappi_idx" ON "drift_candidates"("workspace_id", "needs_mapping_key", "needs_mapping_notified_at");

-- AddForeignKey
ALTER TABLE "drift_candidates" ADD CONSTRAINT "drift_candidates_workspace_id_cluster_id_fkey" FOREIGN KEY ("workspace_id", "cluster_id") REFERENCES "drift_clusters"("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_clusters" ADD CONSTRAINT "drift_clusters_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_histories" ADD CONSTRAINT "drift_histories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_packs" ADD CONSTRAINT "contract_packs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_policy_packs" ADD CONSTRAINT "workspace_policy_packs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_policies" ADD CONSTRAINT "contract_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_resolutions" ADD CONSTRAINT "contract_resolutions_workspace_id_signal_event_id_fkey" FOREIGN KEY ("workspace_id", "signal_event_id") REFERENCES "signal_events"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrity_findings" ADD CONSTRAINT "integrity_findings_workspace_id_drift_candidate_id_fkey" FOREIGN KEY ("workspace_id", "drift_candidate_id") REFERENCES "drift_candidates"("workspace_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_plans" ADD CONSTRAINT "drift_plans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_snapshots" ADD CONSTRAINT "coverage_snapshots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_trails" ADD CONSTRAINT "audit_trails_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "drift_suppressions_expires_at_idx" RENAME TO "drift_suppressions_workspace_id_expires_at_idx";

-- RenameIndex
ALTER INDEX "drift_suppressions_fingerprint_idx" RENAME TO "drift_suppressions_workspace_id_fingerprint_idx";

-- RenameIndex
ALTER INDEX "drift_suppressions_workspace_fingerprint_key" RENAME TO "drift_suppressions_workspace_id_fingerprint_key";
