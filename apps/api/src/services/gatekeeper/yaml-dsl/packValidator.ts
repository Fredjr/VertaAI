/**
 * Pack YAML Validator
 * Migration Plan v5.0 - Sprint 2, Task 2.1
 */

import yaml from 'yaml';
import { z } from 'zod';
import { ComparatorId } from './types.js';

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
    packMode: z.enum(['enforce', 'warn_only', 'audit_only']).optional(),
    strictness: z.enum(['strict', 'lenient']).optional(),
  }),

  scope: z.object({
    type: z.enum(['workspace', 'service', 'repo']),
    ref: z.string().optional(),
    branches: z.object({
      include: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
    }).optional(),
    prEvents: z.array(z.enum(['opened', 'synchronize', 'reopened'])).optional(),
    actorSignals: z.array(z.string()).optional(),
  }),

  artifacts: z.object({
    requiredTypes: z.array(z.string()).optional(),
    definitions: z.record(z.object({
      type: z.string(),
      path: z.string().optional(),
      glob: z.string().optional(),
      required: z.boolean().optional(),
      validators: z.array(z.string()).optional(),
    })).optional(),
  }).optional(),

  rules: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),

    trigger: z.object({
      anyChangedPaths: z.array(z.string()).optional(),
      allChangedPaths: z.array(z.string()).optional(),
      anyFileExtensions: z.array(z.string()).optional(),
      allOf: z.array(z.any()).optional(),
      anyOf: z.array(z.any()).optional(),
    }),

    obligations: z.array(z.object({
      comparatorId: z.nativeEnum(ComparatorId),  // CRITICAL: Use native enum
      params: z.record(z.any()).optional(),
      decisionOnFail: z.enum(['pass', 'warn', 'block']),
      decisionOnUnknown: z.enum(['pass', 'warn', 'block']).optional(),
      message: z.string().optional(),
    })),

    skipIf: z.object({
      allChangedPaths: z.array(z.string()).optional(),
      labels: z.array(z.string()).optional(),
      prBodyContains: z.array(z.string()).optional(),
    }).optional(),

    // CRITICAL FIX (Gap #5): excludePaths to filter files before trigger evaluation
    excludePaths: z.array(z.string()).optional(),
  })),

  evaluation: z.object({
    externalDependencyMode: z.enum(['fail_open', 'fail_closed']).optional(),
    budgets: z.object({
      maxTotalMs: z.number().optional(),
      perComparatorTimeoutMs: z.number().optional(),
      maxGitHubApiCalls: z.number().optional(),
    }).optional(),
    unknownArtifactMode: z.enum(['warn', 'block', 'pass']).optional(),
  }).optional(),

  routing: z.object({
    github: z.object({
      checkRunName: z.string().optional(),
      conclusionMapping: z.object({
        pass: z.enum(['success', 'neutral']),
        warn: z.enum(['success', 'neutral', 'action_required']),
        block: z.enum(['failure', 'action_required']),
      }).optional(),
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
    }).optional(),
    grouping: z.object({
      strategy: z.enum(['by-drift-type-and-service', 'by-rule', 'by-finding-code']),
      maxPerPR: z.number(),
    }).optional(),
  }).optional(),
});

export type PackYAML = z.infer<typeof PackYAMLSchema>;

export function parsePackYAML(yamlText: string): PackYAML {
  const parsed = yaml.parse(yamlText);
  return PackYAMLSchema.parse(parsed);
}

export function validatePackYAML(yamlText: string): { valid: boolean; errors?: any[] } {
  try {
    parsePackYAML(yamlText);
    return { valid: true };
  } catch (error: any) {
    if (error.errors) {
      return { valid: false, errors: error.errors };
    }
    return { valid: false, errors: [{ message: error.message }] };
  }
}

