/**
 * Mock Contract Generator
 * Week 1-2 Step 3: Simplified Contract Generation
 * 
 * Generates mock contracts based on detected surfaces for testing purposes.
 * This is a temporary solution until full database-backed contracts are integrated.
 * 
 * NOTE: This will be replaced with real ContractResolver in Week 3-4.
 */

import type { Contract, ArtifactRef, Invariant } from '../contracts/types.js';
import type { Surface } from './surfaceClassifier.js';

// ======================================================================
// MOCK CONTRACT GENERATION
// ======================================================================

/**
 * Generate mock contracts based on detected surfaces
 * 
 * This creates simple contracts for testing the artifact fetching and comparator flow.
 * Each surface type maps to a specific contract with relevant artifacts and invariants.
 */
export function generateMockContracts(
  surfaces: Surface[],
  workspaceId: string,
  repo?: string
): Contract[] {
  const contracts: Contract[] = [];

  // Generate contracts based on surfaces
  for (const surface of surfaces) {
    const contract = createContractForSurface(surface, workspaceId, repo);
    if (contract) {
      contracts.push(contract);
    }
  }

  return contracts;
}

/**
 * Create a mock contract for a specific surface
 */
function createContractForSurface(
  surface: Surface,
  workspaceId: string,
  repo?: string
): Contract | null {
  const repoName = repo || 'unknown/repo';

  switch (surface) {
    case 'api':
      return createApiContract(workspaceId, repoName);
    
    case 'infra':
      return createInfraContract(workspaceId, repoName);
    
    case 'docs':
      return createDocsContract(workspaceId, repoName);
    
    case 'data_model':
    case 'observability':
    case 'security':
      // Not implemented yet - return null
      return null;
    
    default:
      return null;
  }
}

// ======================================================================
// SURFACE-SPECIFIC CONTRACT CREATORS
// ======================================================================

/**
 * Create mock contract for API surface
 * Includes: OpenAPI spec + README docs
 */
function createApiContract(workspaceId: string, repo: string): Contract {
  const artifacts: ArtifactRef[] = [
    {
      system: 'github',
      type: 'openapi',
      locator: {
        repo,
        path: 'openapi/openapi.yaml',
        ref: 'main',
      },
      role: 'primary',
      required: true,
      freshnessSlaHours: 24,
    },
    {
      system: 'github',
      type: 'readme',
      locator: {
        repo,
        path: 'README.md',
        ref: 'main',
      },
      role: 'secondary',
      required: false,
      freshnessSlaHours: 168, // 1 week
    },
  ];

  const invariants: Invariant[] = [
    {
      invariantId: 'mock-api-endpoint-parity',
      name: 'API Endpoint Parity',
      description: 'OpenAPI spec and README must have matching endpoints',
      enabled: true,
      severity: 'high',
      comparatorType: 'openapi_docs_endpoint_parity',
      config: {},
    },
  ];

  return {
    contractId: `mock-api-contract-${workspaceId}`,
    workspaceId,
    name: 'API Documentation Contract (Mock)',
    description: 'Ensures API spec and docs are in sync',
    artifacts,
    invariants,
    enforcement: {
      mode: 'pr_gate',
      blockOnFail: false, // Soft-fail for Week 1-2
      warnOnWarn: true,
      requireApprovalOverride: false,
    },
    routing: {
      method: 'service_owner',
      owners: ['api-team'],
    },
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Create mock contract for Infrastructure surface
 * Includes: Terraform files + Runbook docs
 */
function createInfraContract(workspaceId: string, repo: string): Contract {
  const artifacts: ArtifactRef[] = [
    {
      system: 'github',
      type: 'iac_terraform',
      locator: {
        repo,
        path: 'terraform/main.tf',
        ref: 'main',
      },
      role: 'primary',
      required: true,
      freshnessSlaHours: 24,
    },
  ];

  const invariants: Invariant[] = [];

  return {
    contractId: `mock-infra-contract-${workspaceId}`,
    workspaceId,
    name: 'Infrastructure Contract (Mock)',
    description: 'Ensures Terraform and runbooks are in sync',
    artifacts,
    invariants,
    enforcement: {
      mode: 'pr_gate',
      blockOnFail: false,
      warnOnWarn: true,
      requireApprovalOverride: false,
    },
    routing: {
      method: 'service_owner',
      owners: ['infra-team'],
    },
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Create mock contract for Docs surface
 * Includes: README, CHANGELOG
 */
function createDocsContract(workspaceId: string, repo: string): Contract {
  const artifacts: ArtifactRef[] = [
    {
      system: 'github',
      type: 'readme',
      locator: {
        repo,
        path: 'README.md',
        ref: 'main',
      },
      role: 'primary',
      required: true,
      freshnessSlaHours: 168,
    },
  ];

  const invariants: Invariant[] = [];

  return {
    contractId: `mock-docs-contract-${workspaceId}`,
    workspaceId,
    name: 'Documentation Contract (Mock)',
    description: 'Ensures documentation is up to date',
    artifacts,
    invariants,
    enforcement: {
      mode: 'async_notify',
      blockOnFail: false,
      warnOnWarn: false,
      requireApprovalOverride: false,
    },
    routing: {
      method: 'service_owner',
      owners: ['docs-team'],
    },
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

