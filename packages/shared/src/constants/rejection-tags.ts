// Rejection reason tags for Agent F
export const REJECTION_TAGS = [
  'not_needed',
  'wrong_owner',
  'insufficient_evidence',
  'doc_not_source_of_truth',
  'out_of_scope',
  'needs_more_context',
  'formatting_issue',
  'incorrect_change',
] as const;

export type RejectionTag = typeof REJECTION_TAGS[number];

// Human-readable descriptions for each tag
export const REJECTION_TAG_DESCRIPTIONS: Record<RejectionTag, string> = {
  not_needed: 'The change is not necessary',
  wrong_owner: 'I am not the right person to approve this',
  insufficient_evidence: 'Not enough evidence to support this change',
  doc_not_source_of_truth: 'This document is not the source of truth',
  out_of_scope: 'The change is outside the scope of this document',
  needs_more_context: 'Need more context to make a decision',
  formatting_issue: 'The formatting of the patch is incorrect',
  incorrect_change: 'The proposed change is factually incorrect',
};

