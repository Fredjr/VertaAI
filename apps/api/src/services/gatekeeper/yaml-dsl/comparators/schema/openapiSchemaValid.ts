/**
 * OPENAPI_SCHEMA_VALID Comparator
 * Migration Plan v5.0 - Sprint 1, Task 1.3
 *
 * Validates OpenAPI schema files
 *
 * Phase 4: Migrated to structured IR output
 * - evaluateStructured(): Returns ObligationResult (NEW)
 * - evaluate(): Returns ComparatorResult (LEGACY, kept for backward compatibility)
 */

import yaml from 'yaml';
import type { Comparator, ComparatorResult, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import { resolveArtifactTargets } from '../artifactResolver.js';
import type { ObligationResult } from '../../ir/types.js';
import {
  createObligation,
  presentFileEvidence,
  mismatchEvidence,
  calculateSchemaRisk,
} from '../../ir/obligationDSL.js';
import { formatMessage } from '../../ir/messageCatalog.js';

export const openapiSchemaValidComparator: Comparator = {
  id: ComparatorId.OPENAPI_SCHEMA_VALID,
  version: '2.0.0', // Phase 4: Bumped to 2.0.0 (structured IR support)

  /**
   * NEW: Structured evaluation (Phase 4)
   * Returns fully structured ObligationResult
   */
  async evaluateStructured(context: PRContext, params: any): Promise<ObligationResult> {
    const { artifactType = 'openapi', title, controlObjective, decisionOnFail = 'block' } = params;

    // Create obligation builder
    const obligation = createObligation({
      id: `openapi-schema-valid-${artifactType}`,
      title: title || 'OpenAPI Schema Valid',
      controlObjective: controlObjective || 'Ensure OpenAPI schemas are valid and well-formed',
      scope: 'repo_invariant',
      decisionOnFail: decisionOnFail as 'block' | 'warn' | 'pass',
    });

    // Resolve artifact targets
    const targets = await resolveArtifactTargets(context, artifactType);

    if (targets.length === 0) {
      return obligation.notEvaluableWithMessage(
        'not_evaluable.no_artifact_registry',
        { artifactType },
        'policy_misconfig'
      );
    }

    const invalidSchemas: Array<{ path: string; error: string }> = [];
    const validSchemas: string[] = [];

    for (const target of targets) {
      try {
        // Fetch file content
        const response = await context.github.rest.repos.getContent({
          owner: context.owner,
          repo: context.repo,
          path: target.path,
          ref: context.headSha,
        });

        if ('content' in response.data) {
          const content = Buffer.from(response.data.content, 'base64').toString('utf-8');

          // Parse YAML/JSON
          let schema: any;
          if (target.path.endsWith('.json')) {
            schema = JSON.parse(content);
          } else {
            schema = yaml.parse(content);
          }

          // Basic OpenAPI validation
          if (!schema.openapi && !schema.swagger) {
            invalidSchemas.push({
              path: target.path,
              error: 'Missing openapi or swagger version field',
            });
            continue;
          }

          if (!schema.info) {
            invalidSchemas.push({
              path: target.path,
              error: 'Missing info object',
            });
            continue;
          }

          if (!schema.paths && !schema.components) {
            invalidSchemas.push({
              path: target.path,
              error: 'Missing paths or components',
            });
            continue;
          }

          validSchemas.push(target.path);
        }
      } catch (error: any) {
        invalidSchemas.push({
          path: target.path,
          error: error.message || 'Failed to fetch or parse',
        });
      }
    }

    // All schemas valid - PASS
    if (invalidSchemas.length === 0) {
      return obligation.passWithMessage(
        'pass.schema.valid',
        { artifactType }
      );
    }

    // Some schemas invalid - FAIL
    return obligation.failWithMessage({
      reasonCode: 'ARTIFACT_INVALID_SCHEMA',
      messageId: 'fail.schema.invalid',
      messageParams: {
        artifactType,
        invalidPaths: invalidSchemas.map(s => s.path).join(', '),
      },
      evidence: [
        ...invalidSchemas.map(s => mismatchEvidence(
          s.path,
          formatMessage('evidence.schema.expected_valid', { artifactType }),
          s.error
        )),
        ...validSchemas.map(path => presentFileEvidence(
          path,
          formatMessage('evidence.schema.valid', { artifactType })
        )),
      ],
      evidenceSearch: {
        locationsSearched: targets.map(t => t.path),
        strategy: 'service_aware_artifact_resolver',
        confidence: 1.0,
      },
      remediation: {
        minimumToPass: [
          `Fix schema validation errors in: ${invalidSchemas.map(s => s.path).join(', ')}`,
          'Ensure all required fields are present (openapi/swagger, info, paths/components)',
          'Validate schema against OpenAPI specification',
        ],
        patch: null,
        links: ['https://spec.openapis.org/oas/latest.html'],
        owner: params.owner || 'platform-team',
      },
      risk: calculateSchemaRisk({
        isBlocking: decisionOnFail === 'block',
        affectsAPI: true,
        hasBreakingChanges: invalidSchemas.length > 0,
      }),
    });
  },

  /**
   * LEGACY: Unstructured evaluation (backward compatibility)
   * Kept for existing integrations
   */
  async evaluate(context: PRContext, params: any): Promise<ComparatorResult> {
    const { artifactType = 'openapi' } = params;

    // Resolve artifact targets
    const targets = await resolveArtifactTargets(context, artifactType);

    if (targets.length === 0) {
      return {
        comparatorId: this.id,
        status: 'unknown',
        evidence: [],
        reasonCode: FindingCode.ARTIFACT_NO_REGISTRY,
        message: `No artifact registry configured for type: ${artifactType}`,
      };
    }

    const invalidSchemas: Array<{ path: string; error: string }> = [];
    const validSchemas: string[] = [];

    for (const target of targets) {
      try {
        // Fetch file content
        const response = await context.github.rest.repos.getContent({
          owner: context.owner,
          repo: context.repo,
          path: target.path,
          ref: context.headSha,
        });

        if ('content' in response.data) {
          const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
          
          // Parse YAML/JSON
          let schema: any;
          if (target.path.endsWith('.json')) {
            schema = JSON.parse(content);
          } else {
            schema = yaml.parse(content);
          }

          // Basic OpenAPI validation
          if (!schema.openapi && !schema.swagger) {
            invalidSchemas.push({
              path: target.path,
              error: 'Missing openapi or swagger version field',
            });
            continue;
          }

          if (!schema.info) {
            invalidSchemas.push({
              path: target.path,
              error: 'Missing info object',
            });
            continue;
          }

          if (!schema.paths && !schema.components) {
            invalidSchemas.push({
              path: target.path,
              error: 'Missing paths or components',
            });
            continue;
          }

          validSchemas.push(target.path);
        }
      } catch (error: any) {
        invalidSchemas.push({
          path: target.path,
          error: error.message || 'Failed to fetch or parse',
        });
      }
    }

    if (invalidSchemas.length === 0) {
      return {
        comparatorId: this.id,
        status: 'pass',
        evidence: validSchemas.map(path => ({
          type: 'file',
          path,
        })),
        reasonCode: FindingCode.PASS,
        message: `All ${artifactType} schemas are valid`,
      };
    }

    return {
      comparatorId: this.id,
      status: 'fail',
      evidence: invalidSchemas.map(s => ({
        type: 'file',
        path: s.path,
        snippet: s.error,
      })),
      reasonCode: FindingCode.ARTIFACT_INVALID_SCHEMA,
      message: `Invalid ${artifactType} schemas: ${invalidSchemas.map(s => s.path).join(', ')}`,
    };
  },
};

