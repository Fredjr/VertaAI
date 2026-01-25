import { z } from 'zod';

// ============================================================================
// Drift Type Enums (Phase 3)
// ============================================================================

// 5 Drift Types
export const DRIFT_TYPES = [
  'instruction',   // Command/config/URL is wrong
  'process',       // Sequence/logic is outdated
  'ownership',     // Wrong owner/team/channel
  'coverage',      // Missing scenario
  'environment',   // Platform/tooling changed
] as const;

export type DriftType = typeof DRIFT_TYPES[number];

export const DriftTypeSchema = z.enum(DRIFT_TYPES);

// Impacted Domains (10 domains per spec Section 5.6)
export const IMPACTED_DOMAINS = [
  'deployment',
  'rollback',
  'config',
  'api',
  'observability',
  'auth',
  'infra',
  'onboarding',
  'data_migrations',
  'ownership_routing',  // Added: Escalation accuracy (impact score 0.5)
] as const;

export type ImpactedDomain = typeof IMPACTED_DOMAINS[number];

export const ImpactedDomainSchema = z.enum(IMPACTED_DOMAINS);

// Risk Levels
export const RISK_LEVELS = ['low', 'medium', 'high'] as const;
export type RiskLevel = typeof RISK_LEVELS[number];
export const RiskLevelSchema = z.enum(RISK_LEVELS);

// Recommended Actions
export const RECOMMENDED_ACTIONS = [
  'generate_patch',  // P0: High confidence, generate and send immediately
  'annotate_only',   // P1: Medium confidence, add note but flag for review
  'review_queue',    // P2: Low confidence, batch for weekly review
  'ignore',          // Below threshold, no action
] as const;

export type RecommendedAction = typeof RECOMMENDED_ACTIONS[number];
export const RecommendedActionSchema = z.enum(RECOMMENDED_ACTIONS);

// Priority Levels
export const PRIORITY_LEVELS = ['P0', 'P1', 'P2'] as const;
export type PriorityLevel = typeof PRIORITY_LEVELS[number];
export const PriorityLevelSchema = z.enum(PRIORITY_LEVELS);

// Patch Styles
export const PATCH_STYLES = [
  'replace_steps',      // Replace existing steps with new ones
  'add_note',           // Add a note/warning without changing content
  'reorder_steps',      // Reorder existing steps
  'update_owner_block', // Update owner/contact information
  'add_section',        // Add a new section
  'link_patch',         // Add link to primary doc (for secondary docs)
] as const;

export type PatchStyle = typeof PATCH_STYLES[number];
export const PatchStyleSchema = z.enum(PATCH_STYLES);

// ============================================================================
// Agent A: Drift Triage Output (Enhanced for Phase 3)
// ============================================================================

export const DriftTriageOutputSchema = z.object({
  drift_detected: z.boolean(),

  // Drift classification (NEW in Phase 3)
  drift_types: z.array(DriftTypeSchema).optional(), // Can have multiple types

  // Scoring (decomposed)
  confidence: z.number().min(0).max(1),           // Evidence strength
  impact_score: z.number().min(0).max(1).optional(), // Impact severity
  drift_score: z.number().min(0).max(1).optional(),  // Combined score

  // Domains and risk
  impacted_domains: z.array(z.string()),
  risk_level: RiskLevelSchema.optional(),

  // Action routing (NEW in Phase 3)
  recommended_action: RecommendedActionSchema.optional(),
  priority: PriorityLevelSchema.optional(),

  // Evidence
  evidence_summary: z.string().max(500), // Increased from 200
  key_tokens: z.array(z.string()).optional(), // For fingerprinting

  needs_human: z.boolean(),
  skip_reason: z.string().optional(),
  notes: z.string().optional(),
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

