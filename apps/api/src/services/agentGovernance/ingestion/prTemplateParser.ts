/**
 * PR Template Parser
 * Extracts intent artifact from PR description YAML blocks
 */

import yaml from 'yaml';
import type { Capability, Constraints, ExpectedSideEffects, RiskAcknowledgement } from '../../../types/agentGovernance.js';

export interface PRTemplateIntentBlock {
  author?: string;
  authorType?: 'HUMAN' | 'AGENT' | 'UNKNOWN';
  agentIdentity?: {
    id: string;
    version: string;
    platform?: string;
  };
  requestedCapabilities?: Capability[];
  constraints?: Constraints;
  affectedServices?: string[];
  expectedSideEffects?: ExpectedSideEffects;
  riskAcknowledgements?: RiskAcknowledgement[];
  links?: {
    ticket?: string;
    design_doc?: string;
    prd?: string;
    runbook?: string;
    slack_thread?: string;
  };
}

/**
 * Extract YAML blocks from PR description
 * Looks for blocks like:
 * ```yaml:intent
 * author: @username
 * authorType: AGENT
 * ...
 * ```
 */
export function extractYAMLBlocks(prDescription: string): string[] {
  const yamlBlockRegex = /```(?:yaml:intent|yaml)\n([\s\S]*?)```/g;
  const blocks: string[] = [];
  
  let match;
  while ((match = yamlBlockRegex.exec(prDescription)) !== null) {
    blocks.push(match[1]);
  }
  
  return blocks;
}

/**
 * Parse YAML block into intent artifact data
 */
export function parseYAMLBlock(yamlContent: string): PRTemplateIntentBlock | null {
  try {
    const parsed = yaml.parse(yamlContent);
    
    // Basic validation - must have at least author and capabilities
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    
    return parsed as PRTemplateIntentBlock;
  } catch (error) {
    console.error('[prTemplateParser] Failed to parse YAML:', error);
    return null;
  }
}

/**
 * Extract intent artifact from PR description
 * Returns the first valid intent block found
 */
export function extractIntentFromPRDescription(prDescription: string): PRTemplateIntentBlock | null {
  const yamlBlocks = extractYAMLBlocks(prDescription);
  
  for (const block of yamlBlocks) {
    const parsed = parseYAMLBlock(block);
    if (parsed) {
      return parsed;
    }
  }
  
  return null;
}

/**
 * Extract intent from PR metadata (title, labels, etc.)
 * Provides fallback when no explicit YAML block is present
 */
export function inferIntentFromPRMetadata(pr: {
  title: string;
  body: string;
  labels: string[];
  user: { login: string; type: string };
}): Partial<PRTemplateIntentBlock> {
  const intent: Partial<PRTemplateIntentBlock> = {
    author: pr.user.login,
    authorType: pr.user.type === 'Bot' ? 'AGENT' : 'HUMAN',
  };
  
  // Infer affected services from labels
  const serviceLabels = pr.labels.filter(label => 
    label.startsWith('service:') || label.startsWith('affects:')
  );
  if (serviceLabels.length > 0) {
    intent.affectedServices = serviceLabels.map(label => 
      label.replace(/^(service:|affects:)/, '')
    );
  }
  
  // Infer constraints from labels
  const constraints: Constraints = {};
  if (pr.labels.includes('read-only')) {
    constraints.read_only = true;
  }
  if (pr.labels.includes('no-infra')) {
    constraints.no_new_infra = true;
  }
  if (pr.labels.includes('requires-tests')) {
    constraints.require_tests = true;
  }
  if (pr.labels.includes('requires-docs')) {
    constraints.require_docs = true;
  }
  
  if (Object.keys(constraints).length > 0) {
    intent.constraints = constraints;
  }
  
  // Infer ticket link from PR body
  const ticketMatch = pr.body.match(/(?:Fixes|Closes|Resolves|Related to):\s*([A-Z]+-\d+)/i);
  if (ticketMatch) {
    intent.links = {
      ticket: ticketMatch[1],
    };
  }
  
  return intent;
}

/**
 * Merge explicit intent with inferred metadata
 * Explicit intent takes precedence
 */
export function mergeIntentWithMetadata(
  explicitIntent: PRTemplateIntentBlock | null,
  inferredIntent: Partial<PRTemplateIntentBlock>
): PRTemplateIntentBlock {
  return {
    ...inferredIntent,
    ...explicitIntent,
    // Merge arrays
    affectedServices: [
      ...(inferredIntent.affectedServices || []),
      ...(explicitIntent?.affectedServices || []),
    ],
    // Merge constraints
    constraints: {
      ...inferredIntent.constraints,
      ...explicitIntent?.constraints,
    },
    // Merge links
    links: {
      ...inferredIntent.links,
      ...explicitIntent?.links,
    },
  };
}

