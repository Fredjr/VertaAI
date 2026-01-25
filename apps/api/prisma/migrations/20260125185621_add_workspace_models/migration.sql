-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "owner_email" TEXT NOT NULL,
    "ownership_source_ranking" TEXT[] DEFAULT ARRAY['pagerduty', 'codeowners', 'manual']::TEXT[],
    "default_owner_type" TEXT NOT NULL DEFAULT 'slack_channel',
    "default_owner_ref" TEXT NOT NULL DEFAULT '#engineering',
    "high_confidence_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.70,
    "medium_confidence_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.55,
    "digest_channel" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" BIGSERIAL NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "config" JSONB NOT NULL DEFAULT '{}',
    "webhook_secret" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signal_events" (
    "workspace_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "service" TEXT,
    "repo" TEXT,
    "severity" TEXT,
    "extracted" JSONB NOT NULL DEFAULT '{}',
    "raw_payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signal_events_pkey" PRIMARY KEY ("workspace_id","id")
);

-- CreateTable
CREATE TABLE "drift_candidates" (
    "workspace_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "signal_event_id" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'INGESTED',
    "state_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_type" TEXT NOT NULL,
    "service" TEXT,
    "repo" TEXT,
    "drift_type" TEXT,
    "drift_domains" TEXT[],
    "evidence_summary" TEXT,
    "confidence" DOUBLE PRECISION,
    "drift_score" DOUBLE PRECISION,
    "risk_level" TEXT,
    "recommended_action" TEXT,
    "doc_candidates" JSONB NOT NULL DEFAULT '[]',
    "baseline_findings" JSONB NOT NULL DEFAULT '[]',
    "owner_resolution" JSONB,
    "fingerprint" TEXT,
    "correlated_signals" JSONB NOT NULL DEFAULT '[]',
    "confidence_boost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drift_candidates_pkey" PRIMARY KEY ("workspace_id","id")
);

