/**
 * OPENAPI_SCHEMA_VALID Comparator
 * Migration Plan v5.0 - Sprint 1, Task 1.3
 * 
 * Validates OpenAPI schema files
 */

import yaml from 'yaml';
import type { Comparator, ComparatorResult, PRContext } from '../types.js';
import { ComparatorId, FindingCode } from '../types.js';
import { resolveArtifactTargets } from '../artifactResolver.js';

export const openapiSchemaValidComparator: Comparator = {
  id: ComparatorId.OPENAPI_SCHEMA_VALID,
  version: '1.0.0',

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

