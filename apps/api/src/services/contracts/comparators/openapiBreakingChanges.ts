/**
 * OpenAPI Breaking Change Detector
 * 
 * Shared logic for detecting breaking and non-breaking changes in OpenAPI specs.
 * Used by openapi.validate, openapi.diff, and openapi.version_bump comparators.
 * 
 * Breaking Changes:
 * - Removed endpoints
 * - Removed required parameters
 * - Changed parameter types (incompatible)
 * - Removed response fields
 * - Changed response types (incompatible)
 * - Removed schemas
 * - Changed required fields in schemas
 * 
 * Non-Breaking Changes:
 * - Added endpoints
 * - Added optional parameters
 * - Added response fields
 * - Added schemas
 * - Added optional fields to schemas
 */

import type { OpenApiData, OpenApiEndpoint, OpenApiSchema } from './openapi.js';

// ======================================================================
// TYPES
// ======================================================================

export type ChangeType =
  | 'endpoint_removed'
  | 'endpoint_added'
  | 'endpoint_modified'
  | 'parameter_removed'
  | 'parameter_added'
  | 'parameter_type_changed'
  | 'parameter_required_changed'
  | 'response_removed'
  | 'response_added'
  | 'response_schema_changed'
  | 'schema_removed'
  | 'schema_added'
  | 'schema_property_removed'
  | 'schema_property_added'
  | 'schema_property_type_changed'
  | 'schema_required_field_added'
  | 'schema_required_field_removed';

export interface Change {
  type: ChangeType;
  breaking: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  left?: any;
  right?: any;
  pointer?: string;
}

// ======================================================================
// BREAKING CHANGE DETECTION
// ======================================================================

export function detectBreakingChanges(left: OpenApiData, right: OpenApiData): Change[] {
  const changes: Change[] = [];

  // 1. Detect removed endpoints (BREAKING)
  changes.push(...detectRemovedEndpoints(left.endpoints, right.endpoints));

  // 2. Detect removed required parameters (BREAKING)
  changes.push(...detectRemovedRequiredParameters(left.endpoints, right.endpoints));

  // 3. Detect parameter type changes (BREAKING)
  changes.push(...detectParameterTypeChanges(left.endpoints, right.endpoints));

  // 4. Detect removed schemas (BREAKING)
  changes.push(...detectRemovedSchemas(left.schemas, right.schemas));

  // 5. Detect removed required fields in schemas (BREAKING)
  changes.push(...detectRemovedRequiredFields(left.schemas, right.schemas));

  return changes;
}

export function detectNonBreakingChanges(left: OpenApiData, right: OpenApiData): Change[] {
  const changes: Change[] = [];

  // 1. Detect added endpoints (NON-BREAKING)
  changes.push(...detectAddedEndpoints(left.endpoints, right.endpoints));

  // 2. Detect added optional parameters (NON-BREAKING)
  changes.push(...detectAddedOptionalParameters(left.endpoints, right.endpoints));

  // 3. Detect added schemas (NON-BREAKING)
  changes.push(...detectAddedSchemas(left.schemas, right.schemas));

  // 4. Detect added optional fields in schemas (NON-BREAKING)
  changes.push(...detectAddedOptionalFields(left.schemas, right.schemas));

  return changes;
}

export function detectAllChanges(left: OpenApiData, right: OpenApiData): Change[] {
  return [
    ...detectBreakingChanges(left, right),
    ...detectNonBreakingChanges(left, right),
  ];
}

// ======================================================================
// ENDPOINT CHANGES
// ======================================================================

function detectRemovedEndpoints(left: OpenApiEndpoint[], right: OpenApiEndpoint[]): Change[] {
  const changes: Change[] = [];
  const rightMap = createEndpointMap(right);

  for (const endpoint of left) {
    const key = endpointKey(endpoint);
    if (!rightMap.has(key) && !endpoint.deprecated) {
      changes.push({
        type: 'endpoint_removed',
        breaking: true,
        severity: 'critical',
        description: `Endpoint ${endpoint.method} ${endpoint.path} was removed`,
        left: endpoint,
        right: null,
        pointer: `/paths/${endpoint.path}/${endpoint.method.toLowerCase()}`,
      });
    }
  }

  return changes;
}

