/**
 * OpenAPI/Swagger Parser
 * 
 * Parses and diffs OpenAPI specifications to detect API drift.
 * Identifies breaking changes, new endpoints, and modified schemas.
 * 
 * Phase 2 - Multi-Source Architecture
 * @see MULTI_SOURCE_IMPLEMENTATION_PLAN.md Section 7.2.1
 */

// Note: Using built-in JSON parsing. YAML support would require js-yaml package.
// For now, we handle YAML by simple key:value parsing for basic cases.

// ============================================================================
// Types
// ============================================================================

export interface ApiEndpointChange {
  path: string;
  method: string;
  changeType: 'added' | 'removed' | 'modified';
  oldSpec?: OpenApiOperation;
  newSpec?: OpenApiOperation;
  breakingChange: boolean;
  description: string;
}

export interface OpenApiOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: any;
  responses?: Record<string, any>;
  tags?: string[];
  deprecated?: boolean;
}

export interface OpenApiParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required?: boolean;
  schema?: any;
  description?: string;
}

export interface OpenApiSpec {
  openapi?: string;
  swagger?: string;
  info?: {
    title?: string;
    version?: string;
    description?: string;
  };
  paths?: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    schemas?: Record<string, any>;
    securitySchemes?: Record<string, any>;
  };
}

export interface OpenApiDiff {
  changes: ApiEndpointChange[];
  hasBreakingChanges: boolean;
  summary: string;
  addedEndpoints: number;
  removedEndpoints: number;
  modifiedEndpoints: number;
  oldVersion?: string;
  newVersion?: string;
}

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Simple YAML to JSON converter for basic OpenAPI specs
 * Handles common YAML structures without external dependency
 */
