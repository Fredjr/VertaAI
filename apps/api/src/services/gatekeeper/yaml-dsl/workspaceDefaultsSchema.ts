/**
 * Workspace Defaults Schema
 * Migration Plan v5.0 - Sprint 3
 * 
 * Separates pack logic from workspace configuration
 */

import { z } from 'zod';
import yaml from 'yaml';

export const WorkspaceDefaultsSchema = z.object({
  apiVersion: z.literal('verta.ai/v1'),
  kind: z.literal('Defaults'),

  metadata: z.object({
    id: z.string(),
    version: z.string(),
  }),

  approvers: z.object({
    platformTeams: z.array(z.string()).optional(),
    securityTeams: z.array(z.string()).optional(),
  }).optional(),

  approvals: z.object({
    countOnlyStates: z.array(z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED'])).default(['APPROVED']),
    ignoreBots: z.boolean().default(true),
    honorCodeowners: z.boolean().default(true),
    ignoredUsers: z.array(z.string()).default([]),
    teamSlugFormat: z.enum(['org/team-slug', 'team-slug']).default('org/team-slug'),
    cacheMembershipTtlSeconds: z.number().default(300),
  }).optional(),

  paths: z.record(z.array(z.string())).optional(),

  sensitivePaths: z.record(z.array(z.string())).optional(),

  prTemplate: z.object({
    requiredFields: z.record(z.object({
      matchAny: z.array(z.string()),
    })),
  }).optional(),

  safety: z.object({
    secretPatterns: z.array(z.string()).optional(),
  }).optional(),

  // DEPRECATED: Use artifactRegistry instead
  artifacts: z.record(z.object({
    matchAny: z.array(z.string()),
  })).optional(),

  // NEW: Service-aware artifact registry (CRITICAL for microservices)
  artifactRegistry: z.object({
    services: z.record(z.object({
      repo: z.string(),
      serviceScope: z.object({
        includePaths: z.array(z.string()).optional(),
        excludePaths: z.array(z.string()).optional(),
      }).optional(),
      artifacts: z.record(z.string()).optional(),
      serviceDetection: z.object({
        strategy: z.enum(['path-prefix']),
        services: z.record(z.object({
          pathPrefix: z.string(),
          artifacts: z.record(z.string()),
        })),
      }).optional(),
    })),
  }).optional(),

  actorSignals: z.object({
    agentPatterns: z.array(z.string()).optional(),
  }).optional(),
});

export type WorkspaceDefaults = z.infer<typeof WorkspaceDefaultsSchema>;

export function parseWorkspaceDefaults(yamlText: string): WorkspaceDefaults {
  const parsed = yaml.parse(yamlText);
  return WorkspaceDefaultsSchema.parse(parsed);
}

export function validateWorkspaceDefaults(yamlText: string): { valid: boolean; errors?: any[] } {
  try {
    parseWorkspaceDefaults(yamlText);
    return { valid: true };
  } catch (error: any) {
    if (error.errors) {
      return { valid: false, errors: error.errors };
    }
    return { valid: false, errors: [{ message: error.message }] };
  }
}

/**
 * Default workspace defaults for new workspaces
 */
export const DEFAULT_WORKSPACE_DEFAULTS: WorkspaceDefaults = {
  apiVersion: 'verta.ai/v1',
  kind: 'Defaults',
  metadata: {
    id: 'verta.defaults.v1',
    version: '1.0.0',
  },
  approvals: {
    countOnlyStates: ['APPROVED'],
    ignoreBots: true,
    honorCodeowners: true,
    ignoredUsers: ['dependabot[bot]', 'renovate[bot]', 'github-actions[bot]'],
    teamSlugFormat: 'org/team-slug',
    cacheMembershipTtlSeconds: 300,
  },
  safety: {
    secretPatterns: [
      '(?i)api[_-]?key\\s*[:=]\\s*[A-Za-z0-9-_]{16,}',
      'AKIA[0-9A-Z]{16}',
      'ghp_[A-Za-z0-9]{36}',
      'sk-[A-Za-z0-9]{48}',
    ],
  },
};

