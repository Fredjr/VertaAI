-- CreateEnum: AuthorType
CREATE TYPE "AuthorType" AS ENUM ('HUMAN', 'AGENT', 'UNKNOWN');

-- CreateTable: intent_artifacts
CREATE TABLE "intent_artifacts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "pr_number" INTEGER NOT NULL,
    "repo_full_name" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "author_type" "AuthorType" NOT NULL,
    "agent_identity" TEXT,
    "requested_capabilities" JSONB NOT NULL,
    "constraints" JSONB NOT NULL DEFAULT '{}',
    "affected_services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expected_side_effects" JSONB NOT NULL DEFAULT '{}',
    "risk_acknowledgements" JSONB NOT NULL DEFAULT '[]',
    "links" JSONB,
    "signature" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intent_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: agent_action_traces
CREATE TABLE "agent_action_traces" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "pr_number" INTEGER NOT NULL,
    "repo_full_name" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "agent_version" TEXT NOT NULL,
    "tool_calls" JSONB NOT NULL DEFAULT '[]',
    "files_modified" JSONB NOT NULL DEFAULT '[]',
    "external_actions" JSONB NOT NULL DEFAULT '[]',
    "runtime_effects" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_action_traces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: intent_artifacts indexes
CREATE INDEX "intent_artifacts_workspace_id_idx" ON "intent_artifacts"("workspace_id");
CREATE INDEX "intent_artifacts_repo_full_name_pr_number_idx" ON "intent_artifacts"("repo_full_name", "pr_number");
CREATE INDEX "intent_artifacts_author_type_idx" ON "intent_artifacts"("author_type");
CREATE INDEX "intent_artifacts_workspace_id_author_type_created_at_idx" ON "intent_artifacts"("workspace_id", "author_type", "created_at" DESC);

-- CreateIndex: agent_action_traces indexes
CREATE INDEX "agent_action_traces_workspace_id_idx" ON "agent_action_traces"("workspace_id");
CREATE INDEX "agent_action_traces_repo_full_name_pr_number_idx" ON "agent_action_traces"("repo_full_name", "pr_number");
CREATE INDEX "agent_action_traces_agent_id_idx" ON "agent_action_traces"("agent_id");
CREATE INDEX "agent_action_traces_workspace_id_agent_id_created_at_idx" ON "agent_action_traces"("workspace_id", "agent_id", "created_at" DESC);

-- AddForeignKey: intent_artifacts -> workspaces
ALTER TABLE "intent_artifacts" ADD CONSTRAINT "intent_artifacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: agent_action_traces -> workspaces
ALTER TABLE "agent_action_traces" ADD CONSTRAINT "agent_action_traces_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

