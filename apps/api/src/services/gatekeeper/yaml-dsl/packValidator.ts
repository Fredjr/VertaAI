/**
 * Pack YAML Validator
 * Migration Plan v5.0 - Sprint 2, Task 2.1
 * Phase 1.1: Enhanced with JSON Schema validation
 */

import yaml from 'yaml';
import { z } from 'zod';
import { ComparatorId } from './types.js';
import { schemaValidator, ValidationResult as SchemaValidationResult } from './schemaValidator.js';

// PHASE 2.3: Condition schemas for fact-based obligations
const ComparisonOperatorSchema = z.enum([
  '==', '!=', '>', '>=', '<', '<=',
  'in', 'contains', 'containsAll',
  'matches', 'startsWith', 'endsWith'
]);

const LogicalOperatorSchema = z.enum(['AND', 'OR', 'NOT']);

// Simple condition: fact + operator + value
const SimpleConditionSchema: z.ZodType<any> = z.object({
  fact: z.string(),
  operator: ComparisonOperatorSchema,
  value: z.any(),
});

// Composite condition: logical operator + child conditions (recursive)
const CompositeConditionSchema: z.ZodType<any> = z.lazy(() => z.object({
  operator: LogicalOperatorSchema,
  conditions: z.array(z.union([SimpleConditionSchema, CompositeConditionSchema])),
}));

// Condition can be simple or composite
const ConditionSchema = z.union([SimpleConditionSchema, CompositeConditionSchema]);

// Pack YAML Schema (Zod)
export const PackYAMLSchema = z.object({
  apiVersion: z.literal('verta.ai/v1'),
  kind: z.literal('PolicyPack'),
  
  metadata: z.object({
    id: z.string(),
    name: z.string(),
    version: z.string(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    // PHASE 1 FIX: Align enum values with spec
    packMode: z.enum(['observe', 'enforce']).optional(),
    strictness: z.enum(['permissive', 'balanced', 'strict']).optional(),
    // PHASE 1 FIX: Add missing fields from spec
    owner: z.string().optional(),
    defaultsRef: z.string().optional(),
    // PHASE 1.2: Enhanced metadata fields
    status: z.enum(['DRAFT', 'IN_REVIEW', 'ACTIVE', 'DEPRECATED', 'ARCHIVED']).optional(),
    owners: z.array(z.object({
      team: z.string().optional(),
      user: z.string().optional(),
    })).optional(),
    labels: z.record(z.string()).optional(),
    audit: z.object({
      createdBy: z.string().optional(),
      createdAt: z.string().optional(),
      updatedAt: z.string().optional(),
      updatedBy: z.string().optional(),
    }).optional(),
    notes: z.string().optional(),
    // PHASE 1.3: Scope precedence
    scopePriority: z.number().int().min(0).max(100).optional(),
    scopeMergeStrategy: z.enum(['MOST_RESTRICTIVE', 'HIGHEST_PRIORITY', 'EXPLICIT']).optional(),
    // PHASE 1.4: Pack-level defaults
    defaults: z.object({
      timeouts: z.object({
        comparatorTimeout: z.number().int().min(0).optional(),
        totalEvaluationTimeout: z.number().int().min(0).optional(),
      }).optional(),
      severity: z.object({
        defaultLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        escalationThreshold: z.number().int().min(0).optional(),
      }).optional(),
      approvals: z.object({
        minCount: z.number().int().min(0).optional(),
        requiredTeams: z.array(z.string()).optional(),
        requiredUsers: z.array(z.string()).optional(),
      }).optional(),
      obligations: z.object({
        defaultDecisionOnFail: z.enum(['block', 'warn', 'pass']).optional(),
        defaultSeverity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      }).optional(),
      triggers: z.object({
        defaultPrEvents: z.array(z.enum(['opened', 'synchronize', 'reopened', 'labeled'])).optional(),
      }).optional(),
    }).optional(),
  }),

  scope: z.object({
    type: z.enum(['workspace', 'service', 'repo']),
    ref: z.string().optional(),
    branches: z.object({
      include: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
    }).optional(),
    // PHASE 1 FIX: Add repos configuration from spec
    repos: z.object({
      include: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
    }).optional(),
    // PHASE 1 FIX: Add labeled event support
    prEvents: z.array(z.enum(['opened', 'synchronize', 'reopened', 'labeled'])).optional(),
    // PHASE 1 FIX: Change actorSignals to object structure per spec
    actorSignals: z.object({
      detectAgentAuthorship: z.boolean().optional(),
      agentPatterns: z.array(z.string()).optional(),
      botUsers: z.array(z.string()).optional(),
    }).optional(),
  }),

  // PHASE 1 FIX: Add comparators.library field from spec
  comparators: z.object({
    library: z.string().optional(),  // Version pin for comparator library
  }).optional(),

  artifacts: z.object({
    requiredTypes: z.array(z.string()).optional(),
    definitions: z.record(z.object({
      // PHASE 1 FIX: Rename 'type' to 'kind' per spec
      kind: z.enum(['openapi', 'readme', 'runbook', 'backstage', 'dashboard', 'terraform', 'custom']),
      // PHASE 1 FIX: Rename 'glob' to 'matchAny' per spec
      matchAny: z.array(z.string()).optional(),
      path: z.string().optional(),
      required: z.boolean().optional(),
      validators: z.array(z.string()).optional(),
    })).optional(),
  }).optional(),

  rules: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    // PHASE 1 FIX: Add enabled field from spec
    enabled: z.boolean().optional(),

    trigger: z.object({
      anyChangedPaths: z.array(z.string()).optional(),
      allChangedPaths: z.array(z.string()).optional(),
      anyFileExtensions: z.array(z.string()).optional(),
      allOf: z.array(z.any()).optional(),
      anyOf: z.array(z.any()).optional(),
      // PHASE 1 FIX: Add always and anyChangedPathsRef from spec
      always: z.boolean().optional(),
      anyChangedPathsRef: z.string().optional(),  // Reference to workspace defaults paths
    }),

    obligations: z.array(z.object({
      // PHASE 1 FIX: Support both 'comparator' (spec) and 'comparatorId' (legacy) for backward compatibility
      comparator: z.nativeEnum(ComparatorId).optional(),
      comparatorId: z.nativeEnum(ComparatorId).optional(),
      params: z.record(z.any()).optional(),
      // PHASE 2.3: Support fact-based conditions as alternative to comparators
      condition: ConditionSchema.optional(),
      conditions: z.array(ConditionSchema).optional(),
      // PHASE 2.4: Auto-generated condition (for hybrid mode)
      _autoCondition: ConditionSchema.optional(),  // Internal field, auto-populated from comparator
      decisionOnFail: z.enum(['pass', 'warn', 'block']),
      decisionOnUnknown: z.enum(['pass', 'warn', 'block']).optional(),
      message: z.string().optional(),
      // PHASE 1 FIX: Add severity field from spec
      severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    })).refine(
      (obligations) => obligations.every(o =>
        o.comparator || o.comparatorId || o.condition || o.conditions
      ),
      { message: 'Each obligation must have either comparator/comparatorId or condition/conditions' }
    ),

    skipIf: z.object({
      allChangedPaths: z.array(z.string()).optional(),
      labels: z.array(z.string()).optional(),
      prBodyContains: z.array(z.string()).optional(),
    }).optional(),

    // CRITICAL FIX (Gap #5): excludePaths to filter files before trigger evaluation
    excludePaths: z.array(z.string()).optional(),
  })),

  evaluation: z.object({
    // PHASE 1 FIX: Align enum values with spec (soft_fail/hard_fail)
    externalDependencyMode: z.enum(['soft_fail', 'hard_fail']).optional(),
    budgets: z.object({
      maxTotalMs: z.number().optional(),
      perComparatorTimeoutMs: z.number().optional(),
      maxGitHubApiCalls: z.number().optional(),
    }).optional(),
    unknownArtifactMode: z.enum(['warn', 'block', 'pass']).optional(),
    // PHASE 2 FIX: Add maxFindings and maxEvidenceSnippetsPerFinding from spec
    maxFindings: z.number().optional(),
    maxEvidenceSnippetsPerFinding: z.number().optional(),
  }).optional(),

  routing: z.object({
    github: z.object({
      checkRunName: z.string().optional(),
      conclusionMapping: z.object({
        pass: z.enum(['success', 'neutral']),
        warn: z.enum(['success', 'neutral', 'action_required']),
        block: z.enum(['failure', 'action_required']),
      }).optional(),
      // PHASE 2 FIX: Add postSummaryComment and annotateFiles from spec
      postSummaryComment: z.boolean().optional(),
      annotateFiles: z.boolean().optional(),
    }).optional(),
  }).optional(),

  spawnTrackB: z.object({
    enabled: z.boolean(),
    when: z.array(z.object({
      onDecision: z.enum(['pass', 'warn', 'block']),
    })).optional(),
    createRemediationCase: z.boolean().optional(),
    remediationDefaults: z.object({
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      // PHASE 2 FIX: Add targetSystems and approvalChannelRef from spec
      targetSystems: z.array(z.string()).optional(),
      approvalChannelRef: z.string().optional(),
    }).optional(),
    grouping: z.object({
      strategy: z.enum(['by-drift-type-and-service', 'by-rule', 'by-finding-code']),
      maxPerPR: z.number(),
    }).optional(),
  }).optional(),
});

