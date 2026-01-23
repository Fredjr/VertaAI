import { z } from 'zod';

// Agent A: Drift Triage Output
export const DriftTriageOutputSchema = z.object({
  drift_detected: z.boolean(),
  confidence: z.number().min(0).max(1),
  impacted_domains: z.array(z.string()),
  evidence_summary: z.string().max(200),
  needs_human: z.boolean(),
  skip_reason: z.string().optional(),
});

export type DriftTriageOutput = z.infer<typeof DriftTriageOutputSchema>;

// Agent B: Doc Resolver Output
export const DocResolverOutputSchema = z.object({
  doc_candidates: z.array(z.object({
    doc_id: z.string(),
    title: z.string(),
    match_reason: z.string(),
    confidence: z.number().min(0).max(1),
  })),
  needs_human: z.boolean(),
  notes: z.string().optional(),
});

export type DocResolverOutput = z.infer<typeof DocResolverOutputSchema>;

// Agent C: Patch Planner Output
export const PatchPlannerOutputSchema = z.object({
  targets: z.array(z.object({
    section_pattern: z.string(),
    change_type: z.enum(['update', 'add_note', 'flag_for_review']),
    rationale: z.string(),
  })),
  constraints: z.array(z.string()),
  needs_human: z.boolean(),
  notes: z.string().optional(),
});

export type PatchPlannerOutput = z.infer<typeof PatchPlannerOutputSchema>;

// Agent D: Patch Generator Output (CORE)
export const PatchGeneratorOutputSchema = z.object({
  doc_id: z.string(),
  unified_diff: z.string(),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  sources_used: z.array(z.object({
    type: z.string(),
    ref: z.string(),
  })),
  safety: z.object({
    secrets_redacted: z.boolean(),
    risky_change_avoided: z.boolean(),
  }),
  needs_human: z.boolean(),
  notes: z.string().optional(),
});

export type PatchGeneratorOutput = z.infer<typeof PatchGeneratorOutputSchema>;

// Agent E: Slack Composer Output
export const SlackComposerOutputSchema = z.object({
  channel: z.string(),
  text: z.string(),
  blocks: z.array(z.any()), // Slack Block Kit format
});

export type SlackComposerOutput = z.infer<typeof SlackComposerOutputSchema>;

// Agent F: Rejection Classifier Output
export const RejectionClassifierOutputSchema = z.object({
  tags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  needs_human: z.boolean(),
  notes: z.string().optional(),
});

export type RejectionClassifierOutput = z.infer<typeof RejectionClassifierOutputSchema>;

// Agent G: Impact Summary Output
export const ImpactSummaryOutputSchema = z.object({
  headline: z.string(),
  bullets: z.array(z.string()),
  risks: z.array(z.string()),
  next_actions: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type ImpactSummaryOutput = z.infer<typeof ImpactSummaryOutputSchema>;

// Agent H: Editor Helper Output
export const EditorHelperOutputSchema = z.object({
  unified_diff: z.string(),
  summary: z.string(),
  needs_human: z.boolean(),
  notes: z.string().optional(),
});

export type EditorHelperOutput = z.infer<typeof EditorHelperOutputSchema>;

// Agent I: Patch Explainer Output
export const PatchExplainerOutputSchema = z.object({
  explanation: z.string(),
  risk_level: z.enum(['low', 'medium', 'high']),
  needs_human: z.boolean(),
});

export type PatchExplainerOutput = z.infer<typeof PatchExplainerOutputSchema>;

