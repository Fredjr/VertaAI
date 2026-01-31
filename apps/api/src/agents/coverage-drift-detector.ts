/**
 * Coverage Drift Detector Agent (Phase 4: Knowledge Gap Detection)
 *
 * LLM agent that analyzes question clusters against existing documentation
 * to identify coverage gaps and suggest additions.
 */

import { callClaude, ClaudeResponse } from '../lib/claude.js';
import { z } from 'zod';
import type { QuestionCluster } from '../services/signals/questionClusterer.js';

// ============================================================================
// Schema
// ============================================================================

export const CoverageDriftOutputSchema = z.object({
  coverage_gap_detected: z.boolean(),
  confidence: z.number().min(0).max(1),
  gap_type: z.enum([
    'missing_section',
    'incomplete_section',
    'outdated_section',
    'unclear_section',
    'missing_faq',
  ]).nullable(),
  existing_doc_section: z.string().nullable(),
  suggested_addition: z.object({
    section_title: z.string(),
    content_outline: z.array(z.string()),
    placement: z.enum(['new_section', 'append_to_existing', 'faq_entry']),
    priority: z.enum(['high', 'medium', 'low']),
  }).nullable(),
  evidence: z.string(),
  question_pattern: z.string(),
  estimated_impact: z.object({
    questions_addressed: z.number(),
    time_saved_per_question_minutes: z.number(),
  }).nullable(),
});

export type CoverageDriftOutput = z.infer<typeof CoverageDriftOutputSchema>;

// ============================================================================
// System Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are CoverageDriftDetector, an agent that identifies documentation gaps from repeated questions.

Given a cluster of similar questions and existing documentation content, determine if the docs are missing coverage.

## Analysis Rules:
1. If multiple users ask the same question, the docs likely have a gap.
2. Consider whether the answer exists but is hard to find (unclear) vs. completely missing.
3. A cluster of 3+ similar questions from different users is strong evidence of a gap.
4. Questions about errors, edge cases, or troubleshooting often indicate missing coverage.
5. Questions about setup/configuration suggest onboarding doc gaps.

## Gap Types:
- missing_section: The topic is not covered at all
- incomplete_section: The topic is covered but lacks detail
- outdated_section: The topic is covered but information is stale
- unclear_section: The topic is covered but hard to understand/find
- missing_faq: Common question that should be in FAQ

## Priority Guidelines:
- high: 5+ questions, from 3+ unique users, critical topic (deployment, auth, setup)
- medium: 3-4 questions, from 2+ users, important topic
- low: 3 questions, 1-2 users, nice-to-have information

## Output JSON schema:
{
  "coverage_gap_detected": boolean,
  "confidence": number (0-1),
  "gap_type": "missing_section" | "incomplete_section" | "outdated_section" | "unclear_section" | "missing_faq" | null,
  "existing_doc_section": string | null (section title if topic is partially covered),
  "suggested_addition": {
    "section_title": string,
    "content_outline": string[] (3-5 bullet points of what should be covered),
    "placement": "new_section" | "append_to_existing" | "faq_entry",
    "priority": "high" | "medium" | "low"
  } | null,
  "evidence": string (max 300 chars explaining the gap),
  "question_pattern": string (summarized pattern of questions),
  "estimated_impact": {
    "questions_addressed": number,
    "time_saved_per_question_minutes": number
  } | null
}`;

// ============================================================================
// Functions
// ============================================================================

export interface CoverageDriftInput {
  cluster: QuestionCluster;
  docContent: string;
  docTitle: string;
  docUrl?: string;
}

/**
 * Detect coverage drift by analyzing question cluster against documentation
 */
export async function detectCoverageDrift(
  input: CoverageDriftInput
): Promise<ClaudeResponse<CoverageDriftOutput>> {
  const { cluster, docContent, docTitle } = input;

  const userPrompt = JSON.stringify({
    question_cluster: {
      representative: cluster.representativeQuestion,
      frequency: cluster.frequency,
      unique_askers: cluster.uniqueAskers.size || cluster.questions.length,
      topic: cluster.topic,
      sample_questions: cluster.questions.slice(0, 5).map(q => q.cleanedText || q.text),
      channel: cluster.channelName,
      time_span_days: Math.ceil(
        (cluster.lastSeen.getTime() - cluster.firstSeen.getTime()) / (1000 * 60 * 60 * 24)
      ),
    },
    documentation: {
      title: docTitle,
      content: docContent.substring(0, 8000), // Limit content size
      content_truncated: docContent.length > 8000,
    },
  });

  return callClaude(
    {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.3,
    },
    CoverageDriftOutputSchema
  );
}

/**
 * Create a coverage drift signal from detector output
 */
export function createCoverageDriftSignal(
  cluster: QuestionCluster,
  output: CoverageDriftOutput,
  docRef: { title: string; url?: string }
): {
  driftType: 'coverage';
  confidence: number;
  evidenceSummary: string;
  suggestedPatch: {
    sectionTitle: string;
    contentOutline: string[];
    placement: string;
  } | null;
} | null {
  if (!output.coverage_gap_detected || output.confidence < 0.5) {
    return null;
  }

  return {
    driftType: 'coverage',
    confidence: output.confidence,
    evidenceSummary: `${output.question_pattern}. ${cluster.frequency} questions from ${cluster.uniqueAskers.size || cluster.questions.length} users in #${cluster.channelName}. Gap type: ${output.gap_type}. Doc: "${docRef.title}"`,
    suggestedPatch: output.suggested_addition
      ? {
          sectionTitle: output.suggested_addition.section_title,
          contentOutline: output.suggested_addition.content_outline,
          placement: output.suggested_addition.placement,
        }
      : null,
  };
}