function parseYamlSimple(content: string): unknown {
  // Very basic YAML parsing - handles simple key-value and nested structures
  // For production use, consider installing js-yaml package
  const lines = content.split('\n');
  const result: Record<string, unknown> = {};
  const stack: { obj: Record<string, unknown>; indent: number }[] = [{ obj: result, indent: -1 }];

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const match = line.match(/^(\s*)([^:]+):\s*(.*)$/);
    if (!match || !match[1] || !match[2]) continue;

    const indent = match[1].length;
    const key = match[2].trim();
    const valueStr = (match[3] || '').trim();

    // Pop stack to find correct parent
    const stackTop = stack[stack.length - 1];
    while (stack.length > 1 && stackTop && stackTop.indent >= indent) {
      stack.pop();
    }

    const currentTop = stack[stack.length - 1];
    if (!currentTop) continue;
    const parent = currentTop.obj;

    if (valueStr === '' || valueStr === '|' || valueStr === '>') {
      // Nested object or multiline string (simplified: treat as empty object)
      const newObj: Record<string, unknown> = {};
      parent[key] = newObj;
      stack.push({ obj: newObj, indent });
    } else {
      // Simple value - try to parse as JSON for arrays/objects, otherwise string
      if (valueStr.startsWith('[') || valueStr.startsWith('{')) {
        try {
          parent[key] = JSON.parse(valueStr);
        } catch {
          parent[key] = valueStr;
        }
      } else if (valueStr === 'true') {
        parent[key] = true;
      } else if (valueStr === 'false') {
        parent[key] = false;
      } else if (!isNaN(Number(valueStr)) && valueStr !== '') {
        parent[key] = Number(valueStr);
      } else {
        // Remove quotes if present
        parent[key] = valueStr.replace(/^["']|["']$/g, '');
      }
    }
  }

  return result;
}

/**
 * Parse OpenAPI spec from string (JSON or YAML)
 */
export function parseOpenApiSpec(content: string): OpenApiSpec | null {
  try {
    const trimmed = content.trim();
    // Try JSON first
    if (trimmed.startsWith('{')) {
      return JSON.parse(content) as OpenApiSpec;
    }
    // Try simple YAML parsing
    return parseYamlSimple(content) as OpenApiSpec;
  } catch (error) {
    console.error('[OpenApiParser] Failed to parse spec:', error);
    return null;
  }
}

/**
 * Check if a file is an OpenAPI/Swagger spec
 */
export function isOpenApiFile(filename: string): boolean {
  const lowerName = filename.toLowerCase();
  
  // Common OpenAPI file patterns
  const patterns = [
    'openapi.yaml',
    'openapi.yml',
    'openapi.json',
    'swagger.yaml',
    'swagger.yml',
    'swagger.json',
    'api.yaml',
    'api.yml',
    'api.json',
  ];
  
  // Check exact matches
  const basename = lowerName.split('/').pop() || '';
  if (patterns.includes(basename)) {
    return true;
  }
  
  // Check patterns in paths
  if (lowerName.includes('openapi') || lowerName.includes('swagger')) {
    if (lowerName.endsWith('.yaml') || lowerName.endsWith('.yml') || lowerName.endsWith('.json')) {
      return true;
    }
  }
  
  return false;
}

/**
 * Validate that content is a valid OpenAPI spec
 */
export function isValidOpenApiSpec(spec: OpenApiSpec | null): boolean {
  if (!spec) return false;
  
  // Must have openapi or swagger version
  if (!spec.openapi && !spec.swagger) return false;
  
  // Must have paths
  if (!spec.paths || typeof spec.paths !== 'object') return false;
  
  return true;
}

// HTTP methods to check in OpenAPI specs
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

// ============================================================================
// Diff Functions
// ============================================================================

/**
 * Compare two OpenAPI specs and return the differences
 */
export function diffOpenApiSpecs(
  oldSpecContent: string | null,
  newSpecContent: string | null
): OpenApiDiff {
  const oldSpec = oldSpecContent ? parseOpenApiSpec(oldSpecContent) : null;
  const newSpec = newSpecContent ? parseOpenApiSpec(newSpecContent) : null;

  const changes: ApiEndpointChange[] = [];

  // Handle null cases
  if (!oldSpec && !newSpec) {
    return createEmptyDiff();
  }

  if (!oldSpec && newSpec) {
    // All endpoints are new
    for (const [path, methods] of Object.entries(newSpec.paths || {})) {
      for (const method of HTTP_METHODS) {
        if (methods[method]) {
          changes.push({
            path,
            method,
            changeType: 'added',
            newSpec: methods[method],
            breakingChange: false,
            description: `New endpoint ${method.toUpperCase()} ${path}`,
          });
        }
      }
    }
    return createDiffResult(changes, undefined, newSpec.info?.version);
  }

  if (oldSpec && !newSpec) {
    // All endpoints removed (breaking!)
    for (const [path, methods] of Object.entries(oldSpec.paths || {})) {
      for (const method of HTTP_METHODS) {
        if (methods[method]) {
          changes.push({
            path,
            method,
            changeType: 'removed',
            oldSpec: methods[method],
            breakingChange: true,
            description: `Endpoint ${method.toUpperCase()} ${path} was removed`,
          });
        }
      }
    }
    return createDiffResult(changes, oldSpec.info?.version, undefined);
  }

  // Both specs exist - compare them
  const oldPaths = Object.keys(oldSpec!.paths || {});
  const newPaths = Object.keys(newSpec!.paths || {});

  // Detect removed endpoints (breaking)
  for (const path of oldPaths) {
    if (!newPaths.includes(path)) {
      const methods = oldSpec!.paths?.[path];
      if (!methods) continue;
      for (const method of HTTP_METHODS) {
        if (methods[method]) {
          changes.push({
            path,
            method,
            changeType: 'removed',
            oldSpec: methods[method],
            breakingChange: true,
            description: `Endpoint ${method.toUpperCase()} ${path} was removed`,
          });
        }
      }
    }
  }

  // Detect added endpoints
  for (const path of newPaths) {
    if (!oldPaths.includes(path)) {
      const methods = newSpec!.paths?.[path];
      if (!methods) continue;
      for (const method of HTTP_METHODS) {
        if (methods[method]) {
          changes.push({
            path,
            method,
            changeType: 'added',
            newSpec: methods[method],
            breakingChange: false,
            description: `New endpoint ${method.toUpperCase()} ${path}`,
          });
        }
      }
    }
  }

  // Detect modified endpoints
  for (const path of oldPaths) {
    if (newPaths.includes(path)) {
      const oldMethods = oldSpec!.paths?.[path];
      const newMethods = newSpec!.paths?.[path];
      if (!oldMethods || !newMethods) continue;

      for (const method of HTTP_METHODS) {
        const oldOp = oldMethods[method];
        const newOp = newMethods[method];

        if (oldOp && !newOp) {
          // Method removed from existing path
          changes.push({
            path,
            method,
            changeType: 'removed',
            oldSpec: oldOp,
            breakingChange: true,
            description: `Method ${method.toUpperCase()} removed from ${path}`,
          });
        } else if (!oldOp && newOp) {
          // Method added to existing path
          changes.push({
            path,
            method,
            changeType: 'added',
            newSpec: newOp,
            breakingChange: false,
            description: `Method ${method.toUpperCase()} added to ${path}`,
          });
        } else if (oldOp && newOp) {
          // Check for modifications
          const isBreaking = detectBreakingChange(oldOp, newOp);
          const hasChanges = JSON.stringify(oldOp) !== JSON.stringify(newOp);

          if (hasChanges) {
            changes.push({
              path,
              method,
              changeType: 'modified',
              oldSpec: oldOp,
              newSpec: newOp,
              breakingChange: isBreaking,
              description: generateChangeDescription(path, method, oldOp, newOp, isBreaking),
            });
          }
        }
      }
    }
  }

  return createDiffResult(changes, oldSpec!.info?.version, newSpec!.info?.version);
}

/**
 * Detect if a change to an operation is breaking
 */
function detectBreakingChange(oldOp: OpenApiOperation, newOp: OpenApiOperation): boolean {
  // Check if required parameters were added
  const oldParams = oldOp.parameters || [];
  const newParams = newOp.parameters || [];

  for (const newParam of newParams) {
    if (newParam.required) {
      const oldParam = oldParams.find(p => p.name === newParam.name && p.in === newParam.in);
      if (!oldParam) {
        return true; // New required parameter = breaking
      }
    }
  }

  // Check if parameters were removed
  for (const oldParam of oldParams) {
    const newParam = newParams.find(p => p.name === oldParam.name && p.in === oldParam.in);
    if (!newParam) {
      return true; // Removed parameter = breaking (clients may still send it)
    }
  }

  // Check if request body became required
  if (newOp.requestBody?.required && !oldOp.requestBody?.required) {
    return true;
  }

  // Check if response codes were removed
  const oldResponses = Object.keys(oldOp.responses || {});
  const newResponses = Object.keys(newOp.responses || {});
  for (const code of oldResponses) {
    if (!newResponses.includes(code) && code.startsWith('2')) {
      return true; // Removing a success response is breaking
    }
  }

  return false;
}

/**
 * Generate human-readable description of a change
 */
function generateChangeDescription(
  path: string,
  method: string,
  oldOp: OpenApiOperation,
  newOp: OpenApiOperation,
  isBreaking: boolean
): string {
  const parts: string[] = [];

  // Check parameter changes
  const oldParams = oldOp.parameters || [];
  const newParams = newOp.parameters || [];

  const addedParams = newParams.filter(np => !oldParams.find(op => op.name === np.name));
  const removedParams = oldParams.filter(op => !newParams.find(np => np.name === op.name));

  if (addedParams.length > 0) {
    parts.push(`added params: ${addedParams.map(p => p.name).join(', ')}`);
  }
  if (removedParams.length > 0) {
    parts.push(`removed params: ${removedParams.map(p => p.name).join(', ')}`);
  }

  // Check summary/description changes
  if (oldOp.summary !== newOp.summary) {
    parts.push('summary updated');
  }

  // Check deprecation
  if (!oldOp.deprecated && newOp.deprecated) {
    parts.push('marked as deprecated');
  }

  const changeDetail = parts.length > 0 ? ` (${parts.join('; ')})` : '';
  const breakingLabel = isBreaking ? ' [BREAKING]' : '';

  return `${method.toUpperCase()} ${path} modified${changeDetail}${breakingLabel}`;
}

function createEmptyDiff(): OpenApiDiff {
  return {
    changes: [],
    hasBreakingChanges: false,
    summary: 'No changes detected',
    addedEndpoints: 0,
    removedEndpoints: 0,
    modifiedEndpoints: 0,
  };
}

function createDiffResult(
  changes: ApiEndpointChange[],
  oldVersion?: string,
  newVersion?: string
): OpenApiDiff {
  const added = changes.filter(c => c.changeType === 'added').length;
  const removed = changes.filter(c => c.changeType === 'removed').length;
  const modified = changes.filter(c => c.changeType === 'modified').length;
  const hasBreaking = changes.some(c => c.breakingChange);

  let summary = '';
  if (changes.length === 0) {
    summary = 'No API changes detected';
  } else {
    const parts: string[] = [];
    if (added > 0) parts.push(`${added} added`);
    if (removed > 0) parts.push(`${removed} removed`);
    if (modified > 0) parts.push(`${modified} modified`);
    summary = `API changes: ${parts.join(', ')}`;
    if (hasBreaking) summary += ' (includes breaking changes)';
  }

  return {
    changes,
    hasBreakingChanges: hasBreaking,
    summary,
    addedEndpoints: added,
    removedEndpoints: removed,
    modifiedEndpoints: modified,
    oldVersion,
    newVersion,
  };
}

/**
 * Create an instruction drift signal from OpenAPI diff
 */
export function createApiDriftSignal(
  diff: OpenApiDiff,
  repoFullName: string,
  prNumber: number
): {
  driftType: 'instruction';
  driftDomains: string[];
  evidenceSummary: string;
  confidence: number;
} | null {
  if (diff.changes.length === 0) {
    return null;
  }

  const breakingChanges = diff.changes.filter(c => c.breakingChange);
  const confidence = breakingChanges.length > 0 ? 0.9 : 0.75;

  return {
    driftType: 'instruction',
    driftDomains: ['api', 'endpoints'],
    evidenceSummary: `PR #${prNumber} in ${repoFullName}: ${diff.summary}. ` +
      `Endpoints affected: ${diff.changes.map(c => `${c.method.toUpperCase()} ${c.path}`).join(', ')}`,
    confidence,
  };
}