function detectAddedEndpoints(left: OpenApiEndpoint[], right: OpenApiEndpoint[]): Change[] {
  const changes: Change[] = [];
  const leftMap = createEndpointMap(left);

  for (const endpoint of right) {
    const key = endpointKey(endpoint);
    if (!leftMap.has(key)) {
      changes.push({
        type: 'endpoint_added',
        breaking: false,
        severity: 'low',
        description: `Endpoint ${endpoint.method} ${endpoint.path} was added`,
        left: null,
        right: endpoint,
        pointer: `/paths/${endpoint.path}/${endpoint.method.toLowerCase()}`,
      });
    }
  }

  return changes;
}

// ======================================================================
// PARAMETER CHANGES
// ======================================================================

function detectRemovedRequiredParameters(left: OpenApiEndpoint[], right: OpenApiEndpoint[]): Change[] {
  const changes: Change[] = [];
  const rightMap = createEndpointMap(right);

  for (const leftEndpoint of left) {
    const key = endpointKey(leftEndpoint);
    const rightEndpoint = rightMap.get(key);

    if (rightEndpoint && leftEndpoint.parameters) {
      const rightParams = new Map((rightEndpoint.parameters || []).map(p => [p.name, p]));

      for (const leftParam of leftEndpoint.parameters) {
        if (leftParam.required && !rightParams.has(leftParam.name)) {
          changes.push({
            type: 'parameter_removed',
            breaking: true,
            severity: 'critical',
            description: `Required parameter '${leftParam.name}' was removed from ${leftEndpoint.method} ${leftEndpoint.path}`,
            left: leftParam,
            right: null,
            pointer: `/paths/${leftEndpoint.path}/${leftEndpoint.method.toLowerCase()}/parameters/${leftParam.name}`,
          });
        }
      }
    }
  }

  return changes;
}

function detectAddedOptionalParameters(left: OpenApiEndpoint[], right: OpenApiEndpoint[]): Change[] {
  const changes: Change[] = [];
  const leftMap = createEndpointMap(left);

  for (const rightEndpoint of right) {
    const key = endpointKey(rightEndpoint);
    const leftEndpoint = leftMap.get(key);

    if (leftEndpoint && rightEndpoint.parameters) {
      const leftParams = new Map((leftEndpoint.parameters || []).map(p => [p.name, p]));

      for (const rightParam of rightEndpoint.parameters) {
        if (!rightParam.required && !leftParams.has(rightParam.name)) {
          changes.push({
            type: 'parameter_added',
            breaking: false,
            severity: 'low',
            description: `Optional parameter '${rightParam.name}' was added to ${rightEndpoint.method} ${rightEndpoint.path}`,
            left: null,
            right: rightParam,
            pointer: `/paths/${rightEndpoint.path}/${rightEndpoint.method.toLowerCase()}/parameters/${rightParam.name}`,
          });
        }
      }
    }
  }

  return changes;
}

function detectParameterTypeChanges(left: OpenApiEndpoint[], right: OpenApiEndpoint[]): Change[] {
  const changes: Change[] = [];
  const rightMap = createEndpointMap(right);

  for (const leftEndpoint of left) {
    const key = endpointKey(leftEndpoint);
    const rightEndpoint = rightMap.get(key);

    if (rightEndpoint && leftEndpoint.parameters && rightEndpoint.parameters) {
      const rightParams = new Map(rightEndpoint.parameters.map(p => [p.name, p]));

      for (const leftParam of leftEndpoint.parameters) {
        const rightParam = rightParams.get(leftParam.name);
        if (rightParam && leftParam.type && rightParam.type && leftParam.type !== rightParam.type) {
          changes.push({
            type: 'parameter_type_changed',
            breaking: true,
            severity: 'high',
            description: `Parameter '${leftParam.name}' type changed from ${leftParam.type} to ${rightParam.type} in ${leftEndpoint.method} ${leftEndpoint.path}`,
            left: leftParam,
            right: rightParam,
            pointer: `/paths/${leftEndpoint.path}/${leftEndpoint.method.toLowerCase()}/parameters/${leftParam.name}`,
          });
        }
      }
    }
  }

  return changes;
}

