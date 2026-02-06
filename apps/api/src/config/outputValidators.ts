/**
 * Output Validators and Pre-Validators
 * 
 * Point 3: Output-specific validators (prevent damage to specific doc systems)
 * Point 7: Source-specific pre-validators (safety checks before processing)
 * 
 * @see Points 3 & 7 in Multi-Source Enrichment Plan
 */

import type { DocSystem, InputSourceType } from '../services/docs/adapters/types.js';
import yaml from 'js-yaml';

// ============================================================================
// Point 3: Output-Specific Validators
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate OpenAPI/Swagger schema
 */
export function validateOpenAPISchema(content: string): ValidationResult {
  const errors: string[] = [];
  
  try {
    const schema = yaml.load(content) as any;
    
    // Check required OpenAPI fields
    if (!schema.openapi && !schema.swagger) {
      errors.push('Missing openapi or swagger version field');
    }
    
    if (!schema.info) {
      errors.push('Missing info object');
    }
    
    if (!schema.paths && !schema.components) {
      errors.push('Must have either paths or components');
    }
    
    // Validate paths structure
    if (schema.paths) {
      for (const [path, methods] of Object.entries(schema.paths)) {
        if (!path.startsWith('/')) {
          errors.push(`Path "${path}" must start with /`);
        }
        
        if (typeof methods !== 'object') {
          errors.push(`Path "${path}" must have methods object`);
        }
      }
    }
    
  } catch (err: any) {
    errors.push(`YAML parse error: ${err.message}`);
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Validate Backstage catalog-info.yaml
 */
export function validateBackstageYAML(content: string): ValidationResult {
  const errors: string[] = [];
  
  try {
    const catalog = yaml.load(content) as any;
    
    // Check required Backstage fields
    if (!catalog.apiVersion) {
      errors.push('Missing apiVersion field');
    }
    
    if (!catalog.kind) {
      errors.push('Missing kind field');
    }
    
    if (!catalog.metadata) {
      errors.push('Missing metadata object');
    } else {
      if (!catalog.metadata.name) {
        errors.push('Missing metadata.name');
      }
    }
    
    if (!catalog.spec) {
      errors.push('Missing spec object');
    } else {
      // Validate spec based on kind
      if (catalog.kind === 'Component' && !catalog.spec.type) {
        errors.push('Component must have spec.type');
      }
      
      if (catalog.kind === 'Component' && !catalog.spec.lifecycle) {
        errors.push('Component must have spec.lifecycle');
      }
    }
    
  } catch (err: any) {
    errors.push(`YAML parse error: ${err.message}`);
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Validate JSDoc/TSDoc code comments
 */
export function validateJSDoc(content: string): ValidationResult {
  const errors: string[] = [];
  
  // Check for basic JSDoc structure
  if (!content.includes('/**') || !content.includes('*/')) {
    errors.push('Missing JSDoc comment block');
  }
  
  // Check for balanced braces in @param types
  const paramMatches = content.match(/@param\s+\{[^}]*\}/g);
  if (paramMatches) {
    for (const match of paramMatches) {
      const openBraces = (match.match(/\{/g) || []).length;
      const closeBraces = (match.match(/\}/g) || []).length;
      if (openBraces !== closeBraces) {
        errors.push(`Unbalanced braces in: ${match}`);
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Validate GitBook markdown structure
 */
export function validateGitBookMarkdown(content: string): ValidationResult {
  const errors: string[] = [];
  
  // Check for balanced code fences
  const codeFences = content.match(/```/g);
  if (codeFences && codeFences.length % 2 !== 0) {
    errors.push('Unbalanced code fences (```)');
  }
  
  // Check for valid heading hierarchy
  const headings = content.match(/^#{1,6}\s+.+$/gm);
  if (headings) {
    let prevLevel = 0;
    for (const heading of headings) {
      const level = heading.match(/^#+/)?.[0].length || 0;
      if (level > prevLevel + 1) {
        errors.push(`Heading level skip: ${heading}`);
      }
      prevLevel = level;
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Get output validators for a doc system
 */
export function getOutputValidators(docSystem: DocSystem): Array<(content: string) => ValidationResult> {
  const validators: Record<DocSystem, Array<(content: string) => ValidationResult>> = {
    github_swagger: [validateOpenAPISchema],
    backstage: [validateBackstageYAML],
    github_code_comments: [validateJSDoc],
    gitbook: [validateGitBookMarkdown],
    github_readme: [validateGitBookMarkdown],  // Markdown validation
    confluence: [],  // Confluence has its own validation
    notion: [],      // Notion has its own validation
  };

  return validators[docSystem] || [];
}

// ============================================================================
// Point 7: Source-Specific Pre-Validators
// ============================================================================

export interface PreValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Pre-validate GitHub PR signal before processing
 */
export function preValidateGitHubPR(signal: {
  merged?: boolean;
  changedFiles?: Array<{ filename: string }>;
  totalChanges?: number;
}): PreValidationResult {
  if (!signal.merged) {
    return { valid: false, reason: 'PR not merged' };
  }

  if (!signal.changedFiles || signal.changedFiles.length === 0) {
    return { valid: false, reason: 'No files changed' };
  }

  if ((signal.totalChanges ?? 0) === 0) {
    return { valid: false, reason: 'No lines changed' };
  }

  return { valid: true };
}

/**
 * Pre-validate PagerDuty incident before processing
 */
export function preValidatePagerDutyIncident(signal: {
  status?: string;
  service?: string;
  durationMinutes?: number;
}): PreValidationResult {
  if (signal.status !== 'resolved') {
    return { valid: false, reason: 'Incident not resolved' };
  }

  if (!signal.service) {
    return { valid: false, reason: 'No service identified' };
  }

  return { valid: true };
}

/**
 * Pre-validate Slack cluster before processing
 */
export function preValidateSlackCluster(signal: {
  clusterSize?: number;
  uniqueAskers?: number;
  questions?: Array<{ text: string }>;
}): PreValidationResult {
  if ((signal.clusterSize ?? 0) < 2) {
    return { valid: false, reason: 'Cluster too small' };
  }

  if ((signal.uniqueAskers ?? 0) < 2) {
    return { valid: false, reason: 'Not enough unique askers' };
  }

  if (!signal.questions || signal.questions.length === 0) {
    return { valid: false, reason: 'No questions in cluster' };
  }

  return { valid: true };
}

/**
 * Pre-validate Datadog alert before processing
 */
export function preValidateDatadogAlert(signal: {
  status?: string;
  monitorName?: string;
  severity?: string;
}): PreValidationResult {
  if (!signal.monitorName) {
    return { valid: false, reason: 'No monitor name' };
  }

  if (!signal.severity) {
    return { valid: false, reason: 'No severity level' };
  }

  return { valid: true };
}

/**
 * Get pre-validators for a source type
 */
export function getPreValidators(sourceType: InputSourceType): Array<(signal: any) => PreValidationResult> {
  const validators: Record<InputSourceType, Array<(signal: any) => PreValidationResult>> = {
    github_pr: [preValidateGitHubPR],
    pagerduty_incident: [preValidatePagerDutyIncident],
    slack_cluster: [preValidateSlackCluster],
    datadog_alert: [preValidateDatadogAlert],
    github_iac: [preValidateGitHubPR],  // Same as PR
    github_codeowners: [],  // Always valid
  };

  return validators[sourceType] || [];
}

/**
 * Validate patch for a specific output doc system
 * Point 3: Output-Specific Validators
 */
export function validatePatchForOutput(
  docSystem: DocSystem,
  patchedContent: string,
  driftType: string
): ValidationResult {
  const validators = getOutputValidators(docSystem);
  const errors: string[] = [];

  // Run all validators for this doc system
  for (const validator of validators) {
    const result = validator(patchedContent);
    if (!result.valid) {
      errors.push(...result.errors);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Run pre-validation for a source type
 * Point 7: Source-Specific Pre-Validators
 */
export function runPreValidation(
  sourceType: InputSourceType,
  signal: {
    merged?: boolean;
    hasNotes?: boolean;
    hasEvidence?: boolean;
    confidence?: number;
    changedFiles?: Array<{ filename: string }>;
    totalChanges?: number;
    // PagerDuty fields
    status?: string;
    service?: string;
    durationMinutes?: number;
    // Slack cluster fields
    clusterSize?: number;
    uniqueAskers?: number;
    questions?: Array<{ text: string }>;
    // Datadog fields
    monitorName?: string;
    severity?: string;
  }
): PreValidationResult & { errors?: string[] } {
  const validators = getPreValidators(sourceType);
  const errors: string[] = [];

  // Run all pre-validators for this source type
  for (const validator of validators) {
    const result = validator(signal);
    if (!result.valid) {
      errors.push(result.reason || 'Pre-validation failed');
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

