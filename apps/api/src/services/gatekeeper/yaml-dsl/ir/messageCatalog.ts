/**
 * Message Catalog - i18n-style Templates for Governance Output
 * 
 * Phase 5.3: Eliminate freeform prose from comparators
 * 
 * Key Principles:
 * - All human-readable strings come from this catalog
 * - Messages are parameterized templates (i18n-style)
 * - Message IDs are stable (never change)
 * - Comparators emit message IDs + parameters
 * - Renderer owns prose generation
 * 
 * Message ID Format: `{domain}.{category}.{specific_case}`
 * Examples:
 * - artifact.missing.openapi
 * - governance.approvals.insufficient
 * - safety.secrets.detected
 * 
 * Usage:
 * ```typescript
 * // In comparator:
 * reasonHuman: formatMessage('artifact.missing.generic', { artifactType: 'openapi' })
 * 
 * // In renderer:
 * const message = getMessage('artifact.missing.generic');
 * const formatted = message.format({ artifactType: 'openapi' });
 * ```
 */

// ============================================================================
// Message Template Types
// ============================================================================

export interface MessageTemplate {
  id: string;
  template: string;
  description: string;
  params?: string[];
}

export interface MessageCatalog {
  [messageId: string]: MessageTemplate;
}

// ============================================================================
// Message Formatting
// ============================================================================

/**
 * Format a message template with parameters
 */
export function formatMessage(messageId: string, params: Record<string, any> = {}): string {
  const message = MESSAGE_CATALOG[messageId];
  
  if (!message) {
    console.error(`[MessageCatalog] Unknown message ID: ${messageId}`);
    return `[UNKNOWN_MESSAGE: ${messageId}]`;
  }

  let formatted = message.template;
  
  // Replace {param} placeholders
  for (const [key, value] of Object.entries(params)) {
    formatted = formatted.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }

  return formatted;
}

/**
 * Get message template by ID
 */
export function getMessage(messageId: string): MessageTemplate | null {
  return MESSAGE_CATALOG[messageId] || null;
}

/**
 * Validate that all required parameters are provided
 */
export function validateMessageParams(messageId: string, params: Record<string, any>): boolean {
  const message = MESSAGE_CATALOG[messageId];
  
  if (!message || !message.params) {
    return true;
  }

  for (const param of message.params) {
    if (!(param in params)) {
      console.error(`[MessageCatalog] Missing parameter '${param}' for message '${messageId}'`);
      return false;
    }
  }

  return true;
}

// ============================================================================
// MESSAGE CATALOG
// ============================================================================