// ======================================================================
// SCHEMA CHANGES
// ======================================================================

function detectRemovedSchemas(left: OpenApiSchema[], right: OpenApiSchema[]): Change[] {
  const changes: Change[] = [];
  const rightMap = new Map(right.map(s => [s.name, s]));

  for (const schema of left) {
    if (!rightMap.has(schema.name)) {
      changes.push({
        type: 'schema_removed',
        breaking: true,
        severity: 'high',
        description: `Schema '${schema.name}' was removed`,
        left: schema,
        right: null,
        pointer: `/components/schemas/${schema.name}`,
      });
    }
  }

  return changes;
}

function detectAddedSchemas(left: OpenApiSchema[], right: OpenApiSchema[]): Change[] {
  const changes: Change[] = [];
  const leftMap = new Map(left.map(s => [s.name, s]));

  for (const schema of right) {
    if (!leftMap.has(schema.name)) {
      changes.push({
        type: 'schema_added',
        breaking: false,
        severity: 'low',
        description: `Schema '${schema.name}' was added`,
        left: null,
        right: schema,
        pointer: `/components/schemas/${schema.name}`,
      });
    }
  }

  return changes;
}

function detectRemovedRequiredFields(left: OpenApiSchema[], right: OpenApiSchema[]): Change[] {
  const changes: Change[] = [];
  const rightMap = new Map(right.map(s => [s.name, s]));

  for (const leftSchema of left) {
    const rightSchema = rightMap.get(leftSchema.name);
    if (rightSchema && leftSchema.required && rightSchema.required) {
      const rightRequired = new Set(rightSchema.required);

      for (const field of leftSchema.required) {
        if (!rightRequired.has(field)) {
          changes.push({
            type: 'schema_required_field_removed',
            breaking: true,
            severity: 'high',
            description: `Required field '${field}' was removed from schema '${leftSchema.name}'`,
            left: { schema: leftSchema.name, field },
            right: null,
            pointer: `/components/schemas/${leftSchema.name}/required/${field}`,
          });
        }
      }
    }
  }

  return changes;
}

function detectAddedOptionalFields(left: OpenApiSchema[], right: OpenApiSchema[]): Change[] {
  const changes: Change[] = [];
  const leftMap = new Map(left.map(s => [s.name, s]));

  for (const rightSchema of right) {
    const leftSchema = leftMap.get(rightSchema.name);
    if (leftSchema && rightSchema.properties && leftSchema.properties) {
      const leftProps = new Set(Object.keys(leftSchema.properties));
      const rightRequired = new Set(rightSchema.required || []);

      for (const prop of Object.keys(rightSchema.properties)) {
        if (!leftProps.has(prop) && !rightRequired.has(prop)) {
          changes.push({
            type: 'schema_property_added',
            breaking: false,
            severity: 'low',
            description: `Optional property '${prop}' was added to schema '${rightSchema.name}'`,
            left: null,
            right: { schema: rightSchema.name, property: prop },
            pointer: `/components/schemas/${rightSchema.name}/properties/${prop}`,
          });
        }
      }
    }
  }

  return changes;
}

// ======================================================================
// HELPER FUNCTIONS
// ======================================================================

function endpointKey(endpoint: OpenApiEndpoint): string {
  return `${endpoint.method.toUpperCase()} ${endpoint.path}`;
}

function createEndpointMap(endpoints: OpenApiEndpoint[]): Map<string, OpenApiEndpoint> {
  return new Map(endpoints.map(e => [endpointKey(e), e]));
}

