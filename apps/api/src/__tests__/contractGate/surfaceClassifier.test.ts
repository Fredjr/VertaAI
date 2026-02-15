/**
 * Surface Classifier Tests
 * 
 * Tests for contract surface classification
 * Week 1-2 Step 1: Foundation
 */

import { describe, it, expect } from 'vitest';
import { classifySurfaceAreas } from '../../services/contractGate/surfaceClassifier.js';

describe('Surface Classification', () => {
  // ======================================================================
  // API SURFACE TESTS
  // ======================================================================

  it('should detect API surface from OpenAPI file', () => {
    const result = classifySurfaceAreas([{ filename: 'openapi/openapi.yaml' }]);
    expect(result.surfaces).toContain('api');
    expect(result.filesBySurface.api).toContain('openapi/openapi.yaml');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('should detect API surface from Swagger file', () => {
    const result = classifySurfaceAreas([{ filename: 'swagger.json' }]);
    expect(result.surfaces).toContain('api');
  });

  it('should detect API surface from GraphQL schema', () => {
    const result = classifySurfaceAreas([{ filename: 'schema.graphql' }]);
    expect(result.surfaces).toContain('api');
  });

  it('should detect API surface from Protobuf file', () => {
    const result = classifySurfaceAreas([{ filename: 'api/service.proto' }]);
    expect(result.surfaces).toContain('api');
  });

  it('should detect API surface from controllers', () => {
    const result = classifySurfaceAreas([{ filename: 'src/controllers/userController.ts' }]);
    expect(result.surfaces).toContain('api');
  });

  // ======================================================================
  // INFRASTRUCTURE SURFACE TESTS
  // ======================================================================

  it('should detect Infra surface from Terraform file', () => {
    const result = classifySurfaceAreas([{ filename: 'terraform/main.tf' }]);
    expect(result.surfaces).toContain('infra');
    expect(result.filesBySurface.infra).toContain('terraform/main.tf');
  });

  it('should detect Infra surface from Kubernetes manifest', () => {
    const result = classifySurfaceAreas([{ filename: 'k8s/deployment.yaml' }]);
    expect(result.surfaces).toContain('infra');
  });

  it('should detect Infra surface from Helm chart', () => {
    const result = classifySurfaceAreas([{ filename: 'helm/charts/myapp/values.yaml' }]);
    expect(result.surfaces).toContain('infra');
  });

  // ======================================================================
  // DOCUMENTATION SURFACE TESTS
  // ======================================================================

  it('should detect Docs surface from README', () => {
    const result = classifySurfaceAreas([{ filename: 'README.md' }]);
    expect(result.surfaces).toContain('docs');
  });

  it('should detect Docs surface from CHANGELOG', () => {
    const result = classifySurfaceAreas([{ filename: 'CHANGELOG.md' }]);
    expect(result.surfaces).toContain('docs');
  });

  it('should detect Docs surface from docs directory', () => {
    const result = classifySurfaceAreas([{ filename: 'docs/api-guide.md' }]);
    expect(result.surfaces).toContain('docs');
  });

  // ======================================================================
  // DATA MODEL SURFACE TESTS
  // ======================================================================

  it('should detect Data Model surface from Prisma schema', () => {
    const result = classifySurfaceAreas([{ filename: 'prisma/schema.prisma' }]);
    expect(result.surfaces).toContain('data_model');
  });

  it('should detect Data Model surface from migrations', () => {
    const result = classifySurfaceAreas([{ filename: 'migrations/001_initial.sql' }]);
    expect(result.surfaces).toContain('data_model');
  });

  // ======================================================================
  // OBSERVABILITY SURFACE TESTS
  // ======================================================================

  it('should detect Observability surface from Grafana dashboard', () => {
    const result = classifySurfaceAreas([{ filename: 'grafana/dashboards/api-metrics.json' }]);
    expect(result.surfaces).toContain('observability');
  });

  it('should detect Observability surface from Datadog monitors', () => {
    const result = classifySurfaceAreas([{ filename: 'datadog/monitors/api-latency.yaml' }]);
    expect(result.surfaces).toContain('observability');
  });

  // ======================================================================
  // SECURITY SURFACE TESTS
  // ======================================================================

  it('should detect Security surface from CODEOWNERS', () => {
    const result = classifySurfaceAreas([{ filename: 'CODEOWNERS' }]);
    expect(result.surfaces).toContain('security');
  });

  it('should detect Security surface from auth middleware', () => {
    const result = classifySurfaceAreas([{ filename: 'src/middleware/auth.ts' }]);
    expect(result.surfaces).toContain('security');
  });

  // ======================================================================
  // MULTI-SURFACE TESTS
  // ======================================================================

  it('should detect multiple surfaces', () => {
    const result = classifySurfaceAreas([
      { filename: 'openapi/openapi.yaml' },
      { filename: 'terraform/main.tf' },
      { filename: 'README.md' },
    ]);
    expect(result.surfaces).toContain('api');
    expect(result.surfaces).toContain('infra');
    expect(result.surfaces).toContain('docs');
    expect(result.surfaces).toHaveLength(3);
  });

  it('should handle files that match no surfaces', () => {
    const result = classifySurfaceAreas([{ filename: 'src/utils/helper.ts' }]);
    expect(result.surfaces).toHaveLength(0);
    expect(result.confidence).toBe(0);
  });

  it('should handle empty file list', () => {
    const result = classifySurfaceAreas([]);
    expect(result.surfaces).toHaveLength(0);
    expect(result.confidence).toBe(0);
  });

  // ======================================================================
  // EDGE CASES
  // ======================================================================

  it('should handle files that match multiple surfaces', () => {
    // A file in docs/ that is also a README
    const result = classifySurfaceAreas([{ filename: 'docs/README.md' }]);
    expect(result.surfaces).toContain('docs');
    expect(result.filesBySurface.docs).toContain('docs/README.md');
  });

  it('should provide reasons for classification', () => {
    const result = classifySurfaceAreas([{ filename: 'openapi/openapi.yaml' }]);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons[0]).toContain('API surface pattern matched');
  });
});

