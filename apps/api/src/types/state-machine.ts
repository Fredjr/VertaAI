// State Machine Types for VertaAI Drift Detection Pipeline
// Based on Section 15.15.1 of the spec

// All possible states a DriftCandidate can be in
export enum DriftState {
  // Initial
  INGESTED = 'INGESTED',

  // Processing states
  ELIGIBILITY_CHECKED = 'ELIGIBILITY_CHECKED',
  SIGNALS_CORRELATED = 'SIGNALS_CORRELATED',
  DRIFT_CLASSIFIED = 'DRIFT_CLASSIFIED',
  DOCS_RESOLVED = 'DOCS_RESOLVED',
  DOCS_FETCHED = 'DOCS_FETCHED',
  DOC_CONTEXT_EXTRACTED = 'DOC_CONTEXT_EXTRACTED',
  BASELINE_CHECKED = 'BASELINE_CHECKED',
  PATCH_PLANNED = 'PATCH_PLANNED',
  PATCH_GENERATED = 'PATCH_GENERATED',
  PATCH_VALIDATED = 'PATCH_VALIDATED',
  OWNER_RESOLVED = 'OWNER_RESOLVED',
  SLACK_SENT = 'SLACK_SENT',

  // Human interaction states
  AWAITING_HUMAN = 'AWAITING_HUMAN',
  APPROVED = 'APPROVED',
  EDIT_REQUESTED = 'EDIT_REQUESTED',
  REJECTED = 'REJECTED',
  SNOOZED = 'SNOOZED',

  // Writeback states
  WRITEBACK_VALIDATED = 'WRITEBACK_VALIDATED',
  WRITTEN_BACK = 'WRITTEN_BACK',

  // Terminal states
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  FAILED_NEEDS_MAPPING = 'FAILED_NEEDS_MAPPING', // Specific failure: no doc mapping found
}

// Failure codes from Section 15.9.9
export enum FailureCode {
  // Retryable errors
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // Needs configuration
  NEEDS_DOC_MAPPING = 'NEEDS_DOC_MAPPING',
  NEEDS_OWNER_MAPPING = 'NEEDS_OWNER_MAPPING',
  NO_MANAGED_REGION = 'NO_MANAGED_REGION',
  MULTIPLE_PRIMARY_DOCS = 'MULTIPLE_PRIMARY_DOCS',

  // Validation failures
  PATCH_VALIDATION_FAILED = 'PATCH_VALIDATION_FAILED',
  UNSAFE_PATCH = 'UNSAFE_PATCH',
  SECRETS_DETECTED = 'SECRETS_DETECTED',
  PATCH_TOO_LARGE = 'PATCH_TOO_LARGE',
  OUT_OF_SCOPE = 'OUT_OF_SCOPE',

  // Permission issues
  DOC_WRITE_DENIED = 'DOC_WRITE_DENIED',
  SLACK_POST_DENIED = 'SLACK_POST_DENIED',

  // Data issues
  DOC_NOT_FOUND = 'DOC_NOT_FOUND',
  REVISION_MISMATCH = 'REVISION_MISMATCH',
  FINGERPRINT_COLLISION = 'FINGERPRINT_COLLISION',

  // Writeback issues
  DOC_CONFLICT = 'DOC_CONFLICT',
  WRITEBACK_FAILED = 'WRITEBACK_FAILED',

  // Generic
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// Result of a state transition
export interface TransitionResult {
  state: DriftState;
  enqueueNext: boolean;
  nextStateHint?: string;
  error?: {
    code: FailureCode;
    message: string;
  };
}

// Job payload for QStash
export interface JobPayload {
  workspaceId: string;
  driftId: string;
  attempt?: number;
}

// Terminal states - no more transitions
export const TERMINAL_STATES: DriftState[] = [
  DriftState.COMPLETED,
  DriftState.FAILED,
  DriftState.FAILED_NEEDS_MAPPING,
  DriftState.REJECTED,
];

// Human-gated states - wait for human action
export const HUMAN_GATED_STATES: DriftState[] = [
  DriftState.AWAITING_HUMAN,
  DriftState.SNOOZED,
];

// Retryable failure codes
export const RETRYABLE_FAILURES: FailureCode[] = [
  FailureCode.TIMEOUT,
  FailureCode.RATE_LIMITED,
  FailureCode.SERVICE_UNAVAILABLE,
];

// Maximum transitions per QStash invocation (bounded loop)
export const MAX_TRANSITIONS_PER_INVOCATION = 5;

// Maximum retry attempts before marking as FAILED
export const MAX_RETRY_ATTEMPTS = 3;

// Lock TTL in seconds for distributed locking
export const LOCK_TTL_SECONDS = 30;

