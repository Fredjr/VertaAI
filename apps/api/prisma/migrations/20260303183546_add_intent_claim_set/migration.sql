-- AlterTable: Add vibe coding provenance fields to IntentArtifact (Gap A)
-- promptText: raw prompt that produced the spec
-- claimSet: structured { expectedOutcomes, constraints, nonGoals }
-- agentTraceId: external trace/run ID from agent tooling (Cursor session, OpenAI trace, etc.)
ALTER TABLE "intent_artifacts"
  ADD COLUMN IF NOT EXISTS "prompt_text" TEXT,
  ADD COLUMN IF NOT EXISTS "claim_set"   JSONB,
  ADD COLUMN IF NOT EXISTS "agent_trace_id" TEXT;
