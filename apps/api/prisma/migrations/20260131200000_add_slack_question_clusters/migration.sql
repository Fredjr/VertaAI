-- CreateTable: SlackQuestionCluster (Phase 4: Knowledge Gap Detection)
CREATE TABLE "slack_question_clusters" (
    "workspace_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "channel_name" TEXT NOT NULL,
    "representative_question" TEXT NOT NULL,
    "topic" TEXT NOT NULL DEFAULT 'general',
    "message_count" INTEGER NOT NULL,
    "unique_askers" INTEGER NOT NULL,
    "first_seen" TIMESTAMP(3) NOT NULL,
    "last_seen" TIMESTAMP(3) NOT NULL,
    "processed_at" TIMESTAMP(3),
    "signal_event_id" TEXT,
    "sample_messages" JSONB NOT NULL,
    "avg_similarity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_question_clusters_pkey" PRIMARY KEY ("workspace_id","id")
);

-- CreateIndex
CREATE INDEX "slack_question_clusters_workspace_id_last_seen_idx" ON "slack_question_clusters"("workspace_id", "last_seen" DESC);

-- CreateIndex
CREATE INDEX "slack_question_clusters_workspace_id_processed_at_idx" ON "slack_question_clusters"("workspace_id", "processed_at");

-- AddForeignKey
ALTER TABLE "slack_question_clusters" ADD CONSTRAINT "slack_question_clusters_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

