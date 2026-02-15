/**
 * Surface Classifier
 * 
 * Classifies changed files into contract surfaces (API, Infra, Docs, etc.)
 * This drives which contract packs are activated for validation.
 * 
 * Week 1-2 Step 1: Foundation for Contract Integrity Gate
 */

// ======================================================================
// TYPES
// ======================================================================

export type Surface = 
  | 'api' 
  | 'infra' 
  | 'data_model' 
  | 'observability' 
  | 'security' 
  | 'docs';

export interface SurfaceClassification {
  surfaces: Surface[];
  filesBySurface: Record<Surface, string[]>;
  confidence: number;
  reasons: string[];
}

export interface FileInput {
  filename: string;
  status?: string;
}

// ======================================================================
// SURFACE DETECTION RULES
// ======================================================================

/**
 * Detect if file is an API surface
 * Covers: OpenAPI, Swagger, GraphQL, Protobuf, REST controllers
 */
function isApiSurface(filename: string): boolean {
  return /openapi\.(yaml|yml|json)/i.test(filename) ||
         /swagger\.(yaml|yml|json)/i.test(filename) ||
         /\/controllers\//i.test(filename) ||
         /\/routes\//i.test(filename) ||
         /\/api\//i.test(filename) ||
         /\.proto$/i.test(filename) ||
         /graphql|schema\.graphql/i.test(filename);
}

/**
 * Detect if file is an Infrastructure surface
 * Covers: Terraform, CloudFormation, Kubernetes, Helm, Ansible
 */
function isInfraSurface(filename: string): boolean {
  return /terraform|\.tf$/i.test(filename) ||
         /cloudformation|\.cfn\./i.test(filename) ||
         /kubernetes|k8s|\.yaml$/i.test(filename) ||
         /helm|charts/i.test(filename) ||
         /ansible|playbook/i.test(filename);
}

/**
 * Detect if file is a Documentation surface
 * Covers: README, CHANGELOG, docs directory, markdown files
 */
function isDocsSurface(filename: string): boolean {
  return /README|CHANGELOG|docs\//i.test(filename) ||
         /\.md$/i.test(filename);
}

/**
 * Detect if file is a Data Model surface
 * Covers: Prisma, database migrations, SQL schemas
 */
function isDataModelSurface(filename: string): boolean {
  return /prisma\/schema\.prisma/i.test(filename) ||
         /migrations\//i.test(filename) ||
         /\.sql$/i.test(filename) ||
         /database|db\/schema/i.test(filename);
}

/**
 * Detect if file is an Observability surface
 * Covers: Grafana dashboards, Datadog monitors, alert configs
 */
function isObservabilitySurface(filename: string): boolean {
  return /grafana|dashboards/i.test(filename) ||
         /datadog|monitors/i.test(filename) ||
         /alerts|prometheus/i.test(filename);
}

/**
 * Detect if file is a Security surface
 * Covers: Auth middleware, permissions, CODEOWNERS, security configs
 */
function isSecuritySurface(filename: string): boolean {
  return /auth|authentication/i.test(filename) ||
         /permissions|authorization/i.test(filename) ||
         /CODEOWNERS/i.test(filename) ||
         /security|\.sec\./i.test(filename);
}

// ======================================================================
// MAIN CLASSIFICATION FUNCTION
// ======================================================================

/**
 * Classify changed files into contract surfaces
 * 
 * @param files - List of changed files
 * @returns Surface classification with confidence and reasons
 */
export function classifySurfaceAreas(files: FileInput[]): SurfaceClassification {
  const surfaceHits = new Map<Surface, { files: string[]; reasons: string[] }>();

  // Check each file against all surface detectors
  for (const file of files) {
    const filename = file.filename;

    if (isApiSurface(filename)) {
      addSurfaceHit(surfaceHits, 'api', filename, 'API surface pattern matched');
    }
    if (isInfraSurface(filename)) {
      addSurfaceHit(surfaceHits, 'infra', filename, 'Infrastructure surface pattern matched');
    }
    if (isDocsSurface(filename)) {
      addSurfaceHit(surfaceHits, 'docs', filename, 'Documentation surface pattern matched');
    }
    if (isDataModelSurface(filename)) {
      addSurfaceHit(surfaceHits, 'data_model', filename, 'Data model surface pattern matched');
    }
    if (isObservabilitySurface(filename)) {
      addSurfaceHit(surfaceHits, 'observability', filename, 'Observability surface pattern matched');
    }
    if (isSecuritySurface(filename)) {
      addSurfaceHit(surfaceHits, 'security', filename, 'Security surface pattern matched');
    }
  }

  // Build result
  const surfaces = Array.from(surfaceHits.keys());
  const filesBySurface = Object.fromEntries(
    Array.from(surfaceHits.entries()).map(([surface, data]) => [surface, data.files])
  ) as Record<Surface, string[]>;
  const reasons = Array.from(surfaceHits.values()).flatMap(d => d.reasons);
  const confidence = surfaces.length > 0 ? 0.9 : 0; // High confidence for pattern matches

  return { surfaces, filesBySurface, confidence, reasons };
}

// Helper function to add surface hit
function addSurfaceHit(
  map: Map<Surface, { files: string[]; reasons: string[] }>,
  surface: Surface,
  filename: string,
  reason: string
): void {
  const existing = map.get(surface) || { files: [], reasons: [] };
  existing.files.push(filename);
  existing.reasons.push(`${filename}: ${reason}`);
  map.set(surface, existing);
}