-- CreateTable
CREATE TABLE "patch_proposals" (
    "workspace_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "drift_id" TEXT NOT NULL,
    "doc_system" TEXT NOT NULL,
    "doc_id" TEXT NOT NULL,
    "doc_title" TEXT NOT NULL,
    "doc_url" TEXT,
    "base_revision" TEXT,
    "patch_style" TEXT NOT NULL DEFAULT 'replace_steps',
    "unified_diff" TEXT NOT NULL,
    "sources_used" JSONB NOT NULL DEFAULT '[]',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "summary" TEXT,
    "validator_report" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "slack_channel" TEXT,
    "slack_ts" TEXT,
    "last_notified_at" TIMESTAMP(3),
    "notification_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patch_proposals_pkey" PRIMARY KEY ("workspace_id","id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "workspace_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "patch_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_slack_id" TEXT NOT NULL,
    "actor_name" TEXT,
    "note" TEXT,
    "edited_diff" TEXT,
    "snooze_until" TIMESTAMP(3),
    "rejection_category" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("workspace_id","id")
);

-- CreateTable
CREATE TABLE "doc_mappings_v2" (
    "workspace_id" TEXT NOT NULL,
    "id" BIGSERIAL NOT NULL,
    "service" TEXT,
    "repo" TEXT,
    "doc_system" TEXT NOT NULL,
    "doc_id" TEXT NOT NULL,
    "doc_title" TEXT NOT NULL,
    "doc_url" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "has_managed_region" BOOLEAN NOT NULL DEFAULT false,
    "managed_region_installed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doc_mappings_v2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_mappings" (
    "workspace_id" TEXT NOT NULL,
    "id" BIGSERIAL NOT NULL,
    "service" TEXT,
    "repo" TEXT,
    "owner_type" TEXT NOT NULL,
    "owner_ref" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "workspace_id" TEXT NOT NULL,
    "id" BIGSERIAL NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "actor_type" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slack_workspace_id" TEXT,
    "slack_bot_token" TEXT,
    "slack_team_name" TEXT,
    "confluence_cloud_id" TEXT,
    "confluence_access_token" TEXT,
    "github_installation_id" BIGINT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "slack_user_id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "github_username" TEXT,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracked_documents" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "confluence_page_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content_hash" TEXT,
    "last_content_snapshot" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "freshness_score" DECIMAL(3,2) NOT NULL DEFAULT 1.0,
    "owner_user_id" TEXT,
    "owner_source" TEXT,
    "repo_mapping" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracked_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_mappings" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "repo_full_name" TEXT NOT NULL,
    "path_patterns" TEXT[],
    "service_name" TEXT,
    "document_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signals" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "repo_full_name" TEXT,
    "payload" JSONB NOT NULL,
    "drift_analysis" JSONB,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diff_proposals" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "signal_id" TEXT,
    "document_id" TEXT,
    "diff_content" TEXT NOT NULL,
    "summary" TEXT,
    "rationale" TEXT,
    "confidence" DECIMAL(3,2),
    "suspected_sections" TEXT[],
    "source_links" TEXT[],
    "routed_to_user_id" TEXT,
    "routing_confidence" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "slack_channel_id" TEXT,
    "slack_message_ts" TEXT,
    "snooze_until" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "resolved_by_user_id" TEXT,
    "rejection_reason" TEXT,
    "rejection_tags" TEXT[],
    "edited_diff_content" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diff_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "document_id" TEXT,
    "diff_proposal_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metrics_snapshots" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "total_signals" INTEGER NOT NULL DEFAULT 0,
    "total_proposals" INTEGER NOT NULL DEFAULT 0,
    "approved_count" INTEGER NOT NULL DEFAULT 0,
    "edited_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_count" INTEGER NOT NULL DEFAULT 0,
    "snoozed_count" INTEGER NOT NULL DEFAULT 0,
    "avg_time_to_approval_hours" DECIMAL(10,2),
    "docs_updated_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metrics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_workspace_id_type_key" ON "integrations"("workspace_id", "type");

-- CreateIndex
CREATE INDEX "signal_events_workspace_id_source_type_occurred_at_idx" ON "signal_events"("workspace_id", "source_type", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "signal_events_workspace_id_service_occurred_at_idx" ON "signal_events"("workspace_id", "service", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "drift_candidates_workspace_id_state_state_updated_at_idx" ON "drift_candidates"("workspace_id", "state", "state_updated_at" DESC);

-- CreateIndex
CREATE INDEX "drift_candidates_workspace_id_service_idx" ON "drift_candidates"("workspace_id", "service");

-- CreateIndex
CREATE UNIQUE INDEX "drift_candidates_workspace_id_fingerprint_key" ON "drift_candidates"("workspace_id", "fingerprint");

-- CreateIndex
CREATE INDEX "patch_proposals_workspace_id_doc_system_doc_id_idx" ON "patch_proposals"("workspace_id", "doc_system", "doc_id");

-- CreateIndex
CREATE INDEX "patch_proposals_workspace_id_status_updated_at_idx" ON "patch_proposals"("workspace_id", "status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "approvals_workspace_id_patch_id_created_at_idx" ON "approvals"("workspace_id", "patch_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "doc_mappings_v2_workspace_id_service_idx" ON "doc_mappings_v2"("workspace_id", "service");

-- CreateIndex
CREATE INDEX "doc_mappings_v2_workspace_id_repo_idx" ON "doc_mappings_v2"("workspace_id", "repo");

-- CreateIndex
CREATE UNIQUE INDEX "doc_mappings_v2_workspace_id_doc_system_doc_id_key" ON "doc_mappings_v2"("workspace_id", "doc_system", "doc_id");

-- CreateIndex
CREATE INDEX "owner_mappings_workspace_id_service_idx" ON "owner_mappings"("workspace_id", "service");

-- CreateIndex
CREATE INDEX "owner_mappings_workspace_id_repo_idx" ON "owner_mappings"("workspace_id", "repo");

-- CreateIndex
CREATE INDEX "audit_events_workspace_id_entity_type_entity_id_created_at_idx" ON "audit_events"("workspace_id", "entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_workspace_id_created_at_idx" ON "audit_events"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slack_workspace_id_key" ON "organizations"("slack_workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_org_id_slack_user_id_key" ON "users"("org_id", "slack_user_id");

-- CreateIndex
CREATE INDEX "tracked_documents_org_id_idx" ON "tracked_documents"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracked_documents_org_id_confluence_page_id_key" ON "tracked_documents"("org_id", "confluence_page_id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_mappings_org_id_repo_full_name_document_id_key" ON "doc_mappings"("org_id", "repo_full_name", "document_id");

-- CreateIndex
CREATE INDEX "signals_org_id_created_at_idx" ON "signals"("org_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "signals_org_id_type_external_id_key" ON "signals"("org_id", "type", "external_id");

-- CreateIndex
CREATE INDEX "diff_proposals_org_id_status_idx" ON "diff_proposals"("org_id", "status");

-- CreateIndex
CREATE INDEX "diff_proposals_routed_to_user_id_status_idx" ON "diff_proposals"("routed_to_user_id", "status");

-- CreateIndex
CREATE INDEX "audit_logs_org_id_created_at_idx" ON "audit_logs"("org_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "metrics_snapshots_org_id_date_key" ON "metrics_snapshots"("org_id", "date");

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal_events" ADD CONSTRAINT "signal_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_candidates" ADD CONSTRAINT "drift_candidates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_candidates" ADD CONSTRAINT "drift_candidates_workspace_id_signal_event_id_fkey" FOREIGN KEY ("workspace_id", "signal_event_id") REFERENCES "signal_events"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patch_proposals" ADD CONSTRAINT "patch_proposals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patch_proposals" ADD CONSTRAINT "patch_proposals_workspace_id_drift_id_fkey" FOREIGN KEY ("workspace_id", "drift_id") REFERENCES "drift_candidates"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_workspace_id_patch_id_fkey" FOREIGN KEY ("workspace_id", "patch_id") REFERENCES "patch_proposals"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_mappings_v2" ADD CONSTRAINT "doc_mappings_v2_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_mappings" ADD CONSTRAINT "owner_mappings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracked_documents" ADD CONSTRAINT "tracked_documents_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracked_documents" ADD CONSTRAINT "tracked_documents_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_mappings" ADD CONSTRAINT "doc_mappings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_mappings" ADD CONSTRAINT "doc_mappings_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "tracked_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diff_proposals" ADD CONSTRAINT "diff_proposals_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diff_proposals" ADD CONSTRAINT "diff_proposals_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diff_proposals" ADD CONSTRAINT "diff_proposals_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "tracked_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diff_proposals" ADD CONSTRAINT "diff_proposals_routed_to_user_id_fkey" FOREIGN KEY ("routed_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diff_proposals" ADD CONSTRAINT "diff_proposals_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "tracked_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_diff_proposal_id_fkey" FOREIGN KEY ("diff_proposal_id") REFERENCES "diff_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metrics_snapshots" ADD CONSTRAINT "metrics_snapshots_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