export type PackYAML = z.infer<typeof PackYAMLSchema>;

/**
 * Parse pack YAML with validation
 *
 * @param yamlText - YAML string to parse
 * @returns Parsed and validated PackYAML object
 * @throws Error if parsing or validation fails
 */
export function parsePackYAML(yamlText: string): PackYAML {
  const parsed = yaml.parse(yamlText);
  return PackYAMLSchema.parse(parsed);
}

/**
 * Validate pack YAML with two-layer validation:
 * 1. JSON Schema validation (structural correctness)
 * 2. Zod validation (business logic + type safety)
 *
 * This provides better error messages and catches issues earlier.
 *
 * @param yamlText - YAML string to validate
 * @returns Validation result with detailed errors
 */
export function validatePackYAML(yamlText: string): { valid: boolean; errors?: any[] } {
  try {
    // Step 1: Parse YAML
    const parsed = yaml.parse(yamlText);

    // Step 2: JSON Schema validation (structural)
    const schemaResult = schemaValidator.validatePack(parsed);
    if (!schemaResult.valid) {
      return {
        valid: false,
        errors: schemaResult.errors?.map(e => ({
          path: e.path.split('.'),
          message: e.message,
          keyword: e.keyword,
        })) || [],
      };
    }

    // Step 3: Zod validation (business logic + type safety)
    // This catches things like invalid comparator IDs, etc.
    PackYAMLSchema.parse(parsed);

    return { valid: true };
  } catch (error: any) {
    // Handle Zod validation errors
    if (error.errors) {
      return { valid: false, errors: error.errors };
    }
    // Handle YAML parsing errors
    return { valid: false, errors: [{ message: error.message, path: [] }] };
  }
}