export const MESSAGE_CATALOG: MessageCatalog = {
  // ==========================================================================
  // PASS MESSAGES
  // ==========================================================================
  
  'pass.generic': {
    id: 'pass.generic',
    template: 'All checks passed',
    description: 'Generic pass message',
  },

  'pass.artifact.all_present': {
    id: 'pass.artifact.all_present',
    template: 'All {artifactType} artifacts present: {paths}',
    description: 'All required artifacts are present',
    params: ['artifactType', 'paths'],
  },

  'pass.artifact.updated': {
    id: 'pass.artifact.updated',
    template: 'All {artifactType} artifacts updated: {paths}',
    description: 'All required artifacts were updated',
    params: ['artifactType', 'paths'],
  },

  'pass.approvals.sufficient': {
    id: 'pass.approvals.sufficient',
    template: 'Found {count} approval(s), required {minCount}',
    description: 'Sufficient approvals found',
    params: ['count', 'minCount'],
  },

  'pass.approvals.human_present': {
    id: 'pass.approvals.human_present',
    template: 'Found {count} human approval(s)',
    description: 'Human approval present',
    params: ['count'],
  },

  'pass.secrets.none_detected': {
    id: 'pass.secrets.none_detected',
    template: 'No secrets detected in diff',
    description: 'No secrets found in the diff',
  },

  'pass.checkruns.all_passed': {
    id: 'pass.checkruns.all_passed',
    template: 'All required check runs passed',
    description: 'All check runs passed',
  },

  'pass.pr_template.field_present': {
    id: 'pass.pr_template.field_present',
    template: 'PR template field "{fieldName}" is present',
    description: 'Required PR template field found',
    params: ['fieldName'],
  },

  'pass.path.matches': {
    id: 'pass.path.matches',
    template: 'Changed paths match required patterns: {matchedPaths}',
    description: 'Changed paths match the required patterns',
    params: ['matchedPaths'],
  },

  'pass.actor.is_human': {
    id: 'pass.actor.is_human',
    template: 'Actor {actor} is a human user',
    description: 'Actor is not a bot',
    params: ['actor'],
  },

  'pass.schema.valid': {
    id: 'pass.schema.valid',
    template: 'OpenAPI schema is valid',
    description: 'Schema validation passed',
  },

  // ==========================================================================
  // FAIL MESSAGES - ARTIFACT DOMAIN
  // ==========================================================================

  'fail.artifact.missing': {
    id: 'fail.artifact.missing',
    template: 'Missing {artifactType} artifacts: {missingPaths}',
    description: 'Required artifacts are missing',
    params: ['artifactType', 'missingPaths'],
  },

  'fail.artifact.not_updated': {
    id: 'fail.artifact.not_updated',
    template: '{artifactType} artifacts not updated: {outdatedPaths}',
    description: 'Required artifacts were not updated',
    params: ['artifactType', 'outdatedPaths'],
  },

  'fail.artifact.invalid_schema': {
    id: 'fail.artifact.invalid_schema',
    template: 'OpenAPI schema validation failed: {errorCount} error(s)',
    description: 'Schema validation failed',
    params: ['errorCount'],
  },

  // ==========================================================================
  // FAIL MESSAGES - GOVERNANCE DOMAIN
  // ==========================================================================

  'fail.approvals.insufficient': {
    id: 'fail.approvals.insufficient',
    template: 'Found {count} approval(s), required {minCount}',
    description: 'Insufficient approvals',
    params: ['count', 'minCount'],
  },

  'fail.approvals.no_human': {
    id: 'fail.approvals.no_human',
    template: 'No human approval found',
    description: 'No human approval present',
  },

  'fail.approvals.all_bots': {
    id: 'fail.approvals.all_bots',
    template: 'All approvals are from bots',
    description: 'All approvals are from bot accounts',
  },

  'fail.approvals.team_not_found': {
    id: 'fail.approvals.team_not_found',
    template: 'Required approval team "{teamName}" not found',
    description: 'Required approval team does not exist',
    params: ['teamName'],
  },

  // ==========================================================================
  // FAIL MESSAGES - SAFETY DOMAIN
  // ==========================================================================

  'fail.secrets.detected': {
    id: 'fail.secrets.detected',
    template: 'Detected {count} potential secret(s) in diff',
    description: 'Secrets detected in the diff',
    params: ['count'],
  },

  // ==========================================================================
  // FAIL MESSAGES - EVIDENCE DOMAIN
  // ==========================================================================

  'fail.pr_template.field_missing': {
    id: 'fail.pr_template.field_missing',
    template: 'PR template field "{fieldName}" is missing',
    description: 'Required PR template field not found',
    params: ['fieldName'],
  },

  'fail.checkruns.failed': {
    id: 'fail.checkruns.failed',
    template: '{failedCount} check run(s) failed: {failedNames}',
    description: 'Some check runs failed',
    params: ['failedCount', 'failedNames'],
  },

  'fail.checkruns.required_missing': {
    id: 'fail.checkruns.required_missing',
    template: 'Required check runs missing: {missingNames}',
    description: 'Required check runs not found',
    params: ['missingNames'],
  },

  // ==========================================================================
  // FAIL MESSAGES - TRIGGER DOMAIN
  // ==========================================================================

  'fail.path.no_match': {
    id: 'fail.path.no_match',
    template: 'No changed paths match required patterns',
    description: 'No changed paths match the required patterns',
  },

  'fail.actor.is_bot': {
    id: 'fail.actor.is_bot',
    template: 'Actor {actor} is a bot',
    description: 'Actor is a bot account',
    params: ['actor'],
  },

  // ==========================================================================
  // NOT_EVALUABLE MESSAGES
  // ==========================================================================

  'not_evaluable.policy_misconfig': {
    id: 'not_evaluable.policy_misconfig',
    template: 'Policy misconfiguration: {reason}',
    description: 'Policy is misconfigured',
    params: ['reason'],
  },

  'not_evaluable.no_artifact_registry': {
    id: 'not_evaluable.no_artifact_registry',
    template: 'No artifact registry configured for type: {artifactType}',
    description: 'Artifact registry not configured',
    params: ['artifactType'],
  },

  'not_evaluable.invalid_params': {
    id: 'not_evaluable.invalid_params',
    template: 'Invalid parameters: {reason}',
    description: 'Invalid comparator parameters',
    params: ['reason'],
  },

  'not_evaluable.api_error': {
    id: 'not_evaluable.api_error',
    template: 'API error: {error}',
    description: 'External API error',
    params: ['error'],
  },

  // ==========================================================================
  // SUPPRESSED MESSAGES
  // ==========================================================================

  'suppressed.overlay': {
    id: 'suppressed.overlay',
    template: 'Suppressed by overlay: {reason}',
    description: 'Obligation suppressed by overlay',
    params: ['reason'],
  },

  'suppressed.exemption': {
    id: 'suppressed.exemption',
    template: 'Exempted: {reason}',
    description: 'Obligation exempted',
    params: ['reason'],
  },

  // ==========================================================================
  // INFO MESSAGES
  // ==========================================================================

  'info.generic': {
    id: 'info.generic',
    template: '{message}',
    description: 'Generic informational message',
    params: ['message'],
  },

  // ==========================================================================
  // REMEDIATION MESSAGES - ARTIFACT DOMAIN
  // ==========================================================================

  'remediation.artifact.create_file': {
    id: 'remediation.artifact.create_file',
    template: 'Create {artifactType} artifact at: {path}',
    description: 'Create missing artifact file',
    params: ['artifactType', 'path'],
  },

  'remediation.artifact.update_file': {
    id: 'remediation.artifact.update_file',
    template: 'Update {artifactType} artifact at: {path}',
    description: 'Update outdated artifact file',
    params: ['artifactType', 'path'],
  },

  'remediation.artifact.register_service': {
    id: 'remediation.artifact.register_service',
    template: 'Register service in artifact registry: {serviceName}',
    description: 'Register service in artifact registry',
    params: ['serviceName'],
  },

  'remediation.artifact.fix_schema': {
    id: 'remediation.artifact.fix_schema',
    template: 'Fix schema validation errors in {path}',
    description: 'Fix schema validation errors',
    params: ['path'],
  },

  // ==========================================================================
  // REMEDIATION MESSAGES - GOVERNANCE DOMAIN
  // ==========================================================================

  'remediation.approvals.request_more': {
    id: 'remediation.approvals.request_more',
    template: 'Request {count} more approval(s)',
    description: 'Request additional approvals',
    params: ['count'],
  },

  'remediation.approvals.wait_for_approval': {
    id: 'remediation.approvals.wait_for_approval',
    template: 'Wait for reviewers to approve',
    description: 'Wait for approval',
  },

  'remediation.approvals.request_human_review': {
    id: 'remediation.approvals.request_human_review',
    template: 'Request review from a human team member',
    description: 'Request human review',
  },

  'remediation.approvals.request_team_review': {
    id: 'remediation.approvals.request_team_review',
    template: 'Request review from team: {teamName}',
    description: 'Request review from specific team',
    params: ['teamName'],
  },

  // ==========================================================================
  // REMEDIATION MESSAGES - SAFETY DOMAIN
  // ==========================================================================

  'remediation.secrets.remove_all': {
    id: 'remediation.secrets.remove_all',
    template: 'Remove all detected secrets from the diff',
    description: 'Remove secrets from diff',
  },

  'remediation.secrets.use_env_vars': {
    id: 'remediation.secrets.use_env_vars',
    template: 'Use environment variables or secret management systems',
    description: 'Use proper secret management',
  },

  'remediation.secrets.rotate_credentials': {
    id: 'remediation.secrets.rotate_credentials',
    template: 'Rotate any exposed credentials immediately',
    description: 'Rotate exposed credentials',
  },

  // ==========================================================================
  // REMEDIATION MESSAGES - EVIDENCE DOMAIN
  // ==========================================================================

  'remediation.pr_template.add_field': {
    id: 'remediation.pr_template.add_field',
    template: 'Add "{fieldName}" section to PR description',
    description: 'Add missing PR template field',
    params: ['fieldName'],
  },

  'remediation.pr_template.fill_field': {
    id: 'remediation.pr_template.fill_field',
    template: 'Fill in the "{fieldName}" section with details',
    description: 'Fill in PR template field',
    params: ['fieldName'],
  },

  'remediation.checkruns.fix_failures': {
    id: 'remediation.checkruns.fix_failures',
    template: 'Fix failing check runs: {checkNames}',
    description: 'Fix failing check runs',
    params: ['checkNames'],
  },

  'remediation.checkruns.wait_for_completion': {
    id: 'remediation.checkruns.wait_for_completion',
    template: 'Wait for check runs to complete',
    description: 'Wait for check runs',
  },

  // ==========================================================================
  // REMEDIATION MESSAGES - TRIGGER DOMAIN
  // ==========================================================================

  'remediation.path.modify_required_files': {
    id: 'remediation.path.modify_required_files',
    template: 'Modify files matching patterns: {patterns}',
    description: 'Modify required files',
    params: ['patterns'],
  },

  // ==========================================================================
  // EVIDENCE CONTEXT MESSAGES
  // ==========================================================================

  'evidence.file.missing': {
    id: 'evidence.file.missing',
    template: 'Missing for service: {service}. Closest matches: {closestMatches}',
    description: 'File missing with context',
    params: ['service', 'closestMatches'],
  },

  'evidence.file.present': {
    id: 'evidence.file.present',
    template: 'Service: {service}',
    description: 'File present with service context',
    params: ['service'],
  },

  'evidence.file.outdated': {
    id: 'evidence.file.outdated',
    template: 'Not updated for service: {service}',
    description: 'File outdated with service context',
    params: ['service'],
  },

  'evidence.approval.by_user': {
    id: 'evidence.approval.by_user',
    template: 'Approval by {user}',
    description: 'Approval evidence',
    params: ['user'],
  },

  'evidence.checkrun.failed': {
    id: 'evidence.checkrun.failed',
    template: 'Check run "{name}" failed',
    description: 'Failed check run evidence',
    params: ['name'],
  },

  'evidence.secret.detected': {
    id: 'evidence.secret.detected',
    template: 'Hash: {hash}',
    description: 'Secret detection evidence',
    params: ['hash'],
  },

  'evidence.secret.pattern': {
    id: 'evidence.secret.pattern',
    template: 'Pattern: {pattern}',
    description: 'Secret pattern context',
    params: ['pattern'],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all message IDs in the catalog
 */
export function getAllMessageIds(): string[] {
  return Object.keys(MESSAGE_CATALOG);
}

/**
 * Get all messages in a specific category
 */
export function getMessagesByCategory(category: string): MessageTemplate[] {
  return Object.values(MESSAGE_CATALOG).filter(msg => msg.id.startsWith(category));
}

/**
 * Validate that a message ID exists
 */
export function isValidMessageId(messageId: string): boolean {
  return messageId in MESSAGE_CATALOG;
}

/**
 * Get message statistics
 */
export function getMessageStats(): {
  total: number;
  byCategory: Record<string, number>;
} {
  const stats = {
    total: Object.keys(MESSAGE_CATALOG).length,
    byCategory: {} as Record<string, number>,
  };

  for (const messageId of Object.keys(MESSAGE_CATALOG)) {
    const category = messageId.split('.')[0];
    stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
  }

  return stats;
}

// ============================================================================
// DOMAIN-SPECIFIC HELPERS
// ============================================================================

/**
 * Format artifact-related messages
 */
export const ArtifactMessages = {
  missing: (artifactType: string, missingPaths: string) =>
    formatMessage('fail.artifact.missing', { artifactType, missingPaths }),

  notUpdated: (artifactType: string, outdatedPaths: string) =>
    formatMessage('fail.artifact.not_updated', { artifactType, outdatedPaths }),

  allPresent: (artifactType: string, paths: string) =>
    formatMessage('pass.artifact.all_present', { artifactType, paths }),

  allUpdated: (artifactType: string, paths: string) =>
    formatMessage('pass.artifact.updated', { artifactType, paths }),
};

/**
 * Format approval-related messages
 */
export const ApprovalMessages = {
  insufficient: (count: number, minCount: number) =>
    formatMessage('fail.approvals.insufficient', { count, minCount }),

  sufficient: (count: number, minCount: number) =>
    formatMessage('pass.approvals.sufficient', { count, minCount }),

  noHuman: () =>
    formatMessage('fail.approvals.no_human'),

  allBots: () =>
    formatMessage('fail.approvals.all_bots'),

  humanPresent: (count: number) =>
    formatMessage('pass.approvals.human_present', { count }),
};

/**
 * Format secret-related messages
 */
export const SecretMessages = {
  detected: (count: number) =>
    formatMessage('fail.secrets.detected', { count }),

  noneDetected: () =>
    formatMessage('pass.secrets.none_detected'),
};

/**
 * Format remediation messages
 */
export const RemediationMessages = {
  artifact: {
    createFile: (artifactType: string, path: string) =>
      formatMessage('remediation.artifact.create_file', { artifactType, path }),

    updateFile: (artifactType: string, path: string) =>
      formatMessage('remediation.artifact.update_file', { artifactType, path }),
  },

  approvals: {
    requestMore: (count: number) =>
      formatMessage('remediation.approvals.request_more', { count }),

    waitForApproval: () =>
      formatMessage('remediation.approvals.wait_for_approval'),

    requestHumanReview: () =>
      formatMessage('remediation.approvals.request_human_review'),
  },

  secrets: {
    removeAll: () =>
      formatMessage('remediation.secrets.remove_all'),

    useEnvVars: () =>
      formatMessage('remediation.secrets.use_env_vars'),

    rotateCredentials: () =>
      formatMessage('remediation.secrets.rotate_credentials'),
  },
};

