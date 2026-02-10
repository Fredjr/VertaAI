/**
 * Runtime Validator for Extracted Data
 * 
 * Validates that webhook handlers populate ALL required fields in the extracted object.
 * This prevents data contract violations (Bugs #1 and #2) across all 35 drift combinations.
 * 
 * CRITICAL: Call this validator BEFORE creating SignalEvent in webhook handlers.
 */

import type {
  GitHubPRExtracted,
  PagerDutyIncidentExtracted,
  SlackClusterExtracted,
  DatadogAlertExtracted,
} from '../../types/extracted-schemas.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// GitHub PR Validation
// ============================================================================

export function validateGitHubPRExtracted(data: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields for pre-validation (outputValidators.ts:193-211)
  if (typeof data.merged !== 'boolean') {
    errors.push('merged: must be boolean (required by preValidateGitHubPR)');
  }

  if (!Array.isArray(data.changedFiles)) {
    errors.push('changedFiles: must be array (required by preValidateGitHubPR)');
  } else if (data.changedFiles.length === 0) {
    warnings.push('changedFiles: empty array (may fail pre-validation)');
  }

  if (typeof data.totalChanges !== 'number') {
    errors.push('totalChanges: must be number (required by preValidateGitHubPR)');
  }

  // Required fields for deterministic comparison (baseline/comparison.ts)
  if (typeof data.diff !== 'string') {
    errors.push('diff: must be string (required by deterministic comparison)');
  }

  // Required PR metadata
  if (typeof data.prNumber !== 'number') {
    errors.push('prNumber: must be number');
  }

  if (typeof data.prTitle !== 'string') {
    errors.push('prTitle: must be string');
  }

  if (typeof data.prBody !== 'string') {
    warnings.push('prBody: should be string (optional but recommended)');
  }

  if (typeof data.authorLogin !== 'string') {
    errors.push('authorLogin: must be string');
  }

  if (typeof data.baseBranch !== 'string') {
    errors.push('baseBranch: must be string');
  }

  if (typeof data.headBranch !== 'string') {
    errors.push('headBranch: must be string');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ============================================================================
// PagerDuty Incident Validation
// ============================================================================

export function validatePagerDutyIncidentExtracted(data: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields for pre-validation (outputValidators.ts:216-230)
  if (typeof data.status !== 'string') {
    errors.push('status: must be string (required by preValidatePagerDutyIncident)');
  } else if (data.status !== 'resolved') {
    warnings.push('status: should be "resolved" (may fail pre-validation)');
  }

  if (typeof data.service !== 'string') {
    errors.push('service: must be string (required by preValidatePagerDutyIncident)');
  }

  // Required fields for deterministic comparison
  if (!Array.isArray(data.responders)) {
    errors.push('responders: must be array (required by deterministic comparison)');
  }

  if (!Array.isArray(data.timeline)) {
    errors.push('timeline: must be array (required by deterministic comparison)');
  }

  if (typeof data.escalationPolicy !== 'string') {
    errors.push('escalationPolicy: must be string');
  }

  if (!Array.isArray(data.teams)) {
    errors.push('teams: must be array');
  }

  // Required incident metadata
  if (typeof data.incidentId !== 'string') {
    errors.push('incidentId: must be string');
  }

  if (typeof data.incidentTitle !== 'string') {
    errors.push('incidentTitle: must be string');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ============================================================================
// Slack Cluster Validation
// ============================================================================

export function validateSlackClusterExtracted(data: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields for pre-validation (outputValidators.ts:235-253)
  if (typeof data.clusterSize !== 'number') {
    errors.push('clusterSize: must be number (required by preValidateSlackCluster)');
  } else if (data.clusterSize < 2) {
    warnings.push('clusterSize: should be >= 2 (may fail pre-validation)');
  }

  if (typeof data.uniqueAskers !== 'number') {
    errors.push('uniqueAskers: must be number (required by preValidateSlackCluster)');
  } else if (data.uniqueAskers < 2) {
    warnings.push('uniqueAskers: should be >= 2 (may fail pre-validation)');
  }

  if (!Array.isArray(data.questions)) {
    errors.push('questions: must be array (required by preValidateSlackCluster)');
  } else if (data.questions.length === 0) {
    warnings.push('questions: empty array (may fail pre-validation)');
  }

  // Required fields for deterministic comparison
  if (!Array.isArray(data.messages)) {
    errors.push('messages: must be array (required by deterministic comparison)');
  }

  if (!Array.isArray(data.participants)) {
    errors.push('participants: must be array');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ============================================================================
// Datadog/Grafana Alert Validation
// ============================================================================

export function validateDatadogAlertExtracted(data: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields for pre-validation (outputValidators.ts:258-272)
  if (typeof data.monitorName !== 'string') {
    errors.push('monitorName: must be string (required by preValidateDatadogAlert)');
  }

  if (typeof data.severity !== 'string') {
    errors.push('severity: must be string (required by preValidateDatadogAlert)');
  }

  // Required fields for deterministic comparison
  if (typeof data.alertType !== 'string') {
    errors.push('alertType: must be string (required by deterministic comparison)');
  }

  if (!Array.isArray(data.tags)) {
    errors.push('tags: must be array');
  }

  // Required alert metadata
  if (typeof data.alertId !== 'string') {
    errors.push('alertId: must be string');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ============================================================================
// Main Validation Entry Point
// ============================================================================

export function validateExtractedData(
  sourceType: string,
  extracted: any
): ValidationResult {
  switch (sourceType) {
    case 'github_pr':
    case 'github_iac':  // Same validation as github_pr
      return validateGitHubPRExtracted(extracted);

    case 'pagerduty_incident':
      return validatePagerDutyIncidentExtracted(extracted);

    case 'slack_cluster':
      return validateSlackClusterExtracted(extracted);

    case 'datadog_alert':
    case 'grafana_alert':  // Same validation as datadog_alert
      return validateDatadogAlertExtracted(extracted);

    case 'github_codeowners':
      // CODEOWNERS has minimal requirements (always valid)
      return { valid: true, errors: [], warnings: [] };

    default:
      return {
        valid: false,
        errors: [`Unknown source type: ${sourceType}`],
        warnings: [],
      };
  }
}
